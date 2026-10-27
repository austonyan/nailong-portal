// i18n coverage gate: fails when a t() key has no entry in the locale files.
//
// Checks, in order:
//   1. zh-CN and zh-TW expose exactly the same flattened key set.
//   2. Every static t('a.b') / i18nKey="a.b" key exists.
//   3. Every dynamic t(`a.b.${x}`) / t('a.b.' + x) prefix resolves to at least
//      one locale leaf. Dynamic prefixes built from a runtime variable (empty
//      static prefix) are skipped.
//   4. High-risk enum families (status codes, message types, permission groups)
//      cover every value the server can emit.
//
// No dependencies: run with `npm run check:i18n`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(root, 'src', 'i18n', 'locales');
const srcDir = path.join(root, 'src');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, full, out);
    else out.set(full, value);
  }
  return out;
}

const cn = flatten(readJson(path.join(localesDir, 'zh-CN.json')));
const tw = flatten(readJson(path.join(localesDir, 'zh-TW.json')));

const errors = [];

// 1. Locale parity -----------------------------------------------------------
for (const key of cn.keys()) {
  if (!tw.has(key)) errors.push({ kind: 'locale', message: `zh-TW 缺少 ${key}` });
}
for (const key of tw.keys()) {
  if (!cn.has(key)) errors.push({ kind: 'locale', message: `zh-CN 缺少 ${key}` });
}

// 2. Source scan -------------------------------------------------------------
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
}
walk(srcDir);

const staticUses = new Map(); // key -> Set('relative/file.jsx:line')
const dynamicUses = new Map(); // prefix -> Set('relative/file.jsx:line')

