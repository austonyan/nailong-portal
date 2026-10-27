// 奶龙国皇家档案与记录署 — shared domain helpers.
//
// The office is a read-only archive outlet: every record below is read from the
// owning office's tables (visa_* / im_*) in the same SQLite database, masked at
// this boundary and never copied. Archival rules, access logs, deletion
// requests, hidden markers, mailbox messages and audit all live in arch_*.
import crypto from 'node:crypto';
import { db, now } from '../db.js';
import { badRequest } from '../http.js';
import { pickText } from '../locale.js';
import { sendPostalMessage as sendPlatformPostal } from '../postal/notify.js';

// Unpredictable, human-friendly numbers: no vowels/ambiguous glyphs.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(len) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const dateStamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
};

// NAH = 删除申请(经 grep 确认未被其他署占用)。
export function nextDeletionNo() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = `NAH-${dateStamp()}-${randomCode(6)}`;
    if (!db.prepare('SELECT id FROM arch_deletion_requests WHERE no = ?').get(no)) return no;
  }
  throw new Error('cannot generate deletion request number');
}

// 执行回执编号:沿用申请编号加 -R 后缀,便于与申请一一对应。
export const receiptNoOf = (requestNo) => `${requestNo}-R`;

export const EXPORT_DAILY_LIMIT = 3;

// ---------------------------------------------------------------------------
// 记录类型登记(和 arch_record_types 种子一一对应)
// ---------------------------------------------------------------------------

export const TYPE_CODES = ['visa_application', 'visa_permit', 'im_declaration', 'im_entry'];

export const OFFICE_OF_TYPE = {
  visa_application: 'visa',
  visa_permit: 'visa',
  im_declaration: 'immigration',
  im_entry: 'immigration',
};

const TYPE_QUERIES = {
  visa_application: `SELECT a.id, a.app_no AS no, a.status, a.type_code, a.nickname, a.contact,
                            a.purpose, a.plan_arrive, a.plan_leave, a.submitted_at, a.created_at,
                            t.name AS type_name, t.name_tw AS type_name_tw,
                            p.visa_no
                     FROM visa_applications a
                     LEFT JOIN visa_types t ON t.code = a.type_code
                     LEFT JOIN visa_permits p ON p.application_id = a.id`,
  visa_permit: `SELECT p.id, p.visa_no AS no, p.status, p.type_code, p.holder_name AS nickname,
                       p.issued_at, p.valid_until,
                       a.app_no, t.name AS type_name, t.name_tw AS type_name_tw
                FROM visa_permits p
                LEFT JOIN visa_types t ON t.code = p.type_code
                LEFT JOIN visa_applications a ON a.id = p.application_id`,
  im_declaration: `SELECT d.id, d.no, d.status, d.nickname, d.contact, d.purpose, d.stay_days,
                          d.visa_no, d.submitted_at, d.created_at,
                          pt.name AS port_name, pt.name_tw AS port_name_tw
                   FROM im_declarations d
                   LEFT JOIN im_ports pt ON pt.id = d.port_id`,
  im_entry: `SELECT e.id, e.no, e.status, e.entry_date, e.stay_days, e.visa_no, e.created_at,
                    dcl.nickname AS nickname, dcl.contact AS contact,
                    pt.name AS port_name, pt.name_tw AS port_name_tw,
                    x.no AS exit_no, x.exit_date
             FROM im_entry_records e
             LEFT JOIN im_declarations dcl ON dcl.id = e.declaration_id
             LEFT JOIN im_ports pt ON pt.id = e.port_id
             LEFT JOIN im_exit_records x ON x.entry_record_id = e.id AND x.deleted_at IS NULL`,
};

// 每类记录的主表别名与软删除条件(业务表自带 deleted_at 的才过滤)。
const TYPE_ALIAS = {
  visa_application: 'a',
  visa_permit: 'p',
  im_declaration: 'd',
  im_entry: 'e',
};

