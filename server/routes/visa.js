// 奶龍國簽註申請署 — user-facing endpoints. Materials live under the private
// data dir and are only reachable through the authenticated download route.
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, forbidden, notFound } from '../http.js';
import {
  audit,
  clientIp,
  getConfigNumber,
  maskPermit,
  nextApplicationNo,
  rateLimit,
  sendMsg,
  serializeApplication,
  serializeMaterial,
  serializeMessage,
  serializePermit,
  serializeType,
  sweepAll,
} from '../visa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NAILONG_DATA_DIR || path.join(__dirname, '..', 'data');
export const visaUploadsRoot = path.join(dataDir, 'uploads', 'visa');
fs.mkdirSync(visaUploadsRoot, { recursive: true });

const router = Router();
const ACTIVE_STATUSES = ['pending_review', 'supplement_required'];
const MAX_MATERIAL_BYTES = 5 * 1024 * 1024;
const MAX_MATERIALS_PER_APP = 6;
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const KINDS = new Set(['avatar', 'invitation', 'proof', 'other']);

// ---------------------------------------------------------------------------
// Uploads (private storage)
// ---------------------------------------------------------------------------

const tmpDir = path.join(visaUploadsRoot, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

// Multer 只负责把文件安全落到临时目录:applicationId 在 multipart 文本字段里,
// 要等 multer 解析完 req.body 才拿得到,之后再校验并把文件挪进申请目录。
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
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'VISA_FILE_TOO_LARGE' : 'VALIDATION_ERROR';
    return next(badRequest(code, err.message));
  }
  next(err);
}

function loadOwnApplication(req) {
  const row = db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Application not found');
  if (req.user.id !== row.user_id) throw forbidden('FORBIDDEN', 'Not your application');
  return row;
}

function deleteMaterialFile(material) {
  const full = path.join(visaUploadsRoot, material.path);
  fs.rm(full, { force: true }, () => {});
}

function validateApplicationFields(body) {
  const str = (v, { min = 0, max = 255 } = {}) => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') throw badRequest('VALIDATION_ERROR', 'Expected string field');
    return v.trim().slice(0, max);
  };
  const out = {
    nickname: str(body.nickname, { max: 40 }),
    contact: str(body.contact, { max: 100 }),
    virtualId: str(body.virtualId, { max: 200 }),
    purpose: str(body.purpose, { max: 500 }),
    itinerary: str(body.itinerary, { max: 2000 }),
    inviterName: str(body.inviterName, { max: 40 }),
    inviterContact: str(body.inviterContact, { max: 100 }),
    companions: str(body.companions, { max: 200 }),
  };
  for (const key of ['nickname', 'contact', 'purpose', 'itinerary']) {
    if (!out[key]) throw badRequest('VISA_FIELD_REQUIRED', `Missing required field: ${key}`);
  }
  for (const key of ['planArrive', 'planLeave']) {
    const v = body[key];
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw badRequest('VISA_FIELD_REQUIRED', `Missing required field: ${key}`);
    }
    out[key] = v;
  }
  if (out.planLeave <= out.planArrive) throw badRequest('VISA_DATES_INVALID', 'planLeave must be after planArrive');
  return out;
}

function applicationWithMeta(row) {
  const typeRow = db.prepare('SELECT * FROM visa_types WHERE code = ?').get(row.type_code);
  const materials = db
    .prepare('SELECT * FROM visa_materials WHERE application_id = ? ORDER BY id')
    .all(row.id)
    .map(serializeMaterial);
  const reviews = db
    .prepare('SELECT * FROM visa_reviews WHERE application_id = ? ORDER BY id')
    .all(row.id)
    .map((r) => ({
      id: r.id,
      action: r.action,
      reasonCode: r.reason_code,
      comment: r.comment,
      reviewerName: r.reviewer_name,
      createdAt: r.created_at,
    }));
  return {
    ...serializeApplication(row, { withPermit: true }),
    typeName: typeRow?.name ?? row.type_code,
    validDays: typeRow?.valid_days ?? null,
    stayDays: typeRow?.stay_days ?? null,
    materials,
    reviews,
  };
}

// ---------------------------------------------------------------------------
// 验真中心 — public (rate limited, no personal data), registered before the
// authenticated section so it stays anonymous.
// ---------------------------------------------------------------------------

