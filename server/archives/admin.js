// 奶龙国皇家档案与记录署 — admin API (arch:manage).
//
// Archival rule configuration, cross-user archive queries (masked), deletion
// request handling (accept → approve → execute with receipt, or reject with a
// reason), access logs and the audit trail. Every sensitive action is audited.
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, notFound } from '../http.js';
import { reqLocale } from '../locale.js';
import { ensureArchivesSchema, ruleKey } from './schema.js';
import { registerAutoApprover, safeAutoApprove } from '../autoApprove.js';
import {
  TYPE_CODES,
  REQUEST_STATUSES,
  acceptRequest,
  approveRequest,
  audit,
  buildCsvPayload,
  clientIp,
  executeRequest,
  listAdminRecords,
  logAccess,
  recordTypesWithRules,
  rejectRequest,
  requestEvents,
  serializeRequest,
} from './util.js';

ensureArchivesSchema();

const router = Router();
router.use(authenticate, requirePermission('arch:manage'));

const OFFICES = ['visa', 'immigration'];

function pageParams(query, defaults = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || defaults.pageSize || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function pickFilters(source) {
  const src = source || {};
  const office = OFFICES.includes(String(src.office || '')) ? String(src.office) : '';
  const type = TYPE_CODES.includes(String(src.type || '')) ? String(src.type) : '';
  const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
  return {
    userId: src.userId !== undefined && src.userId !== '' ? String(src.userId).slice(0, 20) : '',
    no: String(src.no || '').trim().slice(0, 60),
    office,
    type,
    from: date(src.from),
    to: date(src.to),
    keyword: String(src.keyword || '').trim().slice(0, 60),
  };
}

function loadRequest(id, { withDeleted = false } = {}) {
  const row = db.prepare('SELECT * FROM arch_deletion_requests WHERE id = ?').get(Number(id));
  if (!row || (!withDeleted && row.deleted_at)) throw notFound('Deletion request not found');
  return row;
}

function requestWithUser(row, { events = true } = {}) {
  const user = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(row.user_id);
  return {
    ...serializeRequest(row, { events: events ? requestEvents(row.id) : [] }),
    applicant: user ? { id: user.id, username: user.username, displayName: user.display_name } : null,
  };
}

// ---------------------------------------------------------------------------
// 归档规则配置(arch_rules 简单 KV,每种记录类型:是否纳档 + 保留说明简繁)
// ---------------------------------------------------------------------------

router.get('/rules', (_req, res) => {
  res.json({ items: recordTypesWithRules() });
});

router.patch('/rules', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items || !items.length) throw badRequest('VALIDATION_ERROR', 'items is required');
  const known = new Set(recordTypesWithRules().map((t) => t.code));
  const changes = [];
  for (const item of items) {
    const code = String(item?.code || '');
    if (!known.has(code)) throw badRequest('ARCH_RULE_UNKNOWN', `Unknown record type: ${code}`);
    const pairs = [];
    if (item.included !== undefined) {
      if (typeof item.included !== 'boolean' && item.included !== 0 && item.included !== 1) {
        throw badRequest('VALIDATION_ERROR', 'included must be a boolean');
      }
      pairs.push([ruleKey(code, 'included'), item.included ? '1' : '0']);
    }
    if (item.retention !== undefined) pairs.push([ruleKey(code, 'retention'), String(item.retention).trim().slice(0, 300)]);
    if (item.retentionTw !== undefined) pairs.push([ruleKey(code, 'retentionTw'), String(item.retentionTw).trim().slice(0, 300)]);
    if (!pairs.length) throw badRequest('VALIDATION_ERROR', 'Nothing to update');
    changes.push({ code, fields: pairs.map((p) => p[0]) });
    for (const [key, value] of pairs) {
      db.prepare(
        `INSERT INTO arch_rules (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).run(key, value, now());
    }
  }
  audit(req.user, 'rule.update', 'archive_rule', changes.map((c) => c.code).join(','), { changes });
  res.json({ items: recordTypesWithRules() });
});

// ---------------------------------------------------------------------------
// 档案查询(脱敏)与导出(二次确认 + 审计)
// ---------------------------------------------------------------------------

router.get('/records', (req, res) => {
  const filters = pickFilters(req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const items = listAdminRecords(filters);
  audit(req.user, 'admin.query', 'archive', '', { ...filters, total: items.length, page });
  res.json({ items: items.slice(offset, offset + pageSize), total: items.length, page, pageSize });
});

router.post('/records/export', (req, res) => {
  const body = req.body || {};
  if (body.confirm !== true) {
    throw badRequest('ARCH_CONFIRM_REQUIRED', 'Admin export must be confirmed');
  }
  const filters = pickFilters(body);
  const items = listAdminRecords(filters);
  const payload = buildCsvPayload(items, reqLocale(req));
  audit(req.user, 'export.admin', 'archive', '', { ...filters, count: items.length });
  logAccess({
    userId: req.user.id,
    actor: req.user,
    action: 'export',
    office: filters.office,
    recordType: filters.type,
    detail: { ...filters, total: items.length, scope: 'admin' },
    ip: clientIp(req),
  });
  res.json({ ...payload, count: items.length });
});

// ---------------------------------------------------------------------------
// 删除申请队列
// ---------------------------------------------------------------------------

router.get('/deletion-requests', (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const status = REQUEST_STATUSES.includes(String(req.query.status || '')) ? String(req.query.status) : '';
  const where = ['r.deleted_at IS NULL'];
  const params = [];
  if (status) {
    where.push('r.status = ?');
    params.push(status);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM arch_deletion_requests r ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(`SELECT r.* FROM arch_deletion_requests r ${whereSql} ORDER BY r.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ items: rows.map((r) => requestWithUser(r, { events: false })), total, page, pageSize });
});

