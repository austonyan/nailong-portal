# 奶龙统一门户 · 全业务链路与流程说明

> 本文件描述的是**本仓库自身**的业务实现，不是 `docs/design-system/`、`docs/adr/` 等上游
> animal-island-ui 库文档的一部分。
>
> - 审查日期：2026-11-01
> - 代码基线：`logical` 分支，HEAD `0f367c6`
> - 审查范围：平台核心（认证 / RBAC / 服务注册 / 站内信 / 联动 / 自动审批 / 双语）+
>   12 个在 SPA 内运行的业务署 + 跨署链路
> - 审查方式：全量代码走读 + 18 个验收脚本在**全新数据库**上实际运行
> - 运行结论：**18 个脚本全部通过，共 713 项断言**；主业务链路可以完整走通。
>   静态走读另发现若干验收脚本未覆盖的缺陷，见第 8 节。本次审查**未修改任何业务或 UI 代码**。

---

## 1. 系统总览

### 1.1 运行架构

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 前端 SPA | `src/` | Vite + React 19 + react-i18next；`animal-island-ui` 组件与 `--animal-*` token |
| API | `server/` | Express 5，单进程挂载全部平台路由与 12 个署的路由 |
| 数据库 | `server/data/nailong.db`（可由 `NAILONG_DATA_DIR` 覆盖） | SQLite（better-sqlite3，WAL，外键开启） |
| 认证 | `server/auth.js`、`server/routes/auth.js` | JWT 访问令牌（30 分钟，内存）+ 刷新令牌（7 天，httpOnly Cookie） |
| 权限 | `server/db.js` + 各署 `schema.js` | 43 个权限码、24 个角色（10 个系统角色） |
| 服务入口 | `services` 表 | 12 个业务署 + 3 个演示卡（wiki / workshop / weather） |
| 跨署 | `server/linkage.js`、`server/postal/notify.js`、`server/autoApprove.js` | 进程内直读同库表，不走 HTTP 回环 |

服务端启动顺序（`server/index.js`）：平台路由 → 各署 `inter` → 各署 `admin` → 各署用户路由。
`inter → admin → 用户` 的顺序保证 `/api/<office>/inter/*`、`/api/<office>/admin/*` 不会被用户路由的
鉴权中间件截获。`backfillContentTranslations(db)` 在所有署 schema 就绪后执行一次，最后启动自动审批
调度器。

### 1.2 12 个业务署

| 服务 key | 中文名 | 前端入口 | 权限码 | 门户 entry_mode | 自动审批 | 验收脚本 |
| --- | --- | --- | --- | --- | --- | --- |
| `visa` | 奶龙国签注申请署 | `/visa` | `visa:apply/review/manage` | `internal_sso` | 是（通过，不签发） | `smoke-visa.mjs` |
| `immigration` | 皇家口岸入境署 | `/immigration` | `imm:portal/inspect/verify/admin` | **`external`（种子缺陷，见 8.1）** | 是（通过 + 通关码） | `server/immigration/smoke.mjs` |
| `docs` | 奶龙国皇家文书与认证署 | `/docs` | `docs:apply/certify/manage` | `internal_sso` | 是（通过 + 发证） | 由 `smoke-linkage` / `smoke-auto-approve` 覆盖 |
| `diplomacy` | 奶龙国皇家外交事务署 | `/dip` | `dip:portal/review/admin` | `internal_sso` | 是（建交 + 身份） | `smoke-dip.mjs` |
| `resident` | 奶龙国皇家居民登记署 | `/resident` | `res:portal/review/manage` | `internal_sso` | 是（登记 + 变更） | `smoke-resident.mjs` |
| `protocol` | 奶龙国皇家礼宾与活动署 | `/protocol` | `evt:portal/review/checkin/manage` | `internal_sso` | 是（报名 + 接待方 + 礼遇） | `smoke-protocol.mjs` |
| `appeal` | 奶龙国皇家申诉与监察署 | `/appeal` | `appeal:apply/process/review/inspect/manage` | `internal_sso` | 是（仅受理） | `smoke-appeal.mjs` |
| `archives` | 奶龙国皇家档案与记录署 | `/archives` | `arch:portal/manage` | `internal_sso` | 是（受理→通过→执行） | `smoke-archives.mjs` |
| `postal` | 奶龙国皇家邮政与通信署 | `/postal` | `post:portal/manage` | `internal_sso` | 否 | `smoke-postal.mjs` |
| `tourism` | 奶龙国皇家文化旅游署 | `/tourism` | `tour:portal/manage` | `internal_sso` | 否 | `smoke-tourism.mjs` |
| `stats` | 奶龙国皇家统计署 | `/stats` | `stat:portal/manage` | `internal_sso` | 否 | `smoke-stats.mjs` |
| `education` | 奶龙国皇家教育与科学署 | `/education` | `edu:portal/review/manage` | `internal_sso` | 是（仅审核通过） | `smoke-education.mjs` |

三个演示卡 `wiki` / `workshop` / `weather` 均为 `external`、无权限要求，不承载业务。

### 1.3 权限模型

共 43 个权限码：

| 分组 | 权限码 |
| --- | --- |
| 门户 | `portal:access` |
| 用户/角色/服务 | `users:read`、`users:write`、`roles:read`、`roles:write`、`services:read`、`services:write` |
| 签注 | `visa:apply`、`visa:review`、`visa:manage` |
| 入境 | `imm:portal`、`imm:inspect`、`imm:verify`、`imm:admin` |
| 文书 | `docs:apply`、`docs:certify`、`docs:manage` |
| 外交 | `dip:portal`、`dip:review`、`dip:admin` |
| 居民 | `res:portal`、`res:review`、`res:manage` |
| 礼宾 | `evt:portal`、`evt:review`、`evt:checkin`、`evt:manage` |
| 申诉 | `appeal:apply`、`appeal:process`、`appeal:review`、`appeal:inspect`、`appeal:manage` |
| 档案 | `arch:portal`、`arch:manage` |
| 邮政 | `post:portal`、`post:manage` |
| 文旅 | `tour:portal`、`tour:manage` |
| 统计 | `stat:portal`、`stat:manage` |
| 教育 | `edu:portal`、`edu:review`、`edu:manage` |

内置角色（数据库实际授权）：

| 角色 | 类型 | 权限 |
| --- | --- | --- |
| `admin` 管理员 | 系统 | 全部 43 项（`roles` 中以 `*` 表达，启动时展开） |
| `user` 普通用户 | 系统 | `portal:access` + 12 个署的 portal/apply 权限（`visa:apply`、`appeal:apply`、`docs:apply`、`imm:portal`、`res:portal`、`dip:portal`、`evt:portal`、`arch:portal`、`post:portal`、`tour:portal`、`stat:portal`、`edu:portal`） |
| `visa_reviewer` / `visa_admin` | 系统 | 签注申请 + 审核 / + 管理 |
| `appeal_processor` / `appeal_reviewer` / `appeal_inspector` / `appeal_admin` | 系统 | 申诉处理 / + 复核 / 只读监察 / 全部 |
| `docs_certifier` / `docs_admin` | 系统 | 文书申请 + 认证 / + 管理 |
| `imm_officer` 边检员 | 自定义 | `imm:portal` + `imm:inspect` + `imm:verify` |
| `dip_reviewer` / `dip_admin` | 自定义 | 外交访问 + 审核 / + 管理 |
| `res_reviewer` / `res_admin` | 自定义 | 居民访问 + 审核 / + 管理 |
| `protocol_reviewer` / `protocol_checker` / `protocol_admin` | 自定义 | 活动审核 / 签到 / 全部 |
| `post_admin` / `arch_admin` / `tour_admin` / `stat_admin` / `edu_reviewer` / `edu_admin` | 自定义 | 对应署的管理或审核权限 |

> 系统角色的权限在每次启动时按代码定义回填（只增不减）；`admin` 角色禁止修改和删除。

### 1.4 全署通用约定

- **编号**：各署都用“前缀 + 日期 + 随机码”的不可预测编号，冲突重试 5 次：
  - 签注申请 `NLA-YYMMDD-XXXXXX`，签注 `NLT-YYMMDD-XXXXXXXX`
  - 入境申报 `IMYYYYMMDD-XXXXXX`，通关码 `PCYYYYMMDD-XXXXXX`，入境记录 `ENYYYYMMDD-XXXXXX`，出境 `EXYYYYMMDD-XXXXXX`
  - 文书申请 `NLDA-`，证书 `NLDC-`，外交建交 `NLD`、身份 `NLE`、协议 `NLG`
  - 居民申请 `NRR-`，居民卡 `NRC-`，变更 `NRX-`
  - 活动 `NJE-`，报名 `NJR-`，邀请函 `NJI-`，凭证 `NJP-`，接待方 `NJH-`，接待方证书 `NLC-`，礼遇 `NJC-`（前缀均可在配置中修改）
  - 申诉 `NAA-`，复核 `NAR-`，投诉 `NAC-`，工单 `NAT-`，决定书 `NAD-`
  - 档案删除申请 `NAH-`（回执 `<no>-R`）
  - 明信片 `NLM`，公告 `NLQ`，文旅打卡 `NLI`，景点 `NLV`，文章 `NLH`，徽章 `NLB`
  - 统计报告 `NSR-`，教育词条 `NEE`、文章 `NEA`、任务 `NET`
  - 以上共 38 类（37 类随机编号 + 档案执行回执派生号），全部可在申诉署公开验真中心
    `/appeal/verify` 查到；该接口按注册表逐表精确匹配，不依赖前缀，因此管理台改前缀、
    `NLD`/`NLDA`/`NLDC` 前缀重叠都不影响。
- **审计**：每个署都有独立的 `*_audit*` 表；管理操作、自动审批（`detail.auto=true`）、
  跨署回写（`actor_name=皇家申诉与监察署`）都留痕。
- **站内信**：两种实现并存。
  - 只存 `type + params`，由前端 i18n 渲染：visa、docs、appeal、archives。
  - 服务端用可编辑模板渲染 `title/body` 与繁体 `title_tw/body_tw`：immigration、dip、
    resident、protocol、postal。
- **双语**：显示列都有 `_tw` 兄弟列；`localeMiddleware` 根据 `X-Nailong-Locale` 输出
  简/繁字段；服务端种子内容由 `content-i18n.js` 按 code/标题回填，不覆盖后台已填值。
- **惰性状态扫描**：没有独立定时任务，读取相关列表/详情时顺带执行（补件超时、签注/证书/
  居民卡到期、活动状态推进、协议生效等）。自动审批调度器是唯一常驻定时器。
- **限流**：签注、入境、文书、外交、居民、礼宾、申诉均有进程内限流或数据库限流表；重启后
  进程内计数清零。

---

## 2. 平台核心流程

### 2.1 首次启动引导（setup）

1. `GET /api/setup/status` → `{required, completedAt}`；全新库 `required=true`。
2. SPA 将所有路由重定向到 `/setup`。
3. `POST /api/setup/admin`：用户名（3–32 位字母数字/下划线/短横）、显示名、邮箱、密码
   （8–72 位且必须同时含字母和数字）。
4. 服务端事务内二次检查 `app_meta['setup.completed_at']`，创建 `admin` 角色用户，写入
   `setup.completed_at` 与 `setup.admin_username`。
5. 完成后 `POST` 返回 409 `SETUP_COMPLETE`，`/setup` 跳回登录页；引导永久关闭。
6. 已有 admin 用户的旧库在启动时自动 latch；`ADMIN_PASSWORD` 仅在全库无用户时创建
   `admin` 并跳过向导（不校验密码复杂度）。

### 2.2 注册、登录与会话

