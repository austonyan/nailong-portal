// 奶龙国皇家文化旅游署 — admin endpoints (tour:manage).
// 景点 / 文化内容 / 打卡规则 / 徽章(含发放记录与回收) / 统计 / 审计。
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, conflict, notFound, readString } from '../http.js';
import { ensureTourismSchema } from './schema.js';
import {
  audit,
  getConfigInt,
  getConfigNumber,
  makeUniqueNo,
  serializeArticle,
  serializeAttraction,
  serializeBadge,
  setConfig,
  todayStr,
} from './util.js';

const router = Router();

ensureTourismSchema();

const ATTRACTION_TYPES = ['landmark', 'nature', 'culture', 'food'];
const OPEN_STATES = ['open', 'limited', 'closed'];
const ATTRACTION_STATUSES = ['online', 'offline'];
const ARTICLE_TYPES = ['festival', 'folk', 'world'];
const ARTICLE_STATUSES = ['published', 'offline'];
const BADGE_ICON_NAMES = ['TrophyIcon', 'StarIcon', 'CompassIcon', 'MapIcon', 'CameraIcon', 'HeartIcon', 'FlagIcon'];

router.use(authenticate, requirePermission('tour:manage'));

// ---------------------------------------------------------------------------
// Input helpers — undefined means "keep the current value" on PATCH.
// ---------------------------------------------------------------------------

function requiredText(value, existing, max, name) {
  if (value === undefined && existing) return existing;
  return readString(value, { name, min: 1, max });
}

function optionalText(value, existing, max) {
  if (value === undefined) return existing ?? null;
  if (value === null) return null;
  const text = String(value).trim().slice(0, max);
  return text || null;
}

function optionalInt(value, existing, min, max, name) {
  if (value === undefined) return existing;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw badRequest('VALIDATION_ERROR', `${name} must be between ${min} and ${max}`);
  }
  return Math.floor(n);
}

function oneOf(value, existing, allowed, fallback, name) {
  if (value === undefined) return existing ?? fallback;
  const text = String(value);
  if (!allowed.includes(text)) throw badRequest('VALIDATION_ERROR', `Unknown ${name}`);
  return text;
}

