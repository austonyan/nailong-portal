// 奶龍國皇家申訴與監察署 — shared domain helpers: unpredictable numbering,
// audit trail, in-site messages (type + i18n params), lazy sweeps, rate
// limiting and the reserved write-back hooks for the other offices.
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
  const row = db.prepare('SELECT value FROM appeal_config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function getConfigNumber(key, fallback) {
  const v = Number(getConfig(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function setConfig(key, value) {
  db.prepare(
    'INSERT INTO appeal_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

// 编号均不可猜测:前缀-日期-随机段,冲突重试。
export function nextCode(table, column, prefix, len = 6) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `${prefix}-${dateStamp()}-${randomCode(len)}`;
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).get(code)) return code;
  }
  throw new Error(`cannot generate ${table} number`);
}

export const nextAppealNo = () => nextCode('appeal_appeals', 'code', getConfig('appeal.appeal_prefix', 'NAA'));
export const nextReviewNo = () => nextCode('appeal_reviews', 'code', getConfig('appeal.review_prefix', 'NAR'));
export const nextComplaintNo = () => nextCode('appeal_complaints', 'code', getConfig('appeal.complaint_prefix', 'NAC'));
export const nextTicketNo = () => nextCode('appeal_tickets', 'code', getConfig('appeal.ticket_prefix', 'NAT'));
export const nextDecisionNo = () => nextCode('appeal_decisions', 'code', getConfig('appeal.decision_prefix', 'NAD'), 8);

export function audit(actor, action, targetType, targetId, detail = {}) {
  db.prepare(
    'INSERT INTO appeal_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
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

// 站内信只存类型与参数,由前端按 i18n 渲染,保证简繁双语一致。
export function sendMsg(userId, targetType, targetId, type, params = {}) {
  const tpl = db.prepare('SELECT enabled FROM appeal_msg_templates WHERE type = ?').get(type);
  if (tpl && !tpl.enabled) return;
  db.prepare(
    'INSERT INTO appeal_messages (user_id, target_type, target_id, type, params, read, archived, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
  ).run(userId, targetType ?? null, targetId ?? null, type, JSON.stringify(params), now());
}

// ---------------------------------------------------------------------------
// 关联业务校验(预留):各业务署接入后在此注册 handler。
// 约定接口:{ validate(code, userId) → { exists, owned, appealable }, link(code) }
// 未接入时 resolveBizHandler 返回 null,申诉可先提交,关联校验标记 unverified。
// ---------------------------------------------------------------------------
export const BIZ_TYPES = [
  { key: 'visa', office: '签注申请署' },
  { key: 'immigration', office: '入境署' },
  { key: 'resident', office: '居民登记署' },
  { key: 'diplomatic', office: '外交事务署' },
  { key: 'document', office: '文书与认证署' },
];

const BIZ_HANDLERS = {
  // visa: { validate(code, userId) {...}, link(code) {...} },
  // immigration: {...}, resident: {...}, diplomatic: {...}, document: {...},
};

export function resolveBizHandler(bizType) {
  return BIZ_HANDLERS[bizType] || null;
}

// 处理决定回写业务署(预留):职责分离 —— 申诉署不直接改业务状态,
// 正式接入后由业务署暴露的回调执行回写;当前仅审计留痕,返回 false 表示未回写。
export function writebackDecision(appeal, { decisionType, decisionCode }) {
  const handler = resolveBizHandler(appeal.biz_type);
  audit(
    { name: 'system' },
    'writeback_skipped',
    'appeal',
    appeal.code,
    { bizType: appeal.biz_type, decisionType, decisionCode, integrated: !!handler, reserved: true }
  );
  if (handler?.writeback) {
    handler.writeback(appeal, { decisionType, decisionCode });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Lazy sweeps — enforced when relevant rows are read (lists, queues, verify).
// ---------------------------------------------------------------------------

export function sweepSupplementDeadlines() {
  const overdue = db
    .prepare(
      `SELECT id, code, user_id FROM appeal_appeals
       WHERE status = 'supplement_required' AND supplement_deadline IS NOT NULL AND supplement_deadline < ?`
    )
    .all(now());
  for (const appeal of overdue) {
    db.prepare("UPDATE appeal_appeals SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), appeal.id);
    sendMsg(appeal.user_id, 'appeal', appeal.id, 'appeal_closed', { code: appeal.code });
    audit({ name: 'system' }, 'auto_close_supplement_timeout', 'appeal', appeal.code);
  }
}

export function sweepAll() {
  sweepSupplementDeadlines();
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory sliding window (single-node MVP).
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

export function serializeAppeal(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    bizType: row.biz_type,
    bizCode: row.biz_code,
    bizStatus: row.biz_status,
    reason: row.reason,
    expected: row.expected,
    contact: row.contact,
    status: row.status,
    priority: row.priority,
    acceptNote: row.accept_note,
    rejectReason: row.reject_reason,
    supplementNote: row.supplement_note,
    supplementDeadline: row.supplement_deadline,
    decisionType: row.decision_type,
    decisionReason: row.decision_reason,
    decisionBasis: row.decision_basis,
    handlerName: row.handler_name,
    evaluationRating: row.evaluation_rating,
    evaluationComment: row.evaluation_comment,
    mergedInto: row.merged_into,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
    acceptedAt: row.accepted_at,
    resolvedAt: row.resolved_at,
    decidedAt: row.decided_at,
    closedAt: row.closed_at,
  };
}

export function serializeReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    appealId: row.appeal_id,
    appealCode: row.appeal_code,
    userId: row.user_id,
    reason: row.reason,
    status: row.status,
    decisionType: row.decision_type,
    decisionReason: row.decision_reason,
    decidedBy: row.decided_name,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
  };
}

export function serializeComplaint(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    kind: row.kind,
    category: row.category,
    anonymous: !!row.anonymous,
    content: row.content,
    contact: row.anonymous ? '' : row.contact,
    status: row.status,
    reply: row.reply,
    repliedName: row.replied_name,
    repliedAt: row.replied_at,
    rating: row.rating,
    ratingComment: row.rating_comment,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    closedAt: row.closed_at,
  };
}

export function serializeTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    category: row.category,
    priority: row.priority,
    title: row.title,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    closedAt: row.closed_at,
  };
}

export function serializeDecision(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    appealId: row.appeal_id,
    appealCode: row.appeal_code,
    reviewId: row.review_id,
    reviewCode: row.review_code,
    userId: row.user_id,
    bizType: row.biz_type,
    decisionType: row.decision_type,
    reason: row.reason,
    basis: row.basis,
    status: row.status,
    effectiveAt: row.effective_at,
    voidedAt: row.voided_at,
    verifyToken: row.verify_token,
    certCode: row.cert_code || '',
    createdAt: row.created_at,
  };
}

