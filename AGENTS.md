# AGENTS.md

奶龙统一门户: Vite + React 19 SPA + Express 5 API + SQLite (better-sqlite3)。纯 JavaScript
(JSX + ESM),无 TypeScript、无测试框架,前端用 `animal-island-ui` 2.3.0。SPA 内含 12 个业务署:
visa 签注、immigration 入境、docs 文书、dip 外交、resident 居民、protocol 礼宾、appeal 申诉、
archives 档案、postal 邮政、tourism 文旅、stats 统计、education 教育。

**动某个署之前先读 `docs/work.md`**:各署端点、状态机、权限码、编号前缀、站内信类型、跨署链路、
自动审批矩阵、smoke 跑法都在里面(§3 各署、§7 smoke、§8 审计缺陷)。§8.1/§8.2 大部分已修并有
smoke 断言;仍未修的是 P3、§8.4(有意设计)和五个 §8.2 子项(protocol `required_fields`、
`dip_relation_types.validity_days` 关系过期、archives 隐藏仅限本署、postal `post_settings`
管理 API、education 文章草稿)。不要重查已修项,也不要顺手「修」未修项——除非用户要求。
新增署按 §9.1 顺序做:schema/routes/mount/linkage/auto-approve/nav/locales/smoke。

## 硬规则(不可谈判):i18n 永远同时出简体和繁体

用 **react-i18next**。`src/i18n/index.js` 是执行层,不许弱化:

- `REQUIRED_LOCALES = ['zh-CN', 'zh-TW']` 是唯一语言白名单。`src/i18n/locales/` 下两个资源文件
  必须都存在且 key 完全一致,`assertRequiredLocales()` 在启动时对不上就抛错。加语言 = 加新 locale
  且保持两个中文文件完整。
- JSX 里不许硬编码用户可见文案,一切走 `t(...)`。`src/api/client.js` 的 `ApiError.code` 用
  `api.*` 翻译,未知 code 落到通用文案,绝不显示原始 key。
- `npm run check:i18n`(build 第一步)扫描所有 `t('...')` / `` t(`prefix.${...}`) ``,缺 key、死动态
  前缀、未覆盖枚举都失败。运行时变量拼的 key 要么带 `defaultValue`,要么加进
  `scripts/check-i18n.mjs` 的枚举白名单;署管理台 key 放 `<namespace>.admin.*`(如
  `imm.admin.review.*`),不要裸页面前缀。
- 语言切换器只提供这两个 locale。
- **zh-TW 有自己的字体层**(`src/index.css` 顶部):`html[lang=zh-TW]` 时正文(≤600)用教育标准
  宋体、标题(≥700)用粗宋,两档同注册为 `NL TW Serif` 由 `font-weight` 自动分档;字号/行高/间距
  与 zh-CN 完全一致(简繁同构)。线上产物 `font/edusong-web.woff2`、`font/MTRSungBold-web.woff2`;
  `font/edusong_Unicode.ttf` / `MTRSungBold.otf` 只是源文件,更新需
  `pyftsubset --desubroutinize --flavor=woff2` 重建(FontForge 子程序化 CFF 会被浏览器 OTS 拒绝)。
  字体只在
  zh-TW 作用域引用:zh-CN 不下载,首次切换拉一次后走缓存。

服务端存储内容(目录、通知、消息模板、活动字段)靠**双语列**而不是 i18n key:

- 每个展示列都有可空 `_tw` 兄弟列(`name_tw`、`title_tw` …)。迁移只增不删
  (`server/migrate.js` 的 `ensureColumn` / `ensureTwColumns`),老库启动时补列;不删列、不改类型、
  不写回滚脚本——升级前先备份数据目录。
- `src/api/client.js` 每个请求带 `X-Nailong-Locale`;`server/locale.js` 的 `localeMiddleware` 重写
  JSON:`name` 是请求语言、`nameTw` 是繁体、(zh-TW 时)`nameCn` 是简体源;`labelTw` /
  `placeholderTw` / `titleTw` 等嵌套 key 同样本地化。
- 管理表单双语编辑:简体输入绑定 `fieldCn ?? field`,繁体绑定 `fieldTw`,提交 `field` + `fieldTw`;
  繁体为空时读取回退简体。
