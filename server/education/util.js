// 奶龙国皇家教育与科学署 — shared server-side helpers: unpredictable
// numbering, bilingual-aware serializers, the content state machine, the
// reading-task engine (badge + postal notification) and the audit log.
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { ApiError, conflict } from '../http.js';

// ---------------------------------------------------------------------------
// Non-guessable identifiers (same scheme as the other offices: date + random
// base-32 without 0/O/1/I/L). NEE = 词条, NEA = 文章, NET = 任务.
// ---------------------------------------------------------------------------

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function makeNo(prefix) {
  return `${prefix}${stamp()}-${randomCode(6)}`;
}

export function makeUniqueNo(prefix, table, column = 'no') {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = makeNo(prefix);
    if (!db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).get(no)) return no;
  }
  throw new ApiError(500, 'INTERNAL_ERROR', 'Failed to allocate a unique number');
}

// ---------------------------------------------------------------------------
// Settings (edu_settings KV) + numbering prefixes
// ---------------------------------------------------------------------------

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM edu_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO edu_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), now());
}

export const nextEntryNo = () => makeUniqueNo(getSetting('entry_no_prefix', 'NEE'), 'edu_entries', 'no');
export const nextArticleNo = () => makeUniqueNo(getSetting('article_no_prefix', 'NEA'), 'edu_articles', 'no');
export const nextTaskNo = () => makeUniqueNo(getSetting('task_no_prefix', 'NET'), 'edu_tasks', 'no');

// ---------------------------------------------------------------------------
// Content state machine — draft → pending_review → published → offline
// (驳回把 pending_review 退回 draft;下架的内容可重新上线)
// ---------------------------------------------------------------------------

export const CONTENT_TYPES = ['entry', 'article'];

export const CONTENT_TABLES = { entry: 'edu_entries', article: 'edu_articles' };

export const CONTENT_TRANSITIONS = {
  draft: ['pending_review'],
  pending_review: ['published', 'draft'],
  published: ['offline'],
  offline: ['published'],
};

export function assertContentType(type) {
  if (!CONTENT_TYPES.includes(type)) throw conflict('EDU_UNKNOWN_TARGET', `Unknown content type: ${type}`);
  return type;
}

export function contentTable(type) {
  assertContentType(type);
  return CONTENT_TABLES[type];
}

