// 奶龙国皇家文化旅游署 — user-facing endpoints.
// 浏览景点与文化内容(tour:portal)、打卡、收集册、徽章与个人聚合。
// /recs 只要求登录,供签注署页面展示旅游推荐。
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { ApiError, conflict } from '../http.js';
import { ensureTourismSchema } from './schema.js';
import {
  audit,
  countSiteCheckinsOn,
  countUserCheckins,
  countUserCheckinsOn,
  evaluateBadges,
  getConfigInt,
  getConfigNumber,
  makeUniqueNo,
  serializeArticle,
  serializeAttraction,
  serializeBadge,
  serializeCheckin,
  souvenirStamps,
  todayStr,
  userBadgeCount,
} from './util.js';
import { sendTourNotice } from './postal.js';

const router = Router();

ensureTourismSchema();

const ATTRACTION_TYPES = ['landmark', 'nature', 'culture', 'food'];
const ARTICLE_TYPES = ['festival', 'folk', 'world'];
const MAX_NOTE_LENGTH = 200;

function onlineAttraction(id) {
  const row = db
    .prepare("SELECT * FROM tour_attractions WHERE id = ? AND status = 'online' AND deleted_at IS NULL")
    .get(Number(id));
  if (!row) throw new ApiError(404, 'TOUR_ATTRACTION_NOT_FOUND', 'Attraction not found');
  return row;
}

function onlineArticle(id) {
  const row = db
    .prepare("SELECT * FROM tour_articles WHERE id = ? AND status = 'published' AND deleted_at IS NULL")
    .get(Number(id));
  if (!row) throw new ApiError(404, 'TOUR_ARTICLE_NOT_FOUND', 'Article not found');
  return row;
}

function rules() {
  return {
    dailyLimit: getConfigNumber('tour.daily_limit', 10),
    siteDailyLimit: getConfigInt('tour.site_daily_limit', 0),
  };
}

router.use(authenticate);

// ---------------------------------------------------------------------------
// 旅游推荐 — 登录用户即可(签注署页面侧展示用)
// ---------------------------------------------------------------------------

