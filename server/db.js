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
  enabled             INTEGER NOT NULL DEFAULT 1,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
`);

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
];

const ROLES = [
  { key: 'admin', name: '管理员', description: '拥有全部权限的系统角色', is_system: 1, permissions: '*' },
  { key: 'user', name: '普通用户', description: '默认角色,仅可访问门户', is_system: 1, permissions: ['portal:access'] },
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
      if (created.changes > 0) {
        const roleId = db.prepare('SELECT id FROM roles WHERE key = ?').get(role.key).id;
        const keys = role.permissions === '*' ? PERMISSIONS.map((p) => p.key) : role.permissions;
        for (const key of keys) insertRolePermission.run(roleId, key);
      }
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
        `INSERT INTO services (key, name, description, url, icon, color, required_permission, enabled, sort_order, created_at, updated_at)
         VALUES (@key, @name, @description, @url, @icon, @color, NULL, 1, @sort_order, @now, @now)`
      );
      [
        { key: 'wiki', name: '奶龙图鉴', description: '奶龙世界观的百科与图鉴', url: 'https://example.com/wiki', icon: 'BookIcon', color: 'app-yellow', sort_order: 0 },
        { key: 'workshop', name: '礼物工坊', description: '给岛上的朋友们准备礼物', url: 'https://example.com/workshop', icon: 'GiftIcon', color: 'app-pink', sort_order: 1 },
        { key: 'weather', name: '岛屿天气', description: '查看今天的岛屿天气与流星雨预报', url: 'https://example.com/weather', icon: 'CloudIcon', color: 'app-blue', sort_order: 2 },
      ].forEach((s) => insertService.run({ ...s, now: now() }));
    }
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
