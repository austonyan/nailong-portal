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
  columns on boot. No column drops, no type changes, no rollback scripts — back up the data
  directory before upgrading.
- `src/api/client.js` sends `X-Nailong-Locale` with every request; `server/locale.js`
  (`localeMiddleware`) rewrites JSON so `name` is the requested language, `nameTw` is the
  Traditional value and (for zh-TW) `nameCn` is the Simplified source. Nested JSON keys such
  as `labelTw` / `placeholderTw` / `titleTw` are localized too.
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

## What this workspace is

奶龙统一门户 (Nailong unified portal): a Vite + React 19 SPA frontend plus a Node/Express API
server with SQLite (better-sqlite3). Plain JavaScript (JSX + ESM) — no TypeScript, no test
runner. Frontend consumes the published `animal-island-ui` npm package (v2.3.0). The portal
hosts **12 business offices (署)** as in-SPA services: visa (签注), immigration (入境), docs
(文书), dip (外交), resident (居民), protocol (礼宾), appeal (申诉), archives (档案), postal
(邮政), tourism (文旅), stats (统计), education (教育).

## Read `docs/work.md` before touching an office

`docs/work.md` (2026-11-01 full-repo audit on this branch) is the single source for how the
system actually works: per-office endpoints, state machines, permission codes, number prefixes,
message types, cross-office chains, the auto-approval matrix, and exact smoke-run commands.
Its §8 lists the defects the audit found. **§8.1 (P1) and most of §8.2 (P2) have since been
fixed** in the same branch, with smoke assertions added for each; what is still open is P3,
§8.4 (intentional-by-design behavior), and the §8.2 sub-items the fix round did not cover
(protocol `required_fields` enforcement, `dip_relation_types.validity_days` relation expiry,
archives hiding staying office-local, postal `post_settings` admin API, education article
drafts). Don't rediscover the fixed ones, and don't "fix" an open one as a drive-by unless the
user asks. §9.1 is the checklist for adding a new office — follow it in order
(schema/routes/mount/linkage/auto-approve/nav/locales/smoke).

## Commands

- `npm run dev` — Vite dev server with HMR (proxies `/api` to :3001)
- `npm run dev:server` — API server on http://localhost:3001 with watch
- `npm run dev:all` — both at once (concurrently)
- `npm run build` — runs `check:i18n` → `check:ui` → `check:tokens` → `check:copy` → `vite build`
  (any check failure aborts the build); `npm run start` — API server (also serves `dist/` if present)
- `npm run check:i18n` — every referenced i18n key has zh-CN + zh-TW entries
- `npm run check:copy` — locale 文案排版规则(ui-spec 01-foundations §2.3):含中文的值里,邻中文
  (或插值)的 `,` `:` `;` `?` `!` 与 `(…)` 必须用全角;中文与英文/数字/插值之间不手动加空格;
  省略号用 `…`;敬语统一「你」,出现「您」即违规。`node scripts/check-copy.mjs --fix` 幂等归一
  (插值与 URL 自动保护)。
- `npm run check:ui` — the frontend interaction conventions below
- `npm run check:tokens` — `src/**/*.css` may only reference `--animal-*` names that exist in
  the installed library CSS (unknown token = build error); raw hex/rgb are warnings, exempt
  inside `@media print` and QR/ticket/certificate white-paper selectors
- `npm run lint` — **oxlint** (config in `.oxlintrc.json`; not ESLint)
- No test, typecheck, or format scripts exist. Verification = static checks + smoke scripts.

## Architecture

- `server/` — Express 5 API. `server/db.js` holds the core SQLite schema (WAL, foreign keys
  on) and seeds permissions/roles/demo services; DB file lives in `NAILONG_DATA_DIR`
  (default `server/data/`, gitignored — contains `nailong.db*`, uploads and `.jwt-secret`).
- Newer offices live in `server/<office>/` (`schema.js` self-registers its tables, permission
  codes, roles and service-card seed; plus `routes.js` / `admin.js` / `util.js`, some
  `inter.js`); visa/docs/appeal use the older `server/<name>.js` + `server/routes/<name>*.js`
  split. Follow the pattern of the office you are editing.
