// 统一验真中心验收(自包含临时库,不需要启动服务):
//   node server/scripts/smoke-verify-center.mjs
// 覆盖:
//   1. 33 条跨署编号注册表的表/列都真实存在;
//   2. 35 个业务类型与 12 个署在 zh-CN / zh-TW 都有词条;
//   3. 每署代表性编号可查,前缀重叠(NLDA/NLDC/NLD)不会串表;
//   4. 档案执行回执、无状态记录、徽章 enabled 推导;
//   5. 大小写归一、未知编号、脱敏字段;
//   6. 申诉本署 5 类编号与决定书 token 仍走原响应。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nailong-verify-center-'));
process.env.NAILONG_DATA_DIR = dataDir;

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

function keySet(file) {
  const json = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'i18n', 'locales', file), 'utf8'));
  return new Set(Object.keys(json.appeal?.verifyKind ?? {}));
}

function officeSet(file) {
  const json = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src', 'i18n', 'locales', file), 'utf8'));
  return new Set(Object.keys(json.appeal?.verifyOffice ?? {}));
}

let db;
function cleanup() {
  try {
    db?.close();
  } catch {
    // already closed
  }
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows 上 WAL 句柄可能稍后才释放,忽略清理失败。
  }
}

try {
  const core = await import('../db.js');
  db = core.db;
  const ts = core.now();

  await import('../docs.js');
  const { ensureImmigrationSchema } = await import('../immigration/schema.js');
  const { ensureDipSchema } = await import('../dip/schema.js');
  const { ensureResidentSchema } = await import('../resident/schema.js');
  const { ensureProtocolSchema } = await import('../protocol/schema.js');
  const { ensureArchivesSchema } = await import('../archives/schema.js');
  const { ensurePostalSchema } = await import('../postal/schema.js');
  const { ensureTourismSchema } = await import('../tourism/schema.js');
  const { ensureStatsSchema } = await import('../stats/schema.js');
  const { ensureEducationSchema } = await import('../education/schema.js');
  ensureImmigrationSchema();
  ensureDipSchema();
  ensureResidentSchema();
  ensureProtocolSchema();
  ensureArchivesSchema();
  ensurePostalSchema();
  ensureTourismSchema();
  ensureStatsSchema();
  ensureEducationSchema();

  const { lookupBusinessNumber, VERIFY_TYPES, VERIFY_KINDS, VERIFY_OFFICES } = await import('../appealVerify.js');
  const { maskVerifyResult } = await import('../appeal.js');

  // -------------------------------------------------------------------------
  // 1. 结构自检
  // -------------------------------------------------------------------------
  check('注册表共 33 条跨署编号', VERIFY_TYPES.length === 33, `got ${VERIFY_TYPES.length}`);
  check('业务类型共 35 个', VERIFY_KINDS.length === 35, `got ${VERIFY_KINDS.length}`);
  check('署共 12 个', VERIFY_OFFICES.length === 12, `got ${VERIFY_OFFICES.length}`);

  const tableColumns = new Map();
  for (const entry of VERIFY_TYPES) {
    if (!tableColumns.has(entry.table)) {
      tableColumns.set(
        entry.table,
        new Set(db.prepare(`PRAGMA table_info(${entry.table})`).all().map((col) => col.name))
      );
    }
    const columns = tableColumns.get(entry.table);
    const required = [
      entry.column,
      entry.statusColumn,
      entry.dateColumn,
      entry.fallbackDateColumn,
      entry.untilColumn,
      entry.deletedColumn,
      entry.statusFromEnabled,
    ].filter(Boolean);
    const missing = required.filter((column) => !columns.has(column));
    check(`${entry.office}.${entry.kind} 表列存在`, missing.length === 0, `missing ${missing.join(',')}`);
  }

  const cnKinds = keySet('zh-CN.json');
  const twKinds = keySet('zh-TW.json');
  check('zh-CN 覆盖全部业务类型', VERIFY_KINDS.every((kind) => cnKinds.has(kind)), [...cnKinds].join(','));
  check('zh-TW 覆盖全部业务类型', VERIFY_KINDS.every((kind) => twKinds.has(kind)), [...twKinds].join(','));
  const cnOffices = officeSet('zh-CN.json');
  const twOffices = officeSet('zh-TW.json');
  check('zh-CN 覆盖全部署', VERIFY_OFFICES.every((office) => cnOffices.has(office)), [...cnOffices].join(','));
  check('zh-TW 覆盖全部署', VERIFY_OFFICES.every((office) => twOffices.has(office)), [...twOffices].join(','));

  // -------------------------------------------------------------------------
  // 2. 造数(每表最小行;只为本脚本服务)
  // -------------------------------------------------------------------------
  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (username, display_name, email, password_hash, status, created_at, updated_at)
         VALUES ('verify_center', '验真测试', 'verify@example.com', 'x', 'active', ?, ?)`
      )
      .run(ts, ts).lastInsertRowid
  );
  const otherId = Number(
    db
      .prepare(
        `INSERT INTO users (username, display_name, email, password_hash, status, created_at, updated_at)
         VALUES ('verify_other', '验真他人', 'other@example.com', 'x', 'active', ?, ?)`
      )
      .run(ts, ts).lastInsertRowid
  );

  const port =
    db.prepare('SELECT id FROM im_ports LIMIT 1').get() ||
    db
      .prepare(
        `INSERT INTO im_ports (code, name, type, status, open_hours, notice, map_desc, sort_order, created_at, updated_at)
         VALUES ('SMOKE', '验收口岸', 'land', 'open', '', '', '', 0, ?, ?)`
      )
      .run(ts, ts);
  const portId = Number(port.id);

  // visa
  const visaApp = Number(
    db
      .prepare(
        `INSERT INTO visa_applications (app_no, user_id, type_code, status, nickname, contact, purpose, created_at, updated_at)
         VALUES ('NLA-261102-SMOKE1', ?, 'TOURIST', 'issued', '验真甲', 'a@example.com', 'test', ?, ?)`
      )
      .run(userId, ts, ts).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO visa_permits (visa_no, application_id, user_id, type_code, holder_name, status, verify_token, issued_at, valid_until, updated_at)
     VALUES ('NLT-261102-SMOKE1', ?, ?, 'TOURIST', '验真甲', 'valid', ?, ?, '2099-12-31', ?)`
  ).run(visaApp, userId, crypto.randomUUID(), ts, ts);

  // docs
  const docApp = Number(
    db
      .prepare(
        `INSERT INTO doc_applications (app_no, user_id, type_code, status, nickname, contact, created_at, updated_at)
         VALUES ('NLDA-261102-SMOKE1', ?, 'VISA_CERT', 'approved', '验真甲', 'a@example.com', ?, ?)`
      )
      .run(userId, ts, ts).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO doc_certificates (cert_no, application_id, user_id, type_code, holder_name, status, verify_token, issued_at, expires_at, updated_at)
     VALUES ('NLDC-261102-SMOKE0123', ?, ?, 'VISA_CERT', '验真甲', 'valid', ?, ?, '2099-12-31', ?)`
  ).run(docApp, userId, crypto.randomUUID(), ts, ts);

  // immigration
  const declId = Number(
    db
      .prepare(
        `INSERT INTO im_declarations (no, user_id, port_id, nickname, contact, purpose, stay_days, status, created_at, updated_at)
         VALUES ('IM20261102-SMOKE1', ?, ?, '验真甲', 'a@example.com', 'fun', 1, 'approved', ?, ?)`
      )
      .run(userId, portId, ts, ts).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO im_pass_codes (declaration_id, user_id, port_id, code_no, token, status, valid_until, created_at)
     VALUES (?, ?, ?, 'PC20261102-SMOKE1', ?, 'unused', '2099-12-31', ?)`
  ).run(declId, userId, portId, crypto.randomUUID().replaceAll('-', ''), ts);
  const entryId = Number(
    db
      .prepare(
        `INSERT INTO im_entry_records (no, user_id, declaration_id, port_id, entry_date, status, created_at, updated_at)
         VALUES ('EN20261102-SMOKE1', ?, ?, ?, '2026-11-02', 'entered', ?, ?)`
      )
      .run(userId, declId, portId, ts, ts).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO im_exit_records (no, user_id, entry_record_id, port_id, exit_date, created_at)
     VALUES ('EX20261102-SMOKE1', ?, ?, ?, '2026-11-05', ?)`
  ).run(userId, entryId, portId, ts);

  // diplomacy
  db.prepare(
    `INSERT INTO dip_relations (no, user_id, object_type, relation_type, entity_name, rep_nickname, contact, status, established_at, created_at, updated_at)
     VALUES ('NLD20261102-SMOKE1', ?, 'CITY_STATE', 'FORMAL', '验收城邦', '验真甲', 'a@example.com', 'established', ?, ?, ?)`
  ).run(userId, ts, ts, ts);
  db.prepare(
    `INSERT INTO dip_identities (no, user_id, identity_type, entity_name, nickname, contact, term_start, term_end, status, created_at, updated_at)
     VALUES ('NLE20261102-SMOKE1', ?, 'ENVOY', '验收城邦', '验真甲', 'a@example.com', ?, '2099-12-31', 'active', ?, ?)`
  ).run(userId, ts, ts, ts);
  db.prepare(
    `INSERT INTO dip_agreements (no, party_a, party_b, effective_from, effective_to, status, created_at, updated_at)
     VALUES ('NLG20261102-SMOKE1', '奶龙国', '验收城邦', ?, '2099-12-31', 'active', ?, ?)`
  ).run(ts, ts, ts);

  // resident
  const resApp = Number(
    db
      .prepare(
        `INSERT INTO res_applications (app_no, user_id, type_code, status, nickname, created_at, updated_at)
         VALUES ('NRR-261102-SMOKE1', ?, 'RESIDENT', 'approved', '验真甲', ?, ?)`
      )
      .run(userId, ts, ts).lastInsertRowid
  );
  const cardId = Number(
    db
      .prepare(
        `INSERT INTO res_cards (card_no, user_id, application_id, type_code, nickname, status, verify_token, issued_at, valid_until, updated_at)
         VALUES ('NRC-261102-SMOKE1234', ?, ?, 'RESIDENT', '验真甲', 'valid', ?, ?, '2099-12-31', ?)`
      )
      .run(userId, resApp, crypto.randomUUID(), ts, ts).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO res_changes (no, user_id, card_id, type, payload, status, created_at, updated_at)
     VALUES ('NRX-261102-SMOKE1', ?, ?, 'info', '{}', 'approved', ?, ?)`
  ).run(userId, cardId, ts, ts);

  // protocol
  const eventId = Number(
    db
      .prepare(
        `INSERT INTO pro_events (event_no, type_code, title, status, starts_at, ends_at, published_at, created_at, updated_at)
         VALUES ('NJE20261102-SMOKE1', 'CEREMONY', '验收活动', 'registration', ?, '2099-12-31', ?, ?, ?)`
      )
      .run(ts, ts, ts, ts).lastInsertRowid
  );
  const regId = Number(
    db
      .prepare(
        `INSERT INTO pro_registrations (reg_no, user_id, event_id, status, nickname, contact, created_at, updated_at)
         VALUES ('NJR20261102-SMOKE1', ?, ?, 'approved', '验真甲', 'a@example.com', ?, ?)`
      )
      .run(userId, eventId, ts, ts).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO pro_invitations (invite_no, event_id, inviter_id, inviter_name, invitee_user_id, invitee_name, status, token, valid_until, created_at, updated_at)
     VALUES ('NJI20261102-SMOKE1', ?, ?, '主办方', ?, '验真甲', 'valid', ?, '2099-12-31', ?, ?)`
  ).run(eventId, otherId, userId, crypto.randomUUID().replaceAll('-', ''), ts, ts);
  db.prepare(
    `INSERT INTO pro_passes (pass_no, registration_id, event_id, user_id, holder_name, status, token, issued_at, valid_until, created_at, updated_at)
     VALUES ('NJP20261102-SMOKE1', ?, ?, ?, '验真甲', 'pending', ?, ?, '2099-12-31', ?, ?)`
  ).run(regId, eventId, userId, crypto.randomUUID().replaceAll('-', ''), ts, ts, ts);
  db.prepare(
    `INSERT INTO pro_hosts (host_no, user_id, type, name, contact_nickname, contact, status, cert_no, decided_at, created_at, updated_at)
     VALUES ('NJH20261102-SMOKE1', ?, 'organizer', '验收接待方', '联系人', 'a@example.com', 'certified', 'NLC20261102-SMOKE1', ?, ?, ?)`
  ).run(userId, ts, ts, ts);
  db.prepare(
    `INSERT INTO pro_courtesy_apps (app_no, user_id, type_code, basis_type, basis_no, status, valid_until, created_at, updated_at)
     VALUES ('NJC20261102-SMOKE1', ?, 'DIPLOMATIC', 'resident', 'NRC-261102-SMOKE1234', 'approved', '2099-12-31', ?, ?)`
  ).run(userId, ts, ts);

  // archives
  db.prepare(
    `INSERT INTO arch_deletion_requests (no, user_id, scope, impact, reason, status, receipt_no, completed_at, created_at, updated_at)
     VALUES ('NAH-261102-SMOKE1', ?, '[]', '', '', 'completed', 'NAH-261102-SMOKE1-R', ?, ?, ?)`
  ).run(userId, ts, ts, ts);

  // postal
  const template = db.prepare('SELECT id, code FROM post_card_templates LIMIT 1').get();
  const templateId = template?.id ?? Number(
    db
      .prepare(
        `INSERT INTO post_card_templates (code, name, scene, color, description, enabled, sort_order, created_at, updated_at)
         VALUES ('SMOKE', '验收模板', 'festival', 'app-teal', '', 1, 0, ?, ?)`
      )
      .run(ts, ts).lastInsertRowid
  );
  const templateCode = template?.code ?? 'SMOKE';
  db.prepare(
    `INSERT INTO post_postcards (no, sender_id, recipient_id, template_id, template_code, blessing, status, sent_at, created_at, updated_at)
     VALUES ('NLM20261102-SMOKE1', ?, ?, ?, ?, '', 'sent', ?, ?, ?)`
  ).run(userId, otherId, templateId, templateCode, ts, ts, ts);
  db.prepare(
    `INSERT INTO post_notices (no, title, status, published_at, created_at, updated_at)
     VALUES ('NLQ20261102-SMOKE1', '验收公告', 'published', ?, ?, ?)`
  ).run(ts, ts, ts);

  // tourism
  const attractionId = Number(
    db
      .prepare(
        `INSERT INTO tour_attractions (no, name, status, created_at, updated_at)
         VALUES ('NLV20261102-SMOKE1', '验收景点', 'online', ?, ?)`
      )
      .run(ts, ts).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO tour_articles (no, title, status, published_at, created_at, updated_at)
     VALUES ('NLH20261102-SMOKE1', '验收文章', 'published', ?, ?, ?)`
  ).run(ts, ts, ts);
  db.prepare(
    `INSERT INTO tour_badges (no, code, name, description, icon, threshold, enabled, sort_order, created_at, updated_at)
     VALUES ('NLB20261102-SMOKE1', 'SMOKE_BADGE', '验收徽章', '', 'TrophyIcon', 1, 1, 0, ?, ?)`
  ).run(ts, ts);
  db.prepare(
    `INSERT INTO tour_checkins (no, user_id, attraction_id, checkin_date, note, created_at)
     VALUES ('NLI20261102-SMOKE1', ?, ?, '2026-11-02', '', ?)`
  ).run(userId, attractionId, ts);

  // stats
  db.prepare(
    `INSERT INTO stat_reports (no, user_id, year, snapshot, generated_at, created_at, updated_at)
     VALUES ('NSR-261102-SMOKE1', ?, 2026, '{}', ?, ?, ?)`
  ).run(userId, ts, ts, ts);

  // education
  db.prepare(
    `INSERT INTO edu_entries (no, category_code, title, status, published_at, created_at, updated_at)
     VALUES ('NEE20261102-SMOKE1', 'WORLD', '验收词条', 'published', ?, ?, ?)`
  ).run(ts, ts, ts);
  db.prepare(
    `INSERT INTO edu_articles (no, title, status, published_at, created_at, updated_at)
     VALUES ('NEA20261102-SMOKE1', '验收教育文章', 'published', ?, ?, ?)`
  ).run(ts, ts, ts);
  db.prepare(
    `INSERT INTO edu_tasks (no, code, title, kind, target_count, status, created_at, updated_at)
     VALUES ('NET20261102-SMOKE1', 'SMOKE_TASK', '验收任务', 'reading', 3, 'active', ?, ?)`
  ).run(ts, ts);

  // appeal
  const appealId = Number(
    db
      .prepare(
        `INSERT INTO appeal_appeals (code, user_id, biz_type, biz_code, status, decision_type, resolved_at, created_at, updated_at)
         VALUES ('NAA-261102-SMOKE1', ?, 'visa', 'NLA-261102-SMOKE1', 'resolved', 'maintain', ?, ?, ?)`
      )
      .run(userId, ts, ts, ts).lastInsertRowid
  );
  db.prepare(
    `INSERT INTO appeal_reviews (code, appeal_id, appeal_code, user_id, status, decision_type, decided_at, created_at, updated_at)
     VALUES ('NAR-261102-SMOKE1', ?, 'NAA-261102-SMOKE1', ?, 'completed', 'undo', ?, ?, ?)`
  ).run(appealId, userId, ts, ts, ts);
  db.prepare(
    `INSERT INTO appeal_decisions (code, appeal_id, appeal_code, user_id, biz_type, decision_type, status, effective_at, verify_token, created_at)
     VALUES ('NAD-261102-SMOKE1234', ?, 'NAA-261102-SMOKE1', ?, 'visa', 'maintain', 'valid', ?, ?, ?)`
  ).run(appealId, userId, ts, 'a'.repeat(48), ts);
  db.prepare(
    `INSERT INTO appeal_complaints (code, user_id, kind, category, status, created_at, updated_at)
     VALUES ('NAC-261102-SMOKE1', ?, 'complaint', 'attitude', 'replied', ?, ?)`
  ).run(userId, ts, ts);
  db.prepare(
    `INSERT INTO appeal_tickets (code, user_id, category, status, created_at, updated_at)
     VALUES ('NAT-261102-SMOKE1', ?, 'consult', 'replied', ?, ?)`
  ).run(userId, ts, ts);

  // -------------------------------------------------------------------------
  // 3. 查询断言
  // -------------------------------------------------------------------------
  const cases = [
    ['NLA-261102-SMOKE1', 'visa', 'application', 'issued', true],
    ['NLT-261102-SMOKE1', 'visa', 'permit', 'valid', true],
    ['IM20261102-SMOKE1', 'immigration', 'declaration', 'approved', true],
    ['PC20261102-SMOKE1', 'immigration', 'pass_code', 'unused', true],
    ['EN20261102-SMOKE1', 'immigration', 'entry', 'entered', true],
    ['EX20261102-SMOKE1', 'immigration', 'exit', 'exited', true],
    ['NLDA-261102-SMOKE1', 'docs', 'application', 'approved', true],
    ['NLDC-261102-SMOKE0123', 'docs', 'certificate', 'valid', true],
    ['NLD20261102-SMOKE1', 'diplomacy', 'relation', 'established', true],
    ['NLE20261102-SMOKE1', 'diplomacy', 'identity', 'active', true],
    ['NLG20261102-SMOKE1', 'diplomacy', 'agreement', 'active', true],
    ['NRR-261102-SMOKE1', 'resident', 'application', 'approved', true],
    ['NRC-261102-SMOKE1234', 'resident', 'card', 'valid', true],
    ['NRX-261102-SMOKE1', 'resident', 'change', 'approved', true],
    ['NJE20261102-SMOKE1', 'protocol', 'event', 'registration', true],
    ['NJR20261102-SMOKE1', 'protocol', 'registration', 'approved', true],
    ['NJI20261102-SMOKE1', 'protocol', 'invitation', 'valid', true],
    ['NJP20261102-SMOKE1', 'protocol', 'pass', 'pending', true],
    ['NJH20261102-SMOKE1', 'protocol', 'host', 'certified', true],
    ['NLC20261102-SMOKE1', 'protocol', 'host_cert', 'certified', true],
    ['NJC20261102-SMOKE1', 'protocol', 'courtesy', 'approved', true],
    ['NAH-261102-SMOKE1', 'archives', 'deletion', 'completed', true],
    ['NAH-261102-SMOKE1-R', 'archives', 'receipt', 'completed', true],
    ['NLM20261102-SMOKE1', 'postal', 'postcard', 'sent', true],
    ['NLQ20261102-SMOKE1', 'postal', 'notice', 'published', true],
    ['NLV20261102-SMOKE1', 'tourism', 'attraction', 'online', true],
    ['NLH20261102-SMOKE1', 'tourism', 'article', 'published', true],
    ['NLB20261102-SMOKE1', 'tourism', 'badge', 'active', true],
    ['NLI20261102-SMOKE1', 'tourism', 'checkin', null, true],
    ['NSR-261102-SMOKE1', 'stats', 'report', null, true],
    ['NEE20261102-SMOKE1', 'education', 'edu_entry', 'published', true],
    ['NEA20261102-SMOKE1', 'education', 'article', 'published', true],
    ['NET20261102-SMOKE1', 'education', 'task', 'active', true],
  ];
  check('查询用例覆盖 33 条注册表', cases.length === VERIFY_TYPES.length, `got ${cases.length}`);

  const allowedKeys = ['checkedAt', 'code', 'found', 'issuedAt', 'kind', 'office', 'status', 'valid', 'validUntil'];
  for (const [code, office, kind, status, valid] of cases) {
    const result = lookupBusinessNumber(code);
    const pass =
      result.found === true &&
      result.office === office &&
      result.kind === kind &&
      result.status === status &&
      result.valid === valid;
    check(`${code} → ${office}/${kind}`, pass, JSON.stringify(result));
    const extra = Object.keys(result).filter((key) => !allowedKeys.includes(key));
    check(`${code} 不泄露额外字段`, extra.length === 0, extra.join(','));
    check(`${code} 含查询时间`, typeof result.checkedAt === 'string' && result.checkedAt.length > 0);
  }

  const lower = lookupBusinessNumber('nla-261102-smoke1');
  check('小写编号自动归一', lower.found && lower.code === 'NLA-261102-SMOKE1' && lower.kind === 'application');

  const prefixClash = lookupBusinessNumber('NLDA-261102-SMOKE1');
  check('NLDA 不会串到外交 NLD', prefixClash.kind === 'application' && prefixClash.office === 'docs');
  const dipCode = lookupBusinessNumber('NLD20261102-SMOKE1');
  check('NLD 正确落到外交关系', dipCode.kind === 'relation' && dipCode.office === 'diplomacy');

  const missing = lookupBusinessNumber('NLA-000000-NOTFND');
  check('未知编号 found=false', missing.found === false && Object.keys(missing).length === 1);

  // 徽章 enabled=0 推导 inactive / valid=false
  db.prepare(
    `INSERT INTO tour_badges (no, code, name, description, icon, threshold, enabled, sort_order, created_at, updated_at)
     VALUES ('NLB20261102-SMOKE2', 'SMOKE_BADGE_OFF', '停用徽章', '', 'TrophyIcon', 1, 0, 0, ?, ?)`
  ).run(ts, ts);
  const offBadge = lookupBusinessNumber('NLB20261102-SMOKE2');
  check('徽章 enabled=0 → inactive / 未生效', offBadge.status === 'inactive' && offBadge.valid === false);

  // 过期证件按日期判无效
  db.prepare("UPDATE visa_permits SET valid_until = '2020-01-01' WHERE visa_no = 'NLT-261102-SMOKE1'").run();
  const expired = lookupBusinessNumber('NLT-261102-SMOKE1');
  check('过期签注 valid=false', expired.found && expired.valid === false && expired.status === 'valid');

  // -------------------------------------------------------------------------
  // 4. 申诉本署 5 类 + 决定书 token
  // -------------------------------------------------------------------------
  for (const [code, kind, valid] of [
    ['NAA-261102-SMOKE1', 'appeal', true],
    ['NAR-261102-SMOKE1', 'review', true],
    ['NAD-261102-SMOKE1234', 'decision', true],
    ['NAC-261102-SMOKE1', 'complaint', true],
    ['NAT-261102-SMOKE1', 'ticket', true],
  ]) {
    const result = maskVerifyResult('', code);
    check(`申诉 ${kind} 仍可验真`, result.found && result.office === 'appeal' && result.kind === kind && result.valid === valid, JSON.stringify(result));
    check(`申诉 ${kind} 不含个人信息`, !JSON.stringify(result).includes('a@example.com') && !('username' in result));
  }
  const tokenResult = maskVerifyResult('a'.repeat(48), '');
  check('决定书 token 仍可验真', tokenResult.found && tokenResult.kind === 'decision' && tokenResult.valid === true);

  if (failures > 0) {
    console.error(`\n${failures} 项失败`);
    process.exitCode = 1;
  } else {
    console.log('\n统一验真中心 smoke 全部通过');
  }
} finally {
  cleanup();
}
