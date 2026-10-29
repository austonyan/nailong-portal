# 04 · Patterns 组合交互

> 这一层回答“多个组件怎么组合成一个可完成任务”。每个 pattern 都按
> **目标 → 结构 → 状态 → 规则 → 代码位置** 描述；具体像素见 [05 Layouts](./05-layouts.md)。

---

## 1. 总则

1. **先定信息关系，再排布局**：谁最重要、哪些属于一组、窗口变窄时怎么重排。
2. **每个异步动作都有五态**：idle → busy → success / error / empty；不能只画成功。
3. **失败不等于空**：网络失败必须显示“加载失败 + 重试”，不能渲染成“暂无数据”。
4. **不可逆动作必须确认**：删除/撤回/作废/吊销/移出黑名单。
5. **成功后三步**：关窗/重置 → toast → `await load()`；失败保持弹窗并提示。
6. **所有文案走 i18n**；简繁两份都要测最长文案。

---

## 2. 应用外壳与导航

### 2.1 两种外壳

| 身份 | 外壳 | 入口 |
| --- | --- | --- |
| 管理员（`hasRole('admin')` 或持有任一管理权限） | 左侧 260px 侧栏 + 细顶栏（面包屑/站内信/语言/头像/退出） | 侧栏「署 → 管理台」 |
| 普通用户 | 无侧栏；顶栏只留品牌 + 账号操作 | 门户服务卡 → 署内横向导航 |

- 侧栏层级**只到「署 → 管理台」**，署内板块由各署自己的 `.visa-nav` / `.docs-tab` 等横向导航承担，
  不要在侧栏重复一遍。
- 面包屑由 `src/nav/navConfig.js` 的 `breadcrumbKeys()` 生成；新署必须同时加 `OFFICE_NAV`、
  `nav.*` 双语文案和 `admin.entries`。
- 当前项：侧栏 `.active`（主色文字 + `primary-color-bg` 底 + 600 字重）；不得只用颜色加粗。

### 2.2 响应式

- ≥1025px：侧栏常驻，内容最大 1440px 居中。
- ≤1024px：侧栏收进左侧 Drawer（宽 280px，`maskClosable={false}`，`pushBackground={false}`），
  顶栏出现菜单按钮。
- ≤640px：顶栏换行，用户名与“退出登录”文字隐藏，只留头像/图标；图标按钮必须有 `aria-label`。
- 移动端 Drawer 打开后点击任一导航项即关闭；路由变化也自动关闭。

### 2.3 顶栏

- 左：面包屑（管理员）或品牌（普通用户）。
- 右：站内信铃铛（带未读 Badge）→ 语言（140px）→ 头像/用户名 → 退出。
- 铃铛、退出、菜单、语言都是 32px 图标按钮，间距 6–10px；不要放第二排。
- 顶栏 sticky，`z-index: 100`；下方内容滚动时不能被遮住锚点。

### 2.4 键盘与焦点

- 第一个 Tab 应是“跳到主内容”链接（当前未实现，见 §6.5 D-09）；至少保证 Tab 顺序为
  品牌 → 菜单（移动端）→ 面包屑 → 铃铛 → 语言 → 头像 → 退出 → 主内容。
- 移动端 Drawer 打开后焦点进入抽屉，Esc 关闭并回到菜单按钮。
- 当前页导航项用 `aria-current="page"`（`NavLink` 默认会加），不要只靠 `.active` class。

**代码**：`src/components/AppLayout.jsx`、`src/components/Sidebar.jsx`、`src/nav/navConfig.js`。

---

## 3. 门户首页

### 3.1 结构

```
[Background sprinkles + Title + Typewriter 标语]
[统计卡 ×3：我的角色 / 可用服务 / 权限数]
[Divider wave]
[服务卡网格：图标 + 箭头 + 名称 + 简介]
[SSO 身份确认 Modal]
```

- 统计卡：标签 13px、数字 28px/800、角色 Tag 软色；数字加载中显示 `common.loading`，不要显示 0。
- 服务卡：`Card hoverable`，按服务 `color` 上色；点击进入 `external` / `internal` / `internal_sso`。
- 服务卡必须有键盘入口：当前是 `div onClick`，属于 D-08；新代码用 `<Link>` 包裹或
  `role="button" tabIndex=0` + Enter/Space。
