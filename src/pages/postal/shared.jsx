// Shared bits for the postal-office pages: status palettes and the message-text
// renderer. Date formatting, the textarea and the error-toast mapper now live in
// the shared modules below and are only re-exported here (call sites unchanged).
/* eslint-disable react/only-export-components */
import { toastApiError } from '../../components/toast.js';

// 全站唯一的时间格式化实现(src/lib/date.js,带 isValid() 保护)。
export { fmtDate, fmtDateTime } from '../../lib/date.js';
// 全站唯一的多行输入框(src/components/TextArea.jsx)。
export { TextArea as PostTextarea } from '../../components/TextArea.jsx';

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

// 错误提示委托全站统一的 api.<code> 映射(未知码回退通用文案,不展示服务端英文)。
export function toastPostError(t, err) {
  toastApiError(t, err);
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