| 端点 | 说明 |
| --- | --- |
| `POST /api/auth/register` | 用户名 + 密码 + 显示名；默认挂 `user` 角色；返回用户与令牌 |
| `POST /api/auth/login` | 校验 bcrypt 密码与 `active` 状态；写 `sessions`；下发 access + refresh |
| `POST /api/auth/refresh` | 校验 refresh Cookie 的 JWT 与 `sessions` 行；删除旧 jti、插入新 jti（轮换） |
| `POST /api/auth/logout` | 删除当前 jti 会话并清 Cookie |
| `GET /api/auth/me` | 返回 `publicUser`（角色、权限、状态） |
| `PATCH /api/auth/profile` | 修改显示名/邮箱 |
| `POST /api/auth/change-password` | 校验旧密码；成功后删除该用户其他会话 |
| `POST /api/auth/introspect` | 公开；其他服务校验门户 access token，返回 `{active,user}` |

访问令牌放在 `Authorization: Bearer`，TTL 30 分钟；刷新令牌为 httpOnly Cookie
`nailong_rt`，路径 `/api/auth`，TTL 7 天。每次鉴权都重新读用户/角色/权限，用户被禁用后
旧 access token 立即失效。

### 2.3 用户与角色管理

- `GET /api/users`（`users:read`，分页/搜索）；`POST/PATCH/DELETE /api/users`（`users:write`）。
- 不可禁用/删除自己、不可改自己的角色（`SELF_LOCKOUT`）；不可禁用/删除/剥离最后一个
  活跃 admin（`LAST_ADMIN`）。
- 角色：`GET /api/roles`、`GET /api/roles/permissions`（`roles:read`）；
  `POST/PATCH/DELETE /api/roles`（`roles:write`）。
- `admin` 角色权限锁定（`SYSTEM_ROLE_LOCKED`）；系统角色不可删除；仍被用户使用的角色
  不可删除（`ROLE_IN_USE`）。
- 自定义角色的权限键目前只接受静态 `PERMISSIONS` 常量，无法授予各署 schema 注册的
  权限（见 8.1）。

### 2.4 服务注册表与门户入口

- `services` 表字段：`key/name/name_tw/description/description_tw/url/icon/color/
  required_permission/entry_mode/enabled/sort_order`。
- `GET /api/services`：已登录即可；只返回 `enabled=1` 且当前用户持有 `required_permission`
  的服务卡，按 `sort_order,id` 排序。
- `GET /api/services/admin`（`services:read`）+ `POST/PATCH/DELETE`（`services:write`）：
  key 2–40 位、URL 必须 http(s) 或站内 `/...`、icon/color 白名单、权限必须存在。
- `entry_mode`：
  - `external`：新标签页打开 URL。
  - `internal`：SPA 内跳转。
  - `internal_sso`：先弹出门户 SSO 身份确认，再进入 SPA 页面；确认结果存
    `sessionStorage`（各署键名如 `nailong.visa.sso`），`*Shell` 组件对直接 URL 也做同样校验。
- 门户首页按用户权限展示服务卡；每个署进入后有署内横向导航（署内导航），管理台入口由
  `src/nav/navConfig.js` 统一生成。

### 2.5 跨署站内信聚合

`server/routes/messages.js` 只读聚合 9 个信箱，不新建表、不双写：

| office | 表 | 权限 | 内容形态 |
| --- | --- | --- | --- |
| `visa` | `visa_messages` | `visa:apply` | `type + params` |
| `docs` | `doc_messages` | `docs:apply` | `type + params` |
| `appeal` | `appeal_messages` | `appeal:apply` | `type + params` |
| `archives` | `arch_messages` | `arch:portal` | `type + params`（无 `archived` 列） |
| `immigration` | `im_messages` | `imm:portal` | 服务端渲染 `title/body` |
| `dip` | `dip_messages` | `dip:portal` | 服务端渲染 |
| `resident` | `res_messages` | `res:portal` | 服务端渲染 |
| `protocol` | `pro_messages` | `evt:portal` | 服务端渲染 |
| `postal` | `post_messages` | `post:portal` | 服务端渲染；额外排除 `source='archives'` |

- `GET /api/messages?status=all|unread&office=&limit=50` → `{items, unread:{total,byOffice}, offices}`。
- `GET /api/messages/unread` → 头部角标。
- `POST /api/messages/read` `{office,id}`；`POST /api/messages/read-all` `{office?}`。
- 每个来源先各取 `limit` 条，再按 `createdAt` 倒序合并；标记已读写回原表，所以署内收件箱
  与全站收件箱状态一致。
- `archives` 会把消息镜像到 `post_messages`（type 前缀 `archives_`），聚合时排除这些镜像
  行，避免重复计数。

### 2.6 身份绑定取件与联动授权

- `GET /api/linkage/identity`：有有效居民卡时以居民卡为身份依据，否则回落到 SSO 账户。
- `GET /api/linkage/records?source=&consumer=&kind=`：只返回**当前用户本人**的记录；
  consumer 白名单：`docs_apply`、`immigration_declare`、`protocol_courtesy`、
  `protocol_registration`、`appeal_apply`、`manual`。
- `GET /api/linkage/verify?source=&consumer=&code=`：校验编号是否存在且归属本人；非本人只
  返回 `found/kind/status`，不返回标题与明细。
- `GET /api/linkage/certificates`：聚合本人有效证件/凭证。
- `GET /api/linkage/alerts`：居民卡失效、外交身份与外交签注不一致等提示。
- `linkage_access_logs` 记录每次 `list` / `verify`；首次取件前 SPA 用
  `LinkageConsentModal` 做会话级授权确认。

### 2.7 跨署自动审批

- 表 `service_auto_approve(service_key, mode, delay_minutes, updated_by, updated_at)`。
- `GET/PATCH /api/auto-approve/:service`，守卫权限为对应署的管理权限。
- 模式：`off`、`immediate`、`delayed`（1–10080 分钟）。
- 调度器每 5 秒（`AUTO_APPROVE_INTERVAL_MS` 可覆盖）遍历 9 个已注册 processor；
  只处理 `updated_at <= cutoff` 的待审行，每类每次最多 20 条。
- processor 调用与人工端点**同一个核心函数**，所以状态迁移、审核记录、审计、站内信、
  下游凭证（签证、通关码、居民卡、外交礼遇、活动凭证、文书证书）不会漂移。
- 自动决策使用 `system` actor，审计 `detail.auto=true`。
- 覆盖范围与后置动作见第 5 节。

### 2.8 服务互认（recognize）

- 表 `service_recognize`：`service_key`、`holder_source`、`holder_kind`、`effect`
  （`simplify|waive|priority`）、`benefit`、双语、`enabled`、`sort_order`。
- 默认规则：有效居民证 → 签注简化材料、入境优先、礼宾活动优先；有效外交身份 → 入境优先。
- `GET /api/recognize/me/:serviceKey`：按 `listUserCertificates` 判断是否命中并返回
  `eligible` 与匹配凭证。
- 管理接口 `GET /`（`services:read`）、`POST/PATCH/DELETE`（`services:write`）。
- 该机制目前只输出“资格/权益”，不强制改写各署业务状态机；业务侧是否消费由页面决定。

### 2.9 双语与本地化

- `X-Nailong-Locale` 优先，其次 `Accept-Language`，默认 `zh-CN`；`zh-TW/zh-Hant` 视为繁体。
- `localeMiddleware` 递归处理 JSON：`*_tw` → `*Tw`；繁体中把 `*Tw` 覆盖到基字段并保留
  `*Cn`；嵌套在 `params` 里的 `labelTw/placeholderTw` 等也会处理。
- `server/migrate.js` 每次启动按需 `ALTER TABLE ADD COLUMN`，旧库自动获得 `_tw` 列；
  不做删除列/类型变更，无回滚脚本。
- `backfillContentTranslations` 只填空值，不覆盖管理员已填的繁体。
- 前端 `zh-CN` / `zh-TW` 各 5482 个 key，`npm run check:i18n` 校验静态 key、动态前缀与枚举。

---

## 3. 各署业务流程

### 3.1 奶龙国签注申请署（visa）

**入口与权限**：`/visa`；`visa:apply`（用户）、`visa:review`（审核/签发/作废/验真记录）、
`visa:manage`（类型/公告/配置/黑名单/统计/审计/CSV）。服务卡 `entry_mode=internal_sso`。

**用户端流程**：

1. `GET /api/visa/home` — 公告、启用类型、审核时长提示、未读信；先执行惰性扫描。
2. `GET /api/visa/diplomatic-eligibility` — 外交签注资格（需有效外交身份）。
3. `POST /api/visa/applications {typeCode}` — 建草稿；类型必须启用；`DIPLOMATIC` 还需有效
   外交身份；生成 `NLA-` 编号。
4. `PUT /api/visa/applications/:id` — 仅草稿；昵称/联系方式/目的/行程必填，日期
   `YYYY-MM-DD` 且离开晚于抵达。
5. `POST /api/visa/materials` — 仅草稿或补件中；单文件 ≤5 MB、每申请最多 6 份、MIME
   限 png/jpeg/webp/pdf；`avatar` 只保留一张。
6. `POST /api/visa/applications/:id/submit` — 仅草稿；黑名单拦截；同一用户
   `pending_review + supplement_required` ≥3 拒绝；必须有头像；限流 1 次/60 秒；
   → `pending_review`，发 `submitted`。
7. 补件：管理员要求补件后进入 `supplement_required`，用户可上传补件材料并
   `POST .../supplement` 回到 `pending_review`；超过 `supplement_deadline` 由扫描自动 `closed`。
8. `POST .../withdraw` — `pending_review/supplement_required` → `withdrawn`。
9. `GET /api/visa/permits`、`/permits/:visaNo` — 本人签注与验真 token。
10. `POST /api/visa/privacy/erase` — 无在途申请时擦除材料与敏感字段，保留编号/轨迹。

**状态机**：

| 对象 | 状态 | 迁移 |
| --- | --- | --- |
| 申请 | `draft` → `pending_review` → `supplement_required` / `approved` / `rejected` / `withdrawn`；`supplement_required` → `pending_review` / `closed`；`approved` → `issued`；`rejected` / `closed` → `pending_review`（申诉回写） | 补件超时自动 `closed`；申诉重开重置驳回字段 |
| 签注 | `valid` → `used` / `voided` / `expired`；`used` → `voided` | 入境核销回写 `used`；到期扫描 `expired`；外交身份失效级联 `voided` |

**管理端**：

- 审核工作台 `GET /api/visa/admin/queue`、`GET /applications/:id`。
- `POST .../approve`（通过）、`.../reject`（驳回，必须 `reasonCode`）、`.../supplement`
  （补件，1–30 天）、`.../issue`（签发 `NLT-`，一个申请一张，1–3650 天）。
- 签注操作：`GET /permits`、`POST /permits/:visaNo/mark-used`、`POST /permits/:visaNo/void`。
- 配置管理：类型 CRUD、公告 CRUD、`GET/PUT /config`（`visa.*` 键）、黑名单、统计、审计、
  `GET /export.csv`。
- `GET /verify-logs` 查看验真记录。

**署间接口** `/api/visa/inter/*`（`x-nailong-service-token` vs `VISA_INTER_SERVICE_TOKEN`）：

- `POST /check` `{no?,token?}` — 脱敏签注校验。
- `POST /mark-used {no}` — 口岸核销回写。
- `GET /types` — 类型目录。

**公开验真**：`GET /api/visa/verify?no=&token=`，公开、按 IP 限流（默认 30 次/5 分钟），
返回类型/状态/有效期/签发机关，不含持有人信息；每次查询写 `visa_verify_logs`。

**站内信**：`submitted / supplement_required / approved / rejected / issued / used / voided /
expired / closed / withdrawn / expiry_reminder / diplomatic_voided / appeal_reopened`。

**跨署与自动审批**：

- 入境署直接读 `visa_permits`/`visa_types`，核销时改 `visa_permits.status='used'` 并写
  `visa_messages('used')`、`visa_audit('inter_mark_used')`。
