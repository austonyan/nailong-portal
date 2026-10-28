// 输入框防抖:检索词每 300ms 才提交一次,避免逐键打接口。
// 用法:const dq = useDebouncedValue(q, 300); 把 dq 作为请求参数与 effect 依赖。
import { useEffect, useState } from 'react';

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default useDebouncedValue;
