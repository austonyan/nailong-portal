// 奶龍國簽註申請署 — admin endpoints.
// visa:review → 审核工作台 / 签发 / 签注管理 / 验真记录
// visa:manage → 类型 / 公告 / 配置 / 黑名单 / 统计 / 审计
import { Router } from 'express';
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, conflict, notFound } from '../http.js';
import {
  audit,
  getConfigNumber,
  nextVisaNo,
  sendMsg,
  serializeApplication,
  serializePermit,
  serializeType,
  setConfig,
  sweepAll,
} from '../visa.js';
import { diplomaticEligibility } from '../linkage.js';

const router = Router();
const DECIDED = "('approved','rejected','issued')";
const QUEUE_STATUSES = ['pending_review', 'supplement_required', 'approved', 'rejected', 'issued', 'withdrawn', 'closed'];

function applicationWithMeta(row) {
  const typeRow = db.prepare('SELECT * FROM visa_types WHERE code = ?').get(row.type_code);
  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(row.user_id);
  const materials = db
    .prepare('SELECT * FROM visa_materials WHERE application_id = ? ORDER BY id')
    .all(row.id)
    .map((m) => ({
      id: m.id,
      kind: m.kind,
      origin: m.origin,
      filename: m.filename,
      mime: m.mime,
      size: m.size,
      createdAt: m.created_at,
    }));
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
  const permit = db.prepare('SELECT * FROM visa_permits WHERE application_id = ?').get(row.id);
  return {
    ...serializeApplication(row, { withPermit: false }),
    permit: serializePermit(permit),
    typeName: typeRow?.name ?? row.type_code,
    validDays: typeRow?.valid_days ?? null,
    stayDays: typeRow?.stay_days ?? null,
    username: user?.username ?? '',
    displayName: user?.display_name ?? '',
    materials,
    reviews,
  };
}

function getApplication(id) {
  const row = db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(Number(id));
  if (!row) throw notFound('Application not found');
  return row;
}

