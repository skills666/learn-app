/**
 * 静态体检：重复 id / 选择器引用缺失 / localStorage 键清单 / console 残留 /
 *          危险 API / 定时器数量 / 疑似未使用的 CSS 类。
 * 用法：node scripts/check-globals.js
 *
 * 硬门禁（命中即非零退出）：重复字面量 id、console.log、eval、document.write、
 *   裸 localStorage 调用、调用了但本文件没定义的函数。
 * 其余（疑似未使用等）只打印、不 gate —— 这类需要人工判断，误报会把正常改动卡死。
 */
const fs = require('fs');
const path = require('path');
const { findMainScript, lineOfIndex, maskCode, trySpans, isIndexInSpans } = require('./lib/html-scripts');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const all = html;

// 主脚本：抽不到就直接失败（旧实现在这里返回空串，把"未定义函数"这条门禁静默降级成"通过"）
let mainScript, mainStartLine;
try {
  const main = findMainScript(html);
  mainScript = main.code;
  mainStartLine = main.startLine;
} catch (e) {
  console.error('\n[致命] ' + e.message);
  console.error('抽取逻辑失效时，下面所有基于主脚本的检查都会失真，因此直接退出。');
  process.exit(1);
}
const mainMasked = maskCode(mainScript);
/** 主脚本内下标 → index.html 的绝对行号 */
const absLine = (idx) => mainStartLine + lineOfIndex(mainScript, idx) - 1;

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
// 注释要先剥掉：注释里写的 `.flip-in-*` 这类"泛指写法"会被当成类名，长期留一条假报警。
// 扫全部 <style> 块（旧实现只看第一个块：拆成两块后，后面那块里定义的类会静默漏报）
const styleBlocks = [];
{
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let mm;
  while ((mm = re.exec(html)) !== null) styleBlocks.push(mm[1].replace(/\/\*[\s\S]*?\*\//g, ''));
}
const styleBlock = styleBlocks.join('\n');
// 使用证据取"最后一个 </style> 之后的内容"（HTML 正文 + 全部 JS）
const bodyIdx = html.lastIndexOf('</style>');
const body = bodyIdx < 0 ? html : html.slice(bodyIdx);
const classNames = new Set();
const clsRe = /\.(-?[_a-zA-Z][\w-]*)/g;
while ((m = clsRe.exec(styleBlock)) !== null) classNames.add(m[1]);
console.log('\n=== 疑似只在 <style> 里定义、正文/JS 中未出现的类（人工确认）===');
// 已知的"运行时拼接"类名（源码里写作 `lv${lv}` / `an-dot lv${lv}` / 热力图色阶 `hm-cell l${n}`），
// 静态扫描匹配不到，显式放行。注意不要放行现实里不存在的类（白名单比现实宽会掩盖真问题）
const DYNAMIC_CLASS_ALLOW = new Set(['lv0', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lvM', 'l0', 'l1', 'l2', 'l3', 'l4']);
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

/* 7. localStorage 直接调用扫描：存储被禁用/受限时（隐私模式、企业策略、受限 WebView），
      localStorage 访问会抛异常，解析期执行的代码一旦抛出会中断整个脚本。
      判定改用"该调用点是否真的落在某个 try 块内"（scripts/lib/html-scripts.js 的 trySpans）：
      旧实现只看"往上 8 行内出现过 try {"，一个已经闭合的 try 会让后续裸调用被误放行。 */
{
  const spans = trySpans(mainScript);
  const naked = [];
  const re = /localStorage\.(getItem|setItem|removeItem)\(/g;
  let mm;
  while ((mm = re.exec(mainMasked)) !== null) {
    const idx = mm.index;
    const ls = mainScript.lastIndexOf('\n', idx) + 1;
    const le = mainScript.indexOf('\n', idx);
    const line = mainScript.slice(ls, le < 0 ? mainScript.length : le);
    if (/function\s+safeLocal\w*/.test(line)) continue;   // 安全封装本体
    if (isIndexInSpans(spans, idx)) continue;             // 该调用点确实在 try 块内
    naked.push(absLine(idx));
  }
  console.log('\n=== localStorage 直接调用（未走 safeLocal*，且不在 try 块内，应为 0）===');
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
//    为什么必须有这条：单文件项目没有打包器/类型检查，改名靠手改，漏一处就是线上白屏级别的故障；
//    而语法检查抓不到它（`foo()` 语法完全合法）。只扫主内联脚本，避免把 CSS 里的 rgba()/translateY() 算进来。
let _undefinedCallHits = 0;
// 语言 / 浏览器内置：不是"本文件定义的"，第 9 项（未定义函数）与第 12 项（未声明标识符）共用
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
    'async', 'await', 'yield', 'undefined', 'NaN', 'Infinity', 'globalThis', 'arguments', 'this', 'super',
    'event', 'frames', 'top', 'parent', 'origin', 'closed', 'status', 'history', 'location', 'self', 'caches',
    // 语言关键字（会被引用扫描当成标识符）
    'try', 'throw', 'continue', 'break', 'finally', 'case', 'default', 'instanceof', 'var', 'let', 'const',
    'class', 'static', 'get', 'set', 'extends', 'export', 'import', 'debugger', 'with', 'true', 'false', 'null',
    // window 上的常用只读属性（项目里有裸用 innerWidth / innerHeight 的写法）
    'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset',
    'devicePixelRatio', 'screenX', 'screenY', 'screenLeft', 'screenTop', 'name', 'length', 'status',
    'SyntaxError']);

{
  const undefinedCalls = [];
  const code = mainMasked;
  const escName = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const callRe = /(^|[^\w$.\u4e00-\u9fa5])([A-Za-z_$][\w$]*)\s*\(/g;
  const seen = new Set();
  let cm;
  while ((cm = callRe.exec(code)) !== null) {
    const name = cm[2];
    if (BUILTINS.has(name) || seen.has(name)) continue;
    seen.add(name);
    const n = escName(name);
    const declared = new RegExp('(?:^|[^\\w$])(?:function|const|let|var|class)\\s+' + n + '(?![\\w$])').test(code)
      || new RegExp('[(,]\\s*' + n + '\\s*[,)=]').test(code)                        // 形参（含箭头函数）
      || new RegExp('(?:^|[^\\w$])' + n + '\\s*[:=]\\s*(?:function\\b|\\()').test(code);   // 赋值为函数
    if (!declared) undefinedCalls.push(name);
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

/* 12. 引用了但没声明的标识符（变量 / 常量）。硬门禁。
      为什么必须有这条：非严格模式下"给未声明变量赋值"会隐式创建全局（不报错），
      而"读取"它直接抛 ReferenceError —— 语法检查与第 9 项的"未定义函数"都覆盖不到
      （后者只查 `name(` 形式），却能让整页功能不可用。
      真实事故：缓存变量 _hmCountsCache 的声明行在编辑中丢失 → invalidateMemQueue 里赋值（静默建全局）
      → hmDayCounts 里读取（ReferenceError）→ 进度页必崩，而其它页面看起来完全正常。 */
let _undeclaredHits = 0;
{
  const code = mainMasked;   // 字符串 / 注释 / 正则已抹成空白，下标与原文一致
  const declared = new Set();
  const addName = (raw) => {
    const seg = String(raw).replace(/\.\.\./g, '').split('=')[0].split(':').pop().trim();
    if (/^[A-Za-z_$][\w$]*$/.test(seg)) declared.add(seg);
  };
  // 1) const / let / var / function / class 后紧跟的名字（不能用 [^;\n]* 贪婪地吃尾巴：
  //    那样会把同一行后面别的声明也吞进来、切分后一个都收不到）
  {
    const re = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
    let x;
    while ((x = re.exec(code)) !== null) declared.add(x[1]);
  }
  // 1b) 逗号连写：`let db = null, useLS = false;` —— 只收"逗号 + 名字 + =" 这一种形态，避免把对象键/实参误当声明
  {
    const re = /\b(?:const|let|var)\b[^;\n]*/g;
    let x;
    while ((x = re.exec(code)) !== null) {
      // `let d, s, reps, lapses;` 与 `let a = 1, b = 2;` 都要收：后跟 = / , / ; 或（末尾那个名）已到子串结尾
      const re2 = /,\s*([A-Za-z_$][\w$]*)\s*(?=[,;=]|$)/g;
      let y;
      while ((y = re2.exec(x[0])) !== null) declared.add(y[1]);
    }
  }
  // 2) 解构声明：const {a, b: alias = 1} = … / const [x, y] = …
  {
    const re = /\b(?:const|let|var)\s*([\[{][^\]}]*[\]}])\s*=/g;
    let x;
    while ((x = re.exec(code)) !== null) {
      x[1].replace(/[\[\]{}]/g, '').split(',').forEach(addName);
    }
  }
  // 2b) 无括号的单参数箭头函数：dq=>{ … } / nd=>… （规则 3 只扫括号内，这类会漏）
  {
    const re = /(^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g;
    let x;
    while ((x = re.exec(code)) !== null) declared.add(x[2]);
  }
  {
    const re = /\b(?:const|let|var)\s*([\[{][^\]}]*[\]}])\s*=/g;
    let x;
    while ((x = re.exec(code)) !== null) {
      x[1].replace(/[\[\]{}]/g, '').split(',').forEach(addName);
    }
  }
  // 3) 参数位（只认真正的参数位）：function 参数 / 箭头函数参数 / catch 参数。
  //    绝不能"收集所有括号内的标识符" —— 那样 if(x)、while(x)、f(x) 里的 x 都会被当成"已声明"，
  //    括号内读取的未声明变量将永远漏报（真实事故 _hmCountsCache 恰好是 `if(_hmCountsCache)` 这个形态）
  {
    const grab = (txt) => {
      txt.split(',').forEach(addName);
      (txt.match(/[\[{][^\]}]*[\]}]/g) || []).forEach(t => t.replace(/[\[\]{}]/g, '').split(',').forEach(addName));
    };
    let x;
    const reFn = /\bfunction\s*[\w$]*\s*\(([^()]*)\)/g;
    while ((x = reFn.exec(code)) !== null) grab(x[1]);
    const reArrow = /\(([^()]*)\)\s*=>/g;
    while ((x = reArrow.exec(code)) !== null) grab(x[1]);
    const reCatch = /\bcatch\s*\(([^()]*)\)/g;
    while ((x = reCatch.exec(code)) !== null) grab(x[1]);
  }
  const undeclared = [];
  const seenRef = new Set();
  const refRe = /(^|[^\w$.])([A-Za-z_$][\w$]*)/g;
  let r;
  while ((r = refRe.exec(code)) !== null) {
    const nm = r[2];
    if (seenRef.has(nm) || declared.has(nm) || BUILTINS.has(nm)) continue;
    // 后跟 ( 的交给第 9 项报；后跟 : 的多半是对象键 / 标签 / 三元分支
    if (/^\s*([(:])/.test(code.slice(r.index + r[0].length))) continue;
    seenRef.add(nm);
    undeclared.push(nm);
  }
  console.log('\n=== 引用了但没声明的标识符（读取即 ReferenceError，应为 0）===');
  console.log(undeclared.length ? undeclared.map(n => '  ' + n).join('\n') : '  (无)');
  _undeclaredHits = undeclared.length;
}

/* ---------- 门禁：以上"应为 0"的硬指标任一命中即非零退出 ----------
   原先本脚本没有退出码，无论发现什么都是 exit 0 —— npm run check 与 CI 里的这条门禁形同虚设。 */
const _dupIdHits = (() => {
  const seen = new Set(), dup = new Set();
  const re = /\bid="([A-Za-z][\w:-]*)"/g;
  let x;
  while ((x = re.exec(all)) !== null) { if (seen.has(x[1])) dup.add(x[1]); seen.add(x[1]); }
  return dup.size;
})();
const _nakedLsHitsFinal = (function () {
  const spans = trySpans(mainScript);
  let n = 0;
  const re = /localStorage\.(getItem|setItem|removeItem)\(/g;
  let mm;
  while ((mm = re.exec(mainMasked)) !== null) {
    const idx = mm.index;
    const ls = mainScript.lastIndexOf('\n', idx) + 1;
    const le = mainScript.indexOf('\n', idx);
    const line = mainScript.slice(ls, le < 0 ? mainScript.length : le);
    if (/function\s+safeLocal\w*/.test(line)) continue;
    if (isIndexInSpans(spans, idx)) continue;
    n++;
  }
  return n;
})();
const _hardFailed = [
  ['重复字面量 id', _dupIdHits],
  ['console.log 残留', (all.match(/console\.log\(/g) || []).length],
  ['eval() 调用', (all.match(/\beval\(/g) || []).length],
  ['document.write 调用', (all.match(/document\.write\(/g) || []).length],
  ['裸 localStorage 调用（未走 safeLocal* 且不在 try 块内）', _nakedLsHitsFinal],
  ['调用了但本文件没定义的函数（改名漏改调用点 → 运行时 ReferenceError）', _undefinedCallHits],
  ['引用了但没声明的标识符（读取即 ReferenceError）', _undeclaredHits]
].filter(([, n]) => n > 0);
if (_hardFailed.length) {
  console.log('\n=== 门禁未通过（硬指标出现回归）===');
  _hardFailed.forEach(([k, n]) => console.log('  ✗ ' + k + '：' + n));
  process.exitCode = 1;
} else {
  console.log('\n=== 门禁通过：硬指标全为 0 ===');
}
