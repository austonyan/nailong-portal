import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { db, now, loadUserAccess } from '../db.js';
import {
  authenticate,
  hashPassword,
  verifyPassword,
  issueTokens,
  rotateSession,
  clearSession,
  publicUser,
  readRefreshCookie,
  JWT_SECRET,
} from '../auth.js';
import { badRequest, forbidden, unauthorized } from '../http.js';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

function assertNewPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw badRequest('WEAK_PASSWORD', 'Password must be 8-72 characters');
  }
}

function assertUsername(username) {
  if (!USERNAME_RE.test(username)) {
    throw badRequest('VALIDATION_ERROR', 'Username must be 3-32 chars of letters, digits, _ or -');
  }
}

function defaultUserRole() {
  return db.prepare('SELECT id FROM roles WHERE key = ?').get('user');
}

// POST /api/auth/register — open registration; new accounts get the default
// `user` role and can be adjusted by admins later.
router.post('/register', (req, res) => {
  const body = req.body || {};
  assertUsername(body.username);
  assertNewPassword(body.password);
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 40) : '';
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('VALIDATION_ERROR', 'Invalid email');
  }

  const createUser = db.transaction(() => {
    const ts = now();
    const info = db
      .prepare(
        'INSERT INTO users (username, display_name, email, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(body.username, displayName || body.username, email, hashPassword(body.password), 'active', ts, ts);
    const role = defaultUserRole();
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(info.lastInsertRowid, role.id);
    return info.lastInsertRowid;
  });

  const userId = createUser();
  const user = loadUserAccess(userId);
  const accessToken = issueTokens(res, req, user);
  res.status(201).json({ accessToken, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw badRequest('VALIDATION_ERROR', 'Username and password are required');
  }
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  const user = row ? loadUserAccess(row.id) : null;
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw unauthorized('INVALID_CREDENTIALS');
  }
  if (user.status !== 'active') throw forbidden('ACCOUNT_DISABLED', 'This account has been disabled');

  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), user.id);
  user.last_login_at = now();
  const accessToken = issueTokens(res, req, user);
  res.json({ accessToken, user: publicUser(user) });
});

// Rotate the refresh token: old session row is revoked, a new pair is issued.
router.post('/refresh', (req, res) => {
  let payload;
  try {
    payload = readRefreshCookie(req);
  } catch {
    throw unauthorized('SESSION_EXPIRED');
  }
  if (!payload?.jti) throw unauthorized('SESSION_EXPIRED');

  const session = db.prepare('SELECT jti FROM sessions WHERE jti = ?').get(payload.jti);
  const user = loadUserAccess(Number(payload.sub));
  if (!session || !user || user.status !== 'active') {
    clearSession(req, res);
    throw unauthorized('SESSION_EXPIRED');
  }
  const accessToken = rotateSession(res, req, user, session.jti);
  res.json({ accessToken, user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// PATCH /api/auth/profile — self-service profile fields.
router.patch('/profile', authenticate, (req, res) => {
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
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('VALIDATION_ERROR', 'Invalid email');
      if (db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id)) {
        throw badRequest('EMAIL_TAKEN', 'Email already in use');
      }
    }
    updates.push('email = ?');
    params.push(email || null);
  }

  if (!updates.length) throw badRequest('VALIDATION_ERROR', 'Nothing to update');
  updates.push('updated_at = ?');
  params.push(now(), req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ user: publicUser(loadUserAccess(req.user.id)) });
});

// Change password; other refresh sessions are revoked (current one survives).
router.post('/change-password', authenticate, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!verifyPassword(String(oldPassword ?? ''), req.user.password_hash)) {
    throw badRequest('WRONG_PASSWORD', 'Current password is incorrect');
  }
  assertNewPassword(newPassword);

  const currentJti = (() => {
    try {
      return readRefreshCookie(req)?.jti ?? null;
    } catch {
      return null;
    }
  })();

  const update = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      now(),
      req.user.id
    );
    if (currentJti) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND jti != ?').run(req.user.id, currentJti);
    } else {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
    }
  });
  update();
  res.json({ ok: true });
});

// Token introspection for future services: they verify a portal access token
// and get the caller's identity + permission keys back.
router.post('/introspect', (req, res) => {
  const token = req.body?.token;
  if (typeof token !== 'string') throw badRequest('VALIDATION_ERROR', 'token is required');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = loadUserAccess(Number(payload.sub));
    if (!user || user.status !== 'active') {
      return res.json({ active: false });
    }
    res.json({ active: true, user: publicUser(user) });
  } catch {
    res.json({ active: false });
  }
});

export default router;
