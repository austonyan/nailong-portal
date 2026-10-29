# 03 · Components 组件契约

> 这一层回答“一个组件有哪些状态、什么时候能用、键盘怎么走”。
> 组件 API 以上游类型声明为准：`node_modules/animal-island-ui/dist/types/`。
> 本规范不重复列 props，只定义项目内的使用契约。

---

## 1. 总则

1. **优先库组件**：可见的 `<button>` / `<input>` / `<select>` / 原生 checkbox/radio 一律不用；
   用 `Button`、`Input`、`Select`、`Checkbox`、`Radio`、`Switch`。
2. **不发明 props**：任何未出现在类型声明或 `docs/design-system/components/*.md` 的 prop 都不写。
3. **一个视图一个主操作**：`type="primary"` 只给当前页面/弹窗最重要的动作；其余用
   `default` / `dashed` / `text` / `link`。同一区域出现两个并列 primary，视为层级缺陷。
4. **尺寸只有三档**：`small` 32px、`middle` 45px（Button；Input 40px）、`large` 48px。
   表单统一 `large`；筛选/表格工具条用 `middle`；表格行内/顶栏图标用 `small`。
5. **状态必须完整**：默认、hover、focus、active、disabled、loading、error、empty 至少在设计稿中出现一次。
6. **可点区域不等于视觉尺寸**：图标可以 14–18px，但按钮的可点区域不得小于 32×32；移动端主操作 ≥44×44。
7. **图标按钮必须有名字**：`aria-label={t('...')}`；装饰图标 `aria-hidden`。
8. **响应式只改尺寸/换行/堆叠，不改语义**：按钮可以从一行变全宽，表格可以换行，但不要把 Select 变成
   原生下拉、不要把 Dialog 变成新页面；窄屏细则见 [05 Layouts §3/§8](./05-layouts.md)。
9. **组件/变体必须能被代码直接对应**：设计稿里的每个按钮/卡片/标签都要能落到库组件或已登记的项目变体；
   不为单个页面新增一次性变体，否则组件库会比页面还难维护。

### 1.1 状态矩阵

`●` = 必须定义；`◐` = 按场景；`—` = 不适用。

| 组件 | 默认 | hover | focus | active/pressed | disabled | loading | error | 选中/展开 | 空/只读 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Button | ● | ● | ● | ● | ● | ● | — | — | — |
| Input | ● | ◐ | ● | — | ● | — | ● | — | ◐ 只读 |
| Select | ● | ● | ● | ● | ● | — | ◐ | ● 已选 | ● 无匹配 |
| Checkbox | ● | ● | ● | ● | ● | — | ◐ | ● 选中 | — |
| Radio | ● | ● | ● | ● | ● | — | ◐ | ● 选中 | — |
| Switch | ● | ● | ● | ● | ● | ◐ | — | ● 开/关 | — |
| DatePicker | ● | ● | ● | ● | ● | — | ● | ● 已选 | ● 禁用日期 |
| Upload | ● | ● | ● | — | ● | ● 上传中 | ● 失败 | ● 已上传 | ◐ 替换 |
| FormItem | ● | — | ● | — | ● | ◐ 校验中 | ● | — | ◐ help |
| Table | ● | ● 行 hover | ◐ 行内控件 | — | — | ● | ◐ 外部错误 | — | ● 空 |
| Pagination | ● | ● | ● | ● | ● | — | — | ● 当前页 | — |
| Tabs | ● | ● | ● | ● | ◐ | — | — | ● 当前页签 | — |
| Modal | ● | — | ● 焦点陷阱 | — | — | ● 确认中 | ◐ | — | — |
| Drawer | ● | — | ● 焦点陷阱 | — | — | ● 确认中 | ◐ | — | — |
| Tag | ● | ◐ 可点 | ◐ 可点 | — | ◐ | — | — | — | — |
| Toast | ● | — | — | — | — | — | ● | — | — |
| Collapse | ● | ● | ● | ● | ◐ | — | — | ● 展开 | — |

> 设计稿只画“默认 + hover”不算完成；上表 `●` 的状态必须能在实现里找到。

### 1.2 尺寸 / 内边距速查（库实际值）

