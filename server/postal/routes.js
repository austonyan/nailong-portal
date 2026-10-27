// 奶龙国皇家邮政与通信署 — user-facing API: message centre, notice
// subscription / preferences and virtual postcards.
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, conflict, notFound, readString } from '../http.js';
import { ensurePostalSchema } from './schema.js';
import { sendPostalMessage } from './notify.js';
import {
  NOTICE_LEVELS,
  POSTAL_SOURCES,
  audit,
  getSettingInt,
  nextPostcardNo,
  pageParams,
  serializeCardTemplate,
  serializeMessage,
  serializeNotice,
  serializePostcard,
  todayStamp,
} from './util.js';

ensurePostalSchema();

const router = Router();

// The postal office is a portal service: every user with post:portal may use it.
router.use(authenticate, requirePermission('post:portal'));

const POSTCARD_SELECT = `
  SELECT p.*,
         s.username AS sender_username, s.display_name AS sender_name,
         r.username AS recipient_username, r.display_name AS recipient_name,
         t.name AS template_name, t.name_tw AS template_name_tw, t.color AS template_color
  FROM post_postcards p
  JOIN users s ON s.id = p.sender_id
  JOIN users r ON r.id = p.recipient_id
  JOIN post_card_templates t ON t.id = p.template_id`;

function loadPostcard(id) {
  return db.prepare(`${POSTCARD_SELECT} WHERE p.id = ?`).get(Number(id));
}

function postcardDetail(row, viewerId) {
  if (!row) return null;
  return {
    ...serializePostcard(row, viewerId),
    template: serializeCardTemplate(db.prepare('SELECT * FROM post_card_templates WHERE id = ?').get(row.template_id)),
  };
}

function unreadCount(userId) {
  return db
    .prepare('SELECT COUNT(*) AS n FROM post_messages WHERE user_id = ? AND archived = 0 AND read = 0')
    .get(userId).n;
}

function subscriptionRow(userId) {
  return db.prepare('SELECT * FROM post_subscriptions WHERE user_id = ?').get(userId);
}

function preferenceMap(userId) {
  const rows = db.prepare('SELECT source, enabled FROM post_preferences WHERE user_id = ?').all(userId);
  const map = {};
  for (const row of rows) map[row.source] = !!row.enabled;
  return map;
}

function sentTodayCount(userId) {
  return db
    .prepare(
      "SELECT COUNT(*) AS n FROM post_postcards WHERE sender_id = ? AND sent_at IS NOT NULL AND substr(sent_at, 1, 10) = ?"
    )
    .get(userId, todayStamp()).n;
}

function assertPostcardQuota(userId) {
  const limit = getSettingInt('postcard_daily_limit', 10);
  if (sentTodayCount(userId) >= limit) {
    throw conflict('POST_DAILY_LIMIT', `Daily postcard limit reached (${limit})`);
  }
  return limit;
}

function findPostcardForViewer(id, userId) {
  const row = loadPostcard(id);
  if (!row) throw notFound('Postcard not found');
  const isSender = row.sender_id === userId;
  const isRecipient = row.recipient_id === userId;
  if (!isSender && !isRecipient) throw notFound('Postcard not found');
  if (isSender && row.sender_hidden_at) throw notFound('Postcard not found');
  if (isRecipient && row.recipient_hidden_at) throw notFound('Postcard not found');
  return row;
}

// ---------------------------------------------------------------------------
// Home aggregate
// ---------------------------------------------------------------------------

router.get('/home', (req, res) => {
  const notices = db
    .prepare(
      "SELECT * FROM post_notices WHERE status = 'published' AND deleted_at IS NULL ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT 5"
    )
    .all()
    .map(serializeNotice);
  const templates = db
    .prepare('SELECT * FROM post_card_templates WHERE enabled = 1 ORDER BY sort_order, id')
    .all()
    .map(serializeCardTemplate);
  const recent = db
    .prepare(
      `${POSTCARD_SELECT}
       WHERE p.recipient_id = ? AND p.recipient_hidden_at IS NULL AND p.status IN ('sent', 'received')
       ORDER BY p.id DESC LIMIT 3`
    )
    .all(req.user.id)
    .map((row) => serializePostcard(row, req.user.id));
  const limit = getSettingInt('postcard_daily_limit', 10);
  res.json({
    notices,
    templates,
    recentPostcards: recent,
    unread: unreadCount(req.user.id),
    subscribed: !!subscriptionRow(req.user.id)?.subscribed,
    dailyLimit: limit,
    usedToday: sentTodayCount(req.user.id),
  });
});

