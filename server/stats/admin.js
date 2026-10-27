// 奶龙国皇家统计署 — admin API.
// Platform-wide dashboard (COUNT only), metric-catalog CRUD, audited CSV
// export and the audit trail. Every write is recorded in stat_audit_logs.
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { ApiError, badRequest, conflict, readString } from '../http.js';
import { ensureStatsSchema } from './schema.js';
import {
  assertIdentifier,
  audit,
  countRows,
  hasColumn,
  safeAvg,
  safeCount,
  serializeMetric,
  tableExists,
} from './util.js';

ensureStatsSchema();

const router = Router();
const adminOnly = [authenticate, requirePermission('stat:manage')];

// ---------------------------------------------------------------------------
// Dashboard — one card per office, backed by that office's own table.
// ---------------------------------------------------------------------------

const BOARDS = [
  {
    key: 'visa',
    table: 'visa_applications',
    pending: ['draft', 'pending_review', 'supplement_required'],
    approved: ['approved', 'issued'],
    rejected: ['rejected'],
    start: 'submitted_at',
    end: 'decided_at',
    extras: [{ key: 'issued', table: 'visa_permits' }],
  },
  {
    key: 'immigration',
    table: 'im_declarations',
    pending: ['draft', 'pending', 'supplement'],
    approved: ['approved', 'entered', 'exited'],
    rejected: ['rejected'],
    start: 'submitted_at',
    end: 'reviewed_at',
    extras: [
      { key: 'passCodes', table: 'im_pass_codes' },
      { key: 'ports', table: 'im_ports' },
    ],
  },
  {
    key: 'dip',
    table: 'dip_relations',
    pending: ['draft', 'pending_review', 'supplement_required'],
    approved: ['established'],
    rejected: ['rejected'],
    start: 'submitted_at',
    end: 'decided_at',
    extras: [
      { key: 'identities', table: 'dip_identities' },
      { key: 'agreements', table: 'dip_agreements' },
    ],
  },
  {
    key: 'resident',
    table: 'res_applications',
    pending: ['draft', 'pending_review', 'supplement_required'],
    approved: ['approved'],
    rejected: ['rejected'],
    start: 'submitted_at',
    end: 'decided_at',
    extras: [{ key: 'cards', table: 'res_cards' }],
  },
  {
    key: 'protocol',
    table: 'pro_registrations',
    pending: ['draft', 'pending_review', 'waitlisted'],
    approved: ['approved', 'checked_in', 'finished'],
    rejected: ['rejected'],
    start: 'submitted_at',
    end: 'decided_at',
    extras: [
      { key: 'events', table: 'pro_events' },
      { key: 'passes', table: 'pro_passes' },
    ],
  },
  {
    key: 'docs',
    table: 'doc_applications',
    pending: ['draft', 'pending', 'supplementing'],
    approved: ['approved'],
    rejected: ['rejected'],
    start: 'submitted_at',
    end: 'decided_at',
    extras: [{ key: 'certificates', table: 'doc_certificates' }],
  },
  {
    key: 'appeal',
    table: 'appeal_appeals',
    pending: ['draft', 'pending_accept', 'accepted', 'processing', 'supplement_required'],
    approved: ['resolved'],
    rejected: ['rejected'],
    start: 'submitted_at',
    end: 'decided_at',
    extras: [{ key: 'decisions', table: 'appeal_decisions' }],
  },
  // --- 本批新署:表尚未并入时整张卡片显示为不可用 -------------------------
  {
    key: 'tourism',
    table: 'tour_checkins',
    extras: [
      { key: 'spots', table: 'tour_attractions' },
      { key: 'badges', table: 'tour_badges' },
    ],
  },
  {
    key: 'postal',
    table: 'post_messages',
    extras: [
      { key: 'postcards', table: 'post_postcards' },
      { key: 'notices', table: 'post_notices' },
    ],
  },
  {
    key: 'archives',
    table: 'arch_deletion_requests',
    pending: ['pending', 'reviewing', 'executing'],
    approved: ['completed'],
    rejected: ['rejected'],
    start: 'created_at',
    end: 'completed_at',
    extras: [{ key: 'accessLogs', table: 'arch_access_logs' }],
  },
  {
    key: 'education',
    table: 'edu_entries',
    pending: ['draft', 'pending_review'],
    approved: ['published'],
    rejected: ['offline'],
    start: 'submitted_at',
    end: 'published_at',
    extras: [{ key: 'articles', table: 'edu_articles' }],
  },
  {
    key: 'stats',
    table: 'stat_reports',
    extras: [
      { key: 'metrics', table: 'stat_metrics' },
      { key: 'exports', table: 'stat_export_logs' },
    ],
  },
];

