// 奶龙国皇家文化旅游署 — schema, seeds and RBAC wiring.
//
// Fully additive module (same contract as the other offices): every table is
// prefixed tour_*, and the shared registries (permissions / roles / services)
// only ever receive INSERT OR IGNORE rows, so parallel service workstreams
// never disturb each other.
import { db, now } from '../db.js';
import { ensureTwColumns } from '../migrate.js';

let ensured = false;

export function ensureTourismSchema() {
  if (ensured) return;
  ensured = true;
  db.exec(`
  CREATE TABLE IF NOT EXISTS tour_attractions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    no                TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    name_tw           TEXT,
    summary           TEXT NOT NULL DEFAULT '',
    summary_tw        TEXT,
    description       TEXT NOT NULL DEFAULT '',
    description_tw    TEXT,
    type              TEXT NOT NULL DEFAULT 'landmark' CHECK (type IN ('landmark', 'nature', 'culture', 'food')),
    open_state        TEXT NOT NULL DEFAULT 'open' CHECK (open_state IN ('open', 'limited', 'closed')),
    status            TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline')),
    checkin_points    TEXT NOT NULL DEFAULT '',
    checkin_points_tw TEXT,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    deleted_at        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tour_attr_status ON tour_attractions (status, type);

  CREATE TABLE IF NOT EXISTS tour_articles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    no           TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    title_tw     TEXT,
    summary      TEXT NOT NULL DEFAULT '',
    summary_tw   TEXT,
    body         TEXT NOT NULL DEFAULT '',
    body_tw      TEXT,
    type         TEXT NOT NULL DEFAULT 'festival' CHECK (type IN ('festival', 'folk', 'world')),
    status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'offline')),
    published_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tour_article_status ON tour_articles (status, type);

  -- 打卡:每用户每景点每日一条(唯一索引兜底),软删除保留。
  CREATE TABLE IF NOT EXISTS tour_checkins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    no            TEXT NOT NULL UNIQUE,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    attraction_id INTEGER NOT NULL REFERENCES tour_attractions(id),
    checkin_date  TEXT NOT NULL,
    note          TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    deleted_at    TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tour_checkin_daily ON tour_checkins (user_id, attraction_id, checkin_date);
  CREATE INDEX IF NOT EXISTS idx_tour_checkin_user ON tour_checkins (user_id, checkin_date);
  CREATE INDEX IF NOT EXISTS idx_tour_checkin_attr ON tour_checkins (attraction_id, checkin_date);

  CREATE TABLE IF NOT EXISTS tour_badges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    no          TEXT NOT NULL UNIQUE,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    name_tw     TEXT,
    description TEXT NOT NULL DEFAULT '',
    description_tw TEXT,
    icon        TEXT NOT NULL DEFAULT 'TrophyIcon',
    threshold   INTEGER NOT NULL DEFAULT 1,
    enabled     INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
  );

  -- 发放记录:一个用户每枚徽章一条;回收写 revoked_at,保留历史。
  CREATE TABLE IF NOT EXISTS tour_badge_awards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    badge_id      INTEGER NOT NULL REFERENCES tour_badges(id),
    user_id       INTEGER NOT NULL REFERENCES users(id),
    checkin_count INTEGER NOT NULL DEFAULT 0,
    awarded_at    TEXT NOT NULL,
    revoked_at    TEXT,
    revoked_by    INTEGER REFERENCES users(id),
    revoke_reason TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tour_award_unique ON tour_badge_awards (badge_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_tour_award_user ON tour_badge_awards (user_id, revoked_at);

  CREATE TABLE IF NOT EXISTS tour_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tour_audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER REFERENCES users(id),
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tour_audit_action ON tour_audit_logs (action);

  -- 邮政契约尚未并入时的本地发件箱(结构对齐 post_messages 的 source/type/params)。
  CREATE TABLE IF NOT EXISTS tour_notify_outbox (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    source     TEXT NOT NULL DEFAULT 'tourism',
    type       TEXT NOT NULL,
    params     TEXT NOT NULL DEFAULT '{}',
    status     TEXT NOT NULL DEFAULT 'queued',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tour_outbox_user ON tour_notify_outbox (user_id, type);
  `);

  ensureTwColumns(db, 'tour_attractions', ['name', 'summary', 'description', 'checkin_points']);
  ensureTwColumns(db, 'tour_articles', ['title', 'summary', 'body']);
  ensureTwColumns(db, 'tour_badges', ['name', 'description']);
  seedTourism();
}

