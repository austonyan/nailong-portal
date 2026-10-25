// 奶龙国皇家礼宾与活动署 — admin/officer API.
// Queue isolation by permission: 活动审核员 (evt:review) only sees registration,
// host and courtesy queues; 签到员 (evt:checkin) only sees check-in; config,
// events, invitations, passes, verify, risk, stats and audit need evt:manage.
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate } from '../auth.js';
import { badRequest, conflict, forbidden, notFound } from '../http.js';
import { ensureProtocolSchema, getConfig, getConfigInt, setConfig } from './schema.js';
import {
  assertTransition,
  audit,
  eventCounts,
  issuePass,
  makeToken,
  makeUniqueNo,
  notify,
  notifyEventAttendees,
  pageParams,
  serializeCourtesy,
  serializeEvent,
  serializeHost,
  serializeInvitation,
  serializeMaterial,
  serializePass,
  serializeRegistration,
  serializeType,
  sweepAll,
} from './util.js';

ensureProtocolSchema();

const router = Router();
router.use(authenticate);

const EVENT_STATUSES = ['draft', 'pending_publish', 'registration', 'registration_closed', 'ongoing', 'ended', 'cancelled'];
const REJECT_REASONS = new Set(['info_missing', 'identity_mismatch', 'duplicate', 'full', 'rule_violation', 'other']);
const HOST_REJECT_REASONS = new Set(['info_missing', 'material_invalid', 'qualification', 'duplicate', 'other']);

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw badRequest('VALIDATION_ERROR', 'Invalid date');
  return d.toISOString();
}

function staff(required) {
  return (req, _res, next) => {
    const owned = new Set(req.user?.permissions || []);
    if (!required.some((p) => owned.has(p))) {
      return next(forbidden('FORBIDDEN', `Missing permission: ${required.join(' or ')}`));
    }
    next();
  };
}

const reviewer = staff(['evt:review', 'evt:manage']);
const manager = staff(['evt:manage']);
const checker = staff(['evt:checkin', 'evt:manage']);

function str(value, max, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim().slice(0, max);
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function intBool(value) {
  return value ? 1 : 0;
}

function jsonArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, headers, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  res.send(`\uFEFF${lines.join('\r\n')}`);
}

function eventById(id) {
  return db.prepare('SELECT * FROM pro_events WHERE id = ? AND deleted_at IS NULL').get(Number(id));
}

function requireEvent(id) {
  const event = eventById(id);
  if (!event) throw notFound('Event not found');
  return event;
}

function userBrief(userId) {
  const u = db.prepare('SELECT id, username, display_name, status FROM users WHERE id = ?').get(userId);
  return u ? { id: u.id, username: u.username, displayName: u.display_name, status: u.status } : null;
}

function registrationFull(row) {
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(row.event_id);
  const user = userBrief(row.user_id);
  const pass = db.prepare('SELECT * FROM pro_passes WHERE registration_id = ? ORDER BY id DESC LIMIT 1').get(row.id);
  const materials = db
    .prepare("SELECT * FROM pro_materials WHERE owner_type = 'registration' AND owner_id = ? ORDER BY id")
    .all(row.id)
    .map(serializeMaterial);
  return {
    ...serializeRegistration(row),
    event: serializeEvent(event),
    user,
    pass: serializePass(pass),
    materials,
  };
}

