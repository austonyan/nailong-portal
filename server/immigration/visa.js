// 签注校验适配层 — 与"奶龍國簽註申請署"的联动已打通。
//
// 同进程共库:先查签注署真实台账(visa_permits),命中即按真实状态返回,
// 通关后回写"已使用"也直接落到签注署;演示编号 NL-XXXX-XXXX 仍保留确定性
// stub,方便离线演示与既有验收脚本。
//
// 真实签注号格式 NLT-YYYYMMDD-XXXXXXXX 未命中时返回 not_found,不做离线猜测。
// 外交签注额外校验持有人当前是否仍有有效外交身份(外交署联动),失效则拦截。
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { audit } from './util.js';
import { lookupPermit, markPermitUsed } from '../visa.js';
import { diplomaticEligibility } from '../linkage.js';

const VISA_STUB_RE = /^NL-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const VISA_REMOTE_RE = /^[A-Z]{2,4}-\d{6,8}-[A-Z0-9]{4,12}$/; // 签注署格式: NLT-261026-ABCD1234
const CACHE_TTL_MS = 10 * 60 * 1000;

const FUN_VISA_TYPES = ['观光奶龙签注', '深度贴贴签注', '演出巡游签注', '美食突袭签注', '串门探亲签注'];
const FUN_VISA_TYPES_TW = ['觀光奶龍簽註', '深度貼貼簽註', '演出巡遊簽註', '美食突襲簽註', '串門探親簽註'];

function hashPick(text, list) {
  const h = crypto.createHash('sha1').update(text).digest();
  return list[h[0] % list.length];
}

function maskHolder(name = '') {
  const trimmed = String(name || '');
  if (trimmed.length <= 1) return trimmed || '旅客';
  return trimmed.slice(0, 1) + '***';
}

// Deterministic offline validator for demo numbers. Returns { result, detail }
// with the exact shape the real adapter produces (脱敏字段 only).
function stubValidate(visaNo, user) {
  if (VISA_REMOTE_RE.test(visaNo) && !VISA_STUB_RE.test(visaNo)) {
    return { result: 'not_found', detail: { reason: 'linkage' } };
  }
  if (!VISA_STUB_RE.test(visaNo)) {
    return { result: 'invalid', detail: { reason: 'format' } };
  }
  if (visaNo.includes('0000')) return { result: 'used', detail: {} };
  if (visaNo.includes('1111')) return { result: 'expired', detail: {} };
  if (visaNo.includes('2222')) return { result: 'revoked', detail: {} };
  if (visaNo.includes('3333')) return { result: 'invalid', detail: { reason: 'office' } };

  const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    result: 'valid',
    detail: {
      type: hashPick(visaNo, FUN_VISA_TYPES),
      typeTw: hashPick(visaNo, FUN_VISA_TYPES_TW),
      holder: maskHolder(user?.displayName || user?.username),
      validUntil,
      issuer: '奶龙国签注申请署(演示数据)',
      issuerTw: '奶龍國簽註申請署(演示資料)',
    },
  };
}

// 真实签注台账 → 入境署既能理解又能展示的脱敏结果。
function liveValidate(permit, typeRow, user) {
  if (permit.user_id !== user?.id) {
    return { result: 'invalid', detail: { reason: 'holder' } };
  }
  if (permit.type_code === 'DIPLOMATIC') {
    const identity = diplomaticEligibility(permit.user_id);
    if (!identity.eligible) {
      return { result: 'revoked', detail: { reason: 'diplomatic_identity_inactive' } };
    }
  }
  const status = permit.status === 'valid' && permit.valid_until < now() ? 'expired' : permit.status;
  const result = status === 'voided' ? 'revoked' : status;
  return {
    result,
    detail: {
      type: typeRow?.name ?? permit.type_code,
      typeTw: typeRow?.name_tw ?? null,
      holder: maskHolder(permit.holder_name),
      validUntil: permit.valid_until,
      issuer: '奶龙国签注申请署',
      issuerTw: '奶龍國簽註申請署',
      visaNo: permit.visa_no,
    },
  };
}

function recordCheck(visaNo, userId, result, detail, source) {
  const ts = now();
  db.prepare(
    'INSERT INTO im_visa_checks (visa_no, user_id, result, detail, source, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(visaNo, userId ?? null, result, JSON.stringify(detail || {}), source, ts);
  return ts;
}

// 历史缓存(旧版本写入)可能只有简体 type,补上 typeTw 供 localeMiddleware 成对切换。
function withTypeTw(detail) {
  if (!detail || typeof detail !== 'object' || !detail.type || detail.typeTw) return detail;
  const row = db.prepare('SELECT name_tw FROM visa_types WHERE name = ? LIMIT 1').get(String(detail.type));
  if (row?.name_tw) detail.typeTw = row.name_tw;
  return detail;
}

// Latest cached check within TTL for the same visa number. Writeback rows are
// terminal: once the port authority marks a permit used, it stays used even if
// a demo cache entry exists.
export function cachedCheck(visaNo) {
  const row = db
    .prepare(
      `SELECT result, detail, source, created_at FROM im_visa_checks
       WHERE visa_no = ? AND source IN ('stub', 'remote', 'writeback') ORDER BY id DESC LIMIT 1`
    )
    .get(visaNo);
  if (!row) return null;
  if (row.source === 'writeback' && row.result === 'used') {
    return { result: 'used', detail: withTypeTw(JSON.parse(row.detail || '{}')), checkedAt: row.created_at, cached: true };
  }
  if (Date.now() - Date.parse(row.created_at) > CACHE_TTL_MS) return null;
  return { result: row.result, detail: withTypeTw(JSON.parse(row.detail || '{}')), checkedAt: row.created_at, cached: true };
}

export function checkVisa(visaNo, user, { useCache = true } = {}) {
  // 真实台账优先:命中时不走缓存,注销/过期/已使用都实时反映。
  const { permit, typeRow } = lookupPermit({ no: visaNo });
  if (permit) {
    const { result, detail } = liveValidate(permit, typeRow, user);
    const ts = recordCheck(visaNo, user?.id ?? null, result, detail, 'remote');
    return { result, detail, checkedAt: ts, cached: false };
  }
  if (useCache) {
    const hit = cachedCheck(visaNo);
    if (hit) return hit;
  }
  const { result, detail } = stubValidate(visaNo, user);
  const ts = recordCheck(visaNo, user?.id ?? null, result, detail, 'stub');
  return { result, detail, checkedAt: ts, cached: false };
}

// 通关后回写:真实签注直接回调签注署(状态 + 站内信 + 审计都在签注署完成),
// 演示编号只落一条回写记录。
export function markVisaUsed(visaNo, actorId, declarationNo) {
  if (!visaNo) return { found: false, ok: false };
  const result = markPermitUsed(visaNo);
  if (result.found) {
    recordCheck(visaNo, null, 'used', { declarationNo, via: 'visa-office' }, 'writeback');
    audit(actorId, 'im:visa.mark_used', 'visa', visaNo, { declarationNo, via: 'visa-office' });
    return result;
  }
  recordCheck(visaNo, null, 'used', { declarationNo }, 'writeback');
  audit(actorId, 'im:visa.mark_used', 'visa', visaNo, { declarationNo, via: 'demo-stub' });
  return { found: false, ok: true, status: 'used' };
}

export const VISA_ERROR_CODE = {
  invalid: 'IMM_VISA_INVALID',
  expired: 'IMM_VISA_EXPIRED',
  revoked: 'IMM_VISA_REVOKED',
  used: 'IMM_VISA_USED',
  not_found: 'IMM_VISA_NOT_FOUND',
};