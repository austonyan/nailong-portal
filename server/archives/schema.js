// 奶龙国皇家档案与记录署 — schema, seeds and RBAC wiring.
//
// The office never copies business master data: it reads the visa (visa_*)
// and immigration (im_*) tables in the same SQLite database, masks personal
// fields at the API boundary, and keeps its own arch_* tables for the record
// catalog, archival rules, access logs, deletion requests, hidden markers,
// mailbox messages and audit trail. Everything here is additive and
// INSERT-only towards the shared registries.
import { db, now } from '../db.js';
import { ensureTwColumns } from '../migrate.js';

let ensured = false;

export function ensureArchivesSchema() {
  if (ensured) return;
  ensured = true;
  db.exec(`
  -- 记录类型登记表:本署只读归档哪些业务记录(签注 / 入境两类业务,四种记录)。
  CREATE TABLE IF NOT EXISTS arch_record_types (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    code           TEXT NOT NULL UNIQUE,
    office         TEXT NOT NULL CHECK (office IN ('visa', 'immigration')),
    name           TEXT NOT NULL,
    name_tw        TEXT,
    description    TEXT NOT NULL DEFAULT '',
    description_tw TEXT,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  -- 归档规则:简单 KV。每个记录类型两对键:
  --   rule.<code>.included      '1' | '0'   是否纳档
  --   rule.<code>.retention     简体保留说明
  --   rule.<code>.retentionTw   繁体保留说明
  CREATE TABLE IF NOT EXISTS arch_rules (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 首页办事指南(种子内容双语成对,管理端不开放编辑)。
  CREATE TABLE IF NOT EXISTS arch_guides (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT NOT NULL UNIQUE,
    title      TEXT NOT NULL,
    title_tw   TEXT,
    body       TEXT NOT NULL DEFAULT '',
    body_tw    TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 访问留痕:谁、何时、看了哪一类档案,以及导出行为。
  CREATE TABLE IF NOT EXISTS arch_access_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL CHECK (action IN ('list', 'detail', 'export')),
    office      TEXT NOT NULL DEFAULT '',
    record_type TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}',
    ip          TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_arch_access_user ON arch_access_logs (user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_arch_access_action ON arch_access_logs (action, created_at);

  -- 数据删除/注销申请: pending → reviewing → executing → completed | rejected
  CREATE TABLE IF NOT EXISTS arch_deletion_requests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    no             TEXT NOT NULL UNIQUE,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    scope          TEXT NOT NULL DEFAULT '[]',
    impact         TEXT NOT NULL DEFAULT '',
    reason         TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'reviewing', 'executing', 'completed', 'rejected')),
    affected_count INTEGER NOT NULL DEFAULT 0,
    review_note    TEXT NOT NULL DEFAULT '',
    reject_reason  TEXT,
    receipt_no     TEXT,
    handled_by     INTEGER,
    handled_name   TEXT NOT NULL DEFAULT '',
    accepted_at    TEXT,
    approved_at    TEXT,
    completed_at   TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    deleted_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_arch_req_user ON arch_deletion_requests (user_id, status);
  CREATE INDEX IF NOT EXISTS idx_arch_req_status ON arch_deletion_requests (status, created_at);

  -- 申请进度时间线(用户端详情与管理端回执共用)。
  CREATE TABLE IF NOT EXISTS arch_request_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES arch_deletion_requests(id) ON DELETE CASCADE,
    action     TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT '',
    actor_id   INTEGER,
    actor_name TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_arch_event_req ON arch_request_events (request_id);

  -- 隐藏标记:执行删除申请时只在本署映射表打标记,绝不删除业务表数据。
  CREATE TABLE IF NOT EXISTS arch_hidden_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    record_type TEXT NOT NULL,
    record_id   INTEGER NOT NULL,
    request_no  TEXT NOT NULL DEFAULT '',
    reason      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    UNIQUE (record_type, record_id)
  );
  CREATE INDEX IF NOT EXISTS idx_arch_hidden_user ON arch_hidden_records (user_id, record_type);

  -- 本署站内信:只存消息类型与 JSON 参数,SPA 用 arch.msg.* 渲染简繁。
  -- channel 记录投递通道(postal = 邮政契约),source 固定为本署。
  CREATE TABLE IF NOT EXISTS arch_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    request_id INTEGER,
    type       TEXT NOT NULL,
    params     TEXT NOT NULL DEFAULT '{}',
    source     TEXT NOT NULL DEFAULT 'archives',
    channel    TEXT NOT NULL DEFAULT 'postal',
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_arch_msg_user ON arch_messages (user_id, read);

  -- 敏感操作审计(导出、规则变更、申请处理)。
  CREATE TABLE IF NOT EXISTS arch_audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER,
    actor_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target_type TEXT NOT NULL DEFAULT '',
    target_id   TEXT NOT NULL DEFAULT '',
    detail      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_arch_audit_action ON arch_audit_logs (action, created_at);
  `);

  ensureTwColumns(db, 'arch_record_types', ['name', 'description']);
  ensureTwColumns(db, 'arch_guides', ['title', 'body']);
  seedArchives();
}

