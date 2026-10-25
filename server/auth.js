import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, now, loadUserAccess } from './db.js';
import { unauthorized, forbidden } from './http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NAILONG_DATA_DIR || path.join(__dirname, 'data');

// HS256 secret: explicit env var wins, otherwise generate once and persist so
// sessions survive restarts.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(dataDir, '.jwt-secret');
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}

const JWT_SECRET = loadSecret();
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '30m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7);
export const REFRESH_COOKIE = 'nailong_rt';

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/api/auth',
  maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
};

export const hashPassword = (plain) => bcrypt.hashSync(plain, 10);
export const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    status: user.status,
    roles: user.roles?.map((r) => ({ key: r.key, name: r.name })) ?? [],
    permissions: user.permissions ?? [],
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
  };
}

function createSession(user, req) {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (jti, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)').run(
    jti,
    user.id,
    now(),
    expiresAt,
    String(req.headers['user-agent'] || '').slice(0, 255)
  );
  return jti;
}

function signAccess(user) {
  return jwt.sign({ sub: String(user.id), username: user.username }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

function signRefresh(user, jti) {
  return jwt.sign({ sub: String(user.id), jti }, JWT_SECRET, { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` });
}

// Issue a fresh pair (login / register). The refresh token lives in an httpOnly
// cookie scoped to /api/auth; the access token goes to the client memory only.
export function issueTokens(res, req, user) {
  const jti = createSession(user, req);
  res.cookie(REFRESH_COOKIE, signRefresh(user, jti), REFRESH_COOKIE_OPTS);
  return signAccess(user);
}

// Rotate the refresh session: the presented token is revoked and replaced.
export function rotateSession(res, req, user, oldJti) {
  db.prepare('DELETE FROM sessions WHERE jti = ?').run(oldJti);
  const jti = createSession(user, req);
  res.cookie(REFRESH_COOKIE, signRefresh(user, jti), REFRESH_COOKIE_OPTS);
  return signAccess(user);
}

export function clearSession(req, res) {
  try {
    const payload = readRefreshCookie(req);
    if (payload?.jti) db.prepare('DELETE FROM sessions WHERE jti = ?').run(payload.jti);
  } catch {
    // token already invalid — nothing to revoke
  }
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

function readRefreshCookie(req) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) return null;
  return jwt.verify(token, JWT_SECRET); // throws on tampering/expiry
}

export function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = loadUserAccess(Number(payload.sub));
    if (!user || user.status !== 'active') return next(unauthorized());
    req.user = user;
    next();
  } catch {
    next(unauthorized());
  }
}

export function requirePermission(...needed) {
  return (req, _res, next) => {
    const owned = new Set(req.user?.permissions || []);
    if (!needed.every((p) => owned.has(p))) {
      return next(forbidden('FORBIDDEN', `Missing permission: ${needed.join(', ')}`));
    }
    next();
  };
}

export { readRefreshCookie, JWT_SECRET };
