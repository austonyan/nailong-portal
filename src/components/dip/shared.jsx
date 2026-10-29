// 奶龙国皇家外交事务署 — shared UI atoms: status tags, sub-navigation,
// QR canvas, CSV export helpers and the error toast mapper.
/* eslint-disable react/only-export-components */
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import QRCode from 'qrcode';
import { Tag } from 'animal-island-ui';
import { toastError } from '../toast.js';

const STATUS_TAG = {
  draft: { color: 'default', variant: 'outlined' },
  pending_review: { color: 'app-yellow', variant: 'soft' },
  supplement_required: { color: 'app-orange', variant: 'soft' },
  established: { color: 'app-teal', variant: 'solid' },
  rejected: { color: 'app-red', variant: 'soft' },
  suspended: { color: 'app-orange', variant: 'dashed' },
  severed: { color: 'app-red', variant: 'solid' },
  withdrawn: { color: 'default', variant: 'soft' },
  sever_requested: { color: 'app-blue', variant: 'soft' },
  active: { color: 'app-green', variant: 'solid' },
  frozen: { color: 'app-orange', variant: 'soft' },
  expired: { color: 'default', variant: 'soft' },
  revoked: { color: 'app-red', variant: 'dashed' },
  pending_effect: { color: 'app-yellow', variant: 'soft' },
  terminated: { color: 'app-red', variant: 'soft' },
  open: { color: 'app-green', variant: 'solid' },
  closed: { color: 'app-red', variant: 'solid' },
  maintenance: { color: 'app-yellow', variant: 'soft' },
  valid: { color: 'app-green', variant: 'soft' },
  invalid: { color: 'app-red', variant: 'soft' },
};

export function StatusTag({ value, i18nPrefix = 'dip.status' }) {
  const { t } = useTranslation();
  const style = STATUS_TAG[value] ?? { color: 'default', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant}>
      {t(`${i18nPrefix}.${value}`, { defaultValue: t('common.unknown') })}
    </Tag>
  );
}

const LEVEL_TAG = {
  info: { color: 'app-blue', variant: 'soft' },
  warning: { color: 'app-yellow', variant: 'soft' },
  critical: { color: 'app-red', variant: 'solid' },
};

export function DipLevelTag({ level }) {
  const { t } = useTranslation();
  const style = LEVEL_TAG[level] ?? LEVEL_TAG.info;
  return (
    <Tag color={style.color} variant={style.variant} size="small">
      {t(`dip.level.${level}`, { defaultValue: t('common.unknown') })}
    </Tag>
  );
}

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD') : '-';
}

export function dipErrMsg(t, err) {
  return t(`api.${err?.code}`, { defaultValue: t('api.INTERNAL_ERROR') });
}

export function toastDipError(t, err) {
  toastError(dipErrMsg(t, err));
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Client-side CSV (UTF-8 BOM keeps Excel happy with Chinese headers).
export function exportCsv(filename, columns, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  URL.revokeObjectURL(url);
}

// 二维码画布:内容只有验真 URL(不可猜测 token),不含个人信息。
export function DipQr({ value, size = 180 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: '#5b4632', light: '#fffdf2' },
      errorCorrectionLevel: 'M',
    }).catch(() => {});
  }, [value, size]);
  return <canvas ref={ref} className="dip-card-qr" role="img" aria-label="QR" />;
}

// 库里没有多行输入;按 Input 的视觉语言用 token 自定义,FormItem 直接注入
// value/onChange 也能工作(原生受控)。
export function TextArea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`dip-textarea ${className}`} {...rest} />;
}

const USER_TABS = [
  { to: '/dip', key: 'home', end: true },
  { to: '/dip/apply', key: 'apply' },
  { to: '/dip/relations', key: 'relations' },
  { to: '/dip/identity', key: 'identity' },
  { to: '/dip/agreements', key: 'agreements' },
  { to: '/dip/courtesies', key: 'courtesies' },
  { to: '/dip/offices', key: 'offices' },
  { to: '/dip/messages', key: 'messages' },
];

export function DipNav() {
  const { t } = useTranslation();
  return (
    <nav className="dip-subnav" aria-label={t('dip.nav.label')}>
      {USER_TABS.map((tab) => (
        <NavLink key={tab.key} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'dip-subnav-link active' : 'dip-subnav-link')}>
          {t(`dip.nav.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}

const ADMIN_TABS = [
  { to: '/admin/dip/review', key: 'review' },
  { to: '/admin/dip/agreements', key: 'agreements' },
  { to: '/admin/dip/offices', key: 'offices' },
  { to: '/admin/dip/verify', key: 'verify' },
  { to: '/admin/dip/config', key: 'config' },
  { to: '/admin/dip/stats', key: 'stats' },
  { to: '/admin/dip/audit', key: 'audit' },
];

export function DipAdminNav() {
  const { t } = useTranslation();
  return (
    <nav className="dip-subnav" aria-label={t('dip.admin.navLabel')}>
      {ADMIN_TABS.map((tab) => (
        <NavLink key={tab.key} to={tab.to} className={({ isActive }) => (isActive ? 'dip-subnav-link active' : 'dip-subnav-link')}>
          {t(`dip.admin.tabs.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}
