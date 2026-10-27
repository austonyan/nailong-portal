// 奶龙国皇家教育与科学署 — schema, seeds and RBAC wiring.
//
// Fully additive module (same contract as the other offices): it owns only
// edu_* tables plus INSERT-only additions to the shared permissions / roles /
// services registries, so parallel service workstreams stay untouched.
import { db, now } from '../db.js';
import { ensureTwColumns } from '../migrate.js';
import { makeNo, setSetting } from './util.js';

let ensured = false;

export function ensureEducationSchema() {
  if (ensured) return;
  ensured = true;
  db.exec(`
  CREATE TABLE IF NOT EXISTS edu_categories (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    code           TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    name_tw        TEXT,
    description    TEXT NOT NULL DEFAULT '',
    description_tw TEXT,
    enabled        INTEGER NOT NULL DEFAULT 1,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  -- 词条:draft → pending_review → published → offline(下架后可重新上线)
  -- 驳回把 pending_review 退回 draft,审核意见记在 review_note。
  CREATE TABLE IF NOT EXISTS edu_entries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    no             TEXT NOT NULL UNIQUE,
    category_code  TEXT NOT NULL DEFAULT 'WORLD',
    title          TEXT NOT NULL,
    title_tw       TEXT,
    summary        TEXT NOT NULL DEFAULT '',
    summary_tw     TEXT,
    body           TEXT NOT NULL DEFAULT '',
    body_tw        TEXT,
    tags           TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_review', 'published', 'offline')),
    view_count     INTEGER NOT NULL DEFAULT 0,
    favorite_count INTEGER NOT NULL DEFAULT 0,
    review_note    TEXT NOT NULL DEFAULT '',
    submitted_at   TEXT,
    reviewed_at    TEXT,
    reviewed_by    INTEGER REFERENCES users(id),
    published_at   TEXT,
    offline_at     TEXT,
    created_by     INTEGER REFERENCES users(id),
    updated_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_edu_entries_status ON edu_entries (status, deleted_at);
  CREATE INDEX IF NOT EXISTS idx_edu_entries_cat ON edu_entries (category_code);

  -- 关联词条(有向保存,读侧双向展示)
  CREATE TABLE IF NOT EXISTS edu_entry_links (
    entry_id   INTEGER NOT NULL REFERENCES edu_entries(id) ON DELETE CASCADE,
    related_id INTEGER NOT NULL REFERENCES edu_entries(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, related_id)
  );

  -- 科普文章:与词条同一套状态机与审核队列结构
  CREATE TABLE IF NOT EXISTS edu_articles (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    no             TEXT NOT NULL UNIQUE,
    title          TEXT NOT NULL,
    title_tw       TEXT,
    summary        TEXT NOT NULL DEFAULT '',
    summary_tw     TEXT,
    body           TEXT NOT NULL DEFAULT '',
    body_tw        TEXT,
    tags           TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_review', 'published', 'offline')),
    view_count     INTEGER NOT NULL DEFAULT 0,
    favorite_count INTEGER NOT NULL DEFAULT 0,
    review_note    TEXT NOT NULL DEFAULT '',
    submitted_at   TEXT,
    reviewed_at    TEXT,
    reviewed_by    INTEGER REFERENCES users(id),
    published_at   TEXT,
    offline_at     TEXT,
    created_by     INTEGER REFERENCES users(id),
    updated_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_edu_articles_status ON edu_articles (status, deleted_at);

  CREATE TABLE IF NOT EXISTS edu_favorites (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('entry', 'article')),
    target_id   INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE (user_id, target_type, target_id)
  );
  CREATE INDEX IF NOT EXISTS idx_edu_fav_user ON edu_favorites (user_id, target_type);

  -- 阅读历史:打开已发布详情落一条(标题快照,内容下架后历史仍可读)
  CREATE TABLE IF NOT EXISTS edu_read_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('entry', 'article')),
    target_id   INTEGER NOT NULL,
    target_no   TEXT NOT NULL DEFAULT '',
    title       TEXT NOT NULL DEFAULT '',
    title_tw    TEXT,
    read_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_edu_read_user ON edu_read_history (user_id, read_at);

  -- 学习任务:MVP 只做阅读打卡
  CREATE TABLE IF NOT EXISTS edu_tasks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    no             TEXT NOT NULL UNIQUE,
    code           TEXT NOT NULL UNIQUE,
    title          TEXT NOT NULL,
    title_tw       TEXT,
    description    TEXT NOT NULL DEFAULT '',
    description_tw TEXT,
    kind           TEXT NOT NULL DEFAULT 'reading' CHECK (kind IN ('reading')),
    target_count   INTEGER NOT NULL DEFAULT 3,
    badge_code     TEXT NOT NULL DEFAULT '',
    badge_name     TEXT NOT NULL DEFAULT '',
    badge_name_tw  TEXT,
    status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS edu_task_records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id      INTEGER NOT NULL REFERENCES edu_tasks(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    progress     INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
    completed_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    UNIQUE (task_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_edu_task_rec_status ON edu_task_records (status);

  -- 成就徽章:本署独立实现,不复用其他署的徽章表
  CREATE TABLE IF NOT EXISTS edu_badges (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    name_tw     TEXT,
    source_type TEXT NOT NULL DEFAULT 'task',
    source_id   INTEGER,
    granted_at  TEXT NOT NULL,
    UNIQUE (user_id, code)
  );

  CREATE TABLE IF NOT EXISTS edu_reviews (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type   TEXT NOT NULL CHECK (target_type IN ('entry', 'article')),
    target_id     INTEGER NOT NULL,
    target_no     TEXT NOT NULL DEFAULT '',
    action        TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
    note          TEXT NOT NULL DEFAULT '',
    reviewer_id   INTEGER REFERENCES users(id),
    reviewer_name TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_edu_reviews_target ON edu_reviews (target_type, target_id);

  CREATE TABLE IF NOT EXISTS edu_audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER REFERENCES users(id),
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_edu_audit_action ON edu_audit_logs (action);

  CREATE TABLE IF NOT EXISTS edu_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `);

  ensureTwColumns(db, 'edu_categories', ['name', 'description']);
  ensureTwColumns(db, 'edu_entries', ['title', 'summary', 'body']);
  ensureTwColumns(db, 'edu_articles', ['title', 'summary', 'body']);
  ensureTwColumns(db, 'edu_tasks', ['title', 'description', 'badge_name']);
  ensureTwColumns(db, 'edu_badges', ['name']);
  ensureTwColumns(db, 'edu_read_history', ['title']);
  seedEducation();
}