- 文书署按签注号/申请号校验并占用证书记录。
- 申诉署对 `rejected/closed` 申请回写重开。
- 外交署身份失效时 `syncDiplomaticVisa` 把有效 `DIPLOMATIC` 签注置 `voided`。
- 自动审批只到 `approved`，**不自动签发**。

### 3.2 皇家口岸入境署（immigration）

**入口与权限**：`/immigration`；`imm:portal`（申报/通关码/记录）、`imm:inspect`（边检审核）、
`imm:verify`（通关码核验/作废）、`imm:admin`（口岸/公告/记录/统计/模板/审计/黑名单）。
服务卡种子缺少 `entry_mode`，实际落为 `external`（见 8.1）。

**用户端流程**：

1. `GET /api/immigration/overview` — 口岸、公告、拥堵度、本人状态计数、未读信、超期入境提示。
2. `GET /ports`、`/ports/:code` — 口岸详情、通道、活动提示、外交礼遇。
3. `POST /visa/check {visaNo}` — 签注校验（真实台账 + 演示格式缓存）；限流 20 次/小时。
4. `POST /declarations` — 建草稿；口岸、昵称、联系方式、目的、停留天数（1–90）、
   随行人、地址、签注号、携带物品；生成 `IM` 编号。
5. `PATCH/DELETE /declarations/:id` — 仅草稿。
6. `POST /declarations/:id/submit` — 仅草稿；口岸必须开放；同一口岸不能有重复在途申报；
   必须填签注号且实时校验为 `valid`；→ `pending`，发 `submit_success`。
7. 补件：管理员要求补件 → `supplement`；用户 `POST .../supplement` 回到 `pending`。
8. `POST .../withdraw` — `pending` → `withdrawn`（`supplement` 不能撤回）。
9. 附件：`POST /declarations/:id/attachments`（≤5 MB，png/jpeg/webp/gif/pdf）。
10. `GET /pass-codes`、`/records/entry`、`/records/exit`；`POST /records/entry/:id/exit`
    登记出境，生成 `EX` 编号，申报 → `exited`。
11. 公开 `GET /api/immigration/verify?token=` 验通关码。

**状态机**：

| 对象 | 状态 | 迁移 |
| --- | --- | --- |
| 申报 | `draft` → `pending` → `supplement` / `approved` / `rejected` / `withdrawn`；`supplement` → `pending` / `rejected`；`approved` → `entered` → `exited` | 无超时关闭；申诉回写 `rejected → pending` |
| 通关码 | `unused` → `used` / `voided`；`unused` 过期按 `expired` 计算 | 核验通过写 `used`；管理员可作废 |
| 入境记录 | `entered` → `exited`；管理员可标 `invalid` | 出境登记生成 `im_exit_records` |

**管理端**：

- 口岸/通道 CRUD 与状态（`open|closed|maintenance`）；公告 CRUD。
- 边检审核：队列、详情、`approve`（生成 14 天通关码）、`reject`（原因白名单）、
  `supplement`（2–300 字说明）。
- 通关码核验：按编号查询、`POST /pass-codes/verify`（核验通过 → 入境记录 + 申报 `entered`
  + 回写签注 `used`）、`POST /pass-codes/:id/void`。
- 记录管理、统计、审计、黑名单（`warn|block`）、消息模板、站内信记录。

**公开验真**：`GET /api/immigration/verify?token=`，token 必须 32 位 hex，限流 60 次/小时，
只返回通关码号/状态/口岸/有效期。

**站内信模板**：`submit_success / supplement / approved / rejected / supplement_received /
pass_code / entry_record / exit_reminder / appeal_reopened`。其中 `exit_reminder` 仅有模板，
没有发送调用。

**跨署与自动审批**：

- 签注校验与核销回写签注署（同进程直读/直写）。
- 外交签注校验时检查外交身份；口岸详情返回外交礼遇。
- 口岸详情附带 7 天内礼宾活动提示。
- 自动审批：`pending` → `approved`，同时生成通关码、发 `approved`/`pass_code` 消息。

### 3.3 奶龙国皇家文书与认证署（docs）

**入口与权限**：`/docs`；`docs:apply`、`docs:certify`、`docs:manage`；`internal_sso`。

**用户端流程**：

1. `GET /notices`（公开）、`GET /types`、`GET /types/:code` — 启用类型与表单/材料定义。
2. `POST /applications {typeCode}` — 建草稿；黑名单/限流；生成 `NLDA-`。
3. `PATCH /applications/:id` — 仅草稿（注意：整表覆盖语义，见 8.2）。
4. `POST /materials` — 仅草稿或补件中；按类型配置限制 `kind`、大小、数量、MIME。
5. `POST /applications/:id/submit` — 仅草稿；必填表单字段与必交材料校验；关联业务编号
   必须 `checked/found/owned`，必填类型还要求 `certifiable`；→ `pending`，发 `submitted`。
6. 补件：`supplementing` 状态下上传补件材料并 `POST .../resubmit` 回到 `pending`。
7. `POST .../withdraw` — `pending/supplementing` → `withdrawn`。
8. `GET /certificates`、`/certificates/:id` — 本人证书；先执行到期扫描。
9. 公开 `POST /api/docs/verify {no}` — 证书号公开验真；带 JWT 时也可查本人申请号。
10. `GET /api/docs/verify/mine` — 本人验真历史。

**状态机**：

| 对象 | 状态 | 迁移 |
| --- | --- | --- |
| 申请 | `draft` → `pending` → `supplementing` / `approved` / `rejected`；`supplementing` → `pending` / `withdrawn`；`pending` / `supplementing` → `withdrawn`；`rejected` → `pending`（申诉回写） | 补件超时扫描置 `withdrawn` 并发 `closed` 消息（语义不一致，见 8.2） |
| 证书 | `valid` → `used` / `revoked` / `expired` | 签发即 `valid`；到期扫描；管理员可标记使用/撤销/补发 |

**管理端**：

- 认证队列 `GET /admin/queue`；`approve`（签发 `NLDC-`，同类型同业务编号只能有一张有效
  证书）、`reject`（原因白名单）、`require-supplement`（1–30 天）。
- 类型注册：code/名称/说明/指南/双语、`validity_days`、`biz_source`、表单字段、材料配置。
- 证书生命周期：撤销、标记使用、补发。
- 验真管理：日志、失败率/高频查询告警。
- 公告、配置、黑名单、统计、审计。

**公开验真**：`POST /api/docs/verify`，按 IP 限流（默认 20 次/5 分钟），证书只返回类型/
状态/有效期/签发机关；申请号仅本人可查；查询写 `doc_verify_logs`。

**站内信**：`submitted / supplement_request / supplemented / approved / rejected / withdrawn /
closed / expired / expiry_reminder / revoked / regenerated / appeal_reopened`。

**跨署与自动审批**：

- 关联业务来源：`visa`、`protocol`、`entry→immigration`、`resident`、`foreign→diplomatic`、
  `appeal`、`archives`；通过 `verifyBusinessRecord` 校验归属与可认证性。
- 有效证书对同一 `biz_no` 的引用数写入 `refCount/reserved`。
- `APPEAL_DECISION` 签发后回写 `appeal_decisions.cert_code`。
- 居民卡失效时只产生提示，不自动撤销证书。
- 自动审批：`pending` → `approved` 并立即签发证书，写审核轨迹、消息与审计。

### 3.4 奶龙国皇家外交事务署（dip）

**入口与权限**：`/dip`；`dip:portal`、`dip:review`、`dip:admin`；`internal_sso`。

**用户端流程**：

1. `GET /overview` — 公告、类型、协议数、审核提示、本人统计。
2. 建交：`POST /relations`（对象类型、建交类型、实体名、代表、联系方式、理由、目的、
   礼遇）→ 草稿；`PATCH/DELETE` 仅草稿；上传材料；`submit`（黑名单、限流 5 次/日、
   同用户只能有一条在途建交、至少 1 份材料）→ `pending_review`。
3. 建交状态：`established` 后可 `POST /relations/:id/sever` 申请断交 →
   `sever_requested`，管理员复核后 `severed` 并级联身份失效。
4. 外交身份：`POST /identities`（类型、关联建交、昵称、联系方式、职务、任期）→ 草稿；
   `submit`（关联建交必须 `established`、任期 ≤365 天、至少 1 份材料）→ `pending_review`；
   通过后 `active` 并生成 `verify_token` 与身份卡。
5. `GET /identities/:id/card` — 身份卡与验真路径。
6. 协议：`GET /agreements`（已公示且 `active/pending_effect`）、`GET /agreements/:no`、
   `POST /agreements/eligibility`（按本人建交/身份匹配协议方）。
7. 礼遇：`GET /courtesies`、`POST /courtesies/check`（按本人有效身份查礼遇）。
8. 代表处：`GET /offices`、`/offices/:code`。
9. 公开验真：`POST /api/dip/verify {code}` 或 `GET /api/dip/verify?token=`。

**状态机**：

| 对象 | 状态 | 迁移 |
| --- | --- | --- |
| 建交关系 | `draft` → `pending_review` → `supplement_required` / `established` / `rejected` / `withdrawn`；`established` → `suspended` / `sever_requested` / `severed`；`sever_requested` → `severed` / `established`；`suspended` → `established` / `severed` | 断交通过时级联身份失效 |
| 外交身份 | `draft` → `pending_review` → `supplement_required` / `active` / `rejected` / `withdrawn`；`active` → `frozen` / `revoked` / `expired`；`frozen` → `active` / `revoked` / `expired` | 任期到期扫描 `expired`；断交/注销 `revoked` |
| 协议 | `draft` → `pending_effect` / `active` / `terminated`；`pending_effect` → `active` / `terminated`；`active` → `expired` / `terminated` | 生效日/到期日惰性推进 |

**管理端**：

- 建交队列与 `approve/reject/supplement/suspend/resume/sever`。
- 身份队列与 `approve/reject/supplement/freeze/unfreeze/revoke`；通过时自动写全部启用礼遇。
- 礼遇记录手工补录。
- 协议 CRUD 与状态流转；生效时通知匹配的实体持有人。
- 代表处、公告、类型/礼遇/设置配置、验真日志、黑名单、统计、审计、消息模板。

**署间接口** `/api/dip/inter/*`（`DIP_INTER_SERVICE_TOKEN`）：
`POST /identity/check`、`POST /relation/check`、`POST /agreement/check`、
`GET /courtesies/:no`。

**公开验真**：`POST /verify`（编号，按可配置前缀分流）与 `GET /verify?token=`；按 IP
限流；只返回编号/类型/实体/状态/日期，不含联系方式与理由；写 `dip_verify_logs`。

**站内信模板**：`relation_submitted / relation_supplement / relation_supplement_received /
relation_established / relation_rejected / relation_sever_request / relation_severed /
identity_submitted / identity_supplement / identity_supplement_received / identity_approved /
identity_rejected / identity_frozen / identity_renew / identity_invalidated /
agreement_effective / appeal_reopened`。

**跨署与自动审批**：

- `diplomaticEligibility` 被签注署申请/提交/审核和入境署签注校验使用；无有效身份时外交
  签注不能申请，已有有效外交签注被 `syncDiplomaticVisa` 置 `voided`。
- 身份有效时口岸详情返回启用礼遇。
- 文书署可引用建交/身份/协议作为关联业务。
- 申诉署可把 `rejected` 建交/身份重开为 `pending_review`。
- 自动审批：先建交后身份；身份通过生成 `verify_token` 与自动礼遇记录。

### 3.5 奶龙国皇家居民登记署（resident）

**入口与权限**：`/resident`；`res:portal`、`res:review`、`res:manage`；`internal_sso`。

**用户端流程**：

1. `GET /home` — 公告、类型、在途申请、有效/冻结卡、未读信。
2. `POST /applications {typeCode}` — 建草稿；黑名单；`one_identity_per_account=1` 时已有
   居民档案拒绝；在途申请上限默认 1；生成 `NRR-`。
