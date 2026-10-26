// 奶龙国皇家居民登记署 — user-facing endpoints. Materials live under the
// private data dir and are only reachable through the authenticated download
// route; the verify center is public (rate limited, masked, no personal data).
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, forbidden, notFound } from '../http.js';
import { ensureResidentSchema } from './schema.js';
import {
  ACTIVE_APP_STATUSES,
  activeApplicationCount,
  activeReviewCount,
  audit,
  clientIp,
  getConfig,
  getConfigNumber,
  isBlacklisted,
  maskCard,
  nextApplicationNo,
  nextChangeNo,
  notify,
  rateLimit,
  serializeApplication,
  serializeCard,
  serializeChange,
  serializeMaterial,
  serializeMessage,
  serializeResident,
  serializeType,
  sweepAll,
} from './util.js';
import { residentChannels } from '../linkage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
ensureResidentSchema();
const dataDir = process.env.NAILONG_DATA_DIR || path.join(__dirname, '..', 'data');
export const residentUploadsRoot = path.join(dataDir, 'uploads', 'resident');
fs.mkdirSync(residentUploadsRoot, { recursive: true });

const router = Router();
const MAX_MATERIAL_BYTES = 5 * 1024 * 1024;
const MAX_MATERIALS_PER_APP = 6;
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const KINDS = new Set(['avatar', 'address_proof', 'other']);
const PURPOSES = new Set(['collect', 'activity', 'visa_fast', 'other']);
const CHANGE_TYPES = new Set(['info', 'upgrade', 'renewal']);

// ---------------------------------------------------------------------------
// Uploads (private storage)
// ---------------------------------------------------------------------------

const tmpDir = path.join(residentUploadsRoot, 'tmp');
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
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'RES_FILE_TOO_LARGE' : 'VALIDATION_ERROR';
    return next(badRequest(code, err.message));
  }
  next(err);
}

function loadOwnApplication(req) {
  const row = db.prepare('SELECT * FROM res_applications WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Application not found');
  if (req.user.id !== row.user_id) throw forbidden('FORBIDDEN', 'Not your application');
  return row;
}

function deleteMaterialFile(material) {
  const full = path.join(residentUploadsRoot, material.path);
  fs.rm(full, { force: true }, () => {});
}

function applicationWithMeta(row) {
  const typeRow = db.prepare('SELECT * FROM res_types WHERE code = ?').get(row.type_code);
  const materials = db
    .prepare('SELECT * FROM res_materials WHERE application_id = ? ORDER BY id')
    .all(row.id)
    .map(serializeMaterial);
  const reviews = db
    .prepare('SELECT * FROM res_reviews WHERE application_id = ? ORDER BY id')
    .all(row.id)
    .map((r) => ({
      id: r.id,
      action: r.action,
      reasonCode: r.reason_code,
      comment: r.comment,
      reviewerName: r.reviewer_name,
      createdAt: r.created_at,
    }));
  const card = db.prepare('SELECT * FROM res_cards WHERE application_id = ? ORDER BY id DESC LIMIT 1').get(row.id);
  return {
    ...serializeApplication(row),
    typeName: typeRow?.name ?? row.type_code,
    validYears: typeRow?.valid_years ?? null,
    materials,
    reviews,
    card: serializeCard(card),
  };
}

function validateApplicationFields(body) {
  const str = (v, { max = 255 } = {}) => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') throw badRequest('VALIDATION_ERROR', 'Expected string field');
    return v.trim().slice(0, max);
  };
  const out = {
    nickname: str(body.nickname, { max: 40 }),
    contact: str(body.contact, { max: 100 }),
    virtualAddress: str(body.virtualAddress, { max: 200 }),
    bio: str(body.bio, { max: 500 }),
  };
  if (!out.nickname) throw badRequest('RES_FIELD_REQUIRED', 'Missing required field: nickname');
  if (!out.contact) throw badRequest('RES_FIELD_REQUIRED', 'Missing required field: contact');
  if (body.purposes !== undefined) {
    if (!Array.isArray(body.purposes)) throw badRequest('VALIDATION_ERROR', 'purposes must be an array');
    const purposes = [...new Set(body.purposes.map(String))];
    if (purposes.length === 0) throw badRequest('RES_PURPOSE_REQUIRED', 'Pick at least one purpose');
    for (const p of purposes) {
      if (!PURPOSES.has(p)) throw badRequest('VALIDATION_ERROR', `Unknown purpose: ${p}`);
    }
    out.purposes = purposes;
  }
  return out;
}