// ---------------------------------------------------------------------------
// Seeds — idempotent, INSERT OR IGNORE everywhere.
// ---------------------------------------------------------------------------

const EDU_PERMISSIONS = [
  {
    key: 'edu:portal',
    name: '教育与科学署访问',
    description: '浏览百科词条、科普文章与学习任务',
    grp: 'education',
  },
  {
    key: 'edu:review',
    name: '内容审核',
    description: '审核百科词条与科普文章的发布申请(仅审核队列,不含内容管理)',
    grp: 'education',
  },
  {
    key: 'edu:manage',
    name: '教育与科学署管理',
    description: '词条、文章、任务、统计与审计管理',
    grp: 'education',
  },
];

const CATEGORIES = [
  {
    code: 'WORLD',
    name: '奶龙世界观',
    nameTw: '奶龍世界觀',
    description: '奶龙岛的传说、地理与居民',
    descriptionTw: '奶龍島的傳說、地理與居民',
  },
  {
    code: 'SCIENCE',
    name: '自然科普',
    nameTw: '自然科普',
    description: '岛上的动植物与自然现象',
    descriptionTw: '島上的動植物與自然現象',
  },
  {
    code: 'LIFE',
    name: '生活常识',
    nameTw: '生活常識',
    description: '日常生活里的小知识',
    descriptionTw: '日常生活裡的小知識',
  },
  {
    code: 'HISTORY',
    name: '岛上历史',
    nameTw: '島上歷史',
    description: '奶龙国的编年趣事',
    descriptionTw: '奶龍國的編年趣事',
  },
];

