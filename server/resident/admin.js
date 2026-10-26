// 奶龙国皇家居民登记署 — admin endpoints.
// res:review → 审核工作台 / 变更续期审批 / 居民卡管理 / 居民信息 / 验真记录
// res:manage → 类型 / 公告模板 / 配置 / 黑名单风控 / 统计 / 审计 / 导出
import { Router } from 'express';
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, notFound } from '../http.js';
import { ensureResidentSchema } from './schema.js';
import {
  audit,
  getConfigNumber,
  nextCardNo,
  notify,
  serializeApplication,
  serializeCard,
  serializeChange,
  serializeType,
  setConfig,
  sweepAll,
} from './util.js';
import { registerAutoApprover, safeAutoApprove } from '../autoApprove.js';

const router = Router();

ensureResidentSchema();

const QUEUE_STATUSES = ['pending_review', 'supplement_required', 'approved', 'rejected', 'withdrawn', 'closed'];
const REJECT_REASONS = new Set(['incomplete', 'false_info', 'duplicate', 'type_mismatch', 'other']);
const CARD_STATUSES = new Set(['valid', 'frozen', 'expired', 'voided']);

function applicationWithMeta(row) {
  const typeRow = db.prepare('SELECT * FROM res_types WHERE code = ?').get(row.type_code);
  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(row.user_id);
  const materials = db
    .prepare('SELECT * FROM res_materials WHERE application_id = ? ORDER BY id')
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
  // 同一账号的历次申请数(重复登记识别)
  const pastCount = db.prepare('SELECT COUNT(*) AS n FROM res_applications WHERE user_id = ?').get(row.user_id).n;
  const blacklist = !!db.prepare('SELECT 1 FROM res_blacklist WHERE user_id = ?').get(row.user_id);
  return {
    ...serializeApplication(row),
    card: serializeCard(card),
    typeName: typeRow?.name ?? row.type_code,
    validYears: typeRow?.valid_years ?? null,
    username: user?.username ?? '',
    displayName: user?.display_name ?? '',
    materials,
    reviews,
    pastApplications: pastCount,
    blacklisted: blacklist,
  };
}

function getApplication(id) {
  const row = db.prepare('SELECT * FROM res_applications WHERE id = ?').get(Number(id));
  if (!row) throw notFound('Application not found');
  return row;
}

function recordReview(actor, app, action, reasonCode, comment) {
  db.prepare(
    'INSERT INTO res_reviews (application_id, reviewer_id, reviewer_name, action, reason_code, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    app.id,
    actor?.id ?? 0,
    actor?.displayName || actor?.username || actor?.name || 'system',
    action,
    reasonCode ?? null,
    comment ?? '',
    now()
  );
}

// ---------------------------------------------------------------------------
// 审核工作台 (res:review)
// ---------------------------------------------------------------------------

router.use(authenticate, requirePermission('res:review'));

