import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureTwColumns } from './migrate.js';

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
  name_tw     TEXT,
  description TEXT NOT NULL DEFAULT '',
  description_tw TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_tw     TEXT,
  description TEXT NOT NULL DEFAULT '',
  description_tw TEXT,
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

-- One-off portal facts (first-run setup marker, etc.). Written by the server
-- only; there is no admin UI for editing these keys.
CREATE TABLE IF NOT EXISTS app_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  key                 TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  name_tw             TEXT,
  description         TEXT NOT NULL DEFAULT '',
  description_tw      TEXT,
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

-- 跨署自动审批设置:每个业务署一行,缺省视为 off。
-- delay_minutes 在 immediate/off 下也保留,方便来回切换不丢值。
CREATE TABLE IF NOT EXISTS service_auto_approve (
  service_key   TEXT PRIMARY KEY,
  mode          TEXT NOT NULL DEFAULT 'off' CHECK (mode IN ('off', 'immediate', 'delayed')),
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  updated_by    TEXT NOT NULL DEFAULT '',
  updated_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 奶龍國簽註申請署 (visa service)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS visa_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  name_tw     TEXT,
  description TEXT NOT NULL DEFAULT '',
  description_tw TEXT,
  guide       TEXT NOT NULL DEFAULT '',
  guide_tw    TEXT,
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
  title_tw   TEXT,
  body       TEXT NOT NULL DEFAULT '',
  body_tw    TEXT,
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

// ---------------------------------------------------------------------------
// 奶龍國皇家申訴與監察署 (appeal service) — 申诉/复核/投诉建议/工单/决定书
// 申诉状态机: draft → pending_accept → (accepted | rejected | withdrawn)
//   accepted ⇄ processing; accepted/processing → supplement_required → processing | closed(超时)
//   accepted/processing → resolved(维持/撤销/变更/转交)
// 复核状态机: pending → reviewing → completed(一次终局)
// 投诉建议: pending_accept → processing → replied → closed
// 工单: pending ⇄ processing → replied → closed | escalated
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS appeal_appeals (
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
);
CREATE INDEX IF NOT EXISTS idx_appeal_app_user ON appeal_appeals (user_id, status);
CREATE INDEX IF NOT EXISTS idx_appeal_app_status ON appeal_appeals (status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_appeal_app_dup ON appeal_appeals (user_id, biz_type, biz_code);

CREATE TABLE IF NOT EXISTS appeal_materials (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('appeal','review','complaint','ticket')),
  owner_id   INTEGER NOT NULL,
  user_id    INTEGER NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('screenshot','proof','other')),
  origin     TEXT NOT NULL DEFAULT 'initial' CHECK (origin IN ('initial','supplement')),
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  path       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appeal_mat_owner ON appeal_materials (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_appeal_mat_user ON appeal_materials (user_id);

CREATE TABLE IF NOT EXISTS appeal_reviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,
  appeal_id       INTEGER NOT NULL REFERENCES appeal_appeals(id),
  appeal_code     TEXT NOT NULL,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  reason          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewing','completed')),
  decision_type   TEXT CHECK (decision_type IN ('maintain','undo','change')),
  decision_reason TEXT NOT NULL DEFAULT '',
  decided_id      INTEGER,
  decided_name    TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  submitted_at    TEXT,
  decided_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_appeal_rev_appeal ON appeal_reviews (appeal_id);
CREATE INDEX IF NOT EXISTS idx_appeal_rev_user ON appeal_reviews (user_id, status);

CREATE TABLE IF NOT EXISTS appeal_complaints (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  kind          TEXT NOT NULL CHECK (kind IN ('complaint','suggestion')),
  category      TEXT NOT NULL CHECK (category IN ('attitude','process','notice','staff','system','other','feature','experience','content')),
  anonymous     INTEGER NOT NULL DEFAULT 0,
  content       TEXT NOT NULL DEFAULT '',
  contact       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending_accept' CHECK (status IN ('pending_accept','processing','replied','closed')),
  reply         TEXT,
  replied_id    INTEGER,
  replied_name  TEXT NOT NULL DEFAULT '',
  replied_at    TEXT,
  rating        INTEGER,
  rating_comment TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  submitted_at  TEXT,
  closed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_appeal_cmp_user ON appeal_complaints (user_id, status);

CREATE TABLE IF NOT EXISTS appeal_tickets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  category    TEXT NOT NULL CHECK (category IN ('consult','account','bug')),
  priority    TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','replied','closed','escalated')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  submitted_at TEXT,
  closed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_appeal_tkt_user ON appeal_tickets (user_id, status);

CREATE TABLE IF NOT EXISTS appeal_ticket_replies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id  INTEGER NOT NULL REFERENCES appeal_tickets(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL,
  is_staff   INTEGER NOT NULL DEFAULT 0,
  staff_name TEXT NOT NULL DEFAULT '',
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appeal_tkt_rep ON appeal_ticket_replies (ticket_id);

CREATE TABLE IF NOT EXISTS appeal_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK (target_type IN ('appeal','review','complaint','ticket')),
  target_id   INTEGER NOT NULL,
  actor_id    INTEGER,
  actor_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  comment     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appeal_rec_target ON appeal_records (target_type, target_id);

CREATE TABLE IF NOT EXISTS appeal_decisions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,
  appeal_id    INTEGER NOT NULL REFERENCES appeal_appeals(id),
  appeal_code  TEXT NOT NULL,
  review_id    INTEGER REFERENCES appeal_reviews(id),
  review_code  TEXT NOT NULL DEFAULT '',
  user_id      INTEGER NOT NULL REFERENCES users(id),
  biz_type     TEXT NOT NULL,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('maintain','undo','change','transfer')),
  reason       TEXT NOT NULL DEFAULT '',
  basis        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','voided','expired')),
  effective_at TEXT NOT NULL,
  voided_at    TEXT,
  verify_token TEXT NOT NULL UNIQUE,
  cert_code    TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appeal_dec_user ON appeal_decisions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_appeal_dec_appeal ON appeal_decisions (appeal_id);

CREATE TABLE IF NOT EXISTS appeal_notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  title_tw   TEXT,
  body       TEXT NOT NULL DEFAULT '',
  body_tw    TEXT,
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','policy','event')),
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appeal_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  target_type TEXT,
  target_id   INTEGER,
  type        TEXT NOT NULL DEFAULT 'system',
  params      TEXT NOT NULL DEFAULT '{}',
  read        INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appeal_msg_user ON appeal_messages (user_id, archived, read);

CREATE TABLE IF NOT EXISTS appeal_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER,
  actor_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id   TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appeal_verify_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  query      TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  result     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appeal_blacklist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id),
  scope      TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('appeal','complaint','all')),
  reason     TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appeal_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appeal_publicity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  title_tw    TEXT,
  body        TEXT NOT NULL DEFAULT '',
  body_tw     TEXT,
  kind        TEXT NOT NULL DEFAULT 'case' CHECK (kind IN ('stats','case','report')),
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','offline')),
  published_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appeal_msg_templates (
  type    TEXT PRIMARY KEY,
  title   TEXT NOT NULL,
  body    TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS appeal_inspect_reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'quality' CHECK (kind IN ('quality','anomaly','consistency')),
  content    TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`);

// Lightweight migration for databases created before a schema change. Only
// additive column changes live here — new tables are covered by CREATE above.
function migrate() {
  const serviceCols = db.pragma('table_info(services)').map((c) => c.name);
  if (!serviceCols.includes('entry_mode')) {
    db.exec("ALTER TABLE services ADD COLUMN entry_mode TEXT NOT NULL DEFAULT 'external'");
  }
  ensureTwColumns(db, 'services', ['name', 'description']);
  ensureTwColumns(db, 'roles', ['name', 'description']);
  ensureTwColumns(db, 'permissions', ['name', 'description']);
  ensureTwColumns(db, 'visa_types', ['name', 'description', 'guide']);
  ensureTwColumns(db, 'visa_notices', ['title', 'body']);
  ensureTwColumns(db, 'appeal_notices', ['title', 'body']);
  ensureTwColumns(db, 'appeal_publicity', ['title', 'body']);
}
migrate();

export const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// First-run setup state. `setup.completed_at` is a one-way latch: once it is
// set (by the setup wizard, by ADMIN_PASSWORD seeding, or by a boot that finds
// an existing admin in a pre-setup database), /setup stays closed forever.
// ---------------------------------------------------------------------------
export const SETUP_COMPLETED_KEY = 'setup.completed_at';
export const SETUP_ADMIN_KEY = 'setup.admin_username';

export function isSetupComplete() {
  return !!db.prepare('SELECT 1 FROM app_meta WHERE key = ?').get(SETUP_COMPLETED_KEY);
}

export function markSetupComplete(adminUsername) {
  const ts = now();
  const stmt = db.prepare('INSERT OR REPLACE INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)');
  stmt.run(SETUP_COMPLETED_KEY, ts, ts);
  if (adminUsername) stmt.run(SETUP_ADMIN_KEY, adminUsername, ts);
  return ts;
}

// ---------------------------------------------------------------------------
// Seed: permissions, roles, optional env-driven admin and demo services.
// A fresh database intentionally starts with NO users — the first admin comes
// from the /setup wizard. Setting ADMIN_PASSWORD keeps the old non-interactive
// bootstrap path for deployments and acceptance scripts.
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
  { key: 'appeal:apply', name: '申诉监察访问', description: '提交与查看申诉、复核、投诉建议与工单', grp: 'appeal' },
  { key: 'appeal:process', name: '申诉处理', description: '受理、分派、补件与处理决定;处理投诉建议与工单', grp: 'appeal' },
  { key: 'appeal:review', name: '申诉复核', description: '复核申诉处理决定(一次终局)', grp: 'appeal' },
  { key: 'appeal:inspect', name: '监察抽查', description: '监察申诉处理时效与质量(只读分析)', grp: 'appeal' },
  { key: 'appeal:manage', name: '申诉署管理', description: '公告、公示、模板、黑名单、配置、统计与审计', grp: 'appeal' },
];

const ROLES = [
  { key: 'admin', name: '管理员', description: '拥有全部权限的系统角色', is_system: 1, permissions: '*' },
  { key: 'user', name: '普通用户', description: '默认角色,可访问门户、申请签注与提交申诉', is_system: 1, permissions: ['portal:access', 'visa:apply', 'appeal:apply'] },
  { key: 'visa_reviewer', name: '签注审核员', description: '审核签注申请并签发电子签注(队列隔离,不含门户管理)', is_system: 1, permissions: ['portal:access', 'visa:apply', 'visa:review'] },
  { key: 'visa_admin', name: '签注管理员', description: '签注审核与签注配置管理', is_system: 1, permissions: ['portal:access', 'visa:apply', 'visa:review', 'visa:manage'] },
  { key: 'appeal_processor', name: '申诉处理员', description: '受理与处理申诉、投诉建议与工单(队列隔离)', is_system: 1, permissions: ['portal:access', 'appeal:apply', 'appeal:process'] },
  { key: 'appeal_reviewer', name: '申诉复核员', description: '复核申诉处理决定(一次终局,队列隔离)', is_system: 1, permissions: ['portal:access', 'appeal:apply', 'appeal:process', 'appeal:review'] },
  { key: 'appeal_inspector', name: '申诉监察员', description: '监察申诉处理时效与质量(只读,队列隔离)', is_system: 1, permissions: ['portal:access', 'appeal:apply', 'appeal:inspect'] },
  { key: 'appeal_admin', name: '申诉署管理员', description: '申诉署全部权限:处理、复核、监察与管理', is_system: 1, permissions: ['portal:access', 'appeal:apply', 'appeal:process', 'appeal:review', 'appeal:inspect', 'appeal:manage'] },
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

    // Non-interactive bootstrap is opt-in: without ADMIN_PASSWORD a fresh
    // database stays userless and the SPA sends the operator to /setup.
    if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0 && process.env.ADMIN_PASSWORD) {
      const ts = now();
      const info = db
        .prepare(
          "INSERT INTO users (username, display_name, password_hash, status, created_at, updated_at) VALUES ('admin', '站长', ?, 'active', ?, ?)"
        )
        .run(bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10), ts, ts);
      const adminRole = db.prepare('SELECT id FROM roles WHERE key = ?').get('admin');
      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(info.lastInsertRowid, adminRole.id);
      console.log('[nailong] 已通过 ADMIN_PASSWORD 创建初始管理员 admin，首次启动引导已跳过。');
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
          '适用于以观光游览为目的进入奶龙国的旅行者。单次停留最长 30 天,签发后 90 天内有效,不可续签。需准备:头像照片、行程说明;邀请函为选填。',
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
        body: '奶龍國簽註申請署现已开放旅游签注(TOURIST)在线申请,审核预计 72 小时内完成。',
        level: 'policy',
        now: now(),
      });
      insertNotice.run({
        title: '谨防冒充办证诈骗',
        body: '本署办证完全免费,任何收费办证的行为均为诈骗。',
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

    // The appeal service is part of this codebase: make sure it always exists.
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, description, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('appeal', '奶龍國皇家申訴與監察署', '结果申诉、复核申请、投诉建议、工单客服与决定书验真', '/appeal', 'ShieldIcon', 'app-yellow', 'appeal:apply', 'internal_sso', 1, -2, @now, @now)`
    ).run({ now: now() });

    if (db.prepare('SELECT COUNT(*) AS n FROM appeal_notices').get().n === 0) {
      const insertNotice = db.prepare(
        `INSERT INTO appeal_notices (title, body, level, enabled, created_at, updated_at)
         VALUES (@title, @body, @level, 1, @now, @now)`
      );
      insertNotice.run({
        title: '申诉受理范围与时效说明',
        body: '本署受理对签注、入境、居民登记、外交身份、文书认证五类业务结果不服提起的结果申诉,以及已处理申诉的复核申请。申诉提交后约 48 小时内受理,复核为一次终局。',
        level: 'policy',
        now: now(),
      });
      insertNotice.run({
        title: '谨防冒充申诉诈骗',
        body: '本署受理申诉与复核完全免费,不收取任何费用,也不承诺任何现实效力。任何"收费加急""保证撤销原结果"的行为均为诈骗。',
        level: 'info',
        now: now(),
      });
    }

    if (db.prepare('SELECT COUNT(*) AS n FROM appeal_msg_templates').get().n === 0) {
      const insertTpl = db.prepare('INSERT INTO appeal_msg_templates (type, title, body) VALUES (?, ?, ?)');
      [
        ['appeal_submitted', '申诉 {{code}} 已提交', '你的申诉已进入待受理队列,请耐心等待受理通知。'],
        ['appeal_accepted', '申诉 {{code}} 已受理', '你的申诉已被受理,将按处理时限推进,处理结果将以决定书形式通知。'],
        ['appeal_accept_rejected', '申诉 {{code}} 不予受理', '受理说明:{{reason}}。可在复核时效内对处理结果申请复核。'],
        ['appeal_supplement_required', '申诉 {{code}} 需要补件', '补件说明:{{comment}}。请在 {{deadline}} 前在线补交,逾期申诉将自动关闭。'],
        ['appeal_supplemented', '申诉 {{code}} 补件已提交', '你补交的材料已随申诉重新进入处理流程。'],
        ['appeal_resolved', '申诉 {{code}} 已有处理决定', '处理决定已生成决定书,可到"我的决定书"查看、下载或验真。'],
        ['appeal_withdrawn', '申诉 {{code}} 已撤回', '你已撤回该申诉。'],
        ['appeal_closed', '申诉 {{code}} 已关闭', '补件期限已过,申诉自动关闭。'],
        ['appeal_merged', '申诉 {{code}} 已合并', '该申诉与 {{targetCode}} 属重复申诉,已合并处理,请以目标申诉为准。'],
        ['appeal_reopened', '申诉 {{code}} 经复核重新处理', '复核 {{reviewCode}} 撤销了原不予受理决定,申诉已重新进入处理流程。'],
        ['review_submitted', '复核 {{code}} 已提交', '对申诉 {{appealCode}} 的复核申请已提交,复核为一次终局。'],
        ['review_accepted', '复核 {{code}} 已受理', '复核进入复核中,复核决定将生成新的决定书。'],
        ['review_completed', '复核 {{code}} 已完成', '复核决定已生成,可到"我的决定书"查看。复核为一次终局。'],
        ['decision_issued', '处理决定书 {{code}} 已生成', '关联申诉 {{appealCode}}。可在"我的决定书"查看、下载或验真。'],
        ['complaint_submitted', '投诉建议 {{code}} 已提交', '你的投诉或建议已提交,处理完成后将回复通知。'],
        ['complaint_replied', '投诉建议 {{code}} 已回复', '处理人员已回复,请到详情页查看回复内容并评价。'],
        ['complaint_closed', '投诉建议 {{code}} 已关闭', '该投诉建议已办结归档。'],
        ['complaint_escalated', '投诉建议 {{code}} 转申诉指引', '该事项适合走结果申诉流程,请准备关联业务编号后到"我要申诉"提交。'],
        ['ticket_replied', '工单 {{code}} 有新回复', '客服已回复你的工单,请到工单详情查看。'],
        ['ticket_escalated', '工单 {{code}} 已升级', '你的工单已升级处理,请留意后续回复。'],
        ['ticket_closed', '工单 {{code}} 已关闭', '工单已办结。如仍有问题可重新提交。'],
      ].forEach(([type, title, body]) => insertTpl.run(type, title, body));
    }

    const appealDefaults = {
      'appeal.appeal_prefix': 'NAA',
      'appeal.review_prefix': 'NAR',
      'appeal.complaint_prefix': 'NAC',
      'appeal.ticket_prefix': 'NAT',
      'appeal.decision_prefix': 'NAD',
      'appeal.supplement_days': '7',
      'appeal.review_days': '15',
      'appeal.accept_sla_hours': '48',
      'appeal.resolve_sla_hours': '120',
      'appeal.verify_limit_per_5min': '30',
    };
    const insertAppealConfig = db.prepare('INSERT OR IGNORE INTO appeal_config (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(appealDefaults)) insertAppealConfig.run(k, v);

    // Pre-setup databases and env-seeded installs already have an admin: latch
    // setup as completed so the wizard can never be used to take over later.
    const hasAdmin = db
      .prepare(
        `SELECT 1 FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE r.key = 'admin' LIMIT 1`
      )
      .get();
    if (hasAdmin && !isSetupComplete()) markSetupComplete();
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