function assertCanApply(userId, { excludeDrafts = false } = {}) {
  if (isBlacklisted(userId)) throw forbidden('RES_BLACKLISTED', 'Account is restricted from applying');
  if (getConfig('res.one_identity_per_account', '1') === '1' && db.prepare('SELECT 1 FROM res_residents WHERE user_id = ?').get(userId)) {
    throw badRequest('RES_IDENTITY_EXISTS', 'This account already holds a resident identity');
  }
  const maxActive = getConfigNumber('res.max_active_applications', 1);
  const count = excludeDrafts ? activeReviewCount(userId) : activeApplicationCount(userId);
  if (count >= maxActive) {
    throw badRequest('RES_TOO_MANY_ACTIVE', 'Too many applications in progress');
  }
}

// ---------------------------------------------------------------------------
// 验真中心 — public (rate limited, masked), registered before auth.
// ---------------------------------------------------------------------------

router.get('/verify', (req, res) => {
  const limit = getConfigNumber('res.verify_limit_per_5min', 30);
  const ip = clientIp(req);
  if (!rateLimit(`res-verify:${ip}`, limit, 5 * 60_000)) {
    db.prepare('INSERT INTO res_verify_logs (query, ip, result, source, created_at) VALUES (?, ?, ?, ?, ?)').run(
      String(req.query.no || req.query.token || '').slice(0, 64), ip, 'rate_limited', 'web', now()
    );
    throw badRequest('RES_VERIFY_LIMITED', 'Too many verification attempts, please try later');
  }
  const token = String(req.query.token || '').trim();
  const no = String(req.query.no || '').trim().toUpperCase();
  if (!token && !no) throw badRequest('VALIDATION_ERROR', 'Provide ?no= or ?token=');
  sweepAll();
  let card = null;
  if (token) {
    card = db.prepare('SELECT * FROM res_cards WHERE verify_token = ?').get(token);
  } else {
    // 编号或登记申请编号都可以验真
    card =
      db.prepare('SELECT * FROM res_cards WHERE card_no = ?').get(no) ||
      db
        .prepare('SELECT * FROM res_cards WHERE application_id = (SELECT id FROM res_applications WHERE app_no = ?)')
        .get(no);
  }
  const typeRow = card ? db.prepare('SELECT * FROM res_types WHERE code = ?').get(card.type_code) : null;
  const result = maskCard(card, typeRow);
  db.prepare('INSERT INTO res_verify_logs (query, ip, result, source, created_at) VALUES (?, ?, ?, ?, ?)').run(
    (token ? `token:${token.slice(0, 8)}…` : no).slice(0, 64),
    ip,
    result.found ? (result.valid ? 'valid' : result.status) : 'not_found',
    'web',
    now()
  );
  res.json(result);
});

// Everything below requires a signed-in user with the portal permission.
router.use(authenticate, requirePermission('res:portal'));

// ---------------------------------------------------------------------------
// Home / types / guide
// ---------------------------------------------------------------------------

router.get('/home', (req, res) => {
  sweepAll();
  const notices = db
    .prepare('SELECT * FROM res_notices WHERE enabled = 1 ORDER BY id DESC LIMIT 10')
    .all()
    .map((n) => ({ id: n.id, title: n.title, body: n.body, level: n.level, createdAt: n.created_at }));
  const types = db
    .prepare('SELECT * FROM res_types WHERE enabled = 1 ORDER BY sort_order, id')
    .all()
    .map(serializeType);
  const myApp = db
    .prepare("SELECT * FROM res_applications WHERE user_id = ? AND status IN ('draft','pending_review','supplement_required') ORDER BY id DESC LIMIT 1")
    .get(req.user.id);
  const myCard = db
    .prepare("SELECT * FROM res_cards WHERE user_id = ? AND status IN ('valid','frozen') ORDER BY id DESC LIMIT 1")
    .get(req.user.id);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM res_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  res.json({
    notices,
    types,
    myApplication: myApp ? serializeApplication(myApp) : null,
    myCard: myCard ? serializeCard(myCard) : null,
    reviewHoursHint: getConfigNumber('res.review_hours_hint', 72),
    unread,
  });
});