export function serializeMaterial(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
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
    targetType: row.target_type,
    targetId: row.target_id,
    type: row.type,
    params: parseMaybeJson(row.params),
    read: !!row.read,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

export function serializeNotice(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    level: row.level,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializePublicity(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 决定书材料上传目录:server/data/uploads/appeal/<ownerType>-<ownerId>/
export const APPEAL_UPLOAD_KINDS = new Set(['screenshot', 'proof', 'other']);
export const MATERIAL_ORIGINS = new Set(['initial', 'supplement']);

// ---------------------------------------------------------------------------
// 验真(公开、脱敏):绝不包含申诉人身份/理由/材料内容。
// 支持:决定书编号或二维码 token、复核编号、申诉编号。
// ---------------------------------------------------------------------------

function decisionVerify(dec) {
  return {
    found: true,
    kind: 'decision',
    code: dec.code,
    appealCode: dec.appeal_code,
    bizType: dec.biz_type,
    decisionType: dec.decision_type,
    status: dec.status,
    effectiveAt: dec.effective_at,
    valid: dec.status === 'valid',
  };
}

export function maskVerifyResult(token, no) {
  if (token) {
    const dec = db.prepare('SELECT * FROM appeal_decisions WHERE verify_token = ?').get(token);
    return dec ? decisionVerify(dec) : { found: false };
  }
  if (!no) return { found: false };
  const dec = db.prepare('SELECT * FROM appeal_decisions WHERE code = ?').get(no);
  if (dec) return decisionVerify(dec);
  const review = db.prepare('SELECT * FROM appeal_reviews WHERE code = ?').get(no);
  if (review) {
    return {
      found: true,
      kind: 'review',
      code: review.code,
      appealCode: review.appeal_code,
      status: review.status,
      decisionType: review.decision_type ?? null,
      decidedAt: review.decided_at ?? null,
      valid: review.status === 'completed',
    };
  }
  const appeal = db.prepare('SELECT * FROM appeal_appeals WHERE code = ?').get(no);
  if (appeal) {
    return {
      found: true,
      kind: 'appeal',
      code: appeal.code,
      bizType: appeal.biz_type,
      status: appeal.status,
      decisionType: appeal.decision_type ?? null,
      resolvedAt: appeal.resolved_at ?? null,
      valid: appeal.status === 'resolved',
    };
  }
  return { found: false };
}
