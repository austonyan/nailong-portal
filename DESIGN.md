---
name: 奶龙统一门户 (Nailong Unified Portal)
description: 海岛风格的十二署政务门户——奶油纸、棕墨、薄荷封蜡，以及只出现在主按钮上的 3D 厚度
colors:
  mint-seal: "#19c8b9"
  mint-seal-hover: "#3dd4c6"
  mint-seal-active: "#50b9ab"
  mint-wash: "#e6f9f6"
  leaf-green: "#6fba2c"
  sun-yellow: "#f5c31c"
  coral-red: "#e05a5a"
  ink-brown: "#794f27"
  ink-faded: "#9f927d"
  ink-disabled: "#c4b89e"
  paper: "#f8f8f0"
  paper-secondary: "#f0e8d8"
  paper-card: "#f7f3df"
  paper-input: "#fffdf7"
  border-warm: "#dcd8d1"
  border-hairline: "#e8e2d6"
  border-strong: "#827157"
  status-success-ink: "#2e7d32"
  status-success-wash: "#e8f5e9"
  status-danger-ink: "#c62828"
  status-danger-wash: "#ffebee"
  status-warning-ink: "#bf360c"
  status-warning-wash: "#fbe9e7"
  status-info-ink: "#1565c0"
  status-info-wash: "#e6f0ff"
  status-neutral-ink: "#4e342e"
  status-neutral-wash: "#efebe9"
  status-accent-ink: "#00695c"
  status-accent-wash: "#e0f2f1"
typography:
  display:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.01em"
  display-sm:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    lineHeight: 1.2
  headline:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "0.02em"
  title:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.35
  subsection:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.5
  body-large:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: "0.01em"
  body:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: "0.01em"
  body-compact:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.55
  label:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
  caption:
    fontFamily: "Nunito, Noto Sans SC, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0.01em"
rounded:
  chip: "12px"
  sm: "16px"
  base: "18px"
  card: "20px"
  lg: "24px"
  pill: "50px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "40px"
  4xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-brown}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "45px"
  button-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-brown}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "45px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.ink-brown}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "32px"
  input-large:
    backgroundColor: "{colors.paper-input}"
    textColor: "{colors.ink-brown}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  content-card:
    backgroundColor: "{colors.paper-card}"
    textColor: "{colors.ink-brown}"
    rounded: "{rounded.card}"
    padding: "16px 24px"
  status-tag:
    backgroundColor: "{colors.status-success-wash}"
    textColor: "{colors.status-success-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "0 10px"
    height: "24px"
  nav-item-active:
    backgroundColor: "{colors.mint-wash}"
    textColor: "{colors.ink-brown}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
  toast:
    backgroundColor: "{colors.mint-wash}"
    textColor: "{colors.ink-brown}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "11px 18px"
---

# Design System: 奶龙统一门户

## Overview

**Creative North Star: "海岛政务厅 (The Island Registry Hall)"**

把十二个署想象成一排海边办事窗口：奶油色的纸、棕色的墨、薄荷色的封蜡，柜台上点着厚墩墩的实体按钮。外层是动物岛的贴纸册——50px 药丸控件、20px 圆角卡片、燕尾飘带标题、blob 剪裁的弹窗；里层是真实的政务后台——上百张表、状态机、审核流、权限码、双语内容。设计的任务不是调和"可爱"与"严肃"，而是让这两者各守其位：**装饰集中在壳层，秩序集中在数据层**。

系统的核心张力是**手感与密度**。门户首页、服务卡、标题飘带、Toast 允许有玩具般的触感；一旦进入列表、详情、表单和三栏工作台，视觉噪音必须让位于扫描效率——同屏要能读下 20 行表格、12 张服务卡、一组状态标签，而不靠滚动完成比较。判断一个页面是否成立，看它在 1440px 与 360px 两端是否都还能一眼找到主操作、主状态、主数据。