router.get('/verify', (req, res) => {
  const limit = getConfigNumber('visa.verify_limit_per_5min', 30);
  const ip = clientIp(req);
  if (!rateLimit(`verify:${ip}`, limit, 5 * 60_000)) {
    db.prepare('INSERT INTO visa_verify_logs (query, ip, result, created_at) VALUES (?, ?, ?, ?)').run(
      String(req.query.no || req.query.token || '').slice(0, 64),
      ip,
      'rate_limited',
      now()
    );
    throw badRequest('VISA_VERIFY_LIMITED', 'Too many verification attempts, please try later');
  }
  const token = String(req.query.token || '').trim();
  const no = String(req.query.no || '').trim().toUpperCase();
  if (!token && !no) throw badRequest('VALIDATION_ERROR', 'Provide ?no= or ?token=');
  sweepAll();
  let permit = null;
  if (token) {
    permit = db.prepare('SELECT * FROM visa_permits WHERE verify_token = ?').get(token);
  } else {
    permit =
      db.prepare('SELECT * FROM visa_permits WHERE visa_no = ?').get(no) ||
      db
        .prepare('SELECT * FROM visa_permits WHERE application_id = (SELECT id FROM visa_applications WHERE app_no = ?)')
        .get(no);
  }
  const typeRow = permit ? db.prepare('SELECT * FROM visa_types WHERE code = ?').get(permit.type_code) : null;
  const result = maskPermit(permit, typeRow);
  db.prepare('INSERT INTO visa_verify_logs (query, ip, result, created_at) VALUES (?, ?, ?, ?)').run(
    (token ? `token:${token.slice(0, 8)}…` : no).slice(0, 64),
    ip,
    result.found ? (result.valid ? 'valid' : result.status) : 'not_found',
    now()
  );
  res.json({ ...result, disclaimer: true });
});

// Everything below requires a signed-in user with the apply permission.
router.use(authenticate, requirePermission('visa:apply'));

// ---------------------------------------------------------------------------
// Home / types
// ---------------------------------------------------------------------------

router.get('/home', (req, res) => {
  sweepAll();
  const notices = db
    .prepare('SELECT * FROM visa_notices WHERE enabled = 1 ORDER BY id DESC LIMIT 10')
    .all()
    .map((n) => ({ id: n.id, title: n.title, body: n.body, level: n.level, createdAt: n.created_at }));
  const types = db
    .prepare('SELECT * FROM visa_types WHERE enabled = 1 ORDER BY sort_order, id')
    .all()
    .map(serializeType);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM visa_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  res.json({
    notices,
    types,
    reviewHoursHint: getConfigNumber('visa.review_hours_hint', 72),
    unread,
  });
});

router.get('/types', (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM visa_types WHERE enabled = 1 ORDER BY sort_order, id').all().map(serializeType) });
});

// ---------------------------------------------------------------------------
// Applications: draft lifecycle
// ---------------------------------------------------------------------------

router.get('/applications', (req, res) => {
  sweepAll();
  const rows = db
    .prepare('SELECT * FROM visa_applications WHERE user_id = ? ORDER BY id DESC LIMIT 100')
    .all(req.user.id);
  res.json({
    items: rows.map((row) => {
      const typeRow = db.prepare('SELECT name FROM visa_types WHERE code = ?').get(row.type_code);
      const permit = db.prepare('SELECT * FROM visa_permits WHERE application_id = ?').get(row.id);
      return { ...serializeApplication(row), typeName: typeRow?.name ?? row.type_code, permit: serializePermit(permit) };
    }),
  });
});

router.post('/applications', (req, res) => {
  const typeCode = String(req.body?.typeCode || '').trim();
  const typeRow = db.prepare('SELECT * FROM visa_types WHERE code = ? AND enabled = 1').get(typeCode);
  if (!typeRow) throw badRequest('VISA_TYPE_UNAVAILABLE', 'Visa type not available');
  const ts = now();
  const appNo = nextApplicationNo();
  const info = db
    .prepare(
      `INSERT INTO visa_applications (app_no, user_id, type_code, status, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?)`
    )
    .run(appNo, req.user.id, typeCode, ts, ts);
  res.status(201).json({
    application: serializeApplication(db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(info.lastInsertRowid)),
  });
});

