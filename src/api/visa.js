// 奶龍國簽註申請署 — API helpers beyond the JSON wrapper: multipart upload
// (with the in-memory token) and authenticated private-file preview.
import { getAccessToken } from './client.js';

export function uploadVisaMaterial({ applicationId, kind, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/visa/materials');
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
    form.append('applicationId', String(applicationId));
    form.append('kind', kind);
    xhr.send(form);
  });
}

export async function openVisaMaterial(materialId) {
  const res = await fetch(`/api/visa/materials/${materialId}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
  if (!res.ok) throw Object.assign(new Error('preview failed'), { code: 'NOT_FOUND' });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Authenticated file downloads (CSV exports) — plain links can't carry the
// in-memory token, so fetch to a blob and trigger a download.
export async function downloadVisaFile(path, filename) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${getAccessToken()}` } });
  if (!res.ok) throw Object.assign(new Error('download failed'), { code: 'INTERNAL_ERROR' });
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