function recordReview(req, app, action, reasonCode, comment) {
  db.prepare(
    'INSERT INTO visa_reviews (application_id, reviewer_id, reviewer_name, action, reason_code, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(app.id, req.user.id, req.user.displayName || req.user.username, action, reasonCode ?? null, comment ?? '', now());
}

// ---------------------------------------------------------------------------
// 审核工作台 (visa:review)
// ---------------------------------------------------------------------------

router.use(authenticate, requirePermission('visa:review'));

router.get('/queue', (req, res) => {
  sweepAll();
  const status = String(req.query.status || '');
  const type = String(req.query.type || '');
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 10;
  const where = ["status != 'draft'"];
  const params = [];
  if (status && QUEUE_STATUSES.includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (type) {
    where.push('type_code = ?');
    params.push(type);
  }
  if (q) {
    where.push('(app_no LIKE ? OR nickname LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM visa_applications WHERE ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT * FROM visa_applications WHERE ${whereSql}
       ORDER BY CASE status WHEN 'pending_review' THEN 0 WHEN 'supplement_required' THEN 1 ELSE 2 END, submitted_at ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  const pending = db.prepare("SELECT COUNT(*) AS n FROM visa_applications WHERE status = 'pending_review'").get().n;
  const supplementing = db.prepare("SELECT COUNT(*) AS n FROM visa_applications WHERE status = 'supplement_required'").get().n;
  res.json({ items: rows.map(applicationWithMeta), total, page, pageSize, pending, supplementing });
});

router.get('/applications/:id', (req, res) => {
  sweepAll();
  res.json({ application: applicationWithMeta(getApplication(req.params.id)) });
});

function decideApplication(req, res, { action }) {
  const app = getApplication(req.params.id);
  const comment = String(req.body?.comment || '').trim().slice(0, 500);
  const reasonCode = req.body?.reasonCode ? String(req.body.reasonCode).slice(0, 40) : null;

  if (action === 'approve') {
    if (app.status !== 'pending_review') throw badRequest('VISA_INVALID_TRANSITION', 'Only pending applications can be approved');
    if (app.type_code === 'DIPLOMATIC' && !diplomaticEligibility(app.user_id).eligible) {
      throw conflict('VISA_DIP_IDENTITY_INACTIVE', 'The applicant no longer holds an active diplomatic identity');
    }
    db.prepare("UPDATE visa_applications SET status = 'approved', decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?").run(
      req.user.id, now(), now(), app.id
    );
    recordReview(req, app, 'approve', null, comment);
    audit(req.user, 'approve_application', 'application', app.app_no, { comment });
    sendMsg(app.user_id, app.id, 'approved', { appNo: app.app_no });
  } else if (action === 'reject') {
    if (app.status !== 'pending_review') throw badRequest('VISA_INVALID_TRANSITION', 'Only pending applications can be rejected');
    if (!reasonCode) throw badRequest('VISA_REASON_REQUIRED', 'A reject reason code is required');
    db.prepare(
      "UPDATE visa_applications SET status = 'rejected', reject_code = ?, reject_comment = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
    ).run(reasonCode, comment, req.user.id, now(), now(), app.id);
    recordReview(req, app, 'reject', reasonCode, comment);
    audit(req.user, 'reject_application', 'application', app.app_no, { reasonCode, comment });
    sendMsg(app.user_id, app.id, 'rejected', { appNo: app.app_no, reason: reasonCode });
  } else if (action === 'require_supplement') {
    if (app.status !== 'pending_review') throw badRequest('VISA_INVALID_TRANSITION', 'Only pending applications can request supplements');
    const days = Math.min(30, Math.max(1, Number(req.body?.supplementDays) || getConfigNumber('visa.supplement_days', 7)));
    const deadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE visa_applications SET status = 'supplement_required', supplement_deadline = ?, updated_at = ? WHERE id = ?").run(
      deadline, now(), app.id
    );
    recordReview(req, app, 'require_supplement', null, comment);
    audit(req.user, 'require_supplement', 'application', app.app_no, { comment, deadline });
    sendMsg(app.user_id, app.id, 'supplement_required', { appNo: app.app_no, deadline, comment });
  } else {
    throw badRequest('VALIDATION_ERROR', 'Unknown review action');
  }
  res.json({ application: applicationWithMeta(getApplication(app.id)) });
}

router.post('/applications/:id/approve', (req, res) => decideApplication(req, res, { action: 'approve' }));
router.post('/applications/:id/reject', (req, res) => decideApplication(req, res, { action: 'reject' }));
router.post('/applications/:id/supplement', (req, res) => decideApplication(req, res, { action: 'require_supplement' }));

// ---------------------------------------------------------------------------
// 签发与签注管理 (visa:review)
// ---------------------------------------------------------------------------

router.post('/applications/:id/issue', (req, res) => {
  const app = getApplication(req.params.id);
  if (app.status !== 'approved') throw badRequest('VISA_INVALID_TRANSITION', 'Only approved applications can be issued');
  if (app.type_code === 'DIPLOMATIC' && !diplomaticEligibility(app.user_id).eligible) {
    throw conflict('VISA_DIP_IDENTITY_INACTIVE', 'The applicant no longer holds an active diplomatic identity');
  }
  if (db.prepare('SELECT 1 FROM visa_permits WHERE application_id = ?').get(app.id)) {
    throw badRequest('VISA_ALREADY_ISSUED', 'Application already has a permit');
  }
  const typeRow = db.prepare('SELECT * FROM visa_types WHERE code = ?').get(app.type_code);
  const days = Math.min(3650, Math.max(1, Number(req.body?.validDays) || typeRow?.valid_days || 90));
  const issuedAt = now();
  const validUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const visaNo = nextVisaNo();
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare(
    `INSERT INTO visa_permits (visa_no, application_id, user_id, type_code, holder_name, status, verify_token, issued_at, valid_until, updated_at)
     VALUES (?, ?, ?, ?, ?, 'valid', ?, ?, ?, ?)`
  ).run(visaNo, app.id, app.user_id, app.type_code, app.nickname, token, issuedAt, validUntil, issuedAt);
  db.prepare("UPDATE visa_applications SET status = 'issued', issued_at = ?, updated_at = ? WHERE id = ?").run(issuedAt, now(), app.id);
  recordReview(req, app, 'issue', null, commentOf(req));
  audit(req.user, 'issue_permit', 'permit', visaNo, { appNo: app.app_no, validUntil });
  sendMsg(app.user_id, app.id, 'issued', { visaNo, appNo: app.app_no, validUntil });
  res.json({ application: applicationWithMeta(getApplication(app.id)) });
});

function commentOf(req) {
  return String(req.body?.comment || '').trim().slice(0, 500);
}

router.get('/permits', (req, res) => {
  sweepAll();
  const status = String(req.query.status || '');
  const rows = status
    ? db.prepare('SELECT * FROM visa_permits WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
    : db.prepare('SELECT * FROM visa_permits ORDER BY id DESC LIMIT 200').all();
  res.json({
    items: rows.map((p) => {
      const app = db.prepare('SELECT app_no FROM visa_applications WHERE id = ?').get(p.application_id);
      return { ...serializePermit(p), appNo: app?.app_no };
    }),
  });
});

// 入境署回写"已使用"的内部模拟入口(正式联动见 /api/visa/inter/*)
router.post('/permits/:visaNo/mark-used', (req, res) => {
  const permit = db.prepare('SELECT * FROM visa_permits WHERE visa_no = ?').get(String(req.params.visaNo));
  if (!permit) throw notFound('Permit not found');
  if (permit.status !== 'valid') throw badRequest('VISA_INVALID_TRANSITION', 'Only valid permits can be marked used');
  db.prepare("UPDATE visa_permits SET status = 'used', updated_at = ? WHERE id = ?").run(now(), permit.id);
  recordReview(req, db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(permit.application_id), 'mark_used', null, commentOf(req));
  audit(req.user, 'mark_permit_used', 'permit', permit.visa_no);
  sendMsg(permit.user_id, permit.application_id, 'used', { visaNo: permit.visa_no });
  res.json({ ok: true });
});

router.post('/permits/:visaNo/void', (req, res) => {
  const permit = db.prepare('SELECT * FROM visa_permits WHERE visa_no = ?').get(String(req.params.visaNo));
  if (!permit) throw notFound('Permit not found');
  if (!['valid', 'used'].includes(permit.status)) throw badRequest('VISA_INVALID_TRANSITION', 'Permit cannot be voided');
  db.prepare("UPDATE visa_permits SET status = 'voided', updated_at = ? WHERE id = ?").run(now(), permit.id);
  recordReview(req, db.prepare('SELECT * FROM visa_applications WHERE id = ?').get(permit.application_id), 'void', null, commentOf(req));
  audit(req.user, 'void_permit', 'permit', permit.visa_no, { comment: commentOf(req) });
  sendMsg(permit.user_id, permit.application_id, 'voided', { visaNo: permit.visa_no });
  res.json({ ok: true });
});

router.get('/verify-logs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM visa_verify_logs ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows });
});

// ---------------------------------------------------------------------------
// 签注配置管理 (visa:manage)
// ---------------------------------------------------------------------------

router.use(requirePermission('visa:manage'));

router.get('/types', (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM visa_types ORDER BY sort_order, id').all().map(serializeType) });
});

function validateTypeBody(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.code !== undefined) {
    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,19}$/.test(code)) throw badRequest('VALIDATION_ERROR', 'Type code must be 2-20 chars A-Z/0-9/_');
    out.code = code;
  }
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw badRequest('VALIDATION_ERROR', 'Type name is required');
    out.name = name.slice(0, 40);
  }
  if (body.description !== undefined) out.description = String(body.description).trim().slice(0, 300);
  if (body.guide !== undefined) out.guide = String(body.guide).trim().slice(0, 2000);
  if (body.stayDays !== undefined) out.stay_days = Math.min(3650, Math.max(1, Number(body.stayDays) || 30));
  if (body.validDays !== undefined) out.valid_days = Math.min(3650, Math.max(1, Number(body.validDays) || 90));
  if (body.renewable !== undefined) out.renewable = body.renewable ? 1 : 0;
  if (body.enabled !== undefined) out.enabled = body.enabled ? 1 : 0;
  if (body.sortOrder !== undefined) out.sort_order = Number(body.sortOrder) || 0;
  return out;
}

