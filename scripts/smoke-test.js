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
 *   csvCell —— CSV 公式注入防护
 *   applySm2Grade —— 记忆模式评分入口（含撤销栈、热榜进料）
 *   静态断言 —— 关键实现点 + 历次审查修复的回归护栏
 *
 * 注：回忆训练（cloze）功能已整体下线，对应测试与代码一并移除。
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
const funcs = ['esc', 'renderTitle', 'stripMarkdown', 'renderAnswer', 'csvCell', 'fsrsFromRate', 'applySm2Grade'];
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
let HOT = [];
const localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
function saveHot(){}
function questionById(){ return {}; }
function hotHas(qid){ return HOT.some(h => h.qid === qid); }
function hotAdd(qid){ if(hotHas(qid)) return false; HOT.push({ qid }); return true; }
function hotRemove(qid){ const i = HOT.findIndex(h => h.qid === qid); if(i < 0) return false; HOT.splice(i, 1); return true; }
function feedHotFromMemory(qid, rate){ if(rate >= Rate.EASY) return; hotAdd(qid); }
${rateConst}
${parts.join('\n')}
({ esc, renderTitle, stripMarkdown, renderAnswer, csvCell, fsrsFromRate, applySm2Grade, feedHotFromMemory, getProgress: () => PROGRESS, getHot: () => HOT });
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

console.log('\n[csvCell · 导出安全]');
{
  ok(api.csvCell('=1+2') === '"\'=1+2"', 'CSV 公式注入防护', api.csvCell('=1+2'));
  ok(api.csvCell('a"b') === '"a""b"', 'CSV 引号转义', api.csvCell('a"b'));
}

console.log('\n[applySm2Grade · 记忆模式入口]');
{
  const P = api.getProgress;
  api.applySm2Grade('q3', 5, null);
  ok(P().q3 && P().q3.mastered === true, 'EASY 标记已掌握', JSON.stringify(P().q3));
  api.applySm2Grade('q4', 1, null);
  ok(P().q4 && P().q4.mastered === false, 'AGAIN 清除掌握标记', JSON.stringify(P().q4));
  api.applySm2Grade('q5', 3, null);
  ok(P().q5 && P().q5.srLevel === 1, '记得 → 等级 +1 并排程', JSON.stringify(P().q5));
  const hist = [];
  api.applySm2Grade('q6', 3, hist);
  ok(hist.length === 1 && hist[0].qid === 'q6', '撤销栈正常记录');
}

console.log('\n[趁热打铁 · 记忆模式进料（零副作用）]');
{
  const H = api.getHot;
  api.applySm2Grade('h1', 1, null);            // 忘了 → 进热榜
  ok(H().some(x => x.qid === 'h1'), '非简单评分 → 进热榜');
  api.applySm2Grade('h1', 2, null);            // 再次非简单 → 不重复
  ok(H().filter(x => x.qid === 'h1').length === 1, '重复非简单 → 不重复入队');
  api.applySm2Grade('hE', 4, null);            // 简单 → 不进热榜
  ok(!H().some(x => x.qid === 'hE'), '「简单」不入热榜');
}

const smokeHtmlCsp = (html.match(/Content-Security-Policy[^>]*/) || [''])[0];
console.log('\n[关键实现点静态断言]');
{
  ok(!/CLOZEP|clozeGrade|renderCloze|clozeHeuristic|clozeQueueBuild/.test(html), '回忆训练（cloze）已整体下线：渲染/调度/存储/同步均无残留');
  ok(!/noAutoMaster/.test(html), 'noAutoMaster 分支已随旧挖空模式下线');
  ok(!/clozeByAI|_clozeCache|function clozeEq\(/.test(html), 'AI 挖空 / 词表缓存 / 填空比对已彻底移除');
  ok(/'hot-data\.json':\{content:hotStr\}/.test(html), '趁热有独立 gist 文件（不与主数据混）');
  ok(/function feedHotFromMemory\(qid, rate\)\{ if\(rate >= Rate\.EASY\) return;/.test(html), '趁热进料：简单不动、非简单去重入队');
  // —— 答案展示：折叠容器（.rv-in / .answer .inner）是 overflow:hidden，长串必须能断行，否则被整段裁掉 ——
  ok(/\.rv > \.rv-in,\.answer \.inner\{min-width:0;overflow-wrap:anywhere;word-break:break-word\}/.test(html),
     '折叠答案容器放开长单词断行（长串不再"只显示一点就消失"）');
  ok(!/if\(_uMaskEls\.length\) refreshParticleMaskRects/.test(html), '每帧刷新遮罩已移除');
  ok(/_uMaskStale/.test(html), '遮罩脏标记已就位');
  ok(/function safeLocalGet\(/.test(src), 'safeLocalGet 已定义');
  ok(!/localStorage\.getItem\('learnAppTheme'\)/.test(src), '主题读取已走安全封装');
  ok(/askReload\('有新版本可用/.test(html), 'SW 更新提示已改为全站弹窗');
  // —— 音乐功能已整体下线（本地播放器 + 在线外链 + 外接 App 全删）：只留守卫，防止哪天回潮 ——
  ok(!/musicBtn|musicPanel|mpOnline|outchain|orpheus|qqmusic|parseEmbed/.test(html), '音乐相关代码 / 元素已彻底移除');
  ok(!/frame-src|media-src/.test(smokeHtmlCsp), 'CSP 已收回当初为音乐开的口子');
  ok(/deleteObjectStore\('music'\)/.test(html) && /DB_VERSION = 5/.test(html), '老版本的歌曲数据表在数据库升级时被回收（不留孤儿数据）');
  // —— 全盘审查修复的回归护栏（每条都对应一个真实踩过的坑）——
  ok(/\.modal\.settings-modal\{display:flex/.test(html), '设置弹窗吸顶头/独立滚动体的选择器已修正（.settings-modal .modal 永不匹配）');
  ok(/function maskFactor\(/.test(html) && /const a = alpha \* _uAlphaBase \* maskFactor\(x, y\);/.test(html),
     '粒子避让区在 blit 入口统一生效（不再只有星闪/松星两个主题遵守）');
  ok(/function applyOrder\(/.test(html) && /applyOrder\(\);/.test(html), 'ORDER 已真正应用到文档渲染顺序');
  ok(/saveOrderCustom: v => set\('orderCustom'/.test(html), 'orderCustom 有写入入口（不再是永假的死开关）');
  ok(/function readFileText\(file\)/.test(html) && /new TextDecoder\('gbk'\)/.test(html), '导入按内容探测编码（UTF-8/GBK）');
  ok(/function flushAiCfgSave\(/.test(html), 'AI 配置防抖落盘可被 flush（关页不丢 Key）');
  ok(/canvas\.width !== Math\.round\(cssW\*dpr\)/.test(html), '趋势图按容器宽 × DPR 绘制（不再拉伸发虚）');
  ok(!/memory\.index = 0; memory\.flipped = false; renderAll\(\); \};/.test(html), '总览/趁热入口不再复用过期的记忆队列快照');
  ok(/fresh\+\+; return; \}/.test(html), '统计里单列"未学"题数（与记忆队列口径一致）');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
