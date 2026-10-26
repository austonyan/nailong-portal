// 奶龍國皇家申訴與監察署 — user-facing endpoints. Materials live under the
// private data dir and are reachable only through the authenticated download
// route. 公共验真接口注册在鉴权段之前,保持匿名。
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
  APPEAL_UPLOAD_KINDS,
  BIZ_TYPES,
  audit,
  classifyBizStatus,
  clientIp,
  getConfigNumber,
  maskVerifyResult,
  nextAppealNo,
  nextComplaintNo,
  nextDecisionNo,
  nextReviewNo,
  nextTicketNo,
  rateLimit,
  sendMsg,
  serializeAppeal,
  serializeComplaint,
  serializeDecision,
  serializeMaterial,
  serializeMessage,
  serializeNotice,
  serializePublicity,
  serializeReview,
  serializeTicket,
  sweepAll,
  writebackDecision,
} from '../appeal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NAILONG_DATA_DIR || path.join(__dirname, '..', 'data');
export const appealUploadsRoot = path.join(dataDir, 'uploads', 'appeal');
fs.mkdirSync(appealUploadsRoot, { recursive: true });

const router = Router();
const MAX_MATERIAL_BYTES = 5 * 1024 * 1024;
const MAX_MATERIALS_PER_OWNER = 6;
const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const BIZ_KEYS = new Set(BIZ_TYPES.map((b) => b.key));
const APPEAL_OPEN = "('pending_accept','accepted','processing','supplement_required')";
const COMPLAINT_CATEGORIES = {
  complaint: ['attitude', 'process', 'notice', 'staff', 'system', 'other'],
  suggestion: ['feature', 'experience', 'content'],
};
const TICKET_CATEGORIES = new Set(['consult', 'account', 'bug']);
const TICKET_PRIORITIES = new Set(['low', 'normal', 'high']);

// ---------------------------------------------------------------------------
// Uploads (private storage)
// ---------------------------------------------------------------------------

const tmpDir = path.join(appealUploadsRoot, 'tmp');
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
    const code = err.code === 'LIMIT_FILE_SIZE' ? 'APPEAL_FILE_TOO_LARGE' : 'VALIDATION_ERROR';
    return next(badRequest(code, err.message));
  }
  next(err);
}

const OWNER_TABLES = {
  appeal: { table: 'appeal_appeals', editable: ['draft', 'supplement_required'] },
  review: { table: 'appeal_reviews', editable: ['pending'] },
  complaint: { table: 'appeal_complaints', editable: ['pending_accept'] },
  ticket: { table: 'appeal_tickets', editable: ['pending', 'processing'] },
};

function loadOwnOwner(req, ownerType, ownerId) {
  const meta = OWNER_TABLES[ownerType];
  if (!meta) throw badRequest('VALIDATION_ERROR', 'Unknown owner type');
  const row = db.prepare(`SELECT * FROM ${meta.table} WHERE id = ?`).get(Number(ownerId));
  if (!row || row.user_id !== req.user.id) throw notFound('Owner record not found');
  return { row, meta };
}

function deleteMaterialFile(material) {
  const full = path.join(appealUploadsRoot, material.path);
  fs.rm(full, { force: true }, () => {});
}

// 操作时间线(用户可见的处理记录)
export function recordsFor(targetType, targetId) {
  return db
    .prepare('SELECT * FROM appeal_records WHERE target_type = ? AND target_id = ? ORDER BY id')
    .all(targetType, targetId)
    .map((r) => ({ id: r.id, action: r.action, comment: r.comment, actorName: r.actor_name, createdAt: r.created_at }));
}

export function record(targetType, targetId, actor, action, comment = '') {
  db.prepare(
    'INSERT INTO appeal_records (target_type, target_id, actor_id, actor_name, action, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    targetType,
    targetId,
    actor?.id ?? null,
    actor?.displayName || actor?.username || actor?.name || '',
    action,
    String(comment || '').slice(0, 500),
    now()
  );
}

function appealWithMeta(row) {
  const materials = db
    .prepare("SELECT * FROM appeal_materials WHERE owner_type = 'appeal' AND owner_id = ? ORDER BY id")
    .all(row.id)
    .map(serializeMaterial);
  const records = recordsFor('appeal', row.id);
  const review = db.prepare('SELECT * FROM appeal_reviews WHERE appeal_id = ? ORDER BY id DESC').get(row.id);
  const decision = db.prepare('SELECT * FROM appeal_decisions WHERE appeal_id = ? ORDER BY id DESC').get(row.id);
  return {
    ...serializeAppeal(row),
    materials,
    records,
    review: review ? serializeReview(review) : null,
    decision: decision ? serializeDecision(decision) : null,
    reviewDays: getConfigNumber('appeal.review_days', 15),
  };
}

// ---------------------------------------------------------------------------
// 验真中心 — public (rate limited, no personal data)
// ---------------------------------------------------------------------------