- 内置种子内容在 `server/content-i18n.js` 翻译(按 code 或 title 回填,绝不覆盖管理员已填的非空值)。
  管理员新建内容在填繁体前保持单语;自由文本业务内容(昵称、评论、理由)不做机翻。
- 新增展示列:建表加 `_tw`、加进该署 `ensureTwColumns`、序列化输出 `fieldTw`(或直接用 `_tw` 列)、
  管理表单加对应输入框。

## 命令

- `npm run dev` — Vite HMR(`/api` 代理到 :3001);`npm run dev:server` — API :3001 watch;
  `npm run dev:all` — 同时起。
- `npm run build` — `check:i18n` → `check:ui` → `check:tokens` → `check:copy` → `vite build`,
  任一检查失败即中止;`npm run start` — API(有 `dist/` 时一并托管)。
- `npm run check:i18n` — i18n key 两语齐全;`npm run check:ui` — 下方前端交互约定。
- `npm run check:tokens` — `src/**/*.css` 只能引用已安装库 CSS 里存在的 `--animal-*`(未知 token
  = build 错);裸 hex/rgb 是警告,`@media print` 和二维码/票据/证书白纸选择器内豁免。
- `npm run check:copy` — 文案排版(ui-spec 01-foundations §2.3):中文值里紧邻中文(或插值)的
  `,` `:` `;` `?` `!` 和 `(…)` 必须全角;中文与英文/数字/插值间不手动加空格;省略号用 `…`;
  敬语统一「你」,「您」即违规。`node scripts/check-copy.mjs --fix` 幂等归一(保护插值与 URL)。
- `npm run lint` — **oxlint**(`.oxlintrc.json`),不是 ESLint。
- 没有 test/typecheck/format 脚本。验证 = 静态检查 + smoke 脚本。

## 架构

- `server/` — Express 5。`server/db.js` 是核心 SQLite schema(WAL、外键开启)并播种权限/角色/示例
  服务;库文件在 `NAILONG_DATA_DIR`(默认 `server/data/`,gitignore,含 `nailong.db*` 与 `.jwt-secret`)。
- 新署在 `server/<office>/`:`schema.js` 自带建表、权限码、角色、服务卡种子,另有
  `routes.js` / `admin.js` / `util.js`,部分有 `inter.js`;visa/docs/appeal 是旧的
  `server/<name>.js` + `server/routes/<name>*.js` 拆分。照抄你正在改的那个署。
- `server/index.js` 每署按 **`inter` → `admin` → 用户路由** 挂载,顺序不能乱:具体前缀必须先挂,
  否则被署级鉴权中间件吞掉。
- 错误:抛 `server/http.js` 的 `ApiError(status, code, message)`,错误处理器输出 `{code, message}`,
  SPA 映射到 `api.*`。
- 鉴权:JWT access token(30 分钟,客户端内存)+ refresh token(7 天,httpOnly cookie,作用域
  `/api/auth`),`sessions` 表保证 refresh 轮换、重放被拒;bcryptjs 哈希。
- 首次启动:空库**没有用户**。`GET /api/setup/status` 返回 `required: true`,SPA 全路由跳 `/setup`,
  `POST /api/setup/admin` 建首个管理员并登录。完成状态锁在 `app_meta.setup.completed_at`,之后再调
  该 POST 返回 409 `SETUP_COMPLETE`;已有管理员的老库启动时自动上锁。首启设 `ADMIN_PASSWORD` 则走
  非交互 `admin` 播种、跳过向导。
- RBAC:43 个权限码(部分在 `server/db.js`,部分在各署 schema),中间件
  `requirePermission('x:y')` 在 `server/auth.js`;系统角色权限每次启动追加回填。
- 服务注册表 `services`:`GET /api/services` 按 `enabled` + `required_permission` 过滤;
  `services.entry_mode`(`external` | `internal` | `internal_sso`)决定门户怎么开卡;
  `POST /api/auth/introspect` 供外部服务校验 access token。
- 环境变量(完整表在 README.md):`PORT`、`JWT_SECRET`、`ADMIN_PASSWORD`、`ACCESS_TOKEN_TTL`、
  `REFRESH_TOKEN_TTL_DAYS`、`AUTO_APPROVE_INTERVAL_MS`、`NAILONG_DATA_DIR`,以及各署
  `VISA_/DIP_/RESIDENT_/PROTOCOL_INTER_SERVICE_TOKEN`(未设时 inter 路由返回 `SERVICE_DISABLED`)。

