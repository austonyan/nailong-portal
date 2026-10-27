// 五新署(文旅/邮政/档案/统计/教育)× 跨署联动 — 端到端验收脚本。
// 自包含:临时数据目录 + 随机端口启动独立 API,直连临时库插桩(含一次
// 旧格式 appeal_appeals 预置,验证 biz_type CHECK 的启动期表重建),其余
// 全部走 API 驱动。用法: node server/scripts/smoke-offices-linkage.mjs
// 覆盖:
//   1. 旧库 biz_type CHECK 启动重建(档案署成为可申诉目标)
//   2. 档案署删除申请被驳回 → 申诉 → 决定回写重开(arch_messages/arch_audit)
//   3. 签注署页面数据源:GET /tourism/recs(仅登录,只含上线景点)
//   4. 文旅收集册:im_entry_records 只读投影为入境纪念章
//   5. 邮政契约:tourism/archives/stats/education/postal 五署消息各落 post_messages
//   6. 公告订阅推送:发布公告 → 订阅者收到 notice_published
//   7. 统计看板 12 署卡片 + 个人年度报告跨署快照
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-offices-linkage-'));
const port = 46000 + Math.floor(Math.random() * 4000);
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// 直连插桩:临时库只预置一张"旧格式" appeal_appeals(CHECK 不含 archives),
// 服务启动时 db.js → migrate.js ensureAppealBizTypes 必须原地重建它。
function preseedLegacyAppealTable() {
  const dbFile = path.join(dataDir, 'nailong.db');
  const legacy = new Database(dbFile);
  legacy.pragma('foreign_keys = OFF');
  legacy.exec(`
  CREATE TABLE appeal_appeals (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    code                 TEXT NOT NULL UNIQUE,
    user_id              INTEGER NOT NULL REFERENCES users(id),
    biz_type             TEXT NOT NULL CHECK (biz_type IN ('visa','immigration','resident','diplomatic','document')),
    biz_code             TEXT NOT NULL,
    biz_status           TEXT NOT NULL DEFAULT 'unverified',
    status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','pending_accept','accepted','processing','supplement_required','resolved','rejected','withdrawn','closed')),
    priority             TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
    reason               TEXT NOT NULL DEFAULT '',
    expected             TEXT NOT NULL DEFAULT '',
    contact              TEXT NOT NULL DEFAULT '',
    accept_note          TEXT NOT NULL DEFAULT '',
    reject_reason        TEXT,
    supplement_note      TEXT NOT NULL DEFAULT '',
    supplement_deadline  TEXT,
    decision_type        TEXT CHECK (decision_type IN ('maintain','undo','change','transfer')),
    decision_reason      TEXT NOT NULL DEFAULT '',
    decision_basis       TEXT NOT NULL DEFAULT '',
    assigned_to          INTEGER,
    handler_name         TEXT NOT NULL DEFAULT '',
    evaluation_rating    INTEGER,
    evaluation_comment   TEXT NOT NULL DEFAULT '',
    merged_into          TEXT NOT NULL DEFAULT '',
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    submitted_at         TEXT,
    accepted_at          TEXT,
    resolved_at          TEXT,
    decided_at           TEXT,
    closed_at            TEXT
  );`);
  legacy
    .prepare(
      "INSERT INTO appeal_appeals (code, user_id, biz_type, biz_code, status, created_at, updated_at) VALUES ('NAA-260101-LEGACY', 1, 'visa', 'NLA-LEGACY', 'pending_accept', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')"
    )
    .run();
  legacy.close();
}

function row(sql, ...params) {
  return sqlite.prepare(sql).get(...params);
}

function postalCount(source, type = null) {
  return type
    ? row("SELECT COUNT(*) AS n FROM post_messages WHERE source = ? AND type = ?", source, type).n
    : row('SELECT COUNT(*) AS n FROM post_messages WHERE source = ?', source).n;
}

const stamp = Date.now().toString(36);
const password = 'smoke-pass-123';

async function register(suffix) {
  const r = await api('/auth/register', {
    method: 'POST',
    body: { username: `off_${stamp}_${suffix}`, password, displayName: `联动冒烟${suffix}` },
  });
  check(`注册用户 ${suffix}`, !!r.data.accessToken, JSON.stringify(r.data));
  return { token: r.data.accessToken, id: r.data.user?.id };
}

