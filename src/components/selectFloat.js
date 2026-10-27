/**
 * animal-island-ui 的 Select 把选项面板渲染成触发器右侧的绝对定位浮层(left: 100%),
 * 并且只按视口宽度判断放左还是放右。放进卡片、表单、弹窗正文或抽屉里时,面板会被最近
 * 的 overflow 裁剪框切掉,选项点不到。
 *
 * 这里在库自己的 DOM 上做一层定位修正(不去改 node_modules):
 *   - 面板放到触发器正下方、左对齐,空间不够时翻到上方;
 *   - 宽高都收进最近一个裁剪祖先(overflow 非 visible 或带 clip-path)与视口的交集;
 *   - 高度不够时改为内部滚动,保证任何位置都能点到选项。
 *
 * 全站只装一次,任何页面的 <Select> 都自动生效,不需要改调用点。
 */

const LIST_SELECTOR = 'div[class*="animal-dropdown"]';
const TRIGGER_SELECTOR = '[class*="animal-trigger"]';
const GAP = 6;
const EDGE = 10;
const MIN_HEIGHT = 96;

let currentList = null;
let listObserver = null;
let scheduled = 0;

function clipsContent(element, style) {
  return (
    style.overflowX !== 'visible' ||
    style.overflowY !== 'visible' ||
    (style.clipPath && style.clipPath !== 'none')
  );
}

/** 视口与所有裁剪祖先(client box)的交集。 */
function getClipBox(element) {
  const view = document.documentElement;
  let left = 0;
  let top = 0;
  let right = view.clientWidth;
  let bottom = view.clientHeight;

  for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (!clipsContent(node, style)) continue;

    const rect = node.getBoundingClientRect();
    const boxLeft = rect.left + node.clientLeft;
    const boxTop = rect.top + node.clientTop;
    left = Math.max(left, boxLeft);
    top = Math.max(top, boxTop);
    right = Math.min(right, boxLeft + node.clientWidth);
    bottom = Math.min(bottom, boxTop + node.clientHeight);
  }

  return { left, top, right, bottom };
}

function place(list) {
  const wrapper = list.parentElement;
  const trigger = wrapper?.querySelector(TRIGGER_SELECTOR);
  if (!trigger) return;

  const triggerRect = trigger.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const box = getClipBox(list);

  const maxWidth = Math.max(160, box.right - box.left - EDGE * 2);
  const roomHeight = Math.max(MIN_HEIGHT, box.bottom - box.top - EDGE * 2);

  // 先给出上限再量自然尺寸,避免上一轮的高度限制影响测量。
  list.style.setProperty('--nl-select-max-width', `${Math.round(maxWidth)}px`);
  list.style.setProperty('--nl-select-max-height', `${Math.round(roomHeight)}px`);

  const naturalHeight = list.scrollHeight;
  const spaceBelow = box.bottom - EDGE - triggerRect.bottom - GAP;
  const spaceAbove = triggerRect.top - box.top - EDGE - GAP;

  let above = false;
  let height = naturalHeight;
  if (naturalHeight > spaceBelow) {
    if (naturalHeight <= spaceAbove) {
      above = true;
    } else if (spaceAbove > spaceBelow) {
      above = true;
      height = spaceAbove;
    } else {
      height = spaceBelow;
    }
  }
  height = Math.max(MIN_HEIGHT, Math.min(height, roomHeight));

  const width = Math.min(list.getBoundingClientRect().width || 0, maxWidth);
  let left = triggerRect.left;
  if (left + width > box.right - EDGE) left = box.right - EDGE - width;
  if (left < box.left + EDGE) left = box.left + EDGE;

  let top = above ? triggerRect.top - GAP - height : triggerRect.bottom + GAP;
  if (top < box.top + EDGE) top = box.top + EDGE;

  // 面板是 wrapper(position: relative)的子元素,坐标要换算成 wrapper 的 padding box 偏移。
  const originLeft = wrapperRect.left + wrapper.clientLeft;
  const originTop = wrapperRect.top + wrapper.clientTop;

  list.style.setProperty('--nl-select-left', `${Math.round(left - originLeft)}px`);
  list.style.setProperty('--nl-select-top', `${Math.round(top - originTop)}px`);
  list.style.setProperty('--nl-select-max-height', `${Math.round(height)}px`);
  list.dataset.nlFloat = above ? 'above' : 'below';
}

function observeList(list) {
  if (currentList === list) return;
  currentList = list;
  listObserver?.disconnect();
  listObserver = new MutationObserver(() => {
    if (currentList?.isConnected) place(currentList);
  });
  // 选项被搜索过滤或异步加载时高度会变,重新定位一次。
  listObserver.observe(list, { childList: true, subtree: true, characterData: true });
  place(list);
  window.requestAnimationFrame(() => {
    if (currentList === list) place(list);
  });
}

function reposition() {
  if (!currentList) return;
  if (!currentList.isConnected) {
    currentList = null;
    return;
  }
  if (scheduled) return;
  scheduled = window.requestAnimationFrame(() => {
    scheduled = 0;
    if (currentList?.isConnected) place(currentList);
  });
}

/** 收起面板:库监听 document 的 mousedown 判断"点到外面",派发一次空白 mousedown 即可。 */
function dismiss() {
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
}

export function installSelectFloat() {
  if (typeof document === 'undefined' || window.__nailongSelectFloat) return;
  window.__nailongSelectFloat = true;

  // 面板只在校验通过后才挂载,监听新增节点即可捕获"打开"这一刻。
  new MutationObserver((records) => {
    if (currentList && !currentList.isConnected) currentList = null;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.matches?.(LIST_SELECTOR)) {
          observeList(node);
          return;
        }
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // Esc 只收起当前面板:拦住事件,避免同一个 Esc 把外层弹窗也关掉。
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !currentList?.isConnected) return;
      const trigger = currentList.parentElement?.querySelector(TRIGGER_SELECTOR);
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      trigger?.focus?.();
    },
    true,
  );

  // 滚动时面板跟着触发器走,不再重新测量(否则会跳动或收缩);只在窗口尺寸变化时重排。
  window.addEventListener('resize', reposition);
}