// 文案排版检查:ui-spec 01-foundations §2.3 —— 「中文标点用全角,英文/数字与中文之间
// 不手动加空格;省略号用 …,不用 ...」。
// 扫描 src/i18n/locales/ 下两份 locale 的每个字符串值;`--fix` 时原地归一(幂等)。
// 用法:node scripts/check-copy.mjs          检查,发现违规退出码 1
//       node scripts/check-copy.mjs --fix   归一后写回并复查

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const LOCALES = ['zh-CN.json', 'zh-TW.json'];

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const PH = '\u0000'; // {{...}} 占位符,视为中文类邻居

function walk(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') walk(v, key, out);
    else if (typeof v === 'string') out.push([key, v]);
  }
  return out;
}

// 把 {{...}} 插值换成占位符(避免插值内容参与邻居判定),URL 用 \u0001 保护
function protect(s) {
  return s
    .replace(/\{\{[^{}]*\}\}/g, PH)
    .replace(/https?:\/\/\S+/g, (m) => m.replace(/./g, '\u0001'));
}
function restore(s, interps, urls) {
  let u = 0;
  return s
    .replace(/\u0001+/g, () => urls[u++])
    .replace(/\u0000/g, () => interps.shift() ?? PH);
}

const isCjkClass = (ch) => ch !== undefined && (CJK.test(ch) || ch === PH);

/**
 * 归一单个文案字符串;幂等,不改 key 结构。
 * 规则(均只作用于含中文的值):
 *  1. , : ; ? ! 在中文类邻居(汉字或插值)旁 → 全角 ,:;?!
 *  2. (...) 括号内容含中文或插值 → 全角(成对转换,最内层优先;不配对的不动)
 *  3. 中文与英文/数字(或插值)之间的单个空格删除;URL 与「 / 」等符号两侧空格保留
 *  4. 半角三点 ... → …
 */
export function normalizeCopy(value) {
  if (!CJK.test(value)) return value;
  const urls = value.match(/https?:\/\/\S+/g) ?? [];
  const interps = value.match(/\{\{[^{}]*\}\}/g) ?? [];
  let s = protect(value);

  // 规则 3:中文 ↔ 英文/数字/插值 之间的单个空格
  s = s
    .replace(/([\u4e00-\u9fff\u3400-\u4dbf]) ([0-9A-Za-z])/g, '$1$2')
    .replace(/([0-9A-Za-z]) ([\u4e00-\u9fff\u3400-\u4dbf])/g, '$1$2')
    .replace(/([\u4e00-\u9fff\u3400-\u4dbf]) \u0000/g, '$1\u0000')
    .replace(/\u0000 ([\u4e00-\u9fff\u3400-\u4dbf])/g, '\u0000$1');

  // 规则 1:邻中文的半角标点 → 全角
  const FULL = { ',': '，', ':': '：', ';': '；', '?': '？', '!': '！' };
  s = s.replace(/./gs, (ch, i) => {
    if (!(ch in FULL)) return ch;
    const prev = i > 0 ? s[i - 1] : '';
    const next = s[i + 1] ?? '';
    return isCjkClass(prev) || isCjkClass(next) ? FULL[ch] : ch;
  });

  // 规则 2:内容含中文/插值的括号对 → 全角(最内层优先)
  for (let i = 0; i < 3; i++) {
    const next = s.replace(/\(([^()]*)\)/g, (m, inner) =>
      CJK.test(inner) || inner.includes(PH) ? `（${inner}）` : m,
    );
    if (next === s) break;
    s = next;
  }

  // 规则 4:半角三点
  s = s.replace(/\.\.\./g, '…');

  // 敬语:全站统一「你」(linkage/certificates/residentPrefill 三个后建组件曾用「您」)
  s = s.replaceAll('您', '你');

  const out = restore(s, interps, urls);
  // 占位符/URL 数量必须守恒,否则放弃改写该值
  const safe =
    out.match(/\{\{/g)?.length === value.match(/\{\{/g)?.length &&
    (out.match(/https?:\/\//g)?.length ?? 0) === (value.match(/https?:\/\//g)?.length ?? 0);
  return safe ? out : value;
}

const RULES = [
  ['half-punct', /([\u4e00-\u9fff\u3400-\u4dbf][,:;?!]|[,:;?!][\u4e00-\u9fff\u3400-\u4dbf])/],
  ['half-punct-interp', /(\u0000[,:;?!]|[,:;?!]\u0000)/],
  ['half-paren-cjk', /\([^()]*[\u4e00-\u9fff\u3400-\u4dbf][^()]*\)/],
  ['half-paren-interp', /\(\u0000+\)/],
  ['cjk-ascii-space', /([\u4e00-\u9fff\u3400-\u4dbf] [0-9A-Za-z]|[0-9A-Za-z] [\u4e00-\u9fff\u3400-\u4dbf]|[\u4e00-\u9fff\u3400-\u4dbf] \u0000|\u0000 [\u4e00-\u9fff\u3400-\u4dbf])/],
  ['ascii-ellipsis', /\.\.\./],
  ['honorific-nin', /您/],
];

function findIssues(value) {
  if (!CJK.test(value)) return [];
  const urls = value.match(/https?:\/\/\S+/g) ?? [];
  const protectedStr = protect(value).replace(/\u0001+/g, '\u0001');
  return RULES.filter(([, re]) => re.test(protectedStr)).map(([name]) => name);
}

const base = path.dirname(fileURLToPath(import.meta.url));
const fix = process.argv.includes('--fix');

let changedFiles = 0;
let totalIssues = 0;
for (const name of LOCALES) {
  const file = path.join(base, '..', 'src', 'i18n', 'locales', name);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const rows = walk(json);
  const hits = [];
  for (const [key, value] of rows) {
    const issues = findIssues(value);
    if (issues.length) hits.push([key, issues, value]);
  }
  if (fix && hits.length) {
    const rewrite = (obj) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object') rewrite(v);
        else if (typeof v === 'string') obj[k] = normalizeCopy(v);
      }
    };
    rewrite(json);
    writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    changedFiles++;
  }
  totalIssues += hits.length;
  if (hits.length) {
    console.log(`\n${name}: ${hits.length} 处违规`);
    for (const [key, issues, value] of hits.slice(0, fix ? 5 : 40)) {
      console.log(`  [${issues.join('+')}] ${key} = ${value.length > 80 ? value.slice(0, 80) + '…' : value}`);
    }
    if (!fix && hits.length > 40) console.log(`  … 其余 ${hits.length - 40} 处`);
  } else {
    console.log(`${name}: OK`);
  }
}

if (fix) {
  console.log(`\n--fix: 归一 ${totalIssues} 处,重写 ${changedFiles} 个文件。复跑检查确认幂等:`);
} else {
  console.log(`\n共 ${totalIssues} 处违规(${LOCALES.join(' / ')})`);
  if (totalIssues > 0) {
    console.log('运行 node scripts/check-copy.mjs --fix 归一。');
    process.exit(1);
  }
}