// ---------------------------------------------------------------------------
// Notices — published only for portal users
// ---------------------------------------------------------------------------

router.get('/notices', (req, res) => {
  const p = pageParams(req.query, { pageSize: 10 });
  const level = NOTICE_LEVELS.includes(String(req.query.level)) ? String(req.query.level) : '';
  const q = String(req.query.q || '').trim();
  const where = ["status = 'published'", 'deleted_at IS NULL'];
  const args = [];
  if (level) {
    where.push('level = ?');
    args.push(level);
  }
  if (q) {
    where.push("(title LIKE ? OR body LIKE ? OR IFNULL(title_tw, '') LIKE ? OR IFNULL(body_tw, '') LIKE ?)");
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM post_notices WHERE ${whereSql}`).get(...args).n;
  const rows = db
    .prepare(
      `SELECT * FROM post_notices WHERE ${whereSql}
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...args, p.pageSize, p.offset);
  res.json({ items: rows.map(serializeNotice), total, page: p.page, pageSize: p.pageSize });
});

router.get('/notices/:id', (req, res) => {
  const row = db
    .prepare("SELECT * FROM post_notices WHERE id = ? AND status = 'published' AND deleted_at IS NULL")
    .get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  res.json({ notice: serializeNotice(row) });
});

// ---------------------------------------------------------------------------
// Subscription + per-office notification preferences
// ---------------------------------------------------------------------------

router.get('/subscription', (req, res) => {
  res.json({
    subscribed: !!subscriptionRow(req.user.id)?.subscribed,
    preferences: preferenceMap(req.user.id),
    sources: POSTAL_SOURCES,
  });
});

router.put('/subscription', (req, res) => {
  const subscribed = req.body?.subscribed === true || req.body?.subscribed === 1;
  const ts = now();
  const existing = subscriptionRow(req.user.id);
  if (existing) {
    db.prepare('UPDATE post_subscriptions SET subscribed = ?, updated_at = ? WHERE user_id = ?').run(
      subscribed ? 1 : 0,
      ts,
      req.user.id
    );
  } else {
    db.prepare(
      'INSERT INTO post_subscriptions (user_id, subscribed, created_at, updated_at) VALUES (?, ?, ?, ?)'
    ).run(req.user.id, subscribed ? 1 : 0, ts, ts);
  }
  audit(req.user, subscribed ? 'subscribe_notice' : 'unsubscribe_notice', 'user', req.user.id, {});
  sendPostalMessage({
    userId: req.user.id,
    source: 'postal',
    type: subscribed ? 'subscription_confirmed' : 'subscription_cancelled',
    params: {},
  });
  res.json({ subscribed });
});

router.put('/preferences', (req, res) => {
  const source = String(req.body?.source || '');
  if (!POSTAL_SOURCES.includes(source)) throw badRequest('VALIDATION_ERROR', 'Unknown notification source');
  if (req.body?.enabled === undefined) throw badRequest('VALIDATION_ERROR', 'enabled is required');
  const enabled = req.body.enabled === true || req.body.enabled === 1;
  db.prepare(
    `INSERT INTO post_preferences (user_id, source, enabled, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id, source) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`
  ).run(req.user.id, source, enabled ? 1 : 0, now());
  audit(req.user, 'update_preference', 'user', req.user.id, { source, enabled });
  res.json({ source, enabled });
});

// ---------------------------------------------------------------------------
// Message centre — filter, search, mark read, archive
// ---------------------------------------------------------------------------

router.get('/messages', (req, res) => {
  const p = pageParams(req.query, { pageSize: 20 });
  const archived = req.query.box === 'archived' ? 1 : 0;
  const status = ['unread', 'read'].includes(String(req.query.status)) ? String(req.query.status) : 'all';
  const source = POSTAL_SOURCES.includes(String(req.query.source)) ? String(req.query.source) : '';
  const q = String(req.query.q || '').trim();

  const where = ['user_id = ?', 'archived = ?'];
  const args = [req.user.id, archived];
  if (status === 'unread') where.push('read = 0');
  if (status === 'read') where.push('read = 1');
  if (source) {
    where.push('source = ?');
    args.push(source);
  }
  if (q) {
    where.push("(type LIKE ? OR source LIKE ? OR IFNULL(title, '') LIKE ? OR IFNULL(body, '') LIKE ? OR params LIKE ?)");
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS n FROM post_messages WHERE ${whereSql}`).get(...args).n;
  const rows = db
    .prepare(`SELECT * FROM post_messages WHERE ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, p.pageSize, p.offset);

  const sources = db
    .prepare(
      `SELECT source, COUNT(*) AS total,
              SUM(CASE WHEN read = 0 AND archived = 0 THEN 1 ELSE 0 END) AS unread
       FROM post_messages WHERE user_id = ? GROUP BY source ORDER BY total DESC`
    )
    .all(req.user.id)
    .map((row) => ({ source: row.source, total: row.total, unread: row.unread || 0 }));

  res.json({
    items: rows.map(serializeMessage),
    total,
    page: p.page,
    pageSize: p.pageSize,
    unread: unreadCount(req.user.id),
    sources,
  });
});

