// 邮政契约 — the platform-wide notification entry point every office imports.
//
// sendPostalMessage writes one row into post_messages storing only
// `source` / `type` / `params`; the SPA renders the text through the
// `post.msg.*` i18n keys. A user can mute a whole source from the postal
// preference screen — an explicit `0` row in post_preferences skips the insert.
//
//   import { sendPostalMessage } from '../postal/notify.js';
//   sendPostalMessage({
//     userId: user.id,          // number or numeric string
//     source: 'visa',           // office key
//     type: 'visa_approved',    // message type, rendered as post.msg.<type>
//     params: { appNo, ... },   // interpolation values for the SPA
//   });
//   // → { id } when stored, { skipped: true } when the user muted the source
//
// When the admin enabled a matching template in post_templates, its
// {{variable}} placeholders are rendered here and stored alongside the params;
// the SPA prefers that rendered text and otherwise falls back to i18n.
import { db, now } from '../db.js';
import { ensurePostalSchema } from './schema.js';
import { renderTemplate } from './util.js';

// Other offices import this module from their own routers, so the postal tables
// must exist before the first message is written.
ensurePostalSchema();

export function sendPostalMessage(input) {
  const { userId, source, type, params } = input || {};
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return { skipped: true };

  // Cross-office callers may hold a stale user id (deleted account) — never throw.
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND status = ?').get(uid, 'active');
  if (!user) return { skipped: true };

  const src = String(source || 'system').slice(0, 40);
  const msgType = String(type || 'system').slice(0, 60);
  const vars = params && typeof params === 'object' ? params : {};

  // Mute list: a row with enabled = 0 means "skip this office entirely".
  const pref = db.prepare('SELECT enabled FROM post_preferences WHERE user_id = ? AND source = ?').get(uid, src);
  if (pref && !pref.enabled) return { skipped: true };

  // A matching enabled template overrides the i18n rendering with its own text.
  const template =
    db
      .prepare(
        `SELECT * FROM post_templates
         WHERE source = ? AND type = ? AND enabled = 1 AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(src, msgType) ||
    db
      .prepare(
        `SELECT * FROM post_templates
         WHERE source = '*' AND type = ? AND enabled = 1 AND deleted_at IS NULL
         LIMIT 1`
      )
      .get(msgType);

  const title = template ? renderTemplate(template.title_template, vars) : null;
  const titleTw = template?.title_template_tw ? renderTemplate(template.title_template_tw, vars) : null;
  const body = template ? renderTemplate(template.body_template, vars) : null;
  const bodyTw = template?.body_template_tw ? renderTemplate(template.body_template_tw, vars) : null;

  const info = db
    .prepare(
      `INSERT INTO post_messages (user_id, source, type, params, title, title_tw, body, body_tw, read, archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
    )
    .run(uid, src, msgType, JSON.stringify(vars), title, titleTw, body, bodyTw, now());

  return { id: Number(info.lastInsertRowid) };
}