// 皇家口岸入境署 — admin/officer API.
// Queue isolation by permission: 边检员 (imm:inspect) only ever sees the
// immigration declaration queue here; the visa-office review queue lives in a
// different service with different permissions.
import crypto from 'node:crypto';
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, notFound, readString, conflict } from '../http.js';
import { ensureImmigrationSchema, getSetting } from './schema.js';
import {
  audit,
  consumeRateLimit,
  actorKey,
  logEvent,
  makeUniqueNo,
  makeToken,
  notify,
  pageParams,
  riskSummary,
  crowding,
} from './util.js';
import { cachedCheck, checkVisa, markVisaUsed } from './visa.js';

ensureImmigrationSchema();

const router = Router();

const REJECT_REASONS = new Set(['visa_invalid', 'incomplete', 'duplicate', 'port_closed', 'other']);
const PORT_TYPES = new Set(['land', 'air', 'sea']);
const PORT_STATUSES = new Set(['open', 'closed', 'maintenance']);
const CHANNEL_TYPES = new Set(['normal', 'reserved', 'special']);
const PASS_VALID_DAYS = 14;
const STAMP_STYLES = ['wave', 'star', 'claw'];

const adminOnly = [authenticate, requirePermission('imm:admin')];
const inspector = [authenticate, requirePermission('imm:inspect')];
const verifier = [authenticate, requirePermission('imm:verify')];

// ---------------------------------------------------------------------------
// Ports & channels
// ---------------------------------------------------------------------------