router.put('/applications/:id', (req, res) => {
  const app = loadOwnApplication(req);
  if (app.status !== 'draft') throw badRequest('VISA_NOT_EDITABLE', 'Only drafts can be edited');
  const fields = validateApplicationFields({ ...serializeApplication(app), ...req.body });
  db.prepare(
    `UPDATE visa_applications SET nickname=@nickname, contact=@contact, virtual_id=@virtualId, purpose=@purpose,
     plan_arrive=@planArrive, plan_leave=@planLeave, itinerary=@itinerary, inviter_name=@inviterName,
     inviter_contact=@inviterContact, companions=@companions, updated_at=@ts WHERE id=@id`
  ).run({ ...fields, ts: now(), id: app.id });
  res.json({ application: applicationWithMeta(db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(app.id)) });
});

router.delete('/applications/:id', (req, res) => {
  const app = loadOwnApplication(req);
  if (app.status !== 'draft') throw badRequest('VISA_NOT_EDITABLE', 'Only drafts can be deleted');
  const materials = db.prepare('SELECT * FROM visa_materials WHERE application_id = ?').all(app.id);
  for (const m of materials) deleteMaterialFile(m);
  db.prepare('DELETE FROM visa_materials WHERE application_id = ?').run(app.id);
  db.prepare('DELETE FROM visa_applications WHERE id = ?').run(app.id);
  fs.rm(path.join(visaUploadsRoot, String(app.id)), { recursive: true, force: true }, () => {});
  res.json({ ok: true });
});

router.post('/applications/:id/submit', (req, res) => {
  sweepAll();
  const app = loadOwnApplication(req);
  if (app.status !== 'draft') throw badRequest('VISA_NOT_EDITABLE', 'Application already submitted');
  if (db.prepare('SELECT 1 FROM visa_blacklist WHERE user_id = ?').get(req.user.id)) {
    throw forbidden('VISA_BLACKLISTED', 'Account is restricted from applying');
  }
  const active = db
    .prepare(`SELECT COUNT(*) AS n FROM visa_applications WHERE user_id = ? AND status IN ('pending_review','supplement_required')`)
    .get(req.user.id).n;
  if (active >= 3) throw badRequest('VISA_TOO_MANY_ACTIVE', 'Too many applications under review');
  if (req.body?.entertainmentAgreed !== true) {
    throw badRequest('VISA_AGREEMENT_REQUIRED', 'Entertainment disclaimer must be accepted');
  }
  const fields = validateApplicationFields({ ...serializeApplication(app), ...req.body });
  const materials = db.prepare('SELECT * FROM visa_materials WHERE application_id = ?').all(app.id);
  if (!materials.some((m) => m.kind === 'avatar')) {
    throw badRequest('VISA_AVATAR_REQUIRED', 'An avatar image is required');
  }
  // 防重复提交:限流放在校验之后,失败的重试不消耗窗口
  if (!rateLimit(`submit:${req.user.id}`, 1, 60_000)) {
    throw badRequest('VISA_RATE_LIMITED', 'Please wait a minute before submitting again');
  }
  db.prepare(
    `UPDATE visa_applications SET nickname=@nickname, contact=@contact, virtual_id=@virtualId, purpose=@purpose,
     plan_arrive=@planArrive, plan_leave=@planLeave, itinerary=@itinerary, inviter_name=@inviterName,
     inviter_contact=@inviterContact, companions=@companions, entertainment_agreed=1,
     status='pending_review', review_stage='initial', submitted_at=@ts, updated_at=@ts WHERE id=@id`
  ).run({ ...fields, ts: now(), id: app.id });
  sendMsg(req.user.id, app.id, 'submitted', {
    appNo: app.app_no,
    hours: getConfigNumber('visa.review_hours_hint', 72),
  });
  audit(req.user, 'submit_application', 'application', app.app_no);
  res.json({ application: applicationWithMeta(db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(app.id)) });
});

