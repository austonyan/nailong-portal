// 奶龙国皇家邮政与通信署 — schema, seeds and RBAC wiring.
//
// Fully additive module (same contract as the other in-SPA offices): it owns
// only post_* tables plus INSERT-only additions to the shared permissions /
// roles / services registries. It also owns the platform-wide message inbox
// (`post_messages`), written through server/postal/notify.js.
import { db, now } from '../db.js';
import { ensureTwColumns } from '../migrate.js';

let ensured = false;

export function ensurePostalSchema() {
  if (ensured) return;
  ensured = true;
  db.exec(`
  -- 公告: draft → published → offline(可再次发布)
  CREATE TABLE IF NOT EXISTS post_notices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    no           TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    title_tw     TEXT,
    body         TEXT NOT NULL DEFAULT '',
    body_tw      TEXT,
    level        TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'important', 'event')),
    status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'offline')),
    published_at TEXT,
    offline_at   TEXT,
    created_by   INTEGER REFERENCES users(id),
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_post_notice_status ON post_notices (status, published_at);

  -- 公告订阅:每个用户一行;缺省视为未订阅。
  CREATE TABLE IF NOT EXISTS post_subscriptions (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    subscribed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 通知偏好:按署(source)开关;缺行 = 接收,显式 0 = 该署消息跳过。
  CREATE TABLE IF NOT EXISTS post_preferences (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source     TEXT NOT NULL,
    enabled    INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, source)
  );

  -- 明信片模板(节庆 / 景点),双语展示。
  CREATE TABLE IF NOT EXISTS post_card_templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    code           TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    name_tw        TEXT,
    scene          TEXT NOT NULL DEFAULT 'festival' CHECK (scene IN ('festival', 'scenery', 'daily')),
    color          TEXT NOT NULL DEFAULT 'app-teal',
    description    TEXT NOT NULL DEFAULT '',
    description_tw TEXT,
    enabled        INTEGER NOT NULL DEFAULT 1,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  -- 明信片状态机: draft → sent → received;任一状态可被管理端 taken_down。
  -- 双方各自软删除(sender_hidden_at / recipient_hidden_at),互不影响。
  CREATE TABLE IF NOT EXISTS post_postcards (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    no                 TEXT NOT NULL UNIQUE,
    sender_id          INTEGER NOT NULL REFERENCES users(id),
    recipient_id       INTEGER NOT NULL REFERENCES users(id),
    template_id        INTEGER NOT NULL REFERENCES post_card_templates(id),
    template_code      TEXT NOT NULL,
    blessing           TEXT NOT NULL DEFAULT '',
    status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received', 'taken_down')),
    sent_at            TEXT,
    received_at        TEXT,
    favorited          INTEGER NOT NULL DEFAULT 0,
    favored_at         TEXT,
    sender_hidden_at   TEXT,
    recipient_hidden_at TEXT,
    takedown_reason    TEXT,
    taken_down_at      TEXT,
    taken_down_by      INTEGER REFERENCES users(id),
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_post_card_sender ON post_postcards (sender_id, status);
  CREATE INDEX IF NOT EXISTS idx_post_card_recipient ON post_postcards (recipient_id, status);
  CREATE INDEX IF NOT EXISTS idx_post_card_fav ON post_postcards (recipient_id, favorited);

  -- 通知模板:管理端可编辑的标题/正文(含 {{变量}});命中启用模板时在发送时渲染。
  CREATE TABLE IF NOT EXISTS post_templates (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    source            TEXT NOT NULL DEFAULT 'postal',
    type              TEXT NOT NULL,
    title_template    TEXT NOT NULL,
    title_template_tw TEXT,
    body_template     TEXT NOT NULL DEFAULT '',
    body_template_tw  TEXT,
    variables         TEXT NOT NULL DEFAULT '',
    enabled           INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    deleted_at        TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_post_tpl_source_type ON post_templates (source, type);

  -- 平台站内信:只存 source/type/params,由 SPA 用 post.msg.* 渲染。
  -- title/body 列仅在命中管理端启用模板时写入渲染结果;管理端模板未启用则留空。
  CREATE TABLE IF NOT EXISTS post_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source     TEXT NOT NULL DEFAULT 'postal',
    type       TEXT NOT NULL DEFAULT 'system',
    params     TEXT NOT NULL DEFAULT '{}',
    title      TEXT,
    title_tw   TEXT,
    body       TEXT,
    body_tw    TEXT,
    read       INTEGER NOT NULL DEFAULT 0,
    archived   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_post_msg_user ON post_messages (user_id, archived, read);
  CREATE INDEX IF NOT EXISTS idx_post_msg_source ON post_messages (user_id, source);

  CREATE TABLE IF NOT EXISTS post_audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER REFERENCES users(id),
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_post_audit_action ON post_audit_logs (action);

  CREATE TABLE IF NOT EXISTS post_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `);

  ensureTwColumns(db, 'post_notices', ['title', 'body']);
  ensureTwColumns(db, 'post_card_templates', ['name', 'description']);
  ensureTwColumns(db, 'post_templates', ['title_template', 'body_template']);
  seedPostal();
}