function boardStats(def) {
  if (!tableExists(def.table)) return { key: def.key, available: false, extras: [] };
  const deleted = hasColumn(def.table, 'deleted_at') ? ['deleted_at IS NULL'] : [];
  const select = (extra = [], params = []) => {
    const where = [...deleted, ...extra];
    return safeCount(
      `SELECT COUNT(*) AS n FROM ${def.table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`,
      params
    );
  };
  const hasStatus = hasColumn(def.table, 'status');
  const inStatuses = (list) =>
    list && list.length && hasStatus
      ? select([`status IN (${list.map(() => '?').join(',')})`], list)
      : null;

  const total = select();
  const pending = inStatuses(def.pending);
  const approved = inStatuses(def.approved);
  const rejected = inStatuses(def.rejected);
  const decided = approved !== null && rejected !== null ? approved + rejected : null;
  const approvalRate = decided ? Math.round((approved / decided) * 1000) / 1000 : null;

  let avgHours = null;
  if (def.start && def.end && hasColumn(def.table, def.start) && hasColumn(def.table, def.end)) {
    const where = [...deleted, `${def.end} IS NOT NULL`, `${def.start} IS NOT NULL`];
    avgHours = safeAvg(
      `SELECT AVG((julianday(${def.end}) - julianday(${def.start})) * 24) AS n
       FROM ${def.table} WHERE ${where.join(' AND ')}`
    );
  }

  const extras = [];
  for (const extra of def.extras ?? []) {
    const counted = countRows(extra.table);
    if (counted.available) extras.push({ key: extra.key, value: counted.value });
  }

  return { key: def.key, available: true, total, pending, approved, rejected, approvalRate, avgHours, extras };
}

router.get('/dashboard', ...adminOnly, (_req, res) => {
  res.json({ asOf: now(), offices: BOARDS.map(boardStats) });
});

// ---------------------------------------------------------------------------
// Metric catalog CRUD
// ---------------------------------------------------------------------------

const OFFICES = [
  'portal',
  'visa',
  'immigration',
  'dip',
  'resident',
  'protocol',
  'docs',
  'appeal',
  'tourism',
  'postal',
  'archives',
  'stats',
  'education',
];

const TABLE_OFFICE_PREFIXES = [
  ['visa_', 'visa'],
  ['im_', 'immigration'],
  ['dip_', 'dip'],
  ['res_', 'resident'],
  ['pro_', 'protocol'],
  ['doc_', 'docs'],
  ['appeal_', 'appeal'],
  ['tour_', 'tourism'],
  ['post_', 'postal'],
  ['arch_', 'archives'],
  ['stat_', 'stats'],
  ['edu_', 'education'],
];

// 只允许登记业务表作为来源:核心账号表 + 各署前缀表;系统表(permissions、
// roles、sessions 等)不在白名单里。
function officeOfTable(table) {
  if (table === 'users') return 'portal';
  for (const [prefix, office] of TABLE_OFFICE_PREFIXES) {
    if (table.startsWith(prefix)) return office;
  }
  return null;
}

function sourceTables() {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name)
    .filter((name) => assertIdentifier(name) && officeOfTable(name))
    .map((name) => ({ table: name, office: officeOfTable(name) }));
}

const SOURCE_SET = () => new Set(sourceTables().map((row) => row.table));

const CODE_RE = /^[a-z][a-z0-9_]{2,40}$/;
const STATUS_RE = /^[a-z0-9_]{1,40}$/;

function optionalText(value, { name, max = 500 } = {}) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw badRequest('VALIDATION_ERROR', `${name} must be a string`);
  const v = value.trim();
  if (v.length > max) throw badRequest('VALIDATION_ERROR', `${name} must be at most ${max} characters`);
  return v;
}

