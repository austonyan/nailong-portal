// 皇家口岸入境署 — user-facing API (portal side).
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, notFound, readString, forbidden } from '../http.js';
import { ensureImmigrationSchema, getSetting } from './schema.js';
import {
  assertNoDuplicate,
  assertNotBlocked,
  assertTransition,
  audit,
  consumeRateLimit,
  actorKey,
  crowding,
  logEvent,
  makeUniqueNo,
  notify,
  pageParams,
} from './util.js';
import { checkVisa, VISA_ERROR_CODE } from './visa.js';

ensureImmigrationSchema();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(
  process.env.NAILONG_DATA_DIR || path.join(__dirname, '..', 'data'),
  'uploads',
  'immigration'
);
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const router = Router();
const portalOnly = [authenticate, requirePermission('imm:portal')];

const FUN_ITEM_KEYS = new Set(['plush', 'snacks', 'stickers', 'pillow', 'balloon', 'photo_card']);
const PURPOSES = new Set(['fun', 'visit', 'business', 'show', 'other']);
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

function parseItems(value) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw badRequest('VALIDATION_ERROR', 'items must be an array');
  return value
    .map((item) => {
      const key = String(item?.key || '');
      if (!FUN_ITEM_KEYS.has(key)) throw badRequest('VALIDATION_ERROR', `Unknown declaration item: ${key}`);
      const qty = Math.max(0, Math.min(99, Number(item?.qty) || 0));
      return { key, qty };
    })
    .filter((item) => item.qty > 0)
    .slice(0, 6);
}

function getPortByCode(code) {
  return db.prepare('SELECT * FROM im_ports WHERE code = ?').get(String(code || '').toUpperCase());
}

function serializePort(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    openHours: row.open_hours,
    notice: row.notice,
    mapDesc: row.map_desc,
    sortOrder: row.sort_order,
  };
}

function serializeAnnouncement(row) {
  return {
    id: row.id,
    portId: row.port_id,
    title: row.title,
    body: row.body,
    level: row.level,
    publishedAt: row.published_at,
  };
}

function declarationRow(id) {
  return db
    .prepare(
      `SELECT d.*, p.code AS port_code, p.name AS port_name
       FROM im_declarations d JOIN im_ports p ON p.id = d.port_id
       WHERE d.id = ? AND d.deleted_at IS NULL`
    )
    .get(id);
}