| 组件 | small | middle | large | 备注 |
| --- | --- | --- | --- | --- |
| Button | 32px 高 / 左右 16 / 12px 字 / 16px 圆角 | 45px 高 / 左右 20 / 14px 字 / 50px 圆角 | 48px 高 / 左右 32 / 16px 字 / 24px 圆角 | 图标与文字 gap 8 |
| Input | 32px 高 / 左右 14 / 12px 字 / 40px 圆角 | 40px 高 / 左右 18 / 14px 字 / 50px 圆角 | 48px 高 / 左右 22 / 16px 字 / 50px 圆角 | 默认无阴影 |
| Tag | 24px 高 / 左右 10 / 12px 字 | 32px 高 / 左右 12 / 14px 字 | 40px 高 / 左右 16 / 16px 字 | 圆角 999 |
| Table | — | 单元格 14px 上下 / 20px 左右；表头 16px 上下 | — | 表头 14/700，正文 14/500 |
| Card | — | padding 16px 24px；圆角 20px | — | 无阴影 |
| Modal | 460px 宽 | 560px 宽 | 640/720px 宽 | 库默认 520 不在档位 |

> 这些是**库的实际值**，不要用自定义 CSS 把 Button 改成 40px、把 Input 改成 12px 圆角。
> 需要更紧凑时换 `size`，不要改 padding/height。

### 1.3 键盘行为速查

| 组件 | 键 | 行为 |
| --- | --- | --- |
| Button | Tab / Enter / Space | 聚焦 / 触发 |
| Input | Tab / 输入 / Enter | 聚焦 / 输入 / 在表单内提交（若为 submit） |
| Select | Enter/Space / ↑↓ / Enter / Esc | 打开 / 移动 / 选中 / 只收起面板 |
| Checkbox | Space | 切换选中 |
| Radio | ↑↓/←→ | 在组内移动并选中（roving tabindex） |
| Switch | Space | 切换 |
| Tabs | ←→ / Home / End | 切换页签 / 首尾 |
| Modal / Drawer | Esc / Tab / Shift+Tab | 关闭 / 焦点循环 / 反向循环 |
| Upload | Enter / Delete | 打开文件选择 / 删除列表项 |
| Table | Tab | 进入行内操作；不要求整行可聚焦（除非整行可点） |

---

## 2. Button

**类型**

| type | 用途 | 视觉 |
| --- | --- | --- |
| `primary` | 当前视图唯一主操作（提交/确认/下一步） | 奶油底棕字 + 3D 沙色阴影 |
| `default` | 次要操作（取消、返回、查看） | 奶油底 + 2px 边框 + 柔和阴影 |
| `dashed` | 引导性/占位型入口（去验证、去补件） | 虚线边框 |
| `text` | 工具栏、行内、图标按钮 | 无边框无阴影 |
| `link` | 文本链式操作（少用） | 主色文字，仅限非关键入口 |

**状态与规则**

- hover：`default/dashed` 文字与边框转主色、上浮 1px；`primary` 阴影 5→6px；`active` 下压 2px。
- focus：2px 薄荷环 + 2px offset。薄荷对奶油底只有 1.97:1，**不能作为唯一焦点提示**；
  键盘走查时必须能看清（见 §6.5 D-06）。不要把 `outline` 去掉。
- disabled：`opacity: .5`，`cursor: not-allowed`，不再响应 hover。
- loading：必须同时 `loading` 与 `disabled`；按钮宽度不能跳；不要自己塞 spinner 图标。
- danger：删除/驳回/作废/吊销用 `danger`；`danger + primary` 只用于确认弹窗的最终确认。
- icon-only：`size="small"` + `aria-label`；不要只有图标没有名字。
- block：仅登录/注册/引导等单列表单；后台工具栏不要 block。

```jsx
<Button type="primary" loading={busy} disabled={busy} onClick={submit}>
  {t('common.submit')}
</Button>
<Button onClick={close} disabled={busy}>{t('common.cancel')}</Button>
```

**禁止**：一个弹窗里两个 primary；用 `text` 承载不可逆操作；把 3D 阴影套到 `default`。

---

## 3. Input / TextArea

**尺寸**

| size | 高度 | 场景 |
| --- | --- | --- |
| `small` | 32px | 表格内联编辑（少用）、紧凑工具条 |
| `middle` | 40px | 筛选、搜索、后台配置 |
| `large` | 48px | 申请表单、登录/注册、引导 |

- **同一行控件必须同尺寸**：`Input size="large"` 旁边的 `DatePicker` 也要 `size="large"`；
  不要出现 48px 输入 + 40px 日期框。
- 表单一律 `size="large"`；搜索/筛选用 `middle`；不要在表单里混用 small。

