/**
 * 冒烟测试：从 index.html 抽取关键函数，在 Node 沙箱里验证行为。
 * 用法：npm test（或 node scripts/smoke-test.js）
 *
 * 为什么是"抽取"而不是 import：本项目刻意保持"单文件离线可直接双击打开"的形态，
 * 没有模块系统可用。这里用简易词法扫描（跳过字符串/注释/正则后做括号配平）把目标函数原样取出，
 * 因此：函数一旦改名或改成非 `function name(...)` 写法，本脚本会直接报"提取失败"——这是刻意的，
 * 提示需要同步更新测试，而不是静默跳过。
 *
 * 覆盖点（历史上真出过问题的地方）：
 *   renderAnswer —— 代码块不能被包进 <p>（非法嵌套）、CRLF 归一化、转义
 *   stripMarkdown —— 代码围栏必须原样保留（否则导入的答案里代码块降级成纯文本）
 *   clozeEq / csvCell —— 归一化判对、CSV 公式注入防护
 *   applySm2Grade —— opts.noAutoMaster 只影响 EASY 档的"自动标记已掌握"
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const scripts = [];
{
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) scripts.push(m[1]);
}
// 按内容定位主脚本，而不是写死序号：将来新增内联 <script> 块也不会挑错
const src = scripts.find(s => s.indexOf('function renderAnswer(') !== -1) || '';
if (!src) throw new Error('未找到包含 renderAnswer 的主内联脚本');

/* ---------- 简易词法扫描：跳过字符串/注释/正则后做括号配平 ---------- */
function isRegexStart(s, i){
  let j = i - 1;
  while (j >= 0 && /\s/.test(s[j])) j--;
  if (j < 0) return true;
  return '([{,;:=!&|?+*-<>%~^'.indexOf(s[j]) !== -1;
}
function skipRegex(s, i){
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
}
function matchBalanced(s, startIdx){
  const open = s[startIdx];
  const close = open === '{' ? '}' : open === '[' ? ']' : ')';
  let depth = 0, i = startIdx;
  while (i < s.length){
    const ch = s[i], nx = s[i + 1];
    if (ch === '/' && nx === '/'){ const nl = s.indexOf('\n', i); i = nl < 0 ? s.length : nl; continue; }
    if (ch === '/' && nx === '*'){ const end = s.indexOf('*/', i); i = end < 0 ? s.length : end + 2; continue; }
    if (ch === '"' || ch === "'"){
      const q = ch; i++;
      while (i < s.length){ if (s[i] === '\\'){ i += 2; continue; } if (s[i] === q) break; i++; }
      i++; continue;
    }
    if (ch === '/' && isRegexStart(s, i)){ i = skipRegex(s, i); continue; }
    if (ch === open) depth++;
    else if (ch === close){ depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}
function extractFunction(name){
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const openIdx = src.indexOf('{', i);
  if (openIdx < 0) return null;
  const end = matchBalanced(src, openIdx);
  return end < 0 ? null : src.slice(i, end + 1);
}
function extractConst(name){
  for (const kw of ['const ', 'let ', 'var ']){
    const i = src.indexOf(kw + name + ' =');
    if (i < 0) continue;
    const eq = src.indexOf('=', i);
    let j = eq + 1, depth = 0;
    while (j < src.length){
      const ch = src[j];
      if (ch === '"' || ch === "'"){
        const q = ch; j++;
        while (j < src.length){ if (src[j] === '\\'){ j += 2; continue; } if (src[j] === q) break; j++; }
        j++; continue;
      }
      if (ch === '{' || ch === '[' || ch === '(') depth++;
      else if (ch === '}' || ch === ']' || ch === ')') depth--;
      else if (ch === ';' && depth === 0) return src.slice(i, j + 1);
      j++;
    }
  }
  return null;
}

/* ---------- 组装沙箱：被依赖的调度/存储函数用替身，只测目标函数自身逻辑 ---------- */
const funcs = ['esc', 'renderTitle', 'stripMarkdown', 'renderAnswer', 'clozeEq', 'csvCell', 'fsrsFromRate', 'applySm2Grade'];
const parts = funcs.map(n => {
  const f = extractFunction(n);
  if (!f) throw new Error('提取函数失败（可能已改名）：' + n);
  return f;
});
const rateConst = extractConst('Rate');
if (!rateConst) throw new Error('提取常量失败：Rate');

const harness = `
let PROGRESS = {};
function saveProgress(){}
function markDirty(){}
function fsrsStep(){ return { interval: 1, next: Date.now() + 86400000, card: { d: 5, s: 1, last: Date.now(), reps: 1, lapses: 0 } }; }
function fsrsEfOf(){ return 2.5; }
${rateConst}
${parts.join('\n')}
({ esc, renderTitle, stripMarkdown, renderAnswer, clozeEq, csvCell, fsrsFromRate, applySm2Grade, getProgress: () => PROGRESS });
`;
const api = vm.runInContext(harness, vm.createContext({}), { filename: 'extracted.js' });

let pass = 0, fail = 0;
function ok(cond, label, extra){
  if (cond){ pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra === undefined ? '' : '   -> ' + extra)); }
}

