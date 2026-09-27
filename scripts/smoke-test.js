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
 *   applySm2Grade —— 记忆模式评分入口（四档自评 = FSRS 四档，含撤销栈、热榜进料、掌握语义）
 *   computeReadiness —— 就绪度三条判据（趁热榜 / 待复习 / 近两周验证过的掌握率）
 *   昨日战报 —— 按本地自然日归档（23:59 与次日 00:01 必须落在两个桶里）
 *   静态断言 —— 关键实现点 + 历次审查修复的回归护栏
 *
 * 注：回忆训练（cloze）、界面文案双皮（主题词表 + T() 包装）、复习节奏档位设置均已整体下线，
 *     对应测试与代码一并移除（下半部分的静态断言里留着"不许回潮"的守卫）。
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
function skipTemplate(s, i){          // i 指向起始反引号；返回闭合反引号之后的位置
  let j = i + 1;
  while (j < s.length){
    const ch = s[j];
    if (ch === '\\'){ j += 2; continue; }
    if (ch === '`') return j + 1;
    if (ch === '$' && s[j + 1] === '{'){        // 插值内部按代码扫（含嵌套模板），其括号不计入外层
      const end = matchBalanced(s, j + 1);
      j = end < 0 ? s.length : end + 1;
      continue;
    }
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
    // 模板字面量必须整段跳过：文本里的引号/花括号不是代码，否则提取出的函数会被截断
    // （旧扫描器没有这条，凡是"模板里带引号"的函数一提取就是语法错误）
    if (ch === '`'){ i = skipTemplate(s, i); continue; }
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
const funcs = ['esc', 'renderTitle', 'stripMarkdown', 'renderAnswer', 'csvCell', 'fsrsFromRate', 'applySm2Grade', 'dayKeyOf', 'dayIndexOf', 'normalizeDocs', 'warLogAdd', 'warLogUndo', 'feedHotFromMemory', 'hotLiveQueue', 'computeReadiness', 'buildMemoryQueue', 'undoMemoryGrade', 'fsrsClamp', 'fsrsStateOf', 'buildAnalyticsData', 'buildForecastHtml'];
const parts = funcs.map(n => {
  const f = extractFunction(n);
  if (!f) throw new Error('提取函数失败（可能已改名）：' + n);
  return f;
});
const rateConst = extractConst('Rate');
if (!rateConst) throw new Error('提取常量失败：Rate');
// 评分档位表（四档）：与 Rate 同一套刻度，必须在 Rate 之后求值
const rateMetaConst = extractConst('RATE_META');
if (!rateMetaConst) throw new Error('提取常量失败：RATE_META');
const warlogConsts = ['WARLOG_KEY', 'WARLOG_KEEP'].map(n => {
  const c = extractConst(n);
  if (!c) throw new Error('提取常量失败：' + n);
  return c;
}).join('\n');
// 就绪度阈值 + 掌握题最小间隔（各自单独声明，便于 extractConst 逐条取出）
// SM2_INIT_EF 与 SM2_MIN_EF 是同一条声明，取出前者即连带后者（分开取会重复声明）
const readyConsts = ['READY_MASTERY', 'READY_VERIFY_DAYS', 'MASTERED_MIN_DAYS', 'FSRS_MIN_STABILITY', 'SM2_INIT_EF'].map(n => {
  const c = extractConst(n);
  if (!c) throw new Error('提取常量失败：' + n);
  return c;
}).join('\n');


const harness = `
let PROGRESS = {};
function saveProgress(){}
function markDirty(){}
function fsrsStep(){ return { interval: 1, next: Date.now() + 86400000, card: { d: 5, s: 1, last: Date.now(), reps: 1, lapses: 0 } }; }
let HOT = [];
const localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
function saveHot(){}
function questionById(){ return {}; }
function hotHas(qid){ return HOT.some(h => h.qid === qid); }
function hotAdd(qid){ if(hotHas(qid)) return false; HOT.push({ qid }); return true; }
function hotRemove(qid){ const i = HOT.findIndex(h => h.qid === qid); if(i < 0) return false; HOT.splice(i, 1); return true; }
let WARLOG = {};
// 复习队列的依赖替身：题库 + 队列缓存标志 + 记忆模式状态（undoMemoryGrade 会读它）
let DOCS = [];
let _memQueueCache = null, _memQueueDirty = true, _memQueueBuiltAt = 0;
let memory = { queue: [], index: 0, flipped: false, _history: [] };
function renderAll(){}
const LS = {};
function safeLocalGet(k, f){ return Object.prototype.hasOwnProperty.call(LS, k) ? LS[k] : f; }
function safeLocalSet(k, v){ LS[k] = v; return true; }
${warlogConsts}
${rateConst}
${rateMetaConst}
${readyConsts}
${parts.join('\n')}
({ esc, renderTitle, stripMarkdown, renderAnswer, csvCell, fsrsFromRate, applySm2Grade, dayKeyOf, dayIndexOf, normalizeDocs, warLogAdd, warLogUndo, Rate, RATE_META, READY_MASTERY, READY_VERIFY_DAYS, MASTERED_MIN_DAYS, feedHotFromMemory, hotLiveQueue, computeReadiness, buildMemoryQueue, undoMemoryGrade, buildAnalyticsData, buildForecastHtml, getProgress: () => PROGRESS, getHot: () => HOT, getWarLog: () => WARLOG, getMemory: () => memory, getDocs: () => DOCS });
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

console.log('\n[applySm2Grade · 记忆模式入口（入参 = 评分档位 1-4）]');
{
  const P = api.getProgress;
  // 「掌握」= 复习阶段验证过的熟练：新题第一次评分点最高档不点亮（防"看一眼就自认会了"的流畅性错觉）
  api.applySm2Grade('q3', 4, null);
  ok(P().q3 && P().q3.mastered === false, '新题点「倒背如流」(4)：不标掌握', JSON.stringify(P().q3));
  api.applySm2Grade('q3', 4, null);
  ok(P().q3 && P().q3.mastered === true, '同一题复习时再点「倒背如流」(4)：标掌握', JSON.stringify(P().q3));
  api.applySm2Grade('q3', 1, null);
  ok(P().q3 && P().q3.mastered === false, '「完全忘了」(1) 清除掌握标记', JSON.stringify(P().q3));
  api.applySm2Grade('q5', 3, null);
  ok(P().q5 && P().q5.srLevel === 1, '「差不多」(3) → 等级 +1 并排程', JSON.stringify(P().q5));
  const hist = [];
  api.applySm2Grade('q6', 3, hist);
  ok(hist.length === 1 && hist[0].qid === 'q6', '撤销栈正常记录');
}

console.log('\n[评分档位 · 四档与 FSRS 一一对应]');
{
  const gs = [1, 2, 3, 4];
  ok(gs.every(g => api.fsrsFromRate(g) === g), '档位 1-4 原样透传给调度器（不再有换算层）', gs.map(g => api.fsrsFromRate(g)).join(','));
  ok(api.fsrsFromRate(0) === 3 && api.fsrsFromRate(NaN) === 3 && api.fsrsFromRate(99) === 4,
     '脏数据兜底：0/NaN→记得（居中档）、越界→简单（不让 NaN 污染调度链）',
     [api.fsrsFromRate(0), api.fsrsFromRate(NaN), api.fsrsFromRate(99)].join(','));
  ok(Object.keys(api.RATE_META).length === 4 && [1, 2, 3, 4].every(g => api.RATE_META[g] && api.RATE_META[g].label),
     '评分档位表就是四档（按钮文案与战报图例同源）', Object.keys(api.RATE_META).join(','));
  ok(api.RATE_META[4].label === '倒背如流', '第四档是「倒背如流」（唯一落 FSRS 简单档的按钮）', api.RATE_META[4].label);
}

console.log('\n[就绪度 · 三条判据]');
{
  const P = api.getProgress, H = api.getHot;
  const st = (tq, tm, due) => ({ tq, tm, due, fresh: 0, ts: tm });
  Object.keys(P()).forEach(k => delete P()[k]);
  H().length = 0;   // 前面「趁热进料」用例往榜里放过题，这里先清干净
  ok(api.computeReadiness(st(0, 0, 0), Date.now()).ready === false, '没有任何记录时：还不能去面');
  // 掌握且刚复习过 + 榜空 + 无到期 → 可以
  api.applySm2Grade('rd1', 4, null); api.applySm2Grade('rd1', 4, null);
  const good = api.computeReadiness(st(1, 1, 0), Date.now());
  ok(good.ready === true && good.verified === 1, '掌握且近两周验证过：可以去约面试', JSON.stringify(good.missing));
  // 把「上次复习」推到 15 天前 → 验证率掉到 0
  P().rd1.lastPracticed = Date.now() - 15 * 86400000;
  const stale = api.computeReadiness(st(1, 1, 0), Date.now());
  ok(stale.ready === false && stale.verifiedPct === 0 && /验证过/.test(stale.missing.join('；')),
     '两个月没碰过的掌握题不算数：验证率归零并报出来', JSON.stringify(stale.missing));
  // 榜里有题 / 有到期 → 各报一条
  P().rd1.lastPracticed = Date.now();
  H().push({ qid: 'rd2' });
  const withHot = api.computeReadiness(st(1, 1, 0), Date.now());
  ok(withHot.ready === false && /趁热榜/.test(withHot.missing.join('；')), '趁热榜没清空就不算就绪', JSON.stringify(withHot.missing));
  H().length = 0;
  const withDue = api.computeReadiness(st(1, 1, 3), Date.now());
  ok(withDue.ready === false && /待复习/.test(withDue.missing.join('；')), '还有待复习的题就不算就绪', JSON.stringify(withDue.missing));
}

console.log('\n[复习队列 · 到期口径]');
{
  const P = api.getProgress;
  Object.keys(P()).forEach(k => delete P()[k]);
  const doc = { id: 'd1', title: '文档1', questions: [] };
  const mkQ = id => { const q = { id, title: 'T-' + id, answer: 'A' }; doc.questions.push(q); return q; };
  ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].forEach(mkQ);
  api.getDocs().length = 0; api.getDocs().push(doc);
  const now = Date.now(), DAY = 86400000;
  P().q2 = { srNext: now + DAY };                                   // 明天到期
  P().q3 = { srNext: now - DAY, srLevel: 2 };                       // 逾期一天
  P().q4 = { mastered: true };                                      // 掌握但缺 lastPracticed（导入/云端旧数据）
  P().q5 = { mastered: true, lastPracticed: now - 3 * DAY };        // 掌握 3 天前：还没到 4 天下限
  P().q6 = { mastered: true, lastPracticed: now - 5 * DAY };        // 掌握 5 天前：已过下限
  const queue = api.buildMemoryQueue();
  const ids = queue.map(x => x.q.id).join(',');
  ok(queue.some(x => x.q.id === 'q1'), '从没学过的题入队', ids);
  ok(!queue.some(x => x.q.id === 'q2'), '未到期的题不入队', ids);
  ok(queue.some(x => x.q.id === 'q3'), '逾期题入队', ids);
  const r4 = queue.find(x => x.q.id === 'q4');
  ok(!!r4 && r4.overdue === 0, '掌握题缺 lastPracticed 时：入队但不报"逾期两万年"', r4 && String(r4.overdue));
  ok(!queue.some(x => x.q.id === 'q5'), '掌握题不足 4 天：按最小间隔挡住', ids);
  const r6 = queue.find(x => x.q.id === 'q6');
  ok(!!r6 && r6.overdue === 1, '掌握题超过 4 天：入队且逾期按真实天数算', r6 && String(r6.overdue));
  ok(api.MASTERED_MIN_DAYS === 4, '掌握最小间隔固定 4 天（产品规则）', String(api.MASTERED_MIN_DAYS));
}

console.log('\n[撤销评分 · 副作用一并回滚]');
{
  const P = api.getProgress, H = api.getHot, W = api.getWarLog, M = api.getMemory;
  Object.keys(P()).forEach(k => delete P()[k]);
  Object.keys(W()).forEach(k => delete W()[k]);
  H().length = 0;
  M()._history = [];
  const today = api.dayKeyOf(Date.now());
  api.applySm2Grade('u1', 1, M()._history);            // 忘了：进趁热榜 + 战报记一笔
  ok(H().some(x => x.qid === 'u1'), '评分「忘了」→ 题进趁热榜', JSON.stringify(H().map(x => x.qid)));
  ok(W()[today] && W()[today].c[0] === 1, '评分「忘了」→ 战报记一次', JSON.stringify(W()[today] && W()[today].c));
  api.undoMemoryGrade();
  ok(!H().some(x => x.qid === 'u1'), '撤销 → 趁热榜里的这次入榜被撤回', JSON.stringify(H().map(x => x.qid)));
  ok(W()[today] && W()[today].c[0] === 0, '撤销 → 战报计数回退', JSON.stringify(W()[today] && W()[today].c));
  ok(!P().u1, '撤销 → 该题恢复为"无记录"', JSON.stringify(P().u1));
  // 已在榜上的题不能被误删：hotAdded=false 时撤销不动榜
  H().push({ qid: 'u2' });
  api.applySm2Grade('u2', 3, M()._history);            // 差不多：本来就在榜上（hotAdd 返回 false）
  ok(H().filter(x => x.qid === 'u2').length === 1, '已在榜上的题不会重复入榜', JSON.stringify(H().map(x => x.qid)));
  api.undoMemoryGrade();
  ok(H().some(x => x.qid === 'u2'), '撤销不误删"本来就还在榜上"的题', JSON.stringify(H().map(x => x.qid)));
  M()._history = [];
  ok(api.undoMemoryGrade() === undefined, '撤销栈为空时安全空转（不抛异常）');
}

console.log('\n[FSRS 调度数学 · 独立沙箱]');
{
  // 主沙箱里 fsrsStep 是替身，调度数学本身没有任何断言覆盖 —— 这里用独立沙箱把它真正跑起来
  const fsrsConsts = ['FSRS_W','FSRS_DECAY','FSRS_MIN_STABILITY','FSRS_AGAIN_INTERVAL','FSRS_RETENTION','FSRS_MAX_INTERVAL','Rate','SM2_INIT_EF'].map(n => {
    const c = extractConst(n);
    if (!c) throw new Error('提取常量失败：' + n);
    return c;
  }).join('\n');
  const fsrsFuncs = ['fsrsClamp','fsrsInitStability','fsrsInitDifficulty','fsrsIntervalDays','fsrsRetrievability',
    'fsrsNextDifficulty','fsrsRecallStability','fsrsForgetStability','fsrsShortTermStability','fsrsStateOf','fsrsStep'].map(n => {
    const f = extractFunction(n);
    if (!f) throw new Error('提取函数失败（可能已改名）：' + n);
    return f;
  }).join('\n');
  const fsrsHarness = `${fsrsConsts}\n${fsrsFuncs}\n({ fsrsStep, fsrsIntervalDays, fsrsStateOf, FSRS_RETENTION, FSRS_MAX_INTERVAL });`;
  const fsrs = vm.runInContext(fsrsHarness, vm.createContext({}), { filename: 'fsrs-extracted.js' });
  const NOW = Date.now();
  const iv = g => fsrs.fsrsStep(null, g, NOW).interval;
  ok(iv(1) === 0.5, '首次「忘了」→ 半天后再来', iv(1));
  ok(iv(2) >= 1 && iv(3) >= 2, '首次「困难 / 记得」→ 至少 1 / 2 天', iv(2) + ' / ' + iv(3));
  ok(iv(4) > iv(3) && iv(3) > iv(2), '首次评分：间隔随评分单调递增', iv(2) + ' < ' + iv(3) + ' < ' + iv(4));
  ok(iv(4) <= 14, '间隔不超过上限（14 天）', iv(4));
  ok([0.5, 1, 5, 30, 365].every(s => { const d = fsrs.fsrsIntervalDays(s); return Number.isInteger(d) && d >= 1 && d <= 14; }),
     '间隔恒为 [1, 上限] 内的整数（不出现 0 天或 NaN）');
  // 两处刻意偏离 fsrs 库默认值的产品参数（0.9 / 36500）：它们直接决定用户看到的间隔数字，
  // 所以锁死在断言里 —— 调参必须是有意识的，而不是顺手改掉
  ok(fsrs.FSRS_RETENTION === 0.92 && fsrs.FSRS_MAX_INTERVAL === 14,
     '保留率 0.92 / 上限 14 天固定写死（库里默认 0.9 / 36500）', fsrs.FSRS_RETENTION + ' / ' + fsrs.FSRS_MAX_INTERVAL);
  ok(iv(4) === 12 && iv(3) === 2, '首次「记得 / 简单」= 2 / 12 天（= w[2]、w[3] 按 0.92 保留率折算后取整）', iv(3) + ' / ' + iv(4));
  ok(fsrs.fsrsIntervalDays(21) === 14 && fsrs.fsrsIntervalDays(30) === 14, '长间隔被 14 天上限截断（S=21 本该 16 天）', fsrs.fsrsIntervalDays(21));
  const forget = fsrs.fsrsStep({ interval:5, ef:2.5, srLevel:3, srNext:NOW, lastPracticed:NOW - 5*86400000 }, 1, NOW);
  ok(forget.interval === 0.5 && forget.card.lapses === 1, '已排程题「忘了」→ 回到半天档且遗忘数 +1', JSON.stringify(forget.card));
  const recall = fsrs.fsrsStep({ interval:3, ef:2.5, srLevel:2, srNext:NOW, lastPracticed:NOW - 86400000 }, 3, NOW);
  ok(recall.interval > 3, '隔 1 天「记得」→ 间隔比上次更长（稳定性增长）', recall.interval);
  const sameDay = fsrs.fsrsStep({ interval:2, ef:2.5, srLevel:1, srNext:NOW, lastPracticed:NOW - 2*3600*1000 }, 3, NOW);
  ok(sameDay.interval >= 1, '同日再练走短期记忆公式，间隔仍 ≥ 1 天', sameDay.interval);
  // 老记录（只有 SM-2 字段）→ DSR 换算：老数据的排期与进度页的稳定性/难度都靠它
  const legacy = fsrs.fsrsStateOf({ interval:8, ef:2.5, srLevel:2, srNext:NOW, lastPracticed:NOW }, NOW);
  ok(legacy.s === 8 && Math.abs(legacy.d - 5) < 1e-9, '老 SM-2 记录换算：S 取 interval(8)、EF 2.5 ⇒ D 5', JSON.stringify(legacy));
  ok(fsrs.fsrsStateOf({ seen:true }, NOW) === null, '只看过未评分的题没有 DSR 状态（不计入平均稳定性）');
}

console.log('\n[趁热打铁 · 记忆模式进料（零副作用）]');
{
  const H = api.getHot;
  api.applySm2Grade('h1', 1, null);            // 忘了 → 进热榜
  ok(H().some(x => x.qid === 'h1'), '非简单评分 → 进热榜');
  api.applySm2Grade('h1', 2, null);            // 再次非简单 → 不重复
  ok(H().filter(x => x.qid === 'h1').length === 1, '重复非简单 → 不重复入队');
  api.applySm2Grade('hE', 4, null);            // 倒背如流（最高档）→ 不进热榜
  ok(!H().some(x => x.qid === 'hE'), '「倒背如流」(4) 不入热榜');
  api.applySm2Grade('hM', 3, null);            // 差不多 → 仍属"没答到最高档"，要趁热
  ok(H().some(x => x.qid === 'hM'), '「差不多」(3) 属于没答到最高档 → 进热榜');
}

console.log('\n[进度页 · 数据行带 FSRS 的 DSR 状态（不是 SM-2 的 EF）]');
{
  const P = api.getProgress, D = api.getDocs;
  const now = Date.now();
  D().push({ id: 'an1', title: '进度页示例', questions: [{ id: 'an1q1' }, { id: 'an1q2' }, { id: 'an1q3' }] });
  P().an1q1 = { seen: true, srNext: now + 5 * 86400000, interval: 5, srLevel: 3, lastPracticed: now, fsrs: { d: 5.5, s: 12.3, last: now, reps: 3, lapses: 0 } };
  P().an1q2 = { seen: true, srNext: now + 3 * 86400000, interval: 8, ef: 2.5, srLevel: 2, lastPracticed: now - 3 * 86400000 };   // 只有 SM-2 字段的老记录
  P().an1q3 = { seen: true };                                                                                                    // 只看过、没评过分
  const { rows } = api.buildAnalyticsData();
  const f = id => rows.find(r => r.qid === id);
  const r1 = f('an1q1'), r2 = f('an1q2'), r3 = f('an1q3');
  ok(r1 && r1.s === 12.3 && r1.d === 5.5, '已评分的题：稳定性/难度直接取 fsrs 状态', r1 && (r1.s + ' / ' + r1.d));
  ok(r2 && r2.s === 8 && Math.abs(r2.d - 5) < 1e-9, '只有 SM-2 字段的老记录：换算成 S=interval(8)、D=5', r2 && (r2.s + ' / ' + r2.d));
  ok(r3 && r3.s === 0 && r3.d === 0, '只看过没评分的题：没有 DSR 状态（s=0，不计入平均稳定性）', r3 && (r3.s + ' / ' + r3.d));
  ok(rows.every(r => !('ef' in r)), '数据行不再携带 EF 字段（进度页展示的是稳定性/难度）');
}

console.log('\n[进度页 · 未来到期预测（窗口 = 排期上限，窗口外不丢题）]');
{
  const dayMs = 86400000;
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const at = d => ({ next: t0.getTime() + d * dayMs });
  const cols = s => (s.match(/<i class=/g) || []).length;
  const out = api.buildForecastHtml([at(3), at(20), at(-2)], 14);
  ok(cols(out) === 14, '画 14 列（= 排期上限，曾经写死 30 列、右半截永远是空柱）', cols(out));
  ok(/未来 14 天共 <b>2<\/b> 题待复习/.test(out), '窗口内（3 天后 + 逾期）计入总数：2 题');
  ok(/另有 1 题排在 14 天以后/.test(out), '窗口外的题不再被静默丢弃，脚注单独报出');
  const none = api.buildForecastHtml([at(20)], 14);
  ok(/14 天内无排期/.test(none) && !/未来无排期/.test(none), '窗口内无到期时只说"14 天内无排期"（窗口外可能还有）');
}

console.log('\n[昨日战报 · 按自然日归档]');
{
  const W = api.getWarLog;
  const tLate = new Date(2026, 0, 5, 23, 59, 0).getTime();
  const tEarly = new Date(2026, 0, 6, 0, 1, 0).getTime();
  ok(api.dayKeyOf(tLate) === '2026-01-05', '日键 = 本地自然日', api.dayKeyOf(tLate));
  ok(api.dayKeyOf(tEarly) === '2026-01-06', '跨过午夜就翻篇', api.dayKeyOf(tEarly));
  api.warLogAdd(tLate, 'w1', 1, {}, 0, false);                              // 忘了
  api.warLogAdd(tLate, 'w2', 4, {}, 1, true);                               // 简单 → 新增掌握
  api.warLogAdd(tLate, 'w2', 4, {}, 1, true);                               // 同一题再评
  api.warLogAdd(tLate, 'w3', 3, { mastered:true, srLevel:3 }, 2, false);    // 已掌握被打回 + 掉级
  const d = W()['2026-01-05'];
  ok(d && d.c[0] === 1 && d.c[2] === 1 && d.c[3] === 2, '四档次数分别归档', JSON.stringify(d && d.c));
  ok(d && d.q.length === 3, '覆盖题数去重（同题重复评分只算一道）', d && d.q.length);
  ok(d && d.mUp === 2 && d.mDown === 1, '掌握「新增 / 打回」分别计数', JSON.stringify(d && { mUp: d.mUp, mDown: d.mDown }));
  ok(d && d.up === 2 && d.down === 1, '等级「升 / 降」分别计数', JSON.stringify(d && { up: d.up, down: d.down }));
  ok(!W()['2026-01-06'], '别的一天不被串味');
}

console.log('\n[normalizeDocs · 题目 id 兜底与去重]');
{
  const nd = api.normalizeDocs;
  const docs = nd([{ id:'d1', title:'文档', questions:[{ title:'A' }, { title:'B' }, { id:'x', title:'C' }, { id:'x', title:'D' }] }]);
  const ids = docs[0].questions.map(q => q.id);
  ok(ids[0] === 'd1#1' && ids[1] === 'd1#2', '缺 id 的题按「文档id#序号」补齐', ids.join(','));
  ok(new Set(ids).size === ids.length, '同一次归一化内 id 全局唯一（重的自动加后缀）', ids.join(','));
  ok(docs[0].questions[3].title === 'D', '补 id 不改动其它字段');
  const two = nd([{ id:'d1', title:'A', questions:[{ title:'x' }] }, { id:'d2', title:'B', questions:[{ title:'y' }] }]);
  ok(two[1].questions[0].id === 'd2#1', '兜底 id 带文档前缀，跨文档不会撞在一起', two[1].questions[0].id);
  ok(nd(null).length === 0 && nd([null, 1, 'x']).length === 0, '非对象文档被丢弃（不产生幽灵文档）');
  ok(nd([{ id:'d3', title:'C' }])[0].questions.length === 0, '缺 questions 的文档补成空数组');
}

console.log('\n[逾期口径 · 记忆队列与进度页必须一致]');
{
  const P = api.getProgress, D = api.getDocs;
  Object.keys(P()).forEach(k => delete P()[k]);
  D().length = 0;
  const DAY = 86400000, now = Date.now();
  const d0 = new Date(now); d0.setHours(0,0,0,0);
  // 昨天 23:00 到期：老实现里进度页用 Math.round((now-next)/day) 会算成 0 天（记忆页却是 1 天）
  const lateYesterday = d0.getTime() - 3600*1000;
  D().push({ id:'oa', title:'口径', questions:[{ id:'oa1', title:'t', answer:'a' }] });
  P().oa1 = { srNext: lateYesterday, srLevel: 2, lastPracticed: now - 2*DAY, seen: true };
  const q = api.buildMemoryQueue().find(x => x.q.id === 'oa1');
  const row = api.buildAnalyticsData().rows.find(r => r.qid === 'oa1');
  ok(!!q && q.overdue === 1, '记忆队列：昨天 23:00 到期 → 欠 1 天', q && String(q.overdue));
  ok(!!row && row.overdue === 1, '进度页：同一道题也是 1 天（两页口径已统一）', row && String(row.overdue));
}

console.log('\n[到期预测 · 今天稍晚到期的题归第 0 列]');
{
  const t0 = new Date(); t0.setHours(0,0,0,0);
  // 今天 18:00 到期（若当前已过 18:00 则退化为"已到期"，同样应落在第 0 列）
  const tonight = t0.getTime() + 18*3600*1000;
  const out = api.buildForecastHtml([{ next: tonight }], 14);
  const cells = out.match(/<i class="([^"]*)"/g) || [];
  ok(/未来 14 天共 <b>1<\/b> 题待复习/.test(out), '今天晚些到期的题计入总数', out.slice(0, 160));
  ok(cells.length === 14 && cells[0].indexOf('today') !== -1,
     '落在第 0 列（"今天"），不再被 Math.round 四舍五入进"明天"', cells[0]);
  ok(!/另有/.test(out), '不产生"排在 14 天以后"的误报');
}

console.log('\n[战报 · "首刷"只认从未评分过的题]');
{
  const W = api.getWarLog;
  Object.keys(W()).forEach(k => delete W()[k]);
  const t = new Date(2026, 2, 3, 10, 0, 0).getTime();
  // 只在刷题模式里翻看过（有 lastPracticed 与 srNext，但没有 fsrs 状态）→ 仍算今天首次作答
  const browsed = { practiced:true, lastPracticed:t-1000, srNext:t };
  api.warLogAdd(t, 'nw1', 3, browsed, 1, false);
  // 之前评过分的题 → 不算首刷
  api.warLogAdd(t, 'nw2', 3, { fsrs:{ d:5, s:1, last:0, reps:1, lapses:0 }, lastPracticed:t-1000, srNext:t }, 1, false);
  const d = W()['2026-03-03'];
  ok(d && d.nw === 1, '首刷只算"从未评过分"的题（翻看不打折）', d && String(d.nw));
  api.warLogUndo(t, 'nw1', 3, browsed, 1, false);
  ok(d && d.nw === 0, '撤销首刷题 → nw 对称回退', d && String(d.nw));
}

const smokeHtmlCsp = (html.match(/Content-Security-Policy[^>]*/) || [''])[0];
console.log('\n[关键实现点静态断言]');
{
  ok(!/CLOZEP|clozeGrade|renderCloze|clozeHeuristic|clozeQueueBuild/.test(html), '回忆训练（cloze）已整体下线：渲染/调度/存储/同步均无残留');
  ok(!/noAutoMaster/.test(html), 'noAutoMaster 分支已随旧挖空模式下线');
  ok(!/clozeByAI|_clozeCache|function clozeEq\(/.test(html), 'AI 挖空 / 词表缓存 / 填空比对已彻底移除');
  ok(/'hot-data\.json':\{content:hotStr\}/.test(html), '趁热有独立 gist 文件（不与主数据混）');
  ok(/function feedHotFromMemory\(qid, rate\)\{ if\(rate >= Rate\.EASY\) return false; return hotAdd\(qid\) === true; \}/.test(html),
     '趁热进料：倒背如流不动、其余三档去重入队（并回报"这次是否真入榜"，供撤销回滚）');
  // —— 评分档位：UI 四档与 FSRS 四档一一对应。曾经存在过"UI 五档 + 换算表"两层刻度，
  //    那层换算正是"点简单却不涨掌握"事故的温床；现在两者是同一套刻度，这类错位不可能再发生 ——
  ok(/const gradeBtns = \[Rate\.AGAIN, Rate\.HARD, Rate\.GOOD, Rate\.EASY\]\.map\(/.test(html), '评分按钮由四档枚举生成（档位数不许再手写死）');
  ok(!/MEM_RATES|MEM_EASY_RATE/.test(html), '旧的五档表 / 换算常量已删除（档位只剩一套刻度）');
  ok(!/4:-55/.test(html), '飞出动画的位移表也退回四档');
  // —— 掌握语义：新题第一次评分即使点最高档也不算掌握（防"看一眼就自认会了"）——
  ok(/const newMastered = g===Rate\.EASY \? \(!!pr\.fsrs \|\| !!pr\.mastered\)/.test(html), '掌握要复习阶段验证过才点亮（新题点最高档不标）');
  // —— 就绪度卡片：三条可验证的判据 ——
  ok(/function computeReadiness\(stats, now\)/.test(html) && /🎯 就绪度/.test(html),
     '总览页有「就绪度」卡（趁热榜 / 待复习 / 近两周验证过的掌握率）');
  // —— 记忆模式的三个易错点（都曾真实踩到）——
  ok((html.match(/resetMemoryState\(\);/g) || []).length >= 5,
     '数据整体替换的入口都调 resetMemoryState()（导入 / 云拉取 / 清进度 / 清空共 5 处）',
     String((html.match(/resetMemoryState\(\);/g) || []).length));
  ok(!/if\(!hadQueue\) memory\._history = \[\]/.test(html), '队列重建不再顺手清掉撤销栈（切走再回来仍能撤销）');
  ok(/^let _memGradeBusy = false;/m.test(html) && !/let _memBusy/.test(html),
     '评分锁是模块级（渲染闭包里的锁会被"动画期切走再切回"绕过，导致同题双评分）');
  ok(/function warLogUndo\(at, qid, g, pr, newLvl, newMastered\)/.test(html), '战报支持反向回滚（撤销评分时同步回退计数）');
  // —— 复习节奏：档位设置已移除，参数固定（老存档的键由 init 迁移清掉）——
  ok(!/PACES|renderPaceUI|function setPace|paceGrid|paceStatus/.test(html), '「复习节奏」设置卡 / 档位表 / 切换函数均已移除');
  ok(/localStorage\.removeItem\('learnAppPace'\)/.test(html), '老存档的节奏键会被迁移清除（否则每次启动都重排一遍）');
  ok(/const FSRS_RETENTION = 0\.92;/.test(html) && /const FSRS_MAX_INTERVAL = 14;/.test(html) && /const MASTERED_MIN_DAYS = 4;/.test(html),
     '固定参数集中声明一处（保留率 / 上限 / 掌握最小间隔）');
  // —— 进度页：展示 FSRS 的 DSR 状态（稳定性/难度），不再展示 SM-2 的 EF ——
  //    EF 是 SM-2 的概念，之前只是从 D 反推出来当展示字段；改回 EF 会让"平均 EF"这种看不懂的数字重新出现
  ok(!/平均 EF|avgEf|fsrsEfOf/.test(html), '「平均 EF」卡片 / avgEf / D→EF 反推函数均已移除');
  ok(!/\bef\s*:/.test(html), '新记录不再写 EF 字段（EF 只作为老记录换算的输入被读一次）');
  ok(/const header = \['qid','题目','文档','等级','掌握','下次复习','间隔\(天\)','稳定性\(天\)','难度','逾期\(天\)','待复习'\];/.test(html),
     'CSV 明细的 EF 列换成 FSRS 口径的稳定性 / 难度');
  ok(/平均记忆稳定性 S：/.test(html), '复制给 AI 的报告用稳定性 S / 难度 D 描述掌握程度');
  ok(/const rated = rows\.filter\(r=>r\.s>0\);/.test(html), '进度页的平均值只统计已排期的题（分母不再含未评分的题）');
  // —— 到期预测：窗口 = 排期上限（14 天），窗口外不丢题 ——
  ok(!/buildForecastHtml\(rows, 30\)/.test(html) && /buildForecastHtml\(rows, FSRS_MAX_INTERVAL\)/.test(html),
     '到期预测的窗口跟着排期上限走（曾写死 30 天：题最多排到 14 天后，右半截永远是空柱）');
  ok(/if\(idx < days\) buckets\[idx\]\+\+; else later\+\+;/.test(html), '窗口外的题计入"更晚"而不是被静默丢掉（总数才诚实）');
  ok(!/旧版 SM-2 数据已自动迁移|艾宾浩斯/.test(html), '界面不再提已下线的 SM-2 迁移与艾宾浩斯（现在就是 FSRS）');
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
  // —— 昨日战报：独立存储 + 按自然日归日，绝不碰记忆进度 ——
  ok(/function warLogAdd\(now, qid, g, pr, newLvl, newMastered\)/.test(html), '战报归档函数签名稳定（applySm2Grade 的埋点依赖它）');
  ok(/safeLocalSet\(WARLOG_KEY, JSON\.stringify\(WARLOG\)\)/.test(html), '战报日志落独立 localStorage 键（不进 gist 主载荷）');
  ok(/new Date\(t\.getFullYear\(\), t\.getMonth\(\), t\.getDate\(\)-1\)/.test(html), '「昨天」用日历减法算（夏令时下减 86400000 会错一天）');
  ok(/safeLocalGet\(WARREPORT_SEEN,''\) === todayKey/.test(html), '战报每天只弹一次：标记值 = 当天日期键，跨天自然失效');
  // —— 界面文案双皮：整体下线，界面固定一套用词（不留 T() 死抽象、不留切换入口）——
  ok(!/COPY_THEMES|COPY_BACK|applyCopyStatic|renderCopyUI|applyCopyTheme|setCopyTheme|copyTheme|copyGrid|data-copy/.test(html),
     '文案双皮（词表 / 回译 / 设置卡 / data-copy 标记）已彻底移除');
  ok(/(^|[^\w$.])T\(/.test(html) === false, 'UI 文案不再包 T() 包装（不留空操作装饰）');
  ok(/localStorage\.removeItem\('learnAppCopyTheme'\)/.test(html), '老存档的文案主题键会被清掉（不留孤儿偏好）');
  ok(/const VIEW_NAMES = \{ overview:'总览'/.test(html), '屏幕阅读器播报的页名仍是"总览"这类默认用词');
  // —— 本轮全盘审查修复的回归护栏（每条都对应一个真实的逻辑错位）——
  ok(/const uMsg = hist\.find\(m => m\.role === 'user'\);/.test(html) && !/hist\[0\]\.content = '<resume>/.test(html),
     '面试简历注入到第一条 user 消息（落到 assistant 问候语上就与提示词的 RESUME_NOTE 声明相反）');
  ok(/function normalizeDocs\(docs\)[\s\S]{0,2000}usedIds\.has\(id\)/.test(html),
     '归一化层给缺 id / 重 id 的题目兜底与去重（否则多道题共用一份进度与文档归属）');
  ok(/if\(rate==='good'\)\{ p\.seen = true; p\.mastered = !!\(p\.fsrs \|\| p\.mastered\); \}/.test(html),
     '八股自评的掌握与记忆模式同一套语义（不再一次"熟练"就永久点亮）');
  ok(!/p\.selfRate = rate/.test(html), 'PROGRESS 不再写入没有任何读取方的 selfRate 字段');
  ok(/function dayIndexOf\(ts\)/.test(html) && /todayNo - dayIndexOf\(effectiveNext\)/.test(html),
     '逾期天数统一走自然日序号（记忆队列与进度页同口径）');
  ok(/const lvCounts = Object\.assign\(\{\}, computeLvCounts\(\)\);/.test(html),
     '进度页的等级分布与记忆页同分母（含从未学过的 Lv0）');
  ok(/const idx = dayIndexOf\(n\) - todayNo;/.test(html), '到期预测按自然日归柱（今天晚些到期不再算进明天）');
  ok(/if\(!\(pr && pr\.fsrs\)\) d\.nw\+\+;/.test(html), '战报"首刷"按是否评过分判定（翻看不打折）');
  ok(/function openImportPicker\(\)/.test(html) && /id="docsImport"/.test(html) && /id="memImport"/.test(html),
     '空题库有导入引导（文档页 / 记忆页），且导入入口只有一份实现');
  ok(!/_uRipples/.test(html) && !/^let cloze = /m.test(html) && !/id="tabs"/.test(html),
     '回忆训练遗留状态对象 / 未使用的 _uRipples / 死 id 已清除');
  ok(/\$\('#themePopup'\)\]\.filter\(el=>el&&el\.classList\.contains\('show'\)\)\.pop\(\)/.test(html),
     '主题弹窗已纳入 Tab 焦点陷阱');
  ok(/role="button" tabindex="0" aria-expanded="\$\{memory\.flipped\?'true':'false'\}"/.test(html),
     '记忆卡对读屏/键盘暴露"可展开"语义');
  ok(/function saveCloudPayload\(/.test(html) && !/\(await Store\.saveDocs\(newDocs\)\) && \(await Store\.saveProgress/.test(html),
     '云端数据落库不再用 && 短路（避免"文档已覆盖、进度没写"还提示本地数据未变）');
  ok(/function applyHotFromGist\(/.test(html), '两条云拉取路径共用同一段热榜落库逻辑');
  ok(/const here = location\.href\.split\('#'\)\[0\]\.split\('\?'\)\[0\];/.test(html),
     'SW 修复只注销"管着当前页面"的注册（不再误伤同域其它应用）');
  const _mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  ok(!/艾宾浩斯/.test(_mf.description || ''), 'PWA 清单描述与当前算法（FSRS）口径一致');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
