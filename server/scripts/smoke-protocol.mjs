// 奶龙国皇家礼宾与活动署 — 端到端验收脚本。
// 用法:先启动 API(server/index.js,PORT 默认 3001),然后:
//   node server/scripts/smoke-protocol.mjs [baseUrl]
// 覆盖:首页→活动→报名草稿→材料→提交→审核→凭证→验真→邀请函→礼遇→
//       接待方认证→签到→统计/审计/导出。
import { ensureAdmin } from './bootstrap-admin.mjs';

const base = process.argv[2] || 'http://localhost:3001';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw) payload = raw;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}/api${path}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function upload(token, ownerType, ownerId, kind, filename, mime = 'image/png') {
  const form = new FormData();
  form.append('ownerType', ownerType);
  form.append('ownerId', String(ownerId));
  form.append('kind', kind);
  form.append('file', new Blob([PNG], { type: mime }), filename);
  const res = await fetch(`${base}/api/protocol/materials`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

const stamp = Date.now().toString(36);
const username = `proto_${stamp}`;
const password = 'smoke-pass-123';

await ensureAdmin(base);
const adminLogin = await api('/auth/login', { method: 'POST', body: { username: 'admin', password: process.env.ADMIN_PASSWORD || 'admin123' } });
check('管理员登录', !!adminLogin.data.accessToken, JSON.stringify(adminLogin.data));
const adminToken = adminLogin.data.accessToken;

const reg = await api('/auth/register', {
  method: 'POST',
  body: { username, password, displayName: `礼宾冒烟${stamp}` },
});
check('注册测试用户', reg.status === 200 || reg.status === 201, JSON.stringify(reg.data));
const token = reg.data.accessToken;

// --- 首页与活动 -----------------------------------------------------------
const home = await api('/protocol/home', { token });
check('首页分类/公告', home.status === 200 && home.data.types.length >= 6 && home.data.notices.length > 0);
check('首页热门/即将开始', home.data.hot.length > 0 && home.data.upcoming.length > 0);

const events = await api('/protocol/events?open=1', { token });
check('活动列表筛选', events.status === 200 && events.data.items.length > 0);

const event = events.data.items.find((e) => e.seatsLeft > 0 && !e.residentOnly && !e.diplomaticOnly);
check('找到可报名活动', !!event);
const detail = await api(`/protocol/events/${event.eventNo}`, { token });
check('活动详情与日程', detail.status === 200 && Array.isArray(detail.data.event.schedule) && detail.data.notices.length >= 0);

// --- 报名 ----------------------------------------------------------------
const draft = await api('/protocol/registrations', {
  method: 'POST',
  token,
  body: { eventId: event.id, nickname: `冒烟${stamp}`, contact: 'smoke@example.com', partySize: 2, companions: [{ nickname: '随行奶龙', relation: '朋友' }] },
});
check('创建报名草稿', draft.status === 201 && /^NJR/.test(draft.data.registration?.regNo || ''), JSON.stringify(draft.data));
const regId = draft.data.registration.id;
const regNo = draft.data.registration.regNo;

const up = await upload(token, 'registration', regId, 'other', 'note.png');
check('上传报名材料', up.status === 201, JSON.stringify(up.data));
const badFile = await upload(token, 'registration', regId, 'other', 'evil.bin', 'application/octet-stream');
check('拒绝非白名单文件', badFile.status === 400 && badFile.data.code === 'EVT_FILE_TYPE');

const submitted = await api(`/protocol/registrations/${regId}/submit`, { method: 'POST', token, body: {} });
check('提交报名进入待审核', submitted.status === 200 && submitted.data.registration.status === 'pending_review');

const duplicate = await api('/protocol/registrations', { method: 'POST', token, body: { eventId: event.id } });
check('重复报名被拒绝', duplicate.status === 409 && duplicate.data.code === 'EVT_DUPLICATE');

const messages = await api('/protocol/messages', { token });
check('报名提交站内信', messages.data.items.some((m) => m.type === 'registration_submitted'));

// --- 审核与凭证 ----------------------------------------------------------
const queue = await api('/protocol/admin/registrations?status=pending_review', { token: adminToken });
check('审核队列可见', queue.data.items.some((r) => r.regNo === regNo));

const approved = await api(`/protocol/admin/registrations/${regId}/approve`, { method: 'POST', token: adminToken, body: { comment: 'ok' } });
check('审核通过', approved.status === 200 && approved.data.registration.status === 'approved', JSON.stringify(approved.data));
const passNo = approved.data.registration.pass.passNo;
check('自动生成活动凭证', /^NJP/.test(passNo || ''));

const passes = await api('/protocol/passes', { token });
check('我的活动凭证', passes.data.items.some((p) => p.passNo === passNo && p.status === 'pending'));

const verify = await api(`/protocol/verify?no=${encodeURIComponent(passNo)}`);
check('活动凭证公开验真', verify.status === 200 && verify.data.found && verify.data.item.valid === true);
check('验真结果不含个人信息', !JSON.stringify(verify.data).includes('smoke@example.com') && !verify.data.item.holderName);

const verifiedTwice = await api(`/protocol/verify?no=${encodeURIComponent(passNo)}`);
check('验真日志/限流可用', verifiedTwice.status === 200);

// --- 邀请函 --------------------------------------------------------------
const invitation = await api('/protocol/admin/invitations', {
  method: 'POST',
  token: adminToken,
  body: { eventId: event.id, inviteeUsername: username, type: 'event', note: '欢迎参加' },
});
check('发起定向邀请函', invitation.status === 201 && /^NJI/.test(invitation.data.invitation?.inviteNo || ''), JSON.stringify(invitation.data));
const inviteId = invitation.data.invitation.id;
const inviteNo = invitation.data.invitation.inviteNo;

const inbox = await api('/protocol/invitations', { token });
check('被邀请人可见邀请函', inbox.data.items.some((i) => i.inviteNo === inviteNo));
const accepted = await api(`/protocol/invitations/${inviteId}/accept`, { method: 'POST', token });
check('接受邀请', accepted.status === 200 && accepted.data.invitation.response === 'accepted');

const inviteVerify = await api(`/protocol/verify?no=${encodeURIComponent(inviteNo)}`);
check('邀请函公开验真', inviteVerify.data.found && inviteVerify.data.item.kind === 'invitation' && inviteVerify.data.item.visaUsable === true);

// --- 礼遇 ----------------------------------------------------------------
const eligibility = await api('/protocol/courtesy/eligibility', {
  method: 'POST',
  token,
  body: { basisType: 'invitation', basisNo: inviteNo },
});
check('邀请函资格查询', eligibility.status === 200 && eligibility.data.valid === true);

const courtesy = await api('/protocol/courtesy/applications', {
  method: 'POST',
  token,
  body: { typeCode: 'resident_courtesy', basisType: 'invitation', basisNo: inviteNo, note: '礼宾体验' },
});
check('提交礼遇申请', courtesy.status === 201 && courtesy.data.application.status === 'pending_review', JSON.stringify(courtesy.data));
const courtesyId = courtesy.data.application.id;
const courtesyApproved = await api(`/protocol/admin/courtesy/applications/${courtesyId}/approve`, {
  method: 'POST',
  token: adminToken,
  body: { validDays: 7, comment: 'ok' },
});
check('礼遇审核通过', courtesyApproved.status === 200, JSON.stringify(courtesyApproved.data));

// --- 接待方认证 ----------------------------------------------------------
const host = await api('/protocol/hosts', {
  method: 'POST',
  token,
  body: { type: 'community', name: `冒烟社区${stamp}`, contactNickname: '阿冒', contact: 'host@example.com', intro: '虚构社区团体' },
});
check('创建接待方草稿', host.status === 201 && /^NJH/.test(host.data.host?.hostNo || ''), JSON.stringify(host.data));
const hostId = host.data.host.id;
const hostUp = await upload(token, 'host', hostId, 'intro', 'intro.png');
check('上传接待方材料', hostUp.status === 201, JSON.stringify(hostUp.data));
const hostSubmit = await api(`/protocol/hosts/${hostId}/submit`, { method: 'POST', token });
check('提交接待方审核', hostSubmit.status === 200 && hostSubmit.data.host.status === 'pending_review');
const hostApprove = await api(`/protocol/admin/hosts/${hostId}/approve`, { method: 'POST', token: adminToken, body: { comment: 'ok' } });
check('接待方认证通过并生成证书', hostApprove.status === 200 && /^NLC/.test(hostApprove.data.host?.certNo || ''));
const hostVerify = await api(`/protocol/verify?no=${encodeURIComponent(hostApprove.data.host.hostNo)}`);
check('接待方公开验真', hostVerify.data.found && hostVerify.data.item.valid === true);

// --- 签到 ----------------------------------------------------------------
const checkedIn = await api('/protocol/admin/checkin', { method: 'POST', token: adminToken, body: { passNo, action: 'in' } });
check('凭证签到', checkedIn.status === 200 && checkedIn.data.pass.status === 'used', JSON.stringify(checkedIn.data));
const checkedOut = await api('/protocol/admin/checkin', { method: 'POST', token: adminToken, body: { passNo, action: 'out' } });
check('凭证签退', checkedOut.status === 200 && !!checkedOut.data.pass.checkedOutAt);

// --- 统计 / 审计 / 导出 --------------------------------------------------
const stats = await api('/protocol/admin/stats', { token: adminToken });
check('统计报表', stats.status === 200 && stats.data.registrations.total >= 1 && stats.data.checkins >= 1);

const audit = await api('/protocol/admin/audit', { token: adminToken });
check('审计日志', audit.status === 200 && audit.data.items.some((a) => a.action === 'registration_approve'));

const csv = await fetch(`${base}/api/protocol/admin/export/registrations`, {
  headers: { Authorization: `Bearer ${adminToken}` },
});
check('导出报名 CSV', csv.status === 200 && (await csv.text()).includes('报名编号'));

// --- 隐私(独立用户,主用户仍有进行中的活动记录)------------------------
const clean = await api('/auth/register', {
  method: 'POST',
  body: { username: `${username}_clean`, password, displayName: `隐私冒烟${stamp}` },
});
const erase = await api('/protocol/privacy/erase', { method: 'POST', token: clean.data.accessToken });
check('隐私数据匿名化', erase.status === 200, JSON.stringify(erase.data));

console.log(failures === 0 ? '\n全部通过 ✔' : `\n${failures} 项失败 ✘`);
process.exit(failures === 0 ? 0 : 1);