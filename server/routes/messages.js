// 跨署站内信聚合。
//
// 九个署各自有独立信箱表(字段不统一),这里只读合并、按用户权限过滤,
// 标记已读回写原表 —— 不改表结构、不做数据迁移,和各署自己的站内信页面
// 永远保持一致的状态。
//
// 特殊处理:
//   - arch_messages 没有 archived 列;
//   - 档案署同时会把通知镜像写进 post_messages(type 前缀 archives_),
//     聚合时排除该来源,避免同一条消息出现两次;
//   - post_messages 同时承载邮政/文旅/教育/统计四个来源,按 source 区分,
//     因此这三个署不需要自己的信箱表也能在统一入口看到消息。
import express from 'express';
import { authenticate } from '../auth.js';
import { forbidden, badRequest } from '../http.js';
import { db } from '../db.js';

const router = express.Router();

router.use(authenticate);

// 表名/列名全部来自这份白名单,不接受请求参数拼接。
const SOURCES = [
  { office: 'visa', table: 'visa_messages', permission: 'visa:apply', typeColumn: 'type', archived: true },
  { office: 'docs', table: 'doc_messages', permission: 'docs:apply', typeColumn: 'type', archived: true },
  { office: 'appeal', table: 'appeal_messages', permission: 'appeal:apply', typeColumn: 'type', archived: true },
  { office: 'archives', table: 'arch_messages', permission: 'arch:portal', typeColumn: 'type', archived: false },
  { office: 'immigration', table: 'im_messages', permission: 'imm:portal', typeColumn: 'template_code', archived: true },
  { office: 'dip', table: 'dip_messages', permission: 'dip:portal', typeColumn: 'template_code', archived: true },
  { office: 'resident', table: 'res_messages', permission: 'res:portal', typeColumn: 'template_code', archived: true },
  { office: 'protocol', table: 'pro_messages', permission: 'evt:portal', typeColumn: 'template_code', archived: true },
  {
    office: 'postal',
    table: 'post_messages',
    permission: 'post:portal',
    typeColumn: 'type',
    archived: true,
    extraWhere: "source <> 'archives'",
  },
];

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function accessibleSources(req) {
  const owned = new Set(req.user?.permissions ?? []);
  return SOURCES.filter((source) => owned.has(source.permission));
}

function serialize(source, row) {
  const item = {
    office: source.office,
    id: row.id,
    type: source.typeColumn === 'template_code' ? row.template_code : row.type,
    params: parseJson(row.params),
    read: !!row.read,
    createdAt: row.created_at,
  };
  if (row.source !== undefined) item.source = row.source;
  // 入境/外交/居民/礼宾(以及命中邮政模板的消息)由服务端渲染标题正文;
  // 带上 titleTw/bodyTw 让 localeMiddleware 按请求语言切换。
  if (row.title !== undefined) {
    item.title = row.title;
    item.titleTw = row.title_tw ?? null;
    item.body = row.body;
    item.bodyTw = row.body_tw ?? null;
  }
  return item;
}

function whereFor(source, userId, { unread = false } = {}) {
  const clauses = ['user_id = ?'];
  const args = [userId];
  if (source.archived) clauses.push('archived = 0');
  if (source.extraWhere) clauses.push(source.extraWhere);
  if (unread) clauses.push('read = 0');
  return { sql: clauses.join(' AND '), args };
}

function listSource(source, userId, { unread, limit }) {
  const where = whereFor(source, userId, { unread });
  return db
    .prepare(`SELECT * FROM ${source.table} WHERE ${where.sql} ORDER BY id DESC LIMIT ?`)
    .all(...where.args, limit)
    .map((row) => serialize(source, row));
}

function countUnread(source, userId) {
  const where = whereFor(source, userId, { unread: true });
  return db
    .prepare(`SELECT COUNT(*) AS n FROM ${source.table} WHERE ${where.sql}`)
    .get(...where.args).n;
}

function unreadSummary(sources, userId) {
  const byOffice = sources.map((source) => ({ office: source.office, unread: countUnread(source, userId) }));
  return { total: byOffice.reduce((sum, row) => sum + row.unread, 0), byOffice };
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function pickSource(req, office) {
  const sources = accessibleSources(req);
  if (!office) return null;
  const source = sources.find((item) => item.office === office);
  if (!source) throw forbidden('FORBIDDEN', `No inbox access for ${office}`);
  return source;
}

// GET /api/messages?status=all|unread&office=visa&limit=50
router.get('/', (req, res) => {
  const sources = accessibleSources(req);
  const status = req.query.status === 'unread' ? 'unread' : 'all';
  const limit = clampLimit(req.query.limit);
  const office = String(req.query.office || '').trim();
  pickSource(req, office); // 校验权限(未指定则跳过)

  const selected = office ? sources.filter((source) => source.office === office) : sources;
  const items = selected
    .flatMap((source) => listSource(source, req.user.id, { unread: status === 'unread', limit }))
    .sort((a, b) => (a.createdAt === b.createdAt
      ? `${b.office}:${b.id}`.localeCompare(`${a.office}:${a.id}`)
      : String(b.createdAt).localeCompare(String(a.createdAt))))
    .slice(0, limit);

  res.json({
    items,
    unread: unreadSummary(sources, req.user.id),
    offices: sources.map((source) => source.office),
  });
});

// GET /api/messages/unread —— 顶栏角标轮询
router.get('/unread', (req, res) => {
  res.json(unreadSummary(accessibleSources(req), req.user.id));
});

// POST /api/messages/read { office, id }
router.post('/read', (req, res) => {
  const office = String(req.body?.office || '').trim();
  const id = Number(req.body?.id);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('VALIDATION_ERROR', 'id is required');
  const source = pickSource(req, office);
  if (!source) throw badRequest('VALIDATION_ERROR', 'office is required');

  db.prepare(`UPDATE ${source.table} SET read = 1 WHERE id = ? AND user_id = ?`).run(id, req.user.id);
  res.json({ ok: true });
});

// POST /api/messages/read-all { office? }
router.post('/read-all', (req, res) => {
  const office = String(req.body?.office || '').trim();
  pickSource(req, office);
  const sources = office
    ? accessibleSources(req).filter((source) => source.office === office)
    : accessibleSources(req);

  let updated = 0;
  for (const source of sources) {
    const where = whereFor(source, req.user.id, { unread: true });
    updated += db
      .prepare(`UPDATE ${source.table} SET read = 1 WHERE ${where.sql}`)
      .run(...where.args).changes;
  }
  res.json({ ok: true, updated });
});

export default router;