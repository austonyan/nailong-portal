// Shared bits for the visa pages: status palette, plus the portal-wide date,
// textarea and error-toast helpers. 日期、多行输入与错误提示的实现各自只有一份
// (src/lib/date.js、src/components/TextArea.jsx、src/components/toast.js),
// 这里只做转出,保证署内调用点仍然从 './shared.jsx' 取。
import { useTranslation } from 'react-i18next';
import { Button, Modal } from 'animal-island-ui';
import { apiErrorMessage, toastApiError } from '../../components/toast.js';
import SharedTextArea from '../../components/TextArea.jsx';

export { fmtDate, fmtDateTime } from '../../lib/date.js';


export const APPLICATION_STATUS_COLORS = {
  draft: 'brown',
  pending_review: 'warm-peach-pink',
  supplement_required: 'warm-peach-pink',
  approved: 'app-green',
  issued: 'app-teal',
  rejected: 'app-red',
  withdrawn: 'brown',
  closed: 'brown',
};

export const PERMIT_STATUS_COLORS = {
  valid: 'app-green',
  used: 'app-green',
  expired: 'brown',
  voided: 'app-red',
};

export const NOTICE_LEVEL_COLORS = {
  info: 'app-blue',
  policy: 'warm-peach-pink',
  event: 'app-pink',
};

// 审核轨迹的 action 与申请状态同色:通过=绿、驳回=红、补件=暖粉、签发=青、
// 作废=红、已使用=绿。两个页面(用户详情 / 审核工作台)共用,避免各写一套导致漂色。
export const REVIEW_ACTION_COLORS = {
  approve: 'app-green',
  reject: 'app-red',
  require_supplement: 'warm-peach-pink',
  issue: 'app-teal',
  void: 'app-red',
  mark_used: 'app-green',
};

// 错误码 → 文案的映射由共享层实现(未知码回退 api.INTERNAL_ERROR 并写控制台),
// 这里保持原来的两个函数名与可见文案不变,只把实现委托出去。
export function visaErrMsg(t, err) {
  return apiErrorMessage(t, err);
}

export function toastVisaError(t, err) {
  toastApiError(t, err);
}

// 驳回原因码 → i18n key(visa.rejectReason.*)
export const REJECT_REASONS = ['incomplete_materials', 'false_info', 'type_mismatch', 'duplicate', 'other'];

// 多行输入控件统一用共享 TextArea(原生属性透传, animal-island-ui 的 FormItem 注入的
// value/onChange 可以直接透传);额外带上 visa-textarea 类名,沿用本署在 index.css 里的描边/圆角版式。
export function TextArea(props) {
  return <SharedTextArea className="visa-textarea" {...props} />;
}

// 可撤销的状态集合:列表页与详情页共用同一份定义,避免两处各自维护后漂移。
export const WITHDRAWABLE = ['pending_review', 'supplement_required'];

// 撤销确认弹窗:列表页(VisaMyApplications)与详情页(VisaApplicationDetail)共用一份,
// 文案与 busy 行为保持一致;成功后的刷新由调用方在 onConfirm 里自行 load。
export function VisaWithdrawModal({ open, appNo, busy, onClose, onConfirm }) {
  const { t } = useTranslation();
  return (
    <Modal
      maskClosable={false}
      open={open}
      title={t('visa.my.withdrawConfirmTitle')}
      onClose={onClose}
      typewriter={false}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="primary" danger loading={busy} onClick={onConfirm} disabled={busy}>
            {t('visa.my.withdraw')}
          </Button>
        </>
      }
    >
      {appNo ? t('visa.my.withdrawConfirmBody', { no: appNo }) : ''}
    </Modal>
  );
}