router.get('/queue', (req, res) => {
  sweepAll();
  const status = String(req.query.status || '');
  const type = String(req.query.type || '');
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 10;
  const where = ["ra.status != 'draft'"];
  const params = [];
  if (status && QUEUE_STATUSES.includes(status)) {
    where.push('ra.status = ?');
    params.push(status);
  }
  if (type) {
    where.push('ra.type_code = ?');
    params.push(type);
  }
  if (q) {
    where.push('(ra.app_no LIKE ? OR ra.nickname LIKE ? OR u.username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.join(' AND ');
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM res_applications ra JOIN users u ON u.id = ra.user_id WHERE ${whereSql}`)
    .get(...params).n;
  const rows = db
    .prepare(
      `SELECT ra.* FROM res_applications ra JOIN users u ON u.id = ra.user_id WHERE ${whereSql}
       ORDER BY CASE ra.status WHEN 'pending_review' THEN 0 WHEN 'supplement_required' THEN 1 ELSE 2 END, ra.submitted_at ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  const pending = db.prepare("SELECT COUNT(*) AS n FROM res_applications WHERE status = 'pending_review'").get().n;
  const supplementing = db.prepare("SELECT COUNT(*) AS n FROM res_applications WHERE status = 'supplement_required'").get().n;
  const pendingChanges = db.prepare("SELECT COUNT(*) AS n FROM res_changes WHERE status = 'pending_review'").get().n;
  res.json({ items: rows.map(applicationWithMeta), total, page, pageSize, pending, supplementing, pendingChanges });
});

router.get('/applications/:id', (req, res) => {
  sweepAll();
  res.json({ application: applicationWithMeta(getApplication(req.params.id)) });
});

// 通过 → 生成居民身份 + 电子居民卡。人工与自动审批共用。
function approveApplicationCore(app, actor, { comment = '', auto = false } = {}) {
  if (app.status !== 'pending_review') throw badRequest('RES_INVALID_TRANSITION', 'Only pending applications can be approved');
  const ts = now();
  const typeRow = db.prepare('SELECT * FROM res_types WHERE code = ?').get(app.type_code);
  const avatar = db
    .prepare("SELECT id FROM res_materials WHERE application_id = ? AND kind = 'avatar' ORDER BY id DESC LIMIT 1")
    .get(app.id);
  const validUntil = new Date(Date.now() + (typeRow?.valid_years || 1) * 365 * 24 * 60 * 60 * 1000).toISOString();

  const info = db
    .prepare(
      `UPDATE res_applications SET status = 'approved', decided_by = ?, decided_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending_review'`
    )
    .run(actor?.id ?? null, ts, ts, app.id);
  if (!info.changes) throw badRequest('RES_INVALID_TRANSITION', 'Only pending applications can be approved');
  recordReview(actor, app, 'approve', null, comment);

  // 居民身份 upsert(注销后重新登记会刷新档案)
  const existing = db.prepare('SELECT id FROM res_residents WHERE user_id = ?').get(app.user_id);
  if (existing) {
    db.prepare(
      `UPDATE res_residents SET application_id = ?, type_code = ?, nickname = ?, contact = ?, virtual_address = ?,
       bio = ?, avatar_material_id = ?, updated_at = ? WHERE id = ?`
    ).run(app.id, app.type_code, app.nickname, app.contact, app.virtual_address, app.bio, avatar?.id ?? null, ts, existing.id);
  } else {
    db.prepare(
      `INSERT INTO res_residents (user_id, application_id, type_code, nickname, contact, virtual_address, bio, avatar_material_id, since, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(app.user_id, app.id, app.type_code, app.nickname, app.contact, app.virtual_address, app.bio, avatar?.id ?? null, ts, ts, ts);
  }

  // 电子居民卡(登记通过即生成)
  const cardNo = nextCardNo();
  db.prepare(
    `INSERT INTO res_cards (card_no, user_id, application_id, type_code, nickname, status, verify_token, issued_at, valid_until, updated_at)
     VALUES (?, ?, ?, ?, ?, 'valid', ?, ?, ?, ?)`
  ).run(cardNo, app.user_id, app.id, app.type_code, app.nickname, crypto.randomBytes(24).toString('hex'), ts, validUntil, ts);

  audit(actor, 'approve_application', 'application', app.app_no, { comment, cardNo, ...(auto ? { auto: true } : {}) });
  notify(app.user_id, 'approved', { no: app.app_no, cardNo, validUntil: validUntil.slice(0, 10) }, { appNo: app.app_no });
  return cardNo;
}

router.post('/applications/:id/approve', (req, res) => {
  const app = getApplication(req.params.id);
  approveApplicationCore(app, req.user, { comment: String(req.body?.comment || '').trim().slice(0, 500) });
  res.json({ application: applicationWithMeta(getApplication(app.id)) });
});

router.post('/applications/:id/reject', (req, res) => {
  const app = getApplication(req.params.id);
  if (app.status !== 'pending_review') throw badRequest('RES_INVALID_TRANSITION', 'Only pending applications can be rejected');
  const reasonCode = String(req.body?.reasonCode || '');
  if (!REJECT_REASONS.has(reasonCode)) throw badRequest('RES_REASON_REQUIRED', 'A reject reason code is required');
  const comment = String(req.body?.comment || '').trim().slice(0, 500);
  db.prepare(
    "UPDATE res_applications SET status = 'rejected', reject_code = ?, reject_comment = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(reasonCode, comment, req.user.id, now(), now(), app.id);
  recordReview(req.user, app, 'reject', reasonCode, comment);
  audit(req.user, 'reject_application', 'application', app.app_no, { reasonCode, comment });
  notify(app.user_id, 'rejected', { no: app.app_no, reason: reasonCode, note: comment }, { appNo: app.app_no });
  res.json({ application: applicationWithMeta(getApplication(app.id)) });
});

router.post('/applications/:id/supplement', (req, res) => {
  const app = getApplication(req.params.id);
  if (app.status !== 'pending_review') throw badRequest('RES_INVALID_TRANSITION', 'Only pending applications can request supplements');
  const comment = String(req.body?.comment || '').trim().slice(0, 500);
  const days = Math.min(30, Math.max(1, Number(req.body?.supplementDays) || getConfigNumber('res.supplement_days', 7)));
  const deadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("UPDATE res_applications SET status = 'supplement_required', supplement_deadline = ?, updated_at = ? WHERE id = ?").run(
    deadline, now(), app.id
  );
  recordReview(req.user, app, 'require_supplement', null, comment);
  audit(req.user, 'require_supplement', 'application', app.app_no, { comment, deadline });
  notify(app.user_id, 'supplement_required', { no: app.app_no, note: comment, deadline: deadline.slice(0, 10) }, { appNo: app.app_no });
  res.json({ application: applicationWithMeta(getApplication(app.id)) });
});

// ---------------------------------------------------------------------------
// 变更 / 升级 / 续期审批 (res:review)
// ---------------------------------------------------------------------------

router.get('/changes', (req, res) => {
  const status = String(req.query.status || 'pending_review');
  const type = String(req.query.type || '');
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    where.push('rc.status = ?');
    params.push(status);
  }
  if (type) {
    where.push('rc.type = ?');
    params.push(type);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT rc.*, u.username FROM res_changes rc JOIN users u ON u.id = rc.user_id
       ${whereSql} ORDER BY CASE rc.status WHEN 'pending_review' THEN 0 ELSE 1 END, rc.created_at ASC LIMIT 200`
    )
    .all(...params);
  res.json({
    items: rows.map((row) => ({
      ...serializeChange(row),
      username: row.username,
      cardNo: db.prepare('SELECT card_no FROM res_cards WHERE id = ?').get(row.card_id)?.card_no,
      cardStatus: db.prepare('SELECT status FROM res_cards WHERE id = ?').get(row.card_id)?.status,
    })),
  });
});

function applyChangeToCard(change, card) {
  const ts = now();
  let payload = {};
  try {
    payload = JSON.parse(change.payload || '{}');
  } catch {
    payload = {};
  }
  if (change.type === 'info') {
    const resident = db.prepare('SELECT * FROM res_residents WHERE user_id = ?').get(change.user_id);
    if (resident) {
      db.prepare('UPDATE res_residents SET contact = ?, virtual_address = ?, bio = ?, updated_at = ? WHERE id = ?').run(
        payload.contact ?? resident.contact,
        payload.virtualAddress ?? resident.virtual_address,
        payload.bio ?? resident.bio,
        ts,
        resident.id
      );
    }
  } else if (change.type === 'upgrade') {
    const targetCode = payload.targetTypeCode;
    db.prepare('UPDATE res_residents SET type_code = ?, updated_at = ? WHERE user_id = ?').run(targetCode, ts, change.user_id);
    db.prepare('UPDATE res_cards SET type_code = ?, updated_at = ? WHERE id = ?').run(targetCode, ts, card.id);
  } else if (change.type === 'renewal') {
    const typeRow = db.prepare('SELECT * FROM res_types WHERE code = ?').get(card.type_code);
    const years = typeRow?.valid_years || 1;
    const base = Math.max(Date.now(), Date.parse(card.valid_until) || Date.now());
    const validUntil = new Date(base + years * 365 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      "UPDATE res_cards SET valid_until = ?, status = 'valid', remind_sent = 0, renew_count = renew_count + 1, updated_at = ? WHERE id = ?"
    ).run(validUntil, ts, card.id);
    notify(change.user_id, 'card_issued', { cardNo: card.card_no, validUntil: validUntil.slice(0, 10) }, { cardNo: card.card_no });
  }
}

// 变更/升级/续期通过。人工与自动审批共用。
function approveChangeCore(change, actor, { auto = false } = {}) {
  if (change.status !== 'pending_review') throw badRequest('RES_INVALID_TRANSITION', 'Only pending changes can be approved');
  const card = db.prepare('SELECT * FROM res_cards WHERE id = ?').get(change.card_id);
  if (!card) throw notFound('Resident card not found');
  applyChangeToCard(change, card);
  const ts = now();
  const info = db
    .prepare(
      `UPDATE res_changes SET status = 'approved', decided_by = ?, decided_at = ?, updated_at = ?
       WHERE id = ? AND status = 'pending_review'`
    )
    .run(actor?.id ?? null, ts, ts, change.id);
  if (!info.changes) throw badRequest('RES_INVALID_TRANSITION', 'Only pending changes can be approved');
  audit(actor, 'approve_change', 'change', change.no, {
    type: change.type,
    payload: change.payload,
    ...(auto ? { auto: true } : {}),
  });
  notify(change.user_id, 'change_approved', { no: change.no }, { changeNo: change.no });
}

router.post('/changes/:id/approve', (req, res) => {
  const change = db.prepare('SELECT * FROM res_changes WHERE id = ?').get(Number(req.params.id));
  if (!change) throw notFound('Change not found');
  approveChangeCore(change, req.user);
  res.json({ change: serializeChange(db.prepare('SELECT * FROM res_changes WHERE id = ?').get(change.id)) });
});

router.post('/changes/:id/reject', (req, res) => {
  const change = db.prepare('SELECT * FROM res_changes WHERE id = ?').get(Number(req.params.id));
  if (!change) throw notFound('Change not found');
  if (change.status !== 'pending_review') throw badRequest('RES_INVALID_TRANSITION', 'Only pending changes can be rejected');
  const reasonCode = String(req.body?.reasonCode || 'other').slice(0, 40);
  const note = String(req.body?.note || '').trim().slice(0, 500);
  db.prepare("UPDATE res_changes SET status = 'rejected', reject_code = ?, reject_note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?").run(
    reasonCode, note, req.user.id, now(), now(), change.id
  );
  audit(req.user, 'reject_change', 'change', change.no, { reasonCode, note });
  notify(change.user_id, 'change_rejected', { no: change.no, reason: reasonCode, note }, { changeNo: change.no });
  res.json({ change: serializeChange(db.prepare('SELECT * FROM res_changes WHERE id = ?').get(change.id)) });
});

// ---------------------------------------------------------------------------
// 居民卡管理 (res:review)
// ---------------------------------------------------------------------------

router.get('/cards', (req, res) => {
  sweepAll();
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').trim();
  const where = [];
  const params = [];
  if (status && CARD_STATUSES.has(status)) {
    where.push('rc.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(rc.card_no LIKE ? OR rc.nickname LIKE ? OR u.username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT rc.*, u.username FROM res_cards rc JOIN users u ON u.id = rc.user_id
       ${whereSql} ORDER BY rc.id DESC LIMIT 200`
    )
    .all(...params);
  res.json({
    items: rows.map((row) => ({
      ...serializeCard(row),
      username: row.username,
      typeName: db.prepare('SELECT name FROM res_types WHERE code = ?').get(row.type_code)?.name ?? row.type_code,
    })),
  });
});

function loadCard(cardNo) {
  const card = db.prepare('SELECT * FROM res_cards WHERE card_no = ?').get(String(cardNo));
  if (!card) throw notFound('Resident card not found');
  return card;
}

router.post('/cards/:cardNo/freeze', (req, res) => {
  const card = loadCard(req.params.cardNo);
  if (card.status !== 'valid') throw badRequest('RES_INVALID_TRANSITION', 'Only a valid card can be frozen');
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  if (!reason) throw badRequest('RES_REASON_REQUIRED', 'A freeze reason is required (audited)');
  db.prepare("UPDATE res_cards SET status = 'frozen', freeze_reason = ?, updated_at = ? WHERE id = ?").run(reason, now(), card.id);
  audit(req.user, 'freeze_card', 'card', card.card_no, { reason });
  notify(card.user_id, 'card_frozen', { cardNo: card.card_no, reason }, { cardNo: card.card_no });
  res.json({ ok: true });
});

router.post('/cards/:cardNo/unfreeze', (req, res) => {
  const card = loadCard(req.params.cardNo);
  if (card.status !== 'frozen') throw badRequest('RES_INVALID_TRANSITION', 'Only a frozen card can be unfrozen');
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  db.prepare("UPDATE res_cards SET status = 'valid', freeze_reason = '', remind_sent = 0, updated_at = ? WHERE id = ?").run(now(), card.id);
  audit(req.user, 'unfreeze_card', 'card', card.card_no, { reason });
  notify(card.user_id, 'card_unfrozen', { cardNo: card.card_no }, { cardNo: card.card_no });
  res.json({ ok: true });
});

router.post('/cards/:cardNo/void', (req, res) => {
  const card = loadCard(req.params.cardNo);
  if (card.status === 'voided') throw badRequest('RES_INVALID_TRANSITION', 'Card already voided');
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  if (!reason) throw badRequest('RES_REASON_REQUIRED', 'A void reason is required (audited)');
  db.prepare("UPDATE res_cards SET status = 'voided', void_reason = ?, updated_at = ? WHERE id = ?").run(reason, now(), card.id);
  // 注销居民卡 → 居民身份同步失效(可重新登记)
  db.prepare('DELETE FROM res_residents WHERE user_id = ?').run(card.user_id);
  audit(req.user, 'void_card', 'card', card.card_no, { reason });
  notify(card.user_id, 'card_voided', { cardNo: card.card_no, reason }, { cardNo: card.card_no });
  res.json({ ok: true });
});

// 补发/重新生成:换发新验真 token,居民编号保持稳定
router.post('/cards/:cardNo/reissue', (req, res) => {
  const card = loadCard(req.params.cardNo);
  if (!['valid', 'frozen'].includes(card.status)) {
    throw badRequest('RES_INVALID_TRANSITION', 'Only a valid or frozen card can be reissued');
  }
  db.prepare('UPDATE res_cards SET verify_token = ?, updated_at = ? WHERE id = ?').run(
    crypto.randomBytes(24).toString('hex'), now(), card.id
  );
  audit(req.user, 'reissue_card', 'card', card.card_no, { comment: String(req.body?.comment || '').slice(0, 200) });
  notify(card.user_id, 'card_reissued', { cardNo: card.card_no }, { cardNo: card.card_no });
  res.json({ ok: true });
});

// 到期批量提醒:对 N 天内到期的有效卡各发一次提醒
router.post('/cards/expiry-remind', (req, res) => {
  sweepAll();
  const days = Math.min(365, Math.max(1, Number(req.body?.days) || getConfigNumber('res.card_remind_days', 30)));
  const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare("SELECT * FROM res_cards WHERE status = 'valid' AND valid_until <= ?").all(until);
  for (const card of rows) {
    db.prepare('UPDATE res_cards SET remind_sent = 1 WHERE id = ?').run(card.id);
    notify(card.user_id, 'expiry_reminder', { cardNo: card.card_no, validUntil: card.valid_until.slice(0, 10) }, { cardNo: card.card_no });
  }
  audit(req.user, 'batch_expiry_remind', 'card', '', { days, count: rows.length });
  res.json({ ok: true, count: rows.length });
});

// ---------------------------------------------------------------------------
// 居民信息管理 (res:review) — 敏感字段脱敏
// ---------------------------------------------------------------------------

const mask = (v, keep = 2) => {
  const s = String(v ?? '');
  if (!s) return '';
  return s.slice(0, keep) + '***';
};

router.get('/residents', (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const where = [];
  const params = [];
  if (q) {
    where.push('(rc.card_no LIKE ? OR rr.nickname LIKE ? OR u.username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (type) {
    where.push('rr.type_code = ?');
    params.push(type);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT rr.*, u.username, rc.card_no, rc.status AS card_status, rc.valid_until
       FROM res_residents rr
       JOIN users u ON u.id = rr.user_id
       LEFT JOIN res_cards rc ON rc.id = (SELECT id FROM res_cards WHERE user_id = rr.user_id ORDER BY id DESC LIMIT 1)
       ${whereSql} ORDER BY rr.id DESC LIMIT 200`
    )
    .all(...params);
  res.json({
    items: rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      cardNo: row.card_no,
      typeCode: row.type_code,
      typeName: db.prepare('SELECT name FROM res_types WHERE code = ?').get(row.type_code)?.name ?? row.type_code,
      nickname: row.nickname,
      contact: mask(row.contact),
      virtualAddress: mask(row.virtual_address, 4),
      cardStatus: row.card_status,
      validUntil: row.valid_until,
      since: row.since,
    })),
  });
});

