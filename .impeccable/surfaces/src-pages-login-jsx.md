---
version: 1
slug: "src-pages-login-jsx"
primary_target: "src/pages/Login.jsx"
related_targets: ["src/pages/Register.jsx","src/pages/Setup.jsx","src/components/AuthLayout.jsx"]
---

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

## Direction contract

THESIS: 登录就是走进办事大厅——十二扇真实署所的窗口一齐亮着，最大的「综合窗口」是登录口；拒绝的是悬浮居中小卡片那种「工具门」默认构图。

OWN-WORLD: 奶油纸面（paper/paper-card）上的窗口房：窗口铭牌 = paper-card 底 + 发丝边 + 18px 圆角，编号 12px 加宽字距；综合窗口 = 薄荷浅底 + 2px 薄荷边 + 24px 圆角；主按钮保留 0 5px 0 沙色厚度；点缀只有薄荷与日光黄装饰条。

STORY: 访客三秒内明白「这是奶龙国的统一门户，十二个署从这一个身份出发」，然后在一个明确的窗口里完成登录/注册/首启；窗口编号与署名全部真实，登录后与门户服务卡一一对应。

FIRST VIEWPORT: 顶细条（徽记 + 国名行 + 语言）→ 叙事行（唯一 h1「欢迎来到<飘带>门户名</飘带>」+ 一句 tagline）→ 5 列窗口房网格（综合窗口 2×2 居右上承载表单，署所铭牌同构排布）→ 发丝边页脚（国训 + 署名年份）。

FORM: dealt lead（我的结构候选第 3 名，骰子发牌 index 3 领衔）；seed:700e73671c781cdd。code-led 构建，锁定草图 `.impeccable/mocks/decision/windows-hall.html` 是构图契约（草图中的 eyebrow 行与虚构「受理中/开放中」状态按 brief 修正：无 eyebrow，铭牌不带假状态）。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
