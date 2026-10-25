// 奶龙国皇家外交事务署 — user-facing API (portal side).
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import multer from 'multer';
import { db, now } from '../db.js';
import { authenticate, requirePermission } from '../auth.js';
import { badRequest, notFound, readString, forbidden } from '../http.js';
import { ensureDipSchema, getSetting, getSettingInt } from './schema.js';
import {
  actorKey,
  assertNoDuplicateIdentity,
  assertNoDuplicateRelation,
  assertNotBlocked,
  assertTransition,
  audit,
  consumeRateLimit,
  logEvent,
  makeUniqueNo,
  maskAgreement,
  maskIdentity,
  maskRelation,
  notify,
  pageParams,
  sweepAll,
} from './util.js';

ensureDipSchema();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(
  process.env.NAILONG_DATA_DIR || path.join(__dirname, '..', 'data'),
  'uploads',
  'diplomacy'
);
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const router = Router();
const portalOnly = [authenticate, requirePermission('dip:portal')];

const OBJECT_TYPES = new Set(['VIRTUAL_NATION', 'CITY_STATE', 'FAN_COMMUNITY', 'VIRTUAL_ORG', 'EVENT_GROUP']);
const RELATION_TYPES = new Set(['FORMAL', 'FRIENDLY', 'OBSERVER']);
const IDENTITY_TYPES = new Set(['ENVOY', 'DIPLOMAT', 'HONORARY_CONSUL', 'FOREIGN_GUEST', 'OBSERVER']);
const PURPOSES = new Set(['display', 'cooperation', 'visa_channel']);
const MATERIAL_KINDS = new Set(['intro', 'proof', 'community', 'appointment', 'letter', 'other']);
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_TERM_DAYS = 365;

function parseCourtesies(value) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value)) throw badRequest('VALIDATION_ERROR', 'courtesies must be an array');
  const rows = db.prepare('SELECT code FROM dip_courtesy_types WHERE enabled = 1').all();
  const enabled = new Set(rows.map((r) => r.code));
  return [...new Set(value.map((v) => String(v)))].filter((code) => enabled.has(code)).slice(0, 6);
}

function serializeType(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    guide: row.guide,
    enabled: !!row.enabled,
    validityDays: row.validity_days,
    sortOrder: row.sort_order,
  };
}

function serializeNotice(row) {
  return {
    id: row.id,
    officeId: row.office_id,
    title: row.title,
    body: row.body,
    level: row.level,
    publishedAt: row.published_at,
  };
}

function serializeMaterial(row) {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    kind: row.kind,
    origin: row.origin,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    createdAt: row.created_at,
  };
}

function relationRow(id) {
  return db.prepare('SELECT * FROM dip_relations WHERE id = ? AND deleted_at IS NULL').get(Number(id));
}

function serializeRelation(row, { detail = false } = {}) {
  const base = {
    id: row.id,
    no: row.no,
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
    updatedAt: row.updated_at,
  };
  if (!detail) return base;
  base.entertainmentAgreed = !!row.entertainment_agreed;
  base.events = db
    .prepare(
      `SELECT e.action, e.note, e.created_at, u.display_name AS actor
       FROM dip_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.owner_type = 'relation' AND e.owner_id = ? ORDER BY e.id`
    )
    .all(row.id);
  base.materials = db
    .prepare(
      `SELECT * FROM dip_materials WHERE owner_type = 'relation' AND owner_id = ? AND deleted_at IS NULL ORDER BY id`
    )
    .all(row.id)
    .map(serializeMaterial);
  return base;
}

function identityRow(id) {
  return db.prepare('SELECT * FROM dip_identities WHERE id = ? AND deleted_at IS NULL').get(Number(id));
}

function serializeIdentity(row, { detail = false } = {}) {
  const base = {
    id: row.id,
    no: row.no,
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
    updatedAt: row.updated_at,
  };
  if (!detail) return base;
  base.entertainmentAgreed = !!row.entertainment_agreed;
  base.events = db
    .prepare(
      `SELECT e.action, e.note, e.created_at, u.display_name AS actor
       FROM dip_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.owner_type = 'identity' AND e.owner_id = ? ORDER BY e.id`
    )
    .all(row.id);
  base.materials = db
    .prepare(
      `SELECT * FROM dip_materials WHERE owner_type = 'identity' AND owner_id = ? AND deleted_at IS NULL ORDER BY id`
    )
    .all(row.id)
    .map(serializeMaterial);
  return base;
}