所有颜色、圆角、阴影、字体、动效都来自 `animal-island-ui@2.3.0` 运行时的 `--animal-*` 变量，项目只在 `--nl-*` 里补充布局常量。没有暗色模式：组件库没有暗色 token 集，任何局部反色都会破坏对比度。这套系统只有一种"材质"——暖纸——并且只在 primary 按钮上允许物理厚度。

本文件是 `docs/ui-spec/` 六层规范的浓缩层：数值以运行时 `node_modules/animal-island-ui/dist/index.css` 为最高权威，规则以 `docs/ui-spec/` 为准；两者冲突时以运行时为准，不要从 `docs/design-system/` 抄 hex。

**Key Characteristics:**
- 暖奶油纸底 + 棕墨文字 + 薄荷点缀，薄荷从不承载文字。
- 药丸控件（50px）、20px 卡片、12px 交互圆角下限。
- 只有 primary / danger-primary 按钮有 3D 厚度阴影，其余表面一律平放。
- 状态永远"颜色 + 文字（+ 图标）"，没有只靠颜色的状态。
- 简繁双语同构：同一版式必须同时容下 zh-CN 与 zh-TW 的最长文案。
- 表格靠换行压缩进容器，任何页面都不出现横向滚动。

## Colors

一句话：暖色纸面 + 一个冷色点缀 + 一组只做填充的状态色；没有第二个品牌色。

### Primary
- **薄荷封蜡 (Mint Seal)** (`mint-seal`): 装饰块、进度条、选中态浅底的描边、图标点缀、侧栏 active 的左侧内条。对奶油底只有 1.97:1，所以它从不作为正文、链接文字或 12–14px 的语义文字。
- **薄荷浅底 (Mint Wash)** (`mint-wash`): 选中行、提示块、图标底、成功 Toast 的底色。大面积页面背景不用它。
- **薄荷过渡 (Mint Hover / Active)** (`mint-seal-hover`, `mint-seal-active`): 只出现在 hover / active 的过渡帧里，不作为静态文字色。

### Tertiary
状态填充色组：**叶绿 (Leaf Green)** (`leaf-green`) 用于成功、有效、通过；**日光黄 (Sun Yellow)** (`sun-yellow`) 用于提醒、待处理、焦点；**珊瑚红 (Coral Red)** (`coral-red`) 用于错误、驳回、危险。三者都是**填充色**（2.25:1 / 1.55:1 / 3.40:1），不是小号正文色。状态文字一律走下面的标签墨色表：

| 语义 | 墨色 | 底色 | 对比度 |
| --- | --- | --- | --- |
| 成功 / 有效 / 通过 | `status-success-ink` | `status-success-wash` | 4.56:1 |
| 错误 / 驳回 / 危险 | `status-danger-ink` | `status-danger-wash` | 4.92:1 |
| 待处理 / 补件 / 提醒 | `status-warning-ink` | `status-warning-wash` | 4.78:1 |
| 信息 / 进行中 | `status-info-ink` | `status-info-wash` | 5.00:1 |
| 中性 / 草稿 / 已归档 | `status-neutral-ink` | `status-neutral-wash` | 9.56:1 |
| 强调 / 已签发 | `status-accent-ink` | `status-accent-wash` | 5.71:1 |