router.get('/recs', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM tour_attractions
       WHERE status = 'online' AND deleted_at IS NULL
       ORDER BY sort_order ASC, id ASC LIMIT 6`
    )
    .all();
  res.json({ items: rows.map(serializeAttraction) });
});

router.use(requirePermission('tour:portal'));

// ---------------------------------------------------------------------------
// 首页
// ---------------------------------------------------------------------------

router.get('/home', (req, res) => {
  const recommendations = db
    .prepare(
      `SELECT * FROM tour_attractions
       WHERE status = 'online' AND deleted_at IS NULL
       ORDER BY sort_order ASC, id ASC LIMIT 6`
    )
    .all();
  const festivals = db
    .prepare(
      `SELECT * FROM tour_articles
       WHERE status = 'published' AND type = 'festival' AND deleted_at IS NULL
       ORDER BY published_at DESC, id DESC LIMIT 3`
    )
    .all();
  const today = todayStr();
  res.json({
    recommendations: recommendations.map(serializeAttraction),
    festivals: festivals.map(serializeArticle),
    stats: {
      checkins: countUserCheckins(req.user.id),
      badges: userBadgeCount(req.user.id),
      stamps: souvenirStamps(req.user.id).length,
      todayCheckins: countUserCheckinsOn(req.user.id, today),
    },
    rules: rules(),
  });
});

// ---------------------------------------------------------------------------
// 景点
// ---------------------------------------------------------------------------

router.get('/attractions', (req, res) => {
  const type = String(req.query.type || '');
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(60, Math.max(1, Number(req.query.pageSize) || 12));
  const where = ["status = 'online'", 'deleted_at IS NULL'];
  const params = [];
  if (type && ATTRACTION_TYPES.includes(type)) {
    where.push('type = ?');
    params.push(type);
  }
  if (q) {
    where.push(
      '(name LIKE ? OR name_tw LIKE ? OR summary LIKE ? OR summary_tw LIKE ? OR description LIKE ? OR description_tw LIKE ?)'
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM tour_attractions WHERE ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT * FROM tour_attractions WHERE ${whereSql}
       ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  res.json({ items: rows.map(serializeAttraction), total, page, pageSize });
});

router.get('/attractions/:id', (req, res) => {
  const row = onlineAttraction(req.params.id);
  const myCheckinToday = !!db
    .prepare(
      'SELECT 1 FROM tour_checkins WHERE user_id = ? AND attraction_id = ? AND checkin_date = ? AND deleted_at IS NULL'
    )
    .get(req.user.id, row.id, todayStr());
  res.json({ attraction: { ...serializeAttraction(row), myCheckinToday } });
});

// 打卡:每用户每景点每日 1 次 + 后台可配的每日上限。
router.post('/attractions/:id/checkin', async (req, res) => {
  const row = onlineAttraction(req.params.id);
  if (row.open_state === 'closed') {
    throw conflict('TOUR_ATTRACTION_CLOSED', 'This attraction is currently closed for check-in');
  }
  const date = todayStr();
  const duplicate = db
    .prepare(
      'SELECT id FROM tour_checkins WHERE user_id = ? AND attraction_id = ? AND checkin_date = ? AND deleted_at IS NULL'
    )
    .get(req.user.id, row.id, date);
  if (duplicate) {
    throw conflict('TOUR_ALREADY_CHECKED_IN', 'You already checked in here today');
  }
  const dailyLimit = getConfigNumber('tour.daily_limit', 10);
  if (countUserCheckinsOn(req.user.id, date) >= dailyLimit) {
    throw new ApiError(429, 'TOUR_DAILY_LIMIT', 'Daily check-in limit reached');
  }
  const siteLimit = getConfigInt('tour.site_daily_limit', 0);
  if (siteLimit > 0 && countSiteCheckinsOn(date) >= siteLimit) {
    throw new ApiError(429, 'TOUR_SITE_LIMIT', 'Site-wide daily check-in limit reached');
  }
  const note = String(req.body?.note ?? '')
    .trim()
    .slice(0, MAX_NOTE_LENGTH);
  const no = makeUniqueNo('NLI', 'tour_checkins');
  let info;
  try {
    info = db
      .prepare(
        'INSERT INTO tour_checkins (no, user_id, attraction_id, checkin_date, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(no, req.user.id, row.id, date, note, now());
  } catch (err) {
    // UNIQUE(user_id, attraction_id, checkin_date) — two tabs racing each other.
    if (String(err?.code || '').startsWith('SQLITE_CONSTRAINT')) {
      throw conflict('TOUR_ALREADY_CHECKED_IN', 'You already checked in here today');
    }
    throw err;
  }
  audit(req.user.id, 'tour:checkin', 'attraction', row.no, { checkinNo: no });

  await sendTourNotice({
    userId: req.user.id,
    type: 'tour_checkin',
    params: {
      attractionName: row.name,
      attractionNameTw: row.name_tw,
      checkinNo: no,
      checkinDate: date,
    },
  });
  const newBadges = await evaluateBadges(req.user.id);

  const created = db
    .prepare(
      `SELECT c.*, a.no AS attraction_no, a.name AS attraction_name, a.name_tw AS attraction_name_tw, a.type AS attraction_type
       FROM tour_checkins c JOIN tour_attractions a ON a.id = c.attraction_id
       WHERE c.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json({
    checkin: serializeCheckin(created),
    newBadges,
    stats: {
      checkins: countUserCheckins(req.user.id),
      badges: userBadgeCount(req.user.id),
      todayCheckins: countUserCheckinsOn(req.user.id, date),
    },
  });
});

// ---------------------------------------------------------------------------
// 文化内容
// ---------------------------------------------------------------------------

