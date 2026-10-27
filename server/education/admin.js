// 奶龙国皇家教育与科学署 — admin endpoints with queue isolation:
//   edu:review → 内容审核队列(词条 + 文章,通过 / 驳回)
//   edu:manage → 词条管理、文章管理、任务管理、统计与审计
// The two permissions live on separate sub-routers mounted by path, so an
// edu_reviewer never needs (and never gets) content-management rights.
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, conflict, notFound, readString } from '../http.js';
import { ensureEducationSchema } from './schema.js';
import { registerAutoApprover, safeAutoApprove } from '../autoApprove.js';
import {
  assertContentTransition,
  assertContentType,
  audit,
  CONTENT_TYPES,
  contentTable,
  nextArticleNo,
  nextEntryNo,
  nextTaskNo,
  pageParams,
  readInt,
  serializeArticle,
  serializeCategory,
  serializeEntry,
  serializeRecord,
  serializeReview,
  serializeTask,
} from './util.js';

ensureEducationSchema();

const router = Router();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function displayName(userId) {
  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(userId);
  return user?.display_name || user?.username || '';
}

function contentRow(type, id) {
  const table = contentTable(type);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(Number(id));
}

function contentRowOrThrow(type, id) {
  const row = contentRow(type, id);
  if (!row) throw notFound(`${type} not found`);
  return row;
}

function serializeContent(type, row, extra = {}) {
  return type === 'entry' ? serializeEntry(row, extra) : serializeArticle(row, extra);
}

function readText(value, { name, max = 5000, required = false }) {
  if (value === undefined) return undefined;
  if (value === null) return '';
  if (typeof value !== 'string') throw badRequest('VALIDATION_ERROR', `${name} must be a string`);
  const text = value.trim();
  if (required && !text) throw badRequest('VALIDATION_ERROR', `${name} is required`);
  if (text.length > max) throw badRequest('VALIDATION_ERROR', `${name} is too long`);
  return text;
}

function requiredText(value, options) {
  const text = readText(value, { ...options, required: true });
  if (!text) throw badRequest('VALIDATION_ERROR', `${options.name} is required`);
  return text;
}

function readCategoryCode(value) {
  const code = readString(value, { name: 'categoryCode', max: 32 });
  const row = db.prepare('SELECT code FROM edu_categories WHERE code = ? AND enabled = 1').get(code);
  if (!row) throw badRequest('EDU_UNKNOWN_CATEGORY', `Unknown category: ${code}`);
  return code;
}

function readRelatedIds(value, selfId = null) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest('VALIDATION_ERROR', 'relatedIds must be an array');
  const ids = [...new Set(value.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0))].filter(
    (id) => id !== selfId
  );
  if (ids.length > 6) throw badRequest('EDU_RELATED_LIMIT', 'At most 6 related entries are allowed');
  for (const id of ids) {
    if (!db.prepare('SELECT 1 FROM edu_entries WHERE id = ? AND deleted_at IS NULL').get(id)) {
      throw badRequest('EDU_RELATED_INVALID', `Unknown related entry: ${id}`);
    }
  }
  return ids;
}

function saveRelated(entryId, ids) {
  if (ids === undefined) return;
  db.prepare('DELETE FROM edu_entry_links WHERE entry_id = ?').run(entryId);
  const insert = db.prepare('INSERT OR IGNORE INTO edu_entry_links (entry_id, related_id) VALUES (?, ?)');
  for (const id of ids) if (id !== entryId) insert.run(entryId, id);
}

function relatedIdsOf(entryId) {
  return db
    .prepare('SELECT related_id AS id FROM edu_entry_links WHERE entry_id = ? ORDER BY related_id')
    .all(entryId)
    .map((row) => row.id);
}

