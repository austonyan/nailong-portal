// 皇家礼宾与活动署联动预留(服务间接口)。
// 约定:其他署以固定服务令牌调用(PROTOCOL_INTER_SERVICE_TOKEN)。
// 当前提供邀请函/活动凭证/接待方校验与凭证核销,供签注署、入境署与统一
// 验真中心对接;联动尚未接入时保持零调用,不影响主流程。
import { Router } from 'express';
import { db, now } from '../db.js';
import { forbidden, notFound } from '../http.js';
import { ensureProtocolSchema } from './schema.js';
import { audit, maskHost, maskInvitation, maskPass, sweepAll } from './util.js';

ensureProtocolSchema();

const router = Router();

function requireServiceToken(req, _res, next) {
  const expected = process.env.PROTOCOL_INTER_SERVICE_TOKEN;
  if (!expected) return next(forbidden('SERVICE_DISABLED', 'PROTOCOL_INTER_SERVICE_TOKEN is not configured'));
  const provided = req.get('x-nailong-service-token');
  if (!provided || provided !== expected) return next(forbidden('SERVICE_FORBIDDEN', 'Invalid service token'));
  next();
}

router.use(requireServiceToken);

function findDoc(no, token) {
  if (token) {
    const inv = db.prepare('SELECT * FROM pro_invitations WHERE token = ?').get(token);
    if (inv) return { kind: 'invitation', row: inv };
    const pass = db.prepare('SELECT * FROM pro_passes WHERE token = ?').get(token);
    if (pass) return { kind: 'pass', row: pass };
    return null;
  }
  const value = String(no || '').trim().toUpperCase();
  if (!value) return null;
  const inv = db.prepare('SELECT * FROM pro_invitations WHERE invite_no = ?').get(value);
  if (inv) return { kind: 'invitation', row: inv };
  const pass = db.prepare('SELECT * FROM pro_passes WHERE pass_no = ?').get(value);
  if (pass) return { kind: 'pass', row: pass };
  const host = db.prepare('SELECT * FROM pro_hosts WHERE host_no = ? AND deleted_at IS NULL').get(value);
  if (host) return { kind: 'host', row: host };
  return null;
}

function presentation(kind, row) {
  if (kind === 'invitation') {
    return {
      ...maskInvitation(row),
      userId: row.invitee_user_id,
      response: row.response,
      eventId: row.event_id,
    };
  }
  if (kind === 'pass') {
    return {
      ...maskPass(row),
      userId: row.user_id,
      registrationId: row.registration_id,
      eventId: row.event_id,
    };
  }
  return { ...maskHost(row), userId: row.user_id };
}

// 通用校验:编号或二维码 token
router.post('/check', (req, res) => {
  sweepAll();
  const found = findDoc(req.body?.no, String(req.body?.token || '').trim());
  if (!found) {
    audit({ name: 'inter-service' }, 'inter_check_miss', 'protocol_doc', String(req.body?.no || 'token:*'));
    return res.json({ found: false });
  }
  audit({ name: 'inter-service' }, 'inter_check', 'protocol_doc', found.row.invite_no || found.row.pass_no || found.row.host_no, {
    kind: found.kind,
  });
  res.json({ found: true, item: presentation(found.kind, found.row) });
});

// 邀请函校验:签注署以邀请函编号作为签注材料时调用。
router.get('/invitations/:no', (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM pro_invitations WHERE invite_no = ?').get(String(req.params.no).trim().toUpperCase());
  if (!row) throw notFound('Invitation not found');
  audit({ name: 'inter-service' }, 'inter_invitation_check', 'invitation', row.invite_no);
  res.json({
    found: true,
    invitation: {
      ...maskInvitation(row),
      userId: row.invitee_user_id,
      eventId: row.event_id,
      response: row.response,
      visaUsable: row.status === 'valid',
    },
  });
});

// 活动凭证辅助入境申报(预留)。
router.get('/passes/:no', (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM pro_passes WHERE pass_no = ?').get(String(req.params.no).trim().toUpperCase());
  if (!row) throw notFound('Pass not found');
  audit({ name: 'inter-service' }, 'inter_pass_check', 'pass', row.pass_no);
  res.json({
    found: true,
    pass: { ...maskPass(row), userId: row.user_id, eventId: row.event_id, registrationId: row.registration_id },
  });
});

// 活动期间口岸提示预留:按日期返回活动与预计人流(虚构)。
router.get('/events/upcoming', (req, res) => {
  sweepAll();
  const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
  const rows = db
    .prepare(
      `SELECT event_no, title, type_code, starts_at, ends_at, venue_name FROM pro_events
       WHERE deleted_at IS NULL AND status IN ('registration','registration_closed','ongoing')
         AND starts_at IS NOT NULL AND starts_at <= datetime('now', ?) ORDER BY starts_at LIMIT 50`
    )
    .all(`+${days} day`);
  res.json({ items: rows });
});

// 接待方验真(供文书署签发认证证书时校验)。
router.get('/hosts/:no', (req, res) => {
  sweepAll();
  const row = db
    .prepare('SELECT * FROM pro_hosts WHERE host_no = ? AND deleted_at IS NULL')
    .get(String(req.params.no).trim().toUpperCase());
  if (!row) throw notFound('Host not found');
  audit({ name: 'inter-service' }, 'inter_host_check', 'host', row.host_no);
  res.json({
    found: true,
    host: { ...maskHost(row), userId: row.user_id, canPublish: !!row.can_publish, canInvite: !!row.can_invite },
  });
});

// 签到回写预留:入境署/签注署可标记凭证已使用。
router.post('/passes/mark-used', (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM pro_passes WHERE pass_no = ?').get(String(req.body?.no || '').trim().toUpperCase());
  if (!row) throw notFound('Pass not found');
  if (row.status !== 'pending') return res.json({ ok: false, status: row.status });
  db.prepare("UPDATE pro_passes SET status = 'used', checked_in_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), row.id);
  audit({ name: 'inter-service' }, 'inter_mark_used', 'pass', row.pass_no);
  res.json({ ok: true, status: 'used' });
});

export default router;