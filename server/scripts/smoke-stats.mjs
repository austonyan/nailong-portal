// 奶龙国皇家统计署 — 端到端验收脚本。
// 自包含:临时数据目录 + 随机端口启动独立 API,覆盖管理端看板、统计口径 CRUD、
// 数据导出留痕、审计、年度报告状态机、双语回读、权限隔离与邮政契约消息落库。
//
// 注意:本脚本依赖集成完成后的状态 —
//   1. server/db.js 的 PERMISSIONS 已登记 stat:portal / stat:manage(脚本会先
//      直接把权限行插进临时库,提前运行也能通过授权阶段);
//   2. server/index.js 已挂载 /api/stats 与 /api/stats/admin 路由。
// 在集成完成前运行会因 404 失败,这是预期行为(统一门禁稍后运行)。
//
// 用法: node server/scripts/smoke-stats.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-stats-'));
// 本进程 import db.js 时也必须落在临时库:db.js 在 import 时读 process.env
// (server/db.js:9),不设置就会初始化仓库默认库,临时库则缺少核心表。
delete process.env.ADMIN_PASSWORD;
process.env.NAILONG_DATA_DIR = dataDir;

let base = '';
let port = 0;
const env = {
  ...process.env,
  NAILONG_DATA_DIR: dataDir,
};
delete env.ADMIN_PASSWORD;

let child = null;
let serverLog = '';
let sqlite = null;
let sharedDb = null; // db.js 的模块级连接,收尾必须关闭,否则 Windows 下临时目录删不掉
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

async function tryStartServer(attempt) {
  port = 41000 + Math.floor(Math.random() * 20000);
  base = `http://127.0.0.1:${port}`;
  serverLog = '';
  child = spawn(process.execPath, [serverEntry], {
    env: { ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => {
    serverLog += chunk;
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk;
  });
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) {
      if (/EADDRINUSE/.test(serverLog) && attempt < 5) {
        await stopServer();
        return false;
      }
      throw new Error(`server exited early:\n${serverLog}`);
    }
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return true;
    } catch {
      // not listening yet
    }
    await sleep(100);
  }
  throw new Error(`server did not start:\n${serverLog}`);
}

async function startServer() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    if (await tryStartServer(attempt)) return;
  }
  throw new Error('EADDRINUSE: retried 5 ports, all busy');
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

function row(sql, ...params) {
  return sqlite.prepare(sql).get(...params);
}