router.get('/deletion-requests/:id', (req, res) => {
  const row = loadRequest(req.params.id);
  res.json({ request: requestWithUser(row) });
});

function respondWithRequest(res, row) {
  res.json({ request: requestWithUser(loadRequest(row.id)) });
}

// 受理:pending → reviewing
router.post('/deletion-requests/:id/accept', (req, res) => {
  const row = loadRequest(req.params.id);
  const note = String(req.body?.note || '').trim().slice(0, 300);
  respondWithRequest(res, acceptRequest(row, req.user, note));
});

// 通过:reviewing → executing
router.post('/deletion-requests/:id/approve', (req, res) => {
  const row = loadRequest(req.params.id);
  const note = String(req.body?.note || '').trim().slice(0, 300);
  respondWithRequest(res, approveRequest(row, req.user, note));
});

// 执行:executing → completed,写隐藏标记并出回执
router.post('/deletion-requests/:id/execute', (req, res) => {
  const row = loadRequest(req.params.id);
  respondWithRequest(res, executeRequest(row, req.user));
});

// 驳回:pending / reviewing → rejected(理由必填)
router.post('/deletion-requests/:id/reject', (req, res) => {
  const row = loadRequest(req.params.id);
  const reason = String(req.body?.reason || '').trim().slice(0, 300);
  if (reason.length < 2) throw badRequest('ARCH_REASON_REQUIRED', 'A rejection reason is required');
  respondWithRequest(res, rejectRequest(row, req.user, reason));
});

// ---------------------------------------------------------------------------
// 访问日志与审计
// ---------------------------------------------------------------------------

router.get('/access-logs', (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = [];
  const params = [];
  if (req.query.userId) {
    where.push('l.user_id = ?');
    params.push(Number(req.query.userId));
  }
  if (['list', 'detail', 'export'].includes(String(req.query.action || ''))) {
    where.push('l.action = ?');
    params.push(String(req.query.action));
  }
  if (OFFICES.includes(String(req.query.office || ''))) {
    where.push('l.office = ?');
    params.push(String(req.query.office));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM arch_access_logs l ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT l.*, u.username, u.display_name AS displayName FROM arch_access_logs l
       LEFT JOIN users u ON u.id = l.user_id
       ${whereSql} ORDER BY l.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      actorName: r.actor_name,
      action: r.action,
      office: r.office,
      recordType: r.record_type,
      detail: (() => {
        try {
          return JSON.parse(r.detail || '{}');
        } catch {
          return {};
        }
      })(),
      ip: r.ip,
      createdAt: r.created_at,
      username: r.username,
      displayName: r.displayName,
    })),
    total,
    page,
    pageSize,
  });
});

router.get('/audit', (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = [];
  const params = [];
  if (req.query.action) {
    where.push('a.action LIKE ?');
    params.push(`${String(req.query.action)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM arch_audit_logs a ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT a.*, u.username, u.display_name AS displayName FROM arch_audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      actorId: r.actor_id,
      actorName: r.actor_name,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: (() => {
        try {
          return JSON.parse(r.detail || '{}');
        } catch {
          return {};
        }
      })(),
      createdAt: r.created_at,
      username: r.username,
      displayName: r.displayName,
    })),
    total,
    page,
    pageSize,
  });
});

// ---------------------------------------------------------------------------
// 自动审批:删除申请按 受理→通过→执行 一条龙推进;只写隐藏标记,绝不删业务数据。
// ---------------------------------------------------------------------------
registerAutoApprover('archives', ({ cutoff, actor }) => {
  const rows = db
    .prepare(
      `SELECT * FROM arch_deletion_requests
       WHERE status IN ('pending', 'reviewing', 'executing') AND deleted_at IS NULL AND updated_at <= ?
       ORDER BY updated_at, id LIMIT 20`
    )
    .all(cutoff);
  let processed = 0;
  for (const row of rows) {
    processed += safeAutoApprove('archives', `deletion:${row.id}`, () => {
      let fresh = row;
      if (fresh.status === 'pending') fresh = acceptRequest(fresh, actor, '', { auto: true });
      if (fresh.status === 'reviewing') fresh = approveRequest(fresh, actor, '', { auto: true });
      if (fresh.status === 'executing') executeRequest(fresh, actor, { auto: true });
    });
  }
  return processed;
});

export default router;