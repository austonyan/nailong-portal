// 不可逆动作的统一确认弹窗(删除 / 撤回 / 作废 / 注销 / 移出黑名单 / 状态流转)。
//
// 审计问题:这类动作过去是「单击即发请求」,既没有确认,也没有 busy,
// 双击会发出两次请求,第二次往往 404 再弹一个错误提示。这里把三件事收在一处:
//   1. 确认:先弹窗,点「确认」才发请求;
//   2. busy:组件内部托管,确认按钮 loading + disabled,busy 期间不可关闭,
//      重复点击直接被忽略;
//   3. 顺序:成功后先关窗,再 toast 成功文案,再 await 调用方的刷新(onDone);
//      失败则保持弹窗打开,错误交给 onError(页面用各自的 toastXError 提示)。
//
// 用法(每个组件一个实例;Modal 走 portal,{dialog} 放在页面任意位置都可以):
//   const { confirm, dialog } = useConfirmAction();
//   ...
//   <Button danger onClick={() => confirm({
//     title: t('common.confirmDeleteTitle'),
//     tip: t('res.admin.notices.deleteConfirm', { title: row.title }),
//     confirmText: t('common.delete'),
//     action: () => api.del(`/resident/admin/notices/${row.id}`),
//     success: t('common.deleted'),
//     onDone: load,
//     onError: (err) => toastResError(t, err),
//   })}>{t('common.delete')}</Button>
//   {dialog}
//
// action 请写成「会抛出异常」的异步函数(不要在内部 catch 掉),否则这里无法
// 判断成功与否。需要在成功后关闭外层抽屉/表单的场景,把收尾写在 onDone 里。
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from 'animal-island-ui';
import { toastSuccess } from './toast.js';

export function useConfirmAction() {
  const { t } = useTranslation();
  const [request, setRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  // busy 的同步镜像:确认按钮与 onClose 在同一次渲染里都要读到最新状态,
  // 只靠 setState 的异步更新会让双击的第二次点击穿过判断。
  const runningRef = useRef(false);

  const confirm = useCallback((options) => {
    if (runningRef.current) return false;
    setRequest({ danger: true, ...options });
    return true;
  }, []);

  const cancel = useCallback(() => {
    if (runningRef.current) return;
    setRequest(null);
  }, []);

  const accept = useCallback(async () => {
    if (!request || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    let error = null;
    try {
      await request.action();
    } catch (err) {
      error = err;
    }
    runningRef.current = false;
    setBusy(false);
    if (error) {
      // 失败:弹窗保持打开,提示交给调用方
      if (request.onError) request.onError(error);
      return;
    }
    setRequest(null);
    if (request.success) toastSuccess(request.success);
    try {
      if (request.onDone) await request.onDone();
    } catch {
      // 列表刷新失败由调用方的 load 自行提示,这里不打断确认流程
    }
  }, [request]);

  const dialog = request ? (
    <Modal
      maskClosable={false}
      open
      title={request.title ?? t('common.confirmActionTitle')}
      onClose={cancel}
      typewriter={false}
      width={460}
      footer={
        <>
          <Button onClick={cancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            type="primary"
            danger={request.danger}
            loading={busy}
            disabled={busy}
            onClick={accept}
          >
            {request.confirmText ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="muted-text">{request.tip ?? t('common.irreversibleTip')}</p>
    </Modal>
  ) : null;

  return { confirm, dialog, busy };
}