3. `PUT /applications/:id` — 仅草稿；昵称/联系方式/虚拟地址/简介/用途（`collect|activity|
   visa_fast|other`，必须非空）。
4. 上传头像/地址证明/其他材料（≤5 MB、最多 6 份）。
5. `POST .../submit` — 仅草稿；按类型要求头像/地址证明；虚拟地址必填；限流 1 次/60 秒；
   → `pending_review`，发 `submitted`。
6. 补件：`supplement_required` → 上传补件材料 + `POST .../supplement` → `pending_review`；
   超时扫描 `closed`。
7. `POST .../withdraw` — `pending_review/supplement_required` → `withdrawn`。
8. 居民卡：`GET /card`；`POST /card/reissue`（仅换 `verify_token`，卡号不变）。
9. 变更：`GET /changes`、`POST /changes`（`info|upgrade|renewal`，在途 ≥3 拒绝，
   info 至少改一项，upgrade 目标类型必须不同且启用，renewal 卡必须有效或已过期）、
   `POST /changes/:id/cancel`。
10. `GET /benefits` — 居民权益与四个通道（签注快捷、入境居民通道、活动优先、身份类文书）。
11. `POST /privacy/erase` — 无在途申请时擦除材料与敏感字段。
12. 公开 `GET /resident/verify?no=&token=`。

**状态机**：

| 对象 | 状态 | 迁移 |
| --- | --- | --- |
| 申请 | `draft` → `pending_review` → `supplement_required` / `approved` / `rejected`；`pending_review/supplement_required` → `withdrawn`；`supplement_required` → `pending_review` / `closed`；`rejected/closed` → `pending_review`（申诉回写） | 补件超时自动关闭 |
| 居民卡 | `valid` → `frozen` / `expired` / `voided`；`frozen` → `valid` / `voided`；`expired` → `voided` | 到期扫描；续期审批延长有效期；注销删除居民档案 |
| 变更 | `pending_review` → `approved` / `rejected` / `cancelled` | 审批时写回档案/卡 |

**管理端**：

- 审核队列、通过（生成 `res_residents` 与 `res_cards`，`NRC-`）、驳回（原因白名单）、补件。
- 变更队列、通过（info/upgrade/renewal 写回）、驳回。
- 卡管理：冻结/解冻/注销/补发/批量到期提醒。
- 居民信息查询（联系方式/地址掩码）、验真日志。
- 类型、公告、模板、消息、配置、黑名单、风险、统计、审计、CSV 导出。
- 注意：管理路由先挂 `res:review`，再在管理段叠加 `res:manage`，只有 manage 的角色无法
  使用管理接口（见 8.2）。

**署间接口** `/api/resident/inter/*`（`RESIDENT_INTER_SERVICE_TOKEN`）：
`POST /check`、`GET /types`。

**公开验真**：`GET /resident/verify` 支持卡号/申请号/token；按 IP 限流；只返回卡号/类型/
状态/有效期/签发机关；写 `res_verify_logs`。

**站内信模板**：`submitted / supplement_required / supplement_received / approved /
rejected / withdrawn / closed / card_issued / card_frozen / card_unfrozen / card_voided /
card_reissued / card_expired / expiry_reminder / change_approved / change_rejected /
appeal_reopened`。

**跨署与自动审批**：

- 居民卡是“身份锚点”：`linkageIdentity` 优先用居民卡；`residentChannels` 展开四个权益；
  `crossOfficeAlerts` 在卡失效时列出受影响的签注与文书证书。
- 文书署 `RESIDENT_CARD` 类型按居民卡/申请/变更校验。
- 礼宾居民专属活动/礼遇以居民卡为依据。
- 自动审批：登记通过生成卡；变更通过写回档案/卡。

### 3.6 奶龙国皇家礼宾与活动署（protocol）

**入口与权限**：`/protocol`；`evt:portal`、`evt:review`、`evt:checkin`、`evt:manage`；
`internal_sso`。**用户端路由实际只要求登录，未校验 `evt:portal`**（见 8.1）。

**用户端流程**：

1. `GET /home` — 公告、类型、热门/即将开始活动、开放报名数、礼遇类型。
2. `GET /events`、`GET /events/:no` — 仅公开状态（`registration/registration_closed/
   ongoing/ended`）。
3. `POST /registrations {eventId}` — 活动必须开放报名；同活动不能重复报名；活跃报名 ≤5；
   生成 `NJR-`。
4. `PATCH/DELETE /registrations/:id` — 仅草稿；上传材料。
5. `POST .../submit` — 仅草稿；活动仍开放且未过截止；必填字段；随行人/人数一致；
   居民/外交专属校验（读居民卡/外交身份）；邀请函归属/活动/有效期；必传材料；容量；
   → `pending_review`；使用邀请函时置 `used`。
6. `POST .../cancel` — `draft/pending_review/approved/waitlisted` → `cancelled`；作废待用
   凭证；原 `approved` 取消后触发候补转正。
7. 邀请函：`GET /invitations`、`POST /:id/accept|decline`、`GET /:id/file`。
8. 凭证：`GET /passes`、`GET /passes/:id/file`。
9. 接待方：`POST /hosts`（同用户只能有一个在途/已认证接待方）、`submit`、材料。
10. 礼遇：`GET /courtesy/types`、`POST /courtesy/eligibility`（居民/外交/邀请函依据）、
    `POST /courtesy/applications`、`cancel`。
11. 工单、消息、隐私擦除、个人风险摘要。
12. 公开 `GET /protocol/verify?token=&no=`。

**状态机**：

| 对象 | 状态 | 迁移 |
| --- | --- | --- |
| 活动 | `draft` → `pending_publish` / `registration` / `cancelled`；`pending_publish` → `registration` / `draft` / `cancelled`；`registration` → `registration_closed` / `ongoing` / `cancelled`；`registration_closed` → `ongoing` / `registration` / `cancelled`；`ongoing` → `ended` / `cancelled` | 按截止时间/开始/结束惰性推进 |
| 报名 | `draft` → `pending_review` / `cancelled`；`pending_review` → `approved` / `waitlisted` / `rejected` / `cancelled`；`waitlisted` → `approved` / `cancelled` / `rejected`；`approved` → `checked_in` / `cancelled` / `finished`；`checked_in` → `finished` | 活动结束把 `checked_in` 置 `finished` |
| 邀请函 | `valid` → `used` / `expired` / `revoked` | 报名消费置 `used`；过期扫描 |
| 活动凭证 | `pending` → `used` / `expired` / `voided`；`used` → `expired` | 签到置 `used`；活动结束/取消作废或过期 |
| 接待方 | `draft` → `pending_review` / `revoked`；`pending_review` → `certified` / `rejected` / `supplement_required` / `revoked`；`supplement_required` → `pending_review` / `rejected` / `revoked`；`certified` → `frozen` / `revoked`；`frozen` → `certified` / `revoked` | 通过生成 `NLC-` 证书号 |
| 礼遇申请 | `pending_review` → `approved` / `rejected` / `cancelled`；`approved` → `used` / `cancelled` / `expired` | 管理员可标记使用；到期扫描 |

**管理端**：

- 活动类型、活动 CRUD、状态流转、活动公告（非 info 会通知报名者）。
- 报名审核/候补/驳回/转正；通过自动签发凭证。
- 邀请函创建/撤销；凭证作废/补发；接待方审核/冻结/撤销/权限。
- 礼遇类型与申请审批、礼遇记录、签到（入场/离场）、统计、审计、CSV 导出。
- 验真日志、黑名单、工单、配置、公告、模板。

**署间接口** `/api/protocol/inter/*`（`PROTOCOL_INTER_SERVICE_TOKEN`）：
`POST /check`、`GET /invitations/:no`、`GET /passes/:no`、`GET /events/upcoming`、
`GET /hosts/:no`、`POST /passes/mark-used`。

**公开验真**：`GET /protocol/verify` 支持邀请函/凭证/接待方编号或 token；按 IP 限流；
只返回活动/类型/状态/有效期/签发机关；写 `pro_verify_logs`。

**站内信模板**：`registration_submitted / registration_approved / registration_waitlisted /
registration_promoted / registration_rejected / registration_cancelled / event_changed /
event_cancelled / invitation_issued / invitation_revoked / pass_issued / pass_voided /
pass_reissued / host_submitted / host_approved / host_rejected / host_supplement /
courtesy_submitted / courtesy_approved / courtesy_rejected / checkin_done / ticket_replied`。

**跨署与自动审批**：

- 报名时按居民卡/外交身份做专属资格校验；`linkage_enabled` 关闭时视为预留通过。
- 入境署口岸详情展示 7 天内活动；文书署可引用邀请函/活动凭证按编号认证。
- 申诉署可把 `rejected` 接待方、`revoked` 邀请函、`voided` 凭证重开。
- 自动审批：报名通过并签发凭证（满员转候补）、接待方认证、礼遇通过。

### 3.7 奶龙国皇家申诉与监察署（appeal）

**入口与权限**：`/appeal`；`appeal:apply`、`appeal:process`、`appeal:review`、
`appeal:inspect`、`appeal:manage`；`internal_sso`。

**用户端流程**：

1. `GET /home` — 公告、7 类业务类型、各状态计数、SLA 提示。
2. 申诉：`POST /appeals {bizType,bizCode}` → 草稿（生成 `NAA-`）；`PUT` 保存理由/期望/
   联系方式/材料；`submit`（黑名单、同业务编号不能重复在途、在途 ≤3、业务件必须属于本人；
   `not_found` 允许进入人工核验）→ `pending_accept`，发 `appeal_submitted`。
3. 补件：`supplement_required` 状态下上传补件材料并提交 → `processing`。
4. `POST /appeals/:id/withdraw` — 受理中/处理中可撤回（补件中不可）。
5. 评价：`resolved` 后可评分 1–5。
6. 复核：`POST /reviews {appealId,reason}` — 原申诉必须 `resolved/rejected`、未申请过复核、
   在 `review_days`（默认 15 天）内；生成 `NAR-`，状态 `pending`。
7. 投诉建议：`POST /complaints`（`complaint/suggestion`，分类，匿名可不填联系方式）→
   `pending_accept`；`POST /complaints/:id/evaluate`。
8. 工单：`POST /tickets`、`POST /tickets/:id/reply`、`POST /tickets/:id/close`。
9. 决定书：`GET /decisions`、`/decisions/:code`。
10. 公示：`GET /publicity`、`/publicity/stats`。
11. 公开 `GET /appeal/verify?no=&token=`。

**状态机**：

| 对象 | 状态 | 迁移 |
| --- | --- | --- |
| 申诉 | `draft` → `pending_accept` → `accepted` / `rejected`；`accepted/processing` → `processing` / `supplement_required` / `resolved` / `closed`；`pending_accept/accepted/processing` → `withdrawn` / `closed`；`supplement_required` → `processing` / `closed`；`resolved/rejected` → `closed`；`rejected` → `processing`（复核改判） | 补件超时扫描关闭；合并写 `merged_into` |
| 复核 | `pending` → `reviewing` → `completed` | 一次终局 |
| 投诉建议 | `pending_accept` → `processing` → `replied` → `closed` | 无驳回/撤回 |
| 工单 | `pending` → `processing` / `replied` / `closed` / `escalated`；`processing` → `replied` / `closed` / `escalated`；`replied` → `replied` / `closed` / `escalated`；`escalated` → `processing` / `closed` / `replied` | `closed` 终态 |
| 决定书 | `valid`；复核改判时原决定 `expired` | `voided` 枚举存在但未使用 |

**管理端**：

- 申诉工作台：队列、详情（含业务署快照）、受理/拒绝受理、分派、补件、决定
  （`maintain|undo|change|transfer`）、关闭、合并。
