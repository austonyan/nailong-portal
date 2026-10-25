// 奶龙国皇家居民登记署 — shared server-side helpers: unpredictable numbering,
// audit, template notifications, lazy state sweeps, rate limiting, serializers
// and masked verify results.
import crypto from 'node:crypto';
import { db, now } from '../db.js';

// Unpredictable, human-friendly numbers: no vowels/ambiguous glyphs.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const dateStamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

export function getConfig(key, fallback = null) {
  const row = db.prepare('SELECT value FROM res_config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function getConfigNumber(key, fallback) {
  const v = Number(getConfig(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function setConfig(key, value) {
  db.prepare('INSERT INTO res_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key, String(value)
  );
}

function nextNo(prefixKey, fallbackPrefix, table, column, len) {
  const prefix = getConfig(prefixKey, fallbackPrefix);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = `${prefix}-${dateStamp()}-${randomCode(len)}`;
    if (!db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).get(no)) return no;
  }
  throw new Error('cannot generate resident number');
}

export const nextApplicationNo = () => nextNo('res.app_no_prefix', 'NRR', 'res_applications', 'app_no', 6);
export const nextCardNo = () => nextNo('res.card_no_prefix', 'NRC', 'res_cards', 'card_no', 8);
export const nextChangeNo = () => nextNo('res.change_no_prefix', 'NRX', 'res_changes', 'no', 6);

export const makeToken = () => crypto.randomBytes(24).toString('hex');

export function audit(actor, action, targetType, targetId, detail = {}) {
  db.prepare(
    'INSERT INTO res_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    actor?.id ?? null,
    actor?.displayName || actor?.username || actor?.name || '',
    action,
    targetType,
    String(targetId ?? ''),
    JSON.stringify(detail),
    now()
  );
}

// 站内信:模板存库可由管理端编辑,变量在服务端渲染(中文模板随库走,
// 与 visa 的 type+params 方案二选一,这里沿用入境署的可编辑模板方案)。
function renderTemplate(text, vars) {
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
}

export function notify(userId, code, vars = {}, related = {}) {
  const tpl = db.prepare('SELECT * FROM res_message_templates WHERE code = ? AND enabled = 1').get(code);
  const title = renderTemplate(tpl?.title_template ?? code, vars);
  const body = renderTemplate(tpl?.body_template ?? '', vars);
  db.prepare(
    'INSERT INTO res_messages (user_id, template_code, title, body, related, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, code, title, body, JSON.stringify(related), now());
}

// ---------------------------------------------------------------------------
// Lazy sweeps — no cron: deadlines are enforced whenever relevant rows are read.
// ---------------------------------------------------------------------------

export function sweepSupplementDeadlines() {
  const overdue = db
    .prepare(
      `SELECT id, user_id, app_no FROM res_applications
       WHERE status = 'supplement_required' AND supplement_deadline IS NOT NULL AND supplement_deadline < ?`
    )
    .all(now());
  for (const app of overdue) {
    db.prepare("UPDATE res_applications SET status = 'closed', updated_at = ? WHERE id = ?").run(now(), app.id);
    notify(app.user_id, 'closed', { no: app.app_no }, { appNo: app.app_no });
    audit({ name: 'system' }, 'auto_close_supplement_timeout', 'application', app.app_no);
  }
}

export function sweepCards() {
  const expired = db.prepare("SELECT id, card_no, user_id FROM res_cards WHERE status = 'valid' AND valid_until < ?").all(now());
  for (const card of expired) {
    db.prepare("UPDATE res_cards SET status = 'expired', updated_at = ? WHERE id = ?").run(now(), card.id);
    notify(card.user_id, 'card_expired', { cardNo: card.card_no }, { cardNo: card.card_no });
    audit({ name: 'system' }, 'auto_expire_card', 'card', card.card_no);
  }

  // 到期批量提醒:默认提前 30 天一次性提醒
  const remindDays = getConfigNumber('res.card_remind_days', 30);
  const remindAt = new Date(Date.now() + remindDays * 24 * 60 * 60 * 1000).toISOString();
  const soon = db
    .prepare("SELECT id, card_no, user_id, valid_until FROM res_cards WHERE status = 'valid' AND remind_sent = 0 AND valid_until <= ?")
    .all(remindAt);
  for (const card of soon) {
    db.prepare('UPDATE res_cards SET remind_sent = 1 WHERE id = ?').run(card.id);
    notify(card.user_id, 'expiry_reminder', { cardNo: card.card_no, validUntil: card.valid_until.slice(0, 10) }, { cardNo: card.card_no });
  }
}

export function sweepAll() {
  sweepSupplementDeadlines();
  sweepCards();
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory sliding window, enough for a single-node MVP.
// ---------------------------------------------------------------------------

const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const list = (buckets.get(key) || []).filter((ts) => t - ts < windowMs);
  if (list.length >= max) return false;
  list.push(t);
  buckets.set(key, list);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((ts) => t - ts >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

export function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

// ---------------------------------------------------------------------------
// Risk control: blacklist + duplicate/identity rules
// ---------------------------------------------------------------------------

export function isBlacklisted(userId) {
  return !!db.prepare('SELECT 1 FROM res_blacklist WHERE user_id = ?').get(userId);
}

export const ACTIVE_APP_STATUSES = ['pending_review', 'supplement_required'];

// 同一账号在审申请数(重复登记识别的基础)
export function activeApplicationCount(userId) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM res_applications WHERE user_id = ? AND status IN ('draft','pending_review','supplement_required')`)
    .get(userId).n;
}

// 真正进入审核流程的申请数(提交校验用,不含当前草稿)
export function activeReviewCount(userId) {
  return db
    .prepare(`SELECT COUNT(*) AS n FROM res_applications WHERE user_id = ? AND status IN ('pending_review','supplement_required')`)
    .get(userId).n;
}

export function activeCard(userId) {
  return db
    .prepare("SELECT * FROM res_cards WHERE user_id = ? AND status IN ('valid','frozen') ORDER BY id DESC LIMIT 1")
    .get(userId);
}

export function hasResidentIdentity(userId) {
  return !!db.prepare('SELECT 1 FROM res_residents WHERE user_id = ?').get(userId);
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

export function serializeType(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    guide: row.guide,
    benefits: row.benefits,
    duties: row.duties,
    validYears: row.valid_years,
    requireAvatar: !!row.require_avatar,
    requireAddressProof: !!row.require_address_proof,
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
  };
}

export function serializeApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    appNo: row.app_no,
    userId: row.user_id,
    typeCode: row.type_code,
    status: row.status,
    nickname: row.nickname,
    contact: row.contact,
    virtualAddress: row.virtual_address,
    bio: row.bio,
    purposes: parseMaybeJson(row.purposes),
    supplementNote: row.supplement_note,
    supplementDeadline: row.supplement_deadline,
    rejectCode: row.reject_code,
    rejectComment: row.reject_comment,
    reviewStage: row.review_stage,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  };
}

export function serializeMaterial(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    origin: row.origin,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    createdAt: row.created_at,
  };
}

export function serializeCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    cardNo: row.card_no,
    userId: row.user_id,
    applicationId: row.application_id,
    typeCode: row.type_code,
    nickname: row.nickname,
    status: row.status,
    issuedAt: row.issued_at,
    validUntil: row.valid_until,
    renewCount: row.renew_count,
    freezeReason: row.freeze_reason,
    voidReason: row.void_reason,
    verifyToken: row.verify_token,
  };
}

export function serializeResident(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    applicationId: row.application_id,
    typeCode: row.type_code,
    nickname: row.nickname,
    contact: row.contact,
    virtualAddress: row.virtual_address,
    bio: row.bio,
    avatarMaterialId: row.avatar_material_id,
    since: row.since,
  };
}

export function serializeChange(row) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    userId: row.user_id,
    cardId: row.card_id,
    type: row.type,
    payload: (() => {
      try {
        return JSON.parse(row.payload);
      } catch {
        return {};
      }
    })(),
    status: row.status,
    rejectCode: row.reject_code,
    rejectNote: row.reject_note,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeMessage(row) {
  if (!row) return null;
  let related = {};
  try {
    related = JSON.parse(row.related);
  } catch {
    related = {};
  }
  return {
    id: row.id,
    templateCode: row.template_code,
    title: row.title,
    body: row.body,
    related,
    read: !!row.read,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

// 验真结果脱敏:绝不包含持有人昵称/联系方式/虚拟地址等个人信息。
export function maskCard(card, typeRow) {
  if (!card) return { found: false };
  return {
    found: true,
    cardNo: card.card_no,
    typeCode: card.type_code,
    typeName: typeRow?.name ?? card.type_code,
    status: card.status,
    valid: card.status === 'valid',
    issuedAt: card.issued_at,
    validUntil: card.valid_until,
    issuer: '奶龙国皇家居民登记署',
  };
}
