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

- 用户第二轮决策（2026-11-03）改选 dealt 第二张：**国家横幅 · 窗口带**（kind=dealt，option 2 位置，seed:700e73671c781cdd）。
- 命名瞬间：国家门楣先把「奶龙国 / 奶龙统一门户」立起来，其下一条 12 格窗口带排开十二个皇家署，柜台卡居中压轴——横幅负责威仪，窗口带负责「十二个窗口」的规模感，卡片负责办事。
- 构图纪律：无 eyebrow（craft-floor 禁令）；h1 只有国名一个；窗口带静态不可点、不带假状态；每页一个 primary。

## Unresolved decisions

- 暂无。移动端（≤360）为 best-effort，按 AGENTS.md 不作验收门槛。

## Direction contract

THESIS: 门面先立国、再列署、后办事——满宽国家门楣 + 十二署窗口带 + 居中柜台卡；拒绝的是无品牌叙事的悬浮小卡片。

OWN-WORLD: 次级纸门楣（2px 次级墨下边线、薄荷徽记方块、28px 国名）+ 12 列窗口 chip（次级纸底、发丝边、薄荷/日光黄装饰条）+ 薄荷柜台卡（2px 薄荷边、24px 圆角）+ 奶油主按钮的 0 5px 0 沙色厚度；点缀只用薄荷与日光黄。

STORY: 访客先看到国名与门户名（这是奶龙国的门户），再扫到十二个署（规模与身份），最后在居中的柜台卡完成登录/注册/首启；窗口带编号与署名全部真实。

FIRST VIEWPORT: 国家门楣（徽记 + 国名 h1 + 国家门户副线 + 竖分隔 + 门户名与标语 + 国训药丸 + 语言）→ 12 列窗口带 → 点纹纸舞台上的居中柜台卡（飘带标题 + 副标题 + 表单）→ 发丝边页脚（国训 + 门户名 · 年份）。

FORM: dealt 第二张（用户第二轮改选，原 dealt lead 为 windows-hall）；seed:700e73671c781cdd。code-led 构建，锁定草图 `.impeccable/mocks/decision/national-masthead.html` 为构图契约（草图里的英文副线改由「国家门户」承担；窗口带不带虚构营业状态）。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
