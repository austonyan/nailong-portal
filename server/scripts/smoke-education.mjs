// 奶龙国皇家教育与科学署 — 端到端验收脚本。
// 自包含:临时数据目录 + 随机端口启动独立 API;覆盖内容状态机、审核队列隔离
// (edu:review 与 edu:manage 互不可见)、权限隔离、双语回读、收藏/阅读历史、
// 阅读打卡任务(徽章 + 邮政契约消息)、统计、审计与软删除。
// 用法: node server/scripts/smoke-education.mjs
// 说明:本署路由尚未挂进 server/index.js 之前,/api/education/* 会 404,
// 统一门禁在集成完成后运行本脚本。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-edu-'));

// 先设 process.env 再 import 服务端模块:db.js 在 import 时读取 NAILONG_DATA_DIR,
// 保证建库种子全部落在临时目录,绝不触碰 server/data/。
process.env.NAILONG_DATA_DIR = dataDir;
delete process.env.ADMIN_PASSWORD;

// 在本进程内完成建库种子(共享库 + 本署 schema),再起服务,保证 edu_* 表、
// edu_* 角色/权限与服务卡在服务启动前就绪。重复执行是幂等的。
const { db: sharedDb } = await import('../db.js');
const { ensureEducationSchema } = await import('../education/schema.js');
ensureEducationSchema();

const env = { ...process.env };
delete env.ADMIN_PASSWORD;