function ownRelation(req, id) {
  const row = relationRow(id);
  if (!row) throw notFound('Relation not found');
  if (row.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your application');
  return row;
}

function ownIdentity(req, id) {
  const row = identityRow(id);
  if (!row) throw notFound('Identity not found');
  if (row.user_id !== req.user.id) throw forbidden('FORBIDDEN', 'Not your application');
  return row;
}

function enabledType(table, code, set, label) {
  if (!set.has(code)) throw badRequest('VALIDATION_ERROR', `Invalid ${label}`);
  const row = db.prepare(`SELECT * FROM ${table} WHERE code = ? AND enabled = 1`).get(code);
  if (!row) throw badRequest('DIP_TYPE_CLOSED', `${label} ${code} is not open for applications`);
  return row;
}

// ---------------------------------------------------------------------------
// Overview / notices / catalog
// ---------------------------------------------------------------------------

router.get('/overview', ...portalOnly, (req, res) => {
  sweepAll();
  const notices = db
    .prepare(
      "SELECT * FROM dip_notices WHERE status = 'published' AND deleted_at IS NULL AND office_id IS NULL ORDER BY published_at DESC, id DESC LIMIT 6"
    )
    .all()
    .map(serializeNotice);
  const objectTypes = db.prepare('SELECT * FROM dip_object_types WHERE enabled = 1 ORDER BY sort_order, id').all().map(serializeType);
  const relationTypes = db.prepare('SELECT * FROM dip_relation_types WHERE enabled = 1 ORDER BY sort_order, id').all().map(serializeType);
  const courtesyTypes = db
    .prepare('SELECT code, name, description FROM dip_courtesy_types WHERE enabled = 1 ORDER BY sort_order, id')
    .all();
  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM dip_relations WHERE user_id = ? AND deleted_at IS NULL AND status IN ('pending_review','supplement_required')) AS relationsPending,
        (SELECT COUNT(*) FROM dip_relations WHERE user_id = ? AND deleted_at IS NULL AND status = 'established') AS relationsActive,
        (SELECT COUNT(*) FROM dip_identities WHERE user_id = ? AND deleted_at IS NULL AND status = 'active') AS identitiesActive,
        (SELECT COUNT(*) FROM dip_messages WHERE user_id = ? AND read = 0 AND archived = 0) AS unreadMessages`
    )
    .get(req.user.id, req.user.id, req.user.id, req.user.id);
  const agreementCount = db.prepare("SELECT COUNT(*) AS n FROM dip_agreements WHERE published = 1 AND status = 'active'").get().n;
  res.json({
    notices,
    objectTypes,
    relationTypes,
    courtesyTypes,
    agreementsActive: agreementCount,
    reviewHoursHint: getSettingInt('review_hours_hint', 72),
    disclaimer: { version: getSetting('disclaimer_version'), text: getSetting('disclaimer_text') },
    watermark: getSetting('watermark_text'),
    my: counts,
  });
});

router.get('/notices', ...portalOnly, (_req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM dip_notices WHERE status = 'published' AND deleted_at IS NULL AND office_id IS NULL ORDER BY published_at DESC, id DESC LIMIT 20"
    )
    .all();
  res.json({ items: rows.map(serializeNotice) });
});

// 服务目录: 各类型说明页数据(仅开放中的类型带 guide)
router.get('/types', ...portalOnly, (_req, res) => {
  res.json({
    objectTypes: db.prepare('SELECT * FROM dip_object_types ORDER BY sort_order, id').all().map(serializeType),
    relationTypes: db.prepare('SELECT * FROM dip_relation_types ORDER BY sort_order, id').all().map(serializeType),
    identityTypes: db.prepare('SELECT * FROM dip_identity_types ORDER BY sort_order, id').all().map(serializeType),
  });
});

// ---------------------------------------------------------------------------
// Relations (建交申请)
// ---------------------------------------------------------------------------

router.get('/relations', ...portalOnly, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const where = ['user_id = ?', 'deleted_at IS NULL'];
  const params = [req.user.id];
  if (req.query.status) {
    where.push('status = ?');
    params.push(String(req.query.status));
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM dip_relations WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM dip_relations WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ items: rows.map((r) => serializeRelation(r)), total, page, pageSize });
});

router.get('/relations/:id', ...portalOnly, (req, res) => {
  const row = ownRelation(req, req.params.id);
  res.json({ relation: serializeRelation(row, { detail: true }) });
});

function readRelationFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.objectType !== undefined) {
    out.object_type = String(body.objectType || '');
  }
  if (!partial || body.relationType !== undefined) {
    out.relation_type = String(body.relationType || '');
  }
  if (!partial || body.entityName !== undefined) {
    out.entity_name = readString(body.entityName, { name: 'entityName', min: 2, max: 60 });
  }
  if (!partial || body.repNickname !== undefined) {
    out.rep_nickname = readString(body.repNickname, { name: 'repNickname', min: 1, max: 40 });
  }
  if (!partial || body.contact !== undefined) {
    out.contact = readString(body.contact, { name: 'contact', min: 3, max: 60 });
  }
  if (body.reason !== undefined) out.reason = String(body.reason || '').trim().slice(0, 500);
  if (body.purpose !== undefined) {
    if (!PURPOSES.has(body.purpose)) throw badRequest('VALIDATION_ERROR', 'Invalid purpose');
    out.purpose = body.purpose;
  }
  if (body.courtesies !== undefined) out.courtesies = JSON.stringify(parseCourtesies(body.courtesies));
  return out;
}

router.post('/relations', ...portalOnly, (req, res) => {
  assertNotBlocked(req.user.id);
  const fields = readRelationFields(req.body || {});
  if (fields.object_type) enabledType('dip_object_types', fields.object_type, OBJECT_TYPES, 'objectType');
  if (fields.relation_type) enabledType('dip_relation_types', fields.relation_type, RELATION_TYPES, 'relationType');
  const ts = now();
  const no = makeUniqueNo(getSetting('relation_no_prefix') || 'NLD', 'dip_relations');
  const info = db
    .prepare(
      `INSERT INTO dip_relations (no, user_id, object_type, relation_type, entity_name, rep_nickname, contact, reason, courtesies, purpose, status, created_at, updated_at)
       VALUES (@no, @userId, @objectType, @relationType, @entityName, @repNickname, @contact, @reason, @courtesies, @purpose, 'draft', @ts, @ts)`
    )
    .run({
      no,
      userId: req.user.id,
      objectType: fields.object_type ?? '',
      relationType: fields.relation_type ?? '',
      entityName: fields.entity_name ?? '',
      repNickname: fields.rep_nickname ?? '',
      contact: fields.contact ?? '',
      reason: fields.reason ?? '',
      courtesies: fields.courtesies ?? '[]',
      purpose: fields.purpose ?? 'display',
      ts,
    });
  logEvent('relation', info.lastInsertRowid, 'create', req.user.id, `创建草稿 ${no}`);
  audit(req.user.id, 'dip:draft.create', 'relation', no, {});
  res.status(201).json({ relation: serializeRelation(relationRow(info.lastInsertRowid), { detail: true }) });
});

router.patch('/relations/:id', ...portalOnly, (req, res) => {
  const row = ownRelation(req, req.params.id);
  if (row.status !== 'draft') throw badRequest('DIP_INVALID_STATE', 'Only draft relations can be edited');
  const fields = readRelationFields(req.body || {}, { partial: true });
  if (fields.object_type) enabledType('dip_object_types', fields.object_type, OBJECT_TYPES, 'objectType');
  if (fields.relation_type) enabledType('dip_relation_types', fields.relation_type, RELATION_TYPES, 'relationType');
  const cols = Object.keys(fields);
  if (cols.length) {
    db.prepare(
      `UPDATE dip_relations SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`
    ).run({ ...fields, ts: now(), id: row.id });
  }
  res.json({ relation: serializeRelation(relationRow(row.id), { detail: true }) });
});

router.delete('/relations/:id', ...portalOnly, (req, res) => {
  const row = ownRelation(req, req.params.id);
  if (row.status !== 'draft') throw badRequest('DIP_INVALID_STATE', 'Only draft relations can be deleted');
  db.prepare('UPDATE dip_relations SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user.id, 'dip:data.delete_draft', 'relation', row.no, {});
  res.json({ ok: true });
});

router.post('/relations/:id/submit', ...portalOnly, (req, res) => {
  const row = ownRelation(req, req.params.id);
  if (row.status !== 'draft') throw badRequest('DIP_INVALID_STATE', 'Only draft relations can be submitted');
  assertNotBlocked(req.user.id);
  consumeRateLimit(actorKey(req), 'dip:submit');
  assertNoDuplicateRelation(req.user.id);
  if (!row.entity_name || !row.rep_nickname || !row.contact || !row.reason) {
    throw badRequest('DIP_INCOMPLETE', 'Relation application is incomplete');
  }
  if (!row.object_type || !row.relation_type) throw badRequest('DIP_INCOMPLETE', 'Choose object type and relation type first');
  enabledType('dip_object_types', row.object_type, OBJECT_TYPES, 'objectType');
  enabledType('dip_relation_types', row.relation_type, RELATION_TYPES, 'relationType');
  const materials = db
    .prepare("SELECT COUNT(*) AS n FROM dip_materials WHERE owner_type = 'relation' AND owner_id = ? AND deleted_at IS NULL")
    .get(row.id).n;
  if (materials < 1) throw badRequest('DIP_MATERIAL_REQUIRED', 'At least one supporting material is required');
  if (!req.body?.confirmEntertainment) {
    throw badRequest('DIP_CONFIRM_REQUIRED', 'The entertainment disclaimer must be accepted');
  }
  const ts = now();
  db.prepare(
    "UPDATE dip_relations SET status = 'pending_review', entertainment_agreed = 1, submitted_at = ?, updated_at = ? WHERE id = ?"
  ).run(ts, ts, row.id);
  logEvent('relation', row.id, 'submit', req.user.id, '');
  notify(req.user.id, 'relation_submitted', { no: row.no, hours: getSettingInt('review_hours_hint', 72) }, { relationNo: row.no });
  audit(req.user.id, 'dip:relation.submit', 'relation', row.no, {});
  res.json({ relation: serializeRelation(relationRow(row.id), { detail: true }) });
});

router.post('/relations/:id/withdraw', ...portalOnly, (req, res) => {
  const row = ownRelation(req, req.params.id);
  assertTransition('relation', row.status, 'withdrawn', 'Only pending relations can be withdrawn');
  db.prepare("UPDATE dip_relations SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(now(), row.id);
  logEvent('relation', row.id, 'withdraw', req.user.id, '');
  audit(req.user.id, 'dip:relation.withdraw', 'relation', row.no, {});
  res.json({ relation: serializeRelation(relationRow(row.id), { detail: true }) });
});

router.post('/relations/:id/supplement', ...portalOnly, (req, res) => {
  const row = ownRelation(req, req.params.id);
  if (row.status !== 'supplement_required') {
    throw badRequest('DIP_INVALID_STATE', 'This relation is not awaiting supplements');
  }
  consumeRateLimit(actorKey(req), 'dip:supplement');
  const content = readString(req.body?.content, { name: 'content', min: 1, max: 500 });
  const ts = now();
  db.prepare("UPDATE dip_relations SET status = 'pending_review', supplement_content = ?, updated_at = ? WHERE id = ?").run(
    content,
    ts,
    row.id
  );
  logEvent('relation', row.id, 'supplement_submit', req.user.id, content);
  notify(req.user.id, 'relation_supplement_received', { no: row.no }, { relationNo: row.no });
  res.json({ relation: serializeRelation(relationRow(row.id), { detail: true }) });
});

// 断交申请: 已建交 → 断交复核中(管理端确认后正式断交)
router.post('/relations/:id/sever', ...portalOnly, (req, res) => {
  const row = ownRelation(req, req.params.id);
  assertTransition('relation', row.status, 'sever_requested', 'Only established relations can request severance');
  const reason = readString(req.body?.reason, { name: 'reason', min: 2, max: 300 });
  const ts = now();
  db.prepare("UPDATE dip_relations SET status = 'sever_requested', sever_reason = ?, updated_at = ? WHERE id = ?").run(
    reason,
    ts,
    row.id
  );
  logEvent('relation', row.id, 'sever_request', req.user.id, reason);
  notify(req.user.id, 'relation_sever_request', { no: row.no }, { relationNo: row.no });
  audit(req.user.id, 'dip:relation.sever_request', 'relation', row.no, { reason });
  res.json({ relation: serializeRelation(relationRow(row.id), { detail: true }) });
});

// ---------------------------------------------------------------------------
// Identities (外交身份)
// ---------------------------------------------------------------------------

router.get('/identities', ...portalOnly, (req, res) => {
  sweepAll();
  const { page, pageSize, offset } = pageParams(req.query);
  const where = ['user_id = ?', 'deleted_at IS NULL'];
  const params = [req.user.id];
  if (req.query.status) {
    where.push('status = ?');
    params.push(String(req.query.status));
  }
  const total = db.prepare(`SELECT COUNT(*) AS n FROM dip_identities WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM dip_identities WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ items: rows.map((r) => serializeIdentity(r)), total, page, pageSize });
});