- 服务卡简介最多 2 行；名称不截断。

### 3.2 状态

| 状态 | 呈现 |
| --- | --- |
| 加载 | 统计数字显示“加载中”；服务区一张 `Card type="dashed"` + 加载文案 |
| 空 | “暂无可用服务”，不要显示 0 张卡 |
| 失败 | “服务加载失败” + 重试按钮；**不能退化成空列表** |
| 无权限 | 服务卡由后端过滤；不要显示“无权限”卡片 |

### 3.3 SSO 身份确认

- `entry_mode = internal_sso` 的服务首次进入弹 Modal：显示当前登录人姓名 + `@username` + 服务名 +
  说明；`maskClosable={false}`，取消回门户，确认写入 `sessionStorage['nailong.<key>.sso']='1'` 后进入。
- 同一浏览器会话只确认一次；直接访问 `/visa` 等 URL 时由 `VisaShell` 再兜底一次。
- 确认按钮 busy 时禁用取消/关闭；不要在这里做二次登录。

**代码**：`src/pages/Portal.jsx`、`src/pages/visa/VisaShell.jsx`。

---

## 4. 署内页面（Office shell）

### 4.1 结构

```
[署徽标 44×44 + 署名 18/800 + 副标题 12]
[横向导航 pill：首页 / 我的申请 / 证件 / 站内信 / 工作台 / 管理台]
[页面内容：Title + 卡片/表格]
```

- 12 个署共用同一 anatomy：`visa-*` / `docs-*` / `im-*` / `dip-*` / `res-*` / `appeal-*` 等前缀不同，
  结构一致；新署必须复用该结构，不要另造一套。
- 横向导航只显示**当前用户有权限**的项；当前项 `.active`。
- 导航项 ≤6 个；超过时分组或改用下拉，不要横向滚动。
- 署首页通常包含：hero（标题/副标题/2–3 个入口）、公告、类型卡、指南、FAQ、防诈骗提示。
  入口按钮一个 primary、其余 default/dashed。

### 4.2 页面头

- 左：`<Title size="middle">`（包 `<h1>`/`<h2>`）+ 可选说明；右：筛选/操作。
- 使用 `.page-header`（flex、wrap、gap 12、margin-bottom 16）。
- 标题与操作在窄屏自动换行；操作不得挤出容器。

**代码**：`src/pages/visa/VisaShell.jsx`、`VisaHome.jsx`、`src/pages/docs/DocsLayout.jsx`。

---

## 5. 列表 / 审核工作台

### 5.1 结构

```
[page-header：Title + 筛选条（状态 Select / 类型 Select / 搜索 Input）]
[Card > Table className="table-fit"]
[Pagination（total > pageSize 时）]
[Drawer 详情]
[Modal 审批动作]
```

### 5.2 筛选

- 状态/类型 Select 放在 page-header 右侧，宽约 150px；搜索 Input 用 `middle`，带前缀图标。
- 筛选变化后 `setPage(1)`；搜索建议 300ms 防抖（`useDebouncedValue`）。
- 提供“全部”选项（`key: ''`）；不要用空 Select 表示全部。
- 筛选条件不写入 URL（当前实现），刷新后回到默认；如果未来要分享筛选结果，再加 query 参数。

### 5.3 表格

- 列顺序：编号 → 申请人 → 类型 → 状态 → 时间 → 关键业务字段 → 操作。
- 状态列用 `Tag variant="soft"` + 允许的颜色；不要用红/绿文字代替标签。
- 操作列只放 1 个主操作（查看），其余进详情 Drawer，避免一行 5 个按钮。
- 长编号/长名称换行；数字右对齐；操作列 `.table-actions`。

### 5.4 详情 Drawer

