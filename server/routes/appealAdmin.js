// 奶龍國皇家申訴與監察署 — admin endpoints with queue isolation:
//   appeal:process → 申诉工作台 + 投诉建议/工单处理
//   appeal:review  → 复核管理(一次终局)
//   appeal:inspect → 监察与审核质量(只读分析,不改业务数据)
//   appeal:manage  → 公告/公示/模板/黑名单/配置/统计/审计/导出
// 每个权限段是独立子路由,避免中间件叠加导致监察员必须兼有处理权。
import { Router } from 'express';
import crypto from 'node:crypto';
import { db, now, loadUserAccess } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, notFound } from '../http.js';
import {
  audit,
  getConfigNumber,
  nextDecisionNo,
  sendMsg,
  serializeAppeal,
  serializeComplaint,
  serializeDecision,
  serializeNotice,
  serializePublicity,
  serializeReview,
  serializeTicket,
  setConfig,
  sweepAll,
  writebackDecision,
} from '../appeal.js';
import { record, recordsFor } from './appeal.js';

const router = Router();
const APPEAL_OPEN = "('pending_accept','accepted','processing','supplement_required')";
const DECISION_TYPES = new Set(['maintain', 'undo', 'change', 'transfer']);
const REVIEW_DECISIONS = new Set(['maintain', 'undo', 'change']);

function staffPermissions(userId) {
  const user = loadUserAccess(userId);
  return user ? new Set(user.permissions || []) : new Set();
}

function appealAdminMeta(row) {
  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(row.user_id);
  return {
    ...serializeAppeal(row),
    username: user?.username ?? '',
    displayName: user?.display_name ?? '',
    materials: db
      .prepare("SELECT * FROM appeal_materials WHERE owner_type = 'appeal' AND owner_id = ? ORDER BY id")
      .all(row.id)
      .map((m) => ({ id: m.id, kind: m.kind, origin: m.origin, filename: m.filename, mime: m.mime, size: m.size, createdAt: m.created_at })),
    records: recordsFor('appeal', row.id),
    review: serializeReview(db.prepare('SELECT * FROM appeal_reviews WHERE appeal_id = ? ORDER BY id DESC').get(row.id)),
    decision: serializeDecision(db.prepare('SELECT * FROM appeal_decisions WHERE appeal_id = ? ORDER BY id DESC').get(row.id)),
    // 关联业务只读链路(预留):各业务署接入后此处返回其审核记录快照
    bizLink: { integrated: false, reserved: true },
  };
}

function getAppeal(id) {
  const row = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(id));
  if (!row) throw notFound('Appeal not found');
  return row;
}

function createDecisionDoc({ appeal, review, decisionType, reason, basis, actor }) {
  const code = nextDecisionNo();
  const token = crypto.randomBytes(24).toString('hex');
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO appeal_decisions
       (code, appeal_id, appeal_code, review_id, review_code, user_id, biz_type, decision_type, reason, basis, status, effective_at, verify_token, cert_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?, ?, '', ?)`
    )
    .run(
      code,
      appeal.id,
      appeal.code,
      review?.id ?? null,
      review?.code ?? '',
      appeal.user_id,
      appeal.biz_type,
      decisionType,
      reason,
      basis ?? '',
      ts,
      token,
      ts
    );
  sendMsg(appeal.user_id, 'decision', info.lastInsertRowid, 'decision_issued', { code, appealCode: appeal.code });
  audit(actor, 'issue_decision_doc', 'decision', code, { appealCode: appeal.code, decisionType, reviewCode: review?.code ?? null });
  return db.prepare('SELECT * FROM appeal_decisions WHERE id = ?').get(info.lastInsertRowid);
}

// ===========================================================================
// 申诉受理与处理工作台 (appeal:process)
// ===========================================================================

const processRouter = Router();
processRouter.use(authenticate, requirePermission('appeal:process'));

processRouter.get('/appeals/queue', (req, res) => {
  sweepAll();
  const status = String(req.query.status || '');
  const bizType = String(req.query.bizType || '');
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = 10;
  const where = ["status != 'draft'"];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (bizType) {
    where.push('biz_type = ?');
    params.push(bizType);
  }
  if (q) {
    where.push('(code LIKE ? OR biz_code LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM appeal_appeals WHERE ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT * FROM appeal_appeals WHERE ${whereSql}
       ORDER BY CASE status WHEN 'pending_accept' THEN 0 WHEN 'supplement_required' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END, submitted_at ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  const pending = db.prepare("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status = 'pending_accept'").get().n;
  const processing = db.prepare("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status IN ('accepted','processing')").get().n;
  const supplementing = db.prepare("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status = 'supplement_required'").get().n;
  const acceptSla = new Date(Date.now() - getConfigNumber('appeal.accept_sla_hours', 48) * 3600_000).toISOString();
  const overdue = db
    .prepare(`SELECT COUNT(*) AS n FROM appeal_appeals WHERE status = 'pending_accept' AND submitted_at < ?`)
    .get(acceptSla).n;
  res.json({ items: rows.map(appealAdminMeta), total, page, pageSize, pending, processing, supplementing, overdue });
});

processRouter.get('/appeals/:id', (req, res) => {
  sweepAll();
  res.json({ appeal: appealAdminMeta(getAppeal(req.params.id)) });
});

processRouter.get('/handlers', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT u.id, u.username, u.display_name FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE p.key = 'appeal:process' AND u.status = 'active' ORDER BY u.id`
    )
    .all();
  res.json({ items: rows });
});

