# AGENTS.md

## Hard rule (non-negotiable): i18n must always ship Simplified AND Traditional Chinese

This portal uses **react-i18next** (docs: https://react.i18next.com/). The i18n layer
(`src/i18n/index.js`) enforces the rule — do not weaken it:

- `REQUIRED_LOCALES = ['zh-CN', 'zh-TW']` is the only language whitelist. `zh-CN` and `zh-TW`
  resource files under `src/i18n/locales/` must always both exist and stay key-identical;
  `assertRequiredLocales()` throws at startup if they drift. Adding a language means adding
  the new locale AND keeping both Chinese files complete.
- Never hardcode user-visible strings in JSX — every string goes through `t(...)`.
- Server error codes (`src/api/client.js` `ApiError.code`) are translated via the `api.*`
  keys; map unknown codes to a generic fallback, never show raw keys.
- `npm run check:i18n` scans every `t('...')` / `` t(`prefix.${...}`) `` call against the two
  locale files and fails on missing keys, dead dynamic prefixes and uncovered enum values.
  `npm run build` runs it first. Dynamic keys built from a runtime variable must either carry
  a `defaultValue` or be added to the enum whitelist in `scripts/check-i18n.mjs`; admin-office
  keys live under `<namespace>.admin.*` (e.g. `imm.admin.review.*`), never a bare page prefix.
- The language switcher must offer exactly these two locales.

Server-stored content (catalogs, notices, message templates, event fields) follows the same
rule through **bilingual columns**, not i18n keys:

- Every display column has a nullable `_tw` sibling (`name_tw`, `title_tw`, …). Migrations are
  additive (`server/migrate.js` `ensureColumn` / `ensureTwColumns`), so old databases gain the
  columns on boot.
- `src/api/client.js` sends `X-Nailong-Locale` with every request; `server/locale.js`
  (`localeMiddleware`) rewrites JSON so `name` is the requested language, `nameTw` is the
  Traditional value and (for zh-TW) `nameCn` is the Simplified source. Nested JSON keys such as
  `labelTw` / `placeholderTw` / `titleTw` are localized too.
- Admin forms edit both languages: bind the Simplified input to `fieldCn ?? field`, the
  Traditional input to `fieldTw`, and submit `field` + `fieldTw`. An empty Traditional value
  falls back to Simplified at read time.
- Built-in seed content is translated in `server/content-i18n.js` (backfill by code or title,
  never overwriting a non-empty admin value). Admin-created content stays single-language until
  an admin fills the Traditional field; free-text business content (nicknames, comments,
  reasons) is never machine-translated.
- When adding a display column: add the `_tw` column to `CREATE TABLE`, add it to the office's
  `ensureTwColumns` call, expose `fieldTw` from the serializer (or rely on the raw `_tw`
  column), and add the paired input to the admin form.
- Acceptance: `node server/scripts/smoke-i18n.mjs` (self-contained temporary DB; checks columns,
  seed backfill and locale-aware responses).

## What this workspace is

奶龙统一门户 (Nailong unified portal): a Vite + React 19 SPA frontend plus a Node/Express API
server with SQLite (better-sqlite3). Plain JavaScript (JSX + ESM) — no TypeScript, no test
runner. Frontend consumes the published `animal-island-ui` npm package.

## Commands

- `npm run dev` — Vite dev server with HMR (proxies `/api` to :3001)
- `npm run dev:server` — API server on http://localhost:3001 with watch
- `npm run dev:all` — both at once (concurrently)
- `npm run build` — production build (runs `check:i18n` and `check:ui` first); `npm run start` —
  API server (also serves `dist/` if present)
- `npm run check:i18n` — verify every referenced i18n key has zh-CN + zh-TW entries
- `npm run check:ui` — enforce the frontend interaction conventions below
  (no Notification, every table has `table-fit`, Switch uses `checked`, no invalid Table props)
- `npm run lint` — **oxlint** (config in `.oxlintrc.json`; not ESLint)
- No test, typecheck, or format scripts exist here.

## Architecture

- `server/` — Express 5 API. `server/db.js` holds the SQLite schema (better-sqlite3, WAL) and
  seeds permissions/roles/demo services; DB file lives in `server/data/` (gitignored).
- Auth: JWT access token (30 min, in-memory on the client) + refresh token (7 days) in an
  httpOnly cookie scoped to `/api/auth`, with a `sessions` table so refresh tokens rotate and
  replay is rejected. Password hashing via bcryptjs.
- First-run setup: a fresh database has **no users**. `GET /api/setup/status` reports
  `required: true`, the SPA gate redirects every route to `/setup`, and
  `POST /api/setup/admin` creates the first admin (username + display name + email +
  password) and signs them in. Completion is latched in the `app_meta` table
  (`setup.completed_at`): afterwards that POST returns 409 `SETUP_COMPLETE` and `/setup`
  redirects to login. Existing databases with an admin are latched on boot, so the wizard can
  never reopen. Setting `ADMIN_PASSWORD` only on a first boot keeps the non-interactive
  `admin` seeding path and skips the wizard.
- RBAC: `permissions` / `roles` / `role_permissions` / `user_roles` tables. Permissions are
  code-defined in `server/db.js` (`PERMISSIONS`); middleware `requirePermission('x:y')` in
  `server/auth.js`. Built-in roles: `admin` (all, locked), `user` (portal:access + visa:apply),
  `visa_reviewer`, `visa_admin`. System-role permission lists are backfilled on every boot, so
  new permissions reach existing databases automatically.
- Services registry (`services` table) is the foundation for future service integration:
  portal users see enabled services their permissions allow (`GET /api/services`); admins
  manage the registry (`/api/services/admin`). `POST /api/auth/introspect` lets other services
  verify portal access tokens. `services.entry_mode` (`external` | `internal` |
  `internal_sso`) decides how the portal opens a card: new tab, SPA navigate, or SSO
  identity-confirm dialog first.
- `src/` — React SPA: `src/api/client.js` (fetch wrapper, auto refresh on 401), `src/auth/`
  (context + route guards), `src/i18n/` (see hard rule above), pages in `src/pages/`.

## 签注申请署 service (`/visa`)

The visa service (奶龍國簽註申請署) is an in-SPA service, seeded as a row in `services`
(`entry_mode: 'internal_sso'`): entering it shows the portal's SSO identity-confirm dialog
first (once per browser session, `sessionStorage 'nailong.visa.sso'`; `VisaShell` enforces it
for direct URLs too). Layers:

- Domain: `server/visa.js` — unpredictable numbering (`NLA-…`/`NLT-…`), audit log, 站内信
  (messages store only `type` + JSON params; the SPA renders them via i18n keys
  `visa.msg.*`), lazy sweeps (supplement-deadline auto-close, permit expiry + 72 h reminder),
  in-memory rate limiting, masked verify results.
- Routes: `server/routes/visa.js` (user, `visa:apply`; `/verify` is public + rate limited),
`visaAdmin.js` (`visa:review` workbench/issue/permit ops; `visa:manage` types/notices/
config/blacklist/stats/audit/CSV), `visaInter.js` (皇家口岸入境署 service-to-service API,
`x-nailong-service-token` vs `VISA_INTER_SERVICE_TOKEN`; check/mark-used/types).
- Private uploads via multer land in `server/data/uploads/visa/<appId>/` (gitignored);
  downloads only through the authenticated `/api/visa/materials/:id/file`.
- State machines — application: `draft → pending_review → (approved | rejected |
  supplement_required → pending_review | closed on deadline)` plus `withdrawn`; permit:
  `valid → used (port-authority writeback) | voided | expired`.
- Pages in `src/pages/visa/` (+ admin workbench/manage/stats/audit), shared helpers in
  `src/pages/visa/shared.jsx`. Acceptance: `node server/scripts/smoke-visa.mjs [baseUrl]`
  (29 checks over the whole flow). The e-visa "PDF" is print CSS + `window.print()`.

## Critical: `docs/` describes the upstream library, not this repo

The `docs/` tree (`adr/`, `design-system/`, `development/`) was authored for the
[animal-island-ui library repository](https://github.com/guokaigdg/animal-island-ui). The
structure and scripts it documents — `src/components/<Name>/`, `test/`, `demo/`, `scripts/`,
Vitest, ESLint, path aliases `@/*`, `npm run ci` / `test:a11y` / `check:docs` — **do not exist
in this workspace**. Don't try to run them or assume that layout. Treat `docs/` as reference
material for the library's design contract, not as a description of this codebase. Most of it
is written in Chinese.

## Building UI here

Read `.agents/skills/animal-island-ui-style/SKILL.md` (and its `references/`) before writing
any page or component — it carries the component catalog and the library's hard rules. The
short version:

- Import the stylesheet exactly once at the app entry: `import 'animal-island-ui/style'`.
- Never invent props — check the catalog references in the skill, or the package's
  TypeScript declarations in `node_modules`.
- Import only from the package root and `animal-island-ui/style` — no deep imports.
- Style custom elements with `var(--animal-*)` tokens; never hard-code colors or override a
  component's colors/radii/shadows via `className`/`style`.
- Palette bans: pure black text, cold gray backgrounds, cold blue focus rings. Focus is warm
  yellow (`#ffcc00` on inputs) or mint primary. Buttons and inputs are 50px pills; nothing
  interactive below 12px radius.
- Icons come from `naive-icons` — never emoji, Unicode symbols, or hand-rolled SVG.
- Prefer library components over raw HTML controls (`<button>`, `<input>`, `<select>`, …).

Exact token values and pixel-level component specs live in `docs/design-system/`
(`design-tokens.md`, `design-rules.md`, `components/*.md`). `docs/adr/` records library-wide
constraints (e.g. dayjs is the only sanctioned date layer for the date/time components).

### 前端交互约定（`check:ui` 强制）

- **不要使用 `animal-island-ui` 的 `Notification`**：它在 React 19 下从 `react-dom` 主入口取
  `createRoot` 会抛异常，事件处理器会停在提示这一行，后续关弹窗/刷新都不执行。统一用
  `src/components/toast.js` 的 `toastSuccess / toastError / toastInfo / toastWarning /
  toastApiError`；任何提示辅助函数都委托给它。
- 每个 `<Table>` 必须带 `className="table-fit"`。表格靠自动列宽 + 表头/长文本换行压缩进
  容器，**不要加横向滚动**；不要给 Table 传 `size`，不要给列写 `ellipsis`。操作列用
  `.table-actions`（已自动换行）。
- **弹窗只能显式关闭**：每个 `<Modal>` / `<Drawer>` 都必须写 `maskClosable={false}`，点遮罩
  不再关闭（库默认是 `true`，误点一下就会丢掉整张表单）。关闭入口是「取消/关闭」按钮、抽屉
  右上角的 ×，或 Esc。`footer={null}` 的弹窗要自带取消/关闭按钮（用 `.form-actions` 排版）。
  `npm run check:ui` 会检查是否显式写了 `maskClosable={false}`。
- 异步弹窗必须有 `busy`：提交/确认按钮 `loading={busy} disabled={busy}`，
  `onClose` 在 busy 时直接返回。成功后先关窗/重置表单，再 toast，再 `await load()`；
  失败保持弹窗并 toast 错误。取消/重开时清空表单。
- `Switch` 用 `checked`，不要用 `value`（库不支持，会让显示与服务器状态相反）。
- `<Select>` 的选项面板由 `src/components/selectFloat.js`（CSS 在 `selectFloat.css`，在
  `main.jsx` 里安装一次）全局接管：库默认把面板画在触发器**右侧**且只按视口判断，弹窗、
  抽屉、卡片里会被 `overflow` 裁掉。接管后统一在触发器下方展开、空间不足时上翻，宽高收进
  最近的裁剪容器并自带滚动；面板打开时 Esc 只收起面板、不会连带关闭外层弹窗。
  **不要在页面里为下拉框另写定位覆盖**；新增页面无需改动即可生效。
- 必填字段在提交前校验（用 `common.required`），空值不可提交；删除/作废/吊销等不可逆操作
  要有确认、busy 和成功提示，删除成功文案用 `common.deleted`。
- `npm run check:ui` 扫描以上约定并已接入 `npm run build`。

## Cross-service linkage

`server/linkage.js` is the in-process cross-office bus. All offices share one SQLite DB, so
internal checks read/write each other's tables directly instead of doing HTTP to self:
visa permit ↔ immigration check/writeback, docs business-number verification across the
five offices (plus appeal decisions), appeal validate/snapshot/writeback/inspection
sampling, protocol identity/courtesy checks, resident benefit channels, and diplomatic
visa eligibility + permit void-on-identity-loss. The per-office `/api/*/inter` routes
remain for independently deployed callers and still require their service tokens.

User-facing linkage is **identity-bound**: `/api/linkage` (any authenticated user)
lists only the caller's own records (`listOwnedRecords`, filtered by `users.id`), so the
five entry points (docs apply, immigration declaration, protocol courtesy/registration,
appeal apply) can offer "fetch my record" instead of copy-pasting a number. Before the
first fetch per service+source in a browser tab, `src/components/linkage/LinkageConsentModal.jsx`
asks for session-scoped consent and shows the identity basis (resident card when one
exists, otherwise the portal account). Every fetch/verify writes `linkage_access_logs`.
Ownership is strict: `verifyBusinessRecord` treats ownerless records (protocol events,
diplomatic agreements) and other users' records as `owned:false`, hides title/detail for
non-owners, and docs rejects any typed business number that is not found+owned even for
optional `biz_source` types (`DOC_BIZ_NOT_OWNED`). New UI must use
`src/components/linkage/LinkageField.jsx` rather than a bare number input.
Acceptance: `node server/scripts/smoke-linkage.mjs [baseUrl]` and
`node server/scripts/smoke-linkage-identity.mjs` (self-contained temp DB).

## Cross-service auto-approval

`server/autoApprove.js` owns the `service_auto_approve` table (one row per office:
`off` | `immediate` | `delayed`, delay 1–10080 minutes) and one in-process scheduler
that ticks every 5 seconds (`AUTO_APPROVE_INTERVAL_MS` overrides the interval for
tests). Each office's admin router registers a processor at import time; the
processor calls the **same approval core** as the manual endpoint, so status
transitions, review records, audit, messages, downstream credentials (visa review,
immigration pass code, resident card, diplomatic courtesy, protocol pass, document
certificate) and cross-office checks never drift. Settings live at
`GET/PATCH /api/auto-approve/:service`, guarded by that office's manage permission
(`visa:manage`, `imm:admin`, `dip:admin`, `res:manage`, `evt:manage`, `docs:manage`,
`appeal:manage`); every office admin settings page embeds
`src/components/AutoApproveSettings.jsx` (immigration gained
`/admin/immigration/settings`). Automatic decisions use the `system` actor and
`detail.auto = true`. Visa issuance remains manual, and appeal auto-approval only
performs acceptance (申诉/投诉受理), never a decision. Acceptance:
`node server/scripts/smoke-auto-approve.mjs` (self-contained temporary DB).

## App shell and the admin sidebar

`src/components/AppLayout.jsx` is the only authenticated shell. It renders two
different layouts:

- **Admin** — `src/components/Sidebar.jsx` (260 px, sticky, own scroll) with
  门户首页 / 12 offices / 个人资料 / 系统管理, plus a slim header holding the
  breadcrumb, the inbox bell, language, avatar and logout. Below 1025 px the
  sidebar moves into a left `Drawer` opened by a menu button (the drawer is
  `maskClosable={false}` like every other dialog).
- **Everyone else** — no sidebar at all: the header keeps the brand and the
  account actions, and services are entered from the portal cards, with each
  office's own horizontal tab bar (署内导航) once inside.

"Admin" means `hasRole('admin')` or holding any management permission; the rule
lives in `isPortalAdmin()` in `src/nav/navConfig.js`. That file is the single
source for the sidebar/breadcrumb: `{ key, base, labelKey, icon, permission,
admin: { base, entries } }` per office, where `admin.entries` lists candidate
管理台 landings and the first permitted one wins. Sidebar depth stops at
「署 → 管理台」 — do not duplicate the in-office tab rows there.

`navConfig.js` must stay dependency-free: `scripts/check-i18n.mjs` imports it and
verifies every `NAV_LABEL_KEYS` entry exists in both locales (those keys reach
`t()` through a variable, so the normal source scan cannot see them). Adding an
office means adding it to `OFFICE_NAV`, its `nav.*` label to both locale files,
and its admin entries.

## Cross-service inbox (`/api/messages`)

`server/routes/messages.js` aggregates every office mailbox for the signed-in
user: `visa_messages`, `doc_messages`, `appeal_messages`, `arch_messages`,
`im_messages`, `dip_messages`, `res_messages`, `pro_messages` and
`post_messages`. It is deliberately **read-only over existing tables** — no new
table, no dual writes — and marking read writes back to the originating table,
so the per-office inbox pages and the global one never disagree.

- `GET /api/messages?status=all|unread&office=&limit=50` →
  `{ items, unread: { total, byOffice }, offices }`; items are
  `{ office, source?, id, type, params, title, body, read, createdAt }`, merged
  by `createdAt` descending.
- `GET /api/messages/unread` → `{ total, byOffice }` (header badge polling).
- `POST /api/messages/read` `{ office, id }`, `POST /api/messages/read-all`
  `{ office? }`.
- Inclusion is gated by each office's portal permission (`visa:apply`,
  `imm:portal`, …), so the aggregate never shows a mailbox the caller could not
  open.
- Two normalizations to keep in mind: `arch_messages` has no `archived` column,
  and archives also mirrors notifications into `post_messages` (types prefixed
  `archives_`) — the postal sweep excludes `source = 'archives'` so nothing is
  counted twice. `post_messages` also carries tourism/education/stats notices,
  which is why those three offices need no mailbox of their own.
- Titles: immigration/dip/resident/protocol return server-rendered `title`/`body`
  (plus `*Tw` so `localeMiddleware` localizes them); visa/docs/appeal/archives/postal
  return `type` + `params` and `src/components/InboxDrawer.jsx` renders them with
  the office's existing `visa.msg.*` / `docMsg.*` / `appeal.msg.*` / `arch.msg.*` /
  `post.msg.*` keys. New message types on those five offices need both locale
  entries as usual.
- Acceptance: `node server/scripts/smoke-messages.mjs` (self-contained temp DB;
  covers merge ordering, archived exclusion, archive-mirror dedupe, locale
  switching and read write-back).

## Current state

As of 2026-10-26 the portal and seven in-SPA offices are functional end to end: auth,
RBAC, service cards, profile, admin screens, 签注 / 入境 / 外交 / 居民 / 礼宾活动 / 文书认证 /
申诉监察. Cross-service linkage (`server/linkage.js`) and per-office auto-approval are
live. The UI is built entirely with animal-island-ui components + `--animal-*` tokens.
Acceptance scripts cover every office plus linkage, setup, auto-approval and bilingual content;
run them against a fresh `NAILONG_DATA_DIR` when a script uses fixed usernames. Server-stored
catalogs/notices/templates/event text are bilingual (`*_tw` columns localized at the API
boundary); user-authored free text is intentionally left in its original language.