### Neutral
- **纸白 (Paper)** (`paper`): 页面底、顶栏、按钮默认底。全站最大面积的颜色。
- **次级纸 (Paper Secondary)** (`paper-secondary`): 管理侧栏、输入区、提示条。
- **卡片纸 (Paper Card)** (`paper-card`): Card、Modal 内容块、表格容器。比页面略暖、略深。
- **输入纸 (Paper Input)** (`paper-input`): Input 内部。比卡片更亮，靠明度差被识别为"可写字段"。
- **棕墨 (Ink Brown)** (`ink-brown`): 标题、正文、表格、按钮文字、链接（配合下划线）。对纸白 6.65:1。
- **淡墨 (Ink Faded)** (`ink-faded`): 2.86:1，只用于装饰性文字和非信息图形——不能承载正文、表单标签、错误提示或表格关键列。
- **禁用墨 (Ink Disabled)** (`ink-disabled`): 禁用控件文字。
- **次级墨 (Secondary Ink)** (`--animal-text-color-secondary`): 未选中的页签、卡片说明、库的 Collapse 正文与分页「共 N 条」。运行时值是棕墨向纸面提亮 8%（4.9–5.5:1），由 `src/index.css` 的 `:root` 覆盖库的 `#9f927d`——原值只有 2.86:1，当不了文字色。
- **暖边框 (Border Warm)** (`border-warm`): 分隔线、卡片边。1.33:1，不能单独承担控件边界识别。
- **发丝边 (Border Hairline)** (`border-hairline`): 表格虚线、卡片内分隔。
- **重边框 (Border Strong)** (`border-strong`): 4.42:1；需要被识别的自定义控件边界。

### Named Rules
**The Mint-Is-Not-Ink Rule.** 薄荷只做底色、描边和图标。任何需要被阅读的文字——包括选中态里的文字——都是棕墨压薄荷浅底，绝不是薄荷字压薄荷底。

**The Four-Surface Rule.** 页面、内容面、次级面、浮层，靠明度与边框区分，靠阴影堆不出层级。卡片里不再套同色卡片表示分组；分组用间距、Divider 或 `type="dashed"` 的空态卡。

**The Status-Is-A-Fill Rule.** 成功/警告/错误是填充色；要写字就换成标签墨色表里那一行，并且同时给文字。红色只表示错误/驳回/危险，绿色只表示成功/有效，黄色只表示提醒/待处理——同一颜色不在一个页面里兼职两种语义。

## Typography

**Display Font:** Nunito（拉丁与数字），with Noto Sans SC（中文，zh-CN 基线）
**Body Font:** 同一族（`--animal-font-family`）
**Label/Mono Font:** 无独立标签字体；编号用 `tabular-nums`，不用等宽字做 UI

**Character:** 一个字体族、两套字形——Nunito 的圆润几何负责拉丁与数字，Noto Sans SC 负责中文。两者都以 woff2 打进组件库，也不在中文里用斜体强调（中文斜体是伪斜体）。字重不低于 400；标题 700，Title 飘带与统计大数字用 800–900。

**zh-TW 宋体层（2026-11-02，用户指定）：** 语言为繁体中文时，中文字形换成宋体以区分正简体语境——正文与界面字（font-weight ≤600）用教育部标准宋体，标题与展示字（≥700）用粗宋体；拉丁与数字仍是 Nunito。两个字重段在 `src/index.css` 注册为同一家族 `NL TW Serif`，靠字重自动分流，任何元素无需单独指定；字号/行高/字距与简体完全一致，简繁同构不破版。web 产物是 `font/edusong-web.woff2` 与 `font/MTRSungBold-web.woff2`（源文件 `edusong_Unicode.ttf` / `MTRSungBold.otf` 保留在 `font/`；粗宋必须经 `pyftsubset --desubroutinize` 重写，FontForge 子例程化 CFF 会被浏览器 OTS 拒收）。字体只在 `html[lang=zh-TW]` 时被引用：zh-CN 模式零下载，首次切繁体一次性拉取后走缓存。

