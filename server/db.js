import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NAILONG_DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'nailong.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL DEFAULT '',
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  grp         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  jti        TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS services (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  key                 TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  url                 TEXT NOT NULL,
  icon                TEXT NOT NULL DEFAULT 'RocketIcon',
  color               TEXT NOT NULL DEFAULT 'app-teal',
  required_permission TEXT,
  entry_mode          TEXT NOT NULL DEFAULT 'external' CHECK (entry_mode IN ('external', 'internal', 'internal_sso')),
  enabled             INTEGER NOT NULL DEFAULT 1,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 奶龍國簽註申請署 (visa service)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visa_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  guide       TEXT NOT NULL DEFAULT '',
  stay_days   INTEGER NOT NULL DEFAULT 30,
  valid_days  INTEGER NOT NULL DEFAULT 90,
  renewable   INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- 申请状态机: draft → pending_review → (approved | rejected | supplement_required)
--   supplement_required → (补件) pending_review; 超时 → closed
--   approved → (签发) issued; pending_review/supplement_required → withdrawn (用户撤销)
CREATE TABLE IF NOT EXISTS visa_applications (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  app_no               TEXT NOT NULL UNIQUE,
  user_id              INTEGER NOT NULL REFERENCES users(id),
  type_code            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending_review','supplement_required','approved','rejected','withdrawn','closed','issued')),
  nickname             TEXT NOT NULL DEFAULT '',
  contact              TEXT NOT NULL DEFAULT '',
  virtual_id           TEXT NOT NULL DEFAULT '',
  purpose              TEXT NOT NULL DEFAULT '',
  plan_arrive          TEXT,
  plan_leave           TEXT,
  itinerary            TEXT NOT NULL DEFAULT '',
  inviter_name         TEXT NOT NULL DEFAULT '',
  inviter_contact      TEXT NOT NULL DEFAULT '',
  companions           TEXT NOT NULL DEFAULT '',
  entertainment_agreed INTEGER NOT NULL DEFAULT 0,
  supplement_note      TEXT NOT NULL DEFAULT '',
  supplement_deadline  TEXT,
  reject_code          TEXT,
  reject_comment       TEXT,
  review_stage         TEXT NOT NULL DEFAULT 'initial' CHECK (review_stage IN ('initial','review')),
  decided_by           INTEGER,
  decided_at           TEXT,
  issued_at            TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  submitted_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_visa_app_user ON visa_applications (user_id, status);
CREATE INDEX IF NOT EXISTS idx_visa_app_status ON visa_applications (status, submitted_at);

CREATE TABLE IF NOT EXISTS visa_materials (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES visa_applications(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('avatar','invitation','proof','other')),
  origin         TEXT NOT NULL DEFAULT 'initial' CHECK (origin IN ('initial','supplement')),
  filename       TEXT NOT NULL,
  mime           TEXT NOT NULL,
  size           INTEGER NOT NULL,
  path           TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visa_reviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES visa_applications(id) ON DELETE CASCADE,
  reviewer_id    INTEGER NOT NULL,
  reviewer_name  TEXT NOT NULL DEFAULT '',
  action         TEXT NOT NULL CHECK (action IN ('approve','reject','require_supplement','issue','void','mark_used')),
  reason_code    TEXT,
  comment        TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);

-- 签发状态机: valid → (used 入境署回写 | voided 注销 | expired 到期, 惰性判定)
CREATE TABLE IF NOT EXISTS visa_permits (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  visa_no        TEXT NOT NULL UNIQUE,
  application_id INTEGER NOT NULL UNIQUE REFERENCES visa_applications(id),
  user_id        INTEGER NOT NULL,
  type_code      TEXT NOT NULL,
  holder_name    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','used','expired','voided')),
  verify_token   TEXT NOT NULL UNIQUE,
  issued_at      TEXT NOT NULL,
  valid_until    TEXT NOT NULL,
  remind_sent    INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visa_permit_user ON visa_permits (user_id, status);

CREATE TABLE IF NOT EXISTS visa_messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  application_id INTEGER,
  type           TEXT NOT NULL DEFAULT 'system',
  params         TEXT NOT NULL DEFAULT '{}',
  read           INTEGER NOT NULL DEFAULT 0,
  archived       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visa_msg_user ON visa_messages (user_id, archived, read);

CREATE TABLE IF NOT EXISTS visa_notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','policy','event')),
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visa_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER,
  actor_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id   TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visa_verify_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  query      TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  result     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visa_blacklist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id),
  reason     TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visa_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Lightweight migration for databases created before a schema change. Only
// additive column changes live here — new tables are covered by CREATE above.
function migrate() {
  const serviceCols = db.pragma('table_info(services)').map((c) => c.name);
  if (!serviceCols.includes('entry_mode')) {
    db.exec("ALTER TABLE services ADD COLUMN entry_mode TEXT NOT NULL DEFAULT 'external'");
  }
}
migrate();

export const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Seed: permissions, roles, the initial admin account and a few demo services.
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  { key: 'portal:access', name: '门户访问', description: '登录后访问门户的基础权限', grp: 'portal' },
  { key: 'users:read', name: '用户查看', description: '查看用户列表与详情', grp: 'users' },
  { key: 'users:write', name: '用户管理', description: '创建、编辑、停用与删除用户', grp: 'users' },
  { key: 'roles:read', name: '角色查看', description: '查看角色与权限定义', grp: 'roles' },
  { key: 'roles:write', name: '角色管理', description: '创建、编辑角色并分配权限', grp: 'roles' },
  { key: 'services:read', name: '服务查看', description: '查看全部服务注册信息(含未启用)', grp: 'services' },
  { key: 'services:write', name: '服务管理', description: '注册、编辑、启停与删除服务', grp: 'services' },
  { key: 'visa:apply', name: '签注申请', description: '提交与查看签注申请', grp: 'visa' },
  { key: 'visa:review', name: '签注审核', description: '审核签注申请、签发与管理签注', grp: 'visa' },
  { key: 'visa:manage', name: '签注管理', description: '管理签注类型、公告、配置与风控', grp: 'visa' },
];

const ROLES = [
  { key: 'admin', name: '管理员', description: '拥有全部权限的系统角色', is_system: 1, permissions: '*' },
  { key: 'user', name: '普通用户', description: '默认角色,可访问门户与申请签注', is_system: 1, permissions: ['portal:access', 'visa:apply'] },
  { key: 'visa_reviewer', name: '签注审核员', description: '审核签注申请并签发电子签注(队列隔离,不含门户管理)', is_system: 1, permissions: ['portal:access', 'visa:apply', 'visa:review'] },
  { key: 'visa_admin', name: '签注管理员', description: '签注审核与签注配置管理', is_system: 1, permissions: ['portal:access', 'visa:apply', 'visa:review', 'visa:manage'] },
];

function seed() {
  const insertPermission = db.prepare(
    'INSERT OR IGNORE INTO permissions (key, name, description, grp) VALUES (@key, @name, @description, @grp)'
  );
  const insertRole = db.prepare(
    'INSERT OR IGNORE INTO roles (key, name, description, is_system, created_at) VALUES (@key, @name, @description, @is_system, @now)'
  );
  const insertRolePermission = db.prepare(
    'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE key = ?'
  );

  const run = db.transaction(() => {
    for (const p of PERMISSIONS) insertPermission.run(p);

    for (const role of ROLES) {
      const created = insertRole.run({ ...role, now: now() });
      const roleId =
        created.changes > 0
          ? db.prepare('SELECT id FROM roles WHERE key = ?').get(role.key).id
          : db.prepare('SELECT id FROM roles WHERE key = ?').get(role.key)?.id;
      if (!roleId) continue;
      // Backfill on every boot so existing databases pick up newly added
      // permissions for system roles (e.g. visa:apply for the user role).
      const keys = role.permissions === '*' ? PERMISSIONS.map((p) => p.key) : role.permissions;
      for (const key of keys) insertRolePermission.run(roleId, key);
    }

    if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
      const password = process.env.ADMIN_PASSWORD || 'admin123';
      if (!process.env.ADMIN_PASSWORD) {
        console.warn('[nailong] 未设置 ADMIN_PASSWORD,已使用默认密码创建管理员 admin / admin123 —— 请尽快修改!');
      }
      const ts = now();
      const info = db
        .prepare(
          "INSERT INTO users (username, display_name, password_hash, status, created_at, updated_at) VALUES ('admin', '站长', ?, 'active', ?, ?)"
        )
        .run(bcrypt.hashSync(password, 10), ts, ts);
      const adminRole = db.prepare('SELECT id FROM roles WHERE key = ?').get('admin');
      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(info.lastInsertRowid, adminRole.id);
    }

    if (db.prepare('SELECT COUNT(*) AS n FROM services').get().n === 0) {
      const insertService = db.prepare(
        `INSERT INTO services (key, name, description, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
         VALUES (@key, @name, @description, @url, @icon, @color, @required_permission, @entry_mode, 1, @sort_order, @now, @now)`
      );
      [
        { key: 'wiki', name: '奶龙图鉴', description: '奶龙世界观的百科与图鉴', url: 'https://example.com/wiki', icon: 'BookIcon', color: 'app-yellow', sort_order: 0 },
        { key: 'workshop', name: '礼物工坊', description: '给岛上的朋友们准备礼物', url: 'https://example.com/workshop', icon: 'GiftIcon', color: 'app-pink', sort_order: 1 },
        { key: 'weather', name: '岛屿天气', description: '查看今天的岛屿天气与流星雨预报', url: 'https://example.com/weather', icon: 'CloudIcon', color: 'app-blue', sort_order: 2 },
      ].forEach((s) => insertService.run({ ...s, required_permission: null, entry_mode: 'external', now: now() }));
    }

    // The visa service is part of this codebase: make sure it always exists,
    // even on databases that already carry the demo services above.
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, description, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('visa', '奶龍國簽註申請署', '办理奶龙国旅游签注:申请、审核、签发与验真', '/visa', 'AirplaneIcon', 'app-teal', 'visa:apply', 'internal_sso', 1, -1, @now, @now)`
    ).run({ now: now() });

    if (db.prepare('SELECT COUNT(*) AS n FROM visa_types').get().n === 0) {
      const insertType = db.prepare(
        `INSERT INTO visa_types (code, name, description, guide, stay_days, valid_days, renewable, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @description, @guide, @stay_days, @valid_days, @renewable, 1, @sort_order, @now, @now)`
      );
      insertType.run({
        code: 'TOURIST',
        name: '旅游签注',
        description: '来奶龙国观光、度假、打卡奶龙雕像的最经典签注',
        guide:
          '适用于以观光游览为目的进入奶龙国的旅行者。单次停留最长 30 天,签发后 90 天内有效,不可续签(娱乐设定)。需准备:头像照片、行程说明;邀请函为选填。',
        stay_days: 30,
        valid_days: 90,
        renewable: 0,
        sort_order: 0,
        now: now(),
      });
      // 后续开放的类型先落库但停用,前台不展示
      [
        { code: 'FAMILY', name: '探亲签注', description: '探望在奶龙国定居的亲友', stay_days: 60, valid_days: 120 },
        { code: 'EVENT', name: '活动签注', description: '参加奶龙节、演唱会等活动', stay_days: 14, valid_days: 60 },
        { code: 'DIPLOMATIC', name: '外交签注', description: '仅限各国奶龙友好使团', stay_days: 90, valid_days: 180 },
      ].forEach((t, i) =>
        insertType.run({
          ...t,
          guide: '',
          renewable: 0,
          sort_order: i + 1,
          now: now(),
        })
      );
      db.prepare("UPDATE visa_types SET enabled = 0 WHERE code != 'TOURIST'").run();
    }

    if (db.prepare('SELECT COUNT(*) AS n FROM visa_notices').get().n === 0) {
      const insertNotice = db.prepare(
        `INSERT INTO visa_notices (title, body, level, enabled, created_at, updated_at)
         VALUES (@title, @body, @level, 1, @now, @now)`
      );
      insertNotice.run({
        title: '旅游签注开放申请',
        body: '奶龍國簽註申請署现已开放旅游签注(TOURIST)在线申请,审核预计 72 小时内完成。本平台为虚构娱乐项目,不核验真实身份。',
        level: 'policy',
        now: now(),
      });
      insertNotice.run({
        title: '谨防冒充办证诈骗',
        body: '本署办证完全免费,任何收费办证、承诺"现实效力"的行为均为诈骗。签注仅在奶龙国虚构世界内使用。',
        level: 'info',
        now: now(),
      });
    }

    const defaults = {
      'visa.app_no_prefix': 'NLA',
      'visa.visa_no_prefix': 'NLT',
      'visa.supplement_days': '7',
      'visa.review_hours_hint': '72',
      'visa.verify_limit_per_5min': '30',
    };
    const insertConfig = db.prepare('INSERT OR IGNORE INTO visa_config (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(defaults)) insertConfig.run(k, v);
  });
  run();
}
seed();

// Fresh user projection (roles + permission keys) straight from the database,
// used by the auth middleware so RBAC changes apply immediately.
export function loadUserAccess(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const roles = db
    .prepare(
      `SELECT r.id, r.key, r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ? ORDER BY r.id`
    )
    .all(userId);
  const permissions = db
    .prepare(
      `SELECT DISTINCT p.key FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`
    )
    .all(userId)
    .map((r) => r.key);
  return { ...user, roles, permissions };
}

export function countOtherActiveAdmins(excludeUserId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.key = 'admin' AND u.status = 'active' AND u.id != ?`
    )
    .get(excludeUserId).n;
}