function listContent(type, req) {
  const table = contentTable(type);
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const status = String(req.query.status || '').trim();
  const q = String(req.query.q || '').trim();
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(title LIKE ? OR no LIKE ? OR summary LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${clause}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM ${table} WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  const items = rows.map((row) =>
    serializeContent(type, row, {
      submitter: displayName(row.created_by),
      relatedIds: type === 'entry' ? relatedIdsOf(row.id) : undefined,
    })
  );
  return { items, total, page, pageSize };
}

function createContent(type, req, res) {
  const body = req.body || {};
  const table = contentTable(type);
  const ts = now();
  const title = requiredText(body.title, { name: 'title', max: 120 });
  const contentBody = requiredText(body.body, { name: 'body', max: 20000 });
  const titleTw = readText(body.titleTw, { name: 'titleTw', max: 120 }) ?? '';
  const summary = readText(body.summary, { name: 'summary', max: 400 }) ?? '';
  const summaryTw = readText(body.summaryTw, { name: 'summaryTw', max: 400 }) ?? '';
  const bodyTw = readText(body.bodyTw, { name: 'bodyTw', max: 20000 }) ?? '';
  const tags = readText(body.tags, { name: 'tags', max: 200 }) ?? '';
  const categoryCode = type === 'entry' ? readCategoryCode(body.categoryCode ?? 'WORLD') : null;
  const relatedIds = type === 'entry' ? readRelatedIds(body.relatedIds ?? []) : undefined;
  const no = type === 'entry' ? nextEntryNo() : nextArticleNo();

  const id = db.transaction(() => {
    const info =
      type === 'entry'
        ? db
            .prepare(
              `INSERT INTO edu_entries
               (no, category_code, title, title_tw, summary, summary_tw, body, body_tw, tags, status, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
            )
            .run(no, categoryCode, title, titleTw, summary, summaryTw, contentBody, bodyTw, tags, req.user.id, ts, ts)
        : db
            .prepare(
              `INSERT INTO edu_articles
               (no, title, title_tw, summary, summary_tw, body, body_tw, tags, status, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
            )
            .run(no, title, titleTw, summary, summaryTw, contentBody, bodyTw, tags, req.user.id, ts, ts);
    if (type === 'entry') saveRelated(Number(info.lastInsertRowid), relatedIds);
    return Number(info.lastInsertRowid);
  })();

  audit(req.user, `create_${type}`, type, no, { title });
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  res.status(201).json({ item: serializeContent(type, row, { relatedIds: type === 'entry' ? relatedIdsOf(id) : undefined }) });
}

function patchContent(type, req, res) {
  const table = contentTable(type);
  const row = contentRowOrThrow(type, req.params.id);
  if (row.status === 'pending_review') {
    throw conflict('EDU_INVALID_STATE', 'Content under review cannot be edited');
  }
  const body = req.body || {};
  const updates = [];
  const params = [];
  const assign = (column, value) => {
    if (value === undefined) return;
    updates.push(`${column} = ?`);
    params.push(value);
  };
  assign('title', readText(body.title, { name: 'title', max: 120, required: true }));
  assign('title_tw', readText(body.titleTw, { name: 'titleTw', max: 120 }));
  assign('summary', readText(body.summary, { name: 'summary', max: 400 }));
  assign('summary_tw', readText(body.summaryTw, { name: 'summaryTw', max: 400 }));
  assign('body', readText(body.body, { name: 'body', max: 20000, required: true }));
  assign('body_tw', readText(body.bodyTw, { name: 'bodyTw', max: 20000 }));
  assign('tags', readText(body.tags, { name: 'tags', max: 200 }));
  if (type === 'entry' && body.categoryCode !== undefined) assign('category_code', readCategoryCode(body.categoryCode));

  const relatedIds = type === 'entry' ? readRelatedIds(body.relatedIds, row.id) : undefined;
  if (updates.length === 0 && relatedIds === undefined) {
    throw badRequest('VALIDATION_ERROR', 'Nothing to update');
  }
  const ts = now();
  db.transaction(() => {
    if (updates.length) {
      db.prepare(`UPDATE ${table} SET ${updates.join(', ')}, updated_by = ?, updated_at = ? WHERE id = ?`).run(
        ...params,
        req.user.id,
        ts,
        row.id
      );
    }
    if (type === 'entry') saveRelated(row.id, relatedIds);
  })();
  audit(req.user, `update_${type}`, type, row.no, {});
  const fresh = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id);
  res.json({
    item: serializeContent(type, fresh, {
      submitter: displayName(fresh.created_by),
      relatedIds: type === 'entry' ? relatedIdsOf(row.id) : undefined,
    }),
  });
}

function submitContent(type, req, res) {
  const table = contentTable(type);
  const row = contentRowOrThrow(type, req.params.id);
  assertContentTransition(type, row.status, 'pending_review');
  if (!row.title.trim() || !row.body.trim()) {
    throw conflict('EDU_INCOMPLETE', 'Title and body are required before submitting');
  }
  const ts = now();
  db.prepare(
    `UPDATE ${table} SET status = 'pending_review', submitted_at = ?, reviewed_at = NULL, reviewed_by = NULL,
       review_note = '', updated_by = ?, updated_at = ? WHERE id = ?`
  ).run(ts, req.user.id, ts, row.id);
  audit(req.user, `submit_${type}`, type, row.no, {});
  const fresh = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id);
  res.json({ item: serializeContent(type, fresh) });
}

