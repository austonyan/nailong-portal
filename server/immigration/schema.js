// 皇家口岸入境署 — schema, seeds and RBAC wiring.
//
// This module is fully additive: it never alters tables owned by the portal
// core (server/db.js). Everything lives in im_* tables plus INSERT-only
// additions to the shared permissions / roles / services registries, so the
// visa-office workstream can evolve independently.
import { db, now } from '../db.js';

let ensured = false;

export function ensureImmigrationSchema() {
  if (ensured) return;
  ensured = true;
  db.exec(`
  CREATE TABLE IF NOT EXISTS im_ports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'land' CHECK (type IN ('land', 'air', 'sea')),
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'maintenance')),
    open_hours  TEXT NOT NULL DEFAULT '',
    notice      TEXT NOT NULL DEFAULT '',
    map_desc    TEXT NOT NULL DEFAULT '',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS im_channels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    port_id     INTEGER NOT NULL REFERENCES im_ports(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'normal' CHECK (type IN ('normal', 'reserved', 'special')),
    description TEXT NOT NULL DEFAULT '',
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS im_announcements (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    port_id      INTEGER REFERENCES im_ports(id) ON DELETE CASCADE,
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

  CREATE TABLE IF NOT EXISTS im_declarations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    no            TEXT NOT NULL UNIQUE,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    port_id       INTEGER NOT NULL REFERENCES im_ports(id),
    nickname      TEXT NOT NULL,
    contact       TEXT NOT NULL,
    purpose       TEXT NOT NULL CHECK (purpose IN ('fun', 'visit', 'business', 'show', 'other')),
    purpose_note  TEXT NOT NULL DEFAULT '',
    stay_days     INTEGER NOT NULL DEFAULT 1,
    companions    INTEGER NOT NULL DEFAULT 0,
    address       TEXT NOT NULL DEFAULT '',
    visa_no       TEXT,
    visa_result   TEXT,
    visa_checked_at TEXT,
    items         TEXT NOT NULL DEFAULT '[]',
    status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending', 'supplement', 'approved', 'rejected', 'entered', 'exited', 'withdrawn')),
    supplement_request TEXT,
    supplement_content TEXT,
    reject_reason  TEXT,
    reject_note    TEXT,
    submitted_at   TEXT,
    reviewed_at    TEXT,
    reviewed_by    INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_im_decl_user ON im_declarations (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_im_decl_port ON im_declarations (port_id, status);

  CREATE TABLE IF NOT EXISTS im_declaration_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    declaration_id INTEGER NOT NULL REFERENCES im_declarations(id) ON DELETE CASCADE,
    action         TEXT NOT NULL,
    actor_id       INTEGER REFERENCES users(id),
    note           TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_im_decl_event ON im_declaration_events (declaration_id);

  CREATE TABLE IF NOT EXISTS im_pass_codes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    declaration_id INTEGER NOT NULL UNIQUE REFERENCES im_declarations(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    port_id        INTEGER NOT NULL REFERENCES im_ports(id),
    code_no        TEXT NOT NULL UNIQUE,
    token          TEXT NOT NULL UNIQUE,
    status         TEXT NOT NULL DEFAULT 'unused' CHECK (status IN ('unused', 'used', 'expired', 'voided')),
    valid_until    TEXT NOT NULL,
    used_at        TEXT,
    used_by        INTEGER REFERENCES users(id),
    voided_at      TEXT,
    void_reason    TEXT,
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS im_pass_checks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pass_code_id INTEGER REFERENCES im_pass_codes(id) ON DELETE SET NULL,
    code_no     TEXT NOT NULL,
    result      TEXT NOT NULL,
    officer_id  INTEGER REFERENCES users(id),
    note        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS im_entry_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    no             TEXT NOT NULL UNIQUE,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    declaration_id INTEGER NOT NULL UNIQUE REFERENCES im_declarations(id),
    port_id        INTEGER NOT NULL REFERENCES im_ports(id),
    visa_no        TEXT,
    entry_date     TEXT NOT NULL,
    stay_days      INTEGER NOT NULL DEFAULT 1,
    stamp_style    TEXT NOT NULL DEFAULT 'wave' CHECK (stamp_style IN ('wave', 'star', 'claw')),
    status         TEXT NOT NULL DEFAULT 'entered' CHECK (status IN ('entered', 'exited', 'invalid')),
    note           TEXT NOT NULL DEFAULT '',
    created_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS im_exit_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    no             TEXT NOT NULL UNIQUE,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    entry_record_id INTEGER NOT NULL UNIQUE REFERENCES im_entry_records(id),
    port_id        INTEGER NOT NULL REFERENCES im_ports(id),
    exit_date      TEXT NOT NULL,
    created_by     INTEGER REFERENCES users(id),
    created_at     TEXT NOT NULL,
    deleted_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS im_visa_checks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    visa_no    TEXT NOT NULL,
    user_id    INTEGER REFERENCES users(id),
    result     TEXT NOT NULL CHECK (result IN ('valid', 'invalid', 'expired', 'revoked', 'used', 'not_found')),
    detail     TEXT NOT NULL DEFAULT '{}',
    source     TEXT NOT NULL DEFAULT 'stub',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_im_visa_no ON im_visa_checks (visa_no);

  CREATE TABLE IF NOT EXISTS im_messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_code TEXT NOT NULL,
    title        TEXT NOT NULL,
    body         TEXT NOT NULL,
    related      TEXT NOT NULL DEFAULT '{}',
    read         INTEGER NOT NULL DEFAULT 0,
    archived     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_im_msg_user ON im_messages (user_id, archived, read);

  CREATE TABLE IF NOT EXISTS im_message_templates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT NOT NULL UNIQUE,
    title_template   TEXT NOT NULL,
    body_template    TEXT NOT NULL,
    variables     TEXT NOT NULL DEFAULT '',
    enabled       INTEGER NOT NULL DEFAULT 1,
    updated_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS im_audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER REFERENCES users(id),
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_im_audit_action ON im_audit_logs (action);

  CREATE TABLE IF NOT EXISTS im_blacklist (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason     TEXT NOT NULL,
    level      TEXT NOT NULL DEFAULT 'warn' CHECK (level IN ('warn', 'block')),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    expires_at TEXT,
    lifted_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS im_rate_limits (
    actor        TEXT NOT NULL,
    action       TEXT NOT NULL,
    window_start TEXT NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (actor, action)
  );

  CREATE TABLE IF NOT EXISTS im_attachments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    declaration_id INTEGER NOT NULL REFERENCES im_declarations(id) ON DELETE CASCADE,
    filename       TEXT NOT NULL,
    stored_name    TEXT NOT NULL UNIQUE,
    mime           TEXT NOT NULL DEFAULT 'application/octet-stream',
    size           INTEGER NOT NULL DEFAULT 0,
    uploaded_by    INTEGER NOT NULL REFERENCES users(id),
    created_at     TEXT NOT NULL,
    deleted_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS im_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `);

  seedImmigration();
}

