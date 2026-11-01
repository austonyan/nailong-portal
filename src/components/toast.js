// 全站统一轻提示。
//
// 不要使用 animal-island-ui 的 imperative 通知 API:它从 react-dom 主入口取 createRoot,
// React 19 已把 createRoot 移到 react-dom/client,调用时会抛 TypeError,事件处理器
// 会停在提示这一行,导致后续关弹窗 / 刷新列表都不执行。这里用 DOM 实现,并且所有
// 步骤都包在 try/catch 里,保证提示失败也绝不影响调用方的业务逻辑。

const HOST_ATTR = 'data-app-toast-host';
const MAX_VISIBLE = 4;

function ensureHost() {
  let host = document.querySelector(`[${HOST_ATTR}]`);
  if (host) return host;
  host = document.createElement('div');
  host.setAttribute(HOST_ATTR, '');
  host.className = 'app-toast-host';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

/**
 * 显示一条轻提示;kind 决定配色与停留时长(error 5.2s,其余 3.2s)。
 * @param {'success'|'error'|'info'|'warning'} kind 提示类型
 * @param {string} message 已翻译好的文案
 * @returns {void}
 */
export function toast(kind, message) {
  if (typeof document === 'undefined' || message === null || message === undefined) return;
  try {
    const host = ensureHost();
    const el = document.createElement('div');
    el.className = `app-toast app-toast-${kind}`;
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.textContent = String(message);
    host.appendChild(el);
    while (host.childElementCount > MAX_VISIBLE) host.firstElementChild?.remove();
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(
      () => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 280);
      },
      kind === 'error' ? 5200 : 3200,
    );
  } catch {
    // 提示是增强,任何异常都不能打断调用方的事件处理
  }
}

/** 成功提示(3.2s 自动消失)。 */
export const toastSuccess = (message) => toast('success', message);
/** 错误提示(5.2s 自动消失,role=alert)。 */
export const toastError = (message) => toast('error', message);
/** 普通信息提示。 */
export const toastInfo = (message) => toast('info', message);
/** 警示提示。 */
export const toastWarning = (message) => toast('warning', message);

// 把 ApiError.code 映射到 api.* 文案。
// 服务端 message 是英文,绝不能直接展示给用户:未知错误码统一回退到通用错误文案,
// 原始 message 只留在控制台便于排查。
/**
 * 把 ApiError 的 code 映射成已翻译文案(不弹提示);未知错误码回退 `api.INTERNAL_ERROR`,
 * 原始英文 message 只写控制台。
 * @param {(key: string) => string} t react-i18next 的翻译函数
 * @param {{code?: string, message?: string}} err 接口错误
 * @returns {string} 可直接展示的本地化文案
 */
export function apiErrorMessage(t, err) {
  const code = err?.code;
  const key = `api.${code}`;
  const text = code ? t(key) : '';
  const known = !!text && text !== key;
  if (!known && (code || err?.message)) {
    console.warn('[api] unmapped error', code ?? '(no code)', err?.message ?? '');
  }
  return known ? text : t('api.INTERNAL_ERROR');
}

/**
 * 把接口错误映射成 `api.*` 文案并弹一条错误提示;各署 toastXxxError 都应直接委托给它。
 * @param {(key: string) => string} t react-i18next 的翻译函数
 * @param {{code?: string, message?: string}} err 接口错误
 * @returns {void}
 */
export function toastApiError(t, err) {
  toastError(apiErrorMessage(t, err));
}