**状态**

- 默认无阴影（库默认 `wrapper-no-shadow`）；只有显式 `shadow` 才出现 3px 沙色阴影。
- hover 不改变背景；focus 由库提供暖黄环，但 **v2.3.0 的 Input 实际没有可见 focus 样式**
  （`outline: none` 且 wrapper 无 focus-within）——这是 §6.5 D-01 的 P0 偏差，新增表单前必须补。
- `status="error"`：红色 3px 底阴影，必须同时给错误文案；只有红边没有文字不合格。
- `status="warning"`：黄色底阴影 + 说明文字。
- disabled：灰底、`opacity .6`、不可聚焦；不要用 disabled 代替校验。
- readonly：用原生 `readOnly` 保留可聚焦/可复制/可被读屏读到；不要用 disabled 伪装只读。
- success：校验通过不额外加绿色边框（避免噪音）；需要时用 `help` 文案或图标。
- autofill：不要用 `:-webkit-autofill` 覆盖成白底白字；浏览器填充后文字/背景对比必须仍达标。
- allowClear：清除是安全操作时才用；密码、证件号等敏感字段不要一键清空。
- placeholder 是示例，不是 label；每个字段必须有可见 label（FormItem）。
- 文本域：项目有 5 份重复的 `visa-textarea/docs-textarea/dip-textarea/res-textarea/appeal-textarea`，
  新代码统一用 `src/pages/visa/shared.jsx` 的 `TextArea` 模式抽到共享组件，不再复制第 6 份。
- 登录/注册/引导必须写 `autocomplete`：`username`、`current-password`、`new-password`。

```jsx
<FormItem name="contact" label={t('visa.form.contact')} rules={[{ required: true, message: t('common.required') }]}>
  <Input size="large" allowClear maxLength={100} placeholder={t('visa.form.contactPlaceholder')} />
</FormItem>
```

---

## 4. Select

- **受控唯一**：`options` + `value` + `onChange` 三者必填；`value` 是 string，空值用 `''`。
- `options` 形状 `{ key, label }`；“全部”选项用 `key: ''`，不要用 `null`。
- 2–4 个选项且空间足够 → `Radio`；5 个以上 → `Select`；超过 8 个 → `showSearch`。
- 无可见 label 时必须 `aria-label`；有外部 label 时用 `aria-labelledby`。
- 面板由 `src/components/selectFloat.js` 全局接管：在触发器下方展开、空间不足上翻、
  收进最近裁剪容器。**不要在页面里另写定位/宽度覆盖**。
- 在 Modal/Drawer 内：面板不会被裁掉；Esc 只收起面板，不关闭外层弹窗。
- 空选项：`notFoundContent` 用 `t('common.empty')`，不要显示空白面板。
- 宽度：筛选条 150px 左右；表单内 100%；不要让 Select 在窄屏撑出横向滚动。

---

## 5. Checkbox / Radio / Switch

- **Checkbox**：多选、同意条款、批量选择。组必须有 `aria-label` 或可见组标题。
- **Radio**：互斥且选项少（2–4）；高圆化方形 + SVG 对勾是库的视觉，不要改成圆点。
- **Switch**：
  - 表格行内开关 = **立即保存**：点击即发请求，`loading/disabled` 防重复，成功后 toast，
    失败回滚到服务器状态（不要先改 UI 再等失败）。
  - 表单内开关 = 允许跟随后续“保存”一起提交，但保存按钮必须同屏可见；
    不允许“开关已改、页面没有任何保存入口”。
  - 必须用 `checked`，**禁止 `value`**（库不支持，显示会与服务器相反）。
  - 必须有 `aria-label` 或关联 label；不要用开关表达三态（用 Select/Radio）。
- 触控：Checkbox/Radio 的整行 label 可点，可点区域 ≥32px 高；不要只让 16px 小方块可点。

---

## 6. Form / FormItem / useForm

- 项目统一 `layout="vertical"`；`requiredMark` 显示 `*`；label 在上、控件在下。
- 必填用 `rules={[{ required: true, message: t('common.required') }]}`；
  文案不要只写“必填”，要写字段名或“请填写…”。
