// 签注校验适配层 — 预留与"奶龍國簽註申請署"的联动。
//
// Today a deterministic stub answers checks so the immigration flow is fully
// testable offline. When the linkage ships, only `stubValidate` needs to
// change: replace it with an HTTP call carrying the shared service token —
//   POST /api/visa/inter/check   { no }            -> { found, status, valid, validUntil, typeName, issuer }
//   POST /api/visa/inter/mark-used { no }           -> { ok, status }
//   header: x-nailong-service-token: $VISA_INTER_SERVICE_TOKEN
// (the visa office already publishes these). Map their `status` onto the
// { result, detail } shape below and the cache / writeback / interception
// logic keeps working untouched.
//
// Stub contract for manual testing (visa number format NL-XXXX-XXXX):
//   contains 0000 -> used      (已使用)
//   contains 1111 -> expired   (已过期)
//   contains 2222 -> revoked   (已注销)
//   contains 3333 -> invalid   (无效)
//   anything else -> valid     (有效期一年,趣味签注类型按编号稳定散列)
// Real 签注署 numbers (NLT-YYYYMMDD-XXXXXXXX) are recognized but reported as
// `not_found` until the remote linkage is enabled — no offline guessing.
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { audit } from './util.js';

const VISA_STUB_RE = /^NL-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const VISA_REMOTE_RE = /^[A-Z]{2,4}-\d{8}-[A-Z0-9]{4,12}$/; // 签注署格式: NLT-20261025-ABCD1234
const CACHE_TTL_MS = 10 * 60 * 1000;

const FUN_VISA_TYPES = ['观光奶龙签注', '深度贴贴签注', '演出巡游签注', '美食突袭签注', '串门探亲签注'];

function hashPick(text, list) {
  const h = crypto.createHash('sha1').update(text).digest();
  return list[h[0] % list.length];
}

function maskHolder(name = '') {
  const trimmed = String(name);
  if (trimmed.length <= 1) return trimmed || '旅客';
  return trimmed.slice(0, 1) + '***';
}

// Deterministic offline validator. Returns { result, detail } with the exact
// shape the real 签注署 adapter must produce (脱敏字段 only).
function stubValidate(visaNo, user) {
  if (VISA_REMOTE_RE.test(visaNo) && !VISA_STUB_RE.test(visaNo)) {
    return { result: 'not_found', detail: { reason: 'linkage_pending' } };
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
      holder: maskHolder(user?.displayName || user?.username),
      validUntil,
      issuer: '奶龍國簽註申請署(演示数据)',
    },
  };
}

// Latest cached check within TTL for the same visa number.
export function cachedCheck(visaNo) {
  const row = db
    .prepare(
      `SELECT result, detail, created_at FROM im_visa_checks
       WHERE visa_no = ? AND source IN ('stub', 'remote') ORDER BY id DESC LIMIT 1`
    )
    .get(visaNo);
  if (!row) return null;
  if (Date.now() - Date.parse(row.created_at) > CACHE_TTL_MS) return null;
  return { result: row.result, detail: JSON.parse(row.detail || '{}'), checkedAt: row.created_at, cached: true };
}

export function checkVisa(visaNo, user, { useCache = true } = {}) {
  if (useCache) {
    const hit = cachedCheck(visaNo);
    if (hit) return hit;
  }
  const { result, detail } = stubValidate(visaNo, user);
  const ts = now();
  db.prepare(
    'INSERT INTO im_visa_checks (visa_no, user_id, result, detail, source, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(visaNo, user?.id ?? null, result, JSON.stringify(detail), 'stub', ts);
  return { result, detail, checkedAt: ts, cached: false };
}

// 通关后回写:签注标记"已使用"。Stub 阶段只落一条回写记录 + 审计日志,
// 真实对接后替换为调用签注署的回写接口。
export function markVisaUsed(visaNo, actorId, declarationNo) {
  if (!visaNo) return;
  db.prepare(
    'INSERT INTO im_visa_checks (visa_no, user_id, result, detail, source, created_at) VALUES (?, NULL, ?, ?, ?, ?)'
  ).run(visaNo, 'used', JSON.stringify({ declarationNo }), 'writeback', now());
  audit(actorId, 'im:visa.mark_used', 'visa', visaNo, { declarationNo });
}

export const VISA_ERROR_CODE = {
  invalid: 'IMM_VISA_INVALID',
  expired: 'IMM_VISA_EXPIRED',
  revoked: 'IMM_VISA_REVOKED',
  used: 'IMM_VISA_USED',
  not_found: 'IMM_VISA_NOT_FOUND',
};
