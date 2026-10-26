// 奶龙国皇家居民登记署 — schema, seeds and RBAC wiring.
//
// Fully additive module (same contract as the immigration office): every table
// is prefixed res_*, and shared registries (permissions / roles / services)
// only ever receive INSERT OR IGNORE rows, so parallel service workstreams
// never disturb each other.
import { db, now } from '../db.js';

let ensured = false;

export function ensureResidentSchema() {
  if (ensured) return;
  ensured = true;
  db.exec(`
  CREATE TABLE IF NOT EXISTS res_types (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    code                 TEXT NOT NULL UNIQUE,
    name                 TEXT NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    guide                TEXT NOT NULL DEFAULT '',
    benefits             TEXT NOT NULL DEFAULT '',
    duties               TEXT NOT NULL DEFAULT '',
    valid_years          INTEGER NOT NULL DEFAULT 1,
    require_avatar       INTEGER NOT NULL DEFAULT 1,
    require_address_proof INTEGER NOT NULL DEFAULT 0,
    enabled              INTEGER NOT NULL DEFAULT 1,
    sort_order           INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
  );

  -- 登记申请状态机: draft → pending_review → (approved | rejected |
  --   supplement_required → 补件 pending_review | 超时 closed); 在审可 withdrawn
  CREATE TABLE IF NOT EXISTS res_applications (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    app_no               TEXT NOT NULL UNIQUE,
    user_id              INTEGER NOT NULL REFERENCES users(id),
    type_code            TEXT NOT NULL,
    status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','pending_review','supplement_required','approved','rejected','withdrawn','closed')),
    nickname             TEXT NOT NULL DEFAULT '',
    contact              TEXT NOT NULL DEFAULT '',
    virtual_address      TEXT NOT NULL DEFAULT '',
    bio                  TEXT NOT NULL DEFAULT '',
    purposes             TEXT NOT NULL DEFAULT '[]',
    supplement_note      TEXT NOT NULL DEFAULT '',
    supplement_deadline  TEXT,
    reject_code          TEXT,
    reject_comment       TEXT,
    review_stage         TEXT NOT NULL DEFAULT 'initial' CHECK (review_stage IN ('initial','review')),
    decided_by           INTEGER,
    decided_at           TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    submitted_at         TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_res_app_user ON res_applications (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_res_app_status ON res_applications (status, submitted_at);

  CREATE TABLE IF NOT EXISTS res_materials (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES res_applications(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL,
    kind           TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('avatar','address_proof','other')),
    origin         TEXT NOT NULL DEFAULT 'initial' CHECK (origin IN ('initial','supplement')),
    filename       TEXT NOT NULL,
    mime           TEXT NOT NULL,
    size           INTEGER NOT NULL,
    path           TEXT NOT NULL,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS res_reviews (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES res_applications(id) ON DELETE CASCADE,
    reviewer_id    INTEGER NOT NULL,
    reviewer_name  TEXT NOT NULL DEFAULT '',
    action         TEXT NOT NULL CHECK (action IN ('approve','reject','require_supplement')),
    reason_code    TEXT,
    comment        TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL
  );

  -- 居民身份:一个账号一条(最多一个有效居民身份,可通过配置放开)
  CREATE TABLE IF NOT EXISTS res_residents (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL UNIQUE REFERENCES users(id),
    application_id     INTEGER NOT NULL REFERENCES res_applications(id),
    type_code          TEXT NOT NULL,
    nickname           TEXT NOT NULL DEFAULT '',
    contact            TEXT NOT NULL DEFAULT '',
    virtual_address    TEXT NOT NULL DEFAULT '',
    bio                TEXT NOT NULL DEFAULT '',
    avatar_material_id INTEGER,
    since              TEXT NOT NULL,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL
  );

  -- 居民卡状态机: valid → (frozen 冻结 ↔ 解冻 | voided 注销 | expired 到期,惰性判定)
  -- 续期/补发复用同一张卡(居民编号保持稳定)
  CREATE TABLE IF NOT EXISTS res_cards (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    card_no        TEXT NOT NULL UNIQUE,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    application_id INTEGER NOT NULL REFERENCES res_applications(id),
    type_code      TEXT NOT NULL,
    nickname       TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expired','voided','frozen')),
    verify_token   TEXT NOT NULL UNIQUE,
    issued_at      TEXT NOT NULL,
    valid_until    TEXT NOT NULL,
    renew_count    INTEGER NOT NULL DEFAULT 0,
    remind_sent    INTEGER NOT NULL DEFAULT 0,
    freeze_reason  TEXT NOT NULL DEFAULT '',
    void_reason    TEXT NOT NULL DEFAULT '',
    updated_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_res_card_user ON res_cards (user_id, status);

  -- 变更/升级/续期申请: pending_review → (approved | rejected | cancelled)
  CREATE TABLE IF NOT EXISTS res_changes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    no          TEXT NOT NULL UNIQUE,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    card_id     INTEGER NOT NULL REFERENCES res_cards(id),
    type        TEXT NOT NULL CHECK (type IN ('info','upgrade','renewal')),
    payload     TEXT NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'pending_review'
                CHECK (status IN ('pending_review','approved','rejected','cancelled')),
    reject_code TEXT,
    reject_note TEXT NOT NULL DEFAULT '',
    decided_by  INTEGER,
    decided_at  TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_res_change_user ON res_changes (user_id, status);

  CREATE TABLE IF NOT EXISTS res_notices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','policy','event')),
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS res_messages (
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
  CREATE INDEX IF NOT EXISTS idx_res_msg_user ON res_messages (user_id, archived, read);

  CREATE TABLE IF NOT EXISTS res_message_templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    code           TEXT NOT NULL UNIQUE,
    title_template TEXT NOT NULL,
    body_template  TEXT NOT NULL,
    variables      TEXT NOT NULL DEFAULT '',
    enabled        INTEGER NOT NULL DEFAULT 1,
    updated_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS res_verify_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    query      TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    result     TEXT NOT NULL DEFAULT '',
    source     TEXT NOT NULL DEFAULT 'web',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS res_audit (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER,
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_res_audit_action ON res_audit (action);

  CREATE TABLE IF NOT EXISTS res_blacklist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id),
    reason     TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS res_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `);

  seedResident();
}