router.get('/identities/:id', ...portalOnly, (req, res) => {
  const row = ownIdentity(req, req.params.id);
  res.json({ identity: serializeIdentity(row, { detail: true }) });
});

// 外交身份卡(含验真 token 的二维码路径 + 水印文案)
router.get('/identities/:id/card', ...portalOnly, (req, res) => {
  const row = ownIdentity(req, req.params.id);
  const typeName = db.prepare('SELECT name FROM dip_identity_types WHERE code = ?').get(row.identity_type)?.name || row.identity_type;
  res.json({
    card: {
      no: row.no,
      identityType: row.identity_type,
      identityTypeName: typeName,
      entityName: row.entity_name,
      title: row.title,
      holder: row.nickname,
      termStart: row.term_start,
      termEnd: row.term_end,
      status: row.status,
      verifyPath: row.verify_token ? `/dip/verify?token=${row.verify_token}` : null,
      watermark: getSetting('watermark_text'),
      disclaimer: getSetting('disclaimer_text'),
    },
  });
});

function readIdentityFields(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.identityType !== undefined) {
    out.identity_type = String(body.identityType || '');
  }
  if (!partial || body.relationId !== undefined) {
    out.relation_id = body.relationId ? Number(body.relationId) : null;
  }
  if (!partial || body.nickname !== undefined) {
    out.nickname = readString(body.nickname, { name: 'nickname', min: 1, max: 40 });
  }
  if (!partial || body.contact !== undefined) {
    out.contact = readString(body.contact, { name: 'contact', min: 3, max: 60 });
  }
  if (body.title !== undefined) out.title = String(body.title || '').trim().slice(0, 60);
  if (body.termStart !== undefined) out.term_start = String(body.termStart || '').slice(0, 10) || null;
  if (body.termEnd !== undefined) out.term_end = String(body.termEnd || '').slice(0, 10) || null;
  return out;
}

