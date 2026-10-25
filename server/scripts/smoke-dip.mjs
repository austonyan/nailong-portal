// 奶龙国皇家外交事务署 — 端到端验收脚本。
// 用法:先启动 API(DIP_INTER_SERVICE_TOKEN 建议同时设置,PORT 默认 3001),然后:
//   node server/scripts/smoke-dip.mjs [baseUrl] [interToken]
// 覆盖:建交申请(草稿/材料/确认/补件/通过)→ 外交身份(登记/通过/身份卡)
//       → 互免协议(创建/公示/资格查询)→ 验真(编号/token/脱敏)
//       → 断交(申请/复核/身份级联失效)→ 代表处/礼遇/统计/审计/黑名单/联动 stub。
const base = process.argv[2] || 'http://localhost:3001';
const interToken = process.argv[3] || process.env.DIP_INTER_SERVICE_TOKEN || 'smoke-dip-token';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}/api${path}`, { method, headers: h, body: payload });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function upload(token, ownerType, ownerId, filename = 'intro.png') {
  const form = new FormData();
  form.append('kind', ownerType === 'identity' ? 'appointment' : 'intro');
  form.append('file', new Blob([PNG], { type: 'image/png' }), filename);
  const res = await fetch(`${base}/api/dip/materials/${ownerType}/${ownerId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const stamp = Date.now().toString(36);
const ENTITY = `喵星联合王国${stamp}`;
const password = 'smoke-pass-123';

async function register(suffix = 'a') {
  const r = await api('/auth/register', {
    method: 'POST',
    body: { username: `dipsmoke_${stamp}_${suffix}`, password, displayName: `外冒${stamp}${suffix}` },
  });
  check(`注册用户 ${suffix}`, r.status === 200 || r.status === 201, JSON.stringify(r.data));
  return r.data.accessToken;
}

async function login(username) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password: username === 'admin' ? 'admin123' : password } });
  check(`登录 ${username}`, !!r.data.accessToken);
  return r.data.accessToken;
}

// ---------------------------------------------------------------------------
const adminToken = await login('admin');
const userToken = await register('a');
const user2Token = await register('b');

// --- 首页总览 ---------------------------------------------------------------
const overview = await api('/dip/overview', { token: userToken });
check(
  '首页:公告/对象类型/建交类型/礼遇类型',
  overview.status === 200 &&
    overview.data.notices.length > 0 &&
    overview.data.objectTypes.some((t) => t.code === 'VIRTUAL_NATION' && t.enabled) &&
    overview.data.relationTypes.some((t) => t.code === 'FORMAL' && t.enabled) &&
    overview.data.courtesyTypes.length > 0,
  JSON.stringify(overview.data).slice(0, 200)
);

// --- 建交申请闭环 -----------------------------------------------------------
const created = await api('/dip/relations', {
  method: 'POST',
  token: userToken,
  body: { objectType: 'VIRTUAL_NATION', relationType: 'FORMAL', entityName: ENTITY, repNickname: '喵大使', contact: 'cat@example.com', reason: '为了趣味与友谊', purpose: 'display', courtesies: ['ENTRY_LANE'] },
});
check('创建建交草稿', created.status === 201 && /^NLD/.test(created.data.relation?.no || ''), JSON.stringify(created.data).slice(0, 200));
const rel = created.data.relation;

const up = await upload(userToken, 'relation', rel.id);
check('上传建交材料', up.status === 201 && up.data.material?.origin === 'initial', JSON.stringify(up.data).slice(0, 150));

const badTypeRes = await fetch(`${base}/api/dip/materials/relation/${rel.id}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${userToken}` },
  body: (() => { const f = new FormData(); f.append('file', new Blob([Buffer.from('MZ')], { type: 'application/octet-stream' }), 'evil.bin'); return f; })(),
});
check('拒绝非白名单文件类型', badTypeRes.status === 400, String(badTypeRes.status));

const submitted = await api(`/dip/relations/${rel.id}/submit`, { method: 'POST', token: userToken, body: {} });
check('提交进入待审核', submitted.status === 200 && submitted.data.relation.status === 'pending_review');