- `server/index.js` mounts each office **`inter` → `admin` → user routes** — the order matters,
  the specific prefixes must be mounted before the user router or office auth middleware
  would swallow them.
- Errors: throw `ApiError(status, code, message)` from `server/http.js`; the error handler
  serializes `{code, message}` and the SPA maps codes to `api.*` i18n keys.
- Auth: JWT access token (30 min, in-memory on the client) + refresh token (7 days) in an
  httpOnly cookie scoped to `/api/auth`, with a `sessions` table so refresh tokens rotate and
  replay is rejected. Password hashing via bcryptjs.
- First-run setup: a fresh database has **no users**. `GET /api/setup/status` reports
  `required: true`, the SPA redirects every route to `/setup`, and `POST /api/setup/admin`
  creates the first admin and signs them in. Completion is latched in `app_meta`
  (`setup.completed_at`): afterwards that POST returns 409 `SETUP_COMPLETE`. Existing
  databases with an admin are latched on boot. Setting `ADMIN_PASSWORD` on a first boot
  keeps the non-interactive `admin` seeding path and skips the wizard.
- RBAC: 43 permission codes across portal + 12 offices (seeded partly in `server/db.js`,
  partly per office schema); middleware `requirePermission('x:y')` in `server/auth.js`.
  System-role permission lists are backfilled on every boot (add-only).
- Services registry (`services` table): `GET /api/services` filters by `enabled` +
  `required_permission`; `services.entry_mode` (`external` | `internal` | `internal_sso`)
  decides how the portal opens a card. `POST /api/auth/introspect` lets other services verify
  access tokens.