router.get('/types', (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM res_types WHERE enabled = 1 ORDER BY sort_order, id').all().map(serializeType) });
});

router.get('/types/:code', (req, res) => {
  const row = db.prepare('SELECT * FROM res_types WHERE code = ? AND enabled = 1').get(String(req.params.code).toUpperCase());
  if (!row) throw notFound('Resident type not found');
  res.json({ type: serializeType(row) });
});

// ---------------------------------------------------------------------------
// Applications: draft lifecycle
// ---------------------------------------------------------------------------

router.get('/applications', (req, res) => {
  sweepAll();
  const rows = db.prepare('SELECT * FROM res_applications WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({
    items: rows.map((row) => {
      const typeRow = db.prepare('SELECT name FROM res_types WHERE code = ?').get(row.type_code);
      const card = db.prepare('SELECT * FROM res_cards WHERE application_id = ? ORDER BY id DESC LIMIT 1').get(row.id);
      return { ...serializeApplication(row), typeName: typeRow?.name ?? row.type_code, card: serializeCard(card) };
    }),
  });
});

router.post('/applications', (req, res) => {
  sweepAll();
  assertCanApply(req.user.id);
  const typeCode = String(req.body?.typeCode || '').trim().toUpperCase();
  const typeRow = db.prepare('SELECT * FROM res_types WHERE code = ? AND enabled = 1').get(typeCode);
  if (!typeRow) throw badRequest('RES_TYPE_UNAVAILABLE', 'Resident type not available');
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO res_applications (app_no, user_id, type_code, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)`
    )
    .run(nextApplicationNo(), req.user.id, typeCode, ts, ts);
  audit(req.user, 'create_application', 'application', nextAppNo(info.lastInsertRowid));
  res.status(201).json({
    application: serializeApplication(db.prepare('SELECT * FROM res_applications WHERE id = ?').get(info.lastInsertRowid)),
  });
});

function nextAppNo(id) {
  return db.prepare('SELECT app_no FROM res_applications WHERE id = ?').get(id)?.app_no ?? id;
}

router.put('/applications/:id', (req, res) => {
  const app = loadOwnApplication(req);
  if (app.status !== 'draft') throw badRequest('RES_NOT_EDITABLE', 'Only drafts can be edited');
  const fields = validateApplicationFields({ ...serializeApplication(app), ...req.body });
  db.prepare(
    `UPDATE res_applications SET nickname=@nickname, contact=@contact, virtual_address=@virtualAddress, bio=@bio,
     purposes=@purposes, updated_at=@ts WHERE id=@id`
  ).run({
    nickname: fields.nickname,
    contact: fields.contact,
    virtualAddress: fields.virtualAddress,
    bio: fields.bio,
    purposes: JSON.stringify(fields.purposes ?? JSON.parse(app.purposes || '[]')),
    ts: now(),
    id: app.id,
  });
  res.json({ application: applicationWithMeta(db.prepare('SELECT * FROM res_applications WHERE id = ?').get(app.id)) });
});

router.delete('/applications/:id', (req, res) => {
  const app = loadOwnApplication(req);
  if (app.status !== 'draft') throw badRequest('RES_NOT_EDITABLE', 'Only drafts can be deleted');
  const materials = db.prepare('SELECT * FROM res_materials WHERE application_id = ?').all(app.id);
  for (const m of materials) deleteMaterialFile(m);
  db.prepare('DELETE FROM res_materials WHERE application_id = ?').run(app.id);
  db.prepare('DELETE FROM res_applications WHERE id = ?').run(app.id);
  fs.rm(path.join(residentUploadsRoot, String(app.id)), { recursive: true, force: true }, () => {});
  res.json({ ok: true });
});

router.post('/applications/:id/submit', (req, res) => {
  sweepAll();
  const app = loadOwnApplication(req);
  if (app.status !== 'draft') throw badRequest('RES_NOT_EDITABLE', 'Application already submitted');
  assertCanApply(req.user.id, { excludeDrafts: true });
  const typeRow = db.prepare('SELECT * FROM res_types WHERE code = ?').get(app.type_code);
  const fields = validateApplicationFields({ ...serializeApplication(app), ...req.body });
  const purposes = fields.purposes ?? JSON.parse(app.purposes || '[]');
  if (!purposes.length) throw badRequest('RES_PURPOSE_REQUIRED', 'Pick at least one purpose');
  const materials = db.prepare('SELECT * FROM res_materials WHERE application_id = ?').all(app.id);
  if (typeRow?.require_avatar && !materials.some((m) => m.kind === 'avatar')) {
    throw badRequest('RES_AVATAR_REQUIRED', 'An avatar image is required');
  }
  if (typeRow?.require_address_proof && !materials.some((m) => m.kind === 'address_proof')) {
    throw badRequest('RES_PROOF_REQUIRED', 'An address proof file is required');
  }
  if (!fields.virtualAddress && !app.virtual_address) {
    throw badRequest('RES_FIELD_REQUIRED', 'Missing required field: virtualAddress');
  }
  // 防重复提交:限流放在校验之后,失败的重试不消耗窗口
  if (!rateLimit(`res-submit:${req.user.id}`, 1, 60_000)) {
    throw badRequest('RES_RATE_LIMITED', 'Please wait a minute before submitting again');
  }
  db.prepare(
    `UPDATE res_applications SET nickname=@nickname, contact=@contact, virtual_address=@virtualAddress, bio=@bio,
     purposes=@purposes, status='pending_review', review_stage='initial',
     submitted_at=@ts, updated_at=@ts WHERE id=@id`
  ).run({
    nickname: fields.nickname,
    contact: fields.contact,
    virtualAddress: fields.virtualAddress || app.virtual_address,
    bio: fields.bio,
    purposes: JSON.stringify(purposes),
    ts: now(),
    id: app.id,
  });
  const fresh = db.prepare('SELECT * FROM res_applications WHERE id = ?').get(app.id);
  notify(req.user.id, 'submitted', { no: fresh.app_no, hours: getConfigNumber('res.review_hours_hint', 72) }, { appNo: fresh.app_no });
  audit(req.user, 'submit_application', 'application', fresh.app_no);
  res.json({ application: applicationWithMeta(fresh) });
});

router.post('/applications/:id/withdraw', (req, res) => {
  const app = loadOwnApplication(req);
  if (!ACTIVE_APP_STATUSES.includes(app.status)) {
    throw badRequest('RES_INVALID_TRANSITION', 'Application cannot be withdrawn in current status');
  }
  db.prepare("UPDATE res_applications SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(now(), app.id);
  notify(req.user.id, 'withdrawn', { no: app.app_no }, { appNo: app.app_no });
  audit(req.user, 'withdraw_application', 'application', app.app_no);
  res.json({ application: applicationWithMeta(db.prepare('SELECT * FROM res_applications WHERE id = ?').get(app.id)) });
});

// 补件:supplement_required 状态下提交补件说明,把新上传材料(origin=supplement)随申请重新送审
router.post('/applications/:id/supplement', (req, res) => {
  sweepAll();
  const app = loadOwnApplication(req);
  if (app.status !== 'supplement_required') throw badRequest('RES_INVALID_TRANSITION', 'Application is not awaiting supplements');
  if (app.supplement_deadline && app.supplement_deadline < now()) {
    throw badRequest('RES_SUPPLEMENT_EXPIRED', 'Supplement deadline has passed');
  }
  const note = String(req.body?.note || '').trim().slice(0, 500);
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM res_materials WHERE application_id = ? AND origin = 'supplement'")
    .get(app.id).n;
  if (pending === 0 && !note) throw badRequest('RES_SUPPLEMENT_EMPTY', 'Nothing to supplement');
  db.prepare(
    `UPDATE res_applications SET supplement_note = CASE WHEN ? != '' THEN ? ELSE supplement_note END,
     status = 'pending_review', updated_at = ? WHERE id = ?`
  ).run(note, note, now(), app.id);
  notify(req.user.id, 'supplement_received', { no: app.app_no }, { appNo: app.app_no });
  audit(req.user, 'supplement_application', 'application', app.app_no, { materials: pending });
  res.json({ application: applicationWithMeta(db.prepare('SELECT * FROM res_applications WHERE id = ?').get(app.id)) });
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
  const app = db.prepare('SELECT * FROM res_applications WHERE id = ?').get(Number(req.body?.applicationId));
  if (!app || app.user_id !== req.user.id) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    throw notFound('Application not found');
  }
  if (!['draft', 'supplement_required'].includes(app.status)) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    throw badRequest('RES_NOT_EDITABLE', 'Materials can only be added to drafts or during supplement');
  }
  const kind = KINDS.has(req.body?.kind) ? req.body.kind : 'other';
  const file = req.file;
  if (!file) throw badRequest('VALIDATION_ERROR', 'file is required');
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    fs.rm(file.path, { force: true }, () => {});
    throw badRequest('RES_FILE_TYPE', `Unsupported file type: ${file.mimetype}`);
  }
  const count = db.prepare('SELECT COUNT(*) AS n FROM res_materials WHERE application_id = ?').get(app.id).n;
  if (count >= MAX_MATERIALS_PER_APP) {
    fs.rm(file.path, { force: true }, () => {});
    throw badRequest('RES_TOO_MANY_FILES', `At most ${MAX_MATERIALS_PER_APP} files per application`);
  }
  // 头像只保留一张:新头像顶替旧头像
  if (kind === 'avatar') {
    for (const old of db.prepare("SELECT * FROM res_materials WHERE application_id = ? AND kind = 'avatar'").all(app.id)) {
      deleteMaterialFile(old);
      db.prepare('DELETE FROM res_materials WHERE id = ?').run(old.id);
    }
  }
  const appDir = path.join(residentUploadsRoot, String(app.id));
  fs.mkdirSync(appDir, { recursive: true });
  fs.renameSync(file.path, path.join(appDir, file.filename));
  const info = db
    .prepare(
      `INSERT INTO res_materials (application_id, user_id, kind, origin, filename, mime, size, path, created_at)
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
  res.status(201).json({ material: serializeMaterial(db.prepare('SELECT * FROM res_materials WHERE id = ?').get(info.lastInsertRowid)) });
});