- 可选字段在 label 末尾加 `t('common.optional')`（`common.optional`），不要用灰色 placeholder 代替。
- 两列用 `.visa-form-grid` 模式（`repeat(auto-fit, minmax(220px, 1fr))`）；窄屏自动一列。
- 提交前 `validateFields()`；失败时保持在表单，不 toast 校验错误（错误已在字段下方）。
- 异步提交：`busy` 托管提交按钮；成功后按“关窗/重置 → toast → await load()”顺序；
  失败保持弹窗并 toast 服务端错误。
- 服务端字段错误映射到 `FormItem` 的 `help`/`validateStatus`；未知错误码回退到 `api.INTERNAL_ERROR`。
- 日期先后、数字范围等跨字段规则：两侧都挂 validator（库不实现 `dependencies` 的自动校验）。
- 长表单超过一屏：分节（Card/h3）+ 顶部进度或“保存草稿”；不要把所有字段塞进一个 Modal。

---

## 7. DatePicker / Upload

**DatePicker**

- 表单内 `size="large"`，与 Input 对齐；筛选条可用默认尺寸。
- 日期值统一 `YYYY-MM-DD` 字符串；提交前转 ISO/后端约定；显示用 `fmtDate`/`fmtDateTime`。
- 先后顺序在客户端先校验（抵达 < 离开），不要等提交后由服务端打回。
- 禁用日期、范围限制、清空都要有明确文案；不要只靠日历灰点。

**Upload**

- 私人材料走后端鉴权下载，不在前端暴露直链；上传用 `customRequest`。
- 单文件（头像）`maxCount={1}`（替换语义）；多材料 `maxCount` 明确上限。
- 必须展示：上传中（进度）、成功（文件名/预览）、失败（错误 + 重试/删除）。
- `accept` 与后端白名单一致；大小限制在前端提示、后端校验。
- 删除/替换是可恢复操作，但涉及已提交材料时要确认；确认弹窗用 `useConfirmAction`。
- 草稿未就绪时不要渲染可拖拽的上传区（会让用户以为能传）；显示“准备中”状态。

---

## 8. Table / Pagination

**Table**

- 每个 `<Table>` 必须 `className="table-fit"`；不传 `size`；列不写 `ellipsis`。
- 列宽用 `width` 提示，但允许换行；长文本 `overflow-wrap: anywhere`；**不横向滚动**。
- 操作列用 `.table-actions`（`display:flex; flex-wrap:wrap; gap:4px`），按钮 `size="small"`。
- 数值列 `align: 'right'` + `tabular-nums`；状态列左对齐；操作列右对齐。
- 加载：`loading={items === null}`，保留表头与容器高度，不要整页 spinner。
- 空：`emptyText={t('common.empty')}`；**失败不能当空**——失败要在表格外显示错误 + 重试。
- 行点击与行内操作不要冲突：可点击行用 `role`/`tabIndex` 或整行 Link；
  行内按钮点击必须 `stopPropagation`。
- 表格外层用 `Card` 包裹；不要在 Card 里再套一个带阴影的容器。

**Pagination**

- 服务端分页用外部 `<Pagination>`：`total`、`current`、`pageSize`、`onChange`、`showTotal`。
- 只有 `total > pageSize` 才显示；`Table` 自身 `pagination={false}`，避免双分页。
- 页码变化后滚动到表格顶部（或列表首行），不要停在页面底部。
- 每页条数：后台默认 10 或 20，保持一致；不要一页 10、一页 50。

---

## 9. Tabs

- 纯本地页签用 `defaultActiveKey`；需要 URL/外部状态驱动才用 `activeKey` + `onChange`。
- **传了 `activeKey` 就必须传 `onChange`**，否则页签被钉死在初始值（`check:ui` 会拦）。
- 页签数量 > 6 或标题很长时，改用左侧导航/Select；不要让 Tabs 横向溢出。
- 页签改变不重置无关表单；切换前有未保存内容要提示。
- 键盘：左右方向键切换、Home/End 到首尾（库已支持）；焦点环要可见。

---

## 10. Card / Title / Divider

**Card**

- 默认 Card 无阴影、20px 圆角、内边距 16/24；hover 只上浮 2px。
- `hoverable` 只给真正可点击的 Card；且必须同时提供键盘入口（Link/button 包裹或
  `role="button"` + `tabIndex=0` + Enter/Space）。门户服务卡目前是 `div onClick`，属于 D-08。
- 空态/提示用 `type="dashed"`；不要在空态里再放主按钮以外的一堆操作。
- 彩色 Card：文字承载一律 `type="pattern"`；实色 `color` 只放图标/装饰（见 Foundations §1.5）。
- 不要用 Card 做页面分栏；页面分栏用 CSS Grid。

