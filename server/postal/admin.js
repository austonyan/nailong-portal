// 奶龙国皇家邮政与通信署 — admin API (post:manage): notices, notification
// templates, postcard moderation, statistics and audit.
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
  nextNoticeNo,
  pageParams,
  parseJson,
  serializeCardTemplate,
  serializeNoticeAdmin,
  serializePostcard,
  serializeTemplate,
} from './util.js';

ensurePostalSchema();

const router = Router();
router.use(authenticate, requirePermission('post:manage'));

const NOTICE_SELECT = `
  SELECT n.*,
         (SELECT COUNT(*) FROM post_messages m
           WHERE m.type = 'notice_published' AND m.params LIKE '%' || n.no || '%') AS notification_count
  FROM post_notices n
  WHERE n.deleted_at IS NULL`;

const ADMIN_POSTCARD_SELECT = `
  SELECT p.*,
         s.username AS sender_username, s.display_name AS sender_name,
         r.username AS recipient_username, r.display_name AS recipient_name,
         t.name AS template_name, t.name_tw AS template_name_tw, t.color AS template_color
  FROM post_postcards p
  JOIN users s ON s.id = p.sender_id
  JOIN users r ON r.id = p.recipient_id
  JOIN post_card_templates t ON t.id = p.template_id`;

function loadNotice(id) {
  return db.prepare(`${NOTICE_SELECT} AND n.id = ?`).get(Number(id));
}

function readNoticeInput(body, base = null) {
  const title = body?.title !== undefined ? String(body.title).trim().slice(0, 120) : base?.title;
  const bodyText = body?.body !== undefined ? String(body.body).trim().slice(0, 4000) : base?.body ?? '';
  const titleTw =
    body?.titleTw !== undefined ? String(body.titleTw ?? '').trim().slice(0, 120) || null : base?.title_tw ?? null;
  const bodyTw =
    body?.bodyTw !== undefined ? String(body.bodyTw ?? '').trim().slice(0, 4000) || null : base?.body_tw ?? null;
  const level =
    body?.level !== undefined && NOTICE_LEVELS.includes(body.level) ? body.level : base?.level ?? 'info';
  if (!title) throw badRequest('VALIDATION_ERROR', 'title is required');
  return { title, title_tw: titleTw, body: bodyText, body_tw: bodyTw, level };
}

// ---------------------------------------------------------------------------
// Notices — CRUD, publish / offline, bilingual
// ---------------------------------------------------------------------------