// ---------------------------------------------------------------------------
// Seeds — idempotent, INSERT OR IGNORE everywhere.
// ---------------------------------------------------------------------------

const RES_PERMISSIONS = [
  { key: 'res:portal', name: '居民署访问', description: '使用皇家居民登记署的登记申请、居民卡与验真功能', grp: 'resident' },
  { key: 'res:review', name: '居民审核', description: '在居民审核工作台审核登记/变更/续期申请(仅居民队列)', grp: 'resident' },
  { key: 'res:manage', name: '居民署管理', description: '居民类型、公告模板、验真、风控、统计与审计管理', grp: 'resident' },
];

const PURPOSES = ['collect', 'activity', 'visa_fast', 'other'];

const MESSAGE_TEMPLATES = [
  { code: 'submitted', title: '登记申请已提交:{{no}}', body: '你的居民登记申请 {{no}} 已提交皇家居民登记署,预计 {{hours}} 小时内完成审核。可在"我的登记"中查看进度。', variables: 'no, hours' },
  { code: 'supplement_required', title: '补件通知:{{no}}', body: '登记申请 {{no}} 需要补件:{{note}}。请在 {{deadline}} 前在申请详情页在线补交,逾期申请将自动关闭。', variables: 'no, note, deadline' },
  { code: 'supplement_received', title: '补件已收到:{{no}}', body: '登记申请 {{no}} 的补件材料已收到,重新进入待审核队列。', variables: 'no' },
  { code: 'approved', title: '登记已通过:{{no}}', body: '恭喜!登记申请 {{no}} 已通过审核,你的电子居民卡 {{cardNo}} 已生成,有效期至 {{validUntil}}。欢迎成为奶龙国居民!', variables: 'no, cardNo, validUntil' },
  { code: 'rejected', title: '登记未通过:{{no}}', body: '很遗憾,登记申请 {{no}} 未通过审核(原因:{{reason}})。{{note}} 你可以补充信息后重新申请。', variables: 'no, reason, note' },
  { code: 'withdrawn', title: '申请已撤销:{{no}}', body: '登记申请 {{no}} 已撤销。如需登记可随时重新提交。', variables: 'no' },
  { code: 'closed', title: '申请已关闭:{{no}}', body: '登记申请 {{no}} 因补件超时自动关闭。可以发起新的登记申请。', variables: 'no' },
  { code: 'card_issued', title: '电子居民卡已生成:{{cardNo}}', body: '你的电子居民卡 {{cardNo}} 已生成,有效期至 {{validUntil}}。可在"我的居民卡"查看、下载与验真。', variables: 'cardNo, validUntil' },
  { code: 'card_frozen', title: '居民卡已冻结:{{cardNo}}', body: '你的居民卡 {{cardNo}} 已被冻结(原因:{{reason}})。冻结期间居民卡暂停使用,如有疑问请联系居民署。', variables: 'cardNo, reason' },
  { code: 'card_unfrozen', title: '居民卡已解冻:{{cardNo}}', body: '你的居民卡 {{cardNo}} 已解除冻结,恢复正常使用。', variables: 'cardNo' },
  { code: 'card_voided', title: '居民卡已注销:{{cardNo}}', body: '你的居民卡 {{cardNo}} 已注销(原因:{{reason}})。居民身份同步失效,如需再次登记请重新申请。', variables: 'cardNo, reason' },
  { code: 'card_reissued', title: '居民卡已补发:{{cardNo}}', body: '你的居民卡 {{cardNo}} 已补发,原验真二维码已失效,请使用新的验真链接。', variables: 'cardNo' },
  { code: 'card_expired', title: '居民卡已过期:{{cardNo}}', body: '你的居民卡 {{cardNo}} 已过期。可在"变更与续期"发起续期申请,居民编号保持不变。', variables: 'cardNo' },
  { code: 'expiry_reminder', title: '居民卡即将到期:{{cardNo}}', body: '你的居民卡 {{cardNo}} 将于 {{validUntil}} 到期,记得及时续期哦。', variables: 'cardNo, validUntil' },
  { code: 'change_approved', title: '变更申请已通过:{{no}}', body: '你的变更申请 {{no}} 已通过审核,居民卡信息已同步更新。', variables: 'no' },
  { code: 'change_rejected', title: '变更申请未通过:{{no}}', body: '你的变更申请 {{no}} 未通过审核(原因:{{reason}})。{{note}}', variables: 'no, reason, note' },
  { code: 'appeal_reopened', title: '申诉复核:登记申请 {{no}} 重新进入待审', body: '皇家申诉与监察署已撤销原驳回决定(决定书 {{decisionCode}}),登记申请 {{no}} 重新进入待审核队列。', variables: 'no, decisionCode, appealCode' },
];