processRouter.post('/appeals/:id/accept', (req, res) => {
  const appeal = getAppeal(req.params.id);
  if (appeal.status !== 'pending_accept') throw badRequest('APPEAL_INVALID_TRANSITION', 'Only pending appeals can be accepted');
  const comment = String(req.body?.comment || '').trim().slice(0, 500);
  db.prepare(
    "UPDATE appeal_appeals SET status = 'accepted', accepted_at = ?, handler_name = ?, updated_at = ? WHERE id = ?"
  ).run(now(), req.user.displayName || req.user.username, now(), appeal.id);
  record('appeal', appeal.id, req.user, 'accept', comment);
  audit(req.user, 'accept_appeal', 'appeal', appeal.code, { comment });
  sendMsg(appeal.user_id, 'appeal', appeal.id, 'appeal_accepted', { code: appeal.code });
  res.json({ appeal: appealAdminMeta(getAppeal(appeal.id)) });
});

processRouter.post('/appeals/:id/reject-accept', (req, res) => {
  const appeal = getAppeal(req.params.id);
  if (appeal.status !== 'pending_accept') throw badRequest('APPEAL_INVALID_TRANSITION', 'Only pending appeals can be refused');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) throw badRequest('APPEAL_REASON_REQUIRED', 'A refusal reason is required');
  db.prepare("UPDATE appeal_appeals SET status = 'rejected', reject_reason = ?, decided_at = ?, updated_at = ? WHERE id = ?").run(
    reason.slice(0, 500), now(), now(), appeal.id
  );
  record('appeal', appeal.id, req.user, 'reject_accept', reason);
  audit(req.user, 'refuse_appeal', 'appeal', appeal.code, { reason });
  sendMsg(appeal.user_id, 'appeal', appeal.id, 'appeal_accept_rejected', { code: appeal.code, reason });
  res.json({ appeal: appealAdminMeta(getAppeal(appeal.id)) });
});

processRouter.post('/appeals/:id/dispatch', (req, res) => {
  const appeal = getAppeal(req.params.id);
  if (!['accepted', 'processing'].includes(appeal.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Appeal is not in a dispatchable status');
  }
  const assignee = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.body?.assigneeId));
  if (!assignee) throw notFound('Assignee not found');
  const perms = staffPermissions(assignee.id);
  if (!perms.has('appeal:process')) throw badRequest('APPEAL_ASSIGNEE_INVALID', 'Assignee lacks the appeal:process permission');
  const priority = ['low', 'normal', 'high', 'urgent'].includes(req.body?.priority) ? req.body.priority : appeal.priority;
  db.prepare(
    "UPDATE appeal_appeals SET status = 'processing', assigned_to = ?, handler_name = ?, priority = ?, updated_at = ? WHERE id = ?"
  ).run(assignee.id, assignee.display_name || assignee.username, priority, now(), appeal.id);
  record('appeal', appeal.id, req.user, 'dispatch', `${assignee.username} / ${priority}`);
  audit(req.user, 'dispatch_appeal', 'appeal', appeal.code, { assignee: assignee.username, priority });
  res.json({ appeal: appealAdminMeta(getAppeal(appeal.id)) });
});