router.get('/notices', (req, res) => {
  const p = pageParams(req.query, { pageSize: 20 });
  const status = ['draft', 'published', 'offline'].includes(String(req.query.status)) ? String(req.query.status) : '';
  const q = String(req.query.q || '').trim();
  const where = [];
  const args = [];
  if (status) {
    where.push('n.status = ?');
    args.push(status);
  }
  if (q) {
    where.push("(n.title LIKE ? OR n.body LIKE ? OR n.no LIKE ? OR IFNULL(n.title_tw, '') LIKE ?)");
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  const extra = where.length ? ` AND ${where.join(' AND ')}` : '';
  const total = db
    .prepare(`SELECT COUNT(*) AS n FROM post_notices n WHERE n.deleted_at IS NULL${extra}`)
    .get(...args).n;
  const rows = db
    .prepare(`${NOTICE_SELECT}${extra} ORDER BY n.id DESC LIMIT ? OFFSET ?`)
    .all(...args, p.pageSize, p.offset);
  res.json({ items: rows.map(serializeNoticeAdmin), total, page: p.page, pageSize: p.pageSize });
});

router.post('/notices', (req, res) => {
  const fields = readNoticeInput(req.body);
  const ts = now();
  const no = nextNoticeNo();
  const info = db
    .prepare(
      `INSERT INTO post_notices (no, title, title_tw, body, body_tw, level, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
    )
    .run(no, fields.title, fields.title_tw, fields.body, fields.body_tw, fields.level, req.user.id, ts, ts);
  audit(req.user, 'notice_create', 'notice', no, { title: fields.title });
  res.status(201).json({ notice: serializeNoticeAdmin(loadNotice(info.lastInsertRowid)) });
});

router.patch('/notices/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM post_notices WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  const fields = readNoticeInput(req.body, row);
  db.prepare(
    'UPDATE post_notices SET title = ?, title_tw = ?, body = ?, body_tw = ?, level = ?, updated_at = ? WHERE id = ?'
  ).run(fields.title, fields.title_tw, fields.body, fields.body_tw, fields.level, now(), row.id);
  audit(req.user, 'notice_update', 'notice', row.no, {});
  res.json({ notice: serializeNoticeAdmin(loadNotice(row.id)) });
});

router.delete('/notices/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM post_notices WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  const ts = now();
  db.prepare('UPDATE post_notices SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, row.id);
  audit(req.user, 'notice_delete', 'notice', row.no, { title: row.title });
  res.json({ ok: true });
});

router.post('/notices/:id/publish', (req, res) => {
  const row = db.prepare('SELECT * FROM post_notices WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  if (row.status === 'published') throw conflict('POST_INVALID_STATE', 'Notice is already published');
  const ts = now();
  db.prepare("UPDATE post_notices SET status = 'published', published_at = ?, offline_at = NULL, updated_at = ? WHERE id = ?").run(
    ts,
    ts,
    row.id
  );

  // 给每个订阅者各发一条站内消息(source = postal,受通知偏好过滤)。
  const subscribers = db.prepare('SELECT user_id FROM post_subscriptions WHERE subscribed = 1').all();
  let notified = 0;
  for (const sub of subscribers) {
    const result = sendPostalMessage({
      userId: sub.user_id,
      source: 'postal',
      type: 'notice_published',
      params: { no: row.no, title: row.title, titleTw: row.title_tw ?? '', level: row.level },
    });
    if (result && result.id) notified += 1;
  }
  audit(req.user, 'notice_publish', 'notice', row.no, { notified, subscribers: subscribers.length });
  res.json({ notice: serializeNoticeAdmin(loadNotice(row.id)), notified });
});

router.post('/notices/:id/offline', (req, res) => {
  const row = db.prepare('SELECT * FROM post_notices WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  if (row.status === 'offline') throw conflict('POST_INVALID_STATE', 'Notice is already offline');
  const ts = now();
  db.prepare("UPDATE post_notices SET status = 'offline', offline_at = ?, updated_at = ? WHERE id = ?").run(ts, ts, row.id);
  audit(req.user, 'notice_offline', 'notice', row.no, {});
  res.json({ notice: serializeNoticeAdmin(loadNotice(row.id)) });
});

// ---------------------------------------------------------------------------
// Notification templates — type / bilingual title+body with {{vars}} / enable
// ---------------------------------------------------------------------------

router.get('/templates', (req, res) => {
  const q = String(req.query.q || '').trim();
  const where = ['deleted_at IS NULL'];
  const args = [];
  if (q) {
    where.push('(type LIKE ? OR title_template LIKE ? OR body_template LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  const rows = db
    .prepare(`SELECT * FROM post_templates WHERE ${where.join(' AND ')} ORDER BY source, type`)
    .all(...args);
  res.json({
    items: rows.map(serializeTemplate),
    sources: POSTAL_SOURCES,
  });
});

function readTemplateInput(body, base = null) {
  const source = body?.source !== undefined ? String(body.source).trim() : base?.source ?? 'postal';
  if (source !== '*' && !POSTAL_SOURCES.includes(source)) {
    throw badRequest('VALIDATION_ERROR', 'Unknown template source');
  }
  const type = body?.type !== undefined ? String(body.type).trim().slice(0, 60) : base?.type;
  if (!type || !/^[a-z0-9_]+$/.test(type)) throw badRequest('VALIDATION_ERROR', 'type must be snake_case');
  const titleTemplate =
    body?.titleTemplate !== undefined ? String(body.titleTemplate).trim().slice(0, 120) : base?.title_template;
  const titleTemplateTw =
    body?.titleTemplateTw !== undefined
      ? String(body.titleTemplateTw ?? '').trim().slice(0, 120) || null
      : base?.title_template_tw ?? null;
  const bodyTemplate =
    body?.bodyTemplate !== undefined ? String(body.bodyTemplate).trim().slice(0, 1000) : base?.body_template ?? '';
  const bodyTemplateTw =
    body?.bodyTemplateTw !== undefined
      ? String(body.bodyTemplateTw ?? '').trim().slice(0, 1000) || null
      : base?.body_template_tw ?? null;
  const variables =
    body?.variables !== undefined ? String(body.variables).trim().slice(0, 120) : base?.variables ?? '';
  const enabled = body?.enabled !== undefined ? (body.enabled ? 1 : 0) : base?.enabled ?? 1;
  if (!titleTemplate) throw badRequest('VALIDATION_ERROR', 'titleTemplate is required');
  return {
    source,
    type,
    title_template: titleTemplate,
    title_template_tw: titleTemplateTw,
    body_template: bodyTemplate,
    body_template_tw: bodyTemplateTw,
    variables,
    enabled,
  };
}

router.post('/templates', (req, res) => {
  const fields = readTemplateInput(req.body);
  const duplicate = db
    .prepare('SELECT * FROM post_templates WHERE source = ? AND type = ?')
    .get(fields.source, fields.type);
  if (duplicate) throw conflict('POST_TEMPLATE_DUPLICATE', 'A template already exists for this source and type');
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO post_templates (source, type, title_template, title_template_tw, body_template, body_template_tw, variables, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.source,
      fields.type,
      fields.title_template,
      fields.title_template_tw,
      fields.body_template,
      fields.body_template_tw,
      fields.variables,
      fields.enabled,
      ts,
      ts
    );
  audit(req.user, 'template_create', 'template', `${fields.source}:${fields.type}`, {});
  const row = db.prepare('SELECT * FROM post_templates WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ template: serializeTemplate(row) });
});

router.patch('/templates/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM post_templates WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Template not found');
  const fields = readTemplateInput(req.body, row);
  if (fields.source !== row.source || fields.type !== row.type) {
    const duplicate = db
      .prepare('SELECT id FROM post_templates WHERE source = ? AND type = ? AND id <> ?')
      .get(fields.source, fields.type, row.id);
    if (duplicate) throw conflict('POST_TEMPLATE_DUPLICATE', 'A template already exists for this source and type');
  }
  db.prepare(
    `UPDATE post_templates
     SET source = ?, type = ?, title_template = ?, title_template_tw = ?, body_template = ?, body_template_tw = ?, variables = ?, enabled = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    fields.source,
    fields.type,
    fields.title_template,
    fields.title_template_tw,
    fields.body_template,
    fields.body_template_tw,
    fields.variables,
    fields.enabled,
    now(),
    row.id
  );
  audit(req.user, 'template_update', 'template', `${fields.source}:${fields.type}`, { enabled: !!fields.enabled });
  const updated = db.prepare('SELECT * FROM post_templates WHERE id = ?').get(row.id);
  res.json({ template: serializeTemplate(updated) });
});

router.delete('/templates/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM post_templates WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Template not found');
  const ts = now();
  db.prepare('UPDATE post_templates SET deleted_at = ?, updated_at = ? WHERE id = ?').run(ts, ts, row.id);
  audit(req.user, 'template_delete', 'template', `${row.source}:${row.type}`, {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Postcard moderation — full list + takedown
// ---------------------------------------------------------------------------

router.get('/postcards', (req, res) => {
  const p = pageParams(req.query, { pageSize: 20 });
  const status = ['draft', 'sent', 'received', 'taken_down'].includes(String(req.query.status))
    ? String(req.query.status)
    : '';
  const q = String(req.query.q || '').trim();
  const where = [];
  const args = [];
  if (status) {
    where.push('p.status = ?');
    args.push(status);
  }
  if (q) {
    where.push(
      "(p.no LIKE ? OR p.blessing LIKE ? OR s.username LIKE ? OR s.display_name LIKE ? OR r.username LIKE ? OR r.display_name LIKE ?)"
    );
    const like = `%${q}%`;
    args.push(like, like, like, like, like, like);
  }
  const whereSql = where.length ? ` AND ${where.join(' AND ')}` : '';
  const total = db
    .prepare(
      `SELECT COUNT(*) AS n FROM post_postcards p
       JOIN users s ON s.id = p.sender_id JOIN users r ON r.id = p.recipient_id
       WHERE 1 = 1${whereSql}`
    )
    .get(...args).n;
  const rows = db
    .prepare(`${ADMIN_POSTCARD_SELECT} WHERE 1 = 1${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`)
    .all(...args, p.pageSize, p.offset);
  res.json({
    items: rows.map((row) => serializePostcard(row, 0)),
    total,
    page: p.page,
    pageSize: p.pageSize,
  });
});

router.post('/postcards/:id/takedown', (req, res) => {
  const row = db.prepare(`${ADMIN_POSTCARD_SELECT} WHERE p.id = ?`).get(Number(req.params.id));
  if (!row) throw notFound('Postcard not found');
  if (!['sent', 'received'].includes(row.status)) {
    throw conflict('POST_INVALID_STATE', 'Only sent postcards can be taken down');
  }
  const reason = readString(req.body?.reason, { name: 'reason', min: 2, max: 200 });
  const ts = now();
  db.prepare(
    "UPDATE post_postcards SET status = 'taken_down', takedown_reason = ?, taken_down_at = ?, taken_down_by = ?, updated_at = ? WHERE id = ?"
  ).run(reason, ts, req.user.id, ts, row.id);
  sendPostalMessage({
    userId: row.sender_id,
    source: 'postal',
    type: 'postcard_taken_down',
    params: { no: row.no, reason },
  });
  audit(req.user, 'postcard_takedown', 'postcard', row.no, { reason });
  const updated = db.prepare(`${ADMIN_POSTCARD_SELECT} WHERE p.id = ?`).get(row.id);
  res.json({ postcard: serializePostcard(updated, 0) });
});

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

router.get('/stats', (_req, res) => {
  const msgTotal = db.prepare('SELECT COUNT(*) AS n FROM post_messages').get().n;
  const msgRead = db.prepare('SELECT COUNT(*) AS n FROM post_messages WHERE read = 1').get().n;
  const msgUnread = db
    .prepare('SELECT COUNT(*) AS n FROM post_messages WHERE read = 0 AND archived = 0')
    .get().n;
  const msgArchived = db.prepare('SELECT COUNT(*) AS n FROM post_messages WHERE archived = 1').get().n;
  const readRate = msgTotal ? Math.round((msgRead / msgTotal) * 100) : 0;

  const bySource = db
    .prepare(
      `SELECT source, COUNT(*) AS total,
              SUM(CASE WHEN read = 0 AND archived = 0 THEN 1 ELSE 0 END) AS unread
       FROM post_messages GROUP BY source ORDER BY total DESC`
    )
    .all()
    .map((row) => ({ source: row.source, total: row.total, unread: row.unread || 0 }));

  const byType = db
    .prepare(
      `SELECT type, COUNT(*) AS total FROM post_messages GROUP BY type ORDER BY total DESC LIMIT 8`
    )
    .all();

  const today = now().slice(0, 10);
  const postcards = {
    total: db.prepare('SELECT COUNT(*) AS n FROM post_postcards').get().n,
    draft: db.prepare("SELECT COUNT(*) AS n FROM post_postcards WHERE status = 'draft'").get().n,
    sent: db.prepare("SELECT COUNT(*) AS n FROM post_postcards WHERE status = 'sent'").get().n,
    received: db.prepare("SELECT COUNT(*) AS n FROM post_postcards WHERE status = 'received'").get().n,
    takenDown: db.prepare("SELECT COUNT(*) AS n FROM post_postcards WHERE status = 'taken_down'").get().n,
    today: db
      .prepare('SELECT COUNT(*) AS n FROM post_postcards WHERE sent_at IS NOT NULL AND substr(sent_at, 1, 10) = ?')
      .get(today).n,
  };

  const notices = {
    total: db.prepare('SELECT COUNT(*) AS n FROM post_notices WHERE deleted_at IS NULL').get().n,
    published: db
      .prepare("SELECT COUNT(*) AS n FROM post_notices WHERE status = 'published' AND deleted_at IS NULL")
      .get().n,
    draft: db
      .prepare("SELECT COUNT(*) AS n FROM post_notices WHERE status = 'draft' AND deleted_at IS NULL")
      .get().n,
    offline: db
      .prepare("SELECT COUNT(*) AS n FROM post_notices WHERE status = 'offline' AND deleted_at IS NULL")
      .get().n,
  };

  res.json({
    messages: { total: msgTotal, read: msgRead, unread: msgUnread, archived: msgArchived, readRate },
    bySource,
    byType,
    postcards,
    notices,
    subscribers: db.prepare('SELECT COUNT(*) AS n FROM post_subscriptions WHERE subscribed = 1').get().n,
    templates: {
      total: db.prepare('SELECT COUNT(*) AS n FROM post_templates WHERE deleted_at IS NULL').get().n,
      enabled: db
        .prepare('SELECT COUNT(*) AS n FROM post_templates WHERE enabled = 1 AND deleted_at IS NULL')
        .get().n,
    },
  });
});

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

router.get('/audit', (req, res) => {
  const p = pageParams(req.query, { pageSize: 30 });
  const action = String(req.query.action || '').trim();
  const where = [];
  const args = [];
  if (action) {
    where.push('action LIKE ?');
    args.push(`%${action}%`);
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM post_audit_logs${whereSql}`).get(...args).n;
  const rows = db
    .prepare(`SELECT * FROM post_audit_logs${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, p.pageSize, p.offset);
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      detail: parseJson(row.detail, {}),
      createdAt: row.created_at,
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
  });
});

// 模板类型清单供管理端下拉提示(动态键由 SPA 的 post.msg.* 提供兜底文案)。
router.get('/message-types', (_req, res) => {
  const rows = db
    .prepare('SELECT DISTINCT type FROM post_messages ORDER BY type LIMIT 100')
    .all()
    .map((row) => row.type);
  res.json({ items: rows });
});

// ---------------------------------------------------------------------------
// Card templates — 用户写明信片时挑选的卡片款式。种子在 schema.js;管理端在此
// 新建 / 编辑 / 启停 / 删除(已被明信片引用的模板拒绝删除,保证历史数据可读)。
// ---------------------------------------------------------------------------

const CARD_SCENES = ['festival', 'scenery', 'daily'];
// 必须与库 Card 组件的 CardColor 类型一致(dist/types/components/Card/Card.d.ts),
// 否则用户端 Card color={tpl.color} 会落回默认配色。
const CARD_COLORS = [
  'app-pink',
  'purple',
  'app-blue',
  'app-yellow',
  'app-orange',
  'app-teal',
  'app-green',
  'app-red',
  'lime-green',
  'yellow-green',
  'brown',
  'warm-peach-pink',
];

function readCardTemplateInput(body, base = null) {
  const code = body?.code !== undefined ? String(body.code).trim().toUpperCase().slice(0, 40) : base?.code;
  if (!code || !/^[A-Z0-9_]+$/.test(code)) {
    throw badRequest('VALIDATION_ERROR', 'code must be UPPER_SNAKE_CASE');
  }
  const name = body?.name !== undefined ? String(body.name).trim().slice(0, 60) : base?.name;
  if (!name) throw badRequest('VALIDATION_ERROR', 'name is required');
  const nameTw =
    body?.nameTw !== undefined ? String(body.nameTw ?? '').trim().slice(0, 60) || null : base?.name_tw ?? null;
  let scene = base?.scene ?? 'festival';
  if (body?.scene !== undefined) {
    if (!CARD_SCENES.includes(body.scene)) throw badRequest('VALIDATION_ERROR', 'Unknown card scene');
    scene = body.scene;
  }
  let color = base?.color ?? 'app-teal';
  if (body?.color !== undefined) {
    if (!CARD_COLORS.includes(body.color)) throw badRequest('VALIDATION_ERROR', 'Unknown card color');
    color = body.color;
  }
  const description =
    body?.description !== undefined ? String(body.description).trim().slice(0, 200) : base?.description ?? '';
  const descriptionTw =
    body?.descriptionTw !== undefined
      ? String(body.descriptionTw ?? '').trim().slice(0, 200) || null
      : base?.description_tw ?? null;
  const sortOrderRaw = body?.sortOrder !== undefined ? Number(body.sortOrder) : base?.sort_order ?? 0;
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.min(9999, Math.max(0, Math.floor(sortOrderRaw))) : 0;
  const enabled = body?.enabled !== undefined ? (body.enabled ? 1 : 0) : base?.enabled ?? 1;
  return {
    code,
    name,
    name_tw: nameTw,
    scene,
    color,
    description,
    description_tw: descriptionTw,
    sort_order: sortOrder,
    enabled,
  };
}

router.get('/card-templates', (_req, res) => {
  const rows = db.prepare('SELECT * FROM post_card_templates ORDER BY sort_order, id').all();
  res.json({ items: rows.map(serializeCardTemplate) });
});

router.post('/card-templates', (req, res) => {
  const fields = readCardTemplateInput(req.body);
  if (db.prepare('SELECT id FROM post_card_templates WHERE code = ?').get(fields.code)) {
    throw conflict('POST_CARD_TEMPLATE_DUPLICATE', 'A card template with this code already exists');
  }
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO post_card_templates (code, name, name_tw, scene, color, description, description_tw, enabled, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.code,
      fields.name,
      fields.name_tw,
      fields.scene,
      fields.color,
      fields.description,
      fields.description_tw,
      fields.enabled,
      fields.sort_order,
      ts,
      ts
    );
  audit(req.user, 'card_template_create', 'card_template', fields.code, {});
  const row = db.prepare('SELECT * FROM post_card_templates WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ template: serializeCardTemplate(row) });
});

router.patch('/card-templates/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM post_card_templates WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Card template not found');
  const fields = readCardTemplateInput(req.body, row);
  if (fields.code !== row.code) {
    const dup = db
      .prepare('SELECT id FROM post_card_templates WHERE code = ? AND id <> ?')
      .get(fields.code, row.id);
    if (dup) throw conflict('POST_CARD_TEMPLATE_DUPLICATE', 'A card template with this code already exists');
  }
  db.prepare(
    `UPDATE post_card_templates
     SET code = ?, name = ?, name_tw = ?, scene = ?, color = ?, description = ?, description_tw = ?, enabled = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    fields.code,
    fields.name,
    fields.name_tw,
    fields.scene,
    fields.color,
    fields.description,
    fields.description_tw,
    fields.enabled,
    fields.sort_order,
    now(),
    row.id
  );
  audit(req.user, 'card_template_update', 'card_template', fields.code, { enabled: !!fields.enabled });
  const updated = db.prepare('SELECT * FROM post_card_templates WHERE id = ?').get(row.id);
  res.json({ template: serializeCardTemplate(updated) });
});

router.delete('/card-templates/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM post_card_templates WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Card template not found');
  const used = db.prepare('SELECT COUNT(*) AS n FROM post_postcards WHERE template_id = ?').get(row.id).n;
  if (used) {
    throw conflict('POST_CARD_TEMPLATE_IN_USE', 'Card template is referenced by postcards and cannot be deleted');
  }
  db.prepare('DELETE FROM post_card_templates WHERE id = ?').run(row.id);
  audit(req.user, 'card_template_delete', 'card_template', row.code, {});
  res.json({ ok: true });
});

export default router;