export function assertContentTransition(type, from, to) {
  assertContentType(type);
  if (!(CONTENT_TRANSITIONS[from] || []).includes(to)) {
    throw conflict('EDU_INVALID_STATE', `Cannot move ${type} from ${from} to ${to}`);
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export function audit(actor, action, targetType = '', targetId = '', detail = {}) {
  const actorName =
    actor?.display_name || actor?.displayName || actor?.username || actor?.name || '';
  db.prepare(
    `INSERT INTO edu_audit_logs (actor_id, actor_name, action, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    actor?.id ?? null,
    actorName,
    action,
    targetType,
    String(targetId ?? ''),
    JSON.stringify(detail),
    now()
  );
}

// ---------------------------------------------------------------------------
// Postal contract — every cross-office notification goes through the postal
// office's sendPostalMessage({ userId, source, type, params }). The module is
// imported lazily so the education office still boots (with a warning) when it
// is deployed before the postal office.
// ---------------------------------------------------------------------------

let postalSender = null;
try {
  const mod = await import('../postal/notify.js');
  postalSender = typeof mod.sendPostalMessage === 'function' ? mod.sendPostalMessage : null;
  if (!postalSender) console.warn('[education] postal/notify.js has no sendPostalMessage export — notifications skipped.');
} catch {
  console.warn('[education] postal notify contract not found — cross-office notifications skipped.');
}

export function notifyPostal(userId, type, params = {}) {
  if (!postalSender) return null;
  try {
    return postalSender({ userId: String(userId), source: 'education', type, params });
  } catch (err) {
    // A notification failure must never roll back the education business action.
    console.error('[education] sendPostalMessage failed:', err?.message || err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reading-task engine — 读满 N 篇已发布内容 → 完成记录 + 成就徽章 + 邮件契约通知
// ---------------------------------------------------------------------------

export function countReadContents(userId) {
  const entries = db
    .prepare(
      `SELECT COUNT(DISTINCT h.target_id) AS n
       FROM edu_read_history h
       JOIN edu_entries e ON e.id = h.target_id AND e.status = 'published' AND e.deleted_at IS NULL
       WHERE h.user_id = ? AND h.target_type = 'entry'`
    )
    .get(userId).n;
  const articles = db
    .prepare(
      `SELECT COUNT(DISTINCT h.target_id) AS n
       FROM edu_read_history h
       JOIN edu_articles a ON a.id = h.target_id AND a.status = 'published' AND a.deleted_at IS NULL
       WHERE h.user_id = ? AND h.target_type = 'article'`
    )
    .get(userId).n;
  return entries + articles;
}

function activeTasks() {
  return db
    .prepare("SELECT * FROM edu_tasks WHERE status = 'active' AND deleted_at IS NULL ORDER BY id")
    .all();
}

function grantBadge(task, userId, ts) {
  if (!task.badge_code) return false;
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO edu_badges (user_id, code, name, name_tw, source_type, source_id, granted_at)
       VALUES (?, ?, ?, ?, 'task', ?, ?)`
    )
    .run(userId, task.badge_code, task.badge_name || task.code, task.badge_name_tw ?? '', task.id, ts);
  if (info.changes === 0) return false;
  audit({ name: 'system' }, 'grant_badge', 'badge', task.badge_code, { userId, taskNo: task.no });
  notifyPostal(userId, 'task_completed', {
    taskNo: task.no,
    taskTitle: task.title,
    taskTitleTw: task.title_tw ?? '',
    badgeName: task.badge_name || task.code,
    badgeNameTw: task.badge_name_tw ?? '',
  });
  return true;
}

// Reconciles every active task for one user; returns the tasks completed by
// this call (so the SPA can celebrate exactly once).
export function syncUserTasks(userId) {
  const total = countReadContents(userId);
  const completedNow = [];
  const ts = now();
  for (const task of activeTasks()) {
    const progress = Math.min(total, task.target_count);
    const existing = db
      .prepare('SELECT * FROM edu_task_records WHERE task_id = ? AND user_id = ?')
      .get(task.id, userId);
    if (!existing) {
      if (progress <= 0) continue;
      const completed = progress >= task.target_count;
      db.prepare(
        `INSERT INTO edu_task_records (task_id, user_id, progress, status, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(task.id, userId, progress, completed ? 'completed' : 'in_progress', completed ? ts : null, ts, ts);
      if (completed && grantBadge(task, userId, ts)) completedNow.push(task);
      continue;
    }
    if (existing.status === 'completed') {
      if (existing.progress !== progress) {
        db.prepare('UPDATE edu_task_records SET progress = ?, updated_at = ? WHERE id = ?').run(progress, ts, existing.id);
      }
      continue;
    }
    if (progress >= task.target_count) {
      db.prepare(
        "UPDATE edu_task_records SET progress = ?, status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?"
      ).run(progress, ts, ts, existing.id);
      if (grantBadge(task, userId, ts)) completedNow.push(task);
    } else if (existing.progress !== progress) {
      db.prepare('UPDATE edu_task_records SET progress = ?, updated_at = ? WHERE id = ?').run(progress, ts, existing.id);
    }
  }
  return completedNow;
}

// Read-only view of every active task with this user's progress.
export function taskOverview(userId) {
  const total = countReadContents(userId);
  const records = new Map(
    db.prepare('SELECT * FROM edu_task_records WHERE user_id = ?').all(userId).map((row) => [row.task_id, row])
  );
  return activeTasks().map((task) => {
    const record = records.get(task.id);
    const progress = Math.min(total, task.target_count);
    return {
      ...serializeTask(task),
      progress,
      completed: record?.status === 'completed' || progress >= task.target_count,
      completedAt: record?.completed_at ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Serializers — camelCase with *Tw siblings so the locale middleware can
// replace the base field with the Traditional copy on zh-TW requests.
// ---------------------------------------------------------------------------

export function splitTags(tags) {
  return String(tags || '')
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function serializeCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameTw: row.name_tw,
    description: row.description,
    descriptionTw: row.description_tw,
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
  };
}

export function serializeEntry(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    categoryCode: row.category_code,
    title: row.title,
    titleTw: row.title_tw,
    summary: row.summary,
    summaryTw: row.summary_tw,
    body: row.body,
    bodyTw: row.body_tw,
    tags: splitTags(row.tags),
    status: row.status,
    viewCount: row.view_count,
    favoriteCount: row.favorite_count,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    offlineAt: row.offline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

export function serializeArticle(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    title: row.title,
    titleTw: row.title_tw,
    summary: row.summary,
    summaryTw: row.summary_tw,
    body: row.body,
    bodyTw: row.body_tw,
    tags: splitTags(row.tags),
    status: row.status,
    viewCount: row.view_count,
    favoriteCount: row.favorite_count,
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    publishedAt: row.published_at,
    offlineAt: row.offline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

export function serializeTask(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    code: row.code,
    title: row.title,
    titleTw: row.title_tw,
    description: row.description,
    descriptionTw: row.description_tw,
    kind: row.kind,
    targetCount: row.target_count,
    badgeCode: row.badge_code,
    badgeName: row.badge_name,
    badgeNameTw: row.badge_name_tw,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

export function serializeRecord(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    progress: row.progress,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}

export function serializeBadge(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameTw: row.name_tw,
    sourceType: row.source_type,
    sourceId: row.source_id,
    grantedAt: row.granted_at,
  };
}

export function serializeReview(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetNo: row.target_no,
    action: row.action,
    note: row.note,
    reviewerName: row.reviewer_name,
    createdAt: row.created_at,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function pageParams(query, defaults = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || defaults.pageSize || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function readInt(value, { min = 1, max = 100, fallback = null, name = 'value' } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function idsForUser(userId, targetType) {
  return new Set(
    db
      .prepare('SELECT target_id FROM edu_favorites WHERE user_id = ? AND target_type = ?')
      .all(userId, targetType)
      .map((row) => row.target_id)
  );
}

export function relatedEntryIds(entryId) {
  return db
    .prepare(
      `SELECT related_id AS id FROM edu_entry_links WHERE entry_id = ?
       UNION
       SELECT entry_id AS id FROM edu_entry_links WHERE related_id = ?`
    )
    .all(entryId, entryId)
    .map((row) => row.id);
}