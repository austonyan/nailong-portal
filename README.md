# 奶龙统一门户 (Nailong Unified Portal)

基于 Vite + React 19 + [animal-island-ui](https://github.com/guokaigdg/animal-island-ui) 的统一门户与账号认证体系,为后续各种服务的接入搭好基础。

## 快速开始

```bash
npm install
npm run dev:all   # 同时启动前端 (Vite, :5173) 和 API 服务器 (:3001)
```

生产模式:`npm run build && npm run start`(API 服务器同时托管 `dist/`,单端口 3001)。

首次启动:数据库为空时,前端会强制进入 `/setup` 管理员引导页。填写管理员账号、显示名称、邮箱与密码后,
首位管理员创建完成,引导入口立即永久关闭(`/api/setup/admin` 之后一律返回 409,`/setup` 也会跳回登录页)。
需要非交互部署时,可在首次启动前设置 `ADMIN_PASSWORD`;服务端会按旧方式自动创建 `admin` 并跳过引导。

## 架构

- **前端** `src/` — React 19 SPA,animal-island-ui 组件库,react-i18next 国际化
  (简体中文 `zh-CN` 与繁体中文 `zh-TW` 是写死的必备语言,见 `src/i18n/index.js`)。
- **后端** `server/` — Express 5 + better-sqlite3 (WAL)。数据文件在 `server/data/`(已 gitignore)。
- **认证** — JWT 访问令牌(30 分钟,存于内存)+ 刷新令牌(7 天,httpOnly Cookie,`/api/auth` 路径),
  `sessions` 表支持轮换与重放拒绝;密码使用 bcryptjs 哈希。
- **RBAC** — 权限(`permissions`)/角色(`roles`)/关联表;内置 `admin`(全部权限,锁定)与 `user`
  (门户访问)角色;中间件 `requirePermission('x:y')`。
- **服务注册表** — `services` 表 + 管理界面,门户按用户权限过滤展示;
  `POST /api/auth/introspect` 供未来接入的服务校验门户令牌。

## UI 规范

本项目自己的 UI 规范在 [`docs/ui-spec/`](docs/ui-spec/README.md)：按 Foundations / Tokens /
Components / Patterns / Layouts / QA 六层组织，含 DTCG 格式的
[`tokens.json`](docs/ui-spec/tokens.json)、对比度实测与已知偏差登记。`docs/design-system/`
是上游 animal-island-ui 的文档，不是本项目规范。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev:all` | 前端 + API 一起跑(开发) |
| `npm run dev:server` | 仅 API 服务器(watch) |
| `npm run dev` | 仅前端(dev server,`/api` 代理到 :3001) |
| `npm run build` / `npm run start` | 构建 / 生产运行 |
| `npm run lint` | oxlint |

首次启动引导验收:`node server/scripts/smoke-setup.mjs`(自包含,会自行启动临时 API 实例)。
各署自动审批验收:`node server/scripts/smoke-auto-approve.mjs`(自包含,临时库 + 独立端口)。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | API 服务器端口 |
| `JWT_SECRET` | 自动生成并持久化 | JWT 签名密钥 |
| `ADMIN_PASSWORD` | 未设置 | 可选;首次启动时自动创建 `admin` 并跳过 `/setup` 引导 |
| `ACCESS_TOKEN_TTL` | `30m` | 访问令牌有效期 |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | 刷新令牌天数 |
| `AUTO_APPROVE_INTERVAL_MS` | `5000` | 自动审批调度间隔(毫秒,验收脚本会调小) |
| `DIP_INTER_SERVICE_TOKEN` | 未设置 | 外交署服务间 API 令牌,`/api/dip/inter/*` 校验用;未设置时该路由返回 SERVICE_DISABLED |
| `VISA_INTER_SERVICE_TOKEN` | 未设置 | 签注署服务间 API 令牌,`/api/visa/inter/*` 校验用;未设置时该路由返回 SERVICE_DISABLED |
| `NAILONG_DATA_DIR` | `server/data/` | SQLite 数据库与 JWT 密钥文件目录,首次启动自动创建 |

## 部署与数据库迁运

### 运行方式
- 开发：`npm run dev:all`（前端 :5173 + API :3001，`/api` 代理到后端）
- 生产：`npm run build && npm run start`。`npm run build` 会先执行 `check:i18n` 和 `check:ui`，失败即中断；`npm run start` 启动 API 并托管 `dist/`（单端口 3001）。

### 数据库与目录
- 数据库：`better-sqlite3`，WAL 模式，外键开启。文件位于 `NAILONG_DATA_DIR`（缺省 `server/data/`），主文件 `nailong.db`，随同目录下的 `nailong.db-wal` / `nailong.db-shm` 一起备份。
- 迁移策略：仅做增量变更（新增 `_tw` 列等），`server/migrate.js` 在每次 boot 时按需 `ALTER TABLE ADD COLUMN`，旧数据库自动兼容；不做列删除或类型改动，不提供回滚脚本——升级前务必先备份数据库目录。
- JWT 密钥：`JWT_SECRET` 可显式设置；缺省时首次启动在数据目录生成 `.jwt-secret` 持久化，使会话跨重启有效。

### 首次启动与 setup 锁
- 全新数据库无用户，前端会强制进入 `/setup` 管理员引导；`POST /api/setup/admin` 创建首位管理员后，`app_meta` 写入 `setup.completed_at` 一次性锁，之后引导入口永久关闭，`/api/setup/admin` 返回 409 `SETUP_COMPLETE`。
- 非交互式部署：首次启动前设置 `ADMIN_PASSWORD`，服务端自动创建 `admin` 并跳过引导；与 `/setup` 向导互斥，二选一即可。

### 备份与恢复
- 备份：停止服务器后，整体拷贝 `NAILONG_DATA_DIR`（含 `nailong.db`、`nailong.db-wal`、`nailong.db-shm`、`.jwt-secret`）。
- 恢复：将备份目录内容拷贝回 `NAILONG_DATA_DIR`，保持文件权限，重启服务器即可。WAL 文件若缺失会在首次写入时重建，不影响数据一致性。

## 运维与监控

### 健康检查
- `GET /api/health` 返回 `{ ok: true, name: 'nailong-portal', time }`，可用于负载均衡器或容器健康探针。

### 审计日志
- 每个办公室均有独立审计表（`visa_audit`、`appeal_audit`、`arch_audit_logs`、`im_audit_logs`、`res_audit`、`dip_audit_logs`、`doc_audit`、`pro_*` 等），记录 `actor`、`action`、`target_type`、`target_id`、`detail`、`created_at`。
- 跨服务读取留痕：`linkage_access_logs` 记录每次联动取件/校验的 `user_id`、`consumer`、`source`、`action`、`ip`。
- 自动审批决策使用 `system` 角色且 `detail.auto = true`，与人工审批共用同一审计核心，可通过 `action` 字段区分。

### 速率限制
- 公开验真接口（`/api/visa/verify` 等）有内存速率限制，阈值由各署 `config` 表的 `verify_limit_per_5min` 控制（缺省 30 次/5 分钟），超限返回 429。

### 懒 sweep（后台定时任务）
- 服务器 boot 时启动固定间隔（缺省 5 秒，`AUTO_APPROVE_INTERVAL_MS` 可覆盖）的自动审批调度器，每轮处理各办公室待审件；单行失败只跳过该行，下一轮重试，不影响其他业务。
- 签注补件截止自动关闭、签注到期 +72 小时提醒等懒 sweep 按需在各办公室路由或定时逻辑中触发，状态机过渡与审计、站内信、下游凭证（签注、入境通行码、居民卡、外交礼遇、协议通行证、文书证书）通过同一核心，手工与自动决策不分歧。

### 日志与观测
- 服务器控制台输出 `[nailong]` 前缀的启动、自动审批 tick 计数与警告；前端构建产物在 `dist/`。
- 如需持久化日志，将 `npm run start` 的 stdout/stderr 重定向到日志文件并按需滚动。