router.post('/applications/:id/withdraw', (req, res) => {
  const app = loadOwnApplication(req);
  if (!ACTIVE_STATUSES.includes(app.status)) {
    throw badRequest('VISA_INVALID_TRANSITION', 'Application cannot be withdrawn in current status');
  }
  db.prepare("UPDATE visa_applications SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(now(), app.id);
  sendMsg(req.user.id, app.id, 'withdrawn', { appNo: app.app_no });
  audit(req.user, 'withdraw_application', 'application', app.app_no);
  res.json({ application: applicationWithMeta(db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(app.id)) });
});

// 补件:supplement_required 状态下提交补件说明,把新上传材料(origin=supplement)随申请重新送审
router.post('/applications/:id/supplement', (req, res) => {
  sweepAll();
  const app = loadOwnApplication(req);
  if (app.status !== 'supplement_required') throw badRequest('VISA_INVALID_TRANSITION', 'Application is not awaiting supplements');
  if (app.supplement_deadline && app.supplement_deadline < now()) {
    throw badRequest('VISA_SUPPLEMENT_EXPIRED', 'Supplement deadline has passed');
  }
  const note = String(req.body?.note || '').trim().slice(0, 500);
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM visa_materials WHERE application_id = ? AND origin = 'supplement'")
    .get(app.id).n;
  if (pending === 0 && !note) throw badRequest('VISA_SUPPLEMENT_EMPTY', 'Nothing to supplement');
  db.prepare(
    `UPDATE visa_applications SET supplement_note = CASE WHEN ? != '' THEN ? ELSE supplement_note END,
     status = 'pending_review', updated_at = ? WHERE id = ?`
  ).run(note, note, now(), app.id);
  audit(req.user, 'supplement_application', 'application', app.app_no, { materials: pending });
  res.json({ application: applicationWithMeta(db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(app.id)) });
});

router.get('/applications/:id', (req, res) => {
  sweepAll();
  const app = loadOwnApplication(req);
  res.json({ application: applicationWithMeta(app) });
});

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

function uploadMaterial(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return mapMulterError(err, req, res, next);
    next();
  });
}

router.post('/materials', uploadMaterial, (req, res) => {
  const app = db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(Number(req.body?.applicationId));
  if (!app || app.user_id !== req.user.id) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    throw notFound('Application not found');
  }
  if (!['draft', 'supplement_required'].includes(app.status)) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    throw badRequest('VISA_NOT_EDITABLE', 'Materials can only be added to drafts or during supplement');
  }
  const kind = KINDS.has(req.body?.kind) ? req.body.kind : 'other';
  const file = req.file;
  if (!file) throw badRequest('VALIDATION_ERROR', 'file is required');
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    fs.rm(file.path, { force: true }, () => {});
    throw badRequest('VISA_FILE_TYPE', `Unsupported file type: ${file.mimetype}`);
  }
  const count = db.prepare('SELECT COUNT(*) AS n FROM visa_materials WHERE application_id = ?').get(app.id).n;
  if (count >= MAX_MATERIALS_PER_APP) {
    fs.rm(file.path, { force: true }, () => {});
    throw badRequest('VISA_TOO_MANY_FILES', `At most ${MAX_MATERIALS_PER_APP} files per application`);
  }
  // 头像只保留一张:新头像顶替旧头像
  if (kind === 'avatar') {
    for (const old of db.prepare("SELECT * FROM visa_materials WHERE application_id = ? AND kind = 'avatar'").all(app.id)) {
      deleteMaterialFile(old);
      db.prepare('DELETE FROM visa_materials WHERE id = ?').run(old.id);
    }
  }
  const appDir = path.join(visaUploadsRoot, String(app.id));
  fs.mkdirSync(appDir, { recursive: true });
  fs.renameSync(file.path, path.join(appDir, file.filename));
  const info = db
    .prepare(
      `INSERT INTO visa_materials (application_id, user_id, kind, origin, filename, mime, size, path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      app.id,
      req.user.id,
      kind,
      app.status === 'supplement_required' ? 'supplement' : 'initial',
      (file.originalname || 'file').slice(0, 120),
      file.mimetype,
      file.size,
      path.join(String(app.id), file.filename),
      now()
    );
  res.status(201).json({ material: serializeMaterial(db.prepare('SELECT * FROM visa_materials WHERE id = ?').get(info.lastInsertRowid)) });
});

router.delete('/materials/:id', (req, res) => {
  const material = db.prepare('SELECT * FROM visa_materials WHERE id = ?').get(Number(req.params.id));
  if (!material || material.user_id !== req.user.id) throw notFound('Material not found');
  const app = db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(material.application_id);
  if (!app || !['draft', 'supplement_required'].includes(app.status)) {
    throw badRequest('VISA_NOT_EDITABLE', 'Materials are locked in current status');
  }
  deleteMaterialFile(material);
  db.prepare('DELETE FROM visa_materials WHERE id = ?').run(material.id);
  res.json({ ok: true });
});

// 受限下载:本人或持审核权限者;绝不暴露静态目录
router.get('/materials/:id/file', (req, res) => {
  const material = db.prepare('SELECT * FROM visa_materials WHERE id = ?').get(Number(req.params.id));
  if (!material) throw notFound('Material not found');
  const isOwner = material.user_id === req.user.id;
  const isReviewer = (req.user.permissions || []).includes('visa:review');
  if (!isOwner && !isReviewer) throw forbidden('FORBIDDEN', 'No access to this file');
  const full = path.resolve(visaUploadsRoot, material.path);
  if (!full.startsWith(visaUploadsRoot) || !fs.existsSync(full)) throw notFound('File missing');
  res.setHeader('Content-Type', material.mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(material.filename)}`);
  fs.createReadStream(full).pipe(res);
});

