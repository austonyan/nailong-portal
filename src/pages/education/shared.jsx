// 奶龙国皇家教育与科学署 — shared UI atoms: status tags, sub-navigation,
// the tokenized textarea (the library ships no Textarea) and the error toast
// mapper. Kept inside the education folder so no shared file is touched.
/* eslint-disable react/only-export-components */
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Button, Modal, Tag } from 'animal-island-ui';
import { toastError } from '../../components/toast.js';
import { useAuth } from '../../auth/AuthContext.jsx';

export const CONTENT_STATUSES = ['draft', 'pending_review', 'published', 'offline'];
export const TASK_STATUSES = ['active', 'inactive'];
export const RECORD_STATUSES = ['in_progress', 'completed'];
export const CONTENT_TARGETS = ['entry', 'article'];
export const REVIEW_ACTIONS = ['approve', 'reject'];

const STATUS_STYLE = {
  draft: { color: 'default', variant: 'outlined' },
  pending_review: { color: 'app-yellow', variant: 'soft' },
  published: { color: 'app-teal', variant: 'solid' },
  offline: { color: 'default', variant: 'soft' },
  active: { color: 'app-green', variant: 'soft' },
  inactive: { color: 'default', variant: 'outlined' },
  in_progress: { color: 'app-blue', variant: 'soft' },
  completed: { color: 'app-teal', variant: 'solid' },
  approve: { color: 'app-green', variant: 'soft' },
  reject: { color: 'app-red', variant: 'soft' },
};

export function StatusTag({ value, prefix = 'edu.status' }) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[value] ?? { color: 'default', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant} size="small">
      {t(`${prefix}.${value}`, { defaultValue: value })}
    </Tag>
  );
}

export function TargetTypeTag({ value }) {
  const { t } = useTranslation();
  return (
    <Tag color="app-blue" variant="soft" size="small">
      {t(`edu.targetType.${value}`, { defaultValue: value })}
    </Tag>
  );
}

const USER_TABS = [
  { to: '/education', key: 'home', end: true },
  { to: '/education/entries', key: 'entries' },
  { to: '/education/articles', key: 'articles' },
  { to: '/education/tasks', key: 'tasks' },
  { to: '/education/my', key: 'my' },
];

const ADMIN_TABS = [
  { to: '/education/admin/review', key: 'adminReview', permission: 'edu:review' },
  { to: '/education/admin/entries', key: 'adminEntries', permission: 'edu:manage' },
  { to: '/education/admin/articles', key: 'adminArticles', permission: 'edu:manage' },
  { to: '/education/admin/tasks', key: 'adminTasks', permission: 'edu:manage' },
  { to: '/education/admin/stats', key: 'adminStats', permission: 'edu:manage' },
  { to: '/education/admin/audit', key: 'adminAudit', permission: 'edu:manage' },
  { to: '/education/admin/settings', key: 'adminSettings', permission: 'edu:manage' },
];

export function EduNav() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const navClass = ({ isActive }) => (isActive ? 'edu-nav-link active' : 'edu-nav-link');
  const adminTabs = ADMIN_TABS.filter((tab) => can(tab.permission));
  return (
    <nav className="edu-nav" aria-label={t('edu.officeName')}>
      {USER_TABS.map((tab) => (
        <NavLink key={tab.key} to={tab.to} end={tab.end} className={navClass}>
          {t(`edu.nav.${tab.key}`)}
        </NavLink>
      ))}
      {adminTabs.map((tab) => (
        <NavLink key={tab.key} to={tab.to} className={navClass}>
          {t(`edu.nav.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}

// 库里没有多行输入;按 Input 的视觉语言用令牌自定义,FormItem 直接注入
// value/onChange 也能工作(原生受控)。
export function TextArea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`edu-textarea ${className}`} {...rest} />;
}

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function eduErrMsg(t, err) {
  return t(`api.${err?.code}`, { defaultValue: err?.message || t('api.INTERNAL_ERROR') });
}

export function toastEduError(t, err) {
  toastError(eduErrMsg(t, err));
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