const TYPE_ALIVE = {
  visa_application: '',
  visa_permit: '',
  im_declaration: 'd.deleted_at IS NULL',
  im_entry: 'e.deleted_at IS NULL',
};

function mapRecord(typeCode, row) {
  switch (typeCode) {
    case 'visa_application':
      return {
        id: row.id,
        no: row.no,
        status: row.status,
        date: row.submitted_at || row.created_at,
        title: row.type_name || row.type_code,
        titleTw: row.type_name_tw,
        contact: row.contact,
        fields: [
          ['applicationNo', row.no, 'no'],
          ['visaNo', row.visa_no, 'no'],
          ['type', row.type_name || row.type_code, 'plain', row.type_name_tw],
          ['status', row.status, 'status'],
          ['submittedAt', row.submitted_at || row.created_at, 'date'],
          ['planArrive', row.plan_arrive, 'date'],
          ['planLeave', row.plan_leave, 'date'],
          ['purpose', row.purpose, 'plain'],
          ['contact', row.contact, 'contact'],
        ],
      };
    case 'visa_permit':
      return {
        id: row.id,
        no: row.no,
        status: row.status,
        date: row.issued_at,
        title: row.type_name || row.type_code,
        titleTw: row.type_name_tw,
        contact: '',
        fields: [
          ['visaNo', row.no, 'no'],
          ['appNo', row.app_no, 'no'],
          ['type', row.type_name || row.type_code, 'plain', row.type_name_tw],
          ['status', row.status, 'status'],
          ['issuedAt', row.issued_at, 'date'],
          ['validUntil', row.valid_until, 'date'],
        ],
      };
    case 'im_declaration':
      return {
        id: row.id,
        no: row.no,
        status: row.status,
        date: row.submitted_at || row.created_at,
        title: row.port_name || '',
        titleTw: row.port_name_tw,
        contact: row.contact,
        fields: [
          ['declarationNo', row.no, 'no'],
          ['visaNo', row.visa_no, 'no'],
          ['port', row.port_name, 'plain', row.port_name_tw],
          ['purpose', row.purpose, 'plain'],
          ['stayDays', row.stay_days, 'plain'],
          ['status', row.status, 'status'],
          ['submittedAt', row.submitted_at || row.created_at, 'date'],
          ['contact', row.contact, 'contact'],
        ],
      };
    case 'im_entry':
      return {
        id: row.id,
        no: row.no,
        status: row.status,
        date: row.entry_date || row.created_at,
        title: row.port_name || '',
        titleTw: row.port_name_tw,
        contact: row.contact,
        fields: [
          ['recordNo', row.no, 'no'],
          ['visaNo', row.visa_no, 'no'],
          ['port', row.port_name, 'plain', row.port_name_tw],
          ['entryDate', row.entry_date, 'date'],
          ['exitDate', row.exit_date, 'date'],
          ['stayDays', row.stay_days, 'plain'],
          ['status', row.status, 'status'],
        ],
      };
    default:
      return null;
  }
}

const SOURCE_URL = {
  visa_application: (id) => `/visa/applications/${id}`,
  visa_permit: () => '/visa/permits',
  im_declaration: (id) => `/immigration/declare/${id}`,
  im_entry: () => '/immigration/records',
};

// ---------------------------------------------------------------------------
// 脱敏:证件号/联系方式类一律打码(目录、详情、导出、管理端都走这里)。
// ---------------------------------------------------------------------------

export function maskNo(value) {
  const s = String(value ?? '');
  if (!s) return '';
  if (s.length <= 6) return `${s.slice(0, 1)}****`;
  return `${s.slice(0, 4)}****${s.slice(-3)}`;
}