// ---------------------------------------------------------------------------
// Seeds — idempotent, INSERT OR IGNORE everywhere.
// ---------------------------------------------------------------------------

const TOUR_PERMISSIONS = [
  {
    key: 'tour:portal',
    name: '文化旅游署访问',
    name_tw: '文化旅遊署存取',
    description: '浏览景点与文化内容、参与打卡、收集纪念章与徽章',
    description_tw: '瀏覽景點與文化內容、參與打卡、收集紀念章與徽章',
    grp: 'tourism',
  },
  {
    key: 'tour:manage',
    name: '文化旅游署管理',
    name_tw: '文化旅遊署管理',
    description: '景点、文化内容、打卡规则、徽章、统计与审计管理',
    description_tw: '景點、文化內容、打卡規則、徽章、統計與稽核管理',
    grp: 'tourism',
  },
];

const TOUR_ROLE = {
  key: 'tour_admin',
  name: '旅游署管理员',
  name_tw: '旅遊署管理員',
  description: '皇家文化旅游署管理:景点、文化内容、打卡规则、徽章、统计与审计',
  description_tw: '皇家文化旅遊署管理:景點、文化內容、打卡規則、徽章、統計與稽核',
};

const SERVICE_CARD = {
  key: 'tourism',
  name: '奶龙国皇家文化旅游署',
  name_tw: '奶龍國皇家文化旅遊署',
  description: '景点导览、文化内容、打卡收集与成就徽章',
  description_tw: '景點導覽、文化內容、打卡收集與成就徽章',
  url: '/tourism',
  icon: 'MapIcon',
  color: 'app-pink',
  required_permission: 'tour:portal',
  // 已占用:visa -1 / appeal -2 / archives -3 / stats -6 / education -7 → 本署取 -8。
  sort_order: -8,
};

const ATTRACTION_SEEDS = [
  {
    no: 'NLV20260101-DEMO01',
    name: '奶龙雕像广场',
    name_tw: '奶龍雕像廣場',
    summary: '奶龙岛最经典的合影地标,广场中央的巨型奶龙雕像会跟着日光变换颜色。',
    summary_tw: '奶龍島最經典的合影地標,廣場中央的巨型奶龍雕像會跟著日光變換顏色。',
    description:
      '广场全天开放,清晨人最少,适合安安静静地和雕像贴贴。雕像脚下的喷泉每到整点会喷出一圈奶泡,据说拍到的旅客都会一路好运。',
    description_tw:
      '廣場全天開放,清晨人最少,適合安安靜靜地和雕像貼貼。雕像腳下的噴泉每到整點會噴出一圈奶泡,據說拍到的旅客都會一路好運。',
    type: 'landmark',
    open_state: 'open',
    checkin_points: '巨型奶龙雕像\n喷泉合影台\n尾巴抚摸点',
    checkin_points_tw: '巨型奶龍雕像\n噴泉合影台\n尾巴撫摸點',
    sort_order: 0,
  },
  {
    no: 'NLV20260101-DEMO02',
    name: '棉花糖山谷',
    name_tw: '棉花糖山谷',
    summary: '会下棉花糖雪的山谷,云朵观景台可以俯瞰整座奶龙岛。',
    summary_tw: '會下棉花糖雪的山谷,雲朵觀景台可以俯瞰整座奶龍島。',
    description:
      '山谷里的雪是甜的,记得张开嘴接一片。观景台在午后常有云海,彩虹石桥连接两侧山坡,是全岛最适合发呆的地方。',
    description_tw:
      '山谷裡的雪是甜的,記得張開嘴接一片。觀景台在午後常有雲海,彩虹石橋連接兩側山坡,是全島最適合發呆的地方。',
    type: 'nature',
    open_state: 'open',
    checkin_points: '云朵观景台\n彩虹石桥\n棉花糖许愿树',
    checkin_points_tw: '雲朵觀景台\n彩虹石橋\n棉花糖許願樹',
    sort_order: 1,
  },
  {
    no: 'NLV20260101-DEMO03',
    name: '皇家奶茶老街',
    name_tw: '皇家奶茶老街',
    summary: '一条飘着奶茶香的老街,奶龙居民排队买限定口味的地方。',
    summary_tw: '一條飄著奶茶香的老街,奶龍居民排隊買限定口味的地方。',
    description:
      '老街不长,却挤满了奶茶铺子和手作摊位。每日 14:00 推出当日限定口味,售完即止。老街午后限流,请听从向导安排分批入场。',
    description_tw:
      '老街不長,卻擠滿了奶茶鋪子和手作攤位。每日 14:00 推出當日限定口味,售完即止。老街午後限流,請聽從嚮導安排分批入場。',
    type: 'food',
    open_state: 'limited',
    checkin_points: '老街牌坊\n奶茶博物馆\n限定杯套摊位',
    checkin_points_tw: '老街牌坊\n奶茶博物館\n限定杯套攤位',
    sort_order: 2,
  },
];