router.get('/verify', (req, res) => {
  const limit = getConfigNumber('appeal.verify_limit_per_5min', 30);
  const ip = clientIp(req);
  if (!rateLimit(`appeal-verify:${ip}`, limit, 5 * 60_000)) {
    db.prepare('INSERT INTO appeal_verify_logs (query, ip, result, created_at) VALUES (?, ?, ?, ?)').run(
      String(req.query.no || req.query.token || '').slice(0, 64),
      ip,
      'rate_limited',
      now()
    );
    throw badRequest('APPEAL_VERIFY_LIMITED', 'Too many verification attempts, please try later');
  }
  const token = String(req.query.token || '').trim();
  const no = String(req.query.no || '').trim().toUpperCase();
  if (!token && !no) throw badRequest('VALIDATION_ERROR', 'Provide ?no= or ?token=');
  sweepAll();
  const result = maskVerifyResult(token, no);
  db.prepare('INSERT INTO appeal_verify_logs (query, ip, result, created_at) VALUES (?, ?, ?, ?)').run(
    (token ? `token:${token.slice(0, 8)}…` : no).slice(0, 64),
    ip,
    result.found ? `${result.kind}:${result.status}` : 'not_found',
    now()
  );
  res.json(result);
});

// Everything below requires a signed-in user with the apply permission.
router.use(authenticate, requirePermission('appeal:apply'));

// ---------------------------------------------------------------------------
// 首页聚合:公告、我的事项计数、办事提示、可申诉业务类型
// ---------------------------------------------------------------------------

router.get('/home', (req, res) => {
  sweepAll();
  const notices = db
    .prepare('SELECT * FROM appeal_notices WHERE enabled = 1 ORDER BY id DESC LIMIT 10')
    .all()
    .map((n) => ({ id: n.id, title: n.title, body: n.body, level: n.level, createdAt: n.created_at }));
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  res.json({
    notices,
    bizTypes: BIZ_TYPES,
    counts: {
      appealsOpen: count(`SELECT COUNT(*) AS n FROM appeal_appeals WHERE user_id = ? AND status IN ${APPEAL_OPEN}`, req.user.id),
      reviews: count('SELECT COUNT(*) AS n FROM appeal_reviews WHERE user_id = ?', req.user.id),
      complaints: count("SELECT COUNT(*) AS n FROM appeal_complaints WHERE user_id = ? AND status != 'closed'", req.user.id),
      tickets: count("SELECT COUNT(*) AS n FROM appeal_tickets WHERE user_id = ? AND status NOT IN ('closed')", req.user.id),
      decisions: count('SELECT COUNT(*) AS n FROM appeal_decisions WHERE user_id = ? AND status = ?', req.user.id, 'valid'),
      unread: count('SELECT COUNT(*) AS n FROM appeal_messages WHERE user_id = ? AND read = 0 AND archived = 0', req.user.id),
    },
    hints: {
      supplementDays: getConfigNumber('appeal.supplement_days', 7),
      reviewDays: getConfigNumber('appeal.review_days', 15),
      acceptSlaHours: getConfigNumber('appeal.accept_sla_hours', 48),
      resolveSlaHours: getConfigNumber('appeal.resolve_sla_hours', 120),
    },
  });
});

// ---------------------------------------------------------------------------
// 结果申诉:草稿生命周期
// ---------------------------------------------------------------------------