function serializePort(row, withChannels = false) {
  const out = {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    openHours: row.open_hours,
    notice: row.notice,
    mapDesc: row.map_desc,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
  if (withChannels) {
    out.channels = db
      .prepare('SELECT id, name, type, description, enabled FROM im_channels WHERE port_id = ? ORDER BY id')
      .all(row.id);
  }
  return out;
}

router.get('/ports', ...adminOnly, (_req, res) => {
  const rows = db.prepare('SELECT * FROM im_ports ORDER BY sort_order, id').all();
  res.json({ items: rows.map((r) => serializePort(r, true)) });
});

router.post('/ports', ...adminOnly, (req, res) => {
  const body = req.body || {};
  const code = String(body.code || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,19}$/.test(code)) {
    throw badRequest('VALIDATION_ERROR', 'Port code must be 3-20 chars: A-Z, 0-9 or _');
  }
  const name = readString(body.name, { name: 'name', min: 2, max: 40 });
  const type = PORT_TYPES.has(body.type) ? body.type : 'land';
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO im_ports (code, name, type, status, open_hours, notice, map_desc, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 'closed', ?, ?, ?, 0, ?, ?)`
    )
    .run(code, name, type, String(body.openHours || '').slice(0, 80), String(body.notice || '').slice(0, 300),
      String(body.mapDesc || '').slice(0, 500), ts, ts);
  audit(req.user.id, 'im:port.create', 'port', code, {});
  res.status(201).json({ port: serializePort(db.prepare('SELECT * FROM im_ports WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/ports/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_ports WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Port not found');
  const body = req.body || {};
  const updates = {};
  if (body.name !== undefined) updates.name = readString(body.name, { name: 'name', min: 2, max: 40 });
  if (body.type !== undefined) {
    if (!PORT_TYPES.has(body.type)) throw badRequest('VALIDATION_ERROR', 'Invalid port type');
    updates.type = body.type;
  }
  if (body.openHours !== undefined) updates.open_hours = String(body.openHours || '').slice(0, 80);
  if (body.notice !== undefined) updates.notice = String(body.notice || '').slice(0, 300);
  if (body.mapDesc !== undefined) updates.map_desc = String(body.mapDesc || '').slice(0, 500);
  if (body.sortOrder !== undefined) updates.sort_order = Number(body.sortOrder) || 0;
  const cols = Object.keys(updates);
  if (cols.length) {
    db.prepare(`UPDATE im_ports SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`).run({
      ...updates,
      ts: now(),
      id: row.id,
    });
  }
  audit(req.user.id, 'im:port.update', 'port', row.code, { fields: cols });
  res.json({ port: serializePort(db.prepare('SELECT * FROM im_ports WHERE id = ?').get(row.id)) });
});

router.post('/ports/:id/status', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_ports WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Port not found');
  if (!PORT_STATUSES.has(req.body?.status)) throw badRequest('VALIDATION_ERROR', 'Invalid port status');
  db.prepare('UPDATE im_ports SET status = ?, updated_at = ? WHERE id = ?').run(req.body.status, now(), row.id);
  audit(req.user.id, 'im:port.status', 'port', row.code, { from: row.status, to: req.body.status });
  res.json({ port: serializePort(db.prepare('SELECT * FROM im_ports WHERE id = ?').get(row.id)) });
});

router.post('/ports/:id/channels', ...adminOnly, (req, res) => {
  const port = db.prepare('SELECT id FROM im_ports WHERE id = ?').get(Number(req.params.id));
  if (!port) throw notFound('Port not found');
  const name = readString(req.body?.name, { name: 'name', min: 2, max: 30 });
  if (!CHANNEL_TYPES.has(req.body?.type)) throw badRequest('VALIDATION_ERROR', 'Invalid channel type');
  const info = db
    .prepare('INSERT INTO im_channels (port_id, name, type, description, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(port.id, name, req.body.type, String(req.body?.description || '').slice(0, 120), req.body?.enabled === false ? 0 : 1, now());
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.patch('/channels/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_channels WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Channel not found');
  const updates = {};
  if (req.body?.name !== undefined) updates.name = readString(req.body.name, { name: 'name', min: 2, max: 30 });
  if (req.body?.description !== undefined) updates.description = String(req.body.description || '').slice(0, 120);
  if (req.body?.enabled !== undefined) updates.enabled = req.body.enabled ? 1 : 0;
  const cols = Object.keys(updates);
  if (cols.length) {
    db.prepare(`UPDATE im_channels SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({
      ...updates,
      id: row.id,
    });
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

function serializeAnnouncement(row) {
  return {
    id: row.id,
    portId: row.port_id,
    portName: row.port_name ?? null,
    title: row.title,
    body: row.body,
    level: row.level,
    status: row.status,
    publishedAt: row.published_at,
    offlineAt: row.offline_at,
    updatedAt: row.updated_at,
  };
}

const ANN_SELECT = `SELECT a.*, p.name AS port_name FROM im_announcements a
  LEFT JOIN im_ports p ON p.id = a.port_id WHERE a.deleted_at IS NULL`;

router.get('/announcements', ...adminOnly, (_req, res) => {
  const rows = db.prepare(`${ANN_SELECT} ORDER BY a.updated_at DESC`).all();
  res.json({ items: rows.map(serializeAnnouncement) });
});

function readAnnouncementFields(body) {
  const title = readString(body.title, { name: 'title', min: 2, max: 80 });
  const content = readString(body.body, { name: 'body', min: 2, max: 1000 });
  const level = ['info', 'warning', 'critical'].includes(body.level) ? body.level : 'info';
  const portId = body.portId ? Number(body.portId) : null;
  if (portId && !db.prepare('SELECT id FROM im_ports WHERE id = ?').get(portId)) {
    throw badRequest('VALIDATION_ERROR', 'Unknown portId');
  }
  return { title, body: content, level, port_id: portId };
}

router.post('/announcements', ...adminOnly, (req, res) => {
  const fields = readAnnouncementFields(req.body || {});
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO im_announcements (port_id, title, body, level, status, published_at, created_at, updated_at)
       VALUES (@port_id, @title, @body, @level, 'published', @ts, @ts, @ts)`
    )
    .run({ ...fields, ts });
  audit(req.user.id, 'im:announcement.publish', 'announcement', info.lastInsertRowid, { title: fields.title });
  const row = db.prepare(`${ANN_SELECT} AND a.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ announcement: serializeAnnouncement(row) });
});

router.patch('/announcements/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_announcements WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Announcement not found');
  const fields = readAnnouncementFields({ ...row, ...req.body });
  db.prepare('UPDATE im_announcements SET title = @title, body = @body, level = @level, port_id = @port_id, updated_at = @ts WHERE id = @id').run({
    ...fields,
    ts: now(),
    id: row.id,
  });
  audit(req.user.id, 'im:announcement.update', 'announcement', row.id, {});
  const fresh = db.prepare(`${ANN_SELECT} AND a.id = ?`).get(row.id);
  res.json({ announcement: serializeAnnouncement(fresh) });
});

