// 跨署联动总线 — 各署同进程、共用一个 SQLite,内部联动直接读写对方台账,
// 不再自己 HTTP 调自己。对外仍保留各署 /api/*/inter 路由,供未来独立部署的
// 服务以服务令牌调用。
//
// 约定:
//   - verifyBusinessRecord(bizType, code, userId) 只读校验,返回脱敏快照;
//   - businessSnapshot(bizType, code)              申诉署只读关联业务链路;
//   - writebackBusiness(...)                       申诉决定回写业务署(只重开被驳回件);
//   - sampleBusinessRecords(...)                   监察抽查跨署审核记录。
import { db, now } from './db.js';

export const LINKED_OFFICES = {
  visa: '奶龍國簽註申請署',
  immigration: '皇家口岸入境署',
  resident: '皇家居民登記署',
  diplomatic: '皇家外交事務署',
  document: '皇家文書與認證署',
  protocol: '皇家禮賓與活動署',
  appeal: '皇家申訴與監察署',
};

// 文书署 doc_types.biz_source → 联动业务类型
export const BIZ_SOURCE_TO_TYPE = {
  visa: 'visa',
  protocol: 'protocol',
  entry: 'immigration',
  resident: 'resident',
  foreign: 'diplomatic',
  appeal: 'appeal',
};

const APPEAL_BIZ_TYPES = ['visa', 'immigration', 'resident', 'diplomatic', 'document'];

const VISA_PERMIT_APPEALABLE = new Set(['voided', 'expired']);
const VISA_APP_APPEALABLE = new Set(['rejected', 'closed', 'approved', 'issued']);
const IMM_DECL_APPEALABLE = new Set(['rejected', 'approved', 'entered', 'exited']);
const RES_CARD_APPEALABLE = new Set(['frozen', 'voided', 'expired']);
const RES_APP_APPEALABLE = new Set(['rejected', 'closed', 'approved']);
const RES_CHANGE_APPEALABLE = new Set(['rejected']);
const DIP_RELATION_APPEALABLE = new Set(['rejected', 'suspended', 'severed']);
const DIP_IDENTITY_APPEALABLE = new Set(['rejected', 'frozen', 'revoked', 'expired']);
const DOC_APP_APPEALABLE = new Set(['rejected', 'approved']);
const DOC_CERT_APPEALABLE = new Set(['voided', 'expired']);

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function maskName(name = '') {
  const value = String(name || '');
  if (value.length <= 1) return value;
  return `${value.slice(0, 1)}***`;
}

function isPast(date) {
  return !!date && date < now();
}

function notFoundResult(bizType, code) {
  return {
    integrated: !!LINKED_OFFICES[bizType],
    found: false,
    owned: false,
    valid: false,
    certifiable: false,
    appealable: false,
    bizType,
    code: normalizeCode(code),
    office: LINKED_OFFICES[bizType] || '',
    status: 'not_found',
    title: '',
    detail: {},
    checkedAt: now(),
  };
}

function visaTarget(code) {
  const permit = db
    .prepare(
      'SELECT p.*, t.name AS type_name FROM visa_permits p LEFT JOIN visa_types t ON t.code = p.type_code WHERE p.visa_no = ?'
    )
    .get(code);
  if (permit) {
    const status = permit.status === 'valid' && isPast(permit.valid_until) ? 'expired' : permit.status;
    return {
      rowId: permit.id,
      kind: 'permit',
      targetType: 'permit',
      code: permit.visa_no,
      status,
      title: `${permit.type_name || permit.type_code} · ${permit.visa_no}`,
      ownerId: permit.user_id,
      valid: status === 'valid',
      certifiable: true,
      appealable: VISA_PERMIT_APPEALABLE.has(status),
      detail: {
        typeName: permit.type_name || permit.type_code,
        issuedAt: permit.issued_at,
        validUntil: permit.valid_until,
        holder: maskName(permit.holder_name),
      },
    };
  }
  const app = db
    .prepare(
      'SELECT a.*, t.name AS type_name FROM visa_applications a LEFT JOIN visa_types t ON t.code = a.type_code WHERE a.app_no = ?'
    )
    .get(code);
  if (!app) return null;
  return {
    rowId: app.id,
    kind: 'application',
    targetType: 'application',
    code: app.app_no,
    status: app.status,
    title: `${app.type_name || app.type_code} · ${app.app_no}`,
    ownerId: app.user_id,
    valid: ['approved', 'issued'].includes(app.status),
    certifiable: app.status !== 'draft',
    appealable: VISA_APP_APPEALABLE.has(app.status),
    detail: {
      typeName: app.type_name || app.type_code,
      submittedAt: app.submitted_at,
      decidedAt: app.decided_at,
      issuedAt: app.issued_at,
    },
  };
}