const DEMO_ENTRIES = [
  {
    categoryCode: 'WORLD',
    title: '奶龙的彩虹瀑布',
    titleTw: '奶龍的彩虹瀑布',
    summary: '岛中央那道每天午后都会出现七色的瀑布,是奶龙国最受欢迎的打卡地。',
    summaryTw: '島中央那道每天午後都會出現七色的瀑布,是奶龍國最受歡迎的打卡地。',
    body:
      '彩虹瀑布位于奶龙岛正中央,水源来自山顶的云朵湖。每天午后阳光斜照,水雾里会析出一道完整的七色光带,从瀑布顶端一直铺到潭面。\n\n' +
      '岛上的居民相信,在瀑布前安静站满三分钟,当天的心情就会像彩虹一样明亮。瀑布潭不允许游泳,但可以在下游的浅滩踩水。',
    bodyTw:
      '彩虹瀑布位於奶龍島正中央,水源來自山頂的雲朵湖。每天午後陽光斜照,水霧裡會析出一道完整的七色光帶,從瀑布頂端一直鋪到潭面。\n\n' +
      '島上的居民相信,在瀑布前安靜站滿三分鐘,當天的心情就會像彩虹一樣明亮。瀑布潭不允許游泳,但可以在下游的淺灘踩水。',
    tags: '瀑布,彩虹,打卡',
  },
  {
    categoryCode: 'SCIENCE',
    title: '会唱歌的薄荷草',
    titleTw: '會唱歌的薄荷草',
    summary: '风吹过薄荷草地时会发出清脆的音阶声,原因藏在叶片的形状里。',
    summaryTw: '風吹過薄荷草地時會發出清脆的音階聲,原因藏在葉片的形狀裡。',
    body:
      '奶龙岛东岸的薄荷草叶片边缘有一圈细小的缺口,风穿过时缺口会像哨子一样发声。叶片越长,音调越低,所以一片草地听上去像一支会呼吸的乐队。\n\n' +
      '观察小提示:清晨露水未干时声音最清楚,正午风大时反而听不清单个音阶。',
    bodyTw:
      '奶龍島東岸的薄荷草葉片邊緣有一圈細小的缺口,風穿過時缺口會像哨子一樣發聲。葉片越長,音調越低,所以一片草地聽上去像一支會呼吸的樂隊。\n\n' +
      '觀察小提示:清晨露水未乾時聲音最清楚,正午風大時反而聽不清單個音階。',
    tags: '植物,声音,观察',
  },
  {
    categoryCode: 'LIFE',
    title: '奶龙岛的时间是怎么算的',
    titleTw: '奶龍島的時間是怎麼算的',
    summary: '岛上不用时区,而是用太阳照到灯塔的时刻来对表。',
    summaryTw: '島上不用時區,而是用太陽照到燈塔的時刻來對錶。',
    body:
      '奶龙岛只有一座灯塔,每天太阳第一次照到塔顶的时刻被记作「零点」,之后按小时递推。所以岛民说的「早上七点」,其实是指太阳照到灯塔后第七个小时。\n\n' +
      '灯塔看守人每天会在塔下的小黑板上写下当天的零点,想对表的居民路过时看一眼就行。',
    bodyTw:
      '奶龍島只有一座燈塔,每天太陽第一次照到塔頂的時刻被記作「零點」,之後按小時遞推。所以島民說的「早上七點」,其實是指太陽照到燈塔後第七個小時。\n\n' +
      '燈塔看守人每天會在塔下的小黑板上寫下當天的零點,想對錶的居民路過時看一眼就行。',
    tags: '时间,灯塔,日常',
  },
];