function record(map, key, location) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(location);
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const location = `${path.relative(root, file)}:${index + 1}`;

    // static: t('a.b'), t("a.b"); a trailing dot means it is the left side of
    // a concatenation and is handled by the prefix pass below.
    for (const match of line.matchAll(/\bt\(\s*(['"])([A-Za-z0-9_.-]+)\1/g)) {
      if (!match[2].endsWith('.')) record(staticUses, match[2], location);
    }
    // Trans / i18nKey props
    for (const match of line.matchAll(/i18nKey\s*=\s*(['"])([A-Za-z0-9_.-]+)\1/g)) {
      record(staticUses, match[2], location);
    }
    // template with interpolation: t(`a.b.${x}`)
    for (const match of line.matchAll(/\bt\(\s*`([^`$]*?)\$\{/g)) {
      const prefix = match[1];
      if (prefix) record(dynamicUses, prefix, location);
    }
    // concatenation: t('a.b.' + x)
    for (const match of line.matchAll(/\bt\(\s*(['"])([A-Za-z0-9_.-]+)\1\s*\+/g)) {
      record(dynamicUses, match[2], location);
    }
  });
}

for (const [key, locations] of staticUses) {
  if (!cn.has(key)) errors.push({ kind: 'missing', key, locations: [...locations] });
}

const leafKeys = [...cn.keys()];
for (const [prefix, locations] of dynamicUses) {
  if (!leafKeys.some((key) => key.startsWith(prefix))) {
    errors.push({ kind: 'prefix', key: prefix, locations: [...locations] });
  }
}

// 3. Enum families -----------------------------------------------------------
// Values mirror the CHECK constraints and server-side enum maps. When a new
// server enum value is added, add it here; the gate then requires a locale key.
const ENUMS = {
  'imm.status': [
    'draft', 'pending', 'supplement', 'approved', 'rejected', 'entered', 'exited', 'withdrawn',
    'unused', 'used', 'expired', 'voided', 'invalid', 'open', 'closed', 'maintenance',
    'accepted', 'unknown', 'port_closed', 'visa_blocked', 'error',
  ],
  'imm.portStatus': ['open', 'closed', 'maintenance'],
  'imm.portType': ['land', 'air', 'sea'],
  'imm.msg.template': [
    'submit_success', 'supplement', 'approved', 'rejected', 'supplement_received',
    'pass_code', 'entry_record', 'exit_reminder', 'appeal_reopened',
  ],
  'imm.admin.risk': ['repeat_reject', 'blacklisted', 'watched'],
  'imm.admin.verify.result': ['accepted', 'used', 'expired', 'voided', 'unknown', 'port_closed', 'visa_blocked'],
  'res.noticeLevel': ['info', 'policy', 'event'],
  'res.admin.verify.result': ['valid', 'expired', 'voided', 'frozen', 'not_found', 'rate_limited'],
  'res.msgTpl': [
    'submitted', 'supplement_required', 'supplement_received', 'approved', 'rejected',
    'withdrawn', 'closed', 'card_issued', 'card_frozen', 'card_unfrozen', 'card_voided',
    'card_reissued', 'card_expired', 'expiry_reminder', 'change_approved', 'change_rejected',
    'appeal_reopened',
  ],
  'visa.msgType': [
    'submitted', 'supplement_required', 'approved', 'rejected', 'issued', 'used', 'voided',
    'expired', 'closed', 'withdrawn', 'expiry_reminder', 'system', 'appeal_reopened',
    'diplomatic_voided',
  ],
  'visa.admin.verifyResult_': ['valid', 'used', 'expired', 'voided', 'not_found', 'rate_limited'],
  'appeal.recordAction': [
    'submit', 'withdraw', 'supplement_submit', 'evaluate', 'review_submit', 'accept',
    'reject_accept', 'dispatch', 'supplement_request', 'decide', 'close', 'merge', 'reply',
    'escalate_appeal', 'mark_processing', 'mark_closed', 'mark_escalated',
    'review_accept', 'review_decide',
  ],
  'admin.roles.group': [
    'portal', 'users', 'roles', 'services', 'visa', 'appeal', 'immigration', 'diplomacy',
    'docs', 'protocol', 'resident', 'archives', 'postal', 'tourism', 'stats', 'education',
  ],
  'arch.msgType': ['submitted', 'reviewing', 'executing', 'completed', 'rejected'],
  'arch.status': ['pending', 'reviewing', 'executing', 'completed', 'rejected'],
  'arch.recStatus': [
    'draft', 'pending', 'pending_review', 'supplement', 'supplement_required', 'approved',
    'issued', 'valid', 'rejected', 'invalid', 'withdrawn', 'closed', 'used', 'expired',
    'voided', 'entered', 'exited',
  ],
  'arch.office': ['visa', 'immigration'],
  'arch.action': ['list', 'detail', 'export'],
  'arch.event': ['submit', 'accept', 'approve', 'execute', 'reject'],
  'arch.field': [
    'applicationNo', 'visaNo', 'appNo', 'type', 'status', 'submittedAt', 'issuedAt',
    'validUntil', 'planArrive', 'planLeave', 'purpose', 'contact', 'declarationNo', 'port',
    'stayDays', 'recordNo', 'entryDate', 'exitDate',
  ],
  'post.nav': [
    'home', 'notices', 'messages', 'postcards', 'subscription', 'adminNotices',
    'adminTemplates', 'adminPostcards', 'adminStats', 'adminAudit',
  ],
  'post.level': ['info', 'important', 'event'],
  'post.postcardStatus': ['draft', 'sent', 'received', 'taken_down'],
  'post.admin.noticeStatus': ['draft', 'published', 'offline'],
  'post.source': [
    'postal', 'visa', 'immigration', 'diplomacy', 'resident', 'protocol', 'docs', 'appeal',
    'system',
  ],
  'post.msg': [
    'notice_published', 'postcard_received', 'postcard_taken_down',
    'subscription_confirmed', 'subscription_cancelled', 'fallback',
    // 文化旅游署经邮政契约投递的消息类型(词条随 .tmp-tourism-i18n 词典交付)
    'tour_checkin', 'tour_badge',
    // 教育与科学署经邮政契约投递的消息类型(词条随 .tmp-education-i18n 词典交付)
    'task_completed',
  ],
  'tour.type': ['landmark', 'nature', 'culture', 'food'],
  'tour.openState': ['open', 'limited', 'closed'],
  'tour.articleType': ['festival', 'folk', 'world'],
  'tour.nav': ['home', 'attractions', 'articles', 'collection', 'badges', 'my', 'manage'],
  'tour.admin.tabs': ['attractions', 'articles', 'rules', 'badges', 'stats', 'audit'],
  'tour.stamp.style': ['wave', 'star', 'claw'],
  'tour.stamp.status': ['entered', 'exited', 'invalid'],
  'stat.office': [
    'portal', 'visa', 'immigration', 'dip', 'resident', 'protocol', 'docs', 'appeal',
    'tourism', 'postal', 'archives', 'stats', 'education',
  ],
  'stat.report.section': [
    'visa', 'immigration', 'tourism', 'protocol', 'education', 'documents', 'resident',
    'appeal',
  ],
  'stat.report.item': [
    'applications', 'issued', 'approved', 'declarations', 'entries', 'exits', 'checkins',
    'badges', 'registrations', 'checkedIn', 'reads', 'certificates', 'resident', 'cards',
    'submitted', 'resolved',
  ],
  'stat.admin.tabs': ['dashboard', 'metrics', 'export', 'audit'],
  'stat.admin.actions': [
    'metric_create', 'metric_update', 'metric_delete', 'export', 'report_generate',
  ],
  'stat.admin.extra': [
    'issued', 'passCodes', 'ports', 'identities', 'agreements', 'cards', 'events',
    'passes', 'certificates', 'decisions', 'spots', 'badges', 'postcards', 'notices',
    'accessLogs', 'articles', 'metrics', 'exports',
  ],
  'edu.status': ['draft', 'pending_review', 'published', 'offline'],
  'edu.recordStatus': ['in_progress', 'completed'],
  'edu.reviewAction': ['approve', 'reject'],
  'edu.targetType': ['entry', 'article', 'task', 'badge'],
};

for (const [prefix, values] of Object.entries(ENUMS)) {
  for (const value of values) {
    const key = prefix.endsWith('_') ? `${prefix}${value}` : `${prefix}.${value}`;
    // 消息模板类枚举的词条可能是 {title, body} 子树而非扁平叶子
    // (如 post.msg.<type>.title)，子树下存在任一叶子即视为已覆盖。
    if (!cn.has(key) && !leafKeys.some((leaf) => leaf.startsWith(`${key}.`))) {
      errors.push({ kind: 'enum', key, prefix });
    }
  }
}

// 4. Report ------------------------------------------------------------------
const localeErrors = errors.filter((e) => e.kind === 'locale');
const missingErrors = errors.filter((e) => e.kind === 'missing');
const prefixErrors = errors.filter((e) => e.kind === 'prefix');
const enumErrors = errors.filter((e) => e.kind === 'enum');

console.log(`[i18n] 扫描 ${files.length} 个源文件，${staticUses.size} 个静态 key，${dynamicUses.size} 个动态前缀`);
console.log(`[i18n] zh-CN ${cn.size} 个 key，zh-TW ${tw.size} 个 key`);

if (localeErrors.length) {
  console.error(`\n[locale] 简繁键不一致 ${localeErrors.length} 处`);
  for (const error of localeErrors) console.error(`  - ${error.message}`);
}

if (missingErrors.length) {
  console.error(`\n[missing] 源码引用但词条不存在 ${missingErrors.length} 个`);
  const byNamespace = new Map();
  for (const error of missingErrors) {
    const namespace = error.key.split('.')[0];
    if (!byNamespace.has(namespace)) byNamespace.set(namespace, []);
    byNamespace.get(namespace).push(error);
  }
  for (const [namespace, list] of [...byNamespace.entries()].sort()) {
    console.error(`  ${namespace} (${list.length})`);
    for (const error of list) console.error(`    ${error.key}  ${error.locations[0]}`);
  }
}

if (prefixErrors.length) {
  console.error(`\n[prefix] 动态前缀在词条里没有任何叶子 ${prefixErrors.length} 个`);
  for (const error of prefixErrors) console.error(`  - ${error.key}  ${error.locations[0]}`);
}

if (enumErrors.length) {
  console.error(`\n[enum] 枚举值缺词条 ${enumErrors.length} 个`);
  for (const error of enumErrors) console.error(`  - ${error.key}`);
}

if (errors.length) {
  console.error(`\n[i18n] 失败：共 ${errors.length} 处问题。`);
  process.exit(1);
}

console.log('[i18n] 通过：源码引用、动态前缀与枚举值均有简繁词条。');