# 02 · Tokens 设计决策

> 这一层回答“同一个决定如何被所有页面复用”。颜色/圆角/阴影/动效以
> `animal-island-ui@2.3.0` 的运行时 CSS 变量为准；布局尺寸用项目自己的 `--nl-*` 常量。
> 机器可读导出见 [tokens.json](./tokens.json)。

---

## 1. 三层 token

| 层 | 例子 | 谁能改 | 存在形式 |
| --- | --- | --- | --- |
| 原始值（primitive） | `#19c8b9`、`4px`、`0 5px 0 0 #bdaea0` | 上游库 / 本规范修订 | 不出现在业务 CSS 中 |
| 语义 token | `--animal-primary-color`、`--animal-spacing-lg`、`--animal-radius-sm` | 上游库 + 本规范 | `:root` CSS 变量 |
| 组件 / 布局 token | `.form-actions` gap 12px、`--nl-content-max: 1440px`、Modal 560px | 本项目 | CSS 规则 / `--nl-*` 变量 / 规范常量 |

**业务代码只消费第 2、3 层。** 直接写 `#19c8b9`、`12px`、`0 5px #bdaea0` 都属于绕过 token。

---

## 2. 运行时 token 全量清单（v2.3.0）

以下 48 个变量来自 `node_modules/animal-island-ui/dist/index.css` 的 `:root`，是浏览器里真实生效的值。

### 2.1 主色与状态色

| Token | 值 | 说明 |
| --- | --- | --- |
| `--animal-primary-color` | `#19c8b9` | 品牌薄荷；装饰/选中底/图标，**不用于正文** |
| `--animal-primary-color-hover` | `#3dd4c6` | 悬停 |
| `--animal-primary-color-active` | `#50b9ab` | 按下（上游文档写 `#11a89b`，已过期） |
| `--animal-primary-color-bg` | `#e6f9f6` | 浅底 |
| `--animal-success-color` | `#6fba2c` | 成功填充/图标 |
| `--animal-success-color-hover` | `#85cc45` | 悬停 |
| `--animal-success-color-active` | `#5a9e1e` | 按下 |
| `--animal-warning-color` | `#f5c31c` | 警告填充；Radio/Checkbox 焦点用此色 |
| `--animal-warning-color-hover` | `#f7d04a` | 悬停 |
| `--animal-warning-color-active` | `#dba90e` | 按下 |
| `--animal-error-color` | `#e05a5a` | 错误边框/危险按钮底 |
| `--animal-error-color-hover` | `#e87878` | 悬停 |
| `--animal-error-color-active` | `#c94444` | 按下/危险按钮 3D 阴影 |

### 2.2 文字

| Token | 值 | 说明 |
| --- | --- | --- |
| `--animal-text-color` | `#794f27` | 主文字；对 `#f8f8f0` 为 6.65:1 |
| `--animal-text-color-secondary` | `#9f927d` | 2.86:1；只用于装饰，不承载需要阅读的信息（大号也不足 3:1） |
| `--animal-text-color-muted` | `#794f27` | **运行时等于主文字**，不是更浅的层级 |
| `--animal-text-color-disabled` | `#c4b89e` | 1.84:1；禁用态豁免，但不得用于可交互内容 |

### 2.3 背景与边框

| Token | 值 | 说明 |
| --- | --- | --- |
| `--animal-bg-color` | `#f8f8f0` | 页面/顶栏 |
| `--animal-bg-color-secondary` | `#f0e8d8` | 侧栏、提示条、次级面 |
| `--animal-bg-color-disabled` | `#f0ece2` | 禁用底 |
| `--animal-border-color` | `#dcd8d1` | 1.33:1；默认边框/分隔 |
| `--animal-border-color-hover` | `#827157` | 4.42:1；需要可识别边界的自定义控件 |
| `--animal-border-color-light` | `#e8e2d6` | 浅分隔/表格虚线 |
| `--animal-mask-bg` | `rgba(0,0,0,.35)` | 弹层遮罩 |

### 2.4 字体、间距、圆角、边框宽

| Token | 值 | 说明 |
| --- | --- | --- |
| `--animal-font-family` | `Nunito, "Noto Sans SC", …` | 唯一字体族 |
| `--animal-font-size-sm` | `12px` | 小号/标签 |
| `--animal-font-size-base` | `14px` | 基准正文 |
| `--animal-font-size-lg` | `16px` | 大号正文 |
| `--animal-line-height-base` | `1.5715` | 库基准行高 |
| `--animal-spacing-xs` | `4px` | 间距 1 |
| `--animal-spacing-sm` | `8px` | 间距 2 |
| `--animal-spacing-md` | `12px` | 间距 3 |
| `--animal-spacing-lg` | `16px` | 间距 4 |
| `--animal-spacing-xl` | `24px` | 间距 5 |
| `--animal-border-radius-sm` | `16px` | 小容器/标签（文档写 12px，已过期） |
| `--animal-border-radius-base` | `18px` | 常规容器 |
| `--animal-border-radius-lg` | `24px` | 大容器/Hero |
| `--animal-border-width` | `2px` | 默认边框宽 |

