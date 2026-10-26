// Shared acceptance-script helper. A fresh database intentionally has no
// users, so smoke scripts run the first-run setup once before logging in as
// admin. On databases where setup already happened this is a cheap no-op.
const DEFAULT_ADMIN = {
  username: 'admin',
  password: process.env.ADMIN_PASSWORD || 'admin123',
  displayName: '站长',
  email: 'admin@nailong.local',
};

export async function ensureAdmin(base, overrides = {}) {
  const admin = { ...DEFAULT_ADMIN, ...overrides };

  const statusRes = await fetch(`${base}/api/setup/status`);
  const status = await statusRes.json().catch(() => ({}));
  if (!status.required) return admin;

  const res = await fetch(`${base}/api/setup/admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(admin),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.code !== 'SETUP_COMPLETE') {
    throw new Error(`ensureAdmin failed: HTTP ${res.status} ${data.code || ''} ${data.message || ''}`.trim());
  }
  return admin;
}