const DEFAULT_CONFIG = {
  'res.app_no_prefix': 'NRR',
  'res.card_no_prefix': 'NRC',
  'res.change_no_prefix': 'NRX',
  'res.supplement_days': '7',
  'res.review_hours_hint': '72',
  'res.verify_limit_per_5min': '30',
  'res.max_active_applications': '1',
  'res.card_remind_days': '30',
  'res.one_identity_per_account': '1',
};

function seedResident() {
  const ts = now();
  const run = db.transaction(() => {
    // --- permissions + role grants (admin always owns res:*) ---------------
    const insertPermission = db.prepare(
      'INSERT OR IGNORE INTO permissions (key, name, description, grp) VALUES (@key, @name, @description, @grp)'
    );
    for (const p of RES_PERMISSIONS) insertPermission.run(p);

    const grantToRole = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
       SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
    );
    for (const p of RES_PERMISSIONS) grantToRole.run('admin', p.key);
    grantToRole.run('user', 'res:portal');

    // --- 居民审核员 / 居民管理员 roles (queue-isolated from visa/immigration) ---
    const ensureRole = db.prepare('SELECT id FROM roles WHERE key = ?').get('res_reviewer');
    if (!ensureRole) {
      db.prepare('INSERT INTO roles (key, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)').run(
        'res_reviewer', '居民审核员', '皇家居民登记署审核员:审核居民登记与变更申请(队列隔离)', ts
      );
    }
    if (!db.prepare('SELECT id FROM roles WHERE key = ?').get('res_admin')) {
      db.prepare('INSERT INTO roles (key, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)').run(
        'res_admin', '居民管理员', '皇家居民登记署管理员:居民卡管理与署内配置', ts
      );
    }
    grantToRole.run('res_reviewer', 'res:portal');
    grantToRole.run('res_reviewer', 'res:review');
    grantToRole.run('res_admin', 'res:portal');
    grantToRole.run('res_admin', 'res:review');
    grantToRole.run('res_admin', 'res:manage');

    // --- service card on the portal home -----------------------------------
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, description, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('resident', '奶龙国皇家居民登记署', '登记成为奶龙国居民,领取电子居民卡、办理变更与验真', '/resident', 'UsersIcon', 'app-green', 'res:portal', 'internal_sso', 1, 4, ?, ?)`
    ).run(ts, ts);

    // --- resident types (MVP 只开放临时居民) ---------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM res_types').get().n === 0) {
      const insertType = db.prepare(
        `INSERT INTO res_types (code, name, description, guide, benefits, duties, valid_years, require_avatar, require_address_proof, enabled, sort_order, created_at, updated_at)
         VALUES (@code, @name, @description, @guide, @benefits, @duties, @valid_years, @require_avatar, @require_address_proof, @enabled, @sort_order, @ts, @ts)`
      );
      insertType.run({
        code: 'TEMPORARY',
        name: '临时居民',
        description: '刚登上奶龙岛的新朋友,先以临时居民的身份开始岛上生活',
        guide:
          '登记条件:年满 0 岁的奶龙爱好者;所需信息:昵称、联系方式、奶龙国虚构地址(选填)、个人简介;登记材料:头像(必传)、地址证明(选填,趣味化即可);审核时长:预计 72 小时。',
        benefits: '专属居民公告推送;居民编号验真;未来可享签注快捷通道、入境居民通道与活动优先报名(陆续开放)。',
        duties: '遵守《奶龙岛居民友好公约》:不投喂过量零食、见到奶龙要打招呼、保持快乐。',
        valid_years: 1,
        require_avatar: 1,
        require_address_proof: 0,
        enabled: 1,
        sort_order: 0,
        ts,
      });
      [
        {
          code: 'PERMANENT', name: '永久居民', description: '在岛上定居的长期居民,权益更多', valid_years: 10,
          benefits: '包含临时居民全部权益,另享永久居民专属称号与活动礼遇。',
          duties: '守护奶龙岛的环境与快乐氛围。',
        },
        {
          code: 'HONORARY', name: '荣誉居民', description: '对奶龙岛有特殊贡献的贵宾', valid_years: 5,
          benefits: '包含永久居民全部权益,另享荣誉徽章与外交礼遇(规划中)。',
          duties: '继续热爱奶龙。',
        },
      ].forEach((t, i) =>
        insertType.run({
          guide: '',
          require_avatar: 1,
          require_address_proof: 0,
          enabled: 0,
          sort_order: i + 1,
          ts,
          ...t,
        })
      );
    }

    // --- notices -------------------------------------------------------------
    if (db.prepare('SELECT COUNT(*) AS n FROM res_notices').get().n === 0) {
      const insertNotice = db.prepare(
        `INSERT INTO res_notices (title, body, level, enabled, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`
      );
      insertNotice.run(
        '居民登记开放申请',
        '奶龙国皇家居民登记署现已开放"临时居民"在线登记,审核预计 72 小时内完成。',
        'policy', ts, ts
      );
      insertNotice.run(
        '谨防冒充登记诈骗',
        '居民登记完全免费。任何收费登记、代办"永久居民"的行为均为诈骗,请勿相信。',
        'info', ts, ts
      );
    }

    // --- message templates + config -----------------------------------------
    const insertTemplate = db.prepare(
      `INSERT OR IGNORE INTO res_message_templates (code, title_template, body_template, variables, enabled, updated_at)
       VALUES (@code, @title, @body, @variables, 1, @ts)`
    );
    for (const tpl of MESSAGE_TEMPLATES) insertTemplate.run({ ...tpl, ts });

    const insertConfig = db.prepare('INSERT OR IGNORE INTO res_config (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(DEFAULT_CONFIG)) insertConfig.run(k, v);
  });
  run();
}