- Env vars (full table in README.md): `PORT`, `JWT_SECRET`, `ADMIN_PASSWORD`,
  `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `AUTO_APPROVE_INTERVAL_MS`, `NAILONG_DATA_DIR`,
  and per-office `VISA_/DIP_/RESIDENT_/PROTOCOL_INTER_SERVICE_TOKEN` (inter routes return
  `SERVICE_DISABLED` when unset).

## Office (署) service pattern

Shared shape across the 12 offices (per-office detail lives in `docs/work.md` §3):

- **SSO entry** — office cards are `internal_sso`: entering shows the portal identity-confirm
  dialog once per browser tab (`sessionStorage 'nailong.<office>.sso'`), and the office's
  `*Shell.jsx` re-enforces it for direct URLs. When seeding a service row **always write
  `entry_mode`** — the column defaults to `external`, and a missed value silently opens the
  card as an external service (immigration shipped this way; `server/db.js` now corrects it on
  boot, but new offices must get it right in the seed).
- **Pages** in `src/pages/<office>/`, per-office helpers in `shared.jsx`; the portal shell and
  immigration use the shared `src/lib/date.js` dayjs formatters (invalid dates render `-`).
- **站内信 — two schemes coexist; new message types must follow their office's scheme.**
  visa/docs/appeal/archives store only `type` + JSON params, rendered client-side via
  `visa.msg.*` / `docMsg.*` / `appeal.msg.*` / `arch.msg.*` (add both locales AND the enum in
  `scripts/check-i18n.mjs`). immigration/dip/resident/protocol/postal render server-side from
  editable bilingual templates in `*_message_templates`.
- **Postal contract** — tourism/stats/education/archives-mirror notifications go through
  `sendPostalMessage({userId, source, type, params})` (`server/postal/notify.js`), which
  honors `post_preferences` and writes `post_messages`.
- **Lazy sweeps** — deadline closes, expiry scans and status advances run inline on relevant
  reads; there are no cron jobs. The auto-approve scheduler is the only resident timer.
- **Numbering** — unpredictable prefixed numbers (`NLA-…`, `NLT-…`, `IM…`, `NRC-…`, …) with
  conflict retry; public `verify` endpoints are rate-limited (in-process or DB table;
  in-process counters reset on restart) and mask holder data.
- **Private uploads** via multer land in `server/data/uploads/<office>/<id>/` (gitignored);
  downloads only through the office's authenticated file route.
- Visa specifics worth knowing: application states
  `draft → pending_review → approved | rejected | supplement_required | withdrawn`,
  `approved → issued`, supplement deadline → `closed`; permit
  `valid → used | voided | expired`. The e-visa "PDF" is print CSS + `window.print()`, not a
  generated file.

## docs/ mixes upstream and project-owned files — know which is which

- **Project-owned, authoritative:** `docs/ui-spec/` (this repo's UI spec: six layers, DTCG
  `tokens.json`, contrast measurements, deviation register), `docs/work.md`, `docs/newcontent.md`.
- **Upstream-derived, reference only:** `docs/design-system/`, `docs/adr/`, `docs/development/`
  were authored for the [animal-island-ui library repo](https://github.com/guokaigdg/animal-island-ui).
  Their token values lag the installed 2.3.0 runtime; the structures and scripts they document —
  `src/components/<Name>/`, `test/`, `demo/`, Vitest, ESLint, alias `@/*`, `npm run ci` /
  `test:a11y` / `check:docs` — **do not exist here**. Don't try to run them.
- Conflict-resolution order for UI values: runtime
  `node_modules/animal-island-ui/dist/index.css` + `dist/types` → `docs/ui-spec/` →
  `docs/design-system/`. **Never copy a hex out of design-system docs.**

## Building UI here

Read `.agents/skills/animal-island-ui-style/SKILL.md` (and its `references/`) before writing
any page or component — it carries the component catalog and the library's hard rules. The
short version:

- Import the stylesheet exactly once at the app entry: `import 'animal-island-ui/style'`.
- Never invent props — check the catalog references in the skill, or the package's
  TypeScript declarations in `node_modules/animal-island-ui/dist/types`.
- Import only from the package root and `animal-island-ui/style` — no deep imports.
- Style custom elements with `var(--animal-*)` tokens; never hard-code colors or override a
  component's colors/radii/shadows via `className`/`style`. Layout constants may use `--nl-*`.
- Palette bans: pure black text, cold gray backgrounds, cold blue focus rings. Focus is warm
  yellow (`#ffcc00` on inputs) or mint. Buttons and inputs are 50px pills; nothing interactive
  below 12px radius.
- Icons come from `naive-icons` — never emoji, Unicode symbols, or hand-rolled SVG.
- Prefer library components over raw HTML controls (`<button>`, `<input>`, `<select>`, …).
- No dark mode: the library has no dark token set; don't attempt one.

### 前端交互约定（`check:ui` 强制）

- **不要使用 `animal-island-ui` 的 `Notification`**：它在 React 19 下从 `react-dom` 主入口取
  `createRoot` 会抛异常，事件处理器会停在提示这一行，后续关弹窗/刷新都不执行。统一用
  `src/components/toast.js` 的 `toastSuccess / toastError / toastInfo / toastWarning /
  toastApiError`；任何提示辅助函数都委托给它。
- 每个 `<Table>` 必须带 `className="table-fit"`。表格靠自动列宽 + 表头/长文本换行压缩进
  容器，**不要加横向滚动**；不要给 Table 传 `size`，不要给列写 `ellipsis`。操作列用
  `.table-actions`（≥901px 不换行，≤900px 才换行）。
- **弹窗只能显式关闭**：每个 `<Modal>` / `<Drawer>` 都必须写 `maskClosable={false}`，点遮罩
  不再关闭（库默认是 `true`，误点一下就会丢掉整张表单）。关闭入口是「取消/关闭」按钮、抽屉
  右上角的 ×，或 Esc。`footer={null}` 的弹窗要自带取消/关闭按钮（用 `.form-actions` 排版）。
- 异步弹窗必须有 `busy`：提交/确认按钮 `loading={busy} disabled={busy}`，
  `onClose` 在 busy 时直接返回。成功后先关窗/重置表单，再 toast，再 `await load()`；
  失败保持弹窗并 toast 错误。取消/重开时清空表单。
- `Switch` 用 `checked`，不要用 `value`（库不支持，会让显示与服务器状态相反）。
- `<Tabs>` 传了 `activeKey` 就必须同时传 `onChange`：受控状态下库内部 state 不再生效，
  漏了 `onChange` 页签会一直停在初始页（表现为「点不动」）。只想定初始页签就用
  `defaultActiveKey`。
- `<Select>` 的选项面板由 `src/components/selectFloat.js`（CSS 在 `selectFloat.css`，在
  `main.jsx` 里安装一次）全局接管：库默认把面板画在触发器**右侧**且只按视口判断，弹窗、
  抽屉、卡片里会被 `overflow` 裁掉。接管后统一在触发器下方展开、空间不足时上翻，宽高收进
  最近的裁剪容器并自带滚动；面板打开时 Esc 只收起面板、不会连带关闭外层弹窗。
  **不要在页面里为下拉框另写定位覆盖**；新增页面无需改动即可生效。
- 必填字段在提交前校验（用 `common.required`），空值不可提交；删除/作废/吊销等不可逆操作
  要有确认、busy 和成功提示，删除成功文案用 `common.deleted`。
- `npm run check:ui` 扫描以上约定并已接入 `npm run build`。

### 设计检测（改完前端必跑，强规则）

每次改完前端文件（`src/` 下的 `.jsx` / `.js` / `.css`，以及改到的 `index.html`），在继续下一步
或汇报之前，**必须**对本轮改过的每个文件直接跑一次 Impeccable 设计检测，把发现项当作设计提醒：

```bash
"$HOME/.zcode/cli/plugins/cache/impeccable/impeccable/4.8.0/skills/impeccable/scripts/impeccable" detect src/pages/Foo.jsx src/components/Bar.jsx
```

同一轮的多个文件可以一次传入。插件升级后版本目录会变；上面路径不存在时，先取当前安装的
launcher 再跑：

```bash
LAUNCHER=$(ls -d "$HOME"/.zcode/cli/plugins/cache/impeccable/impeccable/*/skills/impeccable/scripts/impeccable | sort -V | tail -1)
"$LAUNCHER" detect <改过的文件...>
```

检测自动读取项目 `.impeccable/config.json` 的忽略项。**退出码不代表有无问题**，要读输出里的
`[rule]` 行和说明。结果按三类处理：

- **真问题**：当场修掉，不要用 ignore 绕过。
- **确认误报 / 项目已有明确约定**：用最窄的忽略持久化并说明理由，例如
  `"$LAUNCHER" hooks ignore-value <rule> <value> --reason "..."`；文件级或整条规则级忽略先问用户。
- **拿不准**：保留发现项，在回复里提出来。

单文件扫描对 `.jsx` / `.js` / `.css` 只做正则匹配，对比度、字号这类元素级规则不会跑，结果是
下限而不是「干净」结论；需要全量检查时先 `npm run dev`，再对 dev server 跑
`"$LAUNCHER" detect http://localhost:5173`。汇报时写清本轮扫了哪些文件、发现什么、
修了什么 / 为什么保留。