- 决定后生成 `NAD-` 决定书并调用 `writebackDecision` 回写业务署。
- 投诉建议：队列、受理、回复、关闭、升级为申诉草稿。
- 工单：队列、回复、状态流转。
- 复核：队列、受理、决定；非 `maintain` 时把原决定书置 `expired`，并再次回写业务署。
- 监察：SLA 汇总、原始记录、报告、跨署抽样（7 类业务）。
- 管理：公告、公示、模板、黑名单、重复件、配置、统计、审计、验真日志、CSV 导出。

**公开验真（统一验真中心）**：`GET /appeal/verify` 先查申诉本署 5 类编号（决定书
token/编号、复核、申诉、投诉建议、工单），未命中再查 `server/appealVerify.js` 的 33 条
跨署注册表（签注/入境/文书/外交/居民/礼宾/档案/邮政/文旅/统计/教育），合计覆盖 38 类
业务编号。注册表逐表精确匹配号码列，不解析前缀，因此前缀可配置、`NLD`/`NLDA`/`NLDC`
不会串表；只返回编号、所属署、业务类型、状态、是否有效与关键日期，不含姓名、联系方式、
业务内容或 token；限流沿用 `appeal.verify_limit`（默认 30/5min/IP），每次查询写
`appeal_verify_logs`（`result` 形如 `office:kind:status`）。软删除记录与原地覆盖的历史
编号按“未找到”处理。

**站内信**：21 个类型，包括 `appeal_submitted/accepted/accept_rejected/
supplement_required/supplemented/resolved/withdrawn/closed/merged/reopened`、
`review_submitted/accepted/completed`、`decision_issued`、
`complaint_submitted/replied/closed/escalated`、`ticket_replied/escalated/closed`。

**跨署与自动审批**：

- 7 类可申诉业务：`visa / immigration / resident / diplomatic / document / archives /
  protocol`。
- 校验（`verifyBusinessRecord`）→ 快照（`businessSnapshot`）→ 决定回写
  （`writebackBusiness`）。回写只对特定“被驳回/关闭/失效”状态重开：
  - 签注申请 `rejected/closed` → `pending_review`
  - 入境申报 `rejected` → `pending`
  - 居民申请 `rejected/closed` → `pending_review`
  - 外交身份/关系 `rejected` → `pending_review`
  - 文书申请 `rejected` → `pending`
  - 档案删除申请 `rejected` → `pending`
  - 礼宾接待方 `rejected` → `pending_review`、邀请函 `revoked` → `valid`、凭证 `voided` → `pending`
- 决定书通过文书署 `APPEAL_DECISION` 类型认证后回写 `cert_code`。
- 自动审批只受理（申诉 → `accepted`，投诉 → `processing`），**不做决定、不关闭**。

### 3.8 奶龙国皇家档案与记录署（archives）

**入口与权限**：`/archives`；`arch:portal`、`arch:manage`；`internal_sso`。

**定位**：只读档案出口，不复制业务主数据。档案目录直接投影同库 `visa_*` / `im_*` 表，
本署只维护规则、访问日志、隐藏标记、删除申请、消息与审计。

**用户端流程**：

1. `GET /overview` — 纳档记录类型、数量、进行中删除申请、未读信、指南、每日导出额度。
2. `GET /records` — 按署/类型/日期/关键字筛选；每页 ≤50；写访问日志。
3. `POST /records/export` — 每日 3 次；返回 CSV 载荷；写访问日志与审计。
4. `GET /records/:type/:id` — 本人记录详情（脱敏），不可跨用户。
5. `POST /deletion-requests` — `confirm=true`、类型非空且已纳档、影响说明 ≥5 字；同用户
   只能有一个进行中申请；生成 `NAH-`；发 `submitted`。
6. `GET /deletion-requests`、`/:id` — 进度时间线。
7. `GET /messages`、`POST /messages/read`。

**状态机（删除申请）**：`pending → reviewing → executing → completed`；
`pending/reviewing → rejected`。`completed/rejected` 终态。执行只写
`arch_hidden_records` 隐藏标记，**不删除也不修改** `visa_*` / `im_*` 业务表。

**管理端**：规则（是否纳档/保留期文案）、全量档案查询/导出、删除申请受理/通过/执行/驳回、
访问日志、审计。

**跨署与自动审批**：

- 可被文书署引用认证（`archives` 业务来源）。
- 可被申诉署按编号校验；仅 `rejected` 删除申请可申诉，决定回写把状态重置为 `pending`
  并写事件/审计/消息。
- 消息同时写 `arch_messages` 并镜像到 `post_messages`（`source='archives'`，type 前缀
  `archives_`）。
- 自动审批在一次 tick 内连续完成受理→通过→执行，生成隐藏标记、回执与消息。

### 3.9 奶龙国皇家邮政与通信署（postal）

**入口与权限**：`/postal`；`post:portal`、`post:manage`；`internal_sso`。

**用户端流程**：

1. `GET /home` — 最新公告、启用明信片模板、最近收件、未读数、订阅状态、每日额度。
2. 公告：`GET /notices`、`/notices/:id`（仅已发布）。
3. 订阅：`GET/PUT /subscription`；公告发布时向订阅者推送 `notice_published`。
4. 通知偏好：`PUT /preferences {source,enabled}`；关闭某来源后邮政契约消息被跳过。
5. 消息：列表、搜索、批量已读/未读/归档/取消归档、全部已读/归档。
6. 明信片：`GET /recipients`、`GET /card-templates`、`POST /postcards`（草稿或直接寄出）、
   `PATCH`（仅草稿）、`POST /:id/send`、`POST /:id/receive`、收藏/取消收藏、双侧隐藏。
   每日寄出上限默认 10。
7. 明信片状态：`draft → sent → received`；`sent/received → taken_down`（仅管理员）。

**管理端**：公告 CRUD/发布/下线、通知模板 CRUD、明信片审核下架、明信片模板 CRUD、统计、
审计、消息类型清单。没有 `post_settings` 管理接口（前缀/限额只能改库）。

**通知机制（邮政契约）**：

- `sendPostalMessage({userId,source,type,params})`：校验用户有效 → 查偏好（`enabled=0`
  跳过）→ 找 `(source,type)` 启用模板，再找 `source='*'` → 用 `{{变量}}` 渲染四列 →
  写 `post_messages`。
- 使用方：postal 自身（订阅确认/取消、公告发布、明信片收件、下架）、tourism
  （`tour_checkin`/`tour_badge`）、stats（`annual_report_ready`）、education
  （`task_completed`）、archives（镜像 `archives_*`）。
- 全站聚合排除 `post_messages.source='archives'`，避免与 `arch_messages` 重复。

**跨署与自动审批**：不读取其他署业务表；不参与 linkage；不参与自动审批。

### 3.10 奶龙国皇家文化旅游署（tourism）

**入口与权限**：`/tourism`；`tour:portal`、`tour:manage`；`internal_sso`。
`GET /api/tourism/recs` 只要求登录，供签注署首页使用。

**用户端流程**：

1. `GET /home` — 推荐景点、节日文章、个人打卡/徽章/纪念章统计、规则。
2. `GET /attractions`、`/attractions/:id` — 仅上线景点；返回今日是否已打卡。
3. `POST /attractions/:id/checkin` — 景点必须上线且未关闭；同用户同景点同日只能一次；
   每人每日上限默认 10；全站每日上限默认 500（0 不限）；写 `NLI-`，发 `tour_checkin`，
   触发徽章评估。
4. `GET /articles`、`/articles/:id` — 仅已发布。
5. `GET /collection` — 本人打卡 + 纪念章（由 `im_entry_records` 只读投影）。
6. `GET /badges`、`GET /me` — 徽章与个人统计。
7. 徽章：按累计打卡数达到阈值自动发放；同一用户同一徽章只发一次（回收后不再重发，见 8.2）。

**管理端**：景点 CRUD/上下线/开放状态、文章 CRUD/上下线、打卡规则、徽章 CRUD/回收/发放记录、
统计、审计。文章新建默认直接 `published`，没有草稿态。

**跨署**：纪念章只读 `im_entry_records` / `im_ports`（含繁体口岸名），不写入境表；
`/tourism/recs` 被签注署首页消费；通知经邮政契约；不参与自动审批。

### 3.11 奶龙国皇家统计署（stats）

**入口与权限**：`/stats`；`stat:portal`、`stat:manage`；`internal_sso`。

**用户端流程**：

1. `GET /metrics` — 启用指标实时计数。
2. `GET /home` — 指标、本人报告数与最新报告。
3. `GET /reports`、`/reports/:id` — 本人年度报告。
4. `POST /reports {year?}` — 年份 2000–当前年；每用户每小时默认 6 次；同年度重复生成会
   刷新同一行（`UNIQUE(user_id, year)`）；生成 `NSR-`；发 `annual_report_ready`。

**年度报告快照**（跨署只读，11 个 section）：签注（申请/签发/通过）、入境（申报/入境/出境）、
文旅（打卡/徽章）、邮政（寄出/收到）、档案（删除申请）、礼宾（报名/签到）、教育（阅读）、
外交（建交/身份）、文书（证书）、居民（居民数/卡）、申诉（提交/办结）。统计署自身不进入
快照。

**管理端**：12 署总看板（每卡有待审/通过/驳回/通过率/平均耗时/附加表计数）、统计口径
（指标）CRUD、CSV 导出与留痕、导出日志、审计。

**跨署**：看板与快照读取 12 署表；写入仅 `stat_*` 和 `post_messages`；不参与 linkage；
不参与自动审批。

### 3.12 奶龙国皇家教育与科学署（education）

**入口与权限**：`/education`；`edu:portal`、`edu:review`、`edu:manage`；`internal_sso`。

**内容状态机**：`draft → pending_review → published → offline`；`pending_review → draft`
（驳回）；`offline → published`（重新上线）。不存在 `draft → published`。

**用户端流程**：

1. `GET /home` — 最新词条/文章、分类、任务概览、计数、徽章。
2. `GET /entries`、`/entries/:id` — 仅已发布；详情增加阅读数、写阅读历史、同步任务进度、
   返回相关词条与收藏状态。
3. `POST /entries/:id/favorite`（收藏/取消）。
4. `GET /articles`、`/articles/:id`、`POST /articles/:id/favorite`。
5. `GET /history`、`GET /favorites` — 仅展示目标仍可用的记录。
6. `GET /tasks`、`GET /my` — 阅读任务进度与个人统计。
7. 任务引擎：统计本人对**已发布且未删除**内容的去重阅读数；达到目标完成任务、发徽章、
   发 `task_completed`；记录 `in_progress → completed`。

**管理端**：

- 审核（`edu:review`）：合并词条/文章待审队列、详情、通过（`pending_review → published`，
  写 `edu_reviews`）、驳回（必须写审核意见，退回 `draft`）、审核历史。
- 内容管理（`edu:manage`）：词条/文章 CRUD、提交审核、发布、下架、软删除；任务 CRUD/
  启停/完成记录；统计；审计。手工 `publish` 不写 `edu_reviews`（见 8.2）。
- 没有分类 CRUD；分类由种子提供。

**通知**：任务完成时经邮政契约发 `task_completed`；无本地 outbox 兜底。

**跨署与自动审批**：不读取其他署业务表；不参与 linkage；自动审批只把已提交的
`pending_review` 内容通过，**不会自动驳回**。

---

## 4. 跨署端到端链路

### 4.1 签注 → 入境 → 口岸核销回写

1. 用户在签注署建申请 → 提交 → 管理员通过并签发 `NLT-` 签注。
2. 用户在入境署建申报，填写签注号；提交时入境署直接读 `visa_permits` 校验有效性/归属。
3. 边检通过 → 生成 14 天通关码。
4. 口岸核验通关码 → 写 `im_entry_records`、申报置 `entered`、调用
   `markPermitUsed` 把签注置 `used`，并写 `visa_messages('used')` 与
   `visa_audit('inter_mark_used')`。
