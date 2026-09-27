/**
 * 静态体检：重复 id / 选择器引用缺失 / localStorage 键清单 / console 残留 /
 *          危险 API / 定时器数量 / 疑似未使用的 CSS 类。
 * 用法：node scripts/check-globals.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const all = html;

// 1. 字面量 id 收集与重复检测
const idMap = new Map();
const idRe = /\bid="([A-Za-z][\w:-]*)"/g;
let m;
while ((m = idRe.exec(all)) !== null) {
  const id = m[1];
  idMap.set(id, (idMap.get(id) || 0) + 1);
}
console.log('=== 重复出现的字面量 id（>1 次，可能是静态+模板或真重复）===');
let dupCount = 0;
for (const [id, n] of idMap) if (n > 1) { console.log(`  ${id} x${n}`); dupCount++; }
if (!dupCount) console.log('  (无)');

// 2. 选择器引用核对
const wanted = new Set();
const selRe = /\$\('#([\w:-]+)'\)|getElementById\(['"]([\w:-]+)['"]\)/g;
while ((m = selRe.exec(all)) !== null) wanted.add(m[1] || m[2]);
const idAssignRe = /\.id\s*=\s*'([\w:-]+)'/g;
const assigned = new Set();
while ((m = idAssignRe.exec(all)) !== null) assigned.add(m[1]);
console.log('\n=== 被 $()/getElementById 直接引用但未找到字面量 id= 的（可能动态生成，需人工确认）===');
let missCount = 0;
for (const id of wanted) {
  if (!idMap.has(id) && !assigned.has(id)) {
    console.log('  ' + id); missCount++;
  }
}
if (!missCount) console.log('  (无)');

// 3. localStorage 键清单
const keys = new Map();
const lsRe = /localStorage\.(getItem|setItem|removeItem)\(\s*['"]([^'"]+)['"]/g;
while ((m = lsRe.exec(all)) !== null) {
  const k = m[2];
  if (!keys.has(k)) keys.set(k, new Set());
  keys.get(k).add(m[1]);
}
console.log('\n=== localStorage 键清单（经 safeLocalSet 变量键写入的不在此列）===');
for (const [k, ops] of [...keys.entries()].sort()) console.log(`  ${k}  [${[...ops].join(',')}]`);

// 4. console 残留
const clog = (all.match(/console\.log\(/g) || []).length;
const cwarn = (all.match(/console\.warn\(/g) || []).length;
const cerr = (all.match(/console\.error\(/g) || []).length;
console.log(`\n=== console 统计 === log:${clog} warn:${cwarn} error:${cerr}（log 应为 0）`);

// 5. 危险模式扫描
console.log('\n=== 危险模式 ===');
console.log('  eval(): ' + ((all.match(/\beval\(/g) || []).length));
console.log('  document.write: ' + ((all.match(/document\.write\(/g) || []).length));
console.log('  innerHTML 赋值次数: ' + ((all.match(/\.innerHTML\s*[+=]/g) || []).length));
console.log(`  setInterval: ${(all.match(/setInterval\(/g) || []).length} 处, setTimeout: ${(all.match(/setTimeout\(/g) || []).length} 处`);
console.log('  addEventListener: ' + ((all.match(/addEventListener\(/g) || []).length) + ' 处');

// 6. 疑似未被引用的 CSS 类（只报"整个文件里只出现一次"的类名，供人工判断）
// 注释要先剥掉：注释里写的 `.flip-in-*` 这类"泛指写法"会被当成类名，长期留一条假报警
const styleBlock = ((html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '').replace(/\/\*[\s\S]*?\*\//g, '');
const body = html.slice(html.indexOf('</style>'));
const classNames = new Set();
const clsRe = /\.(-?[_a-zA-Z][\w-]*)/g;
while ((m = clsRe.exec(styleBlock)) !== null) classNames.add(m[1]);
console.log('\n=== 疑似只在 <style> 里定义、正文/JS 中未出现的类（人工确认）===');
// 已知的"运行时拼接"类名（源码里写作 `lv${lv}` / `an-dot lv${lv}` / 热力图色阶 `hm-cell l${n}`），
// 静态扫描匹配不到，显式放行
// theme-* 由 applyTheme 里 'theme-'+name 拼接写入 body；热力图/等级色阶同理
const DYNAMIC_CLASS_ALLOW = new Set(['lv0', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lvM', 'l0', 'l1', 'l2', 'l3', 'l4',
                                     'theme-ziliang']);
let unused = 0;
for (const cn of classNames) {
  if (DYNAMIC_CLASS_ALLOW.has(cn)) continue;
  const esc = cn.replace(/-/g, '\\-');
  // 1) 负向前瞻避免 .btn 命中 .btn-sm 之类造成的误报
  // 2) 模板字面量拼接也算使用，例如 class="lv${lv}" / `an-dot lv${lv}`
  const used = new RegExp('[\\s"\'`.]' + esc + '(?![\\w-])').test(body)
            || new RegExp(esc + '\\$\\{').test(body);
  if (!used) { console.log('  .' + cn); unused++; }
}
if (!unused) console.log('  (无)');

// 7. localStorage 直接调用扫描：存储被禁用/受限时（隐私模式、企业策略、受限 WebView），
//    localStorage 访问会抛异常，解析期执行的代码一旦抛出会中断整个脚本。
//    这里列出"既没走 safeLocal* 封装、就近也没有 try 兜底"的调用点，正常应为 0
{
  const rows = all.split('\n');
  const naked = [];
  let tryNear = -99;
  rows.forEach((ln, i) => {
    if (/\btry\s*\{/.test(ln)) tryNear = i;
    if (!/localStorage\.(getItem|setItem|removeItem)\(/.test(ln)) return;
    if (/function\s+safeLocal\w*/.test(ln)) return;   // 安全封装本体
    if (i - tryNear <= 8) return;                     // 就近有 try 兜底
    naked.push(i + 1);
  });
  console.log('\n=== localStorage 直接调用（未走 safeLocal*，且就近无 try，应为 0）===');
  console.log(naked.length ? naked.map(n => '  line ' + n).join('\n') : '  (无)');
}

