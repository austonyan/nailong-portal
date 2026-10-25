// 奶龍國皇家文書與認證署 (royal documents & certification service)
// Self-contained module: schema, seed, numbering, audit, notifications, lazy
// sweeps and rate limiting. Kept separate from db.js/visa.js so parallel
// service tracks never collide — only `db`/`now` are shared.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, now } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.NAILONG_DATA_DIR || path.join(__dirname, 'data');
export const uploadDir = path.join(dataDir, 'uploads', 'docs');
fs.mkdirSync(uploadDir, { recursive: true });

db.exec(`
CREATE TABLE IF NOT EXISTS doc_types (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  guide          TEXT NOT NULL DEFAULT '',
  biz_no_label   TEXT NOT NULL DEFAULT '',
  biz_required   INTEGER NOT NULL DEFAULT 0,
  biz_source     TEXT NOT NULL DEFAULT '',
  validity_days  INTEGER NOT NULL DEFAULT 365,
  form_fields    TEXT NOT NULL DEFAULT '[]',
  materials      TEXT NOT NULL DEFAULT '[]',
  enabled        INTEGER NOT NULL DEFAULT 1,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- 申请状态机: draft → pending → (approved | rejected | supplementing)
--   supplementing → (补交后) pending; pending/supplementing → withdrawn
CREATE TABLE IF NOT EXISTS doc_applications (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  app_no               TEXT NOT NULL UNIQUE,
  user_id              INTEGER NOT NULL REFERENCES users(id),
  type_code            TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','pending','supplementing','approved','rejected','withdrawn')),
  nickname             TEXT NOT NULL DEFAULT '',
  contact              TEXT NOT NULL DEFAULT '',
  biz_no               TEXT NOT NULL DEFAULT '',
  biz_check            TEXT NOT NULL DEFAULT '{}',
  purpose              TEXT NOT NULL DEFAULT 'display'
                       CHECK (purpose IN ('display','collect','event','entry_aux','other')),
  form_data            TEXT NOT NULL DEFAULT '{}',
  supplement_note      TEXT NOT NULL DEFAULT '',
  supplement_deadline  TEXT,
  reject_code          TEXT,
  reject_comment       TEXT,
  decided_by           INTEGER,
  decided_at           TEXT,
  submitted_at         TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_app_user ON doc_applications (user_id, status);
CREATE INDEX IF NOT EXISTS idx_doc_app_status ON doc_applications (status, submitted_at);

CREATE TABLE IF NOT EXISTS doc_materials (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES doc_applications(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL,
  kind           TEXT NOT NULL DEFAULT 'main',
  origin         TEXT NOT NULL DEFAULT 'initial' CHECK (origin IN ('initial','supplement')),
  filename       TEXT NOT NULL,
  mime           TEXT NOT NULL,
  size           INTEGER NOT NULL,
  path           TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_mat_app ON doc_materials (application_id);

-- 认证记录 / 操作日志(申请与文书共用一条时间线)
CREATE TABLE IF NOT EXISTS doc_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES doc_applications(id) ON DELETE CASCADE,
  actor_id       INTEGER,
  actor_name     TEXT NOT NULL DEFAULT '',
  action         TEXT NOT NULL,
  reason_code    TEXT,
  comment        TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_rec_app ON doc_records (application_id, created_at);

-- 文书状态机: (签发即 valid) → used | expired(惰性) | revoked
-- application_id 不加 UNIQUE: 补发(regenerate)会为同一申请签发新编号文书。
CREATE TABLE IF NOT EXISTS doc_certificates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cert_no         TEXT NOT NULL UNIQUE,
  application_id  INTEGER NOT NULL REFERENCES doc_applications(id),
  user_id         INTEGER NOT NULL,
  type_code       TEXT NOT NULL,
  holder_name     TEXT NOT NULL DEFAULT '',
  biz_no          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','used','expired','revoked')),
  verify_token    TEXT NOT NULL UNIQUE,
  issued_at       TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  revoked_reason  TEXT NOT NULL DEFAULT '',
  revoked_by_name TEXT NOT NULL DEFAULT '',
  revoked_at      TEXT,
  remind_sent     INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_cert_app ON doc_certificates (application_id);
CREATE INDEX IF NOT EXISTS idx_doc_cert_user ON doc_certificates (user_id, status);

CREATE TABLE IF NOT EXISTS doc_verify_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  query      TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  user_id    INTEGER,
  result     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_verify_time ON doc_verify_logs (created_at);

CREATE TABLE IF NOT EXISTS doc_messages (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  application_id INTEGER,
  type           TEXT NOT NULL DEFAULT 'system',
  params         TEXT NOT NULL DEFAULT '{}',
  read           INTEGER NOT NULL DEFAULT 0,
  archived       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_msg_user ON doc_messages (user_id, archived, read);

CREATE TABLE IF NOT EXISTS doc_notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','policy','event')),
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER,
  actor_name  TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id   TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_blacklist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Lightweight migration for databases created before a schema change: the
// certificates table used to carry a UNIQUE(application_id) which conflicts
// with certificate regeneration (reissue). Rebuild it once, keeping rows.
function migrateDocs() {
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'doc_certificates'").get()?.sql || '';
  if (!sql.includes('UNIQUE REFERENCES doc_applications')) return;
  db.exec(`
    ALTER TABLE doc_certificates RENAME TO doc_certificates_old;
    CREATE TABLE doc_certificates (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      cert_no         TEXT NOT NULL UNIQUE,
      application_id  INTEGER NOT NULL REFERENCES doc_applications(id),
      user_id         INTEGER NOT NULL,
      type_code       TEXT NOT NULL,
      holder_name     TEXT NOT NULL DEFAULT '',
      biz_no          TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','used','expired','revoked')),
      verify_token    TEXT NOT NULL UNIQUE,
      issued_at       TEXT NOT NULL,
      expires_at      TEXT NOT NULL,
      revoked_reason  TEXT NOT NULL DEFAULT '',
      revoked_by_name TEXT NOT NULL DEFAULT '',
      revoked_at      TEXT,
      remind_sent     INTEGER NOT NULL DEFAULT 0,
      updated_at      TEXT NOT NULL
    );
    INSERT INTO doc_certificates SELECT * FROM doc_certificates_old;
    DROP TABLE doc_certificates_old;
    CREATE INDEX IF NOT EXISTS idx_doc_cert_app ON doc_certificates (application_id);
    CREATE INDEX IF NOT EXISTS idx_doc_cert_user ON doc_certificates (user_id, status);
  `);
}
migrateDocs();

// ---------------------------------------------------------------------------
// Seed: permissions, roles, service entry, document types, notices, config.
// ---------------------------------------------------------------------------
export const DOCS_PERMISSIONS = [
  { key: 'docs:apply', name: '文书认证申请', description: '申请文书认证、管理材料与查看文书', grp: 'docs' },
  { key: 'docs:certify', name: '文书认证审核', description: '在认证队列中审核申请、签发与驳回文书', grp: 'docs' },
  { key: 'docs:manage', name: '文书管理', description: '管理文书类型、公告、验真配置与风控', grp: 'docs' },
];

function seedDocs() {
  const insertPermission = db.prepare(
    'INSERT OR IGNORE INTO permissions (key, name, description, grp) VALUES (@key, @name, @description, @grp)'
  );
  const insertRole = db.prepare(
    'INSERT OR IGNORE INTO roles (key, name, description, is_system, created_at) VALUES (@key, @name, @description, @is_system, @now)'
  );
  const insertRolePermission = db.prepare(
    'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) SELECT ?, id FROM permissions WHERE key = ?'
  );
  const roleId = (key) => db.prepare('SELECT id FROM roles WHERE key = ?').get(key)?.id;

  const run = db.transaction(() => {
    for (const p of DOCS_PERMISSIONS) insertPermission.run(p);

    // 认证员: 队列隔离 —— 只进认证工作台,不带任何门户管理权限。
    insertRole.run({
      key: 'docs_certifier',
      name: '文书认证员',
      description: '审核文书认证申请并签发电子文书(队列隔离,不含门户管理)',
      is_system: 1,
      now: now(),
    });
    insertRole.run({
      key: 'docs_admin',
      name: '文书管理员',
      description: '文书审核与文书署配置管理',
      is_system: 1,
      now: now(),
    });
    const docsKeys = DOCS_PERMISSIONS.map((p) => p.key);
    const grant = (roleKey, keys) => {
      const rid = roleId(roleKey);
      if (rid) for (const key of keys) insertRolePermission.run(rid, key);
    };
    // 认证员只进认证队列;管理员全量。
    grant('docs_certifier', ['docs:apply', 'docs:certify']);
    grant('docs_admin', docsKeys);
    // 已存在的库也要补齐: 普通用户可申请认证,管理员全量。
    const uid = roleId('user');
    if (uid) insertRolePermission.run(uid, 'docs:apply');
    const adminId = roleId('admin');
    if (adminId) for (const key of docsKeys) insertRolePermission.run(adminId, key);

    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, description, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('docs', '奶龍國皇家文書與認證署', '认证邀请函、签注证明、居民卡等文书:申请、审核、签发、验真', '/docs', 'BadgeCheckIcon', 'app-yellow', 'docs:apply', 'internal_sso', 1, -2, @now, @now)`
    ).run({ now: now() });

    if (db.prepare('SELECT COUNT(*) AS n FROM doc_types').get().n === 0) {
      const insertType = db.prepare(
        `INSERT INTO doc_types (code, name, description, guide, biz_no_label, biz_required, biz_source, validity_days, form_fields, materials, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @description, @guide, @biz_no_label, @biz_required, @biz_source, @validity_days, @form_fields, @materials, @enabled, @sort_order, @now, @now)`
      );
      const mat = (key, label, required, accept = 'image/*,application/pdf', max_count = 3) =>
        JSON.stringify([{ key, label, required, accept, max_mb: 10, max_count }]);
      const fields = (list) => JSON.stringify(list);
      const ts = now();
      const types = [
        {
          code: 'VISA_CERT',
          name: '签注证明认证',
          description: '对奶龍國簽註申請署签发的电子签注出具认证证明',
          guide:
            '用途:为已签发的电子签注出具纸质感的认证证明,可用于展示与收藏。需要材料:签注详情页截图;身份说明选填。关联业务:填写签注编号(如 NLT-260101-XXXXXX)。认证后 180 天内有效。',
          biz_no_label: '签注编号',
          biz_required: 1,
          biz_source: 'visa',
          validity_days: 180,
          form_fields: fields([{ key: 'visit_note', label: '行程补充说明', required: 0, max: 200, placeholder: '选填,一句话描述这次旅行' }]),
          materials: mat('proof', '签注详情截图', 1),
          sort_order: 0,
        },
        {
          code: 'INVITE',
          name: '邀请函认证',
          description: '认证奶龙国居民或机构发出的邀请函',
          guide:
            '用途:验证邀请函真实性,常用于活动报名与入境申报辅助。需要材料:邀请函扫描件;身份说明选填。关联业务:填写邀请函编号(由礼宾与活动署签发,联动预留中)。认证后 180 天内有效。',
          biz_no_label: '邀请函编号',
          biz_required: 0,
          biz_source: 'protocol',
          validity_days: 180,
          form_fields: fields([
            { key: 'inviter_name', label: '邀请人', required: 1, max: 60, placeholder: '邀请你的居民或机构名称' },
            { key: 'occasion', label: '邀请事由', required: 1, max: 120, placeholder: '例如:奶龙节开幕式' },
          ]),
          materials: mat('main', '邀请函扫描件', 1),
          sort_order: 1,
        },
        {
          code: 'ENTRY_CERT',
          name: '入境记录证明',
          description: '为入境署受理的入境申报出具记录证明',
          guide:
            '用途:证明某次入境申报真实存在,用于回溯行程。需要材料:入境申报回执截图。关联业务:填写申报编号(由入境署生成,联动预留中)。认证后 90 天内有效。',
          biz_no_label: '申报编号',
          biz_required: 0,
          biz_source: 'entry',
          validity_days: 90,
          form_fields: fields([{ key: 'entry_port', label: '入境口岸', required: 1, max: 60, placeholder: '例如:贝壳湾口岸' }]),
          materials: mat('proof', '入境申报回执截图', 1),
          sort_order: 2,
        },
        {
          code: 'RESIDENT_CARD',
          name: '居民卡认证',
          description: '对居民登记署登记的居民身份出具认证文书',
          guide:
            '用途:为居民编号出具认证文书,是最常用的身份类娱乐文书。需要材料:居民登记页截图;头像照片选填。关联业务:填写居民编号(由居民登记署生成,联动预留中)。认证后 365 天内有效。',
          biz_no_label: '居民编号',
          biz_required: 0,
          biz_source: 'resident',
          validity_days: 365,
          form_fields: fields([{ key: 'district', label: '居住街区', required: 1, max: 60, placeholder: '例如:南瓜街' }]),
          materials: JSON.stringify([
            { key: 'proof', label: '居民登记页截图', required: 1, accept: 'image/*,application/pdf', max_mb: 10, max_count: 3 },
            { key: 'avatar', label: '头像照片', required: 0, accept: 'image/*', max_mb: 10, max_count: 1 },
          ]),
          sort_order: 3,
        },
        {
          code: 'EVENT_PASS',
          name: '活动凭证认证',
          description: '认证活动参与凭证,如奶龙节、演唱会的参与证明',
          guide:
            '用途:为活动凭证背书,可用于收藏或下次活动的快速报名。需要材料:活动凭证截图(门票、参与码等)。关联业务:填写活动编号(由礼宾与活动署生成,联动预留中)。认证后 90 天内有效。',
          biz_no_label: '活动编号',
          biz_required: 0,
          biz_source: 'protocol',
          validity_days: 90,
          form_fields: fields([{ key: 'event_name', label: '活动名称', required: 1, max: 80, placeholder: '例如:奶龙节·星火之夜' }]),
          materials: mat('voucher', '活动凭证截图', 1),
          sort_order: 4,
        },
        {
          code: 'DIPLOMATIC',
          name: '外交文书认证',
          description: '认证外交事务署往来文书与建交文件',
          guide:
            '用途:认证使团往来文书、建交纪念文件。需要材料:外交文书扫描件。关联业务:填写外交编号(由外交事务署生成,联动预留中)。认证后 365 天内有效。仅限使团渠道提交。',
          biz_no_label: '外交编号',
          biz_required: 0,
          biz_source: 'foreign',
          validity_days: 365,
          form_fields: fields([{ key: 'mission', label: '使团名称', required: 1, max: 80, placeholder: '例如:南瓜使团' }]),
          materials: mat('doc', '外交文书扫描件', 1),
          sort_order: 5,
        },
      ];
      for (const t of types) insertType.run({ ...t, enabled: 1, now: ts });
    }

    if (db.prepare('SELECT COUNT(*) AS n FROM doc_notices').get().n === 0) {
      const insertNotice = db.prepare(
        `INSERT INTO doc_notices (title, body, level, enabled, created_at, updated_at)
         VALUES (@title, @body, @level, 1, @now, @now)`
      );
      insertNotice.run({
        title: '六类文书认证全面开放',
        body: '皇家文书与认证署现已开放签注证明、邀请函、入境记录证明、居民卡、活动凭证、外交文书六类文书的在线认证申请,审核预计 72 小时内完成。',
        level: 'event',
        now: now(),
      });
      insertNotice.run({
        title: '认证规则与处理时长',
        body: '每份文书由认证署人工审核:提交后进入待认证队列,材料齐全通常 72 小时内出结果;需要补件时请在 7 天内补交,逾期申请自动关闭。认证通过即生成带编号的电子文书,可在验真中心查验。',
        level: 'policy',
        now: now(),
      });
      insertNotice.run({
        title: '谨防冒充认证诈骗',
        body: '本署认证完全免费:不收取任何费用,请勿相信任何收费代办或"保证通过"的说法。',
        level: 'info',
        now: now(),
      });
    }

    const defaults = {
      'docs.app_no_prefix': 'NLDA',
      'docs.cert_no_prefix': 'NLDC',
      'docs.supplement_days': '7',
      'docs.review_hours_hint': '72',
      'docs.verify_limit_per_5min': '20',
      'docs.apply_daily_limit': '10',
      'docs.upload_max_mb': '10',
      'docs.seal_enabled': '1',
      'docs.issuer_name': '奶龍國皇家文書與認證署',
    };
    const insertConfig = db.prepare('INSERT OR IGNORE INTO doc_config (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(defaults)) insertConfig.run(k, v);
  });
  run();
}
seedDocs();