const DEMO_ARTICLES = [
  {
    title: '为什么岛上的云是棉花糖味',
    titleTw: '為什麼島上的雲是棉花糖味',
    summary: '不是真的糖,而是海风把岸边甘蔗花的香气带上了天空。',
    summaryTw: '不是真的糖,而是海風把岸邊甘蔗花的香氣帶上了天空。',
    body:
      '奶龙岛西南岸有一片甘蔗花田,花期时花朵会释放带甜味的挥发性物质。海风把这些分子带到高空,遇到云层里的水汽后附着在云滴表面,于是云看起来就带着一股甜甜的味道。\n\n' +
      '科普小实验:用喷雾瓶在花田上风处喷一点水,再闻一闻下风处的空气,可以闻到类似的淡甜味。',
    bodyTw:
      '奶龍島西南岸有一片甘蔗花田,花期時花朵會釋放帶甜味的揮發性物質。海風把這些分子帶到高空,遇到雲層裡的水汽後附著在雲滴表面,於是雲看起來就帶著一股甜甜的味道。\n\n' +
      '科普小實驗:用噴霧瓶在花田上風處噴一點水,再聞一聞下風處的空氣,可以聞到類似的淡甜味。',
    tags: '云,气味,实验',
  },
  {
    title: '潮汐与月亮的小秘密',
    titleTw: '潮汐與月亮的小秘密',
    summary: '奶龙岛一天有两次涨潮,间隔大约十二小时二十五分。',
    summaryTw: '奶龍島一天有兩次漲潮,間隔大約十二小時二十五分。',
    body:
      '潮汐主要由月球的引力造成。月球绕地球公转,地球自转一圈的时间里,同一片海岸会两次经过高潮区,所以大多数海岸一天有两次涨潮。\n\n' +
      '观察方法:在固定位置插一根木尺,每天同一时刻记录水位,坚持一周就能画出自己的潮汐曲线。',
    bodyTw:
      '潮汐主要由月球的引力造成。月球繞地球公轉,地球自轉一圈的時間裡,同一片海岸會兩次經過高潮區,所以大多數海岸一天有兩次漲潮。\n\n' +
      '觀察方法:在固定位置插一根木尺,每天同一時刻記錄水位,堅持一週就能畫出自己的潮汐曲線。',
    tags: '潮汐,月亮,记录',
  },
];

const DEMO_TASKS = [
  {
    code: 'READ3',
    title: '阅读打卡·初阶',
    titleTw: '閱讀打卡·初階',
    description: '读满 3 篇已发布的词条或文章,即可获得「阅读小达人」徽章。',
    descriptionTw: '讀滿 3 篇已發布的詞條或文章,即可獲得「閱讀小達人」徽章。',
    targetCount: 3,
    badgeCode: 'READER3',
    badgeName: '阅读小达人',
    badgeNameTw: '閱讀小達人',
  },
  {
    code: 'READ5',
    title: '阅读打卡·进阶',
    titleTw: '閱讀打卡·進階',
    description: '读满 5 篇已发布的词条或文章,即可获得「博览群书」徽章。',
    descriptionTw: '讀滿 5 篇已發布的詞條或文章,即可獲得「博覽群書」徽章。',
    targetCount: 5,
    badgeCode: 'READER5',
    badgeName: '博览群书',
    badgeNameTw: '博覽群書',
  },
];