router.get('/appeals', (req, res) => {
  sweepAll();
  const status = String(req.query.status || '');
  const rows = status
    ? db.prepare('SELECT * FROM appeal_appeals WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 100').all(req.user.id, status)
    : db.prepare('SELECT * FROM appeal_appeals WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({ items: rows.map((row) => appealWithMeta(row)) });
});

function validateBizRef(body) {
  const bizType = String(body?.bizType || '').trim();
  const bizCode = String(body?.bizCode || '').trim().toUpperCase();
  if (!BIZ_KEYS.has(bizType)) throw badRequest('APPEAL_BIZ_TYPE', 'Unsupported business type');
  if (!/^[A-Z0-9][A-Z0-9-]{3,63}$/.test(bizCode)) throw badRequest('APPEAL_BIZ_CODE', 'Business code looks invalid');
  return { bizType, bizCode };
}

function validateAppealFields(body) {
  const str = (v, { max = 255 } = {}) => {
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') throw badRequest('VALIDATION_ERROR', 'Expected string field');
    return v.trim().slice(0, max);
  };
  const bizType = str(body.bizType, { max: 20 });
  const bizCode = str(body.bizCode, { max: 64 });
  const reason = str(body.reason, { max: 2000 });
  const expected = str(body.expected, { max: 500 });
  const contact = str(body.contact, { max: 100 });
  if (!BIZ_KEYS.has(bizType)) throw badRequest('APPEAL_BIZ_TYPE', 'Unsupported business type');
  if (!/^[A-Za-z0-9-]{4,64}$/.test(bizCode)) throw badRequest('APPEAL_BIZ_CODE', 'Business code looks invalid');
  if (!reason) throw badRequest('APPEAL_FIELD_REQUIRED', 'Appeal reason is required');
  if (!expected) throw badRequest('APPEAL_FIELD_REQUIRED', 'Expected result is required');
  if (!contact) throw badRequest('APPEAL_FIELD_REQUIRED', 'Contact is required');
  return { bizType, bizCode: bizCode.toUpperCase(), reason, expected, contact };
}

router.post('/appeals', (req, res) => {
  if (db.prepare('SELECT 1 FROM appeal_blacklist WHERE user_id = ? AND scope IN (?, ?)').get(req.user.id, 'appeal', 'all')) {
    throw forbidden('APPEAL_BLACKLISTED', 'Account is restricted from appealing');
  }
  const fields = validateBizRef(req.body);
  const code = nextAppealNo();
  // 关联校验(已联动):直接查业务署台账,记录 verified / not_found / not_owned / not_appealable
  const { status: bizStatus } = classifyBizStatus(fields.bizType, fields.bizCode, req.user.id);
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO appeal_appeals (code, user_id, biz_type, biz_code, biz_status, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`
    )
    .run(code, req.user.id, fields.bizType, fields.bizCode, bizStatus, ts, ts);
  audit(req.user, 'create_appeal_draft', 'appeal', code);
  res.status(201).json({
    appeal: serializeAppeal(db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(info.lastInsertRowid)),
  });
});

router.put('/appeals/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Appeal not found');
  if (row.status !== 'draft') throw badRequest('APPEAL_NOT_EDITABLE', 'Only drafts can be edited');
  const fields = validateAppealFields({ ...serializeAppeal(row), ...req.body });
  const { status: bizStatus } = classifyBizStatus(fields.bizType, fields.bizCode, req.user.id);
  db.prepare(
    'UPDATE appeal_appeals SET biz_type = ?, biz_code = ?, biz_status = ?, reason = ?, expected = ?, contact = ?, updated_at = ? WHERE id = ?'
  ).run(fields.bizType, fields.bizCode, bizStatus, fields.reason, fields.expected, fields.contact, now(), row.id);
  res.json({ appeal: appealWithMeta(db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(row.id)) });
});

router.delete('/appeals/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Appeal not found');
  if (row.status !== 'draft') throw badRequest('APPEAL_NOT_EDITABLE', 'Only drafts can be deleted');
  for (const m of db.prepare("SELECT * FROM appeal_materials WHERE owner_type = 'appeal' AND owner_id = ?").all(row.id)) deleteMaterialFile(m);
  db.prepare("DELETE FROM appeal_materials WHERE owner_type = 'appeal' AND owner_id = ?").run(row.id);
  db.prepare('DELETE FROM appeal_records WHERE target_type = ? AND target_id = ?').run('appeal', row.id);
  db.prepare('DELETE FROM appeal_appeals WHERE id = ?').run(row.id);
  fs.rm(path.join(appealUploadsRoot, `appeal-${row.id}`), { recursive: true, force: true }, () => {});
  res.json({ ok: true });
});

router.get('/appeals/:id', (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Appeal not found');
  res.json({ appeal: appealWithMeta(row) });
});

router.post('/appeals/:id/submit', (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Appeal not found');
  if (row.status !== 'draft') throw badRequest('APPEAL_NOT_EDITABLE', 'Appeal already submitted');
  if (db.prepare('SELECT 1 FROM appeal_blacklist WHERE user_id = ? AND scope IN (?, ?)').get(req.user.id, 'appeal', 'all')) {
    throw forbidden('APPEAL_BLACKLISTED', 'Account is restricted from appealing');
  }
  const dup = db
    .prepare(
      `SELECT code FROM appeal_appeals WHERE user_id = ? AND biz_type = ? AND biz_code = ? AND status IN ${APPEAL_OPEN}`
    )
    .get(req.user.id, row.biz_type, row.biz_code);
  if (dup) throw badRequest('APPEAL_DUPLICATE', `Duplicate appeal for ${row.biz_code}: ${dup.code}`);
  const active = db
    .prepare(`SELECT COUNT(*) AS n FROM appeal_appeals WHERE user_id = ? AND status IN ${APPEAL_OPEN}`)
    .get(req.user.id).n;
  if (active >= 3) throw badRequest('APPEAL_TOO_MANY_ACTIVE', 'Too many appeals in progress');
  validateAppealFields({ ...serializeAppeal(row) });
  // 提交时复检:业务件确实存在且属于本人;不存在的编号允许进入人工核验,
  // 但绝不能替别人申诉。
  const { status: bizStatus, check: bizCheck } = classifyBizStatus(row.biz_type, row.biz_code, req.user.id);
  if (bizCheck.found && !bizCheck.owned) {
    throw forbidden('APPEAL_BIZ_NOT_OWNED', 'The linked business record belongs to another account');
  }
  if (!rateLimit(`appeal-submit:${req.user.id}`, 1, 60_000)) {
    throw badRequest('APPEAL_RATE_LIMITED', 'Please wait a minute before submitting again');
  }
  const ts = now();
  db.prepare(
    "UPDATE appeal_appeals SET status = 'pending_accept', biz_status = ?, submitted_at = ?, updated_at = ? WHERE id = ?"
  ).run(bizStatus, ts, ts, row.id);
  record('appeal', row.id, req.user, 'submit');
  sendMsg(req.user.id, 'appeal', row.id, 'appeal_submitted', { code: row.code });
  audit(req.user, 'submit_appeal', 'appeal', row.code, { bizStatus, bizOffice: bizCheck.office || '' });
  res.json({ appeal: appealWithMeta(db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(row.id)) });
});

router.post('/appeals/:id/withdraw', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Appeal not found');
  if (!['pending_accept', 'accepted', 'processing'].includes(row.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Appeal cannot be withdrawn in current status');
  }
  db.prepare("UPDATE appeal_appeals SET status = 'withdrawn', closed_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), row.id);
  record('appeal', row.id, req.user, 'withdraw');
  sendMsg(req.user.id, 'appeal', row.id, 'appeal_withdrawn', { code: row.code });
  audit(req.user, 'withdraw_appeal', 'appeal', row.code);
  res.json({ appeal: appealWithMeta(db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(row.id)) });
});

router.post('/appeals/:id/supplement', (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Appeal not found');
  if (row.status !== 'supplement_required') throw badRequest('APPEAL_INVALID_TRANSITION', 'Appeal is not awaiting supplements');
  if (row.supplement_deadline && row.supplement_deadline < now()) {
    throw badRequest('APPEAL_SUPPLEMENT_EXPIRED', 'Supplement deadline has passed');
  }
  const note = String(req.body?.note || '').trim().slice(0, 500);
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM appeal_materials WHERE owner_type = 'appeal' AND owner_id = ? AND origin = 'supplement'")
    .get(row.id).n;
  if (pending === 0 && !note) throw badRequest('APPEAL_SUPPLEMENT_EMPTY', 'Nothing to supplement');
  db.prepare("UPDATE appeal_appeals SET status = 'processing', updated_at = ? WHERE id = ?").run(now(), row.id);
  record('appeal', row.id, req.user, 'supplement_submit', note);
  sendMsg(req.user.id, 'appeal', row.id, 'appeal_supplemented', { code: row.code });
  audit(req.user, 'supplement_appeal', 'appeal', row.code, { materials: pending });
  res.json({ appeal: appealWithMeta(db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(row.id)) });
});

router.post('/appeals/:id/evaluate', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Appeal not found');
  if (row.status !== 'resolved') throw badRequest('APPEAL_INVALID_TRANSITION', 'Only resolved appeals can be evaluated');
  if (row.evaluation_rating) throw badRequest('APPEAL_ALREADY_EVALUATED', 'Appeal already evaluated');
  const rating = Math.min(5, Math.max(1, Number(req.body?.rating) || 0));
  if (!rating) throw badRequest('VALIDATION_ERROR', 'rating 1-5 is required');
  const comment = String(req.body?.comment || '').trim().slice(0, 300);
  db.prepare('UPDATE appeal_appeals SET evaluation_rating = ?, evaluation_comment = ?, updated_at = ? WHERE id = ?').run(
    rating, comment, now(), row.id
  );
  record('appeal', row.id, req.user, 'evaluate', `rating:${rating}`);
  audit(req.user, 'evaluate_appeal', 'appeal', row.code, { rating });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 复核申请(一次终局)
// ---------------------------------------------------------------------------

router.get('/reviews', (req, res) => {
  const rows = db.prepare('SELECT * FROM appeal_reviews WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({
    items: rows.map((r) => ({
      ...serializeReview(r),
      materials: db
        .prepare("SELECT * FROM appeal_materials WHERE owner_type = 'review' AND owner_id = ? ORDER BY id")
        .all(r.id)
        .map(serializeMaterial),
    })),
  });
});

router.post('/reviews', (req, res) => {
  sweepAll();
  const appeal = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(req.body?.appealId));
  if (!appeal || appeal.user_id !== req.user.id) throw notFound('Appeal not found');
  if (!['resolved', 'rejected'].includes(appeal.status)) {
    throw badRequest('APPEAL_REVIEW_NOT_ALLOWED', 'Only decided appeals can be reviewed');
  }
  if (db.prepare('SELECT 1 FROM appeal_reviews WHERE appeal_id = ?').get(appeal.id)) {
    throw badRequest('APPEAL_REVIEW_EXISTS', 'This appeal has already been reviewed (review is final)');
  }
  const reviewDays = getConfigNumber('appeal.review_days', 15);
  const decidedAt = appeal.resolved_at || appeal.updated_at;
  if (decidedAt && Date.now() - new Date(decidedAt).getTime() > reviewDays * 24 * 60 * 60 * 1000) {
    throw badRequest('APPEAL_REVIEW_EXPIRED', `Review window (${reviewDays} days) has passed`);
  }
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 10) throw badRequest('APPEAL_FIELD_REQUIRED', 'Review reason is required (min 10 chars)');
  if (reason.length > 2000) throw badRequest('VALIDATION_ERROR', 'Review reason too long');
  if (!rateLimit(`review-submit:${req.user.id}`, 1, 60_000)) {
    throw badRequest('APPEAL_RATE_LIMITED', 'Please wait a minute before submitting again');
  }
  const ts = now();
  const code = nextReviewNo();
  const info = db
    .prepare(
      `INSERT INTO appeal_reviews (code, appeal_id, appeal_code, user_id, reason, status, created_at, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    )
    .run(code, appeal.id, appeal.code, req.user.id, reason, ts, ts, ts);
  record('appeal', appeal.id, req.user, 'review_submit', code);
  record('review', info.lastInsertRowid, req.user, 'submit');
  sendMsg(req.user.id, 'review', info.lastInsertRowid, 'review_submitted', { code, appealCode: appeal.code });
  audit(req.user, 'submit_review', 'review', code, { appealCode: appeal.code });
  res.status(201).json({ review: serializeReview(db.prepare('SELECT * FROM appeal_reviews WHERE id = ?').get(info.lastInsertRowid)) });
});

router.get('/reviews/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_reviews WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Review not found');
  const appeal = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(row.appeal_id);
  const decision = db.prepare('SELECT * FROM appeal_decisions WHERE review_id = ? ORDER BY id DESC').get(row.id);
  res.json({
    review: {
      ...serializeReview(row),
      materials: db
        .prepare("SELECT * FROM appeal_materials WHERE owner_type = 'review' AND owner_id = ? ORDER BY id")
        .all(row.id)
        .map(serializeMaterial),
      records: recordsFor('review', row.id),
      decision: decision ? serializeDecision(decision) : null,
      appealSummary: appeal
        ? { code: appeal.code, bizType: appeal.biz_type, bizCode: appeal.biz_code, decisionType: appeal.decision_type, status: appeal.status }
        : null,
    },
  });
});