function normalizeStatus(value, tableName) {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value).trim().toLowerCase();
  if (!STATUS_RE.test(v)) throw badRequest('STAT_STATUS_INVALID', 'Invalid status value');
  if (!tableExists(tableName) || !hasColumn(tableName, 'status')) {
    throw badRequest('STAT_STATUS_INVALID', 'Source table has no status column');
  }
  return v;
}

function metricBody(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.code !== undefined) {
    const code = String(body.code ?? '').trim().toLowerCase();
    if (!CODE_RE.test(code)) throw badRequest('VALIDATION_ERROR', 'Invalid metric code');
    out.code = code;
  }
  if (!partial || body.name !== undefined) {
    out.name = readString(body.name, { name: 'name', min: 1, max: 60 });
  }
  if (!partial || body.nameTw !== undefined) out.name_tw = optionalText(body.nameTw, { name: 'nameTw', max: 60 }) || null;
  if (!partial || body.description !== undefined) {
    out.description = optionalText(body.description, { name: 'description', max: 300 });
  }
  if (!partial || body.descriptionTw !== undefined) {
    out.description_tw = optionalText(body.descriptionTw, { name: 'descriptionTw', max: 300 }) || null;
  }
  if (!partial || body.formula !== undefined) {
    out.formula = optionalText(body.formula, { name: 'formula', max: 1000 });
  }
  if (!partial || body.formulaTw !== undefined) {
    out.formula_tw = optionalText(body.formulaTw, { name: 'formulaTw', max: 1000 }) || null;
  }
  if (!partial || body.sourceOffice !== undefined) {
    const office = String(body.sourceOffice ?? '').trim();
    if (office && !OFFICES.includes(office)) throw badRequest('VALIDATION_ERROR', 'Invalid source office');
    if (office) out.source_office = office;
  }
  if (!partial || body.tableName !== undefined) {
    const table = String(body.tableName ?? '').trim();
    if (!SOURCE_SET().has(table)) throw badRequest('STAT_METRIC_TABLE_INVALID', 'Source table is not allowed');
    out.table_name = table;
    if (out.source_office === undefined) out.source_office = officeOfTable(table);
  }
  if (!partial) {
    if (!out.table_name) throw badRequest('STAT_METRIC_TABLE_INVALID', 'Source table is required');
    if (!out.source_office) throw badRequest('VALIDATION_ERROR', 'sourceOffice is required');
  }
  if (!partial || body.enabled !== undefined) out.enabled = body.enabled === false || body.enabled === 0 ? 0 : 1;
  if (!partial || body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    out.sort_order = Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return out;
}

router.get('/metrics', ...adminOnly, (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM stat_metrics WHERE deleted_at IS NULL ORDER BY sort_order, id')
    .all();
  res.json({
    items: rows.map((row) => {
      const counted = countRows(row.table_name, { status: row.status_value });
      return { ...serializeMetric(row), value: counted.value, available: counted.available };
    }),
    sources: sourceTables(),
  });
});

router.post('/metrics', ...adminOnly, (req, res) => {
  const body = metricBody(req.body ?? {});
  const statusValue = normalizeStatus(req.body?.statusValue, body.table_name);
  const exists = db.prepare('SELECT id FROM stat_metrics WHERE code = ?').get(body.code);
  if (exists) throw conflict('STAT_METRIC_CODE_EXISTS', 'Metric code already exists');
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO stat_metrics
         (code, name, name_tw, description, description_tw, formula, formula_tw,
          source_office, table_name, status_value, enabled, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      body.code,
      body.name,
      body.name_tw ?? null,
      body.description ?? '',
      body.description_tw ?? null,
      body.formula ?? '',
      body.formula_tw ?? null,
      body.source_office,
      body.table_name,
      statusValue,
      body.enabled ?? 1,
      body.sort_order ?? 0,
      ts,
      ts
    );
  audit(req.user, 'metric_create', 'metric', body.code, { name: body.name, table: body.table_name });
  const row = db.prepare('SELECT * FROM stat_metrics WHERE id = ?').get(info.lastInsertRowid);
  const counted = countRows(row.table_name, { status: row.status_value });
  res.json({ metric: { ...serializeMetric(row), value: counted.value, available: counted.available } });
});

