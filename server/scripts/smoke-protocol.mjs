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

// --- 第二/第三报名人(供 inter 核销、凭证补发与活动取消断言)---------------
const token2 = (await api('/auth/register', { method: 'POST', body: { username: `${username}_b`, password, displayName: `礼宾冒烟${stamp}乙` } })).data.accessToken;
const reg2 = await api('/protocol/registrations', {
  method: 'POST', token: token2,
  body: { eventId: event.id, nickname: `冒烟乙${stamp}`, contact: 'smoke2@example.com', partySize: 1, companions: [] },
});
const reg2Submit = await api(`/protocol/registrations/${reg2.data.registration.id}/submit`, { method: 'POST', token: token2, body: {} });
check('乙报名提交', reg2Submit.status === 200, JSON.stringify(reg2Submit.data).slice(0, 200));
const approved2 = await api(`/protocol/admin/registrations/${reg2.data.registration.id}/approve`, { method: 'POST', token: adminToken, body: { comment: 'ok' } });
const pass2No = approved2.data.registration?.pass?.passNo;
check('乙审核通过并生成凭证', approved2.status === 200 && /^NJP/.test(pass2No || ''), JSON.stringify(approved2.data).slice(0, 200));
const token3 = (await api('/auth/register', { method: 'POST', body: { username: `${username}_c`, password, displayName: `礼宾冒烟${stamp}丙` } })).data.accessToken;
const reg3 = await api('/protocol/registrations', {
  method: 'POST', token: token3,
  body: { eventId: event.id, nickname: `冒烟丙${stamp}`, contact: 'smoke3@example.com', partySize: 1, companions: [] },
});
const reg3Submit = await api(`/protocol/registrations/${reg3.data.registration.id}/submit`, { method: 'POST', token: token3, body: {} });
check('丙报名提交(保持待审)', reg3Submit.status === 200, JSON.stringify(reg3Submit.data).slice(0, 200));

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
const hostSubmit = await api(`/protocol/hosts/${hostId}/submit`, { method: 'POST', token });
check('提交接待方审核', hostSubmit.status === 200 && hostSubmit.data.host.status === 'pending_review');
const hostApprove = await api(`/protocol/admin/hosts/${hostId}/approve`, { method: 'POST', token: adminToken, body: { comment: 'ok' } });
check('接待方认证通过并生成证书', hostApprove.status === 200 && /^NLC/.test(hostApprove.data.host?.certNo || ''));
const hostVerify = await api(`/protocol/verify?no=${encodeURIComponent(hostApprove.data.host.hostNo)}`);
check('接待方公开验真', hostVerify.data.found && hostVerify.data.item.valid === true);

// --- 签到 ----------------------------------------------------------------
// 活动未开始不可入场(种子活动尚未开始时断言;随后把窗口调到现在)
if (event.startsAt && new Date(event.startsAt).getTime() > Date.now()) {
  const tooEarly = await api('/protocol/admin/checkin', { method: 'POST', token: adminToken, body: { passNo, action: 'in' } });
  check('活动未开始拒绝签到', tooEarly.status === 409 && tooEarly.data.code === 'EVT_CHECKIN_TOO_EARLY', JSON.stringify(tooEarly.data).slice(0, 160));
}
await api(`/protocol/admin/events/${event.id}`, {
  method: 'PATCH', token: adminToken,
  body: { startsAt: new Date(Date.now() - 5 * 60000).toISOString(), endsAt: new Date(Date.now() + 2 * 3600000).toISOString() },
});
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

// --- 凭证补发:同一报名连补两次不再触发唯一约束 500 ------------------------
const passes2 = await api('/protocol/passes', { token: token2 });
const pass2 = passes2.data.items.find((p) => p.passNo === pass2No);
const reissue1 = await api(`/protocol/admin/passes/${pass2.id}/reissue`, { method: 'POST', token: adminToken, body: { reason: '凭证污损' } });
check('凭证补发成功', reissue1.status === 200 && /^NJP/.test(reissue1.data.pass?.passNo || ''), JSON.stringify(reissue1.data).slice(0, 200));
const reissue2 = await api(`/protocol/admin/passes/${pass2.id}/reissue`, { method: 'POST', token: adminToken, body: { reason: '再次补发' } });
check('凭证二次补发不冲突', reissue2.status === 200 && reissue2.data.pass?.passNo === pass2No, JSON.stringify(reissue2.data).slice(0, 200));

