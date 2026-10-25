# ADR 0007: TimePicker 纳入日期层

## 状态

已接受 —— 取代 [ADR 0005](0005-dayjs-as-the-date-layer.md) 与
[ADR 0006](0006-time-locale-formatting.md) 中关于 TimePicker 的条款。

## 背景

ADR 0005 在引入 dayjs 时把 `TimePicker` 排除在日期层之外，理由是它的值只是 `{ h, m, s }` 挂钟、组件也不做日期运算。这条豁免是当时引入 dayjs 时的范围取舍，而不是对 TimePicker 的单独评估：迁移只覆盖了 `DatePicker` 与 `Countdown`，挂钟论证被直接套用到 TimePicker 上，没有进一步检查它手写的格式化逻辑，也没有检查它和其它组件正在统一的 `format` 契约 —— 当时对这条豁免的考虑并不完整。ADR 0006 在 `Time` 开始用 dayjs 格式化日期胶囊时，又重申了这条豁免。因此这条豁免是 dayjs 迁移考虑不完整的结果，而不是针对 `format` 的设计结论。

这条豁免让 `TimePicker` 成为唯一一个手写解析与格式化的时间组件。分歧直接暴露在公开 API 上：`TimePicker.format` 只接受 `HH` / `mm` / `ss` 三个占位符，且 `String.replace` 每个只展开一次；而 `DatePicker.format` 与 `Time.weekdayFormat` / `dateFormat` 接受 dayjs 核心 token。同一个 prop 名因此代表两种语言，调用方也无法在时间选择器上写 `h:mm A` 或 `[此刻] HH:mm`。

挂钟论证成立的是**值**不携带日期，而不是**实现**必须重新写一遍时间解析与格式化。后两者属于格式化职责，面对的是日期层本来就要消除的同一批边界情况。

## 决策

- **由 dayjs 解析、格式化与序列化时间。** 公开值仍是纯 `HH:mm:ss` 字符串，`TimePart` 形状不变；日期不会进入值，也不会进入回调。
- **格式化挂在固定锚点日期 `2000-01-01` 上。** 锚点是实现细节，不属于值。选择固定日期而不是「今天」，是因为按宿主的当前日期格式化会在春季调时那天把 `02:30` 变成 `03:30` —— 正是 ADR 0005 点名的夏令时故障。
- **`format` 遵循 dayjs 核心 token**，与 `DatePicker`、`Time` 同一契约：`HH` / `mm` / `ss` / `h` / `A` 会展开，`[字面量]` 可转义，插件 token 保持字面量。只有时间 token 有意义；日期 token 会渲染锚点日期，prop 文档与设计体系文档都明确写出这一点。`ss` 仍决定是否显示秒列。
- **解析对旧输入保持宽松。** 严格 `customParseFormat` 会遍历时 / 分 / 秒各自 1 位或 2 位、以及秒可省略的所有组合，因此 `9:8:7`、`09:08`、`09:08:07` 都照旧可解析，而 `24:00:00`、`09:60:00` 会被拒绝。
- **插件在模块内注册；不碰全局 locale。** 模块只 extend `customParseFormat`，永不调用 `dayjs.locale(...)`。

## 后果

- 只 import `TimePicker` 的消费者现在会带上 dayjs 与 `customParseFormat`（合计约 6 kB gzipped，其中 dayjs 约 3.6 kB）；`preserveModules` 仍会让完全不 import 日期/时间组件的消费者把它们摇掉。
- `format` 契约扩大。已记录的 token 渲染结果与以前完全一致，但过去原样输出的核心 token 现在会插值；日期 token 会显示锚点日期，而不是字面 token。插件 token 仍是字面量。这是有文档记录的行为变化，与 ADR 0005 里 `DatePicker.format` 的扩展同类。
- `TimePicker` 不再手写时间解析与格式化；ADR 0005 中「挂钟值不掺和进来」的例外就此退役。值仍不带日期，仍不做日期运算、比较或时区转换。
- 锚点日期不可配置。需要输出日期的调用方应该用 `DatePicker`，而不是这个组件。

## 相关

- 取代 [ADR 0005](0005-dayjs-as-the-date-layer.md) 的 `TimePicker` 条款，以及
  [ADR 0006](0006-time-locale-formatting.md) 中「TimePicker 的决策继续有效」这一条。
- dayjs 打包方式与 token 保证：[ADR 0005](0005-dayjs-as-the-date-layer.md)。
- `Time` 的日期胶囊：[ADR 0006](0006-time-locale-formatting.md)。