function markMessages(userId, ids, action) {
  const setSql = {
    read: 'read = 1',
    unread: 'read = 0',
    archive: 'archived = 1, read = 1',
    unarchive: 'archived = 0',
  }[action];
  if (!setSql) throw badRequest('VALIDATION_ERROR', 'Unknown action');
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(`UPDATE post_messages SET ${setSql} WHERE user_id = ? AND id IN (${placeholders})`)
    .run(userId, ...ids).changes;
}

router.post('/messages/bulk', (req, res) => {
  const action = String(req.body?.action || '');
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200)
    : [];
  if (!ids.length) throw badRequest('VALIDATION_ERROR', 'ids is required');
  const updated = markMessages(req.user.id, ids, action);
  res.json({ ok: true, updated });
});

router.post('/messages/read-all', (req, res) => {
  const info = db
    .prepare('UPDATE post_messages SET read = 1 WHERE user_id = ? AND archived = 0 AND read = 0')
    .run(req.user.id);
  res.json({ ok: true, updated: info.changes });
});

router.post('/messages/archive-all', (req, res) => {
  const info = db
    .prepare('UPDATE post_messages SET archived = 1, read = 1 WHERE user_id = ? AND archived = 0')
    .run(req.user.id);
  res.json({ ok: true, updated: info.changes });
});

