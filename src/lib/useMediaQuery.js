// 媒体查询 Hook:窄屏表格按列丢弃(≥5 列时用 useNarrow())与响应式排版共用一份实现。
// 走 useSyncExternalStore 订阅 matchMedia,而不是 effect 里 setState,避免多渲染一轮。
import { useCallback, useSyncExternalStore } from 'react';

const NARROW_QUERY = '(max-width: 640px)';

function getMatches(query) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

function subscribe(query, onStoreChange) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(query);
  mql.addEventListener('change', onStoreChange);
  return () => mql.removeEventListener('change', onStoreChange);
}

/**
 * 订阅一条 CSS 媒体查询,返回当前是否命中;环境不支持 matchMedia 时恒为 `false`。
 * @param {string} query 例如 `'(max-width: 640px)'`
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const subscribeToQuery = useCallback((onStoreChange) => subscribe(query, onStoreChange), [query]);
  const getSnapshot = useCallback(() => getMatches(query), [query]);
  return useSyncExternalStore(subscribeToQuery, getSnapshot, () => false);
}

/**
 * 是否为窄屏(`max-width: 640px`);供 Table 在窄屏丢弃非关键列使用。
 * @returns {boolean}
 */
export function useNarrow() {
  return useMediaQuery(NARROW_QUERY);
}

export default useMediaQuery;