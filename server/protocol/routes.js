// 奶龙国皇家礼宾与活动署 — user-facing API. Private materials live under the
// data dir and are only reachable through the authenticated download route;
// the verify center is public, rate limited, masked and never returns personal
// data (contact, companions, identity numbers).
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { db, now } from '../db.js';
import { authenticate } from '../auth.js';
import { badRequest, conflict, forbidden, notFound } from '../http.js';
import { reqLocale } from '../locale.js';
import { ensureProtocolSchema, getConfig, getConfigInt } from './schema.js';
import {
  actorKey,
  assertNotBlocked,
  audit,
  checkCourtesyBasis,
  checkIdentity,
  clientIp,
  consumeRateLimit,
  eventForNo,
  makeUniqueNo,
  maskHost,
  maskInvitation,
  maskPass,
  normalizeCompanions,
  notify,
  pageParams,
  promoteWaitlist,
  serializeCourtesy,
  serializeEvent,
  serializeHost,
  serializeInvitation,
  serializeMaterial,
  serializeMessage,
  serializeNotice,
  serializePass,
  serializeRegistration,
  serializeType,
  sweepAll,
  riskSummary,
} from './util.js';

ensureProtocolSchema();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NAILONG_DATA_DIR || path.join(__dirname, '..', 'data');
export const protocolUploadsRoot = path.join(dataDir, 'uploads', 'protocol');
fs.mkdirSync(protocolUploadsRoot, { recursive: true });

const router = Router();
const MAX_MATERIAL_BYTES = 5 * 1024 * 1024;
const MAX_MATERIALS = 6;
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const IDENTITY_TYPES = new Set(['ordinary', 'resident', 'diplomatic', 'foreign']);
const BASIS_TYPES = new Set(['resident', 'diplomatic', 'invitation']);
const HOST_TYPES = new Set(['organizer', 'community', 'diplomatic', 'resident_group']);
const PUBLIC_STATUSES = ['registration', 'registration_closed', 'ongoing', 'ended'];

// ---------------------------------------------------------------------------
// Uploads (private storage)
// ---------------------------------------------------------------------------

const tmpDir = path.join(protocolUploadsRoot, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpDir),
    filename(_req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_MATERIAL_BYTES, files: 1 },
});

function mapMulterError(err, _req, _res, next) {
  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'EVT_FILE_TOO_LARGE' : 'VALIDATION_ERROR';
    return next(badRequest(code, err.message));
  }
  next(err);
}

function canReview(user) {
  const perms = user?.permissions || [];
  return perms.includes('evt:review') || perms.includes('evt:manage');
}

function deleteMaterialFile(material) {
  fs.rm(path.join(protocolUploadsRoot, material.path), { force: true }, () => {});
}

function materialList(ownerType, ownerId) {
  return db
    .prepare('SELECT * FROM pro_materials WHERE owner_type = ? AND owner_id = ? ORDER BY id')
    .all(ownerType, ownerId)
    .map(serializeMaterial);
}

function eventNotices(eventId) {
  return db
    .prepare('SELECT * FROM pro_event_notices WHERE event_id = ? ORDER BY id DESC')
    .all(eventId)
    .map((n) => ({ id: n.id, title: n.title, body: n.body, level: n.level, createdAt: n.created_at }));
}

function registrationHistory(regNo) {
  return db
    .prepare("SELECT * FROM pro_audit WHERE target_type = 'registration' AND target_id = ? ORDER BY id")
    .all(regNo)
    .map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actor_name,
      detail: a.detail,
      createdAt: a.created_at,
    }));
}

function registrationDetail(row) {
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(row.event_id);
  const pass = db.prepare('SELECT * FROM pro_passes WHERE registration_id = ? ORDER BY id DESC LIMIT 1').get(row.id);
  return {
    ...serializeRegistration(row),
    event: serializeEvent(event),
    materials: materialList('registration', row.id),
    pass: serializePass(pass),
    history: registrationHistory(row.reg_no),
  };
}

function hostDetail(row) {
  return {
    ...serializeHost(row),
    materials: materialList('host', row.id),
    history: db
      .prepare("SELECT * FROM pro_audit WHERE target_type = 'host' AND target_id = ? ORDER BY id")
      .all(row.host_no)
      .map((a) => ({ id: a.id, action: a.action, actorName: a.actor_name, detail: a.detail, createdAt: a.created_at })),
  };
}