function immigrationTarget(code) {
  const decl = db
    .prepare(
      'SELECT d.*, p.name AS port_name FROM im_declarations d LEFT JOIN im_ports p ON p.id = d.port_id WHERE d.no = ? AND d.deleted_at IS NULL'
    )
    .get(code);
  if (decl) {
    return {
      rowId: decl.id,
      kind: 'declaration',
      targetType: 'declaration',
      code: decl.no,
      status: decl.status,
      title: `${decl.port_name || '皇家口岸'} · ${decl.no}`,
      ownerId: decl.user_id,
      valid: ['approved', 'entered', 'exited'].includes(decl.status),
      certifiable: decl.status !== 'draft',
      appealable: IMM_DECL_APPEALABLE.has(decl.status),
      detail: {
        portName: decl.port_name || '',
        stayDays: decl.stay_days,
        submittedAt: decl.submitted_at,
        reviewedAt: decl.reviewed_at,
      },
    };
  }
  const entry = db.prepare('SELECT * FROM im_entry_records WHERE no = ?').get(code);
  if (!entry) return null;
  return {
    rowId: entry.id,
    kind: 'entry',
    targetType: 'entry_record',
    code: entry.no,
    status: entry.status,
    title: `入境记录 · ${entry.no}`,
    ownerId: entry.user_id,
    valid: true,
    certifiable: true,
    appealable: false,
    detail: { entryDate: entry.entry_date, stayDays: entry.stay_days },
  };
}

function residentTarget(code) {
  const card = db
    .prepare(
      'SELECT c.*, t.name AS type_name FROM res_cards c LEFT JOIN res_types t ON t.code = c.type_code WHERE c.card_no = ?'
    )
    .get(code);
  if (card) {
    const status = card.status === 'valid' && isPast(card.valid_until) ? 'expired' : card.status;
    return {
      rowId: card.id,
      kind: 'card',
      targetType: 'card',
      code: card.card_no,
      status,
      title: `${card.type_name || card.type_code} · ${card.card_no}`,
      ownerId: card.user_id,
      valid: status === 'valid',
      certifiable: true,
      appealable: RES_CARD_APPEALABLE.has(status),
      detail: {
        typeName: card.type_name || card.type_code,
        issuedAt: card.issued_at,
        validUntil: card.valid_until,
        holder: maskName(card.nickname),
      },
    };
  }
  const app = db
    .prepare(
      'SELECT a.*, t.name AS type_name FROM res_applications a LEFT JOIN res_types t ON t.code = a.type_code WHERE a.app_no = ?'
    )
    .get(code);
  if (app) {
    return {
      rowId: app.id,
      kind: 'application',
      targetType: 'application',
      code: app.app_no,
      status: app.status,
      title: `${app.type_name || app.type_code} · ${app.app_no}`,
      ownerId: app.user_id,
      valid: app.status === 'approved',
      certifiable: app.status !== 'draft',
      appealable: RES_APP_APPEALABLE.has(app.status),
      detail: {
        typeName: app.type_name || app.type_code,
        submittedAt: app.submitted_at,
        decidedAt: app.decided_at,
      },
    };
  }
  const change = db.prepare('SELECT * FROM res_changes WHERE no = ?').get(code);
  if (!change) return null;
  return {
    rowId: change.id,
    kind: 'change',
    targetType: 'change',
    code: change.no,
    status: change.status,
    title: `居民变更 · ${change.no}`,
    ownerId: change.user_id,
    valid: change.status === 'approved',
    certifiable: true,
    appealable: RES_CHANGE_APPEALABLE.has(change.status),
    detail: { type: change.type, submittedAt: change.created_at, decidedAt: change.decided_at },
  };
}