function publishContent(type, req, res) {
  const table = contentTable(type);
  const row = contentRowOrThrow(type, req.params.id);
  assertContentTransition(type, row.status, 'published');
  const ts = now();
  db.prepare(
    `UPDATE ${table} SET status = 'published', published_at = ?, offline_at = NULL, updated_by = ?, updated_at = ? WHERE id = ?`
  ).run(ts, req.user.id, ts, row.id);
  audit(req.user, `publish_${type}`, type, row.no, {});
  const fresh = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id);
  res.json({ item: serializeContent(type, fresh) });
}

function offlineContent(type, req, res) {
  const table = contentTable(type);
  const row = contentRowOrThrow(type, req.params.id);
  assertContentTransition(type, row.status, 'offline');
  const ts = now();
  db.prepare(
    `UPDATE ${table} SET status = 'offline', offline_at = ?, updated_by = ?, updated_at = ? WHERE id = ?`
  ).run(ts, req.user.id, ts, row.id);
  audit(req.user, `offline_${type}`, type, row.no, {});
  const fresh = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id);
  res.json({ item: serializeContent(type, fresh) });
}

function deleteContent(type, req, res) {
  const table = contentTable(type);
  const row = contentRowOrThrow(type, req.params.id);
  if (row.status === 'pending_review') {
    throw conflict('EDU_INVALID_STATE', 'Content under review cannot be deleted');
  }
  db.prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`).run(now(), now(), row.id);
  audit(req.user, `delete_${type}`, type, row.no, { title: row.title });
  res.json({ deleted: true });
}

// ===========================================================================
// 内容审核队列 (edu:review) — 通过 / 驳回
// ===========================================================================

const reviewRouter = Router();
reviewRouter.use(authenticate, requirePermission('edu:review'));

function queueItems(type, q) {
  const table = contentTable(type);
  const where = ["status = 'pending_review'", 'deleted_at IS NULL'];
  const params = [];
  if (q) {
    where.push('(title LIKE ? OR summary LIKE ? OR body LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const rows = db
    .prepare(`SELECT * FROM ${table} WHERE ${where.join(' AND ')} ORDER BY COALESCE(submitted_at, updated_at), id`)
    .all(...params);
  return rows.map((row) =>
    serializeContent(type, row, {
      targetType: type,
      submitter: displayName(row.created_by),
    })
  );
}

reviewRouter.get('/queue', (req, res) => {
  const targetType = String(req.query.targetType || '').trim();
  const q = String(req.query.q || '').trim();
  const types = targetType ? [assertContentType(targetType)] : CONTENT_TYPES;
  const items = types.flatMap((type) => queueItems(type, q));
  const stats = {
    entry: db
      .prepare("SELECT COUNT(*) AS n FROM edu_entries WHERE status = 'pending_review' AND deleted_at IS NULL")
      .get().n,
    article: db
      .prepare("SELECT COUNT(*) AS n FROM edu_articles WHERE status = 'pending_review' AND deleted_at IS NULL")
      .get().n,
  };
  res.json({ items, total: items.length, stats });
});

reviewRouter.get('/items/:targetType/:id', (req, res) => {
  const type = assertContentType(req.params.targetType);
  const row = contentRowOrThrow(type, req.params.id);
  const history = db
    .prepare('SELECT * FROM edu_reviews WHERE target_type = ? AND target_id = ? ORDER BY id DESC LIMIT 10')
    .all(type, row.id)
    .map((item) => serializeReview(item));
  res.json({
    item: serializeContent(type, row, {
      targetType: type,
      submitter: displayName(row.created_by),
      relatedIds: type === 'entry' ? relatedIdsOf(row.id) : undefined,
      reviewHistory: history,
    }),
  });
});

// 审核核心:手动端点与自动审批共用(状态迁移、审核轨迹、审计一次成型)。
function reviewContent({ targetType, row, action, note = '', actor, auto = false }) {
  const type = assertContentType(targetType);
  const table = contentTable(type);
  const ts = now();
  const reviewerName = actor?.display_name || actor?.displayName || actor?.username || '';
  if (action === 'approve') {
    assertContentTransition(type, row.status, 'published');
    db.transaction(() => {
      db.prepare(
        `UPDATE ${table} SET status = 'published', published_at = ?, offline_at = NULL, reviewed_at = ?,
           reviewed_by = ?, review_note = ?, updated_at = ? WHERE id = ?`
      ).run(ts, ts, actor?.id ?? null, note, ts, row.id);
      db.prepare(
        `INSERT INTO edu_reviews (target_type, target_id, target_no, action, note, reviewer_id, reviewer_name, created_at)
         VALUES (?, ?, ?, 'approve', ?, ?, ?, ?)`
      ).run(type, row.id, row.no, note, actor?.id ?? null, reviewerName, ts);
      audit(actor, 'approve_content', type, row.no, auto ? { note, auto: true } : { note });
    })();
  } else {
    assertContentTransition(type, row.status, 'draft');
    db.transaction(() => {
      db.prepare(
        `UPDATE ${table} SET status = 'draft', reviewed_at = ?, reviewed_by = ?, review_note = ?, updated_at = ? WHERE id = ?`
      ).run(ts, actor?.id ?? null, note, ts, row.id);
      db.prepare(
        `INSERT INTO edu_reviews (target_type, target_id, target_no, action, note, reviewer_id, reviewer_name, created_at)
         VALUES (?, ?, ?, 'reject', ?, ?, ?, ?)`
      ).run(type, row.id, row.no, note, actor?.id ?? null, reviewerName, ts);
      audit(actor, 'reject_content', type, row.no, auto ? { note, auto: true } : { note });
    })();
  }
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(row.id);
}

function reviewAction(req, res, action) {
  const type = assertContentType(req.params.targetType);
  const row = contentRowOrThrow(type, req.params.id);
  const note = String(req.body?.note ?? '').trim().slice(0, 500);
  if (action === 'reject' && !note) {
    throw badRequest('EDU_REVIEW_NOTE_REQUIRED', 'A rejection note is required');
  }
  const fresh = reviewContent({ targetType: type, row, action, note, actor: req.user });
  res.json({ item: serializeContent(type, fresh) });
}

reviewRouter.post('/items/:targetType/:id/approve', (req, res) => reviewAction(req, res, 'approve'));
reviewRouter.post('/items/:targetType/:id/reject', (req, res) => reviewAction(req, res, 'reject'));

reviewRouter.get('/history', (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const type = String(req.query.targetType || '').trim();
  const where = [];
  const params = [];
  if (type) {
    assertContentType(type);
    where.push('target_type = ?');
    params.push(type);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM edu_reviews ${clause}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM edu_reviews ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ items: rows.map((row) => serializeReview(row)), total, page, pageSize });
});

// ===========================================================================
// 内容与任务管理 (edu:manage)
// ===========================================================================

const manageRouter = Router();
manageRouter.use(authenticate, requirePermission('edu:manage'));

manageRouter.get('/categories', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM edu_categories WHERE enabled = 1 ORDER BY sort_order, id')
    .all();
  res.json({ items: rows.map(serializeCategory) });
});

manageRouter.get('/entries', (req, res) => res.json(listContent('entry', req)));
manageRouter.get('/entries/:id', (req, res) => {
  const row = contentRowOrThrow('entry', req.params.id);
  res.json({
    item: serializeEntry(row, {
      submitter: displayName(row.created_by),
      relatedIds: relatedIdsOf(row.id),
    }),
  });
});
manageRouter.post('/entries', (req, res) => createContent('entry', req, res));
manageRouter.patch('/entries/:id', (req, res) => patchContent('entry', req, res));
manageRouter.post('/entries/:id/submit', (req, res) => submitContent('entry', req, res));
manageRouter.post('/entries/:id/publish', (req, res) => publishContent('entry', req, res));
manageRouter.post('/entries/:id/offline', (req, res) => offlineContent('entry', req, res));
manageRouter.delete('/entries/:id', (req, res) => deleteContent('entry', req, res));

manageRouter.get('/articles', (req, res) => res.json(listContent('article', req)));
manageRouter.get('/articles/:id', (req, res) => {
  const row = contentRowOrThrow('article', req.params.id);
  res.json({ item: serializeArticle(row, { submitter: displayName(row.created_by) }) });
});
manageRouter.post('/articles', (req, res) => createContent('article', req, res));
manageRouter.patch('/articles/:id', (req, res) => patchContent('article', req, res));
manageRouter.post('/articles/:id/submit', (req, res) => submitContent('article', req, res));
manageRouter.post('/articles/:id/publish', (req, res) => publishContent('article', req, res));
manageRouter.post('/articles/:id/offline', (req, res) => offlineContent('article', req, res));
manageRouter.delete('/articles/:id', (req, res) => deleteContent('article', req, res));

// --- 任务 -------------------------------------------------------------------

function taskRows() {
  return db
    .prepare(
      `SELECT t.*,
         (SELECT COUNT(*) FROM edu_task_records r WHERE r.task_id = t.id) AS participants,
         (SELECT COUNT(*) FROM edu_task_records r WHERE r.task_id = t.id AND r.status = 'completed') AS completed
       FROM edu_tasks t WHERE t.deleted_at IS NULL ORDER BY t.id`
    )
    .all();
}

function taskStats() {
  return taskRows().map((row) =>
    serializeTask(row, {
      participants: row.participants,
      completed: row.completed,
      completionRate: row.participants ? Math.round((row.completed * 100) / row.participants) : 0,
    })
  );
}

manageRouter.get('/tasks', (_req, res) => {
  res.json({ items: taskStats() });
});

manageRouter.post('/tasks', (req, res) => {
  const body = req.body || {};
  const code = readString(body.code, { name: 'code', min: 2, max: 20 }).toUpperCase();
  if (db.prepare('SELECT 1 FROM edu_tasks WHERE code = ?').get(code)) {
    throw conflict('EDU_TASK_CODE_TAKEN', `Task code already exists: ${code}`);
  }
  const title = requiredText(body.title, { name: 'title', max: 80 });
  const titleTw = readText(body.titleTw, { name: 'titleTw', max: 80 }) ?? '';
  const description = readText(body.description, { name: 'description', max: 500 }) ?? '';
  const descriptionTw = readText(body.descriptionTw, { name: 'descriptionTw', max: 500 }) ?? '';
  const targetCount = readInt(body.targetCount, { min: 1, max: 50, fallback: 3, name: 'targetCount' });
  const badgeCode = readText(body.badgeCode, { name: 'badgeCode', max: 40 }) ?? '';
  const badgeName = readText(body.badgeName, { name: 'badgeName', max: 40 }) ?? '';
  const badgeNameTw = readText(body.badgeNameTw, { name: 'badgeNameTw', max: 40 }) ?? '';
  const status = body.status === 'inactive' ? 'inactive' : 'active';
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO edu_tasks
       (no, code, title, title_tw, description, description_tw, kind, target_count, badge_code, badge_name, badge_name_tw, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'reading', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      nextTaskNo(),
      code,
      title,
      titleTw,
      description,
      descriptionTw,
      targetCount,
      badgeCode,
      badgeName,
      badgeNameTw,
      status,
      req.user.id,
      ts,
      ts
    );
  const row = db.prepare('SELECT * FROM edu_tasks WHERE id = ?').get(info.lastInsertRowid);
  audit(req.user, 'create_task', 'task', row.no, { code, targetCount, badgeCode });
  res.status(201).json({ item: serializeTask(row, { participants: 0, completed: 0, completionRate: 0 }) });
});

manageRouter.patch('/tasks/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM edu_tasks WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Task not found');
  const body = req.body || {};
  const updates = [];
  const params = [];
  const assign = (column, value) => {
    if (value === undefined) return;
    updates.push(`${column} = ?`);
    params.push(value);
  };
  assign('title', readText(body.title, { name: 'title', max: 80, required: true }));
  assign('title_tw', readText(body.titleTw, { name: 'titleTw', max: 80 }));
  assign('description', readText(body.description, { name: 'description', max: 500 }));
  assign('description_tw', readText(body.descriptionTw, { name: 'descriptionTw', max: 500 }));
  if (body.targetCount !== undefined) {
    assign('target_count', readInt(body.targetCount, { min: 1, max: 50, fallback: null, name: 'targetCount' }));
  }
  assign('badge_code', readText(body.badgeCode, { name: 'badgeCode', max: 40 }));
  assign('badge_name', readText(body.badgeName, { name: 'badgeName', max: 40 }));
  assign('badge_name_tw', readText(body.badgeNameTw, { name: 'badgeNameTw', max: 40 }));
  if (updates.length === 0) throw badRequest('VALIDATION_ERROR', 'Nothing to update');
  db.prepare(`UPDATE edu_tasks SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...params, now(), row.id);
  audit(req.user, 'update_task', 'task', row.no, {});
  const fresh = db.prepare('SELECT * FROM edu_tasks WHERE id = ?').get(row.id);
  res.json({ item: serializeTask(fresh) });
});