- 宽 560–640px；顶部状态 Tag + 申请人；正文用 `dl` 字段行；材料列表；审核时间线；底部操作。
- 审核动作：通过 / 驳回 / 补件 / 签发 / 作废 / 标记已用；每个动作打开独立 Modal 填意见/原因/天数。
- 驳回必须选原因码 + 可填说明；补件必须填期限（1–30 天）与说明；签发必须填有效期（如适用）。
- 动作成功后：关闭动作 Modal → toast → 重新拉取详情 → 刷新列表；Drawer 保持打开。
- 作废/吊销等不可逆动作走 `useConfirmAction`，红色确认按钮 + busy。

### 5.5 状态

| 状态 | 呈现 |
| --- | --- |
| 首次加载 | Table `loading`；筛选条保持可用 |
| 空 | Table `emptyText`（“暂无待审申请”） |
| 失败 | 表格外错误条 + 重试；不要把 `items` 设为 `[]` 后显示空 |
| 分页 | 只有 `total > pageSize` 才显示；翻页后回顶部 |
| 刷新 | 保持当前筛选/页码；不要重置到第 1 页 |

**代码**：`src/pages/visa/VisaAdminWorkbench.jsx`、`src/pages/appeal/AppealAdminWorkbench.jsx`。

---

## 6. 详情页

### 6.1 结构

```
[page-header：Title + 状态 Tag（large）]
[状态横幅：驳回原因 / 关闭说明 /  Permit 可用]
[Card > dl.visa-field-list 字段行]
[Card > 材料列表]
[Card > 审核时间线]
[操作区：补件 / 撤回 / 打印 / 查看证件]
```

- 字段行：`dt` 110px 棕色 13px；`dd` 14px 正文；行间 2px dashed；长文本换行。
- 状态横幅用 `Card color` 时必须遵守 Foundations §1.5（文字承载用 pattern）；驳回/关闭横幅
  必须有标题 + 原因 + 下一步。
- 时间线：左侧 3px 主色浅底竖线，节点标题 14/600，说明 13px，时间 12px；按时间倒序或正序保持一致。
- 材料：文件名 + 类型 + 上传时间 + 查看/下载；私人材料只走鉴权接口，不暴露直链。
- 操作区按状态显示：可撤回（`pending_review`/`supplement_required`）、可补件、可打印；
  不可用动作直接不渲染，不要渲染后禁用（除非需要解释原因）。

### 6.2 打印

- 电子签注/证书/决定书用打印 CSS + `window.print()`；打印前隐藏外壳、导航、按钮、遮罩。
- 打印纸白底、黑/深棕字；QR 留白；不依赖彩色底表达状态（黑白打印仍可读）。
- 打印按钮是同步动作，不需要 busy；打印内容必须与屏幕详情一致（同一数据源）。

**代码**：`src/pages/visa/VisaApplicationDetail.jsx`、`src/pages/docs/CertificateView.jsx`、
`src/index.css` 的 `@media print`。

---

## 7. 表单 / 申请流程

### 7.1 结构

```
[类型选择卡] → [办事指南] → [表单 + 材料] → [提交确认 Modal] → [成功回执]
```

- 表单页：`Title` + 草稿号 + `Card > Form layout="vertical"` + 材料 `Card` + 底部操作。
- 两列栅格 `.visa-form-grid`；文本域跨列；材料区单独 Card。
- 底部操作：`保存草稿`（default）+ `提交申请`（primary）；两者都要 busy。
- 提交前：`validateFields()` → 必传材料检查 → `saveDraft(true)` → 打开确认 Modal。
- 确认 Modal：列出关键字段/材料/须知；确认按钮 primary + busy；取消返回表单。
- 成功后：显示回执卡（申请号 + 预计审核时长 + 查看我的申请/回首页），不要只 toast。

### 7.2 校验

- 必填、长度、日期先后、格式（邮箱/电话/证件号）在前端先校验；
- 服务端错误码映射到字段或 toast；不要显示英文原文；
- 首次进入不显示错误；失焦/提交后才显示；
- 错误文案在字段下方，红色图标 + 棕色文字（见 Foundations §8）。

### 7.3 草稿与离开

- 编辑草稿时切换类型/路由要重新挂载（项目用 `key` 解决），避免串数据；
- 有未保存修改时离开页面要提示（当前未统一实现，新增页面应补）；
- 草稿保存成功 toast“草稿已保存”，不要跳页。