function serializeDeclaration(row, { detail = false } = {}) {
  const base = {
    id: row.id,
    no: row.no,
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
    supplementRequest: row.supplement_request,
    supplementContent: row.supplement_content,
    rejectReason: row.reject_reason,
    rejectNote: row.reject_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (!detail) return base;
  base.confirmEntertainment = !!row.confirm_entertainment;
  base.events = db
    .prepare(
      `SELECT e.action, e.note, e.created_at, u.display_name AS actor
       FROM im_declaration_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.declaration_id = ? ORDER BY e.id`
    )
    .all(row.id);
  base.attachments = db
    .prepare('SELECT id, filename, size, mime, created_at FROM im_attachments WHERE declaration_id = ? AND deleted_at IS NULL ORDER BY id')
    .all(row.id);
  const pass = db
    .prepare('SELECT id, code_no, status, valid_until FROM im_pass_codes WHERE declaration_id = ?')
    .get(row.id);
  base.passCode = pass
    ? { id: pass.id, codeNo: pass.code_no, status: pass.status, validUntil: pass.valid_until }
    : null;
  return base;
}

function ownDeclaration(req, id) {
  const row = declarationRow(Number(id));
  if (!row) throw notFound('Declaration not found');
  if (row.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your declaration');
  return row;
}

// ---------------------------------------------------------------------------
// Overview / ports / announcements
// ---------------------------------------------------------------------------

router.get('/overview', ...portalOnly, (req, res) => {
  const ports = db.prepare('SELECT * FROM im_ports ORDER BY sort_order, id').all().map(serializePort);
  const announcements = db
    .prepare(
      "SELECT * FROM im_announcements WHERE status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT 6"
    )
    .all()
    .map(serializeAnnouncement);
  const myCounts = db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM im_declarations
       WHERE user_id = ? AND deleted_at IS NULL AND status != 'draft' GROUP BY status`
    )
    .all(req.user.id);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM im_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  const expiringEntries = db
    .prepare(
      `SELECT COUNT(*) AS n FROM im_entry_records
       WHERE user_id = ? AND status = 'entered' AND deleted_at IS NULL
         AND julianday('now') > julianday(entry_date) + stay_days - 1`
    )
    .get(req.user.id).n;
  res.json({
    ports,
    announcements,
    crowding: crowding(),
    disclaimer: { version: getSetting('disclaimer_version'), text: getSetting('disclaimer_text') },
    stampWatermark: getSetting('stamp_watermark'),
    my: {
      pending: myCounts.find((c) => c.status === 'pending')?.n ?? 0,
      approved: myCounts.find((c) => c.status === 'approved')?.n ?? 0,
      entered: myCounts.find((c) => c.status === 'entered')?.n ?? 0,
      unreadMessages: unread,
      expiringEntries,
    },
  });
});

router.get('/ports', ...portalOnly, (_req, res) => {
  const rows = db.prepare('SELECT * FROM im_ports ORDER BY sort_order, id').all();
  res.json({ items: rows.map(serializePort) });
});

router.get('/ports/:code', ...portalOnly, (req, res) => {
  const port = getPortByCode(req.params.code);
  if (!port) throw notFound('Port not found');
  const channels = db
    .prepare('SELECT id, name, type, description, enabled FROM im_channels WHERE port_id = ? ORDER BY id')
    .all(port.id);
  const announcements = db
    .prepare(
      `SELECT * FROM im_announcements
       WHERE status = 'published' AND deleted_at IS NULL AND (port_id = ? OR port_id IS NULL)
       ORDER BY published_at DESC, id DESC`
    )
    .all(port.id)
    .map(serializeAnnouncement);
  res.json({ port: serializePort(port), channels, announcements });
});

router.get('/announcements', ...portalOnly, (_req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM im_announcements WHERE status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT 20"
    )
    .all();
  res.json({ items: rows.map(serializeAnnouncement) });
});

// ---------------------------------------------------------------------------
// Visa check (stub adapter, rate limited)
// ---------------------------------------------------------------------------

router.post('/visa/check', ...portalOnly, (req, res) => {
  consumeRateLimit(actorKey(req), 'im:visa_check');
  const visaNo = readString(req.body?.visaNo, { name: 'visaNo', min: 6, max: 32 }).toUpperCase();
  const result = checkVisa(visaNo, req.user);
  res.json({ visaNo, ...result });
});

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

router.get('/declarations', ...portalOnly, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const status = req.query.status ? String(req.query.status) : null;
  const where = ['user_id = ?', 'deleted_at IS NULL'];
  const params = [req.user.id];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM im_declarations WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT d.*, p.code AS port_code, p.name AS port_name FROM im_declarations d
       JOIN im_ports p ON p.id = d.port_id
       WHERE ${where.join(' AND ')} ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({ items: rows.map((r) => serializeDeclaration(r)), total, page, pageSize });
});

router.get('/declarations/:id', ...portalOnly, (req, res) => {
  const row = ownDeclaration(req, req.params.id);
  res.json({ declaration: serializeDeclaration(row, { detail: true }) });
});

function readDeclarationFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.nickname !== undefined) {
    out.nickname = readString(body.nickname, { name: 'nickname', min: 1, max: 40 });
  }
  if (!partial || body.contact !== undefined) {
    out.contact = readString(body.contact, { name: 'contact', min: 3, max: 60 });
  }
  if (!partial || body.purpose !== undefined) {
    const purpose = String(body.purpose || '');
    if (!PURPOSES.has(purpose)) throw badRequest('VALIDATION_ERROR', 'Invalid purpose');
    out.purpose = purpose;
  }
  if (body.purposeNote !== undefined) out.purpose_note = String(body.purposeNote || '').trim().slice(0, 200);
  if (!partial || body.stayDays !== undefined) {
    const days = Number(body.stayDays);
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw badRequest('VALIDATION_ERROR', 'stayDays must be an integer between 1 and 90');
    }
    out.stay_days = days;
  }
  if (body.companions !== undefined) {
    const n = Number(body.companions);
    if (!Number.isInteger(n) || n < 0 || n > 20) throw badRequest('VALIDATION_ERROR', 'companions must be 0-20');
    out.companions = n;
  }
  if (body.address !== undefined) out.address = String(body.address || '').trim().slice(0, 120);
  if (body.visaNo !== undefined) {
    const raw = String(body.visaNo || '').trim().toUpperCase();
    // 演示签注 NL-XXXX-XXXX,或签注署真实格式 NLT-YYYYMMDD-XXXXXXXX(联动开放前校验为 not_found)。
    if (raw && !/^(NL-[A-Z0-9]{4}-[A-Z0-9]{4}|[A-Z]{2,4}-\d{8}-[A-Z0-9]{4,12})$/.test(raw)) {
      throw badRequest('VALIDATION_ERROR', 'Visa number must look like NL-1234-ABCD or NLT-20261025-ABCD1234');
    }
    out.visa_no = raw || null;
  }
  if (body.items !== undefined) out.items = JSON.stringify(parseItems(body.items));
  return out;
}

router.post('/declarations', ...portalOnly, (req, res) => {
  const port = getPortByCode(req.body?.portCode);
  if (!port) throw badRequest('VALIDATION_ERROR', 'Unknown portCode (MVP: ROYAL_PORT)');
  const fields = readDeclarationFields(req.body || {});
  const ts = now();
  const no = makeUniqueNo('IM', 'im_declarations');
  const info = db
    .prepare(
      `INSERT INTO im_declarations (no, user_id, port_id, nickname, contact, purpose, purpose_note, stay_days, companions, address, visa_no, items, status, created_at, updated_at)
       VALUES (@no, @userId, @portId, @nickname, @contact, @purpose, @purposeNote, @stayDays, @companions, @address, @visaNo, @items, 'draft', @ts, @ts)`
    )
    .run({
      no,
      userId: req.user.id,
      portId: port.id,
      nickname: fields.nickname ?? '',
      contact: fields.contact ?? '',
      purpose: fields.purpose ?? 'fun',
      purposeNote: fields.purpose_note ?? '',
      stayDays: fields.stay_days ?? 1,
      companions: fields.companions ?? 0,
      address: fields.address ?? '',
      visaNo: fields.visa_no ?? null,
      items: fields.items ?? '[]',
      ts,
    });
  audit(req.user.id, 'im:draft.create', 'declaration', no, { portCode: port.code });
  res.status(201).json({ declaration: serializeDeclaration(declarationRow(info.lastInsertRowid), { detail: true }) });
});

router.patch('/declarations/:id', ...portalOnly, (req, res) => {
  const row = ownDeclaration(req, req.params.id);
  if (row.status !== 'draft') {
    throw badRequest('IMM_INVALID_STATE', 'Only draft declarations can be edited');
  }
  const fields = readDeclarationFields(req.body || {}, { partial: true });
  const cols = Object.keys(fields);
  if (cols.length) {
    db.prepare(
      `UPDATE im_declarations SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`
    ).run({ ...fields, ts: now(), id: row.id });
  }
  res.json({ declaration: serializeDeclaration(declarationRow(row.id), { detail: true }) });
});

router.delete('/declarations/:id', ...portalOnly, (req, res) => {
  const row = ownDeclaration(req, req.params.id);
  if (row.status !== 'draft') {
    throw badRequest('IMM_INVALID_STATE', 'Only draft declarations can be deleted');
  }
  db.prepare('UPDATE im_declarations SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user.id, 'im:data.delete_draft', 'declaration', row.no, {});
  res.json({ ok: true });
});

router.post('/declarations/:id/submit', ...portalOnly, (req, res) => {
  const row = ownDeclaration(req, req.params.id);
  if (row.status !== 'draft') {
    throw badRequest('IMM_INVALID_STATE', 'Only draft declarations can be submitted');
  }
  assertNotBlocked(req.user.id);
  consumeRateLimit(actorKey(req), 'im:submit');

  const port = db.prepare('SELECT * FROM im_ports WHERE id = ?').get(row.port_id);
  if (port.status !== 'open') {
    throw badRequest('IMM_PORT_CLOSED', `Port ${port.name} is not open for declarations`);
  }
  assertNoDuplicate(req.user.id, row.port_id);
  if (!row.nickname || !row.contact || !row.items || row.items === '[]') {
    throw badRequest('IMM_INCOMPLETE', 'Declaration is incomplete');
  }
  if (!row.visa_no) throw badRequest('IMM_VISA_REQUIRED', 'Link a valid visa before submitting');
  if (!req.body?.confirmEntertainment) {
    throw badRequest('IMM_CONFIRM_REQUIRED', 'The entertainment disclaimer must be accepted');
  }

  const check = checkVisa(row.visa_no, req.user);
  if (check.result !== 'valid') {
    throw badRequest(VISA_ERROR_CODE[check.result] || 'IMM_VISA_INVALID', `Visa check failed: ${check.result}`);
  }

  const ts = now();
  db.prepare(
    `UPDATE im_declarations
     SET status = 'pending', confirm_entertainment = 1, visa_result = ?, visa_checked_at = ?, submitted_at = ?, updated_at = ?
     WHERE id = ?`
  ).run(check.result, check.checkedAt, ts, ts, row.id);
  logEvent(row.id, 'submit', req.user.id, `签注校验:${check.result}`);
  notify(req.user.id, 'submit_success', { no: row.no }, { declarationNo: row.no });
  audit(req.user.id, 'im:declaration.submit', 'declaration', row.no, {});
  res.json({ declaration: serializeDeclaration(declarationRow(row.id), { detail: true }) });
});

router.post('/declarations/:id/withdraw', ...portalOnly, (req, res) => {
  const row = ownDeclaration(req, req.params.id);
  assertTransition(row.status, 'withdrawn', 'Only pending declarations can be withdrawn');
  db.prepare("UPDATE im_declarations SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(now(), row.id);
  logEvent(row.id, 'withdraw', req.user.id, '旅客撤销申报');
  audit(req.user.id, 'im:declaration.withdraw', 'declaration', row.no, {});
  res.json({ declaration: serializeDeclaration(declarationRow(row.id), { detail: true }) });
});

router.post('/declarations/:id/supplement', ...portalOnly, (req, res) => {
  const row = ownDeclaration(req, req.params.id);
  if (row.status !== 'supplement') {
    throw badRequest('IMM_INVALID_STATE', 'This declaration is not awaiting supplements');
  }
  consumeRateLimit(actorKey(req), 'im:supplement');
  const content = readString(req.body?.content, { name: 'content', min: 1, max: 500 });
  const ts = now();
  db.prepare(
    "UPDATE im_declarations SET status = 'pending', supplement_content = ?, updated_at = ? WHERE id = ?"
  ).run(content, ts, row.id);
  logEvent(row.id, 'supplement_submit', req.user.id, content);
  notify(req.user.id, 'supplement_received', { no: row.no }, { declarationNo: row.no });
  res.json({ declaration: serializeDeclaration(declarationRow(row.id), { detail: true }) });
});

// ---------------------------------------------------------------------------
// Attachments (private storage, permission-checked downloads)
// ---------------------------------------------------------------------------

router.post('/declarations/:id/attachments', ...portalOnly, (req, res) => {
  const row = ownDeclaration(req, req.params.id);
  if (!['draft', 'pending', 'supplement'].includes(row.status)) {
    throw badRequest('IMM_INVALID_STATE', 'Attachments are closed for this declaration');
  }
  upload.single('file')(req, res, (err) => {
    if (err) {
      const code = err?.code === 'LIMIT_FILE_SIZE' ? 'IMM_FILE_TOO_LARGE' : 'IMM_FILE_TYPE';
      return res.status(400).json({ code, message: code === 'IMM_FILE_TOO_LARGE' ? 'File exceeds 5MB' : 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'file is required' });
    if (!ALLOWED_MIME.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ code: 'IMM_FILE_TYPE', message: 'Only images and PDF are allowed' });
    }
    const info = db
      .prepare(
        `INSERT INTO im_attachments (declaration_id, filename, stored_name, mime, size, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(row.id, req.file.originalname.slice(0, 120), req.file.filename, req.file.mimetype, req.file.size, req.user.id, now());
    res.status(201).json({
      attachment: { id: info.lastInsertRowid, filename: req.file.originalname, size: req.file.size, mime: req.file.mimetype },
    });
  });
});

router.get('/attachments/:id/download', authenticate, (req, res) => {
  const att = db.prepare('SELECT * FROM im_attachments WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!att) throw notFound('Attachment not found');
  const decl = db.prepare('SELECT user_id, no, status FROM im_declarations WHERE id = ?').get(att.declaration_id);
  const owned = decl?.user_id === req.user.id;
  const canInspect = req.user.permissions.includes('imm:inspect') || req.user.permissions.includes('imm:admin');
  if (!owned && !canInspect) throw forbidden('FORBIDDEN', 'No access to this file');
  const filePath = path.join(uploadDir, att.stored_name);
  if (!fs.existsSync(filePath)) throw notFound('File missing on disk');
  audit(req.user.id, 'im:file.access', 'attachment', att.id, { declarationNo: decl?.no, name: att.filename });
  res.download(filePath, att.filename);
});

router.delete('/attachments/:id', ...portalOnly, (req, res) => {
  const att = db.prepare('SELECT * FROM im_attachments WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!att) throw notFound('Attachment not found');
  const decl = db.prepare('SELECT user_id, status FROM im_declarations WHERE id = ?').get(att.declaration_id);
  if (decl.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your attachment');
  if (!['draft', 'pending', 'supplement'].includes(decl.status)) {
    throw badRequest('IMM_INVALID_STATE', 'Attachments are locked for this declaration');
  }
  db.prepare('UPDATE im_attachments SET deleted_at = ? WHERE id = ?').run(now(), att.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Pass codes
// ---------------------------------------------------------------------------

router.get('/pass-codes', ...portalOnly, (req, res) => {
  const rows = db
    .prepare(
      `SELECT pc.id, pc.code_no, pc.status, pc.valid_until, pc.created_at,
              d.no AS declaration_no, p.name AS port_name
       FROM im_pass_codes pc
       JOIN im_declarations d ON d.id = pc.declaration_id
       JOIN im_ports p ON p.id = pc.port_id
       WHERE pc.user_id = ? ORDER BY pc.created_at DESC`
    )
    .all(req.user.id);
  const nowStr = now();
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      codeNo: r.code_no,
      status: r.status === 'unused' && r.valid_until < nowStr ? 'expired' : r.status,
      validUntil: r.valid_until,
      createdAt: r.created_at,
      declarationNo: r.declaration_no,
      portName: r.port_name,
    })),
  });
});

router.get('/pass-codes/:id', ...portalOnly, (req, res) => {
  const row = db
    .prepare(
      `SELECT pc.*, d.no AS declaration_no, d.nickname, d.stay_days, p.name AS port_name, p.code AS port_code
       FROM im_pass_codes pc
       JOIN im_declarations d ON d.id = pc.declaration_id
       JOIN im_ports p ON p.id = pc.port_id
       WHERE pc.id = ? AND pc.user_id = ?`
    )
    .get(Number(req.params.id), req.user.id);
  if (!row) throw notFound('Pass code not found');
  const effective = row.status === 'unused' && row.valid_until < now() ? 'expired' : row.status;
  res.json({
    passCode: {
      id: row.id,
      codeNo: row.code_no,
      token: row.token,
      status: effective,
      validUntil: row.valid_until,
      usedAt: row.used_at,
      voidReason: row.void_reason,
      declarationNo: row.declaration_no,
      nickname: row.nickname,
      stayDays: row.stay_days,
      portName: row.port_name,
      portCode: row.port_code,
      verifyPath: `/immigration/verify?token=${row.token}`,
    },
  });
});

// ---------------------------------------------------------------------------
// Entry / exit records (mine)
// ---------------------------------------------------------------------------

router.get('/records/entry', ...portalOnly, (req, res) => {
  const rows = db
    .prepare(
      `SELECT er.*, p.name AS port_name, p.code AS port_code
       FROM im_entry_records er JOIN im_ports p ON p.id = er.port_id
       WHERE er.user_id = ? AND er.deleted_at IS NULL ORDER BY er.entry_date DESC, er.id DESC`
    )
    .all(req.user.id);
  res.json({ items: rows });
});

router.get('/records/exit', ...portalOnly, (req, res) => {
  const rows = db
    .prepare(
      `SELECT xr.id, xr.no, xr.exit_date, xr.created_at, er.no AS entry_no, p.name AS port_name
       FROM im_exit_records xr
       JOIN im_entry_records er ON er.id = xr.entry_record_id
       JOIN im_ports p ON p.id = xr.port_id
       WHERE xr.user_id = ? AND xr.deleted_at IS NULL ORDER BY xr.exit_date DESC, xr.id DESC`
    )
    .all(req.user.id);
  res.json({ items: rows });
});

// Fun exit registration: only while the entry record is still `entered`.
router.post('/records/entry/:id/exit', ...portalOnly, (req, res) => {
  const entry = db
    .prepare('SELECT * FROM im_entry_records WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
    .get(Number(req.params.id), req.user.id);
  if (!entry) throw notFound('Entry record not found');
  if (entry.status !== 'entered') {
    throw badRequest('IMM_INVALID_STATE', 'This entry record is not open for exit');
  }
  const portId = Number(req.body?.portId) || entry.port_id;
  const port = db.prepare('SELECT * FROM im_ports WHERE id = ?').get(portId);
  if (!port) throw badRequest('VALIDATION_ERROR', 'Unknown port');
  const ts = now();
  const exitNo = makeUniqueNo('EX', 'im_exit_records');
  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO im_exit_records (no, user_id, entry_record_id, port_id, exit_date, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(exitNo, req.user.id, entry.id, portId, ts.slice(0, 10), req.user.id, ts);
    db.prepare("UPDATE im_entry_records SET status = 'exited', updated_at = ? WHERE id = ?").run(ts, entry.id);
    db.prepare("UPDATE im_declarations SET status = 'exited', updated_at = ? WHERE id = ?").run(ts, entry.declaration_id);
    logEvent(entry.declaration_id, 'exit', req.user.id, `出境登记 ${exitNo}`);
  });
  insert();
  audit(req.user.id, 'im:record.exit_register', 'entry_record', entry.no, { exitNo });
  res.status(201).json({ ok: true, exitNo });
});

// ---------------------------------------------------------------------------
// Messages (站内信)
// ---------------------------------------------------------------------------

router.get('/messages', ...portalOnly, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const filter = String(req.query.filter || 'all');
  const where = ['user_id = ?'];
  if (filter === 'unread') where.push('read = 0', 'archived = 0');
  else if (filter === 'archived') where.push('archived = 1');
  else where.push('archived = 0');
  const params = [req.user.id];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM im_messages WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM im_messages WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM im_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  res.json({
    items: rows.map((m) => ({
      id: m.id,
      templateCode: m.template_code,
      title: m.title,
      body: m.body,
      related: JSON.parse(m.related || '{}'),
      read: !!m.read,
      createdAt: m.created_at,
    })),
    total,
    page,
    pageSize,
    unreadCount: unread,
  });
});

router.post('/messages/:id/read', ...portalOnly, (req, res) => {
  db.prepare('UPDATE im_messages SET read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/read-all', ...portalOnly, (req, res) => {
  db.prepare('UPDATE im_messages SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/archive', ...portalOnly, (req, res) => {
  db.prepare('UPDATE im_messages SET archived = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/unarchive', ...portalOnly, (req, res) => {
  db.prepare('UPDATE im_messages SET archived = 0 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Public verify page (QR token check — no personal info returned)
// ---------------------------------------------------------------------------

router.get('/verify', (req, res) => {
  consumeRateLimit(actorKey(req), 'im:public_verify');
  const token = String(req.query.token || '');
  if (!/^[0-9a-f]{32}$/.test(token)) throw notFound('Unknown pass token');
  const row = db
    .prepare(
      `SELECT pc.code_no, pc.status, pc.valid_until, pc.used_at, pc.void_reason, p.name AS port_name
       FROM im_pass_codes pc JOIN im_ports p ON p.id = pc.port_id WHERE pc.token = ?`
    )
    .get(token);
  if (!row) throw notFound('Unknown pass token');
  const effective = row.status === 'unused' && row.valid_until < now() ? 'expired' : row.status;
  res.json({ codeNo: row.code_no, status: effective, portName: row.port_name, validUntil: row.valid_until });
});

export default router;
