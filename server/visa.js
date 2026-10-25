// 奶龍國簽註申請署 — shared domain helpers: numbering, audit, notifications,
// lazy state sweeps (supplement deadline / permit expiry) and rate limiting.
import crypto from 'node:crypto';
import { db, now } from './db.js';

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
  const row = db.prepare('SELECT value FROM visa_config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function getConfigNumber(key, fallback) {
  const v = Number(getConfig(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function setConfig(key, value) {
  db.prepare(
    'INSERT INTO visa_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export function nextApplicationNo() {
  const prefix = getConfig('visa.app_no_prefix', 'NLA');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = `${prefix}-${dateStamp()}-${randomCode(6)}`;
    if (!db.prepare('SELECT id FROM visa_applications WHERE app_no = ?').get(no)) return no;
  }
  throw new Error('cannot generate application number');
}

export function nextVisaNo() {
  const prefix = getConfig('visa.visa_no_prefix', 'NLT');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = `${prefix}-${dateStamp()}-${randomCode(8)}`;
    if (!db.prepare('SELECT id FROM visa_permits WHERE visa_no = ?').get(no)) return no;
  }
  throw new Error('cannot generate visa number');
}

export function audit(actor, action, targetType, targetId, detail = {}) {
  db.prepare(
    'INSERT INTO visa_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
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

// 站内信内容不在服务端写死语言:只存消息类型与参数,由前端按 i18n 渲染,
// 保证简繁双语都走翻译资源。
export function sendMsg(userId, applicationId, type, params = {}) {
  db.prepare(
    'INSERT INTO visa_messages (user_id, application_id, type, params, read, archived, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)'
  ).run(userId, applicationId ?? null, type, JSON.stringify(params), now());
}

// ---------------------------------------------------------------------------
// Lazy sweeps — no cron needed: state deadlines are enforced whenever the
// relevant rows are read (my applications, queue, permits, verify, stats).
// ---------------------------------------------------------------------------

export function sweepSupplementDeadlines() {
  const overdue = db
    .prepare(
      `SELECT id, user_id, app_no FROM visa_applications
       WHERE status = 'supplement_required' AND supplement_deadline IS NOT NULL AND supplement_deadline < ?`
    )
    .all(now());
  for (const app of overdue) {
    db.prepare("UPDATE visa_applications SET status = 'closed', updated_at = ? WHERE id = ?").run(now(), app.id);
    sendMsg(app.user_id, app.id, 'closed', { appNo: app.app_no });
    audit({ name: 'system' }, 'auto_close_supplement_timeout', 'application', app.app_no);
  }
}

export function sweepPermits() {
  const expired = db
    .prepare("SELECT id, visa_no, user_id, application_id FROM visa_permits WHERE status = 'valid' AND valid_until < ?")
    .all(now());
  for (const permit of expired) {
    db.prepare("UPDATE visa_permits SET status = 'expired', updated_at = ? WHERE id = ?").run(now(), permit.id);
    sendMsg(permit.user_id, permit.application_id, 'expired', { visaNo: permit.visa_no });
    audit({ name: 'system' }, 'auto_expire_permit', 'permit', permit.visa_no);
  }

  // 到期提醒:72 小时内到期的一次性站内提醒
  const remindAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const soon = db
    .prepare(
      `SELECT id, visa_no, user_id, application_id FROM visa_permits
       WHERE status = 'valid' AND remind_sent = 0 AND valid_until <= ?`
    )
    .all(remindAt);
  for (const permit of soon) {
    db.prepare('UPDATE visa_permits SET remind_sent = 1 WHERE id = ?').run(permit.id);
    sendMsg(permit.user_id, permit.application_id, 'expiry_reminder', { visaNo: permit.visa_no });
  }
}

export function sweepAll() {
  sweepSupplementDeadlines();
  sweepPermits();
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
// Serializers
// ---------------------------------------------------------------------------

function parseMaybeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function serializeApplication(row, { withPermit = false } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    appNo: row.app_no,
    userId: row.user_id,
    typeCode: row.type_code,
    status: row.status,
    nickname: row.nickname,
    contact: row.contact,
    virtualId: row.virtual_id,
    purpose: row.purpose,
    planArrive: row.plan_arrive,
    planLeave: row.plan_leave,
    itinerary: row.itinerary,
    inviterName: row.inviter_name,
    inviterContact: row.inviter_contact,
    companions: row.companions,
    entertainmentAgreed: !!row.entertainment_agreed,
    supplementNote: row.supplement_note,
    supplementDeadline: row.supplement_deadline,
    rejectCode: row.reject_code,
    rejectComment: row.reject_comment,
    reviewStage: row.review_stage,
    decidedAt: row.decided_at,
    issuedAt: row.issued_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  };
  if (withPermit) out.permit = serializePermit(db.prepare('SELECT * FROM visa_permits WHERE application_id = ?').get(row.id));
  return out;
}

export function serializePermit(row) {
  if (!row) return null;
  return {
    id: row.id,
    visaNo: row.visa_no,
    applicationId: row.application_id,
    typeCode: row.type_code,
    holderName: row.holder_name,
    status: row.status,
    issuedAt: row.issued_at,
    validUntil: row.valid_until,
    verifyToken: row.verify_token,
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

export function serializeMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id,
    type: row.type,
    params: parseMaybeJson(row.params),
    read: !!row.read,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

export function serializeType(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    guide: row.guide,
    stayDays: row.stay_days,
    validDays: row.valid_days,
    renewable: !!row.renewable,
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
  };
}

// 验真结果脱敏:绝不包含持有人昵称/联系方式等个人信息。
export function maskPermit(permit, typeRow) {
  if (!permit) return { found: false };
  return {
    found: true,
    visaNo: permit.visa_no,
    typeCode: permit.type_code,
    typeName: typeRow?.name ?? permit.type_code,
    status: permit.status,
    valid: permit.status === 'valid',
    issuedAt: permit.issued_at,
    validUntil: permit.valid_until,
    issuer: '奶龍國簽註申請署',
  };
}
