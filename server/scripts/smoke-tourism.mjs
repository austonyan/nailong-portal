// 奶龙国皇家文化旅游署 — 自包含端到端验收脚本。
// 临时数据目录 + 随机端口启动独立 API,覆盖:管理端 CRUD、权限隔离、打卡规则
// 与状态约束、徽章自动发放与回收、纪念章(读入境署表)、邮政契约消息落库、
// 双语回读、审计与软删除。
// 用法: node server/scripts/smoke-tourism.mjs
// 说明:server/index.js 挂载 /api/tourism 由集成师完成;挂载前本脚本会因
// 404 失败,属于预期(统一门禁在集成后运行)。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-tour-'));
delete process.env.ADMIN_PASSWORD;
process.env.NAILONG_DATA_DIR = dataDir;

// 先在脚本进程内导入服务端 db 与本署 schema:让临时库完成建库、种子、权限/角色
// 回填与服务卡注册(全部 INSERT OR IGNORE,可重复执行)。
// 捕获 db.js 的模块级连接:收尾必须关闭,否则 Windows 下临时目录删不掉(EPERM)。
const sharedDb = (await import('../db.js')).db;
await import('../tourism/schema.js');

let sqlite = null;
let child = null;
let serverLog = '';
let failures = 0;
const base = { port: 0, url: '' };

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function openDb() {
  sqlite = new Database(path.join(dataDir, 'nailong.db'));
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

function row(sql, ...params) {
  return sqlite.prepare(sql).get(...params);
}

// 直接向临时库补插本署权限行(列结构同 server/db.js 的 permissions 建表),
// 保证权限登记独立于 db.js 的 PERMISSIONS 注册表也能成立。
function seedPermissionsDirectly() {
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO permissions (key, name, name_tw, description, description_tw, grp)
     VALUES (?, ?, ?, ?, ?, 'tourism')`
  );
  insert.run('tour:portal', '文化旅游署访问', '文化旅遊署存取', '浏览景点与文化内容、参与打卡、收集纪念章与徽章', '瀏覽景點與文化內容、參與打卡、收集紀念章與徽章');
  insert.run('tour:manage', '文化旅游署管理', '文化旅遊署管理', '景点、文化内容、打卡规则、徽章、统计与审计管理', '景點、文化內容、打卡規則、徽章、統計與稽核管理');
  const grant = sqlite.prepare(
    `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
     SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
  );
  grant.run('admin', 'tour:portal');
  grant.run('admin', 'tour:manage');
  grant.run('tour_admin', 'tour:manage');
  grant.run('tour_admin', 'tour:portal');
  grant.run('user', 'tour:portal');
}