function boolValue(value, existing, fallback = true) {
  if (value === undefined) return existing ?? (fallback ? 1 : 0);
  return value ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Attractions
// ---------------------------------------------------------------------------

function attractionRow(id) {
  return db.prepare('SELECT * FROM tour_attractions WHERE id = ? AND deleted_at IS NULL').get(Number(id)) || null;
}

function buildAttraction(body, row = null) {
  if (!body || typeof body !== 'object') throw badRequest('VALIDATION_ERROR', 'Body must be an object');
  return {
    name: requiredText(body.name, row?.name, 80, 'name'),
    name_tw: optionalText(body.nameTw, row?.name_tw, 80),
    summary: optionalText(body.summary, row?.summary, 200) ?? '',
    summary_tw: optionalText(body.summaryTw, row?.summary_tw, 200),
    description: optionalText(body.description, row?.description, 4000) ?? '',
    description_tw: optionalText(body.descriptionTw, row?.description_tw, 4000),
    checkin_points: optionalText(body.checkinPoints, row?.checkin_points, 1000) ?? '',
    checkin_points_tw: optionalText(body.checkinPointsTw, row?.checkin_points_tw, 1000),
    type: oneOf(body.type, row?.type, ATTRACTION_TYPES, 'landmark', 'attraction type'),
    open_state: oneOf(body.openState, row?.open_state, OPEN_STATES, 'open', 'open state'),
    status: oneOf(body.status, row?.status, ATTRACTION_STATUSES, 'online', 'attraction status'),
    sort_order: optionalInt(body.sortOrder, row?.sort_order ?? 0, 0, 9999, 'sortOrder'),
  };
}

router.get('/attractions', (req, res) => {
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').trim();
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (status && ATTRACTION_STATUSES.includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(name LIKE ? OR name_tw LIKE ? OR no LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const rows = db
    .prepare(`SELECT * FROM tour_attractions WHERE ${where.join(' AND ')} ORDER BY sort_order ASC, id ASC LIMIT 500`)
    .all(...params);
  res.json({ items: rows.map(serializeAttraction) });
});

router.post('/attractions', (req, res) => {
  const data = buildAttraction(req.body, null);
  const ts = now();
  const no = makeUniqueNo('NLV', 'tour_attractions');
  const info = db
    .prepare(
      `INSERT INTO tour_attractions
       (no, name, name_tw, summary, summary_tw, description, description_tw, type, open_state, status,
        checkin_points, checkin_points_tw, sort_order, created_at, updated_at)
       VALUES (@no, @name, @name_tw, @summary, @summary_tw, @description, @description_tw, @type, @open_state, @status,
        @checkin_points, @checkin_points_tw, @sort_order, @ts, @ts)`
    )
    .run({ ...data, no, ts });
  audit(req.user.id, 'tour:attraction_create', 'attraction', no, { name: data.name });
  res.status(201).json({ attraction: serializeAttraction(attractionRow(info.lastInsertRowid)) });
});

router.patch('/attractions/:id', (req, res) => {
  const row = attractionRow(req.params.id);
  if (!row) throw notFound('Attraction not found');
  const data = buildAttraction(req.body, row);
  db.prepare(
    `UPDATE tour_attractions SET
       name = @name, name_tw = @name_tw, summary = @summary, summary_tw = @summary_tw,
       description = @description, description_tw = @description_tw,
       type = @type, open_state = @open_state, status = @status,
       checkin_points = @checkin_points, checkin_points_tw = @checkin_points_tw,
       sort_order = @sort_order, updated_at = @ts
     WHERE id = @id AND deleted_at IS NULL`
  ).run({ ...data, id: row.id, ts: now() });
  audit(req.user.id, 'tour:attraction_update', 'attraction', row.no, { name: data.name });
  res.json({ attraction: serializeAttraction(attractionRow(row.id)) });
});

// 上下线 / 开放状态是一组高频动作,单独开一个端点给列表页按钮用。
router.patch('/attractions/:id/status', (req, res) => {
  const row = attractionRow(req.params.id);
  if (!row) throw notFound('Attraction not found');
  const status = oneOf(req.body?.status, row.status, ATTRACTION_STATUSES, 'online', 'attraction status');
  const openState = oneOf(req.body?.openState, row.open_state, OPEN_STATES, 'open', 'open state');
  db.prepare('UPDATE tour_attractions SET status = ?, open_state = ?, updated_at = ? WHERE id = ?').run(
    status,
    openState,
    now(),
    row.id
  );
  audit(req.user.id, status === 'online' ? 'tour:attraction_online' : 'tour:attraction_offline', 'attraction', row.no, {
    openState,
  });
  res.json({ attraction: serializeAttraction(attractionRow(row.id)) });
});

router.delete('/attractions/:id', (req, res) => {
  const row = attractionRow(req.params.id);
  if (!row) throw notFound('Attraction not found');
  db.prepare('UPDATE tour_attractions SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user.id, 'tour:attraction_delete', 'attraction', row.no, { name: row.name });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

function articleRow(id) {
  return db.prepare('SELECT * FROM tour_articles WHERE id = ? AND deleted_at IS NULL').get(Number(id)) || null;
}

function buildArticle(body, row = null) {
  if (!body || typeof body !== 'object') throw badRequest('VALIDATION_ERROR', 'Body must be an object');
  const status = oneOf(body.status, row?.status, ARTICLE_STATUSES, 'published', 'article status');
  return {
    title: requiredText(body.title, row?.title, 120, 'title'),
    title_tw: optionalText(body.titleTw, row?.title_tw, 120),
    summary: optionalText(body.summary, row?.summary, 300) ?? '',
    summary_tw: optionalText(body.summaryTw, row?.summary_tw, 300),
    body: optionalText(body.body, row?.body, 6000) ?? '',
    body_tw: optionalText(body.bodyTw, row?.body_tw, 6000),
    type: oneOf(body.type, row?.type, ARTICLE_TYPES, 'festival', 'article type'),
    status,
    published_at: row?.published_at ?? (status === 'published' ? now() : null),
  };
}

router.get('/articles', (req, res) => {
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').trim();
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (status && ARTICLE_STATUSES.includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(title LIKE ? OR title_tw LIKE ? OR no LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const rows = db
    .prepare(`SELECT * FROM tour_articles WHERE ${where.join(' AND ')} ORDER BY published_at DESC, id DESC LIMIT 500`)
    .all(...params);
  res.json({ items: rows.map(serializeArticle) });
});

router.post('/articles', (req, res) => {
  const data = buildArticle(req.body, null);
  const ts = now();
  const no = makeUniqueNo('NLH', 'tour_articles');
  const info = db
    .prepare(
      `INSERT INTO tour_articles
       (no, title, title_tw, summary, summary_tw, body, body_tw, type, status, published_at, created_at, updated_at)
       VALUES (@no, @title, @title_tw, @summary, @summary_tw, @body, @body_tw, @type, @status, @published_at, @ts, @ts)`
    )
    .run({ ...data, no, ts });
  audit(req.user.id, 'tour:article_create', 'article', no, { title: data.title });
  res.status(201).json({ article: serializeArticle(articleRow(info.lastInsertRowid)) });
});

router.patch('/articles/:id', (req, res) => {
  const row = articleRow(req.params.id);
  if (!row) throw notFound('Article not found');
  const data = buildArticle(req.body, row);
  db.prepare(
    `UPDATE tour_articles SET
       title = @title, title_tw = @title_tw, summary = @summary, summary_tw = @summary_tw,
       body = @body, body_tw = @body_tw, type = @type, status = @status,
       published_at = @published_at, updated_at = @ts
     WHERE id = @id AND deleted_at IS NULL`
  ).run({ ...data, id: row.id, ts: now() });
  audit(req.user.id, 'tour:article_update', 'article', row.no, { title: data.title });
  res.json({ article: serializeArticle(articleRow(row.id)) });
});

router.delete('/articles/:id', (req, res) => {
  const row = articleRow(req.params.id);
  if (!row) throw notFound('Article not found');
  db.prepare('UPDATE tour_articles SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user.id, 'tour:article_delete', 'article', row.no, { title: row.title });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Check-in rules
// ---------------------------------------------------------------------------

function currentConfig() {
  return {
    dailyLimit: getConfigNumber('tour.daily_limit', 10),
    siteDailyLimit: getConfigInt('tour.site_daily_limit', 0),
  };
}

router.get('/config', (_req, res) => {
  res.json({ config: currentConfig() });
});

router.patch('/config', (req, res) => {
  const dailyLimit = optionalInt(req.body?.dailyLimit, currentConfig().dailyLimit, 1, 100, 'dailyLimit');
  const siteDailyLimit = optionalInt(req.body?.siteDailyLimit, currentConfig().siteDailyLimit, 0, 100000, 'siteDailyLimit');
  setConfig('tour.daily_limit', dailyLimit);
  setConfig('tour.site_daily_limit', siteDailyLimit);
  audit(req.user.id, 'tour:config_update', 'config', 'rules', { dailyLimit, siteDailyLimit });
  res.json({ config: currentConfig() });
});

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function badgeRow(id) {
  return db.prepare('SELECT * FROM tour_badges WHERE id = ? AND deleted_at IS NULL').get(Number(id)) || null;
}

const BADGE_CODE_RE = /^[a-z][a-z0-9_]{1,31}$/;

function buildBadge(body, row = null) {
  if (!body || typeof body !== 'object') throw badRequest('VALIDATION_ERROR', 'Body must be an object');
  const code = row
    ? row.code
    : readString(body.code, { name: 'code', min: 2, max: 32 }).toLowerCase();
  if (!BADGE_CODE_RE.test(code)) {
    throw badRequest('VALIDATION_ERROR', 'code must be lowercase letters, digits or underscores');
  }
  return {
    code,
    name: requiredText(body.name, row?.name, 60, 'name'),
    name_tw: optionalText(body.nameTw, row?.name_tw, 60),
    description: optionalText(body.description, row?.description, 300) ?? '',
    description_tw: optionalText(body.descriptionTw, row?.description_tw, 300),
    icon: oneOf(body.icon, row?.icon, BADGE_ICON_NAMES, 'TrophyIcon', 'badge icon'),
    threshold: optionalInt(body.threshold, row?.threshold ?? 1, 1, 1000, 'threshold'),
    enabled: boolValue(body.enabled, row?.enabled, true),
    sort_order: optionalInt(body.sortOrder, row?.sort_order ?? 0, 0, 9999, 'sortOrder'),
  };
}

router.get('/badges', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM tour_badges WHERE deleted_at IS NULL ORDER BY sort_order ASC, threshold ASC, id ASC')
    .all();
  const awardCounts = new Map(
    db
      .prepare(
        `SELECT badge_id, COUNT(*) AS n FROM tour_badge_awards
         WHERE revoked_at IS NULL GROUP BY badge_id`
      )
      .all()
      .map((r) => [r.badge_id, r.n])
  );
  res.json({ items: rows.map((row) => ({ ...serializeBadge(row), awards: awardCounts.get(row.id) || 0 })) });
});

router.post('/badges', (req, res) => {
  const data = buildBadge(req.body, null);
  if (db.prepare('SELECT id FROM tour_badges WHERE code = ?').get(data.code)) {
    throw conflict('TOUR_DUPLICATE_BADGE_CODE', 'Badge code already exists');
  }
  const ts = now();
  const no = makeUniqueNo('NLB', 'tour_badges');
  const info = db
    .prepare(
      `INSERT INTO tour_badges
       (no, code, name, name_tw, description, description_tw, icon, threshold, enabled, sort_order, created_at, updated_at)
       VALUES (@no, @code, @name, @name_tw, @description, @description_tw, @icon, @threshold, @enabled, @sort_order, @ts, @ts)`
    )
    .run({ ...data, no, ts });
  audit(req.user.id, 'tour:badge_create', 'badge', no, { code: data.code, threshold: data.threshold });
  res.status(201).json({ badge: serializeBadge(badgeRow(info.lastInsertRowid)) });
});

router.patch('/badges/:id', (req, res) => {
  const row = badgeRow(req.params.id);
  if (!row) throw notFound('Badge not found');
  const data = buildBadge(req.body, row);
  db.prepare(
    `UPDATE tour_badges SET
       name = @name, name_tw = @name_tw, description = @description, description_tw = @description_tw,
       icon = @icon, threshold = @threshold, enabled = @enabled, sort_order = @sort_order, updated_at = @ts
     WHERE id = @id AND deleted_at IS NULL`
  ).run({ ...data, id: row.id, ts: now() });
  audit(req.user.id, 'tour:badge_update', 'badge', row.no, { threshold: data.threshold, enabled: !!data.enabled });
  res.json({ badge: serializeBadge(badgeRow(row.id)) });
});

router.delete('/badges/:id', (req, res) => {
  const row = badgeRow(req.params.id);
  if (!row) throw notFound('Badge not found');
  db.prepare('UPDATE tour_badges SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user.id, 'tour:badge_delete', 'badge', row.no, { code: row.code });
  res.json({ ok: true });
});

router.get('/awards', (req, res) => {
  const badgeId = Number(req.query.badgeId) || null;
  const where = [];
  const params = [];
  if (badgeId) {
    where.push('aw.badge_id = ?');
    params.push(badgeId);
  }
  const rows = db
    .prepare(
      `SELECT aw.*, b.no AS badge_no, b.code AS badge_code, b.name AS badge_name, b.name_tw AS badge_name_tw,
              u.username, u.display_name
       FROM tour_badge_awards aw
       JOIN tour_badges b ON b.id = aw.badge_id
       JOIN users u ON u.id = aw.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY aw.awarded_at DESC, aw.id DESC LIMIT 300`
    )
    .all(...params);
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      badgeId: row.badge_id,
      badgeNo: row.badge_no,
      badgeCode: row.badge_code,
      badgeName: row.badge_name,
      badgeNameTw: row.badge_name_tw,
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name,
      checkinCount: row.checkin_count,
      awardedAt: row.awarded_at,
      revokedAt: row.revoked_at,
      revokeReason: row.revoke_reason,
    })),
  });
});

router.post('/badges/:id/revoke', (req, res) => {
  const badge = badgeRow(req.params.id);
  if (!badge) throw notFound('Badge not found');
  const userId = Number(req.body?.userId);
  if (!userId) throw badRequest('VALIDATION_ERROR', 'userId is required');
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
    throw badRequest('VALIDATION_ERROR', 'Unknown user');
  }
  const award = db
    .prepare('SELECT * FROM tour_badge_awards WHERE badge_id = ? AND user_id = ?')
    .get(badge.id, userId);
  if (!award) throw conflict('TOUR_BADGE_NOT_AWARDED', 'This user has not received the badge');
  if (award.revoked_at) throw conflict('TOUR_BADGE_ALREADY_REVOKED', 'This award was already revoked');
  const reason = String(req.body?.reason ?? '')
    .trim()
    .slice(0, 200);
  db.prepare('UPDATE tour_badge_awards SET revoked_at = ?, revoked_by = ?, revoke_reason = ? WHERE id = ?').run(
    now(),
    req.user.id,
    reason,
    award.id
  );
  audit(req.user.id, 'tour:badge_revoke', 'badge', badge.no, { userId, reason });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Stats — simple COUNTs, no report engine.
// ---------------------------------------------------------------------------

router.get('/stats', (_req, res) => {
  const today = todayStr();
  const trendRows = db
    .prepare(
      `SELECT checkin_date AS day, COUNT(*) AS n FROM tour_checkins
       WHERE deleted_at IS NULL AND checkin_date >= date('now', '-6 day')
       GROUP BY checkin_date`
    )
    .all();
  const trendMap = new Map(trendRows.map((r) => [r.day, r.n]));
  const trend = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    trend.push({ day, checkins: trendMap.get(day) || 0 });
  }
  const topAttractions = db
    .prepare(
      `SELECT a.id, a.no, a.name, a.name_tw, COUNT(c.id) AS checkins
       FROM tour_attractions a
       LEFT JOIN tour_checkins c ON c.attraction_id = a.id AND c.deleted_at IS NULL
       WHERE a.deleted_at IS NULL
       GROUP BY a.id
       ORDER BY checkins DESC, a.id ASC LIMIT 5`
    )
    .all();
  res.json({
    attractions: {
      total: db.prepare('SELECT COUNT(*) AS n FROM tour_attractions WHERE deleted_at IS NULL').get().n,
      online: db.prepare("SELECT COUNT(*) AS n FROM tour_attractions WHERE status = 'online' AND deleted_at IS NULL").get().n,
    },
    articles: {
      total: db.prepare('SELECT COUNT(*) AS n FROM tour_articles WHERE deleted_at IS NULL').get().n,
      published: db.prepare("SELECT COUNT(*) AS n FROM tour_articles WHERE status = 'published' AND deleted_at IS NULL").get().n,
    },
    checkins: {
      total: db.prepare('SELECT COUNT(*) AS n FROM tour_checkins WHERE deleted_at IS NULL').get().n,
      today: db.prepare('SELECT COUNT(*) AS n FROM tour_checkins WHERE checkin_date = ? AND deleted_at IS NULL').get(today).n,
      users: db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM tour_checkins WHERE deleted_at IS NULL').get().n,
    },
    badges: {
      definitions: db.prepare('SELECT COUNT(*) AS n FROM tour_badges WHERE deleted_at IS NULL').get().n,
      awards: db.prepare('SELECT COUNT(*) AS n FROM tour_badge_awards WHERE revoked_at IS NULL').get().n,
      revoked: db.prepare('SELECT COUNT(*) AS n FROM tour_badge_awards WHERE revoked_at IS NOT NULL').get().n,
    },
    topAttractions: topAttractions.map((row) => ({
      id: row.id,
      no: row.no,
      name: row.name,
      nameTw: row.name_tw,
      checkins: row.checkins,
    })),
    trend,
  });
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

router.get('/audit', (req, res) => {
  const action = String(req.query.action || '').trim();
  const rows = action
    ? db
        .prepare('SELECT * FROM tour_audit_logs WHERE action LIKE ? ORDER BY id DESC LIMIT 200')
        .all(`%${action}%`)
    : db.prepare('SELECT * FROM tour_audit_logs ORDER BY id DESC LIMIT 200').all();
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      detail: row.detail,
      createdAt: row.created_at,
    })),
  });
});

export default router;