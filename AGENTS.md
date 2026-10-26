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
- The language switcher must offer exactly these two locales.

## What this workspace is

奶龙统一门户 (Nailong unified portal): a Vite + React 19 SPA frontend plus a Node/Express API
server with SQLite (better-sqlite3). Plain JavaScript (JSX + ESM) — no TypeScript, no test
runner. Frontend consumes the published `animal-island-ui` npm package.

## Commands

- `npm run dev` — Vite dev server with HMR (proxies `/api` to :3001)
- `npm run dev:server` — API server on http://localhost:3001 with watch
- `npm run dev:all` — both at once (concurrently)
- `npm run build` — production build; `npm run start` — API server (also serves `dist/` if present)
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

## Cross-service linkage

`server/linkage.js` is the in-process cross-office bus. All offices share one SQLite DB, so
internal checks read/write each other's tables directly instead of doing HTTP to self:
visa permit ↔ immigration check/writeback, docs business-number verification across the
five offices (plus appeal decisions), appeal validate/snapshot/writeback/inspection
sampling, protocol identity/courtesy checks, resident benefit channels, and diplomatic
visa eligibility + permit void-on-identity-loss. The per-office `/api/*/inter` routes
remain for independently deployed callers and still require their service tokens.
Acceptance: `node server/scripts/smoke-linkage.mjs [baseUrl]`.

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

## Current state

As of 2026-10-26 the portal and seven in-SPA offices are functional end to end: auth,
RBAC, service cards, profile, admin screens, 签注 / 入境 / 外交 / 居民 / 礼宾活动 / 文书认证 /
申诉监察. Cross-service linkage (`server/linkage.js`) and per-office auto-approval are
live. The UI is built entirely with animal-island-ui components + `--animal-*` tokens.
Acceptance scripts cover every office plus linkage, setup and auto-approval; run them
against a fresh `NAILONG_DATA_DIR` when a script uses fixed usernames.
