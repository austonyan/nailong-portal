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

const STATUS_STYLE = {
  draft: { color: 'default', variant: 'outlined' },
  pending_publish: { color: 'app-yellow', variant: 'soft' },
  registration: { color: 'app-green', variant: 'solid' },
  registration_closed: { color: 'app-yellow', variant: 'soft' },
  ongoing: { color: 'app-teal', variant: 'solid' },
  ended: { color: 'default', variant: 'soft' },
  cancelled: { color: 'app-red', variant: 'soft' },
  pending_review: { color: 'app-yellow', variant: 'soft' },
  approved: { color: 'app-green', variant: 'solid' },
  waitlisted: { color: 'app-orange', variant: 'soft' },
  rejected: { color: 'app-red', variant: 'soft' },
  checked_in: { color: 'app-teal', variant: 'solid' },
  finished: { color: 'brown', variant: 'soft' },
  valid: { color: 'app-green', variant: 'solid' },
  used: { color: 'app-blue', variant: 'soft' },
  expired: { color: 'default', variant: 'soft' },
  revoked: { color: 'app-red', variant: 'dashed' },
  certified: { color: 'app-green', variant: 'solid' },
  frozen: { color: 'app-orange', variant: 'soft' },
  supplement_required: { color: 'app-orange', variant: 'soft' },
  pending: { color: 'app-yellow', variant: 'soft' },
  voided: { color: 'app-red', variant: 'dashed' },
};

export function StatusTag({ status, size }) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[status] ?? { color: 'default', variant: 'soft' };
  return (
    <Tag color={style.color} variant={style.variant} size={size}>
      {t(`protocol.status.${status}`, { defaultValue: status })}
    </Tag>
  );
}

export const EVENT_STATUS_COLORS = {
  draft: 'default',
  pending_publish: 'app-yellow',
  registration: 'app-green',
  registration_closed: 'app-yellow',
  ongoing: 'app-teal',
  ended: 'brown',
  cancelled: 'app-red',
};

export const REG_STATUS_COLORS = {
  draft: 'default',
  pending_review: 'app-yellow',
  approved: 'app-green',
  waitlisted: 'app-orange',
  rejected: 'app-red',
  cancelled: 'default',
  checked_in: 'app-teal',
  finished: 'brown',
};

export const INV_STATUS_COLORS = {
  valid: 'app-green',
  used: 'app-blue',
  expired: 'default',
  revoked: 'app-red',
};

export const PASS_STATUS_COLORS = {
  pending: 'app-yellow',
  used: 'app-blue',
  expired: 'default',
  voided: 'app-red',
};

export const HOST_STATUS_COLORS = {
  draft: 'default',
  pending_review: 'app-yellow',
  supplement_required: 'app-orange',
  certified: 'app-green',
  frozen: 'app-orange',
  rejected: 'app-red',
  revoked: 'app-red',
};

export const COURTESY_STATUS_COLORS = {
  pending_review: 'app-yellow',
  approved: 'app-green',
  rejected: 'app-red',
  used: 'app-blue',
  cancelled: 'default',
  expired: 'default',
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