### 2.5 阴影、动效、控件高度

| Token | 值 | 说明 |
| --- | --- | --- |
| `--animal-shadow-sm` | `0 2px 4px 0 rgba(61,52,40,.06)` | 轻柔高程；Toast/default 按钮 |
| `--animal-shadow-base` | `0 3px 10px 0 rgba(61,52,40,.1)` | hover 高程 |
| `--animal-shadow-lg` | `0 8px 24px 0 rgba(61,52,40,.14)` | 大浮层（库内） |
| `--animal-motion-duration-fast` | `.15s` | 快速 |
| `--animal-motion-duration-base` | `.25s` | 常规 |
| `--animal-motion-duration-slow` | `.35s` | 慢速 |
| `--animal-motion-ease` | `cubic-bezier(.4,0,.2,1)` | 唯一缓动 |
| `--animal-height-sm` | `32px` | 小按钮/输入 |
| `--animal-height-base` | `40px` | 中按钮/输入（Button middle 实际 45px） |
| `--animal-height-lg` | `48px` | 大按钮/输入 |

---

## 3. 项目级布局 token（`--nl-*`）

组件库没有页面布局变量，项目自定义样式需要一组**只含尺寸、不含颜色**的常量。
新增 `--nl-*` 必须满足：只描述布局、不能替代 `--animal-*` 的颜色/圆角/阴影、必须在本文登记。

> 下表的 `--nl-*` 多数是**规范保留名**，落地时在 `:root` 定义。当前
> `--nl-focus-ring` / `--nl-focus-offset` / `--nl-focus-scroll-margin` **已在 `src/index.css` 的
> `:root` 定义**（`2px` / `2px` / `64px`，块位于 `src/index.css:43-47`、声明在 44-46 行），并由全局焦点规则与
> `scroll-margin-top` / `scroll-padding-top` 使用；`--nl-select-*` 由 `selectFloat.css` /
> `selectFloat.js` 在运行时写入（带回退值），其余暂以常量/类名形式使用。
> 这不影响规则的执行：新代码需要时按此命名，不要再造 `--app-*` / `--ui-*`。

| Token / 常量 | 值 | 用途 |
| --- | --- | --- |
| `--nl-content-max` | `1440px` | 顶栏与 `.app-main` 最大宽度 |
| `--nl-sider-width` | `260px` | 管理员侧栏 |
| `--nl-page-pad` | `24px` | 页面内边距；顶栏在 ≤640px 时用 16px |
| `--nl-auth-width` | `400px` | 登录/注册卡片 |
| `--nl-setup-width` | `580px` | 首次引导卡片（`AuthLayout width={580}`） |
| `--nl-dialog-sm` | `460px` | 确认/短表单 Modal |
| `--nl-dialog-md` | `560px` | 标准表单/详情 Modal |
| `--nl-dialog-lg` | `640px` | 宽表单 |
| `--nl-dialog-xl` | `720px` | 极宽内容（少用） |
| `--nl-drawer-nav` | `280px` | 移动端导航抽屉 |
| `--nl-drawer-msg` | `440px` | 站内信抽屉 |
| `--nl-drawer-detail` | `560px` | 详情抽屉 |
| `--nl-drawer-wide` | `640px` | 工作台详情/复核抽屉 |
| `--nl-toast-max` | `560px` | Toast 最大宽度 |
| `--nl-grid-card` | `240px` | 服务/类型/指南卡最小列宽 |
| `--nl-grid-stat` | `220px` | 统计卡最小列宽 |
| `--nl-grid-form` | `220px` | 表单两列最小列宽 |
| `--nl-field-label` | `110px` | 详情字段标签列 |
| `--nl-focus-ring` | `2px` | 焦点环宽（已在 `src/index.css` `:root` 定义） |
| `--nl-focus-offset` | `2px` | 焦点环偏移（同上） |
| `--nl-focus-scroll-margin` | `64px` | 焦点不被 sticky 顶栏遮挡的滚动留白（同上） |

**断点是常量，不是 CSS 变量**（CSS 变量不能用于媒体查询）：

| 断点 | 含义 |
| --- | --- |
| `1440px` | 内容最大宽度 |
| `1025px` | 侧栏常驻下限（≤1024 收进抽屉） |
| `900px` | 复杂三栏/工作台收窄 |
| `720px` | 部分署内页/打印前收窄 |
| `640px` | 手机：顶栏换行、文字按钮隐藏、顶栏 padding 16 |
| `360px` | 最小验收宽度（320 也应尽量可用） |

---

## 4. 使用规则

### 4.1 必须