router.get('/articles', (req, res) => {
  const type = String(req.query.type || '');
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(60, Math.max(1, Number(req.query.pageSize) || 12));
  const where = ["status = 'published'", 'deleted_at IS NULL'];
  const params = [];
  if (type && ARTICLE_TYPES.includes(type)) {
    where.push('type = ?');
    params.push(type);
  }
  if (q) {
    where.push('(title LIKE ? OR title_tw LIKE ? OR summary LIKE ? OR summary_tw LIKE ? OR body LIKE ? OR body_tw LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM tour_articles WHERE ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT * FROM tour_articles WHERE ${whereSql}
       ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  res.json({ items: rows.map(serializeArticle), total, page, pageSize });
});

router.get('/articles/:id', (req, res) => {
  res.json({ article: serializeArticle(onlineArticle(req.params.id)) });
});

// ---------------------------------------------------------------------------
// 收集册 — 我的打卡 + 入境纪念章(只读投影 im_entry_records)
// ---------------------------------------------------------------------------

router.get('/collection', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, a.no AS attraction_no, a.name AS attraction_name, a.name_tw AS attraction_name_tw, a.type AS attraction_type
       FROM tour_checkins c JOIN tour_attractions a ON a.id = c.attraction_id
       WHERE c.user_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC, c.id DESC`
    )
    .all(req.user.id);
  const stamps = souvenirStamps(req.user.id);
  const visited = new Set(rows.map((r) => r.attraction_id)).size;
  res.json({
    checkins: rows.map(serializeCheckin),
    stamps,
    counts: { checkins: rows.length, visited, stamps: stamps.length },
  });
});

// ---------------------------------------------------------------------------
// 成就徽章
// ---------------------------------------------------------------------------

router.get('/badges', (req, res) => {
  const total = countUserCheckins(req.user.id);
  const rows = db
    .prepare(
      `SELECT * FROM tour_badges
       WHERE enabled = 1 AND deleted_at IS NULL
       ORDER BY sort_order ASC, threshold ASC, id ASC`
    )
    .all();
  const awards = db
    .prepare('SELECT * FROM tour_badge_awards WHERE user_id = ? AND revoked_at IS NULL')
    .all(req.user.id);
  const awardedByBadge = new Map(awards.map((a) => [a.badge_id, a]));
  res.json({
    total,
    items: rows.map((badge) => {
      const award = awardedByBadge.get(badge.id);
      return {
        ...serializeBadge(badge),
        awarded: !!award,
        awardedAt: award?.awarded_at ?? null,
      };
    }),
  });
});

// ---------------------------------------------------------------------------
// 我的旅游 — 打卡 / 收集册 / 徽章聚合
// ---------------------------------------------------------------------------

router.get('/me', (req, res) => {
  const recentCheckins = db
    .prepare(
      `SELECT c.*, a.no AS attraction_no, a.name AS attraction_name, a.name_tw AS attraction_name_tw, a.type AS attraction_type
       FROM tour_checkins c JOIN tour_attractions a ON a.id = c.attraction_id
       WHERE c.user_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC, c.id DESC LIMIT 5`
    )
    .all(req.user.id);
  const badges = db
    .prepare(
      `SELECT b.*, aw.awarded_at
       FROM tour_badge_awards aw JOIN tour_badges b ON b.id = aw.badge_id
       WHERE aw.user_id = ? AND aw.revoked_at IS NULL
       ORDER BY aw.awarded_at DESC`
    )
    .all(req.user.id);
  const stamps = souvenirStamps(req.user.id);
  const checkins = countUserCheckins(req.user.id);
  const visited = db
    .prepare('SELECT COUNT(DISTINCT attraction_id) AS n FROM tour_checkins WHERE user_id = ? AND deleted_at IS NULL')
    .get(req.user.id).n;
  res.json({
    stats: { checkins, visited, badges: badges.length, stamps: stamps.length },
    recentCheckins: recentCheckins.map(serializeCheckin),
    badges: badges.map((row) => ({ ...serializeBadge(row), awardedAt: row.awarded_at })),
    stamps: stamps.slice(0, 6),
    rules: rules(),
    todayCheckins: countUserCheckinsOn(req.user.id, todayStr()),
  });
});

export default router;