// ---------------------------------------------------------------------------
// 投诉建议
// ---------------------------------------------------------------------------

router.get('/complaints', (req, res) => {
  const rows = db.prepare('SELECT * FROM appeal_complaints WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({
    items: rows.map((r) => ({
      ...serializeComplaint(r),
      materials: db
        .prepare("SELECT * FROM appeal_materials WHERE owner_type = 'complaint' AND owner_id = ? ORDER BY id")
        .all(r.id)
        .map(serializeMaterial),
    })),
  });
});

router.post('/complaints', (req, res) => {
  if (db.prepare('SELECT 1 FROM appeal_blacklist WHERE user_id = ? AND scope IN (?, ?)').get(req.user.id, 'complaint', 'all')) {
    throw forbidden('APPEAL_BLACKLISTED', 'Account is restricted from complaining');
  }
  const kind = req.body?.kind === 'suggestion' ? 'suggestion' : 'complaint';
  const category = String(req.body?.category || '');
  if (!COMPLAINT_CATEGORIES[kind].includes(category)) {
    throw badRequest('APPEAL_COMPLAINT_CATEGORY', 'Unsupported category for this kind');
  }
  const anonymous = req.body?.anonymous === true;
  const content = String(req.body?.content || '').trim();
  if (content.length < 10) throw badRequest('APPEAL_FIELD_REQUIRED', 'Content is required (min 10 chars)');
  if (content.length > 2000) throw badRequest('VALIDATION_ERROR', 'Content too long');
  const contact = String(req.body?.contact || '').trim().slice(0, 100);
  if (!anonymous && !contact) throw badRequest('APPEAL_FIELD_REQUIRED', 'Contact is required unless anonymous');
  const active = db
    .prepare("SELECT COUNT(*) AS n FROM appeal_complaints WHERE user_id = ? AND status IN ('pending_accept','processing')")
    .get(req.user.id).n;
  if (active >= 5) throw badRequest('APPEAL_TOO_MANY_ACTIVE', 'Too many complaints in progress');
  if (!rateLimit(`complaint-submit:${req.user.id}`, 1, 60_000)) {
    throw badRequest('APPEAL_RATE_LIMITED', 'Please wait a minute before submitting again');
  }
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO appeal_complaints (code, user_id, kind, category, anonymous, content, contact, status, created_at, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_accept', ?, ?, ?)`
    )
    .run(nextComplaintNo(), req.user.id, kind, category, anonymous ? 1 : 0, content, anonymous ? '' : contact, ts, ts, ts);
  record('complaint', info.lastInsertRowid, req.user, 'submit');
  sendMsg(req.user.id, 'complaint', info.lastInsertRowid, 'complaint_submitted', { code: db.prepare('SELECT code FROM appeal_complaints WHERE id = ?').get(info.lastInsertRowid).code });
  audit(req.user, 'submit_complaint', 'complaint', db.prepare('SELECT code FROM appeal_complaints WHERE id = ?').get(info.lastInsertRowid).code, { kind, category, anonymous });
  res.status(201).json({ complaint: serializeComplaint(db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(info.lastInsertRowid)) });
});