**Title**

- `size`: `small` 14px / `middle` 20px / `large` 28px；权重 900，燕尾飘带。
- `middle`/`large` 可作为区块视觉标题；必须包在 `<h1>`/`<h2>` 里补语义。
- `small` 是装饰性飘带，不能当功能性小标题的唯一文字。
- 颜色只从 Foundations §1.5 的允许列表取；不要每个区块换一种颜色，一个页面 ≤3 种飘带色。
- 不要用 `Card type="title"`（已移除）。

**Divider**

- 区块之间用 `Divider type="wave-yellow"` 或留白；不要用 `<hr>`。
- Divider 是装饰，不承担信息层级；不要在每个 Card 之间都放。

---

## 11. Modal / Drawer

**Modal**

- 必须 `maskClosable={false}`；关闭入口是取消/关闭按钮、右上角 ×、Esc。
- `width` 只用 460 / 560 / 640 / 720 四档；**必须显式传 `width`**（库默认 520 不在档位内）；
  确认弹窗 460，标准表单/详情 560。现有 420/480/520/540/680 在改动时就近收敛。
- `typewriter={false}`：后台表单/确认不要打字机延迟。
- `footer`：取消在左、主操作在右；`footer={null}` 时必须自带 `.form-actions` 取消/关闭。
- 异步确认：`loading={busy}` + `disabled={busy}`；`onClose` 在 busy 时直接 return。
- 打开时聚焦第一个可交互元素/标题；关闭后焦点回到触发按钮；焦点不能逃出弹窗。
- 长表单（> 6 字段或 > 1 屏）改用 Drawer 或独立页面；Modal 只放短表单/确认/详情摘要。
- 不要嵌套 Modal；需要二级确认时先关第一层或改用 Drawer + Modal。

**Drawer**

- 导航抽屉 280px；站内信 440px；详情 560px；工作台宽详情 620–640px。
  现有 680px 在改动时就近收敛；站内信可用 `min(440px, 100vw)` 这种字符串宽度。
- 必须 `maskClosable={false}`；`pushBackground={false}` 用于导航/站内信，避免背景缩放干扰阅读。
- `footer` 固定底部操作；内容区独立滚动；标题过长换行，不截断关键编号。
- 关闭后焦点回到触发元素；Esc 关闭；busy 时禁止关闭。

```jsx
<Modal
  maskClosable={false}
  open={open}
  title={t('...')}
  width={560}
  typewriter={false}
  onClose={() => { if (!busy) setOpen(false); }}
  footer={
    <>
      <Button onClick={close} disabled={busy}>{t('common.cancel')}</Button>
      <Button type="primary" loading={busy} disabled={busy} onClick={save}>{t('common.save')}</Button>
    </>
  }
>
  ...
</Modal>
```

---

## 12. Tag / Badge

- 状态标签统一 `variant="soft"`，颜色只用 Foundations §1.4 的允许列表。
- `size="small"` 用于表格/列表；`medium` 用于详情；`large` 只用于详情页头部状态。
- 标签文字要短（≤8 个汉字）；长说明用正文，不要把整句话塞进 Tag。
- 不在 Tag 上挂 `onClick` 做导航（Tag 不是按钮）；需要可点就用 Button/link。
- `Badge` 只用于未读数/角标；`count=0` 不显示；`99+` 封顶；未读同时要有文字或圆点提示。
- 不要用 Tag 颜色表达唯一语义；标签内必须有文字。

---

## 13. Toast

- **只用 `src/components/toast.js`**：`toastSuccess / toastError / toastInfo / toastWarning / toastApiError`。
  禁止 `animal-island-ui` 的 `Notification`（React 19 下会抛异常，`check:ui` 会拦）。
- 位置：顶部居中；成功 3.2s、错误 5.2s；最多同时 4 条；`role="status"` / 错误 `role="alert"`。
- 用途：异步动作的结果（保存、提交、删除、上传完成）。校验错误留在字段旁，不 toast。
- 顺序：**先关窗/重置表单 → toast → await load()**；失败保持弹窗再 toast。
- 一个动作只发一条；不要在 catch 里先 toast 再让调用方再 toast 一次。
- 未知错误码用 `toastApiError(t, err)`，回退到 `api.INTERNAL_ERROR`，不显示原始 key/堆栈。

---

## 14. Skeleton / Progress / Loading / Collapse