function diplomaticTarget(code) {
  const identity = db
    .prepare(
      'SELECT i.*, t.name AS type_name FROM dip_identities i LEFT JOIN dip_identity_types t ON t.code = i.identity_type WHERE i.no = ? AND i.deleted_at IS NULL'
    )
    .get(code);
  if (identity) {
    const status =
      identity.status === 'active' && identity.term_end && identity.term_end < now().slice(0, 10) ? 'expired' : identity.status;
    return {
      rowId: identity.id,
      kind: 'identity',
      targetType: 'identity',
      code: identity.no,
      status,
      title: `${identity.type_name || identity.identity_type} · ${identity.entity_name}`,
      ownerId: identity.user_id,
      valid: status === 'active',
      certifiable: true,
      appealable: DIP_IDENTITY_APPEALABLE.has(status),
      detail: {
        entityName: identity.entity_name,
        identityType: identity.type_name || identity.identity_type,
        termEnd: identity.term_end,
        holder: maskName(identity.nickname),
      },
    };
  }
  const relation = db
    .prepare(
      'SELECT r.*, t.name AS type_name FROM dip_relations r LEFT JOIN dip_relation_types t ON t.code = r.relation_type WHERE r.no = ? AND r.deleted_at IS NULL'
    )
    .get(code);
  if (relation) {
    return {
      rowId: relation.id,
      kind: 'relation',
      targetType: 'relation',
      code: relation.no,
      status: relation.status,
      title: `${relation.type_name || relation.relation_type} · ${relation.entity_name}`,
      ownerId: relation.user_id,
      valid: relation.status === 'established',
      certifiable: true,
      appealable: DIP_RELATION_APPEALABLE.has(relation.status),
      detail: { entityName: relation.entity_name, establishedAt: relation.established_at },
    };
  }
  const agreement = db.prepare('SELECT * FROM dip_agreements WHERE no = ?').get(code);
  if (!agreement) return null;
  return {
    rowId: agreement.id,
    kind: 'agreement',
    targetType: 'agreement',
    code: agreement.no,
    status: agreement.status,
    title: `互免协议 · ${agreement.party_a} / ${agreement.party_b}`,
    ownerId: agreement.user_id ?? null,
    valid: agreement.status === 'active',
    certifiable: true,
    appealable: false,
    detail: { partyA: agreement.party_a, partyB: agreement.party_b, type: agreement.type },
  };
}

function documentTarget(code) {
  const cert = db
    .prepare(
      'SELECT c.*, t.name AS type_name FROM doc_certificates c LEFT JOIN doc_types t ON t.code = c.type_code WHERE c.cert_no = ?'
    )
    .get(code);
  if (cert) {
    return {
      rowId: cert.id,
      kind: 'certificate',
      targetType: 'certificate',
      code: cert.cert_no,
      status: cert.status,
      title: `${cert.type_name || cert.type_code} · ${cert.cert_no}`,
      ownerId: cert.user_id,
      valid: cert.status === 'valid' && !isPast(cert.expires_at),
      certifiable: true,
      appealable: DOC_CERT_APPEALABLE.has(cert.status),
      detail: {
        typeName: cert.type_name || cert.type_code,
        holder: maskName(cert.holder_name),
        issuedAt: cert.issued_at,
        expiresAt: cert.expires_at,
      },
    };
  }
  const app = db
    .prepare(
      'SELECT a.*, t.name AS type_name FROM doc_applications a LEFT JOIN doc_types t ON t.code = a.type_code WHERE a.app_no = ?'
    )
    .get(code);
  if (!app) return null;
  return {
    rowId: app.id,
    kind: 'application',
    targetType: 'application',
    code: app.app_no,
    status: app.status,
    title: `${app.type_name || app.type_code} · ${app.app_no}`,
    ownerId: app.user_id,
    valid: app.status === 'approved',
    certifiable: app.status !== 'draft',
    appealable: DOC_APP_APPEALABLE.has(app.status),
    detail: {
      typeName: app.type_name || app.type_code,
      bizNo: app.biz_no,
      submittedAt: app.submitted_at,
      decidedAt: app.decided_at,
    },
  };
}

function protocolTarget(code) {
  const invitation = db
    .prepare(
      'SELECT i.*, e.title AS event_title FROM pro_invitations i LEFT JOIN pro_events e ON e.id = i.event_id WHERE i.invite_no = ?'
    )
    .get(code);
  if (invitation) {
    const valid = invitation.status === 'valid' && !isPast(invitation.valid_until);
    return {
      rowId: invitation.id,
      kind: 'invitation',
      targetType: 'invitation',
      code: invitation.invite_no,
      status: invitation.status,
      title: `${invitation.event_title || '活动邀请函'} · ${invitation.invite_no}`,
      ownerId: invitation.invitee_user_id,
      valid,
      certifiable: true,
      appealable: false,
      detail: { eventTitle: invitation.event_title || '', validUntil: invitation.valid_until },
    };
  }
  const pass = db
    .prepare(
      'SELECT p.*, e.title AS event_title FROM pro_passes p LEFT JOIN pro_events e ON e.id = p.event_id WHERE p.pass_no = ?'
    )
    .get(code);
  if (pass) {
    return {
      rowId: pass.id,
      kind: 'pass',
      targetType: 'pass',
      code: pass.pass_no,
      status: pass.status,
      title: `${pass.event_title || '活动凭证'} · ${pass.pass_no}`,
      ownerId: pass.user_id,
      valid: pass.status === 'pending' && !isPast(pass.valid_until),
      certifiable: true,
      appealable: false,
      detail: { eventTitle: pass.event_title || '', validUntil: pass.valid_until },
    };
  }
  const event = db.prepare('SELECT * FROM pro_events WHERE event_no = ? AND deleted_at IS NULL').get(code);
  if (event) {
    return {
      rowId: event.id,
      kind: 'event',
      targetType: 'event',
      code: event.event_no,
      status: event.status,
      title: `${event.title} · ${event.event_no}`,
      ownerId: null,
      valid: ['registration', 'registration_closed', 'ongoing', 'ended'].includes(event.status),
      certifiable: true,
      appealable: false,
      detail: { startsAt: event.starts_at, endsAt: event.ends_at, venueName: event.venue_name },
    };
  }
  const host = db.prepare('SELECT * FROM pro_hosts WHERE host_no = ? AND deleted_at IS NULL').get(code);
  if (!host) return null;
  return {
    rowId: host.id,
    kind: 'host',
    targetType: 'host',
    code: host.host_no,
    status: host.status,
    title: `接待方 · ${host.name}`,
    ownerId: host.user_id,
    valid: host.status === 'certified',
    certifiable: true,
    appealable: false,
    detail: { name: host.name, certNo: host.cert_no },
  };
}