// ---------------------------------------------------------------------------
// Seeds — idempotent, INSERT OR IGNORE everywhere.
// ---------------------------------------------------------------------------

const POST_PERMISSIONS = [
  {
    key: 'post:portal',
    name: '邮政署访问',
    nameTw: '郵政署存取',
    description: '使用皇家邮政与通信署的消息中心、公告订阅与虚拟明信片',
    descriptionTw: '使用皇家郵政與通信署的訊息中心、公告訂閱與虛擬明信片',
  },
  {
    key: 'post:manage',
    name: '邮政署管理',
    nameTw: '郵政署管理',
    description: '公告、通知模板、明信片与统计审计管理',
    descriptionTw: '公告、通知範本、明信片與統計稽核管理',
  },
];

const CARD_TEMPLATES = [
  {
    code: 'FESTIVAL_LANTERN',
    name: '灯会贺卡',
    nameTw: '燈會賀卡',
    scene: 'festival',
    color: 'app-red',
    description: '奶龙灯会的暖光与灯笼,适合节日问候',
    descriptionTw: '奶龍燈會的暖光與燈籠,適合節日問候',
    sortOrder: 0,
  },
  {
    code: 'ISLAND_SUNSET',
    name: '海岛日落',
    nameTw: '海島日落',
    scene: 'scenery',
    color: 'warm-peach-pink',
    description: '南港码头看到的奶龙岛日落',
    descriptionTw: '南港碼頭看到的奶龍島日落',
    sortOrder: 1,
  },
  {
    code: 'ROYAL_GATE',
    name: '皇家口岸',
    nameTw: '皇家口岸',
    scene: 'scenery',
    color: 'app-teal',
    description: '欢迎再次登岛的皇家口岸门楼',
    descriptionTw: '歡迎再次登島的皇家口岸門樓',
    sortOrder: 2,
  },
];

const NOTICE_SEEDS = [
  {
    title: '皇家邮政与通信署开张啦',
    titleTw: '皇家郵政與通信署開張啦',
    body: '从今天起,全站消息中心、公告订阅与虚拟明信片都由邮政与通信署统一打理。消息中心会汇总各署的通知,再也不会漏看啦。',
    bodyTw: '從今天起,全站訊息中心、公告訂閱與虛擬明信片都由郵政與通信署統一打理。訊息中心會彙整各署的通知,再也不會漏看啦。',
    level: 'info',
  },
  {
    title: '虚拟明信片使用说明',
    titleTw: '虛擬明信片使用說明',
    body: '每人每天最多寄出 10 张明信片:挑一张模板、写下祝福语、搜索收件人即可寄出。收件人可以在收件箱里签收并收藏。明信片只是站内趣味体验,不会发送真实短信或邮件。',
    bodyTw: '每人每天最多寄出 10 張明信片:挑一張範本、寫下祝福語、搜尋收件人即可寄出。收件人可以在收件匣裡簽收並收藏。明信片只是站內趣味體驗,不會傳送真實簡訊或郵件。',
    level: 'important',
  },
  {
    title: '公告订阅上线',
    titleTw: '公告訂閱上線',
    body: '在"订阅与偏好"里打开公告订阅,新公告发布时会自动收到一条站内消息;也可以按署逐个开关通知,不想看的署直接关掉即可。',
    bodyTw: '在「訂閱與偏好」裡開啟公告訂閱,新公告發布時會自動收到一則站內訊息;也可以依署逐個開關通知,不想看的署直接關掉即可。',
    level: 'event',
  },
];

