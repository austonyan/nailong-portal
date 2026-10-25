import { Router } from 'express';
import { db, now, PERMISSIONS } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, notFound, forbidden, conflict } from '../http.js';

const router = Router();
router.use(authenticate);

function roleWithPermissions(row) {
  const permissions = db
    .prepare(
      `SELECT p.key FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ? ORDER BY p.id`
    )
    .all(row.id)
    .map((r) => r.key);
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM user_roles WHERE role_id = ?').get(row.id).n;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    isSystem: !!row.is_system,
    permissions,
    userCount,
  };
}

// GET /api/roles
router.get('/', requirePermission('roles:read'), (_req, res) => {
  const rows = db.prepare('SELECT * FROM roles ORDER BY id').all();
  res.json({ items: rows.map(roleWithPermissions) });
});

// GET /api/permissions — full catalog for assignment UIs.
router.get('/permissions', requirePermission('roles:read'), (_req, res) => {
  const groups = {};
  for (const p of PERMISSIONS) {
    (groups[p.grp] ??= []).push(p);
  }
  res.json({ items: PERMISSIONS, groups });
});

router.post('/', requirePermission('roles:write'), (req, res) => {
  const body = req.body || {};
  const key = String(body.key || '').trim();
  const name = String(body.name || '').trim();
  if (!/^[a-z0-9_-]{2,32}$/.test(key)) {
    throw badRequest('VALIDATION_ERROR', 'Role key must be 2-32 chars of lowercase letters, digits, _ or -');
  }
  if (!name) throw badRequest('VALIDATION_ERROR', 'Role name is required');
  const permissionKeys = Array.isArray(body.permissions) ? body.permissions.map(String) : [];
  validatePermissionKeys(permissionKeys);

  const description = String(body.description || '').trim();
  const create = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO roles (key, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)')
      .run(key, name, description, now());
    for (const p of permissionKeys) {
      db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE key = ?').run(
        info.lastInsertRowid,
        p
      );
    }
    return info.lastInsertRowid;
  });

  if (db.prepare('SELECT id FROM roles WHERE key = ?').get(key)) {
    throw conflict('ROLE_KEY_TAKEN', 'Role key already exists');
  }
  const id = create();
  res.status(201).json({ role: roleWithPermissions(db.prepare('SELECT * FROM roles WHERE id = ?').get(id)) });
});

router.patch('/:id', requirePermission('roles:write'), (req, res) => {
  const id = Number(req.params.id);
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!role) throw notFound('Role not found');

  const body = req.body || {};
  const updates = [];
  const params = [];
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) throw badRequest('VALIDATION_ERROR', 'Role name cannot be empty');
    updates.push('name = ?');
    params.push(name);
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    params.push(String(body.description).trim());
  }

  let permissionKeys = null;
  if (body.permissions !== undefined) {
    if (role.key === 'admin') {
      throw forbidden('SYSTEM_ROLE_LOCKED', 'The admin role always keeps every permission');
    }
    permissionKeys = body.permissions.map(String);
    validatePermissionKeys(permissionKeys);
  }

  const apply = db.transaction(() => {
    if (updates.length) {
      db.prepare(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
    }
    if (permissionKeys) {
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(id);
      for (const p of permissionKeys) {
        db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE key = ?').run(
          id,
          p
        );
      }
    }
  });
  apply();
  res.json({ role: roleWithPermissions(db.prepare('SELECT * FROM roles WHERE id = ?').get(id)) });
});

router.delete('/:id', requirePermission('roles:write'), (req, res) => {
  const id = Number(req.params.id);
  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  if (!role) throw notFound('Role not found');
  if (role.is_system) throw forbidden('SYSTEM_ROLE_LOCKED', 'System roles cannot be deleted');
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM user_roles WHERE role_id = ?').get(id).n;
  if (userCount > 0) throw conflict('ROLE_IN_USE', 'Role is still assigned to users');
  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  res.json({ ok: true });
});

function validatePermissionKeys(keys) {
  const known = new Set(PERMISSIONS.map((p) => p.key));
  for (const key of keys) {
    if (!known.has(key)) throw badRequest('VALIDATION_ERROR', `Unknown permission: ${key}`);
  }
}

export default router;
