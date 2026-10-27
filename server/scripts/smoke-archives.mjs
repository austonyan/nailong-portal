// 皇家档案与记录署 — 端到端验收脚本(自包含)。
// 临时数据目录 + 随机端口启动独立 API,插桩签注/入境两署业务记录,
// 覆盖档案目录/脱敏/详情/导出限额/删除申请状态机/隐藏标记/双语回读/审计/访问日志。
// 用法: node server/scripts/smoke-archives.mjs
//
// 注意:本脚本依赖 server/index.js 已挂载 /api/archives 与 /api/archives/admin
// (由集成完成,见 Manifest.indexMount)。挂载前运行会在档案署第一个断言处
// 给出明确提示并以失败退出,这是预期行为。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 缺省启动正式入口 server/index.js;测试挂载钩子仅用于集成前的本地验证
// (ARCHIVES_SMOKE_ENTRY 指向一个已挂载本署路由的临时入口)。
const serverEntry = process.env.ARCHIVES_SMOKE_ENTRY || path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-archives-'));

// 先 import 服务端 db 模块,让临时库完成门户核心建库与种子。
await import(pathToFileURL(path.join(__dirname, '..', 'db.js')).href);

let failures = 0;
let serverLog = '';
let child = null;
let base = null;
let sqlite = null;

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pickPort() {
  return 41000 + Math.floor(Math.random() * 20000);
}

async function startServer() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const port = pickPort();
    base = `http://127.0.0.1:${port}`;
    serverLog = '';
    const env = { ...process.env, PORT: String(port), NAILONG_DATA_DIR: dataDir };
    delete env.ADMIN_PASSWORD;
    child = spawn(process.execPath, [serverEntry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => {
      serverLog += chunk;
    });
    child.stderr.on('data', (chunk) => {
      serverLog += chunk;
    });
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
    if (child.exitCode !== null && /EADDRINUSE/i.test(serverLog)) {
      await stopServer();
      continue;
    }
    if (child.exitCode === null) return;
    throw new Error(`server exited early:\n${serverLog}`);
  }
  throw new Error('cannot find a free port after 5 attempts');
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

function row(sql, ...params) {
  return sqlite.prepare(sql).get(...params);
}

