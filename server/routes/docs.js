// 奶龍國皇家文書與認證署 — API routes.
// Queue isolation: /admin/* review endpoints need docs:certify; registry /
// verify-config / stats / audit need docs:manage. Users need docs:apply.
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'node:path';
import { authenticate, requirePermission, JWT_SECRET } from '../auth.js';
import { loadUserAccess, db, now } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../http.js';
import * as D from '../docs.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Middleware helpers
// ---------------------------------------------------------------------------

// File downloads are used by <a href>/<img>, which cannot attach headers, so
// the access token may arrive as ?token= instead.
function fileAuth(req, res, next) {
  const token = req.query.token;
  if (token && !req.headers.authorization) {
    try {
      const payload = jwt.verify(String(token), JWT_SECRET);
      const user = loadUserAccess(Number(payload.sub));
      if (user && user.status === 'active') {
        req.user = user;
        return next();
      }
    } catch {
      // invalid query token → fall through to the standard 401
    }
  }
  return authenticate(req, res, next);
}

const applyAuth = [authenticate, requirePermission('docs:apply')];
const certifyAuth = [authenticate, requirePermission('docs:certify')];
const manageAuth = [authenticate, requirePermission('docs:manage')];

// ---------------------------------------------------------------------------
// Uploads (private storage under server/data/uploads/docs)
// ---------------------------------------------------------------------------

const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, D.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${crypto.randomUUID()}${ALLOWED_EXT.has(ext) ? ext : '.bin'}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // hard cap; per-type limit checked below
  files: 1,
});

function mimeAllowed(accept, mime) {
  if (!accept) return true;
  return String(accept)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((rule) => {
      if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1));
      return mime === rule;
    });
}