### Hierarchy
- **Display** (800, 28px/1.2, `tabular-nums`): 统计数字、关键计数。数字本身用棕墨，薄荷只做旁边的装饰条或图标。
- **Headline** (700, 20px/1.35): 每页唯一的 `<h1>`，由 `.page-title` 包住库的 `Title`；同时承担区块 `<h2>` 的纯文本形态。
- **Title** (700, 18px/1.35): 卡片标题、服务卡名称；需要飘带时用 `Title size="middle"` 并包进语义标题。
- **Body** (500, 14px/1.6): 默认正文、表格、表单。长段落每行不超过约 36 个汉字。
- **Body compact** (500, 13px/1.55): 密集表格、卡片元信息、服务卡简介；不用于长段落。
- **Label** (600, 14px/1.4, 0.02em): 按钮、Tab、表单标签。与正文同色，不靠变浅来区分层级。
- **Caption** (500, 12px/1.5): 时间、注释、Tag 文字。屏幕 UI 的下限。
- **Eyebrow** (700, 12px/1.4, 0.08em): 侧栏分组标题（"服务""账户"）；全大写只用于拉丁文。

收敛规则：新代码只用 12 / 13 / 14 / 16 / 18 / 20 / 24 / 28 这几档；11px 只留给打印票据与印章上的装饰字。

### Named Rules
**The Twelve-Pixel Floor Rule.** 屏幕上的说明文字不小于 12px；需要"更浅的层级"时用 13px + 棕墨 + 间距，不用淡墨压小字。

**The Two-Ink Rule.** 可读的字只有两档墨：正文墨（6.65:1）与次级墨（≥4.5:1）。链接、表头小标题、状态说明一律用墨色，颜色只出现在填充、描边和图标里；`#9f927d` 的淡墨不再承载任何文字。

**The Ribbon-Is-Visual Rule.** `Title` 渲染的是 `<span>`，不产生标题层级。每个页面自己补 `<h1>`/`<h2>`/`<h3>`；飘带颜色一个页面不超过三种。

## Layout

全站一个外壳、两种形态。顶栏 sticky（`z-index: 100`，内容最大 1440px，左右 24px，高约 53px）。管理员额外得到 260px 常驻侧栏（`z-index: 110`，自身滚动，次级纸底）；普通用户没有侧栏，服务从门户卡片进入，署内导航是一条横向 Tab 栏。

```
┌──────────────────────────────────────────────┐
│ header  sticky · max 1440 · pad 10/24        │
├──────────┬───────────────────────────────────┤
│ sider    │ main  max 1440 · pad 24           │
│ 260px    │                                   │
│ sticky   │                                   │
├──────────┴───────────────────────────────────┤
│ footer  居中 · 12px · pad 20                 │
└──────────────────────────────────────────────┘
```

栅格不是像素还原，是排列关系：卡片 240px 是最小值，统计卡 220px，表单列 220px；gap 一律 16px。表单两列用 `repeat(auto-fit, minmax(220px, 1fr))`，行间距交给 FormItem。详情字段标签列固定 `min-width: 110px`，值列 `flex: 1`。

断点只用五档：640 / 720 / 900 / 1024 / 1440，360 是最小验收宽度。1024 及以下侧栏收进 280px 抽屉；640 及以下顶栏换行、顶栏 padding 收到 16px、卡片单列、详情的标签移到值上方——但页面主 padding 仍是 24px。

密度由数据决定：列表页一屏至少 10 行；12 个署的服务卡在 1440px 下不滚动就能看到大部分；任何宽度下都不出现横向滚动条，长编号换行完整显示。

## Elevation & Depth

这是一个**平放的系统**。Card、表格、输入框都没有投影，靠四层纸面的明度差和边框建立层级；Card 悬停时只 `translateY(-2px)` 上浮，不加阴影。唯一被"抬起来"的是 primary / danger-primary 按钮：它们在底部压着一层 5px 的沙色实心阴影，像一块可以按下去的木头标牌，按下时阴影收成 1px。阴影颜色永远是暖棕调的，不用冷黑。

### Shadow Vocabulary
- **按钮厚度** (`box-shadow: 0 5px 0 0 #bdaea0`): 仅 primary / danger-primary 按钮的静止态；hover 变 6px，active 收成 1px。
- **轻提示** (`var(--animal-shadow-sm)` = `0 2px 4px 0 rgba(61, 52, 40, .06)`): Toast、default 按钮。
- **悬停高程** (`var(--animal-shadow-base)` = `0 3px 10px 0 rgba(61, 52, 40, .1)`): 需要脱离纸面的小浮层。
- **大浮层** (`var(--animal-shadow-lg)` = `0 8px 24px 0 rgba(61, 52, 40, .14)`): 大尺寸浮层；Modal / Drawer 用库自带阴影。