processRouter.post('/appeals/:id/supplement', (req, res) => {
  const appeal = getAppeal(req.params.id);
  if (!['accepted', 'processing'].includes(appeal.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Appeal is not awaiting supplements');
  }
  const comment = String(req.body?.comment || '').trim();
  if (!comment) throw badRequest('APPEAL_REASON_REQUIRED', 'A supplement note is required');
  const days = Math.min(30, Math.max(1, Number(req.body?.days) || getConfigNumber('appeal.supplement_days', 7)));
  const deadline = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("UPDATE appeal_appeals SET status = 'supplement_required', supplement_note = ?, supplement_deadline = ?, updated_at = ? WHERE id = ?").run(
    comment.slice(0, 500), deadline, now(), appeal.id
  );
  record('appeal', appeal.id, req.user, 'supplement_request', comment);
  audit(req.user, 'require_supplement', 'appeal', appeal.code, { comment, deadline });
  sendMsg(appeal.user_id, 'appeal', appeal.id, 'appeal_supplement_required', { code: appeal.code, deadline, comment });
  res.json({ appeal: appealAdminMeta(getAppeal(appeal.id)) });
});

processRouter.post('/appeals/:id/decide', (req, res) => {
  const appeal = getAppeal(req.params.id);
  if (!['accepted', 'processing'].includes(appeal.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Appeal is not ready for a decision');
  }
  const decisionType = String(req.body?.decisionType || '');
  if (!DECISION_TYPES.has(decisionType)) throw badRequest('VALIDATION_ERROR', 'Unsupported decision type');
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) throw badRequest('APPEAL_REASON_REQUIRED', 'A decision reason is required');
  const basis = String(req.body?.basis || '').trim().slice(0, 500);
  const ts = now();
  db.prepare(
    `UPDATE appeal_appeals SET status = 'resolved', decision_type = ?, decision_reason = ?, decision_basis = ?,
     handler_name = ?, resolved_at = ?, updated_at = ? WHERE id = ?`
  ).run(decisionType, reason, basis, req.user.displayName || req.user.username, ts, ts, appeal.id);
  record('appeal', appeal.id, req.user, 'decide', `${decisionType}: ${reason}`);
  const decision = createDecisionDoc({ appeal, decisionType, reason, basis, actor: req.user });
  // 职责分离:回写业务状态由原业务署执行,这里只做预留审计
  writebackDecision(appeal, { decisionType, decisionCode: decision.code });
  sendMsg(appeal.user_id, 'appeal', appeal.id, 'appeal_resolved', { code: appeal.code, decisionType });
  audit(req.user, 'decide_appeal', 'appeal', appeal.code, { decisionType });
  res.json({ appeal: appealAdminMeta(getAppeal(appeal.id)) });
});

processRouter.post('/appeals/:id/close', (req, res) => {
  const appeal = getAppeal(req.params.id);
  if (!['resolved', 'rejected'].includes(appeal.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Only decided appeals can be closed');
  }
  db.prepare("UPDATE appeal_appeals SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), appeal.id);
  record('appeal', appeal.id, req.user, 'close', String(req.body?.comment || '').slice(0, 500));
  audit(req.user, 'close_appeal', 'appeal', appeal.code);
  res.json({ appeal: appealAdminMeta(getAppeal(appeal.id)) });
});

processRouter.post('/appeals/merge', (req, res) => {
  const source = getAppeal(req.body?.sourceId);
  let target = null;
  if (req.body?.targetId) target = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(Number(req.body.targetId));
  else if (req.body?.targetCode) target = db.prepare('SELECT * FROM appeal_appeals WHERE code = ?').get(String(req.body.targetCode).toUpperCase());
  if (!target) throw notFound('Target appeal not found');
  if (source.id === target.id) throw badRequest('VALIDATION_ERROR', 'Cannot merge an appeal into itself');
  if (!['resolved', 'rejected'].includes(target.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Target appeal should be decided first');
  }
  if (!['draft', 'pending_accept', 'accepted', 'processing', 'supplement_required'].includes(source.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Source appeal is not open');
  }
  db.prepare("UPDATE appeal_appeals SET status = 'closed', merged_into = ?, closed_at = ?, updated_at = ? WHERE id = ?").run(
    target.code, now(), now(), source.id
  );
  record('appeal', source.id, req.user, 'merge', `merged into ${target.code}`);
  audit(req.user, 'merge_appeals', 'appeal', source.code, { targetCode: target.code });
  sendMsg(source.user_id, 'appeal', source.id, 'appeal_merged', { code: source.code, targetCode: target.code });
  res.json({ appeal: appealAdminMeta(getAppeal(source.id)) });
});

// ---------------------------------------------------------------------------
// 投诉建议与工单 (appeal:process)
// ---------------------------------------------------------------------------

function complaintAdminMeta(row) {
  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(row.user_id);
  return {
    ...serializeComplaint(row),
    // 匿名投诉:不向处理员展示账号身份
    username: row.anonymous ? '(anonymous)' : user?.username ?? '',
    displayName: row.anonymous ? '(anonymous)' : user?.display_name ?? '',
    materials: db
      .prepare("SELECT * FROM appeal_materials WHERE owner_type = 'complaint' AND owner_id = ? ORDER BY id")
      .all(row.id)
      .map((m) => ({ id: m.id, kind: m.kind, origin: m.origin, filename: m.filename, mime: m.mime, size: m.size, createdAt: m.created_at })),
    records: recordsFor('complaint', row.id),
  };
}

processRouter.get('/complaints/queue', (req, res) => {
  const status = String(req.query.status || '');
  const kind = String(req.query.kind || '');
  const where = [];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (kind) {
    where.push('kind = ?');
    params.push(kind);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT * FROM appeal_complaints ${whereSql} ORDER BY id DESC LIMIT 200`)
    .all(...params);
  res.json({ items: rows.map(complaintAdminMeta) });
});

processRouter.get('/complaints/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Complaint not found');
  res.json({ complaint: complaintAdminMeta(row) });
});

processRouter.post('/complaints/:id/accept', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Complaint not found');
  if (row.status !== 'pending_accept') throw badRequest('APPEAL_INVALID_TRANSITION', 'Complaint already accepted');
  db.prepare("UPDATE appeal_complaints SET status = 'processing', updated_at = ? WHERE id = ?").run(now(), row.id);
  record('complaint', row.id, req.user, 'accept');
  audit(req.user, 'accept_complaint', 'complaint', row.code);
  res.json({ complaint: complaintAdminMeta(db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(row.id)) });
});

processRouter.post('/complaints/:id/reply', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Complaint not found');
  if (!['pending_accept', 'processing'].includes(row.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Complaint is closed');
  }
  const content = String(req.body?.content || '').trim();
  if (!content) throw badRequest('APPEAL_FIELD_REQUIRED', 'Reply content is required');
  db.prepare(
    "UPDATE appeal_complaints SET status = 'replied', reply = ?, replied_name = ?, replied_at = ?, updated_at = ? WHERE id = ?"
  ).run(content.slice(0, 2000), req.user.displayName || req.user.username, now(), now(), row.id);
  record('complaint', row.id, req.user, 'reply');
  audit(req.user, 'reply_complaint', 'complaint', row.code);
  sendMsg(row.user_id, 'complaint', row.id, 'complaint_replied', { code: row.code });
  res.json({ complaint: complaintAdminMeta(db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(row.id)) });
});

processRouter.post('/complaints/:id/close', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Complaint not found');
  if (!['processing', 'replied'].includes(row.status)) {
    throw badRequest('APPEAL_INVALID_TRANSITION', 'Complaint cannot be closed');
  }
  db.prepare("UPDATE appeal_complaints SET status = 'closed', closed_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), row.id);
  record('complaint', row.id, req.user, 'close', String(req.body?.comment || '').slice(0, 500));
  audit(req.user, 'close_complaint', 'complaint', row.code);
  sendMsg(row.user_id, 'complaint', row.id, 'complaint_closed', { code: row.code });
  res.json({ complaint: complaintAdminMeta(db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(row.id)) });
});

// 转申诉(预留):当前仅记录审计并向用户发送申诉指引,正式转换待业务署联动接入
processRouter.post('/complaints/:id/escalate-appeal', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_complaints WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Complaint not found');
  record('complaint', row.id, req.user, 'escalate_appeal', String(req.body?.comment || '').slice(0, 500));
  audit(req.user, 'escalate_complaint_to_appeal', 'complaint', row.code, { reserved: true });
  sendMsg(row.user_id, 'complaint', row.id, 'complaint_escalated', { code: row.code });
  res.json({ ok: true, reserved: true });
});

function ticketAdminMeta(row) {
  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(row.user_id);
  return {
    ...serializeTicket(row),
    username: user?.username ?? '',
    displayName: user?.display_name ?? '',
    replies: db
      .prepare('SELECT * FROM appeal_ticket_replies WHERE ticket_id = ? ORDER BY id')
      .all(row.id)
      .map((r) => ({ id: r.id, isStaff: !!r.is_staff, staffName: r.staff_name, content: r.content, createdAt: r.created_at })),
    records: recordsFor('ticket', row.id),
  };
}

processRouter.get('/tickets/queue', (req, res) => {
  const status = String(req.query.status || '');
  const rows = status
    ? db.prepare('SELECT * FROM appeal_tickets WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
    : db.prepare('SELECT * FROM appeal_tickets ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows.map(ticketAdminMeta) });
});

processRouter.get('/tickets/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_tickets WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Ticket not found');
  res.json({ ticket: ticketAdminMeta(row) });
});

processRouter.post('/tickets/:id/reply', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_tickets WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Ticket not found');
  if (['closed'].includes(row.status)) throw badRequest('APPEAL_INVALID_TRANSITION', 'Ticket is closed');
  const content = String(req.body?.content || '').trim();
  if (!content) throw badRequest('APPEAL_FIELD_REQUIRED', 'Reply content is required');
  db.prepare('INSERT INTO appeal_ticket_replies (ticket_id, user_id, is_staff, staff_name, content, created_at) VALUES (?, ?, 1, ?, ?, ?)').run(
    row.id, req.user.id, req.user.displayName || req.user.username, content.slice(0, 2000), now()
  );
  db.prepare("UPDATE appeal_tickets SET status = 'replied', updated_at = ? WHERE id = ?").run(now(), row.id);
  record('ticket', row.id, req.user, 'reply');
  audit(req.user, 'reply_ticket', 'ticket', row.code);
  sendMsg(row.user_id, 'ticket', row.id, 'ticket_replied', { code: row.code });
  res.json({ ticket: ticketAdminMeta(db.prepare('SELECT * FROM appeal_tickets WHERE id = ?').get(row.id)) });
});

processRouter.post('/tickets/:id/status', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_tickets WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Ticket not found');
  const status = String(req.body?.status || '');
  if (!['processing', 'closed', 'escalated'].includes(status)) {
    throw badRequest('VALIDATION_ERROR', 'Unsupported ticket status');
  }
  if (row.status === 'closed') throw badRequest('APPEAL_INVALID_TRANSITION', 'Ticket is closed');
  db.prepare('UPDATE appeal_tickets SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?').run(
    status, status === 'closed' ? now() : row.closed_at, now(), row.id
  );
  record('ticket', row.id, req.user, `mark_${status}`);
  audit(req.user, `ticket_${status}`, 'ticket', row.code);
  if (status === 'escalated') sendMsg(row.user_id, 'ticket', row.id, 'ticket_escalated', { code: row.code });
  if (status === 'closed') sendMsg(row.user_id, 'ticket', row.id, 'ticket_closed', { code: row.code });
  res.json({ ticket: ticketAdminMeta(db.prepare('SELECT * FROM appeal_tickets WHERE id = ?').get(row.id)) });
});

// ===========================================================================
// 复核管理 (appeal:review) — 一次终局
// ===========================================================================

const reviewRouter = Router();
reviewRouter.use(authenticate, requirePermission('appeal:review'));

function reviewAdminMeta(row) {
  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(row.user_id);
  return {
    ...serializeReview(row),
    username: user?.username ?? '',
    displayName: user?.display_name ?? '',
    materials: db
      .prepare("SELECT * FROM appeal_materials WHERE owner_type = 'review' AND owner_id = ? ORDER BY id")
      .all(row.id)
      .map((m) => ({ id: m.id, kind: m.kind, origin: m.origin, filename: m.filename, mime: m.mime, size: m.size, createdAt: m.created_at })),
    records: recordsFor('review', row.id),
    appeal: serializeAppeal(db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(row.appeal_id)),
    decision: serializeDecision(db.prepare('SELECT * FROM appeal_decisions WHERE review_id = ? ORDER BY id DESC').get(row.id)),
  };
}

reviewRouter.get('/reviews/queue', (req, res) => {
  sweepAll();
  const status = String(req.query.status || '');
  const rows = status
    ? db.prepare('SELECT * FROM appeal_reviews WHERE status = ? ORDER BY id ASC LIMIT 200').all(status)
    : db.prepare('SELECT * FROM appeal_reviews ORDER BY id ASC LIMIT 200').all();
  res.json({ items: rows.map(reviewAdminMeta) });
});

reviewRouter.get('/reviews/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_reviews WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Review not found');
  res.json({ review: reviewAdminMeta(row) });
});

reviewRouter.post('/reviews/:id/accept', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_reviews WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Review not found');
  if (row.status !== 'pending') throw badRequest('APPEAL_INVALID_TRANSITION', 'Review already started');
  db.prepare("UPDATE appeal_reviews SET status = 'reviewing', updated_at = ? WHERE id = ?").run(now(), row.id);
  record('review', row.id, req.user, 'accept');
  record('appeal', row.appeal_id, req.user, 'review_accept', row.code);
  audit(req.user, 'accept_review', 'review', row.code);
  sendMsg(row.user_id, 'review', row.id, 'review_accepted', { code: row.code });
  res.json({ review: reviewAdminMeta(db.prepare('SELECT * FROM appeal_reviews WHERE id = ?').get(row.id)) });
});

reviewRouter.post('/reviews/:id/decide', (req, res) => {
  const review = db.prepare('SELECT * FROM appeal_reviews WHERE id = ?').get(Number(req.params.id));
  if (!review) throw notFound('Review not found');
  if (review.status !== 'reviewing') throw badRequest('APPEAL_INVALID_TRANSITION', 'Review must be accepted before deciding');
  const decisionType = String(req.body?.decisionType || '');
  if (!REVIEW_DECISIONS.has(decisionType)) throw badRequest('VALIDATION_ERROR', 'Unsupported review decision type');
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 5) throw badRequest('APPEAL_REASON_REQUIRED', 'A review reason is required');
  const appeal = db.prepare('SELECT * FROM appeal_appeals WHERE id = ?').get(review.appeal_id);
  const ts = now();
  db.prepare(
    "UPDATE appeal_reviews SET status = 'completed', decision_type = ?, decision_reason = ?, decided_name = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(decisionType, reason, req.user.displayName || req.user.username, ts, ts, review.id);
  record('review', review.id, req.user, 'decide', `${decisionType}: ${reason}`);
  record('appeal', appeal.id, req.user, 'review_decide', `${review.code}: ${decisionType}`);

  if (decisionType !== 'maintain') {
    // 原决定书失效,复核决定生成新的决定书;被撤销的不予受理重新进入处理
    const originals = db.prepare("SELECT id, code FROM appeal_decisions WHERE appeal_id = ? AND review_id IS NULL AND status = 'valid'").all(appeal.id);
    for (const orig of originals) {
      db.prepare("UPDATE appeal_decisions SET status = 'expired', voided_at = ? WHERE id = ?").run(ts, orig.id);
      audit(req.user, 'expire_decision_doc', 'decision', orig.code, { reviewCode: review.code });
    }
    if (appeal.status === 'rejected') {
      db.prepare("UPDATE appeal_appeals SET status = 'processing', reject_reason = NULL, updated_at = ? WHERE id = ?").run(ts, appeal.id);
      sendMsg(appeal.user_id, 'appeal', appeal.id, 'appeal_reopened', { code: appeal.code, reviewCode: review.code });
    } else if (decisionType === 'change') {
      db.prepare('UPDATE appeal_appeals SET decision_type = ?, decision_reason = ?, updated_at = ? WHERE id = ?').run(
        'change', reason, ts, appeal.id
      );
    }
  }
  const doc = createDecisionDoc({
    appeal,
    review,
    decisionType,
    reason,
    basis: String(req.body?.basis || '').trim().slice(0, 500),
    actor: req.user,
  });
  writebackDecision(appeal, { decisionType, decisionCode: doc.code });
  sendMsg(review.user_id, 'review', review.id, 'review_completed', { code: review.code, decisionType });
  audit(req.user, 'decide_review', 'review', review.code, { decisionType });
  res.json({ review: reviewAdminMeta(db.prepare('SELECT * FROM appeal_reviews WHERE id = ?').get(review.id)) });
});

// ===========================================================================
// 监察与审核质量 (appeal:inspect) — 只读,不改业务数据
// ===========================================================================

const inspectRouter = Router();
inspectRouter.use(authenticate, requirePermission('appeal:inspect'));

inspectRouter.get('/inspect/summary', (_req, res) => {
  sweepAll();
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  const acceptSla = new Date(Date.now() - getConfigNumber('appeal.accept_sla_hours', 48) * 3600_000).toISOString();
  const resolveSla = new Date(Date.now() - getConfigNumber('appeal.resolve_sla_hours', 120) * 3600_000).toISOString();
  const acceptOverdue = count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status = 'pending_accept' AND submitted_at < ?", acceptSla);
  const resolveOverdue = count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status IN ('accepted','processing') AND submitted_at < ?", resolveSla);
  const avgAcceptMs =
    db.prepare('SELECT AVG(julianday(accepted_at) - julianday(submitted_at)) AS d FROM appeal_appeals WHERE accepted_at IS NOT NULL').get().d || 0;
  const avgResolveMs =
    db.prepare('SELECT AVG(julianday(resolved_at) - julianday(submitted_at)) AS d FROM appeal_appeals WHERE resolved_at IS NOT NULL').get().d || 0;
  const decisionDist = db
    .prepare('SELECT decision_type AS type, COUNT(*) AS n FROM appeal_appeals WHERE decision_type IS NOT NULL GROUP BY decision_type')
    .all();
  const bizDist = db
    .prepare('SELECT biz_type AS type, COUNT(*) AS n FROM appeal_appeals WHERE submitted_at IS NOT NULL GROUP BY biz_type ORDER BY n DESC')
    .all();
  // 异常操作检测:高频决定(24h 内 >= 15 次)与非工作时段(00:00-06:00)操作
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const highFrequency = db
    .prepare(
      `SELECT actor_name, COUNT(*) AS n FROM appeal_records
       WHERE action IN ('accept','decide') AND created_at >= ? GROUP BY actor_id, actor_name HAVING n >= 15`
    )
    .all(dayAgo);
  const nightOps = count(
    `SELECT COUNT(*) AS n FROM appeal_records WHERE actor_id IS NOT NULL AND CAST(strftime('%H', created_at) AS INTEGER) < 6`
  );
  const satisfaction = db
    .prepare('SELECT AVG(evaluation_rating) AS avg FROM appeal_appeals WHERE evaluation_rating IS NOT NULL')
    .get().avg;
  res.json({
    acceptSlaHours: getConfigNumber('appeal.accept_sla_hours', 48),
    resolveSlaHours: getConfigNumber('appeal.resolve_sla_hours', 120),
    acceptOverdue,
    resolveOverdue,
    avgAcceptHours: Math.max(0, Math.round(avgAcceptMs * 24 * 10) / 10),
    avgResolveDays: Math.max(0, Math.round(avgResolveMs * 10) / 10),
    decisionDistribution: decisionDist,
    bizDistribution: bizDist,
    anomalies: { highFrequency, nightOps },
    satisfaction: satisfaction ? Math.round(satisfaction * 10) / 10 : null,
    // 各署审核数据接入状态(预留):接入后监察抽查覆盖对应业务
    integration: [
      { bizType: 'visa', integrated: false },
      { bizType: 'immigration', integrated: false },
      { bizType: 'resident', integrated: false },
      { bizType: 'diplomatic', integrated: false },
      { bizType: 'document', integrated: false },
    ],
  });
});

inspectRouter.get('/inspect/records', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const rows = db.prepare('SELECT * FROM appeal_records ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ items: rows });
});

inspectRouter.get('/inspect/reports', (_req, res) => {
  const rows = db.prepare('SELECT * FROM appeal_inspect_reports ORDER BY id DESC LIMIT 50').all();
  res.json({ items: rows });
});

inspectRouter.post('/inspect/reports', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const content = String(req.body?.content || '').trim().slice(0, 4000);
  const kind = ['quality', 'anomaly', 'consistency'].includes(req.body?.kind) ? req.body.kind : 'quality';
  if (!title || !content) throw badRequest('VALIDATION_ERROR', 'Title and content are required');
  const info = db
    .prepare('INSERT INTO appeal_inspect_reports (title, kind, content, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(title, kind, content, req.user.displayName || req.user.username, now());
  audit(req.user, 'create_inspect_report', 'inspect_report', info.lastInsertRowid, { kind });
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// 审核抽查(预留):跨署审核记录接入后开放;当前仅登记抽查意向用于审计
inspectRouter.post('/inspect/sampling', (req, res) => {
  const bizType = String(req.body?.bizType || '');
  audit(req.user, 'inspect_sampling_reserved', 'sampling', bizType, { reserved: true, note: String(req.body?.note || '').slice(0, 200) });
  res.json({ ok: true, reserved: true });
});

// ===========================================================================
// 公告/公示/模板/黑名单/配置/统计/审计 (appeal:manage)
// ===========================================================================

const manageRouter = Router();
manageRouter.use(authenticate, requirePermission('appeal:manage'));

// --- 公告 ---
manageRouter.get('/notices', (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM appeal_notices ORDER BY id DESC').all().map(serializeNotice) });
});

manageRouter.post('/notices', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const body = String(req.body?.body || '').trim().slice(0, 2000);
  const level = ['info', 'policy', 'event'].includes(req.body?.level) ? req.body.level : 'info';
  if (!title) throw badRequest('VALIDATION_ERROR', 'Title is required');
  const ts = now();
  const info = db.prepare('INSERT INTO appeal_notices (title, body, level, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)').run(
    title, body, level, ts, ts
  );
  audit(req.user, 'create_appeal_notice', 'notice', info.lastInsertRowid);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

manageRouter.patch('/notices/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 120) : row.title;
  const body = req.body?.body !== undefined ? String(req.body.body).trim().slice(0, 2000) : row.body;
  const level = req.body?.level !== undefined && ['info', 'policy', 'event'].includes(req.body.level) ? req.body.level : row.level;
  const enabled = req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled;
  if (!title) throw badRequest('VALIDATION_ERROR', 'Title is required');
  db.prepare('UPDATE appeal_notices SET title = ?, body = ?, level = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
    title, body, level, enabled, now(), row.id
  );
  audit(req.user, 'update_appeal_notice', 'notice', row.id, { enabled });
  res.json({ ok: true });
});

manageRouter.delete('/notices/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM appeal_notices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  db.prepare('DELETE FROM appeal_notices WHERE id = ?').run(row.id);
  audit(req.user, 'delete_appeal_notice', 'notice', row.id);
  res.json({ ok: true });
});

// --- 公示 ---
manageRouter.get('/publicity', (_req, res) => {
  res.json({ items: db.prepare('SELECT * FROM appeal_publicity ORDER BY id DESC').all().map(serializePublicity) });
});

manageRouter.post('/publicity', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const body = String(req.body?.body || '').trim().slice(0, 4000);
  const kind = ['stats', 'case', 'report'].includes(req.body?.kind) ? req.body.kind : 'case';
  if (!title) throw badRequest('VALIDATION_ERROR', 'Title is required');
  const ts = now();
  const info = db
    .prepare("INSERT INTO appeal_publicity (title, body, kind, status, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, ?)")
    .run(title, body, kind, ts, ts);
  audit(req.user, 'create_publicity', 'publicity', info.lastInsertRowid, { kind });
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

manageRouter.patch('/publicity/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_publicity WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Publicity not found');
  const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 120) : row.title;
  const body = req.body?.body !== undefined ? String(req.body.body).trim().slice(0, 4000) : row.body;
  let status = row.status;
  if (req.body?.status !== undefined) {
    status = ['draft', 'published', 'offline'].includes(req.body.status) ? req.body.status : row.status;
  }
  db.prepare('UPDATE appeal_publicity SET title = ?, body = ?, status = ?, published_at = ?, updated_at = ? WHERE id = ?').run(
    title, body, status, status === 'published' ? row.published_at ?? now() : row.published_at, now(), row.id
  );
  audit(req.user, 'update_publicity', 'publicity', row.id, { status });
  res.json({ ok: true });
});

manageRouter.delete('/publicity/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM appeal_publicity WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Publicity not found');
  db.prepare('DELETE FROM appeal_publicity WHERE id = ?').run(row.id);
  audit(req.user, 'delete_publicity', 'publicity', row.id);
  res.json({ ok: true });
});

// --- 站内信模板 ---
manageRouter.get('/templates', (_req, res) => {
  res.json({
    items: db
      .prepare('SELECT * FROM appeal_msg_templates ORDER BY type')
      .all()
      .map((r) => ({ type: r.type, title: r.title, body: r.body, enabled: !!r.enabled })),
  });
});

manageRouter.patch('/templates/:type', (req, res) => {
  const row = db.prepare('SELECT * FROM appeal_msg_templates WHERE type = ?').get(String(req.params.type));
  if (!row) throw notFound('Template not found');
  const title = req.body?.title !== undefined ? String(req.body.title).trim().slice(0, 200) : row.title;
  const body = req.body?.body !== undefined ? String(req.body.body).trim().slice(0, 1000) : row.body;
  const enabled = req.body?.enabled !== undefined ? (req.body.enabled ? 1 : 0) : row.enabled;
  db.prepare('UPDATE appeal_msg_templates SET title = ?, body = ?, enabled = ? WHERE type = ?').run(title, body, enabled, row.type);
  audit(req.user, 'update_msg_template', 'template', row.type, { enabled });
  res.json({ ok: true });
});

// --- 风控与黑名单 ---
manageRouter.get('/blacklist', (_req, res) => {
  const rows = db.prepare('SELECT b.*, u.username FROM appeal_blacklist b JOIN users u ON u.id = b.user_id ORDER BY b.id DESC').all();
  res.json({ items: rows.map((r) => ({ id: r.id, userId: r.user_id, username: r.username, scope: r.scope, reason: r.reason, createdAt: r.created_at })) });
});

manageRouter.post('/blacklist', (req, res) => {
  const userId = Number(req.body?.userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw notFound('User not found');
  const scope = ['appeal', 'complaint', 'all'].includes(req.body?.scope) ? req.body.scope : 'all';
  const reason = String(req.body?.reason || '').trim().slice(0, 200);
  db.prepare('INSERT OR IGNORE INTO appeal_blacklist (user_id, scope, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?)').run(
    userId, scope, reason, req.user.username, now()
  );
  audit(req.user, 'blacklist_user', 'user', userId, { scope, reason });
  res.status(201).json({ ok: true });
});

manageRouter.delete('/blacklist/:userId', (req, res) => {
  db.prepare('DELETE FROM appeal_blacklist WHERE user_id = ?').run(Number(req.params.userId));
  audit(req.user, 'unblacklist_user', 'user', Number(req.params.userId));
  res.json({ ok: true });
});

// --- 重复申诉识别 ---
manageRouter.get('/duplicates', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT user_id, biz_type, biz_code, COUNT(*) AS n, GROUP_CONCAT(code) AS codes
       FROM appeal_appeals WHERE status != 'draft'
       GROUP BY user_id, biz_type, biz_code HAVING n > 1 ORDER BY n DESC LIMIT 50`
    )
    .all();
  res.json({ items: rows });
});

// --- 配置 ---
manageRouter.get('/config', (_req, res) => {
  res.json({ items: db.prepare('SELECT key, value FROM appeal_config ORDER BY key').all() });
});

manageRouter.put('/config', (req, res) => {
  const entries = Object.entries(req.body || {});
  for (const [key, value] of entries) {
    if (!key.startsWith('appeal.')) continue;
    setConfig(key, String(value));
  }
  audit(req.user, 'update_appeal_config', 'config', '', Object.fromEntries(entries));
  res.json({ ok: true });
});

// --- 统计与报表 ---
manageRouter.get('/stats', (_req, res) => {
  sweepAll();
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  const groupCount = (sql) => db.prepare(sql).all();
  const submitted = count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE submitted_at IS NOT NULL AND status != 'withdrawn'");
  const accepted = count('SELECT COUNT(*) AS n FROM appeal_appeals WHERE accepted_at IS NOT NULL');
  const rejected = count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status = 'rejected'");
  const statusCounts = Object.fromEntries(
    groupCount('SELECT status, COUNT(*) AS n FROM appeal_appeals GROUP BY status').map((r) => [r.status, r.n])
  );
  const avgAcceptMs = db.prepare('SELECT AVG(julianday(accepted_at) - julianday(submitted_at)) AS d FROM appeal_appeals WHERE accepted_at IS NOT NULL').get().d || 0;
  const avgResolveMs = db.prepare('SELECT AVG(julianday(resolved_at) - julianday(submitted_at)) AS d FROM appeal_appeals WHERE resolved_at IS NOT NULL').get().d || 0;
  const acceptSla = new Date(Date.now() - getConfigNumber('appeal.accept_sla_hours', 48) * 3600_000).toISOString();
  const resolveSla = new Date(Date.now() - getConfigNumber('appeal.resolve_sla_hours', 120) * 3600_000).toISOString();
  const satisfaction = db.prepare('SELECT AVG(evaluation_rating) AS appeal FROM appeal_appeals WHERE evaluation_rating IS NOT NULL').get();
  const complaintSatisfaction = db.prepare('SELECT AVG(rating) AS complaint FROM appeal_complaints WHERE rating IS NOT NULL').get();
  const verifyToday = count(
    'SELECT COUNT(*) AS n FROM appeal_verify_logs WHERE created_at >= ?',
    new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  );
  res.json({
    submitted,
    acceptRate: submitted ? accepted / submitted : 0,
    rejectAcceptRate: submitted ? rejected / submitted : 0,
    statusCounts,
    reviewStatusCounts: Object.fromEntries(
      groupCount('SELECT status, COUNT(*) AS n FROM appeal_reviews GROUP BY status').map((r) => [r.status, r.n])
    ),
    complaintStatusCounts: Object.fromEntries(
      groupCount('SELECT status, COUNT(*) AS n FROM appeal_complaints GROUP BY status').map((r) => [r.status, r.n])
    ),
    ticketStatusCounts: Object.fromEntries(
      groupCount('SELECT status, COUNT(*) AS n FROM appeal_tickets GROUP BY status').map((r) => [r.status, r.n])
    ),
    decisionDistribution: groupCount('SELECT decision_type AS type, COUNT(*) AS n FROM appeal_appeals WHERE decision_type IS NOT NULL GROUP BY decision_type'),
    bizDistribution: groupCount('SELECT biz_type AS type, COUNT(*) AS n FROM appeal_appeals WHERE submitted_at IS NOT NULL GROUP BY biz_type ORDER BY n DESC'),
    complaintCategoryDist: groupCount('SELECT category, COUNT(*) AS n FROM appeal_complaints GROUP BY category ORDER BY n DESC'),
    ticketCategoryDist: groupCount('SELECT category, COUNT(*) AS n FROM appeal_tickets GROUP BY category ORDER BY n DESC'),
    refusalReasons: groupCount('SELECT reject_reason AS reason, COUNT(*) AS n FROM appeal_appeals WHERE reject_reason IS NOT NULL GROUP BY reject_reason ORDER BY n DESC LIMIT 8'),
    avgAcceptHours: Math.max(0, Math.round(avgAcceptMs * 24 * 10) / 10),
    avgResolveDays: Math.max(0, Math.round(avgResolveMs * 10) / 10),
    acceptOverdue: count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status = 'pending_accept' AND submitted_at < ?", acceptSla),
    resolveOverdue: count("SELECT COUNT(*) AS n FROM appeal_appeals WHERE status IN ('accepted','processing') AND submitted_at < ?", resolveSla),
    satisfaction: satisfaction?.appeal ? Math.round(satisfaction.appeal * 10) / 10 : null,
    complaintSatisfaction: complaintSatisfaction?.complaint ? Math.round(complaintSatisfaction.complaint * 10) / 10 : null,
    verifyTotal: count('SELECT COUNT(*) AS n FROM appeal_verify_logs'),
    verifyToday,
    inspectReports: count('SELECT COUNT(*) AS n FROM appeal_inspect_reports'),
    blacklistCount: count('SELECT COUNT(*) AS n FROM appeal_blacklist'),
  });
});

// --- 审计与验真记录 ---
manageRouter.get('/audit', (req, res) => {
  const action = String(req.query.action || '').trim();
  const rows = action
    ? db.prepare('SELECT * FROM appeal_audit WHERE action LIKE ? ORDER BY id DESC LIMIT 200').all(`%${action}%`)
    : db.prepare('SELECT * FROM appeal_audit ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows });
});

manageRouter.get('/verify-logs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM appeal_verify_logs ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows });
});

function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// 导出需审计:每次导出都落一条 audit 记录(审批留痕)
manageRouter.get('/export.csv', (req, res) => {
  sweepAll();
  const rows = db
    .prepare(
      `SELECT aa.*, u.username FROM appeal_appeals aa JOIN users u ON u.id = aa.user_id
       WHERE aa.status != 'draft' ORDER BY aa.id`
    )
    .all();
  const header = ['code', 'username', 'biz_type', 'biz_code', 'status', 'priority', 'decision_type', 'submitted_at', 'resolved_at', 'merged_into'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.code, r.username, r.biz_type, r.biz_code, r.status, r.priority, r.decision_type, r.submitted_at, r.resolved_at, r.merged_into]
        .map(csvEscape)
        .join(',')
    );
  }
  audit(req.user, 'export_appeals_csv', 'appeal', '', { count: rows.length });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="appeal-records-${Date.now()}.csv"`);
  res.send(`\ufeff${lines.join('\n')}`);
});

router.use('/', processRouter, reviewRouter, inspectRouter, manageRouter);

export default router;
