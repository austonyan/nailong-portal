// Shared bits for the resident-office pages: status palette, date formatting,
// error toasts, QR canvas and the common disclaimer banner.
/* eslint-disable react/only-export-components */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import QRCode from 'qrcode';
import { Notification, Tag } from 'animal-island-ui';

export const APPLICATION_STATUS_COLORS = {
  draft: 'default',
  pending_review: 'app-yellow',
  supplement_required: 'app-orange',
  approved: 'app-green',
  rejected: 'app-red',
  withdrawn: 'brown',
  closed: 'default',
};

export const CARD_STATUS_COLORS = {
  valid: 'app-green',
  frozen: 'app-yellow',
  expired: 'brown',
  voided: 'app-red',
};

export const NOTICE_LEVEL_COLORS = {
  info: 'app-blue',
  policy: 'app-yellow',
  event: 'app-pink',
};

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD') : '-';
}

export function resErrMsg(t, err) {
  return t(`api.${err?.code}`, { defaultValue: err?.message || t('api.INTERNAL_ERROR') });
}

export function toastResError(t, err) {
  Notification.error(resErrMsg(t, err));
}

// 材料类型 → i18n key(res.materialKind.*)
export const MATERIAL_KINDS = ['avatar', 'address_proof', 'other'];

export const REJECT_REASONS = ['incomplete', 'false_info', 'duplicate', 'type_mismatch', 'other'];

export const PURPOSES = ['collect', 'activity', 'visa_fast', 'other'];

export const CHANGE_TYPES = ['info', 'upgrade', 'renewal'];

// 库里没有多行输入;按 Input 的视觉语言用 token 自定义,FormItem 直接注入
// value/onChange 也能工作(原生受控)。
export function TextArea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`res-textarea ${className}`} {...rest} />;
}

// 二维码画布:内容只有验真 URL(不可猜测 token),不含个人信息。
export function ResQr({ value, size = 200 }) {
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
  return <canvas ref={ref} className="res-card-qr" role="img" aria-label="QR" />;
}

export function StatusTag({ value, map, i18nPrefix }) {
  const { t } = useTranslation();
  const style = (map && map[value]) || { color: 'default', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant}>
      {t(`${i18nPrefix}.${value}`, { defaultValue: value })}
    </Tag>
  );
}

// 娱乐声明 + 防诈骗统一提示条(居民署所有页面可见)。
export function DisclaimerBanner({ text }) {
  const { t } = useTranslation();
  return (
    <div className="res-disclaimer" role="note">
      <span className="res-disclaimer-title">{t('res.disclaimer.title')}</span>
      <span className="res-disclaimer-text">{text ?? t('res.disclaimer.default')}</span>
    </div>
  );
}