### Named Rules
**The One-Raised-Thing Rule.** 一个视图里只有主操作按钮有物理厚度。把 3D 阴影套到 default/dashed/text 按钮、卡片或开关上，等于在一个页面里制造两个"按下去的地方"。

**The Warm-Shadow Rule.** 阴影只用 `rgba(61, 52, 40, …)` 系列；禁止 `rgba(0,0,0,.2)` 这类冷黑阴影和多层大模糊。

### 层级梯子
内容 0 / 吸顶顶栏 100 / 侧栏 110 / 浮动下拉面板 120 / Modal 1000 / Drawer 2000 / Toast 4000 / 打印浮层 9999。不新增随机 `z-index`。

## Shapes

形状语言是"圆润的实体"：所有交互元素都是药丸或圆角块，没有直角。按钮、输入框、Select 触发器是 50px 药丸；卡片 20px；Hero、Modal 内容块、大容器 24px；提示块与常规容器 18px；Tag 与小容器 16px；12px 是**交互元素的下限**，再小只能用于徽标、内嵌图标底或打印物。头像、状态圆点、筛选 chip 用 999px。

边框宽度只有 1px（装饰虚线）、1.5px（Tag、pattern 边）、2px（默认边框与输入框）、2.5px（自定义文本域）、3px（奖章、票据）。分隔线优先用波浪 Divider 或 2px 虚线，不用 1px 实线画满整页。

两个形状是**不可替换**的：Modal 的 SVG blob `clip-path` 和 Title 的燕尾飘带。不要用 `border-radius` 把弹窗改成圆角矩形，也不要把飘带拉平。例外只留给非交互物：二维码、趋势柱、打印印章可以用 4–8px。

### Named Rules
**The Never-Square Rule.** 交互元素没有直角，也没有小于 12px 的圆角；"高级感"不靠方角。

**The Two-Signatures Rule.** blob 弹窗与燕尾飘带是这套系统的签名。可以少用，不能改形。

## Components

组件的手感是 **tactile and reassuring（可按、可信）**：主按钮有厚度、按下会落回去；卡片静止平放、悬停才浮起；输入框像一张比卡片更亮的纸条。所有可见控件优先用库组件，尺寸只有 small / middle / large 三档，不为单个页面改高度或圆角。

### Buttons
- **Shape:** 药丸（middle 45px 高 / 左右 20px / 14px 字；small 32px / 左右 16px / 12px 字 / 16px 圆角；large 48px / 左右 32px / 16px 字 / 24px 圆角）。
- **Primary:** 奶油底 + 棕字 + `0 5px 0 0 #bdaea0` 的厚度阴影。注意：它不是薄荷实心按钮，薄荷只出现在焦点环、链接与装饰里。
- **Hover / Active:** hover 阴影 5→6px 并上浮 1px；active 下压 2px、阴影收成 1px。宽度不变。
- **Focus:** 2px 棕墨环 + 2px offset。库自带的薄荷/暖黄焦点环对比度不足，项目在 `src/index.css` 里覆盖回棕墨（6.65:1）。
- **Default / Dashed / Text / Link:** default 是奶油底 + 2px 边框 + 轻阴影；dashed 用于"去补件/去验证"这类引导入口；text 用于工具栏与行内；link 是主色文字，只给非关键入口。
- **状态:** disabled 用 `opacity: .5`；loading 必须同时 `loading` + `disabled`，按钮宽度不能跳；danger 只给删除/驳回/作废/吊销，`danger + primary` 只出现在确认弹窗的最终确认。
- **One primary per view.** 同一区域两个并列 primary 视为层级缺陷。