console.log('\n[renderAnswer]');
{
  const r = api.renderAnswer('前文\n\n```java\nint a = 1;\n```\n\n后文');
  ok(!/<p><pre|<\/pre><\/p>/.test(r), '代码块不再被 <p> 包裹', r);
  ok(r.indexOf('<p>前文</p>') === 0, '首段正常段落化', r);
  ok(r.indexOf('<pre><code>int a = 1;</code></pre>') !== -1, '代码块内容保留', r);
  ok(r.indexOf('<p>后文</p>') !== -1, '代码块后的文字仍是段落', r);
  ok(api.renderAnswer('一行\n二行') === '<p>一行<br>二行</p>', '单换行 → <br>', api.renderAnswer('一行\n二行'));
  ok(api.renderAnswer('**粗**与`码`') === '<p><strong>粗</strong>与<code>码</code></p>', '行内加粗/行内代码', api.renderAnswer('**粗**与`码`'));
  ok(api.renderAnswer('a\r\n\r\nb') === '<p>a</p><p>b</p>', 'CRLF 归一化后分段', api.renderAnswer('a\r\n\r\nb'));
  ok(api.renderAnswer('<b>x</b>').indexOf('&lt;b&gt;') !== -1, 'HTML 仍被转义', api.renderAnswer('<b>x</b>'));
  ok(api.renderAnswer('') === '', '空值返回空串');
  ok(api.renderAnswer('```\ncode\n```') === '<pre><code>code</code></pre>', '整段皆为代码块', api.renderAnswer('```\ncode\n```'));
  const r6 = api.renderAnswer('文字\n```\nx\n```');
  ok(/^<p>文字\s*<\/p><pre><code>x<\/code><\/pre>$/.test(r6), '代码块紧贴文字也不拆散', r6);
}

console.log('\n[stripMarkdown]');
{
  const s1 = api.stripMarkdown('说明：\n\n```java\nint a = 1; // **not bold**\n```\n\n完');
  ok((s1.match(/```/g) || []).length === 2, '代码围栏未被破坏', s1);
  ok(s1.indexOf('**not bold**') !== -1, '围栏内内容原样保留', s1);
  ok(api.stripMarkdown('**粗体**') === '粗体', '围栏外粗体仍被剥离', api.stripMarkdown('**粗体**'));
  ok(api.stripMarkdown('`行内`') === '行内', '围栏外行内代码仍被剥离', api.stripMarkdown('`行内`'));
  const s3 = api.stripMarkdown('```\na\n```\n中\n```\nb\n```');
  ok((s3.match(/```/g) || []).length === 4, '多个代码块都被保护', s3);
  ok(api.stripMarkdown('# 标题\n正文').indexOf('#') === -1, '标题井号仍被剥离', api.stripMarkdown('# 标题\n正文'));
}

console.log('\n[clozeEq / csvCell]');
{
  ok(api.clozeEq('HashMap', 'hashmap') === true, '忽略大小写');
  ok(api.clozeEq('B+树', 'B+ 树') === true, '忽略空白');
  ok(api.clozeEq('abc', 'abd') === false, '不同词判错');
  ok(api.csvCell('=1+2') === '"\'=1+2"', 'CSV 公式注入防护', api.csvCell('=1+2'));
  ok(api.csvCell('a"b') === '"a""b"', 'CSV 引号转义', api.csvCell('a"b'));
}

console.log('\n[applySm2Grade · noAutoMaster]');
{
  const P = api.getProgress;
  api.applySm2Grade('q1', 5, null);
  ok(P().q1 && P().q1.mastered === true, '记忆模式 EASY 仍标记已掌握', JSON.stringify(P().q1));
  api.applySm2Grade('q2', 5, null, { noAutoMaster: true });
  ok(P().q2 && P().q2.mastered === false, '挖空全对不再自动标记已掌握', JSON.stringify(P().q2));
  ok(P().q2 && P().q2.srLevel === 1, '挖空全对仍升级并排程', JSON.stringify(P().q2));
  api.applySm2Grade('q3', 3, null); P().q3.mastered = true;
  api.applySm2Grade('q3', 5, null, { noAutoMaster: true });
  ok(P().q3.mastered === true, 'noAutoMaster 不清掉已有的掌握标记', JSON.stringify(P().q3));
  api.applySm2Grade('q3', 1, null, { noAutoMaster: true });
  ok(P().q3.mastered === false, '「忘了」仍清除掌握标记', JSON.stringify(P().q3));
  const hist = [];
  api.applySm2Grade('q4', 3, hist);
  ok(hist.length === 1 && hist[0].qid === 'q4', '撤销栈正常记录');
}

console.log('\n[关键实现点静态断言]');
{
  ok(/opts\s*&&\s*opts\.noAutoMaster/.test(html), 'applySm2Grade 含 noAutoMaster 分支');
  ok(/applySm2Grade\(qid, rate, null, \{noAutoMaster:true\}\)/.test(html), '挖空调用点已传参');
  ok(!/if\(_uMaskEls\.length\) refreshParticleMaskRects/.test(html), '每帧刷新遮罩已移除');
  ok(/_uMaskStale/.test(html), '遮罩脏标记已就位');
  ok(/function safeLocalGet\(/.test(src), 'safeLocalGet 已定义');
  ok(!/localStorage\.getItem\('learnAppTheme'\)/.test(src), '主题读取已走安全封装');
  ok(/askReload\('有新版本可用/.test(html), 'SW 更新提示已改为全站弹窗');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
