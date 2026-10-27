// 奶龙国皇家邮政与通信署 — 端到端验收脚本。
// 自包含:临时数据目录 + 随机端口启动独立 API,覆盖管理端 CRUD、权限隔离、
// 用户端核心流程、明信片状态机、双语回读、审计与邮政契约消息落库。
//
// 注意:本脚本依赖集成完成后的状态 —
//   1. server/db.js 的 PERMISSIONS 已登记 post:portal / post:manage(脚本会先
//      直接把权限行插进临时库,提前运行也能通过授权阶段);
//   2. server/index.js 已挂载 /api/postal 与 /api/postal/admin 路由。
// 在集成完成前运行会因 404 失败,这是预期行为(统一门禁稍后运行)。
//
// 用法: node server/scripts/smoke-postal.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-postal-'));
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
  //    进程启动后 ensurePostalSchema() 就能把权限授予 admin / user / post_admin。
  // -------------------------------------------------------------------------
  sharedDb = (await import(pathToFileURL(path.join(__dirname, '..', 'db.js')).href)).db;
  const db = openDb();

  const insertPermission = db.prepare(
    `INSERT OR IGNORE INTO permissions (key, name, name_tw, description, description_tw, grp)
     VALUES (?, ?, ?, ?, ?, 'postal')`
  );
  insertPermission.run('post:portal', '邮政署访问', '郵政署存取', '使用皇家邮政与通信署的消息中心、公告订阅与虚拟明信片', '使用皇家郵政與通信署的訊息中心、公告訂閱與虛擬明信片');
  insertPermission.run('post:manage', '邮政署管理', '郵政署管理', '公告、通知模板、明信片与统计审计管理', '公告、通知範本、明信片與統計稽核管理');
  db.close();
  sqlite = null;

  await startServer();
  const db2 = openDb();
  sqlite = db2;

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
  const admin = setup.data;
  const adminToken = admin.accessToken;
  const adminId = admin.user.id;

  const suffix = Date.now().toString(36);
  const register = await api('/auth/register', {
    method: 'POST',
    body: { username: `post_user_${suffix}`, password: 'UserPass12345', displayName: '邮递员小龙' },
  });
  check('注册普通用户', register.status === 201 && !!register.data.accessToken, JSON.stringify(register.data));
  const userToken = register.data.accessToken;
  const userId = register.data.user.id;

  // -------------------------------------------------------------------------
  // 2. 权限隔离
  // -------------------------------------------------------------------------
  const userHome = await api('/postal/home', { token: userToken });
  check('普通用户可用邮政署', userHome.status === 200 && Array.isArray(userHome.data.notices), JSON.stringify(userHome.data));

  const userDenied = await api('/postal/admin/stats', { token: userToken });
  check('无管理权限访问管理端被拒绝', userDenied.status === 403, JSON.stringify(userDenied.data));

  // -------------------------------------------------------------------------
  // 3. 管理端:公告 CRUD + 双语回读
  // -------------------------------------------------------------------------
  const noticeCreate = await api('/postal/admin/notices', {
    method: 'POST',
    token: adminToken,
    body: {
      title: '烟测公告:灯会交通指引',
      titleTw: '煙測公告:燈會交通指引',
      body: '灯会期间南港码头单向通行。',
      bodyTw: '燈會期間南港碼頭單向通行。',
      level: 'important',
    },
  });
  check(
    '管理端新建公告',
    noticeCreate.status === 201 && String(noticeCreate.data.notice.no).startsWith('NLQ'),
    JSON.stringify(noticeCreate.data)
  );
  const notice = noticeCreate.data.notice;

  const noticePatch = await api(`/postal/admin/notices/${notice.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { body: '灯会期间南港码头单向通行,请从东门绕行。' },
  });
  check('管理端编辑公告', noticePatch.status === 200, JSON.stringify(noticePatch.data));
  // 用户端详情路由只展示已发布公告(status='published',routes.js /notices/:id),
  // 繁体回读放到发布之后断言。

  // -------------------------------------------------------------------------
  // 4. 管理端:通知模板(种子模板默认停用;启用后 sendPostalMessage 做变量替换)
  // -------------------------------------------------------------------------
  // 自建模板用独立 type:种子已占用 postal/notice_published 的唯一键(409)。
  const templateCreate = await api('/postal/admin/templates', {
    method: 'POST',
    token: adminToken,
    body: {
      source: 'postal',
      type: 'smoke_notice',
      titleTemplate: '临时模板:{{title}}',
      titleTemplateTw: '臨時範本:{{titleTw}}',
      bodyTemplate: '{{title}} 已发布(编号 {{no}})。',
      bodyTemplateTw: '{{titleTw}} 已發布(編號 {{no}})。',
      variables: 'no, title, titleTw, level',
      enabled: true,
    },
  });
  check('管理端新建通知模板', templateCreate.status === 201, JSON.stringify(templateCreate.data));

  // 启用并改写种子 notice_published 模板,发布公告时按它渲染标题。
  const templateList = await api('/postal/admin/templates', { token: adminToken });
  const seedTpl = (templateList.data.items ?? []).find(
    (t) => t.source === 'postal' && t.type === 'notice_published'
  );
  const templatePatch = seedTpl
    ? await api(`/postal/admin/templates/${seedTpl.id}`, {
        method: 'PATCH',
        token: adminToken,
        body: {
          titleTemplate: '临时模板:{{title}}',
          titleTemplateTw: '臨時範本:{{titleTw}}',
          bodyTemplate: '{{title}} 已发布(编号 {{no}})。',
          bodyTemplateTw: '{{titleTw}} 已發布(編號 {{no}})。',
          variables: 'no, title, titleTw, level',
          enabled: true,
        },
      })
    : { status: 0, data: {} };
  check(
    '种子通知模板可启用改写',
    templatePatch.status === 200 && templatePatch.data.template?.enabled === true,
    JSON.stringify(templatePatch.data)
  );

  const templateDup = await api('/postal/admin/templates', {
    method: 'POST',
    token: adminToken,
    body: { source: 'postal', type: 'notice_published', titleTemplate: '重复模板', enabled: true },
  });
  check('重复模板被拒绝', templateDup.status === 409 && templateDup.data.code === 'POST_TEMPLATE_DUPLICATE', JSON.stringify(templateDup.data));

  // -------------------------------------------------------------------------
  // 4.5 管理端:明信片模板 CRUD(用户写明信片挑选的卡片款式)
  // -------------------------------------------------------------------------
  const cardTplCreate = await api('/postal/admin/card-templates', {
    method: 'POST',
    token: adminToken,
    body: {
      code: 'SMOKE_CARD',
      name: '烟测贺卡',
      nameTw: '煙測賀卡',
      scene: 'daily',
      color: 'app-pink',
      description: '验收专用卡片',
      descriptionTw: '驗收專用卡片',
      sortOrder: 9,
      enabled: true,
    },
  });
  check(
    '管理端新建明信片模板',
    cardTplCreate.status === 201 && cardTplCreate.data.template?.code === 'SMOKE_CARD',
    JSON.stringify(cardTplCreate.data)
  );

  const cardTplDup = await api('/postal/admin/card-templates', {
    method: 'POST',
    token: adminToken,
    body: { code: 'SMOKE_CARD', name: '重复编码', scene: 'daily' },
  });
  check(
    '重复明信片模板编码 409',
    cardTplDup.status === 409 && cardTplDup.data.code === 'POST_CARD_TEMPLATE_DUPLICATE',
    JSON.stringify(cardTplDup.data)
  );

  const cardTplBadColor = await api('/postal/admin/card-templates', {
    method: 'POST',
    token: adminToken,
    body: { code: 'SMOKE_BAD', name: '坏颜色', color: 'neon-green' },
  });
  check('非法明信片模板配色被拒绝', cardTplBadColor.status === 400, JSON.stringify(cardTplBadColor.data));

  const userCardsOn = await api('/postal/card-templates', { token: userToken });
  check(
    '用户端可见新建明信片模板',
    (userCardsOn.data.items ?? []).some((tpl) => tpl.code === 'SMOKE_CARD'),
    JSON.stringify(userCardsOn.data.items?.map((tpl) => tpl.code))
  );

  const cardTplDisable = await api(`/postal/admin/card-templates/${cardTplCreate.data.template.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { enabled: false },
  });
  check(
    '明信片模板可停用',
    cardTplDisable.status === 200 && cardTplDisable.data.template?.enabled === false,
    JSON.stringify(cardTplDisable.data)
  );
  const userCardsOff = await api('/postal/card-templates', { token: userToken });
  check(
    '停用后用户端不再展示',
    !(userCardsOff.data.items ?? []).some((tpl) => tpl.code === 'SMOKE_CARD'),
    JSON.stringify(userCardsOff.data.items?.map((tpl) => tpl.code))
  );

  const cardTplRename = await api(`/postal/admin/card-templates/${cardTplCreate.data.template.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { enabled: true, name: '烟测贺卡改', nameTw: '煙測賀卡改' },
  });
  check(
    '明信片模板可编辑',
    cardTplRename.status === 200 && cardTplRename.data.template?.name === '烟测贺卡改',
    JSON.stringify(cardTplRename.data)
  );

  // 被明信片引用的模板不可删除:先用种子模板建一张草稿,再尝试删它。
  const seedCardId = (userCardsOff.data.items ?? []).find((tpl) => tpl.code === 'ROYAL_GATE')?.id;
  const draftRef = await api('/postal/postcards', {
    method: 'POST',
    token: userToken,
    body: { templateCode: 'ROYAL_GATE', blessing: '引用测试', recipientId: adminId, send: false },
  });
  check('为引用测试建草稿', draftRef.status === 201, JSON.stringify(draftRef.data));
  const seedCardDel = await api(`/postal/admin/card-templates/${seedCardId}`, { method: 'DELETE', token: adminToken });
  check(
    '被引用的明信片模板不可删除',
    seedCardDel.status === 409 && seedCardDel.data.code === 'POST_CARD_TEMPLATE_IN_USE',
    JSON.stringify(seedCardDel.data)
  );

  const cardTplDelete = await api(`/postal/admin/card-templates/${cardTplCreate.data.template.id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  check('未引用的明信片模板可删除', cardTplDelete.status === 200, JSON.stringify(cardTplDelete.data));

  // -------------------------------------------------------------------------
  // 5. 订阅 → 发布公告 → 邮政契约消息落库(命中模板渲染)
  // -------------------------------------------------------------------------
  const subscribe = await api('/postal/subscription', { method: 'PUT', token: userToken, body: { subscribed: true } });
  check('订阅公告', subscribe.status === 200 && subscribe.data.subscribed === true, JSON.stringify(subscribe.data));

  const confirmMsg = row(
    "SELECT * FROM post_messages WHERE user_id = ? AND type = 'subscription_confirmed'",
    userId
  );
  check('订阅确认消息落库', !!confirmMsg && confirmMsg.source === 'postal', JSON.stringify(confirmMsg));

  const publish = await api(`/postal/admin/notices/${notice.id}/publish`, { method: 'POST', token: adminToken });
  check('发布公告并通知订阅者', publish.status === 200 && publish.data.notified >= 1, JSON.stringify(publish.data));

  const noticeTw = await api(`/postal/notices/${notice.id}`, { token: userToken, locale: 'zh-TW' });
  check(
    '繁体回读公告标题与正文',
    noticeTw.status === 200 &&
      noticeTw.data.notice.title === '煙測公告:燈會交通指引' &&
      noticeTw.data.notice.titleCn === '烟测公告:灯会交通指引' &&
      noticeTw.data.notice.bodyTw === '燈會期間南港碼頭單向通行。',
    JSON.stringify(noticeTw.data)
  );

  const noticeMsg = row(
    "SELECT * FROM post_messages WHERE user_id = ? AND type = 'notice_published' ORDER BY id DESC",
    userId
  );
  check(
    '公告消息落库(只存 source/type/params)',
    !!noticeMsg &&
      noticeMsg.source === 'postal' &&
      noticeMsg.title === `临时模板:${notice.title}` &&
      noticeMsg.title_tw === `臨時範本:煙測公告:燈會交通指引` &&
      !!noticeMsg.params,
    JSON.stringify(noticeMsg)
  );
  const msgParams = JSON.parse(noticeMsg?.params || '{}');
  check('公告消息参数完整', msgParams.no === notice.no && msgParams.titleTw === '煙測公告:燈會交通指引', JSON.stringify(msgParams));

  const listUser = await api('/postal/messages?box=inbox', { token: userToken });
  check(
    '消息中心可见公告消息并可搜索',
    listUser.status === 200 &&
      listUser.data.items.some((m) => m.type === 'notice_published') &&
      listUser.data.unread >= 2,
    JSON.stringify(listUser.data)
  );

  const searched = await api('/postal/messages?box=inbox&q=' + encodeURIComponent('临时模板'), { token: userToken });
  check('消息关键词搜索命中模板渲染标题', searched.data.items.some((m) => m.type === 'notice_published'), JSON.stringify(searched.data.items));

  // -------------------------------------------------------------------------
  // 6. 通知偏好:关闭 postal 来源后 sendPostalMessage 跳过
  // -------------------------------------------------------------------------
  const mute = await api('/postal/preferences', { method: 'PUT', token: userToken, body: { source: 'postal', enabled: false } });
  check('关闭 postal 来源通知', mute.status === 200 && mute.data.enabled === false, JSON.stringify(mute.data));

  const beforeMute = row('SELECT COUNT(*) AS n FROM post_messages WHERE user_id = ?', userId).n;
  const notice2 = await api('/postal/admin/notices', {
    method: 'POST',
    token: adminToken,
    body: { title: '烟测公告:静音期', body: '这条不该通知到已静音的用户。', level: 'info' },
  });
  const publish2 = await api(`/postal/admin/notices/${notice2.data.notice.id}/publish`, { method: 'POST', token: adminToken });
  check('静音后发布不再通知(notified=0)', publish2.status === 200 && publish2.data.notified === 0, JSON.stringify(publish2.data));
  const afterMute = row('SELECT COUNT(*) AS n FROM post_messages WHERE user_id = ?', userId).n;
  check('静音期间消息数不变', beforeMute === afterMute, `before=${beforeMute} after=${afterMute}`);

  const unmute = await api('/postal/preferences', { method: 'PUT', token: userToken, body: { source: 'postal', enabled: true } });
  check('重新打开 postal 来源通知', unmute.status === 200 && unmute.data.enabled === true, JSON.stringify(unmute.data));

  // -------------------------------------------------------------------------
  // 7. 消息批量操作与状态过滤
  // -------------------------------------------------------------------------
  const readAll = await api('/postal/messages/read-all', { method: 'POST', token: userToken });
  check('全部标为已读', readAll.status === 200 && readAll.data.updated >= 1, JSON.stringify(readAll.data));
  const unreadAfter = await api('/postal/messages?box=inbox&status=unread', { token: userToken });
  check('已读过滤为空', unreadAfter.data.items.length === 0, JSON.stringify(unreadAfter.data));

  const firstMsg = listUser.data.items[0];
  const bulkArchive = await api('/postal/messages/bulk', {
    method: 'POST',
    token: userToken,
    body: { action: 'archive', ids: [firstMsg.id] },
  });
  check('批量归档所选', bulkArchive.status === 200 && bulkArchive.data.updated === 1, JSON.stringify(bulkArchive.data));
  const archivedBox = await api('/postal/messages?box=archived', { token: userToken });
  check('归档箱可见', archivedBox.data.items.some((m) => m.id === firstMsg.id), JSON.stringify(archivedBox.data));

  // -------------------------------------------------------------------------
  // 8. 虚拟明信片:收件人搜索 → 草稿 → 寄出 → 签收 → 收藏
  // -------------------------------------------------------------------------
  const selfSend = await api('/postal/postcards', {
    method: 'POST',
    token: userToken,
    body: { templateCode: 'FESTIVAL_LANTERN', blessing: '给自己?', recipientId: userId, send: true },
  });
  check('禁止给自己寄明信片', selfSend.status === 400 && selfSend.data.code === 'POST_SELF_SEND', JSON.stringify(selfSend.data));

  const recipients = await api('/postal/recipients?q=admin', { token: userToken });
  check(
    '收件人搜索找到管理员',
    recipients.status === 200 && recipients.data.items.some((u) => u.id === adminId && u.username === 'admin' && u.email === undefined),
    JSON.stringify(recipients.data)
  );

  const templates = await api('/postal/card-templates', { token: userToken, locale: 'zh-TW' });
  const lantern = templates.data.items.find((tpl) => tpl.code === 'FESTIVAL_LANTERN');
  check(
    '繁体回读明信片模板',
    templates.status === 200 && lantern && lantern.name === '燈會賀卡' && lantern.nameCn === '灯会贺卡',
    JSON.stringify(templates.data.items)
  );

  const draft = await api('/postal/postcards', {
    method: 'POST',
    token: userToken,
    body: { templateCode: 'FESTIVAL_LANTERN', blessing: '草稿祝福', recipientId: adminId, send: false },
  });
  check('明信片草稿创建', draft.status === 201 && draft.data.postcard.status === 'draft' && String(draft.data.postcard.no).startsWith('NLM'), JSON.stringify(draft.data));

  const draftPatch = await api(`/postal/postcards/${draft.data.postcard.id}`, {
    method: 'PATCH',
    token: userToken,
    body: { blessing: '灯会快乐,记得来南港码头!' },
  });
  check('草稿可编辑', draftPatch.status === 200 && draftPatch.data.postcard.blessing.includes('南港码头'), JSON.stringify(draftPatch.data));

  const send = await api(`/postal/postcards/${draft.data.postcard.id}/send`, { method: 'POST', token: userToken });
  check('草稿寄出(draft → sent)', send.status === 200 && send.data.postcard.status === 'sent', JSON.stringify(send.data));

  const cardMsg = row(
    "SELECT * FROM post_messages WHERE user_id = ? AND type = 'postcard_received'",
    adminId
  );
  check('收件人收到明信片通知', !!cardMsg && JSON.parse(cardMsg.params).from === '邮递员小龙', JSON.stringify(cardMsg));

  const receive = await api(`/postal/postcards/${draft.data.postcard.id}/receive`, { method: 'POST', token: adminToken });
  check('管理员签收(sent → received)', receive.status === 200 && receive.data.postcard.status === 'received', JSON.stringify(receive.data));

  const favorite = await api(`/postal/postcards/${draft.data.postcard.id}/favorite`, {
    method: 'POST',
    token: adminToken,
    body: { favorited: true },
  });
  check('收件人收藏明信片', favorite.status === 200 && favorite.data.favorited === true, JSON.stringify(favorite.data));

  const favBox = await api('/postal/postcards?box=favorites', { token: adminToken });
  check('收藏夹可见', favBox.data.items.some((c) => c.id === draft.data.postcard.id), JSON.stringify(favBox.data));

  // -------------------------------------------------------------------------
  // 9. 每日限额(直接把临时库限额改成 1,再寄第二张应 409)
  // -------------------------------------------------------------------------
  sqlite.prepare("UPDATE post_settings SET value = '1' WHERE key = 'postcard_daily_limit'").run();
  const quotaExceeded = await api('/postal/postcards', {
    method: 'POST',
    token: userToken,
    body: { templateCode: 'ISLAND_SUNSET', blessing: '第二张', recipientId: adminId, send: true },
  });
  check('每日限额生效', quotaExceeded.status === 409 && quotaExceeded.data.code === 'POST_DAILY_LIMIT', JSON.stringify(quotaExceeded.data));

  // -------------------------------------------------------------------------
  // 10. 管理端:明信片下架 → 寄件人收到通知
  // -------------------------------------------------------------------------
  const takedown = await api(`/postal/admin/postcards/${draft.data.postcard.id}/takedown`, {
    method: 'POST',
    token: adminToken,
    body: { reason: '烟测下架' },
  });
  check('管理端下架明信片', takedown.status === 200 && takedown.data.postcard.status === 'taken_down', JSON.stringify(takedown.data));

  const senderBox = await api('/postal/postcards?box=sent', { token: userToken });
  check('寄件人可见已下架状态', senderBox.data.items.some((c) => c.id === draft.data.postcard.id && c.status === 'taken_down'), JSON.stringify(senderBox.data));

  const takedownMsg = row(
    "SELECT * FROM post_messages WHERE user_id = ? AND type = 'postcard_taken_down'",
    userId
  );
  check('下架通知落库', !!takedownMsg && JSON.parse(takedownMsg.params).reason === '烟测下架', JSON.stringify(takedownMsg));

  // -------------------------------------------------------------------------
  // 11. 软删除:公告与明信片
  // -------------------------------------------------------------------------
  const deleteNotice = await api(`/postal/admin/notices/${notice2.data.notice.id}`, { method: 'DELETE', token: adminToken });
  check('管理端删除公告', deleteNotice.status === 200, JSON.stringify(deleteNotice.data));
  const deletedRow = row('SELECT * FROM post_notices WHERE id = ?', notice2.data.notice.id);
  check('公告软删除生效', deletedRow && !!deletedRow.deleted_at, JSON.stringify(deletedRow));
  const deletedFetch = await api(`/postal/notices/${notice2.data.notice.id}`, { token: userToken });
  check('已删公告用户端不可见', deletedFetch.status === 404, JSON.stringify(deletedFetch.data));

  const deleteCard = await api(`/postal/postcards/${draft.data.postcard.id}`, { method: 'DELETE', token: userToken });
  check('寄件人删除明信片', deleteCard.status === 200, JSON.stringify(deleteCard.data));
  const hiddenCard = row('SELECT * FROM post_postcards WHERE id = ?', draft.data.postcard.id);
  check('明信片按侧软删除', hiddenCard && !!hiddenCard.sender_hidden_at && !hiddenCard.recipient_hidden_at, JSON.stringify(hiddenCard));
  const adminStillSees = await api('/postal/admin/postcards?q=' + encodeURIComponent(hiddenCard.no), { token: adminToken });
  check('管理端全量列表仍可见软删明信片', adminStillSees.data.total === 1, JSON.stringify(adminStillSees.data));

  // -------------------------------------------------------------------------
  // 12. 统计与审计
  // -------------------------------------------------------------------------
  const stats = await api('/postal/admin/stats', { token: adminToken });
  check(
    '基础统计可用',
    stats.status === 200 &&
      stats.data.messages.total >= 3 &&
      typeof stats.data.messages.readRate === 'number' &&
      stats.data.postcards.total >= 1 &&
      stats.data.subscribers >= 1,
    JSON.stringify(stats.data)
  );

  const audit = await api('/postal/admin/audit?action=notice_publish', { token: adminToken });
  check(
    '审计有发布记录',
    audit.status === 200 && audit.data.items.some((a) => a.action === 'notice_publish' && a.targetId === notice.no),
    JSON.stringify(audit.data.items?.[0])
  );
  const auditTakedown = await api('/postal/admin/audit?action=postcard_takedown', { token: adminToken });
  check('审计有下架记录', auditTakedown.data.items.length >= 1, JSON.stringify(auditTakedown.data.items));

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