manageRouter.post('/tasks/:id/status', (req, res) => {
  const row = db.prepare('SELECT * FROM edu_tasks WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Task not found');
  const status = String(req.body?.status || '');
  if (status !== 'active' && status !== 'inactive') {
    throw badRequest('VALIDATION_ERROR', 'status must be active or inactive');
  }
  db.prepare('UPDATE edu_tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), row.id);
  audit(req.user, 'task_status', 'task', row.no, { status });
  const fresh = db.prepare('SELECT * FROM edu_tasks WHERE id = ?').get(row.id);
  res.json({ item: serializeTask(fresh) });
});

manageRouter.get('/tasks/:id/records', (req, res) => {
  const row = db.prepare('SELECT * FROM edu_tasks WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Task not found');
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const total = db.prepare('SELECT COUNT(*) AS n FROM edu_task_records WHERE task_id = ?').get(row.id).n;
  const records = db
    .prepare(
      `SELECT r.*, u.username, u.display_name FROM edu_task_records r
       JOIN users u ON u.id = r.user_id
       WHERE r.task_id = ? ORDER BY r.updated_at DESC, r.id DESC LIMIT ? OFFSET ?`
    )
    .all(row.id, pageSize, offset);
  res.json({
    task: serializeTask(row),
    items: records.map((item) =>
      serializeRecord(item, {
        username: item.username,
        displayName: item.display_name,
      })
    ),
    total,
    page,
    pageSize,
  });
});

manageRouter.delete('/tasks/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM edu_tasks WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Task not found');
  db.prepare('UPDATE edu_tasks SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user, 'delete_task', 'task', row.no, { code: row.code });
  res.json({ deleted: true });
});