// ---------------------------------------------------------------------------
// Permits (电子签注)
// ---------------------------------------------------------------------------

router.get('/permits', (req, res) => {
  sweepAll();
  const rows = db.prepare('SELECT * FROM visa_permits WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({
    items: rows.map((p) => {
      const app = db.prepare('SELECT app_no FROM visa_applications WHERE id = ?').get(p.application_id);
      const typeRow = db.prepare('SELECT name FROM visa_types WHERE code = ?').get(p.type_code);
      return { ...serializePermit(p), appNo: app?.app_no, typeName: typeRow?.name ?? p.type_code };
    }),
  });
});

router.get('/permits/:visaNo', (req, res) => {
  sweepAll();
  const permit = db.prepare('SELECT * FROM visa_permits WHERE visa_no = ?').get(String(req.params.visaNo));
  if (!permit || permit.user_id !== req.user.id) throw notFound('Permit not found');
  const app = db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(permit.application_id);
  const typeRow = db.prepare('SELECT * FROM visa_types WHERE code = ?').get(permit.type_code);
  res.json({ permit: { ...serializePermit(permit), appNo: app?.app_no, typeName: typeRow?.name ?? permit.type_code } });
});

// ---------------------------------------------------------------------------
// 站内信
// ---------------------------------------------------------------------------

router.get('/messages', (req, res) => {
  const archived = req.query.archived === '1' ? 1 : 0;
  const rows = db
    .prepare('SELECT * FROM visa_messages WHERE user_id = ? AND archived = ? ORDER BY id DESC LIMIT 100')
    .all(req.user.id, archived);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM visa_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  res.json({ items: rows.map(serializeMessage), unread });
});

router.post('/messages/:id/read', (req, res) => {
  db.prepare('UPDATE visa_messages SET read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/archive', (req, res) => {
  db.prepare('UPDATE visa_messages SET archived = 1, read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 隐私:数据删除(匿名化本人签注数据,保留编号与状态轨迹供审计)
// ---------------------------------------------------------------------------

router.post('/privacy/erase', (req, res) => {
  const active = db
    .prepare(
      `SELECT COUNT(*) AS n FROM visa_applications WHERE user_id = ? AND status IN ('draft','pending_review','supplement_required')`
    )
    .get(req.user.id).n;
  if (active > 0) throw badRequest('VISA_ERASE_BLOCKED', 'Withdraw active applications before requesting deletion');
  const materials = db
    .prepare('SELECT vm.* FROM visa_materials vm JOIN visa_applications va ON va.id = vm.application_id WHERE va.user_id = ?')
    .all(req.user.id);
  for (const m of materials) deleteMaterialFile(m);
  db.prepare('DELETE FROM visa_materials WHERE user_id = ?').run(req.user.id);
  db.prepare(
    `UPDATE visa_applications SET nickname='', contact='', virtual_id='', purpose='', itinerary='',
     inviter_name='', inviter_contact='', companions='', updated_at = ? WHERE user_id = ?`
  ).run(now(), req.user.id);
  db.prepare('UPDATE visa_permits SET holder_name = "", updated_at = ? WHERE user_id = ?').run(now(), req.user.id);
  db.prepare('UPDATE visa_messages SET archived = 1, read = 1 WHERE user_id = ?').run(req.user.id);
  audit(req.user, 'privacy_erase', 'user', req.user.id);
  res.json({ ok: true });
});

export default router;