router.get('/residents/:userId', (req, res) => {
  const userId = Number(req.params.userId);
  const resident = db.prepare('SELECT * FROM res_residents WHERE user_id = ?').get(userId);
  if (!resident) throw notFound('Resident not found');
  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(userId);
  const cards = db
    .prepare('SELECT * FROM res_cards WHERE user_id = ? ORDER BY id DESC')
    .all(userId)
    .map((c) => ({ ...serializeCard(c), verifyToken: undefined }));
  const changes = db
    .prepare('SELECT * FROM res_changes WHERE user_id = ? ORDER BY id DESC LIMIT 50')
    .all(userId)
    .map(serializeChange);
  const applications = db
    .prepare('SELECT * FROM res_applications WHERE user_id = ? ORDER BY id DESC LIMIT 50')
    .all(userId)
    .map((row) => ({ ...serializeApplication(row), contact: mask(row.contact), virtualAddress: mask(row.virtual_address, 4) }));
  const related = {
    visaApplications: db.prepare('SELECT COUNT(*) AS n FROM visa_applications WHERE user_id = ?').get(userId).n,
    immigrationDeclarations: db.prepare('SELECT COUNT(*) AS n FROM im_declarations WHERE user_id = ?').get(userId)?.n ?? 0,
  };
  audit(req.user, 'view_resident', 'resident', userId);
  res.json({
    resident: { ...serializeResident(resident), contact: mask(resident.contact), virtualAddress: mask(resident.virtual_address, 4) },
    username: user?.username ?? '',
    displayName: user?.display_name ?? '',
    cards,
    changes,
    applications,
    related,
  });
});

