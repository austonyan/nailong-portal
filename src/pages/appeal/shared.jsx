// Shared bits for the appeal pages: status palettes, constants, date
// formatting and the common error toast mapper.
import dayjs from 'dayjs';
import { toastError } from '../../components/toast.js';


export const APPEAL_STATUS_COLORS = {
  draft: 'default',
  pending_accept: 'app-yellow',
  accepted: 'app-blue',
  processing: 'app-blue',
  supplement_required: 'app-orange',
  resolved: 'app-green',
  rejected: 'app-red',
  withdrawn: 'brown',
  closed: 'default',
};

export const REVIEW_STATUS_COLORS = {
  pending: 'app-yellow',
  reviewing: 'app-blue',
  completed: 'app-green',
};

export const COMPLAINT_STATUS_COLORS = {
  pending_accept: 'app-yellow',
  processing: 'app-blue',
  replied: 'app-green',
  closed: 'default',
};

export const TICKET_STATUS_COLORS = {
  pending: 'app-yellow',
  processing: 'app-blue',
  replied: 'app-green',
  closed: 'default',
  escalated: 'app-red',
};

export const DECISION_STATUS_COLORS = {
  valid: 'app-green',
  voided: 'app-red',
  expired: 'brown',
};

export const DECISION_TYPE_COLORS = {
  maintain: 'app-blue',
  undo: 'app-orange',
  change: 'app-green',
  transfer: 'purple',
};

export const NOTICE_LEVEL_COLORS = {
  info: 'app-blue',
  policy: 'app-yellow',
  event: 'app-pink',
};

export const PRIORITY_COLORS = {
  low: 'default',
  normal: 'app-blue',
  high: 'app-orange',
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
  return t(`api.${err?.code}`, { defaultValue: err?.message || t('api.INTERNAL_ERROR') });
}

export function toastAppealError(t, err) {
  toastError(appealErrMsg(t, err));
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