function appealTarget(code) {
  const row = db.prepare('SELECT * FROM appeal_decisions WHERE code = ?').get(code);
  if (!row) return null;
  return {
    rowId: row.id,
    kind: 'decision',
    targetType: 'decision',
    code: row.code,
    status: row.status,
    title: `决定书 · ${row.code}`,
    ownerId: row.user_id,
    valid: row.status === 'valid',
    certifiable: row.status === 'valid',
    appealable: false,
    detail: {
      appealCode: row.appeal_code,
      decisionType: row.decision_type,
      effectiveAt: row.effective_at,
      certCode: row.cert_code || '',
    },
  };
}

function resolveTarget(bizType, code) {
  const value = normalizeCode(code);
  if (!value) return null;
  switch (bizType) {
    case 'visa':
      return visaTarget(value);
    case 'immigration':
      return immigrationTarget(value);
    case 'resident':
      return residentTarget(value);
    case 'diplomatic':
      return diplomaticTarget(value);
    case 'document':
      return documentTarget(value);
    case 'protocol':
      return protocolTarget(value);
    case 'appeal':
      return appealTarget(value);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// 只读校验
// ---------------------------------------------------------------------------

export function verifyBusinessRecord(bizType, code, userId) {
  const target = resolveTarget(bizType, code);
  if (!target) return notFoundResult(bizType, code);
  const owned = target.ownerId == null ? true : target.ownerId === userId;
  return {
    integrated: true,
    found: true,
    owned,
    valid: owned && target.valid,
    certifiable: owned && target.certifiable,
    appealable: owned && target.appealable,
    bizType,
    code: target.code,
    kind: target.kind,
    status: target.status,
    title: target.title,
    office: LINKED_OFFICES[bizType] || '',
    detail: target.detail || {},
    checkedAt: now(),
  };
}

// 申诉草稿/提交时的分类:verified / not_found / not_owned / not_appealable
export function classifyBizStatus(bizType, code, userId) {
  const check = verifyBusinessRecord(bizType, code, userId);
  if (!check.found) return { status: 'not_found', check };
  if (!check.owned) return { status: 'not_owned', check };
  if (!check.appealable) return { status: 'not_appealable', check };
  return { status: 'verified', check };
}

// ---------------------------------------------------------------------------
// 申诉署只读链路快照
// ---------------------------------------------------------------------------

function timelineFor(bizType, target) {
  const limit = 8;
  if (bizType === 'visa' && target.kind === 'application') {
    return db
      .prepare(
        'SELECT action, comment, reviewer_name AS actor, created_at FROM visa_reviews WHERE application_id = ? ORDER BY id DESC LIMIT ?'
      )
      .all(target.rowId, limit)
      .map((r) => ({ action: r.action, actor: r.actor || '', comment: r.comment || '', createdAt: r.created_at }));
  }
  if (bizType === 'immigration' && target.kind === 'declaration') {
    return db
      .prepare('SELECT action, note AS comment, created_at FROM im_declaration_events WHERE declaration_id = ? ORDER BY id DESC LIMIT ?')
      .all(target.rowId, limit)
      .map((r) => ({ action: r.action, actor: '', comment: r.comment || '', createdAt: r.created_at }));
  }
  if (bizType === 'resident' && target.kind === 'application') {
    return db
      .prepare(
        'SELECT action, comment, reviewer_name AS actor, created_at FROM res_reviews WHERE application_id = ? ORDER BY id DESC LIMIT ?'
      )
      .all(target.rowId, limit)
      .map((r) => ({ action: r.action, actor: r.actor || '', comment: r.comment || '', createdAt: r.created_at }));
  }
  if (bizType === 'diplomatic' && (target.kind === 'identity' || target.kind === 'relation')) {
    return db
      .prepare('SELECT action, note AS comment, created_at FROM dip_events WHERE owner_type = ? AND owner_id = ? ORDER BY id DESC LIMIT ?')
      .all(target.kind, target.rowId, limit)
      .map((r) => ({ action: r.action, actor: '', comment: r.comment || '', createdAt: r.created_at }));
  }
  if (bizType === 'document' && (target.kind === 'application' || target.kind === 'certificate')) {
    const rows = db
      .prepare(
        `SELECT action, comment, actor_name AS actor, created_at FROM doc_records
         WHERE application_id = (SELECT application_id FROM doc_certificates WHERE id = ?) OR application_id = ?
         ORDER BY id DESC LIMIT ?`
      )
      .all(target.kind === 'certificate' ? target.rowId : -1, target.kind === 'application' ? target.rowId : -1, limit);
    return rows.map((r) => ({ action: r.action, actor: r.actor || '', comment: r.comment || '', createdAt: r.created_at }));
  }
  return [];
}

export function businessSnapshot(bizType, code) {
  const target = resolveTarget(bizType, code);
  if (!target) {
    return {
      integrated: !!LINKED_OFFICES[bizType],
      found: false,
      office: LINKED_OFFICES[bizType] || '',
      code: normalizeCode(code),
      timeline: [],
    };
  }
  return {
    integrated: true,
    found: true,
    office: LINKED_OFFICES[bizType] || '',
    code: target.code,
    kind: target.kind,
    status: target.status,
    title: target.title,
    detail: target.detail || {},
    timeline: timelineFor(bizType, target),
  };
}

// ---------------------------------------------------------------------------
// 申诉决定回写:只对"被驳回/关闭"的业务件重开复审;其余状态只留回写审计,
// 避免申诉署越过业务署直接改已生效结果。
// ---------------------------------------------------------------------------

function auditBusiness(bizType, target, detail) {
  const payload = JSON.stringify(detail);
  const ts = now();
  if (bizType === 'visa') {
    db.prepare(
      'INSERT INTO visa_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(null, '皇家申訴與監察署', 'appeal_writeback', target.targetType, target.code, payload, ts);
  } else if (bizType === 'immigration') {
    db.prepare(
      'INSERT INTO im_audit_logs (actor_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(null, 'appeal_writeback', target.targetType, target.code, payload, ts);
  } else if (bizType === 'resident') {
    db.prepare(
      'INSERT INTO res_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(null, '皇家申訴與監察署', 'appeal_writeback', target.targetType, target.code, payload, ts);
  } else if (bizType === 'diplomatic') {
    db.prepare(
      'INSERT INTO dip_audit_logs (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(null, '皇家申訴與監察署', 'appeal_writeback', target.targetType, target.code, payload, ts);
  } else if (bizType === 'document') {
    db.prepare(
      'INSERT INTO doc_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(null, '皇家申訴與監察署', 'appeal_writeback', target.targetType, target.code, payload, ts);
  }
}

function renderTemplate(text, vars) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function notifyBusiness(bizType, target, vars) {
  const ts = now();
  if (bizType === 'visa') {
    db.prepare(
      'INSERT INTO visa_messages (user_id, application_id, type, params, read, archived, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)'
    ).run(target.ownerId, target.kind === 'application' ? target.rowId : null, 'appeal_reopened', JSON.stringify(vars), ts);
    return;
  }
  if (bizType === 'document') {
    db.prepare(
      'INSERT INTO doc_messages (user_id, application_id, type, params, read, archived, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)'
    ).run(target.ownerId, target.kind === 'application' ? target.rowId : null, 'appeal_reopened', JSON.stringify(vars), ts);
    return;
  }
  const table = bizType === 'immigration' ? 'im' : bizType === 'resident' ? 'res' : 'dip';
  const tpl = db.prepare(`SELECT * FROM ${table}_message_templates WHERE code = ? AND enabled = 1`).get('appeal_reopened');
  const title = renderTemplate(tpl?.title_template ?? '', { ...vars, no: target.code });
  const body = renderTemplate(tpl?.body_template ?? '', { ...vars, no: target.code });
  const titleTw = renderTemplate(tpl?.title_template_tw ?? '', { ...vars, no: target.code }) || null;
  const bodyTw = renderTemplate(tpl?.body_template_tw ?? '', { ...vars, no: target.code }) || null;
  db.prepare(
    `INSERT INTO ${table}_messages (user_id, template_code, title, body, title_tw, body_tw, related, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(target.ownerId, 'appeal_reopened', title, body, titleTw, bodyTw, JSON.stringify({ ...vars, no: target.code }), ts);
}

function reopen(bizType, target) {
  const ts = now();
  if (bizType === 'visa' && target.kind === 'application' && ['rejected', 'closed'].includes(target.status)) {
    db.prepare(
      `UPDATE visa_applications SET status = 'pending_review', reject_code = NULL, reject_comment = '',
       review_stage = 'review', decided_by = NULL, decided_at = NULL, updated_at = ? WHERE id = ?`
    ).run(ts, target.rowId);
    return 'pending_review';
  }
  if (bizType === 'immigration' && target.kind === 'declaration' && target.status === 'rejected') {
    db.prepare(
      `UPDATE im_declarations SET status = 'pending', reject_reason = NULL, reject_note = '',
       reviewed_by = NULL, reviewed_at = NULL, updated_at = ? WHERE id = ?`
    ).run(ts, target.rowId);
    db.prepare(
      'INSERT INTO im_declaration_events (declaration_id, action, actor_id, note, created_at) VALUES (?, ?, NULL, ?, ?)'
    ).run(target.rowId, 'appeal_reopened', '申诉复核撤销原驳回决定,重新进入待检队列', ts);
    return 'pending';
  }
  if (bizType === 'resident' && target.kind === 'application' && ['rejected', 'closed'].includes(target.status)) {
    db.prepare(
      `UPDATE res_applications SET status = 'pending_review', reject_code = NULL, reject_comment = '',
       review_stage = 'review', decided_by = NULL, decided_at = NULL, updated_at = ? WHERE id = ?`
    ).run(ts, target.rowId);
    return 'pending_review';
  }
  if (bizType === 'diplomatic' && target.kind === 'identity' && target.status === 'rejected') {
    db.prepare(
      `UPDATE dip_identities SET status = 'pending_review', reject_code = NULL, reject_comment = '',
       decided_by = NULL, decided_at = NULL, updated_at = ? WHERE id = ?`
    ).run(ts, target.rowId);
    return 'pending_review';
  }
  if (bizType === 'diplomatic' && target.kind === 'relation' && target.status === 'rejected') {
    db.prepare(
      `UPDATE dip_relations SET status = 'pending_review', reject_code = NULL, reject_comment = '',
       decided_by = NULL, decided_at = NULL, updated_at = ? WHERE id = ?`
    ).run(ts, target.rowId);
    return 'pending_review';
  }
  if (bizType === 'document' && target.kind === 'application' && target.status === 'rejected') {
    db.prepare(
      `UPDATE doc_applications SET status = 'pending', reject_code = NULL, reject_comment = '',
       decided_by = NULL, decided_at = NULL, updated_at = ? WHERE id = ?`
    ).run(ts, target.rowId);
    return 'pending';
  }
  return null;
}

export function writebackBusiness(bizType, code, ctx = {}) {
  const target = resolveTarget(bizType, code);
  if (!target) {
    return { integrated: !!LINKED_OFFICES[bizType], applied: false, reason: 'not_found', office: LINKED_OFFICES[bizType] || '' };
  }
  const decisionType = String(ctx.decisionType || '');
  const detail = {
    appealCode: ctx.appealCode || '',
    decisionCode: ctx.decisionCode || '',
    decisionType,
    applied: false,
    reason: '',
  };
  let nextStatus = null;
  if (!['undo', 'change'].includes(decisionType)) {
    detail.reason = decisionType === 'transfer' ? 'transferred' : 'maintained';
  } else {
    nextStatus = reopen(bizType, target);
    detail.reason = nextStatus ? 'reopened' : 'not_reopenable';
    detail.applied = !!nextStatus;
    detail.fromStatus = target.status;
    detail.toStatus = nextStatus;
  }
  auditBusiness(bizType, target, detail);
  if (detail.applied) {
    notifyBusiness(bizType, target, {
      appealCode: ctx.appealCode || '',
      decisionCode: ctx.decisionCode || '',
    });
  }
  return {
    integrated: true,
    applied: detail.applied,
    reason: detail.reason,
    office: LINKED_OFFICES[bizType] || '',
    code: target.code,
    fromStatus: target.status,
    status: nextStatus || target.status,
    decisionType,
  };
}

// ---------------------------------------------------------------------------
// 监察抽查
// ---------------------------------------------------------------------------

const SAMPLE_QUERIES = {
  visa: {
    table: 'visa_applications',
    sql: `SELECT a.app_no AS code, a.status, t.name AS title, a.updated_at
          FROM visa_applications a LEFT JOIN visa_types t ON t.code = a.type_code
          ORDER BY a.id DESC LIMIT ?`,
    count: 'SELECT COUNT(*) AS n FROM visa_applications',
    dist: 'SELECT status, COUNT(*) AS n FROM visa_applications GROUP BY status ORDER BY n DESC',
  },
  immigration: {
    table: 'im_declarations',
    sql: `SELECT d.no AS code, d.status, p.name AS title, d.updated_at
          FROM im_declarations d LEFT JOIN im_ports p ON p.id = d.port_id
          WHERE d.deleted_at IS NULL ORDER BY d.id DESC LIMIT ?`,
    count: 'SELECT COUNT(*) AS n FROM im_declarations WHERE deleted_at IS NULL',
    dist: 'SELECT status, COUNT(*) AS n FROM im_declarations WHERE deleted_at IS NULL GROUP BY status ORDER BY n DESC',
  },
  resident: {
    table: 'res_applications',
    sql: `SELECT a.app_no AS code, a.status, t.name AS title, a.updated_at
          FROM res_applications a LEFT JOIN res_types t ON t.code = a.type_code
          ORDER BY a.id DESC LIMIT ?`,
    count: 'SELECT COUNT(*) AS n FROM res_applications',
    dist: 'SELECT status, COUNT(*) AS n FROM res_applications GROUP BY status ORDER BY n DESC',
  },
  diplomatic: {
    table: 'dip_identities',
    sql: `SELECT i.no AS code, i.status, t.name AS title, i.updated_at
          FROM dip_identities i LEFT JOIN dip_identity_types t ON t.code = i.identity_type
          WHERE i.deleted_at IS NULL ORDER BY i.id DESC LIMIT ?`,
    count: 'SELECT COUNT(*) AS n FROM dip_identities WHERE deleted_at IS NULL',
    dist: 'SELECT status, COUNT(*) AS n FROM dip_identities WHERE deleted_at IS NULL GROUP BY status ORDER BY n DESC',
  },
  document: {
    table: 'doc_applications',
    sql: `SELECT a.app_no AS code, a.status, t.name AS title, a.updated_at
          FROM doc_applications a LEFT JOIN doc_types t ON t.code = a.type_code
          ORDER BY a.id DESC LIMIT ?`,
    count: 'SELECT COUNT(*) AS n FROM doc_applications',
    dist: 'SELECT status, COUNT(*) AS n FROM doc_applications GROUP BY status ORDER BY n DESC',
  },
};

export function sampleBusinessRecords(bizType, limit = 10) {
  const spec = SAMPLE_QUERIES[bizType];
  if (!spec) return { integrated: false, bizType, office: '', total: 0, byStatus: [], items: [] };
  const capped = Math.min(50, Math.max(1, Number(limit) || 10));
  return {
    integrated: true,
    bizType,
    office: LINKED_OFFICES[bizType],
    total: db.prepare(spec.count).get().n,
    byStatus: db.prepare(spec.dist).all(),
    items: db
      .prepare(spec.sql)
      .all(capped)
      .map((r) => ({ code: r.code, status: r.status, title: r.title || '', updatedAt: r.updated_at })),
  };
}

export function integrationStatus() {
  return APPEAL_BIZ_TYPES.map((bizType) => ({
    bizType,
    integrated: true,
    office: LINKED_OFFICES[bizType],
  }));
}

// ---------------------------------------------------------------------------
// 居民权益快捷通道
// ---------------------------------------------------------------------------

export function residentChannels(userId) {
  const card = db.prepare('SELECT * FROM res_cards WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  const cardStatus = !card
    ? 'none'
    : card.status === 'valid' && isPast(card.valid_until)
      ? 'expired'
      : card.status;
  const active = cardStatus === 'valid';
  const hasVisaType = !!db.prepare('SELECT 1 FROM visa_types WHERE enabled = 1 LIMIT 1').get();
  const hasResidentLane = !!db
    .prepare(
      `SELECT 1 FROM im_channels c JOIN im_ports p ON p.id = c.port_id
       WHERE c.enabled = 1 AND p.status = 'open' AND c.name LIKE '%居民%' LIMIT 1`
    )
    .get();
  const hasActivity = !!db
    .prepare(
      `SELECT 1 FROM pro_courtesy_types WHERE code = 'resident_courtesy' AND enabled = 1
       UNION ALL
       SELECT 1 FROM pro_events WHERE resident_only = 1 AND deleted_at IS NULL
         AND status IN ('registration', 'ongoing') LIMIT 1`
    )
    .get();
  const hasDocType = !!db.prepare("SELECT 1 FROM doc_types WHERE code = 'RESIDENT_CARD' AND enabled = 1").get();
  return {
    cardStatus,
    residentActive: active,
    channels: {
      visaFast: active && hasVisaType,
      immigrationLane: active && hasResidentLane,
      activityPriority: active && hasActivity,
      identityCertificate: active && hasDocType,
    },
    links: {
      visaFast: '/visa',
      immigrationLane: '/immigration',
      activityPriority: '/protocol/courtesy',
      identityCertificate: '/docs',
    },
  };
}

// ---------------------------------------------------------------------------
// 外交身份 → 外交签注 / 入境礼遇
// ---------------------------------------------------------------------------

export function diplomaticEligibility(userId) {
  const row = db
    .prepare(
      `SELECT i.*, t.name AS type_name FROM dip_identities i
       LEFT JOIN dip_identity_types t ON t.code = i.identity_type
       WHERE i.user_id = ? AND i.status = 'active' AND i.deleted_at IS NULL
         AND (i.term_end IS NULL OR i.term_end >= ?)
       ORDER BY i.id DESC LIMIT 1`
    )
    .get(userId, now().slice(0, 10));
  if (!row) return { eligible: false, identityNo: '', entityName: '', identityType: '', termEnd: null };
  return {
    eligible: true,
    identityNo: row.no,
    entityName: row.entity_name,
    identityType: row.type_name || row.identity_type,
    termEnd: row.term_end,
  };
}

export function diplomaticCourtesyFor(userId) {
  const identity = diplomaticEligibility(userId);
  if (!identity.eligible) return { ...identity, items: [] };
  const items = db
    .prepare('SELECT code, name, description FROM dip_courtesy_types WHERE enabled = 1 ORDER BY sort_order, id')
    .all();
  return { ...identity, items };
}

// 外交身份永久失效(注销/任期到期/断交)后,同步注销该用户有效的外交签注。
// 冻结属于可恢复状态,交给签注校验侧按需拦截,不永久注销。
export function syncDiplomaticVisa(userId) {
  if (!userId) return { voided: 0 };
  const active = db
    .prepare(
      "SELECT 1 FROM dip_identities WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL AND (term_end IS NULL OR term_end >= ?) LIMIT 1"
    )
    .get(userId, now().slice(0, 10));
  if (active) return { voided: 0 };
  const rows = db
    .prepare(
      `SELECT p.*, a.app_no FROM visa_permits p JOIN visa_applications a ON a.id = p.application_id
       WHERE p.user_id = ? AND p.type_code = 'DIPLOMATIC' AND p.status = 'valid'`
    )
    .all(userId);
  const ts = now();
  for (const permit of rows) {
    db.prepare("UPDATE visa_permits SET status = 'voided', updated_at = ? WHERE id = ?").run(ts, permit.id);
    db.prepare(
      'INSERT INTO visa_messages (user_id, application_id, type, params, read, archived, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)'
    ).run(userId, permit.application_id, 'diplomatic_voided', JSON.stringify({ visaNo: permit.visa_no, appNo: permit.app_no }), ts);
    db.prepare(
      'INSERT INTO visa_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(null, '皇家外交事務署', 'diplomatic_permit_voided', 'permit', permit.visa_no, JSON.stringify({ reason: 'identity_inactive' }), ts);
  }
  return { voided: rows.length };
}

// ---------------------------------------------------------------------------
// 申诉决定书 → 文书署认证闭环:文书签发后把 cert_no 回写到决定书 cert_code。
// ---------------------------------------------------------------------------

export function attachDecisionCertificate(decisionCode, certNo) {
  const code = normalizeCode(decisionCode);
  const row = db.prepare('SELECT * FROM appeal_decisions WHERE code = ?').get(code);
  if (!row) return false;
  db.prepare('UPDATE appeal_decisions SET cert_code = ? WHERE id = ?').run(String(certNo || ''), row.id);
  db.prepare(
    'INSERT INTO appeal_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    null,
    '皇家文書與認證署',
    'decision_certified',
    'decision',
    row.code,
    JSON.stringify({ certNo: String(certNo || '') }),
    now()
  );
  return true;
}

// ---------------------------------------------------------------------------
// 礼宾活动 → 口岸提示
// ---------------------------------------------------------------------------

export function upcomingProtocolEvents(days = 7) {
  const windowDays = Math.min(30, Math.max(1, Number(days) || 7));
  const from = now();
  const to = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT event_no, title, type_code, starts_at, ends_at, venue_name
       FROM pro_events
       WHERE deleted_at IS NULL AND status IN ('registration', 'registration_closed', 'ongoing')
         AND starts_at IS NOT NULL AND starts_at >= ? AND starts_at <= ?
       ORDER BY starts_at LIMIT 8`
    )
    .all(from, to)
    .map((r) => ({
      eventNo: r.event_no,
      title: r.title,
      typeCode: r.type_code,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      venueName: r.venue_name,
    }));
}