function seedEducation() {
  const ts = now();
  const run = db.transaction(() => {
    // --- permissions -------------------------------------------------------
    const insertPermission = db.prepare(
      'INSERT OR IGNORE INTO permissions (key, name, description, grp) VALUES (@key, @name, @description, @grp)'
    );
    for (const p of EDU_PERMISSIONS) insertPermission.run(p);

    const grantToRole = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
       SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
    );
    // admin always owns every edu:* permission, even on pre-existing databases.
    for (const p of EDU_PERMISSIONS) grantToRole.run('admin', p.key);
    grantToRole.run('user', 'edu:portal');

    // --- 内容审核员:门户 + 审核队列(与词条/文章管理隔离) -------------------
    const reviewer = db.prepare('SELECT id FROM roles WHERE key = ?').get('edu_reviewer');
    if (!reviewer) {
      db.prepare(
        'INSERT INTO roles (key, name, name_tw, description, description_tw, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(
        'edu_reviewer',
        '内容审核员',
        '內容審核員',
        '皇家教育与科学署审核员:审核词条与文章的发布申请(仅审核队列,与内容管理隔离)',
        '皇家教育與科學署審核員:審核詞條與文章的發布申請(僅審核佇列,與內容管理隔離)',
        ts
      );
    }
    grantToRole.run('edu_reviewer', 'portal:access');
    grantToRole.run('edu_reviewer', 'edu:portal');
    grantToRole.run('edu_reviewer', 'edu:review');

    const eduAdmin = db.prepare('SELECT id FROM roles WHERE key = ?').get('edu_admin');
    if (!eduAdmin) {
      db.prepare(
        'INSERT INTO roles (key, name, name_tw, description, description_tw, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(
        'edu_admin',
        '教育与科学署管理员',
        '教育與科學署管理員',
        '皇家教育与科学署管理:词条、文章、任务、统计与审计',
        '皇家教育與科學署管理:詞條、文章、任務、統計與稽核',
        ts
      );
    }
    for (const p of EDU_PERMISSIONS) grantToRole.run('edu_admin', p.key);

    // --- service card on the portal home -----------------------------------
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, name_tw, description, description_tw, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('education', '奶龙国皇家教育与科学署', '奶龍國皇家教育與科學署',
               '世界观百科、科普专题与阅读学习任务', '世界觀百科、科普專題與閱讀學習任務',
               '/education', 'BulbIcon', 'app-blue', 'edu:portal', 'internal_sso', 1, -7, ?, ?)`
    ).run(ts, ts);

    // --- numbering prefixes ------------------------------------------------
    setSetting('entry_no_prefix', 'NEE');
    setSetting('article_no_prefix', 'NEA');
    setSetting('task_no_prefix', 'NET');

    // --- categories --------------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM edu_categories').get().n === 0) {
      const insertCategory = db.prepare(
        `INSERT INTO edu_categories (code, name, name_tw, description, description_tw, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @nameTw, @description, @descriptionTw, 1, @sortOrder, @ts, @ts)`
      );
      CATEGORIES.forEach((c, index) => insertCategory.run({ ...c, sortOrder: index, ts }));
    }

    // --- demo entries (published, bilingual) -------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM edu_entries').get().n === 0) {
      const insertEntry = db.prepare(
        `INSERT INTO edu_entries
         (no, category_code, title, title_tw, summary, summary_tw, body, body_tw, tags, status,
          published_at, created_at, updated_at)
         VALUES (@no, @categoryCode, @title, @titleTw, @summary, @summaryTw, @body, @bodyTw, @tags, 'published',
                 @ts, @ts, @ts)`
      );
      const ids = DEMO_ENTRIES.map((entry) =>
        Number(insertEntry.run({ ...entry, no: makeNo('NEE'), ts }).lastInsertRowid)
      );
      if (ids.length >= 2) {
        const link = db.prepare('INSERT OR IGNORE INTO edu_entry_links (entry_id, related_id) VALUES (?, ?)');
        link.run(ids[0], ids[1]);
        link.run(ids[1], ids[0]);
      }
    }

    // --- demo articles -----------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM edu_articles').get().n === 0) {
      const insertArticle = db.prepare(
        `INSERT INTO edu_articles
         (no, title, title_tw, summary, summary_tw, body, body_tw, tags, status, published_at, created_at, updated_at)
         VALUES (@no, @title, @titleTw, @summary, @summaryTw, @body, @bodyTw, @tags, 'published', @ts, @ts, @ts)`
      );
      for (const article of DEMO_ARTICLES) insertArticle.run({ ...article, no: makeNo('NEA'), ts });
    }

    // --- demo tasks --------------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM edu_tasks').get().n === 0) {
      const insertTask = db.prepare(
        `INSERT INTO edu_tasks
         (no, code, title, title_tw, description, description_tw, kind, target_count,
          badge_code, badge_name, badge_name_tw, status, created_at, updated_at)
         VALUES (@no, @code, @title, @titleTw, @description, @descriptionTw, 'reading', @targetCount,
                 @badgeCode, @badgeName, @badgeNameTw, 'active', @ts, @ts)`
      );
      for (const task of DEMO_TASKS) insertTask.run({ ...task, no: makeNo('NET'), ts });
    }
  });
  run();
}