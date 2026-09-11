/**
 * 静态体检：重复 id / 选择器引用缺失 / localStorage 键清单 / console 残留 /
 *          危险 API / 定时器数量 / 疑似未使用的 CSS 类。
 * 用法：node scripts/check-globals.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const chest = fs.readFileSync(path.join(ROOT, 'chest.js'), 'utf8');
const all = html + '\n' + chest;

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
const styleBlock = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const body = html.slice(html.indexOf('</style>')) + chest;
const classNames = new Set();
const clsRe = /\.(-?[_a-zA-Z][\w-]*)/g;
while ((m = clsRe.exec(styleBlock)) !== null) classNames.add(m[1]);
console.log('\n=== 疑似只在 <style> 里定义、正文/JS 中未出现的类（人工确认）===');
// 已知的"运行时拼接"类名（源码里写作 `lv${lv}` / `an-dot lv${lv}`），静态扫描匹配不到，显式放行
const DYNAMIC_CLASS_ALLOW = new Set(['lv0', 'lv1', 'lv2', 'lv3', 'lv4', 'lv5', 'lvM']);
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
