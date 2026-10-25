import { Router } from 'express';
import { db, now, loadUserAccess, countOtherActiveAdmins } from '../db.js';
import { authenticate, requirePermission, hashPassword, publicUser } from '../auth.js';
import { badRequest, notFound, forbidden, conflict } from '../http.js';

const router = Router();
router.use(authenticate);

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw badRequest('WEAK_PASSWORD', 'Password must be 8-72 characters');
  }
}

function resolveRoleIds(roleKeys) {
  if (roleKeys === undefined) return null;
  if (!Array.isArray(roleKeys)) throw badRequest('VALIDATION_ERROR', 'roleKeys must be an array');
  const ids = [];
  const stmt = db.prepare('SELECT id FROM roles WHERE key = ?');
  for (const key of roleKeys) {
    const row = stmt.get(String(key));
    if (!row) throw badRequest('VALIDATION_ERROR', `Unknown role: ${key}`);
    ids.push(row.id);
  }
  return ids;
}

function setRoles(userId, roleIds) {
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
    for (const id of roleIds) {
      db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, id);
    }
  });
  replace();
}

// GET /api/users — paged list with roles.
router.get('/', requirePermission('users:read'), (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const query = typeof req.query.query === 'string' ? req.query.query.trim() : '';
  const like = `%${query}%`;
  const where = query
    ? "WHERE username LIKE ? OR display_name LIKE ? OR IFNULL(email, '') LIKE ?"
    : '';
  const args = query ? [like, like, like] : [];

  const total = db.prepare(`SELECT COUNT(*) AS n FROM users ${where}`).get(...args).n;
  const rows = db
    .prepare(`SELECT id FROM users ${where} ORDER BY id LIMIT ? OFFSET ?`)
    .all(...args, pageSize, (page - 1) * pageSize);
  res.json({ items: rows.map((r) => publicUser(loadUserAccess(r.id))), total, page, pageSize });
});

router.post('/', requirePermission('users:write'), (req, res) => {
  const body = req.body || {};
  if (!USERNAME_RE.test(String(body.username || ''))) {
    throw badRequest('VALIDATION_ERROR', 'Username must be 3-32 chars of letters, digits, _ or -');
  }
  assertPassword(body.password);
  const displayName = String(body.displayName || body.username).trim().slice(0, 40);
  const email = body.email ? String(body.email).trim() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('VALIDATION_ERROR', 'Invalid email');
  }
  const roleIds = resolveRoleIds(body.roleKeys) ?? [db.prepare('SELECT id FROM roles WHERE key = ?').get('user').id];

  const create = db.transaction(() => {
    const ts = now();
    const info = db
      .prepare(
        'INSERT INTO users (username, display_name, email, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(body.username, displayName, email, hashPassword(body.password), 'active', ts, ts);
    for (const id of roleIds) {
      db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(info.lastInsertRowid, id);
    }
    return info.lastInsertRowid;
  });

  if (db.prepare('SELECT id FROM users WHERE username = ?').get(body.username)) {
    throw conflict('USERNAME_TAKEN', 'Username already exists');
  }
  const userId = create();
  res.status(201).json({ user: publicUser(loadUserAccess(userId)) });
});

router.patch('/:id', requirePermission('users:write'), (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) throw notFound('User not found');

  const body = req.body || {};
  const updates = [];
  const params = [];

  if (body.displayName !== undefined) {
    const displayName = String(body.displayName).trim().slice(0, 40);
    if (!displayName) throw badRequest('VALIDATION_ERROR', 'Display name cannot be empty');
    updates.push('display_name = ?');
    params.push(displayName);
  }
  if (body.email !== undefined) {
    const email = String(body.email).trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw badRequest('VALIDATION_ERROR', 'Invalid email');
    }
    updates.push('email = ?');
    params.push(email || null);
  }
  if (body.password !== undefined) {
    assertPassword(body.password);
    updates.push('password_hash = ?');
    params.push(hashPassword(body.password));
  }
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'disabled') {
      throw badRequest('VALIDATION_ERROR', 'status must be active or disabled');
    }
    if (id === req.user.id && body.status !== 'active') {
      throw forbidden('SELF_LOCKOUT', 'You cannot disable your own account');
    }
    if (body.status === 'disabled' && countOtherActiveAdmins(id) === 0 && isAdmin(target.id)) {
      throw forbidden('LAST_ADMIN', 'Cannot disable the last active admin');
    }
    updates.push('status = ?');
    params.push(body.status);
  }

  const roleIds = resolveRoleIds(body.roleKeys);
  if (roleIds !== null) {
    if (id === req.user.id) {
      throw forbidden('SELF_LOCKOUT', 'You cannot change your own roles');
    }
    const hadAdmin = isAdmin(id);
    const keepsAdmin = roleIds.includes(db.prepare("SELECT id FROM roles WHERE key = 'admin'").get().id);
    if (hadAdmin && !keepsAdmin && countOtherActiveAdmins(id) === 0) {
      throw forbidden('LAST_ADMIN', 'Cannot remove the last admin role');
    }
  }

  const apply = db.transaction(() => {
    if (updates.length) {
      updates.push('updated_at = ?');
      params.push(now(), id);
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    } else if (roleIds !== null) {
      db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(now(), id);
    }
    if (roleIds !== null) setRoles(id, roleIds);
  });
  apply();

  res.json({ user: publicUser(loadUserAccess(id)) });
});

router.delete('/:id', requirePermission('users:write'), (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) throw forbidden('SELF_LOCKOUT', 'You cannot delete your own account');
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) throw notFound('User not found');
  if (target.status === 'active' && isAdmin(id) && countOtherActiveAdmins(id) === 0) {
    throw forbidden('LAST_ADMIN', 'Cannot delete the last active admin');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id); // sessions/roles cascade
  res.json({ ok: true });
});

function isAdmin(userId) {
  return !!db
    .prepare(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.key = 'admin'`
    )
    .get(userId);
}

export default router;