## 身份档案与跨署预填

`users` 的 `display_name`(真实姓名)、`email`、`address` 是全门户唯一身份来源(旧库由
`server/db.js` 的 `ensureColumn` 补列)。注册必须填真实姓名;`PATCH /api/auth/profile` 只接受
`email` / `address`,`displayName` 一律返回 `PROFILE_NAME_IMMUTABLE`(仅管理员可在用户管理更正);
资料页邮箱与地址必填。

各署表单必须从这里预填,不能让用户重复录入:`src/lib/profileIdentity.js` 提供
`{ realName, email, address }`;姓名输入在档案有值时禁用并显示「来自个人资料」,邮箱与地址按需预填,
档案没有的字段才允许手填。居民登记是强约束:服务端在建草稿、保存、提交时用 `applyProfileIdentity`
覆盖 `nickname` / `contact` / `virtualAddress`,变更审批通过后把地址(及形如邮箱的 contact)回写
`users`。新署/新表单按同一约定接入。

## 署服务模式(12 署共用)

- **SSO 进入** — 服务卡是 `internal_sso`:每个浏览器标签页首次进入弹一次门户身份确认
  (`sessionStorage 'nailong.<office>.sso'`),各署 `*Shell.jsx` 对直链再强制一次。播种服务行**必须
  写 `entry_mode`**——该列默认 `external`,漏写会让卡片静默当外部服务打开(immigration 曾如此,
  `server/db.js` 现在启动时纠正;新署要在种子里写对)。
- **页面** — `src/pages/<office>/`,署内辅助放 `shared.jsx`;门户壳与 immigration 用共享的
  `src/lib/date.js` dayjs 格式化(非法日期显示 `-`)。
- **站内信 — 两套方案并存,新消息类型必须跟随本署方案。** visa/docs/appeal/archives 只存
  `type` + JSON params,前端用 `visa.msg.*` / `docMsg.*` / `appeal.msg.*` / `arch.msg.*` 渲染(两语
  都要加,且加进 `scripts/check-i18n.mjs` 枚举);immigration/dip/resident/protocol/postal 服务端用
  `*_message_templates` 里的可编辑双语模板渲染。
- **邮政契约** — tourism/stats/education/archives 镜像通知走
  `sendPostalMessage({userId, source, type, params})`(`server/postal/notify.js`),它读取
  `post_preferences` 并写 `post_messages`。
- **惰性扫描** — 截止关闭、过期扫描、状态推进都在相关读取时内联执行,没有 cron;常驻定时器只有
  自动审批调度器。
- **编号** — 不可预测的前缀号(`NLA-…`、`NLT-…`、`IM…`、`NRC-…` 等)带冲突重试;公开 `verify`
  端点限流(进程内或 DB,进程内计数重启即清)并遮蔽持有人信息。
- **只收文本,不存文件。** 所有表单、补件、管理页只存文本/数据:没有 multer、没有附件表、没有
  `server/data/uploads/`。表单写「该写什么」而不是要扫描件;`server/cleanupLegacyUploads.js`
  启动时删旧表和旧上传目录。
- Visa 要点:申请态
  `draft → pending_review → approved | rejected | supplement_required | withdrawn`,
  `approved → issued`,补件超期 → `closed`;许可 `valid → used | voided | expired`。
  电子签「PDF」是打印 CSS + `window.print()`,不生成文件。

## docs/ 上游文件与本项目文件

- **本项目权威:** `docs/ui-spec/`(UI 规范:六层、DTCG `tokens.json`、对比度实测、偏差登记)、
  `docs/work.md`、`docs/newcontent.md`。
