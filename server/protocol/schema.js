// 奶龙国皇家礼宾与活动署 — schema, seeds and RBAC wiring.
//
// Fully additive module: every table is prefixed pro_* and the shared registries
// (permissions / roles / services) only ever receive INSERT OR IGNORE rows, so
// parallel service workstreams never disturb each other.
import { db, now } from '../db.js';

let ensured = false;

export function ensureProtocolSchema() {
  if (ensured) return;
  ensured = true;
  db.exec(`
  CREATE TABLE IF NOT EXISTS pro_event_types (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    code             TEXT NOT NULL UNIQUE,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    guide            TEXT NOT NULL DEFAULT '',
    required_fields  TEXT NOT NULL DEFAULT 'nickname,contact',
    materials        TEXT NOT NULL DEFAULT '[]',
    allow_companions INTEGER NOT NULL DEFAULT 1,
    max_companions   INTEGER NOT NULL DEFAULT 3,
    default_capacity INTEGER NOT NULL DEFAULT 100,
    enabled          INTEGER NOT NULL DEFAULT 1,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );

  -- 活动状态机: draft → pending_publish → registration → registration_closed
  --   → ongoing → ended; registration/registration_closed/ongoing → cancelled
  CREATE TABLE IF NOT EXISTS pro_events (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    event_no              TEXT NOT NULL UNIQUE,
    type_code             TEXT NOT NULL,
    title                 TEXT NOT NULL,
    subtitle              TEXT NOT NULL DEFAULT '',
    description           TEXT NOT NULL DEFAULT '',
    schedule              TEXT NOT NULL DEFAULT '[]',
    venue_name            TEXT NOT NULL DEFAULT '',
    venue_note            TEXT NOT NULL DEFAULT '',
    capacity              INTEGER NOT NULL DEFAULT 100,
    waitlist_enabled      INTEGER NOT NULL DEFAULT 1,
    status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','pending_publish','registration','registration_closed','ongoing','ended','cancelled')),
    resident_only         INTEGER NOT NULL DEFAULT 0,
    diplomatic_only       INTEGER NOT NULL DEFAULT 0,
    registration_deadline TEXT,
    starts_at             TEXT,
    ends_at               TEXT,
    conditions            TEXT NOT NULL DEFAULT '',
    materials             TEXT NOT NULL DEFAULT '[]',
    notice                TEXT NOT NULL DEFAULT '',
    cover_color           TEXT NOT NULL DEFAULT 'app-teal',
    created_by            INTEGER,
    published_at          TEXT,
    cancelled_at          TEXT,
    cancel_reason         TEXT NOT NULL DEFAULT '',
    deleted_at            TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pro_event_status ON pro_events (status, starts_at);
  CREATE INDEX IF NOT EXISTS idx_pro_event_type ON pro_events (type_code);

  CREATE TABLE IF NOT EXISTS pro_event_notices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER NOT NULL REFERENCES pro_events(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','change','cancel')),
    created_at TEXT NOT NULL
  );

  -- 报名状态机: draft → pending_review → (approved | waitlisted | rejected)
  --   waitlisted → approved(候补转正); approved → checked_in → finished;
  --   draft/pending_review/approved/waitlisted → cancelled
  CREATE TABLE IF NOT EXISTS pro_registrations (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    reg_no               TEXT NOT NULL UNIQUE,
    user_id              INTEGER NOT NULL REFERENCES users(id),
    event_id             INTEGER NOT NULL REFERENCES pro_events(id),
    status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','pending_review','approved','waitlisted','rejected','cancelled','checked_in','finished')),
    nickname             TEXT NOT NULL DEFAULT '',
    contact              TEXT NOT NULL DEFAULT '',
    identity_type        TEXT NOT NULL DEFAULT 'ordinary'
                         CHECK (identity_type IN ('ordinary','resident','diplomatic','foreign')),
    identity_no          TEXT NOT NULL DEFAULT '',
    identity_check       TEXT NOT NULL DEFAULT 'not_required',
    party_size           INTEGER NOT NULL DEFAULT 1,
    companions           TEXT NOT NULL DEFAULT '[]',
    note                 TEXT NOT NULL DEFAULT '',
    invitation_no        TEXT NOT NULL DEFAULT '',
    entertainment_agreed INTEGER NOT NULL DEFAULT 0,
    reject_code          TEXT,
    reject_comment       TEXT NOT NULL DEFAULT '',
    review_note          TEXT NOT NULL DEFAULT '',
    decided_by           INTEGER,
    decided_at           TEXT,
    checked_in_at        TEXT,
    checked_out_at       TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    submitted_at         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pro_reg_user ON pro_registrations (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_pro_reg_event ON pro_registrations (event_id, status);
  CREATE INDEX IF NOT EXISTS idx_pro_reg_queue ON pro_registrations (status, submitted_at);

  CREATE TABLE IF NOT EXISTS pro_materials (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('registration','host')),
    owner_id   INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'other',
    filename   TEXT NOT NULL,
    mime       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    path       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pro_mat_owner ON pro_materials (owner_type, owner_id);

  -- 邀请函状态机: valid → (used | expired | revoked)
  CREATE TABLE IF NOT EXISTS pro_invitations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    invite_no         TEXT NOT NULL UNIQUE,
    event_id          INTEGER NOT NULL REFERENCES pro_events(id),
    inviter_id        INTEGER,
    inviter_name      TEXT NOT NULL DEFAULT '',
    invitee_user_id   INTEGER NOT NULL REFERENCES users(id),
    invitee_name      TEXT NOT NULL DEFAULT '',
    type              TEXT NOT NULL DEFAULT 'event'
                      CHECK (type IN ('event','foreign','resident','diplomatic')),
    status            TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','used','expired','revoked')),
    response          TEXT NOT NULL DEFAULT 'pending' CHECK (response IN ('pending','accepted','declined')),
    valid_from        TEXT,
    valid_until       TEXT,
    token             TEXT NOT NULL UNIQUE,
    note              TEXT NOT NULL DEFAULT '',
    accepted_at       TEXT,
    revoked_reason    TEXT NOT NULL DEFAULT '',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pro_inv_user ON pro_invitations (invitee_user_id, status);
  CREATE INDEX IF NOT EXISTS idx_pro_inv_event ON pro_invitations (event_id);

  -- 活动凭证状态机: pending → (used | expired | voided)
  CREATE TABLE IF NOT EXISTS pro_passes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pass_no         TEXT NOT NULL UNIQUE,
    registration_id INTEGER NOT NULL UNIQUE REFERENCES pro_registrations(id),
    event_id        INTEGER NOT NULL REFERENCES pro_events(id),
    user_id         INTEGER NOT NULL REFERENCES users(id),
    holder_name     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','used','expired','voided')),
    token           TEXT NOT NULL UNIQUE,
    issued_at       TEXT NOT NULL,
    valid_until     TEXT,
    void_reason     TEXT NOT NULL DEFAULT '',
    reissued_from   TEXT NOT NULL DEFAULT '',
    checked_in_at   TEXT,
    checked_out_at  TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pro_pass_user ON pro_passes (user_id, status);

  -- 接待方状态机: draft → pending_review → (certified | rejected |
  --   supplement_required → pending_review); certified ↔ frozen;
  --   certified/frozen → revoked
  CREATE TABLE IF NOT EXISTS pro_hosts (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    host_no              TEXT NOT NULL UNIQUE,
    user_id              INTEGER NOT NULL REFERENCES users(id),
    type                 TEXT NOT NULL DEFAULT 'organizer'
                         CHECK (type IN ('organizer','community','diplomatic','resident_group')),
    name                 TEXT NOT NULL DEFAULT '',
    contact_nickname     TEXT NOT NULL DEFAULT '',
    contact              TEXT NOT NULL DEFAULT '',
    intro                TEXT NOT NULL DEFAULT '',
    status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','pending_review','supplement_required','certified','frozen','rejected','revoked')),
    cert_no              TEXT,
    can_publish          INTEGER NOT NULL DEFAULT 0,
    can_invite           INTEGER NOT NULL DEFAULT 0,
    reject_code          TEXT,
    reject_comment       TEXT NOT NULL DEFAULT '',
    review_note          TEXT NOT NULL DEFAULT '',
    supplement_note      TEXT NOT NULL DEFAULT '',
    supplement_deadline  TEXT,
    decided_by           INTEGER,
    decided_at           TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    submitted_at         TEXT,
    deleted_at           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pro_host_user ON pro_hosts (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_pro_host_queue ON pro_hosts (status, submitted_at);

  CREATE TABLE IF NOT EXISTS pro_courtesy_types (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT NOT NULL UNIQUE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    requirements TEXT NOT NULL DEFAULT '',
    enabled      INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  -- 礼遇申请状态机: pending_review → (approved | rejected);
  --   approved → (used | cancelled) ; approved 到期惰性过期(expired)
  CREATE TABLE IF NOT EXISTS pro_courtesy_apps (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    app_no         TEXT NOT NULL UNIQUE,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    type_code      TEXT NOT NULL,
    basis_type     TEXT NOT NULL CHECK (basis_type IN ('resident','diplomatic','invitation')),
    basis_no       TEXT NOT NULL DEFAULT '',
    note           TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending_review'
                   CHECK (status IN ('pending_review','approved','rejected','used','cancelled','expired')),
    reject_code    TEXT,
    reject_comment TEXT NOT NULL DEFAULT '',
    review_note    TEXT NOT NULL DEFAULT '',
    decided_by     INTEGER,
    decided_at     TEXT,
    valid_until    TEXT,
    used_at        TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    submitted_at   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pro_cour_user ON pro_courtesy_apps (user_id, status);

  CREATE TABLE IF NOT EXISTS pro_courtesy_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL,
    application_id INTEGER REFERENCES pro_courtesy_apps(id),
    type_code      TEXT NOT NULL,
    note           TEXT NOT NULL DEFAULT '',
    created_by     INTEGER,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pro_checkin_logs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pass_id         INTEGER,
    registration_id INTEGER,
    event_id        INTEGER,
    action          TEXT NOT NULL CHECK (action IN ('in','out')),
    source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','scan')),
    actor_id        INTEGER,
    note            TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pro_checkin_event ON pro_checkin_logs (event_id, created_at);

  CREATE TABLE IF NOT EXISTS pro_verify_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    query      TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    kind       TEXT NOT NULL DEFAULT '',
    result     TEXT NOT NULL DEFAULT '',
    source     TEXT NOT NULL DEFAULT 'web',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pro_verify_time ON pro_verify_logs (created_at);

  CREATE TABLE IF NOT EXISTS pro_notices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','policy','event')),
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pro_messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_code TEXT NOT NULL,
    title         TEXT NOT NULL,
    body          TEXT NOT NULL,
    related       TEXT NOT NULL DEFAULT '{}',
    read          INTEGER NOT NULL DEFAULT 0,
    archived      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pro_msg_user ON pro_messages (user_id, archived, read);

  CREATE TABLE IF NOT EXISTS pro_message_templates (
    code           TEXT PRIMARY KEY,
    title_template TEXT NOT NULL,
    body_template  TEXT NOT NULL,
    variables      TEXT NOT NULL DEFAULT '',
    enabled        INTEGER NOT NULL DEFAULT 1,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pro_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER,
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pro_audit_action ON pro_audit (action);

  CREATE TABLE IF NOT EXISTS pro_blacklist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    reason     TEXT NOT NULL DEFAULT '',
    level      TEXT NOT NULL DEFAULT 'warn' CHECK (level IN ('warn','block')),
    created_by INTEGER,
    created_at TEXT NOT NULL,
    lifted_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS pro_rate_limits (
    actor        TEXT NOT NULL,
    action       TEXT NOT NULL,
    window_start TEXT NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (actor, action)
  );

  CREATE TABLE IF NOT EXISTS pro_tickets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    subject    TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    reply      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pro_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `);

  seedProtocol();
}

