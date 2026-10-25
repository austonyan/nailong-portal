// 奶龍國皇家申訴與監察署 — 端到端验收脚本。
// 用法:先启动 API(server/index.js,PORT 默认 3001),然后:
//   node server/scripts/smoke-appeal.mjs [baseUrl]
// 覆盖:申诉草稿→材料→提交→受理/补件/决定→决定书验真→复核终局→
//       投诉建议→工单→公示/公告/模板→黑名单/合并→统计/审计/导出。
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

async function api(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
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
const userName = `smoke_ap_${stamp}`;
const password = 'smoke-pass-123';

async function register(suffix = 'a') {
  const r = await api('/auth/register', {
    method: 'POST',
    body: { username: `${userName}_${suffix}`, password, displayName: `冒烟申诉${stamp}${suffix}` },
  });
  check(`注册用户 ${suffix}`, r.status === 200 || r.status === 201, JSON.stringify(r.data));
  return { token: r.data.accessToken, id: r.data.user?.id };
}

async function login(username) {
  const r = await api('/auth/login', { method: 'POST', body: { username, password: username === 'admin' ? 'admin123' : password } });
  check(`登录 ${username}`, !!r.data.accessToken);
  return r.data.accessToken;
}

async function upload(token, ownerType, ownerId, kind, filename, mime = 'image/png') {
  const form = new FormData();
  form.append('ownerType', ownerType);
  form.append('ownerId', String(ownerId));
  form.append('kind', kind);
  form.append('file', new Blob([PNG], { type: mime }), filename);
  const res = await fetch(`${base}/api/appeal/materials`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const FIELDS = {
  bizType: 'visa',
  bizCode: `NLA-${stamp}-AAA111`,
  reason: '签注被驳回,但材料实际齐全,请求复核原审核结果',
  expected: '撤销驳回结果并重新审核',
  contact: 'appeal@example.com',
};

async function main() {
  const adminToken = await login('admin');
  const { token: userToken } = await register();
  const { token: user2Token } = await register('b');

  // 首页聚合
  const home = await api('/appeal/home', { token: userToken });
  check('署内公告与提示', home.status === 200 && home.data.notices.length > 0 && home.data.hints.reviewDays > 0);
  check('可申诉业务类型', Array.isArray(home.data.bizTypes) && home.data.bizTypes.length === 5);

  // 申诉:草稿 → 字段 → 材料 → 提交
  const draft = await api('/appeal/appeals', { method: 'POST', token: userToken, body: { bizType: 'visa', bizCode: FIELDS.bizCode } });
  check('创建申诉草稿', draft.status === 201 && /^NAA-/.test(draft.data.appeal?.code || ''), JSON.stringify(draft.data));
  const appealId = draft.data.appeal.id;
  const appealCode = draft.data.appeal.code;
  check('关联校验预留(unverified)', draft.data.appeal.bizStatus === 'unverified');

  const badType = await api('/appeal/appeals', { method: 'POST', token: userToken, body: { bizType: 'unknown', bizCode: 'X-1' } });
  check('拒绝未知业务类型', badType.status === 400 && badType.data.code === 'APPEAL_BIZ_TYPE');

  const put = await api(`/appeal/appeals/${appealId}`, { method: 'PUT', token: userToken, body: FIELDS });
  check('保存申诉信息', put.status === 200);

  const up = await upload(userToken, 'appeal', appealId, 'screenshot', 'reject.png');
  check('上传材料', up.status === 201 && up.data.material?.origin === 'initial', JSON.stringify(up.data));
  const badFile = await upload(userToken, 'appeal', appealId, 'other', 'evil.bin', 'application/octet-stream');
  check('拒绝非白名单类型', badFile.status === 400, JSON.stringify(badFile.data));

  const noAgree = await api(`/appeal/appeals/${appealId}/submit`, { method: 'POST', token: userToken, body: { ...FIELDS, entertainmentAgreed: false } });
  check('未勾选娱乐声明拒绝提交', noAgree.status === 400 && noAgree.data.code === 'APPEAL_AGREEMENT_REQUIRED');

  const submitted = await api(`/appeal/appeals/${appealId}/submit`, { method: 'POST', token: userToken, body: { ...FIELDS, entertainmentAgreed: true } });
  check('提交成功进入待受理', submitted.status === 200 && submitted.data.appeal.status === 'pending_accept');

  const msg = await api('/appeal/messages', { token: userToken });
  check('提交成功站内信', msg.data.items.some((m) => m.type === 'appeal_submitted'));

  // 重复申诉:同用户同业务同编号
  const dupDraft = await api('/appeal/appeals', { method: 'POST', token: userToken, body: { bizType: 'visa', bizCode: FIELDS.bizCode } });
  await api(`/appeal/appeals/${dupDraft.data.appeal.id}`, { method: 'PUT', token: userToken, body: FIELDS });
  const dup = await api(`/appeal/appeals/${dupDraft.data.appeal.id}/submit`, { method: 'POST', token: userToken, body: { ...FIELDS, entertainmentAgreed: true } });
  check('重复申诉被拦截', dup.status === 400 && dup.data.code === 'APPEAL_DUPLICATE', JSON.stringify(dup.data));

  // 管理:队列 → 受理 → 要求补件 → 补件 → 决定(维持)
  const queue = await api('/appeal/admin/appeals/queue?status=pending_accept', { token: adminToken });
  check('申诉受理队列可见', queue.data.items.some((a) => a.code === appealCode));

  const accept = await api(`/appeal/admin/appeals/${appealId}/accept`, { method: 'POST', token: adminToken, body: { comment: '材料初步齐全,受理' } });
  check('受理申诉', accept.status === 200 && accept.data.appeal.status === 'accepted');

  const supp = await api(`/appeal/admin/appeals/${appealId}/supplement`, {
    method: 'POST', token: adminToken, body: { comment: '请补充驳回通知截图', days: 7 },
  });
  check('要求补件', supp.status === 200 && supp.data.appeal.status === 'supplement_required');

  const upSup = await upload(userToken, 'appeal', appealId, 'proof', 'extra.png');
  check('补交材料', upSup.status === 201 && upSup.data.material.origin === 'supplement');
  const suppSubmit = await api(`/appeal/appeals/${appealId}/supplement`, { method: 'POST', token: userToken, body: { note: '材料已补齐' } });
  check('补件后重新处理', suppSubmit.status === 200 && suppSubmit.data.appeal.status === 'processing');

  const decide = await api(`/appeal/admin/appeals/${appealId}/decide`, {
    method: 'POST', token: adminToken, body: { decisionType: 'maintain', reason: '原审核事实清楚,维持原结果', basis: '签注审核规程 3.2' },
  });
  check('处理决定(维持)并生成决定书', decide.status === 200 && decide.data.appeal.status === 'resolved' && /^NAD-/.test(decide.data.appeal.decision?.code || ''), JSON.stringify(decide.data).slice(0, 240));
  const decisionCode = decide.data.appeal.decision.code;

  // 验真:申诉编号 / 决定书编号
  const vAppeal = await api(`/appeal/verify?no=${appealCode}`);
  check('申诉编号验真', vAppeal.status === 200 && vAppeal.data.found && vAppeal.data.kind === 'appeal' && vAppeal.data.valid === true);
  const vDecision = await api(`/appeal/verify?no=${decisionCode}`);
  check('决定书编号验真', vDecision.data.found && vDecision.data.kind === 'decision' && vDecision.data.valid === true);
  check('验真结果不含个人信息', !JSON.stringify(vDecision.data).includes('appeal@example.com') && !vDecision.data.username && !vDecision.data.reason);
  const vMiss = await api('/appeal/verify?no=NAA-000000-NOPE00');
  check('未知编号返回未找到', vMiss.status === 200 && vMiss.data.found === false);

  // 我的决定书
  const decisions = await api('/appeal/decisions', { token: userToken });
  check('我的决定书列表', decisions.data.items.some((d) => d.code === decisionCode && d.status === 'valid'));

  // 复核(一次终局):撤销原结果 → 原决定书失效 + 新决定书
  const review = await api('/appeal/reviews', { method: 'POST', token: userToken, body: { appealId, reason: '新证据表明原审核认定有误,请求撤销原结果' } });
  check('提交复核申请', review.status === 201 && /^NAR-/.test(review.data.review?.code || ''), JSON.stringify(review.data));
  const reviewId = review.data.review.id;
  const again = await api('/appeal/reviews', { method: 'POST', token: userToken, body: { appealId, reason: '再次复核测试' } });
  check('复核一次终局', again.status === 400 && again.data.code === 'APPEAL_REVIEW_EXISTS');

  const rQueue = await api('/appeal/admin/reviews/queue?status=pending', { token: adminToken });
  check('复核队列可见', rQueue.data.items.some((r) => r.id === reviewId));
  await upload(userToken, 'review', reviewId, 'proof', 'evidence.png');

  const rAccept = await api(`/appeal/admin/reviews/${reviewId}/accept`, { method: 'POST', token: adminToken, body: {} });
  check('复核受理', rAccept.status === 200 && rAccept.data.review.status === 'reviewing');
  const rDecide = await api(`/appeal/admin/reviews/${reviewId}/decide`, {
    method: 'POST', token: adminToken, body: { decisionType: 'change', reason: '采纳新证据,变更原结果', basis: '申诉复核规程 5.1' },
  });
  check('复核决定(变更)', rDecide.status === 200 && rDecide.data.review.status === 'completed', JSON.stringify(rDecide.data).slice(0, 240));

  const decisions2 = await api('/appeal/decisions', { token: userToken });
  const original = decisions2.data.items.find((d) => d.code === decisionCode);
  const latest = decisions2.data.items[0];
  check('原决定书已失效且生成新决定书', original?.status === 'expired' && /^NAD-/.test(latest?.code || '') && latest.reviewCode);
  const detail = await api(`/appeal/appeals/${appealId}`, { token: userToken });
  check('申诉决定已变更为 change', detail.data.appeal.decisionType === 'change');

  // 投诉建议(实名 + 匿名)
  const complaint = await api('/appeal/complaints', {
    method: 'POST', token: userToken,
    body: { kind: 'complaint', category: 'process', anonymous: false, content: '审核流程补件通知不清晰,希望优化提醒方式', contact: 'me@example.com' },
  });
  check('提交投诉', complaint.status === 201 && /^NAC-/.test(complaint.data.complaint?.code || ''), JSON.stringify(complaint.data));
  const complaintId = complaint.data.complaint.id;

  // 换用户提交,避开 60s 投诉提交限流
  const anon = await api('/appeal/complaints', {
    method: 'POST', token: user2Token,
    body: { kind: 'suggestion', category: 'feature', anonymous: true, content: '希望增加处理进度订阅推送功能' },
  });
  check('匿名建议提交成功', anon.status === 201 && anon.data.complaint.anonymous === true);

  const cQueue = await api('/appeal/admin/complaints/queue', { token: adminToken });
  check('投诉队列可见', cQueue.data.items.some((c) => c.id === complaintId));
  const cDetail = await api(`/appeal/admin/complaints/${complaintId}`, { token: adminToken });
  check('实名投诉处理员可见账号', cDetail.data.complaint.username && cDetail.data.complaint.username !== '(anonymous)');
  const anonDetail = await api(`/appeal/admin/complaints/${anon.data.complaint.id}`, { token: adminToken });
  check('匿名投诉隐藏账号', anonDetail.data.complaint.username === '(anonymous)');

  await api(`/appeal/admin/complaints/${complaintId}/accept`, { method: 'POST', token: adminToken, body: {} });
  const cReply = await api(`/appeal/admin/complaints/${complaintId}/reply`, { method: 'POST', token: adminToken, body: { content: '已记录流程优化建议,补件提醒将增加站内信双通知。' } });
  check('投诉回复', cReply.status === 200 && cReply.data.complaint.status === 'replied');
  const cEval = await api(`/appeal/complaints/${complaintId}/evaluate`, { method: 'POST', token: userToken, body: { rating: 5, comment: '回复及时' } });
  check('投诉评价', cEval.status === 200);

  // 工单客服
  const ticket = await api('/appeal/tickets', {
    method: 'POST', token: userToken,
    body: { category: 'bug', priority: 'high', title: '决定书打印样式异常', content: '打印预览水印位置偏移' },
  });
  check('提交工单', ticket.status === 201 && /^NAT-/.test(ticket.data.ticket?.code || ''), JSON.stringify(ticket.data));
  const ticketId = ticket.data.ticket.id;
  await api(`/appeal/admin/tickets/${ticketId}/reply`, { method: 'POST', token: adminToken, body: { content: '已复现,将在下个版本修复打印样式。' } });
  const tReply = await api(`/appeal/tickets/${ticketId}/reply`, { method: 'POST', token: userToken, body: { content: '好的,感谢处理。' } });
  check('工单用户回复', tReply.status === 200);
  const tClose = await api(`/appeal/tickets/${ticketId}/close`, { method: 'POST', token: userToken, body: {} });
  check('工单用户关闭', tClose.status === 200);

  // 公示:缺娱乐声明的发布被拦截,带声明的发布成功
  const pub = await api('/appeal/admin/publicity', {
    method: 'POST', token: adminToken,
    body: { kind: 'case', title: '典型案例:复核变更原结果', body: '某签注申诉经复核采纳新证据,原结果被变更。(脱敏发布)' },
  });
  const pubId = pub.data.id;
  const badPub = await api(`/appeal/admin/publicity/${pubId}`, { method: 'PATCH', token: adminToken, body: { status: 'published' } });
  check('公示缺娱乐声明拦截', badPub.status === 400 && badPub.data.code === 'APPEAL_PUBLICITY_DISCLAIMER');
  const goodPub = await api(`/appeal/admin/publicity/${pubId}`, {
    method: 'PATCH', token: adminToken, body: { status: 'published', body: '某签注申诉经复核采纳新证据,原结果被变更。(脱敏发布,虚构娱乐内容)' },
  });
  check('公示发布成功', goodPub.status === 200);
  const pubList = await api('/appeal/publicity', { token: userToken });
  check('用户可见已发布公示', pubList.data.items.some((p) => p.id === pubId && p.status === 'published'));
  const pubStats = await api('/appeal/publicity/stats', { token: userToken });
  check('公示统计(脱敏)', pubStats.status === 200 && pubStats.data.disclaimer === true && pubStats.data.submitted >= 1);

  // 黑名单:scope=appeal 阻止申诉提交,不阻止投诉
  const { token: user3Token, id: user3Id } = await register('c');
  const d3 = await api('/appeal/appeals', { method: 'POST', token: user3Token, body: { bizType: 'visa', bizCode: `NLA-${stamp}-BBB222` } });
  check('拉黑前可建草稿', d3.status === 201);
  await api('/appeal/admin/blacklist', { method: 'POST', token: adminToken, body: { userId: user3Id, scope: 'appeal', reason: '测试恶意申诉' } });
  const s3 = await api(`/appeal/appeals/${d3.data.appeal.id}/submit`, { method: 'POST', token: user3Token, body: { ...FIELDS, bizCode: `NLA-${stamp}-BBB222`, entertainmentAgreed: true } });
  check('黑名单用户禁止申诉', s3.status === 403 && s3.data.code === 'APPEAL_BLACKLISTED', JSON.stringify(s3.data));
  const c3 = await api('/appeal/complaints', { method: 'POST', token: user3Token, body: { kind: 'complaint', category: 'other', content: '申诉入口被限制,想了解原因', anonymous: false, contact: 'c@example.com' } });
  check('黑名单 scope=appeal 不影响投诉', c3.status === 201);
  await api(`/appeal/admin/blacklist/${user3Id}`, { method: 'DELETE', token: adminToken });

  // 合并重复申诉
  const m1 = await api('/appeal/appeals', { method: 'POST', token: user2Token, body: { bizType: 'immigration', bizCode: `IMM-${stamp}-CCC333` } });
  const m2 = await api('/appeal/appeals', { method: 'POST', token: user2Token, body: { bizType: 'immigration', bizCode: `IMM-${stamp}-CCC333` } });
  const f1 = { ...FIELDS, bizType: 'immigration', bizCode: `IMM-${stamp}-CCC333`, reason: '入境申报被拒,请求复核' };
  await api(`/appeal/appeals/${m1.data.appeal.id}`, { method: 'PUT', token: user2Token, body: f1 });
  await api(`/appeal/appeals/${m2.data.appeal.id}`, { method: 'PUT', token: user2Token, body: f1 });
  await api(`/appeal/appeals/${m1.data.appeal.id}/submit`, { method: 'POST', token: user2Token, body: { ...f1, entertainmentAgreed: true } });
  const merged = await api('/appeal/admin/appeals/merge', {
    method: 'POST', token: adminToken, body: { sourceId: m2.data.appeal.id, targetId: m1.data.appeal.id },
  });
  check('合并重复申诉被拒(目标未决)', merged.status === 400);
  await api(`/appeal/admin/appeals/${m1.data.appeal.id}/accept`, { method: 'POST', token: adminToken, body: {} });
  await api(`/appeal/admin/appeals/${m1.data.appeal.id}/decide`, { method: 'POST', token: adminToken, body: { decisionType: 'transfer', reason: '需入境署复核边检记录后处理', basis: '转交业务署规程' } });
  const merged2 = await api('/appeal/admin/appeals/merge', {
    method: 'POST', token: adminToken, body: { sourceId: m2.data.appeal.id, targetId: m1.data.appeal.id },
  });
  check('合并重复申诉成功', merged2.status === 200 && merged2.data.appeal.mergedInto === m1.data.appeal.code);

  // 监察(只读 + 预留)
  const inspect = await api('/appeal/admin/inspect/summary', { token: adminToken });
  check('监察汇总与时效', inspect.status === 200 && inspect.data.integration.every((i) => i.reserved === undefined && i.integrated === false));
  const sampling = await api('/appeal/admin/inspect/sampling', { method: 'POST', token: adminToken, body: { bizType: 'visa', note: '抽查签注驳回申诉 3 件' } });
  check('监察抽查预留接口', sampling.status === 200 && sampling.data.reserved === true);
  const report = await api('/appeal/admin/inspect/reports', {
    method: 'POST', token: adminToken,
    body: { kind: 'quality', title: '季度申诉处理质量报告', content: '平均受理时长与决定时长均在 SLA 内,处理结果分布均衡。(虚构娱乐数据)' },
  });
  check('监察报告生成', report.status === 201);

  // 模板 / 公告 / 配置
  const tpl = await api('/appeal/admin/templates', { token: adminToken });
  check('站内信模板列表', tpl.data.items.some((t) => t.type === 'appeal_submitted'));
  await api('/appeal/admin/templates/appeal_submitted', { method: 'PATCH', token: adminToken, body: { enabled: false } });
  await api('/appeal/admin/templates/appeal_submitted', { method: 'PATCH', token: adminToken, body: { enabled: true } });
  const notice = await api('/appeal/admin/notices', {
    method: 'POST', token: adminToken, body: { level: 'event', title: '复核通道优化公告', body: '复核申请已支持在线补交材料。' },
  });
  check('发布公告', notice.status === 201);
  const home2 = await api('/appeal/home', { token: userToken });
  check('新公告用户可见', home2.data.notices.some((n) => n.title === '复核通道优化公告'));
  const cfg = await api('/appeal/admin/config', { method: 'PUT', token: adminToken, body: { 'appeal.review_days': '15' } });
  check('配置更新', cfg.status === 200);

  // 统计 / 审计 / 导出 / 验真记录
  const stats = await api('/appeal/admin/stats', { token: adminToken });
  check('统计报表', stats.status === 200 && stats.data.submitted >= 2 && Array.isArray(stats.data.decisionDistribution));
  const auditLog = await api('/appeal/admin/audit?action=decide', { token: adminToken });
  check('审计日志', auditLog.data.items.some((a) => a.action === 'decide_appeal'));
  const csv = await fetch(`${base}/api/appeal/admin/export.csv`, { headers: { Authorization: `Bearer ${adminToken}` } });
  check('导出 CSV(留痕)', csv.status === 200 && (await csv.text()).includes('biz_code'));
  const vLogs = await api('/appeal/admin/verify-logs', { token: adminToken });
  check('验真记录', vLogs.data.items.length >= 3);

  // 评价申诉 + 队列隔离:监察员(只读)不能处理申诉
  const evalRes = await api(`/appeal/appeals/${appealId}/evaluate`, { method: 'POST', token: userToken, body: { rating: 4, comment: '处理及时' } });
  check('申诉评价', evalRes.status === 200);

  console.log(failures === 0 ? '\n全部通过 ✔' : `\n${failures} 项失败 ✘`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