export function maskContact(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const at = s.indexOf('@');
  if (at > 0) {
    const name = s.slice(0, at);
    const domain = s.slice(at + 1);
    const head = name.slice(0, 1);
    return `${head}***@${domain}`;
  }
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length >= 7) {
    return `${s.slice(0, 3)}****${s.slice(-4)}`;
  }
  if (s.length <= 2) return `${s.slice(0, 1)}****`;
  return `${s.slice(0, 1)}****${s.slice(-1)}`;
}

// ---------------------------------------------------------------------------
// 记录查询
// ---------------------------------------------------------------------------

function typeRows() {
  return db.prepare('SELECT * FROM arch_record_types ORDER BY sort_order, id').all();
}

export function recordTypesWithRules({ onlyIncluded = false } = {}) {
  const rules = new Map(db.prepare('SELECT key, value FROM arch_rules').all().map((r) => [r.key, r.value]));
  const list = typeRows().map((row) => ({
    code: row.code,
    office: row.office,
    name: row.name,
    nameTw: row.name_tw,
    description: row.description,
    descriptionTw: row.description_tw,
    sortOrder: row.sort_order,
    included: (rules.get(`rule.${row.code}.included`) ?? '1') === '1',
    retention: rules.get(`rule.${row.code}.retention`) ?? '',
    retentionTw: rules.get(`rule.${row.code}.retentionTw`) ?? '',
    updatedAt: row.updated_at,
  }));
  return onlyIncluded ? list.filter((t) => t.included) : list;
}

function hiddenKeySet() {
  const rows = db.prepare('SELECT record_type, record_id FROM arch_hidden_records').all();
  return new Set(rows.map((r) => `${r.record_type}:${r.record_id}`));
}

function normalizeDate(value) {
  return String(value ?? '').slice(0, 10);
}

function loadRecordsForType(typeCode, { userId = null } = {}) {
  const alias = TYPE_ALIAS[typeCode];
  const alive = TYPE_ALIVE[typeCode];
  const where = [];
  const params = [];
  if (userId !== null) {
    where.push(`${alias}.user_id = ?`);
    params.push(userId);
  }
  if (alive) where.push(alive);
  const sql = `${TYPE_QUERIES[typeCode]}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ${alias}.id DESC LIMIT 500`;
  return db.prepare(sql).all(...params).map((row) => ({ typeCode, row: mapRecord(typeCode, row) })).filter((r) => r.row);
}

function presentRecord(typeCode, mapped, { hidden = false } = {}) {
  return {
    recordType: typeCode,
    office: OFFICE_OF_TYPE[typeCode],
    id: mapped.id,
    no: maskNo(mapped.no),
    status: mapped.status,
    date: normalizeDate(mapped.date),
    title: mapped.title,
    titleTw: mapped.titleTw,
    contact: maskContact(mapped.contact),
    sourceUrl: (SOURCE_URL[typeCode] || (() => '/'))(mapped.id),
    hidden,
  };
}

function presentDetail(typeCode, mapped) {
  return {
    ...presentRecord(typeCode, mapped),
    fields: mapped.fields.map(([key, value, mask, valueTw]) => ({
      key,
      value: mask === 'no' ? maskNo(value) : mask === 'contact' ? maskContact(value) : value ?? '',
      valueTw: valueTw ?? null,
    })),
  };
}

function inDateRange(item, from, to) {
  const date = item.date;
  if (!date) return !from && !to;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function matchesKeyword(item, keyword) {
  if (!keyword) return true;
  const needle = keyword.toLowerCase();
  return [item.no, item.title, item.titleTw, item.status]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(needle));
}

// 本人档案(隐藏标记的行对本人不可见)。
export function listUserRecords(userId, { office = '', type = '', from = '', to = '', keyword = '' } = {}) {
  const types = recordTypesWithRules({ onlyIncluded: true }).filter(
    (t) => (!office || t.office === office) && (!type || t.code === type)
  );
  const hidden = hiddenKeySet();
  const items = [];
  for (const t of types) {
    for (const { typeCode, row } of loadRecordsForType(t.code, { userId })) {
      if (hidden.has(`${typeCode}:${row.id}`)) continue;
      const item = presentRecord(typeCode, row);
      if (!inDateRange(item, from, to)) continue;
      // 关键字按未脱敏的编号匹配,展示出去时仍然是打码后的编号。
      if (!matchesKeyword({ ...item, no: row.no }, keyword)) continue;
      items.push(item);
    }
  }
  items.sort((a, b) => (a.date === b.date ? b.id - a.id : String(b.date).localeCompare(String(a.date))));
  return items;
}

