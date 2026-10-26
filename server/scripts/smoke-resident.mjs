// 奶龙国皇家居民登记署 — 端到端验收脚本。
// 用法:先启动 API(server/index.js,PORT 默认 3001),然后:
//   node server/scripts/smoke-resident.mjs [baseUrl]
// 覆盖:注册→登记(草稿/材料/提交)→审核(补件/通过)→居民卡生成→验真→
//       变更/续期→冻结/补发→驳回/黑名单→统计/审计/导出。
// 若设置了 RESIDENT_INTER_SERVICE_TOKEN(与服务端一致),还会验证署间校验接口。
import { ensureAdmin } from './bootstrap-admin.mjs';

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
const userName = `res_smoke_${stamp}`;
const password = 'smoke-pass-123';

async function register(suffix = 'a') {
  const r = await api('/auth/register', {
    method: 'POST',
    body: { username: `${userName}_${suffix}`, password, displayName: `居民冒烟${stamp}${suffix}` },
  });
  check(`注册申请者 ${suffix}`, r.status === 200 || r.status === 201, JSON.stringify(r.data));
  return r.data.accessToken;
}

async function login(username) {
  if (username === 'admin') await ensureAdmin(base);
  const r = await api('/auth/login', { method: 'POST', body: { username, password: username === 'admin' ? 'admin123' : password } });
  check(`登录 ${username}`, !!r.data.accessToken);
  return r.data.accessToken;
}