router.post('/types', (req, res) => {
  const data = validateTypeBody(req.body || {});
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO visa_types (code, name, description, guide, stay_days, valid_days, renewable, enabled, sort_order, created_at, updated_at)
       VALUES (@code, @name, @description, @guide, @stay_days, @valid_days, @renewable, @enabled, @sort_order, @ts, @ts)`
    )
    .run({ description: '', guide: '', stay_days: 30, valid_days: 90, renewable: 0, enabled: 1, sort_order: 0, ...data, ts });
  audit(req.user, 'create_visa_type', 'visa_type', data.code);
  res.status(201).json({ type: serializeType(db.prepare('SELECT * FROM visa_types WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/types/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM visa_types WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Visa type not found');
  const data = validateTypeBody(req.body || {}, { partial: true });
  const cols = Object.keys(data);
  if (cols.length) {
    const assignments = cols.map((c) => `${c} = @${c}`).join(', ');
    db.prepare(`UPDATE visa_types SET ${assignments}, updated_at = @ts WHERE id = @id`).run({ ...data, ts: now(), id: row.id });
    audit(req.user, 'update_visa_type', 'visa_type', row.code, data);
  }
  res.json({ type: serializeType(db.prepare('SELECT * FROM visa_types WHERE id = ?').get(row.id)) });
});

router.get('/notices', (_req, res) => {
  const rows = db.prepare('SELECT * FROM visa_notices ORDER BY id DESC').all();
  res.json({ items: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, level: n.level, enabled: !!n.enabled, createdAt: n.created_at })) });
});

router.post('/notices', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const body = String(req.body?.body || '').trim().slice(0, 2000);
  const level = ['info', 'policy', 'event'].includes(req.body?.level) ? req.body.level : 'info';
  if (!title) throw badRequest('VALIDATION_ERROR', 'Title is required');
  const ts = now();
  const info = db
    .prepare('INSERT INTO visa_notices (title, body, level, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
    .run(title, body, level, ts, ts);
  audit(req.user, 'create_notice', 'notice', info.lastInsertRowid);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.patch('/notices/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM visa_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 120) : row.title;
  const body = req.body?.body !== undefined ? String(req.body.body).trim().slice(0, 2000) : row.body;
  const level = req.body?.level !== undefined && ['info', 'policy', 'event'].includes(req.body.level) ? req.body.level : row.level;
  const enabled = req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled;
  if (!title) throw badRequest('VALIDATION_ERROR', 'Title is required');
  db.prepare('UPDATE visa_notices SET title = ?, body = ?, level = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
    title, body, level, enabled, now(), row.id
  );
  audit(req.user, 'update_notice', 'notice', row.id, { enabled });
  res.json({ ok: true });
});

router.delete('/notices/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM visa_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  db.prepare('DELETE FROM visa_notices WHERE id = ?').run(row.id);
  audit(req.user, 'delete_notice', 'notice', row.id);
  res.json({ ok: true });
});

router.get('/config', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM visa_config ORDER BY key').all();
  res.json({ items: rows });
});

router.put('/config', (req, res) => {
  const entries = Object.entries(req.body || {});
  for (const [key, value] of entries) {
    if (!key.startsWith('visa.')) continue;
    setConfig(key, String(value));
  }
  audit(req.user, 'update_config', 'config', '', Object.fromEntries(entries));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 风控:黑名单
// ---------------------------------------------------------------------------

router.get('/blacklist', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT b.*, u.username FROM visa_blacklist b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC`
    )
    .all();
  res.json({ items: rows.map((r) => ({ id: r.id, userId: r.user_id, username: r.username, reason: r.reason, createdAt: r.created_at })) });
});