router.delete('/materials/:id', (req, res) => {
  const material = db.prepare('SELECT * FROM res_materials WHERE id = ?').get(Number(req.params.id));
  if (!material || material.user_id !== req.user.id) throw notFound('Material not found');
  const app = db.prepare('SELECT * FROM res_applications WHERE id = ?').get(material.application_id);
  if (!app || !['draft', 'supplement_required'].includes(app.status)) {
    throw badRequest('RES_NOT_EDITABLE', 'Materials are locked in current status');
  }
  deleteMaterialFile(material);
  db.prepare('DELETE FROM res_materials WHERE id = ?').run(material.id);
  res.json({ ok: true });
});

// 受限下载:本人或持审核权限者;绝不暴露静态目录
router.get('/materials/:id/file', (req, res) => {
  const material = db.prepare('SELECT * FROM res_materials WHERE id = ?').get(Number(req.params.id));
  if (!material) throw notFound('Material not found');
  const isOwner = material.user_id === req.user.id;
  const isReviewer = (req.user.permissions || []).includes('res:review');
  if (!isOwner && !isReviewer) throw forbidden('FORBIDDEN', 'No access to this file');
  const full = path.resolve(residentUploadsRoot, material.path);
  if (!full.startsWith(residentUploadsRoot) || !fs.existsSync(full)) throw notFound('File missing');
  res.setHeader('Content-Type', material.mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(material.filename)}`);
  fs.createReadStream(full).pipe(res);
});

// ---------------------------------------------------------------------------
// 我的居民卡 + 居民信息
// ---------------------------------------------------------------------------

router.get('/card', (req, res) => {
  sweepAll();
  const card = db.prepare('SELECT * FROM res_cards WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
  if (!card) throw notFound('Resident card not found');
  const resident = db.prepare('SELECT * FROM res_residents WHERE user_id = ?').get(req.user.id);
  const typeRow = db.prepare('SELECT * FROM res_types WHERE code = ?').get(card.type_code);
  const app = db.prepare('SELECT app_no FROM res_applications WHERE id = ?').get(card.application_id);
  const changes = db
    .prepare('SELECT COUNT(*) AS n FROM res_changes WHERE user_id = ? AND status = ?')
    .get(req.user.id, 'pending_review').n;
  res.json({
    card: { ...serializeCard(card), appNo: app?.app_no, typeName: typeRow?.name ?? card.type_code },
    resident: resident ? serializeResident(resident) : null,
    pendingChanges: changes,
  });
});

// 补发/重新生成:换发新验真 token(居民编号保持不变),用于二维码泄露等情况
router.post('/card/reissue', (req, res) => {
  sweepAll();
  const card = db.prepare('SELECT * FROM res_cards WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
  if (!card) throw notFound('Resident card not found');
  if (!['valid', 'frozen'].includes(card.status)) {
    throw badRequest('RES_INVALID_TRANSITION', 'Only a valid or frozen card can be reissued');
  }
  db.prepare('UPDATE res_cards SET verify_token = ?, updated_at = ? WHERE id = ?').run(
    crypto.randomBytes(24).toString('hex'), now(), card.id
  );
  notify(req.user.id, 'card_reissued', { cardNo: card.card_no }, { cardNo: card.card_no });
  audit(req.user, 'self_reissue_card', 'card', card.card_no);
  const fresh = db.prepare('SELECT * FROM res_cards WHERE id = ?').get(card.id);
  res.json({ card: serializeCard(fresh) });
});

// ---------------------------------------------------------------------------
// 变更 / 升级 / 续期
// ---------------------------------------------------------------------------

router.get('/changes', (req, res) => {
  const rows = db.prepare('SELECT * FROM res_changes WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({ items: rows.map(serializeChange) });
});

router.post('/changes', (req, res) => {
  sweepAll();
  if (!rateLimit(`res-change:${req.user.id}`, 3, 60_000)) {
    throw badRequest('RES_RATE_LIMITED', 'Too many change requests, please wait a moment');
  }
  const card = db.prepare('SELECT * FROM res_cards WHERE user_id = ? AND status IN (\'valid\',\'frozen\',\'expired\') ORDER BY id DESC LIMIT 1').get(req.user.id);
  if (!card) throw badRequest('RES_CARD_REQUIRED', 'A resident card is required');
  const type = String(req.body?.type || '');
  if (!CHANGE_TYPES.has(type)) throw badRequest('VALIDATION_ERROR', 'Unknown change type');
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM res_changes WHERE user_id = ? AND status = 'pending_review'")
    .get(req.user.id).n;
  if (pending >= 3) throw badRequest('RES_TOO_MANY_CHANGES', 'Too many pending change requests');

  const payload = {};
  if (type === 'info') {
    const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
    const contact = str(req.body?.contact, 100);
    const virtualAddress = str(req.body?.virtualAddress, 200);
    const bio = str(req.body?.bio, 500);
    if (!contact && !virtualAddress && !bio) {
      throw badRequest('RES_CHANGE_EMPTY', 'Nothing to change');
    }
    if (contact !== undefined) payload.contact = contact;
    if (virtualAddress !== undefined) payload.virtualAddress = virtualAddress;
    if (bio !== undefined) payload.bio = bio;
  } else if (type === 'upgrade') {
    const targetCode = String(req.body?.targetTypeCode || '').trim().toUpperCase();
    const target = db.prepare('SELECT * FROM res_types WHERE code = ? AND enabled = 1').get(targetCode);
    if (!target) throw badRequest('RES_TYPE_UNAVAILABLE', 'Target resident type not available');
    if (target.code === card.type_code) throw badRequest('RES_UPGRADE_SAME_TYPE', 'Already this resident type');
    payload.targetTypeCode = target.code;
    payload.targetTypeName = target.name;
    payload.note = String(req.body?.note || '').trim().slice(0, 300);
  } else if (type === 'renewal') {
    const statusNow = sweepCardStatus(card);
    if (statusNow !== 'valid' && statusNow !== 'expired') {
      throw badRequest('RES_INVALID_TRANSITION', 'Frozen or voided cards cannot be renewed');
    }
    payload.currentValidUntil = card.valid_until;
  }

  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO res_changes (no, user_id, card_id, type, payload, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending_review', ?, ?)`
    )
    .run(nextChangeNo(), req.user.id, card.id, type, JSON.stringify(payload), ts, ts);
  audit(req.user, 'create_change', 'change', db.prepare('SELECT no FROM res_changes WHERE id = ?').get(info.lastInsertRowid)?.no, { type });
  res.status(201).json({ change: serializeChange(db.prepare('SELECT * FROM res_changes WHERE id = ?').get(info.lastInsertRowid)) });
});