function resolveRelationForIdentity(userId, relationId) {
  if (!relationId) throw badRequest('DIP_RELATION_REQUIRED', 'Link an established relation first');
  const rel = db
    .prepare("SELECT * FROM dip_relations WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
    .get(relationId, userId);
  if (!rel) throw notFound('Relation not found');
  if (rel.status !== 'established') {
    throw badRequest('DIP_RELATION_NOT_ESTABLISHED', 'The linked relation must be established first');
  }
  return rel;
}

router.post('/identities', ...portalOnly, (req, res) => {
  assertNotBlocked(req.user.id);
  const fields = readIdentityFields(req.body || {});
  if (fields.identity_type) enabledType('dip_identity_types', fields.identity_type, IDENTITY_TYPES, 'identityType');
  let relation = null;
  if (fields.relation_id) relation = resolveRelationForIdentity(req.user.id, fields.relation_id);
  const maxIds = getSettingInt('max_identities_per_user', 3);
  const owned = db
    .prepare("SELECT COUNT(*) AS n FROM dip_identities WHERE user_id = ? AND deleted_at IS NULL AND status IN ('active','frozen','pending_review','supplement_required')")
    .get(req.user.id).n;
  if (owned >= maxIds) throw conflict('DIP_IDENTITY_LIMIT', `At most ${maxIds} concurrent diplomatic identities`);

  const ts = now();
  const no = makeUniqueNo(getSetting('identity_no_prefix') || 'NLE', 'dip_identities');
  const info = db
    .prepare(
      `INSERT INTO dip_identities (no, user_id, identity_type, relation_id, relation_no, entity_name, nickname, contact, title, term_start, term_end, status, created_at, updated_at)
       VALUES (@no, @userId, @identityType, @relationId, @relationNo, @entityName, @nickname, @contact, @title, @termStart, @termEnd, 'draft', @ts, @ts)`
    )
    .run({
      no,
      userId: req.user.id,
      identityType: fields.identity_type ?? '',
      relationId: relation?.id ?? null,
      relationNo: relation?.no ?? '',
      entityName: relation?.entity_name ?? '',
      nickname: fields.nickname ?? '',
      contact: fields.contact ?? '',
      title: fields.title ?? '',
      termStart: fields.term_start ?? null,
      termEnd: fields.term_end ?? null,
      ts,
    });
  logEvent('identity', info.lastInsertRowid, 'create', req.user.id, `创建草稿 ${no}`);
  audit(req.user.id, 'dip:draft.create', 'identity', no, {});
  res.status(201).json({ identity: serializeIdentity(identityRow(info.lastInsertRowid), { detail: true }) });
});

router.patch('/identities/:id', ...portalOnly, (req, res) => {
  const row = ownIdentity(req, req.params.id);
  if (row.status !== 'draft') throw badRequest('DIP_INVALID_STATE', 'Only draft identities can be edited');
  const fields = readIdentityFields(req.body || {}, { partial: true });
  if (fields.identity_type) enabledType('dip_identity_types', fields.identity_type, IDENTITY_TYPES, 'identityType');
  if (fields.relation_id) {
    const rel = resolveRelationForIdentity(req.user.id, fields.relation_id);
    fields.relation_no = rel.no;
    fields.entity_name = rel.entity_name;
  }
  const cols = Object.keys(fields);
  if (cols.length) {
    db.prepare(
      `UPDATE dip_identities SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`
    ).run({ ...fields, ts: now(), id: row.id });
  }
  res.json({ identity: serializeIdentity(identityRow(row.id), { detail: true }) });
});

router.delete('/identities/:id', ...portalOnly, (req, res) => {
  const row = ownIdentity(req, req.params.id);
  if (row.status !== 'draft') throw badRequest('DIP_INVALID_STATE', 'Only draft identities can be deleted');
  db.prepare('UPDATE dip_identities SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), row.id);
  audit(req.user.id, 'dip:data.delete_draft', 'identity', row.no, {});
  res.json({ ok: true });
});

router.post('/identities/:id/submit', ...portalOnly, (req, res) => {
  const row = ownIdentity(req, req.params.id);
  if (row.status !== 'draft') throw badRequest('DIP_INVALID_STATE', 'Only draft identities can be submitted');
  assertNotBlocked(req.user.id);
  consumeRateLimit(actorKey(req), 'dip:identity_submit');
  assertNoDuplicateIdentity(req.user.id);
  if (!row.nickname || !row.contact || !row.identity_type) {
    throw badRequest('DIP_INCOMPLETE', 'Identity application is incomplete');
  }
  enabledType('dip_identity_types', row.identity_type, IDENTITY_TYPES, 'identityType');
  resolveRelationForIdentity(req.user.id, row.relation_id);
  if (!row.term_start || !row.term_end) throw badRequest('DIP_TERM_REQUIRED', 'Term start and end are required');
  if (row.term_end <= row.term_start) throw badRequest('VALIDATION_ERROR', 'termEnd must be after termStart');
  const termDays = Math.round((new Date(row.term_end) - new Date(row.term_start)) / 86400000);
  if (termDays > MAX_TERM_DAYS) throw badRequest('DIP_TERM_TOO_LONG', `Term cannot exceed ${MAX_TERM_DAYS} days`);
  const materials = db
    .prepare("SELECT COUNT(*) AS n FROM dip_materials WHERE owner_type = 'identity' AND owner_id = ? AND deleted_at IS NULL")
    .get(row.id).n;
  if (materials < 1) throw badRequest('DIP_MATERIAL_REQUIRED', 'At least one supporting material (appointment letter) is required');
  if (!req.body?.confirmEntertainment) {
    throw badRequest('DIP_CONFIRM_REQUIRED', 'The entertainment disclaimer must be accepted');
  }
  const ts = now();
  db.prepare(
    "UPDATE dip_identities SET status = 'pending_review', entertainment_agreed = 1, submitted_at = ?, updated_at = ? WHERE id = ?"
  ).run(ts, ts, row.id);
  logEvent('identity', row.id, 'submit', req.user.id, '');
  notify(req.user.id, 'identity_submitted', { no: row.no, hours: getSettingInt('review_hours_hint', 72) }, { identityNo: row.no });
  audit(req.user.id, 'dip:identity.submit', 'identity', row.no, {});
  res.json({ identity: serializeIdentity(identityRow(row.id), { detail: true }) });
});

router.post('/identities/:id/withdraw', ...portalOnly, (req, res) => {
  const row = ownIdentity(req, req.params.id);
  assertTransition('identity', row.status, 'withdrawn', 'Only pending identities can be withdrawn');
  db.prepare("UPDATE dip_identities SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(now(), row.id);
  logEvent('identity', row.id, 'withdraw', req.user.id, '');
  audit(req.user.id, 'dip:identity.withdraw', 'identity', row.no, {});
  res.json({ identity: serializeIdentity(identityRow(row.id), { detail: true }) });
});

router.post('/identities/:id/supplement', ...portalOnly, (req, res) => {
  const row = ownIdentity(req, req.params.id);
  if (row.status !== 'supplement_required') {
    throw badRequest('DIP_INVALID_STATE', 'This identity is not awaiting supplements');
  }
  consumeRateLimit(actorKey(req), 'dip:supplement');
  const content = readString(req.body?.content, { name: 'content', min: 1, max: 500 });
  const ts = now();
  db.prepare("UPDATE dip_identities SET status = 'pending_review', supplement_content = ?, updated_at = ? WHERE id = ?").run(
    content,
    ts,
    row.id
  );
  logEvent('identity', row.id, 'supplement_submit', req.user.id, content);
  notify(req.user.id, 'identity_supplement_received', { no: row.no }, { identityNo: row.no });
  res.json({ identity: serializeIdentity(identityRow(row.id), { detail: true }) });
});

// ---------------------------------------------------------------------------
// Materials (私有存储,受控下载)
// ---------------------------------------------------------------------------

function ownerForMaterial(req, ownerType, ownerId) {
  if (ownerType === 'relation') return ownRelation(req, ownerId);
  if (ownerType === 'identity') return ownIdentity(req, ownerId);
  throw badRequest('VALIDATION_ERROR', 'Invalid owner type');
}

router.post('/materials/:ownerType/:ownerId', ...portalOnly, (req, res) => {
  const owner = ownerForMaterial(req, req.params.ownerType, Number(req.params.ownerId));
  if (!['draft', 'pending_review', 'supplement_required'].includes(owner.status)) {
    throw badRequest('DIP_INVALID_STATE', 'Materials are closed for this application');
  }
  upload.single('file')(req, res, (err) => {
    if (err) {
      const code = err?.code === 'LIMIT_FILE_SIZE' ? 'DIP_FILE_TOO_LARGE' : 'DIP_FILE_TYPE';
      return res.status(400).json({ code, message: code === 'DIP_FILE_TOO_LARGE' ? 'File exceeds 5MB' : 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'file is required' });
    if (!ALLOWED_MIME.includes(req.file.mimetype)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ code: 'DIP_FILE_TYPE', message: 'Only images and PDF are allowed' });
    }
    const kind = MATERIAL_KINDS.has(req.body?.kind) ? req.body.kind : 'other';
    const origin = owner.status === 'supplement_required' ? 'supplement' : 'initial';
    const info = db
      .prepare(
        `INSERT INTO dip_materials (owner_type, owner_id, user_id, kind, origin, filename, mime, size, path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.params.ownerType, owner.id, req.user.id, kind, origin, req.file.originalname.slice(0, 120), req.file.mimetype, req.file.size, req.file.filename, now());
    res.status(201).json({
      material: serializeMaterial(
        db.prepare('SELECT * FROM dip_materials WHERE id = ?').get(info.lastInsertRowid)
      ),
    });
  });
});

router.get('/materials/:id/download', authenticate, (req, res) => {
  const mat = db.prepare('SELECT * FROM dip_materials WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!mat) throw notFound('Material not found');
  const table = mat.owner_type === 'relation' ? 'dip_relations' : 'dip_identities';
  const owner = db.prepare(`SELECT user_id, no FROM ${table} WHERE id = ?`).get(mat.owner_id);
  const owned = owner?.user_id === req.user.id;
  const canReview = req.user.permissions.includes('dip:review') || req.user.permissions.includes('dip:admin');
  if (!owned && !canReview) throw forbidden('FORBIDDEN', 'No access to this file');
  const filePath = path.join(uploadDir, mat.path);
  if (!fs.existsSync(filePath)) throw notFound('File missing on disk');
  audit(req.user.id, 'dip:file.access', 'material', mat.id, { ownerNo: owner?.no, name: mat.filename });
  res.download(filePath, mat.filename);
});

router.delete('/materials/:id', ...portalOnly, (req, res) => {
  const mat = db.prepare('SELECT * FROM dip_materials WHERE id = ? AND deleted_at IS NULL').get(Number(req.params.id));
  if (!mat) throw notFound('Material not found');
  const owner = ownerForMaterial(req, mat.owner_type, mat.owner_id);
  if (!['draft', 'pending_review', 'supplement_required'].includes(owner.status)) {
    throw badRequest('DIP_INVALID_STATE', 'Materials are locked for this application');
  }
  db.prepare('UPDATE dip_materials SET deleted_at = ? WHERE id = ?').run(now(), mat.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Agreements (互免协议, 公示 + 我的互免资格查询)
// ---------------------------------------------------------------------------

router.get('/agreements', ...portalOnly, (_req, res) => {
  sweepAll();
  const rows = db
    .prepare(
      "SELECT * FROM dip_agreements WHERE published = 1 AND status IN ('active','pending_effect') ORDER BY effective_from DESC, id DESC LIMIT 50"
    )
    .all();
  res.json({
    items: rows.map((r) => ({
      no: r.no,
      partyA: r.party_a,
      partyB: r.party_b,
      type: r.type,
      courtesies: r.courtesies,
      coveredScope: r.covered_scope,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      status: r.status,
      note: r.note,
    })),
  });
});

router.get('/agreements/:no', ...portalOnly, (req, res) => {
  sweepAll();
  const row = db.prepare('SELECT * FROM dip_agreements WHERE no = ? AND published = 1').get(String(req.params.no).toUpperCase());
  if (!row) throw notFound('Agreement not found');
  res.json({
    agreement: {
      no: row.no,
      partyA: row.party_a,
      partyB: row.party_b,
      type: row.type,
      courtesies: row.courtesies,
      coveredScope: row.covered_scope,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      status: row.status,
      note: row.note,
    },
  });
});

// 我的互免资格: 凭建交编号 / 外交身份编号查询命中的生效协议
router.post('/agreements/eligibility', ...portalOnly, (req, res) => {
  consumeRateLimit(actorKey(req), 'dip:eligibility');
  sweepAll();
  const code = readString(req.body?.code, { name: 'code', min: 6, max: 40 }).toUpperCase();
  let entity = null;
  let source = null;
  const rel = db.prepare('SELECT * FROM dip_relations WHERE no = ? AND user_id = ? AND deleted_at IS NULL').get(code, req.user.id);
  const idt = rel ? null : db.prepare('SELECT * FROM dip_identities WHERE no = ? AND user_id = ? AND deleted_at IS NULL').get(code, req.user.id);
  if (rel) {
    source = 'relation';
    if (rel.status !== 'established') throw badRequest('DIP_NOT_ELIGIBLE', 'The relation is not currently established');
    entity = rel.entity_name;
  } else if (idt) {
    source = 'identity';
    if (idt.status !== 'active') throw badRequest('DIP_NOT_ELIGIBLE', 'The diplomatic identity is not currently active');
    entity = idt.entity_name;
  } else {
    throw notFound('Unknown relation or identity number');
  }
  const rows = db
    .prepare(
      "SELECT * FROM dip_agreements WHERE status = 'active' AND (party_a = ? OR party_b = ?) ORDER BY effective_from DESC"
    )
    .all(entity, entity);
  res.json({
    code,
    source,
    entity,
    items: rows.map((r) => ({
      no: r.no,
      partyA: r.party_a,
      partyB: r.party_b,
      type: r.type,
      courtesies: r.courtesies,
      coveredScope: r.covered_scope,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
    })),
    disclaimer: '互免协议仅供娱乐展示,不承诺现实效力。',
  });
});

// ---------------------------------------------------------------------------
// Offices (虚构代表处展示)
// ---------------------------------------------------------------------------

router.get('/offices', ...portalOnly, (_req, res) => {
  const rows = db.prepare("SELECT * FROM dip_offices WHERE status != 'closed' ORDER BY sort_order, id").all();
  res.json({
    items: rows.map((r) => ({
      code: r.code,
      name: r.name,
      location: r.location,
      openHours: r.open_hours,
      status: r.status,
      intro: r.intro,
    })),
  });
});

router.get('/offices/:code', ...portalOnly, (req, res) => {
  const row = db.prepare('SELECT * FROM dip_offices WHERE code = ?').get(String(req.params.code).toUpperCase());
  if (!row) throw notFound('Office not found');
  const notices = db
    .prepare(
      "SELECT * FROM dip_notices WHERE office_id = ? AND status = 'published' AND deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT 10"
    )
    .all(row.id)
    .map(serializeNotice);
  res.json({
    office: {
      code: row.code,
      name: row.name,
      location: row.location,
      openHours: row.open_hours,
      intro: row.intro,
      contact: row.contact,
      services: row.services,
      status: row.status,
    },
    notices,
  });
});

// ---------------------------------------------------------------------------
// Courtesies (外交礼遇)
// ---------------------------------------------------------------------------

router.get('/courtesies', ...portalOnly, (req, res) => {
  const types = db.prepare('SELECT code, name, description FROM dip_courtesy_types WHERE enabled = 1 ORDER BY sort_order, id').all();
  const records = db
    .prepare(
      `SELECT c.id, c.identity_no, c.courtesy_code, c.source, c.note, c.created_at, t.name AS courtesy_name
       FROM dip_courtesy_records c
       LEFT JOIN dip_courtesy_types t ON t.code = c.courtesy_code
       WHERE c.user_id = ? ORDER BY c.id DESC LIMIT 100`
    )
    .all(req.user.id);
  res.json({ types, items: records });
});

// 礼遇资格查询: 凭外交身份编号
router.post('/courtesies/check', ...portalOnly, (req, res) => {
  consumeRateLimit(actorKey(req), 'dip:courtesy_check');
  sweepAll();
  const code = readString(req.body?.code, { name: 'code', min: 6, max: 40 }).toUpperCase();
  const row = db.prepare('SELECT * FROM dip_identities WHERE no = ? AND deleted_at IS NULL').get(code);
  if (!row || row.user_id !== req.user.id) throw notFound('Unknown identity number');
  if (row.status !== 'active') throw badRequest('DIP_NOT_ELIGIBLE', 'The diplomatic identity is not currently active');
  const types = db.prepare('SELECT code, name, description FROM dip_courtesy_types WHERE enabled = 1 ORDER BY sort_order, id').all();
  const records = db
    .prepare('SELECT courtesy_code, source, note, created_at FROM dip_courtesy_records WHERE identity_id = ? ORDER BY id DESC')
    .all(row.id);
  res.json({ code, entityName: row.entity_name, termEnd: row.term_end, types, records });
});

// ---------------------------------------------------------------------------
// Messages (站内信)
// ---------------------------------------------------------------------------

router.get('/messages', ...portalOnly, (req, res) => {
  const { page, pageSize, offset } = pageParams(req.query);
  const filter = String(req.query.filter || 'all');
  const where = ['user_id = ?'];
  if (filter === 'unread') where.push('read = 0', 'archived = 0');
  else if (filter === 'archived') where.push('archived = 1');
  else where.push('archived = 0');
  const params = [req.user.id];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM dip_messages WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db
    .prepare(`SELECT * FROM dip_messages WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  const unread = db
    .prepare('SELECT COUNT(*) AS n FROM dip_messages WHERE user_id = ? AND read = 0 AND archived = 0')
    .get(req.user.id).n;
  res.json({
    items: rows.map((m) => ({
      id: m.id,
      templateCode: m.template_code,
      title: m.title,
      body: m.body,
      related: JSON.parse(m.related || '{}'),
      read: !!m.read,
      createdAt: m.created_at,
    })),
    total,
    page,
    pageSize,
    unreadCount: unread,
  });
});

router.post('/messages/:id/read', ...portalOnly, (req, res) => {
  db.prepare('UPDATE dip_messages SET read = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/read-all', ...portalOnly, (req, res) => {
  db.prepare('UPDATE dip_messages SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/archive', ...portalOnly, (req, res) => {
  db.prepare('UPDATE dip_messages SET archived = 1 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

router.post('/messages/:id/unarchive', ...portalOnly, (req, res) => {
  db.prepare('UPDATE dip_messages SET archived = 0 WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Public verify (验真中心 — 无需登录, 限流, 脱敏)
// ---------------------------------------------------------------------------

function publicVerify(code, ip) {
  sweepAll();
  const query = String(code || '').trim().toUpperCase();
  let result = null;
  if (query.startsWith(getSetting('relation_no_prefix') || 'NLD')) {
    const row = db.prepare('SELECT * FROM dip_relations WHERE no = ? AND deleted_at IS NULL').get(query);
    result = row ? maskRelation(row) : null;
  } else if (query.startsWith(getSetting('identity_no_prefix') || 'NLE')) {
    const row = db.prepare('SELECT * FROM dip_identities WHERE no = ? AND deleted_at IS NULL').get(query);
    result = row ? maskIdentity(row) : null;
  } else if (query.startsWith(getSetting('agreement_no_prefix') || 'NLG')) {
    const row = db.prepare('SELECT * FROM dip_agreements WHERE no = ?').get(query);
    result = row ? maskAgreement(row) : null;
  }
  db.prepare('INSERT INTO dip_verify_logs (query, kind, ip, result, created_at) VALUES (?, ?, ?, ?, ?)').run(
    query,
    result?.kind ?? '',
    ip || '',
    result ? (result.valid ? 'valid' : `status_${result.status}`) : 'not_found',
    now()
  );
  return result;
}

router.post('/verify', (req, res) => {
  consumeRateLimit(`ip:${req.ip || 'unknown'}`, 'dip:public_verify');
  const code = readString(req.body?.code, { name: 'code', min: 6, max: 40 });
  const result = publicVerify(code, req.ip);
  if (!result) {
    // 防枚举: 统一返回 not_found,不区分编号格式错误
    return res.json({ found: false, disclaimer: getSetting('disclaimer_text') });
  }
  res.json({ found: true, item: result, disclaimer: getSetting('disclaimer_text') });
});

// 扫码验真(身份卡二维码 token)
router.get('/verify', (req, res) => {
  consumeRateLimit(`ip:${req.ip || 'unknown'}`, 'dip:public_verify');
  const token = String(req.query.token || '');
  if (!/^[0-9a-f]{32}$/.test(token)) throw notFound('Unknown verify token');
  sweepAll();
  const row = db.prepare('SELECT * FROM dip_identities WHERE verify_token = ? AND deleted_at IS NULL').get(token);
  db.prepare('INSERT INTO dip_verify_logs (query, kind, ip, result, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'token:*',
    row ? 'identity' : '',
    req.ip || '',
    row ? (row.status === 'active' ? 'valid' : `status_${row.status}`) : 'not_found',
    now()
  );
  if (!row) return res.json({ found: false, disclaimer: getSetting('disclaimer_text') });
  res.json({ found: true, item: maskIdentity(row), disclaimer: getSetting('disclaimer_text') });
});

export default router;