const dup = await api('/dip/relations', { method: 'POST', token: userToken, body: { objectType: 'VIRTUAL_NATION', relationType: 'FORMAL', entityName: `${ENTITY}2`, repNickname: '喵大使', contact: 'cat@example.com', reason: 'x', purpose: 'display' } });
await upload(userToken, 'relation', dup.data.relation.id);
const dupSubmit = await api(`/dip/relations/${dup.data.relation.id}/submit`, { method: 'POST', token: userToken, body: {} });
check('重复在途申请被拦截', dupSubmit.status === 409 && dupSubmit.data.code === 'DIP_DUPLICATE', JSON.stringify(dupSubmit.data));

const queue = await api('/dip/admin/relations?status=pending_review', { token: adminToken });
check('审核队列可见', queue.data.items.some((r) => r.no === rel.no));

const supp = await api(`/dip/admin/relations/${rel.id}/supplement`, { method: 'POST', token: adminToken, body: { note: '请补充社区证明' } });
check('要求补件', supp.status === 200 && supp.data.relation.status === 'supplement_required');

const upSup = await upload(userToken, 'relation', rel.id, 'community.png');
check('补交材料标记 supplement', upSup.status === 201 && upSup.data.material.origin === 'supplement');
const suppSubmit = await api(`/dip/relations/${rel.id}/supplement`, { method: 'POST', token: userToken, body: { content: '社区证明已补' } });
check('补件后重新送审', suppSubmit.status === 200 && suppSubmit.data.relation.status === 'pending_review');

const establish = await api(`/dip/admin/relations/${rel.id}/approve`, { method: 'POST', token: adminToken, body: { note: '材料齐全' } });
check('建交通过', establish.status === 200 && establish.data.relation.status === 'established');

const msgs = await api('/dip/messages', { token: userToken });
check('建交通过站内信', msgs.data.items.some((m) => m.templateCode === 'relation_established'));

// --- 外交身份闭环 -----------------------------------------------------------
const myRelations = await api('/dip/relations', { token: userToken });
const relId = myRelations.data.items.find((r) => r.id === rel.id).id;
const idtCreated = await api('/dip/identities', {
  method: 'POST',
  token: userToken,
  body: { identityType: 'ENVOY', relationId: relId, nickname: '喵大使', contact: 'envoy@example.com', title: '驻奶龙国使节', termStart: '2026-01-01', termEnd: '2026-12-31' },
});
check('创建身份草稿', idtCreated.status === 201 && /^NLE/.test(idtCreated.data.identity?.no || '') && idtCreated.data.identity.entityName === ENTITY);
const idt = idtCreated.data.identity;

const idtNoMat = await api(`/dip/identities/${idt.id}/submit`, { method: 'POST', token: userToken, body: {} });
check('缺任命书拒绝提交', idtNoMat.status === 400 && idtNoMat.data.code === 'DIP_MATERIAL_REQUIRED');

await upload(userToken, 'identity', idt.id, 'appointment.png');
const idtSubmitted = await api(`/dip/identities/${idt.id}/submit`, { method: 'POST', token: userToken, body: {} });
check('身份提交进入待审核', idtSubmitted.status === 200 && idtSubmitted.data.identity.status === 'pending_review');

const idtApprove = await api(`/dip/admin/identities/${idt.id}/approve`, { method: 'POST', token: adminToken, body: { note: '任命书齐全' } });
check('身份通过生效', idtApprove.status === 200 && idtApprove.data.identity.status === 'active');

const courtesies = await api('/dip/courtesies', { token: userToken });
check('身份通过自动授予礼遇记录', courtesies.data.items.some((c) => c.identity_no === idt.no));

const card = await api(`/dip/identities/${idt.id}/card`, { token: userToken });
check('外交身份卡与验真 token', card.status === 200 && /^\/dip\/verify\?token=[0-9a-f]{32}$/.test(card.data.card?.verifyPath || ''));

// --- 验真(公开 + 脱敏) -----------------------------------------------------
const verifyIdt = await api('/dip/verify', { method: 'POST', body: { code: idt.no } });
check(
  '编号验真:身份有效且脱敏',
  verifyIdt.status === 200 && verifyIdt.data.found && verifyIdt.data.item.valid === true &&
    !JSON.stringify(verifyIdt.data).includes('envoy@example.com') && verifyIdt.data.item.issuedBy,
  JSON.stringify(verifyIdt.data).slice(0, 200)
);

