// 奶龙国皇家外交事务署 — schema, seeds and RBAC wiring.
//
// Fully additive module (same contract as the immigration office): it owns only
// dip_* tables plus INSERT-only additions to the shared permissions / roles /
// services registries, so the other service workstreams stay untouched.
import { db, now } from '../db.js';

let ensured = false;

export function ensureDipSchema() {
  if (ensured) return;
  ensured = true;
  db.exec(`
  CREATE TABLE IF NOT EXISTS dip_object_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    guide       TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dip_relation_types (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    guide         TEXT NOT NULL DEFAULT '',
    validity_days INTEGER NOT NULL DEFAULT 365,
    enabled       INTEGER NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dip_identity_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    guide       TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dip_courtesy_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  -- 建交状态机: draft → pending_review → (established | rejected |
  --   supplement_required → pending_review | withdrawn)
  -- established → (suspended → established | severed | sever_requested)
  -- sever_requested → severed | established(驳回断交)
  CREATE TABLE IF NOT EXISTS dip_relations (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    no                   TEXT NOT NULL UNIQUE,
    user_id              INTEGER NOT NULL REFERENCES users(id),
    object_type          TEXT NOT NULL,
    relation_type        TEXT NOT NULL,
    entity_name          TEXT NOT NULL,
    rep_nickname         TEXT NOT NULL,
    contact              TEXT NOT NULL,
    reason               TEXT NOT NULL DEFAULT '',
    courtesies           TEXT NOT NULL DEFAULT '[]',
    purpose              TEXT NOT NULL DEFAULT 'display' CHECK (purpose IN ('display', 'cooperation', 'visa_channel')),
    status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','pending_review','supplement_required','established','rejected','suspended','severed','withdrawn','sever_requested')),
    entertainment_agreed INTEGER NOT NULL DEFAULT 0,
    supplement_note      TEXT NOT NULL DEFAULT '',
    supplement_deadline  TEXT,
    supplement_content   TEXT,
    reject_code          TEXT,
    reject_comment       TEXT NOT NULL DEFAULT '',
    suspend_reason       TEXT NOT NULL DEFAULT '',
    sever_reason         TEXT,
    established_at       TEXT,
    severed_at           TEXT,
    decided_by           INTEGER,
    decided_at           TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    submitted_at         TEXT,
    deleted_at           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dip_rel_user ON dip_relations (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_dip_rel_status ON dip_relations (status, submitted_at);

  -- 外交身份状态机: draft → pending_review → (active | rejected |
  --   supplement_required → pending_review | withdrawn)
  -- active → (frozen → active | revoked) | expired(任期到期,惰性判定)
  CREATE TABLE IF NOT EXISTS dip_identities (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    no                   TEXT NOT NULL UNIQUE,
    user_id              INTEGER NOT NULL REFERENCES users(id),
    identity_type        TEXT NOT NULL,
    relation_id          INTEGER REFERENCES dip_relations(id),
    relation_no          TEXT NOT NULL DEFAULT '',
    entity_name          TEXT NOT NULL,
    nickname             TEXT NOT NULL,
    contact              TEXT NOT NULL,
    title                TEXT NOT NULL DEFAULT '',
    term_start           TEXT,
    term_end             TEXT,
    verify_token         TEXT,
    status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','pending_review','supplement_required','active','frozen','expired','revoked','rejected','withdrawn')),
    entertainment_agreed INTEGER NOT NULL DEFAULT 0,
    inactive_reason      TEXT NOT NULL DEFAULT '',
    supplement_note      TEXT NOT NULL DEFAULT '',
    supplement_deadline  TEXT,
    supplement_content   TEXT,
    reject_code          TEXT,
    reject_comment       TEXT NOT NULL DEFAULT '',
    approved_at          TEXT,
    approved_by          INTEGER,
    remind_sent          INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    submitted_at         TEXT,
    deleted_at           TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dip_idt_user ON dip_identities (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_dip_idt_status ON dip_identities (status);

  -- 互免协议状态机: draft → (pending_effect | active | terminated)
  -- pending_effect → active(到期生效,惰性) | terminated; active → expired(惰性) | terminated
  CREATE TABLE IF NOT EXISTS dip_agreements (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    no             TEXT NOT NULL UNIQUE,
    party_a        TEXT NOT NULL,
    party_b        TEXT NOT NULL,
    type           TEXT NOT NULL DEFAULT 'entry_courtesy',
    courtesies     TEXT NOT NULL DEFAULT '',
    covered_scope  TEXT NOT NULL DEFAULT '',
    effective_from TEXT,
    effective_to   TEXT,
    status         TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','pending_effect','active','expired','terminated')),
    published      INTEGER NOT NULL DEFAULT 0,
    note           TEXT NOT NULL DEFAULT '',
    created_by     INTEGER,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dip_offices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    location   TEXT NOT NULL DEFAULT '',
    open_hours TEXT NOT NULL DEFAULT '',
    intro      TEXT NOT NULL DEFAULT '',
    contact    TEXT NOT NULL DEFAULT '',
    services   TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'maintenance')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dip_notices (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    office_id    INTEGER REFERENCES dip_offices(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL,
    level        TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warning', 'critical')),
    status       TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'offline')),
    published_at TEXT,
    offline_at   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS dip_materials (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type  TEXT NOT NULL CHECK (owner_type IN ('relation', 'identity')),
    owner_id    INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'other'
                CHECK (kind IN ('intro','proof','community','appointment','letter','other')),
    origin      TEXT NOT NULL DEFAULT 'initial' CHECK (origin IN ('initial', 'supplement')),
    filename    TEXT NOT NULL,
    mime        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    path        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    deleted_at  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dip_mat_owner ON dip_materials (owner_type, owner_id);

  CREATE TABLE IF NOT EXISTS dip_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_type  TEXT NOT NULL CHECK (owner_type IN ('relation', 'identity')),
    owner_id    INTEGER NOT NULL,
    action      TEXT NOT NULL,
    actor_id    INTEGER REFERENCES users(id),
    note        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dip_event_owner ON dip_events (owner_type, owner_id);

  CREATE TABLE IF NOT EXISTS dip_courtesy_records (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    identity_id   INTEGER REFERENCES dip_identities(id) ON DELETE CASCADE,
    identity_no   TEXT NOT NULL DEFAULT '',
    courtesy_code TEXT NOT NULL,
    source        TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
    note          TEXT NOT NULL DEFAULT '',
    created_by    INTEGER,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dip_cour_user ON dip_courtesy_records (user_id);

  CREATE TABLE IF NOT EXISTS dip_verify_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    query      TEXT NOT NULL DEFAULT '',
    kind       TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    result     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dip_verify_query ON dip_verify_logs (query);

  CREATE TABLE IF NOT EXISTS dip_rate_limits (
    actor        TEXT NOT NULL,
    action       TEXT NOT NULL,
    window_start TEXT NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (actor, action)
  );

  CREATE TABLE IF NOT EXISTS dip_audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER REFERENCES users(id),
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dip_audit_action ON dip_audit_logs (action);

  CREATE TABLE IF NOT EXISTS dip_blacklist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason     TEXT NOT NULL,
    level      TEXT NOT NULL DEFAULT 'warn' CHECK (level IN ('warn', 'block')),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    lifted_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS dip_messages (
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
  CREATE INDEX IF NOT EXISTS idx_dip_msg_user ON dip_messages (user_id, archived, read);

  CREATE TABLE IF NOT EXISTS dip_message_templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    code           TEXT NOT NULL UNIQUE,
    title_template TEXT NOT NULL,
    body_template  TEXT NOT NULL,
    variables      TEXT NOT NULL DEFAULT '',
    enabled        INTEGER NOT NULL DEFAULT 1,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dip_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `);

  seedDiplomacy();
}

