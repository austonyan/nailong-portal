// 皇家口岸入境署 — shared UI atoms: status tags, crowding meter, fun entry
// stamp, pass-code QR canvas, CSV export helpers and the page sub-navigation.
// (Non-component exports are intentional helpers, not a components-file slip.)
/* eslint-disable react/only-export-components */
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Progress, Tag } from 'animal-island-ui';

// 状态标签配色(Foundations §1.4):待处理/补件/维护 → warm-peach-pink,
// 已通过/有效/开放 → app-green,已入境 → app-teal,已出境/已使用 → app-blue,
// 驳回/作废/失效/拦截 → app-red,草稿/关闭/撤销/过期/未知 → brown。统一 soft。
const STATUS_TAG = {
  draft: { color: 'brown', variant: 'soft' },
  pending: { color: 'warm-peach-pink', variant: 'soft' },
  supplement: { color: 'warm-peach-pink', variant: 'soft' },
  approved: { color: 'app-green', variant: 'soft' },
  rejected: { color: 'app-red', variant: 'soft' },
  entered: { color: 'app-teal', variant: 'soft' },
  exited: { color: 'app-blue', variant: 'soft' },
  withdrawn: { color: 'brown', variant: 'soft' },
  unused: { color: 'app-green', variant: 'soft' },
  used: { color: 'app-green', variant: 'soft' },
  expired: { color: 'brown', variant: 'soft' },
  voided: { color: 'app-red', variant: 'soft' },
  invalid: { color: 'app-red', variant: 'soft' },
  open: { color: 'app-green', variant: 'soft' },
  closed: { color: 'brown', variant: 'soft' },
  maintenance: { color: 'warm-peach-pink', variant: 'soft' },
  accepted: { color: 'app-green', variant: 'soft' },
  unknown: { color: 'brown', variant: 'soft' },
  port_closed: { color: 'warm-peach-pink', variant: 'soft' },
  visa_blocked: { color: 'app-red', variant: 'soft' },
};

export function StatusTag({ value, i18nPrefix = 'imm.status' }) {
  const { t } = useTranslation();
  const style = STATUS_TAG[value] ?? { color: 'brown', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant}>
      {t(`${i18nPrefix}.${value}`, { defaultValue: value })}
    </Tag>
  );
}

const LEVEL_TAG = {
  info: { color: 'app-blue', variant: 'soft' },
  warning: { color: 'warm-peach-pink', variant: 'soft' },
  critical: { color: 'app-red', variant: 'soft' },
};

export function AnnouncementLevelTag({ level }) {
  const { t } = useTranslation();
  const style = LEVEL_TAG[level] ?? LEVEL_TAG.info;
  return (
    <Tag color={style.color} variant={style.variant} size="small">
      {t(`imm.level.${level}`, { defaultValue: level })}
    </Tag>
  );
}

export function CrowdMeter({ crowding }) {
  const { t } = useTranslation();
  if (!crowding) return null;
  return (
    <div className="im-crowd">
      <Progress percent={crowding.percent} showInfo={false} duration={0} />
      <span className="im-crowd-text muted-text">
        {t(`imm.crowd.${crowding.level}`)} · {t('imm.crowd.pending', { count: crowding.pendingCount })}
      </span>
    </div>
  );
}

// 入境章 — decorative rotated stamp.
export function StampView({ portName, date, recordNo, style = 'wave', compact = false }) {
  const { t } = useTranslation();
  return (
    <div className={`im-stamp im-stamp-${style}${compact ? ' im-stamp-compact' : ''}`} aria-label={t('imm.records.stampAria')}>
      <span className="im-stamp-port">{portName}</span>
      <span className="im-stamp-line">{t('imm.records.entryStamp')}</span>
      <span className="im-stamp-date">{date}</span>
      {recordNo && <span className="im-stamp-no">{recordNo}</span>}
    </div>
  );
}

// 二维码画布:内容只有验真 URL(不可猜测 token),不含个人信息。
export function PassQr({ value, size = 200 }) {
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
  return <canvas ref={ref} className="im-pass-qr" role="img" aria-label="QR" />;
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

const USER_TABS = [
  { to: '/immigration', key: 'home', end: true },
  { to: '/immigration/ports', key: 'ports' },
  { to: '/immigration/declarations', key: 'myDeclarations' },
  { to: '/immigration/pass-codes', key: 'passCodes' },
  { to: '/immigration/records', key: 'records' },
  { to: '/immigration/messages', key: 'messages' },
  { to: '/immigration/help', key: 'help' },
];

export function ImNav() {
  const { t } = useTranslation();
  return (
    <nav className="im-subnav" aria-label={t('imm.nav.label')}>
      {USER_TABS.map((tab) => (
        <NavLink key={tab.key} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'im-subnav-link active' : 'im-subnav-link')}>
          {t(`imm.nav.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}

const ADMIN_TABS = [
  { to: '/admin/immigration/ports', key: 'ports' },
  { to: '/admin/immigration/review', key: 'review' },
  { to: '/admin/immigration/verify', key: 'verify' },
  { to: '/admin/immigration/records', key: 'records' },
  { to: '/admin/immigration/stats', key: 'stats' },
  { to: '/admin/immigration/settings', key: 'settings' },
  { to: '/admin/immigration/audit', key: 'audit' },
];

export function ImAdminNav() {
  const { t } = useTranslation();
  return (
    <nav className="im-subnav" aria-label={t('imm.admin.navLabel')}>
      {ADMIN_TABS.map((tab) => (
        <NavLink key={tab.key} to={tab.to} className={({ isActive }) => (isActive ? 'im-subnav-link active' : 'im-subnav-link')}>
          {t(`imm.admin.tabs.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}