// ---------------------------------------------------------------------------
// Seeds — idempotent, INSERT OR IGNORE everywhere.
// ---------------------------------------------------------------------------

const IMM_PERMISSIONS = [
  { key: 'imm:portal', name: '入境署访问', description: '使用皇家口岸入境署的申报、通关码与记录功能', grp: 'immigration' },
  { key: 'imm:inspect', name: '边检审核', description: '在边检工作台审核入境申报(仅入境队列)', grp: 'immigration' },
  { key: 'imm:verify', name: '通关码核验', description: '查询与核验通关码,人工通过或作废', grp: 'immigration' },
  { key: 'imm:admin', name: '入境署管理', description: '口岸、公告、记录、统计、模板与审计管理', grp: 'immigration' },
];

const MESSAGE_TEMPLATES = [
  {
    code: 'submit_success',
    title: '申报已提交:{{no}}',
    body: '你的入境申报 {{no}} 已提交皇家口岸,预计 3 个奶龙工作日内完成审核。可在"我的申报"中查看进度。',
    variables: 'no',
  },
  {
    code: 'supplement',
    title: '补件通知:{{no}}',
    body: '申报 {{no}} 需要补件:{{note}}。请在"我的申报"详情页在线补交。',
    variables: 'no, note',
  },
  {
    code: 'approved',
    title: '申报已通过:{{no}}',
    body: '太棒啦!申报 {{no}} 已通过边检审核,通关码已生成,有效期至 {{validUntil}}。记得出示二维码通关。',
    variables: 'no, validUntil',
  },
  {
    code: 'rejected',
    title: '申报未通过:{{no}}',
    body: '很遗憾,申报 {{no}} 未通过审核(原因:{{reason}})。{{note}} 你可以修改后重新申报。',
    variables: 'no, reason, note',
  },
  {
    code: 'supplement_received',
    title: '补件已收到:{{no}}',
    body: '申报 {{no}} 的补件材料已收到,重新进入待检队列。',
    variables: 'no',
  },
  {
    code: 'pass_code',
    title: '通关码已生成:{{no}}',
    body: '申报 {{no}} 的通关码 {{codeNo}} 已生成,请前往"我的通关码"查看二维码。',
    variables: 'no, codeNo',
  },
  {
    code: 'entry_record',
    title: '入境章盖好啦:{{no}}',
    body: '你已于 {{date}} 从皇家口岸入境奶龙岛,入境记录编号 {{recordNo}}。欢迎回到岛上!',
    variables: 'no, date, recordNo',
  },
  {
    code: 'exit_reminder',
    title: '出境小提醒:{{recordNo}}',
    body: '你的入境记录 {{recordNo}} 计划停留 {{days}} 天即将到期,记得办理趣味出境登记哦。',
    variables: 'recordNo, days',
  },
  {
    code: 'appeal_reopened',
    title: '申诉复核:申报 {{no}} 重新进入待检',
    body: '皇家申诉与监察署已撤销原驳回决定(决定书 {{decisionCode}}),申报 {{no}} 重新进入待检队列,请留意后续审核结果。',
    variables: 'no, decisionCode, appealCode',
  },
];

