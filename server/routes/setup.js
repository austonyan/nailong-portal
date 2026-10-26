import { Router } from 'express';
import { db, now, loadUserAccess, isSetupComplete, markSetupComplete, SETUP_COMPLETED_KEY } from '../db.js';
import { hashPassword, issueTokens, publicUser } from '../auth.js';
import { badRequest, conflict } from '../http.js';

// First-run setup. These endpoints exist only until the first admin is
// created: the completed marker is a one-way latch, so both the status probe
// and the mutation become permanently unavailable afterwards.
const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertUsername(username) {
  if (!USERNAME_RE.test(username)) {
    throw badRequest('VALIDATION_ERROR', 'Username must be 3-32 chars of letters, digits, _ or -');
  }
}

function assertDisplayName(displayName) {
  if (!displayName || displayName.length > 40) {
    throw badRequest('VALIDATION_ERROR', 'Display name is required (max 40 characters)');
  }
}

function assertEmail(email) {
  if (!email || !EMAIL_RE.test(email)) {
    throw badRequest('VALIDATION_ERROR', 'A valid email is required');
  }
}

// Stricter than open registration: the first account owns the whole portal.
function assertAdminPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw badRequest('WEAK_PASSWORD', 'Password must be 8-72 characters');
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw badRequest('WEAK_PASSWORD', 'Password must contain both letters and digits');
  }
}

function readSetupStatus() {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(SETUP_COMPLETED_KEY);
  return { required: !row, completedAt: row?.value ?? null };
}

router.get('/status', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readSetupStatus());
});

// POST /api/setup/admin — create the first administrator and close the wizard.
// Public by design, but only reachable while setup is incomplete; the marker
// check is repeated inside the transaction so concurrent submissions cannot
// both win.
router.post('/admin', (req, res) => {
  if (isSetupComplete()) throw conflict('SETUP_COMPLETE', 'Setup already completed');

  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body.password;

  assertUsername(username);
  assertDisplayName(displayName);
  assertEmail(email);
  assertAdminPassword(password);

  const create = db.transaction(() => {
    if (isSetupComplete()) throw conflict('SETUP_COMPLETE', 'Setup already completed');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
      throw badRequest('USERNAME_TAKEN', 'Username already in use');
    }
    if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(email)) {
      throw badRequest('EMAIL_TAKEN', 'Email already in use');
    }

    const ts = now();
    const info = db
      .prepare(
        'INSERT INTO users (username, display_name, email, password_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(username, displayName, email, hashPassword(password), 'active', ts, ts);

    const adminRole = db.prepare('SELECT id FROM roles WHERE key = ?').get('admin');
    if (!adminRole) throw new Error('admin role is not seeded');
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(info.lastInsertRowid, adminRole.id);

    markSetupComplete(username);
    return info.lastInsertRowid;
  });

  let userId;
  try {
    userId = create();
  } catch (err) {
    if (typeof err?.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      throw badRequest('VALIDATION_ERROR', 'Username or email already in use');
    }
    throw err;
  }

  const user = loadUserAccess(userId);
  const accessToken = issueTokens(res, req, user);
  res.status(201).json({ accessToken, user: publicUser(user) });
});

export default router;