// ---------------------------------------------------------------------------
// Seeds — idempotent, INSERT OR IGNORE everywhere.
// ---------------------------------------------------------------------------

const PROTOCOL_PERMISSIONS = [
  { key: 'evt:portal', name: '礼宾与活动署访问', description: '浏览活动、报名、邀请函、活动凭证与礼宾服务', grp: 'protocol' },
  { key: 'evt:review', name: '活动审核', description: '审核活动报名、接待方认证与礼遇申请(队列隔离)', grp: 'protocol' },
  { key: 'evt:checkin', name: '活动签到', description: '核销活动凭证、处理签到与签退记录', grp: 'protocol' },
  { key: 'evt:manage', name: '礼宾与活动署管理', description: '活动发布、类型配置、邀请函/凭证、验真、风控、统计与审计', grp: 'protocol' },
];

const MESSAGE_TEMPLATES = [
  { code: 'registration_submitted', title: '报名已提交:{{no}}', body: '你的活动报名 {{no}} 已提交至皇家礼宾与活动署,预计 {{hours}} 小时内完成审核。可在"我的报名"查看进度。', variables: 'no, hours' },
  { code: 'registration_approved', title: '报名已通过:{{no}}', body: '恭喜!活动"{{event}}"的报名 {{no}} 已通过审核。活动凭证 {{passNo}} 已生成,可在"我的活动凭证"查看。', variables: 'no, event, passNo' },
  { code: 'registration_waitlisted', title: '已进入候补名单:{{no}}', body: '活动"{{event}}"名额已满,报名 {{no}} 已进入候补。如有名额释放,系统将按顺序自动转正并通知你。', variables: 'no, event' },
  { code: 'registration_promoted', title: '候补转正:{{no}}', body: '好消息!活动"{{event}}"有空余名额,你的报名 {{no}} 已转为正式名额,活动凭证 {{passNo}} 已生成。', variables: 'no, event, passNo' },
  { code: 'registration_rejected', title: '报名未通过:{{no}}', body: '很遗憾,活动报名 {{no}} 未通过审核(原因:{{reason}})。{{comment}}', variables: 'no, reason, comment' },
  { code: 'registration_cancelled', title: '报名已取消:{{no}}', body: '你的活动报名 {{no}} 已取消。活动"{{event}}"欢迎你下次再来。', variables: 'no, event' },
  { code: 'event_changed', title: '活动变更通知:{{event}}', body: '你报名的活动"{{event}}"有新的安排:{{note}}。请前往活动详情查看最新信息。', variables: 'event, note' },
  { code: 'event_cancelled', title: '活动取消通知:{{event}}', body: '很遗憾,活动"{{event}}"已取消(原因:{{reason}})。相关报名将自动取消,无需操作。', variables: 'event, reason' },
  { code: 'invitation_issued', title: '收到活动邀请函:{{no}}', body: '你收到活动"{{event}}"的邀请函 {{no}}({{typeName}}),有效期至 {{validUntil}}。可在"我的邀请函"查看、接受或下载。', variables: 'no, event, typeName, validUntil' },
  { code: 'invitation_revoked', title: '邀请函已撤销:{{no}}', body: '活动"{{event}}"的邀请函 {{no}} 已被发起方撤销。{{reason}}', variables: 'no, event, reason' },
  { code: 'pass_issued', title: '活动凭证已生成:{{passNo}}', body: '活动"{{event}}"的活动凭证 {{passNo}} 已生成,活动时间 {{startsAt}},地点 {{venue}}。请凭凭证编号或二维码签到。', variables: 'passNo, event, startsAt, venue' },
  { code: 'pass_voided', title: '活动凭证已作废:{{passNo}}', body: '你的活动凭证 {{passNo}} 已作废(原因:{{reason}})。如有疑问可在"消息与帮助"提交工单。', variables: 'passNo, reason' },
  { code: 'pass_reissued', title: '活动凭证已补发:{{passNo}}', body: '活动凭证已补发为 {{passNo}},原凭证同时作废。请使用新凭证签到。', variables: 'passNo' },
  { code: 'host_submitted', title: '接待方认证已提交:{{no}}', body: '接待方认证申请 {{no}} 已提交,预计 {{hours}} 小时内完成审核。', variables: 'no, hours' },
  { code: 'host_approved', title: '接待方认证已通过:{{no}}', body: '恭喜!接待方"{{name}}"已通过认证(编号 {{no}}),认证证书 {{certNo}} 已生成。认证后可发起邀请函与发布活动(需权限)。', variables: 'no, name, certNo' },
  { code: 'host_rejected', title: '接待方认证未通过:{{no}}', body: '很遗憾,接待方认证 {{no}} 未通过(原因:{{reason}})。{{comment}}', variables: 'no, reason, comment' },
  { code: 'host_supplement', title: '接待方认证补件通知:{{no}}', body: '接待方认证 {{no}} 需要补件:{{note}}。请在 {{deadline}} 前在线补交。', variables: 'no, note, deadline' },
  { code: 'courtesy_submitted', title: '礼遇申请已提交:{{no}}', body: '礼宾服务申请 {{no}} 已提交,预计 {{hours}} 小时内完成审核。', variables: 'no, hours' },
  { code: 'courtesy_approved', title: '礼遇申请已通过:{{no}}', body: '礼宾服务申请 {{no}} 已通过({{typeName}}),有效期至 {{validUntil}}。礼遇仅为虚构趣味记录,不承诺现实礼遇。', variables: 'no, typeName, validUntil' },
  { code: 'courtesy_rejected', title: '礼遇申请未通过:{{no}}', body: '很遗憾,礼宾服务申请 {{no}} 未通过(原因:{{reason}})。{{comment}}', variables: 'no, reason, comment' },
  { code: 'checkin_done', title: '签到成功:{{event}}', body: '你已成功签到活动"{{event}}"(凭证 {{passNo}}),签到时间 {{time}}。祝你在奶龙岛玩得开心!', variables: 'event, passNo, time' },
  { code: 'ticket_replied', title: '工单回复:{{subject}}', body: '你的工单"{{subject}}"已收到回复:{{reply}}', variables: 'subject, reply' },
];

