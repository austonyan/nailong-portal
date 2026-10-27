// 奶龙国皇家统计署 — schema, seeds and RBAC wiring.
//
// Fully additive: this module owns stat_* tables only. Cross-office figures
// are read with COUNT(*) against tables owned by the other offices; nothing
// outside stat_* is written and no row-level (person-identifying) data is ever
// exposed by the API.
import { db, now } from '../db.js';
import { ensureTwColumns } from '../migrate.js';

let ensured = false;

export function ensureStatsSchema() {
  if (ensured) return;
  ensured = true;
  db.exec(`
  -- 统计口径(指标目录): 名称/说明/口径简繁成对,来源署 + 只读来源表。
  -- 指标值一律在读取时按 COUNT(*) 现算,不落冗余汇总快照。
  CREATE TABLE IF NOT EXISTS stat_metrics (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    name_tw       TEXT,
    description   TEXT NOT NULL DEFAULT '',
    description_tw TEXT,
    formula       TEXT NOT NULL DEFAULT '',
    formula_tw    TEXT,
    source_office TEXT NOT NULL DEFAULT 'stats',
    table_name    TEXT NOT NULL DEFAULT '',
    status_value  TEXT,
    enabled       INTEGER NOT NULL DEFAULT 1,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_stat_metrics_order ON stat_metrics (deleted_at, sort_order);

  -- 个人年度报告:生成时间 + 快照 JSON(聚合数字,不含可识别个人的明细)。
  CREATE TABLE IF NOT EXISTS stat_reports (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    no           TEXT NOT NULL UNIQUE,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    year         INTEGER NOT NULL,
    snapshot     TEXT NOT NULL DEFAULT '{}',
    generated_at TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    UNIQUE (user_id, year)
  );
  CREATE INDEX IF NOT EXISTS idx_stat_reports_user ON stat_reports (user_id, year);

  -- 导出留痕:谁、何时、导出了哪些指标、多少行。
  CREATE TABLE IF NOT EXISTS stat_export_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id     INTEGER REFERENCES users(id),
    actor_name   TEXT NOT NULL DEFAULT '',
    metric_codes TEXT NOT NULL DEFAULT '',
    row_count    INTEGER NOT NULL DEFAULT 0,
    detail       TEXT NOT NULL DEFAULT '{}',
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stat_export_actor ON stat_export_logs (actor_id, created_at);

  CREATE TABLE IF NOT EXISTS stat_audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER REFERENCES users(id),
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stat_audit_action ON stat_audit_logs (action, created_at);

  CREATE TABLE IF NOT EXISTS stat_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `);

  ensureTwColumns(db, 'stat_metrics', ['name', 'description', 'formula']);
  seedStats();
}

// ---------------------------------------------------------------------------
// Seeds — idempotent, INSERT OR IGNORE everywhere.
// ---------------------------------------------------------------------------

const STAT_PERMISSIONS = [
  {
    key: 'stat:portal',
    name: '统计署访问',
    nameTw: '統計署存取',
    description: '查看平台趣味统计并生成自己的年度报告',
    descriptionTw: '檢視平台趣味統計並產生自己的年度報告',
    grp: 'stats',
  },
  {
    key: 'stat:manage',
    name: '统计署管理',
    nameTw: '統計署管理',
    description: '平台总看板、统计口径管理、数据导出与审计查看',
    descriptionTw: '平台總看板、統計口徑管理、資料匯出與稽核檢視',
    grp: 'stats',
  },
];

