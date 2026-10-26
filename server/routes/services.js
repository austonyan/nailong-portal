import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, notFound } from '../http.js';

const router = Router();

const ICONS = new Set([
  'RocketIcon', 'BookIcon', 'GiftIcon', 'CloudIcon', 'StarIcon', 'HeartIcon', 'MusicIcon',
  'CoffeeIcon', 'CompassIcon', 'FlagIcon', 'LeafIcon', 'CatIcon', 'FoxIcon', 'MailIcon',
  'CalendarIcon', 'CameraIcon', 'HomeIcon', 'UsersIcon', 'ShieldIcon', 'KeyIcon',
  'SettingsIcon', 'BellIcon', 'FishIcon', 'MapIcon',
]);
const COLORS = new Set([
  'app-teal', 'app-yellow', 'app-orange', 'app-pink', 'app-blue', 'app-green',
  'purple', 'app-red', 'lime-green', 'yellow-green', 'brown', 'warm-peach-pink',
]);

function serialize(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    nameTw: row.name_tw,
    description: row.description,
    descriptionTw: row.description_tw,
    url: row.url,
    icon: row.icon,
    color: row.color,
    requiredPermission: row.required_permission,
    entryMode: row.entry_mode || 'external',
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
  };
}

// GET /api/services — portal listing for the current user: enabled services
// whose required_permission the caller holds.
router.get('/', authenticate, (req, res) => {
  const owned = new Set(req.user.permissions);
  const rows = db
    .prepare('SELECT * FROM services WHERE enabled = 1 ORDER BY sort_order, id')
    .all()
    .filter((s) => !s.required_permission || owned.has(s.required_permission));
  res.json({ items: rows.map(serialize) });
});

// GET /api/services/admin — full registry including disabled entries.
router.get('/admin', authenticate, requirePermission('services:read'), (_req, res) => {
  const rows = db.prepare('SELECT * FROM services ORDER BY sort_order, id').all();
  res.json({ items: rows.map(serialize) });
});

function validateServiceBody(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.key !== undefined) {
    const key = String(body.key || '').trim();
    if (!/^[a-z0-9_-]{2,40}$/.test(key)) {
      throw badRequest('VALIDATION_ERROR', 'Service key must be 2-40 chars of lowercase letters, digits, _ or -');
    }
    out.key = key;
  }
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw badRequest('VALIDATION_ERROR', 'Service name is required');
    out.name = name.slice(0, 40);
  }
  if (body.description !== undefined) out.description = String(body.description).trim().slice(0, 200);
  if (body.nameTw !== undefined) out.name_tw = String(body.nameTw || '').trim().slice(0, 40) || null;
  if (body.descriptionTw !== undefined) out.description_tw = String(body.descriptionTw || '').trim().slice(0, 200) || null;
  if (!partial || body.url !== undefined) {
    const url = String(body.url || '').trim();
    if (!/^https?:\/\/.+/i.test(url)) throw badRequest('VALIDATION_ERROR', 'URL must start with http(s)://');
    out.url = url;
  }
  if (body.icon !== undefined) {
    const icon = String(body.icon);
    if (!ICONS.has(icon)) throw badRequest('VALIDATION_ERROR', `Unsupported icon: ${icon}`);
    out.icon = icon;
  }
  if (body.color !== undefined) {
    const color = String(body.color);
    if (!COLORS.has(color)) throw badRequest('VALIDATION_ERROR', `Unsupported color: ${color}`);
    out.color = color;
  }
  if (body.requiredPermission !== undefined) {
    const perm = body.requiredPermission ? String(body.requiredPermission) : null;
    if (perm && !db.prepare('SELECT id FROM permissions WHERE key = ?').get(perm)) {
      throw badRequest('VALIDATION_ERROR', `Unknown permission: ${perm}`);
    }
    out.requiredPermission = perm;
  }
  if (body.entryMode !== undefined) {
    const mode = String(body.entryMode);
    if (!['external', 'internal', 'internal_sso'].includes(mode)) {
      throw badRequest('VALIDATION_ERROR', `Unsupported entry mode: ${mode}`);
    }
    out.entry_mode = mode;
  }
  if (body.enabled !== undefined) out.enabled = body.enabled ? 1 : 0;
  if (body.sortOrder !== undefined) out.sortOrder = Number(body.sortOrder) || 0;
  return out;
}

router.post('/', authenticate, requirePermission('services:write'), (req, res) => {
  const data = validateServiceBody(req.body || {});
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO services (key, name, name_tw, description, description_tw, url, icon, color, required_permission, enabled, sort_order, created_at, updated_at)
       VALUES (@key, @name, @name_tw, @description, @description_tw, @url, @icon, @color, @requiredPermission, @enabled, @sortOrder, @ts, @ts)`
    )
    .run({
      description: '',
      name_tw: null,
      description_tw: null,
      icon: 'RocketIcon',
      color: 'app-teal',
      requiredPermission: null,
      enabled: 1,
      sortOrder: 0,
      ...data,
      ts,
    });
  res.status(201).json({ service: serialize(db.prepare('SELECT * FROM services WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/:id', authenticate, requirePermission('services:write'), (req, res) => {
  const row = db.prepare('SELECT * FROM services WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Service not found');
  const data = validateServiceBody(req.body || {}, { partial: true });
  const cols = Object.keys(data);
  if (cols.length) {
    const assignments = cols.map((c) => `${c} = @${c}`).join(', ');
    db.prepare(`UPDATE services SET ${assignments}, updated_at = @ts WHERE id = @id`).run({
      ...data,
      ts: now(),
      id: row.id,
    });
  }
  res.json({ service: serialize(db.prepare('SELECT * FROM services WHERE id = ?').get(row.id)) });
});

router.delete('/:id', authenticate, requirePermission('services:write'), (req, res) => {
  const row = db.prepare('SELECT id FROM services WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Service not found');
  db.prepare('DELETE FROM services WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

export default router;
