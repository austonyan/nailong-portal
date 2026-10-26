// 皇家口岸入境署 — end-to-end smoke/acceptance script.
// Usage: NAILONG_DATA_DIR=<dir> PORT=<port> node server/immigration/smoke.mjs
// Boots the real Express app on an isolated data dir and walks the whole
// traveler journey: register -> draft -> submit -> officer approve -> pass
// code -> verification -> entry stamp -> exit record -> messages -> verify URL.
import process from 'node:process';
import { ensureAdmin } from '../scripts/bootstrap-admin.mjs';

const PORT = Number(process.env.SMOKE_PORT) || 3210;
const BASE = `http://127.0.0.1:${PORT}/api`;
process.env.PORT = String(PORT);
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  await import('../index.js');
  await new Promise((r) => setTimeout(r, 600));

  // -- registration & RBAC -------------------------------------------------
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { username: 'smoke_traveler', password: 'password123', displayName: '冒烟旅客' },
  });
  check('register traveler', reg.status === 201 && reg.data.accessToken);
  const user = reg.data.accessToken;

  await ensureAdmin(`http://127.0.0.1:${PORT}`);
  const adminLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  check('admin login', adminLogin.status === 200);
  const admin = adminLogin.data.accessToken;

  // admin needs 边检员-style abilities; admin role owns every imm:* permission.
  const services = await api('/services', { token: user });
  check('immigration service card visible', services.data.items?.some((s) => s.key === 'immigration'));

  const overview = await api('/immigration/overview', { token: user });
  check('overview has ROYAL_PORT', overview.status === 200 && overview.data.ports?.[0]?.code === 'ROYAL_PORT');
  check('overview has crowding meter', typeof overview.data.crowding?.percent === 'number');

  // -- declaration lifecycle ----------------------------------------------
  const bad = await api('/immigration/declarations', {
    method: 'POST',
    token: user,
    body: { portCode: 'ROYAL_PORT', nickname: 'x', contact: 'x', purpose: 'fun', stayDays: 0 },
  });
  check('invalid stayDays rejected', bad.status === 400);

  let decl = await api('/immigration/declarations', {
    method: 'POST',
    token: user,
    body: {
      portCode: 'ROYAL_PORT',
      nickname: '奶龙小队',
      contact: 'nailong@example.com',
      purpose: 'fun',
      stayDays: 3,
      companions: 1,
      address: '奶龙湾 1 号沙滩',
      items: [
        { key: 'plush', qty: 2 },
        { key: 'snacks', qty: 5 },
      ],
      visaNo: 'NL-8888-TEST',
    },
  });
  check('create draft', decl.status === 201 && decl.data.declaration?.status === 'draft');
  const declId = decl.data.declaration?.id;

  const edit = await api(`/immigration/declarations/${declId}`, {
    method: 'PATCH',
    token: user,
    body: { companions: 2 },
  });
  check('edit draft', edit.status === 200 && edit.data.declaration?.companions === 2);

  const submitted = await api(`/immigration/declarations/${declId}/submit`, {
    method: 'POST',
    token: user,
    body: {},
  });
  check('submit -> pending', submitted.status === 200 && submitted.data.declaration?.status === 'pending');

  const dup = await api('/immigration/declarations', {
    method: 'POST',
    token: user,
    body: {
      portCode: 'ROYAL_PORT', nickname: 'again', contact: 'a@a.com', purpose: 'fun', stayDays: 1, visaNo: 'NL-8888-TEST',
    },
  });
  const dupSubmit = dup.data.declaration
    ? await api(`/immigration/declarations/${dup.data.declaration.id}/submit`, { method: 'POST', token: user, body: {} })
    : null;
  check('duplicate active declaration blocked', dupSubmit?.data?.code === 'IMM_DUPLICATE');

  // -- officer review -------------------------------------------------------
  const queue = await api('/immigration/admin/declarations?status=pending', { token: admin });
  check('queue contains submission', queue.status === 200 && queue.data.items?.some((d) => d.id === declId));

  const forbiddenApprove = await api(`/immigration/admin/declarations/${declId}/approve`, { method: 'POST', token: user });
  check('traveler cannot approve (403)', forbiddenApprove.status === 403);

  const badVisa = await api('/immigration/visa/check', { method: 'POST', token: user, body: { visaNo: 'NL-1111-TEST' } });
  check('expired visa sentinel', badVisa.data?.result === 'expired');

  const remoteVisa = await api('/immigration/visa/check', { method: 'POST', token: user, body: { visaNo: 'NLT-20261025-ABCD1234' } });
  check('remote-format visa deferred to linkage', remoteVisa.data?.result === 'not_found');

  const approve = await api(`/immigration/admin/declarations/${declId}/approve`, { method: 'POST', token: admin, body: { note: '欢迎' } });
  check('approve -> approved', approve.status === 200 && approve.data.declaration?.status === 'approved');

  // -- pass code + verification ---------------------------------------------
  const codes = await api('/immigration/pass-codes', { token: user });
  check('pass code generated', codes.data.items?.length === 1);
  const codeId = codes.data.items?.[0]?.id;
  const codeDetail = await api(`/immigration/pass-codes/${codeId}`, { token: user });
  const token32 = codeDetail.data.passCode?.token;
  check('pass code token issued', /^[0-9a-f]{32}$/.test(token32 || ''));

  const unknownVerify = await api('/immigration/admin/pass-codes/verify', {
    method: 'POST',
    token: admin,
    body: { codeNo: 'PC20990101-ZZZZZZ' },
  });
  check('unknown code -> unknown', unknownVerify.data?.result === 'unknown');

  const verify = await api('/immigration/admin/pass-codes/verify', {
    method: 'POST',
    token: admin,
    body: { codeNo: codes.data.items?.[0]?.codeNo },
  });
  check('verify accepted + entry record', verify.data?.result === 'accepted' && !!verify.data?.entryRecordNo);

  const verifyAgain = await api('/immigration/admin/pass-codes/verify', {
    method: 'POST',
    token: admin,
    body: { codeNo: codes.data.items?.[0]?.codeNo },
  });
  check('replay verify -> already_used', verifyAgain.data?.result === 'used');

  const publicVerify = await api(`/immigration/verify?token=${token32}`);
  check('public verify URL works', publicVerify.status === 200 && publicVerify.data?.status === 'used');

  // -- records ---------------------------------------------------------------
  const entries = await api('/immigration/records/entry', { token: user });
  check('entry record listed', entries.data.items?.length === 1 && entries.data.items[0].status === 'entered');
  const entryId = entries.data.items?.[0]?.id;

  const exit = await api(`/immigration/records/entry/${entryId}/exit`, { method: 'POST', token: user, body: {} });
  check('exit registration', exit.status === 201);
  const exits = await api('/immigration/records/exit', { token: user });
  check('exit record listed', exits.data.items?.length === 1);

  // -- messages ---------------------------------------------------------------
  const messages = await api('/immigration/messages', { token: user });
  const codes_ = messages.data.items?.map((m) => m.templateCode) || [];
  check('messages sent', ['submit_success', 'approved', 'pass_code', 'entry_record'].every((c) => codes_.includes(c)));

  // -- stats + audit -----------------------------------------------------------
  const stats = await api('/immigration/admin/stats', { token: admin });
  check('stats computed', stats.status === 200 && stats.data.statusCounts?.exited === 1);
  const auditLog = await api('/immigration/admin/audit', { token: admin });
  check('audit log written', auditLog.data.items?.some((a) => a.action === 'im:pass.verify'));

  console.log(failures === 0 ? '\nAll immigration smoke checks passed.' : `\n${failures} smoke check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke crashed:', err);
  process.exit(1);
});
