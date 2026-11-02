// 奶龍國皇家申訴與監察署 — authenticated downloads (CSV exports). Plain links
// can't carry the in-memory token, so fetch to a blob and trigger a download.
import { getAccessToken, getLocaleHeader } from './client.js';

export async function downloadAppealFile(path, filename) {
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