const tokenQ = card.data.card.verifyPath.split('token=')[1];
const verifyToken = await api(`/dip/verify?token=${tokenQ}`);
check('扫码验真(token)', verifyToken.data.found && verifyToken.data.item.no === idt.no);

const verifyMiss = await api('/dip/verify', { method: 'POST', body: { code: `NLD00000000-ZZZZZZ` } });
check('未知编号返回 not_found(防枚举)', verifyMiss.status === 200 && verifyMiss.data.found === false);

// --- 互免协议 ---------------------------------------------------------------
const agrCreated = await api('/dip/admin/agreements', {
  method: 'POST',
  token: adminToken,
  body: { partyA: '奶龙国', partyB: ENTITY, type: 'entry_courtesy', courtesies: '互相免除虚拟入境手续', coveredScope: '持有效外交身份的使团成员', effectiveFrom: '2026-01-01', effectiveTo: '2027-01-01', published: true },
});
check('创建互免协议并即时生效', agrCreated.status === 201 && /^NLG/.test(agrCreated.data.agreement?.no || '') && agrCreated.data.agreement.status === 'active');
const agr = agrCreated.data.agreement;

const eligible = await api('/dip/agreements/eligibility', { method: 'POST', token: userToken, body: { code: rel.no } });
check('凭建交编号查互免资格', eligible.status === 200 && eligible.data.items.some((a) => a.no === agr.no), JSON.stringify(eligible.data).slice(0, 200));

const eligibleIdt = await api('/dip/agreements/eligibility', { method: 'POST', token: userToken, body: { code: idt.no } });
check('凭身份编号查互免资格', eligibleIdt.data.items?.some((a) => a.no === agr.no));

if (agr) {
  const agrTerminated = await api(`/dip/admin/agreements/${agr.id}/status`, { method: 'POST', token: adminToken, body: { status: 'terminated' } });
  check('终止协议', agrTerminated.status === 200 && agrTerminated.data.agreement.status === 'terminated');
} else {
  failures += 1;
  console.error('FAIL  终止协议(协议未创建,JSON: ' + JSON.stringify(agrCreated.data).slice(0, 200) + ')');
}

// --- 礼遇 / 代表处 ----------------------------------------------------------
const courtesyCheck = await api('/dip/courtesies/check', { method: 'POST', token: userToken, body: { code: idt.no } });
check('凭身份编号查礼遇资格', courtesyCheck.status === 200 && courtesyCheck.data.types.length > 0);

const offices = await api('/dip/offices', { token: userToken });
check('虚构代表处列表', offices.status === 200 && offices.data.items.length >= 1);

const office = await api('/dip/offices/OFC_CENTRAL', { token: userToken });
check('代表处详情', office.status === 200 && office.data.office.code === 'OFC_CENTRAL');

// --- 断交:申请 → 复核 → 身份级联失效 --------------------------------------
const severReq = await api(`/dip/relations/${rel.id}/sever`, { method: 'POST', token: userToken, body: { reason: '世界观整合' } });
check('断交申请受理', severReq.status === 200 && severReq.data.relation.status === 'sever_requested');

const sever = await api(`/dip/admin/relations/${rel.id}/sever`, { method: 'POST', token: adminToken, body: { approve: true } });
check('断交复核通过', sever.status === 200 && sever.data.relation.status === 'severed');

const idtAfter = await api(`/dip/identities/${idt.id}`, { token: userToken });
check('断交后外交身份级联失效', idtAfter.data.identity.status === 'expired' && idtAfter.data.identity.inactiveReason === 'relation_severed');

const verifyAfter = await api('/dip/verify', { method: 'POST', body: { code: idt.no } });
check('失效身份验真为无效', verifyAfter.data.found && verifyAfter.data.item.valid === false);

// --- 驳回路径(用户 B) ------------------------------------------------------
const relB = await api('/dip/relations', { method: 'POST', token: user2Token, body: { objectType: 'VIRTUAL_NATION', relationType: 'FORMAL', entityName: `汪星共和国${stamp}`, repNickname: '汪大使', contact: 'dog@example.com', reason: '汪!', purpose: 'display' } });
await upload(user2Token, 'relation', relB.data.relation.id);
await api(`/dip/relations/${relB.data.relation.id}/submit`, { method: 'POST', token: user2Token, body: {} });
const reject = await api(`/dip/admin/relations/${relB.data.relation.id}/reject`, {
  method: 'POST',
  token: adminToken,
  body: { reason: 'info_false', comment: '介绍与凭证对不上' },
});
check('驳回并可见原因', reject.status === 200 && reject.data.relation.status === 'rejected');
const detailB = await api(`/dip/relations/${relB.data.relation.id}`, { token: user2Token });
check('驳回原因可见', detailB.data.relation.rejectCode === 'info_false');

