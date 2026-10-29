// Shared dayjs formatters for offices without their own `shared.jsx` helper
// (immigration, portal shell). Keep behaviour identical to the per-office
// helpers so tables and detail pages never disagree.
import dayjs from 'dayjs';

// 无效输入(空值、脏数据)统一显示 '-';dayjs 默认会渲染英文 `Invalid Date`。
export function fmtDateTime(iso) {
  if (!iso) return '-';
  const value = dayjs(iso);
  return value.isValid() ? value.format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtDate(iso) {
  if (!iso) return '-';
  const value = dayjs(iso);
  return value.isValid() ? value.format('YYYY-MM-DD') : '-';
}