router.get('/complaints/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Complaint not found');
  res.json({
    complaint: {
      ...serializeComplaint(row),
      materials: db
        .prepare("SELECT * FROM appeal_materials WHERE owner_type = 'complaint' AND owner_id = ? ORDER BY id")
        .all(row.id)
        .map(serializeMaterial),
      records: recordsFor('complaint', row.id),
    },
  });
});

router.post('/complaints/:id/evaluate', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Complaint not found');
  if (!['replied', 'closed'].includes(row.status)) throw badRequest('APPEAL_INVALID_TRANSITION', 'Complaint is not replied yet');
  if (row.rating) throw badRequest('APPEAL_ALREADY_EVALUATED', 'Complaint already evaluated');
  const rating = Math.min(5, Math.max(1, Number(req.body?.rating) || 0));
  if (!rating) throw badRequest('VALIDATION_ERROR', 'rating 1-5 is required');
  db.prepare('UPDATE appeal_complaints SET rating = ?, rating_comment = ?, updated_at = ? WHERE id = ?').run(
    rating, String(req.body?.comment || '').trim().slice(0, 300), now(), row.id
  );
  record('complaint', row.id, req.user, 'evaluate', `rating:${rating}`);
  audit(req.user, 'evaluate_complaint', 'complaint', row.code, { rating });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 工单客服
// ---------------------------------------------------------------------------

router.get('/tickets', (req, res) => {
  const rows = db.prepare('SELECT * FROM appeal_tickets WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({
    items: rows.map((r) => ({
      ...serializeTicket(r),
      lastReply: db.prepare('SELECT * FROM appeal_ticket_replies WHERE ticket_id = ? ORDER BY id DESC LIMIT 1').get(r.id) || null,
    })),
  });
});