// 演示口径:名称/说明/口径说明均成对双语。值在读取时现算。
const SEED_METRICS = [
  {
    code: 'users_total',
    name: '注册用户数',
    nameTw: '註冊使用者數',
    description: '已激活的门户账号总数',
    descriptionTw: '已啟用的入口網站帳號總數',
    formula: '统计 users 表中状态为 active 的账号数,不含已停用账号。',
    formulaTw: '統計 users 表中狀態為 active 的帳號數,不含已停用帳號。',
    sourceOffice: 'portal',
    tableName: 'users',
    statusValue: 'active',
    sortOrder: 0,
  },
  {
    code: 'visa_issued',
    name: '签注签发量',
    nameTw: '簽註簽發量',
    description: '皇家签注申请署累计签发的电子签注数',
    descriptionTw: '皇家簽註申請署累計簽發的電子簽註數',
    formula: '统计 visa_permits 表的全部签发记录,含已使用、已过期与已作废签注。',
    formulaTw: '統計 visa_permits 表的全部簽發紀錄,含已使用、已過期與已作廢簽註。',
    sourceOffice: 'visa',
    tableName: 'visa_permits',
    statusValue: null,
    sortOrder: 1,
  },
  {
    code: 'entries_total',
    name: '通关入境量',
    nameTw: '通關入境量',
    description: '皇家口岸入境署记录的累计入境次数',
    descriptionTw: '皇家口岸入境署紀錄的累計入境次數',
    formula: '统计 im_entry_records 中未删除的入境记录,不含已作废记录。',
    formulaTw: '統計 im_entry_records 中未刪除的入境紀錄,不含已作廢紀錄。',
    sourceOffice: 'immigration',
    tableName: 'im_entry_records',
    statusValue: null,
    sortOrder: 2,
  },
  {
    code: 'events_total',
    name: '活动发布量',
    nameTw: '活動發布量',
    description: '礼宾与活动署发布过的活动总数',
    descriptionTw: '禮賓與活動署發布過的活動總數',
    formula: '统计 pro_events 中未删除的活动,含草稿之外的全部状态。',
    formulaTw: '統計 pro_events 中未刪除的活動,含草稿之外的全部狀態。',
    sourceOffice: 'protocol',
    tableName: 'pro_events',
    statusValue: null,
    sortOrder: 3,
  },
  {
    code: 'badges_awarded',
    name: '徽章发放量',
    nameTw: '徽章發放量',
    description: '文化旅游署累计发放的成就徽章数',
    descriptionTw: '文化旅遊署累計發放的成就徽章數',
    formula: '统计 tour_badges 表的全部发放记录;文化旅游署并入前显示为不可用。',
    formulaTw: '統計 tour_badges 表的全部發放紀錄;文化旅遊署併入前顯示為不可用。',
    sourceOffice: 'tourism',
    tableName: 'tour_badges',
    statusValue: null,
    sortOrder: 4,
  },
  {
    code: 'knowledge_entries',
    name: '百科词条数',
    nameTw: '百科詞條數',
    description: '教育与科学署已发布的百科词条数',
    descriptionTw: '教育與科學署已發布的百科詞條數',
    formula: '统计 edu_entries 中状态为 published 且未删除的词条。',
    formulaTw: '統計 edu_entries 中狀態為 published 且未刪除的詞條。',
    sourceOffice: 'education',
    tableName: 'edu_entries',
    statusValue: 'published',
    sortOrder: 5,
  },
  {
    code: 'checkins_total',
    name: '景点打卡量',
    nameTw: '景點打卡量',
    description: '文化旅游署记录的全部景点打卡次数',
    descriptionTw: '文化旅遊署紀錄的全部景點打卡次數',
    formula: '统计 tour_checkins 表的全部打卡记录;文化旅游署并入前显示为不可用。',
    formulaTw: '統計 tour_checkins 表的全部打卡紀錄;文化旅遊署併入前顯示為不可用。',
    sourceOffice: 'tourism',
    tableName: 'tour_checkins',
    statusValue: null,
    sortOrder: 6,
  },
  {
    code: 'residents_total',
    name: '居民登记量',
    nameTw: '居民登記量',
    description: '皇家居民登记署累计登记的居民数',
    descriptionTw: '皇家居民登記署累計登記的居民數',
    formula: '统计 res_residents 表的全部居民记录。',
    formulaTw: '統計 res_residents 表的全部居民紀錄。',
    sourceOffice: 'resident',
    tableName: 'res_residents',
    statusValue: null,
    sortOrder: 7,
  },
  {
    code: 'docs_certificates',
    name: '认证文书签发量',
    nameTw: '認證文書簽發量',
    description: '文书与认证署累计签发的认证文书数',
    descriptionTw: '文書與認證署累計簽發的認證文書數',
    formula: '统计 doc_certificates 表的全部签发记录,含补发与已吊销文书。',
    formulaTw: '統計 doc_certificates 表的全部簽發紀錄,含補發與已吊銷文書。',
    sourceOffice: 'docs',
    tableName: 'doc_certificates',
    statusValue: null,
    sortOrder: 8,
  },
  {
    code: 'reports_total',
    name: '年度报告生成量',
    nameTw: '年度報告產生量',
    description: '统计署生成并保存的个人年度报告数',
    descriptionTw: '統計署產生並儲存的個人年度報告數',
    formula: '统计 stat_reports 中未删除的报告,同一用户同一年度只计一份。',
    formulaTw: '統計 stat_reports 中未刪除的報告,同一使用者同一年度只計一份。',
    sourceOffice: 'stats',
    tableName: 'stat_reports',
    statusValue: null,
    sortOrder: 9,
  },
];