// ---------------------------------------------------------------------------
// 验真记录 (res:review 只读;配置在 res:manage)
// ---------------------------------------------------------------------------

router.get('/verify-logs', (req, res) => {
  const rows = db.prepare('SELECT * FROM res_verify_logs ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows });
});

// ---------------------------------------------------------------------------
// 署内配置管理 (res:manage)
// ---------------------------------------------------------------------------

router.use(requirePermission('res:manage'));

router.get('/types', (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM res_types ORDER BY sort_order, id').all().map(serializeType) });
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
  if (body.nameTw !== undefined) out.name_tw = String(body.nameTw || '').trim().slice(0, 40) || null;
  if (body.descriptionTw !== undefined) out.description_tw = String(body.descriptionTw || '').trim().slice(0, 300) || null;
  if (body.guide !== undefined) out.guide = String(body.guide).trim().slice(0, 2000);
  if (body.guideTw !== undefined) out.guide_tw = String(body.guideTw || '').trim().slice(0, 2000) || null;
  if (body.benefits !== undefined) out.benefits = String(body.benefits).trim().slice(0, 1000);
  if (body.benefitsTw !== undefined) out.benefits_tw = String(body.benefitsTw || '').trim().slice(0, 1000) || null;
  if (body.duties !== undefined) out.duties = String(body.duties).trim().slice(0, 1000);
  if (body.dutiesTw !== undefined) out.duties_tw = String(body.dutiesTw || '').trim().slice(0, 1000) || null;
  if (body.validYears !== undefined) out.valid_years = Math.min(100, Math.max(1, Number(body.validYears) || 1));
  if (body.requireAvatar !== undefined) out.require_avatar = body.requireAvatar ? 1 : 0;
  if (body.requireAddressProof !== undefined) out.require_address_proof = body.requireAddressProof ? 1 : 0;
  if (body.enabled !== undefined) out.enabled = body.enabled ? 1 : 0;
  if (body.sortOrder !== undefined) out.sort_order = Number(body.sortOrder) || 0;
  return out;
}

router.post('/types', (req, res) => {
  const data = validateTypeBody(req.body || {});
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO res_types (code, name, name_tw, description, description_tw, guide, guide_tw, benefits, benefits_tw, duties, duties_tw, valid_years, require_avatar, require_address_proof, enabled, sort_order, created_at, updated_at)
       VALUES (@code, @name, @name_tw, @description, @description_tw, @guide, @guide_tw, @benefits, @benefits_tw, @duties, @duties_tw, @valid_years, @require_avatar, @require_address_proof, @enabled, @sort_order, @ts, @ts)`
    )
    .run({
      description: '', guide: '', benefits: '', duties: '',
      name_tw: null, description_tw: null, guide_tw: null, benefits_tw: null, duties_tw: null,
      valid_years: 1, require_avatar: 1, require_address_proof: 0, enabled: 1, sort_order: 0,
      ...data, ts,
    });
  audit(req.user, 'create_resident_type', 'res_type', data.code);
  res.status(201).json({ type: serializeType(db.prepare('SELECT * FROM res_types WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/types/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM res_types WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Resident type not found');
  const data = validateTypeBody(req.body || {}, { partial: true });
  const cols = Object.keys(data);
  if (cols.length) {
    const assignments = cols.map((c) => `${c} = @${c}`).join(', ');
    db.prepare(`UPDATE res_types SET ${assignments}, updated_at = @ts WHERE id = @id`).run({ ...data, ts: now(), id: row.id });
    audit(req.user, 'update_resident_type', 'res_type', row.code, data);
  }
  res.json({ type: serializeType(db.prepare('SELECT * FROM res_types WHERE id = ?').get(row.id)) });
});

router.get('/notices', (_req, res) => {
  const rows = db.prepare('SELECT * FROM res_notices ORDER BY id DESC').all();
  res.json({
    items: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, level: n.level, enabled: !!n.enabled, createdAt: n.created_at })),
  });
});

router.post('/notices', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const body = String(req.body?.body || '').trim().slice(0, 2000);
  const titleTw = String(req.body?.titleTw || '').trim().slice(0, 120) || null;
  const bodyTw = String(req.body?.bodyTw || '').trim().slice(0, 2000) || null;
  const level = ['info', 'policy', 'event'].includes(req.body?.level) ? req.body.level : 'info';
  if (!title) throw badRequest('VALIDATION_ERROR', 'Title is required');
  const ts = now();
  const info = db.prepare('INSERT INTO res_notices (title, title_tw, body, body_tw, level, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)').run(
    title, titleTw, body, bodyTw, level, ts, ts
  );
  audit(req.user, 'create_notice', 'notice', info.lastInsertRowid);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.patch('/notices/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM res_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 120) : row.title;
  const body = req.body?.body !== undefined ? String(req.body.body).trim().slice(0, 2000) : row.body;
  const titleTw = req.body?.titleTw !== undefined ? String(req.body.titleTw || '').trim().slice(0, 120) || null : row.title_tw;
  const bodyTw = req.body?.bodyTw !== undefined ? String(req.body.bodyTw || '').trim().slice(0, 2000) || null : row.body_tw;
  const level = req.body?.level !== undefined && ['info', 'policy', 'event'].includes(req.body.level) ? req.body.level : row.level;
  const enabled = req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled;
  if (!title) throw badRequest('VALIDATION_ERROR', 'Title is required');
  db.prepare('UPDATE res_notices SET title = ?, title_tw = ?, body = ?, body_tw = ?, level = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
    title, titleTw, body, bodyTw, level, enabled, now(), row.id
  );
  audit(req.user, 'update_notice', 'notice', row.id, { enabled });
  res.json({ ok: true });
});

router.delete('/notices/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM res_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  db.prepare('DELETE FROM res_notices WHERE id = ?').run(row.id);
  audit(req.user, 'delete_notice', 'notice', row.id);
  res.json({ ok: true });
});

// 消息模板
router.get('/templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM res_message_templates ORDER BY code').all();
  res.json({
    items: rows.map((t) => ({
      code: t.code,
      titleTemplate: t.title_template,
      bodyTemplate: t.body_template,
      titleTemplateTw: t.title_template_tw,
      bodyTemplateTw: t.body_template_tw,
      variables: t.variables,
      enabled: !!t.enabled,
      updatedAt: t.updated_at,
    })),
  });
});

router.patch('/templates/:code', (req, res) => {
  const row = db.prepare('SELECT * FROM res_message_templates WHERE code = ?').get(String(req.params.code));
  if (!row) throw notFound('Template not found');
  const title = req.body?.titleTemplate !== undefined ? String(req.body.titleTemplate).trim().slice(0, 120) : row.title_template;
  const body = req.body?.bodyTemplate !== undefined ? String(req.body.bodyTemplate).trim().slice(0, 1000) : row.body_template;
  const titleTw = req.body?.titleTemplateTw !== undefined ? String(req.body.titleTemplateTw ?? '').trim().slice(0, 120) || null : row.title_template_tw;
  const bodyTw = req.body?.bodyTemplateTw !== undefined ? String(req.body.bodyTemplateTw ?? '').trim().slice(0, 1000) || null : row.body_template_tw;
  const enabled = req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled;
  if (!title || !body) throw badRequest('VALIDATION_ERROR', 'Title and body templates are required');
  db.prepare('UPDATE res_message_templates SET title_template = ?, body_template = ?, title_template_tw = ?, body_template_tw = ?, enabled = ?, updated_at = ? WHERE code = ?').run(
    title, body, titleTw, bodyTw, enabled, now(), row.code
  );
  audit(req.user, 'update_message_template', 'template', row.code, { enabled });
  res.json({ ok: true });
});

// 站内信发送记录
router.get('/messages', (req, res) => {
  const q = String(req.query.q || '').trim();
  const where = [];
  const params = [];
  if (q) {
    where.push('(m.title LIKE ? OR u.username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT m.id, m.user_id, m.template_code, m.title, m.title_tw, m.read, m.archived, m.created_at, u.username
       FROM res_messages m JOIN users u ON u.id = m.user_id ${whereSql} ORDER BY m.id DESC LIMIT 200`
    )
    .all(...params);
  res.json({ items: rows });
});

router.get('/config', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM res_config ORDER BY key').all();
  res.json({ items: rows });
});

