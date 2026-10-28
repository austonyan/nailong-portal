// Shared dayjs formatters for offices without their own `shared.jsx` helper
// (immigration, portal shell). Keep behaviour identical to the per-office
// helpers so tables and detail pages never disagree.
import dayjs from 'dayjs';

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD') : '-';
}