function openDb() {
  sqlite = new Database(path.join(dataDir, 'nailong.db'));
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

async function main() {
  // -------------------------------------------------------------------------
  // 0. 先在本进程 import db.js,让临时库完成核心建库种子;再把本署权限行直接
  //    插进临时库(权限列结构同 server/db.js 的 permissions 建表),这样服务器
  //    进程启动后 ensureStatsSchema() 就能把权限授予 admin / user / stat_admin。
  // -------------------------------------------------------------------------
  sharedDb = (await import(pathToFileURL(path.join(__dirname, '..', 'db.js')).href)).db;
  const db = openDb();

  const insertPermission = db.prepare(
    `INSERT OR IGNORE INTO permissions (key, name, name_tw, description, description_tw, grp)
     VALUES (?, ?, ?, ?, ?, 'stats')`
  );
  insertPermission.run('stat:portal', '统计署访问', '統計署存取', '查看平台趣味统计并生成自己的年度报告', '檢視平台趣味統計並產生自己的年度報告');
  insertPermission.run('stat:manage', '统计署管理', '統計署管理', '平台总看板、统计口径管理、数据导出与审计查看', '平台總看板、統計口徑管理、資料匯出與稽核檢視');

  const grantToRole = db.prepare(
    `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
     SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
  );
  grantToRole.run('admin', 'stat:portal');
  grantToRole.run('admin', 'stat:manage');
  grantToRole.run('user', 'stat:portal');
  db.close();
  sqlite = null;

  await startServer();
  openDb();

  // -------------------------------------------------------------------------
  // 1. 首启 → 管理员 + 普通用户
  // -------------------------------------------------------------------------
  const status = await api('/setup/status');
  check('首启状态可读', status.status === 200 && status.data.required === true, JSON.stringify(status.data));

  const setup = await api('/setup/admin', {
    method: 'POST',
    body: { username: 'admin', displayName: '站长', email: 'admin@example.com', password: 'admin123' },
  });
  check('创建管理员', setup.status === 201 && !!setup.data.accessToken, JSON.stringify(setup.data));
  const adminToken = setup.data.accessToken;
  const adminId = setup.data.user.id;

  const suffix = Date.now().toString(36);
  const register = await api('/auth/register', {
    method: 'POST',
    body: { username: `stat_user_${suffix}`, password: 'UserPass12345', displayName: '统计员小龙' },
  });
  check('注册普通用户', register.status === 201 && !!register.data.accessToken, JSON.stringify(register.data));
  const userToken = register.data.accessToken;
  const userId = register.data.user.id;

  // -------------------------------------------------------------------------
  // 2. 权限隔离(内置 user 角色已回填 stat:portal,不含 stat:manage)
  // -------------------------------------------------------------------------
  const userHome = await api('/stats/home', { token: userToken });
  check('普通用户可读趣味统计', userHome.status === 200 && Array.isArray(userHome.data.metrics), JSON.stringify(userHome.data));

  const userDenied = await api('/stats/admin/dashboard', { token: userToken });
  check('无管理权限访问管理端被拒绝', userDenied.status === 403, JSON.stringify(userDenied.data));

  const anonDenied = await api('/stats/home');
  check('未登录访问被拒绝', anonDenied.status === 401, JSON.stringify(anonDenied.data));

  // -------------------------------------------------------------------------
  // 3. 用户端:趣味统计首页 + 双语回读
  // -------------------------------------------------------------------------
  const home = await api('/stats/home', { token: adminToken });
  check(
    '首页统计渲染(种子口径齐全)',
    home.status === 200 && home.data.metrics.length >= 10 && !!home.data.asOf,
    JSON.stringify({ count: home.data.metrics?.length })
  );

  const metricsTw = await api('/stats/metrics', { token: adminToken, locale: 'zh-TW' });
  const firstMetric = metricsTw.data.items?.[0];
  check(
    '繁体回读:名称双语成对',
    metricsTw.status === 200 && !!firstMetric && !!firstMetric.nameTw && !!firstMetric.nameCn && firstMetric.nameTw !== firstMetric.nameCn,
    JSON.stringify(firstMetric)
  );

  // 服务卡:繁体语言下名称为繁体
  const servicesTw = await api('/services', { token: adminToken, locale: 'zh-TW' });
  const statsCard = (servicesTw.data.items ?? []).find((item) => item.key === 'stats');
  check('服务卡繁体名称', statsCard?.name === '奶龍國皇家統計署' && statsCard?.entryMode === 'internal_sso', JSON.stringify(statsCard));

  // -------------------------------------------------------------------------
  // 4. 年度报告:生成 → 列表 → 详情 → 幂等重生成 → 校验 → 限流
  // -------------------------------------------------------------------------
  const year = new Date().getFullYear();
  const gen = await api('/stats/reports', { method: 'POST', token: adminToken, body: { year } });
  const reportNo = gen.data.report?.no;
  check(
    '生成年度报告(NSR 编号+快照)',
    gen.status === 200 && typeof reportNo === 'string' && reportNo.startsWith('NSR-') && (gen.data.report.snapshot?.sections?.length ?? 0) >= 1,
    JSON.stringify(gen.data)
  );
  const reportId = gen.data.report?.id;

  const regen = await api('/stats/reports', { method: 'POST', token: adminToken, body: { year } });
  check('同年度重生成幂等(编号不变)', regen.status === 200 && regen.data.report?.no === reportNo, JSON.stringify(regen.data));

  const badYear = await api('/stats/reports', { method: 'POST', token: adminToken, body: { year: 1999 } });
  check('非法年度被拒绝', badYear.status === 400 && badYear.data.code === 'STAT_YEAR_INVALID', JSON.stringify(badYear.data));

  const list = await api('/stats/reports', { token: adminToken });
  check('报告列表可读', list.status === 200 && list.data.items.length === 1, JSON.stringify(list.data));

  const detail = await api(`/stats/reports/${reportId}`, { token: adminToken });
  check('报告详情含快照', detail.status === 200 && detail.data.report?.snapshot?.year === year, JSON.stringify(detail.data));

  const notFound = await api('/stats/reports/999999', { token: adminToken });
  check('不存在报告返回 404', notFound.status === 404 && notFound.data.code === 'STAT_REPORT_NOT_FOUND', JSON.stringify(notFound.data));

  const notYours = await api(`/stats/reports/${reportId}`, { token: userToken });
  check('他人报告被拒绝', notYours.status === 403, JSON.stringify(notYours.data));

  // 限流:stat.report_rate_per_hour 默认每小时 6 次;已耗 2 次,继续打到 429
  let rateLimited = false;
  for (let i = 0; i < 6 && !rateLimited; i += 1) {
    const attemptRes = await api('/stats/reports', { method: 'POST', token: adminToken, body: { year } });
    if (attemptRes.status === 429) rateLimited = attemptRes.data.code === 'STAT_RATE_LIMITED';
  }
  check('生成频率超限返回 429', rateLimited);

  // -------------------------------------------------------------------------
  // 5. 管理端:平台总看板
  // -------------------------------------------------------------------------
  const dash = await api('/stats/admin/dashboard', { token: adminToken });
  const offices = dash.data.offices ?? [];
  const visaBoard = offices.find((office) => office.key === 'visa');
  check(
    '总看板渲染(覆盖各署卡片)',
    dash.status === 200 && offices.length >= 8 && visaBoard?.available === true,
    JSON.stringify({ count: offices.length, visa: visaBoard })
  );

  // -------------------------------------------------------------------------
  // 6. 管理端:统计口径 CRUD
  // -------------------------------------------------------------------------
  const createMetric = await api('/stats/admin/metrics', {
    method: 'POST',
    token: adminToken,
    body: {
      code: 'smoke_users',
      name: '冒烟用户数',
      nameTw: '煙測使用者數',
      sourceOffice: 'portal',
      tableName: 'users',
      statusValue: 'active',
    },
  });
  check(
    '新增口径(实时计数)',
    createMetric.status === 200 && createMetric.data.metric?.value >= 2 && createMetric.data.metric?.available === true,
    JSON.stringify(createMetric.data)
  );
  const metricId = createMetric.data.metric?.id;

  const dupMetric = await api('/stats/admin/metrics', {
    method: 'POST',
    token: adminToken,
    body: { code: 'smoke_users', name: '重复', tableName: 'users' },
  });
  check('重复代码被拒绝', dupMetric.status === 409 && dupMetric.data.code === 'STAT_METRIC_CODE_EXISTS', JSON.stringify(dupMetric.data));

  const badTable = await api('/stats/admin/metrics', {
    method: 'POST',
    token: adminToken,
    body: { code: 'smoke_bad', name: '非法来源', tableName: 'sessions' },
  });
  check('非业务表来源被拒绝', badTable.status === 400 && badTable.data.code === 'STAT_METRIC_TABLE_INVALID', JSON.stringify(badTable.data));

  const patchMetric = await api(`/stats/admin/metrics/${metricId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { name: '冒烟用户数(改)', enabled: false },
  });
  check('编辑口径(改名+停用)', patchMetric.status === 200 && patchMetric.data.metric?.name === '冒烟用户数(改)' && patchMetric.data.metric?.enabled === false, JSON.stringify(patchMetric.data));

  const portalMetrics = await api('/stats/metrics', { token: adminToken });
  check('停用口径不出现在前台', !(portalMetrics.data.items ?? []).some((item) => item.code === 'smoke_users'));

  const delMetric = await api(`/stats/admin/metrics/${metricId}`, { method: 'DELETE', token: adminToken });
  check('删除口径', delMetric.status === 200 && delMetric.data.ok === true, JSON.stringify(delMetric.data));

  const adminMetrics = await api('/stats/admin/metrics', { token: adminToken });
  check('删除后列表不再展示', !(adminMetrics.data.items ?? []).some((item) => item.code === 'smoke_users'));

  const softDeleted = row('SELECT deleted_at FROM stat_metrics WHERE code = ?', 'smoke_users');
  check('口径软删除生效(deleted_at 落库)', !!softDeleted?.deleted_at, JSON.stringify(softDeleted));

  // -------------------------------------------------------------------------
  // 7. 管理端:数据导出 + 留痕
  // -------------------------------------------------------------------------
  const csvRes = await fetch(`${base}/api/stats/admin/export.csv?metrics=${encodeURIComponent('users_total,visa_issued')}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const csvText = await csvRes.text();
  check(
    '导出 CSV(选中指标)',
    csvRes.status === 200 && csvText.includes('users_total') && csvText.includes('visa_issued') && csvText.includes('注册用户数'),
    csvText.slice(0, 120)
  );

  const emptyExport = await api('/stats/admin/export.csv?metrics=__none__', { token: adminToken });
  check('空导出被拒绝', emptyExport.status === 400 && emptyExport.data.code === 'STAT_EXPORT_EMPTY', JSON.stringify(emptyExport.data));

  const exportLogs = await api('/stats/admin/export-logs', { token: adminToken });
  check(
    '导出留痕可查',
    exportLogs.status === 200 && (exportLogs.data.items ?? []).some((item) => String(item.metric_codes).includes('users_total')),
    JSON.stringify(exportLogs.data)
  );

  // -------------------------------------------------------------------------
  // 8. 管理端:审计
  // -------------------------------------------------------------------------
  const auditAll = await api('/stats/admin/audit', { token: adminToken });
  check(
    '审计有记录(口径增删改/导出/报告)',
    auditAll.status === 200
      && ['metric_create', 'metric_update', 'metric_delete', 'export', 'report_generate'].every((action) =>
        (auditAll.data.items ?? []).some((item) => item.action === action)
      ),
    JSON.stringify(auditAll.data.items?.slice(0, 3))
  );

  const auditFiltered = await api('/stats/admin/audit?action=export', { token: adminToken });
  check(
    '审计按动作过滤',
    auditFiltered.status === 200 && (auditFiltered.data.items ?? []).length >= 1 && auditFiltered.data.items.every((item) => item.action === 'export'),
    JSON.stringify(auditFiltered.data)
  );

  // -------------------------------------------------------------------------
  // 9. 邮政契约:报告生成完成消息落库
  // -------------------------------------------------------------------------
  const postalMsg = row(
    "SELECT id FROM post_messages WHERE source = 'stats' AND type = 'annual_report_ready' LIMIT 1"
  );
  check('邮政契约消息落库', !!postalMsg?.id, JSON.stringify(postalMsg ?? null));

  // -------------------------------------------------------------------------
  // 10. 种子双语:口径与服务卡 name_tw 成对
  // -------------------------------------------------------------------------
  const seedTw = row('SELECT name_tw FROM stat_metrics WHERE code = ?', 'users_total');
  check('种子口径繁体成对', seedTw?.name_tw === '註冊使用者數', JSON.stringify(seedTw));
  const cardTw = row("SELECT name_tw FROM services WHERE key = 'stats'");
  check('服务卡种子繁体成对', cardTw?.name_tw === '奶龍國皇家統計署', JSON.stringify(cardTw));

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
  try {
    sharedDb?.close();
  } catch {
    // 已关闭
  }
  await stopServer();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (err) {
    // Windows 下子进程句柄释放可能有延迟;残留临时目录不影响验收结论
    console.error(`WARN  临时目录清理失败(残留于 ${dataDir}):`, err?.code ?? err);
  }
  process.exitCode = failures ? 1 : 0;
}
