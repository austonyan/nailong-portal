// token 存在性检查(D-21):把「写了不存在的 --animal-*」挡在构建期。
// - 合法清单来自 node_modules/animal-island-ui/dist/index.css 的 :root 块;
// - src/**/*.css 里 var(--animal-*) 用到清单外的名字 → 错误(退出码 1);
// - 裸 hex / rgb()/rgba() → 警告(不失败),跳过 @media print、二维码/票据白底,
//   以及库既有暖色阴影 rgba(61, 52, 40, …)。
// 无第三方依赖;输出路径统一转成 /,Windows 下可直接跑。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const LIB_CSS = path.join(ROOT, 'node_modules', 'animal-island-ui', 'dist', 'index.css');
const WARN_LIMIT = 20;

const TOKEN_NAME = /--animal-[A-Za-z0-9_-]+/g;
const VAR_REF = /var\(\s*(--animal-[A-Za-z0-9_-]+)/g;
// 十六进制颜色:优先吃长写法,避免 #rrggbbaa 被截成 #rrggbb。
const HEX_COLOR = /(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const RGB_COLOR = /\brgba?\([^)]*\)/g;
// 二维码 / 票据 / 打印区的白底:选择器命中这些词才算豁免。
const PAPER_SELECTOR = /\b(qr|qrcode|ticket|receipt|pass|print|cert)\b/i;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

function cssFiles(dir) {
  return fs.existsSync(dir) ? walk(dir).sort() : [];
}

// 注释替换成等长空格:行号偏移不变,注释里的旧 token / 颜色不再误报。
function maskComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '));
}

function buildLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineAt(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

// 所有 @media … print … { … } 块在文本中的区间,块内裸颜色不告警。
function printBlocks(masked) {
  const ranges = [];
  const opener = /@media[^{;]*\bprint\b[^{]*\{/gi;
  for (const match of masked.matchAll(opener)) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < masked.length; i += 1) {
      if (masked[i] === '{') depth += 1;
      else if (masked[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          ranges.push([open, i]);
          break;
        }
      }
    }
  }
  return ranges;
}

function inRanges(ranges, offset) {
  return ranges.some(([start, end]) => offset >= start && offset <= end);
}

// 颜色值 → { r, g, b };支持 hex、rgb()/rgba()、百分比写法。
function colorChannels(raw) {
  const hex = /^#([0-9a-fA-F]+)$/.exec(raw);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .slice(0, 3)
        .split('')
        .map((c) => c + c)
        .join('');
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }
  const rgb = /^rgba?\(([^)]*)\)$/.exec(raw);
  if (rgb) {
    const parts = rgb[1]
      .replace(/\//g, ' ')
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => {
        const value = Number.parseFloat(part);
        if (Number.isNaN(value)) return null;
        return part.endsWith('%') ? Math.round((value / 100) * 255) : Math.round(value);
      });
    if (parts.length === 3 && parts.every((value) => value !== null)) {
      return { r: parts[0], g: parts[1], b: parts[2] };
    }
  }
  return null;
}

// 声明所在的属性名(background / color / border-color …),用于判断是不是底色。
function declarationProperty(masked, offset) {
  let start = offset;
  while (start > 0 && !/[;{}]/.test(masked[start - 1])) start -= 1;
  const head = masked.slice(start, offset);
  const colon = head.indexOf(':');
  return colon === -1 ? '' : head.slice(0, colon).trim().toLowerCase();
}

function selectorAt(masked, offset) {
  const open = masked.lastIndexOf('{', offset);
  if (open === -1) return '';
  let start = open;
  while (start > 0 && !/[;{}]/.test(masked[start - 1])) start -= 1;
  return masked.slice(start, open).replace(/\s+/g, ' ').trim();
}

const isNearWhite = (c) => c.r >= 240 && c.g >= 240 && c.b >= 240;
const isLibraryWarmShadow = (c) => c.r === 61 && c.g === 52 && c.b === 40;

if (!fs.existsSync(LIB_CSS)) {
  const shown = path.relative(ROOT, LIB_CSS).split(path.sep).join('/');
  console.warn(`[check-tokens] 找不到 ${shown},跳过 token 检查(依赖未安装?)`);
  process.exit(0);
}

const tokens = new Set();
for (const block of fs.readFileSync(LIB_CSS, 'utf8').matchAll(/:root[^{]*\{([^}]*)\}/g)) {
  for (const name of block[1].matchAll(TOKEN_NAME)) tokens.add(name[0]);
}
if (tokens.size === 0) {
  console.error('[check-tokens] 无法从库 CSS 的 :root 块解析出任何 --animal-* token,请检查库版本或更新本脚本');
  process.exit(1);
}

const errors = [];
const warnings = [];
const files = cssFiles(SRC_DIR);

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const raw = fs.readFileSync(file, 'utf8');
  const masked = maskComments(raw);
  const starts = buildLineStarts(raw);
  const printRanges = printBlocks(masked);

  for (const match of masked.matchAll(VAR_REF)) {
    if (!tokens.has(match[1])) {
      errors.push(`${rel}:${lineAt(starts, match.index)} 使用了不存在的 token ${match[1]}`);
    }
  }

  const colors = [...masked.matchAll(HEX_COLOR), ...masked.matchAll(RGB_COLOR)].sort(
    (a, b) => a.index - b.index,
  );
  for (const match of colors) {
    if (inRanges(printRanges, match.index)) continue;
    const channels = colorChannels(match[0]);
    if (!channels) continue;
    if (isLibraryWarmShadow(channels)) continue;
    const property = declarationProperty(masked, match.index);
    if (property.includes('background') && isNearWhite(channels) && PAPER_SELECTOR.test(selectorAt(masked, match.index))) {
      continue;
    }
    warnings.push(`${rel}:${lineAt(starts, match.index)} 裸颜色 ${match[0]}(改用 var(--animal-*) token)`);
  }
}

for (const error of errors) console.error(`  - ${error}`);
for (const warning of warnings.slice(0, WARN_LIMIT)) console.warn(`  ! ${warning}`);
if (warnings.length > WARN_LIMIT) {
  console.warn(`  ! …另有 ${warnings.length - WARN_LIMIT} 条警告未显示`);
}

console.log(
  `检查 ${files.length} 个文件，${tokens.size} 个 token，${errors.length} 个错误，${warnings.length} 个警告`,
);

process.exit(errors.length ? 1 : 0);