const TEMPLATE_SEEDS = [
  {
    source: 'postal',
    type: 'notice_published',
    title: '新公告:{{title}}',
    titleTw: '新公告:{{title}}',
    body: '《{{title}}》已发布。前往公告列表查看全文。',
    bodyTw: '《{{title}}》已發布。前往公告列表查看全文。',
    variables: 'no, title, level',
  },
  {
    source: 'postal',
    type: 'postcard_received',
    title: '你收到一张明信片',
    titleTw: '你收到一張明信片',
    body: '{{from}} 寄来一张明信片,祝福语:{{blessing}}',
    bodyTw: '{{from}} 寄來一張明信片,祝福語:{{blessing}}',
    variables: 'no, from, blessing',
  },
  {
    source: 'postal',
    type: 'postcard_taken_down',
    title: '明信片 {{no}} 已被下架',
    titleTw: '明信片 {{no}} 已被下架',
    body: '下架原因:{{reason}}。如有疑问请前往消息中心查看说明。',
    bodyTw: '下架原因:{{reason}}。如有疑問請前往訊息中心查看說明。',
    variables: 'no, reason',
  },
];

const DEFAULT_SETTINGS = [
  { key: 'postcard_prefix', value: 'NLM' },
  { key: 'notice_prefix', value: 'NLQ' },
  { key: 'postcard_daily_limit', value: '10' },
];

function seedPostal() {
  const ts = now();
  const run = db.transaction(() => {
    // --- permissions -------------------------------------------------------
    // 权限行由 server/db.js 的 PERMISSIONS 注册(集成师负责);这里只做角色授权,
    // 权限尚未登记时 INSERT ... SELECT 会静默跳过,登记后下次启动即补齐。
    const insertPermission = db.prepare(
      'INSERT OR IGNORE INTO permissions (key, name, name_tw, description, description_tw, grp) VALUES (@key, @name, @nameTw, @description, @descriptionTw, @grp)'
    );
    for (const p of POST_PERMISSIONS) insertPermission.run({ ...p, grp: 'postal' });

    const grantToRole = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
       SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
    );
    // admin always owns every post:* permission, even on pre-existing databases.
    for (const p of POST_PERMISSIONS) grantToRole.run('admin', p.key);
    grantToRole.run('user', 'post:portal');

    // --- 邮政管理员 role ----------------------------------------------------
    db.prepare(
      'INSERT OR IGNORE INTO roles (key, name, name_tw, description, description_tw, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
    ).run(
      'post_admin',
      '邮政管理员',
      '郵政管理員',
      '皇家邮政与通信署管理:公告、通知模板、明信片、统计与审计',
      '皇家郵政與通信署管理:公告、通知範本、明信片、統計與稽核',
      ts
    );
    grantToRole.run('post_admin', 'portal:access');
    for (const p of POST_PERMISSIONS) grantToRole.run('post_admin', p.key);

    // --- service card on the portal home -----------------------------------
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, name_tw, description, description_tw, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('postal', '奶龙国皇家邮政与通信署', '奶龍國皇家郵政與通信署',
               '站内消息中心、公告订阅与虚拟明信片', '站內訊息中心、公告訂閱與虛擬明信片',
               '/postal', 'MailIcon', 'app-blue', 'post:portal', 'internal_sso', 1, 6, ?, ?)`
    ).run(ts, ts);

    // --- 明信片模板 --------------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM post_card_templates').get().n === 0) {
      const insertTpl = db.prepare(
        `INSERT INTO post_card_templates (code, name, name_tw, scene, color, description, description_tw, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @nameTw, @scene, @color, @description, @descriptionTw, 1, @sortOrder, @ts, @ts)`
      );
      for (const tpl of CARD_TEMPLATES) insertTpl.run({ ...tpl, ts });
    }

    // --- 公告演示数据 ------------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM post_notices').get().n === 0) {
      const insertNotice = db.prepare(
        `INSERT INTO post_notices (no, title, title_tw, body, body_tw, level, status, published_at, created_by, created_at, updated_at)
         VALUES (@no, @title, @titleTw, @body, @bodyTw, @level, 'published', @ts, NULL, @ts, @ts)`
      );
      NOTICE_SEEDS.forEach((notice, index) => {
        insertNotice.run({ ...notice, no: `NLQ20261027-SEED0${index + 1}`, ts });
      });
    }

    // --- 通知模板演示:默认停用,启用后才在发送时做变量替换 ------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM post_templates').get().n === 0) {
      const insertTpl = db.prepare(
        `INSERT INTO post_templates (source, type, title_template, title_template_tw, body_template, body_template_tw, variables, enabled, created_at, updated_at)
         VALUES (@source, @type, @title, @titleTw, @body, @bodyTw, @variables, 0, @ts, @ts)`
      );
      for (const tpl of TEMPLATE_SEEDS) insertTpl.run({ ...tpl, ts });
    }

    const insertSetting = db.prepare('INSERT OR IGNORE INTO post_settings (key, value, updated_at) VALUES (?, ?, ?)');
    for (const setting of DEFAULT_SETTINGS) insertSetting.run(setting.key, setting.value, ts);
  });
  run();
}