5. 用户登记出境 → `im_exit_records`，申报置 `exited`。
6. 签注署验真立即显示 `used`；入境署统计/记录同步。

### 4.2 文书认证的关联业务校验

1. 用户选择文书类型（如 `VISA_CERT`、`APPEAL_DECISION`、`RESIDENT_CARD`）。
2. 填写业务编号 → `verifyBusinessRecord` 按来源查对应表：
   `visa → visa_permits/applications`、`entry → im_declarations/entry_records`、
   `resident → res_cards/applications/changes`、`foreign → dip_identities/relations`、
   `protocol → pro_invitations/passes/events/hosts`、`appeal → appeal_decisions`、
   `archives → arch_deletion_requests`。
3. 校验 `checked/found/owned`；必填类型还要求 `certifiable`；他人记录直接
   `DOC_BIZ_NOT_OWNED`。
4. 提交后管理员通过 → 签发 `NLDC-` 证书；同类型同 `biz_no` 的有效证书只能有一张。
5. `APPEAL_DECISION` 签发后回写 `appeal_decisions.cert_code`，并写
   `appeal_audit('decision_certified')`。
6. 证书公开验真按证书号；申请号仅本人可查。

### 4.3 申诉 → 业务署回写

1. 用户对 7 类业务之一建申诉（业务编号必须本人；不存在允许进入人工核验）。
2. 提交后进入受理队列；处理人可受理/要求补件/决定。
3. 决定 `undo/change/transfer` 时调用 `writebackBusiness`：
   按业务类型把被驳回/关闭的申请重开；写业务署审计（`appeal_writeback`）与站内信
   （`appeal_reopened`）。
4. 复核为非 `maintain` 时，原决定书置 `expired`，再次回写业务署。
5. 决定书可由文书署认证，形成“申诉决定 → 文书证明”的闭环。

**回写范围**（只有这些状态会真正重开）：

| 业务类型 | 可重开对象与状态 |
| --- | --- |
| 签注 | 申请 `rejected/closed` → `pending_review` |
| 入境 | 申报 `rejected` → `pending` |
| 居民 | 申请 `rejected/closed` → `pending_review` |
| 外交 | 身份/关系 `rejected` → `pending_review` |
| 文书 | 申请 `rejected` → `pending` |
| 档案 | 删除申请 `rejected` → `pending` |
| 礼宾 | 接待方 `rejected` → `pending_review`；邀请函 `revoked` → `valid`；凭证 `voided` → `pending` |

已生效的签注/居民卡/文书证书/活动等没有回写分支，只写审计，返回
`applied:false, reason:'not_reopenable'`。

### 4.4 居民卡权益链

1. 居民登记通过 → 生成 `res_cards`（`valid`）。
2. `residentChannels(userId)` 以最新卡状态判断：
   - 签注快捷通道（`visaFast`）
   - 入境居民通道（`immigrationLane`，检查启用通道名含“居民”）
   - 活动优先（`activityPriority`，检查居民专属活动/礼遇）
   - 身份类文书（`identityCertificate`，检查 `RESIDENT_CARD` 类型启用）
3. `linkageIdentity` 优先用居民卡作为取件身份；`/api/linkage/records` 只返回本人记录。
4. 卡冻结/注销/过期时，`crossOfficeAlerts` 列出可能受影响的签注与文书证书（只提示，
   不自动撤销）。
5. 礼宾报名/礼遇以居民卡作为居民专属资格依据；文书署可引用居民卡号。

### 4.5 外交身份链

1. 建交通过 → `established`；外交身份通过 → `active`，生成 `verify_token` 与礼遇记录。
2. 签注署 `diplomatic-eligibility` 检查有效身份；`DIPLOMATIC` 类型申请/提交/审核都要求
   身份有效。
3. 入境署校验外交签注时再次检查身份；身份失效返回 `revoked`。
4. 口岸详情向有效外交身份展示启用礼遇。
5. 身份到期/注销/断交 → `syncDiplomaticVisa` 把有效 `DIPLOMATIC` 签注置 `voided`，
   发 `diplomatic_voided` 消息并写审计。

### 4.6 文旅与统计的只读投影

- 签注署首页调用 `GET /api/tourism/recs` 展示推荐景点。
- 文旅收集册把 `im_entry_records` 投影为“入境纪念章”（口岸名支持繁体），不写入境表。
- 统计署 12 署看板实时读取各署主表；个人年度报告聚合 11 个 section。
- 这些读取不改变源署状态。

### 4.7 邮政契约消息链

1. 业务署调用 `sendPostalMessage({userId,source,type,params})`。
2. 检查用户状态与 `post_preferences`；关闭来源则跳过。
3. 查 `(source,type)` 或 `source='*'` 的启用模板，渲染简繁标题/正文。
4. 写 `post_messages`；全站收件箱聚合。
5. 档案署额外写 `arch_messages` 并镜像 `post_messages`（聚合时排除镜像）。
6. 邮政公告发布 → 向订阅者发 `notice_published`（同样受偏好约束）。

### 4.8 档案删除申请链

1. 用户在档案署看到本人签注/入境记录（脱敏、只读）。
2. 提交删除申请（选择类型、影响说明、可选原因）→ `pending`。
3. 管理员受理 → 审核 → 执行；执行只写隐藏标记，业务表不变。
4. 用户档案目录/详情/计数立即隐藏这些记录；原署页面仍可见（设计如此，见 8.3）。
5. 若申请被驳回，可向申诉署申诉；申诉决定回写把 `rejected` 重置为 `pending`。

### 4.9 自动审批链

9 个署参与；processor 与人工端点共用核心函数：
签注（通过）、入境（通过 + 通关码）、文书（通过 + 发证）、外交（建交 + 身份）、
居民（登记 + 变更）、礼宾（报名 + 接待方 + 礼遇）、申诉（仅受理）、档案（受理 + 通过 +
执行）、教育（审核通过）。所有自动决策写 `system` actor 与 `detail.auto=true`。

---

## 5. 自动审批矩阵

| 署 | 自动处理队列 | 自动后置动作 | 不自动做什么 |
| --- | --- | --- | --- |
| visa | `pending_review` 申请 | 置 `approved`、审核记录、消息、审计 | 不签发签注 |
| immigration | `pending` 申报 | 置 `approved`、生成 14 天通关码、消息、审计 | 不做口岸核验 |
| docs | `pending` 申请 | 置 `approved`、签发证书、`APPEAL_DECISION` 回写、消息、审计 | 不自动驳回 |
| dip | `pending_review` 建交 → 身份 | 建交 `established`；身份 `active` + token + 礼遇记录 + 消息 | 不处理断交/冻结 |
| resident | `pending_review` 登记 → 变更 | 生成/刷新居民档案与卡；变更写回 | 不处理卡冻结/注销 |
| protocol | `pending_review` 报名 → 接待方 → 礼遇 | 报名通过并签发凭证（满员转候补）；接待方认证；礼遇通过 | 不处理取消/签到 |
| appeal | `pending_accept` 申诉 → 投诉 | 申诉 `accepted`；投诉 `processing` | 不做决定、不关闭 |
| archives | `pending/reviewing/executing` | 同一 tick 内受理→通过→执行，写隐藏标记/回执/消息 | 不跳过状态机 |
| education | 已提交 `pending_review` 内容 | 审核通过并发布 | 不自动驳回 |

设置端点：`GET/PATCH /api/auto-approve/<service>`，守卫权限分别为
`visa:manage`、`imm:admin`、`docs:manage`、`dip:admin`、`res:manage`、`evt:manage`、
`appeal:manage`、`arch:manage`、`edu:manage`。

---

## 6. 站内信与通知矩阵

| 署 | 存储 | 渲染方式 | 主要类型 |
| --- | --- | --- | --- |
| visa | `visa_messages` | 前端 `visa.msg.*` | submitted / supplement_required / approved / rejected / issued / used / voided / expired / closed / withdrawn / expiry_reminder / diplomatic_voided / appeal_reopened |
| immigration | `im_messages` | 服务端模板 + 简繁 | submit_success / supplement / approved / rejected / supplement_received / pass_code / entry_record / appeal_reopened（exit_reminder 未发送） |
| docs | `doc_messages` | 前端 `docMsg.*` | submitted / supplement_request / supplemented / approved / rejected / withdrawn / closed / expired / expiry_reminder / revoked / regenerated / appeal_reopened |
| dip | `dip_messages` | 服务端模板 + 简繁 | relation_* / identity_* / agreement_effective / appeal_reopened |
| resident | `res_messages` | 服务端模板 + 简繁 | submitted / supplement_* / approved / rejected / card_* / change_* / appeal_reopened |
| protocol | `pro_messages` | 服务端模板 + 简繁 | registration_* / event_changed / event_cancelled / invitation_* / pass_* / host_* / courtesy_* / checkin_done / ticket_replied |
| appeal | `appeal_messages` | 前端 `appeal.msg.*` | appeal_* / review_* / decision_issued / complaint_* / ticket_* |
| archives | `arch_messages` | 前端 `arch.msg.*`，镜像 `post_messages` | submitted / reviewing / executing / rejected / completed / appeal_reopened |
| postal | `post_messages` | 服务端模板或 `post.msg.*` | subscription_confirmed/cancelled / notice_published / postcard_received / postcard_taken_down / archives_* / tour_* / annual_report_ready / task_completed |
| tourism | 经邮政契约 | `post.msg.tour_*` | tour_checkin / tour_badge |
| stats | 经邮政契约 | `post.msg.annual_report_ready` | annual_report_ready |
| education | 经邮政契约 | `post.msg.task_completed` | task_completed |

---

## 7. 验收矩阵与本次运行记录

### 7.1 运行环境

- Node `v24.21.0`，npm `11.18.0`，Windows 10（Git Bash）。
- 全新 `NAILONG_DATA_DIR`，空库启动真实 `server/index.js`。
- 服务间令牌：`VISA_INTER_SERVICE_TOKEN=audit-visa-token`、
  `DIP_INTER_SERVICE_TOKEN=smoke-dip-token`、
  `RESIDENT_INTER_SERVICE_TOKEN=audit-res-token`、
  `PROTOCOL_INTER_SERVICE_TOKEN=audit-pro-token`。
- 运行顺序：自包含脚本各自启动临时服务；在线脚本统一打到一个全新 API 实例。

### 7.2 结果

| 脚本 | 类型 | 断言数 | 结果 |
| --- | --- | --- | --- |
| `smoke-setup.mjs` | 自包含 | 15 | 通过 |
| `smoke-i18n.mjs` | 自包含 | 34 | 通过 |
| `smoke-messages.mjs` | 自包含 | 21 | 通过 |
| `smoke-auto-approve.mjs` | 自包含 | 40 | 通过 |
| `smoke-linkage-identity.mjs` | 自包含 | 17 | 通过 |
| `smoke-archives.mjs` | 自包含 | 51 | 通过 |
| `smoke-tourism.mjs` | 自包含 | 45 | 通过 |
| `smoke-postal.mjs` | 自包含 | 59 | 通过 |
| `smoke-stats.mjs` | 自包含 | 34 | 通过 |
| `smoke-education.mjs` | 自包含 | 46 | 通过 |
| `smoke-offices-linkage.mjs` | 自包含 | 38 | 通过 |
| `smoke-verify-center.mjs` | 自包含 | 157 | 通过 |
| `smoke-visa.mjs` | 需 API | 28 | 通过 |
| `smoke-dip.mjs` | 需 API | 50 | 通过 |
| `smoke-resident.mjs` | 需 API | 51 | 通过 |
| `smoke-protocol.mjs` | 需 API | 38 | 通过 |
| `smoke-appeal.mjs` | 需 API | 63 | 通过 |
| `smoke-linkage.mjs` | 需 API | 56 | 通过 |
| `server/immigration/smoke.mjs` | 自启动 | 27 | 通过 |
| **合计** | | **870** | **全部通过** |

