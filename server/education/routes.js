// 奶龙国皇家教育与科学署 — user-facing API (portal side).
//
// Everything here is guarded by edu:portal. Users only ever see `published`
// content; opening a detail writes one reading-history row, bumps the view
// counter and reconciles the reading tasks (badge + postal notification).
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { ApiError, notFound } from '../http.js';
import { ensureEducationSchema } from './schema.js';
import {
  serializeArticle,
  serializeBadge,
  serializeCategory,
  serializeEntry,
  syncUserTasks,
  taskOverview,
  relatedEntryIds,
} from './util.js';

ensureEducationSchema();

const router = Router();
router.use(authenticate, requirePermission('edu:portal'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entryBrief(row) {
  return {
    id: row.id,
    no: row.no,
    categoryCode: row.category_code,
    title: row.title,
    titleTw: row.title_tw,
    summary: row.summary,
    summaryTw: row.summary_tw,
  };
}

function articleBrief(row) {
  return {
    id: row.id,
    no: row.no,
    title: row.title,
    titleTw: row.title_tw,
    summary: row.summary,
    summaryTw: row.summary_tw,
  };
}

function taskBrief(task) {
  return {
    id: task.id,
    no: task.no,
    code: task.code,
    title: task.title,
    titleTw: task.title_tw,
    badgeName: task.badge_name,
    badgeNameTw: task.badge_name_tw,
  };
}

function publishedEntry(id) {
  const row = db.prepare('SELECT * FROM edu_entries WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  if (!row) throw notFound('Entry not found');
  if (row.status !== 'published') throw new ApiError(404, 'EDU_NOT_PUBLISHED', 'Entry is not published');
  return row;
}

function publishedArticle(id) {
  const row = db.prepare('SELECT * FROM edu_articles WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  if (!row) throw notFound('Article not found');
  if (row.status !== 'published') throw new ApiError(404, 'EDU_NOT_PUBLISHED', 'Article is not published');
  return row;
}

function isFavorited(userId, targetType, targetId) {
  return !!db
    .prepare('SELECT 1 FROM edu_favorites WHERE user_id = ? AND target_type = ? AND target_id = ?')
    .get(userId, targetType, targetId);
}

function recordRead(userId, targetType, row) {
  db.prepare(
    `INSERT INTO edu_read_history (user_id, target_type, target_id, target_no, title, title_tw, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, targetType, row.id, row.no, row.title, row.title_tw ?? null, now());
}

function toggleFavorite(userId, targetType, row) {
  const table = targetType === 'entry' ? 'edu_entries' : 'edu_articles';
  const toggle = db.transaction(() => {
    const existing = db
      .prepare('SELECT id FROM edu_favorites WHERE user_id = ? AND target_type = ? AND target_id = ?')
      .get(userId, targetType, row.id);
    if (existing) {
      db.prepare('DELETE FROM edu_favorites WHERE id = ?').run(existing.id);
      db.prepare(`UPDATE ${table} SET favorite_count = MAX(favorite_count - 1, 0) WHERE id = ?`).run(row.id);
      return false;
    }
    db.prepare('INSERT INTO edu_favorites (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)').run(
      userId,
      targetType,
      row.id,
      now()
    );
    db.prepare(`UPDATE ${table} SET favorite_count = favorite_count + 1 WHERE id = ?`).run(row.id);
    return true;
  });
  const favorited = toggle();
  const current = db.prepare(`SELECT favorite_count FROM ${table} WHERE id = ?`).get(row.id);
  return { favorited, favoriteCount: current?.favorite_count ?? 0 };
}

function historyItems(userId, limit, offset) {
  const rows = db
    .prepare('SELECT * FROM edu_read_history WHERE user_id = ? ORDER BY read_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(userId, limit, offset);
  const checkEntry = db.prepare(
    "SELECT status FROM edu_entries WHERE id = ? AND deleted_at IS NULL"
  );
  const checkArticle = db.prepare(
    "SELECT status FROM edu_articles WHERE id = ? AND deleted_at IS NULL"
  );
  return rows.map((row) => {
    const target = row.target_type === 'entry' ? checkEntry.get(row.target_id) : checkArticle.get(row.target_id);
    return {
      id: row.id,
      targetType: row.target_type,
      targetId: row.target_id,
      targetNo: row.target_no,
      title: row.title,
      titleTw: row.title_tw,
      readAt: row.read_at,
      available: target?.status === 'published',
    };
  });
}

function favoriteItems(userId) {
  const rows = db
    .prepare('SELECT * FROM edu_favorites WHERE user_id = ? ORDER BY created_at DESC, id DESC')
    .all(userId);
  const readEntry = db.prepare(
    "SELECT * FROM edu_entries WHERE id = ? AND deleted_at IS NULL AND status = 'published'"
  );
  const readArticle = db.prepare(
    "SELECT * FROM edu_articles WHERE id = ? AND deleted_at IS NULL AND status = 'published'"
  );
  const items = [];
  for (const row of rows) {
    const target = row.target_type === 'entry' ? readEntry.get(row.target_id) : readArticle.get(row.target_id);
    if (!target) continue;
    items.push({
      targetType: row.target_type,
      targetId: row.target_id,
      targetNo: target.no,
      title: target.title,
      titleTw: target.title_tw,
      summary: target.summary,
      summaryTw: target.summary_tw,
      favoritedAt: row.created_at,
    });
  }
  return items;
}

function badgeList(userId) {
  return db
    .prepare('SELECT * FROM edu_badges WHERE user_id = ? ORDER BY granted_at DESC, id DESC')
    .all(userId)
    .map(serializeBadge);
}

// ---------------------------------------------------------------------------
// Home / categories
// ---------------------------------------------------------------------------

router.get('/home', (req, res) => {
  const userId = req.user.id;
  syncUserTasks(userId);
  const entries = db
    .prepare(
      `SELECT * FROM edu_entries WHERE status = 'published' AND deleted_at IS NULL
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 4`
    )
    .all();
  const articles = db
    .prepare(
      `SELECT * FROM edu_articles WHERE status = 'published' AND deleted_at IS NULL
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 4`
    )
    .all();
  const categories = db
    .prepare('SELECT * FROM edu_categories WHERE enabled = 1 ORDER BY sort_order, id')
    .all()
    .map(serializeCategory);
  const counts = {
    entries: db
      .prepare("SELECT COUNT(*) AS n FROM edu_entries WHERE status = 'published' AND deleted_at IS NULL")
      .get().n,
    articles: db
      .prepare("SELECT COUNT(*) AS n FROM edu_articles WHERE status = 'published' AND deleted_at IS NULL")
      .get().n,
    reads: db.prepare('SELECT COUNT(*) AS n FROM edu_read_history WHERE user_id = ?').get(userId).n,
    favorites: db.prepare('SELECT COUNT(*) AS n FROM edu_favorites WHERE user_id = ?').get(userId).n,
    completedTasks: db
      .prepare("SELECT COUNT(*) AS n FROM edu_task_records WHERE user_id = ? AND status = 'completed'")
      .get(userId).n,
  };
  res.json({
    entries: entries.map(entryBrief),
    articles: articles.map(articleBrief),
    categories,
    tasks: taskOverview(userId),
    counts,
    badges: badgeList(userId).slice(0, 6),
  });
});

router.get('/categories', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM edu_categories WHERE enabled = 1 ORDER BY sort_order, id')
    .all();
  res.json({ items: rows.map(serializeCategory) });
});

// ---------------------------------------------------------------------------
// 百科词条
// ---------------------------------------------------------------------------

router.get('/entries', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12));
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const where = ["status = 'published'", 'deleted_at IS NULL'];
  const params = [];
  if (q) {
    where.push('(title LIKE ? OR summary LIKE ? OR body LIKE ? OR tags LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (category) {
    where.push('category_code = ?');
    params.push(category);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM edu_entries WHERE ${clause}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT * FROM edu_entries WHERE ${clause}
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  res.json({ items: rows.map(entryBrief), total, page, pageSize });
});

router.get('/entries/:id', (req, res) => {
  const userId = req.user.id;
  const row = publishedEntry(req.params.id);
  db.prepare('UPDATE edu_entries SET view_count = view_count + 1 WHERE id = ?').run(row.id);
  recordRead(userId, 'entry', row);
  const completed = syncUserTasks(userId);
  const related = db
    .prepare(
      `SELECT e.* FROM edu_entries e
       WHERE e.status = 'published' AND e.deleted_at IS NULL AND e.id != ?
         AND e.id IN (
           SELECT related_id FROM edu_entry_links WHERE entry_id = ?
           UNION
           SELECT entry_id FROM edu_entry_links WHERE related_id = ?
         )
       ORDER BY e.id LIMIT 6`
    )
    .all(row.id, row.id, row.id);
  res.json({
    entry: serializeEntry(row, {
      viewCount: row.view_count + 1,
      favorited: isFavorited(userId, 'entry', row.id),
      related: related.map(entryBrief),
      relatedIds: relatedEntryIds(row.id),
    }),
    tasksCompleted: completed.map(taskBrief),
  });
});

router.post('/entries/:id/favorite', (req, res) => {
  const row = publishedEntry(req.params.id);
  res.json(toggleFavorite(req.user.id, 'entry', row));
});

// ---------------------------------------------------------------------------
// 科普文章
// ---------------------------------------------------------------------------

router.get('/articles', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 12));
  const q = String(req.query.q || '').trim();
  const where = ["status = 'published'", 'deleted_at IS NULL'];
  const params = [];
  if (q) {
    where.push('(title LIKE ? OR summary LIKE ? OR body LIKE ? OR tags LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const clause = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM edu_articles WHERE ${clause}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT * FROM edu_articles WHERE ${clause}
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  res.json({ items: rows.map(articleBrief), total, page, pageSize });
});

router.get('/articles/:id', (req, res) => {
  const userId = req.user.id;
  const row = publishedArticle(req.params.id);
  db.prepare('UPDATE edu_articles SET view_count = view_count + 1 WHERE id = ?').run(row.id);
  recordRead(userId, 'article', row);
  const completed = syncUserTasks(userId);
  const someMore = db
    .prepare(
      `SELECT * FROM edu_articles WHERE status = 'published' AND deleted_at IS NULL AND id != ?
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 3`
    )
    .all(row.id);
  res.json({
    article: serializeArticle(row, {
      viewCount: row.view_count + 1,
      favorited: isFavorited(userId, 'article', row.id),
      more: someMore.map(articleBrief),
    }),
    tasksCompleted: completed.map(taskBrief),
  });
});

router.post('/articles/:id/favorite', (req, res) => {
  const row = publishedArticle(req.params.id);
  res.json(toggleFavorite(req.user.id, 'article', row));
});

// ---------------------------------------------------------------------------
// 阅读历史 / 收藏 / 学习任务 / 我的学习
// ---------------------------------------------------------------------------

router.get('/history', (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const total = db.prepare('SELECT COUNT(*) AS n FROM edu_read_history WHERE user_id = ?').get(req.user.id).n;
  res.json({
    items: historyItems(req.user.id, pageSize, (page - 1) * pageSize),
    total,
    page,
    pageSize,
  });
});

router.get('/favorites', (req, res) => {
  res.json({ items: favoriteItems(req.user.id) });
});

router.get('/tasks', (req, res) => {
  const userId = req.user.id;
  syncUserTasks(userId);
  res.json({ items: taskOverview(userId), badges: badgeList(userId) });
});

router.get('/my', (req, res) => {
  const userId = req.user.id;
  syncUserTasks(userId);
  res.json({
    history: historyItems(userId, 30, 0),
    favorites: favoriteItems(userId),
    badges: badgeList(userId),
    stats: {
      reads: db.prepare('SELECT COUNT(*) AS n FROM edu_read_history WHERE user_id = ?').get(userId).n,
      favorites: db.prepare('SELECT COUNT(*) AS n FROM edu_favorites WHERE user_id = ?').get(userId).n,
      completedTasks: db
        .prepare("SELECT COUNT(*) AS n FROM edu_task_records WHERE user_id = ? AND status = 'completed'")
        .get(userId).n,
      badges: db.prepare('SELECT COUNT(*) AS n FROM edu_badges WHERE user_id = ?').get(userId).n,
    },
  });
});

export default router;