// ---------------------------------------------------------------------------
// Seeds — idempotent, INSERT OR IGNORE everywhere.
// ---------------------------------------------------------------------------

const ARCH_PERMISSIONS = [
  {
    key: 'arch:portal',
    name: '档案署访问',
    nameTw: '檔案署存取',
    description: '查询本人签注与入境档案、导出档案汇总并提交数据删除申请',
    descriptionTw: '查詢本人簽註與入境檔案、匯出檔案彙總並提交資料刪除申請',
    grp: 'archives',
  },
  {
    key: 'arch:manage',
    name: '档案署管理',
    nameTw: '檔案署管理',
    description: '归档规则配置、全量档案查询与导出、删除申请处理、访问日志与审计',
    descriptionTw: '歸檔規則設定、全量檔案查詢與匯出、刪除申請處理、存取日誌與稽核',
    grp: 'archives',
  },
];

const RECORD_TYPES = [
  {
    code: 'visa_application',
    office: 'visa',
    name: '签注申请记录',
    nameTw: '簽註申請紀錄',
    description: '你提交的签注申请单、审核结果与签发时间',
    descriptionTw: '你提交的簽註申請單、審核結果與簽發時間',
    retention: '自提交之日起长期保留,仅本人与授权管理人员可查。',
    retentionTw: '自提交之日起長期保留,僅本人與授權管理人員可查。',
    sortOrder: 0,
  },
  {
    code: 'visa_permit',
    office: 'visa',
    name: '电子签注记录',
    nameTw: '電子簽註紀錄',
    description: '已签发的电子签注编号、有效期与使用状态',
    descriptionTw: '已簽發的電子簽註編號、有效期與使用狀態',
    retention: '自签发之日起保留至签注失效后 3 年。',
    retentionTw: '自簽發之日起保留至簽註失效後 3 年。',
    sortOrder: 1,
  },
  {
    code: 'im_declaration',
    office: 'immigration',
    name: '入境申报记录',
    nameTw: '入境申報紀錄',
    description: '出入境申报单、审核结果与通关码状态',
    descriptionTw: '出入境申報單、審核結果與通關碼狀態',
    retention: '自申报之日起长期保留,仅本人与授权管理人员可查。',
    retentionTw: '自申報之日起長期保留,僅本人與授權管理人員可查。',
    sortOrder: 2,
  },
  {
    code: 'im_entry',
    office: 'immigration',
    name: '出入境记录',
    nameTw: '出入境紀錄',
    description: '口岸出入境记录、入境日期与停留天数',
    descriptionTw: '口岸出入境紀錄、入境日期與停留天數',
    retention: '自入境之日起长期保留,作为口岸通行记录的一部分。',
    retentionTw: '自入境之日起長期保留,作為口岸通行紀錄的一部分。',
    sortOrder: 3,
  },
];

const GUIDES = [
  {
    code: 'query',
    title: '如何查询本人档案',
    titleTw: '如何查詢本人檔案',
    body:
      '进入「我的档案」后,可按署分类(签注 / 入境)、记录类型与时间范围筛选,也可以用编号关键字搜索。本署只读展示其他署已产生的记录,不复制业务主数据;需要办理业务请前往原署页面。',
    bodyTw:
      '進入「我的檔案」後,可按署分類(簽註 / 入境)、紀錄類型與時間範圍篩選,也可以用編號關鍵字搜尋。本署唯讀展示其他署已產生的紀錄,不複製業務主資料;需要辦理業務請前往原署頁面。',
    sortOrder: 0,
  },
  {
    code: 'privacy',
    title: '脱敏展示与访问留痕',
    titleTw: '去識別化展示與存取留痕',
    body:
      '证件号、联系方式等敏感字段在目录、详情与导出中一律打码。每次查看档案都会写入访问日志(谁、何时、看了哪一类),你可以随时在申请详情中了解处理进度。',
    bodyTw:
      '證件號、聯絡方式等敏感欄位在目錄、詳情與匯出中一律遮蔽。每次查看檔案都會寫入存取日誌(誰、何時、看了哪一類),你可以隨時在申請詳情中了解處理進度。',
    sortOrder: 1,
  },
  {
    code: 'deletion',
    title: '数据删除 / 注销申请',
    titleTw: '資料刪除 / 註銷申請',
    body:
      '选择需要隐藏的记录范围、说明影响并二次确认后提交。处理流程为:待处理 → 受理中 → 执行中 → 已完成,或不予处理(附理由)。执行完成只在本署归档映射上打隐藏标记,不会删除原署业务数据。',
    bodyTw:
      '選擇需要隱藏的紀錄範圍、說明影響並二次確認後提交。處理流程為:待處理 → 受理中 → 執行中 → 已完成,或不予處理(附理由)。執行完成只在本署歸檔對應上打隱藏標記,不會刪除原署業務資料。',
    sortOrder: 2,
  },
];