let child = null;
let serverLog = '';
let port = 41000 + Math.floor(Math.random() * 20000);
let base = `http://127.0.0.1:${port}`;
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
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (locale) headers['X-Nailong-Locale'] = locale;
  const res = await fetch(`${base}/api${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function spawnServer() {
  serverLog = '';
  child = spawn(process.execPath, [serverEntry], { env: { ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => {
    serverLog += chunk;
  });
  child.stderr.on('data', (chunk) => {
    serverLog += chunk;
  });
}

async function startServer() {
  // 随机端口可能撞车:EADDRINUSE 时换口重试,至多 5 次。
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    spawnServer();
    for (let i = 0; i < 100; i += 1) {
      if (child.exitCode !== null) break;
      try {
        const res = await fetch(`${base}/api/health`);
        if (res.ok) return;
      } catch {
        // not listening yet
      }
      await sleep(100);
    }
    if (child.exitCode === null) return;
    const busy = /EADDRINUSE/.test(serverLog);
    const exited = child;
    await stopServer();
    if (!busy) throw new Error(`server exited early (attempt ${attempt}):\n${serverLog}`);
    if (attempt === 5) throw new Error(`no free port after 5 attempts:\n${serverLog}`);
    port += 1 + Math.floor(Math.random() * 500);
    base = `http://127.0.0.1:${port}`;
    void exited;
  }
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
  // 直连临时库插桩:本署权限行(列结构同 server/db.js 的 permissions 建表)。
  // ensureEducationSchema 已种子过,这里 INSERT OR IGNORE 兜底并顺带校验角色。
  // -------------------------------------------------------------------------
  const db = openDb();
  const insertPermission = db.prepare(
    `INSERT OR IGNORE INTO permissions (key, name, name_tw, description, description_tw, grp)
     VALUES (?, ?, ?, ?, ?, 'education')`
  );
  insertPermission.run('edu:portal', '教育与科学署访问', '教育與科學署訪問', '浏览百科词条、科普文章与学习任务', '瀏覽百科詞條、科普文章與學習任務');
  insertPermission.run('edu:review', '内容审核', '內容審核', '审核百科词条与科普文章的发布申请', '審核百科詞條與科普文章的發布申請');
  insertPermission.run('edu:manage', '教育与科学署管理', '教育與科學署管理', '词条、文章、任务、统计与审计管理', '詞條、文章、任務、統計與稽核管理');
  check(
    '角色已种子(edu_reviewer / edu_admin)',
    !!row("SELECT id FROM roles WHERE key = 'edu_reviewer'") && !!row("SELECT id FROM roles WHERE key = 'edu_admin'"),
  );
  check('服务卡已种子(education, internal_sso)', (() => {
    const card = row("SELECT * FROM services WHERE key = 'education'");
    return !!card && card.entry_mode === 'internal_sso' && card.icon === 'BulbIcon' && card.required_permission === 'edu:portal';
  })());
  check(
    '演示双语内容已种子',
    row("SELECT COUNT(*) AS n FROM edu_entries WHERE status = 'published'").n >= 3 &&
      row("SELECT COUNT(*) AS n FROM edu_articles WHERE status = 'published'").n >= 2,
  );

  await startServer();

  // -------------------------------------------------------------------------
  // 首次启动 → 管理员
  // -------------------------------------------------------------------------
  const status = await api('/setup/status');
  check('首启状态可读', status.status === 200 && status.data.required === true, JSON.stringify(status.data));

  const setup = await api('/setup/admin', {
    method: 'POST',
    body: { username: 'admin', displayName: '教育管理员', email: 'edu-admin@example.com', password: 'admin123' },
  });
  check('创建管理员 admin/admin123', setup.status === 201 && !!setup.data.accessToken, JSON.stringify(setup.data));
  const admin = setup.data.accessToken;

  const card = await api('/services', { token: admin });
  const eduCard = (card.data.items ?? card.data ?? []).find?.((s) => s.key === 'education');
  check('门户服务卡列表含教育署', !!eduCard, JSON.stringify(card.data).slice(0, 200));

  // -------------------------------------------------------------------------
  // 词条:建 → 非法流转 → 编 → 提交审核
  // -------------------------------------------------------------------------
  const demoEntry = row("SELECT id FROM edu_entries WHERE title = '奶龙的彩虹瀑布'");
  const created = await api('/education/admin/entries', {
    method: 'POST',
    token: admin,
    body: {
      title: '云朵湖为什么不会干涸',
      titleTw: '雲朵湖為什麼不會乾涸',
      categoryCode: 'WORLD',
      summary: '云朵湖的水来自每晚的星星雨。',
      summaryTw: '雲朵湖的水來自每晚的星星雨。',
      body: '云朵湖的湖水在每年夏天会变浅,但从不干涸——因为每天夜里都会下一场星星雨,把水补满。',
      bodyTw: '雲朵湖的湖水在每年夏天會變淺,但從不乾涸——因為每天夜裡都會下一場星星雨,把水補滿。',
      tags: '湖泊,星星雨',
      relatedIds: [demoEntry.id],
    },
  });
  check('管理员建词条(NEE 编号、草稿)', created.status === 201 && /^NEE\d{8}-/.test(created.data.item?.no ?? '') && created.data.item?.status === 'draft', JSON.stringify(created.data));
  if (!created.data.item) {
    // 本署路由尚未挂进 server/index.js(集成前的并行阶段)——后续断言无从谈起,
    // 打印提示后按失败收尾,让统一门禁在集成完成后重跑。
    console.error('\n提示:/api/education/* 尚未挂载(集成前置阶段),词条后续断言跳过。');
    failures = Math.max(failures, 1);
    return;
  }
  const entryId = created.data.item.id;

  const earlyPublish = await api(`/education/admin/entries/${entryId}/publish`, { method: 'POST', token: admin });
  check('草稿直接发布被拒绝(EDU_INVALID_STATE)', earlyPublish.status === 409 && earlyPublish.data.code === 'EDU_INVALID_STATE', JSON.stringify(earlyPublish.data));

  const patched = await api(`/education/admin/entries/${entryId}`, {
    method: 'PATCH',
    token: admin,
    body: { summary: '云朵湖的水来自星星雨,夜里补满。' },
  });
  check('编辑词条', patched.status === 200 && patched.data.item.summary === '云朵湖的水来自星星雨,夜里补满。', JSON.stringify(patched.data));

  const badCategory = await api('/education/admin/entries', {
    method: 'POST',
    token: admin,
    body: { title: 'x', body: 'y', categoryCode: 'NOPE' },
  });
  check('未知分类被拒绝(EDU_UNKNOWN_CATEGORY)', badCategory.status === 400 && badCategory.data.code === 'EDU_UNKNOWN_CATEGORY', JSON.stringify(badCategory.data));

  const submitted = await api(`/education/admin/entries/${entryId}/submit`, { method: 'POST', token: admin });
  check('词条提交审核', submitted.status === 200 && submitted.data.item.status === 'pending_review', JSON.stringify(submitted.data));

  const editWhileReviewing = await api(`/education/admin/entries/${entryId}`, { method: 'PATCH', token: admin, body: { title: '改名' } });
  check('待审核词条不可编辑', editWhileReviewing.status === 409 && editWhileReviewing.data.code === 'EDU_INVALID_STATE', JSON.stringify(editWhileReviewing.data));

  // -------------------------------------------------------------------------
  // 用户与权限隔离
  // -------------------------------------------------------------------------
  const plain = await api('/users', {
    method: 'POST',
    token: admin,
    body: { username: 'edu_reader', password: 'Reader12345', displayName: '读者小龙', roleKeys: ['user'] },
  });
  check('建普通用户(仅 user 角色)', plain.status === 201, JSON.stringify(plain.data));
  const reader = await api('/auth/login', { method: 'POST', body: { username: 'edu_reader', password: 'Reader12345' } });
  check('普通用户登入', reader.status === 200 && !!reader.data.accessToken, JSON.stringify(reader.data));
  const readerToken = reader.data.accessToken;

  const reviewerUser = await api('/users', {
    method: 'POST',
    token: admin,
    body: { username: 'edu_auditor', password: 'Audit12345', displayName: '内容审核员', roleKeys: ['edu_reviewer'] },
  });
  check('建审核员(edu_reviewer)', reviewerUser.status === 201, JSON.stringify(reviewerUser.data));
  const reviewerLogin = await api('/auth/login', { method: 'POST', body: { username: 'edu_auditor', password: 'Audit12345' } });
  const reviewer = reviewerLogin.data.accessToken;

  const plainQueue = await api('/education/admin/review/queue', { token: readerToken });
  check('普通用户访问审核队列 403', plainQueue.status === 403, JSON.stringify(plainQueue.data));
  const plainManage = await api('/education/admin/entries', { token: readerToken });
  check('普通用户访问词条管理 403', plainManage.status === 403, JSON.stringify(plainManage.data));
  const plainHome = await api('/education/home', { token: readerToken });
  check('普通用户可进署(home 200)', plainHome.status === 200 && Array.isArray(plainHome.data.tasks), JSON.stringify(plainHome.data).slice(0, 200));

  const reviewerCreate = await api('/education/admin/entries', { method: 'POST', token: reviewer, body: { title: '越权', body: '越权' } });
  check('审核员不能建词条 403', reviewerCreate.status === 403, JSON.stringify(reviewerCreate.data));
  const reviewerStats = await api('/education/admin/stats', { token: reviewer });
  check('审核员不能读管理统计 403', reviewerStats.status === 403, JSON.stringify(reviewerStats.data));

  // -------------------------------------------------------------------------
  // 审核队列(edu:review):驳回 → 重提 → 通过;文章同队列
  // -------------------------------------------------------------------------
  const reviewerQueue = await api('/education/admin/review/queue', { token: reviewer });
  const pending = (reviewerQueue.data.items ?? []).find((item) => item.id === entryId && item.targetType === 'entry');
  check('审核员在队列中看到词条', !!pending, JSON.stringify(reviewerQueue.data).slice(0, 300));

  const articleCreated = await api('/education/admin/articles', {
    method: 'POST',
    token: admin,
    body: { title: '薄荷草音阶观察指南', titleTw: '薄荷草音階觀察指南', body: '清晨去东岸薄荷草地,安静十分钟,就能听到完整的音阶。', tags: '观察' },
  });
  check('管理员建文章(NEA 编号)', articleCreated.status === 201 && /^NEA\d{8}-/.test(articleCreated.data.item.no), JSON.stringify(articleCreated.data));
  const articleId = articleCreated.data.item.id;
  await api(`/education/admin/articles/${articleId}/submit`, { method: 'POST', token: admin });

  const rejectNoNote = await api(`/education/admin/review/items/article/${articleId}/reject`, { method: 'POST', token: reviewer, body: {} });
  check('驳回缺审核意见被拒(EDU_REVIEW_NOTE_REQUIRED)', rejectNoNote.status === 400 && rejectNoNote.data.code === 'EDU_REVIEW_NOTE_REQUIRED', JSON.stringify(rejectNoNote.data));

  const rejected = await api(`/education/admin/review/items/article/${articleId}/reject`, {
    method: 'POST',
    token: reviewer,
    body: { note: '请补充一段雨天观察记录' },
  });
  check('文章驳回后退回草稿', rejected.status === 200 && rejected.data.item.status === 'draft' && rejected.data.item.reviewNote === '请补充一段雨天观察记录', JSON.stringify(rejected.data));

  await api(`/education/admin/articles/${articleId}/submit`, { method: 'POST', token: admin });
  const approvedArticle = await api(`/education/admin/review/items/article/${articleId}/approve`, { method: 'POST', token: reviewer, body: { note: '写得不错' } });
  check('文章审核通过后发布', approvedArticle.status === 200 && approvedArticle.data.item.status === 'published', JSON.stringify(approvedArticle.data));

  const approvedEntry = await api(`/education/admin/review/items/entry/${entryId}/approve`, { method: 'POST', token: reviewer, body: {} });
  check('词条审核通过后发布', approvedEntry.status === 200 && approvedEntry.data.item.status === 'published', JSON.stringify(approvedEntry.data));

  // -------------------------------------------------------------------------
  // 普通用户:浏览 / 双语 / 收藏 / 历史阅读
  // -------------------------------------------------------------------------
  const list = await api('/education/entries', { token: readerToken, locale: 'zh-TW' });
  check('词条列表对普通用户可见', list.status === 200 && list.data.items.some((item) => item.id === entryId), JSON.stringify(list.data).slice(0, 200));

  const twDetail = await api(`/education/entries/${demoEntry.id}`, { token: readerToken, locale: 'zh-TW' });
  check(
    'zh-TW 回读:标题为繁体且保留简体原文',
    twDetail.status === 200 && twDetail.data.entry.title === '奶龍的彩虹瀑布' && twDetail.data.entry.titleCn === '奶龙的彩虹瀑布',
    JSON.stringify({ title: twDetail.data?.entry?.title, titleCn: twDetail.data?.entry?.titleCn }),
  );

  const favOn = await api(`/education/entries/${entryId}/favorite`, { method: 'POST', token: readerToken });
  check('收藏词条', favOn.status === 200 && favOn.data.favorited === true && favOn.data.favoriteCount === 1, JSON.stringify(favOn.data));
  const favOff = await api(`/education/entries/${entryId}/favorite`, { method: 'POST', token: readerToken });
  check('取消收藏后计数回落', favOff.status === 200 && favOff.data.favorited === false && favOff.data.favoriteCount === 0, JSON.stringify(favOff.data));

  // -------------------------------------------------------------------------
  // 阅读打卡:读满 3 篇已发布内容 → 徽章 + 邮政契约消息
  // -------------------------------------------------------------------------
  await api(`/education/entries/${entryId}`, { token: readerToken }); // 1
  await api(`/education/entries/${demoEntry.id}`, { token: readerToken }); // 2(前面 zh-TW 那次已读,这里保底)
  const articleList = await api('/education/articles', { token: readerToken });
  await api(`/education/articles/${articleList.data.items[0].id}`, { token: readerToken }); // 3

  const tasks = await api('/education/tasks', { token: readerToken });
  const read3 = (tasks.data.items ?? []).find((task) => task.code === 'READ3');
  check('READ3 任务完成', !!read3 && read3.completed === true, JSON.stringify(read3));
  const myBadges = await api('/education/my', { token: readerToken });
  check('徽章入账(阅读小达人)', (myBadges.data.badges ?? []).some((badge) => badge.code === 'READER3'), JSON.stringify(myBadges.data.badges));
  check('邮政契约消息落库(source=education)', (() => {
    const msg = row("SELECT * FROM post_messages WHERE source = 'education' AND type = 'task_completed' ORDER BY id DESC");
    if (!msg) return false;
    const params = JSON.parse(msg.params || '{}');
    return params.badgeName === '阅读小达人' && !!params.taskNo;
  })());

  // -------------------------------------------------------------------------
  // 任务管理
  // -------------------------------------------------------------------------
  const taskCreated = await api('/education/admin/tasks', {
    method: 'POST',
    token: admin,
    body: { code: 'READ10', title: '阅读打卡·大师', titleTw: '閱讀打卡·大師', description: '读满 10 篇', targetCount: 10, badgeCode: 'READER10', badgeName: '博览大师', badgeNameTw: '博覽大師' },
  });
  check('新建任务(NET 编号)', taskCreated.status === 201 && /^NET\d{8}-/.test(taskCreated.data.item.no), JSON.stringify(taskCreated.data));

  const taskDup = await api('/education/admin/tasks', {
    method: 'POST',
    token: admin,
    body: { code: 'read10', title: '重复代码', targetCount: 1 },
  });
  check('任务代码重复被拒(EDU_TASK_CODE_TAKEN)', taskDup.status === 409 && taskDup.data.code === 'EDU_TASK_CODE_TAKEN', JSON.stringify(taskDup.data));

  const taskToggle = await api(`/education/admin/tasks/${taskCreated.data.item.id}/status`, { method: 'POST', token: admin, body: { status: 'inactive' } });
  check('任务停用', taskToggle.status === 200 && taskToggle.data.item.status === 'inactive', JSON.stringify(taskToggle.data));

  const records = await api(`/education/admin/tasks/${read3.id}/records`, { token: admin });
  check('任务完成情况含普通用户', records.status === 200 && (records.data.items ?? []).some((r) => r.username === 'edu_reader' && r.status === 'completed'), JSON.stringify(records.data).slice(0, 200));

  // -------------------------------------------------------------------------
  // 下架 → 不可读 → 重新上线;软删除;统计;审计
  // -------------------------------------------------------------------------
  const offline = await api(`/education/admin/entries/${entryId}/offline`, { method: 'POST', token: admin });
  check('词条下架', offline.status === 200 && offline.data.item.status === 'offline', JSON.stringify(offline.data));
  const offlineRead = await api(`/education/entries/${entryId}`, { token: readerToken });
  check('下架后前台不可读(EDU_NOT_PUBLISHED)', offlineRead.status === 404 && offlineRead.data.code === 'EDU_NOT_PUBLISHED', JSON.stringify(offlineRead.data));
  const republish = await api(`/education/admin/entries/${entryId}/publish`, { method: 'POST', token: admin });
  check('重新上线', republish.status === 200 && republish.data.item.status === 'published', JSON.stringify(republish.data));

  const throwaway = await api('/education/admin/entries', {
    method: 'POST',
    token: admin,
    body: { title: '待删词条', body: '待删正文', categoryCode: 'LIFE' },
  });
  await api(`/education/admin/entries/${throwaway.data.item.id}`, { method: 'DELETE', token: admin });
  const afterDelete = await api('/education/admin/entries?q=待删词条', { token: admin });
  check('软删除后管理列表不再出现', afterDelete.status === 200 && !(afterDelete.data.items ?? []).some((item) => item.id === throwaway.data.item.id), JSON.stringify(afterDelete.data).slice(0, 200));
  check('软删除留痕(deleted_at 非空)', !!row('SELECT deleted_at FROM edu_entries WHERE id = ?', throwaway.data.item.id).deleted_at);

  const stats = await api('/education/admin/stats', { token: admin });
  check(
    '统计可读(阅读量/收藏/待审)',
    stats.status === 200 && stats.data.reads.total >= 3 && stats.data.favorites.total >= 0 && typeof stats.data.pendingReview === 'number',
    JSON.stringify(stats.data).slice(0, 200),
  );

  const audit = await api('/education/admin/audit?action=approve_content', { token: admin });
  check('审计含通过发布记录', audit.status === 200 && (audit.data.items ?? []).length >= 2, JSON.stringify(audit.data).slice(0, 200));
  const badgeAudit = row("SELECT COUNT(*) AS n FROM edu_audit_logs WHERE action = 'grant_badge'").n;
  check('审计含发徽章记录', badgeAudit >= 1, `grant_badge=${badgeAudit}`);

  const reviewHistory = await api('/education/admin/review/history', { token: reviewer });
  check(
    '审核历史含通过/驳回各一',
    reviewHistory.status === 200 &&
      (reviewHistory.data.items ?? []).some((i) => i.action === 'approve') &&
      (reviewHistory.data.items ?? []).some((i) => i.action === 'reject'),
    JSON.stringify(reviewHistory.data).slice(0, 200),
  );

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
    sharedDb.close(); // 关掉本进程的共享连接,Windows 上才能删除临时目录
  } catch {
    // already closed
  }
  await stopServer();
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exitCode = failures ? 1 : 0;
}
