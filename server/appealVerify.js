// 申诉署公开验真中心 — 跨署业务编号注册表。
//
// 各署的编号前缀都可能在管理台被修改，外交 `NLD` 与文书 `NLDA/NLDC` 还存在前缀
// 重叠，因此这里不解析前缀，而是按注册表逐表精确匹配号码列（这些列都是 UNIQUE）。
// 只返回“编号是否存在 + 所属署 + 类型 + 状态 + 有效期”，绝不返回姓名、联系方式、
// 业务内容或验证 token。
import { db, now } from './db.js';

// 每条注册表描述一种业务编号。表名/列名全部来自代码常量，用户输入只进绑定参数。
//   statusColumn      状态列；没有状态列时用 constantStatus 或 statusFromEnabled
//   validStatuses     视为“当前有效/可用”的状态集合
//   dateColumn        展示用签发/生成时间
//   fallbackDateColumn dateColumn 为空时的回退时间
//   untilColumn       有效期列（过期即 valid=false）
//   deletedColumn     软删除列，命中软删除时视为查不到
//   statusFromEnabled 由 0/1 列推导 active/inactive（徽章）
export const VERIFY_TYPES = [
  // 签注申请署
  {
    office: 'visa', kind: 'application', table: 'visa_applications', column: 'app_no',
    statusColumn: 'status', validStatuses: ['approved', 'issued'], dateColumn: 'created_at',
  },
  {
    office: 'visa', kind: 'permit', table: 'visa_permits', column: 'visa_no',
    statusColumn: 'status', validStatuses: ['valid'], dateColumn: 'issued_at', untilColumn: 'valid_until',
  },

  // 皇家口岸入境署
  {
    office: 'immigration', kind: 'declaration', table: 'im_declarations', column: 'no',
    statusColumn: 'status', validStatuses: ['approved', 'entered', 'exited'],
    dateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'immigration', kind: 'pass_code', table: 'im_pass_codes', column: 'code_no',
    statusColumn: 'status', validStatuses: ['unused'], dateColumn: 'created_at', untilColumn: 'valid_until',
  },
  {
    office: 'immigration', kind: 'entry', table: 'im_entry_records', column: 'no',
    statusColumn: 'status', validStatuses: ['entered', 'exited'],
    dateColumn: 'entry_date', deletedColumn: 'deleted_at',
  },
  {
    office: 'immigration', kind: 'exit', table: 'im_exit_records', column: 'no',
    constantStatus: 'exited', alwaysValid: true, dateColumn: 'exit_date', deletedColumn: 'deleted_at',
  },

  // 皇家文书与认证署
  {
    office: 'docs', kind: 'application', table: 'doc_applications', column: 'app_no',
    statusColumn: 'status', validStatuses: ['approved'], dateColumn: 'created_at',
  },
  {
    office: 'docs', kind: 'certificate', table: 'doc_certificates', column: 'cert_no',
    statusColumn: 'status', validStatuses: ['valid'], dateColumn: 'issued_at', untilColumn: 'expires_at',
  },

  // 皇家外交事务署
  {
    office: 'diplomacy', kind: 'relation', table: 'dip_relations', column: 'no',
    statusColumn: 'status', validStatuses: ['established'],
    dateColumn: 'established_at', fallbackDateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'diplomacy', kind: 'identity', table: 'dip_identities', column: 'no',
    statusColumn: 'status', validStatuses: ['active'],
    dateColumn: 'term_start', fallbackDateColumn: 'created_at', untilColumn: 'term_end',
    deletedColumn: 'deleted_at',
  },
  {
    office: 'diplomacy', kind: 'agreement', table: 'dip_agreements', column: 'no',
    statusColumn: 'status', validStatuses: ['active'],
    dateColumn: 'effective_from', fallbackDateColumn: 'created_at', untilColumn: 'effective_to',
  },

  // 皇家居民登记署
  {
    office: 'resident', kind: 'application', table: 'res_applications', column: 'app_no',
    statusColumn: 'status', validStatuses: ['approved'], dateColumn: 'created_at',
  },
  {
    office: 'resident', kind: 'card', table: 'res_cards', column: 'card_no',
    statusColumn: 'status', validStatuses: ['valid'], dateColumn: 'issued_at', untilColumn: 'valid_until',
  },
  {
    office: 'resident', kind: 'change', table: 'res_changes', column: 'no',
    statusColumn: 'status', validStatuses: ['approved'], dateColumn: 'created_at',
  },

  // 皇家礼宾与活动署
  {
    office: 'protocol', kind: 'event', table: 'pro_events', column: 'event_no',
    statusColumn: 'status', validStatuses: ['registration', 'registration_closed', 'ongoing', 'ended'],
    dateColumn: 'published_at', fallbackDateColumn: 'created_at', untilColumn: 'ends_at',
    deletedColumn: 'deleted_at',
  },
  {
    office: 'protocol', kind: 'registration', table: 'pro_registrations', column: 'reg_no',
    statusColumn: 'status', validStatuses: ['approved', 'checked_in', 'finished'], dateColumn: 'created_at',
  },
  {
    office: 'protocol', kind: 'invitation', table: 'pro_invitations', column: 'invite_no',
    statusColumn: 'status', validStatuses: ['valid'], dateColumn: 'created_at', untilColumn: 'valid_until',
  },
  {
    office: 'protocol', kind: 'pass', table: 'pro_passes', column: 'pass_no',
    statusColumn: 'status', validStatuses: ['pending'], dateColumn: 'issued_at', untilColumn: 'valid_until',
  },
  {
    office: 'protocol', kind: 'host', table: 'pro_hosts', column: 'host_no',
    statusColumn: 'status', validStatuses: ['certified'],
    dateColumn: 'decided_at', fallbackDateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'protocol', kind: 'host_cert', table: 'pro_hosts', column: 'cert_no',
    statusColumn: 'status', validStatuses: ['certified'],
    dateColumn: 'decided_at', fallbackDateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'protocol', kind: 'courtesy', table: 'pro_courtesy_apps', column: 'app_no',
    statusColumn: 'status', validStatuses: ['approved'], dateColumn: 'created_at', untilColumn: 'valid_until',
  },

  // 皇家档案与记录署（删除申请 + 执行回执）
  {
    office: 'archives', kind: 'deletion', table: 'arch_deletion_requests', column: 'no',
    statusColumn: 'status', validStatuses: ['completed'], dateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'archives', kind: 'receipt', table: 'arch_deletion_requests', column: 'receipt_no',
    statusColumn: 'status', validStatuses: ['completed'],
    dateColumn: 'completed_at', fallbackDateColumn: 'created_at', deletedColumn: 'deleted_at',
  },

  // 皇家邮政与通信署
  {
    office: 'postal', kind: 'postcard', table: 'post_postcards', column: 'no',
    statusColumn: 'status', validStatuses: ['sent', 'received'],
    dateColumn: 'sent_at', fallbackDateColumn: 'created_at',
  },
  {
    office: 'postal', kind: 'notice', table: 'post_notices', column: 'no',
    statusColumn: 'status', validStatuses: ['published'],
    dateColumn: 'published_at', fallbackDateColumn: 'created_at', deletedColumn: 'deleted_at',
  },

  // 皇家文化旅游署
  {
    office: 'tourism', kind: 'attraction', table: 'tour_attractions', column: 'no',
    statusColumn: 'status', validStatuses: ['online'], dateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'tourism', kind: 'article', table: 'tour_articles', column: 'no',
    statusColumn: 'status', validStatuses: ['published'],
    dateColumn: 'published_at', fallbackDateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'tourism', kind: 'badge', table: 'tour_badges', column: 'no',
    statusFromEnabled: 'enabled', validStatuses: ['active'],
    dateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'tourism', kind: 'checkin', table: 'tour_checkins', column: 'no',
    alwaysValid: true, dateColumn: 'checkin_date', deletedColumn: 'deleted_at',
  },

  // 皇家统计署
  {
    office: 'stats', kind: 'report', table: 'stat_reports', column: 'no',
    alwaysValid: true, dateColumn: 'generated_at', deletedColumn: 'deleted_at',
  },

  // 皇家教育与科学署
  {
    office: 'education', kind: 'edu_entry', table: 'edu_entries', column: 'no',
    statusColumn: 'status', validStatuses: ['published'],
    dateColumn: 'published_at', fallbackDateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'education', kind: 'article', table: 'edu_articles', column: 'no',
    statusColumn: 'status', validStatuses: ['published'],
    dateColumn: 'published_at', fallbackDateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
  {
    office: 'education', kind: 'task', table: 'edu_tasks', column: 'no',
    statusColumn: 'status', validStatuses: ['active'], dateColumn: 'created_at', deletedColumn: 'deleted_at',
  },
];

// 前端 appeal.verifyKind.* / appeal.verifyOffice.* 的完整枚举（申诉 5 类也列上，
// 便于 smoke 与 check:i18n 对齐）。这里只做自检与文档用途，不参与查询路由。
export const VERIFY_KINDS = [
  ...new Set([
    ...VERIFY_TYPES.map((entry) => entry.kind),
    'appeal', 'review', 'complaint', 'ticket', 'decision',
  ]),
];

export const VERIFY_OFFICES = [
  'visa', 'immigration', 'docs', 'diplomacy', 'resident', 'protocol',
  'appeal', 'archives', 'postal', 'tourism', 'stats', 'education',
];

const stmtCache = new Map();

function statementFor(entry) {
  if (stmtCache.has(entry)) return stmtCache.get(entry);
  const columns = new Set(
    [
      entry.column,
      entry.statusColumn,
      entry.dateColumn,
      entry.fallbackDateColumn,
      entry.untilColumn,
      entry.statusFromEnabled,
    ].filter(Boolean)
  );
  const select = [...columns].map((column) => `${column} AS ${column}`).join(', ');
  const where = `${entry.column} = ?${entry.deletedColumn ? ` AND ${entry.deletedColumn} IS NULL` : ''}`;
  const stmt = db.prepare(`SELECT ${select} FROM ${entry.table} WHERE ${where} LIMIT 1`);
  stmtCache.set(entry, stmt);
  return stmt;
}

const NUMBER_RE = /^[A-Z0-9-]{2,64}$/;

function normalize(raw) {
  const code = String(raw ?? '').trim().toUpperCase();
  return NUMBER_RE.test(code) ? code : '';
}

function resolveStatus(entry, row) {
  if (entry.statusFromEnabled) return row[entry.statusFromEnabled] ? 'active' : 'inactive';
  if (entry.statusColumn) return row[entry.statusColumn] ?? null;
  return entry.constantStatus ?? null;
}

function resolveValid(entry, row, status, today) {
  if (entry.alwaysValid) return true;
  if (!entry.validStatuses || !entry.validStatuses.includes(status)) return false;
  if (entry.untilColumn) {
    const until = row[entry.untilColumn];
    if (until && String(until).slice(0, 10) < today) return false;
  }
  return true;
}

function resultOf(entry, row) {
  const status = resolveStatus(entry, row);
  const date = row[entry.dateColumn] ?? (entry.fallbackDateColumn ? row[entry.fallbackDateColumn] : null);
  const until = entry.untilColumn ? row[entry.untilColumn] ?? null : null;
  return {
    found: true,
    office: entry.office,
    kind: entry.kind,
    code: row[entry.column],
    status,
    valid: resolveValid(entry, row, status, now().slice(0, 10)),
    issuedAt: date,
    validUntil: until,
    checkedAt: now(),
  };
}

/**
 * 统一编号查询：逐表精确匹配，命中即返回。
 * @param {string} raw 用户输入的编号（大小写不敏感）
 * @returns {object} `{ found:false }` 或统一结果
 */
export function lookupBusinessNumber(raw) {
  const code = normalize(raw);
  if (!code) return { found: false };
  for (const entry of VERIFY_TYPES) {
    const row = statementFor(entry).get(code);
    if (row) return resultOf(entry, row);
  }
  return { found: false };
}
