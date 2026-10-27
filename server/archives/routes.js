// 奶龙国皇家档案与记录署 — user-facing endpoints.
//
// Read-only archive outlet: records are read from the visa_* / im_* tables of
// the owning offices in the same database, masked here, and never copied.
// Every list/detail view and every export writes an access log; exports are
// capped at EXPORT_DAILY_LIMIT per user per day and audited.
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { ApiError, badRequest, conflict, notFound } from '../http.js';
import { reqLocale } from '../locale.js';
import { ensureArchivesSchema } from './schema.js';
import {
  EXPORT_DAILY_LIMIT,
  TYPE_CODES,
  activeRequestOf,
  audit,
  buildCsvPayload,
  clientIp,
  countUserRecords,
  exportCountToday,
  findUserRecord,
  listUserRecords,
  logAccess,
  logRequestEvent,
  nextDeletionNo,
  recordTypesWithRules,
  serializeMessage,
  serializeRequest,
  requestEvents,
  sendPostalMessage,
} from './util.js';

ensureArchivesSchema();

const router = Router();
router.use(authenticate, requirePermission('arch:portal'));

const OFFICES = ['visa', 'immigration'];

function pageParams(query, defaults = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || defaults.pageSize || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function pickFilters(query) {
  const office = OFFICES.includes(String(query.office || '')) ? String(query.office) : '';
  const type = TYPE_CODES.includes(String(query.type || '')) ? String(query.type) : '';
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
  return {
    office,
    type,
    from: date(query.from),
    to: date(query.to),
    keyword: String(query.keyword || '').trim().slice(0, 60),
  };
}

// ---------------------------------------------------------------------------
// 首页:服务目录、办事指南与本人档案概况
// ---------------------------------------------------------------------------

router.get('/overview', (req, res) => {
  const types = recordTypesWithRules({ onlyIncluded: true });
  const active = activeRequestOf(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM arch_messages WHERE user_id = ? AND read = 0').get(req.user.id).n;
  const guides = db
    .prepare('SELECT id, code, title, title_tw, body, body_tw FROM arch_guides WHERE enabled = 1 ORDER BY sort_order, id')
    .all();
  res.json({
    recordTypes: types,
    counts: countUserRecords(req.user.id),
    activeRequest: active ? serializeRequest(active) : null,
    unreadMessages: unread,
    guides,
    export: { limit: EXPORT_DAILY_LIMIT, used: exportCountToday(req.user.id) },
  });
});

// ---------------------------------------------------------------------------
// 我的档案目录 / 详情
// ---------------------------------------------------------------------------

router.get('/records', (req, res) => {
  const filters = pickFilters(req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const items = listUserRecords(req.user.id, filters);
  logAccess({
    userId: req.user.id,
    actor: req.user,
    action: 'list',
    office: filters.office,
    recordType: filters.type,
    detail: { ...filters, total: items.length, page },
    ip: clientIp(req),
  });
  res.json({ items: items.slice(offset, offset + pageSize), total: items.length, page, pageSize });
});

// 导出载荷:前端用 exportCsv 落成 UTF-8 BOM CSV;次数限制与审计都在服务端。
router.post('/records/export', (req, res) => {
  const used = exportCountToday(req.user.id);
  if (used >= EXPORT_DAILY_LIMIT) {
    throw new ApiError(429, 'ARCH_EXPORT_LIMIT', `Daily export limit (${EXPORT_DAILY_LIMIT}) reached`);
  }
  const filters = pickFilters(req.body || {});
  const items = listUserRecords(req.user.id, filters);
  const payload = buildCsvPayload(items, reqLocale(req));
  logAccess({
    userId: req.user.id,
    actor: req.user,
    action: 'export',
    office: filters.office,
    recordType: filters.type,
    detail: { ...filters, total: items.length },
    ip: clientIp(req),
  });
  audit(req.user, 'export.user', 'archive', '', { ...filters, count: items.length });
  res.json({ ...payload, count: items.length, limit: EXPORT_DAILY_LIMIT, remaining: EXPORT_DAILY_LIMIT - used - 1 });
});

router.get('/records/:type/:id', (req, res) => {
  const type = String(req.params.type);
  if (!TYPE_CODES.includes(type)) throw notFound('Record not found');
  const id = Number(req.params.id);
  const record = Number.isInteger(id) ? findUserRecord(req.user.id, type, id) : null;
  if (!record) throw notFound('Record not found');
  logAccess({
    userId: req.user.id,
    actor: req.user,
    action: 'detail',
    office: record.office,
    recordType: type,
    detail: { no: record.no },
    ip: clientIp(req),
  });
  const typeInfo = recordTypesWithRules().find((t) => t.code === type) || null;
  res.json({ record, recordType: typeInfo });
});

// ---------------------------------------------------------------------------
// 数据删除 / 注销申请
// ---------------------------------------------------------------------------

router.get('/deletion-requests', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM arch_deletion_requests WHERE user_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 50')
    .all(req.user.id);
  res.json({ items: rows.map((r) => serializeRequest(r)) });
});

router.get('/deletion-requests/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM arch_deletion_requests WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
    .get(Number(req.params.id), req.user.id);
  if (!row) throw notFound('Deletion request not found');
  res.json({ request: serializeRequest(row, { events: requestEvents(row.id) }) });
});

router.post('/deletion-requests', (req, res) => {
  const body = req.body || {};
  if (body.confirm !== true) {
    throw badRequest('ARCH_CONFIRM_REQUIRED', 'The deletion request must be confirmed');
  }
  const included = new Set(recordTypesWithRules({ onlyIncluded: true }).map((t) => t.code));
  const requested = Array.isArray(body.types) ? [...new Set(body.types.map(String))] : [];
  if (!requested.length) throw badRequest('ARCH_SCOPE_EMPTY', 'Pick at least one record type');
  const unknown = requested.filter((code) => !included.has(code));
  if (unknown.length) throw badRequest('ARCH_SCOPE_INVALID', `Unknown or excluded record type: ${unknown.join(', ')}`);

  const impact = String(body.impact || '').trim().slice(0, 500);
  if (impact.length < 5) throw badRequest('ARCH_FIELD_REQUIRED', 'Missing required field: impact');
  const reason = String(body.reason || '').trim().slice(0, 500);

  const active = activeRequestOf(req.user.id);
  if (active) throw conflict('ARCH_REQUEST_ACTIVE', `Deletion request ${active.no} is still being processed`);

  const ts = now();
  const no = nextDeletionNo();
  const info = db
    .prepare(
      `INSERT INTO arch_deletion_requests (no, user_id, scope, impact, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(no, req.user.id, JSON.stringify(requested), impact, reason, ts, ts);
  const requestId = Number(info.lastInsertRowid);
  logRequestEvent({ requestId, action: 'submit', status: 'pending', actor: req.user, note: '' });
  sendPostalMessage({ userId: req.user.id, requestId, type: 'submitted', params: { no } });
  audit(req.user, 'request.create', 'deletion_request', no, { scope: requested });
  const row = db.prepare('SELECT * FROM arch_deletion_requests WHERE id = ?').get(requestId);
  res.status(201).json({ request: serializeRequest(row, { events: requestEvents(requestId) }) });
});

// ---------------------------------------------------------------------------
// 站内信(状态变化经 sendPostalMessage 落本署邮箱)
// ---------------------------------------------------------------------------

router.get('/messages', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM arch_messages WHERE user_id = ? ORDER BY id DESC LIMIT 100')
    .all(req.user.id);
  const unread = db.prepare('SELECT COUNT(*) AS n FROM arch_messages WHERE user_id = ? AND read = 0').get(req.user.id).n;
  res.json({ items: rows.map(serializeMessage), unread });
});

router.post('/messages/read', (req, res) => {
  const info = db.prepare('UPDATE arch_messages SET read = 1 WHERE user_id = ? AND read = 0').run(req.user.id);
  res.json({ ok: true, updated: info.changes });
});

router.post('/messages/:id/read', (req, res) => {
  const row = db
    .prepare('SELECT id FROM arch_messages WHERE id = ? AND user_id = ?')
    .get(Number(req.params.id), req.user.id);
  if (!row) throw notFound('Message not found');
  db.prepare('UPDATE arch_messages SET read = 1 WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

export default router;