// animal-island-ui 没有多行文本组件;这里用原生 textarea 包一层,
// 样式完全走 --animal-* 令牌,保持输入框 50px 系的圆角与暖色描边。
export default function DocsTextarea({ value, onChange, placeholder, maxLength, rows = 4, ariaLabel }) {
  return (
    <textarea
      className="docs-textarea"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={rows}
      aria-label={ariaLabel || placeholder}
    />
  );
}
