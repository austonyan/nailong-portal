// 奶龙国皇家礼宾与活动署 — shared server helpers: numbering, state machines,
// rate limiting, risk control, audit, notifications, masking and lazy sweeps.
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../http.js';
import { getConfig, getConfigInt } from './schema.js';

// ---------------------------------------------------------------------------
// Non-guessable identifiers (date + random base-32 without 0/O/1/I/L)
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

// e.g. NJE20261026-7K3M9Q (活动) / NJI… 邀请函 / NJP… 活动凭证 / NJH… 接待方
export function makeNo(prefix) {
  return `${prefix}${stamp()}-${randomCode(6)}`;
}

export function makeUniqueNo(configKey, table, column = 'no') {
  const prefix = getConfig(configKey) || 'NLX';
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const no = makeNo(prefix);
    if (!db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).get(no)) return no;
  }
  throw new ApiError(500, 'INTERNAL_ERROR', 'Failed to allocate a unique number');
}

export const makeToken = () => crypto.randomBytes(16).toString('hex');

// ---------------------------------------------------------------------------
// State machines
// ---------------------------------------------------------------------------

export const EVENT_TRANSITIONS = {
  draft: ['pending_publish', 'registration', 'cancelled'],
  pending_publish: ['registration', 'draft', 'cancelled'],
  registration: ['registration_closed', 'ongoing', 'cancelled'],
  registration_closed: ['ongoing', 'registration', 'cancelled'],
  ongoing: ['ended', 'cancelled'],
  ended: [],
  cancelled: [],
};

export const REGISTRATION_TRANSITIONS = {
  draft: ['pending_review', 'cancelled'],
  pending_review: ['approved', 'waitlisted', 'rejected', 'cancelled'],
  waitlisted: ['approved', 'cancelled', 'rejected'],
  approved: ['checked_in', 'cancelled', 'finished'],
  checked_in: ['finished'],
  rejected: [],
  cancelled: [],
  finished: [],
};

export const INVITATION_TRANSITIONS = {
  valid: ['used', 'expired', 'revoked'],
  used: [],
  expired: [],
  revoked: [],
};

export const PASS_TRANSITIONS = {
  pending: ['used', 'expired', 'voided'],
  used: ['expired'],
  expired: [],
  voided: [],
};

export const HOST_TRANSITIONS = {
  draft: ['pending_review', 'revoked'],
  pending_review: ['certified', 'rejected', 'supplement_required', 'revoked'],
  supplement_required: ['pending_review', 'rejected', 'revoked'],
  certified: ['frozen', 'revoked'],
  frozen: ['certified', 'revoked'],
  rejected: [],
  revoked: [],
};

export const COURTESY_TRANSITIONS = {
  pending_review: ['approved', 'rejected', 'cancelled'],
  approved: ['used', 'cancelled', 'expired'],
  rejected: [],
  used: [],
  cancelled: [],
  expired: [],
};

const MAPS = {
  event: EVENT_TRANSITIONS,
  registration: REGISTRATION_TRANSITIONS,
  invitation: INVITATION_TRANSITIONS,
  pass: PASS_TRANSITIONS,
  host: HOST_TRANSITIONS,
  courtesy: COURTESY_TRANSITIONS,
};

export function canTransition(kind, from, to) {
  return (MAPS[kind]?.[from] || []).includes(to);
}

export function assertTransition(kind, from, to, code = 'EVT_INVALID_STATE') {
  if (!canTransition(kind, from, to)) throw conflict(code, `Cannot move from ${from} to ${to}`);
}