### 7.4 预填与联动

- 居民证预填只填真实返回的字段，不要把空值写回清空用户输入；
- 跨署证件用 `LinkageField`（见 §12），不要裸 Input 手抄；
- 预填/联动成功后 toast 说明来源；用户可改。

**代码**：`src/pages/visa/VisaApplyForm.jsx`、`src/pages/resident/ResidentApply.jsx`。

---

## 8. 异常状态（全站统一）

> 只设计“有数据、网络正常、输入正确、接口立即返回”的流程，上线后差距最大。
> 异常状态和正常状态一起设计，并且进入组件/Pattern 库，而不是测试时发现一个补一个。

| 状态 | 规则 | 反例 |
| --- | --- | --- |
| 首次加载 | 保留页面骨架；小页面用 `Card type="dashed"` + 加载文案；表格用 `loading` | 整页空白/整页 spinner |
| 刷新 | 保留旧数据 + 顶部细进度/按钮 loading；不要闪空 | 每次刷新清空列表 |
| 空 | 说明原因 + 下一步；区分首次使用、筛选无结果、无权限、加载失败 | 只放一张插画/空白页 |
| 失败 | 说明发生了什么、是否可恢复、怎么重试；保留输入/筛选 | 显示“暂无数据” |
| 离线 | 顶部横幅说明；已加载内容可读；写操作禁用/排队；恢复后重试 | 静默失败或假装成功 |
| 无权限 | 按场景隐藏/禁用/解释；页面级 403 给原因和返回 | 403 白屏 |
| 长文案 | 换行/截断策略明确；关键信息不省略；按钮不溢出 | 中文正常、繁体/英文爆版 |
| 部分失败 | 已加载部分照常显示，失败区单独提示 | 一个接口失败全页报错 |
| 提交中 | 按钮 loading + disabled；禁止重复提交 | 双击发两次请求 |
| 成功 | 关窗/重置 → toast → 刷新 | 先刷新再关窗，toast 被卸载 |

### 8.1 Loading

| 等待时长 | 呈现 | 说明 |
| --- | --- | --- |
| < 300ms | 不显示加载态 | 避免一闪而过的 spinner |
| 300ms–1s | 局部半透明/按钮 loading | 不改变布局 |
| 1–3s | Skeleton 或 `Card type="dashed"` + “加载中” | 已知布局优先 Skeleton |
| > 3s | 进度/步骤 + 当前在做什么 | 页面仍可读，不要整页锁死 |
| > 10s | 可取消/后台继续 + 完成通知 | 上传、导出、长查询 |

- 首屏表格用 `Table loading`；列表已知行高用 Skeleton；未知结构用小卡片文案。
- 不要同时出现 spinner + skeleton；不要用全屏 `Loading` 夜空（后台不匹配）。
- **可取消**：上传、导出、长查询提供取消/中止；取消后恢复按钮与已填内容。
- **原子提交不可“取消一半”**：提交/审批只做 busy + 防重复，不提供中途取消；超时给“结果未知，请刷新确认”。

### 8.2 Empty

空状态必须回答“为什么空 + 我能做什么”：

| 场景 | 文案 / 动作 |
| --- | --- |
| 首次使用 | “还没有申请” + “去申请”主按钮 |
| 筛选无结果 | “没有符合筛选条件的记录” + “清除筛选” |
| 已归档/已关闭 | “当前没有进行中的记录” + 查看归档 |
| 无权限 | “你没有该署的访问权限” + 返回门户/联系管理员 |
| 加载失败 | 不算空状态：错误文案 + 重试 |

### 8.3 Error

- 文案三要素：**发生了什么、是否可恢复、下一步怎么做**。
- 可恢复错误：保留表单/筛选，给“重试”；不可恢复：说明原因 + 返回/联系。
- 字段错误靠近字段，页面错误放在内容区顶部，Toast 只做动作结果提示。
- 不显示原始错误码/堆栈/英文 message；未知 code 回退 `api.INTERNAL_ERROR`。
- 部分失败：按区块显示错误，不要因为一个卡片失败让整页报错。