前端静态检查：

- `npm run check:i18n`：扫描 254 个源文件、3350 个静态 key、233 个动态前缀；
  zh-CN / zh-TW 各 5482 个 key，全部匹配。
- `npm run check:ui`：135 个表格、176 个弹窗、19 个页签，约定检查通过。
- `npm run check:tokens`：9 个文件、48 个 token，0 错误 0 警告。

### 7.3 常用运行命令

```bash
# 自包含脚本（各自启动临时服务与临时库）
node server/scripts/smoke-setup.mjs
node server/scripts/smoke-i18n.mjs
node server/scripts/smoke-messages.mjs
node server/scripts/smoke-auto-approve.mjs
node server/scripts/smoke-linkage-identity.mjs
node server/scripts/smoke-archives.mjs
node server/scripts/smoke-tourism.mjs
node server/scripts/smoke-postal.mjs
node server/scripts/smoke-stats.mjs
node server/scripts/smoke-education.mjs
node server/scripts/smoke-offices-linkage.mjs
node server/scripts/smoke-verify-center.mjs

# 入境署脚本（自带 API 启动，默认端口 3210）
NAILONG_DATA_DIR=/tmp/nailong-imm SMOKE_PORT=3210 node server/immigration/smoke.mjs

# 需要先启动 API 的脚本
NAILONG_DATA_DIR=/tmp/nailong-audit PORT=3101 \
  VISA_INTER_SERVICE_TOKEN=... DIP_INTER_SERVICE_TOKEN=... \
  RESIDENT_INTER_SERVICE_TOKEN=... PROTOCOL_INTER_SERVICE_TOKEN=... \
  node server/index.js
node server/scripts/smoke-visa.mjs http://127.0.0.1:3101
node server/scripts/smoke-dip.mjs http://127.0.0.1:3101
node server/scripts/smoke-resident.mjs http://127.0.0.1:3101
node server/scripts/smoke-protocol.mjs http://127.0.0.1:3101
node server/scripts/smoke-appeal.mjs http://127.0.0.1:3101
node server/scripts/smoke-linkage.mjs http://127.0.0.1:3101
```

> 固定用户名的脚本请务必使用全新 `NAILONG_DATA_DIR`；重复使用同一库会因用户名/编号冲突
> 失败。首次运行会自动通过 `bootstrap-admin.mjs` 创建 `admin/admin123`（或
> `ADMIN_PASSWORD`）。

---

## 8. 审查发现

以下问题均为**代码走读确认**，本次未修改。验收脚本未覆盖这些路径，因此 713 项断言全绿并
不代表下述问题不存在。

### 8.1 P1：权限、入口或核心操作不可用

1. **申诉署管理路由被 `appeal:process` 全局拦截**
   - `server/routes/appealAdmin.js:106-107` 的 `processRouter` 挂载了
     `authenticate + requirePermission('appeal:process')`，`:1082` 又把它放在
     `router.use('/', processRouter, reviewRouter, inspectRouter, manageRouter)` 的第一位。
     `requirePermission` 缺权时 `next(forbidden(...))` 直接进入错误处理，后续 router 不会
     执行。
   - 影响：内置 `appeal_inspector`（只有 `appeal:inspect`）无法访问
     `/api/appeal/admin/inspect/*`；只持有 `appeal:review` 或 `appeal:manage` 的自定义角色
     同样无法进入各自工作台。`admin` 与 `appeal_admin` 因同时持有 `appeal:process` 才正常。
   - `smoke-appeal.mjs` 全程使用 admin，因此未暴露。

2. **礼宾署用户端 API 缺少 `evt:portal` 权限**
   - `server/protocol/routes.js:262` 只有 `router.use(authenticate)`，文件内没有
     `requirePermission('evt:portal')`。
   - 影响：任何已登录账号都能调用报名、材料、邀请函、凭证、接待方、礼遇、工单、隐私擦除
     等用户接口，绕过服务卡权限。

3. **自定义角色无法被授予各署权限**
   - `server/routes/roles.js:172-177` 的 `validatePermissionKeys` 只接受静态
     `PERMISSIONS`（26 项），而数据库实际有 43 项；`docs:*`、`imm:*`、`res:*`、`dip:*`、
     `evt:*` 由各署 schema 注册，不在静态常量里。
   - 影响：通过管理界面新建角色时无法选择这些权限，返回 400 `Unknown permission`。
     内置角色不受影响。

4. **礼宾凭证补发必然失败**
   - `pro_passes.registration_id` 是 `UNIQUE`（`server/protocol/schema.js:168`）。
   - `POST /admin/passes/:id/reissue`（`server/protocol/admin.js:809-819`）先把旧凭证置
     `voided`，再调用 `issuePass`；`issuePass` 只有在旧凭证仍为 `pending` 时才复用行，
     否则 `INSERT` 新行（`server/protocol/util.js:766-778`），触发唯一约束。
   - 影响：补发接口对同一报名第二次插入时报 500，实际不可用。

5. **入境署服务卡 `entry_mode` 落为 `external`**
   - `server/immigration/schema.js:372-375` 的 `INSERT` 未包含 `entry_mode`，
     `services.entry_mode` 默认 `external`（`server/db.js:89`）。
   - 实际库查询确认：`immigration | ... | external`；其余 11 个业务署均为 `internal_sso`。
   - 影响：门户点击入境署卡片会按外部服务打开，不弹门户 SSO 身份确认；与“署内 SPA”
     的预期不一致。

6. **文书公开验真不执行到期扫描**
   - `POST /api/docs/verify`（`server/routes/docs.js:158-215`）没有调用 `D.sweepAll()`，
     `maskCertificate`（`server/docs.js:788-803`）直接按 `cert.status` 返回 `valid`。
   - 影响：证书已过 `expires_at` 但尚未被其他读接口触发扫描时，公开验真仍返回
     `valid:true`。`/certificates`、`/admin/*` 等接口会扫描，因此结果取决于访问顺序。

7. **申诉允许对不可申诉状态的业务件提交**
   - `POST /api/appeal/appeals/:id/submit`（`server/routes/appeal.js:322-326`）只拦截
     `found && !owned`，不拦截 `bizCheck.appealable === false`。
   - 影响：例如已生效的签注/证书、处理中的申报等“不可申诉”状态仍可进入人工受理队列；
     决定回写时通常得到 `not_reopenable`。

8. **文书补发可产生多张有效证书**
   - `POST /admin/certificates/:id/regenerate`（`server/routes/docs.js:993-1012`）只要求
     “本次传入的证书”不是 `valid`，不检查同一申请是否已有其他有效证书。
   - 影响：对同一申请的多张历史证书分别补发，可生成多张 `valid` 证书，违反“同一申请
     一张有效证书”的约束。

9. **居民登记可生成多张有效居民卡**
   - `approveApplicationCore`（`server/resident/admin.js:160-202`）不复查用户是否已有
     有效卡，`res_cards.user_id` 也没有唯一约束。
   - 影响：同一用户若在首次审批前提交了多份申请（创建时尚未有居民档案），管理员逐份
     审批会生成多张 `valid` 卡；`GET /resident/card` 只显示最新一张。

### 8.2 P2：数据一致性、消息语义与流程边界

1. **文书补件超时的状态/消息/轨迹不一致**
   - `server/docs.js:563-575` 把超时申请置为 `withdrawn`，却发送 `closed` 消息；状态枚举
     没有 `closed`；也不写 `doc_records` 时间线。
   - `server/routes/docs.js:468-481` 的 `resubmit` 只检查状态为 `supplementing`，不比较
     `supplement_deadline`、不先 `sweepAll`，未触发扫描时可越期重新提交。

2. **文书 `PATCH /applications/:id` 是整表覆盖**
   - `server/routes/docs.js:309-330` 调用 `validatePayload(typeRow, req.body)`，未传的
     `nickname/contact/bizNo` 变成空串、`purpose` 回到 `display`、`formData` 变成 `{}`。
   - 影响：前端按“部分更新”只传一个字段时，其他字段会被清空。

3. **签注/文书的 `appeal_reopened` 消息缺少 `appNo` 参数**
   - `server/linkage.js:1732-1736` 只传 `{appealCode, decisionCode}`；而
     `visa.msg.appeal_reopened`、`docMsg.appeal_reopened` 模板使用 `{{appNo}}`。
   - 影响：消息标题/正文中的申请编号渲染为空。入境/居民/外交/礼宾使用服务端模板，
     会补 `no`，不受影响。

4. **入境审核队列包含未提交草稿**
   - `GET /admin/declarations`（`server/immigration/admin.js:304-336`）的 where 只有
     `deleted_at IS NULL`，没有排除 `draft`。
   - 影响：持 `imm:inspect` 的边检员可以看到并打开其他用户的未提交草稿。

5. **入境补件中的申报不能撤回**
   - `DECL_TRANSITIONS.supplement` 只允许 `pending/rejected`（`server/immigration/util.js:46-55`），
     用户撤回端点在 `supplement` 状态返回 `IMM_INVALID_STATE`。
   - 影响：用户只能等补件或由管理员驳回，不能主动撤回。

6. **入境黑名单到期字段与出境提醒未落地**
   - 黑名单管理接口从不写 `expires_at`（`server/immigration/admin.js:793-804`），
     `activeBlacklist` 的到期判断永远走“无到期时间”分支。
   - `exit_reminder` 模板存在（`server/immigration/schema.js:325-332`），但全仓没有发送调用；
     `/overview` 只统计 `expiringEntries` 数量。

7. **外交补件截止日只写不查**
   - `server/dip/admin.js:153-156` 写入 `supplement_deadline`，但用户补件端点
     （`server/dip/routes.js:420-436`）不比较截止日，`sweepAll`（`server/dip/util.js:243-246`）
     也不关闭过期补件；状态枚举没有 `closed`，逾期申请会停在 `supplement_required`。
   - 另外 `approveRelationCore`/`approveIdentityCore` 接受 `supplement_required` 直接通过，
     与 `dip/util.js:52,64` 声明的迁移表不一致。

8. **外交建交有效期未执行、暂停不级联身份**
   - `dip_relation_types.validity_days` 可配置并回显，但 `dip_relations` 没有有效期列，
     也没有到期扫描。
   - `POST /relations/:id/suspend` 不处理关联身份，身份仍为 `active`，仍可通过验真与外交
     签注资格；只有断交才级联失效。

9. **居民管理接口被双重权限限制**
   - `server/resident/admin.js:114` 整个管理路由要求 `res:review`，`:570` 的管理段再叠加
     `res:manage`。
   - 影响：只持有 `res:manage` 的自定义角色无法使用类型/配置/导出等管理接口；内置
     `res_admin` 恰好两者都有。

10. **礼宾活动取消重复发信且绕过状态机**
    - `server/protocol/admin.js:396-406` 先逐个给报名者发 `event_cancelled`，
      `:407-412` 又调用 `notifyEventAttendees` 再发一次；同一批 `approved/checked_in/
      waitlisted` 用户收到两条相同消息。
    - `:397` 直接把包括 `checked_in` 在内的报名置 `cancelled`，而
      `REGISTRATION_TRANSITIONS.checked_in` 只允许 `finished`（`server/protocol/util.js:62`）。

11. **礼宾凭证补发/核验/签到边界**
    - `POST /inter/passes/mark-used`（`server/protocol/inter.js:137-145`）只把凭证置
      `used`，不校验活动状态/有效期，不更新报名状态，不写签到日志。
    - 管理端签到（`server/protocol/admin.js:1168-1207`）只拒绝 `cancelled` 活动，不校验
      活动时间窗口。
    - `required_fields` 可配置，但提交只强制 `nickname`/`contact`（`server/protocol/routes.js:508-510`）。