router.post('/tickets', (req, res) => {
  const category = String(req.body?.category || '');
  if (!TICKET_CATEGORIES.has(category)) throw badRequest('APPEAL_TICKET_CATEGORY', 'Unsupported ticket category');
  const priority = TICKET_PRIORITIES.has(req.body?.priority) ? req.body.priority : 'normal';
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const content = String(req.body?.content || '').trim();
  if (!title) throw badRequest('APPEAL_FIELD_REQUIRED', 'Title is required');
  if (content.length < 5) throw badRequest('APPEAL_FIELD_REQUIRED', 'Content is required (min 5 chars)');
  if (content.length > 2000) throw badRequest('VALIDATION_ERROR', 'Content too long');
  const active = db
    .prepare("SELECT COUNT(*) AS n FROM appeal_tickets WHERE user_id = ? AND status IN ('pending','processing')")
    .get(req.user.id).n;
  if (active >= 5) throw badRequest('APPEAL_TOO_MANY_ACTIVE', 'Too many open tickets');
  if (!rateLimit(`ticket-submit:${req.user.id}`, 2, 60_000)) {
    throw badRequest('APPEAL_RATE_LIMITED', 'Please wait a minute before submitting again');
  }
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO appeal_tickets (code, user_id, category, priority, title, content, status, created_at, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    )
    .run(nextTicketNo(), req.user.id, category, priority, title, content, ts, ts, ts);
  record('ticket', info.lastInsertRowid, req.user, 'submit');
  audit(req.user, 'submit_ticket', 'ticket', db.prepare('SELECT code FROM appeal_tickets WHERE id = ?').get(info.lastInsertRowid).code, { category, priority });
  res.status(201).json({ ticket: serializeTicket(db.prepare('SELECT * FROM appeal_tickets WHERE id = ?').get(info.lastInsertRowid)) });
});

function loadOwnTicket(req) {
  const row = db.prepare('SELECT * FROM appeal_tickets WHERE id = ?').get(Number(req.params.id));
  if (!row || row.user_id !== req.user.id) throw notFound('Ticket not found');
  return row;
}

router.get('/tickets/:id', (req, res) => {
  const row = loadOwnTicket(req);
  const replies = db
    .prepare('SELECT * FROM appeal_ticket_replies WHERE ticket_id = ? ORDER BY id')
    .all(row.id)
    .map((r) => ({ id: r.id, isStaff: !!r.is_staff, staffName: r.staff_name, content: r.content, createdAt: r.created_at }));
  res.json({ ticket: { ...serializeTicket(row), replies, records: recordsFor('ticket', row.id) } });
});