- 颜色、圆角、阴影、字体、动效：`var(--animal-*)`。
- 页面布局尺寸：`var(--nl-*)` 或本文常量；不要临时写 13px/17px/23px。
- 需要新 token：先在本文 + `tokens.json` 登记，再写代码。
- token 必须真实存在：`var(--animal-xxx)` 的名字要和运行时 `:root` 完全一致；可选 token 必须给真实回退值。
- **设计稿与代码使用同名语义**：设计里叫 `text-secondary`，代码就叫 `text-secondary`；不要设计叫“灰色 2”、
  代码叫 `#667085`。`tokens.json` 是设计工具与代码之间唯一的对照表。

### 4.2 禁止

- 全局覆盖 `--animal-*` 来做“主题定制”；品牌色变更必须走版本 + 对比度复测。
- 用 `!important` 覆盖组件颜色/圆角/阴影（`selectFloat.css` 的定位 `!important` 是既有例外，仅限定位）。
- 写 `--animal-danger-color`、`--animal-border-radius-md`、`--animal-info-color` 这类不存在的名字。
- 用 `rgba(0,0,0,.x)` 做暖色界面阴影。
- 在业务组件里写 `#fff`/`#000`/`#f5f5f5`。

### 4.3 已发现的 token 完整性问题（必须修）

| 位置 | 问题 | 后果 | 处理 |
| --- | --- | --- | --- |
| `src/index.css`、`src/pages/archives/archives.css`、`src/pages/tourism/tourism.css` | `--animal-border-radius-md` 不存在 | 整条 `border-radius` 声明失效 → 直角 | 换 `--animal-border-radius-base`（18px）或 `--animal-border-radius-lg` |
| `src/index.css` `.res-change-reject` 等 3 处 | `--animal-danger-color` 不存在 | 回退到 `#d9534f` 裸色 | 换 `--animal-error-color` |
| `src/index.css` 多处 | `--animal-focus-yellow` 不在 `:root` | 无回退时焦点色失效 | 用 `#ffcc00` 的库内回退，或改 `--animal-warning-color`（`#f5c31c`） |
| `src/index.css` | `--animal-warning-color-bg` / `--animal-success-color-bg` 不存在 | 永远走 `rgba` 回退 | 用 `--animal-warning-color` + `color-mix`/浅底规则，或登记新 token |
| `src/index.css` | 13 个裸 hex、4 个 `rgba()` | 难以主题化/对比度审计 | 逐项按 §4.4 处理 |

### 4.4 允许的裸色例外

只有以下场景可以出现裸色值，且必须在注释里写明原因：

1. **打印**：`@media print` 下的 `background: #fff`、票据纸白。
2. **二维码静区**：QR 容器/白底（`#fff`、`#fffdf2`）——QR 识别要求纯白/高对比。
3. **库内已有的白色文字**：如危险按钮白字、证书/签注实色卡白字；这是库的既有实现，
   能改则改（见 §6.5），不能改时不要在旁边再新增裸色。
4. **阴影/遮罩的透明黑**：仅限库 token 已定义的 `rgba(61,52,40,…)` 与 `--animal-mask-bg`。

---

## 5. DTCG 导出

[`tokens.json`](./tokens.json) 按 Design Tokens Community Group 2025 稳定版格式组织：

```json
{
  "color": {
    "$type": "color",
    "primary": {
      "$value": "#19c8b9",
      "$description": "品牌薄荷；装饰/选中底，不用于正文",
      "$extensions": { "com.nailong.css": { "variable": "--animal-primary-color" } }
    }
  }
}
```

用途：

- 设计工具/文档站读取同一份值，避免“文档写 `#11a89b`、代码是 `#50b9ab`”。
- 代码审查时可直接 diff `tokens.json`，而不是在 6000 行 CSS 里找 hex。
- 新增/修改 token 时，`tokens.json`、本文、代码三处必须同步。

> DTCG 规范不是 W3C Recommendation，但已经是设计工具与代码之间交换颜色/尺寸/字体的稳定格式。
> 本项目只使用 `color` / `dimension` / `fontFamily` / `fontWeight` / `duration` / `cubicBezier` / `number`
> 这几类 `$type`，不引入平台专用扩展。

---

## 6. 主题与暗色

- **浅色是唯一正式主题**。不允许页面级局部反色。
- 若未来做暗色：必须新增一整套 `--animal-*` 暗色值（不是简单反转），重新跑 [06 QA §6.4](./06-qa.md#64-对比度实测)
  的全部组合，并在 `tokens.json` 增加 `$extensions.com.nailong.theme.dark` 映射。
- 高对比/强制颜色模式：不覆盖系统色，保证文字/边框/焦点仍可见；装饰图案允许消失。

---

## 7. Token 变更流程

1. 说明动机：是修 bug、补语义，还是品牌变更。
2. 在本文表格 + `tokens.json` 更新值/说明。
3. 跑对比度复测（至少覆盖 §6.4 的正文、标签、按钮、焦点四组）。
4. 检查 `src/**/*.css` 是否还有旧值/裸值。
5. 在 [06 QA §6.5](./06-qa.md#65-已知偏差登记) 更新相关偏差状态。
6. 版本号：新增 token → minor；改既有 token 值 → major（会影响所有页面）。