function materialsConfig(typeRow) {
  try {
    const list = JSON.parse(typeRow.materials || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function formFieldsConfig(typeRow) {
  try {
    const list = JSON.parse(typeRow.form_fields || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function sanitizeText(value, max = 200) {
  // 去控制字符(含 DEL)后截断
  const cleaned = [...String(value ?? '')]
    .filter((ch) => {
      const code = ch.codePointAt(0);
      return code > 31 && code !== 127;
    })
    .join('');
  return cleaned.trim().slice(0, max);
}

function getPaging(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function loadApplication(id) {
  const row = D.getApplicationRow(Number(id));
  if (!row) throw notFound('Application not found');
  return row;
}

function assertOwnerOrReviewer(app, req) {
  if (app.user_id === req.user.id) return;
  const owned = new Set(req.user.permissions || []);
  if (!owned.has('docs:certify')) throw forbidden('FORBIDDEN', 'Not your application');
}

function serializeApplicationDetail(row) {
  const type = D.serializeType(D.getTypeRow(row.type_code));
  const materials = db
    .prepare('SELECT * FROM doc_materials WHERE application_id = ? ORDER BY created_at, id')
    .all(row.id)
    .map(D.serializeMaterial);
  const records = db
    .prepare('SELECT * FROM doc_records WHERE application_id = ? ORDER BY created_at, id')
    .all(row.id)
    .map(D.serializeRecord);
  const certificate = D.serializeCertificate(D.getCertRowByApplication(row.id));
  return { ...D.serializeApplication(row), type, materials, records, certificate };
}

// ---------------------------------------------------------------------------
// Public: notices, verify
// ---------------------------------------------------------------------------

router.get('/notices', (_req, res) => {
  const items = db
    .prepare('SELECT * FROM doc_notices WHERE enabled = 1 ORDER BY created_at DESC, id DESC LIMIT 20')
    .all()
    .map((n) => ({ id: n.id, title: n.title, body: n.body, level: n.level, createdAt: n.created_at }));
  res.json({ items });
});

// 验真中心: 公开 + 限流 + 防枚举(非法格式与不存在返回同一形状)。
router.post('/verify', (req, res) => {
  const ip = D.clientIp(req);
  const limit = D.getConfigNumber('docs.verify_limit_per_5min', 20);
  if (!D.rateLimit(`verify:${ip}`, limit, 5 * 60 * 1000)) {
    D.audit({ name: 'anonymous' }, 'verify_rate_limited', 'ip', ip, { query: sanitizeText(req.body?.no, 64) });
    throw badRequest('DOC_VERIFY_LIMIT', 'Too many verify attempts, try later');
  }

  const raw = sanitizeText(req.body?.no, 64).toUpperCase().replace(/\s+/g, '');
  if (!raw) throw badRequest('VALIDATION_ERROR', 'no is required');

  // 统一最小观察时间,避免通过响应时长区分存在性。
  const finish = (result, payload) => {
    db.prepare(
      'INSERT INTO doc_verify_logs (query, ip, user_id, result, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(raw.slice(0, 64), ip, userId, result, now());
    setTimeout(() => res.json(payload), 250);
  };

  let userId = null;
  try {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      const payload = jwt.verify(header.slice(7), JWT_SECRET);
      userId = Number(payload.sub);
    }
  } catch {
    userId = null;
  }

  if (D.isValidCertNoFormat(raw)) {
    const cert = db.prepare('SELECT * FROM doc_certificates WHERE cert_no = ?').get(raw);
    if (cert) {
      finish('found', D.maskCertificate(cert, D.getTypeRow(cert.type_code)));
      return;
    }
    finish('not_found', { found: false });
    return;
  }

  // 认证申请编号查询: 展示该申请是否已签发文书(同样脱敏)。
  const appNoOk = /^[A-Z0-9]{2,8}-\d{6}-[A-Z0-9]{6}$/.test(raw);
  if (appNoOk) {
    const app = db.prepare('SELECT * FROM doc_applications WHERE app_no = ?').get(raw);
    if (app && app.user_id === userId) {
      // 本人可用申请编号查询: 额外返回进度状态。
      finish('found_self', {
        found: true,
        self: true,
        appNo: app.app_no,
        status: app.status,
        certificate: D.maskCertificate(D.getCertRowByApplication(app.id), D.getTypeRow(app.type_code)),
      });
      return;
    }
  }
  finish('not_found', { found: false });
});

router.get('/verify/mine', authenticate, (req, res) => {
  const { page, pageSize, offset } = getPaging(req.query);
  const total = db.prepare('SELECT COUNT(*) AS n FROM doc_verify_logs WHERE user_id = ?').get(req.user.id).n;
  const items = db
    .prepare('SELECT * FROM doc_verify_logs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(req.user.id, pageSize, offset)
    .map((r) => ({ id: r.id, query: r.query, result: r.result, createdAt: r.created_at }));
  res.json({ items, total, page, pageSize });
});

// ---------------------------------------------------------------------------
// Types (portal browsing — any authenticated user)
// ---------------------------------------------------------------------------

router.get('/types', authenticate, (_req, res) => {
  const items = db
    .prepare('SELECT * FROM doc_types WHERE enabled = 1 ORDER BY sort_order, id')
    .all()
    .map((row) => D.serializeType(row));
  res.json({ items });
});

router.get('/types/:code', authenticate, (req, res) => {
  const row = D.getTypeRow(req.params.code);
  if (!row || !row.enabled) throw notFound('Document type not found');
  res.json({ item: D.serializeType(row) });
});

// ---------------------------------------------------------------------------
// Applications (portal, docs:apply)
// ---------------------------------------------------------------------------

function validatePayload(typeRow, body, { forSubmit }) {
  const nickname = sanitizeText(body.nickname, 60);
  const contact = sanitizeText(body.contact, 120);
  const bizNo = sanitizeText(body.bizNo, 64).toUpperCase();
  const purpose = ['display', 'collect', 'event', 'entry_aux', 'other'].includes(body.purpose) ? body.purpose : 'display';

  const rawForm = body.formData && typeof body.formData === 'object' ? body.formData : {};
  const formData = {};
  for (const field of formFieldsConfig(typeRow)) {
    const value = sanitizeText(rawForm[field.key], Number(field.max) || 200);
    formData[field.key] = value;
    if (forSubmit && field.required && !value) {
      throw badRequest('VALIDATION_ERROR', `${field.label} is required`);
    }
  }

  if (forSubmit) {
    if (!nickname) throw badRequest('VALIDATION_ERROR', 'nickname is required');
    if (typeRow.biz_required && !bizNo) throw badRequest('VALIDATION_ERROR', `${typeRow.biz_no_label || 'bizNo'} is required`);
  }
  return { nickname, contact, bizNo, purpose, formData };
}

function materialCounts(appId) {
  const rows = db.prepare('SELECT kind, COUNT(*) AS n FROM doc_materials WHERE application_id = ? GROUP BY kind').all(appId);
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
}

router.post('/applications', applyAuth, (req, res) => {
  const typeRow = D.getTypeRow(String(req.body?.typeCode || ''));
  if (!typeRow || !typeRow.enabled) throw badRequest('DOC_TYPE_UNAVAILABLE', 'Document type unavailable');
  if (D.isBlacklisted(req.user.id)) throw forbidden('DOC_BLACKLISTED', 'Account restricted from applying');
  if (!D.rateLimit(`doc-create:${req.user.id}`, 30, 24 * 60 * 60 * 1000)) {
    throw badRequest('DOC_RATE_LIMITED', 'Too many applications today');
  }

  const payload = validatePayload(typeRow, req.body, { forSubmit: false });
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO doc_applications (app_no, user_id, type_code, status, nickname, contact, biz_no, purpose, form_data, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      D.nextApplicationNo(),
      req.user.id,
      typeRow.code,
      payload.nickname,
      payload.contact,
      payload.bizNo,
      payload.purpose,
      JSON.stringify(payload.formData),
      ts,
      ts
    );
  const app = loadApplication(info.lastInsertRowid);
  D.addRecord(app.id, req.user, 'draft_saved');
  D.audit(req.user, 'application_create_draft', 'application', app.app_no, { typeCode: typeRow.code });
  res.json({ item: serializeApplicationDetail(app) });
});

router.patch('/applications/:id', applyAuth, (req, res) => {
  const app = loadApplication(req.params.id);
  if (app.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your application');
  if (app.status !== 'draft') throw conflict('DOC_NOT_EDITABLE', 'Only drafts can be edited');
  const typeRow = D.getTypeRow(app.type_code);
  if (!typeRow) throw notFound('Document type not found');

  const payload = validatePayload(typeRow, req.body, { forSubmit: false });
  db.prepare(
    `UPDATE doc_applications SET nickname = ?, contact = ?, biz_no = ?, purpose = ?, form_data = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    payload.nickname,
    payload.contact,
    payload.bizNo,
    payload.purpose,
    JSON.stringify(payload.formData),
    now(),
    app.id
  );
  res.json({ item: serializeApplicationDetail(loadApplication(app.id)) });
});

router.post('/applications/:id/submit', applyAuth, (req, res) => {
  const app = loadApplication(req.params.id);
  if (app.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your application');
  if (app.status !== 'draft') throw conflict('DOC_NOT_EDITABLE', 'Only drafts can be submitted');
  const typeRow = D.getTypeRow(app.type_code);
  if (!typeRow || !typeRow.enabled) throw badRequest('DOC_TYPE_UNAVAILABLE', 'Document type unavailable');
  if (D.isBlacklisted(req.user.id)) throw forbidden('DOC_BLACKLISTED', 'Account restricted from applying');
  const dailyLimit = D.getConfigNumber('docs.apply_daily_limit', 10);
  if (!D.rateLimit(`doc-submit:${req.user.id}`, dailyLimit, 24 * 60 * 60 * 1000)) {
    throw badRequest('DOC_RATE_LIMITED', 'Daily application limit reached');
  }

  // 重复申请拦截: 同用户 + 同类型 + 同业务编号 仍在途或已认证
  if (app.biz_no) {
    const dup = db
      .prepare(
        `SELECT app_no FROM doc_applications
         WHERE user_id = ? AND type_code = ? AND biz_no = ? AND status IN ('pending','supplementing','approved') AND id != ?`
      )
      .get(req.user.id, app.type_code, app.biz_no, app.id);
    if (dup) throw conflict('DOC_DUPLICATE', `Duplicate application: ${dup.app_no}`);
  }

  const body = { ...req.body, nickname: req.body?.nickname ?? app.nickname, contact: req.body?.contact ?? app.contact, bizNo: req.body?.bizNo ?? app.biz_no, purpose: req.body?.purpose ?? app.purpose, formData: req.body?.formData ?? JSON.parse(app.form_data || '{}') };
  const payload = validatePayload(typeRow, body, { forSubmit: true });

  // 必传材料检查
  const counts = materialCounts(app.id);
  for (const conf of materialsConfig(typeRow)) {
    if (conf.required && !(counts[conf.key] > 0)) {
      throw badRequest('DOC_MATERIAL_REQUIRED', `${conf.label} is required`);
    }
  }

  // 关联业务校验(联动预留) — 结果缓存进 biz_check
  const bizCheck = D.checkBizNo(typeRow, payload.bizNo);

  const ts = now();
  db.prepare(
    `UPDATE doc_applications
     SET status = 'pending', nickname = ?, contact = ?, biz_no = ?, purpose = ?, form_data = ?,
         biz_check = ?, submitted_at = ?, updated_at = ?, reject_code = NULL, reject_comment = NULL
     WHERE id = ?`
  ).run(
    payload.nickname,
    payload.contact,
    payload.bizNo,
    payload.purpose,
    JSON.stringify(payload.formData),
    JSON.stringify(bizCheck),
    ts,
    ts,
    app.id
  );
  D.addRecord(app.id, req.user, 'submitted', { comment: bizCheck.reserved ? 'biz-check-reserved' : '' });
  D.sendMsg(app.user_id, app.id, 'submitted', { appNo: app.app_no });
  D.audit(req.user, 'application_submit', 'application', app.app_no, { typeCode: app.type_code });
  res.json({ item: serializeApplicationDetail(loadApplication(app.id)) });
});

router.delete('/applications/:id', applyAuth, (req, res) => {
  const app = loadApplication(req.params.id);
  if (app.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your application');
  if (app.status !== 'draft') throw conflict('DOC_NOT_EDITABLE', 'Only drafts can be deleted');
  const files = db.prepare('SELECT path FROM doc_materials WHERE application_id = ?').all(app.id);
  const info = db.prepare('DELETE FROM doc_applications WHERE id = ?').run(app.id);
  for (const f of files) fs.promises.unlink(f.path).catch(() => {});
  D.audit(req.user, 'application_delete_draft', 'application', app.app_no);
  res.json({ deleted: info.changes > 0 });
});

router.post('/applications/:id/withdraw', applyAuth, (req, res) => {
  const app = loadApplication(req.params.id);
  if (app.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your application');
  if (app.status !== 'pending' && app.status !== 'supplementing') {
    throw conflict('DOC_INVALID_STATE', `Cannot withdraw from status ${app.status}`);
  }
  db.prepare("UPDATE doc_applications SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(now(), app.id);
  D.addRecord(app.id, req.user, 'withdrawn');
  D.sendMsg(app.user_id, app.id, 'withdrawn', { appNo: app.app_no });
  D.audit(req.user, 'application_withdraw', 'application', app.app_no);
  res.json({ item: serializeApplicationDetail(loadApplication(app.id)) });
});

router.get('/applications', applyAuth, (req, res) => {
  D.sweepAll();
  const { page, pageSize, offset } = getPaging(req.query);
  const status = sanitizeText(req.query.status, 40);
  const params = [req.user.id];
  let where = 'user_id = ?';
  if (status && status !== 'all') {
    const list = status.split(',').map((s) => sanitizeText(s, 20)).filter(Boolean);
    if (list.length) {
      where += ` AND status IN (${list.map(() => '?').join(',')})`;
      params.push(...list);
    }
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM doc_applications WHERE ${where}`).get(...params).n;
  const items = db
    .prepare(
      `SELECT a.*, t.name AS type_name FROM doc_applications a LEFT JOIN doc_types t ON t.code = a.type_code
       WHERE ${where} ORDER BY a.updated_at DESC, a.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset)
    .map((row) => ({ ...D.serializeApplication(row), typeName: row.type_name ?? row.type_code }));
  res.json({ items, total, page, pageSize });
});

router.get('/applications/:id', applyAuth, (req, res) => {
  D.sweepAll();
  const app = loadApplication(req.params.id);
  assertOwnerOrReviewer(app, req);
  res.json({ item: serializeApplicationDetail(app) });
});

// 补交后重新进入队列
router.post('/applications/:id/resubmit', applyAuth, (req, res) => {
  const app = loadApplication(req.params.id);
  if (app.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your application');
  if (app.status !== 'supplementing') throw conflict('DOC_INVALID_STATE', 'Application is not awaiting supplement');
  const supplements = db
    .prepare("SELECT COUNT(*) AS n FROM doc_materials WHERE application_id = ? AND origin = 'supplement'")
    .get(app.id).n;
  if (supplements === 0) throw badRequest('DOC_MATERIAL_REQUIRED', 'Upload supplement materials first');
  db.prepare("UPDATE doc_applications SET status = 'pending', updated_at = ? WHERE id = ?").run(now(), app.id);
  D.addRecord(app.id, req.user, 'resubmitted');
  D.sendMsg(app.user_id, app.id, 'supplemented', { appNo: app.app_no });
  D.audit(req.user, 'application_resubmit', 'application', app.app_no);
  res.json({ item: serializeApplicationDetail(loadApplication(app.id)) });
});

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

router.post('/applications/:id/materials', applyAuth, upload.single('file'), (req, res) => {
  const app = loadApplication(req.params.id);
  if (app.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your application');
  if (app.status !== 'draft' && app.status !== 'supplementing') {
    throw conflict('DOC_INVALID_STATE', 'Materials can only be added to drafts or supplementing applications');
  }
  if (D.rateLimit(`doc-upload:${req.user.id}`, 60, 60 * 60 * 1000) === false) {
    throw badRequest('DOC_RATE_LIMITED', 'Too many uploads, try later');
  }
  const typeRow = D.getTypeRow(app.type_code);
  const conf = materialsConfig(typeRow).find((m) => m.key === req.body?.kind);
  if (!conf) throw badRequest('VALIDATION_ERROR', 'Unknown material kind');
  const file = req.file;
  if (!file) throw badRequest('VALIDATION_ERROR', 'file is required');

  const globalMax = D.getConfigNumber('docs.upload_max_mb', 10) * 1024 * 1024;
  const typeMax = (Number(conf.max_mb) || 10) * 1024 * 1024;
  if (file.size > Math.min(globalMax, typeMax)) {
    fs.promises.unlink(file.path).catch(() => {});
    throw badRequest('DOC_FILE_TOO_LARGE', `File exceeds ${Math.min(globalMax, typeMax) / 1024 / 1024}MB`);
  }
  if (!mimeAllowed(conf.accept, file.mimetype)) {
    fs.promises.unlink(file.path).catch(() => {});
    throw badRequest('DOC_FILE_TYPE_REJECTED', `Only ${conf.accept} allowed`);
  }
  const counts = materialCounts(app.id);
  if ((counts[conf.key] || 0) >= (Number(conf.max_count) || 1)) {
    fs.promises.unlink(file.path).catch(() => {});
    throw conflict('DOC_FILE_COUNT_EXCEEDED', `At most ${conf.max_count} file(s) for ${conf.label}`);
  }

  const origin = app.status === 'supplementing' ? 'supplement' : 'initial';
  const info = db
    .prepare(
      'INSERT INTO doc_materials (application_id, user_id, kind, origin, filename, mime, size, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(app.id, req.user.id, conf.key, origin, sanitizeText(file.originalname, 200), file.mimetype, file.size, file.path, now());
  const row = db.prepare('SELECT * FROM doc_materials WHERE id = ?').get(info.lastInsertRowid);
  res.json({ item: D.serializeMaterial(row) });
});

router.delete('/materials/:id', applyAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM doc_materials WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Material not found');
  if (row.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your material');
  const app = loadApplication(row.application_id);
  if (app.status !== 'draft' && app.status !== 'supplementing') {
    throw conflict('DOC_INVALID_STATE', 'Materials are locked after submission');
  }
  db.prepare('DELETE FROM doc_materials WHERE id = ?').run(row.id);
  fs.promises.unlink(row.path).catch(() => {});
  res.json({ deleted: true });
});

router.get('/materials/:id/file', fileAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM doc_materials WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Material not found');
  const app = D.getApplicationRow(row.application_id);
  const owned = new Set(req.user.permissions || []);
  if (row.user_id !== req.user.id && !owned.has('docs:certify')) throw forbidden('FORBIDDEN', 'Not your material');
  if (!fs.existsSync(row.path)) throw notFound('File missing');
  D.audit(req.user, 'material_download', 'material', String(row.id), { appNo: app?.app_no });
  res.setHeader('Content-Type', row.mime);
  res.setHeader('Content-Disposition', `inline; filename="material-${row.id}"`);
  fs.createReadStream(row.path).pipe(res);
});

// ---------------------------------------------------------------------------
// Certificates (portal)
// ---------------------------------------------------------------------------

router.get('/certificates', applyAuth, (req, res) => {
  D.sweepAll();
  const { page, pageSize, offset } = getPaging(req.query);
  const params = [req.user.id];
  let where = 'user_id = ?';
  const status = sanitizeText(req.query.status, 20);
  if (status && status !== 'all') {
    where += ' AND status = ?';
    params.push(status);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM doc_certificates WHERE ${where}`).get(...params).n;
  const items = db
    .prepare(
      `SELECT c.*, t.name AS type_name FROM doc_certificates c LEFT JOIN doc_types t ON t.code = c.type_code
       WHERE ${where} ORDER BY c.issued_at DESC, c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset)
    .map((row) => ({ ...D.serializeCertificate(row), typeName: row.type_name ?? row.type_code }));
  res.json({ items, total, page, pageSize });
});

router.get('/certificates/:id', applyAuth, (req, res) => {
  D.sweepAll();
  const cert = db.prepare('SELECT * FROM doc_certificates WHERE id = ?').get(Number(req.params.id));
  if (!cert) throw notFound('Certificate not found');
  const owned = new Set(req.user.permissions || []);
  if (cert.user_id !== req.user.id && !owned.has('docs:certify')) throw forbidden('FORBIDDEN', 'Not your certificate');
  const row = { ...cert, type_name: D.getTypeRow(cert.type_code)?.name };
  res.json({
    item: {
      ...D.serializeCertificate(row),
      typeName: row.type_name ?? cert.type_code,
      application: serializeApplicationDetail(D.getApplicationRow(cert.application_id)),
      issuer: D.getConfig('docs.issuer_name', '奶龍國皇家文書與認證署'),
      sealEnabled: D.getConfig('docs.seal_enabled', '1') === '1',
    },
  });
});

// ---------------------------------------------------------------------------
// Messages (站内信)
// ---------------------------------------------------------------------------

router.get('/messages', authenticate, (req, res) => {
  const { page, pageSize, offset } = getPaging(req.query);
  const box = req.query.box === 'archived' ? 'archived' : 'inbox';
  const where = box === 'archived' ? 'archived = 1' : 'archived = 0';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM doc_messages WHERE user_id = ? AND ${where}`).get(req.user.id).n;
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM doc_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  const items = db
    .prepare(`SELECT * FROM doc_messages WHERE user_id = ? AND ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(req.user.id, pageSize, offset)
    .map(D.serializeMessage);
  res.json({ items, total, page, pageSize, unread });
});

router.get('/messages/unread', authenticate, (req, res) => {
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM doc_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  res.json({ unread });
});

router.post('/messages/read-all', authenticate, (req, res) => {
  db.prepare('UPDATE doc_messages SET read = 1 WHERE user_id = ? AND read = 0').run(req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/read', authenticate, (req, res) => {
  db.prepare('UPDATE doc_messages SET read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/archive', authenticate, (req, res) => {
  db.prepare('UPDATE doc_messages SET archived = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/unarchive', authenticate, (req, res) => {
  db.prepare('UPDATE doc_messages SET archived = 0 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Certification workbench (docs:certify — queue isolated)
// ---------------------------------------------------------------------------

router.get('/admin/queue', certifyAuth, (req, res) => {
  D.sweepAll();
  const { page, pageSize, offset } = getPaging(req.query);
  const status = sanitizeText(req.query.status, 60) || 'pending,supplementing';
  const typeCode = sanitizeText(req.query.typeCode, 40);
  const q = sanitizeText(req.query.q, 64);
  const params = [];
  let where = "a.status IN ('pending','supplementing')";
  if (status !== 'all') {
    const list = status.split(',').map((s) => sanitizeText(s, 20)).filter(Boolean);
    if (list.length) {
      where = `a.status IN (${list.map(() => '?').join(',')})`;
      params.push(...list);
    }
  }
  if (typeCode && typeCode !== 'all') {
    where += ' AND a.type_code = ?';
    params.push(typeCode);
  }
  if (q) {
    where += ' AND (a.app_no LIKE ? OR a.nickname LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM doc_applications a WHERE ${where}`).get(...params).n;
  const items = db
    .prepare(
      `SELECT a.*, t.name AS type_name, u.username FROM doc_applications a
       LEFT JOIN doc_types t ON t.code = a.type_code LEFT JOIN users u ON u.id = a.user_id
       WHERE ${where} ORDER BY a.submitted_at, a.id LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset)
    .map((row) => ({
      ...D.serializeApplication(row),
      typeName: row.type_name ?? row.type_code,
      username: row.username,
      materialCount: db.prepare('SELECT COUNT(*) AS n FROM doc_materials WHERE application_id = ?').get(row.id).n,
    }));
  res.json({ items, total, page, pageSize });
});

const REJECT_CODES = new Set(['materials_incomplete', 'info_false', 'type_mismatch', 'biz_invalid', 'duplicate', 'other']);

router.post('/admin/applications/:id/approve', certifyAuth, (req, res) => {
  const app = loadApplication(req.params.id);
  if (app.status !== 'pending') throw conflict('DOC_INVALID_STATE', `Cannot approve from status ${app.status}`);
  const typeRow = D.getTypeRow(app.type_code);
  if (!typeRow) throw notFound('Document type not found');
  const existing = D.getCertRowByApplication(app.id);
  if (existing) throw conflict('DOC_DUPLICATE', 'Certificate already issued');

  const comment = sanitizeText(req.body?.comment, 300);
  const ts = now();
  const expires = new Date(Date.now() + (Number(typeRow.validity_days) || 365) * 24 * 60 * 60 * 1000).toISOString();
  const certNo = D.nextCertNo();
  db.prepare(
    `INSERT INTO doc_certificates (cert_no, application_id, user_id, type_code, holder_name, biz_no, status, verify_token, issued_at, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'valid', ?, ?, ?, ?)`
  ).run(certNo, app.id, app.user_id, app.type_code, app.nickname, app.biz_no, crypto.randomUUID(), ts, expires, ts);
  db.prepare("UPDATE doc_applications SET status = 'approved', decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?").run(
    req.user.id,
    ts,
    ts,
    app.id
  );
  D.addRecord(app.id, req.user, 'approved', { comment });
  D.addRecord(app.id, req.user, 'cert_issued', { comment: certNo });
  D.sendMsg(app.user_id, app.id, 'approved', { appNo: app.app_no, certNo });
  D.audit(req.user, 'certify_approve', 'application', app.app_no, { certNo });
  res.json({ item: serializeApplicationDetail(loadApplication(app.id)) });
});

router.post('/admin/applications/:id/reject', certifyAuth, (req, res) => {
  const app = loadApplication(req.params.id);
  if (app.status !== 'pending') throw conflict('DOC_INVALID_STATE', `Cannot reject from status ${app.status}`);
  const reasonCode = sanitizeText(req.body?.reasonCode, 40);
  if (!REJECT_CODES.has(reasonCode)) throw badRequest('VALIDATION_ERROR', 'Unknown reject reason');
  const comment = sanitizeText(req.body?.comment, 300);
  const ts = now();
  db.prepare(
    "UPDATE doc_applications SET status = 'rejected', reject_code = ?, reject_comment = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(reasonCode, comment, req.user.id, ts, ts, app.id);
  D.addRecord(app.id, req.user, 'rejected', { reasonCode, comment });
  D.sendMsg(app.user_id, app.id, 'rejected', { appNo: app.app_no, reasonCode });
  D.audit(req.user, 'certify_reject', 'application', app.app_no, { reasonCode });
  res.json({ item: serializeApplicationDetail(loadApplication(app.id)) });
});

router.post('/admin/applications/:id/require-supplement', certifyAuth, (req, res) => {
  const app = loadApplication(req.params.id);
  if (app.status !== 'pending') throw conflict('DOC_INVALID_STATE', `Cannot request supplement from status ${app.status}`);
  const note = sanitizeText(req.body?.note, 300);
  if (!note) throw badRequest('VALIDATION_ERROR', 'note is required');
  const days = Math.min(30, Math.max(1, Number(req.body?.days) || D.getConfigNumber('docs.supplement_days', 7)));
  const deadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const ts = now();
  db.prepare(
    "UPDATE doc_applications SET status = 'supplementing', supplement_note = ?, supplement_deadline = ?, updated_at = ? WHERE id = ?"
  ).run(note, deadline, ts, app.id);
  D.addRecord(app.id, req.user, 'supplement_requested', { comment: note });
  D.sendMsg(app.user_id, app.id, 'supplement_request', { appNo: app.app_no, days, note });
  D.audit(req.user, 'certify_require_supplement', 'application', app.app_no, { days });
  res.json({ item: serializeApplicationDetail(loadApplication(app.id)) });
});

// ---------------------------------------------------------------------------
// Admin: types registry (docs:manage)
// ---------------------------------------------------------------------------

function validateTypePayload(body, { partial = false } = {}) {
  const out = {};
  const str = (key, max, def = '') => {
    if (body[key] === undefined) {
      if (partial) return;
      out[key] = def;
      return;
    }
    out[key] = sanitizeText(body[key], max);
  };
  const num = (key, def, min, max) => {
    if (body[key] === undefined) {
      if (partial) return;
      out[key] = def;
      return;
    }
    const n = Number(body[key]);
    if (!Number.isFinite(n) || n < min || n > max) throw badRequest('VALIDATION_ERROR', `${key} out of range`);
    out[key] = Math.round(n);
  };
  const bool = (key, def = 0) => {
    if (body[key] === undefined) {
      if (partial) return;
      out[key] = def;
      return;
    }
    out[key] = body[key] ? 1 : 0;
  };

  if (!partial) {
    const code = sanitizeText(body.code, 30).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(code)) throw badRequest('VALIDATION_ERROR', 'Invalid type code');
    const clash = db.prepare('SELECT id FROM doc_types WHERE code = ?').get(code);
    if (clash) throw conflict('DOC_TYPE_CODE_TAKEN', 'Type code already exists');
    out.code = code;
  }
  str('name', 80);
  str('description', 300);
  str('guide', 2000);
  str('biz_no_label', 40);
  str('biz_source', 30);
  num('validity_days', 365, 1, 3650);
  num('sort_order', 0, -999, 999);
  bool('biz_required');
  bool('enabled', 1);

  // 表单字段配置: [{key,label,required,max,placeholder}]
  if (body.formFields !== undefined) {
    const fields = Array.isArray(body.formFields) ? body.formFields : [];
    out.form_fields = JSON.stringify(
      fields.slice(0, 10).map((f) => ({
        key: sanitizeText(f.key, 30).replace(/[^a-zA-Z0-9_]/g, ''),
        label: sanitizeText(f.label, 60),
        required: f.required ? 1 : 0,
        max: Math.min(500, Math.max(1, Number(f.max) || 120)),
        placeholder: sanitizeText(f.placeholder, 120),
      })).filter((f) => f.key && f.label)
    );
  } else if (!partial) out.form_fields = '[]';

  // 材料要求配置: [{key,label,required,accept,max_mb,max_count}]
  if (body.materials !== undefined) {
    const mats = Array.isArray(body.materials) ? body.materials : [];
    out.materials = JSON.stringify(
      mats.slice(0, 6).map((m) => ({
        key: sanitizeText(m.key, 30).replace(/[^a-zA-Z0-9_]/g, ''),
        label: sanitizeText(m.label, 60),
        required: m.required ? 1 : 0,
        accept: sanitizeText(m.accept, 200) || 'image/*,application/pdf',
        max_mb: Math.min(20, Math.max(1, Number(m.max_mb) || 10)),
        max_count: Math.min(5, Math.max(1, Number(m.max_count) || 1)),
      })).filter((m) => m.key && m.label)
    );
  } else if (!partial) out.materials = '[]';

  return out;
}

router.get('/admin/types', manageAuth, (_req, res) => {
  const items = db.prepare('SELECT * FROM doc_types ORDER BY sort_order, id').all().map((row) => D.serializeType(row));
  res.json({ items });
});

router.post('/admin/types', manageAuth, (req, res) => {
  const payload = validateTypePayload(req.body || {});
  if (!payload.name) throw badRequest('VALIDATION_ERROR', 'name is required');
  const ts = now();
  const cols = Object.keys(payload);
  db.prepare(
    `INSERT INTO doc_types (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?)`
  ).run(...cols.map((c) => payload[c]), ts, ts);
  D.audit(req.user, 'type_create', 'doc_type', payload.code, { name: payload.name });
  res.json({ item: D.serializeType(D.getTypeRow(payload.code)) });
});

router.patch('/admin/types/:id', manageAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM doc_types WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Document type not found');
  const payload = validateTypePayload(req.body || {}, { partial: true, existing: row });
  const keys = Object.keys(payload);
  if (keys.length) {
    db.prepare(`UPDATE doc_types SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(
      ...keys.map((k) => payload[k]),
      now(),
      row.id
    );
  }
  D.audit(req.user, 'type_update', 'doc_type', row.code, { fields: keys });
  res.json({ item: D.serializeType(D.getTypeRow(row.code)) });
});

// ---------------------------------------------------------------------------
// Admin: certificates lifecycle (docs:manage)
// ---------------------------------------------------------------------------

router.get('/admin/certificates', manageAuth, (req, res) => {
  D.sweepAll();
  const { page, pageSize, offset } = getPaging(req.query);
  const params = [];
  let where = '1 = 1';
  const status = sanitizeText(req.query.status, 20);
  if (status && status !== 'all') {
    where += ' AND c.status = ?';
    params.push(status);
  }
  const typeCode = sanitizeText(req.query.typeCode, 40);
  if (typeCode && typeCode !== 'all') {
    where += ' AND c.type_code = ?';
    params.push(typeCode);
  }
  const q = sanitizeText(req.query.q, 64);
  if (q) {
    where += ' AND (c.cert_no LIKE ? OR c.holder_name LIKE ? OR c.biz_no LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM doc_certificates c WHERE ${where}`).get(...params).n;
  const items = db
    .prepare(
      `SELECT c.*, t.name AS type_name, u.username FROM doc_certificates c
       LEFT JOIN doc_types t ON t.code = c.type_code LEFT JOIN users u ON u.id = c.user_id
       WHERE ${where} ORDER BY c.issued_at DESC, c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset)
    .map((row) => ({ ...D.serializeCertificate(row), typeName: row.type_name ?? row.type_code, username: row.username }));
  res.json({ items, total, page, pageSize });
});

router.post('/admin/certificates/:id/revoke', manageAuth, (req, res) => {
  const cert = db.prepare('SELECT * FROM doc_certificates WHERE id = ?').get(Number(req.params.id));
  if (!cert) throw notFound('Certificate not found');
  if (cert.status !== 'valid') throw conflict('DOC_INVALID_STATE', `Cannot revoke from status ${cert.status}`);
  const reason = sanitizeText(req.body?.reason, 300);
  if (!reason) throw badRequest('VALIDATION_ERROR', 'reason is required');
  db.prepare("UPDATE doc_certificates SET status = 'revoked', revoked_reason = ?, revoked_by_name = ?, revoked_at = ?, updated_at = ? WHERE id = ?").run(
    reason,
    req.user.displayName || req.user.username,
    now(),
    now(),
    cert.id
  );
  D.addRecord(cert.application_id, req.user, 'cert_revoked', { comment: reason });
  D.sendMsg(cert.user_id, cert.application_id, 'revoked', { certNo: cert.cert_no, reason });
  D.audit(req.user, 'certificate_revoke', 'certificate', cert.cert_no, { reason });
  res.json({ item: D.serializeCertificate(db.prepare('SELECT * FROM doc_certificates WHERE id = ?').get(cert.id)) });
});

router.post('/admin/certificates/:id/mark-used', manageAuth, (req, res) => {
  const cert = db.prepare('SELECT * FROM doc_certificates WHERE id = ?').get(Number(req.params.id));
  if (!cert) throw notFound('Certificate not found');
  if (cert.status !== 'valid') throw conflict('DOC_INVALID_STATE', `Cannot mark used from status ${cert.status}`);
  db.prepare("UPDATE doc_certificates SET status = 'used', updated_at = ? WHERE id = ?").run(now(), cert.id);
  D.addRecord(cert.application_id, req.user, 'cert_marked_used');
  D.audit(req.user, 'certificate_mark_used', 'certificate', cert.cert_no);
  res.json({ item: D.serializeCertificate(db.prepare('SELECT * FROM doc_certificates WHERE id = ?').get(cert.id)) });
});

// 补发: 原文书必须已失效(撤销/过期),同申请签发新编号文书。
router.post('/admin/certificates/:id/regenerate', manageAuth, (req, res) => {
  const cert = db.prepare('SELECT * FROM doc_certificates WHERE id = ?').get(Number(req.params.id));
  if (!cert) throw notFound('Certificate not found');
  if (cert.status === 'valid') throw conflict('DOC_INVALID_STATE', 'Revoke the valid certificate first');
  const app = D.getApplicationRow(cert.application_id);
  if (!app || app.status !== 'approved') throw conflict('DOC_INVALID_STATE', 'Application is not approved');
  const typeRow = D.getTypeRow(app.type_code);
  const ts = now();
  const expires = new Date(Date.now() + (Number(typeRow?.validity_days) || 365) * 24 * 60 * 60 * 1000).toISOString();
  const newNo = D.nextCertNo();
  db.prepare(
    `INSERT INTO doc_certificates (cert_no, application_id, user_id, type_code, holder_name, biz_no, status, verify_token, issued_at, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'valid', ?, ?, ?, ?)`
  ).run(newNo, app.id, app.user_id, app.type_code, app.nickname, app.biz_no, crypto.randomUUID(), ts, expires, ts);
  D.addRecord(app.id, req.user, 'cert_regenerated', { comment: `${cert.cert_no} → ${newNo}` });
  D.sendMsg(app.user_id, app.id, 'regenerated', { oldCertNo: cert.cert_no, certNo: newNo });
  D.audit(req.user, 'certificate_regenerate', 'certificate', cert.cert_no, { newCertNo: newNo });
  res.json({ item: D.serializeCertificate(db.prepare('SELECT * FROM doc_certificates WHERE cert_no = ?').get(newNo)) });
});

// ---------------------------------------------------------------------------
// Admin: verify management (docs:manage)
// ---------------------------------------------------------------------------

router.get('/admin/verify-logs', manageAuth, (req, res) => {
  const { page, pageSize, offset } = getPaging(req.query);
  const params = [];
  let where = '1 = 1';
  const q = sanitizeText(req.query.q, 64);
  if (q) {
    where += ' AND query LIKE ?';
    params.push(`%${q}%`);
  }
  const result = sanitizeText(req.query.result, 20);
  if (result && result !== 'all') {
    where += ' AND result = ?';
    params.push(result);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM doc_verify_logs WHERE ${where}`).get(...params).n;
  const items = db
    .prepare('SELECT * FROM doc_verify_logs WHERE ' + where + ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(...params, pageSize, offset)
    .map((r) => ({ id: r.id, query: r.query, ip: r.ip, result: r.result, createdAt: r.created_at }));
  res.json({ items, total, page, pageSize });
});

// 异常验真告警: 24h 内失败率与高频查询。
router.get('/admin/verify-summary', manageAuth, (_req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare('SELECT result, COUNT(*) AS n FROM doc_verify_logs WHERE created_at >= ? GROUP BY result').all(since);
  const byResult = Object.fromEntries(rows.map((r) => [r.result, r.n]));
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  const misses = byResult.not_found || 0;
  const failureRate = total ? misses / total : 0;
  const top = db
    .prepare('SELECT query, COUNT(*) AS n FROM doc_verify_logs WHERE created_at >= ? GROUP BY query ORDER BY n DESC LIMIT 5')
    .all(since);
  const alerts = [];
  if (total >= 20 && failureRate > 0.6) alerts.push('high_failure_rate');
  if (top[0] && top[0].n >= 10) alerts.push('high_frequency_query');
  res.json({ total, byResult, failureRate, top, alerts });
});

// ---------------------------------------------------------------------------
// Admin: notices / config / blacklist / stats / audit (docs:manage)
// ---------------------------------------------------------------------------

router.get('/admin/notices', manageAuth, (_req, res) => {
  const items = db.prepare('SELECT * FROM doc_notices ORDER BY created_at DESC, id DESC').all();
  res.json({ items });
});

router.post('/admin/notices', manageAuth, (req, res) => {
  const title = sanitizeText(req.body?.title, 120);
  const body = sanitizeText(req.body?.body, 2000);
  const level = ['info', 'policy', 'event'].includes(req.body?.level) ? req.body.level : 'info';
  if (!title) throw badRequest('VALIDATION_ERROR', 'title is required');
  const ts = now();
  const info = db
    .prepare('INSERT INTO doc_notices (title, body, level, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
    .run(title, body, level, ts, ts);
  D.audit(req.user, 'notice_create', 'notice', String(info.lastInsertRowid), { title });
  res.json({ item: db.prepare('SELECT * FROM doc_notices WHERE id = ?').get(info.lastInsertRowid) });
});

router.patch('/admin/notices/:id', manageAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM doc_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  const title = req.body?.title !== undefined ? sanitizeText(req.body.title, 120) : row.title;
  const body = req.body?.body !== undefined ? sanitizeText(req.body.body, 2000) : row.body;
  const level = req.body?.level !== undefined && ['info', 'policy', 'event'].includes(req.body.level) ? req.body.level : row.level;
  const enabled = req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled;
  db.prepare('UPDATE doc_notices SET title = ?, body = ?, level = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
    title,
    body,
    level,
    enabled,
    now(),
    row.id
  );
  D.audit(req.user, 'notice_update', 'notice', String(row.id), { enabled });
  res.json({ item: db.prepare('SELECT * FROM doc_notices WHERE id = ?').get(row.id) });
});

router.delete('/admin/notices/:id', manageAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM doc_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  db.prepare('DELETE FROM doc_notices WHERE id = ?').run(row.id);
  D.audit(req.user, 'notice_delete', 'notice', String(row.id), { title: row.title });
  res.json({ deleted: true });
});

const CONFIG_WHITELIST = new Set([
  'docs.app_no_prefix',
  'docs.cert_no_prefix',
  'docs.supplement_days',
  'docs.review_hours_hint',
  'docs.verify_limit_per_5min',
  'docs.apply_daily_limit',
  'docs.upload_max_mb',
  'docs.seal_enabled',
  'docs.issuer_name',
]);

router.get('/admin/config', manageAuth, (_req, res) => {
  const items = db.prepare('SELECT * FROM doc_config ORDER BY key').all();
  res.json({ items });
});

router.patch('/admin/config', manageAuth, (req, res) => {
  const body = req.body || {};
  const updated = [];
  for (const [key, value] of Object.entries(body)) {
    if (!CONFIG_WHITELIST.has(key)) continue;
    let v = sanitizeText(value, 200);
    if (key.endsWith('_days') || key.endsWith('_hint') || key.endsWith('_5min') || key.endsWith('_limit') || key.endsWith('_mb')) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0 || n > 100000) throw badRequest('VALIDATION_ERROR', `${key} must be a positive number`);
      v = String(Math.round(n));
    }
    if (key === 'docs.seal_enabled') v = value ? '1' : '0';
    if (key === 'docs.issuer_name' && !v) continue;
    if (key.endsWith('_prefix')) {
      const prefix = v.toUpperCase();
      if (!/^[A-Z0-9]{2,8}$/.test(prefix)) throw badRequest('VALIDATION_ERROR', 'prefix must be 2-8 letters/digits');
      v = prefix;
    }
    D.setConfig(key, v);
    updated.push(key);
  }
  D.audit(req.user, 'config_update', 'config', 'doc_config', { updated });
  res.json({ items: db.prepare('SELECT * FROM doc_config ORDER BY key').all() });
});

router.get('/admin/blacklist', manageAuth, (_req, res) => {
  const items = db
    .prepare(
      `SELECT b.*, u.username FROM doc_blacklist b LEFT JOIN users u ON u.id = b.user_id ORDER BY b.created_at DESC, b.id DESC`
    )
    .all()
    .map((r) => ({ id: r.id, userId: r.user_id, username: r.username ?? `#${r.user_id}`, reason: r.reason, createdBy: r.created_by, createdAt: r.created_at }));
  res.json({ items });
});

router.post('/admin/blacklist', manageAuth, (req, res) => {
  const userId = Number(req.body?.userId);
  const user = userId ? db.prepare('SELECT * FROM users WHERE id = ?').get(userId) : null;
  if (!user) throw badRequest('VALIDATION_ERROR', 'userId invalid');
  if (D.isBlacklisted(userId)) throw conflict('DOC_DUPLICATE', 'Already blacklisted');
  const reason = sanitizeText(req.body?.reason, 200);
  db.prepare('INSERT INTO doc_blacklist (user_id, reason, created_by, created_at) VALUES (?, ?, ?, ?)').run(
    userId,
    reason,
    req.user.displayName || req.user.username,
    now()
  );
  D.audit(req.user, 'blacklist_add', 'user', String(userId), { reason });
  res.json({ ok: true });
});

router.delete('/admin/blacklist/:userId', manageAuth, (req, res) => {
  db.prepare('DELETE FROM doc_blacklist WHERE user_id = ?').run(Number(req.params.userId));
  D.audit(req.user, 'blacklist_remove', 'user', String(req.params.userId));
  res.json({ ok: true });
});

router.get('/admin/stats', manageAuth, (_req, res) => {
  D.sweepAll();
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  const appByStatus = Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) AS n FROM doc_applications GROUP BY status').all().map((r) => [r.status, r.n])
  );
  const byType = db
    .prepare(
      `SELECT a.type_code AS code, t.name AS name, COUNT(*) AS n FROM doc_applications a LEFT JOIN doc_types t ON t.code = a.type_code GROUP BY a.type_code ORDER BY n DESC`
    )
    .all();
  const decided = (appByStatus.approved || 0) + (appByStatus.rejected || 0);
  const approvalRate = decided ? (appByStatus.approved || 0) / decided : null;
  const rejectRate = decided ? (appByStatus.rejected || 0) / decided : null;
  const submitted = count("SELECT COUNT(*) AS n FROM doc_applications WHERE submitted_at IS NOT NULL");
  const supplementCount = count("SELECT COUNT(*) AS n FROM doc_records WHERE action = 'supplement_requested'");
  const avgHoursRow = db
    .prepare(
      `SELECT AVG((julianday(decided_at) - julianday(submitted_at)) * 24) AS h FROM doc_applications WHERE decided_at IS NOT NULL AND submitted_at IS NOT NULL`
    )
    .get();
  const certByStatus = Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) AS n FROM doc_certificates GROUP BY status').all().map((r) => [r.status, r.n])
  );
  const certTotal = count('SELECT COUNT(*) AS n FROM doc_certificates');
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const verifyTotal = count('SELECT COUNT(*) AS n FROM doc_verify_logs');
  const verify24 = count('SELECT COUNT(*) AS n FROM doc_verify_logs WHERE created_at >= ?', since24);
  const verifyValid = count("SELECT COUNT(*) AS n FROM doc_verify_logs WHERE result IN ('found','found_self')");
  const rejectReasons = db
    .prepare('SELECT reject_code AS code, COUNT(*) AS n FROM doc_applications WHERE reject_code IS NOT NULL GROUP BY reject_code ORDER BY n DESC')
    .all();
  res.json({
    applications: { total: count('SELECT COUNT(*) AS n FROM doc_applications'), byStatus: appByStatus, byType, approvalRate, rejectRate, supplementRate: submitted ? supplementCount / submitted : null, avgReviewHours: avgHoursRow?.h ?? null },
    certificates: { total: certTotal, byStatus: certByStatus },
    verify: { total: verifyTotal, last24h: verify24, validRate: verifyTotal ? verifyValid / verifyTotal : null },
    rejectReasons,
  });
});

router.get('/admin/audit', manageAuth, (req, res) => {
  const { page, pageSize, offset } = getPaging(req.query);
  const params = [];
  let where = '1 = 1';
  const action = sanitizeText(req.query.action, 60);
  if (action && action !== 'all') {
    where += ' AND action LIKE ?';
    params.push(`%${action}%`);
  }
  const q = sanitizeText(req.query.q, 64);
  if (q) {
    where += ' AND (target_id LIKE ? OR actor_name LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM doc_audit WHERE ${where}`).get(...params).n;
  const items = db
    .prepare(`SELECT * FROM doc_audit WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset)
    .map((r) => ({
      id: r.id,
      actorName: r.actor_name,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail,
      createdAt: r.created_at,
    }));
  res.json({ items, total, page, pageSize });
});

// ---------------------------------------------------------------------------
// Multer error mapping — keep API error shape consistent.
// ---------------------------------------------------------------------------

router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'DOC_FILE_TOO_LARGE' : 'VALIDATION_ERROR';
    return res.status(400).json({ code, message: err.message });
  }
  if (err instanceof Error && err.type === 'entity.parse.failed') {
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body' });
  }
  return next(err);
});

export default router;
