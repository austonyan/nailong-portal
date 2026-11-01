// 奶龙国皇家外交事务署 — shared UI atoms: status tags, sub-navigation,
// QR canvas, CSV export helpers and the error toast mapper.
/* eslint-disable react/only-export-components */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { Tag } from 'animal-island-ui';
import { StatusTag as SharedStatusTag } from '../StatusTag.jsx';
import { TextArea as SharedTextArea } from '../TextArea.jsx';
import { apiErrorMessage, toastApiError } from '../toast.js';

// 时间格式化与 CSV 导出都用全站共享实现,这里只再导出,保持署内调用路径不变。
export { fmtDate, fmtDateTime } from '../../lib/date.js';
export { exportCsv, downloadDataUrl } from '../../lib/csv.js';

// 状态标签配色(Foundations §1.4):待处理/补件/暂停 → warm-peach-pink,
// 进行中 → app-blue,已生效/开放 → app-green,签发/在册 → app-teal,
// 驳回/终止/失效 → app-red,草稿/关闭/撤销/过期 → brown。标签统一 soft。
const STATUS_TAG = {
  draft: { color: 'brown', variant: 'soft' },
  pending_review: { color: 'warm-peach-pink', variant: 'soft' },
  supplement_required: { color: 'warm-peach-pink', variant: 'soft' },
  established: { color: 'app-teal', variant: 'soft' },
  rejected: { color: 'app-red', variant: 'soft' },
  suspended: { color: 'warm-peach-pink', variant: 'soft' },
  severed: { color: 'app-red', variant: 'soft' },
  withdrawn: { color: 'brown', variant: 'soft' },
  sever_requested: { color: 'app-blue', variant: 'soft' },
  active: { color: 'app-green', variant: 'soft' },
  frozen: { color: 'warm-peach-pink', variant: 'soft' },
  expired: { color: 'brown', variant: 'soft' },
  revoked: { color: 'app-red', variant: 'soft' },
  pending_effect: { color: 'warm-peach-pink', variant: 'soft' },
  terminated: { color: 'app-red', variant: 'soft' },
  open: { color: 'app-green', variant: 'soft' },
  closed: { color: 'brown', variant: 'soft' },
  maintenance: { color: 'warm-peach-pink', variant: 'soft' },
  valid: { color: 'app-green', variant: 'soft' },
  invalid: { color: 'app-red', variant: 'soft' },
};

// 状态标签委托给全站共享实现(src/components/StatusTag.jsx),配色表留在本署。
export function StatusTag({ value, i18nPrefix = 'dip.status' }) {
  return <SharedStatusTag value={value} map={STATUS_TAG} i18nPrefix={i18nPrefix} />;
}

const LEVEL_TAG = {
  info: { color: 'app-blue', variant: 'soft' },
  warning: { color: 'warm-peach-pink', variant: 'soft' },
  critical: { color: 'app-red', variant: 'soft' },
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

// 错误文案映射与提示都委托给共享实现(src/components/toast.js),行为与原先一致。
export const dipErrMsg = apiErrorMessage;

export const toastDipError = toastApiError;

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

// 多行输入委托给全站共享实现(src/components/TextArea.jsx);dip-textarea 只用于
// 保留本署既有样式钩子,不重新实现控件。
export function TextArea({ className = '', ...rest }) {
  return <SharedTextArea className={`dip-textarea ${className}`} {...rest} />;
}






