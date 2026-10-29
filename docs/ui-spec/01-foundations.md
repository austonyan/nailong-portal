# 01 · Foundations 视觉基础

> 这一层只回答“什么颜色、什么字、什么间距、什么阴影可以出现”。
> 组件怎么组合、页面怎么排，分别见 [03 Components](./03-components.md) 与 [05 Layouts](./05-layouts.md)。

---

## 1. 颜色

### 1.1 先语义，后色值

不要用“主色占 60%、辅助色占 30%”这类配比来定义项目颜色。项目需要的是**同一个颜色永远表达同一个语义**：

| 语义 | 运行时 token | 值 | 允许用途 | 禁止用途 |
| --- | --- | --- | --- | --- |
| 品牌 / 主色 | `--animal-primary-color` | `#19c8b9` | 装饰块、进度条、选中态**浅底**、图标点缀、Tag `app-teal` | 正文、链接文字、小图标单独承载信息（对奶油底仅 **1.97:1**）；选中态文字必须用棕色，不要薄荷字压薄荷底 |
| 主色 hover | `--animal-primary-color-hover` | `#3dd4c6` | 仅悬停过渡 | 静态文字 |
| 主色 active | `--animal-primary-color-active` | `#50b9ab` | 仅按下过渡 | 静态文字 |
| 主色浅底 | `--animal-primary-color-bg` | `#e6f9f6` | 选中行、提示块、图标底 | 大面积页面背景 |
| 主文字 | `--animal-text-color` | `#794f27` | 标题、正文、表格、按钮文字、链接（配合下划线） | — |
| 正文（卡片内） | `--animal-text-color`（Card 内置 `#725d42`） | `#725d42` | Card 内正文 | — |
| 次级文字 | `--animal-text-color-secondary` | `#9f927d` | 仅装饰性文字/非信息图形（**2.86:1**，大号也不足 3:1） | 正文、表单标签、错误提示、表格关键列、任何需要阅读的文字 |
| “弱化”文字 | `--animal-text-color-muted` | `#794f27` | 运行时与主文字相同，只作为别名 | 不要指望它产生更浅的层级；需要更浅请用 13px + 主文字，不要用 secondary 承载信息 |
| 禁用文字 | `--animal-text-color-disabled` | `#c4b89e` | 禁用控件 | 可交互内容 |
| 页面背景 | `--animal-bg-color` | `#f8f8f0` | 页面、顶栏 | 内容卡片 |
| 次级背景 | `--animal-bg-color-secondary` | `#f0e8d8` | 侧栏、输入区、提示条 | 大面积主背景 |
| 内容面 | Card 默认 | `#f7f3df` | 卡片、弹窗、表格容器 | 页面底 |
| 输入面 | Input 默认 | `#fffdf7` | 输入框内部 | 卡片背景 |
| 禁用背景 | `--animal-bg-color-disabled` | `#f0ece2` | 禁用控件 | — |
| 边框 | `--animal-border-color` | `#dcd8d1` | 分隔线、卡片边（**1.33:1**，不能单独作为控件边界） | 单独承担输入框边界识别 |
| 浅边框 | `--animal-border-color-light` | `#e8e2d6` | 表格虚线、卡片内分隔 | 控件边界 |
| 边框 hover | `--animal-border-color-hover` | `#827157` | 悬停/需要 3:1 边界的自定义控件（**4.42:1**） | 大面积描边 |
| 成功 | `--animal-success-color` | `#6fba2c` | 填充、图标、Tag `app-green` 的底色来源 | 小号正文（**2.25:1**） |
| 警告 | `--animal-warning-color` | `#f5c31c` | 填充、图标、强调条、Radio/Checkbox 焦点 | 文字（**1.55:1**） |
| 错误 | `--animal-error-color` | `#e05a5a` | 边框、图标、危险按钮底色 | 小号正文（**3.40:1**） |
| 信息 | 无独立 token | — | 用 Tag `app-blue`（`#1565c0` on `#e6f0ff`，**5.00:1**）或棕色正文 + 蓝色图标 | 自造 `--animal-info-color` |

