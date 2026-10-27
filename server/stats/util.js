// 奶龙国皇家统计署 — shared server-side helpers: unpredictable report numbers,
// audit trail, safe read-only cross-office counts and the postal-contract
// notification bridge (user-visible notices ride the shared postal office).
import crypto from 'node:crypto';
import { db, now } from '../db.js';

// Unpredictable, human-friendly numbers: no vowels/ambiguous glyphs.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const dateStamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

export function getConfig(key, fallback = null) {
  const row = db.prepare('SELECT value FROM stat_config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function getConfigNumber(key, fallback) {
  const v = Number(getConfig(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function setConfig(key, value) {
  db.prepare(
    'INSERT INTO stat_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(key, String(value), now());
}

// NSR-YYMMDD-XXXXXX  (NSR = annual report, verified unoccupied in server/)
export function nextReportNo() {
  const prefix = getConfig('stat.report_prefix', 'NSR');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = `${prefix}-${dateStamp()}-${randomCode(6)}`;
    if (!db.prepare('SELECT id FROM stat_reports WHERE no = ?').get(no)) return no;
  }
  throw new Error('cannot generate stats report number');
}

export function audit(actor, action, targetType, targetId, detail = {}) {
  db.prepare(
    'INSERT INTO stat_audit_logs (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    actor?.id ?? null,
    actor?.displayName || actor?.username || actor?.name || '',
    action,
    targetType,
    String(targetId ?? ''),
    JSON.stringify(detail),
    now()
  );
}

// ---------------------------------------------------------------------------
// Read-only cross-office counting. Other offices own their tables; this module
// never writes outside stat_* and never exposes row-level data — only COUNTs.
// ---------------------------------------------------------------------------

const IDENT = /^[a-z][a-z0-9_]*$/;

export function assertIdentifier(name) {
  return typeof name === 'string' && IDENT.test(name);
}

export function tableExists(table) {
  if (!assertIdentifier(table)) return false;
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

const columnCache = new Map();

export function tableColumns(table) {
  if (!tableExists(table)) return [];
  if (!columnCache.has(table)) {
    columnCache.set(
      table,
      db
        .pragma(`table_info(${table})`)
        .map((c) => c.name)
    );
  }
  return columnCache.get(table);
}

export function hasColumn(table, column) {
  return tableColumns(table).includes(column);
}

// COUNT(*) for a table, excluding soft-deleted rows when the column exists.
// `status` is an optional single status filter applied only to tables that
// actually carry a `status` column.
export function countRows(table, { status = null } = {}) {
  if (!tableExists(table)) return { available: false, value: null };
  const cols = tableColumns(table);
  const where = [];
  const params = [];
  if (cols.includes('deleted_at')) where.push('deleted_at IS NULL');
  if (status && cols.includes('status')) {
    where.push('status = ?');
    params.push(status);
  }
  const sql = `SELECT COUNT(*) AS n FROM ${table}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  return { available: true, value: db.prepare(sql).get(...params).n };
}

// One scalar count that never throws: a table/column that another (parallel)
// office has not created yet simply reads as 0.
export function safeCount(sql, params = []) {
  try {
    const row = db.prepare(sql).get(...params);
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

export function safeAvg(sql, params = []) {
  try {
    const row = db.prepare(sql).get(...params);
    const v = row?.n;
    return Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory sliding window, enough for a single-node MVP.
// ---------------------------------------------------------------------------

const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const list = (buckets.get(key) || []).filter((ts) => t - ts < windowMs);
  if (list.length >= max) return false;
  list.push(t);
  buckets.set(key, list);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((ts) => t - ts >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Postal contract bridge. The postal office owns server/postal/notify.js
// (`sendPostalMessage({ userId, source, type, params })`); it may land in the
// same merge batch as this office, so the import is resolved lazily and a
// missing contract must never break report generation.
// ---------------------------------------------------------------------------

let postalModule;

export async function notifyPostal(input) {
  try {
    if (postalModule === undefined) {
      postalModule = await import('../postal/notify.js').catch(() => null);
    }
    if (postalModule && typeof postalModule.sendPostalMessage === 'function') {
      return await postalModule.sendPostalMessage(input);
    }
  } catch (err) {
    console.error('[nailong/stats] postal notification failed:', err?.message || err);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function safeJson(text, fallback) {
  try {
    const parsed = JSON.parse(text);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function serializeMetric(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameTw: row.name_tw,
    description: row.description,
    descriptionTw: row.description_tw,
    formula: row.formula,
    formulaTw: row.formula_tw,
    sourceOffice: row.source_office,
    tableName: row.table_name,
    statusValue: row.status_value,
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeReport(row, { withSnapshot = true } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    no: row.no,
    year: row.year,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  };
  if (withSnapshot) out.snapshot = safeJson(row.snapshot, { sections: [] });
  return out;
}