### 8.4 Offline

- 监听 `online` / `offline`；断网时顶部横幅：“网络已断开，部分内容可能不是最新”。
- 已加载的列表/详情可继续阅读；提交、上传、审批等写操作禁用，并说明“恢复网络后可重试”。
- 恢复网络：横幅消失/变为“已恢复”，提供重试；不要自动重发不可逆请求。
- 当前 SPA 没有 Service Worker 离线缓存，不承诺“离线编辑/离线提交”；新增离线能力需单独立项。
- 表单因断网失败时保留已填值，恢复后可重新提交；不要清空表单。

### 8.5 Permission

| 场景 | 处理 | 理由 |
| --- | --- | --- |
| 导航/服务入口 | **隐藏** | 用户不应看到无权访问的署，避免误导 |
| 页面级访问 | **解释 + 返回**（403 页） | 用户明确进入时，隐藏会让人以为链接坏了 |
| 可升级的操作 | **禁用 + 原因** | 例如“需要审核权限，请联系管理员” |
| 字段级 | **只读/禁用 + 说明** | 不要让用户填了才被服务端打回 |
| 数据范围 | 后端过滤，前端不展示“别人有多少条” | 避免泄露与困惑 |

### 8.6 长文案

- 关键信息（姓名、编号、状态、金额、标题）**换行完整显示**，不省略；只有昵称、简介等非关键摘要可 1–2 行截断。
- 表格单元格 `overflow-wrap:anywhere`；表头 `white-space:normal`；操作列换行。
- 按钮文字换行或缩成图标（带 `aria-label`）；不要让按钮撑破卡片。
- 容器 `min-width: 0`，禁止固定 `height`；详情标签在 ≤640 上下排。
- 必测：40 字用户名、100 字标题、`zh-TW` 最长文案、200% 缩放；具体布局规则见 [05 Layouts §8](./05-layouts.md#8-字体缩放与长文案)。

**代码**：`src/pages/Portal.jsx`（失败与空分离）、`src/components/InboxDrawer.jsx`（加载/失败/空三态）、
`src/pages/visa/VisaApplyForm.jsx`（草稿/提交/回执）。

---

## 9. 确认与不可逆动作

- 统一 `useConfirmAction()`：标题、后果说明、确认文案、`action`、`success`、`onDone`、`onError`。
- 触发按钮用 `danger`；确认按钮 `type="primary" danger`。
- 弹窗必须写清“做什么 + 后果 + 是否可恢复”；不要只写“确定吗？”。
- busy 时：确认按钮 loading + disabled，取消/关闭 disabled，`onClose` 直接 return。
- 成功后：关窗 → toast（`common.deleted` 等）→ `onDone` 刷新；失败保持弹窗并 toast。
- 禁止原生 `window.confirm` / `alert` / `prompt`。

**代码**：`src/components/ConfirmAction.jsx`。

---

## 10. 站内信（跨署收件箱）

### 10.1 结构

- 顶栏铃铛 + 未读 Badge → 右侧 Drawer（440px）。
- 筛选：全部/未读；按署 chip；消息列表；底部“全部已读”。
- 每条：署 Tag + 标题 + 正文摘要 + 时间 + 未读圆点/“未读”文字；点击标记已读并展开详情。

### 10.2 规则

- 聚合接口只读现有表，标记已读写回原表；不新建第二份消息表。
- 没有权限的署不出现在筛选里；聚合数量与各署页面一致。
- `archives` 的镜像消息不能重复计数（`source='archives'` 排除）。
- 加载/失败/空三态分开；失败可重试。
- 消息卡必须可键盘打开（`role="button"` + Enter/Space）；未读不只靠圆点颜色。
- 各署自己的站内信页保留；聚合抽屉与署内页的“已读”状态必须同步。

**代码**：`src/components/InboxDrawer.jsx`、`server/routes/messages.js`、`src/pages/visa/VisaMessages.jsx`。

---

## 11. SSO 身份确认

- 触发：门户服务卡 `internal_sso`，或直接访问署 URL 时的 Shell 兜底。
- 内容：服务名 + 当前登录人姓名/账号 + “将以此身份进入”说明 + 取消/确认。
- 会话级：`sessionStorage['nailong.<service>.sso']`；关闭浏览器标签后失效。
- 取消：回门户首页；确认：写入标志 → 进入服务。
- 不在确认弹窗里输入密码；不做二次认证；不自动跳过（除非本会话已确认）。

**代码**：`src/pages/Portal.jsx`、`src/pages/visa/VisaShell.jsx`。

---

## 12. 跨署联动字段

### 12.1 入口

```
[从来源署获取我的<证件>]  [手动填写]
        ↓ 首次
[LinkageConsentModal：说明身份依据 + 会话内同意]
        ↓
[LinkagePicker：只列当前用户自己的记录]
        ↓
[已选卡：名称/编号/状态 Tag/换/清除]
```

- 默认主入口是“获取”，手动填写是次要 link；不要反过来。
- 首次获取前必须征得同意，说明用的是居民证还是门户账号；同一会话同一来源只问一次。
- 只允许选当前用户自己的记录；他人/无主记录不显示标题与详情。
- 手填模式：Input + 校验按钮；校验结果四态：已归属 / 非本人 / 未找到 / 已被引用。
- 失败不改变已选值；清除要同时清空表单值、已选卡、校验结果。
- 来源/业务类型变化时清空上一份选择，避免串用。

### 12.2 状态文案

| 状态 | 文案要求 |
| --- | --- |
| 未选 | “获取我的… / 手动填写” |
| 校验中 | 按钮 loading，输入可编辑但不可重复提交 |
| 已归属 | 绿色 Tag + 证件状态 + 持有人/有效期（若有） |
| 非本人 | 红色 Tag + “该证件不属于当前账号” |
| 未找到 | 橙色 Tag + “未找到，检查编号或改用手填” |
| 已被引用 | 蓝色 Tag + 引用次数；不阻止提交，除非业务规则要求 |

**代码**：`src/components/linkage/LinkageField.jsx`、`LinkageConsentModal.jsx`、`LinkagePicker.jsx`。

---

## 13. 双语内容

### 13.1 前端 UI

- 所有字符串 `t('...')`；禁止 JSX 里写中文/英文常量。
- `zh-CN` 与 `zh-TW` 键结构必须一致（`check:i18n`）；新增 key 两份同时加。
- 语言切换后整页 reload（服务端内容按请求本地化）；`document.documentElement.lang` 同步。
- 简体/繁体长度不同：按钮、Tab、表格列头按最长文案设计；不要用固定宽度截断。
- 数字/日期不翻译；日期用 `fmtDate`/`fmtDateTime`；货币/百分比如未来出现，用 locale 格式。

### 13.2 服务端内容

- 每个展示列有 `_tw` 兄弟列（`name_tw`/`title_tw`/…）；API 由 `server/locale.js` 本地化。
- 后台表单同时编辑简体 + 繁体：简体绑 `fieldCn ?? field`，繁体绑 `fieldTw`；提交 `field` + `fieldTw`。
- 繁体为空时回退简体；不要用机器翻译覆盖管理员填的值。
- 自由文本（昵称、留言、理由）保持原文，不自动翻译。
- 种子内容用 `server/content-i18n.js` 按 code/title 回填，不覆盖非空管理员值。

### 13.3 验收

- 每个页面切到 `zh-TW` 看一遍：不溢出、不截断、不出现 key、日期格式一致。
- 管理员表单：只填简体 → 繁体回退；只填繁体 → 简体保留；两者都填 → 按语言返回。
- 运行 `npm run check:i18n` 与 `node server/scripts/smoke-i18n.mjs`。

---

## 14. 自动审批设置

- 位置：各署管理台设置区，嵌 `AutoApproveSettings`。
- 三态：关闭 / 立即审批 / 延时审批；延时 1–10080 分钟。
- 选择延时后才显示分钟输入；非法/空值不能保存；输入只允许数字。
- 保存：busy + disabled；成功 toast + 回填；显示最后更新人与时间。
- 文案：说明自动审批走同一审批核心、产生的记录标记 `system` / `auto: true`；
  不要暗示会绕过材料校验或人工复核规则。
- 权限：`visa:manage` / `imm:admin` / `dip:admin` / `res:manage` / `evt:manage` / `docs:manage` / `appeal:manage`。

**代码**：`src/components/AutoApproveSettings.jsx`、`server/autoApprove.js`。

---

## 15. 打印 / 电子证照

- 入口：详情页“打印”按钮（`PrinterIcon`）；同步 `window.print()`，不需要 busy。
- 打印样式：隐藏 `.app-header`/`.app-side`/`.visa-nav`/按钮/遮罩；纸白底、深棕字、2px 边框；
  二维码白底留白；A4 单页优先。
- 屏幕预览与打印内容同一数据；不要为打印另做一套假数据。
- 状态/有效性必须在文字里写清楚，不能只靠颜色/印章图形。
- 证书编号、签发日期、有效期、验真 URL/二维码缺一不可。

**代码**：`src/pages/docs/CertificateView.jsx`、`src/pages/visa/VisaPermits.jsx`、`src/index.css` `@media print`。

---

## 16. 公共验真页

- 无应用外壳；只保留品牌 + 语言切换 + 简洁背景。
- 输入业务编号 → 查询 → 结果卡：有效/无效/已使用/已作废 + 持有人掩码 + 签发信息。
- 限流：前端按钮 busy，后端按 IP/编号限流；错误提示不泄露是否存在该编号（除业务允许）。
- 结果不能只靠颜色；必须有文字结论 + 图标 + 时间。
- 失败/无结果/格式错误三种文案分开；不要都写“查询失败”。

**代码**：`src/pages/visa/VisaVerify.jsx`、`src/pages/docs/DocsVerify.jsx`、`server/routes/visa.js` `/verify`。

---

## 17. 登录 / 注册 / 首次引导

### 17.1 登录/注册

- 居中 400px Card + sprinkles 背景；Title + 副标题 + 表单 + 主按钮（block/large）+ 切换链接。
- 用户名/密码必须 `autocomplete`；密码可显示/隐藏？（当前没有，若加必须可键盘操作）。
- 错误：`toastError` + 字段级提示；不区分“用户不存在/密码错误”以防枚举。
- 登录 busy：按钮 loading + disabled；成功后 toast + 跳转 `from` 或首页。

### 17.2 首次引导 `/setup`

- 三步：欢迎 → 管理员账号 → 确认 → 完成；顶部 Progress + “第 x / 3 步”。
- 语言切换在右上；表单字段：用户名（3–32，字母数字下划线）、显示名、邮箱、密码、确认密码。
- 完成后显示成功页与“进入门户”；服务端锁 `setup.completed_at` 后不能再打开。
- 另一标签已完成时：`SETUP_COMPLETE` → 刷新 + 回登录，不显示成功假象。
- 所有步骤可返回上一步且保留已填值（`draft`）。

**代码**：`src/pages/Login.jsx`、`Register.jsx`、`Setup.jsx`、`src/components/AuthLayout.jsx`。

---

## 18. 新增页面 / 新增署的检查清单

1. 在 `navConfig.js` 加 `OFFICE_NAV`（base/labelKey/icon/permission/admin.entries）；`nav.*` 两份中文。
2. 选模板：门户 / 署首页 / 列表工作台 / 详情 / 表单 / 登录；不要新造外壳。
3. 页面有且一个 `<h1>`；区块 `<h2>`；Title 只做视觉。
4. 所有字符串 `t()`；服务端内容有 `_tw` 列与本地化。
5. 列表：`table-fit`、失败/空分离、分页、操作列。
6. 弹窗：`maskClosable={false}`、busy、显式关闭、成功后顺序。
7. 不可逆动作：`useConfirmAction`。
8. 空/加载/失败/无权限四态齐全。
9. 6 档视口 + 200% 缩放 + 键盘走查 + `zh-TW` 走查。
10. 跑 `npm run check:i18n && npm run check:ui && npm run lint`，相关 smoke 脚本。