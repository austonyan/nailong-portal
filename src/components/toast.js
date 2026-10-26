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

export const toastSuccess = (message) => toast('success', message);
export const toastError = (message) => toast('error', message);
export const toastInfo = (message) => toast('info', message);
export const toastWarning = (message) => toast('warning', message);

// 把 ApiError.code 映射到 api.* 文案,未知错误码回退到服务端 message。
export function toastApiError(t, err) {
  toastError(t(`api.${err?.code}`, { defaultValue: err?.message || t('api.INTERNAL_ERROR') }));
}