// --- 黑名单(观察/限制) ----------------------------------------------------
const users = await api('/users?query=dipsmoke', { token: adminToken }).catch(() => ({ data: { items: [] } }));
const userB = (users.data.items || []).find((u) => u.username === `dipsmoke_${stamp}_b`);
if (userB) {
  const blAdd = await api('/dip/admin/blacklist', { method: 'POST', token: adminToken, body: { userId: userB.id, level: 'block', reason: '冒烟测试限制' } });
  check('加入黑名单', blAdd.status === 201);
  const blocked = await api('/dip/relations', {
    method: 'POST',
    token: user2Token,
    body: { objectType: 'VIRTUAL_NATION', relationType: 'FORMAL', entityName: `汪星2${stamp}`, repNickname: '汪', contact: 'd@example.com', reason: 'x', purpose: 'display' },
  });
  check('黑名单限制提交', blocked.status === 403 && blocked.data.code === 'DIP_BLACKLISTED', JSON.stringify(blocked.data));
  const lifted = await api(`/dip/admin/blacklist/${blAdd.data.id}/lift`, { method: 'POST', token: adminToken });
  check('移出黑名单', lifted.status === 200);
} else {
  failures += 1;
  console.error('FAIL  黑名单流程(未找到用户 B)');
}

// --- 联动预留 stub(服务令牌) ----------------------------------------------
const interNoToken = await api('/dip/inter/identity/check', { method: 'POST', body: { no: idt.no } });
check('联动 stub:无令牌拒绝', interNoToken.status === 403 && interNoToken.data.code === 'SERVICE_FORBIDDEN');

const interBad = await api('/dip/inter/identity/check', { method: 'POST', body: { no: idt.no }, headers: { 'x-nailong-service-token': 'wrong' } });
check('联动 stub:错误令牌拒绝', interBad.status === 403);

const interOk = await api('/dip/inter/identity/check', { method: 'POST', body: { no: idt.no }, headers: { 'x-nailong-service-token': interToken } });
check('联动 stub:身份校验(脱敏)', interOk.status === 200 && interOk.data.found && interOk.data.valid === false && !JSON.stringify(interOk.data).includes('envoy@example.com'));

// --- 统计 / 审计 / 验真记录 / 配置 -----------------------------------------
const stats = await api('/dip/admin/stats', { token: adminToken });
check('统计报表', stats.status === 200 && stats.data.submittedRelations >= 2 && stats.data.verifyQueries >= 3 && stats.data.trend.length === 7);

const auditLog = await api('/dip/admin/audit?action=dip:relation.establish', { token: adminToken });
check('审计日志', auditLog.data.items.some((a) => a.target_id === rel.no));

const verifyLogs = await api('/dip/admin/verify-logs', { token: adminToken });
check('验真记录可查询', verifyLogs.status === 200 && verifyLogs.data.total >= 3);

const config = await api('/dip/admin/config', { token: adminToken });
check('类型与配置读取', config.status === 200 && config.data.objectTypes.length > 0 && config.data.settings.length > 0);

const settingsPut = await api('/dip/admin/config/settings', {
  method: 'PUT',
  token: adminToken,
  body: { items: [{ key: 'verify_limit_per_5min', value: '30' }] },
});
check('限流配置保存', settingsPut.status === 200);

const templates = await api('/dip/admin/templates', { token: adminToken });
check('消息模板列表', templates.status === 200 && templates.data.items.length >= 10);

const interTypes = await api('/dip/inter/courtesies/whatever', { headers: { 'x-nailong-service-token': interToken } });
check('联动 stub:礼遇通道查询(未匹配)', interTypes.status === 200 && interTypes.data.found === false);

console.log(failures === 0 ? '\n全部通过 ✔' : `\n${failures} 项失败 ✘`);
process.exit(failures === 0 ? 0 : 1);
