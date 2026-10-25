# 通用组件 —— 精确样式规范

通用类组件 Button、Typewriter、Cursor 的像素级样式规范。

## Button

| 属性          | small    | middle   | large    |
| ------------- | -------- | -------- | -------- |
| height        | 32px     | **45px** | 48px     |
| padding       | `0 16px` | `0 20px` | `0 32px` |
| font-size     | 12px     | 14px     | 16px     |
| border-radius | 12px     | **50px** | 24px     |
| border-width  | 2px      | 2px      | 2px      |

**primary 按钮精确值（**仅 primary / danger-primary 用 3D 厚阴影**）：**

```css
color: #794f27;
background: #f8f8f0;
border-color: #f8f8f0;
font-weight: 600;
letter-spacing: 0.02em;
line-height: 1;
box-shadow: 0 5px 0 0 #bdaea0;

/* hover */
transform: translateY(-1px);
box-shadow: 0 6px 0 0 #bdaea0;

/* active */
transform: translateY(2px);
box-shadow: 0 1px 0 0 #bdaea0;

/* focus-visible */
outline: 2px solid #19c8b9;
outline-offset: 2px;

/* disabled */
opacity: 0.5;
```

**default / dashed / text / link 按钮（柔和 elevation）：**

```css
/* 静止 */
box-shadow: var(--animal-shadow-sm); /* 0 2px 4px 0 rgba(61,52,40,0.06) */

/* hover */
color: #19c8b9;
border-color: #19c8b9;
box-shadow: var(--animal-shadow-base); /* 0 3px 10px 0 rgba(61,52,40,0.10) */
transform: translateY(-1px);

/* active */
color: #11a89b;
border-color: #11a89b;
transform: translateY(0);
box-shadow: var(--animal-shadow-sm); /* 回落到静止态 */
```

> 不要把 primary 那套 `0 5px / 6px / 1px #bdaea0` 套到 default / dashed 上 —— 整体会显得过重过 cartoon。

**loading 斜纹动画（精确值）：**

```css
background: #0ec4b6;
border: 4px solid #4de2da;
color: #fff;
background-image: repeating-linear-gradient(-45deg, #0ec4b6, #0ec4b6 10px, #01b0a7 10px, #01b0a7 20px);
background-size: 28.28px 28.28px;
animation: animal-btn-loading 1s linear infinite;

@keyframes animal-btn-loading {
    0% {
        background-position: 0 0;
    }
    100% {
        background-position: -28.28px 0;
    }
}
```

**danger primary 按钮：**

```css
color: #fff;
box-shadow: 0 5px 0 0 #c94444; /* error-active */
```

## Typewriter

```tsx
<Typewriter speed={90} trigger={openCount} autoPlay onDone={() => ...}>
  <p>第一行 <strong>加粗</strong></p>
  <p>第二行</p>
</Typewriter>
```

Props：

| name       | type          | default | 说明                                                 |
| ---------- | ------------- | ------- | ---------------------------------------------------- |
| `children` | `ReactNode`   | —       | 要逐字打出的内容，**保留原有元素结构 / 换行 / 样式** |
| `speed`    | `number (ms)` | `90`    | 每字间隔                                             |
| `trigger`  | `unknown`     | —       | 值变化即重新播放（通常传递弹窗 open 次数或递增 key） |
| `autoPlay` | `boolean`     | `true`  | `false` 直接全量显示                                 |
| `onDone`   | `() => void`  | —       | 播放完成回调                                         |

**实现要点：**

- `countText(node)`：递归统计 ReactNode 的纯文本长度
- `renderTruncated(node, state)`：按剩余字符数递归裁剪，`React.cloneElement` 保留原节点与样式
- `useEffect` 依赖 `[total, speed, trigger, autoPlay]`，内部 `setInterval` 按步递增 `count`
- **无样式文件**，不包裹任何额外 DOM（返回 `<>...</>`），对布局零影响

## Cursor

```tsx
<Cursor>
    <App /> {/* 此范围内所有元素变为手指光标 */}
</Cursor>

<Cursor type="raindrop">
    <App /> {/* 改为雨滴光标 */}
</Cursor>
```