async function api(pathname, { method = 'GET', token, locale, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (locale) headers['X-Nailong-Locale'] = locale;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base.url}/api${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function tryStartServer(attempt) {
  const port = 41000 + Math.floor(Math.random() * 20000);
  base.port = port;
  base.url = `http://127.0.0.1:${port}`;
  serverLog = '';
  const env = { ...process.env, PORT: String(port), NAILONG_DATA_DIR: dataDir };
  child = spawn(process.execPath, [serverEntry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => {
    serverLog += chunk;
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk;
  });
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) {
      const busy = serverLog.includes('EADDRINUSE');
      if (busy && attempt < 5) {
        await stopServer();
        return tryStartServer(attempt + 1);
      }
      throw new Error(`server exited early:\n${serverLog}`);
    }
    try {
      const res = await fetch(`${base.url}/api/health`);
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

async function main() {
  await tryStartServer(1);
  const db = openDb();
  seedPermissionsDirectly();

  // -------------------------------------------------------------------------
  // 首次启动 → 管理员
  // -------------------------------------------------------------------------
  const status = await api('/setup/status');
  check('首启状态可读', status.status === 200 && status.data.required === true, JSON.stringify(status.data));

  const setup = await api('/setup/admin', {
    method: 'POST',
    body: { username: 'admin', displayName: '旅游署验收员', email: 'tour-admin@example.com', password: 'admin123' },
  });
  check('创建管理员 admin/admin123', setup.status === 201 && !!setup.data.accessToken, JSON.stringify(setup.data));
  const admin = setup.data.accessToken;

  // -------------------------------------------------------------------------
  // 服务卡与演示种子
  // -------------------------------------------------------------------------
  const card = row("SELECT * FROM services WHERE key = 'tourism'");
  check('服务卡已注册(internal_sso)', !!card && card.entry_mode === 'internal_sso' && card.required_permission === 'tour:portal', JSON.stringify(card));
  check('服务卡双语齐备', !!card && !!card.name && !!card.name_tw, JSON.stringify(card?.name_tw));
  const roleRow = row("SELECT * FROM roles WHERE key = 'tour_admin'");
  check('内置角色 tour_admin 已种', !!roleRow && !!roleRow.name_tw, JSON.stringify(roleRow));
  const seedCount = row('SELECT COUNT(*) AS n FROM tour_attractions').n;
  check('演示景点已种(3 条)', seedCount === 3, `n=${seedCount}`);

  // -------------------------------------------------------------------------
  // 打卡规则配置
  // -------------------------------------------------------------------------
  const cfg0 = await api('/tourism/admin/config', { token: admin });
  check('规则默认值可读', cfg0.status === 200 && cfg0.data.config?.dailyLimit === 10 && cfg0.data.config?.siteDailyLimit === 500, JSON.stringify(cfg0.data));

  const cfgBad = await api('/tourism/admin/config', { method: 'PATCH', token: admin, body: { dailyLimit: 0 } });
  check('非法规则被拒绝', cfgBad.status === 400 && cfgBad.data.code === 'VALIDATION_ERROR', JSON.stringify(cfgBad.data));

  const cfgSet = await api('/tourism/admin/config', { method: 'PATCH', token: admin, body: { dailyLimit: 2, siteDailyLimit: 0 } });
  check('规则可改(dailyLimit=2)', cfgSet.status === 200 && cfgSet.data.config?.dailyLimit === 2, JSON.stringify(cfgSet.data));

  // -------------------------------------------------------------------------
  // 权限隔离
  // -------------------------------------------------------------------------
  const noRole = await api('/users', {
    method: 'POST',
    token: admin,
    body: { username: 'norole_tour', password: 'NoRole12345', displayName: '无角色用户', roleKeys: [] },
  });
  check('创建无角色用户', noRole.status === 201, JSON.stringify(noRole.data));
  const noRoleLogin = await api('/auth/login', { method: 'POST', body: { username: 'norole_tour', password: 'NoRole12345' } });
  const noRoleToken = noRoleLogin.data.accessToken;
  const forbiddenHome = await api('/tourism/home', { token: noRoleToken });
  check('无 tour:portal 访问署内接口 403', forbiddenHome.status === 403 && forbiddenHome.data.code === 'FORBIDDEN', JSON.stringify(forbiddenHome.data));
  const recsPublic = await api('/tourism/recs', { token: noRoleToken });
  check('/recs 仅需登录(无权限也可读)', recsPublic.status === 200 && Array.isArray(recsPublic.data.items), JSON.stringify(recsPublic.data).slice(0, 120));
  const forbiddenAdmin = await api('/tourism/admin/attractions', { token: noRoleToken });
  check('无 tour:manage 访问管理端 403', forbiddenAdmin.status === 403, JSON.stringify(forbiddenAdmin.data));

  // -------------------------------------------------------------------------
  // 景点管理(CRUD + 双语)
  // -------------------------------------------------------------------------
  const created = await api('/tourism/admin/attractions', {
    method: 'POST',
    token: admin,
    body: { name: '验收灯塔', summary: '验收用景点', type: 'landmark', openState: 'open', status: 'online', checkinPoints: '塔顶\n塔底' },
  });
  check('新建景点(NLV 编号)', created.status === 201 && String(created.data.attraction?.no || '').startsWith('NLV'), JSON.stringify(created.data));
  const attractionId = created.data.attraction.id;

  const noName = await api('/tourism/admin/attractions', { method: 'POST', token: admin, body: { summary: '缺名字' } });
  check('景点缺名称被拒绝', noName.status === 400, JSON.stringify(noName.data));

  const patched = await api(`/tourism/admin/attractions/${attractionId}`, {
    method: 'PATCH',
    token: admin,
    body: { nameTw: '驗收燈塔', summaryTw: '驗收用景點' },
  });
  check('景点繁体回填', patched.status === 200 && patched.data.attraction?.nameTw === '驗收燈塔', JSON.stringify(patched.data));

  const readTw = await api(`/tourism/attractions/${attractionId}`, { token: admin, locale: 'zh-TW' });
  check(
    'zh-TW 读取按繁体重写并保留简体',
    readTw.status === 200 && readTw.data.attraction?.name === '驗收燈塔' && readTw.data.attraction?.nameCn === '验收灯塔',
    JSON.stringify(readTw.data)
  );

  const article = await api('/tourism/admin/articles', {
    method: 'POST',
    token: admin,
    body: { title: '验收节庆', summary: '验收用文章', body: '正文', type: 'festival', status: 'published' },
  });
  check('新建文章(NLH 编号)', article.status === 201 && String(article.data.article?.no || '').startsWith('NLH'), JSON.stringify(article.data));

  // -------------------------------------------------------------------------
  // 徽章管理
  // -------------------------------------------------------------------------
  const badge = await api('/tourism/admin/badges', {
    method: 'POST',
    token: admin,
    body: { code: 'smoke_two', name: '验收双章', threshold: 2, icon: 'StarIcon', enabled: true },
  });
  check('新建徽章(NLB 编号)', badge.status === 201 && String(badge.data.badge?.no || '').startsWith('NLB'), JSON.stringify(badge.data));
  const badgeId = badge.data.badge.id;

  const dupBadge = await api('/tourism/admin/badges', {
    method: 'POST',
    token: admin,
    body: { code: 'smoke_two', name: '重复识别码', threshold: 3 },
  });
  check('重复徽章识别码 409', dupBadge.status === 409 && dupBadge.data.code === 'TOUR_DUPLICATE_BADGE_CODE', JSON.stringify(dupBadge.data));

  // -------------------------------------------------------------------------
  // 普通用户(注册即带 user 角色 → tour:portal)
  // -------------------------------------------------------------------------
  const suffix = Date.now().toString(36);
  const tourist = await api('/auth/register', {
    method: 'POST',
    body: { username: `tourist_${suffix}`, password: 'Tourist12345', displayName: '验收旅客' },
  });
  check('注册普通用户', tourist.status === 200 || tourist.status === 201, JSON.stringify(tourist.data));
  const user = tourist.data.accessToken;
  const userId = tourist.data.user.id;

  const list = await api('/tourism/attractions', { token: user });
  check(
    '用户端景点列表含种子与新建(共 4)',
    list.status === 200 && list.data.items?.length === 4 && list.data.items.some((a) => a.name === '验收灯塔'),
    JSON.stringify(list.data.items?.map((a) => a.name))
  );

  // -------------------------------------------------------------------------
  // 打卡:每日上限、重复约束、关闭景点
  // -------------------------------------------------------------------------
  const seeds = list.data.items;
  const seedIds = seeds.filter((a) => a.name !== '验收灯塔').map((a) => a.id);
  const c1 = await api(`/tourism/attractions/${seedIds[0]}/checkin`, { method: 'POST', token: user, body: { note: '第一站' } });
  check(
    '第一次打卡成功并发放 first_checkin',
    c1.status === 201 && String(c1.data.checkin?.no || '').startsWith('NLI') && (c1.data.newBadges ?? []).some((b) => b.code === 'first_checkin'),
    JSON.stringify(c1.data).slice(0, 200)
  );

  const dup = await api(`/tourism/attractions/${seedIds[0]}/checkin`, { method: 'POST', token: user });
  check('同景点同日重复打卡 409', dup.status === 409 && dup.data.code === 'TOUR_ALREADY_CHECKED_IN', JSON.stringify(dup.data));

  const c2 = await api(`/tourism/attractions/${attractionId}/checkin`, { method: 'POST', token: user });
  check(
    '第二次打卡成功并自动发放阈值徽章',
    c2.status === 201 && (c2.data.newBadges ?? []).some((b) => b.code === 'smoke_two'),
    JSON.stringify(c2.data).slice(0, 200)
  );

  const limitHit = await api(`/tourism/attractions/${seedIds[1]}/checkin`, { method: 'POST', token: user });
  check('超过每日上限 429', limitHit.status === 429 && limitHit.data.code === 'TOUR_DAILY_LIMIT', JSON.stringify(limitHit.data));

  const closedSet = await api(`/tourism/admin/attractions/${seedIds[1]}/status`, {
    method: 'PATCH',
    token: admin,
    body: { status: 'online', openState: 'closed' },
  });
  check('景点可置为关闭', closedSet.status === 200 && closedSet.data.attraction?.openState === 'closed', JSON.stringify(closedSet.data));
  const closedHit = await api(`/tourism/attractions/${seedIds[1]}/checkin`, { method: 'POST', token: user });
  check('关闭景点打卡 409', closedHit.status === 409 && closedHit.data.code === 'TOUR_ATTRACTION_CLOSED', JSON.stringify(closedHit.data));

  // -------------------------------------------------------------------------
  // 徽章记录与回收
  // -------------------------------------------------------------------------
  const myBadges = await api('/tourism/badges', { token: user });
  check(
    '用户徽章墙两项达标',
    myBadges.status === 200 &&
      myBadges.data.items?.filter((b) => b.awarded).length === 2 &&
      myBadges.data.total === 2,
    JSON.stringify(myBadges.data).slice(0, 240)
  );

  const revoke = await api(`/tourism/admin/badges/${badgeId}/revoke`, {
    method: 'POST',
    token: admin,
    body: { userId, reason: '验收回收' },
  });
  check('管理端回收徽章', revoke.status === 200, JSON.stringify(revoke.data));
  const revokedRow = row('SELECT * FROM tour_badge_awards WHERE badge_id = ? AND user_id = ?', badgeId, userId);
  check('回收落库(revoked_at)', !!revokedRow?.revoked_at && revokedRow.revoke_reason === '验收回收', JSON.stringify(revokedRow));

  const revokeAgain = await api(`/tourism/admin/badges/${badgeId}/revoke`, { method: 'POST', token: admin, body: { userId } });
  check('重复回收 409', revokeAgain.status === 409 && revokeAgain.data.code === 'TOUR_BADGE_ALREADY_REVOKED', JSON.stringify(revokeAgain.data));

  const afterRevoke = await api('/tourism/badges', { token: user });
  check(
    '回收后用户徽章墙只剩 first_checkin',
    afterRevoke.data.items?.filter((b) => b.awarded).length === 1,
    JSON.stringify(afterRevoke.data.items?.filter((b) => b.awarded).map((b) => b.code))
  );

  const awards = await api('/tourism/admin/awards', { token: admin });
  check(
    '发放记录可查(含回收标记)',
    awards.status === 200 && awards.data.items?.some((a) => a.badgeCode === 'smoke_two' && a.revokedAt),
    JSON.stringify(awards.data).slice(0, 240)
  );

  // -------------------------------------------------------------------------
  // 收集册 + 入境纪念章(直插入境署表)
  // -------------------------------------------------------------------------
  const collection = await api('/tourism/collection', { token: user });
  check(
    '收集册打卡 2 次、去过 2 个景点',
    collection.status === 200 && collection.data.counts?.checkins === 2 && collection.data.counts?.visited === 2,
    JSON.stringify(collection.data.counts)
  );

  const port = row("SELECT id FROM im_ports WHERE code = 'ROYAL_PORT'");
  const declInfo = db
    .prepare(
      `INSERT INTO im_declarations (no, user_id, port_id, nickname, contact, purpose, status, created_at, updated_at, submitted_at)
       VALUES (?, ?, ?, '验收旅客', 'tourist@example.com', 'fun', 'approved', ?, ?, ?)`
    )
    .run(`TOUR-DECL-${suffix}`, userId, port.id, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());
  db.prepare(
    `INSERT INTO im_entry_records (no, user_id, declaration_id, port_id, entry_date, stay_days, stamp_style, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 3, 'claw', 'entered', ?, ?)`
  ).run(
    `TOUR-ENTRY-${suffix}`,
    userId,
    declInfo.lastInsertRowid,
    port.id,
    new Date().toISOString().slice(0, 10),
    new Date().toISOString(),
    new Date().toISOString()
  );
  const withStamp = await api('/tourism/collection', { token: user, locale: 'zh-TW' });
  check(
    '通关记录映射为纪念章(繁体口岸名)',
    withStamp.status === 200 && withStamp.data.stamps?.length === 1 && withStamp.data.stamps[0].no === `TOUR-ENTRY-${suffix}`,
    JSON.stringify(withStamp.data.stamps)
  );

  const me = await api('/tourism/me', { token: user });
  check(
    '我的旅游聚合正确',
    me.status === 200 && me.data.stats?.checkins === 2 && me.data.stats?.badges === 1 && me.data.stats?.stamps === 1,
    JSON.stringify(me.data.stats)
  );

  // -------------------------------------------------------------------------
  // 邮政契约消息落库
  // -------------------------------------------------------------------------
  const postalMsgs = sqlite
    .prepare("SELECT type, COUNT(*) AS n FROM post_messages WHERE source = 'tourism' AND user_id = ? GROUP BY type")
    .all(userId);
  const byType = Object.fromEntries(postalMsgs.map((r) => [r.type, r.n]));
  check('打卡消息经邮政契约落库', (byType.tour_checkin ?? 0) === 2, JSON.stringify(byType));
  check('徽章消息经邮政契约落库', (byType.tour_badge ?? 0) === 2, JSON.stringify(byType));
  const outboxLeft = row('SELECT COUNT(*) AS n FROM tour_notify_outbox').n;
  check('本地发件箱为空(邮政署已就位)', outboxLeft === 0, `n=${outboxLeft}`);

  // -------------------------------------------------------------------------
  // 统计、审计与软删除
  // -------------------------------------------------------------------------
  const stats = await api('/tourism/admin/stats', { token: admin });
  check(
    '统计页计数正确',
    stats.status === 200 && stats.data.checkins?.total === 2 && stats.data.badges?.awards === 1 && stats.data.badges?.revoked === 1 && stats.data.attractions?.total === 4,
    JSON.stringify({ c: stats.data.checkins, b: stats.data.badges, a: stats.data.attractions })
  );

  const audit = await api('/tourism/admin/audit', { token: admin });
  const auditActions = new Set((audit.data.items ?? []).map((r) => r.action));
  check(
    '审计覆盖打卡/发章/回收',
    auditActions.has('tour:checkin') && auditActions.has('tour:badge_award') && auditActions.has('tour:badge_revoke'),
    JSON.stringify([...auditActions])
  );

  const del = await api(`/tourism/admin/attractions/${attractionId}`, { method: 'DELETE', token: admin });
  check('景点软删除', del.status === 200, JSON.stringify(del.data));
  const deletedRow = row('SELECT deleted_at FROM tour_attractions WHERE id = ?', attractionId);
  check('软删除标记落库', !!deletedRow?.deleted_at, JSON.stringify(deletedRow));
  const listAfterDel = await api('/tourism/attractions', { token: user });
  check('删除后用户端不再展示', listAfterDel.data.items?.every((a) => a.id !== attractionId) && listAfterDel.data.items?.length === 3, JSON.stringify(listAfterDel.data.items?.length));

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
