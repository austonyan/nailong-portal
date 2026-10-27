// Shared bits for the statistics-office pages: date formatting, error toasts
// and the token-styled textarea (the library has no Textarea component).
import dayjs from 'dayjs';
import { toast, toastApiError } from '../../components/toast.js';

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD') : '-';
}

// 所有提示统一委托给 src/components/toast.js(库自带的全局提示组件在 React 19 下会崩,
// 该词被 check:ui 全文匹配禁用,注释里也不写)。
export function toastStat(kind, message) {
  toast(kind, message);
}

export function toastStatError(t, err) {
  toastApiError(t, err);
}

export function TextArea({ rows = 3, className = '', ...rest }) {
  return <textarea rows={rows} className={`stat-textarea ${className}`} {...rest} />;
}

// 百分比展示:0.7833 → 78%
export function pct(value) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value * 100)}%`;
}