async function main() {
  preseedLegacyAppealTable();
  await startServer();
  sqlite = new Database(path.join(dataDir, 'nailong.db'));
  sqlite.pragma('busy_timeout = 5000');

  // -------------------------------------------------------------------------
  // 0. 管理员 + 普通用户
  // -------------------------------------------------------------------------
  const setup = await api('/setup/admin', {
    method: 'POST',
    body: {
      username: 'offices_root',
      displayName: 'Offices Admin',
      email: 'offices-admin@example.com',
      password: 'OfficesPass12345',
    },
  });
  check('创建管理员', setup.status === 201 && !!setup.data.accessToken, JSON.stringify(setup.data));
  const admin = { token: setup.data.accessToken, id: setup.data.user.id };
  const userA = await register('a');
  const userB = await register('b');

  // -------------------------------------------------------------------------
  // 1. 旧库 biz_type CHECK 启动重建 — 档案署成为可申诉目标
  // -------------------------------------------------------------------------
  const legacySql = row("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'appeal_appeals'").sql || '';
  check(
    '启动重建扩展了 biz_type CHECK(含 archives)',
    legacySql.includes("'archives'") && legacySql.includes("'document'"),
    legacySql.match(/biz_type[^,]*,/)?.[0] || legacySql.slice(0, 120)
  );
  check(
    '旧数据在重建后保留',
    !!row("SELECT id FROM appeal_appeals WHERE code = 'NAA-260101-LEGACY'"),
    'legacy row lost'
  );
  const home = await api('/appeal/home', { token: userA.token });
  check('申诉业务类型清单含档案署', home.status === 200 && home.data.bizTypes?.some((b) => b.key === 'archives'), JSON.stringify(home.data.bizTypes));

  // -------------------------------------------------------------------------
  // 2. 档案署删除申请:驳回 → 申诉 → 决定回写重开
  // -------------------------------------------------------------------------
  const archReq = await api('/archives/deletion-requests', {
    method: 'POST',
    token: userA.token,
    body: {
      confirm: true,
      types: ['visa_application', 'im_declaration'],
      impact: '联动冒烟:希望隐藏本人历史档案记录',
      reason: '跨署联动验收',
    },
  });
  const archNo = archReq.data.request?.no;
  const archId = archReq.data.request?.id;
  check('提交数据删除申请(NAH 编号)', archReq.status === 201 && /^NAH-/.test(archNo || ''), JSON.stringify(archReq.data).slice(0, 240));

  const archForwarded = postalCount('archives', 'archives_submitted');
  check('删除申请提交经邮政契约转发 post_messages', archForwarded >= 1, `count=${archForwarded}`);
  const archMail = await api('/archives/messages', { token: userA.token });
  check('档案署邮箱收到提交回执', archMail.data.items?.some((m) => m.type === 'submitted'), JSON.stringify(archMail.data.items?.[0] || {}).slice(0, 200));

  const archReject = await api(`/archives/admin/deletion-requests/${archId}/reject`, {
    method: 'POST',
    token: admin.token,
    body: { reason: '联动冒烟:材料不足以完成注销' },
  });
  check('档案署驳回删除申请', archReject.status === 200 && archReject.data.request?.status === 'rejected', JSON.stringify(archReject.data).slice(0, 200));

  const archRejectedMail = await api('/archives/messages', { token: userA.token });
  check(
    '档案署邮箱收到驳回通知(含理由)',
    archRejectedMail.data.items?.some((m) => m.type === 'rejected' && !!m.params?.reason),
    JSON.stringify(archRejectedMail.data.items?.[0] || {}).slice(0, 200)
  );

  const appealCreate = await api('/appeal/appeals', {
    method: 'POST',
    token: userA.token,
    body: { bizType: 'archives', bizCode: archNo },
  });
  const appealId = appealCreate.data.appeal?.id;
  check(
    '申诉关联校验命中本人被驳回申请',
    appealCreate.status === 201 && appealCreate.data.appeal?.bizStatus === 'verified',
    JSON.stringify(appealCreate.data).slice(0, 240)
  );
  const appealFields = {
    bizType: 'archives',
    bizCode: archNo,
    reason: '注销材料已补齐,请求撤销原不予处理决定',
    expected: '撤销驳回并重新处理',
    contact: 'a@example.com',
  };
  await api(`/appeal/appeals/${appealId}`, { method: 'PUT', token: userA.token, body: appealFields });
  const appealSubmitted = await api(`/appeal/appeals/${appealId}/submit`, { method: 'POST', token: userA.token, body: appealFields });
  check('申诉提交成功', appealSubmitted.status === 200 && appealSubmitted.data.appeal?.bizStatus === 'verified', JSON.stringify(appealSubmitted.data).slice(0, 200));

  await api(`/appeal/admin/appeals/${appealId}/accept`, { method: 'POST', token: admin.token, body: { comment: '联动冒烟受理' } });
  const decided = await api(`/appeal/admin/appeals/${appealId}/decide`, {
    method: 'POST',
    token: admin.token,
    body: { decisionType: 'undo', reason: '原驳回依据不足,撤销后重新处理', basis: '联动冒烟' },
  });
  check(
    '申诉决定回写档案署(重开为待处理)',
    decided.status === 200 &&
      decided.data.writeback?.applied === true &&
      decided.data.writeback?.fromStatus === 'rejected' &&
      decided.data.writeback?.status === 'pending',
    JSON.stringify(decided.data.writeback || decided.data).slice(0, 300)
  );

  const archAfter = await api(`/archives/admin/deletion-requests/${archId}`, { token: admin.token });
  const archRow = archAfter.data.request || {};
  check(
    '删除申请已退回待处理队列(驳回理由清空)',
    archRow.status === 'pending' && !archRow.rejectReason,
    JSON.stringify({ status: archRow.status, rejectReason: archRow.rejectReason })
  );
  check(
    '删除申请时间线含申诉复核重开事件',
    (archRow.events || []).some((e) => e.action === 'appeal_reopened'),
    JSON.stringify(archRow.events || []).slice(0, 200)
  );

  const archReopenMail = await api('/archives/messages', { token: userA.token });
  check(
    '档案署邮箱收到申诉重开通知',
    archReopenMail.data.items?.some((m) => m.type === 'appeal_reopened'),
    JSON.stringify(archReopenMail.data.items?.[0] || {}).slice(0, 200)
  );
  const reopenPostal = row(
    "SELECT COUNT(*) AS n FROM post_messages WHERE source = 'archives' AND type = 'archives_appeal_reopened'"
  ).n;
  check('申诉重开通知经邮政契约转发 post_messages', reopenPostal >= 1, `count=${reopenPostal}`);

  const archAudit = await api('/archives/admin/audit?action=appeal_writeback', { token: admin.token });
  check('档案署审计记录申诉回写', (archAudit.data.items || []).some((a) => a.action === 'appeal_writeback'), JSON.stringify(archAudit.data.items?.[0] || {}).slice(0, 200));

  const appealLink = await api(`/appeal/admin/appeals/${appealId}`, { token: admin.token });
  check(
    '申诉工作台可读档案署业务链路与时间线',
    appealLink.data.appeal?.bizLink?.integrated === true && appealLink.data.appeal?.bizLink?.found === true && (appealLink.data.appeal?.bizLink?.timeline || []).length >= 1,
    JSON.stringify(appealLink.data.appeal?.bizLink || {}).slice(0, 240)
  );

  // -------------------------------------------------------------------------
  // 3. 签注署页面数据源:GET /tourism/recs(仅登录,只含上线景点)
  // -------------------------------------------------------------------------
  sqlite
    .prepare(
      `INSERT INTO tour_attractions (no, name, name_tw, summary, description, type, open_state, status, sort_order, created_at, updated_at)
       VALUES ('NLVSMOKE-OFFLINE', '冒烟未上线景点', '冒煙未上線景點', '不应出现在推荐里', 'offline fixture', 'landmark', 'open', 'offline', 999, ?, ?)`
    )
    .run(new Date().toISOString(), new Date().toISOString());

  const recsAnon = await api('/tourism/recs');
  check('旅游推荐未登录被拒绝', recsAnon.status === 401, JSON.stringify(recsAnon.data));
  const recs = await api('/tourism/recs', { token: userA.token });
  const recItems = recs.data.items || [];
  check(
    '旅游推荐仅返回上线景点且带双语字段',
    recs.status === 200 &&
      recItems.length >= 1 &&
      recItems.every((item) => item.status === 'online') &&
      recItems.every((item) => typeof item.name === 'string' && item.name && 'nameTw' in item),
    JSON.stringify({ total: recItems.length, statuses: recItems.map((i) => i.status) })
  );
  check(
    '未上线景点不进入推荐',
    !recItems.some((item) => item.no === 'NLVSMOKE-OFFLINE'),
    recItems.map((i) => i.no).join(',')
  );

  // -------------------------------------------------------------------------
  // 4. 文旅打卡(邮政消息)与收集册入境纪念章(im_ 只读投影)
  // -------------------------------------------------------------------------
  const checkin = await api(`/tourism/attractions/${recItems[0].id}/checkin`, {
    method: 'POST',
    token: userA.token,
    body: { note: '联动冒烟打卡' },
  });
  check(
    '文旅打卡成功并获得徽章',
    checkin.status === 201 && (checkin.data.newBadges || []).length >= 1,
    JSON.stringify(checkin.data).slice(0, 240)
  );

  const port = row('SELECT id FROM im_ports ORDER BY id LIMIT 1');
  const declInfo = sqlite
    .prepare(
      `INSERT INTO im_declarations (no, user_id, port_id, nickname, contact, purpose, status, created_at, updated_at)
       VALUES (?, ?, ?, '联动冒烟甲', 'a@example.com', 'fun', 'approved', ?, ?)`
    )
    .run(`IMSMOKE-${stamp}`, userA.id, port.id, new Date().toISOString(), new Date().toISOString());
  sqlite
    .prepare(
      `INSERT INTO im_entry_records (no, user_id, declaration_id, port_id, entry_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'entered', ?, ?)`
    )
    .run(
      `IM${stamp}`,
      userA.id,
      Number(declInfo.lastInsertRowid),
      port.id,
      new Date().toISOString().slice(0, 10),
      new Date().toISOString(),
      new Date().toISOString()
    );
  const collection = await api('/tourism/collection', { token: userA.token });
  const stamps = collection.data.stamps || [];
  check(
    '收集册把入境记录映射为纪念章(带口岸名)',
    collection.status === 200 && stamps.length >= 1 && stamps[0].no === `IM${stamp}` && !!stamps[0].portName && !!stamps[0].entryDate,
    JSON.stringify(stamps[0] || {}).slice(0, 240)
  );

  // -------------------------------------------------------------------------
  // 5. 公告订阅推送:订阅 → 发布 → 订阅者收到
  // -------------------------------------------------------------------------
  const subscribe = await api('/postal/subscription', { method: 'PUT', token: userB.token, body: { subscribed: true } });
  check('用户 B 开启公告订阅', subscribe.status === 200 && subscribe.data.subscribed === true, JSON.stringify(subscribe.data));

  const noticeCreate = await api('/postal/admin/notices', {
    method: 'POST',
    token: admin.token,
    body: { title: '联动冒烟公告', body: '跨署联动验收公告正文', titleTw: '聯動冒煙公告', bodyTw: '跨署聯動驗收公告正文' },
  });
  const noticeId = noticeCreate.data.notice?.id;
  check('创建公告', noticeCreate.status === 201 && !!noticeId, JSON.stringify(noticeCreate.data).slice(0, 200));
  const noticePublish = await api(`/postal/admin/notices/${noticeId}/publish`, { method: 'POST', token: admin.token });
  check(
    '发布公告触达订阅者(notified ≥ 1)',
    noticePublish.status === 200 && (noticePublish.data.notified || 0) >= 1,
    JSON.stringify(noticePublish.data).slice(0, 200)
  );
  const postB = await api('/postal/messages', { token: userB.token });
  check(
    '订阅者消息中心收到公告通知',
    (postB.data.items || []).some((m) => m.type === 'notice_published' && m.source === 'postal'),
    JSON.stringify(postB.data.items?.[0] || {}).slice(0, 200)
  );

  // -------------------------------------------------------------------------
  // 6. 教育署任务完成 → 邮政契约;统计署年度报告 → 邮政契约
  // -------------------------------------------------------------------------
  sqlite
    .prepare(
      `INSERT INTO edu_tasks (no, code, title, title_tw, description, kind, target_count, badge_code, badge_name, badge_name_tw, status, created_at, updated_at)
       VALUES ('NET-SMOKE-1', 'offices_smoke_task', '联动冒烟阅读任务', '聯動冒煙閱讀任務', 'read one entry', 'reading', 1, 'EDU_SMOKE', '冒烟读者徽章', '冒煙讀者徽章', 'active', ?, ?)`
    )
    .run(new Date().toISOString(), new Date().toISOString());
  const eduList = await api('/education/entries', { token: userA.token });
  const firstEntry = (eduList.data.items || [])[0];
  check('教育署有已发布词条可读', !!firstEntry?.id, JSON.stringify(eduList.data).slice(0, 160));
  if (firstEntry?.id) {
    await api(`/education/entries/${firstEntry.id}`, { token: userA.token });
  }
  const eduTasks = await api('/education/tasks', { token: userA.token });
  const smokeTask = (eduTasks.data.items || []).find((t) => t.code === 'offices_smoke_task');
  check('阅读任务完成并发放徽章', !!smokeTask && smokeTask.completed === true && smokeTask.progress >= 1, JSON.stringify(smokeTask || {}).slice(0, 200));

  const report = await api('/stats/reports', { method: 'POST', token: userA.token, body: { year: new Date().getFullYear() } });
  check(
    '个人年度报告生成且邮政通知已发',
    report.status === 200 && report.data.postal === 'sent' && !!report.data.report?.no,
    JSON.stringify({ postal: report.data.postal, no: report.data.report?.no }).slice(0, 200)
  );

  // -------------------------------------------------------------------------
  // 7. 邮政触达总账:五署各至少一条;统计看板与报告快照
  // -------------------------------------------------------------------------
  const perSource = ['tourism', 'archives', 'stats', 'education', 'postal'].map((source) => ({ source, n: postalCount(source) }));
  check(
    '邮政契约五署消息各至少一条',
    perSource.every((s) => s.n >= 1),
    JSON.stringify(perSource)
  );
  check('文旅打卡消息落库', postalCount('tourism', 'tour_checkin') >= 1, `count=${postalCount('tourism', 'tour_checkin')}`);
  check('教育任务消息落库', postalCount('education', 'task_completed') >= 1, `count=${postalCount('education', 'task_completed')}`);

  const dashboard = await api('/stats/admin/dashboard', { token: admin.token });
  const boardByKey = new Map((dashboard.data.offices || []).map((b) => [b.key, b]));
  const newOffices = ['tourism', 'postal', 'archives', 'education', 'stats'].map((key) => ({
    key,
    available: boardByKey.get(key)?.available,
    total: boardByKey.get(key)?.total,
  }));
  check(
    '统计看板五新署卡片可用且计数非零',
    dashboard.status === 200 && newOffices.every((b) => b.available === true && b.total > 0),
    JSON.stringify(newOffices)
  );
  check(
    '统计看板覆盖 12 署',
    (dashboard.data.offices || []).length >= 12,
    `offices=${(dashboard.data.offices || []).length}`
  );

  const reportId = report.data.report?.id;
  const reportDetail = await api(`/stats/reports/${reportId}`, { token: userA.token });
  const sections = reportDetail.data.report?.snapshot?.sections || [];
  const sectionOf = (key) => sections.find((s) => s.key === key);
  const tourismItems = sectionOf('tourism')?.items || [];
  const archivesItems = sectionOf('archives')?.items || [];
  check(
    '年度报告快照含文旅打卡与档案删除申请计数',
    tourismItems.some((i) => i.key === 'checkins' && i.value >= 1) && archivesItems.some((i) => i.key === 'deletionRequests' && i.value >= 1),
    JSON.stringify({ tourismItems, archivesItems })
  );

  if (failures) {
    console.error(`\n${failures} 项失败 ✘`);
    process.exitCode = 1;
  } else {
    console.log('\n全部通过 ✔');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      sqlite?.close();
    } catch {
      // already closed
    }
    stopServer().then(() => {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch {
        // best effort
      }
    });
  });