### Inputs / Selects
- **Shape:** large 48px / 左右 22px / 药丸；middle 40px；small 32px。同一行控件必须同尺寸。
- **Surface:** 输入面比卡片更亮（`paper-input`），边框 2px 暖边框；默认无阴影。
- **Focus:** 2px 棕墨环 + 2px offset；不用冷蓝。
- **Error:** 库的红色底阴影，但必须同时给错误文案；只有红边没有文字不合格。
- **Select:** 选项面板由 `src/components/selectFloat.js` 全局接管——在触发器下方展开、空间不足上翻、收进最近的裁剪容器；页面里不要再写定位覆盖。Esc 只收面板，不关外层弹窗。
- **Forms:** 一律 `layout="vertical"`，label 在上，必填显示 `*` 且用 `common.required` 文案；placeholder 是示例，不是 label。

### Cards
- **Corner / Surface:** 20px 圆角、卡片纸底、padding 16px 24px、无阴影。
- **Hover:** 只有真正可点击的卡片才 `hoverable`，且只上浮 2px；必须同时提供键盘入口。
- **Content rules:** 承载文字的彩色卡片用 `type="pattern"`（深字压浅波点底），实色卡只能放图标或装饰。空态/提示用 `type="dashed"`。
- **Service card:** 门户的服务卡是"海岛窗口"的正面——18px/700 名称、13px 两行摘要（唯一允许 `line-clamp` 的地方）、右上角进入箭头。整卡点击，但键盘必须可达。

### Tables
- **Always `className="table-fit"`:** 表头与长文本换行，靠自动列宽压缩进容器，**永不横向滚动**。
- **Type:** 表头 14px/700、正文 14px/500、单元格上下 14px；数字列右对齐 + `tabular-nums`；状态列左对齐；操作列右对齐并用 `.table-actions`。`.table-actions` 在 ≥901px 不换行（换行会把行高从 60 撑到 96px，一屏读不满 10 行），≤900px 才退回换行。
- **States:** 加载保留表头与容器高度；空态用 `emptyText`；**失败不能渲染成空列表**——表格外给错误说明和重试。
- **No ellipsis.** 申请号、证件号、姓名、状态必须换行完整显示。

### Tags / Badges
- 状态标签统一 `variant="soft"`：深字 + 浅底，只有标签墨色表里的六组颜色可用。
- `small` 用于表格与列表（24px 高），`medium` 用于详情，`large` 只用于详情页头部状态。
- 标签文字不超过 8 个汉字；Tag 不是按钮，不挂 `onClick` 做导航。
- Badge 只用于未读数：0 不显示，99+ 封顶，未读必须同时有文字或圆点。

### Navigation
- **Admin sidebar:** 260px、次级纸底、右侧发丝边；条目是 999px 药丸，默认淡墨，hover 变薄荷浅底 + 棕墨，active 再加 `inset 3px 0 0 0` 的薄荷内条与 700 字重。分组标题是 12px/700/0.08em 的 eyebrow。
- **Everyone else:** 没有侧栏；门户卡片是入口，署内是横向 Tab 栏。侧栏层级只到"署 → 管理台"，不在侧栏复制署内 Tab。
- **Breadcrumb:** 14px，用 `›` 分隔（来自 `naive-icons`），当前项棕墨 600。
- **Tabs:** 传了 `activeKey` 就必须传 `onChange`；≤6 个页签，超出改左侧导航。

### Modals & Drawers
- 必须 `maskClosable={false}`：点遮罩不关闭。关闭入口是取消/关闭按钮、抽屉右上角 ×、或 Esc。
- 宽度只有 460 / 560 / 640 / 720 四档，且必须显式传 `width`；Modal 保留 blob 剪裁。长表单改 Drawer 或独立页。
- 异步确认：按钮 `loading` + `disabled`，busy 时 `onClose` 直接返回；成功后先关窗/重置 → toast → `await load()`；失败保持弹窗。
- 打开时聚焦第一个可交互元素，关闭后焦点回到触发按钮。