const ARTICLE_SEEDS = [
  {
    no: 'NLH20260101-DEMO01',
    title: '奶龙节的由来',
    title_tw: '奶龍節的由來',
    summary: '每年秋天,岛上会举办奶龙节,感谢一整年的相遇与贴贴。',
    summary_tw: '每年秋天,島上會舉辦奶龍節,感謝一整年的相遇與貼貼。',
    body:
      '奶龙节在奶龙国是最热闹的日子。传说第一位登岛的旅客在秋天的夜里给奶龙讲了一个故事,奶龙听完笑了一整晚。从那以后,每年秋天岛民都会聚在一起讲故事、分甜点,把这份开心续下去。',
    body_tw:
      '奶龍節在奶龍國是最熱鬧的日子。傳說第一位登島的旅客在秋天的夜裡給奶龍講了一個故事,奶龍聽完笑了一整晚。從那以後,每年秋天島民都會聚在一起講故事、分甜點,把這份開心續下去。',
    type: 'festival',
  },
  {
    no: 'NLH20260101-DEMO02',
    title: '岛民的三件小习俗',
    title_tw: '島民的三件小習俗',
    summary: '出门前摸一下门框,喝奶茶前先闻一闻,回家路上和路灯打招呼。',
    summary_tw: '出門前摸一下門框,喝奶茶前先聞一聞,回家路上和路燈打招呼。',
    body:
      '奶龙岛的习俗都很小,却让日子变得有滋味。岛民相信,摸门框是把家里的好心情带出门,闻奶茶是给这一杯留下记忆,和路灯打招呼则是谢谢它照亮回家的路。',
    body_tw:
      '奶龍島的習俗都很小,卻讓日子變得有滋味。島民相信,摸門框是把家裡的好心情帶出門,聞奶茶是給這一杯留下記憶,和路燈打招呼則是謝謝它照亮回家的路。',
    type: 'folk',
  },
  {
    no: 'NLH20260101-DEMO03',
    title: '奶龙国的四季',
    title_tw: '奶龍國的四季',
    summary: '奶龙国只有三种天气:晴天、糖霜天,和想赖床的雨天。',
    summary_tw: '奶龍國只有三種天氣:晴天、糖霜天,和想賴床的雨天。',
    body:
      '奶龙国的春天开满棉花糖花,夏天海风带着奶茶味,秋天是奶龙节的季节,冬天偶尔会降下薄薄的糖霜。无论哪个季节上岛,都记得带一件薄外套,岛上的晚风比想象中凉。',
    body_tw:
      '奶龍國的春天開滿棉花糖花,夏天海風帶著奶茶味,秋天是奶龍節的季節,冬天偶爾會降下薄薄的糖霜。無論哪個季節上島,都記得帶一件薄外套,島上的晚風比想像中涼。',
    type: 'world',
  },
];

const BADGE_SEEDS = [
  {
    no: 'NLB20260101-DEMO01',
    code: 'first_checkin',
    name: '初次打卡',
    name_tw: '初次打卡',
    description: '在任一景点完成第一次打卡。',
    description_tw: '在任一景點完成第一次打卡。',
    icon: 'StarIcon',
    threshold: 1,
    sort_order: 0,
  },
  {
    no: 'NLB20260101-DEMO02',
    code: 'checkin_5',
    name: '打卡达人',
    name_tw: '打卡達人',
    description: '累计打卡 5 次。',
    description_tw: '累計打卡 5 次。',
    icon: 'TrophyIcon',
    threshold: 5,
    sort_order: 1,
  },
  {
    no: 'NLB20260101-DEMO03',
    code: 'checkin_10',
    name: '环岛旅人',
    name_tw: '環島旅人',
    description: '累计打卡 10 次。',
    description_tw: '累計打卡 10 次。',
    icon: 'CompassIcon',
    threshold: 10,
    sort_order: 2,
  },
];