export function findUserRecord(userId, typeCode, id) {
  if (!TYPE_CODES.includes(typeCode)) return null;
  if (!recordTypesWithRules({ onlyIncluded: true }).some((t) => t.code === typeCode)) return null;
  const hidden = hiddenKeySet();
  if (hidden.has(`${typeCode}:${id}`)) return null;
  const row = loadRecordsForType(typeCode, { userId }).find((r) => r.row.id === id);
  return row ? presentDetail(typeCode, row.row) : null;
}

// 管理端:可按用户/编号/类型查;隐藏行仍可见并标记 hidden。
export function listAdminRecords({ userId = '', no = '', office = '', type = '', from = '', to = '', keyword = '' } = {}) {
  const types = recordTypesWithRules().filter((t) => (!office || t.office === office) && (!type || t.code === type));
  const hidden = hiddenKeySet();
  const users = new Map(db.prepare('SELECT id, username, display_name FROM users').all().map((u) => [u.id, u]));
  const items = [];
  for (const t of types) {
    for (const { typeCode, row: mapped } of loadRecordsForType(t.code, { userId: null })) {
      const ownerId = ownerIdOf(typeCode, mapped.id);
      const user = ownerId ? users.get(ownerId) : null;
      if (userId !== '' && String(ownerId ?? '') !== String(userId)) continue;
      const isHidden = hidden.has(`${typeCode}:${mapped.id}`);
      const item = {
        ...presentRecord(typeCode, mapped, { hidden: isHidden }),
        owner: ownerId ? { userId: ownerId, username: user?.username ?? '', displayName: user?.display_name ?? '' } : null,
      };
      if (no && !String(mapped.no).toLowerCase().includes(String(no).toLowerCase())) continue;
      if (!inDateRange(item, from, to)) continue;
      if (!matchesKeyword({ ...item, no: mapped.no }, keyword)) continue;
      items.push(item);
    }
  }
  items.sort((a, b) => (a.date === b.date ? b.id - a.id : String(b.date).localeCompare(String(a.date))));
  return items;
}

const OWNER_SQL = {
  visa_application: 'SELECT user_id FROM visa_applications WHERE id = ?',
  visa_permit: 'SELECT user_id FROM visa_permits WHERE id = ?',
  im_declaration: 'SELECT user_id FROM im_declarations WHERE id = ?',
  im_entry: 'SELECT user_id FROM im_entry_records WHERE id = ?',
};

function ownerIdOf(typeCode, id) {
  return db.prepare(OWNER_SQL[typeCode]).get(id)?.user_id ?? null;
}