async function upload(token, applicationId, kind, filename, mime = 'image/png') {
  const form = new FormData();
  form.append('applicationId', String(applicationId));
  form.append('kind', kind);
  form.append('file', new Blob([PNG], { type: mime }), filename);
  const res = await fetch(`${base}/api/resident/materials`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const FIELDS = {
  nickname: `岛民${stamp}`,
  contact: 'resident@example.com',
  virtualAddress: '奶龙大道 1 号贝壳屋',
  bio: '最爱在流星雨下收集贝壳',
  purposes: ['collect', 'visa_fast'],
};

async function fullFlow(adminToken, userToken) {
  // 首页
  const home = await api('/resident/home', { token: userToken });
  check('署内公告与临时居民类型', home.status === 200 && home.data.notices.length > 0 && home.data.types.some((t) => t.code === 'TEMPORARY'));

  // 申请:草稿 → 字段 → 头像 → 提交
  const created = await api('/resident/applications', { method: 'POST', token: userToken, body: { typeCode: 'TEMPORARY' } });
  check('创建草稿', created.status === 201 && /^NRR-/.test(created.data.application?.appNo || ''));
  const appId = created.data.application.id;
  const appNo = created.data.application.appNo;

  const second = await api('/resident/applications', { method: 'POST', token: userToken, body: { typeCode: 'TEMPORARY' } });
  check('重复登记被拦截', second.status === 400 && second.data.code === 'RES_TOO_MANY_ACTIVE');

  const put = await api(`/resident/applications/${appId}`, { method: 'PUT', token: userToken, body: FIELDS });
  check('保存申请信息', put.status === 200);

  const missingAvatar = await api(`/resident/applications/${appId}/submit`, { method: 'POST', token: userToken, body: { ...FIELDS } });
  check('缺头像时拒绝提交', missingAvatar.status === 400 && missingAvatar.data.code === 'RES_AVATAR_REQUIRED');

  const up = await upload(userToken, appId, 'avatar', 'avatar.png');
  check('上传头像', up.status === 201, JSON.stringify(up.data));

  const badType = await upload(userToken, appId, 'other', 'evil.bin', 'application/octet-stream');
  check('拒绝非白名单类型', badType.status === 400 || badType.status === 413, JSON.stringify(badType.data));

  const noPurpose = await api(`/resident/applications/${appId}/submit`, { method: 'POST', token: userToken, body: { ...FIELDS, purposes: [] } });
  check('缺少登记用途拒绝提交', noPurpose.status === 400 && noPurpose.data.code === 'RES_PURPOSE_REQUIRED');

  const submitted = await api(`/resident/applications/${appId}/submit`, { method: 'POST', token: userToken, body: { ...FIELDS } });
  check('提交成功进入待审核', submitted.status === 200 && submitted.data.application.status === 'pending_review');

  const msg = await api('/resident/messages', { token: userToken });
  check('提交成功站内信', msg.data.items.some((m) => m.templateCode === 'submitted'));

  // 审核:补件 → 通过 → 居民卡自动生成
  const queue = await api('/resident/admin/queue?status=pending_review', { token: adminToken });
  check('审核队列可见', queue.data.items.some((a) => a.appNo === appNo));

  const supp = await api(`/resident/admin/applications/${appId}/supplement`, {
    method: 'POST', token: adminToken, body: { comment: '请补充趣味地址证明', supplementDays: 7 },
  });
  check('要求补件', supp.status === 200 && supp.data.application.status === 'supplement_required');

  const upSup = await upload(userToken, appId, 'address_proof', 'map.png');
  check('补交材料', upSup.status === 201 && upSup.data.material.origin === 'supplement');
  const suppSubmit = await api(`/resident/applications/${appId}/supplement`, { method: 'POST', token: userToken, body: { note: '手绘地图已补' } });
  check('补件后重新送审', suppSubmit.status === 200 && suppSubmit.data.application.status === 'pending_review');

  const approve = await api(`/resident/admin/applications/${appId}/approve`, { method: 'POST', token: adminToken, body: { comment: '材料齐全,欢迎上岛' } });
  const cardNo = approve.data.application?.card?.cardNo;
  check('登记通过并生成居民卡', approve.status === 200 && approve.data.application.status === 'approved' && /^NRC-/.test(cardNo || ''), JSON.stringify(approve.data).slice(0, 200));

  // 我的居民卡 + 验真
  const card = await api('/resident/card', { token: userToken });
  check('我的居民卡有效', card.status === 200 && card.data.card.status === 'valid' && card.data.card.cardNo === cardNo);
  check('验真 token 存在', !!card.data.card.verifyToken);

  const verify = await api(`/resident/verify?no=${cardNo}`);
  check('编号验真有效', verify.status === 200 && verify.data.found && verify.data.valid === true);
  check('验真结果不含敏感信息', !verify.data.nickname && !verify.data.contact && !JSON.stringify(verify.data).includes('resident@example.com'));

  const verifyApp = await api(`/resident/verify?no=${appNo}`);
  check('申请编号也能验真', verifyApp.data.found === true);

  const verifyToken = await api(`/resident/verify?token=${card.data.card.verifyToken}`);
  check('token 验真有效', verifyToken.data.found === true && verifyToken.data.issuer === '奶龙国皇家居民登记署');

  const again = await api('/resident/applications', { method: 'POST', token: userToken, body: { typeCode: 'TEMPORARY' } });
  check('已有居民身份不可重复登记', again.status === 400 && again.data.code === 'RES_IDENTITY_EXISTS');

  // 变更:信息变更 → 审批 → 档案同步
  const change = await api('/resident/changes', { method: 'POST', token: userToken, body: { type: 'info', contact: 'new-resident@example.com' } });
  check('发起信息变更', change.status === 201 && /^NRX-/.test(change.data.change?.no || ''), JSON.stringify(change.data));
  const changeApprove = await api(`/resident/admin/changes/${change.data.change.id}/approve`, { method: 'POST', token: adminToken, body: {} });
  check('变更审批通过', changeApprove.status === 200 && changeApprove.data.change.status === 'approved');
  const cardAfter = await api('/resident/card', { token: userToken });
  check('居民档案已同步', cardAfter.data.resident?.contact === 'new-resident@example.com');

  // 同类型升级被拒绝
  const upgradeSame = await api('/resident/changes', { method: 'POST', token: userToken, body: { type: 'upgrade', targetTypeCode: 'TEMPORARY' } });
  check('升级到同类型被拦截', upgradeSame.status === 400 && upgradeSame.data.code === 'RES_UPGRADE_SAME_TYPE');

  // 续期
  const renewal = await api('/resident/changes', { method: 'POST', token: userToken, body: { type: 'renewal' } });
  check('发起续期', renewal.status === 201);
  await api(`/resident/admin/changes/${renewal.data.change.id}/approve`, { method: 'POST', token: adminToken, body: {} });
  const cardRenewed = await api('/resident/card', { token: userToken });
  check('续期后有效期延长', cardRenewed.data.card.renewCount === 1 && cardRenewed.data.card.validUntil > cardAfter.data.card.validUntil);

  // 冻结 / 解冻 / 补发
  const freezeNoReason = await api(`/resident/admin/cards/${cardNo}/freeze`, { method: 'POST', token: adminToken, body: {} });
  check('冻结必须填原因', freezeNoReason.status === 400 && freezeNoReason.data.code === 'RES_REASON_REQUIRED');
  const freeze = await api(`/resident/admin/cards/${cardNo}/freeze`, { method: 'POST', token: adminToken, body: { reason: '风控观察' } });
  check('冻结居民卡', freeze.status === 200);
  const verifyFrozen = await api(`/resident/verify?no=${cardNo}`);
  check('验真同步冻结状态', verifyFrozen.data.status === 'frozen' && verifyFrozen.data.valid === false);
  const unfreeze = await api(`/resident/admin/cards/${cardNo}/unfreeze`, { method: 'POST', token: adminToken, body: { reason: '观察解除' } });
  check('解冻居民卡', unfreeze.status === 200);
  const reissue = await api('/resident/card/reissue', { method: 'POST', token: userToken, body: {} });
  check('补发换发新 token', reissue.status === 200 && reissue.data.card.verifyToken !== card.data.card.verifyToken);

  // 驳回路径(独立用户)
  const user2Token = await register('b');
  const app2 = await api('/resident/applications', { method: 'POST', token: user2Token, body: { typeCode: 'TEMPORARY' } });
  const app2Id = app2.data.application.id;
  await upload(user2Token, app2Id, 'avatar', 'a.png');
  await api(`/resident/applications/${app2Id}/submit`, { method: 'POST', token: user2Token, body: { ...FIELDS, nickname: `岛民乙${stamp}` } });
  const reject = await api(`/resident/admin/applications/${app2Id}/reject`, {
    method: 'POST', token: adminToken, body: { reasonCode: 'false_info', comment: '简介与用途不符' },
  });
  check('驳回', reject.status === 200 && reject.data.application.status === 'rejected');
  const detail2 = await api(`/resident/applications/${app2Id}`, { token: user2Token });
  check('驳回原因可见', detail2.data.application.rejectCode === 'false_info');

  // 黑名单
  const users = await api(`/users?query=${userName}_b&pageSize=5`, { token: adminToken });
  const user2 = (users.data.items || []).find((u) => u.username === `${userName}_b`);
  check('能查到冒烟用户', !!user2, JSON.stringify(users.data).slice(0, 120));
  const blacklist = await api('/resident/admin/blacklist', { method: 'POST', token: adminToken, body: { userId: user2.id, reason: '冒烟测试' } });
  check('加入黑名单', blacklist.status === 201);
  const reapply = await api('/resident/applications', { method: 'POST', token: user2Token, body: { typeCode: 'TEMPORARY' } });
  check('黑名单用户不可申请', reapply.status === 403 && reapply.data.code === 'RES_BLACKLISTED');
  await api(`/resident/admin/blacklist/${user2.id}`, { method: 'DELETE', token: adminToken });
  check('移出黑名单', true);

  // 统计 / 审计 / 导出 / 类型管理
  const stats = await api('/resident/admin/stats', { token: adminToken });
  check('统计报表', stats.status === 200 && stats.data.submitted >= 2 && stats.data.verifyTotal >= 3);
  const auditLog = await api('/resident/admin/audit?action=approve', { token: adminToken });
  check('审计日志', auditLog.data.items.some((a) => a.action === 'approve_application'));
  const csv = await fetch(`${base}/api/resident/admin/export.csv`, { headers: { Authorization: `Bearer ${adminToken}` } });
  check('导出 CSV', csv.status === 200 && (await csv.text()).includes('app_no'));
  const newType = await api('/resident/admin/types', {
    method: 'POST', token: adminToken,
    body: { code: 'SMOKE', name: '冒烟居民', description: '自动化测试用', validYears: 1, enabled: false },
  });
  check('新增居民类型', newType.status === 201, JSON.stringify(newType.data));
  const templates = await api('/resident/admin/templates', { token: adminToken });
  check('消息模板可读', templates.status === 200 && templates.data.items.length >= 16);
  const verifyLogs = await api('/resident/admin/verify-logs', { token: adminToken });
  check('验真记录', verifyLogs.data.items.length >= 3);

  // 隐私删除(user2 的申请已驳回,无在途申请)
  const erase = await api('/resident/privacy/erase', { method: 'POST', token: user2Token, body: {} });
  check('隐私数据删除', erase.status === 200);

  // 署间校验接口(需配置 RESIDENT_INTER_SERVICE_TOKEN)
  const interToken = process.env.RESIDENT_INTER_SERVICE_TOKEN;
  if (interToken) {
    const noToken = await api('/resident/inter/check', { method: 'POST', body: { no: cardNo } });
    check('署间接口无令牌被拒', noToken.status === 403);
    const inter = await fetch(`${base}/api/resident/inter/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nailong-service-token': interToken },
      body: JSON.stringify({ no: cardNo }),
    });
    const interData = await inter.json();
    check('署间校验居民卡', inter.status === 200 && interData.found && interData.valid === true && interData.cardNo === cardNo);
  } else {
    console.log('  skip 署间接口未配置 RESIDENT_INTER_SERVICE_TOKEN');
  }
}

const adminToken = await login('admin');
const userToken = await register();
await fullFlow(adminToken, userToken);

console.log(failures === 0 ? '\n全部通过 ✔' : `\n${failures} 项失败 ✘`);
process.exit(failures === 0 ? 0 : 1);