样式文件为 **普通 CSS**（`cursor.css`，非 module）。`type` prop 选择两种风格，`forceAll` prop（默认 `true`）选择两种模式。根 `<div>` 挂 `animal-cursor` 加一个模式 class（雨滴风格追加 `animal-cursor--raindrop`）：

- `'default'` —— 粗描边圆角箭头，32×32 内联 SVG，hotspot `8 5`
- `'raindrop'` —— 蓝色水滴，32×32 内联 SVG，带浅色高光椭圆，hotspot `16 6`

**箭头做法。** 箭头沿用经典的七顶点指针轮廓（`M6 4 L6 21 L10.5 16.5 L13.5 23 L16.8 21.5 L13.8 15.2 L20.5 15.2 Z`），但**每个角都圆化、描边刻意加粗** —— 这两件事凑一起就是这种风格的全部。粗轮廓裹住一小块亮色内芯，无论多大都读起来是厚实的贴纸式指针；细轮廓则只会读成线稿。剪影整体缩放 `1.12`，让图形连描边占 32×32 画布高约 75%：早先的 28×28 版本留白太多，被迫把描边加粗到亮色内芯整个消失。描边粗细因此按**图形宽度的比例（约 15%）**表达，而不是固定像素值，改缩放就得跟着重算。

**改缩放系数不是一次等比编辑。** 系数只作用在七个基准顶点上；左缘那 `1.8` 的倾角和 `④` 上手工挪的 `1.2` 是在缩放**之后**叠加的，因此不跟着缩。`1.36` 时轴角是 `61.62°`、两条边长是 `23.19` / `7.87`；`1.12` 时轴角变成 `61.14°`、边长变成 `19.12` / `6.35`。**改缩放后下面每个数值都要重新量，绝不能按比例推。** 描边仍固定 `2.75`，所以剪影一小，它占外廓宽的比例就从 13.1% 升到 15.4% —— 这是故意的，小一号的光标同样需要同等视觉重量的轮廓；但 `1.12` 已经到实际下沿，再往下亮色内芯就合拢了。

圆角的做法是每个角变成一条 `Q`、控制点落在原顶点上，半径逐顶点不统一（尖端 `3.1`、尾部 `2.8`、凹口 `1.2`）。**边本身保持直线**：每条边都是一条显式的 `L`，从上一个角的出点连到下一个角的入点，整条路径读起来是 `L Q L Q …`。第一版只发一串 `Q`、让每条二次曲线从一个角跨到下一个角 —— 边也被同一条曲线渲染了，于是角的控制点会把长边拽出一道约 `1` 个单位的浅弧，左缘最明显。尖端**刻意磨钝**：尖角会和粗描边打架，最后不再像一个光标。填充与描边走**同一条**闭合路径，不需要拆路写法。左缘下方的顶点往右挪 `1.8`，让这条边略微倾斜，带一点手工摆放的动态感。

**整支箭头是严格镜像的。** 只有 `①``②``③``④` 四个顶点是自由的，`⑤``⑥``⑦` 分别是 `④``③``②` 关于「过箭尖、离竖直 28.86°」那条线的镜像。于是两条结论自动成立、**不要手工去"修"**：`①→②` 与 `①→⑦` 都等于 `19.12`，`②→③` 与 `⑥→⑦` 都等于 `6.35`。改一个自由顶点会**连带强制**它的镜像一起动；硬把镜像那一侧推过轴，配对就断了 —— 要动就通过镜像动，别绕过去。

有两个此前的做法值得记下来，因为它们看着挺合理但都是错的：靠把凹口 `⑥` 右移来缩短横臂是自相矛盾的，那会把 `⑥` 推离它的镜像位置，破坏 `②→③ = ⑥→⑦`。另外对称轴**绝不是**竖直 —— 两条长边都约 19 单位长而画布只有 32 宽，真按竖直镜像，左缘会落到负 x。更早一版还独立手调过四个顶点、结果慢慢走样，现在那些偏移全部没有了。

左右「对称」是外缘权重的判断，不是居中：即便把臂尖推到最右，墨迹重心仍然够不到画布中线（当前缩放下是 `14.5` 对 `16`），因为经典箭头天生不对称。调这一轴不要拿重心当依据，按真实 32px 看。