router.post('/messages/:id/read', (req, res) => {
  db.prepare('UPDATE post_messages SET read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/unread', (req, res) => {
  db.prepare('UPDATE post_messages SET read = 0 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/archive', (req, res) => {
  db.prepare('UPDATE post_messages SET archived = 1, read = 1 WHERE id = ? AND user_id = ?').run(
    Number(req.params.id),
    req.user.id
  );
  res.json({ ok: true });
});

router.post('/messages/:id/unarchive', (req, res) => {
  db.prepare('UPDATE post_messages SET archived = 0 WHERE id = ? AND user_id = ?').run(
    Number(req.params.id),
    req.user.id
  );
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Recipient search — only id / username / display name are exposed. The
// platform user directory (/api/users) stays behind users:read.
// ---------------------------------------------------------------------------

router.get('/recipients', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 40);
  if (!q) return res.json({ items: [] });
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT id, username, display_name FROM users
       WHERE status = 'active' AND id <> ? AND (username LIKE ? OR display_name LIKE ?)
       ORDER BY id LIMIT 8`
    )
    .all(req.user.id, like, like);
  res.json({
    items: rows.map((row) => ({ id: row.id, username: row.username, displayName: row.display_name })),
  });
});

// ---------------------------------------------------------------------------
// Virtual postcards — draft → sent → received (admin may take down)
// ---------------------------------------------------------------------------

router.get('/card-templates', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM post_card_templates WHERE enabled = 1 ORDER BY sort_order, id')
    .all();
  res.json({ items: rows.map(serializeCardTemplate) });
});

router.get('/postcards', (req, res) => {
  const p = pageParams(req.query, { pageSize: 12 });
  const box = ['inbox', 'sent', 'favorites'].includes(String(req.query.box)) ? String(req.query.box) : 'inbox';
  const where = [];
  const args = [req.user.id];
  if (box === 'sent') {
    where.push('p.sender_id = ?', 'p.sender_hidden_at IS NULL');
    where.push("p.status IN ('draft', 'sent', 'received', 'taken_down')");
  } else if (box === 'favorites') {
    where.push('p.recipient_id = ?', 'p.recipient_hidden_at IS NULL', 'p.favorited = 1');
    where.push("p.status IN ('sent', 'received')");
  } else {
    where.push('p.recipient_id = ?', 'p.recipient_hidden_at IS NULL');
    where.push("p.status IN ('sent', 'received')");
  }
  const whereSql = where.join(' AND ');
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM post_postcards p WHERE ${whereSql}`)
    .get(...args).n;
  const rows = db
    .prepare(`${POSTCARD_SELECT} WHERE ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`)
    .all(...args, p.pageSize, p.offset);

  const counts = {
    inbox: db
      .prepare(
        "SELECT COUNT(*) AS n FROM post_postcards WHERE recipient_id = ? AND recipient_hidden_at IS NULL AND status IN ('sent', 'received')"
      )
      .get(req.user.id).n,
    unopened: db
      .prepare(
        "SELECT COUNT(*) AS n FROM post_postcards WHERE recipient_id = ? AND recipient_hidden_at IS NULL AND status = 'sent'"
      )
      .get(req.user.id).n,
    sent: db
      .prepare(
        "SELECT COUNT(*) AS n FROM post_postcards WHERE sender_id = ? AND sender_hidden_at IS NULL AND status IN ('draft', 'sent', 'received', 'taken_down')"
      )
      .get(req.user.id).n,
    favorites: db
      .prepare(
        "SELECT COUNT(*) AS n FROM post_postcards WHERE recipient_id = ? AND recipient_hidden_at IS NULL AND favorited = 1 AND status IN ('sent', 'received')"
      )
      .get(req.user.id).n,
  };

  res.json({
    box,
    items: rows.map((row) => serializePostcard(row, req.user.id)),
    total,
    page: p.page,
    pageSize: p.pageSize,
    counts,
    dailyLimit: getSettingInt('postcard_daily_limit', 10),
    usedToday: sentTodayCount(req.user.id),
  });
});

router.get('/postcards/:id', (req, res) => {
  const row = findPostcardForViewer(Number(req.params.id), req.user.id);
  if (row.status === 'taken_down' && row.recipient_id === req.user.id) {
    throw badRequest('POST_CARD_TAKEN_DOWN', 'This postcard was taken down');
  }
  res.json({ postcard: postcardDetail(row, req.user.id) });
});

function readPostcardInput(body) {
  const templateCode = String(body?.templateCode || '').trim();
  const template = db.prepare('SELECT * FROM post_card_templates WHERE code = ? AND enabled = 1').get(templateCode);
  if (!template) throw badRequest('POST_CARD_TEMPLATE_UNAVAILABLE', 'Unknown or disabled card template');
  const blessing = readString(body?.blessing, { name: 'blessing', min: 1, max: 200 });
  const recipientId = Number(body?.recipientId);
  const recipient = db
    .prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
    .get(Number.isInteger(recipientId) ? recipientId : 0);
  if (!recipient) throw badRequest('POST_RECIPIENT_INVALID', 'Unknown recipient');
  return { template, blessing, recipientId: recipient.id };
}

router.post('/postcards', (req, res) => {
  const { template, blessing, recipientId } = readPostcardInput(req.body);
  if (recipientId === req.user.id) throw badRequest('POST_SELF_SEND', 'Cannot send a postcard to yourself');

  const sendNow = req.body?.send === true || req.body?.send === 1;
  if (sendNow) assertPostcardQuota(req.user.id);

  const ts = now();
  const no = nextPostcardNo();
  const info = db
    .prepare(
      `INSERT INTO post_postcards (no, sender_id, recipient_id, template_id, template_code, blessing, status, sent_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      no,
      req.user.id,
      recipientId,
      template.id,
      template.code,
      blessing,
      sendNow ? 'sent' : 'draft',
      sendNow ? ts : null,
      ts,
      ts
    );

  if (sendNow) {
    sendPostalMessage({
      userId: recipientId,
      source: 'postal',
      type: 'postcard_received',
      params: { no, from: req.user.display_name || req.user.username, blessing },
    });
  }
  audit(req.user, sendNow ? 'postcard_send' : 'postcard_draft', 'postcard', no, {
    templateCode: template.code,
    recipientId,
  });
  const row = loadPostcard(info.lastInsertRowid);
  res.status(201).json({ postcard: postcardDetail(row, req.user.id) });
});

router.patch('/postcards/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM post_postcards WHERE id = ?').get(Number(req.params.id));
  if (!row || row.sender_id !== req.user.id || row.sender_hidden_at) throw notFound('Postcard not found');
  if (row.status !== 'draft') throw conflict('POST_INVALID_STATE', 'Only drafts can be edited');

  let templateId = row.template_id;
  let templateCode = row.template_code;
  if (req.body?.templateCode !== undefined) {
    const template = db
      .prepare('SELECT * FROM post_card_templates WHERE code = ? AND enabled = 1')
      .get(String(req.body.templateCode || '').trim());
    if (!template) throw badRequest('POST_CARD_TEMPLATE_UNAVAILABLE', 'Unknown or disabled card template');
    templateId = template.id;
    templateCode = template.code;
  }
  const blessing =
    req.body?.blessing !== undefined
      ? readString(req.body.blessing, { name: 'blessing', min: 1, max: 200 })
      : row.blessing;
  let recipientId = row.recipient_id;
  if (req.body?.recipientId !== undefined) {
    const next = Number(req.body.recipientId);
    const recipient = db
      .prepare("SELECT id FROM users WHERE id = ? AND status = 'active'")
      .get(Number.isInteger(next) ? next : 0);
    if (!recipient) throw badRequest('POST_RECIPIENT_INVALID', 'Unknown recipient');
    if (recipient.id === req.user.id) throw badRequest('POST_SELF_SEND', 'Cannot send a postcard to yourself');
    recipientId = recipient.id;
  }
  db.prepare(
    'UPDATE post_postcards SET template_id = ?, template_code = ?, blessing = ?, recipient_id = ?, updated_at = ? WHERE id = ?'
  ).run(templateId, templateCode, blessing, recipientId, now(), row.id);
  audit(req.user, 'postcard_update', 'postcard', row.no, { templateCode });
  res.json({ postcard: postcardDetail(loadPostcard(row.id), req.user.id) });
});

router.post('/postcards/:id/send', (req, res) => {
  const row = db.prepare('SELECT * FROM post_postcards WHERE id = ?').get(Number(req.params.id));
  if (!row || row.sender_id !== req.user.id || row.sender_hidden_at) throw notFound('Postcard not found');
  if (row.status !== 'draft') throw conflict('POST_INVALID_STATE', 'Only drafts can be sent');
  assertPostcardQuota(req.user.id);
  const ts = now();
  db.prepare("UPDATE post_postcards SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, row.id);
  sendPostalMessage({
    userId: row.recipient_id,
    source: 'postal',
    type: 'postcard_received',
    params: { no: row.no, from: req.user.display_name || req.user.username, blessing: row.blessing },
  });
  audit(req.user, 'postcard_send', 'postcard', row.no, {});
  res.json({ postcard: postcardDetail(loadPostcard(row.id), req.user.id) });
});

router.post('/postcards/:id/receive', (req, res) => {
  const row = db.prepare('SELECT * FROM post_postcards WHERE id = ?').get(Number(req.params.id));
  if (!row || row.recipient_id !== req.user.id || row.recipient_hidden_at) throw notFound('Postcard not found');
  if (row.status === 'taken_down') throw badRequest('POST_CARD_TAKEN_DOWN', 'This postcard was taken down');
  if (row.status === 'received') {
    return res.json({ postcard: postcardDetail(loadPostcard(row.id), req.user.id) });
  }
  if (row.status !== 'sent') throw conflict('POST_INVALID_STATE', 'Only sent postcards can be received');
  const ts = now();
  db.prepare("UPDATE post_postcards SET status = 'received', received_at = ?, updated_at = ? WHERE id = ?").run(
    ts,
    ts,
    row.id
  );
  audit(req.user, 'postcard_receive', 'postcard', row.no, {});
  res.json({ postcard: postcardDetail(loadPostcard(row.id), req.user.id) });
});

router.post('/postcards/:id/favorite', (req, res) => {
  const row = db.prepare('SELECT * FROM post_postcards WHERE id = ?').get(Number(req.params.id));
  if (!row || row.recipient_id !== req.user.id || row.recipient_hidden_at) throw notFound('Postcard not found');
  if (!['sent', 'received'].includes(row.status)) {
    throw conflict('POST_INVALID_STATE', 'Only received postcards can be favorited');
  }
  const next = req.body?.favorited === undefined ? (row.favorited ? 0 : 1) : req.body.favorited ? 1 : 0;
  db.prepare('UPDATE post_postcards SET favorited = ?, favored_at = ?, updated_at = ? WHERE id = ?').run(
    next,
    next ? now() : null,
    now(),
    row.id
  );
  audit(req.user, next ? 'postcard_favorite' : 'postcard_unfavorite', 'postcard', row.no, {});
  res.json({ favorited: !!next });
});

router.delete('/postcards/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM post_postcards WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Postcard not found');
  const ts = now();
  if (row.sender_id === req.user.id) {
    db.prepare('UPDATE post_postcards SET sender_hidden_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, row.id);
  } else if (row.recipient_id === req.user.id) {
    db.prepare('UPDATE post_postcards SET recipient_hidden_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, row.id);
  } else {
    throw notFound('Postcard not found');
  }
  audit(req.user, 'postcard_delete', 'postcard', row.no, {});
  res.json({ ok: true });
});

export default router;