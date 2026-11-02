// 页面数据加载失败的常驻提示条。
//
// 背景:各页原先在 catch 里 toast 一下就 setItems([]),表格随即渲染成
// 「没有记录」——加载失败和真的没有数据在界面上无法区分(DESIGN.md 明令禁止)。
// 这里把失败状态收到外壳层:页面只负责 report(err, load),由 AppLayout 在
// <main> 顶部显示一条常驻错误卡并给出重试;页面不再清空已有数据,重试成功后
// 自行 clear。错误条 sticky 在顶栏下方,长表格滚到中段也能看见。
//
// 两个 context 分开:actions(clear/report)恒定不变,可以安全地放进各页
// load 的依赖数组;error/retry/retrying 只在提示条内部消费,变化不会让页面
// 的加载回调重建。
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card } from 'animal-island-ui';
import { AlertCircleIcon, RefreshIcon } from 'naive-icons';

const LoadErrorActionsContext = createContext(null);
const LoadErrorStateContext = createContext(null);

export function LoadErrorProvider({ children, resetKey }) {
  const [failure, setFailure] = useState(null); // { error, retry }
  const [retrying, setRetrying] = useState(false);
  const [hasData, setHasData] = useState(false);

  const clear = useCallback(() => {
    setFailure(null);
    setRetrying(false);
  }, []);

  const markData = useCallback((present) => {
    setHasData(Boolean(present));
  }, []);

  // retry 由页面在 report 时传入,避免每个页面再注册一次回跳。
  const report = useCallback((error, retry) => {
    setFailure({ error, retry });
    setRetrying(false);
  }, []);

  useEffect(() => {
    clear();
    setHasData(false);
  }, [resetKey, clear]);

  const retry = useCallback(async () => {
    if (!failure?.retry) return;
    setRetrying(true);
    try {
      await failure.retry();
    } finally {
      setRetrying(false);
    }
  }, [failure]);

  const actions = useMemo(() => ({ clear, report, markData }), [clear, report, markData]);
  const state = useMemo(
    () => ({ error: failure?.error ?? null, retry, retrying, hasData }),
    [failure, retry, retrying, hasData]
  );

  return (
    <LoadErrorActionsContext.Provider value={actions}>
      <LoadErrorStateContext.Provider value={state}>{children}</LoadErrorStateContext.Provider>
    </LoadErrorActionsContext.Provider>
  );
}

// 首次加载失败且页面没有可保留的数据时,把页面内容藏起来(仍保持挂载,
// 重试成功后原地恢复,不丢筛选/滚动),只用错误卡说话——避免下面继续渲染
// 「没有记录」造成“加载失败 = 真的没数据”的误读。有旧数据时保留页面,
// 错误条浮在上方,用户还能继续查看上次结果。
export function LoadErrorGate({ children }) {
  const state = useContext(LoadErrorStateContext);
  const hidden = Boolean(state?.error && !state.hasData);
  return <div className={hidden ? 'load-error-hidden' : undefined}>{children}</div>;
}

export function useLoadError(hasData = false) {
  const ctx = useContext(LoadErrorActionsContext);
  if (!ctx) throw new Error('useLoadError must be used inside LoadErrorProvider');
  const present = Boolean(hasData);
  useEffect(() => {
    ctx.markData(present);
  }, [present, ctx]);
  return ctx;
}

export function PageLoadError() {
  const { t } = useTranslation();
  const actions = useContext(LoadErrorActionsContext);
  const state = useContext(LoadErrorStateContext);
  if (!actions || !state?.error) return null;
  // 服务端错误码优先(403/429 等能说清原因),未知码回落到通用文案。
  const message = state.error.code
    ? t(`api.${state.error.code}`, { defaultValue: t('common.loadFailed') })
    : t('common.loadFailed');
  return (
    <Card type="dashed" className="load-error" role="alert">
      <AlertCircleIcon size={22} className="load-error-icon" aria-hidden="true" />
      <p className="load-error-text">{message}</p>
      <Button
        type="default"
        size="small"
        icon={<RefreshIcon />}
        loading={state.retrying}
        disabled={state.retrying}
        onClick={state.retry}
      >
        {t('common.retry')}
      </Button>
    </Card>
  );
}