// --- 统计 / 审计 ------------------------------------------------------------

function contentCounts(table) {
  const total = db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL`).get().n;
  const published = db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL AND status = 'published'`)
    .get().n;
  const pending = db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL AND status = 'pending_review'`)
    .get().n;
  const offline = db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL AND status = 'offline'`)
    .get().n;
  const draft = db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deleted_at IS NULL AND status = 'draft'`)
    .get().n;
  return { total, published, pending, offline, draft };
}

manageRouter.get('/stats', (_req, res) => {
  const entries = contentCounts('edu_entries');
  const articles = contentCounts('edu_articles');
  const today = now().slice(0, 10);
  res.json({
    entries,
    articles,
    reads: {
      total: db.prepare('SELECT COUNT(*) AS n FROM edu_read_history').get().n,
      today: db.prepare('SELECT COUNT(*) AS n FROM edu_read_history WHERE read_at >= ?').get(today).n,
      readers: db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM edu_read_history').get().n,
    },
    favorites: {
      total: db.prepare('SELECT COUNT(*) AS n FROM edu_favorites').get().n,
      entries: db.prepare("SELECT COUNT(*) AS n FROM edu_favorites WHERE target_type = 'entry'").get().n,
      articles: db.prepare("SELECT COUNT(*) AS n FROM edu_favorites WHERE target_type = 'article'").get().n,
    },
    badges: db.prepare('SELECT COUNT(*) AS n FROM edu_badges').get().n,
    pendingReview: entries.pending + articles.pending,
    tasks: taskStats(),
  });
});

manageRouter.get('/audit', (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query, { pageSize: 20 });
  const action = String(req.query.action || '').trim();
  const targetType = String(req.query.targetType || '').trim();
  const where = [];
  const params = [];
  if (action) {
    where.push('action = ?');
    params.push(action);
  }
  if (targetType) {
    where.push('target_type = ?');
    params.push(targetType);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM edu_audit_logs ${clause}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM edu_audit_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      actorName: row.actor_name,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      detail: (() => {
        try {
          return JSON.parse(row.detail);
        } catch {
          return {};
        }
      })(),
      createdAt: row.created_at,
    })),
    total,
    page,
    pageSize,
  });
});

router.use('/review', reviewRouter);
router.use('/', manageRouter);

// ---------------------------------------------------------------------------
// 自动审批:仅自动通过待审内容;驳回需要人工理由,永不自动执行。
// ---------------------------------------------------------------------------
registerAutoApprover('education', ({ cutoff, actor }) => {
  let processed = 0;
  for (const type of CONTENT_TYPES) {
    const rows = db
      .prepare(
        `SELECT * FROM ${contentTable(type)}
         WHERE status = 'pending_review' AND deleted_at IS NULL
           AND submitted_at IS NOT NULL AND submitted_at <= ?
         ORDER BY submitted_at, id LIMIT 20`
      )
      .all(cutoff);
    for (const row of rows) {
      processed += safeAutoApprove('education', `${type}:${row.id}`, () => {
        reviewContent({ targetType: type, row, action: 'approve', note: '', actor, auto: true });
      });
    }
  }
  return processed;
});

export default router;