- 首屏小页面用 `Card type="dashed"` + `t('common.loading')`（项目既有模式）；
  列表/表格已知布局时可用 `Skeleton`，但不要同时出现 spinner + skeleton。
- `Table loading` 自带遮罩，保留布局；不要整页 `Loading`。
- `Progress` 只用于上传/明确进度的长任务；不确定进度用文字“处理中…”，不要假进度。
- `Loading` 全屏夜空风格与政务后台不匹配，**不在后台页面使用**；只在独立启动/引导场景考虑。
- `Collapse` 用于 FAQ/帮助；标题必须可键盘操作；默认展开项不超过 1 个。

---

## 15. Avatar / Image / Background / Typewriter

- `Avatar`：优先显示名首字；图片头像要有 `alt`；不要在头像上叠加状态点当唯一信息。
- `Image`：有信息量必须 `alt`；装饰图 `alt=""`；预览灯箱要能 Esc 关闭。
- `Background`：只做页面/hero 装饰，内容必须在图案之上且对比度达标；不要用波点底承载小字。
- `Typewriter`：只用于首页标语/hero 副标题；不承载状态、错误、申请号等关键信息；
  它不响应 `prefers-reduced-motion`。

---

## 16. 项目自定义组合组件

这些不是库组件，但属于“项目组件契约”，改动时要同时看 [04 Patterns](./04-patterns.md)。

### `ConfirmAction`（`src/components/ConfirmAction.jsx`）

- 所有不可逆动作（删除/撤回/作废/吊销/移出黑名单/状态流转）统一用它。
- `action` 必须是会抛异常的异步函数；成功后组件负责关窗 → toast → `onDone`。
- 弹窗 busy 时禁止关闭；失败保持弹窗，由 `onError` 提示。
- 不要用原生 `window.confirm`。

### `toast.js`

- 见 §13；任何页面级提示辅助函数都委托给它，不直接操作 DOM。

### `LanguageSelect`（`src/components/LanguageSelect.jsx`）

- 只提供 `zh-CN` / `zh-TW`；`aria-label` 挂在 Select 本身；切换后整页 reload（服务端内容需要重新本地化）。
- 不要新增第三个语言选项，除非同时补齐两份中文资源与 `REQUIRED_LOCALES`。

### `LinkageField`（`src/components/linkage/LinkageField.jsx`）

- 跨署证件字段只能用它，不要写裸 `Input` 让用户手抄编号。
- 状态：未选（获取/手填两个入口）→ 选择器 → 已选卡（名称/编号/状态 Tag/换/清除）→
  手填 → 校验中 → 已归属/非本人/未找到/已被引用。
- 首次获取前走 `LinkageConsentModal`；只能取当前登录用户自己的记录。
- 校验失败/未找到必须文字说明，不只换 Tag 颜色。

### `AutoApproveSettings`（`src/components/AutoApproveSettings.jsx`）

- 三态：`off` / `immediate` / `delayed`；延时 1–10080 分钟，非法值不可保存。
- 保存按钮 `loading + disabled`；成功后 toast + 回填服务器值；显示最后更新人与时间。
- 文案必须说明“自动审批走同一审批核心”，不要让管理员以为会跳过校验。

### `InboxDrawer`（`src/components/InboxDrawer.jsx`）

- 未读/全部、按署筛选、全部已读；加载/失败/空三态分开。
- 消息卡可键盘打开（`role="button"` + Enter/Space），未读有文字 + 圆点 + 左边框，不只靠颜色。
- 标记已读写回原表；跨署聚合不产生第二份数据。

---

## 17. 组件禁用清单

| 禁止 | 替代 |
| --- | --- |
| `Notification` | `src/components/toast.js` |
| 原生 `<button>/<input>/<select>` 可见控件 | 库组件 |
| 原生 `alert/confirm/prompt` | `ConfirmAction` / Modal |
| 纯 emoji / Unicode 图标 | `naive-icons` |
| `Tag onClick` 导航 | `Button` / `Link` |
| 两个并列 primary | 一个主操作 + default/text |
| `Switch value` | `Switch checked` |
| `Table size` / 列 `ellipsis` | `table-fit` + 换行 |
| 无 `onChange` 的受控 `Tabs` | `defaultActiveKey` 或补 `onChange` |
| 长表单塞进 Modal | Drawer / 独立页面 |
| 整页 `Loading` 夜空 | `Card type="dashed"` / Skeleton / Table loading |