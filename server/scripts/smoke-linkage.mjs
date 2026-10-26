// 跨署联动端到端验收脚本。
// 用法:先启动 API(server/index.js,PORT 默认 3001),然后:
//   node server/scripts/smoke-linkage.mjs [baseUrl]
// 覆盖:
//   1. 签注署真实签注 → 入境署校验 → 口岸核销回写签注署
//   2. 文书署按签注编号实时校验(命中 / 非本人 / 未命中)
//   3. 申诉署关联校验 → 决定回写业务署 → 重开被驳回签注
//   4. 居民卡 → 居民权益通道 / 礼宾居民礼遇资格
//   5. 外交身份 → 外交签注申请资格拦截
//   6. 申诉监察跨署抽查
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

async function api(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
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
const password = 'smoke-pass-123';

async function register(suffix) {
  const r = await api('/auth/register', {
    method: 'POST',
    body: { username: `link_${stamp}_${suffix}`, password, displayName: `联动冒烟${stamp}${suffix}` },
  });
  check(`注册用户 ${suffix}`, r.status === 200 || r.status === 201, JSON.stringify(r.data));
  return { token: r.data.accessToken, id: r.data.user?.id };
}

async function login(username) {
  if (username === 'admin') await ensureAdmin(base);
  const r = await api('/auth/login', {
    method: 'POST',
    body: { username, password: username === 'admin' ? 'admin123' : password },
  });
  check(`登录 ${username}`, !!r.data.accessToken, JSON.stringify(r.data));
  return r.data.accessToken;
}

function visaForm(displayName) {
  return {
    nickname: displayName,
    contact: 'link@example.com',
    virtualId: 'NL-7777',
    purpose: '跨署联动验收',
    planArrive: '2026-12-01',
    planLeave: '2026-12-06',
    itinerary: 'D1 口岸;D2 图鉴馆;D3 居民署',
  };
}

async function uploadVisaAvatar(token, appId) {
  const form = new FormData();
  form.append('applicationId', String(appId));
  form.append('kind', 'avatar');
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'avatar.png');
  return api('/visa/materials', { method: 'POST', token, form });
}

async function issueVisaFor(userToken, adminToken, displayName) {
  const created = await api('/visa/applications', { method: 'POST', token: userToken, body: { typeCode: 'TOURIST' } });
  const appId = created.data.application.id;
  const appNo = created.data.application.appNo;
  await api(`/visa/applications/${appId}`, { method: 'PUT', token: userToken, body: visaForm(displayName) });
  await uploadVisaAvatar(userToken, appId);
  const submitted = await api(`/visa/applications/${appId}/submit`, { method: 'POST', token: userToken, body: visaForm(displayName) });
  check('签注申请提交', submitted.status === 200, JSON.stringify(submitted.data));
  const approve = await api(`/visa/admin/applications/${appId}/approve`, { method: 'POST', token: adminToken, body: { comment: '联动验收通过' } });
  check('签注审核通过', approve.status === 200, JSON.stringify(approve.data));
  const issue = await api(`/visa/admin/applications/${appId}/issue`, { method: 'POST', token: adminToken, body: {} });
  const permit = issue.data.application?.permit;
  check('签注签发', issue.status === 200 && /^NLT-/.test(permit?.visaNo || ''), JSON.stringify(issue.data).slice(0, 200));
  return { appId, appNo, visaNo: permit.visaNo };
}