router.patch('/metrics/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM stat_metrics WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw new ApiError(404, 'STAT_METRIC_NOT_FOUND', 'Metric not found');

  const fields = metricBody(req.body ?? {}, { partial: true });
  const effectiveTable = fields.table_name ?? row.table_name;
  if (req.body?.statusValue !== undefined) {
    fields.status_value = normalizeStatus(req.body.statusValue, effectiveTable);
  } else if (fields.table_name && row.status_value && !hasColumn(effectiveTable, 'status')) {
    // 换到没有 status 列的表时清空状态筛选,避免口径与实际口径不一致。
    fields.status_value = null;
  }
  if (fields.code && fields.code !== row.code) {
    if (db.prepare('SELECT id FROM stat_metrics WHERE code = ? AND id != ?').get(fields.code, row.id)) {
      throw conflict('STAT_METRIC_CODE_EXISTS', 'Metric code already exists');
    }
  }
  const columns = Object.keys(fields);
  if (!columns.length) {
    res.json({ metric: serializeMetric(row) });
    return;
  }
  const sets = columns.map((column) => `${column} = ?`).join(', ');
  const values = columns.map((column) => fields[column]);
  db.prepare(`UPDATE stat_metrics SET ${sets}, updated_at = ? WHERE id = ?`).run(...values, now(), row.id);
  audit(req.user, 'metric_update', 'metric', fields.code ?? row.code, { fields: columns });
  const updated = db.prepare('SELECT * FROM stat_metrics WHERE id = ?').get(row.id);
  const counted = countRows(updated.table_name, { status: updated.status_value });
  res.json({ metric: { ...serializeMetric(updated), value: counted.value, available: counted.available } });
});

router.delete('/metrics/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM stat_metrics WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw new ApiError(404, 'STAT_METRIC_NOT_FOUND', 'Metric not found');
  db.prepare('UPDATE stat_metrics SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user, 'metric_delete', 'metric', row.code, { name: row.name });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// CSV export + export log
// ---------------------------------------------------------------------------

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

router.get('/export.csv', ...adminOnly, (req, res) => {
  const codes = String(req.query.metrics || '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);
  const filters = codes.length ? codes : null;
  const rows = filters
    ? db
        .prepare(
          `SELECT * FROM stat_metrics WHERE deleted_at IS NULL AND code IN (${filters.map(() => '?').join(',')}) ORDER BY sort_order, id`
        )
        .all(...filters)
    : db.prepare('SELECT * FROM stat_metrics WHERE deleted_at IS NULL ORDER BY sort_order, id').all();
  if (!rows.length) throw badRequest('STAT_EXPORT_EMPTY', 'No metrics selected');

  const asOf = now();
  const lines = [
    ['指标代码', '指标名称', '繁体名称', '来源署', '来源表', '指标值', '数据时间'].map(csvEscape).join(','),
  ];
  for (const row of rows) {
    const counted = countRows(row.table_name, { status: row.status_value });
    lines.push(
      [
        row.code,
        row.name,
        row.name_tw ?? '',
        row.source_office,
        row.table_name,
        counted.available ? counted.value : '',
        asOf,
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  db.prepare(
    'INSERT INTO stat_export_logs (actor_id, actor_name, metric_codes, row_count, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    req.user.id,
    req.user.displayName || req.user.username || '',
    rows.map((row) => row.code).join(','),
    rows.length,
    JSON.stringify({ asOf, codes: rows.map((row) => row.code) }),
    asOf
  );
  audit(req.user, 'export', 'metrics', rows.map((row) => row.code).join(','), { count: rows.length });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="stats-metrics-${Date.now()}.csv"`);
  res.send(`\uFEFF${lines.join('\r\n')}`);
});

router.get('/export-logs', ...adminOnly, (_req, res) => {
  const rows = db.prepare('SELECT * FROM stat_export_logs ORDER BY id DESC LIMIT 200').all();
  res.json({ items: rows });
});

router.get('/audit', ...adminOnly, (req, res) => {
  const action = String(req.query.action || '').trim();
  const rows = action
    ? db.prepare('SELECT * FROM stat_audit_logs WHERE action = ? ORDER BY id DESC LIMIT 300').all(action)
    : db.prepare('SELECT * FROM stat_audit_logs ORDER BY id DESC LIMIT 300').all();
  res.json({ items: rows });
});

export default router;