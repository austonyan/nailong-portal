# 奶龙统一门户 (Nailong Unified Portal)

基于 Vite + React 19 + [animal-island-ui](https://github.com/guokaigdg/animal-island-ui) 的统一门户与账号认证体系,为后续各种服务的接入搭好基础。

## 快速开始

```bash
npm install
npm run dev:all   # 同时启动前端 (Vite, :5173) 和 API 服务器 (:3001)
```

生产模式:`npm run build && npm run start`(API 服务器同时托管 `dist/`,单端口 3001)。

默认管理员:`admin / admin123`(可用 `ADMIN_PASSWORD` 环境变量覆盖;请尽快在页面上修改密码)。

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

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev:all` | 前端 + API 一起跑(开发) |
| `npm run dev:server` | 仅 API 服务器(watch) |
| `npm run dev` | 仅前端(dev server,`/api` 代理到 :3001) |
| `npm run build` / `npm run start` | 构建 / 生产运行 |
| `npm run lint` | oxlint |

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | API 服务器端口 |
| `JWT_SECRET` | 自动生成并持久化 | JWT 签名密钥 |
| `ADMIN_PASSWORD` | `admin123` | 首次初始化的管理员密码 |
| `ACCESS_TOKEN_TTL` | `30m` | 访问令牌有效期 |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | 刷新令牌天数 |
