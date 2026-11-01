// 全站共享的多行输入:animal-island-ui 没有 Textarea 组件,这里用原生 textarea
// 包一层。className 只做追加,样式钩子统一为 `.nl-textarea`,不写死任何署前缀。
// value / onChange / onBlur / placeholder / maxLength / aria-label 等原生属性原样透传,
// 因此可直接作为 FormItem 的子节点(FormItem 注入的是原生事件,不是 value 参数)。

/**
 * 令牌化多行文本输入框,原生 textarea 属性全部透传。
 * @param {object} props
 * @param {number} [props.rows=4] 可见行数
 * @param {string} [props.className=''] 追加类名(共享样式类 `nl-textarea` 始终保留)
 * @returns {import('react').ReactElement}
 */
export function TextArea({ rows = 4, className = '', ...rest }) {
  return <textarea rows={rows} className={`nl-textarea ${className}`} {...rest} />;
}

export default TextArea;