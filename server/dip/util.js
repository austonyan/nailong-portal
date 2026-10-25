// 奶龙国皇家外交事务署 — shared server-side helpers: id generation, state
// machines, rate limiting, risk control, audit logging, notifications and the
// lazy sweeps (identity expiry/reminders, agreement effect/expiry).
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { ApiError, badRequest, conflict, forbidden } from '../http.js';
import { getSetting } from './schema.js';

// ---------------------------------------------------------------------------
// Non-guessable identifiers (same scheme as the other offices: date + random
// base-32 without 0/O/1/I/L)
// ---------------------------------------------------------------------------

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// e.g. NLD20261025-7K3M9Q (建交) / NLE… (外交身份) / NLG… (互免协议)
export function makeNo(prefix) {
  return `${prefix}${stamp()}-${randomCode(6)}`;
}

export function makeUniqueNo(prefix, table, column = 'no') {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = makeNo(prefix);
    if (!db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).get(no)) return no;
  }
  throw new ApiError(500, 'INTERNAL_ERROR', 'Failed to allocate a unique number');
}

export const makeToken = () => crypto.randomBytes(16).toString('hex');

// ---------------------------------------------------------------------------
// State machines
// ---------------------------------------------------------------------------

export const RELATION_TRANSITIONS = {
  draft: ['pending_review'],
  pending_review: ['established', 'rejected', 'supplement_required', 'withdrawn'],
  supplement_required: ['pending_review', 'rejected'],
  established: ['suspended', 'severed', 'sever_requested'],
  sever_requested: ['severed', 'established'],
  suspended: ['established', 'severed'],
  rejected: [],
  withdrawn: [],
  severed: [],
};

export const IDENTITY_TRANSITIONS = {
  draft: ['pending_review'],
  pending_review: ['active', 'rejected', 'supplement_required', 'withdrawn'],
  supplement_required: ['pending_review', 'rejected'],
  active: ['frozen', 'revoked', 'expired'],
  frozen: ['active', 'revoked', 'expired'],
  rejected: [],
  withdrawn: [],
  revoked: [],
  expired: [],
};

export const AGREEMENT_TRANSITIONS = {
  draft: ['pending_effect', 'active', 'terminated'],
  pending_effect: ['active', 'terminated'],
  active: ['expired', 'terminated'],
  expired: [],
  terminated: [],
};

export function canTransition(table, from, to) {
  const map = table === 'identity' ? IDENTITY_TRANSITIONS : table === 'agreement' ? AGREEMENT_TRANSITIONS : RELATION_TRANSITIONS;
  return (map[from] || []).includes(to);
}

export function assertTransition(table, from, to, message) {
  if (!canTransition(table, from, to)) {
    throw conflict('DIP_INVALID_STATE', message || `Cannot move from ${from} to ${to}`);
  }
}

export function logEvent(ownerType, ownerId, action, actorId, note = '') {
  db.prepare(
    'INSERT INTO dip_events (owner_type, owner_id, action, actor_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(ownerType, ownerId, action, actorId ?? null, note, now());
}

// ---------------------------------------------------------------------------
// Rate limiting — fixed windows keyed by actor ("u:<id>" or "ip:<addr>")
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  'dip:submit': { max: 5, window: 'day' },
  'dip:supplement': { max: 10, window: 'day' },
  'dip:identity_submit': { max: 5, window: 'day' },
  'dip:eligibility': { max: 20, window: 'hour' },
  'dip:courtesy_check': { max: 20, window: 'hour' },
  'dip:public_verify': { max: 30, window: '5min' },
};

function windowStart(window) {
  const d = new Date();
  if (window === 'day') d.setHours(0, 0, 0, 0);
  else if (window === '5min') d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);
  else d.setMinutes(0, 0, 0);
  return d.toISOString();
}

export function consumeRateLimit(actor, action) {
  let def = RATE_LIMITS[action];
  // 验真限流可在后台配置(dip.verify_limit_per_5min)。
  if (action === 'dip:public_verify') {
    const limit = getSetting('verify_limit_per_5min');
    const max = Number(limit);
    def = { ...def, max: Number.isFinite(max) && max > 0 ? Math.floor(max) : def.max };
  }
  if (!def) return;
  const ws = windowStart(def.window);
  const row = db.prepare('SELECT window_start, count FROM dip_rate_limits WHERE actor = ? AND action = ?').get(actor, action);
  if (!row || row.window_start !== ws) {
    db.prepare(
      `INSERT INTO dip_rate_limits (actor, action, window_start, count) VALUES (?, ?, ?, 1)
       ON CONFLICT (actor, action) DO UPDATE SET window_start = excluded.window_start, count = 1`
    ).run(actor, action, ws);
    return;
  }
  if (row.count >= def.max) {
    throw new ApiError(429, 'DIP_RATE_LIMITED', `Too many ${action} requests, try later`);
  }
  db.prepare('UPDATE dip_rate_limits SET count = count + 1 WHERE actor = ? AND action = ?').run(actor, action);
}

