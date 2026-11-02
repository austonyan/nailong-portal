# Surface brief: 登录门面 (Login / Register / Setup gate)

## Scope & mode

- Targets: `src/pages/Login.jsx`, `src/pages/Register.jsx`, `src/pages/Setup.jsx`, shared shell `src/components/AuthLayout.jsx`（重写为 PortalGate 门厅骨架）。
- Mode: Operate——访客的任务是登录/注册/首启配置；品牌表达只通过构图与真实内容，从不遮挡任务。
- 范围：用户已确认三页全对齐（登录=回岛，注册=入籍，Setup=建国引导）。

## Audience, job, proof, constraints

- 受众：回流的居民（登录）、新访客（注册）、部署者（Setup）。任务频率：登录高频，注册/Setup 一次性。
- 证明材料：十二个真实皇家署的名录（来自 `nav.*`）、真实门户名与标语（`app.name` / `portal.tagline`）、真实表单文案（`auth.*`）。不做假状态（无「受理中/开放中」 invented 状态）、不编造营业时间。
- 硬约束：`--animal-*` token、50px 药丸控件、i18n 两语同构、无手写 SVG 图标（用 naive-icons）、桌面优先 1440/1024 不横滚。

## Chosen direction & memorable moment

- 用户在决策页/聊天中锁定 dealt lead：**办事大厅 · 十二窗口**（kind=assigned，seed:700e73671c781cdd）。
- 命名瞬间：登录卡是办事大厅里最大的那扇「综合窗口」——薄荷浅底、2px 薄荷边，占 2×2 格；其余 11 个皇家署作为同构窗口铭牌亮在网格里，第 12 署占宽格。注册/Setup 变体下窗口计数补齐为 12 铭牌 + 国训宽牌。
- 构图纪律：无 eyebrow（craft-floor 禁令）——国家身份由顶栏品牌位承载；h1 是唯一的；每页一个 primary。

## Unresolved decisions

- 暂无。移动端（≤360）为 best-effort，按 AGENTS.md 不作验收门槛。
