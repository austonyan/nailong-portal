// 皇家口岸入境署 — shared UI atoms: status tags, crowding meter, fun entry
// stamp, pass-code QR canvas, CSV export helpers and the page sub-navigation.
// (Non-component exports are intentional helpers, not a components-file slip.)
/* eslint-disable react/only-export-components */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Progress, Tag } from 'animal-island-ui';
import { StatusTag as SharedStatusTag } from '../StatusTag.jsx';

// CSV 导出与全站共用一份实现(src/lib/csv.js);这里只再导出,保持署内调用路径不变。
export { exportCsv, downloadDataUrl } from '../../lib/csv.js';

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

// 状态标签委托给全站共享实现(src/components/StatusTag.jsx),配色表留在本署。
export function StatusTag({ value, i18nPrefix = 'imm.status' }) {
  return <SharedStatusTag value={value} map={STATUS_TAG} i18nPrefix={i18nPrefix} />;
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
      {t(`imm.level.${level}`, { defaultValue: t('common.unknown') })}
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

// 服务端已按 X-Nailong-Locale 把 base 字段本地化成当前语言(繁体时还会给出 *Cn 源文)。
// 前端只在繁体界面才优先取 *Tw 版本;简体界面必须用 base,否则会把繁体内容显示在简体页。
export function pickLocalized(item, baseKey, language) {
  if (!item) return '';
  const tw = item[`${baseKey}Tw`];
  if (String(language || '').startsWith('zh-TW') && tw) return tw;
  return item[baseKey] ?? tw ?? '';
}








