// 奶龙国皇家文化旅游署 — shared server-side helpers: numbering, config,
// audit log, serializer helpers, check-in counters, badge evaluation and the
// read-only souvenir-stamp view over the immigration office tables.
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { ApiError } from '../http.js';
import { sendTourNotice } from './postal.js';

// ---------------------------------------------------------------------------
// Non-guessable identifiers (same convention as the other offices)
// ---------------------------------------------------------------------------

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

// e.g. NLV20261027-7K3M9Q (景点) / NLB… (徽章) / NLH… (文化内容) / NLI… (打卡)
export function makeNo(prefix) {
  return `${prefix}${stamp()}-${randomCode(6)}`;
}

export function makeUniqueNo(prefix, table, column = 'no') {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = makeNo(prefix);
    if (!db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).get(no)) return no;
  }
  throw new ApiError(500, 'INTERNAL_ERROR', 'Failed to allocate a unique tourism number');
}

export const todayStr = () => now().slice(0, 10);

// ---------------------------------------------------------------------------
// Rule configuration (tour_config key/value)
// ---------------------------------------------------------------------------

export function getConfig(key, fallback = null) {
  const row = db.prepare('SELECT value FROM tour_config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

// Positive number only (used where 0 is not a meaningful value).
export function getConfigNumber(key, fallback) {
  const v = Number(getConfig(key));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

// Non-negative number: 0 is a valid, meaningful value (e.g. no site-wide cap).
export function getConfigInt(key, fallback) {
  const raw = getConfig(key, null);
  if (raw === null) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

export function setConfig(key, value) {
  db.prepare(
    `INSERT INTO tour_config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), now());
}

// ---------------------------------------------------------------------------
// Audit log — every admin mutation and every check-in lands here.
// ---------------------------------------------------------------------------

export function audit(actorId, action, targetType = '', targetId = '', detail = {}) {
  const actorName = actorId
    ? db.prepare('SELECT display_name, username FROM users WHERE id = ?').get(actorId)?.display_name || ''
    : 'system';
  db.prepare(
    'INSERT INTO tour_audit_logs (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(actorId ?? null, actorName, action, targetType, String(targetId ?? ''), JSON.stringify(detail), now());
}

// ---------------------------------------------------------------------------
// Check-in counters
// ---------------------------------------------------------------------------

export function countUserCheckins(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM tour_checkins WHERE user_id = ? AND deleted_at IS NULL').get(userId).n;
}

export function countUserCheckinsOn(userId, date) {
  return db
    .prepare('SELECT COUNT(*) AS n FROM tour_checkins WHERE user_id = ? AND checkin_date = ? AND deleted_at IS NULL')
    .get(userId, date).n;
}

export function countSiteCheckinsOn(date) {
  return db.prepare('SELECT COUNT(*) AS n FROM tour_checkins WHERE checkin_date = ? AND deleted_at IS NULL').get(date).n;
}

export function userBadgeCount(userId) {
  return db
    .prepare('SELECT COUNT(*) AS n FROM tour_badge_awards WHERE user_id = ? AND revoked_at IS NULL')
    .get(userId).n;
}

// 打卡点按行存储(一行一个),读侧返回原文,SPA 负责按语言取值与拆分。
export function splitPoints(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

export function serializeAttraction(row) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    name: row.name,
    nameTw: row.name_tw,
    summary: row.summary,
    summaryTw: row.summary_tw,
    description: row.description,
    descriptionTw: row.description_tw,
    type: row.type,
    openState: row.open_state,
    status: row.status,
    checkinPoints: row.checkin_points,
    checkinPointsTw: row.checkin_points_tw,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    title: row.title,
    titleTw: row.title_tw,
    summary: row.summary,
    summaryTw: row.summary_tw,
    body: row.body,
    bodyTw: row.body_tw,
    type: row.type,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Joined rows may carry attraction_no / attraction_name[_tw].
export function serializeCheckin(row) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    attractionId: row.attraction_id,
    attractionNo: row.attraction_no ?? null,
    attractionName: row.attraction_name ?? null,
    attractionNameTw: row.attraction_name_tw ?? null,
    attractionType: row.attraction_type ?? null,
    checkinDate: row.checkin_date,
    note: row.note,
    createdAt: row.created_at,
  };
}

export function serializeBadge(row) {
  if (!row) return null;
  return {
    id: row.id,
    no: row.no,
    code: row.code,
    name: row.name,
    nameTw: row.name_tw,
    description: row.description,
    descriptionTw: row.description_tw,
    icon: row.icon,
    threshold: row.threshold,
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Souvenir stamps — read-only projection of the immigration office records.
// Same SQLite database, so no HTTP hop is needed (same pattern as
// server/immigration/visa.js reading the visa office tables directly).
// ---------------------------------------------------------------------------

function tableExists(name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}

export function souvenirStamps(userId) {
  if (!tableExists('im_entry_records')) return [];
  const rows = tableExists('im_ports')
    ? db
        .prepare(
          `SELECT er.no, er.entry_date, er.stamp_style, er.status, er.stay_days,
                  p.name AS port_name, p.name_tw AS port_name_tw
           FROM im_entry_records er
           LEFT JOIN im_ports p ON p.id = er.port_id
           WHERE er.user_id = ? AND er.deleted_at IS NULL
           ORDER BY er.entry_date DESC, er.id DESC`
        )
        .all(userId)
    : db
        .prepare(
          `SELECT er.no, er.entry_date, er.stamp_style, er.status, er.stay_days,
                  NULL AS port_name, NULL AS port_name_tw
           FROM im_entry_records er
           WHERE er.user_id = ? AND er.deleted_at IS NULL
           ORDER BY er.entry_date DESC, er.id DESC`
        )
        .all(userId);
  return rows.map((r) => ({
    no: r.no,
    entryDate: r.entry_date,
    stampStyle: r.stamp_style,
    status: r.status,
    stayDays: r.stay_days,
    portName: r.port_name,
    portNameTw: r.port_name_tw,
  }));
}

export const STAMP_STYLES = ['wave', 'star', 'claw'];

// ---------------------------------------------------------------------------
// Badge evaluation — called after a successful check-in. Threshold badges are
// awarded once per user; the award itself is announced through the postal
// contract (source = tourism).
// ---------------------------------------------------------------------------

export async function evaluateBadges(userId) {
  const total = countUserCheckins(userId);
  const badges = db
    .prepare(
      `SELECT * FROM tour_badges
       WHERE enabled = 1 AND deleted_at IS NULL AND threshold <= ?
       ORDER BY threshold ASC, id ASC`
    )
    .all(total);
  const awarded = [];
  for (const badge of badges) {
    const existing = db
      .prepare('SELECT id FROM tour_badge_awards WHERE badge_id = ? AND user_id = ?')
      .get(badge.id, userId);
    if (existing) continue;
    const ts = now();
    try {
      db.prepare(
        `INSERT INTO tour_badge_awards (badge_id, user_id, checkin_count, awarded_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(badge.id, userId, total, ts, ts);
    } catch {
      // UNIQUE(badge_id, user_id) — a concurrent request awarded it first.
      continue;
    }
    audit(userId, 'tour:badge_award', 'badge', badge.no, {
      badgeCode: badge.code,
      checkinCount: total,
    });
    await sendTourNotice({
      userId,
      type: 'tour_badge',
      params: {
        badgeName: badge.name,
        badgeNameTw: badge.name_tw,
        badgeNo: badge.no,
        checkinCount: total,
      },
    });
    awarded.push(serializeBadge(badge));
  }
  return awarded;
}