router.post('/blacklist', (req, res) => {
  const userId = Number(req.body?.userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw notFound('User not found');
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  db.prepare('INSERT OR IGNORE INTO visa_blacklist (user_id, reason, created_by, created_at) VALUES (?, ?, ?, ?)').run(
    userId, reason, req.user.username, now()
  );
  audit(req.user, 'blacklist_user', 'user', userId, { reason });
  res.status(201).json({ ok: true });
});

router.delete('/blacklist/:userId', (req, res) => {
  db.prepare('DELETE FROM visa_blacklist WHERE user_id = ?').run(Number(req.params.userId));
  audit(req.user, 'unblacklist_user', 'user', Number(req.params.userId));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 统计 / 审计 / 导出
// ---------------------------------------------------------------------------

router.get('/stats', (_req, res) => {
  sweepAll();
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  const statusCounts = {};
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM visa_applications GROUP BY status').all()) {
    statusCounts[row.status] = row.n;
  }
  const submitted = count(`SELECT COUNT(*) AS n FROM visa_applications WHERE submitted_at IS NOT NULL`);
  const approved = (statusCounts.approved || 0) + (statusCounts.issued || 0);
  const rejected = statusCounts.rejected || 0;
  const typeDistribution = db
    .prepare(`SELECT type_code, COUNT(*) AS n FROM visa_applications WHERE submitted_at IS NOT NULL GROUP BY type_code ORDER BY n DESC`)
    .all();
  const rejectReasons = db
    .prepare(`SELECT reject_code AS code, COUNT(*) AS n FROM visa_applications WHERE reject_code IS NOT NULL GROUP BY reject_code ORDER BY n DESC LIMIT 8`)
    .all();
  const supplementCount = count(
    `SELECT COUNT(DISTINCT application_id) AS n FROM visa_reviews WHERE action = 'require_supplement'`
  );
  const avgReviewMs =
    db
      .prepare(
        `SELECT AVG(julianday(decided_at) - julianday(submitted_at)) AS d FROM visa_applications
         WHERE status IN ${DECIDED} AND submitted_at IS NOT NULL AND decided_at IS NOT NULL`
      )
      .get().d || 0;
  const permitStatusCounts = {};
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM visa_permits GROUP BY status').all()) {
    permitStatusCounts[row.status] = row.n;
  }
  const verifyToday = count(`SELECT COUNT(*) AS n FROM visa_verify_logs WHERE created_at >= ?`, new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
  res.json({
    statusCounts,
    submitted,
    approvalRate: submitted ? approved / submitted : 0,
    rejectRate: submitted ? rejected / submitted : 0,
    supplementRate: submitted ? supplementCount / submitted : 0,
    avgReviewHours: Math.max(0, Math.round((avgReviewMs * 24) * 10) / 10),
    typeDistribution,
    rejectReasons,
    permitStatusCounts,
    verifyToday,
    verifyTotal: count(`SELECT COUNT(*) AS n FROM visa_verify_logs`),
  });
});

router.get('/audit', (req, res) => {
  const action = String(req.query.action || '').trim();
  const rows = action
    ? db.prepare('SELECT * FROM visa_audit WHERE action LIKE ? ORDER BY id DESC LIMIT 200').all(`%${action}%`)
    : db.prepare('SELECT * FROM visa_audit ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows });
});

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/export.csv', (_req, res) => {
  sweepAll();
  const rows = db
    .prepare(
      `SELECT va.*, u.username FROM visa_applications va JOIN users u ON u.id = va.user_id
       WHERE va.status != 'draft' ORDER BY va.id`
    )
    .all();
  const header = ['app_no', 'username', 'type_code', 'status', 'nickname', 'submitted_at', 'decided_at', 'issued_at', 'reject_code'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.app_no, r.username, r.type_code, r.status, r.nickname, r.submitted_at, r.decided_at, r.issued_at, r.reject_code]
        .map(csvEscape)
        .join(',')
    );
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="visa-applications-${Date.now()}.csv"`);
  res.send(`\ufeff${lines.join('\n')}`);
});

export default router;
