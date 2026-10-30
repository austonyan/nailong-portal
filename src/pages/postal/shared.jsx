// Shared bits for the postal-office pages: status palettes, date formatting,
// error toasts, the tokenized textarea and the message-text renderer.
/* eslint-disable react/only-export-components */
import dayjs from 'dayjs';
import { toastError } from '../../components/toast.js';

export const NOTICE_LEVELS = ['info', 'important', 'event'];
export const NOTICE_STATUSES = ['draft', 'published', 'offline'];
export const POSTCARD_STATUSES = ['draft', 'sent', 'received', 'taken_down'];

// 明信片卡款的场景与配色;配色必须与库 Card 组件的 CardColor 类型一致
// (dist/types/components/Card/Card.d.ts),并与 server/postal/admin.js 的白名单同步。
export const CARD_SCENES = ['festival', 'scenery', 'daily'];
export const CARD_COLORS = [
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

// The platform inbox is shared by every office; keep this list in sync with
// POSTAL_SOURCES in server/postal/util.js.
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

// 状态标签配色(与全站语义表一致):重要 → warm-peach-pink,草稿/失效 → brown,
// 已寄出(已提交)→ app-blue,已签收 → app-green,已下架 → app-red。
// 标签文字上不再出现 app-yellow / app-orange / lime-green / yellow-green / default。
export const NOTICE_LEVEL_COLORS = {
  info: 'app-blue',
  important: 'warm-peach-pink',
  event: 'app-pink',
};

export const NOTICE_STATUS_COLORS = {
  draft: 'brown',
  published: 'app-green',
  offline: 'brown',
};

export const POSTCARD_STATUS_COLORS = {
  draft: 'brown',
  sent: 'app-blue',
  received: 'app-green',
  taken_down: 'app-red',
};

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD') : '-';
}

export function postErrMsg(t, err) {
  const key = `api.${err?.code}`;
  const text = err?.code ? t(key) : '';
  return text && text !== key ? text : t('api.INTERNAL_ERROR');
}

// 全站统一提示(库的命令式通知 API 在 React 19 下会抛异常,不能用于关键流程)
export function toastPostError(t, err) {
  toastError(postErrMsg(t, err));
}

// 库里没有多行输入;按输入框的视觉语言用 --animal-* 令牌自定义。
export function PostTextarea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`post-textarea ${className}`} {...rest} />;
}

// 消息正文优先用管理端模板渲染结果(title/body 成对存在),否则按 post.msg.<type>
// 用 params 插值;未知 type 回退到通用文案。
function messageParams(params, language) {
  const out = { ...(params || {}) };
  if (language === 'zh-TW' && out.titleTw) out.title = out.titleTw;
  return out;
}

export function messageTitle(t, i18n, msg) {
  if (msg?.title && msg?.body) return msg.title;
  return t(`post.msg.${msg?.type}.title`, {
    defaultValue: t('post.msg.fallback.title'),
    ...messageParams(msg?.params, i18n.language),
  });
}

export function messageBody(t, i18n, msg) {
  if (msg?.title && msg?.body) return msg.body;
  return t(`post.msg.${msg?.type}.body`, {
    defaultValue: t('post.msg.fallback.body'),
    ...messageParams(msg?.params, i18n.language),
  });
}

export function sourceLabel(t, source) {
  return t(`post.source.${source}`, { defaultValue: t('common.unknown') });
}