function openDb() {
  sqlite = new Database(path.join(dataDir, 'nailong.db'));
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

// 本署 permissions 行(db.js PERMISSIONS 尚未登记时的插桩;已登记时幂等跳过)。
function stubArchivesPermissions() {
  const columns = sqlite.prepare('PRAGMA table_info(permissions)').all().map((c) => c.name);
  const hasTw = columns.includes('name_tw');
  const insert = hasTw
    ? sqlite.prepare(
        'INSERT OR IGNORE INTO permissions (key, name, name_tw, description, description_tw, grp) VALUES (?, ?, ?, ?, ?, ?)'
      )
    : sqlite.prepare('INSERT OR IGNORE INTO permissions (key, name, description, grp) VALUES (?, ?, ?, ?)');
  const rows = hasTw
    ? [
        ['arch:portal', '档案署访问', '檔案署存取', '查询本人签注与入境档案', '查詢本人簽註與入境檔案', 'archives'],
        ['arch:manage', '档案署管理', '檔案署管理', '档案署管理端全部功能', '檔案署管理端全部功能', 'archives'],
      ]
    : [
        ['arch:portal', '档案署访问', '查询本人签注与入境档案', 'archives'],
        ['arch:manage', '档案署管理', '档案署管理端全部功能', 'archives'],
      ];
  const grant = sqlite.prepare(
    'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?'
  );
  for (const r of rows) insert.run(...r);
  grant.run('admin', 'arch:portal');
  grant.run('admin', 'arch:manage');
  grant.run('user', 'arch:portal');
}

async function main() {
  await startServer();
  openDb();

  // -----------------------------------------------------------------------
  // 首次启动 → 管理员 admin/admin123
  // -----------------------------------------------------------------------
  const status = await api('/setup/status');
  check('首启状态可读', status.status === 200 && status.data.required === true, JSON.stringify(status.data));

  const setup = await api('/setup/admin', {
    method: 'POST',
    body: { username: 'admin', displayName: '站长', email: 'admin@example.com', password: 'admin123' },
  });
  check('创建管理员', setup.status === 201 && !!setup.data.accessToken, JSON.stringify(setup.data));
  const adminToken = setup.data.accessToken;

  stubArchivesPermissions();

  // 权限隔离用的普通用户(仅 user 角色 → arch:portal)。
  const plain = await api('/users', {
    method: 'POST',
    token: adminToken,
    body: { username: 'arch_user', password: 'UserPass12345', displayName: '龙民小美', email: 'user@example.com', roleKeys: ['user'] },
  });
  check('创建普通用户', plain.status === 201 && !!plain.data.user?.id, JSON.stringify(plain.data));
  const userId = plain.data.user.id;

  async function loginPlain() {
    const res = await api('/auth/login', {
      method: 'POST',
      body: { username: 'arch_user', password: 'UserPass12345' },
    });
    return res.data?.accessToken;
  }
  const userToken = await loginPlain();
  check('普通用户可登录', !!userToken, '');

  // -----------------------------------------------------------------------
  // 档案署路由是否已挂载(集成前给出明确提示)
  // -----------------------------------------------------------------------
  const probe = await api('/archives/overview', { token: userToken });
  if (probe.status === 404 && (probe.data.code === 'NOT_FOUND' || probe.data.code === undefined)) {
    check('档案署路由已挂载(等待集成)', false, 'server/index.js 尚未挂载 /api/archives,集成后重跑本脚本');
    return;
  }

  const forbidden = await api('/archives/admin/rules', { token: userToken });
  check('无 arch:manage 访问管理端被拒', forbidden.status === 403, JSON.stringify(forbidden.data));

  // -----------------------------------------------------------------------
  // 插桩两署业务记录(签注 2 条 + 入境 2 条,归属普通用户)
  // -----------------------------------------------------------------------
  const ts = new Date().toISOString();
  const visaAppId = sqlite
    .prepare(
      "INSERT INTO visa_applications (app_no, user_id, type_code, status, nickname, contact, purpose, plan_arrive, plan_leave, created_at, updated_at, submitted_at) VALUES ('NLA-261027-ARC001', ?, 'TOURIST', 'approved', '龙民小美', 'xiaomei@example.com', '观光', '2026-11-01', '2026-11-08', ?, ?, ?)"
    )
    .run(userId, ts, ts, ts).lastInsertRowid;
  sqlite
    .prepare(
      "INSERT INTO visa_permits (visa_no, application_id, user_id, type_code, holder_name, status, verify_token, issued_at, valid_until, updated_at) VALUES ('NLT-261027-ARC001', ?, ?, 'TOURIST', '龙民小美', 'valid', 'tok-archives-1', ?, '2027-01-01', ?)"
    )
    .run(visaAppId, userId, ts, ts);
  const portId = row("SELECT id FROM im_ports WHERE code = 'ROYAL_PORT'")?.id
    ?? sqlite
      .prepare(
        "INSERT INTO im_ports (code, name, name_tw, type, status, open_hours, notice, map_desc, sort_order, created_at, updated_at) VALUES ('ROYAL_PORT','皇家口岸','皇家口岸','land','open','9-21','n','m',0,?,?)"
      )
      .run(ts, ts).lastInsertRowid;
  const declId = sqlite
    .prepare(
      "INSERT INTO im_declarations (no, user_id, port_id, nickname, contact, purpose, status, stay_days, created_at, updated_at, submitted_at) VALUES ('IM261027-ARC001', ?, ?, '龙民小美', '13800001111', 'fun', 'approved', 3, ?, ?, ?)"
    )
    .run(userId, portId, ts, ts, ts).lastInsertRowid;
  sqlite
    .prepare(
      "INSERT INTO im_entry_records (no, user_id, declaration_id, port_id, visa_no, entry_date, stay_days, status, created_at, updated_at) VALUES ('EN261027-ARC001', ?, ?, ?, 'NLT-261027-ARC001', '2026-10-20', 3, 'entered', ?, ?)"
    )
    .run(userId, declId, portId, ts, ts);
  check('两署业务记录已插桩', true);

  // -----------------------------------------------------------------------
  // 用户端:首页概况 / 目录 / 脱敏 / 筛选 / 详情 / 访问日志
  // -----------------------------------------------------------------------
  const overview = await api('/archives/overview', { token: userToken });
  check('概况返回 4 类记录 + 指南', overview.status === 200 && overview.data.recordTypes?.length === 4 && (overview.data.guides?.length ?? 0) >= 2, JSON.stringify(overview.data.recordTypes?.length));
  check('概况统计为 4 条', overview.data.counts?.total === 4, JSON.stringify(overview.data.counts));

  const list = await api('/archives/records?page=1&pageSize=10', { token: userToken });
  check('目录返回 4 条', list.status === 200 && list.data.total === 4, JSON.stringify(list.data.total));
  const rawLeak = JSON.stringify(list.data);
  check('目录脱敏(编号/联系方式)', !rawLeak.includes('NLA-261027-ARC001') && !rawLeak.includes('xiaomei@example.com') && !rawLeak.includes('13800001111'), '');
  check('目录已展示打码编号', rawLeak.includes('NLA-****'), rawLeak.slice(0, 120));

  const listVisa = await api('/archives/records?office=visa', { token: userToken });
  check('按署筛选:签注 2 条', listVisa.data.total === 2, JSON.stringify(listVisa.data.total));
  const listKw = await api('/archives/records?keyword=IM261027', { token: userToken });
  check('关键字筛选:1 条', listKw.data.total === 1, JSON.stringify(listKw.data.total));
  const listRange = await api('/archives/records?from=2026-10-01&to=2026-10-25', { token: userToken });
  check('时间筛选命中入境记录', listRange.data.items.some((item) => item.date === '2026-10-20'), JSON.stringify(listRange.data.total));

  const detail = await api(`/archives/records/im_declaration/${declId}`, { token: userToken });
  check('详情只读 + 原署链接', detail.status === 200 && detail.data.record?.sourceUrl === `/immigration/declare/${declId}`, JSON.stringify(detail.data.record?.sourceUrl));
  check('详情字段已脱敏', !JSON.stringify(detail.data).includes('13800001111'), '');

  const accessCount1 = row('SELECT COUNT(*) AS n FROM arch_access_logs WHERE user_id = ?', userId).n;
  check('访问日志已记录 list/detail', accessCount1 >= 3, JSON.stringify(accessCount1));

  // 双语回读:zh-TW 请求应返回繁体内容(name_tw 列被中间件重写)。
  const overviewTw = await api('/archives/overview', { token: userToken, locale: 'zh-TW' });
  check(
    'zh-TW 概况返回繁体类型名与保留说明',
    overviewTw.data.recordTypes?.[0]?.name === '簽註申請紀錄' && overviewTw.data.recordTypes?.[0]?.retention?.includes('長期'),
    JSON.stringify(overviewTw.data.recordTypes?.[0])
  );
  const detailTw = await api(`/archives/records/im_declaration/${declId}`, { token: userToken, locale: 'zh-TW' });
  check('zh-TW 详情口岸名回繁体', detailTw.data.record?.title === '皇家口岸', JSON.stringify(detailTw.data.record?.title));

  // -----------------------------------------------------------------------
  // 导出:每日 3 次限额 + 审计
  // -----------------------------------------------------------------------
  const export1 = await api('/archives/records/export', { method: 'POST', token: userToken, body: {} });
  check('导出 1:成功且剩余 2', export1.status === 200 && export1.data.rows?.length === 4 && export1.data.remaining === 2, JSON.stringify(export1.data.remaining));
  await api('/archives/records/export', { method: 'POST', token: userToken, body: {} });
  const export3 = await api('/archives/records/export', { method: 'POST', token: userToken, body: {} });
  check('导出 3:剩余 0', export3.status === 200 && export3.data.remaining === 0, JSON.stringify(export3.data.remaining));
  const export4 = await api('/archives/records/export', { method: 'POST', token: userToken, body: {} });
  check('导出 4:429 ARCH_EXPORT_LIMIT', export4.status === 429 && export4.data.code === 'ARCH_EXPORT_LIMIT', JSON.stringify(export4.data));
  check('导出已写审计', !!row("SELECT id FROM arch_audit_logs WHERE action = 'export.user' AND actor_id = ?", userId), '');

  // -----------------------------------------------------------------------
  // 删除申请:校验 → 提交 → 邮政契约消息落库
  // -----------------------------------------------------------------------
  const noConfirm = await api('/archives/deletion-requests', {
    method: 'POST',
    token: userToken,
    body: { types: ['visa_permit', 'im_entry'], impact: '希望隐藏这两类记录', confirm: false },
  });
  check('缺少二次确认被拒', noConfirm.status === 400 && noConfirm.data.code === 'ARCH_CONFIRM_REQUIRED', JSON.stringify(noConfirm.data));

  const emptyScope = await api('/archives/deletion-requests', {
    method: 'POST',
    token: userToken,
    body: { types: [], impact: '希望隐藏记录', confirm: true },
  });
  check('空范围被拒', emptyScope.status === 400 && emptyScope.data.code === 'ARCH_SCOPE_EMPTY', JSON.stringify(emptyScope.data));

  const created = await api('/archives/deletion-requests', {
    method: 'POST',
    token: userToken,
    body: { types: ['visa_permit', 'im_entry'], impact: '希望隐藏这两类归档记录', reason: '验收流程', confirm: true },
  });
  const requestNo = created.data.request?.no;
  const requestId = created.data.request?.id;
  check('删除申请创建(NAH 编号 + pending)', created.status === 201 && /^NAH-/.test(requestNo ?? '') && created.data.request.status === 'pending', JSON.stringify(created.data));

  const duplicate = await api('/archives/deletion-requests', {
    method: 'POST',
    token: userToken,
    body: { types: ['visa_permit'], impact: '重复提交验收测试', confirm: true },
  });
  check('进行中申请不可重复提交', duplicate.status === 409 && duplicate.data.code === 'ARCH_REQUEST_ACTIVE', JSON.stringify(duplicate.data));

  const postalRow = row("SELECT * FROM arch_messages WHERE user_id = ? AND type = 'submitted'", userId);
  check('邮政契约消息落库(source=archives)', !!postalRow && postalRow.source === 'archives' && postalRow.channel === 'postal', JSON.stringify(postalRow));

  // -----------------------------------------------------------------------
  // 管理端:规则 / 查询 / 导出确认 / 队列状态机 / 回执
  // -----------------------------------------------------------------------
  const rules = await api('/archives/admin/rules', { token: adminToken });
  check('规则列表含保留说明', rules.status === 200 && rules.data.items?.length === 4 && !!rules.data.items[0].retention, JSON.stringify(rules.data.items?.[0]));

  const adminExportNoConfirm = await api('/archives/admin/records/export', { method: 'POST', token: adminToken, body: {} });
  check('管理端导出需二次确认', adminExportNoConfirm.status === 400 && adminExportNoConfirm.data.code === 'ARCH_CONFIRM_REQUIRED', JSON.stringify(adminExportNoConfirm.data));
  const adminExport = await api('/archives/admin/records/export', { method: 'POST', token: adminToken, body: { confirm: true } });
  check('管理端导出成功', adminExport.status === 200 && adminExport.data.rows?.length === 4, JSON.stringify(adminExport.data.count));
  check('管理端导出写审计', !!row("SELECT id FROM arch_audit_logs WHERE action = 'export.admin'"), '');

  const queue = await api('/archives/admin/deletion-requests?status=pending', { token: adminToken });
  check('队列可见申请与申请人', queue.data.total === 1 && queue.data.items[0].applicant?.username === 'arch_user', JSON.stringify(queue.data.items[0]));

  const badTransition = await api(`/archives/admin/deletion-requests/${requestId}/execute`, { method: 'POST', token: adminToken });
  check('状态机:pending 不能直接执行', badTransition.status === 400 && badTransition.data.code === 'ARCH_INVALID_STATE', JSON.stringify(badTransition.data));

  const accepted = await api(`/archives/admin/deletion-requests/${requestId}/accept`, { method: 'POST', token: adminToken, body: { note: '材料齐全' } });
  check('受理 → reviewing', accepted.status === 200 && accepted.data.request.status === 'reviewing', JSON.stringify(accepted.data.request?.status));

  const approved = await api(`/archives/admin/deletion-requests/${requestId}/approve`, { method: 'POST', token: adminToken });
  check('通过 → executing', approved.status === 200 && approved.data.request.status === 'executing', JSON.stringify(approved.data.request?.status));

  const executed = await api(`/archives/admin/deletion-requests/${requestId}/execute`, { method: 'POST', token: adminToken });
  check(
    '执行 → completed + 回执 + 影响数',
    executed.data.request?.status === 'completed' && executed.data.request.receiptNo === `${requestNo}-R` && executed.data.request.affectedCount === 2,
    JSON.stringify(executed.data.request)
  );

  // -----------------------------------------------------------------------
  // 隐藏标记:软删除语义,业务表数据不动
  // -----------------------------------------------------------------------
  check('arch_hidden_records 写入 2 行', row('SELECT COUNT(*) AS n FROM arch_hidden_records WHERE user_id = ?', userId).n === 2, '');
  check('业务表数据未被删除', row('SELECT COUNT(*) AS n FROM visa_permits WHERE user_id = ?', userId).n === 1 && row('SELECT COUNT(*) AS n FROM im_entry_records WHERE user_id = ?', userId).n === 1, '');
  const listAfter = await api('/archives/records', { token: userToken });
  check('用户目录不再展示已隐藏记录', listAfter.data.total === 2, JSON.stringify(listAfter.data.total));
  const adminAfter = await api('/archives/admin/records?pageSize=20', { token: adminToken });
  check('管理端仍可见隐藏行并打标', adminAfter.data.items?.filter((item) => item.hidden).length === 2, JSON.stringify(adminAfter.data.items?.map((i) => i.hidden)));

  const progress = await api(`/archives/deletion-requests/${requestId}`, { token: userToken });
  check('用户端进度可见(completed + 时间线)', progress.data.request?.status === 'completed' && (progress.data.request.events?.length ?? 0) >= 4, JSON.stringify(progress.data.request?.status));

  const messages = await api('/archives/messages', { token: userToken });
  const msgTypes = (messages.data.items ?? []).map((m) => m.type);
  check('站内信覆盖完整生命周期', ['submitted', 'reviewing', 'executing', 'completed'].every((t) => msgTypes.includes(t)), JSON.stringify(msgTypes));

  // -----------------------------------------------------------------------
  // 驳回路径 + 申诉对接线索(理由必填)
  // -----------------------------------------------------------------------
  const second = await api('/archives/deletion-requests', {
    method: 'POST',
    token: userToken,
    body: { types: ['visa_application'], impact: '第二次删除申请验收', confirm: true },
  });
  const rejectNoReason = await api(`/archives/admin/deletion-requests/${second.data.request.id}/reject`, { method: 'POST', token: adminToken, body: {} });
  check('驳回必须写理由', rejectNoReason.status === 400 && rejectNoReason.data.code === 'ARCH_REASON_REQUIRED', JSON.stringify(rejectNoReason.data));
  const rejected = await api(`/archives/admin/deletion-requests/${second.data.request.id}/reject`, { method: 'POST', token: adminToken, body: { reason: '范围不符合规定' } });
  check('驳回 → rejected + 理由', rejected.data.request?.status === 'rejected' && rejected.data.request.rejectReason === '范围不符合规定', JSON.stringify(rejected.data.request?.status));
  const rejectedMsg = row("SELECT * FROM arch_messages WHERE user_id = ? AND type = 'rejected'", userId);
  check('驳回消息已通知申请人', !!rejectedMsg && JSON.parse(rejectedMsg.params).reason === '范围不符合规定', JSON.stringify(rejectedMsg));

  // -----------------------------------------------------------------------
  // 规则 CRUD:关闭纳档 → 该类型从用户目录消失
  // -----------------------------------------------------------------------
  const rulePatch = await api('/archives/admin/rules', {
    method: 'PATCH',
    token: adminToken,
    body: { items: [{ code: 'im_entry', included: false, retention: '临时关闭纳档', retentionTw: '臨時關閉納檔' }] },
  });
  check('规则更新生效', rulePatch.status === 200 && rulePatch.data.items.find((i) => i.code === 'im_entry')?.included === false, JSON.stringify(rulePatch.data.items?.find((i) => i.code === 'im_entry')));
  const listAfterRule = await api('/archives/records', { token: userToken });
  check('关闭纳档后类型从目录消失', !listAfterRule.data.items.some((i) => i.recordType === 'im_entry'), JSON.stringify(listAfterRule.data.items?.map((i) => i.recordType)));
  await api('/archives/admin/rules', { method: 'PATCH', token: adminToken, body: { items: [{ code: 'im_entry', included: true }] } });

  // -----------------------------------------------------------------------
  // 访问日志与审计(管理端)
  // -----------------------------------------------------------------------
  const accessLogs = await api('/archives/admin/access-logs?pageSize=50', { token: adminToken });
  check('访问日志可查且含导出行为', accessLogs.status === 200 && accessLogs.data.items?.some((item) => item.action === 'export'), JSON.stringify(accessLogs.data.total));
  const audit = await api('/archives/admin/audit?pageSize=50', { token: adminToken });
  const auditActions = (audit.data.items ?? []).map((a) => a.action);
  check(
    '审计含导出/规则/受理/执行/驳回',
    ['export.user', 'export.admin', 'rule.update', 'request.accept', 'request.execute', 'request.reject'].every((a) => auditActions.includes(a)),
    JSON.stringify(auditActions)
  );

  const markAll = await api('/archives/messages/read', { method: 'POST', token: userToken });
  check('站内信全部已读', markAll.status === 200 && markAll.data.updated >= 5, JSON.stringify(markAll.data));
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
  if (failures) {
    console.error(`\n${failures} 项失败 ✘`);
  } else {
    console.log('\n全部通过 ✔');
  }
  process.exitCode = failures ? 1 : 0;
}