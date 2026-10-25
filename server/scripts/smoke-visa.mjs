// 奶龍國簽註申請署 — 端到端验收脚本。
// 用法:先启动 API(server/index.js,PORT 默认 3001),然后:
//   node server/scripts/smoke-visa.mjs [baseUrl]
// 覆盖:注册→申请→材料→提交→审核(通过/补件/驳回)→签发→验真→回写已使用。
const base = process.argv[2] || 'http://localhost:3001';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw) {
    payload = raw;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}/api${path}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const stamp = Date.now().toString(36);
const userName = `smoke_${stamp}`;
const password = 'smoke-pass-123';

async function register(suffix = 'a') {
  const r = await api('/auth/register', {
    method: 'POST',
    body: { username: `${userName}_${suffix}`, password, displayName: `冒烟${stamp}${suffix}` },
  });
  check('注册申请者', r.status === 200 || r.status === 201, JSON.stringify(r.data));
  return r.data.accessToken;
}

async function login(username) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password: username === 'admin' ? 'admin123' : password } });
  check(`登录 ${username}`, !!r.data.accessToken);
  return r.data.accessToken;
}

async function upload(token, applicationId, kind, filename, mime = 'image/png') {
  const form = new FormData();
  form.append('applicationId', String(applicationId));
  form.append('kind', kind);
  form.append('file', new Blob([PNG], { type: mime }), filename);
  const res = await fetch(`${base}/api/visa/materials`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const FIELDS = {
  nickname: `旅人${stamp}`,
  contact: 'nailong@example.com',
  virtualId: 'NL-8888',
  purpose: '观光度假,打卡奶龙雕像',
  planArrive: '2026-12-01',
  planLeave: '2026-12-10',
  itinerary: 'D1 海滩;D2 图鉴馆;D3 流星雨',
};

async function fullFlow(adminToken, userToken) {
  // 首页
  const home = await api('/visa/home', { token: userToken });
  check('署内公告与旅游签注类型', home.status === 200 && home.data.notices.length > 0 && home.data.types.some((t) => t.code === 'TOURIST'));

  // 申请:草稿 → 字段 → 头像 → 提交
  const created = await api('/visa/applications', { method: 'POST', token: userToken, body: { typeCode: 'TOURIST' } });
  check('创建草稿', created.status === 201 && /^NLA-/.test(created.data.application?.appNo || ''));
  const appId = created.data.application.id;
  const appNo = created.data.application.appNo;

  const put = await api(`/visa/applications/${appId}`, { method: 'PUT', token: userToken, body: FIELDS });
  check('保存申请信息', put.status === 200);

  const missingAvatar = await api(`/visa/applications/${appId}/submit`, { method: 'POST', token: userToken, body: { ...FIELDS, entertainmentAgreed: true } });
  check('缺头像时拒绝提交', missingAvatar.status === 400 && missingAvatar.data.code === 'VISA_AVATAR_REQUIRED');

  const up = await upload(userToken, appId, 'avatar', 'avatar.png');
  check('上传头像', up.status === 201, JSON.stringify(up.data));

  const badType = await upload(userToken, appId, 'other', 'evil.bin', 'application/octet-stream');
  check('拒绝非白名单类型', badType.status === 400 || badType.status === 413, JSON.stringify(badType.data));

  const noAgree = await api(`/visa/applications/${appId}/submit`, { method: 'POST', token: userToken, body: { ...FIELDS, entertainmentAgreed: false } });
  check('未勾选娱乐声明拒绝提交', noAgree.status === 400 && noAgree.data.code === 'VISA_AGREEMENT_REQUIRED');

  const submitted = await api(`/visa/applications/${appId}/submit`, { method: 'POST', token: userToken, body: { ...FIELDS, entertainmentAgreed: true } });
  check('提交成功进入待审核', submitted.status === 200 && submitted.data.application.status === 'pending_review');

  const msg = await api('/visa/messages', { token: userToken });
  check('提交成功站内信', msg.data.items.some((m) => m.type === 'submitted'));

  // 审核:补件 → 通过 → 签发
  const queue = await api('/visa/admin/queue?status=pending_review', { token: adminToken });
  check('审核队列可见', queue.data.items.some((a) => a.appNo === appNo));

  const supp = await api(`/visa/admin/applications/${appId}/supplement`, {
    method: 'POST', token: adminToken, body: { comment: '请补充活动凭证', supplementDays: 7 },
  });
  check('要求补件', supp.status === 200 && supp.data.application.status === 'supplement_required');

  const upSup = await upload(userToken, appId, 'proof', 'ticket.png');
  check('补交材料', upSup.status === 201 && upSup.data.material.origin === 'supplement');
  const suppSubmit = await api(`/visa/applications/${appId}/supplement`, { method: 'POST', token: userToken, body: { note: '凭证已补' } });
  check('补件后重新送审', suppSubmit.status === 200 && suppSubmit.data.application.status === 'pending_review');

  const approve = await api(`/visa/admin/applications/${appId}/approve`, { method: 'POST', token: adminToken, body: { comment: '材料齐全' } });
  check('初审通过', approve.status === 200 && approve.data.application.status === 'approved');

  const issue = await api(`/visa/admin/applications/${appId}/issue`, { method: 'POST', token: adminToken, body: {} });
  const permit = issue.data.application?.permit;
  check('签发电子签注', issue.status === 200 && /^NLT-/.test(permit?.visaNo || ''), JSON.stringify(issue.data).slice(0, 200));

  // 我的签注 + 验真
  const permits = await api('/visa/permits', { token: userToken });
  check('我的签注列表', permits.data.items.some((p) => p.visaNo === permit.visaNo && p.status === 'valid'));

  const verify = await api(`/visa/verify?no=${permit.visaNo}`);
  check('编号验真有效', verify.status === 200 && verify.data.found && verify.data.valid === true);
  check('验真结果不含敏感信息', !JSON.stringify(verify.data).includes(userToken) && !verify.data.holderName && !verify.data.nickname);

  const verifyApp = await api(`/visa/verify?no=${appNo}`);
  check('申请编号也能验真', verifyApp.data.found === true);

  // 入境署回写
  const used = await api(`/visa/admin/permits/${permit.visaNo}/mark-used`, { method: 'POST', token: adminToken, body: {} });
  check('回写已使用', used.status === 200);
  const verifyUsed = await api(`/visa/verify?no=${permit.visaNo}`);
  check('验真同步已使用', verifyUsed.data.status === 'used' && verifyUsed.data.valid === false);

  // 驳回路径(独立用户,避开 60s 防重复提交限流)
  const user2Token = await register('b');
  const app2 = await api('/visa/applications', { method: 'POST', token: user2Token, body: { typeCode: 'TOURIST' } });
  const app2Id = app2.data.application.id;
  await upload(user2Token, app2Id, 'avatar', 'a.png');
  await api(`/visa/applications/${app2Id}/submit`, { method: 'POST', token: user2Token, body: { ...FIELDS, entertainmentAgreed: true } });
  const reject = await api(`/visa/admin/applications/${app2Id}/reject`, {
    method: 'POST', token: adminToken, body: { reasonCode: 'info_mismatch', comment: '行程描述与目的不符' },
  });
  check('驳回', reject.status === 200 && reject.data.application.status === 'rejected');
  const detail2 = await api(`/visa/applications/${app2Id}`, { token: user2Token });
  check('驳回原因可见', detail2.data.application.rejectCode === 'info_mismatch');

  // 统计 / 审计 / 导出
  const stats = await api('/visa/admin/stats', { token: adminToken });
  check('统计报表', stats.status === 200 && stats.data.submitted >= 2);
  const auditLog = await api('/visa/admin/audit', { token: adminToken });
  check('审计日志', auditLog.data.items.some((a) => a.action === 'issue_permit'));
  const csv = await fetch(`${base}/api/visa/admin/export.csv`, { headers: { Authorization: `Bearer ${adminToken}` } });
  check('导出 CSV', csv.status === 200 && (await csv.text()).includes('app_no'));
}

const adminToken = await login('admin');
const userToken = await register();
await fullFlow(adminToken, userToken);

console.log(failures === 0 ? '\n全部通过 ✔' : `\n${failures} 项失败 ✘`);
process.exit(failures === 0 ? 0 : 1);