export const actorKey = (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip || 'unknown'}`);

// ---------------------------------------------------------------------------
// Risk control: blacklist + in-flight duplicate detection
// ---------------------------------------------------------------------------

export function activeBlacklist(userId) {
  const rows = db
    .prepare('SELECT * FROM dip_blacklist WHERE user_id = ? AND lifted_at IS NULL ORDER BY id DESC')
    .all(userId);
  const nowStr = now();
  return rows.find((r) => !r.expires_at || r.expires_at > nowStr) || null;
}

export function assertNotBlocked(userId) {
  const entry = activeBlacklist(userId);
  if (entry?.level === 'block') {
    throw forbidden('DIP_BLACKLISTED', 'This account is currently restricted from submitting applications');
  }
  return entry;
}

export function assertNoDuplicateRelation(userId) {
  const row = db
    .prepare(
      `SELECT no FROM dip_relations
       WHERE user_id = ? AND deleted_at IS NULL AND status IN ('pending_review', 'supplement_required')`
    )
    .get(userId);
  if (row) throw conflict('DIP_DUPLICATE', `An in-flight relation application ${row.no} already exists`);
}

export function assertNoDuplicateIdentity(userId) {
  const row = db
    .prepare(
      `SELECT no FROM dip_identities
       WHERE user_id = ? AND deleted_at IS NULL AND status IN ('pending_review', 'supplement_required')`
    )
    .get(userId);
  if (row) throw conflict('DIP_DUPLICATE', `An in-flight identity application ${row.no} already exists`);
}

export function riskSummary(userId) {
  const rejected =
    db.prepare("SELECT COUNT(*) AS n FROM dip_relations WHERE user_id = ? AND status = 'rejected'").get(userId).n +
    db.prepare("SELECT COUNT(*) AS n FROM dip_identities WHERE user_id = ? AND status = 'rejected'").get(userId).n;
  const blacklist = activeBlacklist(userId);
  const flags = [];
  if (rejected >= 3) flags.push('repeat_reject');
  if (blacklist) flags.push(blacklist.level === 'block' ? 'blacklisted' : 'watched');
  return { rejected, flags };
}

// ---------------------------------------------------------------------------
// Lazy sweeps: identity expiry + reminder, agreement effect/expiry
// ---------------------------------------------------------------------------

export function sweepIdentities() {
  const today = now().slice(0, 10);
  // 任期到期 → expired(含冻结中的身份)
  db.prepare(
    `UPDATE dip_identities SET status = 'expired', inactive_reason = 'term_ended', updated_at = ?
     WHERE status IN ('active', 'frozen') AND term_end IS NOT NULL AND term_end < ?`
  ).run(now(), today);
  // 72 小时内到期的有效身份发送一次提醒
  const due = db
    .prepare(
      `SELECT id, user_id, no, term_end FROM dip_identities
       WHERE status = 'active' AND remind_sent = 0 AND term_end IS NOT NULL AND term_end <= date('now', '+3 day')`
    )
    .all();
  for (const row of due) {
    db.prepare('UPDATE dip_identities SET remind_sent = 1 WHERE id = ?').run(row.id);
    notify(row.user_id, 'identity_renew', { no: row.no, termEnd: row.term_end }, { identityNo: row.no });
  }
}

export function sweepAgreements() {
  const today = now().slice(0, 10);
  db.prepare(
    `UPDATE dip_agreements SET status = 'active', updated_at = ?
     WHERE status = 'pending_effect' AND effective_from IS NOT NULL AND effective_from <= ?`
  ).run(now(), today);
  db.prepare(
    `UPDATE dip_agreements SET status = 'expired', updated_at = ?
     WHERE status = 'active' AND effective_to IS NOT NULL AND effective_to < ?`
  ).run(now(), today);
}

export function sweepAll() {
  sweepIdentities();
  sweepAgreements();
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export function audit(actorId, action, targetType = '', targetId = '', detail = {}) {
  const actorName =
    actorId
      ? db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(actorId)?.display_name || ''
      : '';
  db.prepare(
    'INSERT INTO dip_audit_logs (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(actorId ?? null, actorName, action, targetType, String(targetId), JSON.stringify(detail), now());
}

// ---------------------------------------------------------------------------
// In-app notifications (站内信) rendered from editable templates
// ---------------------------------------------------------------------------

function renderTemplate(text, vars) {
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
}

export function notify(userId, code, vars = {}, related = {}) {
  const tpl = db.prepare('SELECT * FROM dip_message_templates WHERE code = ? AND enabled = 1').get(code);
  const title = renderTemplate(tpl?.title_template ?? code, vars);
  const body = renderTemplate(tpl?.body_template ?? '', vars);
  db.prepare(
    'INSERT INTO dip_messages (user_id, template_code, title, body, related, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, code, title, body, JSON.stringify(related), now());
}

// ---------------------------------------------------------------------------
// Verify masking — 验真结果不返回联系方式等敏感信息
// ---------------------------------------------------------------------------

export function maskRelation(row) {
  return {
    kind: 'relation',
    no: row.no,
    objectType: row.object_type,
    relationType: row.relation_type,
    entityName: row.entity_name,
    status: row.status,
    issuedBy: '奶龙国皇家外交事务署',
    establishedAt: row.established_at,
    valid: row.status === 'established',
  };
}

export function maskIdentity(row) {
  return {
    kind: 'identity',
    no: row.no,
    identityType: row.identity_type,
    entityName: row.entity_name,
    status: row.status,
    termStart: row.term_start,
    termEnd: row.term_end,
    issuedBy: '奶龙国皇家外交事务署',
    valid: row.status === 'active',
  };
}

export function maskAgreement(row) {
  return {
    kind: 'agreement',
    no: row.no,
    partyA: row.party_a,
    partyB: row.party_b,
    type: row.type,
    status: row.status,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    issuedBy: '奶龙国皇家外交事务署',
    valid: row.status === 'active',
  };
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const nowStr = now;

export function pageParams(query, defaults = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || defaults.pageSize || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export { badRequest, conflict };