12. **邮政模板软删除后无法重建同类型**
    - `(source,type)` 唯一索引不过滤 `deleted_at`（`server/postal/schema.js:110`），删除是
      软删除，创建时查重也不排除已删除行（`server/postal/admin.js:220-223,278-285`）。
    - 影响：删除 `(source,type)` 后无法再建同组合模板；`post_settings` 也没有管理 API，
      前缀/每日限额只能直接改库。

13. **统计口径与来源表不一致**
    - `badges_awarded` 指标 `table_name='tour_badges'`（`server/stats/schema.js:166-177`），
      实际应为 `tour_badge_awards`；看板 tourism 的 `badges` extra 同样数定义表。
    - 年度报告 `tourism.badges` 未过滤 `revoked_at`；`resident` 统计当前居民总数而非年度；
      `education.reads` 按阅读历史行数计数，重复打开会重复累计。
    - 看板 `postal` 直接数整个 `post_messages`（含 visa/immigration/tourism/education 等来源）。
    - 看板 `education` 把 `offline` 当作 rejected，已发布后运营下架会扭曲通过率。

14. **教育阅读历史不去重、手工发布绕过审核轨迹**
    - `GET /entries/:id`、`/articles/:id` 每次都 `view_count+1` 并追加一条
      `edu_read_history`（`server/education/routes.js:85-90,264-266,324-326`），无频率限制；
      任务进度却按去重 `target_id` 统计（`server/education/util.js:145-163`），统计口径不一致。
    - 管理端 `POST /:id/publish` 可从 `pending_review` 或 `offline` 直接发布，只写审计
      `publish_entry/article`，不写 `edu_reviews`（`server/education/admin.js:248-259`）。

15. **档案隐藏只影响档案署自身**
    - `executeRequest` 只写 `arch_hidden_records`（`server/archives/util.js:598-642`），
      档案目录/详情/计数隐藏，但签注署、入境署自己的页面仍能看到同一记录。
    - 隐藏没有解除接口，`UNIQUE(record_type, record_id)` 使隐藏不可逆；
      `arch_deletion_requests.deleted_at` 从未被写入。
    - 管理端列表先按类各取最新 500 条再内存过滤（`server/archives/util.js:344-367`），
      更早记录可能查不到。

16. **申诉评价/合并/隐私擦除边界**
    - 评分 `Math.min(5, Math.max(1, Number(rating) || 0))` 使缺省/非法值静默变成 1 分
      （`server/routes/appeal.js:381-382,538-539`）。
    - 合并（`server/routes/appealAdmin.js:274-294`）不校验来源与目标是否同一用户/业务编号，
      可把他人申诉并入。
    - 隐私擦除只清主表文本，不清 `appeal_records.comment`、投诉回复、决定理由、消息参数
      与审计明细（`server/routes/appeal.js:727-746`）。
    - 管理员 `close` 已决申诉后，用户 15 天复核期内无法再申请复核（复核只接受
      `resolved/rejected`）。
    - 复核 `maintain` 仍无条件新建决定书，原决定未失效，可能同时存在多份 `valid` 决定书。

17. **签注配置与类型维护风险**
    - `GET/PUT /admin/config` 接受任意 `visa.*` 键和任意字符串，无白名单/格式/范围校验；
      编号前缀被改成小写/非法字符会导致验真大写查询失配。
    - 驳回 `reasonCode` 不校验枚举；CSV 只翻译 5 个固定码，其他码原样输出。
    - `PATCH /types/:id` 允许改 `code`，已存在申请/签注仍保存旧 `type_code`，形成悬空引用。
    - 管理员 `mark-used` 未先 sweep，已过期但未扫描的签注仍可被标记 `used`；`used` 签注
      还可再作废。

18. **文旅徽章与通知兜底**
    - 徽章评估检查“已存在发放行”时不过滤 `revoked_at`（`server/tourism/util.js:260-264`），
      被回收的徽章再次达标也不会重发。
    - `tour_notify_outbox` 只写不读（`server/tourism/postal.js:46-51`），邮政模块不可用时
      消息永久停在 `queued`。
    - 文章没有草稿态，新建默认 `published`；`/me` 的徽章查询未过滤已软删除/停用定义。

### 8.3 P3：校验、边界与展示一致性

- **平台**：注册未预检重复用户名/邮箱，唯一约束异常落为 500；刷新令牌并发轮换未检查
  `DELETE` 的 `changes`；`sessions.expires_at` 只写不读；删除有业务数据的用户会因外键
  失败；自定义角色权限白名单问题见 8.1；`services.enabled` 用真值判断，字符串 `"false"`
  仍为真；服务卡排序存在重复（appeal/docs 都是 -2，resident/diplomacy 都是 4）。
- **双语**：`content-i18n.js` 的 `SERVICES` 未覆盖 archives/postal/tourism/stats/education；
  显式 `X-Nailong-Locale` 非繁体时一律当简体（传 `en` 也返回中文）；`*_tw` snake 键会被
  丢弃，未解析的 JSON 字符串内繁体不会被替换。
- **签注**：补件重新送审不更新 `submitted_at`、不发消息；用户撤销未先 sweep；`review_stage`
  基本是展示字段；验真只返回 `status/valid`，`used` 与 `voided` 都是 `valid:false`。
- **入境**：提交限流在校验前消耗，失败提交也计入 5 次/天；`im_settings` 表无调用方；
  公开验真不写独立日志，只消耗限流表。
- **文书**：上传失败可能留下孤儿文件；`verify_token` 只生成不读取；上传 multer 硬上限
  20 MB 与可配置 `docs.upload_max_mb` 不一致；`DIPLOMATIC` 类型“仅限使团渠道”只写在
  guide 文案；可选关联类型不检查 `certifiable`；`DOC_CERT_APPEALABLE` 使用不存在的
  `voided` 状态，`revoked` 证书不可申诉。
- **外交**：验真按可配置前缀分流，改前缀后历史编号按编号验真失效（token 不受影响）；
  `GET /relations` 未 sweep；协议惰性生效不发通知；`purpose='visa_channel'` 不参与资格判断。
- **居民**：隐私擦除删除所有申请材料但保留有效卡；停用类型后草稿仍可提交；验真限流为
  进程内 Map，反向代理后可能共享桶；`res_blacklist` 无 level/expires_at；申诉可诉集合
  含卡/变更，但 `reopen` 只处理申请。
- **礼宾**：`partySize` 与 `companions` 可只传其一导致不一致；`can_publish/can_invite`
  只存不用；接待方补件截止日不生效；邀请函 `accept` 只改 `response` 不改状态；公开验真
  限流取 `x-forwarded-for` 首段，直连时可伪造。
- **申诉**：`withdraw` 不允许补件中撤回；`escalate-appeal` 建草稿绕过黑名单与字段校验；
  黑名单 `user_id UNIQUE + INSERT OR IGNORE` 使改 scope 需先删除；配置只校验前缀不校验值。
- **档案**：记录类型/指南无管理接口；保留期只是展示文案；导出超限返回 429 与其他接口风格
  不一致；`maskContact` 按原字符串取前 3 位而非数字。
- **邮政**：订阅状态未变也会写审计并发确认消息；每日额度按 UTC 日期；下架只通知寄件人；
  收藏报错文案写“Only received”但 `sent` 也允许。
- **统计**：`GET /reports/:id` 对他人报告返回 403，泄露记录存在性；`safeCount` 把列名
  错误吞成 0；导出留痕的 `row_count` 实际是指标数；`stat_admin` 等角色未授予
  `portal:access`。
- **教育**：搜索不查 `_tw` 字段；`patchContent` 传 `null` 可清空标题/正文；任务
  `targetCount` 传空值可能写入 `NOT NULL` 列导致 500；`edu_tasks.code` 软删除后无法复用；
  自动化审核无审核意见、不给提交者发消息。
- **角色授权一致性**：`docs_certifier`、`imm_officer`、`res_reviewer`、`dip_admin`、
  `protocol_admin`、`arch_admin`、`tour_admin`、`stat_admin`、`edu_admin` 等非 `portal:access`
  角色当前不影响接口（未见强制校验），但与 `user`/`post_admin` 的授权习惯不一致。

### 8.4 确认属于设计或需业务确认的点

- 档案署“隐藏”只隐藏档案视图，不删除/不隐藏原署数据；如果业务期望“全局删除”，需要
  扩大到各署页面。
- 申诉回写只重开“被驳回/关闭”的申请；已生效签注/卡/证书只写审计，不回滚。这与“决定书
  不是万能回滚器”的定位一致，但需要业务确认是否满足所有申诉场景。
- 自动审批所有署都只使用 `system` actor，不记录具体经办人；如需责任到人，应增加审计字段。
- 部分署（旅游/统计/教育）没有邮政不可用时的本地补偿队列（旅游有 outbox 但无消费者），
  消息可能丢失。
- 三个演示服务卡（wiki/workshop/weather）没有后端实现，属于占位入口。

---

## 9. 维护约定

### 9.1 新增一个业务署的最小清单

1. 新建 `server/<office>/schema.js`：建表、注册权限、内置角色、`services` 种子（务必写
   `entry_mode`）、`ensureTwColumns`、种子内容。
2. 新建 `routes.js`（用户端）、`admin.js`（管理端），必要时 `inter.js`（服务间）。
3. 在 `server/index.js` 按 `inter → admin → 用户路由` 顺序挂载。
4. 在 `server/db.js` 或本署 schema 注册权限/角色；`user` 角色如需默认访问，补
   `required_permission`。
5. 在 `server/linkage.js` 注册目标解析、可申诉状态、`reopen`、审计/通知（如需联动）。
6. 在 `server/autoApprove.js` 的 `AUTO_APPROVE_SERVICES` 登记权限，并在管理路由
   `registerAutoApprover`。
7. 在 `src/nav/navConfig.js` 增加办公室导航与管理台入口；在 `src/i18n/locales/zh-CN.json`
   与 `zh-TW.json` 同步词条（`npm run check:i18n` 会强制）。
8. 在 `server/routes/messages.js` 增加信箱来源（如果需要全站收件箱聚合）。
9. 编写 `server/scripts/smoke-<office>.mjs`，覆盖主流程、权限隔离、状态机、双语与审计。

### 9.2 新增显示字段

- 建表列 + `_tw` 兄弟列；`ensureTwColumns` 加列；序列化器输出 `fieldTw`；管理表单同时
  绑定简体与繁体；`localeMiddleware` 自动处理 `_tw → *Tw`。
- 若字段进入 CSV/打印，使用 `pickText(cn,tw,reqLocale)`。

### 9.3 新增站内信类型

- 只存 `type+params` 的署：前端补 `visa.msg.*` / `docMsg.*` / `appeal.msg.*` /
  `arch.msg.*` 的简繁词条，并把类型加入 `scripts/check-i18n.mjs` 的动态枚举。
- 服务端模板的署：补 `*_message_templates` 种子（简繁标题/正文）与变量说明；模板缺失时
  检查兜底文案是否符合预期。
- 经邮政契约发送的消息：确认 `post_preferences` 来源可关闭，以及全站收件箱是否要排除
  镜像。

### 9.4 新增自动审批

- 在 `AUTO_APPROVE_SERVICES` 登记服务与管理权限。
- 在管理路由注册 processor；**必须复用人工审批的核心函数**，不要复制状态迁移逻辑。
- 确保审计 `detail.auto=true`、消息、下游凭证与人工路径一致。
- 在 `smoke-auto-approve.mjs` 增加该署的待审件插桩与副作用断言。

### 9.5 验收前检查

```bash
npm run check:i18n
npm run check:ui
npm run check:tokens
npm run lint
```

跨署改动至少运行：

```bash
node server/scripts/smoke-linkage.mjs <baseUrl>
node server/scripts/smoke-offices-linkage.mjs
node server/scripts/smoke-messages.mjs
node server/scripts/smoke-auto-approve.mjs
```

---

*文档结束。所有路径、状态与端点均以 2026-11-01 的 `logical` 分支代码为准。*