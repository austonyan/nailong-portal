// Shared bits for the statistics-office pages: percentage formatting. Date
// formatting, the textarea and the error-toast mapper live in the shared
// modules and are only re-exported here, so office call sites stay unchanged.
import { toast, toastApiError } from '../../components/toast.js';

// 全站唯一的时间格式化实现(src/lib/date.js,带 isValid() 保护)。
export { fmtDate, fmtDateTime } from '../../lib/date.js';
// 全站唯一的多行输入框(src/components/TextArea.jsx)。
export { TextArea } from '../../components/TextArea.jsx';

// 所有提示统一委托给 src/components/toast.js(库自带的全局提示组件在 React 19 下会崩,
// 该词被 check:ui 全文匹配禁用,注释里也不写)。
export function toastStat(kind, message) {
  toast(kind, message);
}

export function toastStatError(t, err) {
  toastApiError(t, err);
}

// 百分比展示:0.7833 → 78%
export function pct(value) {
  if (value === null || value === undefined) return '-';
  return `${Math.round(value * 100)}%`;
}