// 共享时间格式化(全站唯一实现)。
//
// 表格、详情、审核轨迹与消息一律使用这里的函数,不要在各署 shared.jsx 里再写
// fmtDate / fmtDateTime / fmtTime —— 那些副本都没有 isValid() 保护,脏数据会渲染成
// 英文 `Invalid Date`。对外统一格式:
//   日期 + 时间  YYYY-MM-DD HH:mm(浏览器本地时区)
//   仅日期       YYYY-MM-DD
//   仅时间       HH:mm
//   空值 / 非法值一律 '-'
import dayjs from 'dayjs';

/**
 * 把任意可解析的时间值格式化为本地时区的 `YYYY-MM-DD HH:mm`;空值或非法值返回 `-`。
 * @param {string|number|Date|object} value dayjs 可解析的时间值
 * @returns {string}
 */
export function fmtDateTime(value) {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '-';
}

/**
 * 把任意可解析的时间值格式化为本地时区的 `YYYY-MM-DD HH:mm:ss`;空值或非法值返回 `-`。
 * 只有需要秒级精度的场景(档案署审计记录/CSV 导出)才用,普通展示仍用 fmtDateTime。
 * @param {string|number|Date|object} value dayjs 可解析的时间值
 * @returns {string}
 */
export function fmtDateTimeSec(value) {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : '-';
}

/**
 * 把任意可解析的时间值格式化为本地时区的 `YYYY-MM-DD`;空值或非法值返回 `-`。
 * @param {string|number|Date|object} value dayjs 可解析的时间值
 * @returns {string}
 */
export function fmtDate(value) {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '-';
}

/**
 * 把任意可解析的时间值格式化为本地时区的 `HH:mm`;空值或非法值返回 `-`。
 * @param {string|number|Date|object} value dayjs 可解析的时间值
 * @returns {string}
 */
export function fmtTime(value) {
  if (!value) return '-';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('HH:mm') : '-';
}

// 页面历史上从各署 shared.jsx 导入 exportCsv;按规范保留 `src/lib/date.js` 这一
// 导入路径可用(实现住在 src/lib/csv.js,这里只再导出,不产生第二份拷贝)。
export { exportCsv, downloadDataUrl } from './csv.js';