router.post('/tickets/:id/reply', (req, res) => {
  const row = loadOwnTicket(req);
  if (!['pending', 'processing', 'replied'].includes(row.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Ticket is closed');
  }
  const content = String(req.body?.content || '').trim();
  if (!content) throw badRequest('APPEAL_FIELD_REQUIRED', 'Reply content is required');
  if (content.length > 2000) throw badRequest('VALIDATION_ERROR', 'Content too long');
  db.prepare('INSERT INTO appeal_ticket_replies (ticket_id, user_id, is_staff, staff_name, content, created_at) VALUES (?, ?, 0, ?, ?, ?)').run(
    row.id, req.user.id, '', content, now()
  );
  record('ticket', row.id, req.user, 'reply');
  audit(req.user, 'reply_ticket', 'ticket', row.code);
  res.json({ ok: true });
});

router.post('/tickets/:id/close', (req, res) => {
  const row = loadOwnTicket(req);
  if (!['pending', 'processing', 'replied'].includes(row.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Ticket cannot be closed in current status');
  }
  db.prepare("UPDATE appeal_tickets SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), row.id);
  record('ticket', row.id, req.user, 'close');
  audit(req.user, 'close_ticket', 'ticket', row.code);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 决定书(文书署认证签发后回写 certCode)
// ---------------------------------------------------------------------------

router.get('/decisions', (req, res) => {
  sweepAll();
  const rows = db.prepare('SELECT * FROM appeal_decisions WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ items: rows.map(serializeDecision) });
});

router.get('/decisions/:code', (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM appeal_decisions WHERE code = ?').get(String(req.params.code).toUpperCase());
  if (!row) throw notFound('Decision not found');
  const isOwner = row.user_id === req.user.id;
  const isStaff = ['appeal:process', 'appeal:review', 'appeal:inspect', 'appeal:manage'].some((p) => (req.user.permissions || []).includes(p));
  if (!isOwner && !isStaff) throw forbidden('FORBIDDEN', 'No access to this decision document');
  res.json({ decision: serializeDecision(row) });
});

// ---------------------------------------------------------------------------
// 处理公示(脱敏统计 + 已发布条目)
// ---------------------------------------------------------------------------

router.get('/publicity', (_req, res) => {
  const rows = db
    .prepare("SELECT * FROM appeal_publicity WHERE status = 'published' ORDER BY published_at DESC LIMIT 20")
    .all();
  res.json({ items: rows.map(serializePublicity) });
});

router.get('/publicity/stats', (_req, res) => {
  sweepAll();
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  const submitted = count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE submitted_at IS NOT NULL AND status != 'withdrawn'");
  const accepted = count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE accepted_at IS NOT NULL");
  const rejected = count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status = 'rejected'");
  const resolved = count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status = 'resolved'");
  const decisionDist = db
    .prepare("SELECT decision_type AS type, COUNT(*) AS n FROM appeal_appeals WHERE decision_type IS NOT NULL GROUP BY decision_type")
    .all();
  const bizDist = db
    .prepare('SELECT biz_type AS type, COUNT(*) AS n FROM appeal_appeals WHERE submitted_at IS NOT NULL GROUP BY biz_type ORDER BY n DESC')
    .all();
  const avgMs =
    db
      .prepare(
        `SELECT AVG(julianday(resolved_at) - julianday(submitted_at)) AS d FROM appeal_appeals
         WHERE resolved_at IS NOT NULL AND submitted_at IS NOT NULL`
      )
      .get().d || 0;
  const reviewTotal = count('SELECT COUNT(*) AS n FROM appeal_reviews WHERE submitted_at IS NOT NULL');
  const reviewCompleted = count("SELECT COUNT(*) AS n FROM appeal_reviews WHERE status = 'completed'");
  res.json({
    submitted,
    acceptRate: submitted ? accepted / submitted : 0,
    rejectAcceptRate: submitted ? rejected / submitted : 0,
    resolved,
    avgResolveDays: Math.max(0, Math.round(avgMs * 10) / 10),
    decisionDistribution: decisionDist,
    bizDistribution: bizDist,
    reviewTotal,
    reviewCompleted,
  });
});

// ---------------------------------------------------------------------------
// 站内信
// ---------------------------------------------------------------------------

router.get('/messages', (req, res) => {
  const archived = req.query.archived === '1' ? 1 : 0;
  const rows = db
    .prepare('SELECT * FROM appeal_messages WHERE user_id = ? AND archived = ? ORDER BY id DESC LIMIT 100')
    .all(req.user.id, archived);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM appeal_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  res.json({ items: rows.map(serializeMessage), unread });
});

router.post('/messages/:id/read', (req, res) => {
  db.prepare('UPDATE appeal_messages SET read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/archive', (req, res) => {
  db.prepare('UPDATE appeal_messages SET archived = 1, read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 隐私:数据删除(匿名化本人在申诉署的内容,保留编号与状态轨迹供审计)
// ---------------------------------------------------------------------------

router.post('/privacy/erase', (req, res) => {
  const active =
    db.prepare(`SELECT COUNT(*) AS n FROM appeal_appeals WHERE user_id = ? AND status IN ${APPEAL_OPEN}`).get(req.user.id).n +
    db
      .prepare("SELECT COUNT(*) AS n FROM appeal_complaints WHERE user_id = ? AND status IN ('pending_accept','processing')")
      .get(req.user.id).n +
    db.prepare("SELECT COUNT(*) AS n FROM appeal_tickets WHERE user_id = ? AND status IN ('pending','processing')").get(req.user.id).n;
  if (active > 0) throw badRequest('APPEAL_ERASE_BLOCKED', 'Close active appeals/complaints/tickets before requesting deletion');
  for (const m of db.prepare('SELECT * FROM appeal_materials WHERE user_id = ?').all(req.user.id)) deleteMaterialFile(m);
  db.prepare('DELETE FROM appeal_materials WHERE user_id = ?').run(req.user.id);
  db.prepare(
    `UPDATE appeal_appeals SET reason = '', expected = '', contact = '', evaluation_comment = '', updated_at = ? WHERE user_id = ?`
  ).run(now(), req.user.id);
  db.prepare(`UPDATE appeal_reviews SET reason = '', updated_at = ? WHERE user_id = ?`).run(now(), req.user.id);
  db.prepare(`UPDATE appeal_complaints SET anonymous = 1, contact = '', content = '(erased)', rating_comment = '', updated_at = ? WHERE user_id = ?`).run(now(), req.user.id);
  db.prepare(`UPDATE appeal_tickets SET title = '(erased)', content = '(erased)', updated_at = ? WHERE user_id = ?`).run(now(), req.user.id);
  db.prepare('UPDATE appeal_messages SET archived = 1, read = 1 WHERE user_id = ?').run(req.user.id);
  audit(req.user, 'privacy_erase', 'user', req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Materials(申诉/复核/投诉/工单通用)
// ---------------------------------------------------------------------------

function uploadMaterial(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) return mapMulterError(err, req, res, next);
    next();
  });
}

router.post('/materials', uploadMaterial, (req, res) => {
  const ownerType = String(req.body?.ownerType || '');
  let owner;
  try {
    owner = loadOwnOwner(req, ownerType, req.body?.ownerId);
  } catch (err) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    throw err;
  }
  const { row, meta } = owner;
  if (!meta.editable.includes(row.status)) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    throw badRequest('APPEAL_NOT_EDITABLE', 'Materials are locked in current status');
  }
  const file = req.file;
  if (!file) throw badRequest('VALIDATION_ERROR', 'file is required');
  if (!ALLOWED_MIMES.has(file.mimetype)) {
    fs.rm(file.path, { force: true }, () => {});
    throw badRequest('APPEAL_FILE_TYPE', `Unsupported file type: ${file.mimetype}`);
  }
  const kind = APPEAL_UPLOAD_KINDS.has(req.body?.kind) ? req.body.kind : 'other';
  const count = db
    .prepare('SELECT COUNT(*) AS n FROM appeal_materials WHERE owner_type = ? AND owner_id = ?')
    .get(ownerType, row.id).n;
  if (count >= MAX_MATERIALS_PER_OWNER) {
    fs.rm(file.path, { force: true }, () => {});
    throw badRequest('APPEAL_TOO_MANY_FILES', `At most ${MAX_MATERIALS_PER_OWNER} files per record`);
  }
  const ownerDir = path.join(appealUploadsRoot, `${ownerType}-${row.id}`);
  fs.mkdirSync(ownerDir, { recursive: true });
  fs.renameSync(file.path, path.join(ownerDir, file.filename));
  const info = db
    .prepare(
      `INSERT INTO appeal_materials (owner_type, owner_id, user_id, kind, origin, filename, mime, size, path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      ownerType,
      row.id,
      req.user.id,
      kind,
      ownerType === 'appeal' && row.status === 'supplement_required' ? 'supplement' : 'initial',
      (file.originalname || 'file').slice(0, 120),
      file.mimetype,
      file.size,
      path.join(`${ownerType}-${row.id}`, file.filename),
      now()
    );
  res.status(201).json({ material: serializeMaterial(db.prepare('SELECT * FROM appeal_materials WHERE id = ?').get(info.lastInsertRowid)) });
});

router.delete('/materials/:id', (req, res) => {
  const material = db.prepare('SELECT * FROM appeal_materials WHERE id = ?').get(Number(req.params.id));
  if (!material || material.user_id !== req.user.id) throw notFound('Material not found');
  const meta = OWNER_TABLES[material.owner_type];
  const owner = db.prepare(`SELECT * FROM ${meta.table} WHERE id = ?`).get(material.owner_id);
  if (!owner || !meta.editable.includes(owner.status)) {
    throw badRequest('APPEAL_NOT_EDITABLE', 'Materials are locked in current status');
  }
  deleteMaterialFile(material);
  db.prepare('DELETE FROM appeal_materials WHERE id = ?').run(material.id);
  res.json({ ok: true });
});

// 受限下载:本人或申诉署工作人员;绝不暴露静态目录
router.get('/materials/:id/file', (req, res) => {
  const material = db.prepare('SELECT * FROM appeal_materials WHERE id = ?').get(Number(req.params.id));
  if (!material) throw notFound('Material not found');
  const isOwner = material.user_id === req.user.id;
  const isStaff = ['appeal:process', 'appeal:review', 'appeal:inspect', 'appeal:manage'].some((p) => (req.user.permissions || []).includes(p));
  if (!isOwner && !isStaff) throw forbidden('FORBIDDEN', 'No access to this file');
  const full = path.resolve(appealUploadsRoot, material.path);
  if (!full.startsWith(appealUploadsRoot) || !fs.existsSync(full)) throw notFound('File missing');
  res.setHeader('Content-Type', material.mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(material.filename)}`);
  fs.createReadStream(full).pipe(res);
});

export default router;