router.put('/config', (req, res) => {
  const entries = Object.entries(req.body || {});
  for (const [key, value] of entries) {
    if (!key.startsWith('res.')) continue;
    setConfig(key, String(value));
  }
  audit(req.user, 'update_config', 'config', '', Object.fromEntries(entries));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 风控:黑名单 + 重复登记识别
// ---------------------------------------------------------------------------

router.get('/blacklist', (_req, res) => {
  const rows = db.prepare('SELECT b.*, u.username FROM res_blacklist b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC').all();
  res.json({ items: rows.map((r) => ({ id: r.id, userId: r.user_id, username: r.username, reason: r.reason, createdAt: r.created_at })) });
});

router.post('/blacklist', (req, res) => {
  const userId = Number(req.body?.userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw notFound('User not found');
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  db.prepare('INSERT OR IGNORE INTO res_blacklist (user_id, reason, created_by, created_at) VALUES (?, ?, ?, ?)').run(
    userId, reason, req.user.username, now()
  );
  audit(req.user, 'blacklist_user', 'user', userId, { reason });
  res.status(201).json({ ok: true });
});

router.delete('/blacklist/:userId', (req, res) => {
  db.prepare('DELETE FROM res_blacklist WHERE user_id = ?').run(Number(req.params.userId));
  audit(req.user, 'unblacklist_user', 'user', Number(req.params.userId));
  res.json({ ok: true });
});

// 风控概览:重复登记、验真限流触发、黑名单
router.get('/risk', (_req, res) => {
  sweepAll();
  const duplicates = db
    .prepare(
      `SELECT ra.user_id, u.username, COUNT(*) AS applications
       FROM res_applications ra JOIN users u ON u.id = ra.user_id
       GROUP BY ra.user_id HAVING COUNT(*) > 1 ORDER BY applications DESC LIMIT 20`
    )
    .all();
  const rateLimited = db.prepare("SELECT COUNT(*) AS n FROM res_verify_logs WHERE result = 'rate_limited'").get().n;
  const blacklisted = db.prepare('SELECT COUNT(*) AS n FROM res_blacklist').get().n;
  res.json({ duplicates, rateLimitedVerify: rateLimited, blacklisted });
});

// ---------------------------------------------------------------------------
// 统计 / 审计 / 导出
// ---------------------------------------------------------------------------

router.get('/stats', (_req, res) => {
  sweepAll();
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  const statusCounts = {};
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM res_applications GROUP BY status').all()) {
    statusCounts[row.status] = row.n;
  }
  const submitted = count('SELECT COUNT(*) AS n FROM res_applications WHERE submitted_at IS NOT NULL');
  const approved = statusCounts.approved || 0;
  const rejected = statusCounts.rejected || 0;
  const typeDistribution = db
    .prepare('SELECT type_code, COUNT(*) AS n FROM res_applications WHERE submitted_at IS NOT NULL GROUP BY type_code ORDER BY n DESC')
    .all();
  const residentTypeDistribution = db
    .prepare("SELECT type_code, COUNT(*) AS n FROM res_cards WHERE status IN ('valid','frozen') GROUP BY type_code ORDER BY n DESC")
    .all();
  const rejectReasons = db
    .prepare('SELECT reject_code AS code, COUNT(*) AS n FROM res_applications WHERE reject_code IS NOT NULL GROUP BY reject_code ORDER BY n DESC LIMIT 8')
    .all();
  const supplementCount = count("SELECT COUNT(DISTINCT application_id) AS n FROM res_reviews WHERE action = 'require_supplement'");
  const avgReviewMs =
    db
      .prepare(
        `SELECT AVG(julianday(decided_at) - julianday(submitted_at)) AS d FROM res_applications
         WHERE status IN ('approved','rejected') AND submitted_at IS NOT NULL AND decided_at IS NOT NULL`
      )
      .get().d || 0;
  const cardStatusCounts = {};
  for (const row of db.prepare('SELECT status, COUNT(*) AS n FROM res_cards GROUP BY status').all()) {
    cardStatusCounts[row.status] = row.n;
  }
  const changeCounts = {};
  for (const row of db.prepare('SELECT type, COUNT(*) AS n FROM res_changes GROUP BY type').all()) {
    changeCounts[row.type] = row.n;
  }
  const trend = db
    .prepare(
      `SELECT substr(submitted_at, 1, 10) AS day, COUNT(*) AS submissions FROM res_applications
       WHERE submitted_at >= ? GROUP BY day ORDER BY day`
    )
    .all(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  const today = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  res.json({
    statusCounts,
    submitted,
    approvalRate: submitted ? approved / submitted : 0,
    rejectRate: submitted ? rejected / submitted : 0,
    supplementRate: submitted ? supplementCount / submitted : 0,
    avgReviewHours: Math.max(0, Math.round(avgReviewMs * 24 * 10) / 10),
    typeDistribution,
    residentTypeDistribution,
    rejectReasons,
    cardStatusCounts,
    changeCounts,
    verifyToday: count('SELECT COUNT(*) AS n FROM res_verify_logs WHERE created_at >= ?', today),
    verifyTotal: count('SELECT COUNT(*) AS n FROM res_verify_logs'),
    trend,
  });
});

router.get('/audit', (req, res) => {
  const action = String(req.query.action || '').trim();
  const rows = action
    ? db.prepare('SELECT * FROM res_audit WHERE action LIKE ? ORDER BY id DESC LIMIT 200').all(`%${action}%`)
    : db.prepare('SELECT * FROM res_audit ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows });
});

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 居民数据导出(敏感:写入审计日志)
router.get('/export.csv', (req, res) => {
  sweepAll();
  audit(req.user, 'export_residents_csv', 'export', '', { by: req.user.username });
  const rows = db
    .prepare(
      `SELECT ra.*, u.username FROM res_applications ra JOIN users u ON u.id = ra.user_id
       WHERE ra.status != 'draft' ORDER BY ra.id`
    )
    .all();
  const header = ['app_no', 'username', 'type_code', 'status', 'nickname', 'submitted_at', 'decided_at', 'reject_code'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.app_no, r.username, r.type_code, r.status, r.nickname, r.submitted_at, r.decided_at, r.reject_code]
        .map(csvEscape)
        .join(',')
    );
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="resident-applications-${Date.now()}.csv"`);
  res.send(`\ufeff${lines.join('\n')}`);
});

router.get('/audit.csv', (req, res) => {
  const rows = db.prepare('SELECT * FROM res_audit ORDER BY id DESC LIMIT 5000').all();
  const header = ['id', 'actor_name', 'action', 'target_type', 'target_id', 'detail', 'created_at'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([r.id, r.actor_name, r.action, r.target_type, r.target_id, r.detail, r.created_at].map(csvEscape).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="resident-audit-${Date.now()}.csv"`);
  res.send(`\ufeff${lines.join('\n')}`);
});

// ---------------------------------------------------------------------------
// 自动审批:先登记(生成居民卡)再处理变更/升级/续期。
// ---------------------------------------------------------------------------
registerAutoApprover('resident', ({ cutoff, actor }) => {
  let processed = 0;
  const applications = db
    .prepare(
      `SELECT * FROM res_applications
       WHERE status = 'pending_review' AND updated_at <= ?
       ORDER BY updated_at, id LIMIT 20`
    )
    .all(cutoff);
  for (const row of applications) {
    processed += safeAutoApprove('resident', `application:${row.id}`, () =>
      approveApplicationCore(row, actor, { auto: true })
    );
  }
  const changes = db
    .prepare(
      `SELECT * FROM res_changes
       WHERE status = 'pending_review' AND updated_at <= ?
       ORDER BY updated_at, id LIMIT 20`
    )
    .all(cutoff);
  for (const row of changes) {
    processed += safeAutoApprove('resident', `change:${row.id}`, () => approveChangeCore(row, actor, { auto: true }));
  }
  return processed;
});

export default router;
