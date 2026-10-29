// 前端交互约定检查:防止已修复的问题回归。
// - 禁止使用 animal-island-ui 的 Notification(React 19 下会抛异常)
// - 所有数据表必须带 table-fit,让列压缩换行而不是溢出
// - Switch 必须用 checked,不能用 value
// - Table 不支持 size / 列 ellipsis,不要写无效属性
// - Modal / Drawer 必须显式 maskClosable={false},点遮罩不关弹窗
// - Tabs 给 activeKey 就必须给 onChange,否则页签被钉死在初始值上(点不动)
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

// 从 `<Tag` 起扫描完整开标签(跳过 {}、字符串、模板串),返回标签文本。
function openingTag(source, start, tagLength) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start, start + tagLength);
}

function jsxTags(content, tag) {
  const tags = [];
  let index = 0;
  for (;;) {
    const at = content.indexOf(`<${tag}`, index);
    if (at === -1) return tags;
    const after = content[at + tag.length + 1];
    if (!/[\s>]/.test(after ?? '')) {
      index = at + tag.length;
      continue;
    }
    const text = openingTag(content, at, tag.length);
    tags.push({ text, line: content.slice(0, at).split('\n').length });
    index = at + text.length;
  }
}

// 只取开标签最外层的属性名:items={[...]} 里嵌套的 JSX 也写 onChange,
// 若按整段文本匹配就会漏掉「受控却没接 onChange」的页签。
function topLevelProps(tagText) {
  const props = new Set();
  let depth = 0;
  let quote = null;
  for (let i = 0; i < tagText.length; i += 1) {
    const ch = tagText[i];
    if (quote) {
      if (ch === quote && tagText[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (depth === 0 && /[A-Za-z_$]/.test(ch) && /[\s<]/.test(tagText[i - 1] ?? '')) {
      const m = /^([A-Za-z_$][\w$]*)\s*=/.exec(tagText.slice(i));
      if (m) {
        props.add(m[1]);
        i += m[0].length - 1;
      }
    }
  }
  return props;
}

const errors = [];
let tableCount = 0;
let dialogCount = 0;
let tabsCount = 0;

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

  for (const tag of ['Modal', 'Drawer']) {
    for (const { text, line } of jsxTags(content, tag)) {
      dialogCount += 1;
      if (!/maskClosable=\{false\}/.test(text)) {
        errors.push(`${rel}:${line} <${tag}> 必须显式写 maskClosable={false}(点遮罩不应关闭弹窗)`);
      }
    }
  }

  for (const { text, line } of jsxTags(content, 'Tabs')) {
    tabsCount += 1;
    const props = topLevelProps(text);
    if (props.has('activeKey') && !props.has('onChange')) {
      errors.push(`${rel}:${line} <Tabs> 传了 activeKey 却没有 onChange,页签会被钉死(补 onChange 或改用 defaultActiveKey)`);
    }
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

// 服务卡图标白名单必须前后端一致:前端列出可选项,服务端校验落库值。
const iconsFile = path.resolve('src/components/icons.js');
const servicesRoute = path.resolve('server/routes/services.js');
if (fs.existsSync(iconsFile) && fs.existsSync(servicesRoute)) {
  const iconsSource = fs.readFileSync(iconsFile, 'utf8');
  const routeSource = fs.readFileSync(servicesRoute, 'utf8');
  const clientBlock = iconsSource.match(/SERVICE_ICONS\s*=\s*\{([\s\S]*?)\}/);
  const serverBlock = routeSource.match(/const ICONS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!clientBlock || !serverBlock) {
    errors.push('无法解析服务图标白名单(src/components/icons.js 与 server/routes/services.js 需保持可识别的写法)');
  } else {
    // 前端用简写属性(无引号),服务端是带引号的字符串,统一按标识符提取。
    const names = (text) => new Set([...text.matchAll(/([A-Za-z0-9]+Icon)\b/g)].map((m) => m[1]));
    const clientIcons = names(clientBlock[1]);
    const serverIcons = names(serverBlock[1]);
    for (const name of clientIcons) {
      if (!serverIcons.has(name)) {
        errors.push(`server/routes/services.js: ICONS 缺少 ${name},编辑使用该图标的服务会被拒绝(VALIDATION_ERROR)`);
      }
    }
    for (const name of serverIcons) {
      if (!clientIcons.has(name)) {
        errors.push(`src/components/icons.js: SERVICE_ICONS 缺少 ${name},编辑服务时图标会显示为空`);
      }
    }
  }
}

if (errors.length) {
  console.error(`UI conventions check failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(`UI conventions OK (${tableCount} tables, ${dialogCount} dialogs, ${tabsCount} tabs checked).`);