function loadOwnRegistration(req) {
  const row = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Registration not found');
  if (row.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your registration');
  return row;
}

function loadOwnHost(req) {
  const row = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Host application not found');
  if (row.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your host application');
  return row;
}

function eventMaterials(event, type) {
  const merged = [...(event?.materials ? JSON.parse(event.materials) : []), ...(type?.materials ? JSON.parse(type.materials) : [])];
  const seen = new Set();
  return merged.filter((m) => {
    const key = `${m.kind}:${m.required ? 1 : 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function applyFields(row, body) {
  const type = db.prepare('SELECT * FROM pro_event_types WHERE code = ?').get(row.type_code);
  const maxCompanions = type?.max_companions ?? getConfigInt('max_companions', 3);
  const str = (v, max) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

  if (body.nickname !== undefined) row.nickname = str(body.nickname, 40);
  if (body.contact !== undefined) row.contact = str(body.contact, 80);
  if (body.note !== undefined) row.note = str(body.note, 500);
  if (body.identityType !== undefined) {
    if (!IDENTITY_TYPES.has(body.identityType)) throw badRequest('VALIDATION_ERROR', 'Unknown identity type');
    row.identity_type = body.identityType;
  }
  if (body.identityNo !== undefined) row.identity_no = str(body.identityNo, 40).toUpperCase();
  if (body.invitationNo !== undefined) row.invitation_no = str(body.invitationNo, 40).toUpperCase();

  if (body.companions !== undefined) {
    row.companions = JSON.stringify(normalizeCompanions(body.companions, maxCompanions));
    if (body.partySize === undefined) row.party_size = 1 + JSON.parse(row.companions).length;
  }
  if (body.partySize !== undefined) {
    const size = Number(body.partySize);
    if (!Number.isFinite(size) || size < 1 || size > 1 + maxCompanions) {
      throw badRequest('EVT_PARTY_SIZE', `partySize must be within 1..${1 + maxCompanions}`);
    }
    row.party_size = Math.floor(size);
  }
  return row;
}

// ---------------------------------------------------------------------------
// Public verify center — must stay before router.use(authenticate)
// ---------------------------------------------------------------------------

router.get('/verify', (req, res) => {
  consumeRateLimit(`ip:${clientIp(req) || 'unknown'}`, 'protocol:public_verify');
  sweepAll();
  const token = String(req.query.token || '').trim();
  const no = String(req.query.no || '').trim().toUpperCase();
  if (!token && !no) throw badRequest('VALIDATION_ERROR', 'query is required');
  if (token && !/^[0-9a-f]{32}$/.test(token)) throw notFound('Unknown verify token');
  if (no && no.length > 64) throw badRequest('VALIDATION_ERROR', 'query too long');

  let item = null;
  if (token) {
    const inv = db.prepare('SELECT * FROM pro_invitations WHERE token = ?').get(token);
    if (inv) item = maskInvitation(inv);
    if (!item) {
      const pass = db.prepare('SELECT * FROM pro_passes WHERE token = ?').get(token);
      if (pass) item = maskPass(pass);
    }
  } else {
    const inv = db.prepare('SELECT * FROM pro_invitations WHERE invite_no = ?').get(no);
    if (inv) item = maskInvitation(inv);
    if (!item) {
      const pass = db.prepare('SELECT * FROM pro_passes WHERE pass_no = ?').get(no);
      if (pass) item = maskPass(pass);
    }
    if (!item) {
      const host = db.prepare('SELECT * FROM pro_hosts WHERE host_no = ? AND deleted_at IS NULL').get(no);
      if (host) item = maskHost(host);
    }
  }
  db.prepare('INSERT INTO pro_verify_logs (query, ip, kind, result, created_at) VALUES (?, ?, ?, ?, ?)').run(
    token ? 'token:*' : no,
    clientIp(req),
    item?.kind ?? '',
    item ? (item.valid ? 'valid' : `status_${item.status}`) : 'not_found',
    now()
  );
  res.json({
    found: !!item,
    item,
    limit: getConfigInt('verify_limit_per_5min', 30),
  });
});

// ---------------------------------------------------------------------------
// Authenticated user routes
// ---------------------------------------------------------------------------

router.use(authenticate);

// Home aggregates: notices, categories, hot/upcoming events, service catalog.
router.get('/home', (req, res) => {
  sweepAll();
  const notices = db.prepare('SELECT * FROM pro_notices WHERE enabled = 1 ORDER BY id DESC LIMIT 8').all().map(serializeNotice);
  const types = db.prepare('SELECT * FROM pro_event_types WHERE enabled = 1 ORDER BY sort_order, id').all().map(serializeType);
  const hot = db
    .prepare(
      `SELECT * FROM pro_events WHERE deleted_at IS NULL AND status IN (${PUBLIC_STATUSES.map(() => '?').join(',')})
       ORDER BY (SELECT COUNT(*) FROM pro_registrations r WHERE r.event_id = pro_events.id AND r.status IN ('approved','checked_in','finished')) DESC, starts_at LIMIT 3`
    )
    .all(...PUBLIC_STATUSES)
    .map((e) => serializeEvent(e));
  const upcoming = db
    .prepare(
      `SELECT * FROM pro_events WHERE deleted_at IS NULL AND status IN ('registration','registration_closed')
       ORDER BY starts_at LIMIT 4`
    )
    .all()
    .map((e) => serializeEvent(e));
  const openCount = db
    .prepare("SELECT COUNT(*) AS n FROM pro_events WHERE deleted_at IS NULL AND status = 'registration'")
    .get().n;
  const unread = db.prepare('SELECT COUNT(*) AS n FROM pro_messages WHERE user_id = ? AND read = 0 AND archived = 0').get(req.user.id).n;
  const courtesyTypes = db
    .prepare('SELECT * FROM pro_courtesy_types WHERE enabled = 1 ORDER BY sort_order, id')
    .all();
  res.json({
    notices,
    types,
    hot,
    upcoming,
    openCount,
    hotCount: hot.length,
    unread,
    courtesyTypes,
    reviewHoursHint: getConfigInt('review_hours_hint', 48),
    maxCompanions: getConfigInt('max_companions', 3),
    linkageEnabled: getConfig('linkage_enabled') === '1',
  });
});

// Event list with filters (type / status / q / resident / diplomatic / open).
router.get('/events', (req, res) => {
  sweepAll();
  const { pageSize, offset } = pageParams(req.query, { pageSize: 12 });
  const where = ["deleted_at IS NULL", `status IN (${PUBLIC_STATUSES.map(() => '?').join(',')})`];
  const params = [...PUBLIC_STATUSES];
  if (req.query.type) {
    where.push('type_code = ?');
    params.push(String(req.query.type));
  }
  if (req.query.status) {
    where.push('status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.q) {
    where.push('(title LIKE ? OR subtitle LIKE ? OR venue_name LIKE ?)');
    const like = `%${String(req.query.q).slice(0, 60)}%`;
    params.push(like, like, like);
  }
  if (req.query.open === '1') where.push("status = 'registration'");
  if (req.query.resident === '1') where.push('resident_only = 1');
  if (req.query.diplomatic === '1') where.push('diplomatic_only = 1');
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM pro_events WHERE ${clause}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM pro_events WHERE ${clause} ORDER BY starts_at LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ items: rows.map((e) => serializeEvent(e)), total, pageSize });
});

router.get('/events/:no', (req, res) => {
  sweepAll();
  const event = eventForNo(req.params.no);
  if (!event || !PUBLIC_STATUSES.includes(event.status)) throw notFound('Event not found');
  const type = db.prepare('SELECT * FROM pro_event_types WHERE code = ?').get(event.type_code);
  const mine = db
    .prepare(
      `SELECT * FROM pro_registrations WHERE event_id = ? AND user_id = ?
       AND status IN ('draft','pending_review','approved','waitlisted','checked_in','finished') ORDER BY id DESC LIMIT 1`
    )
    .get(event.id, req.user.id);
  const invitation = db
    .prepare("SELECT * FROM pro_invitations WHERE event_id = ? AND invitee_user_id = ? AND status = 'valid' ORDER BY id DESC LIMIT 1")
    .get(event.id, req.user.id);
  const pass = mine
    ? db.prepare('SELECT * FROM pro_passes WHERE registration_id = ? ORDER BY id DESC LIMIT 1').get(mine.id)
    : null;
  res.json({
    event: serializeEvent(event),
    type: serializeType(type),
    materialsRequired: eventMaterials(event, type),
    notices: eventNotices(event.id),
    myRegistration: mine ? serializeRegistration(mine) : null,
    myPass: serializePass(pass),
    myInvitation: serializeInvitation(invitation),
  });
});

// ---------------------------------------------------------------------------
// Registrations (报名)
// ---------------------------------------------------------------------------

const ACTIVE_REG = ['draft', 'pending_review', 'approved', 'waitlisted', 'checked_in'];

router.get('/registrations', (req, res) => {
  sweepAll();
  const rows = db
    .prepare(
      `SELECT r.*, e.title AS event_title, e.event_no AS event_no, e.starts_at AS event_starts_at,
              e.ends_at AS event_ends_at, e.venue_name AS event_venue, e.status AS event_status, e.capacity AS event_capacity
       FROM pro_registrations r JOIN pro_events e ON e.id = r.event_id
       WHERE r.user_id = ? ORDER BY r.id DESC`
    )
    .all(req.user.id);
  res.json({
    items: rows.map((r) => ({
      ...serializeRegistration(r),
      eventTitle: r.event_title,
      eventNo: r.event_no,
      eventStartsAt: r.event_starts_at,
      eventEndsAt: r.event_ends_at,
      venueName: r.event_venue,
      eventStatus: r.event_status,
    })),
  });
});

router.get('/registrations/:id', (req, res) => {
  sweepAll();
  res.json({ registration: registrationDetail(loadOwnRegistration(req)) });
});

router.post('/registrations', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:registration_save');
  assertNotBlocked(req.user.id);
  sweepAll();
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ? AND deleted_at IS NULL').get(Number(req.body?.eventId));
  if (!event) throw notFound('Event not found');
  if (event.status !== 'registration') throw conflict('EVT_EVENT_CLOSED', 'This event is not open for registration');
  if (!event.waitlist_enabled && eventCountsApproved(event.id) >= event.capacity) {
    throw conflict('EVT_EVENT_FULL', 'This event is full');
  }
  const dup = db
    .prepare(
      `SELECT * FROM pro_registrations WHERE user_id = ? AND event_id = ? AND status IN (${ACTIVE_REG.map(() => '?').join(',')})`
    )
    .get(req.user.id, event.id, ...ACTIVE_REG);
  if (dup) throw conflict('EVT_DUPLICATE', `An active registration ${dup.reg_no} already exists`);
  const activeCount = db
    .prepare(
      `SELECT COUNT(*) AS n FROM pro_registrations WHERE user_id = ? AND status IN ('pending_review','approved','waitlisted','checked_in')`
    )
    .get(req.user.id).n;
  const maxActive = getConfigInt('max_active_registrations', 5);
  if (activeCount >= maxActive) throw conflict('EVT_TOO_MANY_ACTIVE', `At most ${maxActive} active registrations`);

  const regNo = makeUniqueNo('prefix.registration', 'pro_registrations', 'reg_no');
  const ts = now();
  const row = {
    nickname: '',
    contact: '',
    identity_type: 'ordinary',
    identity_no: '',
    party_size: 1,
    companions: '[]',
    note: '',
    invitation_no: '',
  };
  applyFields(row, req.body || {});
  const info = db
    .prepare(
      `INSERT INTO pro_registrations (reg_no, user_id, event_id, status, nickname, contact, identity_type, identity_no,
         identity_check, party_size, companions, note, invitation_no, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, 'not_required', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      regNo,
      req.user.id,
      event.id,
      row.nickname,
      row.contact,
      row.identity_type,
      row.identity_no,
      row.party_size,
      row.companions,
      row.note,
      row.invitation_no,
      ts,
      ts
    );
  audit(req.user, 'registration_draft', 'registration', regNo, { eventId: event.id });
  res.status(201).json({ registration: registrationDetail(db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/registrations/:id', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:registration_save');
  const reg = loadOwnRegistration(req);
  if (reg.status !== 'draft') throw conflict('EVT_NOT_EDITABLE', 'Only drafts can be edited');
  const row = applyFields(reg, req.body || {});
  db.prepare(
    `UPDATE pro_registrations SET nickname = ?, contact = ?, identity_type = ?, identity_no = ?, party_size = ?,
       companions = ?, note = ?, invitation_no = ?, updated_at = ? WHERE id = ?`
  ).run(
    row.nickname,
    row.contact,
    row.identity_type,
    row.identity_no,
    row.party_size,
    row.companions,
    row.note,
    row.invitation_no,
    now(),
    reg.id
  );
  res.json({ registration: registrationDetail(db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(reg.id)) });
});

router.delete('/registrations/:id', (req, res) => {
  const reg = loadOwnRegistration(req);
  if (reg.status !== 'draft') throw conflict('EVT_NOT_EDITABLE', 'Only drafts can be deleted');
  for (const m of db.prepare("SELECT * FROM pro_materials WHERE owner_type = 'registration' AND owner_id = ?").all(reg.id)) {
    deleteMaterialFile(m);
  }
  db.prepare("DELETE FROM pro_materials WHERE owner_type = 'registration' AND owner_id = ?").run(reg.id);
  db.prepare('DELETE FROM pro_registrations WHERE id = ?').run(reg.id);
  audit(req.user, 'registration_delete', 'registration', reg.reg_no, {});
  res.json({ ok: true });
});

router.post('/registrations/:id/submit', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:register_submit');
  assertNotBlocked(req.user.id);
  sweepAll();
  const reg = loadOwnRegistration(req);
  if (reg.status !== 'draft') throw conflict('EVT_NOT_EDITABLE', 'Registration already submitted');
  const row = applyFields(reg, req.body || {});
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(reg.event_id);
  const type = db.prepare('SELECT * FROM pro_event_types WHERE code = ?').get(event.type_code);
  if (event.status !== 'registration') throw conflict('EVT_EVENT_CLOSED', 'Registration is closed for this event');
  if (event.registration_deadline && event.registration_deadline < now()) throw conflict('EVT_DEADLINE_PASSED', 'Registration deadline passed');

  const requiredFields = String(type?.required_fields || 'nickname,contact').split(',').map((s) => s.trim());
  if (requiredFields.includes('nickname') && !row.nickname) throw badRequest('EVT_FIELD_REQUIRED', 'nickname is required');
  if (requiredFields.includes('contact') && !row.contact) throw badRequest('EVT_FIELD_REQUIRED', 'contact is required');

  const companions = JSON.parse(row.companions || '[]');
  if (companions.length >= 1 && row.party_size !== companions.length + 1) {
    throw badRequest('EVT_PARTY_SIZE', 'partySize must equal companions + 1');
  }
  if (event.resident_only && row.identity_type !== 'resident') {
    throw conflict('EVT_RESIDENT_ONLY', 'This event is for registered residents only');
  }
  if (event.diplomatic_only && row.identity_type !== 'diplomatic') {
    throw conflict('EVT_DIPLOMATIC_ONLY', 'This event is for diplomatic identities only');
  }
  const identity = checkIdentity(row.identity_type, row.identity_no, req.user.id);
  if (!identity.valid) throw conflict('EVT_IDENTITY_INVALID', 'Identity number could not be validated');

  // Invitation: belongs to this user + this event and must still be valid.
  let invitation = null;
  if (row.invitation_no) {
    invitation = db
      .prepare('SELECT * FROM pro_invitations WHERE invite_no = ? AND invitee_user_id = ?')
      .get(row.invitation_no, req.user.id);
    if (!invitation) throw conflict('EVT_INVITATION_INVALID', 'Invitation not found for this account');
    if (invitation.event_id !== event.id) throw conflict('EVT_INVITATION_EVENT', 'Invitation belongs to another event');
    if (invitation.status !== 'valid') throw conflict('EVT_INVITATION_INVALID', `Invitation is ${invitation.status}`);
    if (invitation.valid_until && invitation.valid_until < now()) throw conflict('EVT_INVITATION_INVALID', 'Invitation expired');
  }

  // Material requirements (event + type level).
  const requiredMaterials = eventMaterials(event, type).filter((m) => m.required);
  const present = db
    .prepare("SELECT kind, COUNT(*) AS n FROM pro_materials WHERE owner_type = 'registration' AND owner_id = ? GROUP BY kind")
    .all(reg.id);
  const presentMap = new Map(present.map((p) => [p.kind, p.n]));
  for (const req2 of requiredMaterials) {
    if (!presentMap.get(req2.kind)) throw badRequest('EVT_MATERIAL_REQUIRED', `Material required: ${req2.kind}`);
  }

  if (!event.waitlist_enabled && eventCountsApproved(event.id) >= event.capacity) {
    throw conflict('EVT_EVENT_FULL', 'This event is full and waitlist is disabled');
  }

  const ts = now();
  db.prepare(
    `UPDATE pro_registrations SET nickname = ?, contact = ?, identity_type = ?, identity_no = ?, identity_check = ?,
       party_size = ?, companions = ?, note = ?, invitation_no = ?, status = 'pending_review',
       submitted_at = ?, updated_at = ? WHERE id = ?`
  ).run(
    row.nickname,
    row.contact,
    row.identity_type,
    row.identity_no,
    identity.status,
    row.party_size,
    row.companions,
    row.note,
    row.invitation_no,
    ts,
    ts,
    reg.id
  );
  if (invitation) {
    db.prepare("UPDATE pro_invitations SET status = 'used', response = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?").run(
      ts,
      ts,
      invitation.id
    );
  }
  notify(
    req.user.id,
    'registration_submitted',
    { no: reg.reg_no, hours: getConfigInt('review_hours_hint', 48) },
    { eventId: event.id, regNo: reg.reg_no }
  );
  audit(req.user, 'registration_submit', 'registration', reg.reg_no, { eventId: event.id, identityCheck: identity.status });
  res.json({ registration: registrationDetail(db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(reg.id)) });
});

router.post('/registrations/:id/cancel', (req, res) => {
  const reg = loadOwnRegistration(req);
  if (!['draft', 'pending_review', 'approved', 'waitlisted'].includes(reg.status)) {
    throw conflict('EVT_INVALID_STATE', 'This registration can no longer be cancelled');
  }
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(reg.event_id);
  const ts = now();
  db.prepare("UPDATE pro_registrations SET status = 'cancelled', updated_at = ? WHERE id = ?").run(ts, reg.id);
  const pass = db.prepare('SELECT * FROM pro_passes WHERE registration_id = ?').get(reg.id);
  if (pass && pass.status === 'pending') {
    db.prepare("UPDATE pro_passes SET status = 'voided', void_reason = 'registration_cancelled', updated_at = ? WHERE id = ?").run(ts, pass.id);
  }
  notify(req.user.id, 'registration_cancelled', { no: reg.reg_no, event: event?.title ?? '' }, { eventId: reg.event_id });
  audit(req.user, 'registration_cancel', 'registration', reg.reg_no, { previousStatus: reg.status });
  if (['approved', 'checked_in'].includes(reg.status)) promoteWaitlist(reg.event_id, req.user);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Materials (private upload / restricted download)
// ---------------------------------------------------------------------------

router.post('/materials', upload.single('file'), mapMulterError, (req, res) => {
  const ownerType = String(req.body?.ownerType || '');
  const ownerId = Number(req.body?.ownerId);
  if (!['registration', 'host'].includes(ownerType)) throw badRequest('VALIDATION_ERROR', 'Bad owner type');
  const file = req.file;
  if (!file) throw badRequest('VALIDATION_ERROR', 'file is required');
  const fail = (err) => {
    fs.rm(file.path, { force: true }, () => {});
    throw err;
  };
  if (!ALLOWED_MIMES.has(file.mimetype)) fail(badRequest('EVT_FILE_TYPE', `Unsupported file type: ${file.mimetype}`));
  let editable = false;
  let ownerLabel = '';
  if (ownerType === 'registration') {
    const reg = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(ownerId);
    if (!reg || reg.user_id !== req.user.id) fail(notFound('Registration not found'));
    editable = reg.status === 'draft';
    ownerLabel = reg.reg_no;
  } else {
    const host = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(ownerId);
    if (!host || host.user_id !== req.user.id) fail(notFound('Host application not found'));
    editable = ['draft', 'supplement_required'].includes(host.status);
    ownerLabel = host.host_no;
  }
  if (!editable) fail(conflict('EVT_NOT_EDITABLE', 'Materials are locked in current status'));
  const count = db.prepare('SELECT COUNT(*) AS n FROM pro_materials WHERE owner_type = ? AND owner_id = ?').get(ownerType, ownerId).n;
  if (count >= MAX_MATERIALS) fail(badRequest('EVT_TOO_MANY_FILES', `At most ${MAX_MATERIALS} files`));
  const kind = String(req.body?.kind || 'other').slice(0, 30) || 'other';
  const dirName = `${ownerType}-${ownerId}`;
  const targetDir = path.join(protocolUploadsRoot, dirName);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.renameSync(file.path, path.join(targetDir, file.filename));
  const info = db
    .prepare(
      `INSERT INTO pro_materials (owner_type, owner_id, user_id, kind, filename, mime, size, path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      ownerType,
      ownerId,
      req.user.id,
      kind,
      (file.originalname || 'file').slice(0, 120),
      file.mimetype,
      file.size,
      path.join(dirName, file.filename),
      now()
    );
  audit(req.user, 'material_upload', ownerType, ownerLabel, { kind, size: file.size });
  res.status(201).json({ material: serializeMaterial(db.prepare('SELECT * FROM pro_materials WHERE id = ?').get(info.lastInsertRowid)) });
});

router.delete('/materials/:id', (req, res) => {
  const material = db.prepare('SELECT * FROM pro_materials WHERE id = ?').get(Number(req.params.id));
  if (!material || material.user_id !== req.user.id) throw notFound('Material not found');
  if (material.owner_type === 'registration') {
    const reg = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(material.owner_id);
    if (!reg || reg.status !== 'draft') throw conflict('EVT_NOT_EDITABLE', 'Materials are locked');
  } else {
    const host = db.prepare('SELECT * FROM pro_hosts WHERE id = ?').get(material.owner_id);
    if (!host || !['draft', 'supplement_required'].includes(host.status)) throw conflict('EVT_NOT_EDITABLE', 'Materials are locked');
  }
  deleteMaterialFile(material);
  db.prepare('DELETE FROM pro_materials WHERE id = ?').run(material.id);
  res.json({ ok: true });
});

router.get('/materials/:id/file', (req, res) => {
  const material = db.prepare('SELECT * FROM pro_materials WHERE id = ?').get(Number(req.params.id));
  if (!material) throw notFound('Material not found');
  const isOwner = material.user_id === req.user.id;
  if (!isOwner && !canReview(req.user)) throw forbidden('FORBIDDEN', 'No access to this file');
  const full = path.resolve(protocolUploadsRoot, material.path);
  if (!full.startsWith(protocolUploadsRoot) || !fs.existsSync(full)) throw notFound('File missing');
  audit(req.user, 'material_access', 'material', material.id, { ownerType: material.owner_type, ownerId: material.owner_id });
  res.setHeader('Content-Type', material.mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(material.filename)}`);
  fs.createReadStream(full).pipe(res);
});

// ---------------------------------------------------------------------------
// Invitations (我的邀请函)
// ---------------------------------------------------------------------------

router.get('/invitations', (req, res) => {
  sweepAll();
  const rows = db
    .prepare('SELECT * FROM pro_invitations WHERE invitee_user_id = ? ORDER BY id DESC LIMIT 200')
    .all(req.user.id);
  res.json({ items: rows.map(serializeInvitation) });
});

router.get('/invitations/:id', (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM pro_invitations WHERE id = ?').get(Number(req.params.id));
  if (!row || row.invitee_user_id !== req.user.id) throw notFound('Invitation not found');
  res.json({ invitation: serializeInvitation(row) });
});

router.post('/invitations/:id/accept', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:invitation_action');
  sweepAll();
  const row = db.prepare('SELECT * FROM pro_invitations WHERE id = ?').get(Number(req.params.id));
  if (!row || row.invitee_user_id !== req.user.id) throw notFound('Invitation not found');
  if (row.status !== 'valid') throw conflict('EVT_INVITATION_INVALID', `Invitation is ${row.status}`);
  const ts = now();
  db.prepare("UPDATE pro_invitations SET response = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, row.id);
  audit(req.user, 'invitation_accept', 'invitation', row.invite_no, {});
  res.json({ invitation: serializeInvitation(db.prepare('SELECT * FROM pro_invitations WHERE id = ?').get(row.id)) });
});

router.post('/invitations/:id/decline', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:invitation_action');
  const row = db.prepare('SELECT * FROM pro_invitations WHERE id = ?').get(Number(req.params.id));
  if (!row || row.invitee_user_id !== req.user.id) throw notFound('Invitation not found');
  if (row.status !== 'valid') throw conflict('EVT_INVITATION_INVALID', `Invitation is ${row.status}`);
  db.prepare(
    "UPDATE pro_invitations SET response = 'declined', status = 'revoked', revoked_reason = 'declined_by_invitee', updated_at = ? WHERE id = ?"
  ).run(now(), row.id);
  audit(req.user, 'invitation_decline', 'invitation', row.invite_no, {});
  res.json({ ok: true });
});

router.get('/invitations/:id/file', async (req, res) => {
  const row = db.prepare('SELECT * FROM pro_invitations WHERE id = ?').get(Number(req.params.id));
  if (!row || (row.invitee_user_id !== req.user.id && !canReview(req.user))) throw notFound('Invitation not found');
  const inv = serializeInvitation(row);
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const qr = await QRCode.toDataURL(`${base}/protocol/verify?token=${row.token}`, {
    margin: 1,
    width: 220,
    color: { dark: '#5b4632', light: '#fffdf2' },
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const locale = reqLocale(req);
  const tw = locale === 'zh-TW';
  const inviteStatus = {
    valid: tw ? '有效' : '有效',
    used: tw ? '已使用' : '已使用',
    expired: tw ? '已過期' : '已过期',
    revoked: tw ? '已撤銷' : '已撤销',
  };
  res.send(
    printDocument({
      locale,
      title: tw ? inv.typeNameTw || inv.typeName : inv.typeName,
      no: inv.inviteNo,
      qr,
      rows: [
        [tw ? '活動名稱' : '活动名称', tw ? inv.eventTitleTw || inv.eventTitle : inv.eventTitle],
        [tw ? '邀請人 / 接待方' : '邀请人 / 接待方', inv.inviterName || (tw ? '皇家禮賓與活動署' : '皇家礼宾与活动署')],
        [tw ? '有效期至' : '有效期至', inv.validUntil ? String(inv.validUntil).slice(0, 10) : '-'],
        [tw ? '狀態' : '状态', inviteStatus[inv.status] || inv.status],
        [tw ? '使用說明' : '使用说明', tw ? '請在活動簽到時出示本邀請函;邀請函僅限本人使用,不可轉讓。' : '请在活动签到时出示本邀请函;邀请函仅限本人使用,不可转让。'],
      ],
    })
  );
});

// ---------------------------------------------------------------------------
// Passes (我的活动凭证)
// ---------------------------------------------------------------------------

router.get('/passes', (req, res) => {
  sweepAll();
  const rows = db.prepare('SELECT * FROM pro_passes WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ items: rows.map(serializePass) });
});

router.get('/passes/:id', (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM pro_passes WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Pass not found');
  const reg = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(row.registration_id);
  res.json({
    pass: serializePass(row),
    registration: reg ? serializeRegistration(reg) : null,
  });
});

router.get('/passes/:id/file', async (req, res) => {
  const row = db.prepare('SELECT * FROM pro_passes WHERE id = ?').get(Number(req.params.id));
  if (!row || (row.user_id !== req.user.id && !canReview(req.user))) throw notFound('Pass not found');
  const pass = serializePass(row);
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const qr = await QRCode.toDataURL(`${base}/protocol/verify?token=${row.token}`, {
    margin: 1,
    width: 220,
    color: { dark: '#5b4632', light: '#fffdf2' },
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const locale = reqLocale(req);
  const tw = locale === 'zh-TW';
  const passStatus = {
    pending: tw ? '待使用' : '待使用',
    used: tw ? '已使用' : '已使用',
    expired: tw ? '已過期' : '已过期',
    voided: tw ? '已作廢' : '已作废',
  };
  res.send(
    printDocument({
      locale,
      title: tw ? '活動憑證 · 電子票' : '活动凭证 · 电子票',
      no: pass.passNo,
      qr,
      rows: [
        [tw ? '活動名稱' : '活动名称', tw ? pass.eventTitleTw || pass.eventTitle : pass.eventTitle],
        [tw ? '活動時間' : '活动时间', pass.eventStartsAt ? String(pass.eventStartsAt).replace('T', ' ').slice(0, 16) : '-'],
        [tw ? '活動地點' : '活动地点', tw ? pass.venueNameTw || pass.venueName : pass.venueName],
        [tw ? '持票人暱稱' : '持票人昵称', pass.holderName],
        [tw ? '狀態' : '状态', passStatus[pass.status] || pass.status],
      ],
    })
  );
});

// ---------------------------------------------------------------------------
// Host certification (接待方认证)
// ---------------------------------------------------------------------------

router.get('/hosts', (req, res) => {
  sweepAll();
  const rows = db.prepare('SELECT * FROM pro_hosts WHERE user_id = ? AND deleted_at IS NULL ORDER BY id DESC').all(req.user.id);
  res.json({ items: rows.map(serializeHost), types: [...HOST_TYPES] });
});

router.get('/hosts/:id', (req, res) => {
  sweepAll();
  res.json({ host: hostDetail(loadOwnHost(req)) });
});

router.post('/hosts', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:registration_save');
  assertNotBlocked(req.user.id);
  const open = db
    .prepare("SELECT * FROM pro_hosts WHERE user_id = ? AND deleted_at IS NULL AND status IN ('draft','pending_review','supplement_required','certified','frozen')")
    .get(req.user.id);
  if (open) throw conflict('EVT_HOST_DUPLICATE', `An existing host application ${open.host_no} is in progress`);
  const type = HOST_TYPES.has(req.body?.type) ? req.body.type : 'organizer';
  const hostNo = makeUniqueNo('prefix.host', 'pro_hosts', 'host_no');
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO pro_hosts (host_no, user_id, type, name, contact_nickname, contact, intro, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
    )
    .run(
      hostNo,
      req.user.id,
      type,
      String(req.body?.name || '').trim().slice(0, 80),
      String(req.body?.contactNickname || '').trim().slice(0, 40),
      String(req.body?.contact || '').trim().slice(0, 80),
      String(req.body?.intro || '').trim().slice(0, 1000),
      ts,
      ts
    );
  audit(req.user, 'host_draft', 'host', hostNo, { type });
  res.status(201).json({ host: hostDetail(db.prepare('SELECT * FROM pro_hosts WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/hosts/:id', (req, res) => {
  const host = loadOwnHost(req);
  if (!['draft', 'supplement_required'].includes(host.status)) throw conflict('EVT_NOT_EDITABLE', 'Host application cannot be edited now');
  const type = HOST_TYPES.has(req.body?.type) ? req.body.type : host.type;
  db.prepare(
    'UPDATE pro_hosts SET type = ?, name = ?, contact_nickname = ?, contact = ?, intro = ?, updated_at = ? WHERE id = ?'
  ).run(
    type,
    String(req.body?.name ?? host.name).trim().slice(0, 80),
    String(req.body?.contactNickname ?? host.contact_nickname).trim().slice(0, 40),
    String(req.body?.contact ?? host.contact).trim().slice(0, 80),
    String(req.body?.intro ?? host.intro).trim().slice(0, 1000),
    now(),
    host.id
  );
  res.json({ host: hostDetail(db.prepare('SELECT * FROM pro_hosts WHERE id = ?').get(host.id)) });
});

router.delete('/hosts/:id', (req, res) => {
  const host = loadOwnHost(req);
  if (host.status !== 'draft') throw conflict('EVT_NOT_EDITABLE', 'Only drafts can be deleted');
  for (const m of db.prepare("SELECT * FROM pro_materials WHERE owner_type = 'host' AND owner_id = ?").all(host.id)) {
    deleteMaterialFile(m);
  }
  db.prepare("DELETE FROM pro_materials WHERE owner_type = 'host' AND owner_id = ?").run(host.id);
  db.prepare('DELETE FROM pro_hosts WHERE id = ?').run(host.id);
  audit(req.user, 'host_delete', 'host', host.host_no, {});
  res.json({ ok: true });
});

router.post('/hosts/:id/submit', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:host_submit');
  assertNotBlocked(req.user.id);
  const host = loadOwnHost(req);
  if (!['draft', 'supplement_required'].includes(host.status)) throw conflict('EVT_NOT_EDITABLE', 'Host application already submitted');
  if (!host.name || !host.contact_nickname || !host.contact) throw badRequest('EVT_FIELD_REQUIRED', 'name and contact are required');
  const materialCount = db.prepare("SELECT COUNT(*) AS n FROM pro_materials WHERE owner_type = 'host' AND owner_id = ?").get(host.id).n;
  if (!materialCount) throw badRequest('EVT_MATERIAL_REQUIRED', 'At least one supporting material is required');
  const ts = now();
  db.prepare(
    "UPDATE pro_hosts SET status = 'pending_review', submitted_at = COALESCE(submitted_at, ?), updated_at = ? WHERE id = ?"
  ).run(ts, ts, host.id);
  notify(req.user.id, 'host_submitted', { no: host.host_no, hours: getConfigInt('review_hours_hint', 48) }, { hostNo: host.host_no });
  audit(req.user, 'host_submit', 'host', host.host_no, { name: host.name });
  res.json({ host: hostDetail(db.prepare('SELECT * FROM pro_hosts WHERE id = ?').get(host.id)) });
});

// ---------------------------------------------------------------------------
// Courtesy services (礼宾服务)
// ---------------------------------------------------------------------------

router.get('/courtesy/types', (_req, res) => {
  res.json({
    items: db.prepare('SELECT * FROM pro_courtesy_types WHERE enabled = 1 ORDER BY sort_order, id').all(),
    linkageEnabled: getConfig('linkage_enabled') === '1',
  });
});

router.post('/courtesy/eligibility', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:registration_save');
  const basisType = String(req.body?.basisType || '');
  if (!BASIS_TYPES.has(basisType)) throw badRequest('VALIDATION_ERROR', 'Unknown basis type');
  const result = checkCourtesyBasis(basisType, req.body?.basisNo, req.user.id);
  res.json({ ...result, linkageEnabled: getConfig('linkage_enabled') === '1' });
});

router.get('/courtesy/applications', (req, res) => {
  sweepAll();
  const rows = db.prepare('SELECT * FROM pro_courtesy_apps WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ items: rows.map(serializeCourtesy) });
});

router.post('/courtesy/applications', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:courtesy_apply');
  assertNotBlocked(req.user.id);
  const typeCode = String(req.body?.typeCode || '');
  const type = db.prepare('SELECT * FROM pro_courtesy_types WHERE code = ? AND enabled = 1').get(typeCode);
  if (!type) throw badRequest('VALIDATION_ERROR', 'Unknown courtesy type');
  const basisType = String(req.body?.basisType || '');
  if (!BASIS_TYPES.has(basisType)) throw badRequest('VALIDATION_ERROR', 'Unknown basis type');
  const basis = checkCourtesyBasis(basisType, req.body?.basisNo, req.user.id);
  if (!basis.valid) throw conflict('EVT_BASIS_INVALID', `Basis check failed: ${basis.status}`);
  const appNo = makeUniqueNo('prefix.courtesy', 'pro_courtesy_apps', 'app_no');
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO pro_courtesy_apps (app_no, user_id, type_code, basis_type, basis_no, note, status, created_at, updated_at, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending_review', ?, ?, ?)`
    )
    .run(
      appNo,
      req.user.id,
      typeCode,
      basisType,
      String(req.body?.basisNo || '').trim().toUpperCase().slice(0, 40),
      String(req.body?.note || '').trim().slice(0, 500),
      ts,
      ts,
      ts
    );
  notify(req.user.id, 'courtesy_submitted', { no: appNo, hours: getConfigInt('review_hours_hint', 48) }, { appNo });
  audit(req.user, 'courtesy_submit', 'courtesy', appNo, { typeCode, basisType, basisStatus: basis.status });
  res.status(201).json({ application: serializeCourtesy(db.prepare('SELECT * FROM pro_courtesy_apps WHERE id = ?').get(info.lastInsertRowid)) });
});

router.post('/courtesy/applications/:id/cancel', (req, res) => {
  const row = db.prepare('SELECT * FROM pro_courtesy_apps WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Courtesy application not found');
  if (!['pending_review', 'approved'].includes(row.status)) throw conflict('EVT_INVALID_STATE', 'Cannot cancel now');
  db.prepare("UPDATE pro_courtesy_apps SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now(), row.id);
  audit(req.user, 'courtesy_cancel', 'courtesy', row.app_no, { previousStatus: row.status });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Messages / support
// ---------------------------------------------------------------------------

router.get('/messages', (req, res) => {
  const archived = req.query.archived === '1' ? 1 : 0;
  const rows = db
    .prepare('SELECT * FROM pro_messages WHERE user_id = ? AND archived = ? ORDER BY id DESC LIMIT 100')
    .all(req.user.id, archived);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM pro_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  res.json({ items: rows.map(serializeMessage), unread });
});

router.post('/messages/:id/read', (req, res) => {
  db.prepare('UPDATE pro_messages SET read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/archive', (req, res) => {
  db.prepare('UPDATE pro_messages SET archived = 1, read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.get('/support', (req, res) => {
  const rows = db.prepare('SELECT * FROM pro_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  res.json({ items: rows });
});

router.post('/support', (req, res) => {
  consumeRateLimit(actorKey(req), 'protocol:support');
  const subject = String(req.body?.subject || '').trim().slice(0, 100);
  const body = String(req.body?.body || '').trim().slice(0, 1000);
  if (!subject || !body) throw badRequest('EVT_FIELD_REQUIRED', 'subject and body are required');
  const ts = now();
  db.prepare('INSERT INTO pro_tickets (user_id, subject, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id,
    subject,
    body,
    ts,
    ts
  );
  audit(req.user, 'ticket_create', 'ticket', '', { subject });
  res.status(201).json({ ok: true });
});

// ---------------------------------------------------------------------------
// Privacy: anonymise personal data, keep numbers/status trail for audit
// ---------------------------------------------------------------------------

router.post('/privacy/erase', (req, res) => {
  const active = db
    .prepare(
      "SELECT COUNT(*) AS n FROM pro_registrations WHERE user_id = ? AND status IN ('pending_review','approved','waitlisted','checked_in')"
    )
    .get(req.user.id).n;
  if (active > 0) throw badRequest('EVT_ERASE_BLOCKED', 'Cancel active registrations before requesting deletion');
  const hosts = db
    .prepare("SELECT COUNT(*) AS n FROM pro_hosts WHERE user_id = ? AND status IN ('pending_review','certified','frozen')")
    .get(req.user.id).n;
  if (hosts > 0) throw badRequest('EVT_ERASE_BLOCKED', 'Active host certifications must be revoked first');
  for (const m of db.prepare('SELECT * FROM pro_materials WHERE user_id = ?').all(req.user.id)) deleteMaterialFile(m);
  db.prepare('DELETE FROM pro_materials WHERE user_id = ?').run(req.user.id);
  db.prepare(
    `UPDATE pro_registrations SET nickname = '', contact = '', identity_no = '', companions = '[]', note = '',
       invitation_no = '', updated_at = ? WHERE user_id = ?`
  ).run(now(), req.user.id);
  db.prepare(
    "UPDATE pro_hosts SET name = '', contact_nickname = '', contact = '', intro = '', updated_at = ? WHERE user_id = ?"
  ).run(now(), req.user.id);
  db.prepare("UPDATE pro_courtesy_apps SET basis_no = '', note = '', updated_at = ? WHERE user_id = ?").run(now(), req.user.id);
  db.prepare("UPDATE pro_passes SET holder_name = '', updated_at = ? WHERE user_id = ?").run(now(), req.user.id);
  db.prepare("UPDATE pro_invitations SET invitee_name = '', note = '', updated_at = ? WHERE invitee_user_id = ?").run(now(), req.user.id);
  db.prepare('UPDATE pro_messages SET archived = 1, read = 1 WHERE user_id = ?').run(req.user.id);
  audit(req.user, 'privacy_erase', 'user', req.user.id, {});
  res.json({ ok: true });
});

router.get('/risk', (req, res) => {
  res.json(riskSummary(req.user.id));
});

// ---------------------------------------------------------------------------
// Printable document helper (invitation / pass)
// ---------------------------------------------------------------------------

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printDocument({ title, no, qr, rows, locale = 'zh-CN' }) {
  const lang = locale === 'zh-TW' ? 'zh-TW' : 'zh-CN';
  const office = locale === 'zh-TW' ? '奶龍國皇家禮賓與活動署' : '奶龙国皇家礼宾与活动署';
  const qrLabel = locale === 'zh-TW' ? '驗真 QR 碼' : '验真二维码';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(no)}</title>
<style>
  body{margin:0;padding:32px;background:#f7f3df;color:#725d42;font-family:"Noto Sans SC",system-ui,sans-serif}
  .doc{position:relative;max-width:720px;margin:0 auto;background:#fffdf2;border:2px solid #19c8b9;border-radius:24px;padding:32px;overflow:hidden}
  h1{font-size:24px;margin:0 0 4px}
  .office{font-size:12px;color:#8f734f;margin-bottom:16px}
  .no{font-size:18px;font-weight:800;letter-spacing:1px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 24px}
  .label{font-size:12px;color:#8f734f}
  .value{font-size:15px;font-weight:600}
  .qr{display:flex;gap:20px;align-items:center;margin-top:24px}
  .qr img{width:160px;height:160px;border-radius:12px;background:#fff}
  @media print{body{background:#fff;padding:0}.doc{border-color:#19c8b9}}
</style></head><body><div class="doc">
<h1>${esc(title)}</h1><div class="office">${office}</div>
<div class="no">${esc(no)}</div>
<div class="grid">${rows
    .map(([label, value]) => `<div><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`)
    .join('')}</div>
<div class="qr"><img src="${qr}" alt="verify"><div><div class="label">${qrLabel}</div></div></div>
</div></body></html>`;
}

function eventCountsApproved(eventId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM pro_registrations WHERE event_id = ? AND status IN ('approved','checked_in','finished')")
    .get(eventId).n;
}

export default router;