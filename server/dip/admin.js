// 奶龙国皇家外交事务署 — admin/officer API.
// Queue isolation by permission: 外交审核员 (dip:review) only ever sees the
// diplomacy relation/identity queues here; visa / immigration / docs queues
// live in their own services with their own permissions.
import { Router } from 'express';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, notFound, readString, conflict } from '../http.js';
import { ensureDipSchema, getSetting, getSettingInt } from './schema.js';
import {
  assertTransition,
  audit,
  logEvent,
  makeToken,
  makeUniqueNo,
  notify,
  pageParams,
  riskSummary,
  sweepAll,
} from './util.js';
import { syncDiplomaticVisa } from '../linkage.js';
import { registerAutoApprover, safeAutoApprove } from '../autoApprove.js';

ensureDipSchema();

const router = Router();

const REJECT_REASONS = new Set(['info_missing', 'info_false', 'duplicate', 'type_mismatch', 'other']);
const OFFICE_STATUSES = new Set(['open', 'closed', 'maintenance']);
const AGREEMENT_TYPES = new Set(['entry_courtesy', 'visa_waiver', 'event_pass']);
const EDITABLE_SETTINGS = new Set([
  'supplement_days',
  'review_hours_hint',
  'verify_limit_per_5min',
  'relation_no_prefix',
  'identity_no_prefix',
  'agreement_no_prefix',
  'max_identities_per_user',
]);

const adminOnly = [authenticate, requirePermission('dip:admin')];
const reviewer = [authenticate, requirePermission('dip:review')];

// ---------------------------------------------------------------------------
// Review workbench — relations queue
// ---------------------------------------------------------------------------

function relationDetail(row) {
  return {
    id: row.id,
    no: row.no,
    userId: row.user_id,
    objectType: row.object_type,
    relationType: row.relation_type,
    entityName: row.entity_name,
    repNickname: row.rep_nickname,
    contact: row.contact,
    reason: row.reason,
    courtesies: JSON.parse(row.courtesies || '[]'),
    purpose: row.purpose,
    status: row.status,
    supplementNote: row.supplement_note,
    supplementDeadline: row.supplement_deadline,
    supplementContent: row.supplement_content,
    rejectCode: row.reject_code,
    rejectComment: row.reject_comment,
    suspendReason: row.suspend_reason,
    severReason: row.sever_reason,
    establishedAt: row.established_at,
    severedAt: row.severed_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    events: db
      .prepare(
        `SELECT e.action, e.note, e.created_at, u.display_name AS actor
         FROM dip_events e LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.owner_type = 'relation' AND e.owner_id = ? ORDER BY e.id`
      )
      .all(row.id),
    materials: db
      .prepare(
        'SELECT id, kind, origin, filename, mime, size, created_at FROM dip_materials WHERE owner_type = ? AND owner_id = ? AND deleted_at IS NULL ORDER BY id'
      )
      .all('relation', row.id),
  };
}

router.get('/relations', ...reviewer, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (req.query.status) {
    where.push('status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.objectType) {
    where.push('object_type = ?');
    params.push(String(req.query.objectType));
  }
  if (req.query.q) {
    where.push('(no LIKE ? OR entity_name LIKE ? OR rep_nickname LIKE ?)');
    const q = `%${String(req.query.q).trim()}%`;
    params.push(q, q, q);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM dip_relations WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT * FROM dip_relations WHERE ${where.join(' AND ')}
       ORDER BY CASE status WHEN 'pending_review' THEN 0 WHEN 'supplement_required' THEN 1 WHEN 'sever_requested' THEN 2 ELSE 3 END,
                submitted_at ASC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  const counts = {};
  for (const c of db.prepare('SELECT status, COUNT(*) AS n FROM dip_relations WHERE deleted_at IS NULL GROUP BY status').all()) {
    counts[c.status] = c.n;
  }
  res.json({
    items: rows.map((r) => ({ ...relationDetail(r), risk: riskSummary(r.user_id) })),
    total,
    page,
    pageSize,
    counts,
  });
});

router.get('/relations/:id', ...reviewer, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_relations WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Relation not found');
  const detail = relationDetail(row);
  detail.risk = riskSummary(row.user_id);
  res.json({ relation: detail });
});