const DEFAULT_CONFIG = {
  'stat.report_prefix': 'NSR',
  'stat.report_rate_per_hour': '6',
};

function seedStats() {
  const ts = now();
  const run = db.transaction(() => {
    // --- permissions + role grants (admin always owns stat:*) --------------
    const insertPermission = db.prepare(
      'INSERT OR IGNORE INTO permissions (key, name, name_tw, description, description_tw, grp) VALUES (@key, @name, @nameTw, @description, @descriptionTw, @grp)'
    );
    for (const p of STAT_PERMISSIONS) insertPermission.run(p);

    const grantToRole = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
       SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
    );
    for (const p of STAT_PERMISSIONS) grantToRole.run('admin', p.key);
    grantToRole.run('user', 'stat:portal');

    // --- 统计署管理员 role --------------------------------------------------
    if (!db.prepare('SELECT id FROM roles WHERE key = ?').get('stat_admin')) {
      db.prepare(
        'INSERT INTO roles (key, name, name_tw, description, description_tw, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(
        'stat_admin',
        '统计署管理员',
        '統計署管理員',
        '皇家统计署管理员:平台总看板、统计口径与数据导出',
        '皇家統計署管理員:平台總看板、統計口徑與資料匯出',
        ts
      );
    }
    grantToRole.run('stat_admin', 'stat:portal');
    grantToRole.run('stat_admin', 'stat:manage');

    // --- service card on the portal home -----------------------------------
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, name_tw, description, description_tw, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('stats', '奶龙国皇家统计署', '奶龍國皇家統計署', '平台趣味统计、各署总看板与个人年度报告', '平台趣味統計、各署總看板與個人年度報告', '/stats', 'StarIcon', 'app-blue', 'stat:portal', 'internal_sso', 1, -6, ?, ?)`
    ).run(ts, ts);

    // --- metric catalog (demo rows, bilingual) -----------------------------
    const insertMetric = db.prepare(
      `INSERT OR IGNORE INTO stat_metrics
         (code, name, name_tw, description, description_tw, formula, formula_tw, source_office, table_name, status_value, enabled, sort_order, created_at, updated_at)
       VALUES
         (@code, @name, @nameTw, @description, @descriptionTw, @formula, @formulaTw, @sourceOffice, @tableName, @statusValue, 1, @sortOrder, @ts, @ts)`
    );
    for (const m of SEED_METRICS) insertMetric.run({ ...m, ts });

    // 旧库补繁体(只填空值,不覆盖管理员已填内容)。
    const fillTw = db.prepare(
      `UPDATE stat_metrics SET name_tw = ?, description_tw = ?, formula_tw = ?
       WHERE code = ? AND (name_tw IS NULL OR name_tw = '')`
    );
    for (const m of SEED_METRICS) fillTw.run(m.nameTw, m.descriptionTw, m.formulaTw, m.code);

    const insertConfig = db.prepare('INSERT OR IGNORE INTO stat_config (key, value, updated_at) VALUES (?, ?, ?)');
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) insertConfig.run(k, v, ts);
  });
  run();
}