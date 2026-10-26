// 跨署自动审批 — 端到端验收脚本。
// 自包含:临时数据目录 + 随机端口启动独立 API,直接向临时库插入各署最小待审件,
// 验证立即/延时/关闭三种模式、权限隔离与各署审批副作用。
// 用法: node server/scripts/smoke-auto-approve.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-auto-'));
const port = 42000 + Math.floor(Math.random() * 4000);
const base = `http://127.0.0.1:${port}`;

const env = {
  ...process.env,
  PORT: String(port),
  NAILONG_DATA_DIR: dataDir,
  AUTO_APPROVE_INTERVAL_MS: '300',
};
delete env.ADMIN_PASSWORD;

let child = null;
let serverLog = '';
let sqlite = null;
let failures = 0;

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function startServer() {
  serverLog = '';
  child = spawn(process.execPath, [serverEntry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => {
    serverLog += chunk;
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk;
  });
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${serverLog}`);
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  throw new Error(`server did not start:\n${serverLog}`);
}

function stopServer() {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(label, fn, { timeout = 15000, interval = 200 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await fn()) return true;
    await sleep(interval);
  }
  console.error(`FAIL  ${label} (timeout ${timeout}ms)`);
  failures += 1;
  return false;
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

function row(sql, ...params) {
  return sqlite.prepare(sql).get(...params);
}

function openDb() {
  sqlite = new Database(path.join(dataDir, 'nailong.db'));
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

async function main() {
  await startServer();
  const db = openDb();

  // -------------------------------------------------------------------------
  // 首次启动 → 管理员
  // -------------------------------------------------------------------------
  const status = await api('/setup/status');
  check('首启状态可读', status.status === 200 && status.data.required === true, JSON.stringify(status.data));

  const setup = await api('/setup/admin', {
    method: 'POST',
    body: {
      username: 'auto_root',
      displayName: 'Auto Admin',
      email: 'auto-admin@example.com',
      password: 'AutoPass12345',
    },
  });
  check('创建管理员', setup.status === 201 && !!setup.data.accessToken, JSON.stringify(setup.data));
  const token = setup.data.accessToken;
  const adminId = setup.data.user.id;

  // -------------------------------------------------------------------------
  // 设置接口:默认值、校验、权限隔离
  // -------------------------------------------------------------------------
  const defaults = await api('/auto-approve/visa', { token });
  check('默认关闭', defaults.data.settings?.mode === 'off', JSON.stringify(defaults.data));

  const badMode = await api('/auto-approve/visa', { method: 'PATCH', token, body: { mode: 'bogus' } });
  check('非法模式被拒绝', badMode.status === 400 && badMode.data.code === 'VALIDATION_ERROR', JSON.stringify(badMode.data));

  const badDelay = await api('/auto-approve/visa', { method: 'PATCH', token, body: { mode: 'delayed', delayMinutes: 0 } });
  check('延时模式必须有正延时', badDelay.status === 400 && badDelay.data.code === 'VALIDATION_ERROR', JSON.stringify(badDelay.data));

  const unknown = await api('/auto-approve/nope', { token });
  check('未知署返回 404', unknown.status === 404, JSON.stringify(unknown.data));

  const plain = await api('/auth/register', {
    method: 'POST',
    body: { username: `auto_plain_${Date.now().toString(36)}`, password: 'PlainPass12345', displayName: 'Plain User' },
  });
  check('注册普通用户', plain.status === 200 || plain.status === 201, JSON.stringify(plain.data));
  const plainToken = plain.data.accessToken;
  const plainGet = await api('/auto-approve/visa', { token: plainToken });
  check('无管理权限读取被拒绝', plainGet.status === 403, JSON.stringify(plainGet.data));
  const plainPatch = await api('/auto-approve/visa', { method: 'PATCH', token: plainToken, body: { mode: 'immediate' } });
  check('无管理权限写入被拒绝', plainPatch.status === 403, JSON.stringify(plainPatch.data));

  const services = ['visa', 'immigration', 'dip', 'resident', 'protocol', 'docs', 'appeal'];
  for (const service of services) {
    const res = await api(`/auto-approve/${service}`, { method: 'PATCH', token, body: { mode: 'immediate' } });
    check(`开启立即审批 ${service}`, res.status === 200 && res.data.settings?.mode === 'immediate', JSON.stringify(res.data));
  }
  const saved = await api('/auto-approve/visa', { token });
  check('设置持久化', saved.data.settings?.mode === 'immediate' && saved.data.settings?.updatedBy === 'Auto Admin', JSON.stringify(saved.data));

  // -------------------------------------------------------------------------
  // 插入七署最小待审件
  // -------------------------------------------------------------------------
  const suffix = Date.now().toString(36);
  const now = iso();
  const past = iso(-60 * 60 * 1000);

  const visaId = db
    .prepare(
      `INSERT INTO visa_applications
       (app_no, user_id, type_code, status, nickname, contact, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'TOURIST', 'pending_review', 'Auto Tester', 'auto@example.com', ?, ?, ?)`
    )
    .run(`AUTO-VISA-${suffix}`, adminId, now, now, now).lastInsertRowid;

  const immId = db
    .prepare(
      `INSERT INTO im_declarations
       (no, user_id, port_id, nickname, contact, purpose, status, created_at, updated_at, submitted_at)
       VALUES (?, ?, 1, 'Auto Tester', 'auto@example.com', 'fun', 'pending', ?, ?, ?)`
    )
    .run(`AUTO-IM-${suffix}`, adminId, now, now, now).lastInsertRowid;

  const relationNo = `AUTO-REL-${suffix}`;
  const relationId = db
    .prepare(
      `INSERT INTO dip_relations
       (no, user_id, object_type, relation_type, entity_name, rep_nickname, contact, status, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'country', 'FORMAL', 'Auto Entity', 'Auto Rep', 'auto@example.com', 'pending_review', ?, ?, ?)`
    )
    .run(relationNo, adminId, now, now, now).lastInsertRowid;
  const identityId = db
    .prepare(
      `INSERT INTO dip_identities
       (no, user_id, identity_type, relation_id, relation_no, entity_name, nickname, contact, status, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'ENVOY', ?, ?, 'Auto Entity', 'Auto Tester', 'auto@example.com', 'pending_review', ?, ?, ?)`
    )
    .run(`AUTO-IDT-${suffix}`, adminId, relationId, relationNo, now, now, now).lastInsertRowid;

  const resAppId = db
    .prepare(
      `INSERT INTO res_applications
       (app_no, user_id, type_code, status, nickname, contact, virtual_address, bio, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'TEMPORARY', 'pending_review', 'Auto Tester', 'auto@example.com', 'Auto Address', 'Auto Bio', ?, ?, ?)`
    )
    .run(`AUTO-RES-${suffix}`, adminId, now, now, now).lastInsertRowid;

  const regId = db
    .prepare(
      `INSERT INTO pro_registrations
       (reg_no, user_id, event_id, status, nickname, contact, created_at, updated_at, submitted_at)
       VALUES (?, ?, 1, 'pending_review', 'Auto Tester', 'auto@example.com', ?, ?, ?)`
    )
    .run(`AUTO-REG-${suffix}`, adminId, now, now, now).lastInsertRowid;
  const hostId = db
    .prepare(
      `INSERT INTO pro_hosts
       (host_no, user_id, name, status, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'Auto Host', 'pending_review', ?, ?, ?)`
    )
    .run(`AUTO-HOST-${suffix}`, adminId, now, now, now).lastInsertRowid;
  const courtesyId = db
    .prepare(
      `INSERT INTO pro_courtesy_apps
       (app_no, user_id, type_code, basis_type, status, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'foreign_reception', 'resident', 'pending_review', ?, ?, ?)`
    )
    .run(`AUTO-COUR-${suffix}`, adminId, now, now, now).lastInsertRowid;

  const docId = db
    .prepare(
      `INSERT INTO doc_applications
       (app_no, user_id, type_code, status, nickname, contact, biz_no, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'INVITE', 'pending', 'Auto Tester', 'auto@example.com', '', ?, ?, ?)`
    )
    .run(`AUTO-DOC-${suffix}`, adminId, now, now, now).lastInsertRowid;

  const appealId = db
    .prepare(
      `INSERT INTO appeal_appeals
       (code, user_id, biz_type, biz_code, status, reason, expected, contact, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'visa', ?, 'pending_accept', '自动审批验收', '重新审核', 'auto@example.com', ?, ?, ?)`
    )
    .run(`AUTO-APL-${suffix}`, adminId, `AUTO-VISA-${suffix}`, now, now, now).lastInsertRowid;
  const complaintId = db
    .prepare(
      `INSERT INTO appeal_complaints
       (code, user_id, kind, category, status, content, contact, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'complaint', 'process', 'pending_accept', '自动审批验收', 'auto@example.com', ?, ?, ?)`
    )
    .run(`AUTO-CMP-${suffix}`, adminId, now, now, now).lastInsertRowid;

  check('七署待审件已写入', true);

  // -------------------------------------------------------------------------
  // 立即审批:状态与下游副作用
  // -------------------------------------------------------------------------
  await waitFor('签注申请自动通过', () => row('SELECT status FROM visa_applications WHERE id = ?', visaId).status === 'approved');
  await waitFor('入境申报自动通过', () => row('SELECT status FROM im_declarations WHERE id = ?', immId).status === 'approved');
  await waitFor('建交自动生效', () => row('SELECT status FROM dip_relations WHERE id = ?', relationId).status === 'established');
  await waitFor('外交身份自动生效', () => row('SELECT status FROM dip_identities WHERE id = ?', identityId).status === 'active');
  await waitFor('居民登记自动通过', () => row('SELECT status FROM res_applications WHERE id = ?', resAppId).status === 'approved');
  await waitFor('活动报名自动通过', () => row('SELECT status FROM pro_registrations WHERE id = ?', regId).status === 'approved');
  await waitFor('接待方自动认证', () => row('SELECT status FROM pro_hosts WHERE id = ?', hostId).status === 'certified');
  await waitFor('礼遇申请自动通过', () => row('SELECT status FROM pro_courtesy_apps WHERE id = ?', courtesyId).status === 'approved');
  await waitFor('文书认证自动通过', () => row('SELECT status FROM doc_applications WHERE id = ?', docId).status === 'approved');
  await waitFor('申诉自动受理', () => row('SELECT status FROM appeal_appeals WHERE id = ?', appealId).status === 'accepted');
  await waitFor('投诉自动受理', () => row('SELECT status FROM appeal_complaints WHERE id = ?', complaintId).status === 'processing');

  const review = row("SELECT * FROM visa_reviews WHERE application_id = ? AND action = 'approve'", visaId);
  check('签注审核轨迹以系统身份写入', review && review.reviewer_id === 0 && review.reviewer_name === 'system', JSON.stringify(review));
  const visaAudit = row("SELECT * FROM visa_audit WHERE action = 'approve_application' AND target_id = ?", `AUTO-VISA-${suffix}`);
  check('签注审计标记 auto', visaAudit && JSON.parse(visaAudit.detail).auto === true, JSON.stringify(visaAudit));
  check('入境通关码已生成', !!row('SELECT id FROM im_pass_codes WHERE declaration_id = ?', immId));
  check('外交礼遇记录已生成', !!row('SELECT id FROM dip_courtesy_records WHERE identity_id = ?', identityId));
  check('居民卡已生成', !!row('SELECT id FROM res_cards WHERE application_id = ?', resAppId));
  check('活动凭证已生成', !!row('SELECT id FROM pro_passes WHERE registration_id = ?', regId));
  check('接待方证书编号已生成', !!row('SELECT cert_no FROM pro_hosts WHERE id = ?', hostId).cert_no);
  check('礼遇使用记录已生成', !!row('SELECT id FROM pro_courtesy_records WHERE application_id = ?', courtesyId));
  check('文书已签发', !!row('SELECT id FROM doc_certificates WHERE application_id = ?', docId));
  const acceptedAppeal = row('SELECT * FROM appeal_appeals WHERE id = ?', appealId);
  check('申诉受理人为系统', acceptedAppeal.handler_name === 'system', JSON.stringify(acceptedAppeal));

  // 居民变更需要先有居民卡,卡片生成后再插入
  const card = row('SELECT * FROM res_cards WHERE application_id = ?', resAppId);
  const changeId = db
    .prepare(
      `INSERT INTO res_changes (no, user_id, card_id, type, payload, status, created_at, updated_at)
       VALUES (?, ?, ?, 'info', ?, 'pending_review', ?, ?)`
    )
    .run(
      `AUTO-CHG-${suffix}`,
      adminId,
      card.id,
      JSON.stringify({ contact: 'auto-updated@example.com' }),
      now,
      now
    ).lastInsertRowid;
  await waitFor('居民变更自动通过', () => row('SELECT status FROM res_changes WHERE id = ?', changeId).status === 'approved');
  const resident = row('SELECT contact FROM res_residents WHERE user_id = ?', adminId);
  check('居民变更已写回档案', resident?.contact === 'auto-updated@example.com', JSON.stringify(resident));

  // -------------------------------------------------------------------------
  // 延时审批:新件在 cutoff 之前保持待审,回填时间后自动通过
  // -------------------------------------------------------------------------
  const delayed = await api('/auto-approve/visa', { method: 'PATCH', token, body: { mode: 'delayed', delayMinutes: 5 } });
  check('切换延时审批', delayed.data.settings?.mode === 'delayed' && delayed.data.settings?.delayMinutes === 5, JSON.stringify(delayed.data));

  const delayedId = db
    .prepare(
      `INSERT INTO visa_applications
       (app_no, user_id, type_code, status, nickname, contact, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'TOURIST', 'pending_review', 'Delayed Tester', 'auto@example.com', ?, ?, ?)`
    )
    .run(`AUTO-DELAY-${suffix}`, adminId, now, now, now).lastInsertRowid;
  await sleep(1200);
  check(
    '延时未到不审批',
    row('SELECT status FROM visa_applications WHERE id = ?', delayedId).status === 'pending_review'
  );

  db.prepare('UPDATE visa_applications SET updated_at = ? WHERE id = ?').run(iso(-10 * 60 * 1000), delayedId);
  await waitFor('延时到点自动通过', () => row('SELECT status FROM visa_applications WHERE id = ?', delayedId).status === 'approved');

  // -------------------------------------------------------------------------
  // 关闭:即使积压也不自动处理
  // -------------------------------------------------------------------------
  const off = await api('/auto-approve/visa', { method: 'PATCH', token, body: { mode: 'off' } });
  check('关闭自动审批', off.data.settings?.mode === 'off', JSON.stringify(off.data));
  const offId = db
    .prepare(
      `INSERT INTO visa_applications
       (app_no, user_id, type_code, status, nickname, contact, created_at, updated_at, submitted_at)
       VALUES (?, ?, 'TOURIST', 'pending_review', 'Off Tester', 'auto@example.com', ?, ?, ?)`
    )
    .run(`AUTO-OFF-${suffix}`, adminId, past, past, past).lastInsertRowid;
  await sleep(1200);
  check('关闭后积压件保持待审', row('SELECT status FROM visa_applications WHERE id = ?', offId).status === 'pending_review');

  if (failures) {
    console.error(`\n${failures} 项失败 ✘`);
  } else {
    console.log('\n全部通过 ✔');
  }
}

try {
  await main();
} catch (err) {
  failures += 1;
  console.error('FAIL  未捕获异常:', err);
  if (serverLog) console.error(`--- server log ---\n${serverLog}`);
} finally {
  if (sqlite) sqlite.close();
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exitCode = failures ? 1 : 0;
}