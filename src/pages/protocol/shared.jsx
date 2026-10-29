// 奶龙国皇家礼宾与活动署 — shared UI atoms: status tags, date formatting,
// QR canvas, private uploads/previews, CSV exports and the error toast mapper.
/* eslint-disable react/only-export-components */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import QRCode from 'qrcode';
import { Tag } from 'animal-island-ui';
import { getAccessToken } from '../../api/client.js';
import { toast } from '../../components/toast.js';

// 状态语义 → 标签配色:成功/通过/有效/已使用=app-green,驳回/拒绝/作废/撤销/冻结=app-red,
// 待处理/审核中/候补/补件/待使用=warm-peach-pink,进行中/报名中=app-blue,
// 草稿/结束/截止/过期=brown。状态标签一律 variant="soft"。
const STATUS_STYLE = {
  draft: { color: 'brown', variant: 'soft' },
  pending_publish: { color: 'warm-peach-pink', variant: 'soft' },
  registration: { color: 'app-blue', variant: 'soft' },
  registration_closed: { color: 'brown', variant: 'soft' },
  ongoing: { color: 'app-blue', variant: 'soft' },
  ended: { color: 'brown', variant: 'soft' },
  cancelled: { color: 'app-red', variant: 'soft' },
  pending_review: { color: 'warm-peach-pink', variant: 'soft' },
  approved: { color: 'app-green', variant: 'soft' },
  waitlisted: { color: 'warm-peach-pink', variant: 'soft' },
  rejected: { color: 'app-red', variant: 'soft' },
  checked_in: { color: 'app-green', variant: 'soft' },
  finished: { color: 'brown', variant: 'soft' },
  valid: { color: 'app-green', variant: 'soft' },
  used: { color: 'app-green', variant: 'soft' },
  expired: { color: 'brown', variant: 'soft' },
  revoked: { color: 'app-red', variant: 'soft' },
  certified: { color: 'app-green', variant: 'soft' },
  frozen: { color: 'warm-peach-pink', variant: 'soft' },
  supplement_required: { color: 'warm-peach-pink', variant: 'soft' },
  pending: { color: 'warm-peach-pink', variant: 'soft' },
  voided: { color: 'app-red', variant: 'soft' },
};

export function StatusTag({ status, size }) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[status] ?? { color: 'brown', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant} size={size}>
      {t(`protocol.status.${status}`, { defaultValue: status })}
    </Tag>
  );
}

export const EVENT_STATUS_COLORS = {
  draft: 'brown',
  pending_publish: 'warm-peach-pink',
  registration: 'app-blue',
  registration_closed: 'brown',
  ongoing: 'app-blue',
  ended: 'brown',
  cancelled: 'app-red',
};

export const REG_STATUS_COLORS = {
  draft: 'brown',
  pending_review: 'warm-peach-pink',
  approved: 'app-green',
  waitlisted: 'warm-peach-pink',
  rejected: 'app-red',
  cancelled: 'app-red',
  checked_in: 'app-green',
  finished: 'brown',
};

export const INV_STATUS_COLORS = {
  valid: 'app-green',
  used: 'app-green',
  expired: 'brown',
  revoked: 'app-red',
};

export const PASS_STATUS_COLORS = {
  pending: 'warm-peach-pink',
  used: 'app-green',
  expired: 'brown',
  voided: 'app-red',
};

export const HOST_STATUS_COLORS = {
  draft: 'brown',
  pending_review: 'warm-peach-pink',
  supplement_required: 'warm-peach-pink',
  certified: 'app-green',
  frozen: 'warm-peach-pink',
  rejected: 'app-red',
  revoked: 'app-red',
};

export const COURTESY_STATUS_COLORS = {
  pending_review: 'warm-peach-pink',
  approved: 'app-green',
  rejected: 'app-red',
  used: 'app-green',
  cancelled: 'app-red',
  expired: 'brown',
};

export function fmtDate(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD') : '-';
}

export function fmtDateTime(iso) {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : '-';
}

export function fmtTime(iso) {
  return iso ? dayjs(iso).format('HH:mm') : '';
}

export function protocolErrMsg(t, err) {
  return t(`api.${err?.code}`, { defaultValue: err?.message || t('api.INTERNAL_ERROR') });
}

export function protocolToast(kind, message) {
  toast(kind, message);
}

export const toastSuccess = (message) => protocolToast('success', message);
export const toastError = (message) => protocolToast('error', message);

export function toastProtocolError(t, err) {
  toastError(protocolErrMsg(t, err));
}

export function TextArea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`protocol-textarea ${className}`} {...rest} />;
}

// 二维码只承载验真 URL(不可猜测 token),不含任何个人信息。
export function ProtocolQr({ value, size = 168 }) {
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
  return <canvas ref={ref} className="protocol-qr" role="img" aria-label="QR" />;
}

export async function downloadProtocolFile(path, filename) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  if (!res.ok) throw Object.assign(new Error('download failed'), { code: 'INTERNAL_ERROR' });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function openProtocolMaterial(id) {
  await downloadProtocolFile(`/protocol/materials/${id}/file`);
}

export function uploadProtocolMaterial({ ownerType, ownerId, kind, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/protocol/materials');
    xhr.setRequestHeader('Authorization', `Bearer ${getAccessToken()}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error body
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data.material);
      else reject(Object.assign(new Error(data.message || 'upload failed'), { code: data.code || 'INTERNAL_ERROR', status: xhr.status }));
    };
    xhr.onerror = () => reject(Object.assign(new Error('network error'), { code: 'NETWORK_ERROR' }));
    const form = new FormData();
    form.append('file', file);
    form.append('ownerType', ownerType);
    form.append('ownerId', String(ownerId));
    form.append('kind', kind);
    xhr.send(form);
  });
}

export async function exportProtocolCsv(path, filename) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  if (!res.ok) throw Object.assign(new Error('export failed'), { code: 'INTERNAL_ERROR' });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function DescList({ rows }) {
  return (
    <dl className="protocol-field-list">
      {rows.map(([label, value]) => (
        <div key={String(label)} className="protocol-field-row">
          <dt>{label}</dt>
          <dd>{value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatusNote({ children }) {
  return <div className="protocol-status-note">{children}</div>;
}