## Smoke scripts (this is the test suite)

18 scripts, all green on 2026-11-01; per-script assertion matrix in `docs/work.md` §7:

- **Self-contained** (boot their own temporary API on a fresh `NAILONG_DATA_DIR`):
  `node server/scripts/smoke-setup.mjs`, `smoke-i18n`, `smoke-messages`, `smoke-auto-approve`,
  `smoke-linkage-identity`, `smoke-archives`, `smoke-tourism`, `smoke-postal`, `smoke-stats`,
  `smoke-education`, `smoke-offices-linkage` (same naming pattern). Immigration's smoke lives
  at `server/immigration/smoke.mjs` (self-starts, `SMOKE_PORT` overrides 3210).
- **Need a running API + base URL argument**: `node server/scripts/smoke-visa.mjs
  http://127.0.0.1:<port>` — same for `smoke-dip`, `smoke-resident`, `smoke-protocol`,
  `smoke-appeal`, `smoke-linkage`. Start the server with a fresh `NAILONG_DATA_DIR` and the
  `*_INTER_SERVICE_TOKEN` vars the flow needs. The docs office has no dedicated smoke script —
  it is covered by `smoke-linkage` + `smoke-auto-approve`.
- Scripts use **fixed usernames**: never reuse a data dir across runs. They bootstrap the
  first admin through `ensureAdmin()` from `server/scripts/bootstrap-admin.mjs` (password
  from `ADMIN_PASSWORD`, else a dev default).

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
Ownership is strict: `verifyBusinessRecord` treats ownerless records and other users' records
as `owned:false`, hides title/detail for non-owners, and docs rejects any typed business
number that is not found+owned (`DOC_BIZ_NOT_OWNED`). New UI must use
`src/components/linkage/LinkageField.jsx` rather than a bare number input.
Appeal write-back (`writebackBusiness`) only reopens rejected/closed records — issued permits,
cards and certificates are audit-only by design.

