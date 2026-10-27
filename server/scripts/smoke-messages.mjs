// 跨署站内信聚合 — 端到端验收脚本。
// 自包含:临时数据目录 + 随机端口启动独立 API,直接往各署信箱表插数据,
// 校验合并排序、权限过滤、归档排除、档案镜像去重、简繁返回与已读回写。
// 用法: node server/scripts/smoke-messages.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-messages-'));
const port = 46000 + Math.floor(Math.random() * 3000);
const base = `http://127.0.0.1:${port}`;

const env = {
  ...process.env,
  PORT: String(port),
  NAILONG_DATA_DIR: dataDir,
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

async function api(pathname, { method = 'GET', token, body, locale } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (locale) headers['X-Nailong-Locale'] = locale;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const at = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();

function seed(userId) {
  const iso1 = at(1);
  const iso2 = at(2);
  const iso3 = at(3);
  const iso4 = at(4);
  const isoArchived = at(5);

  sqlite
    .prepare(
      `INSERT INTO visa_messages (user_id, application_id, type, params, read, archived, created_at)
       VALUES (?, NULL, 'approved', ?, 0, 0, ?)`
    )
    .run(userId, JSON.stringify({ appNo: 'NLA-TEST-1' }), iso1);

  sqlite
    .prepare(
      `INSERT INTO arch_messages (user_id, request_id, type, params, source, channel, read, created_at)
       VALUES (?, NULL, 'submitted', ?, 'archives', 'postal', 0, ?)`
    )
    .run(userId, JSON.stringify({ no: 'ARC-TEST-1' }), iso2);

  sqlite
    .prepare(
      `INSERT INTO im_messages (user_id, template_code, title, body, title_tw, body_tw, related, read, archived, created_at)
       VALUES (?, 'approved', '申报已通过:IM-1', '简化正文', '申報已通過:IM-1', '繁體正文', '{}', 0, 0, ?)`
    )
    .run(userId, iso3);

  sqlite
    .prepare(
      `INSERT INTO post_messages (user_id, source, type, params, title, title_tw, body, body_tw, read, archived, created_at)
       VALUES (?, 'tourism', 'tour_checkin', ?, NULL, NULL, NULL, NULL, 0, 0, ?)`
    )
    .run(userId, JSON.stringify({ attractionName: '灯塔', checkinNo: 'C-1' }), iso4);

  // 档案署的邮政镜像行:聚合时必须排除,否则同一条消息出现两次
  sqlite
    .prepare(
      `INSERT INTO post_messages (user_id, source, type, params, title, title_tw, body, body_tw, read, archived, created_at)
       VALUES (?, 'archives', 'archives_submitted', '{}', NULL, NULL, NULL, NULL, 0, 0, ?)`
    )
    .run(userId, iso2);

  // 已归档的消息既不进列表也不计入未读
  sqlite
    .prepare(
      `INSERT INTO visa_messages (user_id, application_id, type, params, read, archived, created_at)
       VALUES (?, NULL, 'closed', '{}', 0, 1, ?)`
    )
    .run(userId, isoArchived);

  return { iso1, iso2, iso3, iso4 };
}

async function main() {
  await startServer();
  sqlite = new Database(path.join(dataDir, 'nailong.db'));
  sqlite.pragma('busy_timeout = 5000');

  const setup = await api('/setup/admin', {
    method: 'POST',
    body: {
      username: 'msg_root',
      displayName: 'Message Admin',
      email: 'msg-admin@example.com',
      password: 'MsgPass12345',
    },
  });
  check('创建管理员', setup.status === 201 && !!setup.data.accessToken, JSON.stringify(setup.data));
  const token = setup.data.accessToken;
  const userId = setup.data.user.id;

  const stamps = seed(userId);

  // --- 聚合列表 -------------------------------------------------------------
  const all = await api('/messages', { token });
  check('聚合接口可用', all.status === 200 && Array.isArray(all.data.items), JSON.stringify(all.data).slice(0, 200));
  check('合并四个来源(档案镜像不重复)', all.data.items?.length === 4, `len=${all.data.items?.length}`);
  check(
    '按时间倒序',
    all.data.items?.map((item) => item.office).join(',') === 'postal,immigration,archives,visa',
    JSON.stringify(all.data.items?.map((item) => `${item.office}@${item.createdAt}`))
  );
  check(
    '档案镜像行已排除',
    !all.data.items?.some((item) => item.office === 'postal' && item.source === 'archives')
  );
  check('归档消息不进列表', !all.data.items?.some((item) => item.type === 'closed'));
  check('未读合计 4', all.data.unread?.total === 4, JSON.stringify(all.data.unread));
  check(
    '分署未读计数',
    all.data.unread?.byOffice?.find((row) => row.office === 'visa')?.unread === 1,
    JSON.stringify(all.data.unread?.byOffice)
  );
  check(
    '服务端渲染消息带 title/body',
    all.data.items?.find((item) => item.office === 'immigration')?.title === '申报已通过:IM-1',
    JSON.stringify(all.data.items?.find((item) => item.office === 'immigration'))
  );
  check(
    '邮政来源可用 source 区分',
    all.data.items?.find((item) => item.office === 'postal')?.source === 'tourism'
  );

  // --- 未读筛选与署筛选 ------------------------------------------------------
  const unreadOnly = await api('/messages?status=unread', { token });
  check('未读筛选返回 4 条', unreadOnly.data.items?.length === 4, `len=${unreadOnly.data.items?.length}`);

  const visaOnly = await api('/messages?office=visa', { token });
  check(
    '署筛选只返回该署',
    visaOnly.data.items?.length === 1 && visaOnly.data.items[0].office === 'visa',
    JSON.stringify(visaOnly.data.items)
  );

  const unknownOffice = await api('/messages?office=nope', { token });
  check('未授权/未知署返回 403', unknownOffice.status === 403, `status=${unknownOffice.status}`);

  const unreadApi = await api('/messages/unread', { token });
  check('未读接口 total=4', unreadApi.data.total === 4, JSON.stringify(unreadApi.data));

  // --- 简繁返回 -------------------------------------------------------------
  const tw = await api('/messages?office=immigration', { token, locale: 'zh-TW' });
  const twItem = tw.data.items?.[0];
  check(
    'zh-TW 返回繁体标题',
    twItem?.title === '申報已通過:IM-1' && twItem?.body === '繁體正文',
    JSON.stringify(twItem)
  );

  // --- 已读回写 -------------------------------------------------------------
  const visaItem = visaOnly.data.items[0];
  const mark = await api('/messages/read', {
    method: 'POST',
    token,
    body: { office: visaItem.office, id: visaItem.id },
  });
  check('标记单条已读', mark.status === 200 && mark.data.ok === true, JSON.stringify(mark.data));

  const afterRead = await api('/messages/unread', { token });
  check('单条已读后未读 3', afterRead.data.total === 3, JSON.stringify(afterRead.data));

  const visaInbox = await api('/visa/messages', { token });
  check(
    '已读状态回写到签注署自己的信箱',
    visaInbox.data.items?.find((item) => item.id === visaItem.id)?.read === true,
    JSON.stringify(visaInbox.data.items?.[0])
  );

  const readAll = await api('/messages/read-all', { method: 'POST', token, body: {} });
  check('全部已读', readAll.status === 200 && readAll.data.ok === true, JSON.stringify(readAll.data));

  const cleared = await api('/messages/unread', { token });
  check('全部已读后未读 0', cleared.data.total === 0, JSON.stringify(cleared.data));

  const stillFour = await api('/messages', { token });
  check('已读后消息仍在列表', stillFour.data.items?.length === 4, `len=${stillFour.data.items?.length}`);

  if (failures) {
    console.error(`\n[messages smoke] ${failures} 项失败`);
    process.exitCode = 1;
  } else {
    console.log('\n[messages smoke] 全部通过');
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (sqlite) sqlite.close();
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
}