function seedTourism() {
  const ts = now();
  const run = db.transaction(() => {
    // --- permissions -------------------------------------------------------
    const insertPermission = db.prepare(
      `INSERT OR IGNORE INTO permissions (key, name, name_tw, description, description_tw, grp)
       VALUES (@key, @name, @name_tw, @description, @description_tw, @grp)`
    );
    for (const p of TOUR_PERMISSIONS) insertPermission.run(p);

    // Rows created earlier without the Traditional value get it filled once.
    const fillPermissionTw = db.prepare(
      `UPDATE permissions SET name_tw = ?, description_tw = ?
       WHERE key = ? AND (name_tw IS NULL OR name_tw = '')`
    );
    for (const p of TOUR_PERMISSIONS) fillPermissionTw.run(p.name_tw, p.description_tw, p.key);

    const grantToRole = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
       SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
    );
    // admin always owns every tour:* permission, even on pre-existing databases.
    for (const p of TOUR_PERMISSIONS) grantToRole.run('admin', p.key);
    grantToRole.run('user', 'tour:portal');

    // --- 旅游署管理员 role --------------------------------------------------
    if (!db.prepare('SELECT id FROM roles WHERE key = ?').get(TOUR_ROLE.key)) {
      db.prepare(
        'INSERT INTO roles (key, name, name_tw, description, description_tw, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(TOUR_ROLE.key, TOUR_ROLE.name, TOUR_ROLE.name_tw, TOUR_ROLE.description, TOUR_ROLE.description_tw, ts);
    }
    db.prepare(
      "UPDATE roles SET name_tw = ? WHERE key = ? AND (name_tw IS NULL OR name_tw = '')"
    ).run(TOUR_ROLE.name_tw, TOUR_ROLE.key);
    db.prepare(
      "UPDATE roles SET description_tw = ? WHERE key = ? AND (description_tw IS NULL OR description_tw = '')"
    ).run(TOUR_ROLE.description_tw, TOUR_ROLE.key);
    for (const p of TOUR_PERMISSIONS) grantToRole.run(TOUR_ROLE.key, p.key);

    // --- service card on the portal home -----------------------------------
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, name_tw, description, description_tw, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES (@key, @name, @name_tw, @description, @description_tw, @url, @icon, @color, @required_permission, 'internal_sso', 1, @sort_order, @ts, @ts)`
    ).run({ ...SERVICE_CARD, ts });
    db.prepare(
      `UPDATE services SET name_tw = ?, description_tw = ?
       WHERE key = ? AND (name_tw IS NULL OR name_tw = '')`
    ).run(SERVICE_CARD.name_tw, SERVICE_CARD.description_tw, SERVICE_CARD.key);

    // --- rule configuration -------------------------------------------------
    const insertConfig = db.prepare('INSERT OR IGNORE INTO tour_config (key, value, updated_at) VALUES (?, ?, ?)');
    insertConfig.run('tour.daily_limit', '10', ts);
    insertConfig.run('tour.site_daily_limit', '500', ts);

    // --- demo attractions / articles / badges -------------------------------
    const insertAttraction = db.prepare(
      `INSERT OR IGNORE INTO tour_attractions
       (no, name, name_tw, summary, summary_tw, description, description_tw, type, open_state, status,
        checkin_points, checkin_points_tw, sort_order, created_at, updated_at)
       VALUES (@no, @name, @name_tw, @summary, @summary_tw, @description, @description_tw, @type, @open_state, 'online',
        @checkin_points, @checkin_points_tw, @sort_order, @ts, @ts)`
    );
    for (const row of ATTRACTION_SEEDS) insertAttraction.run({ ...row, ts });

    const insertArticle = db.prepare(
      `INSERT OR IGNORE INTO tour_articles
       (no, title, title_tw, summary, summary_tw, body, body_tw, type, status, published_at, created_at, updated_at)
       VALUES (@no, @title, @title_tw, @summary, @summary_tw, @body, @body_tw, @type, 'published', @ts, @ts, @ts)`
    );
    for (const row of ARTICLE_SEEDS) insertArticle.run({ ...row, ts });

    const insertBadge = db.prepare(
      `INSERT OR IGNORE INTO tour_badges
       (no, code, name, name_tw, description, description_tw, icon, threshold, enabled, sort_order, created_at, updated_at)
       VALUES (@no, @code, @name, @name_tw, @description, @description_tw, @icon, @threshold, 1, @sort_order, @ts, @ts)`
    );
    for (const row of BADGE_SEEDS) insertBadge.run({ ...row, ts });
  });
  run();
}