// ---------------------------------------------------------------------------
// Rate limiting — fixed windows keyed by actor ("u:<id>" or "ip:<addr>")
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  'protocol:register_submit': { max: 5, window: 'day' },
  'protocol:registration_save': { max: 40, window: 'day' },
  'protocol:invitation_action': { max: 30, window: 'day' },
  'protocol:courtesy_apply': { max: 5, window: 'day' },
  'protocol:host_submit': { max: 3, window: 'day' },
  'protocol:support': { max: 10, window: 'day' },
  'protocol:public_verify': { max: 30, window: '5min' },
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
  if (!def) return;
  if (action === 'protocol:public_verify') {
    def = { ...def, max: getConfigInt('verify_limit_per_5min', def.max) };
  }
  const ws = windowStart(def.window);
  const row = db.prepare('SELECT window_start, count FROM pro_rate_limits WHERE actor = ? AND action = ?').get(actor, action);
  if (!row || row.window_start !== ws) {
    db.prepare(
      `INSERT INTO pro_rate_limits (actor, action, window_start, count) VALUES (?, ?, ?, 1)
       ON CONFLICT (actor, action) DO UPDATE SET window_start = excluded.window_start, count = 1`
    ).run(actor, action, ws);
    return;
  }
  if (row.count >= def.max) throw new ApiError(429, 'EVT_RATE_LIMITED', `Too many ${action} requests, try later`);
  db.prepare('UPDATE pro_rate_limits SET count = count + 1 WHERE actor = ? AND action = ?').run(actor, action);
}