// ---------------------------------------------------------------------------
// Seeds — idempotent, INSERT OR IGNORE everywhere.
// ---------------------------------------------------------------------------

const DIP_PERMISSIONS = [
  { key: 'dip:portal', name: '外交署访问', description: '使用皇家外交事务署的建交、身份登记与验真功能', grp: 'diplomacy' },
  { key: 'dip:review', name: '外交审核', description: '在审核工作台处理建交与外交身份队列(队列隔离)', grp: 'diplomacy' },
  { key: 'dip:admin', name: '外交署管理', description: '类型配置、协议、代表处、礼遇、验真与统计管理', grp: 'diplomacy' },
];

const MESSAGE_TEMPLATES = [
  {
    code: 'relation_submitted',
    title: '建交申请已提交:{{no}}',
    body: '你的建交申请 {{no}} 已提交皇家外交事务署,预计 {{hours}} 小时内完成审核。可在"我的建交"中查看进度。',
    variables: 'no, hours',
  },
  {
    code: 'relation_supplement',
    title: '建交补件通知:{{no}}',
    body: '建交申请 {{no}} 需要补件:{{note}}。请在 {{deadline}} 前在"我的建交"详情页在线补交。',
    variables: 'no, note, deadline',
  },
  {
    code: 'relation_supplement_received',
    title: '补件已收到:{{no}}',
    body: '建交申请 {{no}} 的补件材料已收到,重新进入待审队列。',
    variables: 'no',
  },
  {
    code: 'relation_established',
    title: '建交公报已生效:{{no}}',
    body: '恭喜!奶龙国已与 {{entity}} 正式建立{{typeName}}关系(编号 {{no}})。可前往"外交身份"为你的使团登记外交身份。',
    variables: 'no, entity, typeName',
  },
  {
    code: 'relation_rejected',
    title: '建交申请未通过:{{no}}',
    body: '很遗憾,建交申请 {{no}} 未通过审核(原因:{{reason}})。{{comment}} 你可以修改后重新申请。',
    variables: 'no, reason, comment',
  },
  {
    code: 'relation_sever_request',
    title: '断交申请已受理:{{no}}',
    body: '建交关系 {{no}} 的断交申请已受理,将在复核后生效。断交后相关外交身份将同步失效。',
    variables: 'no',
  },
  {
    code: 'relation_severed',
    title: '断交公报:{{no}}',
    body: '奶龙国与 {{entity}} 的建交关系 {{no}} 已正式断交,关联外交身份已同步失效。感谢这段虚构友谊!',
    variables: 'no, entity',
  },
  {
    code: 'identity_submitted',
    title: '外交身份登记已提交:{{no}}',
    body: '外交身份申请 {{no}} 已提交,预计 {{hours}} 小时内完成审核。',
    variables: 'no, hours',
  },
  {
    code: 'identity_supplement',
    title: '身份补件通知:{{no}}',
    body: '外交身份申请 {{no}} 需要补件:{{note}}。请在 {{deadline}} 前在线补交。',
    variables: 'no, note, deadline',
  },
  {
    code: 'identity_supplement_received',
    title: '补件已收到:{{no}}',
    body: '外交身份申请 {{no}} 的补件材料已收到,重新进入待审队列。',
    variables: 'no',
  },
  {
    code: 'identity_approved',
    title: '外交身份已通过:{{no}}',
    body: '恭喜!你的外交身份 {{no}}({{typeName}})已通过审核并生效,任期至 {{termEnd}}。外交身份卡已生成,凭编号可申请外交签注。',
    variables: 'no, typeName, termEnd',
  },
  {
    code: 'identity_rejected',
    title: '外交身份未通过:{{no}}',
    body: '很遗憾,外交身份申请 {{no}} 未通过审核(原因:{{reason}})。{{comment}}',
    variables: 'no, reason, comment',
  },
  {
    code: 'identity_frozen',
    title: '外交身份已冻结:{{no}}',
    body: '外交身份 {{no}} 已被冻结:{{reason}}。冻结期间外交签注与礼遇资格同步暂停。',
    variables: 'no, reason',
  },
  {
    code: 'identity_renew',
    title: '外交身份即将到期:{{no}}',
    body: '外交身份 {{no}} 将于 {{termEnd}} 到期,如需继续履职请在到期后重新登记(娱乐设定,暂不支持自动续期)。',
    variables: 'no, termEnd',
  },
  {
    code: 'identity_invalidated',
    title: '外交身份已失效:{{no}}',
    body: '外交身份 {{no}} 已失效(原因:{{reason}}),关联的外交签注与礼遇资格同步失效。如需继续履职请重新登记。',
    variables: 'no, reason',
  },
  {
    code: 'agreement_effective',
    title: '互免协议已生效:{{no}}',
    body: '互免协议 {{no}}({{partyA}} × {{partyB}})已生效,有效期至 {{effectiveTo}}。可凭外交身份编号查询互免资格。',
    variables: 'no, partyA, partyB, effectiveTo',
  },
];

