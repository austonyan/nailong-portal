// 联动身份绑定验收(自包含临时库,不需要启动服务):
//   node server/scripts/smoke-linkage-identity.mjs
// 覆盖:
//   1. 按 SSO 账户取件只返回本人记录;
//   2. 非本人记录 owned=false 且不返回明细;
//   3. 无主记录(礼宾活动)不能被任何账户认领;
//   4. 有居民证时身份凭证为居民证,未办证时回落到 SSO 账户;
//   5. 每次读取都写入 linkage_access_logs。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-linkage-identity-'));
process.env.NAILONG_DATA_DIR = dataDir;

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

function cleanup() {
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows 上 WAL 句柄可能稍后才释放,忽略清理失败。
  }
}

try {
  const { db, now } = await import('../db.js');
  const { ensureResidentSchema } = await import('../resident/schema.js');
  const { ensureProtocolSchema } = await import('../protocol/schema.js');
  const {
    classifyBizStatus,
    linkageIdentity,
    listOwnedRecords,
    recordLinkageAccess,
    verifyBusinessRecord,
  } = await import('../linkage.js');

  ensureResidentSchema();
  ensureProtocolSchema();

  const ts = now();

  function addUser(username, displayName) {
    return Number(
      db
        .prepare(
          `INSERT INTO users (username, display_name, email, password_hash, status, created_at, updated_at)
           VALUES (?, ?, ?, 'x', 'active', ?, ?)`
        )
        .run(username, displayName, `${username}@example.com`, ts, ts).lastInsertRowid
    );
  }

  function addVisaPermit(userId, appNo, visaNo, holder) {
    const appId = db
      .prepare(
        `INSERT INTO visa_applications (app_no, user_id, type_code, status, nickname, contact, purpose, created_at, updated_at)
         VALUES (?, ?, 'TOURIST', 'issued', ?, 'test@example.com', '联动验收', ?, ?)`
      )
      .run(appNo, userId, holder, ts, ts).lastInsertRowid;
    db.prepare(
      `INSERT INTO visa_permits (visa_no, application_id, user_id, type_code, holder_name, status, verify_token, issued_at, valid_until, updated_at)
       VALUES (?, ?, ?, 'TOURIST', ?, 'valid', ?, ?, '2099-12-31', ?)`
    ).run(visaNo, appId, userId, holder, crypto.randomUUID(), ts, ts);
  }

  function addResidentCard(userId, cardNo, holder) {
    const appId = db
      .prepare(
        `INSERT INTO res_applications (app_no, user_id, type_code, status, nickname, created_at, updated_at)
         VALUES (?, ?, 'RESIDENT', 'approved', ?, ?, ?)`
      )
      .run(`RSA-${cardNo}`, userId, holder, ts, ts).lastInsertRowid;
    db.prepare(
      `INSERT INTO res_cards (card_no, user_id, application_id, type_code, nickname, status, verify_token, issued_at, valid_until, updated_at)
       VALUES (?, ?, ?, 'RESIDENT', ?, 'valid', ?, ?, '2099-12-31', ?)`
    ).run(cardNo, userId, appId, holder, crypto.randomUUID(), ts, ts);
  }

  const userA = addUser('link_id_a', '联动甲');
  const userB = addUser('link_id_b', '联动乙');
  addVisaPermit(userA, 'NLA-IDENTITY-A', 'NLT-IDENTITY-A', '联动甲');
  addVisaPermit(userB, 'NLA-IDENTITY-B', 'NLT-IDENTITY-B', '联动乙');

  db.prepare(
    `INSERT INTO pro_events (event_no, type_code, title, status, starts_at, ends_at, created_at, updated_at)
     VALUES ('NLP-IDENTITY-EVENT', 'CEREMONY', '联动验收活动', 'registration', ?, ?, ?, ?)`
  ).run(ts, ts, ts, ts);

  // 1. 按账户取件
  const own = listOwnedRecords('visa', userA);
  check(
    '取件只返回本人签注',
    own.some((r) => r.code === 'NLT-IDENTITY-A') && !own.some((r) => r.code === 'NLT-IDENTITY-B'),
    JSON.stringify(own.map((r) => r.code))
  );
  check('取件不包含他人签注', !own.some((r) => r.code === 'NLT-IDENTITY-B'));
  check('按 kind 过滤生效', listOwnedRecords('visa', userA, { kind: 'application' }).every((r) => r.kind === 'application'));
  check('未知来源返回空列表', listOwnedRecords('nope', userA).length === 0);

  // 2. 严格归属 + 非本人不返回明细
  const foreign = verifyBusinessRecord('visa', 'NLT-IDENTITY-B', userA);
  check('他人签注 owned=false', foreign.found && foreign.owned === false, JSON.stringify(foreign));
  check('他人签注不返回明细', foreign.detail && Object.keys(foreign.detail).length === 0 && !foreign.title);
  check('他人签注不泄露持有人', !JSON.stringify(foreign).includes('联动乙'));

  const mine = verifyBusinessRecord('visa', 'NLT-IDENTITY-A', userA);
  check('本人签注 owned=true', mine.found && mine.owned === true && mine.personal === true);
  check('本人签注返回脱敏明细', mine.detail && mine.detail.holder && mine.detail.holder.includes('***'));

  // 3. 无主记录不能被认领
  const ownerless = verifyBusinessRecord('protocol', 'NLP-IDENTITY-EVENT', userA);
  check('无主活动 found=true / owned=false', ownerless.found && ownerless.owned === false && ownerless.personal === false);
  check('无主活动归为 not_owned', classifyBizStatus('protocol', 'NLP-IDENTITY-EVENT', userA).status === 'not_owned');
  check('无主活动不进入取件列表', listOwnedRecords('protocol', userA).length === 0);

  // 4. 身份凭证:未办居民证 → SSO;办证后 → 居民证
  const ssoIdentity = linkageIdentity(userA);
  check('未办居民证时身份基准为 sso', ssoIdentity.basis === 'sso' && ssoIdentity.username === 'link_id_a');
  addResidentCard(userA, 'NRC-IDENTITY-A', '联动甲');
  const cardIdentity = linkageIdentity(userA);
  check('有居民证时身份基准为 resident_card', cardIdentity.basis === 'resident_card' && cardIdentity.cardNo === 'NRC-IDENTITY-A');
  check('居民证取件只返回本人卡', listOwnedRecords('resident', userA, { kind: 'card' }).some((r) => r.code === 'NRC-IDENTITY-A'));
  check('他人没有该居民证', listOwnedRecords('resident', userB).length === 0);

  // 5. 读取审计
  recordLinkageAccess({
    userId: userA,
    consumer: 'docs_apply',
    source: 'visa',
    action: 'list',
    count: own.length,
    detail: { test: true },
    ip: '127.0.0.1',
  });
  const logged = db
    .prepare('SELECT * FROM linkage_access_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userA);
  check(
    '读取写入审计日志',
    !!logged && logged.consumer === 'docs_apply' && logged.source === 'visa' && logged.count === own.length,
    JSON.stringify(logged || null)
  );
} catch (err) {
  failures += 1;
  console.error('FAIL  验收脚本异常', err?.stack || err);
} finally {
  cleanup();
}

if (failures) {
  console.error(`\n[linkage-identity] 失败 ${failures} 项`);
  process.exit(1);
}
console.log('\n[linkage-identity] 通过');