// 前端交互约定检查:防止已修复的问题回归。
// - 禁止使用 animal-island-ui 的 Notification(React 19 下会抛异常)
// - 所有数据表必须带 table-fit,让列压缩换行而不是溢出
// - Switch 必须用 checked,不能用 value
// - Table 不支持 size / 列 ellipsis,不要写无效属性
import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(js|jsx)$/.test(entry.name) ? [full] : [];
  });
}

const errors = [];
let tableCount = 0;

for (const file of walk(src)) {
  const rel = path.relative(process.cwd(), file).split(path.sep).join('/');
  const content = fs.readFileSync(file, 'utf8');

  if (/\bNotification\b/.test(content)) {
    errors.push(`${rel}: 使用了库的 Notification,请改用 src/components/toast.js`);
  }

  const tables = content.match(/<Table\b/g) ?? [];
  const fitted = content.match(/<Table\s+className="table-fit"/g) ?? [];
  tableCount += tables.length;
  if (tables.length !== fitted.length) {
    errors.push(`${rel}: 有 ${tables.length - fitted.length} 个 <Table> 缺少 className="table-fit"`);
  }

  if (/<Switch\b[^>]*\bvalue=/.test(content)) {
    errors.push(`${rel}: <Switch> 使用了 value,应改为 checked`);
  }

  if (/<Table\b[^>]*\bsize=/.test(content)) {
    errors.push(`${rel}: <Table> 不支持 size 属性`);
  }

  if (/\bellipsis:\s*true/.test(content)) {
    errors.push(`${rel}: 列定义使用了库不支持的 ellipsis,请用 style.maxWidth + 换行`);
  }
}

if (errors.length) {
  console.error(`UI conventions check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`UI conventions OK (${tableCount} tables checked).`);