const DEFAULT_CONFIG = {
  'prefix.event': 'NJE',
  'prefix.registration': 'NJR',
  'prefix.invitation': 'NJI',
  'prefix.pass': 'NJP',
  'prefix.host': 'NJH',
  'prefix.host_cert': 'NLC',
  'prefix.courtesy': 'NJC',
  'review_hours_hint': '48',
  'supplement_days': '7',
  'verify_limit_per_5min': '30',
  'max_companions': '3',
  'max_active_registrations': '5',
  'linkage_enabled': '0',
  'watermark_text': '仅供娱乐 · 非真实活动',
  'pass_statement': '本凭证为奶龙国虚构娱乐活动的电子纪念票,不构成任何现实入场资格。',
  'disclaimer_version': '1',
  'disclaimer_text':
    '奶龙国皇家礼宾与活动署为虚构娱乐单位:所有活动、邀请函、活动凭证、接待方认证与礼宾服务均为奶龙岛世界观内的趣味内容,不产生任何现实效力,不承诺现实入场、接待或礼遇。报名与认证全程免费,任何收费代办、售卖"内部名额"的行为均为诈骗。',
};

function addDays(days, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function seedProtocol() {
  const ts = now();
  const run = db.transaction(() => {
    // --- permissions + role grants (admin always owns evt:*) ---------------
    const insertPermission = db.prepare(
      'INSERT OR IGNORE INTO permissions (key, name, description, grp) VALUES (@key, @name, @description, @grp)'
    );
    for (const p of PROTOCOL_PERMISSIONS) insertPermission.run(p);

    const grantToRole = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
       SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
    );
    for (const p of PROTOCOL_PERMISSIONS) grantToRole.run('admin', p.key);
    grantToRole.run('user', 'evt:portal');

    const ensureRole = (key, name, description) => {
      if (!db.prepare('SELECT id FROM roles WHERE key = ?').get(key)) {
        db.prepare('INSERT INTO roles (key, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)').run(
          key, name, description, ts
        );
      }
    };
    ensureRole('protocol_reviewer', '活动审核员', '皇家礼宾与活动署审核员:仅处理报名、接待方与礼遇队列(队列隔离)');
    ensureRole('protocol_checker', '礼宾签到员', '皇家礼宾与活动署签到员:核销活动凭证与签到记录');
    ensureRole('protocol_admin', '礼宾与活动署管理员', '活动发布、类型配置、邀请函/凭证、验真、风控、统计与审计');

    grantToRole.run('protocol_reviewer', 'portal:access');
    grantToRole.run('protocol_reviewer', 'evt:portal');
    grantToRole.run('protocol_reviewer', 'evt:review');
    grantToRole.run('protocol_checker', 'portal:access');
    grantToRole.run('protocol_checker', 'evt:portal');
    grantToRole.run('protocol_checker', 'evt:checkin');
    for (const p of PROTOCOL_PERMISSIONS) grantToRole.run('protocol_admin', p.key);

    // --- service card ------------------------------------------------------
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, description, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('protocol', '奶龙国皇家礼宾与活动署', '活动发布、报名审核、邀请函、活动凭证、接待方认证与礼宾服务', '/protocol', 'CalendarIcon', 'warm-peach-pink', 'evt:portal', 'internal_sso', 1, 5, ?, ?)`
    ).run(ts, ts);

    // --- event types -------------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM pro_event_types').get().n === 0) {
      const insertType = db.prepare(
        `INSERT INTO pro_event_types (code, name, description, guide, required_fields, materials, allow_companions, max_companions, default_capacity, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @description, @guide, @required_fields, @materials, @allow_companions, @max_companions, @default_capacity, @enabled, @sort_order, @ts, @ts)`
      );
      [
        { code: 'CULTURE', name: '文化交流', description: '故事会、语言角与虚构文化沙龙', guide: '文化交流活动欢迎所有岛民:填写昵称与联系方式即可报名,最多可携带 2 位随行伙伴。' },
        { code: 'FESTIVAL', name: '庆典', description: '奶龙节巡游、烟花与岛上庆典', guide: '庆典人流量较大,报名后请留意活动公告与变更通知。' },
        { code: 'EXHIBITION', name: '展览', description: '虚构手作、绘画与岛屿记忆展', guide: '展览类活动可能需要上传介绍信或过往参与凭证,以活动详情为准。' },
        { code: 'COMMUNITY', name: '社区活动', description: '邻里共创、花园维护与社区茶会', guide: '社区活动面向所有注册用户,欢迎带上邻居一起参加。' },
        { code: 'DIPLOMATIC', name: '外交活动', description: '使团联谊、外交礼遇与接待仪式', guide: '外交活动仅限已完成外交身份登记的来宾报名,报名时需填写外交身份编号。' },
        { code: 'RESIDENT', name: '居民专属', description: '仅面向奶龙国居民开放的专属活动', guide: '居民专属活动需填写居民编号,并与居民登记署校验通过后方可报名。' },
      ].forEach((t, i) =>
        insertType.run({
          ...t,
          required_fields: 'nickname,contact',
          materials: '[]',
          allow_companions: 1,
          max_companions: 2,
          default_capacity: 100,
          enabled: 1,
          sort_order: i,
          ts,
        })
      );
      // 外交/居民类型默认收紧随行人数
      db.prepare("UPDATE pro_event_types SET max_companions = 0 WHERE code IN ('DIPLOMATIC','RESIDENT')").run();
    }

    // --- demo events -------------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM pro_events').get().n === 0) {
      const insertEvent = db.prepare(
        `INSERT INTO pro_events (event_no, type_code, title, subtitle, description, schedule, venue_name, venue_note,
           capacity, waitlist_enabled, status, resident_only, diplomatic_only, registration_deadline, starts_at, ends_at,
           conditions, materials, notice, cover_color, created_by, published_at, created_at, updated_at)
         VALUES (@event_no, @type_code, @title, @subtitle, @description, @schedule, @venue_name, @venue_note,
           @capacity, 1, 'registration', @resident_only, @diplomatic_only, @registration_deadline, @starts_at, @ends_at,
           @conditions, @materials, @notice, @cover_color, NULL, @ts, @ts, @ts)`
      );
      const schedule = (rows) => JSON.stringify(rows);
      const events = [
        {
          event_no: 'NJE-SEED-CULTURE', type_code: 'CULTURE', title: '奶龙岛春日文化交流周',
          subtitle: '和来自各虚构城邦的朋友交换故事',
          description: '为期三天的虚构文化交流:故事接龙、手作展览与语言角。所有环节均为奶龙岛娱乐设定,不涉及任何现实活动。',
          schedule: schedule([{ time: '第 1 天 10:00', title: '开场故事会' }, { time: '第 1 天 14:00', title: '语言角:奶龙语入门' }, { time: '第 2 天 10:00', title: '手作交换市集' }, { time: '第 3 天 15:00', title: '闭幕分享会' }]),
          venue_name: '中央广场故事亭(虚构)', venue_note: '位于奶龙雕像东侧 30 米,现场有蓝色气球指引。',
          capacity: 60, registration_deadline: addDays(5, 18), starts_at: addDays(7), ends_at: addDays(9, 18),
          conditions: '所有门户注册用户;填写昵称与联系方式即可。', materials: '[]',
          notice: '请自备水杯与好心情;活动全程禁止投喂奶龙。', cover_color: 'app-teal',
        },
        {
          event_no: 'NJE-SEED-FESTIVAL', type_code: 'FESTIVAL', title: '奶龙国庆典巡游',
          subtitle: '一年一度的虚构巡游与烟花夜',
          description: '巡游队伍从中央大街出发,经过海港与居民区,终点为庆典广场。晚间有虚构烟花表演与合唱。',
          schedule: schedule([{ time: '第 1 天 16:00', title: '巡游集合' }, { time: '第 1 天 18:00', title: '庆典广场合唱' }, { time: '第 1 天 20:00', title: '虚构烟花秀' }]),
          venue_name: '中央大街 → 庆典广场(虚构)', venue_note: '建议提前 30 分钟到场,沿街均有工作人员指引。',
          capacity: 120, registration_deadline: addDays(15, 18), starts_at: addDays(18, 16), ends_at: addDays(18, 22),
          conditions: '所有门户注册用户;未成年人需随行成年人陪同(虚构要求)。', materials: '[]',
          notice: '烟花为虚构设定,现场不燃放任何真实烟花。', cover_color: 'app-orange',
        },
        {
          event_no: 'NJE-SEED-EXHIBITION', type_code: 'EXHIBITION', title: '虚构港手作展',
          subtitle: '岛民们的 100 件小作品',
          description: '展出岛民投稿的虚构手作、绘画与岛屿记忆。入场需展示活动凭证,可携带 1 位随行伙伴。',
          schedule: schedule([{ time: '每日 10:00-18:00', title: '自由观展' }, { time: '周末 14:00', title: '作者见面会' }]),
          venue_name: '海港仓库 A 馆(虚构)', venue_note: '南港码头 3 号门进入,馆内禁止饮食。',
          capacity: 40, registration_deadline: addDays(2, 18), starts_at: addDays(3), ends_at: addDays(12, 18),
          conditions: '所有门户注册用户;报名时请上传一张观展介绍信或过往活动凭证(图片/PDF,可选)。',
          materials: JSON.stringify([{ kind: 'intro', label: '介绍信', required: 0 }]),
          notice: '展品均为虚构创作,请勿触摸。', cover_color: 'app-blue',
        },
        {
          event_no: 'NJE-SEED-COMMUNITY', type_code: 'COMMUNITY', title: '社区花园共创日',
          subtitle: '一起给岛上的花园换新装',
          description: '社区志愿者共同整理花园、绘制指示牌,并为新居民举办欢迎茶会。',
          schedule: schedule([{ time: '09:30', title: '集合与工具领取' }, { time: '10:00', title: '花园共创' }, { time: '15:00', title: '欢迎茶会' }]),
          venue_name: '海风社区花园(虚构)', venue_note: '社区中心后门进入,工具由主办方提供。',
          capacity: 30, registration_deadline: addDays(10, 18), starts_at: addDays(13), ends_at: addDays(13, 17),
          conditions: '所有门户注册用户;欢迎携带 2 位随行伙伴。', materials: '[]',
          notice: '请穿耐脏的鞋子,现场提供手套。', cover_color: 'app-green',
        },
        {
          event_no: 'NJE-SEED-DIPLOMATIC', type_code: 'DIPLOMATIC', title: '使团联谊晚宴',
          subtitle: '外交礼遇 × 虚构使团交流',
          description: '面向已登记外交身份的虚构使团成员的联谊晚宴,含礼宾通道与纪念徽章。',
          schedule: schedule([{ time: '18:00', title: '礼宾通道入场' }, { time: '18:30', title: '晚宴与交流' }, { time: '20:30', title: '纪念徽章颁发' }]),
          venue_name: '皇家礼宾厅(虚构)', venue_note: '凭邀请函或外交身份编号从东侧礼宾通道入场。',
          capacity: 24, registration_deadline: addDays(24, 18), starts_at: addDays(28, 18), ends_at: addDays(28, 21),
          conditions: '仅限已完成外交身份登记的来宾;报名时填写外交身份编号。', materials: '[]',
          notice: '本活动为虚构外交礼遇场景,不涉及真实外事活动。', cover_color: 'purple',
          diplomatic_only: 1,
        },
        {
          event_no: 'NJE-SEED-RESIDENT', type_code: 'RESIDENT', title: '居民夜市·夏夜场',
          subtitle: '居民专属的虚构夜市',
          description: '仅面向奶龙国居民开放的夜市,摊位由居民与社区团体共同经营。',
          schedule: schedule([{ time: '19:00', title: '夜市开市' }, { time: '20:00', title: '居民才艺秀' }, { time: '21:30', title: '收市' }]),
          venue_name: '居民区灯笼街(虚构)', venue_note: '从居民中心步行 5 分钟,凭居民编号核验入场。',
          capacity: 50, registration_deadline: addDays(8, 18), starts_at: addDays(11, 19), ends_at: addDays(11, 22),
          conditions: '仅限已完成居民登记的居民;报名时填写居民编号。', materials: '[]',
          notice: '摊位仅接受虚构货币,不收现实费用。', cover_color: 'app-yellow',
          resident_only: 1,
        },
      ];
      for (const e of events) {
        insertEvent.run({
          ...e,
          resident_only: e.resident_only ?? 0,
          diplomatic_only: e.diplomatic_only ?? 0,
          ts,
        });
      }

      const notice = db.prepare('INSERT INTO pro_event_notices (event_id, title, body, level, created_at) VALUES (?, ?, ?, ?, ?)');
      const cultureId = db.prepare("SELECT id FROM pro_events WHERE event_no = 'NJE-SEED-CULTURE'").get().id;
      notice.run(cultureId, '报名须知', '请使用昵称报名,联系方式仅用于虚构通知,不会公开展示。', 'info', ts);
      notice.run(cultureId, '场地变更', '故事会场地由海风亭调整至中央广场故事亭,请留意。', 'change', ts);
      const festivalId = db.prepare("SELECT id FROM pro_events WHERE event_no = 'NJE-SEED-FESTIVAL'").get().id;
      notice.run(festivalId, '巡游路线说明', '巡游队伍将经过中央大街与海港,沿途设 3 个补给点。', 'info', ts);
    }

    // --- 署内公告 ----------------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM pro_notices').get().n === 0) {
      const insertNotice = db.prepare(
        `INSERT INTO pro_notices (title, body, level, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`
      );
      insertNotice.run(
        '礼宾与活动署正式开放',
        '活动报名、邀请函、活动凭证、接待方认证与礼宾服务现已开放。本署为虚构娱乐项目,全部活动与礼遇均无现实效力。',
        'policy', ts, ts
      );
      insertNotice.run(
        '报名须知(必读)',
        '报名免费;请使用昵称与虚构信息;名额有限时进入候补;重复报名或恶意占名额将被限制。提交前请勾选娱乐声明。',
        'info', ts, ts
      );
      insertNotice.run(
        '礼宾服务说明',
        '礼宾服务仅面向外宾接待、居民礼遇、外交礼遇与活动礼宾通道等虚构场景,以趣味记录形式呈现,不承诺任何现实接待或礼遇。',
        'info', ts, ts
      );
      insertNotice.run(
        '谨防活动诈骗',
        '本署活动全部免费,不存在"内部名额""付费入场""现实礼遇"。任何收费行为均为诈骗,请立即举报。',
        'policy', ts, ts
      );
    }

    // --- courtesy types ----------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM pro_courtesy_types').get().n === 0) {
      const insertType = db.prepare(
        `INSERT INTO pro_courtesy_types (code, name, description, requirements, enabled, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
      );
      insertType.run('foreign_reception', '外宾接待', '为虚构外宾提供的接待礼遇(趣味记录)', '外宾需提供有效邀请函编号,或外交身份编号。', 0, ts, ts);
      insertType.run('resident_courtesy', '居民礼遇', '面向奶龙国居民的虚构礼遇', '需提供有效的居民编号,并与居民登记署联动校验(预留)。', 1, ts, ts);
      insertType.run('diplomatic_courtesy', '外交礼遇', '面向虚构外交身份的礼遇', '需提供有效外交身份编号,并处于有效期内。', 2, ts, ts);
      insertType.run('event_channel', '活动礼宾通道', '活动入场的虚构礼宾通道', '需提供有效邀请函编号或活动凭证编号。', 3, ts, ts);
    }

    // --- message templates + config ---------------------------------------
    const insertTemplate = db.prepare(
      `INSERT OR IGNORE INTO pro_message_templates (code, title_template, body_template, variables, enabled, updated_at)
       VALUES (@code, @title, @body, @variables, 1, @ts)`
    );
    for (const tpl of MESSAGE_TEMPLATES) insertTemplate.run({ ...tpl, ts });

    const insertConfig = db.prepare('INSERT OR IGNORE INTO pro_config (key, value, updated_at) VALUES (?, ?, ?)');
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) insertConfig.run(k, v, ts);
  });
  run();
}

export function getConfig(key) {
  return db.prepare('SELECT value FROM pro_config WHERE key = ?').get(key)?.value ?? null;
}

export function getConfigInt(key, fallback) {
  const v = Number(getConfig(key));
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

export function setConfig(key, value) {
  db.prepare(
    'INSERT INTO pro_config (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).run(key, String(value), now());
}