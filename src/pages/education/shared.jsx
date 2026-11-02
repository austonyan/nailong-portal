// 奶龙国皇家教育与科学署 — shared UI atoms: the office sub-navigation and the
// office status palette. Status tags, date formatting, the textarea and the
// error-toast mapper are the shared implementations re-exported below.
/* eslint-disable react/only-export-components */
import { useTranslation } from 'react-i18next';
import { Button, Modal, Tag } from 'animal-island-ui';
import { toastApiError } from '../../components/toast.js';
import { StatusTag as SharedStatusTag } from '../../components/StatusTag.jsx';

// 全站唯一的时间格式化实现(src/lib/date.js,带 isValid() 保护)。
export { fmtDateTime } from '../../lib/date.js';
// 全站唯一的多行输入框(src/components/TextArea.jsx)。
export { TextArea } from '../../components/TextArea.jsx';

export const CONTENT_STATUSES = ['draft', 'pending_review', 'published', 'offline'];
export const TASK_STATUSES = ['active', 'inactive'];
export const RECORD_STATUSES = ['in_progress', 'completed'];
export const CONTENT_TARGETS = ['entry', 'article'];
export const REVIEW_ACTIONS = ['approve', 'reject'];

const STATUS_STYLE = {
  draft: { color: 'brown', variant: 'soft' },
  pending_review: { color: 'warm-peach-pink', variant: 'soft' },
  published: { color: 'app-teal', variant: 'soft' },
  offline: { color: 'brown', variant: 'soft' },
  active: { color: 'app-green', variant: 'soft' },
  inactive: { color: 'brown', variant: 'soft' },
  in_progress: { color: 'app-blue', variant: 'soft' },
  completed: { color: 'app-green', variant: 'soft' },
  approve: { color: 'app-green', variant: 'soft' },
  reject: { color: 'app-red', variant: 'soft' },
};

// 标签渲染由 src/components/StatusTag.jsx 承担,教育署只保留自己的配色表与
// i18n 前缀默认值;调用点 (<StatusTag value=... prefix=.../>) 保持不变。
export function StatusTag({ value, prefix = 'edu.status' }) {
  return <SharedStatusTag value={value} map={STATUS_STYLE} prefix={prefix} size="small" />;
}

export function TargetTypeTag({ value }) {
  const { t } = useTranslation();
  return (
    <Tag color="app-blue" variant="soft" size="small">
      {t(`edu.targetType.${value}`, { defaultValue: t('common.unknown') })}
    </Tag>
  );
}





// 错误提示委托全站统一的 api.<code> 映射(未知码回退通用文案,不展示服务端英文)。
export function toastEduError(t, err) {
  toastApiError(t, err);
}

export function pct(part, total) {
  const a = Number(part) || 0;
  const b = Number(total) || 0;
  if (b <= 0) return 0;
  return Math.min(100, Math.round((a * 100) / b));
}

// 删除/下架等不可逆操作的确认弹窗:maskClosable={false},busy 时不可关闭。
export function ConfirmModal({ open, title, tip, confirmText, busy = false, onCancel, onConfirm }) {
  const { t } = useTranslation();
  const close = () => {
    if (busy) return;
    onCancel();
  };
  return (
    <Modal
      maskClosable={false}
      open={open}
      title={title}
      onClose={close}
      typewriter={false}
      width={420}
      footer={
        <>
          <Button onClick={close} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="primary" danger loading={busy} disabled={busy} onClick={onConfirm}>
            {confirmText ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="muted-text">{tip ?? t('common.deleteTip')}</p>
    </Modal>
  );
}