function hostFull(row) {
  const user = userBrief(row.user_id);
  const materials = db
    .prepare("SELECT * FROM pro_materials WHERE owner_type = 'host' AND owner_id = ? ORDER BY id")
    .all(row.id)
    .map(serializeMaterial);
  return { ...serializeHost(row), user, materials };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

router.get('/overview', reviewer, (req, res) => {
  sweepAll();
  res.json({
    events: db.prepare("SELECT COUNT(*) AS n FROM pro_events WHERE deleted_at IS NULL AND status != 'cancelled'").get().n,
    openEvents: db.prepare("SELECT COUNT(*) AS n FROM pro_events WHERE deleted_at IS NULL AND status = 'registration'").get().n,
    pendingRegistrations: db.prepare("SELECT COUNT(*) AS n FROM pro_registrations WHERE status = 'pending_review'").get().n,
    pendingHosts: db.prepare("SELECT COUNT(*) AS n FROM pro_hosts WHERE status = 'pending_review' AND deleted_at IS NULL").get().n,
    pendingCourtesy: db.prepare("SELECT COUNT(*) AS n FROM pro_courtesy_apps WHERE status = 'pending_review'").get().n,
    validInvitations: db.prepare("SELECT COUNT(*) AS n FROM pro_invitations WHERE status = 'valid'").get().n,
    validPasses: db.prepare("SELECT COUNT(*) AS n FROM pro_passes WHERE status = 'pending'").get().n,
    unreadMessages: db.prepare('SELECT COUNT(*) AS n FROM pro_messages WHERE user_id = ? AND read = 0 AND archived = 0').get(req.user.id).n,
    disclaimerVersion: getConfig('disclaimer_version'),
  });
});

// ---------------------------------------------------------------------------
// Event types + event publishing (evt:manage)
// ---------------------------------------------------------------------------

router.get('/types', manager, (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM pro_event_types ORDER BY sort_order, id').all().map(serializeType) });
});

router.post('/types', manager, (req, res) => {
  const code = str(req.body?.code, 30).toUpperCase();
  if (!/^[A-Z0-9_]{2,30}$/.test(code)) throw badRequest('VALIDATION_ERROR', 'Bad type code');
  if (db.prepare('SELECT id FROM pro_event_types WHERE code = ?').get(code)) throw conflict('EVT_DUPLICATE', 'Type code exists');
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO pro_event_types (code, name, description, guide, required_fields, materials, allow_companions, max_companions,
         default_capacity, enabled, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      code,
      str(req.body?.name, 60) || code,
      str(req.body?.description, 300),
      str(req.body?.guide, 2000),
      Array.isArray(req.body?.requiredFields) ? req.body.requiredFields.join(',') : 'nickname,contact',
      JSON.stringify(jsonArray(req.body?.materials)),
      intBool(req.body?.allowCompanions ?? true),
      Math.max(0, num(req.body?.maxCompanions, 2)),
      Math.max(1, num(req.body?.defaultCapacity, 100)),
      intBool(req.body?.enabled ?? true),
      num(req.body?.sortOrder, 99),
      ts,
      ts
    );
  audit(req.user, 'type_create', 'event_type', code, {});
  res.status(201).json({ type: serializeType(db.prepare('SELECT * FROM pro_event_types WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/types/:id', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_event_types WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Type not found');
  db.prepare(
    `UPDATE pro_event_types SET name = ?, description = ?, guide = ?, required_fields = ?, materials = ?,
       allow_companions = ?, max_companions = ?, default_capacity = ?, enabled = ?, sort_order = ?, updated_at = ? WHERE id = ?`
  ).run(
    str(req.body?.name, 60, row.name),
    str(req.body?.description, 300, row.description),
    str(req.body?.guide, 2000, row.guide),
    Array.isArray(req.body?.requiredFields) ? req.body.requiredFields.join(',') : row.required_fields,
    req.body?.materials !== undefined ? JSON.stringify(jsonArray(req.body.materials)) : row.materials,
    req.body?.allowCompanions !== undefined ? intBool(req.body.allowCompanions) : row.allow_companions,
    req.body?.maxCompanions !== undefined ? Math.max(0, num(req.body.maxCompanions, row.max_companions)) : row.max_companions,
    req.body?.defaultCapacity !== undefined ? Math.max(1, num(req.body.defaultCapacity, row.default_capacity)) : row.default_capacity,
    req.body?.enabled !== undefined ? intBool(req.body.enabled) : row.enabled,
    req.body?.sortOrder !== undefined ? num(req.body.sortOrder, row.sort_order) : row.sort_order,
    now(),
    row.id
  );
  audit(req.user, 'type_update', 'event_type', row.code, {});
  res.json({ type: serializeType(db.prepare('SELECT * FROM pro_event_types WHERE id = ?').get(row.id)) });
});

router.get('/events', manager, (req, res) => {
  sweepAll();
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (req.query.status) {
    where.push('status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.type) {
    where.push('type_code = ?');
    params.push(String(req.query.type));
  }
  if (req.query.q) {
    where.push('(title LIKE ? OR event_no LIKE ?)');
    params.push(`%${String(req.query.q).slice(0, 60)}%`, `%${String(req.query.q).slice(0, 60)}%`);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM pro_events WHERE ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM pro_events WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  res.json({ items: rows.map((e) => serializeEvent(e)), total, page, pageSize });
});

router.post('/events', manager, (req, res) => {
  const type = db.prepare('SELECT * FROM pro_event_types WHERE code = ?').get(str(req.body?.typeCode, 30));
  if (!type) throw badRequest('VALIDATION_ERROR', 'Unknown event type');
  const title = str(req.body?.title, 120);
  if (!title) throw badRequest('EVT_FIELD_REQUIRED', 'title is required');
  const startsAt = toIso(req.body?.startsAt);
  const endsAt = toIso(req.body?.endsAt);
  if (startsAt && endsAt && endsAt < startsAt) throw badRequest('EVT_TIME_RANGE', 'endsAt must be after startsAt');
  const eventNo = makeUniqueNo('prefix.event', 'pro_events', 'event_no');
  const ts = now();
  const capacity = Math.max(1, num(req.body?.capacity, type.default_capacity));
  const info = db
    .prepare(
      `INSERT INTO pro_events (event_no, type_code, title, subtitle, description, schedule, venue_name, venue_note,
         capacity, waitlist_enabled, status, resident_only, diplomatic_only, registration_deadline, starts_at, ends_at,
         conditions, materials, notice, cover_color, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      eventNo,
      type.code,
      title,
      str(req.body?.subtitle, 200),
      str(req.body?.description, 4000),
      JSON.stringify(jsonArray(req.body?.schedule)),
      str(req.body?.venueName, 160),
      str(req.body?.venueNote, 500),
      capacity,
      intBool(req.body?.waitlistEnabled ?? true),
      intBool(req.body?.residentOnly),
      intBool(req.body?.diplomaticOnly),
      toIso(req.body?.registrationDeadline),
      startsAt,
      endsAt,
      str(req.body?.conditions, 2000),
      JSON.stringify(jsonArray(req.body?.materials)),
      str(req.body?.notice, 1000),
      str(req.body?.coverColor, 30, 'app-teal'),
      req.user.id,
      ts,
      ts
    );
  audit(req.user, 'event_create', 'event', eventNo, { title });
  res.status(201).json({ event: serializeEvent(eventById(info.lastInsertRowid)) });
});

router.patch('/events/:id', manager, (req, res) => {
  const event = requireEvent(req.params.id);
  if (['ended', 'cancelled'].includes(event.status)) throw conflict('EVT_INVALID_STATE', 'Event is closed');
  const startsAt = req.body?.startsAt !== undefined ? toIso(req.body.startsAt) : event.starts_at;
  const endsAt = req.body?.endsAt !== undefined ? toIso(req.body.endsAt) : event.ends_at;
  if (startsAt && endsAt && endsAt < startsAt) throw badRequest('EVT_TIME_RANGE', 'endsAt must be after startsAt');
  db.prepare(
    `UPDATE pro_events SET title = ?, subtitle = ?, description = ?, schedule = ?, venue_name = ?, venue_note = ?,
       capacity = ?, waitlist_enabled = ?, resident_only = ?, diplomatic_only = ?, registration_deadline = ?,
       starts_at = ?, ends_at = ?, conditions = ?, materials = ?, notice = ?, cover_color = ?, updated_at = ? WHERE id = ?`
  ).run(
    str(req.body?.title, 120, event.title),
    str(req.body?.subtitle, 200, event.subtitle),
    str(req.body?.description, 4000, event.description),
    req.body?.schedule !== undefined ? JSON.stringify(jsonArray(req.body.schedule)) : event.schedule,
    str(req.body?.venueName, 160, event.venue_name),
    str(req.body?.venueNote, 500, event.venue_note),
    req.body?.capacity !== undefined ? Math.max(1, num(req.body.capacity, event.capacity)) : event.capacity,
    req.body?.waitlistEnabled !== undefined ? intBool(req.body.waitlistEnabled) : event.waitlist_enabled,
    req.body?.residentOnly !== undefined ? intBool(req.body.residentOnly) : event.resident_only,
    req.body?.diplomaticOnly !== undefined ? intBool(req.body.diplomaticOnly) : event.diplomatic_only,
    req.body?.registrationDeadline !== undefined
      ? toIso(req.body.registrationDeadline)
      : event.registration_deadline,
    startsAt,
    endsAt,
    str(req.body?.conditions, 2000, event.conditions),
    req.body?.materials !== undefined ? JSON.stringify(jsonArray(req.body.materials)) : event.materials,
    str(req.body?.notice, 1000, event.notice),
    str(req.body?.coverColor, 30, event.cover_color),
    now(),
    event.id
  );
  audit(req.user, 'event_update', 'event', event.event_no, {});
  if (event.status !== 'draft') {
    notifyEventAttendees(event.id, 'event_changed', { event: event.title, note: '活动信息已更新，请查看活动详情。' });
  }
  res.json({ event: serializeEvent(eventById(event.id)) });
});

router.post('/events/:id/status', manager, (req, res) => {
  const event = requireEvent(req.params.id);
  const to = String(req.body?.status || '');
  if (!EVENT_STATUSES.includes(to)) throw badRequest('VALIDATION_ERROR', 'Unknown event status');
  assertTransition('event', event.status, to);
  const ts = now();
  const reason = str(req.body?.reason, 500);
  if (to === 'cancelled') {
    db.prepare("UPDATE pro_events SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, updated_at = ? WHERE id = ?").run(
      ts,
      reason,
      ts,
      event.id
    );
    const active = db
      .prepare("SELECT id, user_id, reg_no FROM pro_registrations WHERE event_id = ? AND status IN ('pending_review','approved','waitlisted','checked_in')")
      .all(event.id);
    for (const reg of active) {
      db.prepare("UPDATE pro_registrations SET status = 'cancelled', updated_at = ? WHERE id = ?").run(ts, reg.id);
      db.prepare("UPDATE pro_passes SET status = 'voided', void_reason = 'event_cancelled', updated_at = ? WHERE registration_id = ?").run(ts, reg.id);
      notify(reg.user_id, 'event_cancelled', { event: event.title, reason: reason || '活动安排调整' }, { eventId: event.id });
    }
    notifyEventAttendees(event.id, 'event_cancelled', { event: event.title, reason: reason || '活动安排调整' });
    audit(req.user, 'event_cancel', 'event', event.event_no, { reason, affected: active.length });
  } else {
    const publishedAt = to === 'registration' ? ts : event.published_at;
    db.prepare('UPDATE pro_events SET status = ?, published_at = ?, updated_at = ? WHERE id = ?').run(to, publishedAt, ts, event.id);
    audit(req.user, 'event_status', 'event', event.event_no, { from: event.status, to, reason });
    if (to === 'registration') notifyEventAttendees(event.id, 'event_changed', { event: event.title, note: '活动已开放/恢复报名。' });
  }
  res.json({ event: serializeEvent(eventById(event.id)) });
});

router.delete('/events/:id', manager, (req, res) => {
  const event = requireEvent(req.params.id);
  if (!['draft', 'cancelled'].includes(event.status)) throw conflict('EVT_INVALID_STATE', 'Only draft or cancelled events can be deleted');
  db.prepare('UPDATE pro_events SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), event.id);
  audit(req.user, 'event_delete', 'event', event.event_no, {});
  res.json({ ok: true });
});

router.get('/events/:id', manager, (req, res) => {
  sweepAll();
  const event = requireEvent(req.params.id);
  const notices = db.prepare('SELECT * FROM pro_event_notices WHERE event_id = ? ORDER BY id DESC').all(event.id);
  const byStatus = db
    .prepare('SELECT status, COUNT(*) AS n FROM pro_registrations WHERE event_id = ? GROUP BY status')
    .all(event.id);
  res.json({ event: serializeEvent(event), notices, registrations: byStatus });
});

router.post('/events/:id/notices', manager, (req, res) => {
  const event = requireEvent(req.params.id);
  const title = str(req.body?.title, 120);
  const body = str(req.body?.body, 2000);
  if (!title || !body) throw badRequest('EVT_FIELD_REQUIRED', 'title and body are required');
  const level = ['info', 'change', 'cancel'].includes(req.body?.level) ? req.body.level : 'info';
  const info = db
    .prepare('INSERT INTO pro_event_notices (event_id, title, body, level, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(event.id, title, body, level, now());
  if (level !== 'info') notifyEventAttendees(event.id, 'event_changed', { event: event.title, note: title });
  audit(req.user, 'event_notice', 'event', event.event_no, { level, title });
  res.status(201).json({ notice: db.prepare('SELECT * FROM pro_event_notices WHERE id = ?').get(info.lastInsertRowid) });
});

// ---------------------------------------------------------------------------
// Registration review queue (evt:review)
// ---------------------------------------------------------------------------

router.get('/registrations', reviewer, (req, res) => {
  sweepAll();
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const where = ['1 = 1'];
  const params = [];
  if (req.query.status) {
    where.push('r.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.eventId) {
    where.push('r.event_id = ?');
    params.push(Number(req.query.eventId));
  }
  if (req.query.identityType) {
    where.push('r.identity_type = ?');
    params.push(String(req.query.identityType));
  }
  if (req.query.q) {
    where.push('(r.reg_no LIKE ? OR r.nickname LIKE ? OR u.username LIKE ?)');
    const like = `%${String(req.query.q).slice(0, 60)}%`;
    params.push(like, like, like);
  }
  const clause = where.join(' AND ');
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM pro_registrations r JOIN users u ON u.id = r.user_id WHERE ${clause}`)
    .get(...params).n;
  const rows = db
    .prepare(
      `SELECT r.*, u.username, u.display_name, e.title AS event_title, e.event_no AS event_no, e.starts_at AS event_starts_at
       FROM pro_registrations r JOIN users u ON u.id = r.user_id JOIN pro_events e ON e.id = r.event_id
       WHERE ${clause} ORDER BY CASE r.status WHEN 'pending_review' THEN 0 WHEN 'waitlisted' THEN 1 ELSE 2 END, r.submitted_at, r.id
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((r) => ({
      ...serializeRegistration(r),
      username: r.username,
      displayName: r.display_name,
      eventTitle: r.event_title,
      eventNo: r.event_no,
      eventStartsAt: r.event_starts_at,
    })),
    total,
    page,
    pageSize,
  });
});

router.get('/registrations/:id', reviewer, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Registration not found');
  res.json({ registration: registrationFull(row) });
});

const APPROVABLE = new Set(['pending_review', 'waitlisted']);

function approveRegistration(reg, actor, note = '') {
  const event = requireEvent(reg.event_id);
  if (!APPROVABLE.has(reg.status)) throw conflict('EVT_INVALID_STATE', 'Registration cannot be approved now');
  if (['cancelled', 'ended'].includes(event.status)) throw conflict('EVT_INVALID_STATE', 'Event is closed');
  const counts = eventCounts(event.id);
  if (counts.approved >= event.capacity) {
    if (!event.waitlist_enabled) throw conflict('EVT_EVENT_FULL', 'Event is full and waitlist is disabled');
    if (reg.status !== 'waitlisted') {
      db.prepare("UPDATE pro_registrations SET status = 'waitlisted', review_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?").run(
        note, actor.id, now(), now(), reg.id
      );
    }
    notify(reg.user_id, 'registration_waitlisted', { no: reg.reg_no, event: event.title }, { eventId: event.id });
    audit(actor, 'registration_waitlist', 'registration', reg.reg_no, { reason: 'capacity_full' });
    return { waitlisted: true };
  }
  db.prepare(
    "UPDATE pro_registrations SET status = 'approved', reject_code = NULL, reject_comment = '', review_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(note, actor.id, now(), now(), reg.id);
  const fresh = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(reg.id);
  const pass = issuePass(fresh);
  notify(reg.user_id, 'registration_approved', { no: reg.reg_no, event: event.title, passNo: pass.pass_no }, { eventId: event.id, passNo: pass.pass_no });
  audit(actor, 'registration_approve', 'registration', reg.reg_no, { passNo: pass.pass_no });
  return { waitlisted: false, pass };
}

router.post('/registrations/:id/approve', reviewer, (req, res) => {
  const reg = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(Number(req.params.id));
  if (!reg) throw notFound('Registration not found');
  const result = approveRegistration(reg, req.user, str(req.body?.comment, 500));
  res.json({ ...result, registration: registrationFull(db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(reg.id)) });
});

router.post('/registrations/:id/waitlist', reviewer, (req, res) => {
  const reg = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(Number(req.params.id));
  if (!reg) throw notFound('Registration not found');
  assertTransition('registration', reg.status, 'waitlisted');
  db.prepare(
    "UPDATE pro_registrations SET status = 'waitlisted', review_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(str(req.body?.comment, 500), req.user.id, now(), now(), reg.id);
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(reg.event_id);
  notify(reg.user_id, 'registration_waitlisted', { no: reg.reg_no, event: event?.title ?? '' }, { eventId: reg.event_id });
  audit(req.user, 'registration_waitlist', 'registration', reg.reg_no, {});
  res.json({ registration: registrationFull(db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(reg.id)) });
});

router.post('/registrations/:id/reject', reviewer, (req, res) => {
  const reg = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(Number(req.params.id));
  if (!reg) throw notFound('Registration not found');
  assertTransition('registration', reg.status, 'rejected');
  const reason = REJECT_REASONS.has(req.body?.reasonCode) ? req.body.reasonCode : 'other';
  const comment = str(req.body?.comment, 500);
  db.prepare(
    "UPDATE pro_registrations SET status = 'rejected', reject_code = ?, reject_comment = ?, review_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(reason, comment, comment, req.user.id, now(), now(), reg.id);
  notify(reg.user_id, 'registration_rejected', { no: reg.reg_no, reason, comment }, { eventId: reg.event_id });
  audit(req.user, 'registration_reject', 'registration', reg.reg_no, { reason, comment });
  res.json({ ok: true });
});

router.post('/registrations/:id/promote', reviewer, (req, res) => {
  const reg = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(Number(req.params.id));
  if (!reg) throw notFound('Registration not found');
  if (reg.status !== 'waitlisted') throw conflict('EVT_INVALID_STATE', 'Only waitlisted registrations can be promoted');
  const result = approveRegistration(reg, req.user, str(req.body?.comment, 500));
  res.json({ ...result, registration: registrationFull(db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(reg.id)) });
});

// ---------------------------------------------------------------------------
// Invitations (evt:manage)
// ---------------------------------------------------------------------------

router.get('/invitations', manager, (req, res) => {
  sweepAll();
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const where = ['1 = 1'];
  const params = [];
  if (req.query.status) {
    where.push('i.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.type) {
    where.push('i.type = ?');
    params.push(String(req.query.type));
  }
  if (req.query.eventId) {
    where.push('i.event_id = ?');
    params.push(Number(req.query.eventId));
  }
  if (req.query.q) {
    where.push('(i.invite_no LIKE ? OR i.invitee_name LIKE ? OR u.username LIKE ?)');
    const like = `%${String(req.query.q).slice(0, 60)}%`;
    params.push(like, like, like);
  }
  const clause = where.join(' AND ');
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM pro_invitations i JOIN users u ON u.id = i.invitee_user_id WHERE ${clause}`)
    .get(...params).n;
  const rows = db
    .prepare(
      `SELECT i.*, u.username, u.display_name FROM pro_invitations i JOIN users u ON u.id = i.invitee_user_id
       WHERE ${clause} ORDER BY i.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((r) => ({ ...serializeInvitation(r), username: r.username, displayName: r.display_name })),
    total,
    page,
    pageSize,
  });
});

router.post('/invitations', manager, (req, res) => {
  const event = requireEvent(req.body?.eventId);
  if (['cancelled', 'ended'].includes(event.status)) throw conflict('EVT_INVALID_STATE', 'Event is closed');
  const invitee = db.prepare('SELECT * FROM users WHERE username = ? OR id = ?').get(
    String(req.body?.inviteeUsername || '').trim(),
    Number(req.body?.inviteeUserId) || 0
  );
  if (!invitee) throw notFound('Invitee not found');
  const type = ['event', 'foreign', 'resident', 'diplomatic'].includes(req.body?.type) ? req.body.type : 'event';
  if (type === 'resident' && !event.resident_only) throw badRequest('EVT_INVITATION_TYPE', 'Resident invitation requires a residents-only event');
  if (type === 'diplomatic' && !event.diplomatic_only) throw badRequest('EVT_INVITATION_TYPE', 'Diplomatic invitation requires a diplomatic event');
  const dup = db
    .prepare("SELECT * FROM pro_invitations WHERE event_id = ? AND invitee_user_id = ? AND status = 'valid'")
    .get(event.id, invitee.id);
  if (dup) throw conflict('EVT_DUPLICATE', `A valid invitation ${dup.invite_no} already exists`);
  const inviteNo = makeUniqueNo('prefix.invitation', 'pro_invitations', 'invite_no');
  const validFrom = now();
  const validUntil = req.body?.validUntil
    ? new Date(req.body.validUntil).toISOString()
    : event.ends_at || new Date(Date.now() + 14 * 86400000).toISOString();
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO pro_invitations (invite_no, event_id, inviter_id, inviter_name, invitee_user_id, invitee_name, type,
         status, response, valid_from, valid_until, token, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'valid', 'pending', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      inviteNo,
      event.id,
      req.user.id,
      req.user.display_name || '皇家礼宾与活动署',
      invitee.id,
      invitee.display_name || invitee.username,
      type,
      validFrom,
      validUntil,
      makeToken(),
      str(req.body?.note, 500),
      ts,
      ts
    );
  const inv = db.prepare('SELECT * FROM pro_invitations WHERE id = ?').get(info.lastInsertRowid);
  notify(invitee.id, 'invitation_issued', {
    no: inviteNo,
    event: event.title,
    typeName: serializeInvitation(inv).typeName,
    validUntil: validUntil.slice(0, 10),
  }, { eventId: event.id, invitationNo: inviteNo });
  audit(req.user, 'invitation_issue', 'invitation', inviteNo, { eventId: event.id, invitee: invitee.username, type });
  res.status(201).json({ invitation: serializeInvitation(inv) });
});

router.post('/invitations/:id/revoke', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_invitations WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Invitation not found');
  assertTransition('invitation', row.status, 'revoked');
  const reason = str(req.body?.reason, 300);
  db.prepare("UPDATE pro_invitations SET status = 'revoked', revoked_reason = ?, updated_at = ? WHERE id = ?").run(reason, now(), row.id);
  const event = db.prepare('SELECT title FROM pro_events WHERE id = ?').get(row.event_id);
  notify(row.invitee_user_id, 'invitation_revoked', { no: row.invite_no, event: event?.title ?? '', reason }, { eventId: row.event_id });
  audit(req.user, 'invitation_revoke', 'invitation', row.invite_no, { reason });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Passes (evt:manage)
// ---------------------------------------------------------------------------

router.get('/passes', manager, (req, res) => {
  sweepAll();
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const where = ['1 = 1'];
  const params = [];
  if (req.query.status) {
    where.push('p.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.eventId) {
    where.push('p.event_id = ?');
    params.push(Number(req.query.eventId));
  }
  if (req.query.q) {
    where.push('(p.pass_no LIKE ? OR p.holder_name LIKE ? OR u.username LIKE ?)');
    const like = `%${String(req.query.q).slice(0, 60)}%`;
    params.push(like, like, like);
  }
  const clause = where.join(' AND ');
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM pro_passes p JOIN users u ON u.id = p.user_id WHERE ${clause}`)
    .get(...params).n;
  const rows = db
    .prepare(
      `SELECT p.*, u.username, u.display_name FROM pro_passes p JOIN users u ON u.id = p.user_id
       WHERE ${clause} ORDER BY p.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((r) => ({ ...serializePass(r), username: r.username, displayName: r.display_name })),
    total,
    page,
    pageSize,
  });
});

router.get('/passes/:id', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_passes WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Pass not found');
  const reg = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(row.registration_id);
  res.json({ pass: serializePass(row), registration: serializeRegistration(reg), user: userBrief(row.user_id) });
});

router.post('/passes/:id/void', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_passes WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Pass not found');
  assertTransition('pass', row.status, 'voided');
  const reason = str(req.body?.reason, 300) || 'manual_void';
  db.prepare("UPDATE pro_passes SET status = 'voided', void_reason = ?, updated_at = ? WHERE id = ?").run(reason, now(), row.id);
  notify(row.user_id, 'pass_voided', { passNo: row.pass_no, reason }, { passNo: row.pass_no });
  audit(req.user, 'pass_void', 'pass', row.pass_no, { reason });
  res.json({ ok: true });
});

router.post('/passes/:id/reissue', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_passes WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Pass not found');
  const reg = db.prepare('SELECT * FROM pro_registrations WHERE id = ?').get(row.registration_id);
  if (!reg || reg.status !== 'approved') throw conflict('EVT_INVALID_STATE', 'Only approved registrations can receive a pass');
  const reason = str(req.body?.reason, 300) || 'reissue';
  db.prepare("UPDATE pro_passes SET status = 'voided', void_reason = ?, updated_at = ? WHERE id = ?").run(reason, now(), row.id);
  const pass = issuePass(reg, { reissuedFrom: row.pass_no });
  audit(req.user, 'pass_reissue', 'pass', pass.pass_no, { previous: row.pass_no, reason });
  res.json({ pass: serializePass(pass) });
});

// ---------------------------------------------------------------------------
// Host certification (evt:review review; evt:manage freeze/revoke/permissions)
// ---------------------------------------------------------------------------

router.get('/hosts', reviewer, (req, res) => {
  sweepAll();
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const where = ['h.deleted_at IS NULL'];
  const params = [];
  if (req.query.status) {
    where.push('h.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.q) {
    where.push('(h.host_no LIKE ? OR h.name LIKE ? OR u.username LIKE ?)');
    const like = `%${String(req.query.q).slice(0, 60)}%`;
    params.push(like, like, like);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM pro_hosts h JOIN users u ON u.id = h.user_id WHERE ${clause}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT h.*, u.username, u.display_name FROM pro_hosts h JOIN users u ON u.id = h.user_id
       WHERE ${clause} ORDER BY CASE h.status WHEN 'pending_review' THEN 0 ELSE 1 END, h.submitted_at, h.id LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((r) => ({ ...serializeHost(r), username: r.username, displayName: r.display_name })),
    total,
    page,
    pageSize,
  });
});

router.get('/hosts/:id', reviewer, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Host not found');
  res.json({ host: hostFull(row) });
});

router.post('/hosts/:id/approve', reviewer, (req, res) => {
  const host = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!host) throw notFound('Host not found');
  assertTransition('host', host.status, 'certified');
  const certNo = makeUniqueNo('prefix.host_cert', 'pro_hosts', 'cert_no');
  db.prepare(
    "UPDATE pro_hosts SET status = 'certified', cert_no = ?, review_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(certNo, str(req.body?.comment, 500), req.user.id, now(), now(), host.id);
  notify(host.user_id, 'host_approved', { no: host.host_no, name: host.name, certNo }, { hostNo: host.host_no });
  audit(req.user, 'host_approve', 'host', host.host_no, { certNo });
  res.json({ host: hostFull(db.prepare('SELECT * FROM pro_hosts WHERE id = ?').get(host.id)) });
});

router.post('/hosts/:id/reject', reviewer, (req, res) => {
  const host = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!host) throw notFound('Host not found');
  assertTransition('host', host.status, 'rejected');
  const reason = HOST_REJECT_REASONS.has(req.body?.reasonCode) ? req.body.reasonCode : 'other';
  const comment = str(req.body?.comment, 500);
  db.prepare(
    "UPDATE pro_hosts SET status = 'rejected', reject_code = ?, reject_comment = ?, review_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(reason, comment, comment, req.user.id, now(), now(), host.id);
  notify(host.user_id, 'host_rejected', { no: host.host_no, reason, comment }, { hostNo: host.host_no });
  audit(req.user, 'host_reject', 'host', host.host_no, { reason, comment });
  res.json({ ok: true });
});

router.post('/hosts/:id/supplement', reviewer, (req, res) => {
  const host = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!host) throw notFound('Host not found');
  assertTransition('host', host.status, 'supplement_required');
  const days = Math.max(1, num(req.body?.days, getConfigInt('supplement_days', 7)));
  const deadline = new Date(Date.now() + days * 86400000).toISOString();
  const note = str(req.body?.comment, 500);
  db.prepare(
    "UPDATE pro_hosts SET status = 'supplement_required', supplement_note = ?, supplement_deadline = ?, review_note = ?, updated_at = ? WHERE id = ?"
  ).run(note, deadline, note, now(), host.id);
  notify(host.user_id, 'host_supplement', { no: host.host_no, note, deadline: deadline.slice(0, 10) }, { hostNo: host.host_no });
  audit(req.user, 'host_supplement', 'host', host.host_no, { days, note });
  res.json({ ok: true });
});

router.post('/hosts/:id/freeze', manager, (req, res) => {
  const host = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!host) throw notFound('Host not found');
  assertTransition('host', host.status, 'frozen');
  db.prepare("UPDATE pro_hosts SET status = 'frozen', review_note = ?, updated_at = ? WHERE id = ?").run(
    str(req.body?.reason, 500), now(), host.id
  );
  audit(req.user, 'host_freeze', 'host', host.host_no, { reason: str(req.body?.reason, 500) });
  res.json({ ok: true });
});

router.post('/hosts/:id/unfreeze', manager, (req, res) => {
  const host = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!host) throw notFound('Host not found');
  assertTransition('host', host.status, 'certified');
  db.prepare("UPDATE pro_hosts SET status = 'certified', updated_at = ? WHERE id = ?").run(now(), host.id);
  audit(req.user, 'host_unfreeze', 'host', host.host_no, {});
  res.json({ ok: true });
});

router.post('/hosts/:id/revoke', manager, (req, res) => {
  const host = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!host) throw notFound('Host not found');
  assertTransition('host', host.status, 'revoked');
  const reason = str(req.body?.reason, 500);
  if (!reason) throw badRequest('EVT_FIELD_REQUIRED', 'revoke reason is required');
  db.prepare("UPDATE pro_hosts SET status = 'revoked', reject_comment = ?, can_publish = 0, can_invite = 0, updated_at = ? WHERE id = ?").run(
    reason, now(), host.id
  );
  audit(req.user, 'host_revoke', 'host', host.host_no, { reason });
  res.json({ ok: true });
});

router.patch('/hosts/:id/permissions', manager, (req, res) => {
  const host = db.prepare('SELECT * FROM pro_hosts WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!host) throw notFound('Host not found');
  if (host.status !== 'certified') throw conflict('EVT_INVALID_STATE', 'Only certified hosts can receive permissions');
  db.prepare('UPDATE pro_hosts SET can_publish = ?, can_invite = ?, updated_at = ? WHERE id = ?').run(
    intBool(req.body?.canPublish), intBool(req.body?.canInvite), now(), host.id
  );
  audit(req.user, 'host_permissions', 'host', host.host_no, { canPublish: !!req.body?.canPublish, canInvite: !!req.body?.canInvite });
  res.json({ host: hostFull(db.prepare('SELECT * FROM pro_hosts WHERE id = ?').get(host.id)) });
});

// ---------------------------------------------------------------------------
// Courtesy administration (review + type config)
// ---------------------------------------------------------------------------

router.get('/courtesy/types', manager, (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM pro_courtesy_types ORDER BY sort_order, id').all() });
});

router.post('/courtesy/types', manager, (req, res) => {
  const code = str(req.body?.code, 30).toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(code)) throw badRequest('VALIDATION_ERROR', 'Bad type code');
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO pro_courtesy_types (code, name, description, requirements, enabled, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      code,
      str(req.body?.name, 60) || code,
      str(req.body?.description, 300),
      str(req.body?.requirements, 500),
      intBool(req.body?.enabled ?? true),
      num(req.body?.sortOrder, 99),
      ts,
      ts
    );
  audit(req.user, 'courtesy_type_create', 'courtesy_type', code, {});
  res.status(201).json({ type: db.prepare('SELECT * FROM pro_courtesy_types WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/courtesy/types/:id', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_courtesy_types WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Courtesy type not found');
  db.prepare('UPDATE pro_courtesy_types SET name = ?, description = ?, requirements = ?, enabled = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
    str(req.body?.name, 60, row.name),
    str(req.body?.description, 300, row.description),
    str(req.body?.requirements, 500, row.requirements),
    req.body?.enabled !== undefined ? intBool(req.body.enabled) : row.enabled,
    req.body?.sortOrder !== undefined ? num(req.body.sortOrder, row.sort_order) : row.sort_order,
    now(),
    row.id
  );
  audit(req.user, 'courtesy_type_update', 'courtesy_type', row.code, {});
  res.json({ type: db.prepare('SELECT * FROM pro_courtesy_types WHERE id = ?').get(row.id) });
});

router.get('/courtesy/applications', reviewer, (req, res) => {
  sweepAll();
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const where = ['1 = 1'];
  const params = [];
  if (req.query.status) {
    where.push('c.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.q) {
    where.push('(c.app_no LIKE ? OR c.basis_no LIKE ? OR u.username LIKE ?)');
    const like = `%${String(req.query.q).slice(0, 60)}%`;
    params.push(like, like, like);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM pro_courtesy_apps c JOIN users u ON u.id = c.user_id WHERE ${clause}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT c.*, u.username, u.display_name FROM pro_courtesy_apps c JOIN users u ON u.id = c.user_id
       WHERE ${clause} ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((r) => ({ ...serializeCourtesy(r), username: r.username, displayName: r.display_name })),
    total,
    page,
    pageSize,
  });
});

router.post('/courtesy/applications/:id/approve', reviewer, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_courtesy_apps WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Courtesy application not found');
  assertTransition('courtesy', row.status, 'approved');
  const days = Math.max(1, num(req.body?.validDays, 14));
  const validUntil = new Date(Date.now() + days * 86400000).toISOString();
  const ts = now();
  db.prepare(
    "UPDATE pro_courtesy_apps SET status = 'approved', valid_until = ?, review_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(validUntil, str(req.body?.comment, 500), req.user.id, ts, ts, row.id);
  const type = db.prepare('SELECT name FROM pro_courtesy_types WHERE code = ?').get(row.type_code);
  db.prepare('INSERT INTO pro_courtesy_records (user_id, application_id, type_code, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    row.user_id, row.id, row.type_code, '礼遇申请通过', req.user.id, ts
  );
  notify(row.user_id, 'courtesy_approved', { no: row.app_no, typeName: type?.name ?? row.type_code, validUntil: validUntil.slice(0, 10) }, { appNo: row.app_no });
  audit(req.user, 'courtesy_approve', 'courtesy', row.app_no, { days });
  res.json({ ok: true });
});

router.post('/courtesy/applications/:id/reject', reviewer, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_courtesy_apps WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Courtesy application not found');
  assertTransition('courtesy', row.status, 'rejected');
  const reason = REJECT_REASONS.has(req.body?.reasonCode) ? req.body.reasonCode : 'other';
  const comment = str(req.body?.comment, 500);
  db.prepare(
    "UPDATE pro_courtesy_apps SET status = 'rejected', reject_code = ?, reject_comment = ?, review_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(reason, comment, comment, req.user.id, now(), now(), row.id);
  notify(row.user_id, 'courtesy_rejected', { no: row.app_no, reason, comment }, { appNo: row.app_no });
  audit(req.user, 'courtesy_reject', 'courtesy', row.app_no, { reason, comment });
  res.json({ ok: true });
});

router.post('/courtesy/applications/:id/mark-used', reviewer, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_courtesy_apps WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Courtesy application not found');
  assertTransition('courtesy', row.status, 'used');
  const ts = now();
  db.prepare("UPDATE pro_courtesy_apps SET status = 'used', used_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, row.id);
  db.prepare('INSERT INTO pro_courtesy_records (user_id, application_id, type_code, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    row.user_id, row.id, row.type_code, '礼遇已使用', req.user.id, ts
  );
  audit(req.user, 'courtesy_used', 'courtesy', row.app_no, {});
  res.json({ ok: true });
});

router.get('/courtesy/records', reviewer, (req, res) => {
  const { pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const rows = db
    .prepare(
      `SELECT r.*, c.app_no, t.name AS type_name, u.username, u.display_name
       FROM pro_courtesy_records r LEFT JOIN pro_courtesy_apps c ON c.id = r.application_id
       LEFT JOIN pro_courtesy_types t ON t.code = r.type_code
       JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT ? OFFSET ?`
    )
    .all(pageSize, offset);
  res.json({ items: rows });
});

// ---------------------------------------------------------------------------
// Check-in (evt:checkin)
// ---------------------------------------------------------------------------

router.get('/checkins', checker, (req, res) => {
  sweepAll();
  const { pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const where = ['1 = 1'];
  const params = [];
  if (req.query.eventId) {
    where.push('l.event_id = ?');
    params.push(Number(req.query.eventId));
  }
  if (req.query.q) {
    where.push('(p.pass_no LIKE ? OR p.holder_name LIKE ?)');
    const like = `%${String(req.query.q).slice(0, 60)}%`;
    params.push(like, like);
  }
  const clause = where.join(' AND ');
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM pro_checkin_logs l LEFT JOIN pro_passes p ON p.id = l.pass_id WHERE ${clause}`)
    .get(...params).n;
  const rows = db
    .prepare(
      `SELECT l.*, p.pass_no, p.holder_name, e.title AS event_title, u.display_name AS actor_name
       FROM pro_checkin_logs l LEFT JOIN pro_passes p ON p.id = l.pass_id LEFT JOIN pro_events e ON e.id = l.event_id
       LEFT JOIN users u ON u.id = l.actor_id WHERE ${clause} ORDER BY l.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({ items: rows, total, page: Number(req.query.page) || 1, pageSize });
});

router.post('/checkin', checker, (req, res) => {
  sweepAll();
  const passNo = str(req.body?.passNo, 60).toUpperCase();
  const token = str(req.body?.token, 64);
  const action = req.body?.action === 'out' ? 'out' : 'in';
  const pass = token
    ? db.prepare('SELECT * FROM pro_passes WHERE token = ?').get(token)
    : db.prepare('SELECT * FROM pro_passes WHERE pass_no = ?').get(passNo);
  if (!pass) throw notFound('Pass not found');
  const event = db.prepare('SELECT * FROM pro_events WHERE id = ?').get(pass.event_id);
  if (!event || event.status === 'cancelled') throw conflict('EVT_EVENT_CANCELLED', 'Event cancelled');
  const ts = now();
  if (action === 'in') {
    if (pass.status !== 'pending') throw conflict('EVT_PASS_INVALID', `Pass is ${pass.status}`);
    db.prepare("UPDATE pro_passes SET status = 'used', checked_in_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, pass.id);
    db.prepare("UPDATE pro_registrations SET status = 'checked_in', checked_in_at = ?, updated_at = ? WHERE id = ?").run(
      ts, ts, pass.registration_id
    );
    db.prepare("INSERT INTO pro_checkin_logs (pass_id, registration_id, event_id, action, source, actor_id, note, created_at) VALUES (?, ?, ?, 'in', 'manual', ?, '', ?)").run(
      pass.id, pass.registration_id, event.id, req.user.id, ts
    );
    notify(pass.user_id, 'checkin_done', { event: event.title, passNo: pass.pass_no, time: ts.replace('T', ' ').slice(0, 16) }, { passNo: pass.pass_no });
    audit(req.user, 'checkin_in', 'pass', pass.pass_no, { eventId: event.id });
  } else {
    if (pass.status !== 'used') throw conflict('EVT_PASS_INVALID', `Pass is ${pass.status}`);
    db.prepare('UPDATE pro_passes SET checked_out_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, pass.id);
    db.prepare('UPDATE pro_registrations SET checked_out_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, pass.registration_id);
    db.prepare("INSERT INTO pro_checkin_logs (pass_id, registration_id, event_id, action, source, actor_id, note, created_at) VALUES (?, ?, ?, 'out', 'manual', ?, '', ?)").run(
      pass.id, pass.registration_id, event.id, req.user.id, ts
    );
    audit(req.user, 'checkin_out', 'pass', pass.pass_no, { eventId: event.id });
  }
  res.json({ pass: serializePass(db.prepare('SELECT * FROM pro_passes WHERE id = ?').get(pass.id)) });
});

// ---------------------------------------------------------------------------
// Verify administration + risk control
// ---------------------------------------------------------------------------

router.get('/verify-logs', manager, (req, res) => {
  const { pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const where = ['1 = 1'];
  const params = [];
  if (req.query.result) {
    where.push('result = ?');
    params.push(String(req.query.result));
  }
  if (req.query.kind) {
    where.push('kind = ?');
    params.push(String(req.query.kind));
  }
  if (req.query.q) {
    where.push('query LIKE ?');
    params.push(`%${String(req.query.q).slice(0, 60)}%`);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM pro_verify_logs WHERE ${clause}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM pro_verify_logs WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ items: rows, total, page: Number(req.query.page) || 1, pageSize });
});

router.get('/blacklist', manager, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT b.*, u.username, u.display_name FROM pro_blacklist b JOIN users u ON u.id = b.user_id
       WHERE b.lifted_at IS NULL ORDER BY b.id DESC`
    )
    .all();
  res.json({ items: rows });
});

router.post('/blacklist', manager, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR id = ?').get(
    str(req.body?.username, 60),
    Number(req.body?.userId) || 0
  );
  if (!user) throw notFound('User not found');
  const reason = str(req.body?.reason, 300);
  if (!reason) throw badRequest('EVT_FIELD_REQUIRED', 'reason is required');
  const level = req.body?.level === 'block' ? 'block' : 'warn';
  const ts = now();
  db.prepare(
    `INSERT INTO pro_blacklist (user_id, reason, level, created_by, created_at, lifted_at) VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT (user_id) DO UPDATE SET reason = excluded.reason, level = excluded.level, created_by = excluded.created_by,
       created_at = excluded.created_at, lifted_at = NULL`
  ).run(user.id, reason, level, req.user.id, ts);
  audit(req.user, 'blacklist_add', 'user', user.id, { level, reason });
  res.status(201).json({ ok: true });
});

router.delete('/blacklist/:id', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_blacklist WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Blacklist entry not found');
  db.prepare('UPDATE pro_blacklist SET lifted_at = ? WHERE id = ?').run(now(), row.id);
  audit(req.user, 'blacklist_lift', 'user', row.user_id, {});
  res.json({ ok: true });
});

router.get('/tickets', manager, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, u.username, u.display_name FROM pro_tickets t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 100`
    )
    .all();
  res.json({ items: rows });
});

router.post('/tickets/:id/close', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_tickets WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Ticket not found');
  const reply = str(req.body?.reply, 1000);
  db.prepare("UPDATE pro_tickets SET status = 'closed', reply = ?, updated_at = ? WHERE id = ?").run(reply, now(), row.id);
  if (reply) notify(row.user_id, 'ticket_replied', { subject: row.subject, reply }, {});
  audit(req.user, 'ticket_close', 'ticket', row.id, { reply });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Config / notices / templates / audit
// ---------------------------------------------------------------------------

const EDITABLE_CONFIG = new Set([
  'disclaimer_text',
  'disclaimer_version',
  'watermark_text',
  'pass_statement',
  'review_hours_hint',
  'supplement_days',
  'verify_limit_per_5min',
  'max_companions',
  'max_active_registrations',
  'linkage_enabled',
  'prefix.event',
  'prefix.registration',
  'prefix.invitation',
  'prefix.pass',
  'prefix.host',
  'prefix.host_cert',
  'prefix.courtesy',
]);

router.get('/config', manager, (_req, res) => {
  const items = db.prepare('SELECT key, value, updated_at FROM pro_config ORDER BY key').all();
  res.json({ items });
});

router.patch('/config', manager, (req, res) => {
  const key = String(req.body?.key || '');
  if (!EDITABLE_CONFIG.has(key)) throw badRequest('VALIDATION_ERROR', 'Config key is not editable');
  const value = String(req.body?.value ?? '').slice(0, 4000);
  setConfig(key, value);
  audit(req.user, 'config_update', 'config', key, { value: key.includes('text') ? '[redacted]' : value });
  res.json({ ok: true });
});

router.get('/notices', manager, (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM pro_notices ORDER BY id DESC').all() });
});

router.post('/notices', manager, (req, res) => {
  const title = str(req.body?.title, 120);
  const body = str(req.body?.body, 2000);
  if (!title || !body) throw badRequest('EVT_FIELD_REQUIRED', 'title and body are required');
  const level = ['info', 'policy', 'event'].includes(req.body?.level) ? req.body.level : 'info';
  const ts = now();
  const info = db
    .prepare('INSERT INTO pro_notices (title, body, level, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
    .run(title, body, level, ts, ts);
  audit(req.user, 'notice_create', 'notice', info.lastInsertRowid, { title });
  res.status(201).json({ notice: db.prepare('SELECT * FROM pro_notices WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/notices/:id', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  db.prepare('UPDATE pro_notices SET title = ?, body = ?, level = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
    str(req.body?.title, 120, row.title),
    str(req.body?.body, 2000, row.body),
    ['info', 'policy', 'event'].includes(req.body?.level) ? req.body.level : row.level,
    req.body?.enabled !== undefined ? intBool(req.body.enabled) : row.enabled,
    now(),
    row.id
  );
  audit(req.user, 'notice_update', 'notice', row.id, {});
  res.json({ ok: true });
});

router.delete('/notices/:id', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  db.prepare('DELETE FROM pro_notices WHERE id = ?').run(row.id);
  audit(req.user, 'notice_delete', 'notice', row.id, {});
  res.json({ ok: true });
});

router.get('/templates', manager, (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM pro_message_templates ORDER BY code').all() });
});

router.patch('/templates/:code', manager, (req, res) => {
  const row = db.prepare('SELECT * FROM pro_message_templates WHERE code = ?').get(String(req.params.code));
  if (!row) throw notFound('Template not found');
  db.prepare('UPDATE pro_message_templates SET title_template = ?, body_template = ?, enabled = ?, updated_at = ? WHERE code = ?').run(
    str(req.body?.title, 200, row.title_template),
    str(req.body?.body, 1000, row.body_template),
    req.body?.enabled !== undefined ? intBool(req.body.enabled) : row.enabled,
    now(),
    row.code
  );
  audit(req.user, 'template_update', 'template', row.code, {});
  res.json({ ok: true });
});

router.get('/audit', manager, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 30 });
  const where = ['1 = 1'];
  const params = [];
  if (req.query.action) {
    where.push('action LIKE ?');
    params.push(`%${String(req.query.action).slice(0, 60)}%`);
  }
  if (req.query.q) {
    where.push('(actor_name LIKE ? OR target_id LIKE ?)');
    const like = `%${String(req.query.q).slice(0, 60)}%`;
    params.push(like, like);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM pro_audit WHERE ${clause}`).get(...params).n;
  const rows = db.prepare(`SELECT * FROM pro_audit WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset);
  res.json({ items: rows, total, page, pageSize });
});

// ---------------------------------------------------------------------------
// Stats + CSV export
// ---------------------------------------------------------------------------

function grouped(table, column, where = '') {
  return db.prepare(`SELECT ${column} AS key, COUNT(*) AS n FROM ${table} ${where} GROUP BY ${column}`).all();
}

router.get('/stats', manager, (_req, res) => {
  sweepAll();
  const regTotal = db.prepare('SELECT COUNT(*) AS n FROM pro_registrations').get().n;
  const regByStatus = Object.fromEntries(grouped('pro_registrations', 'status').map((r) => [r.key, r.n]));
  const approved = (regByStatus.approved || 0) + (regByStatus.checked_in || 0) + (regByStatus.finished || 0);
  const decided = approved + (regByStatus.rejected || 0) + (regByStatus.waitlisted || 0);
  const eventByStatus = Object.fromEntries(grouped('pro_events', 'status', 'WHERE deleted_at IS NULL').map((r) => [r.key, r.n]));
  const eventByType = db
    .prepare(
      `SELECT t.code, t.name, COUNT(e.id) AS n FROM pro_event_types t LEFT JOIN pro_events e ON e.type_code = t.code AND e.deleted_at IS NULL
       GROUP BY t.code ORDER BY t.sort_order`
    )
    .all();
  const invTotal = db.prepare('SELECT COUNT(*) AS n FROM pro_invitations').get().n;
  const invByStatus = Object.fromEntries(grouped('pro_invitations', 'status').map((r) => [r.key, r.n]));
  const hostByStatus = Object.fromEntries(grouped('pro_hosts', 'status', 'WHERE deleted_at IS NULL').map((r) => [r.key, r.n]));
  const courtesyByStatus = Object.fromEntries(grouped('pro_courtesy_apps', 'status').map((r) => [r.key, r.n]));
  const courtesyByType = db
    .prepare(
      `SELECT t.code, t.name, COUNT(c.id) AS n FROM pro_courtesy_types t LEFT JOIN pro_courtesy_apps c ON c.type_code = t.code
       GROUP BY t.code ORDER BY t.sort_order`
    )
    .all();
  const rejectReasons = db
    .prepare(
      `SELECT reject_code AS code, COUNT(*) AS n FROM pro_registrations WHERE status = 'rejected' AND reject_code IS NOT NULL
       GROUP BY reject_code ORDER BY n DESC`
    )
    .all();
  const checkins = db.prepare('SELECT COUNT(*) AS n FROM pro_checkin_logs WHERE action = ?').get('in').n;
  const verifyTotal = db.prepare('SELECT COUNT(*) AS n FROM pro_verify_logs').get().n;
  const verifyValid = db.prepare("SELECT COUNT(*) AS n FROM pro_verify_logs WHERE result = 'valid'").get().n;
  res.json({
    events: { total: Object.values(eventByStatus).reduce((a, b) => a + b, 0), byStatus: eventByStatus, byType: eventByType },
    registrations: {
      total: regTotal,
      byStatus: regByStatus,
      approvalRate: decided ? Math.round((approved / decided) * 100) : 0,
      waitlistRate: decided ? Math.round(((regByStatus.waitlisted || 0) / decided) * 100) : 0,
      rejectRate: decided ? Math.round(((regByStatus.rejected || 0) / decided) * 100) : 0,
      checkinRate: approved ? Math.round((checkins / approved) * 100) : 0,
      rejectReasons,
    },
    invitations: {
      total: invTotal,
      byStatus: invByStatus,
      usageRate: invTotal ? Math.round(((invByStatus.used || 0) / invTotal) * 100) : 0,
    },
    hosts: { total: Object.values(hostByStatus).reduce((a, b) => a + b, 0), byStatus: hostByStatus },
    courtesy: { total: Object.values(courtesyByStatus).reduce((a, b) => a + b, 0), byStatus: courtesyByStatus, byType: courtesyByType },
    verify: { total: verifyTotal, valid: verifyValid },
    checkins,
  });
});

router.get('/export/:kind', manager, (req, res) => {
  const kind = req.params.kind;
  const ts = now().slice(0, 10);
  audit(req.user, 'export_csv', 'export', kind, {});
  if (kind === 'registrations') {
    const rows = db
      .prepare(
        `SELECT r.reg_no, e.title, r.nickname, r.status, r.identity_type, r.party_size, r.submitted_at, u.username
         FROM pro_registrations r JOIN pro_events e ON e.id = r.event_id JOIN users u ON u.id = r.user_id ORDER BY r.id`
      )
      .all();
    return sendCsv(
      res,
      `protocol-registrations-${ts}.csv`,
      ['报名编号', '活动', '昵称', '状态', '身份类型', '人数', '提交时间', '账号'],
      rows.map((r) => [r.reg_no, r.title, r.nickname, r.status, r.identity_type, r.party_size, r.submitted_at, r.username])
    );
  }
  if (kind === 'events') {
    const rows = db.prepare('SELECT * FROM pro_events WHERE deleted_at IS NULL ORDER BY id').all();
    return sendCsv(
      res,
      `protocol-events-${ts}.csv`,
      ['活动编号', '名称', '类型', '状态', '名额', '开始时间', '结束时间'],
      rows.map((r) => {
        const counts = eventCounts(r.id);
        return [r.event_no, r.title, r.type_code, r.status, `${counts.approved}/${r.capacity}`, r.starts_at, r.ends_at];
      })
    );
  }
  if (kind === 'audit') {
    const rows = db.prepare('SELECT * FROM pro_audit ORDER BY id DESC LIMIT 5000').all();
    return sendCsv(
      res,
      `protocol-audit-${ts}.csv`,
      ['时间', '操作人', '操作', '对象类型', '对象编号', '详情'],
      rows.map((r) => [r.created_at, r.actor_name, r.action, r.target_type, r.target_id, r.detail])
    );
  }
  if (kind === 'verify') {
    const rows = db.prepare('SELECT * FROM pro_verify_logs ORDER BY id DESC LIMIT 5000').all();
    return sendCsv(
      res,
      `protocol-verify-${ts}.csv`,
      ['时间', '查询', '类型', '结果', 'IP'],
      rows.map((r) => [r.created_at, r.query, r.kind, r.result, r.ip])
    );
  }
  if (kind === 'checkins') {
    const rows = db
      .prepare(
        `SELECT l.*, p.pass_no, p.holder_name, e.title FROM pro_checkin_logs l
         LEFT JOIN pro_passes p ON p.id = l.pass_id LEFT JOIN pro_events e ON e.id = l.event_id ORDER BY l.id DESC LIMIT 5000`
      )
      .all();
    return sendCsv(
      res,
      `protocol-checkins-${ts}.csv`,
      ['时间', '活动', '凭证编号', '持票人', '动作', '来源'],
      rows.map((r) => [r.created_at, r.title, r.pass_no, r.holder_name, r.action, r.source])
    );
  }
  throw badRequest('VALIDATION_ERROR', 'Unknown export kind');
});

export default router;