function seedImmigration() {
  const ts = now();
  const run = db.transaction(() => {
    // --- permissions -------------------------------------------------------
    const insertPermission = db.prepare(
      'INSERT OR IGNORE INTO permissions (key, name, description, grp) VALUES (@key, @name, @description, @grp)'
    );
    for (const p of IMM_PERMISSIONS) insertPermission.run(p);

    const grantToRole = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
       SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
    );
    // admin always owns every imm:* permission, even on pre-existing databases.
    for (const p of IMM_PERMISSIONS) grantToRole.run('admin', p.key);
    grantToRole.run('user', 'imm:portal');

    // --- 边检员 role: portal + inspection queue + verification -------------
    const officer = db.prepare('SELECT id FROM roles WHERE key = ?').get('imm_officer');
    if (!officer) {
      db.prepare(
        'INSERT INTO roles (key, name, description, is_system, created_at) VALUES (?, ?, ?, 0, ?)'
      ).run('imm_officer', '边检员', '皇家口岸边检员:审核入境申报并核验通关码(队列与签注审核隔离)', ts);
    }
    grantToRole.run('imm_officer', 'imm:portal');
    grantToRole.run('imm_officer', 'imm:inspect');
    grantToRole.run('imm_officer', 'imm:verify');

    // --- service card on the portal home -----------------------------------
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, description, url, icon, color, required_permission, enabled, sort_order, created_at, updated_at)
       VALUES ('immigration', '皇家口岸入境署', '申报入境、领取通关码、查看出入境记录', '/immigration', 'FlagIcon', 'app-orange', 'imm:portal', 1, 3, ?, ?)`
    ).run(ts, ts);

    // --- ROYAL_PORT + channels ---------------------------------------------
    const portCount = db.prepare('SELECT COUNT(*) AS n FROM im_ports').get().n;
    if (portCount === 0) {
      const portInfo = db
        .prepare(
          `INSERT INTO im_ports (code, name, type, status, open_hours, notice, map_desc, sort_order, created_at, updated_at)
           VALUES ('ROYAL_PORT', '皇家口岸', 'land', 'open', '每日 09:00 - 21:00(奶龙时间)',
                   '通关请携带你的趣味签注与奶龙周边;禁止携带现实世界的烦恼入境。',
                   '主楼(盖章大厅)→ 长颈鹿滑梯查验区 → 奶龙雕像合影广场 → 出站花园。全程步行约 5 分钟。', 0, ?, ?)`
        )
        .run(ts, ts);
      const insertChannel = db.prepare(
        'INSERT INTO im_channels (port_id, name, type, description, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      insertChannel.run(portInfo.lastInsertRowid, '普通通道', 'normal', '随到随走,适合首次上岛的旅客。', 1, ts);
      insertChannel.run(portInfo.lastInsertRowid, '预约通道', 'reserved', '分时段预约,错峰通关(即将开放)。', 0, ts);
      insertChannel.run(portInfo.lastInsertRowid, '特殊通道', 'special', '超大号奶龙玩偶携带者专用。', 1, ts);
    }

    // 居民 / 外交礼遇通道:居民登记署与外交署联动打通后开放,
    // 旧库也补一条(按名称幂等),让居民权益页的"入境居民通道"有真实落点。
    const port = db.prepare("SELECT id FROM im_ports WHERE code = 'ROYAL_PORT'").get();
    if (port && !db.prepare("SELECT 1 FROM im_channels WHERE port_id = ? AND name = '居民与外交礼遇通道'").get(port.id)) {
      db.prepare(
        'INSERT INTO im_channels (port_id, name, type, description, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)'
      ).run(port.id, '居民与外交礼遇通道', 'special', '持有效电子居民卡或外交身份卡可走此通道,出示电子凭证即可。', ts);
    }

    // --- announcements -------------------------------------------------------
    const annCount = db.prepare('SELECT COUNT(*) AS n FROM im_announcements').get().n;
    if (annCount === 0) {
      const insertAnn = db.prepare(
        `INSERT INTO im_announcements (port_id, title, body, level, status, published_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'published', ?, ?, ?)`
      );
      const port = db.prepare("SELECT id FROM im_ports WHERE code = 'ROYAL_PORT'").get();
      insertAnn.run(
        null,
        '口岸通关须知(必读)',
        '入境需持有效趣味签注;通关码一人一码,截图转发无效;全程免费,不收取任何"通关费"。',
        'info',
        ts,
        ts,
        ts
      );
      insertAnn.run(
        port?.id ?? null,
        '皇家口岸开放时间调整',
        '即日起来自奶龙星的旅客请于 09:00-21:00 通关,夜间大门口岸暂停开放,嗅嗅巡逻队会送大家回酒店。',
        'warning',
        ts,
        ts,
        ts
      );
    }

    // --- message templates + settings --------------------------------------
    const insertTemplate = db.prepare(
      `INSERT OR IGNORE INTO im_message_templates (code, title_template, body_template, variables, enabled, updated_at)
       VALUES (@code, @title, @body, @variables, 1, @ts)`
    );
    for (const t of MESSAGE_TEMPLATES) insertTemplate.run({ ...t, title: t.title, body: t.body, ts });
  });
  run();
}

export function getSetting(key) {
  const row = db.prepare('SELECT value FROM im_settings WHERE key = ?').get(key);
  return row?.value ?? null;
}