> **结论：成功/警告/错误色是“填充色”，不是“文字色”。**
> 错误提示 = 棕色正文 + 错误图标 + 红色左边框/浅底；不要把 `--animal-error-color` 直接当 12–14px 文字颜色。
> 项目里 `color: var(--animal-danger-color)` 是不存在的 token（见 §6.5 D-02），必须改为 `--animal-error-color`。

### 1.2 表面层级

页面最多四层表面，靠**明度与边框**区分，不靠阴影堆叠：

1. **页面**：`--animal-bg-color` `#f8f8f0`
2. **内容面**：Card `#f7f3df`（比页面略暖、略深）
3. **次级面**：`--animal-bg-color-secondary` `#f0e8d8`（侧栏、提示条、输入区）
4. **浮层**：Modal / Drawer / Select 面板 / Toast，由组件库提供背景与阴影

不要在 Card 里再套一个同色 Card 来表示分组；用间距、Divider 或 `type="dashed"` 的空态卡。

### 1.3 状态不能只靠颜色

同一页面里，**同一种颜色只能表达同一种状态**：

- 红色只用于错误、驳回、危险、未读提示；不能同时当普通链接色。
- 绿色只用于成功、有效、通过；不能当“装饰性随机色”。
- 黄色只用于提醒/待处理/焦点；不能当品牌主色。
- 未读、必填、错误、成功都必须同时有**文字或图标**：未读标题 + 圆点 + “未读”文案；必填 `*` + 错误文案；成功 `CheckCircleIcon` + 文案。

### 1.4 允许的状态标签配色