function getRelation(id) {
  const row = db.prepare('SELECT * FROM dip_relations WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  if (!row) throw notFound('Relation not found');
  return row;
}

const SUPPLEMENT_DEADLINE = () => {
  const days = getSettingInt('supplement_days', 7);
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
};

// 建交通过 → established。人工与自动审批共用。
function approveRelationCore(row, actor, { note = '', auto = false } = {}) {
  if (!['pending_review', 'supplement_required'].includes(row.status)) {
    throw conflict('DIP_INVALID_STATE', 'Only pending relations can be established');
  }
  const typeName = db.prepare('SELECT name FROM dip_relation_types WHERE code = ?').get(row.relation_type)?.name || row.relation_type;
  const ts = now();
  const info = db
    .prepare(
      `UPDATE dip_relations SET status = 'established', established_at = ?, decided_by = ?, decided_at = ?,
         supplement_note = '', updated_at = ?
       WHERE id = ? AND status IN ('pending_review', 'supplement_required')`
    )
    .run(ts, actor?.id ?? null, ts, ts, row.id);
  if (!info.changes) throw conflict('DIP_INVALID_STATE', 'Only pending relations can be established');
  logEvent('relation', row.id, 'establish', actor?.id ?? null, note);
  notify(
    row.user_id,
    'relation_established',
    { no: row.no, entity: row.entity_name, typeName },
    { relationNo: row.no }
  );
  audit(actor?.id ?? null, 'dip:relation.establish', 'relation', row.no, auto ? { auto: true } : {});
}

router.post('/relations/:id/approve', ...reviewer, (req, res) => {
  const row = getRelation(req.params.id);
  approveRelationCore(row, req.user, { note: String(req.body?.note || '').slice(0, 200) });
  res.json({ relation: relationDetail(getRelation(row.id)) });
});

router.post('/relations/:id/reject', ...reviewer, (req, res) => {
  const row = getRelation(req.params.id);
  if (!['pending_review', 'supplement_required'].includes(row.status)) {
    throw conflict('DIP_INVALID_STATE', 'Only pending relations can be rejected');
  }
  const reason = String(req.body?.reason || '');
  if (!REJECT_REASONS.has(reason)) throw badRequest('VALIDATION_ERROR', 'Invalid reject reason');
  const comment = String(req.body?.comment || '').trim().slice(0, 300);
  const ts = now();
  db.prepare(
    "UPDATE dip_relations SET status = 'rejected', reject_code = ?, reject_comment = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?"
  ).run(reason, comment, req.user.id, ts, ts, row.id);
  logEvent('relation', row.id, 'reject', req.user.id, `${reason}${comment ? ` - ${comment}` : ''}`);
  notify(row.user_id, 'relation_rejected', { no: row.no, reason, comment: comment || '如有疑问请联系管理员。' }, { relationNo: row.no });
  audit(req.user.id, 'dip:relation.reject', 'relation', row.no, { reason });
  res.json({ relation: relationDetail(getRelation(row.id)) });
});

router.post('/relations/:id/supplement', ...reviewer, (req, res) => {
  const row = getRelation(req.params.id);
  if (row.status !== 'pending_review') {
    throw conflict('DIP_INVALID_STATE', 'Only pending relations can be sent for supplements');
  }
  const note = readString(req.body?.note, { name: 'note', min: 2, max: 300 });
  const deadline = SUPPLEMENT_DEADLINE();
  const ts = now();
  db.prepare("UPDATE dip_relations SET status = 'supplement_required', supplement_note = ?, supplement_deadline = ?, updated_at = ? WHERE id = ?").run(
    note,
    deadline,
    ts,
    row.id
  );
  logEvent('relation', row.id, 'require_supplement', req.user.id, note);
  notify(row.user_id, 'relation_supplement', { no: row.no, note, deadline }, { relationNo: row.no });
  audit(req.user.id, 'dip:relation.supplement', 'relation', row.no, {});
  res.json({ relation: relationDetail(getRelation(row.id)) });
});

// 暂停 / 恢复(需原因 + 审计)
router.post('/relations/:id/suspend', ...reviewer, (req, res) => {
  const row = getRelation(req.params.id);
  assertTransition('relation', row.status, 'suspended', 'Only established relations can be suspended');
  const reason = readString(req.body?.reason, { name: 'reason', min: 2, max: 300 });
  db.prepare("UPDATE dip_relations SET status = 'suspended', suspend_reason = ?, updated_at = ? WHERE id = ?").run(reason, now(), row.id);
  logEvent('relation', row.id, 'suspend', req.user.id, reason);
  audit(req.user.id, 'dip:relation.suspend', 'relation', row.no, { reason });
  res.json({ relation: relationDetail(getRelation(row.id)) });
});

router.post('/relations/:id/resume', ...reviewer, (req, res) => {
  const row = getRelation(req.params.id);
  assertTransition('relation', row.status, 'established', 'Only suspended relations can be resumed');
  db.prepare("UPDATE dip_relations SET status = 'established', suspend_reason = '', updated_at = ? WHERE id = ?").run(now(), row.id);
  logEvent('relation', row.id, 'resume', req.user.id, String(req.body?.note || '').slice(0, 200));
  audit(req.user.id, 'dip:relation.resume', 'relation', row.no, {});
  res.json({ relation: relationDetail(getRelation(row.id)) });
});

// 断交复核: 批准 → severed(级联失效身份); 驳回 → 回到 established
router.post('/relations/:id/sever', ...reviewer, (req, res) => {
  const row = getRelation(req.params.id);
  if (row.status !== 'sever_requested' && row.status !== 'established') {
    throw conflict('DIP_INVALID_STATE', 'Only established/sever-requested relations can be severed');
  }
  const approveSever = req.body?.approve !== false;
  if (!approveSever) {
    assertTransition('relation', row.status, 'established', 'Only sever-requested relations can be dismissed');
    db.prepare("UPDATE dip_relations SET status = 'established', sever_reason = NULL, updated_at = ? WHERE id = ?").run(now(), row.id);
    logEvent('relation', row.id, 'sever_dismiss', req.user.id, String(req.body?.note || '').slice(0, 200));
    audit(req.user.id, 'dip:relation.sever_dismiss', 'relation', row.no, {});
    return res.json({ relation: relationDetail(getRelation(row.id)) });
  }
  const reason = String(req.body?.reason || row.sever_reason || '双方协商断交').slice(0, 300);
  const ts = now();
  const affectedUsers = new Set();
  const sever = db.transaction(() => {
    db.prepare("UPDATE dip_relations SET status = 'severed', severed_at = ?, sever_reason = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?").run(
      ts,
      reason,
      req.user.id,
      ts,
      ts,
      row.id
    );
    const linked = db
      .prepare("SELECT * FROM dip_identities WHERE relation_id = ? AND status IN ('active', 'frozen')")
      .all(row.id);
    for (const idt of linked) {
      db.prepare("UPDATE dip_identities SET status = 'expired', inactive_reason = 'relation_severed', updated_at = ? WHERE id = ?").run(ts, idt.id);
      affectedUsers.add(idt.user_id);
      logEvent('identity', idt.id, 'invalidate', req.user.id, `建交关系 ${row.no} 断交,身份同步失效`);
      notify(idt.user_id, 'identity_invalidated', { no: idt.no, reason: `建交关系 ${row.no} 已断交` }, { identityNo: idt.no });
    }
    logEvent('relation', row.id, 'sever', req.user.id, reason);
  });
  sever();
  for (const userId of affectedUsers) syncDiplomaticVisa(userId);
  notify(row.user_id, 'relation_severed', { no: row.no, entity: row.entity_name }, { relationNo: row.no });
  audit(req.user.id, 'dip:relation.sever', 'relation', row.no, { reason, cascade: true });
  res.json({ relation: relationDetail(getRelation(row.id)) });
});

// ---------------------------------------------------------------------------
// Review workbench — identities queue + lifecycle
// ---------------------------------------------------------------------------

function identityDetail(row) {
  return {
    id: row.id,
    no: row.no,
    userId: row.user_id,
    identityType: row.identity_type,
    relationId: row.relation_id,
    relationNo: row.relation_no,
    entityName: row.entity_name,
    nickname: row.nickname,
    contact: row.contact,
    title: row.title,
    termStart: row.term_start,
    termEnd: row.term_end,
    status: row.status,
    inactiveReason: row.inactive_reason,
    supplementNote: row.supplement_note,
    supplementDeadline: row.supplement_deadline,
    supplementContent: row.supplement_content,
    rejectCode: row.reject_code,
    rejectComment: row.reject_comment,
    approvedAt: row.approved_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    events: db
      .prepare(
        `SELECT e.action, e.note, e.created_at, u.display_name AS actor
         FROM dip_events e LEFT JOIN users u ON u.id = e.actor_id
         WHERE e.owner_type = 'identity' AND e.owner_id = ? ORDER BY e.id`
      )
      .all(row.id),
    materials: db
      .prepare(
        'SELECT id, kind, origin, filename, mime, size, created_at FROM dip_materials WHERE owner_type = ? AND owner_id = ? AND deleted_at IS NULL ORDER BY id'
      )
      .all('identity', row.id),
  };
}

router.get('/identities', ...reviewer, (req, res) => {
  sweepAll();
  const { page, pageSize, offset } = pageParams(req.query);
  const where = ['deleted_at IS NULL'];
  const params = [];
  if (req.query.status) {
    where.push('status = ?');
    params.push(String(req.query.status));
  }
  if (req.query.identityType) {
    where.push('identity_type = ?');
    params.push(String(req.query.identityType));
  }
  if (req.query.q) {
    where.push('(no LIKE ? OR entity_name LIKE ? OR nickname LIKE ? OR relation_no LIKE ?)');
    const q = `%${String(req.query.q).trim()}%`;
    params.push(q, q, q, q);
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM dip_identities WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT * FROM dip_identities WHERE ${where.join(' AND ')}
       ORDER BY CASE status WHEN 'pending_review' THEN 0 WHEN 'supplement_required' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
                submitted_at ASC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  const counts = {};
  for (const c of db.prepare('SELECT status, COUNT(*) AS n FROM dip_identities WHERE deleted_at IS NULL GROUP BY status').all()) {
    counts[c.status] = c.n;
  }
  res.json({
    items: rows.map((r) => ({ ...identityDetail(r), risk: riskSummary(r.user_id) })),
    total,
    page,
    pageSize,
    counts,
  });
});

router.get('/identities/:id', ...reviewer, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_identities WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Identity not found');
  const detail = identityDetail(row);
  detail.risk = riskSummary(row.user_id);
  res.json({ identity: detail });
});

function getIdentity(id) {
  const row = db.prepare('SELECT * FROM dip_identities WHERE id = ? AND deleted_at IS NULL').get(Number(id));
  if (!row) throw notFound('Identity not found');
  return row;
}

// 审核时校验关联建交关系有效性(断交/暂停中不允许通过)
function assertRelationValidForIdentity(row) {
  if (!row.relation_id) throw badRequest('DIP_RELATION_REQUIRED', 'Identity has no linked relation');
  const rel = db.prepare('SELECT * FROM dip_relations WHERE id = ?').get(row.relation_id);
  if (!rel || rel.status !== 'established') {
    throw conflict('DIP_RELATION_NOT_ESTABLISHED', `Linked relation ${row.relation_no} is not established`);
  }
}

// 外交身份通过 → active + 验真 token + 自动礼遇记录。人工与自动审批共用。
function approveIdentityCore(row, actor, { note = '', auto = false } = {}) {
  if (!['pending_review', 'supplement_required'].includes(row.status)) {
    throw conflict('DIP_INVALID_STATE', 'Only pending identities can be approved');
  }
  assertRelationValidForIdentity(row);
  const typeName = db.prepare('SELECT name FROM dip_identity_types WHERE code = ?').get(row.identity_type)?.name || row.identity_type;
  const ts = now();
  const token = makeToken();
  const approve = db.transaction(() => {
    const info = db
      .prepare(
        `UPDATE dip_identities SET status = 'active', verify_token = ?, approved_at = ?, approved_by = ?,
           supplement_note = '', updated_at = ?
         WHERE id = ? AND status IN ('pending_review', 'supplement_required')`
      )
      .run(token, ts, actor?.id ?? null, ts, row.id);
    if (!info.changes) throw conflict('DIP_INVALID_STATE', 'Only pending identities can be approved');
    const courtesies = db.prepare('SELECT code FROM dip_courtesy_types WHERE enabled = 1').all();
    for (const c of courtesies) {
      db.prepare(
        'INSERT INTO dip_courtesy_records (user_id, identity_id, identity_no, courtesy_code, source, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(row.user_id, row.id, row.no, c.code, 'auto', '身份生效自动授予', actor?.id ?? null, ts);
    }
    logEvent('identity', row.id, 'approve', actor?.id ?? null, note);
  });
  approve();
  notify(row.user_id, 'identity_approved', { no: row.no, typeName, termEnd: row.term_end }, { identityNo: row.no });
  audit(actor?.id ?? null, 'dip:identity.approve', 'identity', row.no, auto ? { auto: true } : {});
  return token;
}

router.post('/identities/:id/approve', ...reviewer, (req, res) => {
  const row = getIdentity(req.params.id);
  approveIdentityCore(row, req.user, { note: String(req.body?.note || '').slice(0, 200) });
  res.json({ identity: identityDetail(getIdentity(row.id)) });
});

router.post('/identities/:id/reject', ...reviewer, (req, res) => {
  const row = getIdentity(req.params.id);
  if (!['pending_review', 'supplement_required'].includes(row.status)) {
    throw conflict('DIP_INVALID_STATE', 'Only pending identities can be rejected');
  }
  const reason = String(req.body?.reason || '');
  if (!REJECT_REASONS.has(reason)) throw badRequest('VALIDATION_ERROR', 'Invalid reject reason');
  const comment = String(req.body?.comment || '').trim().slice(0, 300);
  const ts = now();
  db.prepare(
    "UPDATE dip_identities SET status = 'rejected', reject_code = ?, reject_comment = ?, decided_by = ?, updated_at = ? WHERE id = ?"
  ).run(reason, comment, req.user.id, ts, row.id);
  logEvent('identity', row.id, 'reject', req.user.id, `${reason}${comment ? ` - ${comment}` : ''}`);
  notify(row.user_id, 'identity_rejected', { no: row.no, reason, comment: comment || '如有疑问请联系管理员。' }, { identityNo: row.no });
  audit(req.user.id, 'dip:identity.reject', 'identity', row.no, { reason });
  res.json({ identity: identityDetail(getIdentity(row.id)) });
});

router.post('/identities/:id/supplement', ...reviewer, (req, res) => {
  const row = getIdentity(req.params.id);
  if (row.status !== 'pending_review') {
    throw conflict('DIP_INVALID_STATE', 'Only pending identities can be sent for supplements');
  }
  const note = readString(req.body?.note, { name: 'note', min: 2, max: 300 });
  const deadline = SUPPLEMENT_DEADLINE();
  db.prepare("UPDATE dip_identities SET status = 'supplement_required', supplement_note = ?, supplement_deadline = ?, updated_at = ? WHERE id = ?").run(
    note,
    deadline,
    now(),
    row.id
  );
  logEvent('identity', row.id, 'require_supplement', req.user.id, note);
  notify(row.user_id, 'identity_supplement', { no: row.no, note, deadline }, { identityNo: row.no });
  audit(req.user.id, 'dip:identity.supplement', 'identity', row.no, {});
  res.json({ identity: identityDetail(getIdentity(row.id)) });
});

// 冻结 / 解冻 / 注销(需原因 + 审计;失效后签注与礼遇同步拦截由校验方完成)
router.post('/identities/:id/freeze', ...reviewer, (req, res) => {
  const row = getIdentity(req.params.id);
  assertTransition('identity', row.status, 'frozen', 'Only active identities can be frozen');
  const reason = readString(req.body?.reason, { name: 'reason', min: 2, max: 300 });
  db.prepare("UPDATE dip_identities SET status = 'frozen', inactive_reason = ?, updated_at = ? WHERE id = ?").run(reason, now(), row.id);
  logEvent('identity', row.id, 'freeze', req.user.id, reason);
  notify(row.user_id, 'identity_frozen', { no: row.no, reason }, { identityNo: row.no });
  audit(req.user.id, 'dip:identity.freeze', 'identity', row.no, { reason });
  res.json({ identity: identityDetail(getIdentity(row.id)) });
});

router.post('/identities/:id/unfreeze', ...reviewer, (req, res) => {
  const row = getIdentity(req.params.id);
  assertTransition('identity', row.status, 'active', 'Only frozen identities can be unfrozen');
  db.prepare("UPDATE dip_identities SET status = 'active', inactive_reason = '', updated_at = ? WHERE id = ?").run(now(), row.id);
  logEvent('identity', row.id, 'unfreeze', req.user.id, String(req.body?.note || '').slice(0, 200));
  audit(req.user.id, 'dip:identity.unfreeze', 'identity', row.no, {});
  res.json({ identity: identityDetail(getIdentity(row.id)) });
});

router.post('/identities/:id/revoke', ...reviewer, (req, res) => {
  const row = getIdentity(req.params.id);
  assertTransition('identity', row.status, 'revoked', 'Only active/frozen identities can be revoked');
  const reason = readString(req.body?.reason, { name: 'reason', min: 2, max: 300 });
  const ts = now();
  db.prepare("UPDATE dip_identities SET status = 'revoked', inactive_reason = ?, updated_at = ? WHERE id = ?").run(reason, ts, row.id);
  logEvent('identity', row.id, 'revoke', req.user.id, reason);
  notify(row.user_id, 'identity_invalidated', { no: row.no, reason }, { identityNo: row.no });
  syncDiplomaticVisa(row.user_id);
  audit(req.user.id, 'dip:identity.revoke', 'identity', row.no, { reason });
  res.json({ identity: identityDetail(getIdentity(row.id)) });
});

// 手动登记礼遇使用记录
router.post('/courtesies/records', ...adminOnly, (req, res) => {
  const identityNo = readString(req.body?.identityNo, { name: 'identityNo', min: 6, max: 40 }).toUpperCase();
  const row = db.prepare('SELECT * FROM dip_identities WHERE no = ? AND deleted_at IS NULL').get(identityNo);
  if (!row) throw badRequest('VALIDATION_ERROR', 'Unknown identityNo');
  const courtesyCode = String(req.body?.courtesyCode || '');
  const type = db.prepare('SELECT * FROM dip_courtesy_types WHERE code = ? AND enabled = 1').get(courtesyCode);
  if (!type) throw badRequest('VALIDATION_ERROR', 'Unknown courtesy type');
  const note = String(req.body?.note || '').slice(0, 200);
  const info = db
    .prepare(
      'INSERT INTO dip_courtesy_records (user_id, identity_id, identity_no, courtesy_code, source, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(row.user_id, row.id, row.no, courtesyCode, 'manual', note, req.user.id, now());
  audit(req.user.id, 'dip:courtesy.record', 'identity', row.no, { courtesyCode });
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

// ---------------------------------------------------------------------------
// Agreements management
// ---------------------------------------------------------------------------

function serializeAgreement(row) {
  return {
    id: row.id,
    no: row.no,
    partyA: row.party_a,
    partyB: row.party_b,
    type: row.type,
    courtesies: row.courtesies,
    courtesiesTw: row.courtesies_tw,
    coveredScope: row.covered_scope,
    coveredScopeTw: row.covered_scope_tw,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    status: row.status,
    published: !!row.published,
    note: row.note,
    noteTw: row.note_tw,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/agreements', ...adminOnly, (req, res) => {
  sweepAll();
  const { page, pageSize, offset } = pageParams(req.query);
  const where = [];
  const params = [];
  if (req.query.status) {
    where.push('status = ?');
    params.push(String(req.query.status));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM dip_agreements ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM dip_agreements ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ items: rows.map(serializeAgreement), total, page, pageSize });
});

router.post('/agreements', ...adminOnly, (req, res) => {
  const body = req.body || {};
  const partyA = readString(body.partyA, { name: 'partyA', min: 2, max: 60 });
  const partyB = readString(body.partyB, { name: 'partyB', min: 2, max: 60 });
  if (!AGREEMENT_TYPES.has(body.type)) throw badRequest('VALIDATION_ERROR', 'Invalid agreement type');
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const effectiveFrom = String(body.effectiveFrom || '').slice(0, 10);
  const effectiveTo = String(body.effectiveTo || '').slice(0, 10);
  if (!dateRe.test(effectiveFrom) || !dateRe.test(effectiveTo)) {
    throw badRequest('VALIDATION_ERROR', 'effectiveFrom/effectiveTo must be YYYY-MM-DD');
  }
  if (effectiveTo <= effectiveFrom) throw badRequest('VALIDATION_ERROR', 'effectiveTo must be after effectiveFrom');
  const today = now().slice(0, 10);
  const status = effectiveFrom <= today ? 'active' : 'pending_effect';
  const no = makeUniqueNo(getSetting('agreement_no_prefix') || 'NLG', 'dip_agreements');
  const info = db
    .prepare(
      `INSERT INTO dip_agreements (no, party_a, party_b, type, courtesies, courtesies_tw, covered_scope, covered_scope_tw, effective_from, effective_to, status, published, note, note_tw, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      no,
      partyA,
      partyB,
      body.type,
      String(body.courtesies || '').slice(0, 500),
      String(body.courtesiesTw || '').slice(0, 500) || null,
      String(body.coveredScope || '').slice(0, 300),
      String(body.coveredScopeTw || '').slice(0, 300) || null,
      effectiveFrom,
      effectiveTo,
      status,
      body.published ? 1 : 0,
      String(body.note || '').slice(0, 300),
      String(body.noteTw || '').slice(0, 300) || null,
      req.user.id,
      now(),
      now()
    );
  audit(req.user.id, 'dip:agreement.create', 'agreement', no, { status });
  res.status(201).json({ agreement: serializeAgreement(db.prepare('SELECT * FROM dip_agreements WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/agreements/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_agreements WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Agreement not found');
  if (row.status === 'terminated' || row.status === 'expired') {
    throw conflict('DIP_INVALID_STATE', 'Ended agreements cannot be edited');
  }
  const updates = {};
  const body = req.body || {};
  if (body.partyA !== undefined) updates.party_a = readString(body.partyA, { name: 'partyA', min: 2, max: 60 });
  if (body.partyB !== undefined) updates.party_b = readString(body.partyB, { name: 'partyB', min: 2, max: 60 });
  if (body.type !== undefined) {
    if (!AGREEMENT_TYPES.has(body.type)) throw badRequest('VALIDATION_ERROR', 'Invalid agreement type');
    updates.type = body.type;
  }
  if (body.courtesies !== undefined) updates.courtesies = String(body.courtesies || '').slice(0, 500);
  if (body.courtesiesTw !== undefined) updates.courtesies_tw = String(body.courtesiesTw || '').slice(0, 500) || null;
  if (body.coveredScope !== undefined) updates.covered_scope = String(body.coveredScope || '').slice(0, 300);
  if (body.coveredScopeTw !== undefined) updates.covered_scope_tw = String(body.coveredScopeTw || '').slice(0, 300) || null;
  if (body.note !== undefined) updates.note = String(body.note || '').slice(0, 300);
  if (body.noteTw !== undefined) updates.note_tw = String(body.noteTw || '').slice(0, 300) || null;
  if (body.published !== undefined) updates.published = body.published ? 1 : 0;
  const cols = Object.keys(updates);
  if (cols.length) {
    db.prepare(`UPDATE dip_agreements SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`).run({
      ...updates,
      ts: now(),
      id: row.id,
    });
  }
  audit(req.user.id, 'dip:agreement.update', 'agreement', row.no, { fields: cols });
  res.json({ agreement: serializeAgreement(db.prepare('SELECT * FROM dip_agreements WHERE id = ?').get(row.id)) });
});

// 生效 / 终止(协议变更需审计)
router.post('/agreements/:id/status', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_agreements WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Agreement not found');
  const target = String(req.body?.status || '');
  assertTransition('agreement', row.status, target, `Cannot move agreement from ${row.status} to ${target}`);
  const ts = now();
  db.prepare('UPDATE dip_agreements SET status = ?, updated_at = ? WHERE id = ?').run(target, ts, row.id);
  // 协议状态变更走 audit()(dip_events 仅用于建交/身份时间线),并通知命中的身份持有人
  if (target === 'active') {
    notifyUsersForAgreement(row);
  }
  audit(req.user.id, 'dip:agreement.status', 'agreement', row.no, { from: row.status, to: target });
  res.json({ agreement: serializeAgreement(db.prepare('SELECT * FROM dip_agreements WHERE id = ?').get(row.id)) });
});

// 协议生效时向协议双方实体名匹配到的有效身份持有人发通知(趣味化)
function notifyUsersForAgreement(row) {
  const holders = db
    .prepare("SELECT DISTINCT user_id FROM dip_identities WHERE entity_name IN (?, ?) AND status = 'active' AND deleted_at IS NULL")
    .all(row.party_a, row.party_b);
  for (const h of holders) {
    notify(
      h.user_id,
      'agreement_effective',
      { no: row.no, partyA: row.party_a, partyB: row.party_b, effectiveTo: row.effective_to },
      { agreementNo: row.no }
    );
  }
}

// ---------------------------------------------------------------------------
// Offices & notices
// ---------------------------------------------------------------------------

function serializeOffice(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    nameTw: row.name_tw,
    location: row.location,
    locationTw: row.location_tw,
    openHours: row.open_hours,
    openHoursTw: row.open_hours_tw,
    intro: row.intro,
    introTw: row.intro_tw,
    contact: row.contact,
    contactTw: row.contact_tw,
    services: row.services,
    servicesTw: row.services_tw,
    status: row.status,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

router.get('/offices', ...adminOnly, (_req, res) => {
  const rows = db.prepare('SELECT * FROM dip_offices ORDER BY sort_order, id').all();
  res.json({ items: rows.map(serializeOffice) });
});

router.post('/offices', ...adminOnly, (req, res) => {
  const body = req.body || {};
  const code = String(body.code || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{2,19}$/.test(code)) {
    throw badRequest('VALIDATION_ERROR', 'Office code must be 3-20 chars: A-Z, 0-9 or _');
  }
  const name = readString(body.name, { name: 'name', min: 2, max: 40 });
  const nameTw = readString(body.nameTw, { name: 'nameTw', min: 2, max: 40, optional: true });
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO dip_offices (code, name, name_tw, location, location_tw, open_hours, open_hours_tw, intro, intro_tw, contact, contact_tw, services, services_tw, status, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?)`
    )
    .run(
      code,
      name,
      nameTw,
      String(body.location || '').slice(0, 80),
      String(body.locationTw || '').slice(0, 80) || null,
      String(body.openHours || '').slice(0, 80),
      String(body.openHoursTw || '').slice(0, 80) || null,
      String(body.intro || '').slice(0, 500),
      String(body.introTw || '').slice(0, 500) || null,
      String(body.contact || '').slice(0, 200),
      String(body.contactTw || '').slice(0, 200) || null,
      String(body.services || '').slice(0, 300),
      String(body.servicesTw || '').slice(0, 300) || null,
      Number(body.sortOrder) || 0,
      ts,
      ts
    );
  audit(req.user.id, 'dip:office.create', 'office', code, {});
  res.status(201).json({ office: serializeOffice(db.prepare('SELECT * FROM dip_offices WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/offices/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_offices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Office not found');
  const body = req.body || {};
  const updates = {};
  if (body.name !== undefined) updates.name = readString(body.name, { name: 'name', min: 2, max: 40 });
  if (body.nameTw !== undefined) updates.name_tw = readString(body.nameTw, { name: 'nameTw', min: 2, max: 40, optional: true });
  if (body.location !== undefined) updates.location = String(body.location || '').slice(0, 80);
  if (body.locationTw !== undefined) updates.location_tw = String(body.locationTw || '').slice(0, 80) || null;
  if (body.openHours !== undefined) updates.open_hours = String(body.openHours || '').slice(0, 80);
  if (body.openHoursTw !== undefined) updates.open_hours_tw = String(body.openHoursTw || '').slice(0, 80) || null;
  if (body.intro !== undefined) updates.intro = String(body.intro || '').slice(0, 500);
  if (body.introTw !== undefined) updates.intro_tw = String(body.introTw || '').slice(0, 500) || null;
  if (body.contact !== undefined) updates.contact = String(body.contact || '').slice(0, 200);
  if (body.contactTw !== undefined) updates.contact_tw = String(body.contactTw || '').slice(0, 200) || null;
  if (body.services !== undefined) updates.services = String(body.services || '').slice(0, 300);
  if (body.servicesTw !== undefined) updates.services_tw = String(body.servicesTw || '').slice(0, 300) || null;
  if (body.sortOrder !== undefined) updates.sort_order = Number(body.sortOrder) || 0;
  const cols = Object.keys(updates);
  if (cols.length) {
    db.prepare(`UPDATE dip_offices SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`).run({
      ...updates,
      ts: now(),
      id: row.id,
    });
  }
  audit(req.user.id, 'dip:office.update', 'office', row.code, { fields: cols });
  res.json({ office: serializeOffice(db.prepare('SELECT * FROM dip_offices WHERE id = ?').get(row.id)) });
});

router.post('/offices/:id/status', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_offices WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Office not found');
  if (!OFFICE_STATUSES.has(req.body?.status)) throw badRequest('VALIDATION_ERROR', 'Invalid office status');
  db.prepare('UPDATE dip_offices SET status = ?, updated_at = ? WHERE id = ?').run(req.body.status, now(), row.id);
  audit(req.user.id, 'dip:office.status', 'office', row.code, { from: row.status, to: req.body.status });
  res.json({ office: serializeOffice(db.prepare('SELECT * FROM dip_offices WHERE id = ?').get(row.id)) });
});

function serializeNotice(row) {
  return {
    id: row.id,
    officeId: row.office_id,
    officeName: row.office_name ?? null,
    officeNameTw: row.office_name_tw ?? null,
    title: row.title,
    titleTw: row.title_tw,
    body: row.body,
    bodyTw: row.body_tw,
    level: row.level,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

const NOTICE_SELECT = `SELECT n.*, o.name AS office_name, o.name_tw AS office_name_tw FROM dip_notices n
  LEFT JOIN dip_offices o ON o.id = n.office_id WHERE n.deleted_at IS NULL`;

router.get('/notices', ...adminOnly, (_req, res) => {
  const rows = db.prepare(`${NOTICE_SELECT} ORDER BY n.updated_at DESC`).all();
  res.json({ items: rows.map(serializeNotice) });
});

function readNoticeFields(body) {
  const title = readString(body.title, { name: 'title', min: 2, max: 80 });
  const content = readString(body.body, { name: 'body', min: 2, max: 1000 });
  const titleTw = readString(body.titleTw, { name: 'titleTw', min: 2, max: 80, optional: true });
  const bodyTw = readString(body.bodyTw, { name: 'bodyTw', min: 2, max: 1000, optional: true });
  const level = ['info', 'warning', 'critical'].includes(body.level) ? body.level : 'info';
  const officeId = body.officeId ? Number(body.officeId) : null;
  if (officeId && !db.prepare('SELECT id FROM dip_offices WHERE id = ?').get(officeId)) {
    throw badRequest('VALIDATION_ERROR', 'Unknown officeId');
  }
  return { title, title_tw: titleTw, body: content, body_tw: bodyTw, level, office_id: officeId };
}

router.post('/notices', ...adminOnly, (req, res) => {
  const fields = readNoticeFields(req.body || {});
  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO dip_notices (office_id, title, title_tw, body, body_tw, level, status, published_at, created_at, updated_at)
       VALUES (@office_id, @title, @title_tw, @body, @body_tw, @level, 'published', @ts, @ts, @ts)`
    )
    .run({ ...fields, ts });
  audit(req.user.id, 'dip:notice.publish', 'notice', info.lastInsertRowid, { title: fields.title });
  res.status(201).json({ notice: serializeNotice(db.prepare(`${NOTICE_SELECT} AND n.id = ?`).get(info.lastInsertRowid)) });
});

router.patch('/notices/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_notices WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  const fields = readNoticeFields({ ...row, officeId: row.office_id, ...req.body });
  db.prepare('UPDATE dip_notices SET title = @title, title_tw = @title_tw, body = @body, body_tw = @body_tw, level = @level, office_id = @office_id, updated_at = @ts WHERE id = @id').run({
    ...fields,
    ts: now(),
    id: row.id,
  });
  audit(req.user.id, 'dip:notice.update', 'notice', row.id, {});
  res.json({ notice: serializeNotice(db.prepare(`${NOTICE_SELECT} AND n.id = ?`).get(row.id)) });
});

router.post('/notices/:id/offline', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_notices WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  db.prepare("UPDATE dip_notices SET status = 'offline', offline_at = ?, updated_at = ? WHERE id = ?").run(now(), now(), row.id);
  audit(req.user.id, 'dip:notice.offline', 'notice', row.id, {});
  res.json({ ok: true });
});

router.delete('/notices/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_notices WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Notice not found');
  db.prepare('UPDATE dip_notices SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user.id, 'dip:data.delete_notice', 'notice', row.id, {});
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Catalog config (对象类型 / 建交类型 / 身份类型 / 礼遇类型) + settings
// ---------------------------------------------------------------------------

router.get('/config', ...adminOnly, (_req, res) => {
  res.json({
    objectTypes: db.prepare('SELECT * FROM dip_object_types ORDER BY sort_order, id').all(),
    relationTypes: db.prepare('SELECT * FROM dip_relation_types ORDER BY sort_order, id').all(),
    identityTypes: db.prepare('SELECT * FROM dip_identity_types ORDER BY sort_order, id').all(),
    courtesyTypes: db.prepare('SELECT * FROM dip_courtesy_types ORDER BY sort_order, id').all(),
    settings: db.prepare('SELECT key, value, updated_at FROM dip_settings ORDER BY key').all(),
  });
});

const TYPE_TABLES = {
  object: 'dip_object_types',
  relation: 'dip_relation_types',
  identity: 'dip_identity_types',
};

router.patch('/config/types/:kind/:id', ...adminOnly, (req, res) => {
  const table = TYPE_TABLES[req.params.kind];
  if (!table) throw badRequest('VALIDATION_ERROR', 'Invalid type kind');
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(Number(req.params.id));
  if (!row) throw notFound('Type not found');
  const updates = {};
  const body = req.body || {};
  if (body.name !== undefined) updates.name = readString(body.name, { name: 'name', min: 2, max: 40 });
  if (body.nameTw !== undefined) updates.name_tw = readString(body.nameTw, { name: 'nameTw', min: 2, max: 40, optional: true });
  if (body.description !== undefined) updates.description = String(body.description || '').slice(0, 200);
  if (body.descriptionTw !== undefined) updates.description_tw = String(body.descriptionTw || '').slice(0, 200) || null;
  if (body.guide !== undefined) updates.guide = String(body.guide || '').slice(0, 1000);
  if (body.guideTw !== undefined) updates.guide_tw = String(body.guideTw || '').slice(0, 1000) || null;
  if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;
  if (body.sortOrder !== undefined) updates.sort_order = Number(body.sortOrder) || 0;
  if (body.validityDays !== undefined && req.params.kind === 'relation') {
    updates.validity_days = Math.max(1, Number(body.validityDays) || 365);
  }
  const cols = Object.keys(updates);
  if (cols.length) {
    db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`).run({
      ...updates,
      ts: now(),
      id: row.id,
    });
  }
  audit(req.user.id, 'dip:config.type_update', 'type', `${req.params.kind}:${row.code}`, { fields: cols });
  res.json({ ok: true });
});

router.patch('/config/courtesies/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_courtesy_types WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Courtesy type not found');
  const updates = {};
  if (req.body?.name !== undefined) updates.name = readString(req.body.name, { name: 'name', min: 2, max: 40 });
  if (req.body?.nameTw !== undefined) updates.name_tw = readString(req.body.nameTw, { name: 'nameTw', min: 2, max: 40, optional: true });
  if (req.body?.description !== undefined) updates.description = String(req.body.description || '').slice(0, 200);
  if (req.body?.descriptionTw !== undefined) updates.description_tw = String(req.body.descriptionTw || '').slice(0, 200) || null;
  if (req.body?.enabled !== undefined) updates.enabled = req.body.enabled ? 1 : 0;
  const cols = Object.keys(updates);
  if (cols.length) {
    db.prepare(`UPDATE dip_courtesy_types SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`).run({
      ...updates,
      ts: now(),
      id: row.id,
    });
  }
  audit(req.user.id, 'dip:config.courtesy_update', 'type', row.code, { fields: cols });
  res.json({ ok: true });
});

router.put('/config/settings', ...adminOnly, (req, res) => {
  const entries = Array.isArray(req.body?.items) ? req.body.items : [];
  for (const entry of entries) {
    if (!EDITABLE_SETTINGS.has(entry.key)) continue;
    db.prepare('UPDATE dip_settings SET value = ?, updated_at = ? WHERE key = ?').run(
      String(entry.value ?? '').slice(0, 500),
      now(),
      entry.key
    );
  }
  audit(req.user.id, 'dip:settings.update', 'settings', '', { keys: entries.map((e) => e.key) });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Verify logs / blacklist / stats / audit / templates
// ---------------------------------------------------------------------------

router.get('/verify-logs', ...adminOnly, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = [];
  const params = [];
  if (req.query.kind) {
    where.push('kind = ?');
    params.push(String(req.query.kind));
  }
  if (req.query.result) {
    where.push('result = ?');
    params.push(String(req.query.result));
  }
  if (req.query.q) {
    where.push('query LIKE ?');
    params.push(`%${String(req.query.q).trim()}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM dip_verify_logs ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM dip_verify_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ items: rows, total, page, pageSize });
});

router.get('/blacklist', ...adminOnly, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT b.*, u.username, u.display_name FROM dip_blacklist b
       JOIN users u ON u.id = b.user_id WHERE b.lifted_at IS NULL ORDER BY b.id DESC`
    )
    .all();
  res.json({ items: rows });
});

router.post('/blacklist', ...adminOnly, (req, res) => {
  const userId = Number(req.body?.userId);
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
  if (!user) throw badRequest('VALIDATION_ERROR', 'Unknown userId');
  const level = req.body?.level === 'block' ? 'block' : 'warn';
  const reason = readString(req.body?.reason, { name: 'reason', min: 2, max: 200 });
  const info = db
    .prepare('INSERT INTO dip_blacklist (user_id, reason, level, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, reason, level, req.user.id, now());
  audit(req.user.id, 'dip:blacklist.add', 'user', userId, { level, reason });
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.post('/blacklist/:id/lift', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_blacklist WHERE id = ? AND lifted_at IS NULL').get(Number(req.params.id));
  if (!row) throw notFound('Blacklist entry not found');
  db.prepare('UPDATE dip_blacklist SET lifted_at = ? WHERE id = ?').run(now(), row.id);
  audit(req.user.id, 'dip:blacklist.lift', 'user', row.user_id, {});
  res.json({ ok: true });
});

router.get('/stats', ...adminOnly, (_req, res) => {
  sweepAll();
  const relationCounts = {};
  for (const c of db.prepare('SELECT status, COUNT(*) AS n FROM dip_relations WHERE deleted_at IS NULL GROUP BY status').all()) {
    relationCounts[c.status] = c.n;
  }
  const identityCounts = {};
  for (const c of db.prepare('SELECT status, COUNT(*) AS n FROM dip_identities WHERE deleted_at IS NULL GROUP BY status').all()) {
    identityCounts[c.status] = c.n;
  }
  const submittedR =
    (relationCounts.pending_review || 0) + (relationCounts.supplement_required || 0) +
    (relationCounts.established || 0) + (relationCounts.rejected || 0) +
    (relationCounts.severed || 0) + (relationCounts.suspended || 0) + (relationCounts.sever_requested || 0);
  const establishedR = (relationCounts.established || 0) + (relationCounts.suspended || 0) + (relationCounts.sever_requested || 0);
  const rejectedR = relationCounts.rejected || 0;
  const supplements = db
    .prepare("SELECT COUNT(*) AS n FROM dip_events WHERE action IN ('require_supplement')")
    .get().n;

  const objectDistribution = db
    .prepare('SELECT object_type AS type, COUNT(*) AS n FROM dip_relations WHERE deleted_at IS NULL AND status != ? GROUP BY object_type ORDER BY n DESC')
    .all('draft');
  const identityTypeDistribution = db
    .prepare('SELECT identity_type AS type, COUNT(*) AS n FROM dip_identities WHERE deleted_at IS NULL AND status != ? GROUP BY identity_type ORDER BY n DESC')
    .all('draft');
  const agreementCounts = {};
  for (const c of db.prepare('SELECT status, COUNT(*) AS n FROM dip_agreements GROUP BY status').all()) {
    agreementCounts[c.status] = c.n;
  }
  const courtesyUsage = db
    .prepare(
      `SELECT c.courtesy_code AS code, t.name AS name, COUNT(*) AS n
       FROM dip_courtesy_records c LEFT JOIN dip_courtesy_types t ON t.code = c.courtesy_code
       GROUP BY c.courtesy_code ORDER BY n DESC`
    )
    .all();
  const rejectReasons = db
    .prepare(
      `SELECT reject_code AS reason, COUNT(*) AS n FROM (
         SELECT reject_code FROM dip_relations WHERE reject_code IS NOT NULL
         UNION ALL SELECT reject_code FROM dip_identities WHERE reject_code IS NOT NULL
       ) GROUP BY reject_code ORDER BY n DESC`
    )
    .all();

  const trend = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const relations = db.prepare('SELECT COUNT(*) AS n FROM dip_relations WHERE submitted_at LIKE ? AND deleted_at IS NULL').get(`${day}%`).n;
    const identities = db.prepare('SELECT COUNT(*) AS n FROM dip_identities WHERE submitted_at LIKE ? AND deleted_at IS NULL').get(`${day}%`).n;
    trend.push({ day, relations, identities });
  }

  res.json({
    relationCounts,
    identityCounts,
    submittedRelations: submittedR,
    established: establishedR,
    rejected: rejectedR,
    supplements,
    passRate: submittedR ? Math.round((establishedR / submittedR) * 100) : 0,
    rejectRate: submittedR ? Math.round((rejectedR / submittedR) * 100) : 0,
    supplementRate: submittedR ? Math.round((supplements / submittedR) * 100) : 0,
    identitiesActive: identityCounts.active || 0,
    agreementCounts,
    courtesyUsage,
    verifyQueries: db.prepare('SELECT COUNT(*) AS n FROM dip_verify_logs').get().n,
    verifyToday: db.prepare("SELECT COUNT(*) AS n FROM dip_verify_logs WHERE created_at LIKE ?").get(`${now().slice(0, 10)}%`).n,
    objectDistribution,
    identityTypeDistribution,
    rejectReasons,
    trend,
  });
});

router.get('/audit', ...adminOnly, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = [];
  const params = [];
  if (req.query.action) {
    where.push('a.action LIKE ?');
    params.push(`${String(req.query.action)}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM dip_audit_logs a ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.detail, a.created_at, a.actor_name,
              u.display_name AS actor
       FROM dip_audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       ${whereSql} ORDER BY a.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({
    items: rows.map((r) => ({ ...r, detail: JSON.parse(r.detail || '{}') })),
    total,
    page,
    pageSize,
  });
});

router.get('/templates', ...adminOnly, (_req, res) => {
  const rows = db.prepare('SELECT * FROM dip_message_templates ORDER BY id').all();
  res.json({
    items: rows.map((r) => ({
      id: r.id, code: r.code, title: r.title_template, body: r.body_template,
      titleTw: r.title_template_tw, bodyTw: r.body_template_tw,
      variables: r.variables, enabled: !!r.enabled, updatedAt: r.updated_at,
    })),
  });
});

router.put('/templates/:id', ...adminOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_message_templates WHERE id = ?').get(Number(req.params.id));
  if (!row) throw notFound('Template not found');
  const title = readString(req.body?.title, { name: 'title', min: 2, max: 120 });
  const body = readString(req.body?.body, { name: 'body', min: 2, max: 600 });
  const titleTw = readString(req.body?.titleTw, { name: 'titleTw', min: 2, max: 120, optional: true });
  const bodyTw = readString(req.body?.bodyTw, { name: 'bodyTw', min: 2, max: 600, optional: true });
  const enabled = req.body?.enabled === undefined ? !!row.enabled : !!req.body.enabled;
  db.prepare('UPDATE dip_message_templates SET title_template = ?, body_template = ?, title_template_tw = ?, body_template_tw = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
    title,
    body,
    titleTw,
    bodyTw,
    enabled ? 1 : 0,
    now(),
    row.id
  );
  audit(req.user.id, 'dip:template.update', 'template', row.code, {});
  res.json({ ok: true });
});

router.get('/messages', ...adminOnly, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = [];
  const params = [];
  if (req.query.userId) {
    where.push('m.user_id = ?');
    params.push(Number(req.query.userId));
  }
  if (req.query.template) {
    where.push('m.template_code = ?');
    params.push(String(req.query.template));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS n FROM dip_messages m ${whereSql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT m.id, m.template_code, m.title, m.title_tw, m.read, m.created_at, u.username
       FROM dip_messages m JOIN users u ON u.id = m.user_id ${whereSql} ORDER BY m.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, offset);
  res.json({ items: rows, total, page, pageSize });
});

// ---------------------------------------------------------------------------
// 自动审批:先建交后身份(身份生效依赖建交关系已 established)。
// ---------------------------------------------------------------------------
registerAutoApprover('dip', ({ cutoff, actor }) => {
  let processed = 0;
  const relations = db
    .prepare(
      `SELECT * FROM dip_relations
       WHERE status = 'pending_review' AND deleted_at IS NULL AND updated_at <= ?
       ORDER BY updated_at, id LIMIT 20`
    )
    .all(cutoff);
  for (const row of relations) {
    processed += safeAutoApprove('dip', `relation:${row.id}`, () => approveRelationCore(row, actor, { auto: true }));
  }
  const identities = db
    .prepare(
      `SELECT * FROM dip_identities
       WHERE status = 'pending_review' AND deleted_at IS NULL AND updated_at <= ?
       ORDER BY updated_at, id LIMIT 20`
    )
    .all(cutoff);
  for (const row of identities) {
    processed += safeAutoApprove('dip', `identity:${row.id}`, () => approveIdentityCore(row, actor, { auto: true }));
  }
  return processed;
});

export default router;