- **上游参考:** `docs/design-system/`、`docs/adr/`、`docs/development/` 属于
  [animal-island-ui 库仓库](https://github.com/guokaigdg/animal-island-ui),token 值落后于已装的
  2.3.0;其中描述的 `src/components/<Name>/`、`test/`、`demo/`、Vitest、ESLint、`@/*` 别名、
  `npm run ci` / `test:a11y` / `check:docs` **这里都不存在**,不要跑。
- UI 取值冲突顺序:运行时 `node_modules/animal-island-ui/dist/index.css` + `dist/types` →
  `docs/ui-spec/` → `docs/design-system/`。**绝不从 design-system 文档抄色值。**

## 写 UI

先读 `.agents/skills/animal-island-ui-style/SKILL.md` 及其 `references/`(组件目录 + 库硬规则),要点:

- 样式表只在入口引入一次:`import 'animal-island-ui/style'`;只从包根和
  `animal-island-ui/style` 引入,不许深路径。
- 不自造 prop——查技能里的目录或 `node_modules/animal-island-ui/dist/types`。
- 自定义元素用 `var(--animal-*)` token;不硬编码颜色,不用 `className`/`style` 覆盖组件的颜色/
  圆角/阴影。布局常量可用 `--nl-*`。
- 禁用:纯黑文字、冷灰背景、冷蓝 focus ring。Focus 用暖黄(输入框 `#ffcc00`)或薄荷绿。
  按钮/输入框是 50px 药丸,任何可交互元素圆角不低于 12px。
- 图标用 `naive-icons`,不用 emoji、Unicode 符号、手写 SVG。
- 优先库组件,不用裸 `<button>` / `<input>` / `<select>` 等。
- 无暗色模式(库没有暗色 token),不要尝试。
- 平台优先级:**桌面优先**。1440px 设计基准、1024px 最低桌面宽,这两个宽度不许横向滚动,长编号
  完整换行;移动端(≤360)验收已延期,不作为发布阻塞或 P0/P1 定级依据,现有窄屏样式保留为
  best-effort、允许回归。重排移动端时先清三个已知缺口:360 下管理表格竖排单字、
  `/immigration/declare` 主按钮溢出、`/dip/identity/:id` 关闭态抽屉产生幽灵横向滚动。
  `check:ui` 的 `.table-fit` / `.table-actions` 仍按桌面执行,不因移动端延期删除。

### 前端交互约定(`check:ui` 强制)

- **不用 `animal-island-ui` 的 `Notification`**:React 19 下它从 `react-dom` 主入口取 `createRoot`
  会抛异常,事件处理器停在提示行,后续关窗/刷新都不执行。统一用 `src/components/toast.js` 的
  `toastSuccess / toastError / toastInfo / toastWarning / toastApiError`,任何提示辅助都委托给它。
- 每个 `<Table>` 必须 `className="table-fit"`:靠自动列宽 + 表头/长文本换行压进容器,**不加横向
  滚动**,不传 `size`,列不写 `ellipsis`;操作列用 `.table-actions`(≥901px 不换行,≤900px 才换行)。
- **弹窗只能显式关闭**:每个 `<Modal>` / `<Drawer>` 必写 `maskClosable={false}`(库默认 `true`,
  误点会丢整张表单);关闭入口是取消/关闭按钮、抽屉右上 ×、Esc;`footer={null}` 的弹窗要自带
  取消/关闭按钮(用 `.form-actions` 排版)。
- 异步弹窗必须有 `busy`:提交/确认 `loading={busy} disabled={busy}`,`onClose` 在 busy 时直接
  return。成功先关窗/重置表单,再 toast,再 `await load()`;失败留在弹窗并 toast 错误;
  取消/重开清空表单。
- `Switch` 用 `checked`,不用 `value`(库不支持,显示会与服务器状态相反)。
- `<Tabs>` 传了 `activeKey` 就必须同时传 `onChange`(受控后库内部 state 失效,漏了页签点不动);
  只定初始页签用 `defaultActiveKey`。
- `<Select>` 面板由 `src/components/selectFloat.js`(CSS `selectFloat.css`,`main.jsx` 装一次)
  全局接管:库默认画在触发器右侧且只按视口判断,弹窗/抽屉/卡片里会被 `overflow` 裁掉;接管后
  统一下方展开、空间不足上翻、收进最近裁剪容器并自带滚动,面板打开时 Esc 只收面板。
  **不要在页面里另写定位覆盖。**
- 必填项提交前校验(用 `common.required`),空值不可提交;删除/作废/吊销等不可逆操作要有确认、
  `busy` 和成功提示,删除成功文案用 `common.deleted`。

### 设计检测(改完前端必跑)

每轮改完 `src/` 下的 `.jsx` / `.js` / `.css`(以及改到的 `index.html`),在继续或汇报前**必须**
对每个改过的文件跑一次 Impeccable 检测:

```bash
"$HOME/.zcode/cli/plugins/cache/impeccable/impeccable/4.8.0/skills/impeccable/scripts/impeccable" detect src/pages/Foo.jsx src/components/Bar.jsx
```

同轮多文件可一次传入。插件升级后版本目录会变,路径不存在时取最新 launcher:

```bash
LAUNCHER=$(ls -d "$HOME"/.zcode/cli/plugins/cache/impeccable/impeccable/*/skills/impeccable/scripts/impeccable | sort -V | tail -1)
"$LAUNCHER" detect <改过的文件...>
```

检测读项目 `.impeccable/config.json` 的忽略项。**退出码不代表有无问题**,要读输出里的 `[rule]`
行。三类处理:真问题当场修,不用 ignore 绕过;确认误报/项目既有约定,用最窄忽略并写理由
(`"$LAUNCHER" hooks ignore-value <rule> <value> --reason "..."`),文件级或整条规则级忽略先问
用户;拿不准的保留并在回复里提出。单文件扫描对 `.jsx` / `.js` / `.css` 只做正则,对比度、字号等
元素级规则不跑,结果是下限;要全量先 `npm run dev`,再 `"$LAUNCHER" detect http://localhost:5173`。
汇报写清扫了哪些文件、发现什么、修了什么/为什么保留。

## Smoke 脚本(这就是测试套件)

19 个脚本,2026-11-02 全绿;逐个断言矩阵在 `docs/work.md` §7。

- **自包含**(自建临时 API + 全新 `NAILONG_DATA_DIR`):`node server/scripts/smoke-setup.mjs`,
  以及同目录 `smoke-i18n`、`smoke-messages`、`smoke-auto-approve`、`smoke-linkage-identity`、
  `smoke-archives`、`smoke-tourism`、`smoke-postal`、`smoke-stats`、`smoke-education`、
  `smoke-offices-linkage`、`smoke-verify-center`。immigration 的在 `server/immigration/smoke.mjs`
  (自启,`SMOKE_PORT` 覆盖 3210)。
- **需要已运行 API + base URL**:`node server/scripts/smoke-visa.mjs http://127.0.0.1:<port>`,
  同理 `smoke-dip`、`smoke-resident`、`smoke-protocol`、`smoke-appeal`、`smoke-linkage`。服务器用
  全新 `NAILONG_DATA_DIR` 并按流程设好 `*_INTER_SERVICE_TOKEN`。docs 没有专属脚本,由
  `smoke-linkage` + `smoke-auto-approve` 覆盖。
- 脚本用**固定用户名**:数据目录绝不跨轮复用。它们通过 `server/scripts/bootstrap-admin.mjs` 的
  `ensureAdmin()` 建首个管理员(密码取 `ADMIN_PASSWORD`,否则开发默认值)。

## 跨署系统

- **链路** `server/linkage.js`:各署共用一个 SQLite,内部检查直接读写对方表而非 HTTP 自调
  (visa 许可 ↔ immigration 核验/回写、docs 五署业务号核验 + appeal 裁定、appeal 校验/快照/回写/
  抽检、protocol 身份与礼遇核验、resident 福利通道、dip 签证资格与身份失效作废许可)。各署
  `/api/*/inter` 仍保留给独立部署调用方,仍需服务令牌。面向用户的 `/api/linkage` **绑定身份**,
  只列调用者自己的记录(`listOwnedRecords` 按 `users.id`),首次抓取前由
  `src/components/linkage/LinkageConsentModal.jsx` 取会话级同意并展示身份依据,每次抓取/核验写
  `linkage_access_logs`。归属严格:无主或他人记录 `owned:false`,非属主隐藏标题/详情,docs 拒绝
  未找到或非属主的业务号(`DOC_BIZ_NOT_OWNED`)。新 UI 用
  `src/components/linkage/LinkageField.jsx`,不写裸号码输入框。appeal 回写
  (`writebackBusiness`)只重开被拒/关闭记录,已发许可、证件、证书按设计只审计。
- **自动审批** `server/autoApprove.js`:`service_auto_approve` 每署一行
  (`off` | `immediate` | `delayed`,延迟 1–10080 分钟),单调度器每 5 秒一跳
  (`AUTO_APPROVE_INTERVAL_MS` 供测试覆盖;每队列每跳最多 20 行)。9 个署注册处理器(visa、
  immigration、docs、dip、resident、protocol、appeal、archives、education),处理器调**与手动端点
  相同的审批核心**,状态、审核记录、审计、站内信、下游凭证、跨署检查不会漂移。设置端点
  `GET/PATCH /api/auto-approve/:service`,用该署管理权限(`visa:manage`、`imm:admin`、
  `docs:manage`、`dip:admin`、`res:manage`、`evt:manage`、`appeal:manage`、`arch:manage`、
  `edu:manage`),各署管理设置页嵌 `src/components/AutoApproveSettings.jsx`。自动决定用 `system`
  身份、`detail.auto = true`。设计边界:visa 审批不发许可、appeal 只受理不裁定、education 只批不拒、
  archives 一跳内完成受理→批准→执行。
- **外壳与侧栏** `src/components/AppLayout.jsx` 是唯一登录后外壳。管理员:侧栏
  `src/components/Sidebar.jsx`(260px、sticky、独立滚动)含门户首页/12 署/个人资料/系统管理,细
  头部放面包屑、收件铃、语言、头像、退出;≤1025px 侧栏进左侧 `Drawer`(`maskClosable={false}`)。
  非管理员:无侧栏,头部保留品牌与账号操作,从门户卡片进服务,署内用各自的横向页签。
  "管理员" = `hasRole('admin')` 或有任一管理权限,规则在 `src/nav/navConfig.js` 的
  `isPortalAdmin()`;该文件是侧栏/面包屑的唯一来源
  (`{ key, base, labelKey, icon, permission, admin: { base, entries } }`,首个有权的管理台落地页
  生效),侧栏只到「署 → 管理台」,不要重复署内页签。`navConfig.js` 必须零依赖:
  `scripts/check-i18n.mjs` 会 import 它校验每个 `NAV_LABEL_KEYS` 两语齐全。新增署要加进
  `OFFICE_NAV`、两语 `nav.*` 标签和 admin entries。
- **跨署收件箱** `server/routes/messages.js`:聚合 `visa_messages`、`doc_messages`、
  `appeal_messages`、`arch_messages`、`im_messages`、`dip_messages`、`res_messages`、
  `pro_messages`、`post_messages`,**只读这些表**——不建新表、不双写,标记已读写回源表,署内收件箱
  与全局永不打架。`GET /api/messages?status=all|unread&office=&limit=50` →
  `{ items, unread: { total, byOffice }, offices }`;`GET /api/messages/unread` 供头部角标轮询;
  `POST /api/messages/read` `{ office, id }` 与 `POST /api/messages/read-all` `{ office? }` 回写。
  按各署门户权限(`visa:apply`、`imm:portal` …)决定可见性。注意:`arch_messages` 没有
  `archived` 列;archives 同时镜像到 `post_messages`(`archives_` 前缀),邮政扫描按
  `source = 'archives'` 排除以免重复计数;tourism/education/stats 通知也存 `post_messages`
  (邮政契约),所以这三署没有自己的收件箱表。标题:immigration/dip/resident/protocol 返回服务端
  渲染的 `title`/`body`(带 `*Tw` 供 `localeMiddleware` 本地化),visa/docs/appeal/archives/postal
  返回 `type` + `params`,由 `src/components/InboxDrawer.jsx` 用 `visa.msg.*` / `docMsg.*` /
  `appeal.msg.*` / `arch.msg.*` / `post.msg.*` 渲染。

## 当前状态

门户与 12 署端到端可用(19 个 smoke + immigration 自启脚本,新库全绿):鉴权、RBAC、服务卡、
个人资料、管理页、43 权限码、跨署链路、分署自动审批、服务互认(`/api/recognize`,只出资格、
不改任何署状态机)、跨署收件箱、邮政契约通知总线、appeal 统一验真中心
(`GET /api/appeal/verify`,覆盖 12 署 38 类业务号,遮蔽 + 限流)。UI 全部用 animal-island-ui
组件 + `--animal-*` token;2026-10-30 UI 规范收敛批次见 `docs/ui-spec/07-convergence-2026-10-30.md`。