router.post('/announcements/:id/offline', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_announcements WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Announcement not found');
  db.prepare("UPDATE im_announcements SET status = 'offline', offline_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), row.id);
  audit(req.user.id, 'im:announcement.offline', 'announcement', row.id, {});
  res.json({ ok: true });
});

router.delete('/announcements/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_announcements WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Announcement not found');
  db.prepare('UPDATE im_announcements SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user.id, 'im:data.delete_announcement', 'announcement', row.id, {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Review workbench (边检审核工作台)
// ---------------------------------------------------------------------------

function serializeQueueRow(row, { withRisk = false } = {}) {
  const out = {
    id: row.id,
    no: row.no,
    status: row.status,
    portCode: row.port_code,
    portName: row.port_name,
    nickname: row.nickname,
    contact: row.contact,
    purpose: row.purpose,
    stayDays: row.stay_days,
    companions: row.companions,
    visaNo: row.visa_no,
    visaResult: row.visa_result,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    rejectReason: row.reject_reason,
    supplementRequest: row.supplement_request,
  };
  if (withRisk) out.risk = riskSummary(row.user_id);
  return out;
}

function queueRow(id) {
  return db
    .prepare(
      `SELECT d.*, p.code AS port_code, p.name AS port_name FROM im_declarations d
       JOIN im_ports p ON p.id = d.port_id WHERE d.id = ? AND d.deleted_at IS NULL`
    )
    .get(id);
}

router.get('/declarations', ...inspector, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = ['d.deleted_at IS NULL'];
  const params = [];
  if (req.query.status) {
    where.push('d.status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.portId) {
    where.push('d.port_id = ?');
    params.push(Number(req.query.portId));
  }
  if (req.query.q) {
    where.push('(d.no LIKE ? OR d.nickname LIKE ? OR d.visa_no LIKE ?)');
    const q = `%${String(req.query.q).trim()}%`;
    params.push(q, q, q);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM im_declarations d WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT d.*, p.code AS port_code, p.name AS port_name FROM im_declarations d
       JOIN im_ports p ON p.id = d.port_id WHERE ${where.join(' AND ')}
       ORDER BY CASE d.status WHEN 'pending' THEN 0 WHEN 'supplement' THEN 1 ELSE 2 END, d.submitted_at ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  const counts = {};
  for (const c of db
    .prepare("SELECT status, COUNT(*) AS n FROM im_declarations WHERE deleted_at IS NULL GROUP BY status")
    .all()) {
    counts[c.status] = c.n;
  }
  res.json({ items: rows.map((r) => serializeQueueRow(r, { withRisk: true })), total, page, pageSize, counts });
});

router.get('/declarations/:id', ...inspector, (req, res) => {
  const row = queueRow(Number(req.params.id));
  if (!row) throw notFound('Declaration not found');
  const detail = serializeAdminDeclaration(row);
  detail.risk = riskSummary(row.user_id);
  if (row.visa_no) {
    detail.visaHistory = db
      .prepare('SELECT result, source, created_at FROM im_visa_checks WHERE visa_no = ? ORDER BY id DESC LIMIT 5')
      .all(row.visa_no);
    detail.visaCached = cachedCheck(row.visa_no);
  }
  res.json({ declaration: detail });
});

function serializeAdminDeclaration(row) {
  return {
    id: row.id,
    no: row.no,
    userId: row.user_id,
    portCode: row.port_code,
    portName: row.port_name,
    nickname: row.nickname,
    contact: row.contact,
    purpose: row.purpose,
    purposeNote: row.purpose_note,
    stayDays: row.stay_days,
    companions: row.companions,
    address: row.address,
    visaNo: row.visa_no,
    visaResult: row.visa_result,
    visaCheckedAt: row.visa_checked_at,
    items: JSON.parse(row.items || '[]'),
    status: row.status,
    confirmEntertainment: !!row.confirm_entertainment,
    supplementRequest: row.supplement_request,
    supplementContent: row.supplement_content,
    rejectReason: row.reject_reason,
    rejectNote: row.reject_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    events: db
      .prepare(
        `SELECT e.action, e.note, e.created_at, u.display_name AS actor
         FROM im_declaration_events e LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.declaration_id = ? ORDER BY e.id`
      )
      .all(row.id),
    attachments: db
      .prepare('SELECT id, filename, size, mime, created_at FROM im_attachments WHERE declaration_id = ? AND deleted_at IS NULL ORDER BY id')
      .all(row.id),
  };
}

router.post('/declarations/:id/approve', ...inspector, (req, res) => {
  const row = queueRow(Number(req.params.id));
  if (!row) throw notFound('Declaration not found');
  if (!['pending', 'supplement'].includes(row.status)) {
    throw conflict('IMM_INVALID_STATE', 'Only pending/supplement declarations can be approved');
  }
  const ts = now();
  const validUntil = new Date(Date.now() + PASS_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const codeNo = makeUniqueNo('PC', 'im_pass_codes', 'code_no');
  const approve = db.transaction(() => {
    db.prepare("UPDATE im_declarations SET status = 'approved', reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?").run(
      ts,
      req.user.id,
      ts,
      row.id
    );
    db.prepare(
      `INSERT INTO im_pass_codes (declaration_id, user_id, port_id, code_no, token, status, valid_until, created_at)
       VALUES (?, ?, ?, ?, ?, 'unused', ?, ?)`
    ).run(row.id, row.user_id, row.port_id, codeNo, makeToken(), validUntil, ts);
    logEvent(row.id, 'approve', req.user.id, String(req.body?.note || '').slice(0, 200));
  });
  approve();
  notify(row.user_id, 'approved', { no: row.no, validUntil }, { declarationNo: row.no });
  notify(row.user_id, 'pass_code', { no: row.no, codeNo }, { declarationNo: row.no, codeNo });
  audit(req.user.id, 'im:declaration.approve', 'declaration', row.no, { codeNo });
  res.json({ declaration: serializeAdminDeclaration(queueRow(row.id)) });
});

router.post('/declarations/:id/reject', ...inspector, (req, res) => {
  const row = queueRow(Number(req.params.id));
  if (!row) throw notFound('Declaration not found');
  if (!['pending', 'supplement'].includes(row.status)) {
    throw conflict('IMM_INVALID_STATE', 'Only pending/supplement declarations can be rejected');
  }
  const reason = String(req.body?.reason || '');
  if (!REJECT_REASONS.has(reason)) throw badRequest('VALIDATION_ERROR', 'Invalid reject reason');
  const note = String(req.body?.note || '').trim().slice(0, 300);
  const ts = now();
  db.prepare(
    "UPDATE im_declarations SET status = 'rejected', reject_reason = ?, reject_note = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?"
  ).run(reason, note, ts, req.user.id, ts, row.id);
  logEvent(row.id, 'reject', req.user.id, `${reason}${note ? ` - ${note}` : ''}`);
  notify(row.user_id, 'rejected', { no: row.no, reason, note: note || '如有疑问请联系管理员。' }, { declarationNo: row.no });
  audit(req.user.id, 'im:declaration.reject', 'declaration', row.no, { reason });
  res.json({ declaration: serializeAdminDeclaration(queueRow(row.id)) });
});

router.post('/declarations/:id/supplement', ...inspector, (req, res) => {
  const row = queueRow(Number(req.params.id));
  if (!row) throw notFound('Declaration not found');
  if (row.status !== 'pending') {
    throw conflict('IMM_INVALID_STATE', 'Only pending declarations can be sent for supplements');
  }
  const note = readString(req.body?.note, { name: 'note', min: 2, max: 300 });
  const ts = now();
  db.prepare("UPDATE im_declarations SET status = 'supplement', supplement_request = ?, updated_at = ? WHERE id = ?").run(note, ts, row.id);
  logEvent(row.id, 'require_supplement', req.user.id, note);
  notify(row.user_id, 'supplement', { no: row.no, note }, { declarationNo: row.no });
  audit(req.user.id, 'im:declaration.supplement', 'declaration', row.no, {});
  res.json({ declaration: serializeAdminDeclaration(queueRow(row.id)) });
});

// ---------------------------------------------------------------------------
// Pass code verification (通关码核验)
// ---------------------------------------------------------------------------

router.get('/pass-codes', ...verifier, (req, res) => {
  const codeNo = String(req.query.q || '').trim().toUpperCase();
  if (!codeNo) return res.json({ items: [] });
  const rows = db
    .prepare(
      `SELECT pc.id, pc.code_no, pc.status, pc.valid_until, pc.used_at, pc.void_reason, pc.created_at,
              d.no AS declaration_no, d.nickname, d.status AS declaration_status, p.name AS port_name
       FROM im_pass_codes pc
       JOIN im_declarations d ON d.id = pc.declaration_id
       JOIN im_ports p ON p.id = pc.port_id
       WHERE UPPER(pc.code_no) = ? LIMIT 5`
    )
    .all(codeNo);
  res.json({
    items: rows.map((r) => ({ ...r, effectiveStatus: r.status === 'unused' && r.valid_until < now() ? 'expired' : r.status })),
  });
});

router.get('/pass-checks', ...verifier, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const total = db.prepare('SELECT COUNT(*) AS n FROM im_pass_checks').get().n;
  const rows = db
    .prepare(
      `SELECT c.*, u.display_name AS officer FROM im_pass_checks c
       LEFT JOIN users u ON u.id = c.officer_id ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(pageSize, offset);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      codeNo: r.code_no,
      result: r.result,
      note: r.note,
      officer: r.officer,
      createdAt: r.created_at,
    })),
    total,
    page,
    pageSize,
  });
});

function logPassCheck(codeNo, result, officerId, note = '', passCodeId = null) {
  db.prepare(
    'INSERT INTO im_pass_checks (pass_code_id, code_no, result, officer_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(passCodeId, codeNo, result, officerId ?? null, note, now());
}

router.post('/pass-codes/verify', ...verifier, (req, res) => {
  consumeRateLimit(actorKey(req), 'im:pass_verify');
  const codeNo = readString(req.body?.codeNo, { name: 'codeNo', min: 4, max: 32 }).toUpperCase();
  const row = db
    .prepare(
      `SELECT pc.*, d.no AS declaration_no, d.status AS declaration_status, d.stay_days, d.nickname, d.user_id, d.visa_no, p.status AS port_status, p.name AS port_name
       FROM im_pass_codes pc
       JOIN im_declarations d ON d.id = pc.declaration_id
       JOIN im_ports p ON p.id = pc.port_id
       WHERE UPPER(pc.code_no) = ?`
    )
    .get(codeNo);
  if (!row) {
    logPassCheck(codeNo, 'unknown', req.user.id);
    return res.json({ result: 'unknown' });
  }
  const effective = row.status === 'unused' && row.valid_until < now() ? 'expired' : row.status;
  if (effective !== 'unused') {
    logPassCheck(row.code_no, effective, req.user.id, '', row.id);
    return res.json({ result: effective, codeNo: row.code_no, declarationNo: row.declaration_no });
  }
  if (row.port_status !== 'open') {
    logPassCheck(row.code_no, 'port_closed', req.user.id, '', row.id);
    return res.json({ result: 'port_closed', codeNo: row.code_no, declarationNo: row.declaration_no });
  }
  // 签注联动预留:核验时复检签注,注销/过期后自动拦截。
  if (row.visa_no) {
    const check = checkVisa(row.visa_no, { id: row.user_id });
    if (check.result !== 'valid') {
      logPassCheck(row.code_no, 'visa_blocked', req.user.id, check.result, row.id);
      return res.json({ result: 'visa_blocked', visaResult: check.result, codeNo: row.code_no, declarationNo: row.declaration_no });
    }
  }

  const ts = now();
  const entryNo = makeUniqueNo('EN', 'im_entry_records');
  const stampStyle = STAMP_STYLES[crypto.randomInt(STAMP_STYLES.length)];
  const verifyTx = db.transaction(() => {
    db.prepare("UPDATE im_pass_codes SET status = 'used', used_at = ?, used_by = ? WHERE id = ?").run(ts, req.user.id, row.id);
    const info = db
      .prepare(
        `INSERT INTO im_entry_records (no, user_id, declaration_id, port_id, visa_no, entry_date, stay_days, stamp_style, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'entered', ?, ?, ?)`
      )
      .run(entryNo, row.user_id, row.declaration_id, row.port_id, row.visa_no, ts.slice(0, 10), row.stay_days, stampStyle, req.user.id, ts, ts);
    db.prepare("UPDATE im_declarations SET status = 'entered', updated_at = ? WHERE id = ?").run(ts, row.declaration_id);
    logEvent(row.declaration_id, 'enter', req.user.id, `入境盖章 ${entryNo}`);
    markVisaUsed(row.visa_no, req.user.id, row.declaration_no);
    return info.lastInsertRowid;
  });
  verifyTx();
  logPassCheck(row.code_no, 'accepted', req.user.id, `入境记录 ${entryNo}`, row.id);
  audit(req.user.id, 'im:pass.verify', 'pass_code', row.code_no, { entryNo, declarationNo: row.declaration_no });
  notify(
    row.user_id,
    'entry_record',
    { no: row.declaration_no, date: ts.slice(0, 10), recordNo: entryNo },
    { declarationNo: row.declaration_no, recordNo: entryNo }
  );
  res.json({
    result: 'accepted',
    codeNo: row.code_no,
    declarationNo: row.declaration_no,
    entryRecordNo: entryNo,
    stampStyle,
    portName: row.port_name,
  });
});

router.post('/pass-codes/:id/void', ...verifier, (req, res) => {
  const row = db.prepare('SELECT * FROM im_pass_codes WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Pass code not found');
  if (row.status !== 'unused') throw conflict('IMM_INVALID_STATE', 'Only unused pass codes can be voided');
  const reason = readString(req.body?.reason, { name: 'reason', min: 2, max: 120 });
  db.prepare("UPDATE im_pass_codes SET status = 'voided', voided_at = ?, void_reason = ? WHERE id = ?").run(now(), reason, row.id);
  logPassCheck(row.code_no, 'voided', req.user.id, reason, row.id);
  audit(req.user.id, 'im:pass.void', 'pass_code', row.code_no, { reason });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Records management
// ---------------------------------------------------------------------------

router.get('/records', ...adminOnly, (req, res) => {
  const type = req.query.type === 'exit' ? 'exit' : 'entry';
  const { page, pageSize, offset } = pageParams(req.query);
  if (type === 'exit') {
    const total = db.prepare('SELECT COUNT(*) AS n FROM im_exit_records WHERE deleted_at IS NULL').get().n;
    const rows = db
      .prepare(
        `SELECT xr.*, u.display_name AS traveler, er.no AS entry_no, p.name AS port_name
         FROM im_exit_records xr
         JOIN im_entry_records er ON er.id = xr.entry_record_id
         JOIN im_ports p ON p.id = xr.port_id
         JOIN users u ON u.id = xr.user_id
         WHERE xr.deleted_at IS NULL ORDER BY xr.exit_date DESC, xr.id DESC LIMIT ? OFFSET ?`
      )
      .all(pageSize, offset);
    return res.json({
      type,
      total,
      page,
      pageSize,
      items: rows.map((r) => ({
        id: r.id, no: r.no, traveler: r.traveler, entryNo: r.entry_no, portName: r.port_name,
        exitDate: r.exit_date, createdAt: r.created_at,
      })),
    });
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM im_entry_records WHERE deleted_at IS NULL').get().n;
  const rows = db
    .prepare(
      `SELECT er.*, u.display_name AS traveler, d.no AS declaration_no, p.name AS port_name
       FROM im_entry_records er
       JOIN users u ON u.id = er.user_id
       JOIN im_declarations d ON d.id = er.declaration_id
       JOIN im_ports p ON p.id = er.port_id
       WHERE er.deleted_at IS NULL ORDER BY er.entry_date DESC, er.id DESC LIMIT ? OFFSET ?`
    )
    .all(pageSize, offset);
  res.json({
    type,
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.id, no: r.no, traveler: r.traveler, declarationNo: r.declaration_no, portName: r.port_name,
      visaNo: r.visa_no, entryDate: r.entry_date, stayDays: r.stay_days, stampStyle: r.stamp_style,
      status: r.status, note: r.note,
    })),
  });
});

// 记录更正(需审计)
router.patch('/records/entry/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_entry_records WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Entry record not found');
  const updates = {};
  if (req.body?.entryDate !== undefined) {
    const d = String(req.body.entryDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw badRequest('VALIDATION_ERROR', 'entryDate must be YYYY-MM-DD');
    updates.entry_date = d;
  }
  if (req.body?.note !== undefined) updates.note = String(req.body.note || '').slice(0, 200);
  const cols = Object.keys(updates);
  if (!cols.length) throw badRequest('VALIDATION_ERROR', 'Nothing to update');
  db.prepare(`UPDATE im_entry_records SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`).run({
    ...updates,
    ts: now(),
    id: row.id,
  });
  audit(req.user.id, 'im:record.correct', 'entry_record', row.no, { fields: cols, ...updates });
  res.json({ ok: true });
});

// 异常记录标记
router.post('/records/entry/:id/mark', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_entry_records WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Entry record not found');
  if (req.body?.status !== 'invalid') throw badRequest('VALIDATION_ERROR', 'Only marking as invalid is supported');
  db.prepare("UPDATE im_entry_records SET status = 'invalid', updated_at = ? WHERE id = ?").run(now(), row.id);
  audit(req.user.id, 'im:record.mark', 'entry_record', row.no, { from: row.status, to: 'invalid' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Stats & reports
// ---------------------------------------------------------------------------

router.get('/stats', ...adminOnly, (_req, res) => {
  const statusCounts = {};
  for (const c of db.prepare('SELECT status, COUNT(*) AS n FROM im_declarations WHERE deleted_at IS NULL GROUP BY status').all()) {
    statusCounts[c.status] = c.n;
  }
  const submitted =
    (statusCounts.pending || 0) + (statusCounts.supplement || 0) + (statusCounts.approved || 0) +
    (statusCounts.rejected || 0) + (statusCounts.entered || 0) + (statusCounts.exited || 0);
  const approved = (statusCounts.approved || 0) + (statusCounts.entered || 0) + (statusCounts.exited || 0);
  const rejected = statusCounts.rejected || 0;
  const supplements = db.prepare("SELECT COUNT(*) AS n FROM im_declaration_events WHERE action IN ('require_supplement')").get().n;

  const avgReview = db
    .prepare(
      `SELECT AVG(julianday(reviewed_at) - julianday(submitted_at)) * 24 AS hours FROM im_declarations
       WHERE reviewed_at IS NOT NULL AND submitted_at IS NOT NULL AND deleted_at IS NULL`
    )
    .get().hours;

  const portTraffic = db
    .prepare(
      `SELECT p.name AS portName, COUNT(*) AS declarations FROM im_declarations d
       JOIN im_ports p ON p.id = d.port_id WHERE d.deleted_at IS NULL AND d.status != 'draft' GROUP BY p.id ORDER BY declarations DESC`
    )
    .all();

  const rejectReasons = db
    .prepare('SELECT reject_reason AS reason, COUNT(*) AS n FROM im_declarations WHERE reject_reason IS NOT NULL GROUP BY reject_reason ORDER BY n DESC')
    .all();

  const trend = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const n = db
      .prepare("SELECT COUNT(*) AS n FROM im_declarations WHERE submitted_at LIKE ? AND deleted_at IS NULL")
      .get(`${day}%`).n;
    trend.push({ day, submissions: n });
  }

  res.json({
    statusCounts,
    submitted,
    approved,
    rejected,
    supplements,
    passRate: submitted ? Math.round((approved / submitted) * 100) : 0,
    rejectRate: submitted ? Math.round((rejected / submitted) * 100) : 0,
    supplementRate: submitted ? Math.round((supplements / submitted) * 100) : 0,
    avgReviewHours: avgReview == null ? null : Math.round(avgReview * 10) / 10,
    passChecks: db.prepare('SELECT COUNT(*) AS n FROM im_pass_checks').get().n,
    passCodesActive: db.prepare("SELECT COUNT(*) AS n FROM im_pass_codes WHERE status = 'unused' AND valid_until >= ?").get(now()).n,
    entryRecords: db.prepare('SELECT COUNT(*) AS n FROM im_entry_records WHERE deleted_at IS NULL').get().n,
    exitRecords: db.prepare('SELECT COUNT(*) AS n FROM im_exit_records WHERE deleted_at IS NULL').get().n,
    portTraffic,
    rejectReasons,
    trend,
    crowding: crowding(),
  });
});

// ---------------------------------------------------------------------------
// Audit & compliance
// ---------------------------------------------------------------------------

router.get('/audit', ...adminOnly, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = [];
  const params = [];
  if (req.query.action) {
    where.push('a.action LIKE ?');
    params.push(`${String(req.query.action)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM im_audit_logs a ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at, u.display_name AS actor
       FROM im_audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((r) => ({ ...r, detail: JSON.parse(r.detail || '{}') })),
    total,
    page,
    pageSize,
  });
});

router.get('/blacklist', ...adminOnly, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT b.*, u.username, u.display_name FROM im_blacklist b
       JOIN users u ON u.id = b.user_id WHERE b.lifted_at IS NULL ORDER BY b.id DESC`
    )
    .all();
  res.json({ items: rows });
});

router.post('/blacklist', ...adminOnly, (req, res) => {
  const userId = Number(req.body?.userId);
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
  if (!user) throw badRequest('VALIDATION_ERROR', 'Unknown userId');
  const level = req.body?.level === 'block' ? 'block' : 'warn';
  const reason = readString(req.body?.reason, { name: 'reason', min: 2, max: 200 });
  const info = db
    .prepare('INSERT INTO im_blacklist (user_id, reason, level, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, reason, level, req.user.id, now());
  audit(req.user.id, 'im:blacklist.add', 'user', userId, { level, reason });
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.post('/blacklist/:id/lift', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_blacklist WHERE id = ? AND lifted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Blacklist entry not found');
  db.prepare('UPDATE im_blacklist SET lifted_at = ? WHERE id = ?').run(now(), row.id);
  audit(req.user.id, 'im:blacklist.lift', 'user', row.user_id, {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Message templates + send log + settings
// ---------------------------------------------------------------------------

router.get('/templates', ...adminOnly, (_req, res) => {
  const rows = db.prepare('SELECT * FROM im_message_templates ORDER BY id').all();
  res.json({
    items: rows.map((r) => ({
      id: r.id, code: r.code, title: r.title_template, body: r.body_template,
      variables: r.variables, enabled: !!r.enabled, updatedAt: r.updated_at,
    })),
  });
});

router.put('/templates/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM im_message_templates WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Template not found');
  const title = readString(req.body?.title, { name: 'title', min: 2, max: 120 });
  const body = readString(req.body?.body, { name: 'body', min: 2, max: 600 });
  const enabled = req.body?.enabled === undefined ? !!row.enabled : !!req.body.enabled;
  db.prepare('UPDATE im_message_templates SET title_template = ?, body_template = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
    title,
    body,
    enabled ? 1 : 0,
    now(),
    row.id
  );
  audit(req.user.id, 'im:template.update', 'template', row.code, {});
  res.json({ ok: true });
});

router.get('/messages', ...adminOnly, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = [];
  const params = [];
  if (req.query.userId) {
    where.push('m.user_id = ?');
    params.push(Number(req.query.userId));
  }
  if (req.query.template) {
    where.push('m.template_code = ?');
    params.push(String(req.query.template));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM im_messages m ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT m.id, m.template_code, m.title, m.read, m.created_at, u.username
       FROM im_messages m JOIN users u ON u.id = m.user_id ${whereSql} ORDER BY m.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({ items: rows, total, page, pageSize });
});

const EDITABLE_SETTINGS = new Set(['disclaimer_text', 'stamp_watermark', 'disclaimer_version']);

router.get('/settings', ...adminOnly, (_req, res) => {
  const rows = db.prepare('SELECT key, value, updated_at FROM im_settings ORDER BY key').all();
  res.json({ items: rows });
});

router.put('/settings', ...adminOnly, (req, res) => {
  const entries = Array.isArray(req.body?.items) ? req.body.items : [];
  for (const entry of entries) {
    if (!EDITABLE_SETTINGS.has(entry.key)) continue;
    db.prepare('UPDATE im_settings SET value = ?, updated_at = ? WHERE key = ?').run(
      String(entry.value ?? '').slice(0, 500),
      now(),
      entry.key
    );
  }
  audit(req.user.id, 'im:settings.update', 'settings', '', { keys: entries.map((e) => e.key) });
  res.json({ ok: true });
});

export default router;