export function countUserRecords(userId) {
  const hidden = hiddenKeySet();
  const counts = { visa: 0, immigration: 0, total: 0 };
  for (const t of recordTypesWithRules({ onlyIncluded: true })) {
    for (const { typeCode, row } of loadRecordsForType(t.code, { userId })) {
      if (hidden.has(`${typeCode}:${row.id}`)) continue;
      counts[t.office] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Access log / audit / mailbox
// ---------------------------------------------------------------------------

export const actorName = (actor) => actor?.displayName || actor?.username || actor?.name || '';

export function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

export function logAccess({ userId, actor, action, office = '', recordType = '', detail = {}, ip = '' }) {
  db.prepare(
    `INSERT INTO arch_access_logs (user_id, actor_name, action, office, record_type, detail, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, actorName(actor), action, office, recordType, JSON.stringify(detail), ip, now());
}

export function audit(actor, action, targetType = '', targetId = '', detail = {}) {
  db.prepare(
    'INSERT INTO arch_audit_logs (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(actor?.id ?? null, actorName(actor), action, targetType, String(targetId ?? ''), JSON.stringify(detail), now());
}

export function exportCountToday(userId) {
  const day = now().slice(0, 10);
  return db
    .prepare("SELECT COUNT(*) AS n FROM arch_audit_logs WHERE actor_id = ? AND action = 'export.user' AND substr(created_at, 1, 10) = ?")
    .get(userId, day).n;
}

// 站内信 / 邮政契约。
// 本署消息只存 type + params,SPA 用 arch.msg.* 渲染,简繁都由前端词条保证。
// source 固定 archives;channel = postal。写入本署邮箱的同时按邮政契约转发一条
// 到全站消息中心(post_messages,type 加 archives_ 前缀避免跨署同名冲突);
// 转发失败(如邮政署不可用)静默跳过,绝不影响本署业务。
export function sendPostalMessage({ userId, requestId = null, type, params = {}, source = 'archives' }) {
  const ts = now();
  db.prepare(
    `INSERT INTO arch_messages (user_id, request_id, type, params, source, channel, read, created_at)
     VALUES (?, ?, ?, ?, ?, 'postal', 0, ?)`
  ).run(userId, requestId, type, JSON.stringify(params), source, ts);
  try {
    sendPlatformPostal({ userId, source, type: `archives_${type}`, params: { ...params, requestId } });
  } catch {
    // 邮政转发失败不回滚本署邮箱,业务侧无需感知。
  }
  return { userId, requestId, type, params, source, channel: 'postal', createdAt: ts };
}

export function serializeMessage(row) {
  let params = {};
  try {
    params = JSON.parse(row.params);
  } catch {
    params = {};
  }
  return {
    id: row.id,
    requestId: row.request_id,
    type: row.type,
    params,
    source: row.source,
    channel: row.channel,
    read: !!row.read,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// 删除申请状态机
// ---------------------------------------------------------------------------

export const REQUEST_STATUSES = ['pending', 'reviewing', 'executing', 'completed', 'rejected'];

export const REQUEST_TRANSITIONS = {
  pending: ['reviewing', 'rejected'],
  reviewing: ['executing', 'rejected'],
  executing: ['completed'],
  completed: [],
  rejected: [],
};

export function assertTransition(from, to) {
  if (!(REQUEST_TRANSITIONS[from] || []).includes(to)) {
    throw badRequest('ARCH_INVALID_STATE', `Cannot move deletion request from ${from} to ${to}`);
  }
}

export const ACTIVE_REQUEST_STATUSES = ['pending', 'reviewing', 'executing'];

export function activeRequestOf(userId) {
  return db
    .prepare(
      `SELECT * FROM arch_deletion_requests
       WHERE user_id = ? AND deleted_at IS NULL AND status IN ('pending', 'reviewing', 'executing')
       ORDER BY id DESC LIMIT 1`
    )
    .get(userId);
}

function parseScope(text) {
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

function scopeTypeInfo(codes) {
  const types = recordTypesWithRules();
  return codes
    .map((code) => types.find((t) => t.code === code))
    .filter(Boolean)
    .map((t) => ({ code: t.code, office: t.office, name: t.name, nameTw: t.nameTw }));
}

export function serializeRequest(row, { events = [], withScope = true } = {}) {
  const scope = parseScope(row.scope);
  return {
    id: row.id,
    no: row.no,
    userId: row.user_id,
    scope,
    scopeTypes: withScope ? scopeTypeInfo(scope) : [],
    impact: row.impact,
    reason: row.reason,
    status: row.status,
    affectedCount: row.affected_count,
    reviewNote: row.review_note,
    rejectReason: row.reject_reason,
    receiptNo: row.receipt_no,
    handledName: row.handled_name,
    acceptedAt: row.accepted_at,
    approvedAt: row.approved_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events: events.map((e) => ({
      id: e.id,
      action: e.action,
      status: e.status,
      actorName: e.actor_name,
      note: e.note,
      createdAt: e.created_at,
    })),
  };
}

export function requestEvents(requestId) {
  return db.prepare('SELECT * FROM arch_request_events WHERE request_id = ? ORDER BY id').all(requestId);
}

export function logRequestEvent({ requestId, action, status, actor, note = '' }) {
  db.prepare(
    'INSERT INTO arch_request_events (request_id, action, status, actor_id, actor_name, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(requestId, action, status, actor?.id ?? null, actorName(actor), note, now());
}

function touchRequest(id, fields) {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  db.prepare(`UPDATE arch_deletion_requests SET ${cols.map((c) => `${c} = @${c}`).join(', ')}, updated_at = @ts WHERE id = @id`).run({
    ...fields,
    ts: now(),
    id,
  });
}

// 受理:pending → reviewing
export function acceptRequest(row, actor, note = '', opts = {}) {
  assertTransition(row.status, 'reviewing');
  touchRequest(row.id, { status: 'reviewing', accepted_at: now(), handled_by: actor?.id ?? null, handled_name: actorName(actor), review_note: note.slice(0, 300) });
  logRequestEvent({ requestId: row.id, action: 'accept', status: 'reviewing', actor, note });
  sendPostalMessage({ userId: row.user_id, requestId: row.id, type: 'reviewing', params: { no: row.no } });
  audit(actor, 'request.accept', 'deletion_request', row.no, opts.auto ? { auto: true } : {});
  return db.prepare('SELECT * FROM arch_deletion_requests WHERE id = ?').get(row.id);
}

// 通过:reviewing → executing
export function approveRequest(row, actor, note = '', opts = {}) {
  assertTransition(row.status, 'executing');
  touchRequest(row.id, { status: 'executing', approved_at: now(), handled_by: actor?.id ?? null, handled_name: actorName(actor), review_note: note.slice(0, 300) });
  logRequestEvent({ requestId: row.id, action: 'approve', status: 'executing', actor, note });
  sendPostalMessage({ userId: row.user_id, requestId: row.id, type: 'executing', params: { no: row.no } });
  audit(actor, 'request.approve', 'deletion_request', row.no, opts.auto ? { auto: true } : {});
  return db.prepare('SELECT * FROM arch_deletion_requests WHERE id = ?').get(row.id);
}

// 驳回:pending / reviewing → rejected(理由必填)
export function rejectRequest(row, actor, reason) {
  assertTransition(row.status, 'rejected');
  touchRequest(row.id, {
    status: 'rejected',
    reject_reason: reason,
    handled_by: actor?.id ?? null,
    handled_name: actorName(actor),
  });
  logRequestEvent({ requestId: row.id, action: 'reject', status: 'rejected', actor, note: reason });
  sendPostalMessage({ userId: row.user_id, requestId: row.id, type: 'rejected', params: { no: row.no, reason } });
  audit(actor, 'request.reject', 'deletion_request', row.no, { reason });
  return db.prepare('SELECT * FROM arch_deletion_requests WHERE id = ?').get(row.id);
}

// 执行:executing → completed。只写 arch_hidden_records 隐藏标记,绝不删除业务表数据。
export function executeRequest(row, actor, opts = {}) {
  assertTransition(row.status, 'completed');
  const scope = parseScope(row.scope);
  const receiptNo = receiptNoOf(row.no);
  let affected = 0;
  const hide = db.transaction(() => {
    for (const typeCode of scope) {
      if (!TYPE_CODES.includes(typeCode)) continue;
      for (const { typeCode: code, row: mapped } of loadRecordsForType(typeCode, { userId: row.user_id })) {
        const info = db
          .prepare(
            `INSERT OR IGNORE INTO arch_hidden_records (user_id, record_type, record_id, request_no, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(row.user_id, code, mapped.id, row.no, 'deletion_request', now());
        if (info.changes > 0) affected += 1;
      }
    }
    touchRequest(row.id, {
      status: 'completed',
      affected_count: affected,
      receipt_no: receiptNo,
      completed_at: now(),
      handled_by: actor?.id ?? null,
      handled_name: actorName(actor),
    });
  });
  hide();
  logRequestEvent({
    requestId: row.id,
    action: 'execute',
    status: 'completed',
    actor,
    note: `${receiptNo} / ${affected}`,
  });
  sendPostalMessage({
    userId: row.user_id,
    requestId: row.id,
    type: 'completed',
    // total 是 count 的别名:arch.msg.completed 词条使用 {{total}} 插值。
    params: { no: row.no, receiptNo, count: affected, total: affected },
  });
  audit(actor, 'request.execute', 'deletion_request', row.no, { receiptNo, affected, ...(opts.auto ? { auto: true } : {}) });
  return db.prepare('SELECT * FROM arch_deletion_requests WHERE id = ?').get(row.id);
}

// ---------------------------------------------------------------------------
// 导出载荷(前端用 exportCsv 落成 UTF-8 BOM CSV)
// ---------------------------------------------------------------------------

const STATUS_TEXT = {
  draft: ['草稿', '草稿'],
  pending: ['待审核', '待審核'],
  pending_review: ['待审核', '待審核'],
  supplement: ['待补件', '待補件'],
  supplement_required: ['待补件', '待補件'],
  approved: ['已通过', '已通過'],
  rejected: ['未通过', '未通過'],
  withdrawn: ['已撤回', '已撤回'],
  closed: ['已关闭', '已關閉'],
  issued: ['已签发', '已簽發'],
  valid: ['有效', '有效'],
  used: ['已使用', '已使用'],
  expired: ['已过期', '已過期'],
  voided: ['已注销', '已註銷'],
  entered: ['已入境', '已入境'],
  exited: ['已出境', '已出境'],
  invalid: ['已失效', '已失效'],
};

const OFFICE_TEXT = {
  visa: ['签注申请署', '簽註申請署'],
  immigration: ['皇家口岸入境署', '皇家口岸入境署'],
};

export function statusText(status, locale) {
  const pair = STATUS_TEXT[status] || [status, status];
  return pickText(pair[0], pair[1], locale);
}

export function officeText(office, locale) {
  const pair = OFFICE_TEXT[office] || [office, office];
  return pickText(pair[0], pair[1], locale);
}

function typeNameOf(recordType, locale) {
  const row = db.prepare('SELECT name, name_tw FROM arch_record_types WHERE code = ?').get(recordType);
  if (!row) return recordType;
  return pickText(row.name, row.name_tw, locale);
}

export function buildCsvPayload(items, locale) {
  const columns = [
    { key: 'typeName', label: pickText('记录类型', '紀錄類型', locale) },
    { key: 'officeName', label: pickText('所属署', '所屬署', locale) },
    { key: 'no', label: pickText('编号(脱敏)', '編號(遮蔽)', locale) },
    { key: 'date', label: pickText('记录日期', '紀錄日期', locale) },
    { key: 'status', label: pickText('状态', '狀態', locale) },
    { key: 'contact', label: pickText('联系方式(脱敏)', '聯絡方式(遮蔽)', locale) },
    { key: 'sourceUrl', label: pickText('原署页面', '原署頁面', locale) },
  ];
  const rows = items.map((item) => ({
    typeName: typeNameOf(item.recordType, locale),
    officeName: officeText(item.office, locale),
    no: item.no,
    date: item.date,
    status: statusText(item.status, locale),
    contact: item.contact,
    sourceUrl: item.sourceUrl,
  }));
  return {
    filename: `archives-records-${now().slice(0, 10).replace(/-/g, '')}.csv`,
    columns,
    rows,
  };
}