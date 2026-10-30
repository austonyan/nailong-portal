// 双语内容底座 — 端到端验收脚本。
// 自包含:临时数据目录 + 随机端口启动独立 API,校验四署站内信/模板的双语列、
// 种子繁体值,以及 X-Nailong-Locale 驱动的响应本地化。
// 用法: node server/scripts/smoke-i18n.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-i18n-'));
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

const MESSAGE_TABLES = [
  { table: 'im_messages', template: 'im_message_templates', endpoint: '/immigration/messages' },
  { table: 'res_messages', template: 'res_message_templates', endpoint: '/resident/messages' },
  { table: 'dip_messages', template: 'dip_message_templates', endpoint: '/dip/messages' },
  { table: 'pro_messages', template: 'pro_message_templates', endpoint: '/protocol/messages' },
];

function hasColumn(table, column) {
  return sqlite.pragma(`table_info(${table})`).some((c) => c.name === column);
}

function seedMessage(table, userId, suffix) {
  sqlite
    .prepare(
      `INSERT INTO ${table} (user_id, template_code, title, body, title_tw, body_tw, related, read, archived, created_at)
       VALUES (?, 'submit_success', ?, ?, ?, ?, '{}', 0, 0, ?)`
    )
    .run(userId, `简体标题${suffix}`, `简体正文${suffix}`, `繁體標題${suffix}`, `繁體正文${suffix}`, new Date().toISOString());
}

async function main() {
  await startServer();
  sqlite = new Database(path.join(dataDir, 'nailong.db'));
  sqlite.pragma('busy_timeout = 5000');

  // --- 双语列与种子完整性 ---------------------------------------------------
  for (const { table, template } of MESSAGE_TABLES) {
    check(`${table} 有 title_tw/body_tw`, hasColumn(table, 'title_tw') && hasColumn(table, 'body_tw'));
    check(
      `${template} 有繁体模板列`,
      hasColumn(template, 'title_template_tw') && hasColumn(template, 'body_template_tw')
    );
    const missing = sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM ${template}
         WHERE title_template_tw IS NULL OR title_template_tw = ''
            OR body_template_tw IS NULL OR body_template_tw = ''`
      )
      .get().n;
    check(`${template} 种子繁体非空`, missing === 0, `missing=${missing}`);
  }

  // --- 首启管理员 -----------------------------------------------------------
  const setup = await api('/setup/admin', {
    method: 'POST',
    body: {
      username: 'i18n_root',
      displayName: 'I18N Admin',
      email: 'i18n-admin@example.com',
      password: 'I18nPass12345',
    },
  });
  check('创建管理员', setup.status === 201 && !!setup.data.accessToken, JSON.stringify(setup.data));
  const token = setup.data.accessToken;
  const adminId = setup.data.user.id;

  // --- 目录/公告/活动按请求语言返回 ----------------------------------------
  const services = await api('/services/admin', { token, locale: 'zh-TW' });
  const visaService = services.data.items?.find((s) => s.key === 'visa');
  check('services 繁体', visaService?.name === '奶龍國簽註申請署' && visaService?.nameCn === '奶龙国签注申请署', JSON.stringify(visaService));

  const visaTypes = await api('/visa/admin/types', { token, locale: 'zh-TW' });
  check('visa_types 繁体', visaTypes.data.items?.[0]?.name === '旅遊簽註', JSON.stringify(visaTypes.data.items?.[0]));

  const ports = await api('/immigration/ports', { token, locale: 'zh-TW' });
  check('im_ports 繁体', ports.data.items?.[0]?.name === '皇家口岸', JSON.stringify(ports.data.items?.[0]));

  const resTypes = await api('/resident/types', { token, locale: 'zh-TW' });
  check('res_types 繁体', resTypes.data.items?.[0]?.name === '臨時居民', JSON.stringify(resTypes.data.items?.[0]));

  const dipOffices = await api('/dip/offices', { token, locale: 'zh-TW' });
  check('dip_offices 繁体', dipOffices.data.items?.[0]?.name === '中央大街代表處', JSON.stringify(dipOffices.data.items?.[0]));

  const protocolHome = await api('/protocol/home', { token, locale: 'zh-TW' });
  const protocolEvent = [...(protocolHome.data.hot || []), ...(protocolHome.data.upcoming || [])][0];
  check('pro_events 繁体', !protocolEvent || protocolEvent.title === '奶龍島春日文化交流週' || protocolEvent.titleTw != null, JSON.stringify(protocolEvent));

  const docsTypes = await api('/docs/types', { token, locale: 'zh-TW' });
  check('doc_types 繁体', docsTypes.data.items?.[0]?.name === '簽註證明認證', JSON.stringify(docsTypes.data.items?.[0]));

  const appealHome = await api('/appeal/home', { token, locale: 'zh-TW' });
  check(
    'appeal_notices 繁体',
    (appealHome.data.notices || []).some((n) => n.title === '申訴受理範圍與時效說明'),
    JSON.stringify(appealHome.data.notices)
  );

  // --- 四署站内信按请求语言返回 --------------------------------------------
  for (const { table, endpoint } of MESSAGE_TABLES) {
    seedMessage(table, adminId, table);

    const tw = await api(endpoint, { token, locale: 'zh-TW' });
    const twItem = tw.data.items?.[0];
    check(
      `${endpoint} zh-TW 返回繁体`,
      tw.status === 200 && twItem?.title === `繁體標題${table}` && twItem?.body === `繁體正文${table}`,
      JSON.stringify(twItem)
    );
    check(`${endpoint} zh-TW 附带简体源`, twItem?.titleCn === `简体标题${table}`, JSON.stringify(twItem));

    const cn = await api(endpoint, { token });
    const cnItem = cn.data.items?.[0];
    check(
      `${endpoint} 默认返回简体`,
      cn.status === 200 && cnItem?.title === `简体标题${table}` && cnItem?.body === `简体正文${table}`,
      JSON.stringify(cnItem)
    );
  }

  // --- Accept-Language 兜底 -------------------------------------------------
  const viaHeader = await fetch(`${base}/api/immigration/messages`, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Language': 'zh-TW,zh;q=0.9' },
  }).then((r) => r.json());
  check('Accept-Language 兜底繁体', viaHeader.items?.[0]?.title === '繁體標題im_messages', JSON.stringify(viaHeader.items?.[0]));

  if (failures) {
    console.error(`\n[i18n smoke] ${failures} 项失败`);
    process.exitCode = 1;
  } else {
    console.log('\n[i18n smoke] 全部通过');
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