// 奶龙国皇家邮政与通信署 — shared server-side helpers: numbering, audit,
// message-template rendering, paging and serializers.
//
// The postal office owns the platform-wide message inbox (post_messages).
// Content is stored as `type` + JSON `params`; the SPA renders it through the
// `post.msg.*` i18n keys, so both Chinese locales stay in the translation
// resources instead of the database.
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

// 编号形态:{前缀}{YYYYMMDD}-{6 位随机},例:NLM20261027-7KQ2AB
function dateStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM post_settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function getSettingInt(key, fallback) {
  const value = Number(getSetting(key));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function nextNo(prefixKey, fallbackPrefix, table, column) {
  const prefix = getSetting(prefixKey, fallbackPrefix);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = `${prefix}${dateStamp()}-${randomCode(6)}`;
    if (!db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).get(no)) return no;
  }
  throw new Error('cannot generate postal number');
}

export const nextPostcardNo = () => nextNo('post.postcard_prefix', 'NLM', 'post_postcards', 'no');
export const nextNoticeNo = () => nextNo('post.notice_prefix', 'NLQ', 'post_notices', 'no');

// ---------------------------------------------------------------------------
// Audit — every sensitive admin action leaves a trail.
// ---------------------------------------------------------------------------

export function audit(actor, action, targetType = '', targetId = '', detail = {}) {
  const actorId = typeof actor === 'object' ? actor?.id : actor;
  let actorName = typeof actor === 'object' ? actor?.display_name || actor?.displayName || actor?.name || '' : '';
  if (!actorName && actorId) {
    const row = db.prepare('SELECT display_name FROM users WHERE id = ?').get(actorId);
    actorName = row?.display_name ?? '';
  }
  db.prepare(
    'INSERT INTO post_audit_logs (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(actorId ?? null, actorName, action, targetType, String(targetId ?? ''), JSON.stringify(detail), now());
}

// {{var}} substitution for admin-editable notification templates.
export function renderTemplate(text, vars = {}) {
  return String(text ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export const POSTAL_SOURCES = [
  'postal',
  'visa',
  'immigration',
  'diplomacy',
  'resident',
  'protocol',
  'docs',
  'appeal',
  'tourism',
  'archives',
  'stats',
  'education',
  'system',
];

export const NOTICE_LEVELS = ['info', 'important', 'event'];
export const NOTICE_STATUSES = ['draft', 'published', 'offline'];
export const POSTCARD_STATUSES = ['draft', 'sent', 'received', 'taken_down'];

export function parseJson(text, fallback = {}) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

export function pageParams(query, defaults = {}) {
  const page = Math.max(1, Number(query?.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize) || defaults.pageSize || 10));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

// UTC date stamp used for the per-user daily postcard quota.
export const todayStamp = () => now().slice(0, 10);

// ---------------------------------------------------------------------------
// Serializers — base value plus its `*Tw` sibling; server/locale.js swaps the
// pair per request so zh-TW callers get Traditional content and admins still
// receive the Simplified source as `fieldCn`.
// ---------------------------------------------------------------------------

export function serializeNotice(row) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    title: row.title,
    titleTw: row.title_tw,
    body: row.body,
    bodyTw: row.body_tw,
    level: row.level,
    status: row.status,
    publishedAt: row.published_at,
    offlineAt: row.offline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeNoticeAdmin(row) {
  const base = serializeNotice(row);
  if (!base) return null;
  return { ...base, notificationCount: row.notification_count ?? 0 };
}

export function serializeMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    type: row.type,
    params: parseJson(row.params, {}),
    title: row.title,
    titleTw: row.title_tw,
    body: row.body,
    bodyTw: row.body_tw,
    read: !!row.read,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

export function serializeTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    source: row.source,
    type: row.type,
    titleTemplate: row.title_template,
    titleTemplateTw: row.title_template_tw,
    bodyTemplate: row.body_template,
    bodyTemplateTw: row.body_template_tw,
    variables: row.variables,
    enabled: !!row.enabled,
    updatedAt: row.updated_at,
  };
}

export function serializeCardTemplate(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameTw: row.name_tw,
    scene: row.scene,
    color: row.color,
    description: row.description,
    descriptionTw: row.description_tw,
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
  };
}

// 明信片:发件人/收件人昵称是用户自由填写的文本,不做机翻,因此不带 *_tw 别名。
export function serializePostcard(row, viewerId) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    senderId: row.sender_id,
    senderName: row.sender_name ?? '',
    senderUsername: row.sender_username ?? '',
    recipientId: row.recipient_id,
    recipientName: row.recipient_name ?? '',
    recipientUsername: row.recipient_username ?? '',
    templateId: row.template_id,
    templateCode: row.template_code,
    templateName: row.template_name ?? row.template_code,
    templateNameTw: row.template_name_tw,
    templateColor: row.template_color ?? 'default',
    blessing: row.blessing,
    status: row.status,
    favorited: !!row.favorited,
    direction: Number(row.sender_id) === Number(viewerId) ? 'sent' : 'inbox',
    sentAt: row.sent_at,
    receivedAt: row.received_at,
    takedownReason: row.takedown_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}