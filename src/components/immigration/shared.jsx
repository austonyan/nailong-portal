// 皇家口岸入境署 — shared UI atoms: status tags, crowding meter, fun entry
// stamp, pass-code QR canvas, CSV export helpers and the page sub-navigation.
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Progress, Tag } from 'animal-island-ui';

const STATUS_TAG = {
  draft: { color: 'default', variant: 'outlined' },
  pending: { color: 'app-yellow', variant: 'soft' },
  supplement: { color: 'app-orange', variant: 'soft' },
  approved: { color: 'app-green', variant: 'soft' },
  rejected: { color: 'app-red', variant: 'soft' },
  entered: { color: 'app-teal', variant: 'solid' },
  exited: { color: 'app-blue', variant: 'soft' },
  withdrawn: { color: 'default', variant: 'soft' },
  unused: { color: 'app-green', variant: 'soft' },
  used: { color: 'app-blue', variant: 'soft' },
  expired: { color: 'default', variant: 'soft' },
  voided: { color: 'app-red', variant: 'soft' },
  invalid: { color: 'app-red', variant: 'dashed' },
  open: { color: 'app-green', variant: 'solid' },
  closed: { color: 'app-red', variant: 'solid' },
  maintenance: { color: 'app-yellow', variant: 'soft' },
  accepted: { color: 'app-green', variant: 'soft' },
  unknown: { color: 'default', variant: 'outlined' },
  port_closed: { color: 'app-orange', variant: 'soft' },
  visa_blocked: { color: 'app-red', variant: 'soft' },
};

export function StatusTag({ value, i18nPrefix = 'imm.status' }) {
  const { t } = useTranslation();
  const style = STATUS_TAG[value] ?? { color: 'default', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant}>
      {t(`${i18nPrefix}.${value}`, { defaultValue: value })}
    </Tag>
  );
}

const LEVEL_TAG = {
  info: { color: 'app-blue', variant: 'soft' },
  warning: { color: 'app-yellow', variant: 'soft' },
  critical: { color: 'app-red', variant: 'solid' },
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

// 虚构入境章 — decorative rotated stamp with the compliance watermark.
export function StampView({ portName, date, recordNo, watermark, style = 'wave', compact = false }) {
  const { t } = useTranslation();
  return (
    <div className={`im-stamp im-stamp-${style}${compact ? ' im-stamp-compact' : ''}`} aria-label={t('imm.records.stampAria')}>
      <span className="im-stamp-port">{portName}</span>
      <span className="im-stamp-line">{t('imm.records.entryStamp')}</span>
      <span className="im-stamp-date">{date}</span>
      {recordNo && <span className="im-stamp-no">{recordNo}</span>}
      <span className="im-stamp-watermark">{watermark ?? t('imm.records.watermark')}</span>
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

// 娱乐声明 + 防诈骗统一提示条(所有入境署页面可见)。
export function DisclaimerBanner({ text }) {
  const { t } = useTranslation();
  return (
    <div className="im-disclaimer" role="note">
      <span className="im-disclaimer-title">{t('imm.disclaimer.title')}</span>
      <span className="im-disclaimer-text">{text ?? t('imm.disclaimer.default')}</span>
    </div>
  );
}
