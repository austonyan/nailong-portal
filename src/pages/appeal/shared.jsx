// Shared bits for the appeal pages: status palettes, constants, date
// formatting and the common error toast mapper.
/* eslint-disable react/only-export-components */
import dayjs from 'dayjs';
import { toastError } from '../../components/toast.js';


// 状态标签配色(与全站语义表一致):待受理/待处理/补件/复核 → warm-peach-pink,
// 处理中 → app-blue,已受理 → app-teal,已完成/有效 → app-green,驳回/升级 → app-red,
// 草稿/已关闭/撤销/失效/未知 → brown。标签文字上不再出现 app-yellow / app-orange / default。
export const APPEAL_STATUS_COLORS = {
  draft: 'brown',
  pending_accept: 'warm-peach-pink',
  accepted: 'app-teal',
  processing: 'app-blue',
  supplement_required: 'warm-peach-pink',
  resolved: 'app-green',
  rejected: 'app-red',
  withdrawn: 'brown',
  closed: 'brown',
};

export const REVIEW_STATUS_COLORS = {
  pending: 'warm-peach-pink',
  reviewing: 'warm-peach-pink',
  completed: 'app-green',
};

export const COMPLAINT_STATUS_COLORS = {
  pending_accept: 'warm-peach-pink',
  processing: 'app-blue',
  replied: 'app-green',
  closed: 'brown',
};

export const TICKET_STATUS_COLORS = {
  pending: 'warm-peach-pink',
  processing: 'app-blue',
  replied: 'app-green',
  closed: 'brown',
  escalated: 'app-red',
};

export const DECISION_STATUS_COLORS = {
  valid: 'app-green',
  voided: 'brown',
  expired: 'brown',
};

export const DECISION_TYPE_COLORS = {
  maintain: 'app-blue',
  undo: 'brown',
  change: 'app-green',
  transfer: 'purple',
};

export const NOTICE_LEVEL_COLORS = {
  info: 'app-blue',
  policy: 'warm-peach-pink',
  event: 'app-pink',
};

export const PRIORITY_COLORS = {
  low: 'brown',
  normal: 'app-blue',
  high: 'app-red',
  urgent: 'app-red',
};

// 关联业务类型(与其他署联动,当前为预留)
export const BIZ_TYPES = ['visa', 'immigration', 'resident', 'diplomatic', 'document', 'archives', 'protocol'];
export const COMPLAINT_KINDS = ['complaint', 'suggestion'];
export const COMPLAINT_CATEGORIES = {
  complaint: ['attitude', 'process', 'notice', 'staff', 'system', 'other'],
  suggestion: ['feature', 'experience', 'content'],
};
export const TICKET_CATEGORIES = ['consult', 'account', 'bug'];
export const TICKET_PRIORITIES = ['low', 'normal', 'high'];
export const MATERIAL_KINDS = ['screenshot', 'proof', 'other'];

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD') : '-';
}

export function appealErrMsg(t, err) {
  return t(`api.${err?.code}`, { defaultValue: t('api.INTERNAL_ERROR') });
}

export function toastAppealError(t, err) {
  toastError(appealErrMsg(t, err));
}

// 可点击卡片是 div 上的 role="button":键盘 Enter/Space 与卡片点击走同一条路径,
// Space 必须 preventDefault,否则页面会跟着滚动。
export function activateByKey(event, action) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

// 库里没有多行输入;按 Input 的视觉语言用 token 自定义(与签注署一致)。
export function TextArea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`appeal-textarea ${className}`} {...rest} />;
}

// 复核窗口剩余天数(服务端下发 reviewDays,本地只做展示计算)
export function reviewDeadline(resolvedAt, reviewDays) {
  if (!resolvedAt) return null;
  return dayjs(resolvedAt).add(reviewDays || 15, 'day');
}