export const ruleKey = (code, field) => `rule.${code}.${field}`;

function seedArchives() {
  const ts = now();
  const run = db.transaction(() => {
    // --- permissions -------------------------------------------------------
    const insertPermission = db.prepare(
      `INSERT OR IGNORE INTO permissions (key, name, name_tw, description, description_tw, grp)
       VALUES (@key, @name, @nameTw, @description, @descriptionTw, @grp)`
    );
    for (const p of ARCH_PERMISSIONS) insertPermission.run(p);

    const grantToRole = db.prepare(
      `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
       SELECT (SELECT id FROM roles WHERE key = ?), id FROM permissions WHERE key = ?`
    );
    // admin always owns every arch:* permission, even on pre-existing databases.
    for (const p of ARCH_PERMISSIONS) grantToRole.run('admin', p.key);
    // 门户普通用户即可进入本署查看本人档案。
    grantToRole.run('user', 'arch:portal');

    // --- 档案署管理员 role ------------------------------------------------
    const adminRole = db.prepare('SELECT id FROM roles WHERE key = ?').get('arch_admin');
    if (!adminRole) {
      db.prepare(
        'INSERT INTO roles (key, name, name_tw, description, description_tw, is_system, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      ).run(
        'arch_admin',
        '档案署管理员',
        '檔案署管理員',
        '皇家档案与记录署管理员:归档规则、全量档案查询与导出、删除申请处理与审计',
        '皇家檔案與紀錄署管理員:歸檔規則、全量檔案查詢與匯出、刪除申請處理與稽核',
        ts
      );
    }
    grantToRole.run('arch_admin', 'arch:portal');
    grantToRole.run('arch_admin', 'arch:manage');

    // --- service card on the portal home -----------------------------------
    db.prepare(
      `INSERT OR IGNORE INTO services (key, name, name_tw, description, description_tw, url, icon, color, required_permission, entry_mode, enabled, sort_order, created_at, updated_at)
       VALUES ('archives', '奶龙国皇家档案与记录署', '奶龍國皇家檔案與紀錄署',
               '查询本人签注与入境档案、导出档案汇总、提交数据删除申请',
               '查詢本人簽註與入境檔案、匯出檔案彙總、提交資料刪除申請',
               '/archives', 'BookIcon', 'brown', 'arch:portal', 'internal_sso', 1, -3, ?, ?)`
    ).run(ts, ts);

    // --- 记录类型 + 归档规则 ------------------------------------------------
    const insertType = db.prepare(
      `INSERT OR IGNORE INTO arch_record_types
         (code, office, name, name_tw, description, description_tw, sort_order, created_at, updated_at)
       VALUES (@code, @office, @name, @nameTw, @description, @descriptionTw, @sortOrder, @ts, @ts)`
    );
    const insertRule = db.prepare('INSERT OR IGNORE INTO arch_rules (key, value, updated_at) VALUES (?, ?, ?)');
    for (const type of RECORD_TYPES) {
      insertType.run({ ...type, ts });
      insertRule.run(ruleKey(type.code, 'included'), '1', ts);
      insertRule.run(ruleKey(type.code, 'retention'), type.retention, ts);
      insertRule.run(ruleKey(type.code, 'retentionTw'), type.retentionTw, ts);
    }
    // 旧库可能已有记录类型但缺保留说明:只补空值,不覆盖管理员修改。
    const fillRetention = db.prepare(
      `UPDATE arch_rules SET value = ?, updated_at = ? WHERE key = ? AND (value IS NULL OR value = '')`
    );
    for (const type of RECORD_TYPES) {
      fillRetention.run(type.retention, ts, ruleKey(type.code, 'retention'));
      fillRetention.run(type.retentionTw, ts, ruleKey(type.code, 'retentionTw'));
    }

    // --- 办事指南(双语演示数据) --------------------------------------------
    const insertGuide = db.prepare(
      `INSERT OR IGNORE INTO arch_guides (code, title, title_tw, body, body_tw, sort_order, enabled, created_at, updated_at)
       VALUES (@code, @title, @titleTw, @body, @bodyTw, @sortOrder, 1, @ts, @ts)`
    );
    for (const guide of GUIDES) insertGuide.run({ ...guide, ts });
    const fillGuideTw = db.prepare(
      `UPDATE arch_guides SET title_tw = ?, body_tw = ?
       WHERE code = ? AND (title_tw IS NULL OR title_tw = '')`
    );
    for (const guide of GUIDES) fillGuideTw.run(guide.titleTw, guide.bodyTw, guide.code);
  });
  run();
}