// Shared bits for the resident-office pages: status palette, date formatting,
// error toasts and the QR canvas.
/* eslint-disable react/only-export-components */
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { StatusTag as SharedStatusTag } from '../../components/StatusTag.jsx';
import { TextArea as SharedTextArea } from '../../components/TextArea.jsx';
import {
  apiErrorMessage,
  toastApiError,
  toastError,
  toastInfo,
  toastSuccess,
  toastWarning,
} from '../../components/toast.js';

// 时间格式化用全站共享实现,这里只再导出,保持署内调用路径不变。
export { fmtDate, fmtDateTime } from '../../lib/date.js';

export const APPLICATION_STATUS_COLORS = {
  draft: 'brown',
  pending_review: 'warm-peach-pink',
  supplement_required: 'warm-peach-pink',
  approved: 'app-green',
  rejected: 'app-red',
  withdrawn: 'brown',
  closed: 'brown',
};

export const CARD_STATUS_COLORS = {
  valid: 'app-green',
  frozen: 'warm-peach-pink',
  expired: 'brown',
  voided: 'app-red',
};

export const NOTICE_LEVEL_COLORS = {
  info: 'app-blue',
  policy: 'warm-peach-pink',
  event: 'app-pink',
};

// 错误文案映射与提示都委托给共享实现(src/components/toast.js),行为与原先一致。
export const resErrMsg = apiErrorMessage;

// 统一走全站 toast(库的通知 API 在 React 19 下会抛异常,不能用于关键流程)
export function resToast(kind, message) {
  if (kind === 'success') toastSuccess(message);
  else if (kind === 'error') toastError(message);
  else if (kind === 'warning') toastWarning(message);
  else toastInfo(message);
}

export const toastResSuccess = (message) => toastSuccess(message);

export const toastResError = toastApiError;

// 材料类型 → i18n key(res.materialKind.*)
export const MATERIAL_KINDS = ['avatar', 'address_proof', 'other'];

export const REJECT_REASONS = ['incomplete', 'false_info', 'duplicate', 'type_mismatch', 'other'];

export const PURPOSES = ['collect', 'activity', 'visa_fast', 'other'];

export const CHANGE_TYPES = ['info', 'upgrade', 'renewal'];

// 多行输入委托给全站共享实现(src/components/TextArea.jsx);res-textarea 只用于
// 保留本署既有样式钩子,不重新实现控件。
export function TextArea({ className = '', ...rest }) {
  return <SharedTextArea className={`res-textarea ${className}`} {...rest} />;
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

// 状态标签委托给全站共享实现(src/components/StatusTag.jsx);映射表只存颜色名,
// 共享层统一按 soft 渲染(实色/默认色对比度不足)。
export function StatusTag({ value, map, i18nPrefix }) {
  return <SharedStatusTag value={value} map={map ?? {}} i18nPrefix={i18nPrefix} />;
}