async function main() {
  const adminToken = await login('admin');
  const userA = await register('a');
  const userB = await register('b');

  // -------------------------------------------------------------------------
  // 1. 签注署 → 入境署 → 回写签注署
  // -------------------------------------------------------------------------
  const visaA = await issueVisaFor(userA.token, adminToken, `联动甲${stamp}`);

  const portDetail = await api('/immigration/ports/ROYAL_PORT', { token: userA.token });
  check('口岸详情含活动提示', portDetail.status === 200 && Array.isArray(portDetail.data.eventHints), JSON.stringify(portDetail.data).slice(0, 200));
  check('口岸详情含外交礼遇联动', portDetail.status === 200 && portDetail.data.courtesies?.eligible === false);

  const realCheck = await api('/immigration/visa/check', { method: 'POST', token: userA.token, body: { visaNo: visaA.visaNo } });
  check(
    '入境署识别真实签注',
    realCheck.status === 200 &&
      realCheck.data.result === 'valid' &&
      typeof realCheck.data.detail?.validUntil === 'string' &&
      realCheck.data.detail.validUntil.length >= 10,
    JSON.stringify(realCheck.data)
  );
  check('真实签注来源为签注署', realCheck.data.detail?.issuer?.includes('簽註申請署') || realCheck.data.detail?.issuer?.includes('签注申请署'));

  const otherUserCheck = await api('/immigration/visa/check', { method: 'POST', token: userB.token, body: { visaNo: visaA.visaNo } });
  check('他人签注不可冒用', otherUserCheck.data.result === 'invalid' && otherUserCheck.data.detail?.reason === 'holder', JSON.stringify(otherUserCheck.data));

  const declare = await api('/immigration/declarations', {
    method: 'POST',
    token: userA.token,
    body: {
      portCode: 'ROYAL_PORT',
      nickname: `联动甲${stamp}`,
      contact: 'link@example.com',
      purpose: 'visit',
      stayDays: 3,
      companions: 0,
      address: '奶龙大道 9 号',
      visaNo: visaA.visaNo,
      items: [{ key: 'snacks', qty: 2 }],
    },
  });
  const declId = declare.data.declaration?.id;
  check('创建入境申报', declare.status === 201 && declId > 0, JSON.stringify(declare.data).slice(0, 200));
  const declSubmit = await api(`/immigration/declarations/${declId}/submit`, { method: 'POST', token: userA.token });
  check('真实签注可提交申报', declSubmit.status === 200 && declSubmit.data.declaration.status === 'pending', JSON.stringify(declSubmit.data).slice(0, 200));
  const declApprove = await api(`/immigration/admin/declarations/${declId}/approve`, { method: 'POST', token: adminToken, body: {} });
  check('入境申报审核通过', declApprove.status === 200, JSON.stringify(declApprove.data).slice(0, 200));

  const passList = await api('/immigration/pass-codes', { token: userA.token });
  const passId = passList.data.items?.[0]?.id;
  const passDetail = await api(`/immigration/pass-codes/${passId}`, { token: userA.token });
  const codeNo = passDetail.data.passCode?.codeNo;
  check('通关码已生成', !!codeNo, JSON.stringify(passDetail.data).slice(0, 200));
  const verified = await api('/immigration/admin/pass-codes/verify', { method: 'POST', token: adminToken, body: { codeNo } });
  check('口岸核验通关', verified.status === 200 && verified.data.result === 'accepted', JSON.stringify(verified.data));

  const permitAfter = await api(`/visa/verify?no=${visaA.visaNo}`);
  check('口岸核销回写签注署(已使用)', permitAfter.data.status === 'used', JSON.stringify(permitAfter.data));
  const visaMsgs = await api('/visa/messages', { token: userA.token });
  check('签注站内信收到已使用通知', visaMsgs.data.items.some((m) => m.type === 'used'));

  // -------------------------------------------------------------------------
  // 2. 文书署 ↔ 签注署
  // -------------------------------------------------------------------------
  const doc = await api('/docs/applications', { method: 'POST', token: userA.token, body: { typeCode: 'VISA_CERT' } });
  const docId = doc.data.item?.id;
  check('创建文书认证草稿', doc.status === 200 && docId > 0, JSON.stringify(doc.data).slice(0, 200));
  await api(`/docs/applications/${docId}`, {
    method: 'PATCH',
    token: userA.token,
    body: {
      nickname: `联动甲${stamp}`,
      contact: 'link@example.com',
      bizNo: visaA.visaNo,
      purpose: 'display',
      formData: { visit_note: '联动验收' },
    },
  });
  const docUpload = new FormData();
  docUpload.append('kind', 'proof');
  docUpload.append('file', new Blob([PNG], { type: 'image/png' }), 'visa.png');
  const docMat = await api(`/docs/applications/${docId}/materials`, { method: 'POST', token: userA.token, form: docUpload });
  check('上传签注截图', docMat.status === 200, JSON.stringify(docMat.data));
  const docSubmit = await api(`/docs/applications/${docId}/submit`, { method: 'POST', token: userA.token });
  check(
    '文书署实时核验签注编号',
    docSubmit.status === 200 &&
      docSubmit.data.item.bizCheck?.checked === true &&
      docSubmit.data.item.bizCheck.found === true &&
      docSubmit.data.item.bizCheck.owned === true &&
      docSubmit.data.item.bizCheck.reserved !== true,
    JSON.stringify(docSubmit.data.item?.bizCheck || docSubmit.data).slice(0, 300)
  );

  // 非本人签注
  const docB = await api('/docs/applications', { method: 'POST', token: userB.token, body: { typeCode: 'VISA_CERT' } });
  const docBId = docB.data.item?.id;
  await api(`/docs/applications/${docBId}`, {
    method: 'PATCH',
    token: userB.token,
    body: { nickname: `联动乙${stamp}`, contact: 'b@example.com', bizNo: visaA.visaNo, purpose: 'display', formData: { visit_note: 'x' } },
  });
  const docBUpload = new FormData();
  docBUpload.append('kind', 'proof');
  docBUpload.append('file', new Blob([PNG], { type: 'image/png' }), 'visa.png');
  await api(`/docs/applications/${docBId}/materials`, { method: 'POST', token: userB.token, form: docBUpload });
  const docBSubmit = await api(`/docs/applications/${docBId}/submit`, { method: 'POST', token: userB.token });
  check('非本人签注不能认证', docBSubmit.status === 409 && docBSubmit.data.code === 'DOC_BIZ_INVALID', JSON.stringify(docBSubmit.data));

  // -------------------------------------------------------------------------
  // 3. 申诉署 ↔ 签注署(驳回 → 申诉 → 撤销原决定 → 重开)
  // -------------------------------------------------------------------------
  const visaB = await api('/visa/applications', { method: 'POST', token: userB.token, body: { typeCode: 'TOURIST' } });
  const visaBId = visaB.data.application.id;
  const visaBNo = visaB.data.application.appNo;
  await api(`/visa/applications/${visaBId}`, { method: 'PUT', token: userB.token, body: visaForm(`联动乙${stamp}`) });
  await uploadVisaAvatar(userB.token, visaBId);
  await api(`/visa/applications/${visaBId}/submit`, { method: 'POST', token: userB.token, body: visaForm(`联动乙${stamp}`) });
  const rejected = await api(`/visa/admin/applications/${visaBId}/reject`, {
    method: 'POST',
    token: adminToken,
    body: { reasonCode: 'info_mismatch', comment: '联动验收:先驳回再申诉' },
  });
  check('签注驳回(待申诉)', rejected.status === 200 && rejected.data.application.status === 'rejected');

  const appealDraft = await api('/appeal/appeals', {
    method: 'POST',
    token: userB.token,
    body: { bizType: 'visa', bizCode: visaBNo },
  });
  check(
    '申诉关联校验命中本人业务',
    appealDraft.status === 201 && appealDraft.data.appeal.bizStatus === 'verified',
    JSON.stringify(appealDraft.data)
  );
  const appealId = appealDraft.data.appeal.id;
  const appealFields = {
    bizType: 'visa',
    bizCode: visaBNo,
    reason: '材料实际齐全,请求撤销原驳回决定',
    expected: '撤销驳回并重新审核',
    contact: 'b@example.com',
  };
  await api(`/appeal/appeals/${appealId}`, { method: 'PUT', token: userB.token, body: appealFields });
  const appealSubmitted = await api(`/appeal/appeals/${appealId}/submit`, { method: 'POST', token: userB.token, body: appealFields });
  check('申诉提交', appealSubmitted.status === 200 && appealSubmitted.data.appeal.bizStatus === 'verified');
  await api(`/appeal/admin/appeals/${appealId}/accept`, { method: 'POST', token: adminToken, body: { comment: '联动验收受理' } });
  const decided = await api(`/appeal/admin/appeals/${appealId}/decide`, {
    method: 'POST',
    token: adminToken,
    body: { decisionType: 'undo', reason: '原驳回证据不足,撤销后重新审核', basis: '联动验收' },
  });
  check(
    '申诉决定回写业务署',
    decided.status === 200 && decided.data.writeback?.applied === true && decided.data.writeback.status === 'pending_review',
    JSON.stringify(decided.data).slice(0, 300)
  );
  const visaBAfter = await api(`/visa/applications/${visaBId}`, { token: userB.token });
  check(
    '驳回签注已重新进入审核',
    visaBAfter.data.application.status === 'pending_review' && !visaBAfter.data.application.rejectCode,
    JSON.stringify(visaBAfter.data).slice(0, 200)
  );
  const msgsB = await api('/visa/messages', { token: userB.token });
  check('签注站内信收到申诉重开通知', msgsB.data.items.some((m) => m.type === 'appeal_reopened'));

  const appealAdmin = await api(`/appeal/admin/appeals/${appealId}`, { token: adminToken });
  check(
    '申诉工作台可读业务署链路',
    appealAdmin.status === 200 && appealAdmin.data.appeal.bizLink?.integrated === true && appealAdmin.data.appeal.bizLink.found === true,
    JSON.stringify(appealAdmin.data.appeal?.bizLink || {}).slice(0, 300)
  );

  // 决定书 → 文书署认证 → 回写决定书 certCode
  const decisionCode = decided.data.appeal.decision?.code;
  check('申诉决定书已生成', /^NAD-/.test(decisionCode || ''), decisionCode);
  const decDoc = await api('/docs/applications', { method: 'POST', token: userB.token, body: { typeCode: 'APPEAL_DECISION' } });
  const decDocId = decDoc.data.item?.id;
  check('创建决定书认证草稿', decDoc.status === 200 && decDocId > 0, JSON.stringify(decDoc.data).slice(0, 200));
  await api(`/docs/applications/${decDocId}`, {
    method: 'PATCH',
    token: userB.token,
    body: {
      nickname: `联动乙${stamp}`,
      contact: 'b@example.com',
      bizNo: decisionCode,
      purpose: 'display',
      formData: { case_note: '决定书认证联动验收' },
    },
  });
  const decUpload = new FormData();
  decUpload.append('kind', 'proof');
  decUpload.append('file', new Blob([PNG], { type: 'image/png' }), 'decision.png');
  await api(`/docs/applications/${decDocId}/materials`, { method: 'POST', token: userB.token, form: decUpload });
  const decSubmit = await api(`/docs/applications/${decDocId}/submit`, { method: 'POST', token: userB.token });
  check(
    '文书署实时核验决定书编号',
    decSubmit.status === 200 && decSubmit.data.item.bizCheck?.found === true && decSubmit.data.item.bizCheck.owned === true,
    JSON.stringify(decSubmit.data.item?.bizCheck || decSubmit.data).slice(0, 300)
  );
  const decApprove = await api(`/docs/admin/applications/${decDocId}/approve`, { method: 'POST', token: adminToken, body: { comment: '联动验收' } });
  const decCertNo = decApprove.data.item?.certificate?.certNo;
  check('决定书认证签发', decApprove.status === 200 && /^NLDC-/.test(decCertNo || ''), JSON.stringify(decApprove.data).slice(0, 200));
  const decisionAfter = await api(`/appeal/decisions/${decisionCode}`, { token: userB.token });
  check('文书编号回写决定书 certCode', decisionAfter.data.decision?.certCode === decCertNo, JSON.stringify(decisionAfter.data.decision || {}));

  // -------------------------------------------------------------------------
  // 4. 居民卡 → 居民权益通道 / 礼宾居民礼遇
  // -------------------------------------------------------------------------
  const resCreated = await api('/resident/applications', { method: 'POST', token: userA.token, body: { typeCode: 'TEMPORARY' } });
  const resAppId = resCreated.data.application?.id;
  check('创建居民登记草稿', resCreated.status === 201 && resAppId > 0, JSON.stringify(resCreated.data).slice(0, 200));
  const resFields = {
    nickname: `联动甲${stamp}`,
    contact: 'link@example.com',
    virtualAddress: '奶龙大道 9 号',
    bio: '联动验收居民',
    purposes: ['collect', 'visa_fast'],
  };
  await api(`/resident/applications/${resAppId}`, { method: 'PUT', token: userA.token, body: resFields });
  const resUpload = new FormData();
  resUpload.append('applicationId', String(resAppId));
  resUpload.append('kind', 'avatar');
  resUpload.append('file', new Blob([PNG], { type: 'image/png' }), 'avatar.png');
  const resMat = await api('/resident/materials', { method: 'POST', token: userA.token, form: resUpload });
  check('上传居民头像', resMat.status === 201, JSON.stringify(resMat.data));
  const resSubmit = await api(`/resident/applications/${resAppId}/submit`, { method: 'POST', token: userA.token, body: resFields });
  check('居民登记提交', resSubmit.status === 200, JSON.stringify(resSubmit.data).slice(0, 200));
  const resApprove = await api(`/resident/admin/applications/${resAppId}/approve`, { method: 'POST', token: adminToken, body: { comment: '联动验收' } });
  const cardNo = resApprove.data.application?.card?.cardNo;
  check('居民卡生成', resApprove.status === 200 && /^NRC-/.test(cardNo || ''), JSON.stringify(resApprove.data).slice(0, 200));

  const benefits = await api('/resident/benefits', { token: userA.token });
  check(
    '居民权益通道按真实配置开通',
    benefits.status === 200 &&
      benefits.data.residentActive === true &&
      benefits.data.channels?.visaFast === true &&
      benefits.data.channels?.immigrationLane === true &&
      benefits.data.channels?.activityPriority === true &&
      benefits.data.channels?.identityCertificate === true,
    JSON.stringify(benefits.data.channels)
  );
  check('居民通道带跳转地址', benefits.data.links?.visaFast === '/visa' && benefits.data.links?.identityCertificate === '/docs');

  const courtesyOk = await api('/protocol/courtesy/eligibility', {
    method: 'POST',
    token: userA.token,
    body: { basisType: 'resident', basisNo: cardNo },
  });
  check('礼宾署实时校验居民礼遇资格', courtesyOk.status === 200 && courtesyOk.data.valid === true && courtesyOk.data.status === 'verified', JSON.stringify(courtesyOk.data));
  const courtesyBad = await api('/protocol/courtesy/eligibility', {
    method: 'POST',
    token: userA.token,
    body: { basisType: 'resident', basisNo: 'NRC-00000000-ZZZZZZZZ' },
  });
  check('无效居民编号被拦截', courtesyBad.status === 200 && courtesyBad.data.valid === false, JSON.stringify(courtesyBad.data));

  // -------------------------------------------------------------------------
  // 5. 外交身份 → 外交签注申请资格
  // -------------------------------------------------------------------------
  const dipElig = await api('/visa/diplomatic-eligibility', { token: userA.token });
  check('普通用户无外交签注资格', dipElig.status === 200 && dipElig.data.eligible === false, JSON.stringify(dipElig.data));
  const types = await api('/visa/admin/types', { token: adminToken });
  const dipType = types.data.items.find((t) => t.code === 'DIPLOMATIC');
  if (dipType) {
    await api(`/visa/admin/types/${dipType.id}`, { method: 'PATCH', token: adminToken, body: { enabled: true } });
    const blocked = await api('/visa/applications', { method: 'POST', token: userA.token, body: { typeCode: 'DIPLOMATIC' } });
    check('无外交身份被拒绝申请外交签注', blocked.status === 400 && blocked.data.code === 'VISA_DIP_IDENTITY_REQUIRED', JSON.stringify(blocked.data));
    await api(`/visa/admin/types/${dipType.id}`, { method: 'PATCH', token: adminToken, body: { enabled: false } });
  } else {
    check('外交签注类型存在', false);
  }

  // -------------------------------------------------------------------------
  // 6. 监察跨署抽查
  // -------------------------------------------------------------------------
  const summary = await api('/appeal/admin/inspect/summary', { token: adminToken });
  check('监察五署接入状态', summary.status === 200 && summary.data.integration.every((i) => i.integrated === true));
  const sampling = await api('/appeal/admin/inspect/sampling', {
    method: 'POST',
    token: adminToken,
    body: { bizType: 'visa', note: '联动验收抽查' },
  });
  check(
    '监察抽查读取签注署台账',
    sampling.status === 200 && sampling.data.reserved === false && sampling.data.sample?.integrated === true && sampling.data.sample.items.length > 0,
    JSON.stringify(sampling.data).slice(0, 300)
  );

  if (failures) {
    console.error(`\n${failures} 项失败 ✘`);
    process.exitCode = 1;
  } else {
    console.log('\n全部通过 ✔');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});