### Toasts
- 顶部居中、药丸形、`z-index: 4000`；成功用薄荷浅底 + 薄荷边，错误只换红边、底色不变（文字始终是棕墨）。
- 只用 `src/components/toast.js` 的 `toastSuccess / toastError / toastInfo / toastWarning / toastApiError`——不要用库的 `Notification`（React 19 下从 `react-dom` 主入口取 `createRoot` 会抛异常）。
- 一个动作只发一条；校验错误留在字段旁，不 toast。

### 项目组合组件
`ConfirmAction`、`LinkageField`（跨署证件字段，必须先走身份同意弹窗）、`InboxDrawer`（跨署站内信）、`AutoApproveSettings`（off / immediate / delayed 三态）是项目的"签名组合"。它们沿用同一套纸面与药丸语言，但状态更多：未选 → 校验中 → 已归属 / 非本人 / 未找到 / 已被引用，每一种都必须有文字说明，不只换 Tag 颜色。

## Do's and Don'ts

### Do:
- **Do** 颜色、圆角、阴影、字体、动效一律用 `var(--animal-*)`；布局尺寸用 `--nl-*`。新代码不出现裸 hex / rgb。
- **Do** 让按钮和输入框保持 50px 药丸、卡片 20px、交互元素圆角 ≥12px。
- **Do** 把 3D 厚度只留给 primary / danger-primary 按钮；其他表面平放。
- **Do** 用 2px 棕墨环 + 2px offset 做键盘焦点，并用 `scroll-margin-top: 64px` 保证它不被 sticky 顶栏挡住。
- **Do** 让每个状态同时有颜色和文字（必要时加图标）：未读 = 圆点 + "未读" + 左边框；错误 = 图标 + 文案 + 红边。
- **Do** 状态标签用 `variant="soft"` 和标签墨色表的六组配色。
- **Do** 在写死任何宽度前，先用 zh-CN 和 zh-TW 两种最长文案把版式撑一遍——简繁双语同构是硬约束，任何会被截断的标题都不合格。
- **Do** 让每个 `<Table>` 带 `className="table-fit"`，长文本换行、操作列用 `.table-actions`。
- **Do** 每页只放一个 `<h1>`、一个主操作；标题层级不跳级。
- **Do** 用 `src/lib/date.js` 的 `fmtDate` / `fmtDateTime` 输出日期，用 `tabular-nums` 输出统计数字。

### Don't:
- **Don't** 用薄荷做文字色、链接色或 12–14px 的语义文字（1.97:1）；也不要薄荷字压薄荷底。
- **Don't** 用纯黑 `#000`、冷灰 `#fafafa` 背景或冷蓝焦点环。
- **Don't** 做暗色模式或 `prefers-color-scheme` 局部反色；组件库没有暗色 token 集。
- **Don't** 用 `border-radius: 0` 做"高级感"，也不要改 Modal 的 blob 或 Title 的燕尾飘带。
- **Don't** 把阴影堆成层级，或用冷黑 `rgba(0,0,0,.2)` 阴影。
- **Don't** 在一个视图里放两个 primary，也不要让不可逆操作用 `text` 按钮承载。
- **Don't** 用库的 `Notification`、原生 `alert/confirm/prompt`、原生 `<button>/<input>/<select>` 或 emoji/Unicode 当图标。
- **Don't** 给 Table 传 `size` 或给列写 `ellipsis`；不要让任何页面出现横向滚动。
- **Don't** 让弹窗点遮罩关闭；不要在没有 `onChange` 的情况下传 `activeKey`；不要把 `Switch` 写成 `value`。
- **Don't** 用 `overflow: hidden` 掩盖双语换行问题；文案必须完整显示，只允许对服务卡简介这类非关键摘要做两行 `line-clamp`。