## Cross-service auto-approval

`server/autoApprove.js` owns the `service_auto_approve` table (one row per office:
`off` | `immediate` | `delayed`, delay 1–10080 minutes) and one in-process scheduler
that ticks every 5 seconds (`AUTO_APPROVE_INTERVAL_MS` overrides the interval for
tests; max 20 rows per queue per tick). **Nine** offices register a processor (visa,
immigration, docs, dip, resident, protocol, appeal, archives, education); the processor
calls the **same approval core** as the manual endpoint, so status transitions, review
records, audit, messages, downstream credentials and cross-office checks never drift.
Settings live at `GET/PATCH /api/auto-approve/:service`, guarded by that office's manage
permission (`visa:manage`, `imm:admin`, `docs:manage`, `dip:admin`, `res:manage`,
`evt:manage`, `appeal:manage`, `arch:manage`, `edu:manage`); every office admin settings
page embeds `src/components/AutoApproveSettings.jsx`. Automatic decisions use the `system`
actor and `detail.auto = true`. Limits by design: visa approval never issues the permit,
appeal only accepts (never decides), education only approves (never rejects), archives
runs accept→approve→execute in one tick.

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
  `{ items, unread: { total, byOffice }, offices }`; `GET /api/messages/unread` is
  the header-badge poll; `POST /api/messages/read` `{ office, id }` and
  `POST /api/messages/read-all` `{ office? }` write back to the source table.
- Inclusion is gated by each office's portal permission (`visa:apply`,
  `imm:portal`, …), so the aggregate never shows a mailbox the caller could not
  open.
- Normalizations to keep in mind: `arch_messages` has no `archived` column, and
  archives also mirrors notifications into `post_messages` (types prefixed
  `archives_`) — the postal sweep excludes `source = 'archives'` so nothing is
  counted twice. `post_messages` also carries tourism/education/stats notices
  (postal contract), which is why those three offices need no mailbox of their own.
- Titles: immigration/dip/resident/protocol return server-rendered `title`/`body`
  (plus `*Tw` so `localeMiddleware` localizes them); visa/docs/appeal/archives/postal
  return `type` + `params` and `src/components/InboxDrawer.jsx` renders them with
  the office's existing `visa.msg.*` / `docMsg.*` / `appeal.msg.*` / `arch.msg.*` /
  `post.msg.*` keys.

## Current state

As of 2026-11-01 the portal and all 12 offices are functional end to end (18 smoke
scripts plus the immigration self-starter, all green on a fresh DB): auth, RBAC, service cards,
profile, admin screens, 43 permission codes, cross-service linkage, per-office auto-approval,
service mutual-recognition (`/api/recognize`, eligibility output only — it never mutates office
state machines), cross-office inbox and the 邮政契约 notification bus. The UI is built entirely
with animal-island-ui components + `--animal-*` tokens; the 2026-10-30 UI-spec convergence batch
is recorded in `docs/ui-spec/07-convergence-2026-10-30.md`. The `docs/work.md` §8 audit defects
are mostly closed with smoke coverage; what remains open is P3, §8.4 (intentional), and the
five §8.2 sub-items named at the top of this file — check there before reporting one as new.
