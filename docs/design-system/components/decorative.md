# Decorative — 精确样式规范

承载海岛主题氛围的场景件：Time、Phone、Footer、Wallet 的精确取值

## Footer（版权栏）

版权栏：渲染 `© {year} {text}` —— 年份动态获取（当前年份），文案默认为 `All Rights Reserved.`。

```tsx
<Footer />                  // © 2026 All Rights Reserved.
<Footer text="Acme Ltd." /> // 自定义文案
<Footer text="Acme" year={2020} />
```

```less
.footer {
    color: #807d75;
    font-size: 12px;
    padding: 16px 0;
    text-align: center;
}
```

- `year` 默认取当前年份（`new Date().getFullYear()`），传入 `year` 可覆盖；`text` 替换 `All Rights Reserved.`。
- 样式完全可通过 `style` / `className` 自定义。