// 8. 疑似"定义后没被调用"的函数（同名标识符全文件仅出现 1 次）
//    只统计函数声明：函数表达式（含具名 IIFE，如 `(function cleanupOrphanProgress(){...})()`）的名字
//    只写给堆栈/调试看，自带调用，按名字数次数会长期误报
{
  const unusedFns = [];
  const fnRe = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  // 表达式语境的前缀：出现在这些字符之后，说明是函数表达式而不是函数声明
  const EXPR_PREFIX = '([=:,!+-~';
  let fm;
  while ((fm = fnRe.exec(all)) !== null) {
    const name = fm[1];
    if (unusedFns.indexOf(name) !== -1) continue;
    let j = fm.index - 1;
    while (j >= 0 && /\s/.test(all[j])) j--;
    if (j >= 0 && EXPR_PREFIX.indexOf(all[j]) !== -1) continue;
    const cnt = (all.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length;
    if (cnt <= 1) unusedFns.push(name);
  }
  console.log('\n=== 疑似未使用的函数（同名标识符仅出现 1 次，需人工确认）===');
  console.log(unusedFns.length ? unusedFns.map(n => '  ' + n).join('\n') : '  (无)');
}

// 9. 调用了但没定义的函数（改名只改了一半的典型事故：定义改了、调用点没改 → 运行时 ReferenceError）
let _undefinedCallHits = 0;
//    为什么必须有这条：单文件项目没有打包器/类型检查，改名靠手改，漏一处就是线上白屏级别的故障；
//    而语法检查抓不到它（`foo()` 语法完全合法）。只扫主内联脚本，避免把 CSS 里的 rgba()/translateY() 算进来。
{
  const mainScript = (() => {
    const scripts = [];
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let mm;
    while ((mm = re.exec(html)) !== null) scripts.push(mm[1]);
    return scripts.find(s => s.indexOf('function renderAnswer(') !== -1) || '';
  })();
  // 语言/浏览器内置：不是"本文件定义的函数"，显式放行
  const BUILTINS = new Set(['Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Date', 'Promise', 'Set', 'Map',
    'WeakMap', 'WeakSet', 'RegExp', 'Error', 'TypeError', 'RangeError', 'Symbol', 'BigInt', 'Proxy', 'Reflect',
    'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
    'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
    'alert', 'confirm', 'prompt', 'fetch', 'Blob', 'File', 'FileReader', 'URL', 'TextDecoder', 'TextEncoder', 'AbortController',
    'Image', 'Audio', 'AudioContext', 'HTMLElement', 'CustomEvent', 'Event', 'DOMParser', 'XMLSerializer',
    'IntersectionObserver', 'ResizeObserver', 'MutationObserver', 'getComputedStyle', 'matchMedia', 'structuredClone',
    'atob', 'btoa', 'escape', 'unescape', 'crypto', 'performance', 'navigator', 'document', 'window', 'console',
    'indexedDB', 'localStorage', 'sessionStorage', 'CSS', 'Request', 'Response', 'Headers', 'FormData',
    'Uint8Array', 'Int32Array', 'Float32Array', 'ArrayBuffer', 'DataView', 'Number', 'BigInt64Array',
    'createImageBitmap', 'queueMicrotask', 'reportError',
    'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'delete', 'void', 'in', 'of', 'do', 'else',
    'async', 'await', 'yield']);
  // 先把注释与字符串/模板的"文本段"抹成空白（模板里的 ${...} 保留为代码），否则
  // 'var(--bad)'、'rgba(...)' 这类样式字符串、以及注释里提到的旧函数名全会变成误报
  const maskCode = (s) => {
    const out = s.split('');
    const blank = (a, b) => { for (let k = a; k < b && k < out.length; k++){ if (out[k] !== '\n') out[k] = ' '; } };
    const skipStr = (i) => {                       // 普通字符串：' 或 "
      const q = s[i];
      let j = i + 1;
      while (j < s.length){ if (s[j] === '\\'){ j += 2; continue; } if (s[j] === q) return j + 1; j++; }
      return s.length;
    };
    // 正则字面量必须先于字符串判断：/[&<>"]/ 里的引号会被当成字符串起点，一路吞到下一个引号 → 遮蔽错位
    const isRegexStart = (i) => {
      let j = i - 1;
      while (j >= 0 && /\s/.test(s[j])) j--;
      if (j < 0) return true;
      return '([{,;:=!&|?+*-<>%~^'.indexOf(s[j]) !== -1;
    };
    const skipRegex = (i) => {
      let j = i + 1, inClass = false;
      while (j < s.length){
        const ch = s[j];
        if (ch === '\\'){ j += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) return j + 1;
        else if (ch === '\n') return j;
        j++;
      }
      return s.length;
    };
    const scanCode = (i, stopBrace) => {
      while (i < s.length){
        const ch = s[i], nx = s[i + 1];
        if (ch === '/' && nx === '/'){ const nl = s.indexOf('\n', i); const e = nl < 0 ? s.length : nl; blank(i, e); i = e; continue; }
        if (ch === '/' && nx === '*'){ const e0 = s.indexOf('*/', i); const e = e0 < 0 ? s.length : e0 + 2; blank(i, e); i = e; continue; }
        // 正则字面量要抹掉而不是只跳过：它的内容（如 /\u0001MD(\d+)\u0001/）会被当成代码扫出假调用
        if (ch === '/' && isRegexStart(i)){ const e = skipRegex(i); blank(i, e); i = e; continue; }
        if (ch === '"' || ch === "'"){ const e = skipStr(i); blank(i + 1, e - 1); i = e; continue; }
        if (ch === '`'){ i = scanTpl(i); continue; }
        if (stopBrace && ch === '}') return i;
        i++;
      }
      return i;
    };
    const scanTpl = (i) => {
      let j = i + 1, segStart = j;
      while (j < s.length){
        const ch = s[j];
        if (ch === '\\'){ j += 2; continue; }
        if (ch === '`'){ blank(segStart, j); return j + 1; }
        if (ch === '$' && s[j + 1] === '{'){
          blank(segStart, j);                       // 文本段抹掉，插值内部继续按代码扫
          const end = scanCode(j + 2, true);
          j = end + 1; segStart = j; continue;
        }
        j++;
      }
      blank(segStart, s.length);
      return s.length;
    };
    scanCode(0, false);
    return out.join('');
  };

  const undefinedCalls = [];
  if (mainScript){
    const code = maskCode(mainScript);
    const escName = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const callRe = /(^|[^\w$.\u4e00-\u9fa5])([A-Za-z_$][\w$]*)\s*\(/g;
    const seen = new Set();
    let cm;
    while ((cm = callRe.exec(code)) !== null){
      const name = cm[2];
      if (BUILTINS.has(name) || seen.has(name)) continue;
      seen.add(name);
      const n = escName(name);
      const declared = new RegExp('(?:^|[^\\w$])(?:function|const|let|var|class)\\s+' + n + '(?![\\w$])').test(code)
        || new RegExp('[(,]\\s*' + n + '\\s*[,)=]').test(code)                        // 形参（含箭头函数）
        || new RegExp('(?:^|[^\\w$])' + n + '\\s*[:=]\\s*(?:function\\b|\\()').test(code);   // 赋值为函数
      if (!declared) undefinedCalls.push(name);
    }
  }
  console.log('\n=== 调用了但本文件没有定义的函数（应为 0：改名漏改调用点会显示在这里）===');
  console.log(undefinedCalls.length ? undefinedCalls.map(n => '  ' + n).join('\n') : '  (无)');
  _undefinedCallHits = undefinedCalls.length;
}

// 10. 未被任何 JS/CSS 引用的字面量 id（全文件只出现一次 = 只有 id="x" 那一处）
//     只打印、不 gate：id 也可能是留给外部工具/锚点用的，需人工判断
{
  const lone = [];
  for (const id of idMap.keys()) {
    const cnt = (all.match(new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (cnt <= 1) lone.push(id);
  }
  console.log('\n=== 未被任何 JS/CSS 引用的字面量 id（疑似死属性，人工确认）===');
  console.log(lone.length ? lone.map(n => '  ' + n).join('\n') : '  (无)');
}

// 11. 顶层声明但全文件只出现一次的标识符：改名 / 删功能后遗留的死变量
//     （历史上真出现过：_uRipples、已下线功能的 cloze 状态对象）
//     只打印、不 gate：解构、形参等场景会误报
{
  const declRe = /^[ \t]*(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*=/gm;
  const names = new Set();
  let dm;
  while ((dm = declRe.exec(all)) !== null) names.add(dm[1]);
  const lone = [];
  for (const n of names) {
    // 用前后向断言而不是 \b：标识符里可能含 $（项目里的 $ 选择器函数就是），
    // \b 在两个非单词字符之间不成立，会把 $() 的每次调用都漏掉、误报成死变量
    const cnt = (all.match(new RegExp('(^|[^\\w$])' + n.replace(/\$/g, '\\$') + '(?![\\w$])', 'g')) || []).length;
    if (cnt <= 1) lone.push(n);
  }
  console.log('\n=== 顶层声明但全文件只出现一次（疑似死变量，人工确认）===');
  console.log(lone.length ? lone.map(n => '  ' + n).join('\n') : '  (无)');
}

/* ---------- 门禁：以上"应为 0"的硬指标任一命中即非零退出 ----------
   原先本脚本没有退出码，无论发现什么都是 exit 0 —— npm run check 与 CI 里的这条门禁形同虚设。
   这里只收"确定性回归"（重复 id / console.log / eval / document.write / 裸 localStorage），
   "疑似未使用"这类需人工判断的项仍只打印、不 gate，避免误报把正常改动卡死。 */
const _dupIdHits = (() => {
  const seen = new Set(), dup = new Set();
  const re = /\bid="([A-Za-z][\w:-]*)"/g;
  let x;
  while ((x = re.exec(all)) !== null) { if (seen.has(x[1])) dup.add(x[1]); seen.add(x[1]); }
  return dup.size;
})();
const _nakedLsHits = (() => {
  const rows = all.split('\n');
  let tryNear = -99, n = 0;
  rows.forEach((ln, i) => {
    if (/\btry\s*\{/.test(ln)) tryNear = i;
    if (!/localStorage\.(getItem|setItem|removeItem)\(/.test(ln)) return;
    if (/function\s+safeLocal\w*/.test(ln)) return;
    if (i - tryNear <= 8) return;
    n++;
  });
  return n;
})();
const _hardFailed = [
  ['重复字面量 id', _dupIdHits],
  ['console.log 残留', (all.match(/console\.log\(/g) || []).length],
  ['eval() 调用', (all.match(/\beval\(/g) || []).length],
  ['document.write 调用', (all.match(/document\.write\(/g) || []).length],
  ['裸 localStorage 调用（未走 safeLocal* 且就近无 try）', _nakedLsHits],
  ['调用了但本文件没定义的函数（改名漏改调用点 → 运行时 ReferenceError）', _undefinedCallHits]
].filter(([, n]) => n > 0);
if (_hardFailed.length) {
  console.log('\n=== 门禁未通过（硬指标出现回归）===');
  _hardFailed.forEach(([k, n]) => console.log('  ✗ ' + k + '：' + n));
  process.exitCode = 1;
} else {
  console.log('\n=== 门禁通过：硬指标全为 0 ===');
}