水滴**保持原始几何图形** —— 一条圆角路径加一个高光椭圆。把它一并软化试过又回退了：磨圆水滴的顶端只会让它读起来像一坨。

**选中文本。** `default` 变体还会重设其子树内的选区：底色 `#e9c46a`、文字 `#2b2620`。文字色不是可选项 —— 设计系统的正文色 `#794f27` 压在这个底上只有 **4.25:1**，正文达不到 AA；而 `#2b2620` 能到 **8.97:1**，过 WCAG AAA。

两个变体靠自定义属性（`--animal-selection-bg` / `--animal-selection-fg`）区分，raindrop 那条规则把它们覆写成系统色 `Highlight` / `HighlightText`。这不是为了好看：写成 `.animal-cursor:not(.animal-cursor--raindrop) ::selection` 看着等价，实际会错两处，因为 Cursor 经常是嵌套在另一个 Cursor 里的（demo 就把整页包在一个 `default` Cursor 中）：

- 后代组合器会命中**任意深度**上嵌套在 default 里的 raindrop，于是水滴被刷成 `#2b2620`
- 顶层 raindrop 则**一条都匹配不上**，静默失去全部选区样式

自定义属性按**最近的声明祖先**取值，所以永远是内层 Cursor 生效，不需要 `!important`，也不用折腾 `:not()`。

**图像存放在 CSS 自定义属性里**，所有变体与模式规则共用；改图只需改每个变体一处声明：

```css
/* 图像与热点只声明一次，由所有后代继承 */
.animal-cursor {
    --animal-cursor-img: url("data:image/svg+xml,…粗描边箭头…");
    --animal-cursor-hotspot: 8 5;
}
.animal-cursor--raindrop {
    --animal-cursor-img: url("data:image/svg+xml,…水滴…");
    --animal-cursor-hotspot: 16 6;
}
/* force 模式（默认，forceAll={true}）：所有后代都使用自定义光标。
   自定义属性会继承，因此后代自动解析到正确的风格。 */
.animal-cursor--force,
.animal-cursor--force * {
    cursor: var(--animal-cursor-img) var(--animal-cursor-hotspot), default !important;
}

/* scoped 模式（forceAll={false}）：仅容器自身使用自定义光标
   （双类选择器，使嵌套在 force 内的 scoped 仍能胜出） */
.animal-cursor.animal-cursor--scoped {
    cursor: var(--animal-cursor-img) var(--animal-cursor-hotspot), default !important;
}

/* 后代回落到浏览器语义 */
.animal-cursor--scoped *,
.animal-cursor.animal-cursor--scoped * {
    cursor: auto !important;
}

/* 交互元素显式恢复 pointer */
.animal-cursor--scoped a[href],
.animal-cursor--scoped button,
.animal-cursor--scoped [role='button'],
.animal-cursor--scoped [role='link'],
.animal-cursor--scoped label[for],
.animal-cursor--scoped select,
.animal-cursor--scoped summary,
.animal-cursor--scoped input[type='button'],
.animal-cursor--scoped input[type='submit'],
.animal-cursor--scoped input[type='reset'],
.animal-cursor--scoped input[type='checkbox'],
.animal-cursor--scoped input[type='radio'],
.animal-cursor--scoped [data-cursor='pointer'] {
    cursor: pointer !important;
}

/* 文本输入控件保留 text */
.animal-cursor--scoped input[type='text'],
.animal-cursor--scoped input[type='search'],
.animal-cursor--scoped input[type='email'],
.animal-cursor--scoped input[type='password'],
.animal-cursor--scoped input[type='number'],
.animal-cursor--scoped input[type='tel'],
.animal-cursor--scoped input[type='url'],
.animal-cursor--scoped textarea {
    cursor: text !important;
}

/* 禁用态优先 */
.animal-cursor--scoped [disabled],
.animal-cursor--scoped [aria-disabled='true'] {
    cursor: not-allowed !important;
}
```

- 图像只有内联 SVG —— 不存在 `cursor-icon.png`，也没有 base64 fallback；两种风格都在 `cursor.css` 里定义一次，经 `--animal-cursor-img` 传给每条规则
- 每条规则都带 `!important`，保证模式语义不被组件级 cursor 样式覆盖；`className` 挂在根 `<div>` 上，与固定的 `animal-cursor` class 并存
