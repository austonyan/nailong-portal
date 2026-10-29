// 皇家档案与记录署 — shared UI atoms: status tags, office tags, CSV export,
// formatted dates, the office sub-navigation and the tokenised textarea.
// (Non-component exports are intentional helpers, not a components-file slip.)
/* eslint-disable react/only-export-components */
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Tag } from 'animal-island-ui';
import i18n from '../../i18n/index.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { toastError } from '../../components/toast.js';

// Toast helper usable outside React components.
// 服务端 message 是英文:未知错误码只回退到通用文案,不把 message 摊到界面上。
export function toastArchError(err) {
  const key = `api.${err?.code}`;
  const text = err?.code ? i18n.t(key) : '';
  toastError(text && text !== key ? text : i18n.t('api.INTERNAL_ERROR'));
}

// 时间统一转浏览器本地时区(dayjs),与签注署等其他署页面一致;
// 不能直接截 ISO 字符串(那是 UTC,会差 8 小时甚至差一天)。
export function fmtDateTime(value) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-';
}

export function fmtDate(value) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-';
}

// Client-side CSV (UTF-8 BOM keeps Excel happy with Chinese headers).
export function exportCsv(filename, columns, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// 库内没有 Textarea 组件:长文本用令牌化 textarea(<ns>-textarea)。
export function TextArea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`arch-textarea ${className}`} {...rest} />;
}

const REQUEST_STATUS_TAG = {
  pending: { color: 'app-yellow', variant: 'soft' },
  reviewing: { color: 'app-blue', variant: 'soft' },
  executing: { color: 'app-orange', variant: 'soft' },
  completed: { color: 'app-green', variant: 'solid' },
  rejected: { color: 'app-red', variant: 'soft' },
};

export function RequestStatusTag({ value }) {
  const { t } = useTranslation();
  const style = REQUEST_STATUS_TAG[value] ?? { color: 'default', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant}>
      {t(`arch.status.${value}`, { defaultValue: t('common.unknown') })}
    </Tag>
  );
}

const RECORD_STATUS_TAG = {
  draft: { color: 'default', variant: 'outlined' },
  pending: { color: 'app-yellow', variant: 'soft' },
  pending_review: { color: 'app-yellow', variant: 'soft' },
  supplement: { color: 'app-orange', variant: 'soft' },
  supplement_required: { color: 'app-orange', variant: 'soft' },
  approved: { color: 'app-green', variant: 'soft' },
  issued: { color: 'app-green', variant: 'soft' },
  valid: { color: 'app-green', variant: 'solid' },
  rejected: { color: 'app-red', variant: 'soft' },
  invalid: { color: 'app-red', variant: 'soft' },
  withdrawn: { color: 'default', variant: 'soft' },
  closed: { color: 'default', variant: 'soft' },
  used: { color: 'app-blue', variant: 'soft' },
  expired: { color: 'default', variant: 'soft' },
  voided: { color: 'app-red', variant: 'dashed' },
  entered: { color: 'app-teal', variant: 'solid' },
  exited: { color: 'app-blue', variant: 'soft' },
};

export function RecordStatusTag({ value }) {
  const { t } = useTranslation();
  const style = RECORD_STATUS_TAG[value] ?? { color: 'default', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant} size="small">
      {t(`arch.recStatus.${value}`, { defaultValue: t('common.unknown') })}
    </Tag>
  );
}

const OFFICE_TAG = {
  visa: { color: 'app-teal', variant: 'soft' },
  immigration: { color: 'app-orange', variant: 'soft' },
};

export function OfficeTag({ office }) {
  const { t } = useTranslation();
  const style = OFFICE_TAG[office] ?? { color: 'default', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant} size="small">
      {t(`arch.office.${office}`, { defaultValue: t('common.unknown') })}
    </Tag>
  );
}

const USER_TABS = [
  { to: '/archives', key: 'home', end: true },
  { to: '/archives/records', key: 'records' },
  { to: '/archives/requests', key: 'requests' },
  { to: '/archives/messages', key: 'messages' },
  { to: '/archives/help', key: 'help' },
];

const ADMIN_TABS = [
  { to: '/archives/admin/rules', key: 'rules' },
  { to: '/archives/admin/records', key: 'records' },
  { to: '/archives/admin/requests', key: 'requests' },
  { to: '/archives/admin/access', key: 'access' },
  { to: '/archives/admin/audit', key: 'audit' },
  { to: '/archives/admin/settings', key: 'settings' },
];

export function ArchNav() {
  const { t } = useTranslation();
  const { can } = useAuth();
  return (
    <nav className="arch-nav" aria-label={t('arch.nav.label')}>
      {USER_TABS.map((tab) => (
        <NavLink
          key={tab.key}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => (isActive ? 'arch-nav-link active' : 'arch-nav-link')}
        >
          {t(`arch.nav.${tab.key}`)}
        </NavLink>
      ))}
      {can('arch:manage') && (
        <NavLink to="/archives/admin/requests" className={({ isActive }) => (isActive ? 'arch-nav-link active' : 'arch-nav-link arch-nav-admin')}>
          {t('arch.nav.admin')}
        </NavLink>
      )}
    </nav>
  );
}

export function ArchAdminNav() {
  const { t } = useTranslation();
  return (
    <nav className="arch-subnav" aria-label={t('arch.nav.adminLabel')}>
      {ADMIN_TABS.map((tab) => (
        <NavLink
          key={tab.key}
          to={tab.to}
          className={({ isActive }) => (isActive ? 'arch-subnav-link active' : 'arch-subnav-link')}
        >
          {t(`arch.nav.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}