export const actorKey = (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip || 'unknown'}`);

export function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
}

// ---------------------------------------------------------------------------
// Risk control
// ---------------------------------------------------------------------------

export function activeBlacklist(userId) {
  return db.prepare('SELECT * FROM pro_blacklist WHERE user_id = ? AND lifted_at IS NULL ORDER BY id DESC').get(userId) || null;
}

export function assertNotBlocked(userId) {
  const entry = activeBlacklist(userId);
  if (entry?.level === 'block') {
    throw forbidden('EVT_BLACKLISTED', 'This account is currently restricted from protocol services');
  }
  return entry;
}

export function riskSummary(userId) {
  const rejected = db
    .prepare("SELECT COUNT(*) AS n FROM pro_registrations WHERE user_id = ? AND status = 'rejected'")
    .get(userId).n;
  const cancelled = db
    .prepare("SELECT COUNT(*) AS n FROM pro_registrations WHERE user_id = ? AND status = 'cancelled'")
    .get(userId).n;
  const blacklist = activeBlacklist(userId);
  const flags = [];
  if (rejected >= 3) flags.push('repeat_reject');
  if (cancelled >= 5) flags.push('frequent_cancel');
  if (blacklist) flags.push(blacklist.level === 'block' ? 'blacklisted' : 'watched');
  return { rejected, cancelled, flags };
}

// ---------------------------------------------------------------------------
// Event counters + capacity
// ---------------------------------------------------------------------------

const OCCUPYING = "('approved','checked_in','finished')";

export function eventCounts(eventId) {
  const approved = db
    .prepare(`SELECT COUNT(*) AS n FROM pro_registrations WHERE event_id = ? AND status IN ${OCCUPYING}`)
    .get(eventId).n;
  const waitlisted = db
    .prepare("SELECT COUNT(*) AS n FROM pro_registrations WHERE event_id = ? AND status = 'waitlisted'")
    .get(eventId).n;
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM pro_registrations WHERE event_id = ? AND status = 'pending_review'")
    .get(eventId).n;
  return { approved, waitlisted, pending };
}

export function serializeType(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    guide: row.guide,
    requiredFields: String(row.required_fields || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    materials: safeJson(row.materials, []),
    allowCompanions: !!row.allow_companions,
    maxCompanions: row.max_companions,
    defaultCapacity: row.default_capacity,
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
  };
}

export function serializeEvent(row, { withCounts = true } = {}) {
  if (!row) return null;
  const typeRow = db.prepare('SELECT * FROM pro_event_types WHERE code = ?').get(row.type_code);
  const counts = withCounts ? eventCounts(row.id) : { approved: 0, waitlisted: 0, pending: 0 };
  const seatsLeft = Math.max(0, row.capacity - counts.approved);
  return {
    id: row.id,
    eventNo: row.event_no,
    typeCode: row.type_code,
    typeName: typeRow?.name ?? row.type_code,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    schedule: safeJson(row.schedule, []),
    venueName: row.venue_name,
    venueNote: row.venue_note,
    capacity: row.capacity,
    seatsLeft,
    approvedCount: counts.approved,
    waitlistedCount: counts.waitlisted,
    pendingCount: counts.pending,
    waitlistEnabled: !!row.waitlist_enabled,
    status: row.status,
    residentOnly: !!row.resident_only,
    diplomaticOnly: !!row.diplomatic_only,
    registrationDeadline: row.registration_deadline,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    conditions: row.conditions,
    materials: safeJson(row.materials, []),
    notice: row.notice,
    coverColor: row.cover_color,
    publishedAt: row.published_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    url: `/protocol/events/${row.event_no}`,
  };
}

export function serializeMaterial(row) {
  return {
    id: row.id,
    kind: row.kind,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    createdAt: row.created_at,
    url: `/api/protocol/materials/${row.id}/file`,
  };
}

export function serializeRegistration(row) {
  if (!row) return null;
  return {
    id: row.id,
    regNo: row.reg_no,
    eventId: row.event_id,
    status: row.status,
    nickname: row.nickname,
    contact: row.contact,
    identityType: row.identity_type,
    identityNo: row.identity_no,
    identityCheck: row.identity_check,
    partySize: row.party_size,
    companions: safeJson(row.companions, []),
    note: row.note,
    invitationNo: row.invitation_no,
    rejectCode: row.reject_code,
    rejectComment: row.reject_comment,
    reviewNote: row.review_note,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeInvitation(row) {
  if (!row) return null;
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(row.event_id);
  const typeNames = {
    event: '活动邀请函',
    foreign: '外宾邀请函',
    resident: '居民专属邀请函',
    diplomatic: '外交礼遇邀请函',
  };
  return {
    id: row.id,
    inviteNo: row.invite_no,
    eventId: row.event_id,
    eventNo: event?.event_no ?? '',
    eventTitle: event?.title ?? '',
    eventStartsAt: event?.starts_at ?? null,
    eventEndsAt: event?.ends_at ?? null,
    venueName: event?.venue_name ?? '',
    inviterName: row.inviter_name,
    inviteeName: row.invitee_name,
    type: row.type,
    typeName: typeNames[row.type] ?? row.type,
    status: row.status,
    response: row.response,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    note: row.note,
    acceptedAt: row.accepted_at,
    revokedReason: row.revoked_reason,
    createdAt: row.created_at,
    verifyUrl: `/protocol/verify?token=${row.token}`,
    verifyToken: row.token,
    downloadUrl: `/api/protocol/invitations/${row.id}/file`,
  };
}

export function serializePass(row) {
  if (!row) return null;
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(row.event_id);
  return {
    id: row.id,
    passNo: row.pass_no,
    registrationId: row.registration_id,
    eventId: row.event_id,
    eventNo: event?.event_no ?? '',
    eventTitle: event?.title ?? '',
    eventStartsAt: event?.starts_at ?? null,
    eventEndsAt: event?.ends_at ?? null,
    venueName: event?.venue_name ?? '',
    venueNote: event?.venue_note ?? '',
    holderName: row.holder_name,
    status: row.status,
    issuedAt: row.issued_at,
    validUntil: row.valid_until,
    voidReason: row.void_reason,
    reissuedFrom: row.reissued_from,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    verifyUrl: `/protocol/verify?token=${row.token}`,
    verifyToken: row.token,
    displayUrl: `/api/protocol/passes/${row.id}/file`,
  };
}

export function serializeHost(row) {
  if (!row) return null;
  return {
    id: row.id,
    hostNo: row.host_no,
    userId: row.user_id,
    type: row.type,
    name: row.name,
    contactNickname: row.contact_nickname,
    contact: row.contact,
    intro: row.intro,
    status: row.status,
    certNo: row.cert_no,
    canPublish: !!row.can_publish,
    canInvite: !!row.can_invite,
    rejectCode: row.reject_code,
    rejectComment: row.reject_comment,
    reviewNote: row.review_note,
    supplementNote: row.supplement_note,
    supplementDeadline: row.supplement_deadline,
    decidedAt: row.decided_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeCourtesy(row) {
  if (!row) return null;
  const typeRow = db.prepare('SELECT name FROM pro_courtesy_types WHERE code = ?').get(row.type_code);
  return {
    id: row.id,
    appNo: row.app_no,
    typeCode: row.type_code,
    typeName: typeRow?.name ?? row.type_code,
    basisType: row.basis_type,
    basisNo: row.basis_no,
    note: row.note,
    status: row.status,
    rejectCode: row.reject_code,
    rejectComment: row.reject_comment,
    reviewNote: row.review_note,
    validUntil: row.valid_until,
    usedAt: row.used_at,
    decidedAt: row.decided_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeMessage(row) {
  return {
    id: row.id,
    type: row.template_code,
    title: row.title,
    body: row.body,
    related: safeJson(row.related, {}),
    read: !!row.read,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

export function serializeNotice(row) {
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

// ---------------------------------------------------------------------------
// Masked verify results — never expose contact / companions / identity numbers
// ---------------------------------------------------------------------------

export function maskInvitation(row) {
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(row.event_id);
  const typeNames = { event: '活动邀请函', foreign: '外宾邀请函', resident: '居民专属邀请函', diplomatic: '外交礼遇邀请函' };
  return {
    kind: 'invitation',
    no: row.invite_no,
    typeName: typeNames[row.type] ?? row.type,
    status: row.status,
    eventTitle: event?.title ?? '',
    eventTime: event?.starts_at ?? null,
    venueName: event?.venue_name ?? '',
    validUntil: row.valid_until,
    issuedBy: '奶龙国皇家礼宾与活动署',
    valid: row.status === 'valid' && (!row.valid_until || row.valid_until >= now()),
    visaUsable: row.status === 'valid',
  };
}

export function maskPass(row) {
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(row.event_id);
  return {
    kind: 'pass',
    no: row.pass_no,
    typeName: '活动凭证',
    status: row.status,
    eventTitle: event?.title ?? '',
    eventTime: event?.starts_at ?? null,
    venueName: event?.venue_name ?? '',
    validUntil: row.valid_until,
    issuedBy: '奶龙国皇家礼宾与活动署',
    valid: row.status === 'pending' && (!row.valid_until || row.valid_until >= now()),
  };
}

export function maskHost(row) {
  return {
    kind: 'host',
    no: row.host_no,
    typeName: '接待方认证',
    name: row.name,
    status: row.status,
    certNo: row.cert_no,
    validUntil: null,
    issuedBy: '奶龙国皇家礼宾与活动署',
    valid: row.status === 'certified',
  };
}

// ---------------------------------------------------------------------------
// Cross-service identity checks — 预留联动,默认关闭(linkage_enabled = 0).
// When disabled we only record that the claim is reserved; when enabled we read
// the resident card / diplomatic identity tables if they exist.
// ---------------------------------------------------------------------------

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

export function checkIdentity(type, no, userId) {
  if (!type || type === 'ordinary' || type === 'foreign') {
    return { status: 'not_required', valid: true };
  }
  const value = String(no || '').trim().toUpperCase();
  if (!value) return { status: 'missing', valid: false };
  if (getConfig('linkage_enabled') !== '1') return { status: 'reserved', valid: true };
  if (type === 'resident') {
    if (!tableExists('res_cards')) return { status: 'unavailable', valid: true };
    const card = db
      .prepare('SELECT status FROM res_cards WHERE card_no = ? AND user_id = ?')
      .get(value, userId);
    return card?.status === 'valid' ? { status: 'verified', valid: true } : { status: 'invalid', valid: false };
  }
  if (type === 'diplomatic') {
    if (!tableExists('dip_identities')) return { status: 'unavailable', valid: true };
    const idn = db
      .prepare('SELECT status FROM dip_identities WHERE no = ? AND user_id = ? AND deleted_at IS NULL')
      .get(value, userId);
    return idn?.status === 'active' ? { status: 'verified', valid: true } : { status: 'invalid', valid: false };
  }
  return { status: 'reserved', valid: true };
}

// Used by the courtesy eligibility query (reserved linkage, read-only).
export function checkCourtesyBasis(basisType, basisNo, userId) {
  const value = String(basisNo || '').trim().toUpperCase();
  if (!value) return { valid: false, status: 'missing', source: basisType };
  if (basisType === 'invitation') {
    const inv = db
      .prepare('SELECT * FROM pro_invitations WHERE invite_no = ? AND invitee_user_id = ?')
      .get(value, userId);
    return {
      valid: inv?.status === 'valid' && (!inv.valid_until || inv.valid_until >= now()),
      status: inv ? inv.status : 'not_found',
      source: 'protocol',
      detail: inv ? { eventId: inv.event_id, validUntil: inv.valid_until } : null,
    };
  }
  if (getConfig('linkage_enabled') !== '1') {
    return { valid: true, status: 'reserved', source: basisType };
  }
  if (basisType === 'resident') {
    if (!tableExists('res_cards')) return { valid: true, status: 'unavailable', source: 'resident' };
    const card = db.prepare('SELECT status FROM res_cards WHERE card_no = ? AND user_id = ?').get(value, userId);
    return { valid: card?.status === 'valid', status: card ? card.status : 'not_found', source: 'resident' };
  }
  if (basisType === 'diplomatic') {
    if (!tableExists('dip_identities')) return { valid: true, status: 'unavailable', source: 'diplomatic' };
    const idn = db
      .prepare('SELECT status FROM dip_identities WHERE no = ? AND user_id = ? AND deleted_at IS NULL')
      .get(value, userId);
    return { valid: idn?.status === 'active', status: idn ? idn.status : 'not_found', source: 'diplomatic' };
  }
  return { valid: false, status: 'invalid_basis', source: basisType };
}

// ---------------------------------------------------------------------------
// Lazy sweeps
// ---------------------------------------------------------------------------

export function sweepEvents() {
  const ts = now();
  db.prepare(
    `UPDATE pro_events SET status = 'registration_closed', updated_at = ?
     WHERE status = 'registration' AND registration_deadline IS NOT NULL AND registration_deadline < ?`
  ).run(ts, ts);
  db.prepare(
    `UPDATE pro_events SET status = 'ongoing', updated_at = ?
     WHERE status IN ('registration','registration_closed') AND starts_at IS NOT NULL AND starts_at <= ?
       AND (ends_at IS NULL OR ends_at >= ?)`
  ).run(ts, ts, ts);
  db.prepare(
    `UPDATE pro_events SET status = 'ended', updated_at = ?
     WHERE status IN ('registration','registration_closed','ongoing') AND ends_at IS NOT NULL AND ends_at < ?`
  ).run(ts, ts);
}

export function sweepInvitations() {
  db.prepare(
    "UPDATE pro_invitations SET status = 'expired', updated_at = ? WHERE status = 'valid' AND valid_until IS NOT NULL AND valid_until < ?"
  ).run(now(), now());
}

export function sweepPasses() {
  db.prepare(
    "UPDATE pro_passes SET status = 'expired', updated_at = ? WHERE status = 'pending' AND valid_until IS NOT NULL AND valid_until < ?"
  ).run(now(), now());
  db.prepare(
    `UPDATE pro_passes SET status = 'expired', updated_at = ?
     WHERE status = 'pending' AND event_id IN (SELECT id FROM pro_events WHERE status = 'ended')`
  ).run(now());
}

export function sweepRegistrations() {
  db.prepare(
    `UPDATE pro_registrations SET status = 'finished', updated_at = ?
     WHERE status = 'checked_in' AND event_id IN (SELECT id FROM pro_events WHERE status = 'ended')`
  ).run(now());
}

export function sweepCourtesy() {
  db.prepare(
    "UPDATE pro_courtesy_apps SET status = 'expired', updated_at = ? WHERE status = 'approved' AND valid_until IS NOT NULL AND valid_until < ?"
  ).run(now(), now());
}

export function sweepAll() {
  sweepEvents();
  sweepInvitations();
  sweepPasses();
  sweepRegistrations();
  sweepCourtesy();
}

// ---------------------------------------------------------------------------
// Audit + notifications
// ---------------------------------------------------------------------------

export function audit(actor, action, targetType = '', targetId = '', detail = {}) {
  const actorId = typeof actor === 'object' ? actor?.id : actor;
  let actorName = typeof actor === 'object' ? actor?.display_name || actor?.displayName || actor?.name || '' : '';
  if (!actorName && actorId) {
    const row = db.prepare('SELECT display_name FROM users WHERE id = ?').get(actorId);
    actorName = row?.display_name ?? '';
  }
  db.prepare(
    'INSERT INTO pro_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(actorId ?? null, actorName, action, targetType, String(targetId ?? ''), JSON.stringify(detail), now());
}

function renderTemplate(text, vars) {
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
}

export function notify(userId, code, vars = {}, related = {}) {
  const tpl = db.prepare('SELECT * FROM pro_message_templates WHERE code = ? AND enabled = 1').get(code);
  const title = renderTemplate(tpl?.title_template ?? code, vars);
  const body = renderTemplate(tpl?.body_template ?? '', vars);
  db.prepare(
    'INSERT INTO pro_messages (user_id, template_code, title, body, related, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, code, title, body, JSON.stringify(related), now());
}

export function notifyEventAttendees(eventId, code, vars = {}) {
  const rows = db
    .prepare("SELECT DISTINCT user_id FROM pro_registrations WHERE event_id = ? AND status IN ('approved','checked_in','waitlisted')")
    .all(eventId);
  for (const row of rows) notify(row.user_id, code, vars, { eventId });
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function safeJson(text, fallback) {
  try {
    const parsed = JSON.parse(text ?? '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function pageParams(query, defaults = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || defaults.pageSize || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function eventForNo(eventNo) {
  return db.prepare('SELECT * FROM pro_events WHERE event_no = ? AND deleted_at IS NULL').get(String(eventNo));
}

export function requireRow(row, message = 'Resource not found') {
  if (!row) throw notFound(message);
  return row;
}

export function normalizeCompanions(input, max) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input.slice(0, max)) {
    const item = typeof raw === 'string' ? { nickname: raw } : raw || {};
    const nickname = String(item.nickname || '').trim().slice(0, 40);
    if (!nickname) continue;
    out.push({
      nickname,
      relation: String(item.relation || '').trim().slice(0, 20),
      contact: String(item.contact || '').trim().slice(0, 80),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Issuance helpers shared by user/admin routes
// ---------------------------------------------------------------------------

export function issuePass(registration, { reissuedFrom = '' } = {}) {
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(registration.event_id);
  if (!event) throw notFound('Event not found');
  const existing = db.prepare('SELECT * FROM pro_passes WHERE registration_id = ?').get(registration.id);
  if (existing && existing.status === 'pending') return existing;
  const passNo = makeUniqueNo('prefix.pass', 'pro_passes', 'pass_no');
  const ts = now();
  const validUntil = event.ends_at || new Date(Date.now() + 30 * 86400000).toISOString();
  db.prepare(
    `INSERT INTO pro_passes (pass_no, registration_id, event_id, user_id, holder_name, status, token,
       issued_at, valid_until, reissued_from, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
  ).run(passNo, registration.id, event.id, registration.user_id, registration.nickname || '', makeToken(), ts, validUntil, reissuedFrom, ts, ts);
  const pass = db.prepare('SELECT * FROM pro_passes WHERE pass_no = ?').get(passNo);
  notify(
    registration.user_id,
    reissuedFrom ? 'pass_reissued' : 'pass_issued',
    {
      passNo,
      event: event.title,
      startsAt: event.starts_at ? String(event.starts_at).replace('T', ' ').slice(0, 16) : '',
      venue: event.venue_name || '',
    },
    { eventId: event.id, passNo }
  );
  audit({ name: 'system' }, 'pass_issue', 'pass', passNo, { regNo: registration.reg_no, reissuedFrom });
  return pass;
}

export function promoteWaitlist(eventId, actor = null) {
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(eventId);
  if (!event) return null;
  const counts = eventCounts(eventId);
  if (counts.approved >= event.capacity) return null;
  const next = db
    .prepare("SELECT * FROM pro_registrations WHERE event_id = ? AND status = 'waitlisted' ORDER BY submitted_at, id LIMIT 1")
    .get(eventId);
  if (!next) return null;
  db.prepare(
    "UPDATE pro_registrations SET status = 'approved', decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(now(), now(), next.id);
  const fresh = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(next.id);
  const pass = issuePass(fresh);
  notify(next.user_id, 'registration_promoted', { no: next.reg_no, event: event.title, passNo: pass.pass_no }, { eventId });
  audit(actor ?? { name: 'system' }, 'registration_promote', 'registration', next.reg_no, { eventId });
  return fresh;
}

export { badRequest, conflict, forbidden, notFound };