Tag 的 `soft` 变体使用深色文字 + 浅色底，是目前唯一能稳定达到 4.5:1 的文字标签形态。
实际使用请只从下表取色（实测值见 [06 QA §6.4](./06-qa.md#64-对比度实测)）：

| 语义 | `color` | 前景 / 背景 | 对比度 |
| --- | --- | --- | --- |
| 成功 / 有效 / 通过 | `app-green` | `#2e7d32` / `#e8f5e9` | 4.56:1 |
| 错误 / 驳回 / 危险 | `app-red` | `#c62828` / `#ffebee` | 4.92:1 |
| 待处理 / 补件 / 提醒 | `warm-peach-pink` | `#bf360c` / `#fbe9e7` | 4.78:1 |
| 信息 / 进行中 | `app-blue` | `#1565c0` / `#e6f0ff` | 5.00:1 |
| 中性 / 草稿 / 已归档 | `brown` | `#4e342e` / `#efebe9` | 9.56:1 |
| 强调 / 已签发 | `app-teal` | `#00695c` / `#e0f2f1` | 5.71:1 |
| 特殊分类 | `purple` / `app-pink` | `#7b1fa2` / `#c2185b` | 6.77 / 4.88:1 |

**禁止用于文字标签的组合**：`default`（3.91:1）、`app-yellow`（1.85:1）、`app-orange`（3.46:1）、
`lime-green`（3.78:1）、`yellow-green`（4.34:1）。这些颜色可以当图标或装饰底，但标签文字必须换成上表颜色。
`Tag` 的 `solid` / `outlined` 变体在奶油底上均达不到 4.5:1（solid 是白字压浅色），**状态标签统一用 `variant="soft"`**。

### 1.5 彩色卡片与 Title 飘带

- **承载文字的彩色卡片**用 `type="pattern"`（深色文字压在浅色波点底上，5.3–7.5:1），不要用 `color` 实色卡
  （白字压 `app-teal`/`app-pink`/`app-green` 等只有 1.7–2.7:1）。
- 实色卡只允许承载图标/纯装饰；一旦有正文，必须换 `type="pattern"` 或默认 Card + 彩色 Tag/图标。
- `Title` 飘带在 20px/28px 时属于大号文字，只需 3:1；可安全使用 `brown`（3.64:1）、`app-yellow`（4.13:1）、
  `lime-green`（5.17:1）、`yellow-green`（4.54:1）。`default`（2.07:1）、`app-teal`（1.72:1）、
  `app-green`（2.00:1）、`app-blue`（2.58:1）、`app-red`（2.69:1）、`app-orange`（2.43:1）、
  `purple`（2.92:1）、`app-pink`（1.89:1）不得单独作为标题文字色。
- `Title size="small"` 是 14px 装饰飘带，不能当功能性小标题的唯一文字；需要小标题时用 16px/700 棕色正文。

### 1.6 深浅色与高对比

- **当前只支持浅色模式**。组件库没有暗色 token 集，禁止用 `filter: invert()`、`prefers-color-scheme` 局部反色
  或临时覆盖 `--animal-*` 来“做暗色”；这会产生不可预测的对比度。暗色模式作为独立版本立项，见 §6.5 D-12。
- 必须支持 Windows 高对比/强制颜色（`forced-colors: active`）下的基本可用：文字、边框、焦点不能消失；
  装饰壁纸、波点、渐变允许被系统去掉。
- 不允许用纯黑 `#000`/`#111` 文字，也不允许冷灰 `#fafafa`/`#f5f5f5` 背景。

---

## 2. 字体与文字角色

### 2.1 字体族

```css
font-family: var(--animal-font-family);
/* Nunito, "Noto Sans SC", -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif */
```

- `Nunito` 负责拉丁字符与数字，`Noto Sans SC` 负责中文；两者以 woff2 打进 `animal-island-ui/style`，
  **不要再引入 Google Fonts `<link>` 或第二套品牌字体**。
- 中文/英文混排时不要手动切换字体；不要在中文里用斜体表示强调（中文斜体是伪斜体）。
- UI 文字禁用等宽字体；只有 `CodeBlock`、业务编号/QR 内容可以使用等宽或 `tabular-nums`。
- 字重不低于 400；禁止 300/200。

### 2.2 文字角色（新代码按此取值）

| 角色 | 字号 / 行高 / 字重 | 颜色 | 用途 | 备注 |
| --- | --- | --- | --- | --- |
| Display | 28 / 1.2 / 800 | `text`（主色只做装饰条/图标） | 统计数字、关键计数 | `font-variant-numeric: tabular-nums`；主色数字对奶油底仅 1.97:1 |
| Page title | 20 / 1.35 / 700 | `text` | 每页唯一主标题 | 必须包在 `<h1>` 里 |
| Section title | 20 / 1.4 / 700（纯文本）或 Title middle（900 飘带） | `text` / 允许的飘带色 | 区块标题 | 包在 `<h2>` 里 |
| Subsection | 16 / 1.5 / 700 | `text` | 卡片内分组、表单分组 | `<h3>` |
| Body large | 16 / 1.6 / 500 | `text` | 首页导语、说明段 | 不超过 36 个汉字/行 |
| Body | 14 / 1.6 / 500 | `text` | 默认正文、表格、表单 | 项目基准 |
| Body compact | 13 / 1.55 / 500 | `text` | 密集表格、卡片元信息 | 不用于长段落 |
| Label | 14 / 1.4 / 600 | `text` | 按钮、Tab、表单标签 | 与正文同色，不靠浅色区分 |
| Caption | 12 / 1.5 / 500 | `text` | 时间、注释、辅助信息 | **屏幕 UI 最小 12px**；不要用 secondary 压小字 |
| Eyebrow | 12 / 1.4 / 700 + `0.08em` | `text` | 侧栏分组（“服务”“账户”） | 全大写只用于拉丁；不要用 11px |
| Data / ID | 13 / 1.5 / 600 + `tabular-nums` | `text` | 申请号、证件号、金额 | 长编号允许 `overflow-wrap: anywhere` |

**收敛规则**：新代码只使用 12 / 13 / 14 / 16 / 18 / 20 / 24 / 28 这几档。现有 15 / 17 / 22 / 26 在改动到时
就近归一（15→16，17→18，22→24，26→28）；11px 只保留给打印票据/印章上的装饰字，屏幕上的说明文字一律 ≥12px。

### 2.3 可读性

- 正文行高 ≥1.5；长段落最大宽度约 **36 个汉字**（拉丁约 72 字符），超过就用两栏或卡片分组。
- 不截断关键信息：申请号、证件号、姓名、状态、金额必须换行完整显示；只有用户昵称、服务卡简介这类
  非关键摘要允许 1–2 行 `line-clamp`。
- 中文标点用全角，英文/数字与中文之间不手动加空格；省略号用 `…`，不用 `...`。
- 日期统一 `YYYY-MM-DD`，日期时间 `YYYY-MM-DD HH:mm`，由 `src/lib/date.js` 的 `fmtDate` / `fmtDateTime`
  输出；禁止对 ISO 字符串做 `slice` / `replace('T',' ')`。
- 200% 浏览器缩放是硬验收：文字放大后不得被容器裁切、不得出现横向滚动、不得丢失功能。

### 2.4 标题语义

`Title` 组件渲染的是 `<span>`，**不产生标题层级**。每个页面必须自己补语义：

```jsx
<h1 className="page-title"><Title size="middle">{t('visa.home.heroTitle')}</Title></h1>
<h2><Title size="middle" color="app-yellow">{t('visa.home.notices')}</Title></h2>
```

- 每页恰好一个 `<h1>`；区块 `<h2>`；卡片/表单分组 `<h3>`/`<h4>`；不跳级。
- `Title` 只负责视觉，`h1/h2/h3` 负责语义；不要用 `<div>` 模拟标题。
- 2026-10-30 的 P0/P1 收敛批次已给 195 个路由页补上 `<h1>`（见 §6.5 D-07 与
  [07 收敛验收报告](./07-convergence-2026-10-30.md)）；新页面仍按本节执行，不要回退。

---

## 3. 间距与栅格

### 3.1 间距尺度

以 **4px** 为步进，只使用以下值。4px 是本项目的选择（为了和库的
`--animal-spacing-*` 对齐），不是行业强制标准；关键是**同一套尺度用到底**，而不是每页随手写 13/17/23px。

| Token 建议 | 值 | 典型用途 |
| --- | --- | --- |
| `space-1` | 4px | 图标与文字、紧凑标签内 |
| `space-2` | 8px | 行内元素、按钮组、Tag 间距 |
| `space-3` | 12px | 表单行内、卡片头部、弹窗按钮组 |
| `space-4` | 16px | 卡片 padding、卡片网格 gap、页面小节 |
| `space-5` | 24px | 页面 padding、区块间距、大卡片 padding |
| `space-6` | 32px | Hero 内边距、页面主区块 |
| `space-7` | 40px | 大屏留白 |
| `space-8` | 48px | 登录/引导页纵向留白 |

- 同层兄弟元素优先用 `gap`，不要用 `margin-top` 叠间距；容器负责外部间距，子元素只管内部间距。
- 现有代码中的 6 / 7 / 10 / 14 / 22 / 34 在改动到时就近归一：6→8、7→8、10→12、14→16、22→24、34→32。
- 2px 只允许出现在边框、光学对齐、3D 阴影偏移，不作为布局间距。

### 3.2 容器与栅格

| 场景 | 规则 |
| --- | --- |
| 全站内容宽 | 最大 **1440px**，左右 padding 24px；顶栏在 ≤640px 时收到 16px |
| 门户服务卡 | `repeat(auto-fill, minmax(240px, 1fr))`，gap 16px |
| 统计卡 | `repeat(auto-fit, minmax(220px, 1fr))`，gap 16px |
| 署内类型卡/指南卡 | `repeat(auto-fill, minmax(240px, 1fr))`，gap 16px |
| 表单两列 | `repeat(auto-fit, minmax(220px, 1fr))`，列 gap 16px、行 gap 0（由 FormItem 自带） |
| 详情字段 | 标签列固定 `min-width: 110px`，值列 `flex: 1`，行 padding 8px 0 |
| 个人资料 | 最大 640px 单列 |
| 登录/引导 | 卡片 400px（登录/注册）或 580px（首次引导）单列居中 |

- 同类信息保持同一条左边界；不要在一个页面里出现 3 种卡片起始线。
- 栅格只负责“排列关系”，不负责“固定像素还原”：卡片 240px 是最小值，不是固定宽度。

---

## 4. 圆角

| 值 | 用途 |
| --- | --- |
| `12px` | 小徽标、内嵌图标底、紧凑块（**交互元素下限**） |
| `16px` | `--animal-border-radius-sm`；Tag/小按钮/小容器 |
| `18px` | `--animal-border-radius-base`；常规容器、提示块 |
| `20px` | Card 固定圆角；表格容器 |
| `24px` | `--animal-border-radius-lg`；Hero、Modal 内容块、大容器 |
| `50px` | 按钮、输入框、Select 触发器（pill） |
| `999px` | 头像、状态圆点、筛选 chip |

- 交互元素圆角不得小于 12px；不要用 `border-radius: 0` 做“高级感”。
- Modal 必须保留 SVG blob `clip-path`；Title 必须保留燕尾飘带；不要用 `border-radius` 改这两者。
- 例外：QR 码、趋势柱、打印印章可使用 4–8px；它们不是交互元素。

---

## 5. 边框、阴影与层级

### 5.1 边框

| 宽度 | 用途 |
| --- | --- |
| 1px | 表格虚线、极细分隔（仅装饰） |
| 1.5px | Tag、Card pattern 边、提示块 |
| 2px | 默认边框（`--animal-border-width`）、Card、输入框 |
| 2.5px | 自定义 textarea、强调容器 |
| 3px | 奖章、票据外框 |

- 控件边界不能只靠 `--animal-border-color`（1.33:1）；需要被识别的自定义输入/按钮，使用
  `--animal-border-color-hover`（4.42:1）或明显的填充差 + 阴影。
- 分隔线优先用 `Divider`（wave）或 2px dashed；不要用 1px 实线画满整页。

### 5.2 阴影

- **3D 像素堆叠阴影只属于 `Button type="primary"`（含 danger+primary）**：
  `0 5px 0 0 #bdaea0`，hover `0 6px`，active `0 1px`。不要套到 default/dashed/text/link。
- Card 无 `box-shadow`；hover 只 `translateY(-2px)`。
- Switch 无外阴影；Input 默认无阴影，`shadow` 才加。
- Toast 用 `--animal-shadow-sm`；Modal/Drawer 用库自带阴影。
- 禁止冷黑色阴影（`rgba(0,0,0,.2)`）与多层大模糊阴影。

### 5.3 层级

全站只使用以下层级，不新增随机 `z-index`：

| 层级 | 值 | 内容 |
| --- | --- | --- |
| 内容 | 0 | 页面主体、Card、表格 |
| 吸顶顶栏 | 100 | `.app-header` |
| 侧栏 | 110 | `.app-sider` |
| 浮动下拉 | 120 | `selectFloat` 选项面板 |
| Modal | 1000 | 库默认遮罩/弹窗 |
| Drawer | 2000 | 库默认抽屉 |
| Toast | 4000 | `.app-toast-host` |
| 打印浮层 | 9999 | 仅打印相关 |

---

## 6. 动效

### 6.1 时长与缓动

```css
--animal-motion-duration-fast: 0.15s;
--animal-motion-duration-base: 0.25s;
--animal-motion-duration-slow: 0.35s;
--animal-motion-ease: cubic-bezier(0.4, 0, 0.2, 1);
```

- 只允许 0.15 / 0.25 / 0.35s；不要用 `ease`、`linear` 做通用过渡。
- Hover：按钮/输入框 `translateY(-1px)`；Card `translateY(-2px)`。
- Active：主按钮 `translateY(2px)` 并回落到 1px 阴影。
- 出现：淡入 + 轻微缩放（0.92→1）；不要从屏幕外飞入。

### 6.2 动效边界

- 只动画 `transform` / `opacity` / 颜色；不要动画 `width/height/top/left`（会造成布局抖动）。
- 一个视口内最多一个循环动画（加载 spinner）；`Typewriter` 只用于首页标语，不承载关键信息。
- 必须尊重 `prefers-reduced-motion: reduce`：自定义动画要提供 `animation: none` / `transition: none` 兜底；
  库组件已有部分支持，但 `Typewriter` 没有，因此不能把它放在表单、状态、错误信息里。
- 加载态不能改变按钮尺寸；不能因为 loading 让页面跳动。

---

## 7. 图标与图形

- 图标一律来自 `naive-icons`；禁止 emoji、Unicode 符号（✓ ✕ →）、手写 SVG 或第三套图标库。
  唯一例外是 `Cursor`（CSS 光标必须是图片 URL）。
- 尺寸：12px（面包屑分隔、内联）、14px（小按钮/后缀）、18px（侧栏、正文图标）、22–26px（署徽标）、
  30–36px（服务卡/类型卡）。
- 颜色继承 `currentColor`；图标不单独使用品牌色承载语义时，必须与文字同色或使用状态色（并配文字）。
- 纯装饰图标 `aria-hidden="true"`；只有图标的按钮必须 `aria-label`（菜单、铃铛、退出、语言）。
- 头像用 `Avatar`，文字头像取显示名首字；不要用 emoji 当头像。
- 业务二维码用 `qrcode` 生成，放在白色/奶油底上，四周留 ≥10px 静区；QR 不参与圆角卡片裁切。

---

## 8. 无障碍基础（全站底线）

目标：**WCAG 2.2 AA**。本版不宣称已整体达标，存量差距见 [06 QA §6.5](./06-qa.md#65-已知偏差登记)。

| 项目 | 要求 |
| --- | --- |
| 正文对比度 | ≥ 4.5:1；大号文字（≥18.66px/700 或 ≥24px）≥ 3:1 |
| 非文本 UI | 控件边界、图标、焦点指示 ≥ 3:1（对比相邻颜色） |
| 键盘 | 所有交互可 Tab 到达；Enter/Space 触发；Esc 关闭弹层；方向键用于 Tabs/Select/Radio；无键盘陷阱 |
| 焦点可见 | `:focus-visible` 始终可见；不得 `outline: none` 而没有替代；焦点顺序与视觉顺序一致；弹窗关闭后焦点回到触发元素 |
| 焦点不被遮挡 | WCAG 2.2 **2.4.11（AA）**：焦点元素不能被 sticky 顶栏/底栏、Toast、浮层完全盖住；见 §8.2 |
| 焦点外观 | 参考 **2.4.13（AAA）** 作为内部质量线：≥2px 周长、offset ≥2px、对相邻颜色 ≥3:1；见 §8.2 |
| 目标尺寸 | WCAG 2.2 **2.5.8（AA）** 最低 24×24 CSS px（有例外）；项目密集后台 32×32，主操作/移动端 ≥44×44 |
| 触控 | 视觉尺寸可以更小，但可点区域不能小；平台差异见 §8.1 |
| 标题 | 每页一个 `<h1>`；层级不跳；`Title` 只是视觉，不代替语义 |
| 语言 | `document.documentElement.lang` 随 `zh-CN`/`zh-TW` 切换；中文/繁体都要测试 |
| 表单 | 每个输入有可见 label；必填有文字说明；错误贴近字段；`autocomplete` 正确（username/current-password/new-password） |
| 图片 | 有信息量的图必须有 `alt`；装饰图 `alt=""`；二维码旁必须有可读编号 |
| 缩放 | 200% 浏览器缩放 + 320px 宽不丢内容、不横向滚动 |
| 动效 | 尊重 reduced motion；无自动播放的闪烁/循环装饰 |
| 悬停 | 悬停不能是唯一入口；触摸设备没有 hover，关键信息/操作必须在点击/聚焦时也能获得 |
| 错误 | 不只靠红色；文字说明“发生了什么 + 怎么改”；未知错误码回退到通用文案，不显示原始 key |

### 8.1 触控尺寸对照

| 场景 | 视觉高度 | 可点区域 | 说明 |
| --- | --- | --- | --- |
| 表格行内操作 | 32px（`Button size="small"`） | ≥32×32 | 密集后台；按钮间距 ≥4px |
| 顶栏图标 | 32px | ≥32×32 | 菜单/铃铛/退出/语言 |
| 表单控件 | 40px（middle）/48px（large） | 与视觉同高 | 申请表单统一 large |
| 主操作（移动端） | 48px | ≥48×48 | 提交、确认、下一步 |
| 移动端导航 | 40–48px | 整行可点 | 侧栏抽屉、署内 Tab |

> “视觉尺寸”和“可点区域”可以不同：图标 18px 可以放在 44px 的按钮里；不要把图标本身做成 44px。

> **平台差异不要混成一个数**：WCAG 2.2 AA 的 24×24 CSS px 是最低要求（不是推荐按钮高度）；
> Android 触控目标建议 48×48 dp；iOS/iPadOS 默认控件 44×44 pt、最低 28×28 pt，且要留控件间距。
> 本项目 Web 统一取 32（密集后台）/ 44+（主操作与移动端）。

### 8.2 焦点外观与“不被遮挡”

- 键盘焦点必须由设计稿明确给出，不要让开发等浏览器默认样式再补。
- **可见**：`:focus-visible` 用 2px 环 + 2px offset；鼠标点击不强制显示（避免噪音）。
- **对比**：焦点环对相邻颜色 ≥3:1。当前库的薄荷环（1.97:1）与暖黄环（1.36–1.49:1）不足，
  需要深色内环/双环兜底（见 [06 QA D-06](./06-qa.md#65-已知偏差登记)）。
- **不被遮挡**：sticky 顶栏约 53px，可聚焦内容加 `scroll-margin-top: 64px`（顶栏 + 8px 呼吸）；
  Toast 不能长期停留在焦点上方；弹窗打开时背景用 `inert`/焦点陷阱隔离。
- **顺序**：焦点顺序与视觉顺序一致；自定义 `tabIndex` 只用于正数以外的场景，不用正数打乱顺序。
- **返回**：Modal/Drawer 关闭后焦点回到触发按钮；路由切换后焦点落到页面 `<h1>` 或主内容。

---

## 9. 内容语气（基础）

- 按钮用**动词开头**：`提交申请`、`保存草稿`、`标记已读`、`撤回`；不要用“确定”“好的”作为主操作。
- 错误文案回答“发生了什么 + 怎么办”：`材料不完整，请补充头像后再提交`，不要只写“失败”。
- 空状态区分三种：**没有数据**（`暂无记录`）、**没有权限**（`你没有访问该署的权限`）、**加载失败**（`加载失败，请重试` + 重试按钮）。
  失败不能渲染成空列表。
- 不可逆动作的确认文案要说明后果：`撤回后需重新提交申请`；按钮用危险色。
- 日期、数字、编号：统一用 `fmtDate`/`fmtDateTime`；长编号不省略；统计数字用 `tabular-nums`。
- 所有可见文案走 `t()`；服务端内容走 `_tw` 双语列；不要在组件里写中文/英文常量。