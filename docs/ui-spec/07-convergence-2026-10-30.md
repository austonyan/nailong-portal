# 07 · 收敛验收报告（2026-10-30）

> 本报告记录 2026-10-30 这批 UI 规范收敛的最终结论。范围是 [06 QA §6.5](./06-qa.md#65-已知偏差登记)
> 里的 **P0 三条 + P1 八条 + P2 六条**，依据是 `docs/ui-spec` 的十条硬规则、Foundations 的颜色/标题语义
> 与 QA §6.4 的对比度验收线。每条结论都附文件:行或 grep/命令输出；没有证据的条目不算已修。

---

## 1. 概述

### 1.1 本批范围

| 优先级 | 偏差 | 结果 |
| --- | --- | --- |
| P0 | D-01、D-02、D-05 | 全部已修 |
| P1 | D-03、D-04、D-06、D-07、D-08、D-17、D-22、D-23 | 全部已修（D-04/D-06/D-07 的残余同批闭合，见 §4） |
| P2（顺手） | D-09、D-13、D-16、D-19、D-20、D-21 | 全部已修 |

未覆盖：D-10、D-11、D-12、D-14、D-15、D-18、D-24，见 §5。

改动规模：`git diff --stat` 为 238 个文件、+2850 / −1554 行（含文档）。

### 1.2 验证方式

三种证据分开标注，不混用：

1. **确定性检查**（脚本/命令，可复现）：`check:i18n`、`check:ui`、`check:tokens`、`vite build`、`oxlint`，以及
   `grep` 计数（禁用 token、`<h4>`、`slice(0, 10)`、`total > 10`、`font-size: 11px`、`autoComplete`、`<h1>`）。
2. **计算**：对比度按 WCAG 2.2 相对亮度公式，用运行时 `:root` 里的真实色值计算。
3. **人工判断**：语义映射（哪个状态算“成功/中性/提醒”）、标题层级归属。这类结论标注为“判断”。

**没有做浏览器 computed-style 实测**，也没有跑 6 档视口与键盘走查（见 §6）。

---

## 2. 门禁结果（本批最终一次运行，实测）

```text
$ node scripts/check-i18n.mjs
[i18n] 扫描 254 个源文件，3309 个静态 key，217 个动态前缀
[i18n] zh-CN 5137 个 key，zh-TW 5137 个 key
[i18n] 通过：源码引用、动态前缀与枚举值均有简繁词条。

$ node scripts/check-ui-conventions.mjs
UI conventions OK (135 tables, 176 dialogs, 19 tabs checked).

$ node scripts/check-tokens.mjs
检查 9 个文件，48 个 token，0 个错误，0 个警告

$ node node_modules/vite/bin/vite.js build      # 退出码 0
$ node node_modules/oxlint/bin/oxlint
Found 180 warnings and 0 errors.
```

> `oxlint` 的 180 条是存量警告（基线 198 条），本批未新增错误。
> Windows 下 `npm` 无法被直接 spawn，因此门禁统一用 `node <脚本>` 调用，等价于 `npm run check:*`。

---

## 3. 逐项结论

| 编号 | 结论 | 证据（文件:行 / 命令输出） | 判定方式 |
| --- | --- | --- | --- |
| D-01 | **已修** | `src/index.css:59-68` 统一焦点规则：`a/button/[role="button"]/[role="tab"]/[tabindex]/input/textarea/select:focus-visible` → `outline: 2px solid var(--animal-text-color)` + `offset 2px`；`grep -rn "outline: *none" src --include=*.css` = 0 | 确定性（grep） |
| D-02 | **已修** | `--animal-border-radius-md` / `--animal-danger-color` / `--animal-focus-yellow` / `--animal-success-color-bg` / `--animal-warning-color-bg` 在 `src/**/*.css` 归零；`check-tokens` 0 错误 0 警告（含固定 9 个 CSS、48 个合法 token） | 确定性（脚本） |
| D-03 | **已修** | `<Card color=` 归零，`pattern=` 89 处（Portal 服务卡 `pattern={s.color}`、SSO 卡 `pattern="app-teal"`）。**规范原文的 `type="pattern"` 是错的**：运行时 `CardType = 'default' \| 'dashed'`，花纹是独立 `pattern` prop（`node_modules/animal-island-ui/dist/types/components/Card/Card.d.ts:2,11`），已在 06-qa D-03 行更正 | 确定性（grep）+ 类型文件 |
| D-04 | **已修** | 状态表全部 `variant="soft"`；同语义跨署统一：`valid`/`used` → `app-green`（`pages/visa/shared.jsx:19-20`、`pages/resident/shared.jsx:22`、`pages/protocol/shared.jsx:29-30,72-73,80,99`、`pages/archives/shared.jsx:75,80`、`pages/appeal/shared.jsx:45`、`components/immigration/shared.jsx:24`、`components/dip/shared.jsx:34`、`api/docs.js:56-57`）；`invalid` → `app-red`（`immigration:27`、`dip:35`、`archives:77`）；`frozen` → `warm-peach-pink`（`protocol:34,90`、`dip:26`、`resident:23`）；`closed` → `brown`（全署）。`api/docs.js:46-60` 的 `default`/`app-yellow`/`app-orange` 已清 | 确定性（grep）+ 语义判断 |
| D-05 | **已修** | `src/index.css:265-270` `.sider-link.active` = 棕色字 + `--animal-primary-color-bg` + `font-weight: 700` + `box-shadow: inset 3px 0 0`；`.sider-sublink/.visa-nav-link/.docs-tab/.docs-type-option/.im-subnav-link/.dip-subnav-link/.res-nav-link/.appeal-nav-link` 同规则。对比度 `#794f27` / `#e6f9f6` = **6.50:1** | 计算 + grep |
| D-06 | **已修** | `src/index.css:70-88` 用 `!important` 覆盖库内焦点环：Button/Switch/Checkbox/**Radio**、Input、**Rate 星标**（`[class*="animal-input-"]:focus-visible ~ [class*="animal-star-"]`）、**DatePicker 日历日格**（`[class*="animal-cell-"]`）。实际色 `#794f27`，对 `#f8f8f0` = **6.65:1**、对卡片 `#f7f3df` = **6.36:1**；库内 focus 规则无 `!important`（级联必然让位） | 计算 + 源码级联 |
| D-07 | **已修** | `grep -rl "<h1" src/pages` = 195 个文件、`<h1` 共 200 个；多于 1 个的只有 4 个文件且均为运行时互斥分支：`PostalNotices` 2（`if (id)` 详情 / 列表）、`VisaApplyForm` 2 与 `AppealApply` 2（`if (submitted)` 提前返回 / 主表单）、`ResidentApply` 3（`TypePicker`、`submitted` 两个提前返回 / 主表单）。`<h4>` = 0；`<h2>` 220 / `<h3>` 55。3 个提交成功页补 `h1.page-title-card`（`VisaApplyForm.jsx:223`、`AppealApply.jsx:140`、`ResidentApply.jsx:192`），`.page-title-card` 在 `src/index.css:30-35`。Shell/Layout/shared.jsx 无 h1 | 确定性（计数）+ 判断 |
| D-08 | **已修** | `Portal.jsx:145` 服务卡 `role="button"` + `tabIndex` + `onKeyDown`（Enter/Space，Space `preventDefault`）；`VisaMessages.jsx:115` 消息卡同构；各署可点卡片同批补 | 确定性（grep） |
| D-09 | **已修** | `AppLayout.jsx:38` `<a className="skip-link" href="#main">`、`:96` `<main id="main" tabIndex={-1}>`；样式 `src/index.css:100-116`；词条 `common.skipToContent` 已加 zh-CN/zh-TW | 确定性（grep）+ check:i18n |
| D-13 | **已修** | 屏幕 UI `font-size: 11px` 归零（`grep -rn "font-size: *11px" src --include=*.css` = 0）；打印块内的装饰字同步收敛 | 确定性（grep） |
| D-16 | **已修** | `src/pages` 内 `fmtDateTime(...).slice(0, 10)` 归零（`grep -rn "\.slice(0, *10)"` = 0），改用 `fmtDate(...)`；涉及签注、入境、居民三署 | 确定性（grep） |
| D-17 | **已修** | `Login.jsx`/`Register.jsx`/`Setup.jsx` 共 6 处 `autoComplete`（`username` / `current-password` / `new-password`） | 确定性（grep） |
| D-19 | **已修** | 签注与申诉工作台的 `total > 10` 改为与模块级 `PAGE_SIZE` 比较；`grep -rn "total > 10"` = 0 | 确定性（grep） |
| D-20 | **已修** | `src/index.css:6064` 全局 `@page { size: A4; margin: 16mm; }`（仅一处） | 确定性（grep） |
| D-21 | **已修** | 新增 `scripts/check-tokens.mjs`：从 `node_modules/animal-island-ui/dist/index.css` 的 `:root` 提取合法 `--animal-*`，不存在的名字判错退出 1，裸颜色只告警；`package.json` 的 `build` 已串入 `check:tokens` | 确定性（运行脚本） |
| D-22 | **已修** | `src/index.css:597` `.auth-links a` 棕色 + `text-decoration: underline` 常显；`:785` `.stat-number` 棕色 + `font-variant-numeric: tabular-nums`；`.visa-link` / `.service-url` 同批 | 计算 + grep |
| D-23 | **已修** | `:root` 定义 `--nl-focus-scroll-margin: 64px`；`:where(a,button,input,select,textarea,[tabindex]):focus-visible { scroll-margin-top: … }` + `html { scroll-padding-top: … }`（`src/index.css:90-98`） | 确定性（grep） |

### 3.1 补充：本批的四处规范/运行时冲突（已按运行时处理）

1. **`Card type="pattern"` 不存在**：`CardType` 只有 `default`/`dashed`，花纹是 `pattern` prop。规范 01 §1.5 与 06 §6.5 D-03 的写法已按运行时更正。
2. **`--animal-focus-yellow` 不在 `:root`**：按 02 Tokens §4.3 改用棕色文字色作为焦点环（不是冷蓝，6.65:1）。
3. **`--animal-*-color-bg` 系列不存在**：用 `color-mix(in srgb, … 16–18%, var(--animal-bg-color))` 生成浅底。
4. **`--animal-text-color-muted` 等于主文字**：依赖“更浅层级”的地方改为 13px + 主文字，不再靠色值。

---

## 4. 本批中途判“未修”、现已闭合的残余

| 编号 | 原问题 | 本轮处理与证据 |
| --- | --- | --- |
| D-06-residual | Radio（7 个页面）、Rate（3 处）、DatePicker 日历日格的焦点环是 `#f5c31c` 1.55:1 / `#19c8b9` 1.97:1 | `src/index.css:77-88` 补 `input[type="radio"]`、日历日格与 Rate 星标选择器，统一棕色 6.65:1 |
| D-07-skip | 6 个页面 18 处 `<h4>` 直接挂在 h2/h1 下（跳级） | 6 个文件全部改为 `<h3>`（`VisaHome` 4、`AppealHome` 5、`ProtocolMessages` 3、`ProtocolHelp` 3、`ProtocolHome` 2、`DipHome` 1），`<h4>` 归零；卡片样式选择器同步改为 `:is(h3, h4)`，视觉不变 |
| D-07-h1（提交成功页） | `VisaApplyForm` / `AppealApply` / `ResidentApply` 的 submitted 分支整屏以 h3 作首标题 | 改为 `h1.page-title-card`（16px/700，沿用卡片内标题视觉） |
| D-04 一致性 | 同一语义跨署不同色（valid/used/invalid/frozen） | 四个语义各自统一（见 §3 D-04），`src/api/docs.js` 共享表同批清理 |

---

## 5. 未覆盖项与原因

| 编号 | 状态 | 原因 |
| --- | --- | --- |
| D-10 | 未覆盖 | `--animal-text-color-secondary`（2.86:1）在 94 处用于说明文字，逐处判断“是否承载信息”需要人工过一遍，本批未做 |
| D-11 | 未覆盖（上游） | danger primary 白字 3.63:1 / Button loading 白字 2.19:1，需主题级深红/深青或上游修复 |
| D-12 | 范围外 | 暗色模式是范围决定，不是缺陷（README §5） |
| D-14 | 未覆盖（上游） | Input 默认边界 1.33:1，需自定义控件或上游修复 |
| D-15 | 未覆盖（上游） | Table 空态文字 2.74:1，属库内样式 |
| D-18 | 未覆盖 | 5 份 `*-textarea` 重复样式抽公共组件的重构，无视觉收益、回归风险高 |
| D-24 | 未覆盖 | 离线横幅 + 离线禁用写操作是功能开发（需要全局状态与逐表单接入），不是样式收敛 |

---

## 6. 必须人工验收的部分

机器只能证明 CSS 级联、计数、行号与色值。下面必须在真实环境确认：

1. **真实环境 Design QA**：真实后端数据、真实字体/浏览器、不同角色权限、慢网。
2. **6 档视口**：360 / 640 / 720 / 900 / 1024 / 1440，另测手机横屏 720×360 与桌面分屏 1024×700；看横向滚动、卡片列数、表格换行、筛选堆叠、弹窗溢出。
3. **键盘走查**：只用 Tab / Shift+Tab / Enter / Space / Esc / 方向键。重点复测 Radio（7 处）、Rate（3 处）、DatePicker 日格、跳过链接与 `scroll-margin-top`；确认焦点环实际渲染为 `#794f27`（本报告只做了级联判定）。
4. **200% 浏览器缩放**：文字不裁切、按钮不重叠、弹窗可操作。
5. **简繁切换**：zh-CN / zh-TW 下标题（本批动了 195 个页面的标题层级）、按钮、表格、弹窗不溢出、不出现 key。

---

## 7. 本批文档变更

- [06 QA §6.5](./06-qa.md#65-已知偏差登记)：17 条偏差的“处理”列追加“已修（2026-10-30）”与位置；D-03 的 `type="pattern"` 更正为 `pattern="<color>"`。
- [02 Tokens §3](./02-tokens.md)：`--nl-focus-ring` / `--nl-focus-offset` / `--nl-focus-scroll-margin` 标注为已在 `src/index.css` `:root` 定义。
- [01 Foundations §2.4](./01-foundations.md)：删掉“全仓库 0 个 h1”的过期描述。
- [README §9](./README.md#9-变更记录)：1.1.1 一行改为记录整批范围。
- 本文件。

---

## 8. 下一批建议

1. 先做 §6 的人工 Design QA，把真实环境问题补进 §6.5。
2. 再收 D-10（逐处判断 secondary 是否承载信息）与 D-24（离线横幅 + 写操作禁用）。
3. 上游类（D-11 / D-14 / D-15）整理成 issue，推动 `animal-island-ui` 修复；不要在本仓继续加 `!important` 补丁。
4. 新增页面按 [06 §6.6.2 Definition of Done](./06-qa.md#662-definition-of-done) 验收，避免新的存量偏差。