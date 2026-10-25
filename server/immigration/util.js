// 皇家口岸入境署 — shared server-side helpers: id generation, state machines,
// rate limiting, audit logging and in-app notifications.
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { ApiError, badRequest, conflict, forbidden } from '../http.js';
import { getSetting } from './schema.js';

// ---------------------------------------------------------------------------
// Non-guessable identifiers
// ---------------------------------------------------------------------------

// Base-32-ish alphabet without 0/O/1/I/L so numbers stay easy to read aloud.
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

// e.g. IM20261025-7K3M9Q / PC… / EN… / EX…
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
// Declaration state machine
// ---------------------------------------------------------------------------

export const DECL_TRANSITIONS = {
  draft: ['pending'],
  pending: ['approved', 'rejected', 'supplement', 'withdrawn'],
  supplement: ['pending', 'rejected'],
  approved: ['entered'],
  entered: ['exited'],
  rejected: [],
  withdrawn: [],
  exited: [],
};

export function canTransition(from, to) {
  return (DECL_TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from, to, message) {
  if (!canTransition(from, to)) {
    throw conflict('IMM_INVALID_STATE', message || `Cannot move declaration from ${from} to ${to}`);
  }
}

export function logEvent(declarationId, action, actorId, note = '') {
  db.prepare(
    'INSERT INTO im_declaration_events (declaration_id, action, actor_id, note, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(declarationId, action, actorId ?? null, note, now());
}

// ---------------------------------------------------------------------------
// Rate limiting — fixed windows keyed by actor ("u:<id>" or "ip:<addr>")
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  'im:submit': { max: 5, window: 'day' },
  'im:supplement': { max: 10, window: 'day' },
  'im:visa_check': { max: 20, window: 'hour' },
  'im:pass_verify': { max: 30, window: 'hour' },
  'im:public_verify': { max: 60, window: 'hour' },
};

function windowStart(window) {
  const d = new Date();
  if (window === 'day') d.setHours(0, 0, 0, 0);
  else d.setMinutes(0, 0, 0);
  return d.toISOString();
}

export function consumeRateLimit(actor, action) {
  const def = RATE_LIMITS[action];
  if (!def) return;
  const ws = windowStart(def.window);
  const row = db.prepare('SELECT window_start, count FROM im_rate_limits WHERE actor = ? AND action = ?').get(actor, action);
  if (!row || row.window_start !== ws) {
    db.prepare(
      `INSERT INTO im_rate_limits (actor, action, window_start, count) VALUES (?, ?, ?, 1)
       ON CONFLICT (actor, action) DO UPDATE SET window_start = excluded.window_start, count = 1`
    ).run(actor, action, ws);
    return;
  }
  if (row.count >= def.max) {
    throw new ApiError(429, 'IMM_RATE_LIMITED', `Too many ${action} requests, try later`);
  }
  db.prepare('UPDATE im_rate_limits SET count = count + 1 WHERE actor = ? AND action = ?').run(actor, action);
}

export const actorKey = (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip || 'unknown'}`);

// ---------------------------------------------------------------------------
// Risk control: blacklist + duplicate submission detection
// ---------------------------------------------------------------------------

export function activeBlacklist(userId) {
  const rows = db
    .prepare('SELECT * FROM im_blacklist WHERE user_id = ? AND lifted_at IS NULL ORDER BY id DESC')
    .all(userId);
  const nowStr = now();
  return rows.find((r) => !r.expires_at || r.expires_at > nowStr) || null;
}

export function assertNotBlocked(userId) {
  const entry = activeBlacklist(userId);
  if (entry?.level === 'block') {
    throw forbidden('IMM_BLACKLISTED', 'This account is currently restricted from submitting declarations');
  }
  return entry;
}

// One active (in-flight) declaration per user per port keeps the queue fun.
export const ACTIVE_DECL_STATUSES = ['pending', 'supplement', 'approved', 'entered'];

export function assertNoDuplicate(userId, portId) {
  const row = db
    .prepare(
      `SELECT no FROM im_declarations
       WHERE user_id = ? AND port_id = ? AND deleted_at IS NULL AND status IN ('pending', 'supplement', 'approved', 'entered')`
    )
    .get(userId, portId);
  if (row) throw conflict('IMM_DUPLICATE', `An active declaration ${row.no} already exists for this port`);
}

export function riskSummary(userId) {
  const rejected = db
    .prepare("SELECT COUNT(*) AS n FROM im_declarations WHERE user_id = ? AND status = 'rejected'")
    .get(userId).n;
  const blacklist = activeBlacklist(userId);
  const flags = [];
  if (rejected >= 3) flags.push('repeat_reject');
  if (blacklist) flags.push(blacklist.level === 'block' ? 'blacklisted' : 'watched');
  return { rejected, flags };
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export function audit(actorId, action, targetType = '', targetId = '', detail = {}) {
  db.prepare(
    'INSERT INTO im_audit_logs (actor_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(actorId ?? null, action, targetType, String(targetId), JSON.stringify(detail), now());
}

// ---------------------------------------------------------------------------
// In-app notifications (站内信) rendered from editable templates
// ---------------------------------------------------------------------------

function renderTemplate(text, vars) {
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
}

export function notify(userId, code, vars = {}, related = {}) {
  const tpl = db.prepare('SELECT * FROM im_message_templates WHERE code = ? AND enabled = 1').get(code);
  const title = renderTemplate(tpl?.title_template ?? code, vars);
  const body = renderTemplate(tpl?.body_template ?? '', vars);
  db.prepare(
    'INSERT INTO im_messages (user_id, template_code, title, body, related, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, code, title, body, JSON.stringify(related), now());
}

// ---------------------------------------------------------------------------
// Fun congestion meter — deterministic, purely cosmetic
// ---------------------------------------------------------------------------

export function crowding() {
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM im_declarations WHERE status IN ('pending', 'supplement') AND deleted_at IS NULL")
    .get().n;
  const hour = new Date().getHours();
  const peak = hour >= 10 && hour <= 16 ? 10 : 0;
  const percent = Math.min(95, 6 + pending * 4 + peak);
  const level = percent < 30 ? 'smooth' : percent < 60 ? 'normal' : 'busy';
  return { percent, level, pendingCount: pending };
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
