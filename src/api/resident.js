// 奶龙国皇家居民登记署 — API helpers beyond the JSON wrapper: authenticated
// CSV/file downloads with the in-memory token.
import { getAccessToken, getLocaleHeader } from './client.js';

// Authenticated file downloads (CSV exports) — plain links can't carry the
// in-memory token, so fetch to a blob and trigger a download.
export async function downloadResidentFile(path, filename) {
  const res = await fetch(`/api${path}`, { headers: { ...getLocaleHeader(), Authorization: `Bearer ${getAccessToken()}` } });
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