const DEFAULT_SETTINGS = [
  { key: 'disclaimer_version', value: '1' },
  {
    key: 'disclaimer_text',
    value:
      '奶龙国皇家外交事务署为奶龙岛趣味虚构单位:全部建交关系、外交身份、互免协议与代表处均为娱乐内容,不涉及任何真实国家与外交关系,不产生现实外交效力。建交全程免费,任何索取"建交费""活动费"的行为均为诈骗。',
  },
  { key: 'watermark_text', value: '仅供娱乐 · 非真实外交' },
  { key: 'supplement_days', value: '7' },
  { key: 'review_hours_hint', value: '72' },
  { key: 'verify_limit_per_5min', value: '30' },
  { key: 'relation_no_prefix', value: 'NLD' },
  { key: 'identity_no_prefix', value: 'NLE' },
  { key: 'agreement_no_prefix', value: 'NLG' },
  { key: 'max_identities_per_user', value: '3' },
];

function seedDiplomacy() {
  const ts = now();
  const run = db.transaction(() => {
    // --- permissions -------------------------------------------------------
    const insertPermission = db.prepare(
      'INSERT OR IGNORE INTO permissions (key, name, description, grp) VALUES (@key, @name, @description, @grp)'
    );
    for (const p of DIP_PERMISSIONS) insertPermission.run(p);

    const grantToRole = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
       SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
    );
    // admin always owns every dip:* permission, even on pre-existing databases.
    for (const p of DIP_PERMISSIONS) grantToRole.run('admin', p.key);
    grantToRole.run('user', 'dip:portal');

    // --- 外交审核员 role: queue isolation (建交/外交身份 only) --------------
    const reviewer = db.prepare('SELECT id FROM roles WHERE key = ?').get('dip_reviewer');
    if (!reviewer) {
      db.prepare(
        'INSERT INTO roles (key, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)'
      ).run('dip_reviewer', '外交审核员', '皇家外交事务署审核员:仅处理建交与外交身份队列(与签注/边检/文书队列隔离)', ts);
    }
    grantToRole.run('dip_reviewer', 'portal:access');
    grantToRole.run('dip_reviewer', 'dip:portal');
    grantToRole.run('dip_reviewer', 'dip:review');

    const dipAdmin = db.prepare('SELECT id FROM roles WHERE key = ?').get('dip_admin');
    if (!dipAdmin) {
      db.prepare(
        'INSERT INTO roles (key, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)'
      ).run('dip_admin', '外交管理员', '皇家外交事务署管理:类型配置、协议、代表处、礼遇、验真与统计', ts);
    }
    for (const p of DIP_PERMISSIONS) grantToRole.run('dip_admin', p.key);

    // --- service card on the portal home -----------------------------------
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, description, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('diplomacy', '奶龙国皇家外交事务署', '虚构建交、外交身份登记、互免协议与外交验真', '/dip', 'CompassIcon', 'purple', 'dip:portal', 'internal_sso', 1, 4, ?, ?)`
    ).run(ts, ts);

    // --- catalogs: MVP 先开放一种,其余落库停用 -----------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM dip_object_types').get().n === 0) {
      const insertType = db.prepare(
        `INSERT INTO dip_object_types (code, name, description, guide, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @description, @guide, @enabled, @sort_order, @ts, @ts)`
      );
      insertType.run({
        code: 'VIRTUAL_NATION',
        name: '虚构国家',
        description: '拥有世界观、领土设定与国民的虚构国度',
        guide:
          '适用于拥有完整世界观设定的虚构国家:需提供国名、简介(虚构介绍)与建交理由。建交后可在有效期内核验外交身份并享受虚拟礼遇。样例公报:奶龙国与贵国本着趣味与友谊,决定自即日起互相承认并建立虚构外交关系。',
        enabled: 1,
        sort_order: 0,
        ts,
      });
      [
        { code: 'CITY_STATE', name: '虚构城邦', description: '以城市为主体的虚构政权', guide: '城邦建交指南(即将开放)。' },
        { code: 'FAN_COMMUNITY', name: '粉丝社区', description: '围绕奶龙的粉丝社群与后援会', guide: '粉丝社区建交指南(即将开放)。' },
        { code: 'VIRTUAL_ORG', name: '虚拟组织', description: '虚构国际组织、联盟与协会', guide: '虚拟组织建交指南(即将开放)。' },
        { code: 'EVENT_GROUP', name: '活动团体', description: '短期活动组成的临时团体', guide: '活动团体建交指南(即将开放)。' },
      ].forEach((t, i) => insertType.run({ ...t, enabled: 0, sort_order: i + 1, ts }));
    }

    if (db.prepare('SELECT COUNT(*) AS n FROM dip_relation_types').get().n === 0) {
      const insertType = db.prepare(
        `INSERT INTO dip_relation_types (code, name, description, guide, validity_days, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @description, @guide, @validity_days, @enabled, @sort_order, @ts, @ts)`
      );
      insertType.run({
        code: 'FORMAL',
        name: '正式建交',
        description: '完整的虚构外交关系,可登记外交身份',
        guide: '正式建交为最高规格的虚构关系:适用于长期世界观合作,有效期 365 天,可登记使节身份并申请外交签注通道。',
        validity_days: 365,
        enabled: 1,
        sort_order: 0,
        ts,
      });
      [
        { code: 'FRIENDLY', name: '友好关系', description: '轻量的友好合作关系', validity_days: 180 },
        { code: 'OBSERVER', name: '观察员关系', description: '仅观察与列席的预备关系', validity_days: 90 },
      ].forEach((t, i) =>
        insertType.run({ ...t, guide: '', enabled: 0, sort_order: i + 1, ts })
      );
    }

    if (db.prepare('SELECT COUNT(*) AS n FROM dip_identity_types').get().n === 0) {
      const insertType = db.prepare(
        `INSERT INTO dip_identity_types (code, name, description, guide, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @description, @guide, @enabled, @sort_order, @ts, @ts)`
      );
      insertType.run({
        code: 'ENVOY',
        name: '虚拟使节',
        description: '代表建交实体的驻奶龙国使节',
        guide: '虚拟使节为建交实体派驻奶龙国的最高虚构代表:需关联一条已建交关系,提交虚构任命书,任期最长 365 天。',
        enabled: 1,
        sort_order: 0,
        ts,
      });
      [
        { code: 'DIPLOMAT', name: '外交官', description: '使团中的外交官成员' },
        { code: 'HONORARY_CONSUL', name: '荣誉领事', description: '荣誉性质的虚构领事' },
        { code: 'FOREIGN_GUEST', name: '外宾', description: '受奶龙国邀请的虚构外宾' },
        { code: 'OBSERVER', name: '观察员', description: '列席观察的预备身份' },
      ].forEach((t, i) => insertType.run({ ...t, guide: '', enabled: 0, sort_order: i + 1, ts }));
    }

    if (db.prepare('SELECT COUNT(*) AS n FROM dip_courtesy_types').get().n === 0) {
      const insertType = db.prepare(
        `INSERT INTO dip_courtesy_types (code, name, description, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @description, 1, @sort_order, @ts, @ts)`
      );
      insertType.run({ code: 'ENTRY_LANE', name: '入境礼遇通道', description: '入境署通关时的趣味礼遇通道(联动预留)', sort_order: 0, ts });
      insertType.run({ code: 'EVENT_INVITE', name: '活动优先邀请', description: '礼宾活动的优先邀请资格', sort_order: 1, ts });
      insertType.run({ code: 'PRIORITY_REVIEW', name: '优先审核', description: '署内申请优先审核(趣味化标记)', sort_order: 2, ts });
    }

    // --- 署级公告: 建交开放 / 登记须知 / 礼遇说明 ---------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM dip_notices').get().n === 0) {
      const insertNotice = db.prepare(
        `INSERT INTO dip_notices (office_id, title, body, level, status, published_at, created_at, updated_at)
         VALUES (NULL, @title, @body, @level, 'published', @ts, @ts, @ts)`
      );
      insertNotice.run({
        title: '建交通道正式开放',
        body: '皇家外交事务署现开放"虚构国家 × 正式建交"在线申请,审核预计 72 小时内完成。本署为虚构娱乐项目,不核验真实身份,建交不产生任何现实外交效力。',
        level: 'info',
        ts,
      });
      insertNotice.run({
        title: '外交身份登记须知(必读)',
        body: '外交身份须关联一条已建交关系;任期最长 365 天;冻结/注销后外交签注与礼遇资格同步失效。全部身份均为娱乐设定。',
        level: 'warning',
        ts,
      });
      insertNotice.run({
        title: '虚拟礼遇说明',
        body: '外交礼遇(入境礼遇通道、活动优先邀请、优先审核)仅在奶龙岛虚构世界内有效,以趣味徽章与记录形式呈现,不承诺任何现实礼遇。',
        level: 'info',
        ts,
      });
    }

    // --- demo offices -------------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM dip_offices').get().n === 0) {
      const insertOffice = db.prepare(
        `INSERT INTO dip_offices (code, name, location, open_hours, intro, contact, services, status, sort_order, created_at, updated_at)
         VALUES (@code, @name, @location, @openHours, @intro, @contact, @services, 'open', @sort, @ts, @ts)`
      );
      insertOffice.run({
        code: 'OFC_CENTRAL',
        name: '中央大街代表处',
        location: '奶龙岛中央大街 1 号(虚构)',
        openHours: '每周二至周日 10:00 - 18:00',
        intro: '皇家外交事务署首个虚构代表处,负责接待各建交实体使团与趣味文件递交。',
        contact: '虚构信箱:central@dip.nailong(不存在的地址)',
        services: '建交咨询、外交身份材料预审、互免协议公示查阅',
        sort: 0,
        ts,
      });
      insertOffice.run({
        code: 'OFC_HARBOR',
        name: '海港使团楼',
        location: '奶龙岛南港码头(虚构)',
        openHours: '每周六 13:00 - 17:00',
        intro: '临近皇家口岸,方便使团通关后顺路办理外交手续。楼顶有巨型奶龙气球。',
        contact: '虚构信箱:harbor@dip.nailong(不存在的地址)',
        services: '使团接待、活动邀请登记',
        sort: 1,
        ts,
      });
    }

    // --- message templates + settings --------------------------------------
    const insertTemplate = db.prepare(
      `INSERT OR IGNORE INTO dip_message_templates (code, title_template, body_template, variables, enabled, updated_at)
       VALUES (@code, @title, @body, @variables, 1, @ts)`
    );
    for (const t of MESSAGE_TEMPLATES) insertTemplate.run({ ...t, ts });

    const insertSetting = db.prepare('INSERT OR IGNORE INTO dip_settings (key, value, updated_at) VALUES (?, ?, ?)');
    for (const s of DEFAULT_SETTINGS) insertSetting.run(s.key, s.value, ts);
  });
  run();
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM dip_settings WHERE key = ?').get(key);
  return row?.value ?? null;
}

export function getSettingInt(key, fallback) {
  const v = Number(getSetting(key));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}