// ---------------------------------------------------------------------------
// Config / numbering
// ---------------------------------------------------------------------------

export function getConfig(key, fallback = null) {
  const row = db.prepare('SELECT value FROM doc_config WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function getConfigNumber(key, fallback) {
  const v = Number(getConfig(key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function setConfig(key, value) {
  db.prepare('INSERT INTO doc_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value)
  );
}

// Unpredictable, human-friendly alphabet: no vowels / ambiguous glyphs.
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

// Checksum: weighted sum mod 31, last char of the certificate number — makes
// numbers verifiable (typo detection) without exposing any sequence.
export function certChecksum(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) sum = (sum + ALPHABET.indexOf(body[i]) * (i + 1)) % ALPHABET.length;
  return ALPHABET[sum];
}

export function isValidCertNoFormat(no) {
  const prefix = getConfig('docs.cert_no_prefix', 'NLDC');
  if (typeof no !== 'string') return false;
  const parts = no.toUpperCase().split('-');
  if (parts.length !== 3 || parts[0] !== prefix || parts[1].length !== 6 || parts[2].length !== 9) return false;
  const body = `${parts[1]}${parts[2].slice(0, 8)}`;
  return certChecksum(body) === parts[2][8];
}

export function nextApplicationNo() {
  const prefix = getConfig('docs.app_no_prefix', 'NLDA');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const no = `${prefix}-${dateStamp()}-${randomCode(6)}`;
    if (!db.prepare('SELECT id FROM doc_applications WHERE app_no = ?').get(no)) return no;
  }
  throw new Error('cannot generate application number');
}

export function nextCertNo() {
  const prefix = getConfig('docs.cert_no_prefix', 'NLDC');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const body = `${dateStamp()}${randomCode(8)}`;
    const no = `${prefix}-${body.slice(0, 6)}-${body.slice(6)}${certChecksum(body)}`;
    if (!db.prepare('SELECT id FROM doc_certificates WHERE cert_no = ?').get(no)) return no;
  }
  throw new Error('cannot generate certificate number');
}

// ---------------------------------------------------------------------------
// Audit / notifications
// ---------------------------------------------------------------------------

export function audit(actor, action, targetType, targetId, detail = {}) {
  db.prepare(
    'INSERT INTO doc_audit (actor_id, actor_name, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    actor?.id ?? null,
    actor?.displayName || actor?.username || actor?.name || '',
    action,
    targetType,
    String(targetId ?? ''),
    JSON.stringify(detail),
    now()
  );
}

// 站内信只存类型与参数,文案由前端按 i18n 渲染,保证简繁双语一致。
export function sendMsg(userId, applicationId, type, params = {}) {
  db.prepare(
    'INSERT INTO doc_messages (user_id, application_id, type, params, read, archived, created_at) VALUES (?, ?, ?, ?, 0, 0, ?)'
  ).run(userId, applicationId ?? null, type, JSON.stringify(params), now());
}

export function addRecord(applicationId, actor, action, { reasonCode = null, comment = '' } = {}) {
  db.prepare(
    'INSERT INTO doc_records (application_id, actor_id, actor_name, action, reason_code, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(applicationId, actor?.id ?? null, actor?.displayName || actor?.username || actor?.name || '', action, reasonCode, comment, now());
}

// ---------------------------------------------------------------------------
// Lazy sweeps — enforced on read, no cron needed.
// ---------------------------------------------------------------------------

export function sweepApplications() {
  const overdue = db
    .prepare(
      `SELECT id, user_id, app_no FROM doc_applications
       WHERE status = 'supplementing' AND supplement_deadline IS NOT NULL AND supplement_deadline < ?`
    )
    .all(now());
  for (const app of overdue) {
    db.prepare("UPDATE doc_applications SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(now(), app.id);
    sendMsg(app.user_id, app.id, 'closed', { appNo: app.app_no });
    audit({ name: 'system' }, 'auto_close_supplement_timeout', 'application', app.app_no);
  }
}

export function sweepCertificates() {
  const expired = db
    .prepare("SELECT id, cert_no, user_id, application_id FROM doc_certificates WHERE status = 'valid' AND expires_at < ?")
    .all(now());
  for (const cert of expired) {
    db.prepare("UPDATE doc_certificates SET status = 'expired', updated_at = ? WHERE id = ?").run(now(), cert.id);
    sendMsg(cert.user_id, cert.application_id, 'expired', { certNo: cert.cert_no });
    addRecord(cert.application_id, { name: 'system' }, 'auto_expired', { comment: cert.cert_no });
    audit({ name: 'system' }, 'auto_expire_certificate', 'certificate', cert.cert_no);
  }

  // 到期前 72 小时的一次性提醒
  const remindAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const soon = db
    .prepare(
      `SELECT id, cert_no, user_id, application_id FROM doc_certificates
       WHERE status = 'valid' AND remind_sent = 0 AND expires_at <= ?`
    )
    .all(remindAt);
  for (const cert of soon) {
    db.prepare('UPDATE doc_certificates SET remind_sent = 1 WHERE id = ?').run(cert.id);
    sendMsg(cert.user_id, cert.application_id, 'expiry_reminder', { certNo: cert.cert_no });
  }
}

export function sweepAll() {
  sweepApplications();
  sweepCertificates();
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory sliding window (single-node MVP), independent
// copy so this module never imports from sibling service tracks.
// ---------------------------------------------------------------------------

const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const t = Date.now();
  const list = (buckets.get(key) || []).filter((ts) => t - ts < windowMs);
  if (list.length >= max) return false;
  list.push(t);
  buckets.set(key, list);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((ts) => t - ts >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

export function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

// ---------------------------------------------------------------------------
// 关联业务校验(联动预留): 其他署尚未接入,这里只做登记与缓存。
// ---------------------------------------------------------------------------

export function checkBizNo(typeRow, bizNo) {
  const result = {
    checked: false,
    reserved: true,
    source: typeRow?.biz_source || '',
    bizNo,
    checkedAt: now(),
  };
  return result;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function parseMaybeJson(text, fallback) {
  try {
    const v = JSON.parse(text);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function serializeType(row, { withConfig = true } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    guide: row.guide,
    bizNoLabel: row.biz_no_label,
    bizRequired: !!row.biz_required,
    bizSource: row.biz_source,
    validityDays: row.validity_days,
    enabled: !!row.enabled,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (withConfig) {
    out.formFields = parseMaybeJson(row.form_fields, []);
    out.materials = parseMaybeJson(row.materials, []);
  }
  return out;
}

export function serializeApplication(row) {
  if (!row) return null;
  return {
    id: row.id,
    appNo: row.app_no,
    userId: row.user_id,
    typeCode: row.type_code,
    status: row.status,
    nickname: row.nickname,
    contact: row.contact,
    bizNo: row.biz_no,
    bizCheck: parseMaybeJson(row.biz_check, {}),
    purpose: row.purpose,
    formData: parseMaybeJson(row.form_data, {}),
    supplementNote: row.supplement_note,
    supplementDeadline: row.supplement_deadline,
    rejectCode: row.reject_code,
    rejectComment: row.reject_comment,
    decidedAt: row.decided_at,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeMaterial(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    origin: row.origin,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    createdAt: row.created_at,
  };
}

export function serializeRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id,
    actorName: row.actor_name,
    action: row.action,
    reasonCode: row.reason_code,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

export function serializeCertificate(row) {
  if (!row) return null;
  return {
    id: row.id,
    certNo: row.cert_no,
    applicationId: row.application_id,
    userId: row.user_id,
    typeCode: row.type_code,
    holderName: row.holder_name,
    bizNo: row.biz_no,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedReason: row.revoked_reason,
    revokedAt: row.revoked_at,
  };
}

export function serializeMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    applicationId: row.application_id,
    type: row.type,
    params: parseMaybeJson(row.params, {}),
    read: !!row.read,
    archived: !!row.archived,
    createdAt: row.created_at,
  };
}

// 验真脱敏: 绝不返回持有人昵称、联系方式、关联业务编号等个人信息。
export function maskCertificate(cert, typeRow) {
  if (!cert) return { found: false };
  return {
    found: true,
    certNo: cert.cert_no,
    typeCode: cert.type_code,
    typeName: typeRow?.name ?? cert.type_code,
    status: cert.status,
    valid: cert.status === 'valid',
    issuedAt: cert.issued_at,
    expiresAt: cert.expires_at,
    issuer: getConfig('docs.issuer_name', '奶龍國皇家文書與認證署'),
  };
}

export function getApplicationRow(id) {
  return db.prepare('SELECT * FROM doc_applications WHERE id = ?').get(id);
}

export function getTypeRow(code) {
  return db.prepare('SELECT * FROM doc_types WHERE code = ?').get(code);
}

export function getCertRowByApplication(applicationId) {
  return db.prepare('SELECT * FROM doc_certificates WHERE application_id = ?').get(applicationId);
}

export function isBlacklisted(userId) {
  return !!db.prepare('SELECT id FROM doc_blacklist WHERE user_id = ?').get(userId);
}
