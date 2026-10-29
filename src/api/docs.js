// 文书认证署前端辅助: 材料下载/预览、字节格式化、状态元数据。
import { requestBlob, getAccessToken } from './client.js';
import { fmtDate } from '../lib/date.js';

export { fmtDate, fmtDateTime } from '../lib/date.js';

export function formatBytes(size) {
  const n = Number(size) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function downloadMaterial(id, filename) {
  const blob = await requestBlob(`/docs/materials/${id}/file`);
  saveBlob(blob, filename);
}

const previewCache = new Map();

// 图片材料预览: 拉取私有文件生成 objectURL(带缓存)。
export async function materialPreviewUrl(id) {
  if (previewCache.has(id)) return previewCache.get(id);
  const blob = await requestBlob(`/docs/materials/${id}/file`);
  const url = URL.createObjectURL(blob);
  previewCache.set(id, url);
  return url;
}

export function isImageMime(mime) {
  return String(mime || '').startsWith('image/');
}

// 申请/文书状态 → 标签配色
export const APPLICATION_STATUS_COLORS = {
  draft: 'brown',
  pending: 'warm-peach-pink',
  supplementing: 'warm-peach-pink',
  approved: 'app-green',
  rejected: 'app-red',
  withdrawn: 'brown',
};

export const CERT_STATUS_COLORS = {
  valid: 'app-green',
  used: 'app-green',
  expired: 'brown',
  revoked: 'app-red',
};

export const PURPOSE_KEYS = ['display', 'collect', 'event', 'entry_aux', 'other'];

export const REJECT_REASON_KEYS = ['materials_incomplete', 'info_false', 'type_mismatch', 'biz_invalid', 'duplicate', 'other'];

// 从申请编号/文书编号文本中提取(供验真页预填)
export function normalizeDocNo(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 64);
}

// 证书画布导出 PNG(下载图片用): 按证书字段重绘,不截图 DOM。
export async function exportCertificatePng({ cert, typeName, bizNoLabel, issuer, sealEnabled, labels = {} }) {
  const W = 960;
  const H = 660;
  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const css = getComputedStyle(document.documentElement);
  const token = (name, fallback) => (css.getPropertyValue(name) || '').trim() || fallback;
  const bg = token('--animal-bg-color', '#fdf6e3');
  const text = token('--animal-text-color', '#794f27');
  const muted = token('--animal-text-color-muted', '#a58a63');
  const primary = token('--animal-primary-color', '#19c8b9');
  const border = token('--animal-border-color', '#e8dcc8');
  const red = token('--animal-error-color', '#e05a5a');
  const yellow = token('--animal-warning-color', '#f5c31c');

  // 羊皮纸底 + 双边框
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.strokeStyle = yellow;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  // 标题
  ctx.textAlign = 'center';
  ctx.fillStyle = text;
  ctx.font = '900 34px "Noto Sans SC", sans-serif';
  ctx.fillText(issuer || '', W / 2, 96);
  ctx.font = '700 20px "Noto Sans SC", sans-serif';
  ctx.fillStyle = primary;
  ctx.fillText('CERTIFICATE OF AUTHENTICATION', W / 2, 130);

  // 字段
  const rows = [
    [labels.certNo || '文书编号', cert.certNo],
    [labels.type || '文书类型', typeName],
    [labels.holder || '持有人', cert.holderName],
    [bizNoLabel || labels.bizNo || '关联业务编号', cert.bizNo || '—'],
    [labels.issuedAt || '认证日期', cert.issuedAt ? fmtDate(cert.issuedAt) : ''],
    [labels.expiresAt || '有效期至', cert.expiresAt ? fmtDate(cert.expiresAt) : ''],
  ];
  ctx.textAlign = 'left';
  let y = 190;
  for (const [label, value] of rows) {
    ctx.fillStyle = muted;
    ctx.font = '600 17px "Noto Sans SC", sans-serif';
    ctx.fillText(label, 150, y);
    ctx.fillStyle = text;
    ctx.font = '700 19px "Noto Sans SC", sans-serif';
    ctx.fillText(String(value ?? ''), 320, y);
    y += 46;
  }

  // 印章
  if (sealEnabled) {
    const cx = W - 190;
    const cy = H - 170;
    const r = 76;
    ctx.save();
    ctx.rotate(0);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = red;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = red;
    ctx.textAlign = 'center';
    ctx.font = '700 15px "Noto Sans SC", sans-serif';
    ctx.fillText(labels.seal1 || '皇家文书与', cx, cy - 30);
    ctx.fillText(labels.seal2 || '认证署', cx, cy - 10);
    ctx.font = '900 20px "Noto Sans SC", sans-serif';
    ctx.fillText(labels.seal3 || '认证专用章', cx, cy + 24);
    ctx.restore();
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  saveBlob(blob, `${cert.certNo}.png`);
}