function sweepCardStatus(card) {
  if (card.status === 'valid' && card.valid_until < now()) {
    db.prepare("UPDATE res_cards SET status = 'expired', updated_at = ? WHERE id = ?").run(now(), card.id);
    notify(card.user_id, 'card_expired', { cardNo: card.card_no }, { cardNo: card.card_no });
    return 'expired';
  }
  return card.status;
}

router.post('/changes/:id/cancel', (req, res) => {
  const row = db.prepare('SELECT * FROM res_changes WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Change not found');
  if (row.status !== 'pending_review') throw badRequest('RES_INVALID_TRANSITION', 'Only pending changes can be cancelled');
  db.prepare("UPDATE res_changes SET status = 'cancelled', updated_at = ? WHERE id = ?").run(now(), row.id);
  audit(req.user, 'cancel_change', 'change', row.no);
  res.json({ change: serializeChange(db.prepare('SELECT * FROM res_changes WHERE id = ?').get(row.id)) });
});

// ---------------------------------------------------------------------------
// 居民权益(趣味化 + 跨署联动通道)
// ---------------------------------------------------------------------------

router.get('/benefits', (req, res) => {
  sweepAll();
  const card = db.prepare('SELECT * FROM res_cards WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
  const typeRow = card ? db.prepare('SELECT * FROM res_types WHERE code = ?').get(card.type_code) : null;
  const announcements = db
    .prepare("SELECT id, title, body, level, created_at FROM res_notices WHERE enabled = 1 AND level = 'policy' ORDER BY id DESC LIMIT 5")
    .all();
  const channelInfo = residentChannels(req.user.id);
  res.json({
    card: card ? serializeCard(card) : null,
    typeName: typeRow?.name ?? null,
    benefits: typeRow?.benefits ?? '',
    duties: typeRow?.duties ?? '',
    announcements,
    // 联动快捷通道:按居民卡状态 + 各署真实配置下发可用性与跳转地址
    ...channelInfo,
  });
});

// ---------------------------------------------------------------------------
// 站内信
// ---------------------------------------------------------------------------

router.get('/messages', (req, res) => {
  const archived = req.query.archived === '1' ? 1 : 0;
  const rows = db
    .prepare('SELECT * FROM res_messages WHERE user_id = ? AND archived = ? ORDER BY id DESC LIMIT 100')
    .all(req.user.id, archived);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM res_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  res.json({ items: rows.map(serializeMessage), unread });
});

router.post('/messages/:id/read', (req, res) => {
  db.prepare('UPDATE res_messages SET read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/archive', (req, res) => {
  db.prepare('UPDATE res_messages SET archived = 1, read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 隐私:数据删除(匿名化本人居民数据,保留编号与状态轨迹供审计)
// ---------------------------------------------------------------------------

router.post('/privacy/erase', (req, res) => {
  const active = db
    .prepare(
      `SELECT COUNT(*) AS n FROM res_applications WHERE user_id = ? AND status IN ('draft','pending_review','supplement_required')`
    )
    .get(req.user.id).n;
  if (active > 0) throw badRequest('RES_ERASE_BLOCKED', 'Withdraw active applications before requesting deletion');
  const materials = db
    .prepare('SELECT rm.* FROM res_materials rm JOIN res_applications ra ON ra.id = rm.application_id WHERE ra.user_id = ?')
    .all(req.user.id);
  for (const m of materials) deleteMaterialFile(m);
  db.prepare('DELETE FROM res_materials WHERE user_id = ?').run(req.user.id);
  db.prepare(
    `UPDATE res_applications SET nickname='', contact='', virtual_address='', bio='', updated_at = ? WHERE user_id = ?`
  ).run(now(), req.user.id);
  db.prepare(
    `UPDATE res_residents SET nickname='', contact='', virtual_address='', bio='', avatar_material_id = NULL, updated_at = ? WHERE user_id = ?`
  ).run(now(), req.user.id);
  db.prepare("UPDATE res_cards SET nickname = '', updated_at = ? WHERE user_id = ?").run(now(), req.user.id);
  db.prepare('UPDATE res_messages SET archived = 1, read = 1 WHERE user_id = ?').run(req.user.id);
  audit(req.user, 'privacy_erase', 'user', req.user.id);
  res.json({ ok: true });
});

export default router;