// --- inter 凭证核销回写(需配置 PROTOCOL_INTER_SERVICE_TOKEN)--------------
const proInterToken = process.env.PROTOCOL_INTER_SERVICE_TOKEN;
const interMarked = Boolean(proInterToken);
if (proInterToken) {
  const noToken = await fetch(`${base}/api/protocol/inter/passes/mark-used`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ no: pass2No }),
  });
  check('inter 无令牌被拒', noToken.status === 403);
  const markUsed = await fetch(`${base}/api/protocol/inter/passes/mark-used`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-nailong-service-token': proInterToken },
    body: JSON.stringify({ no: pass2No }),
  });
  const markData = await markUsed.json().catch(() => ({}));
  check('inter 凭证核销成功', markUsed.status === 200 && markData.ok === true, JSON.stringify(markData));
  const reg2After = (await api('/protocol/registrations', { token: token2 })).data.items.find((r) => r.id === reg2.data.registration.id);
  check('inter 核销同步报名为已签到', reg2After?.status === 'checked_in', JSON.stringify(reg2After).slice(0, 200));
  const msg2 = await api('/protocol/messages', { token: token2 });
  check('inter 核销发送签到通知', msg2.data.items.some((m) => m.type === 'checkin_done'));
} else {
  console.log('  skip inter 核销未配置 PROTOCOL_INTER_SERVICE_TOKEN');
}

// --- 活动取消:每人恰一条通知;已签到置 finished,待审置 cancelled ----------
const cancelEvent = await api(`/protocol/admin/events/${event.id}/status`, {
  method: 'POST', token: adminToken, body: { status: 'cancelled', reason: '冒烟取消测试' },
});
check('活动取消成功', cancelEvent.status === 200, JSON.stringify(cancelEvent.data).slice(0, 200));
const reg1After = (await api('/protocol/registrations', { token })).data.items.find((r) => r.id === regId);
const reg2Final = (await api('/protocol/registrations', { token: token2 })).data.items.find((r) => r.id === reg2.data.registration.id);
const reg3Final = (await api('/protocol/registrations', { token: token3 })).data.items.find((r) => r.id === reg3.data.registration.id);
check('已签到报名随活动取消置 finished', reg1After?.status === 'finished', JSON.stringify(reg1After).slice(0, 160));
// inter 未配置时 reg2 仍是 approved 报名,取消后应落 cancelled;
// 核销过(checked_in)的才走 finished 迁移。
check(
  interMarked ? 'inter 签到的报名同样置 finished' : '未核销报名随活动取消置 cancelled',
  reg2Final?.status === (interMarked ? 'finished' : 'cancelled'),
  JSON.stringify(reg2Final ?? {}).slice(0, 160)
);
check('待审报名随活动取消置 cancelled', reg3Final?.status === 'cancelled', JSON.stringify(reg3Final).slice(0, 160));
const msgs1 = await api('/protocol/messages', { token });
check('报名者收到恰一条取消通知', msgs1.data.items.filter((m) => m.type === 'event_cancelled').length === 1);
const msgs3 = await api('/protocol/messages', { token: token3 });
check('待审报名者收到恰一条取消通知', msgs3.data.items.filter((m) => m.type === 'event_cancelled').length === 1);

// --- 隐私(独立用户,主用户仍有进行中的活动记录)------------------------
const clean = await api('/auth/register', {
  method: 'POST',
  body: { username: `${username}_clean`, password, displayName: `隐私冒烟${stamp}` },
});
const erase = await api('/protocol/privacy/erase', { method: 'POST', token: clean.data.accessToken });
check('隐私数据匿名化', erase.status === 200, JSON.stringify(erase.data));

console.log(failures === 0 ? '\n全部通过 ✔' : `\n${failures} 项失败 ✘`);
process.exit(failures === 0 ? 0 : 1);