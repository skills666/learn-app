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

// 主脚本抽取与 check-syntax / check-globals 共用同一个模块（避免三份实现各修各的）；
// 抽不到时 findMainScript 会直接抛错——宁可测试挂掉，也不要静默测了个空脚本
const src = require('./lib/html-scripts').findMainScript(html, 'function renderAnswer(').code;

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
const funcs = ['esc', 'renderTitle', 'stripMarkdown', 'renderAnswer', 'csvCell', 'estimateYears', 'fsrsFromRate', 'applySm2Grade', 'dayKeyOf', 'dayIndexOf', 'normalizeDocs', 'warLogAdd', 'warLogUndo', 'warDevId', 'warDayMap', 'warLocalBucket', 'warDayAgg', 'warLogTrim', 'warLogMerge', 'revLogUndo', 'feedHotFromMemory', 'hotLiveQueue', 'buildMemoryQueue', 'undoMemoryGrade', 'fsrsClamp', 'fsrsStateOf', 'buildAnalyticsData', 'buildForecastHtml', 'levelOf', 'lvRank', 'buildLvBarHtml', 'invalidateMemQueue', 'bumpLvCounts', 'computeLvCounts', 'effectiveNextOf', 'pruneHot', 'pruneOrphanProgress'];
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
const warlogConsts = ['WARLOG_KEY', 'WARLOG_KEEP', 'WARLOG_DEV_KEY', 'WARLOG_LEGACY_DEV', 'REVLOG_KEY', 'REVLOG_MAX'].map(n => {
  const c = extractConst(n);
  if (!c) throw new Error('提取常量失败：' + n);
  return c;
}).join('\n');
// 调度阈值：掌握题最小间隔 / 最小稳定性（各自单独声明，便于 extractConst 逐条取出）
// SM2_INIT_EF 与 SM2_MIN_EF 是同一条声明，取出前者即连带后者（分开取会重复声明）
const schedConsts = ['MASTERED_MIN_DAYS', 'FSRS_MIN_STABILITY', 'SM2_INIT_EF'].map(n => {
  const c = extractConst(n);
  if (!c) throw new Error('提取常量失败：' + n);
  return c;
}).join('\n');
// 展示等级的分档阈值与排序权重 + 等级条的展示顺序/名称（levelOf / lvRank / buildLvBarHtml 依赖）
const lvConsts = ['LV_S_TH', 'LV_RANK', 'LV_ORDER', 'LV_NAME'].map(n => {
  const c = extractConst(n);
  if (!c) throw new Error('提取常量失败：' + n);
  return c;
}).join('\n');


const harness = `
let PROGRESS = {};
// 透传 keepLv：验证"评分路径不清等级分布缓存"这条链路（见 applySm2Grade / invalidateMemQueue）
function saveProgress(keepLv){ invalidateMemQueue(keepLv); }
function markDirty(){}
// 副作用留痕封装：被测函数（applySm2Grade / undoMemoryGrade）的 catch 分支会调它，
// 沙箱里必须存在 —— 否则一旦某条副作用真的抛错，测试会因为"warnSilent 未定义"而误报成产品缺陷
function warnSilent(){}
// 写入受阻的统一守卫（index.html 的 blockedByWriteFault）：沙箱里没有 Store，固定返回"未受阻"，
// 让评分相关的单测聚焦在评分逻辑本身；"被拦住"的路径由下方静态断言守着
function blockedByWriteFault(){ return false; }
function fsrsStep(){ return { interval: 1, next: Date.now() + 86400000, card: { d: 5, s: 1, last: Date.now(), reps: 1, lapses: 0 } }; }
let HOT = [];
const localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
function saveHot(){}
function questionById(){ return {}; }
function hotHas(qid){ return HOT.some(h => h.qid === qid); }
function hotAdd(qid){ if(hotHas(qid)) return false; HOT.push({ qid }); return true; }
function hotRemove(qid){ const i = HOT.findIndex(h => h.qid === qid); if(i < 0) return false; HOT.splice(i, 1); return true; }
let WARLOG = {};
// 保留率日志：revLogUndo 要能真的删到条目（warLogAdd 只在 pr.interval>0 时写入）
let REVLOG = [];
// 复习队列的依赖替身：题库 + 队列缓存标志 + 记忆模式状态（undoMemoryGrade 会读它）
let DOCS = [];
let _memQueueCache = null, _memQueueDirty = true, _memQueueBuiltAt = 0;
let _lvCountsCache = null, _statsCache = null;
let memory = { queue: [], index: 0, flipped: false, _history: [] };
function renderAll(){}
const LS = {};
function safeLocalGet(k, f){ return Object.prototype.hasOwnProperty.call(LS, k) ? LS[k] : f; }
function safeLocalSet(k, v){ LS[k] = v; return true; }
${warlogConsts}
${rateConst}
${rateMetaConst}
${schedConsts}
${lvConsts}
${parts.join('\n')}
({ esc, renderTitle, stripMarkdown, renderAnswer, csvCell, estimateYears, fsrsFromRate, applySm2Grade, dayKeyOf, dayIndexOf, normalizeDocs, warLogAdd, warLogUndo, warDevId, warDayAgg, warLogMerge, revLogUndo, Rate, RATE_META, MASTERED_MIN_DAYS, levelOf, lvRank, LV_S_TH, buildLvBarHtml, invalidateMemQueue, bumpLvCounts, computeLvCounts, feedHotFromMemory, hotLiveQueue, buildMemoryQueue, undoMemoryGrade, buildAnalyticsData, buildForecastHtml, getProgress: () => PROGRESS, getHot: () => HOT, getWarLog: () => WARLOG, getRevLog: () => REVLOG, getMemory: () => memory, getDocs: () => DOCS, getLvCache: () => _lvCountsCache, getLS: () => LS });
`;
const api = vm.runInContext(harness, vm.createContext({}), { filename: 'extracted.js' });

let pass = 0, fail = 0;
function ok(cond, label, extra){
  if (cond){ pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra === undefined ? '' : '   -> ' + extra)); }
}

console.log('\n[estimateYears · 简历年限估算]');
{
  // 年份句式（"2020年工作""2023年开发"）曾被正则当成年限返回 → years=2020 → 等级恒判「资深」，
  // 面试难度与追问深度整档失真。这类句式必须钉死在这里。
  ok(api.estimateYears('2020年工作于某厂') < 100, '「2020年工作」不再被当成年限', api.estimateYears('2020年工作于某厂'));
  ok(api.estimateYears('2023年开发了A系统') < 100, '「2023年开发」不再被当成年限', api.estimateYears('2023年开发了A系统'));
  ok(api.estimateYears('拥有5年工作经验') === 5, '「5年工作经验」正常识别', api.estimateYears('拥有5年工作经验'));
  ok(api.estimateYears('3 年 Java 开发') === 3, '「3 年 java 开发」正常识别', api.estimateYears('3 年 Java 开发'));
  ok(api.estimateYears('应届毕业生') === 0, '应届返回 0（有效值，不能被默认值吞掉）', api.estimateYears('应届毕业生'));
  ok(api.estimateYears('') === 3, '识别不出时回落默认 3', api.estimateYears(''));
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
  ok(P().q5 && P().q5.srLevel === 1, '「差不多」(3) → srLevel 计数器 +1 并排程（展示等级已改由 levelOf 派生，见下）', JSON.stringify(P().q5));
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
  const warC = () => (api.warDayAgg(today) || { c: [] }).c;   // 战报按设备分层存，读要过跨设备汇总
  api.applySm2Grade('u1', 1, M()._history);            // 忘了：进趁热榜 + 战报记一笔
  ok(H().some(x => x.qid === 'u1'), '评分「忘了」→ 题进趁热榜', JSON.stringify(H().map(x => x.qid)));
  ok(warC()[0] === 1, '评分「忘了」→ 战报记一次', JSON.stringify(warC()));
  api.undoMemoryGrade();
  ok(!H().some(x => x.qid === 'u1'), '撤销 → 趁热榜里的这次入榜被撤回', JSON.stringify(H().map(x => x.qid)));
  ok(warC()[0] === 0, '撤销 → 战报计数回退', JSON.stringify(warC()));
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

console.log('\n[展示等级 · 由 FSRS 稳定性 S 派生（不再数"连续答对几次"）]');
{
  const lv = api.levelOf;
  ok(lv(null) === 0 && lv({}) === 0, '无进度 / 空进度 → Lv0', String(lv(null)) + ' / ' + String(lv({})));
  ok(lv({ fsrs: { s: 2 } }) === 1, 'S=2 天 → Lv1（不到 3 天）', lv({ fsrs: { s: 2 } }));
  ok(lv({ fsrs: { s: 3 } }) === 2 && lv({ fsrs: { s: 7 } }) === 3, 'S=3 / 7 天 → Lv2 / Lv3（含边界）');
  ok(lv({ fsrs: { s: 21 } }) === 4 && lv({ fsrs: { s: 60 } }) === 5, 'S=21 / 60 天 → Lv4 / Lv5（含边界）');
  ok(lv({ fsrs: { s: 5000 } }) === 5, '再稳也封顶在 Lv5', lv({ fsrs: { s: 5000 } }));
  ok(lv({ mastered: true }) === 'M' && lv({ mastered: true, fsrs: { s: 1 } }) === 'M',
     '掌握标记优先于 S（手动/八股标记的题没有 fsrs 状态也算 M）');
  ok(api.lvRank('M') > api.lvRank(5) && api.lvRank(0) < api.lvRank(1),
     '排序权重：M 排在 Lv5 之上（战报升降比较必须用它，直接拿 M 与数字比大小恒为 false）');
  ok(lv({ interval: 8, ef: 2.5, srLevel: 2, srNext: 1, lastPracticed: 0 }) === 3,
     '只有 SM-2 字段的老记录：靠 fsrsStateOf 换算出的 S(=interval 8 天) 分档，不会集体掉到 Lv0',
     lv({ interval: 8, ef: 2.5, srLevel: 2, srNext: 1, lastPracticed: 0 }));
  ok(lv({ seen: true }) === 0, '只看过、没评过分的题没有 S，仍是 Lv0', lv({ seen: true }));
  // 旧口径脱节的两个实证：同一道题，计数器说 Lv5，稳定性说 Lv3；很稳的题忘一次计数器归零、稳定性仍有 7 天
  ok(api.levelOf({ srLevel: 5, fsrs: { s: 12.5 } }) === 3,
     '同一天连点堆出的 srLevel=5（S 仅 12.5 天）→ 展示等级修正为 Lv3', api.levelOf({ srLevel: 5, fsrs: { s: 12.5 } }));
  ok(api.levelOf({ srLevel: 0, fsrs: { s: 7 } }) === 3,
     '刚「忘了」的稳题（计数器归零、S 仍有 7 天）→ Lv3，不再被打成 Lv0', api.levelOf({ srLevel: 0, fsrs: { s: 7 } }));
  // 排期上限 14 天把间隔压平（S≥18 天一律"14 天后"），所以分档只能看 S：这是等级条存在的意义
  const a = { interval: 14, fsrs: { s: 22 } }, b = { interval: 14, fsrs: { s: 900 } };
  ok(a.interval === b.interval && api.levelOf(a) !== api.levelOf(b),
     '排期同为 14 天的两道题，等级仍能区分 S=22 与 S=900（用 interval 分档就会挤成一坨）');
}

console.log('\n[等级条 · HTML 生成（段宽 / 悬停提示 / 读屏描述）]');
{
  const bar = api.buildLvBarHtml({ 0: 88, 1: 6, 2: 3, 3: 2, 4: 1, 5: 0, M: 0 });
  ok(/class="lv0" data-lv="0" data-n="88"/.test(bar.stacked), '段上带 data-lv / data-n（animateLvBar 补帧要读）', bar.stacked);
  ok(/flex:88 1 0/.test(bar.stacked) && !/class="lv5"/.test(bar.stacked) && !/class="lvM"/.test(bar.stacked),
     '段宽按题数分配；0 题的等级不渲染空段');
  ok(bar.stacked.indexOf('title="Lv0 · 88 题（88.0%）"') !== -1, '悬停提示 = 等级名 + 题数 + 占比', bar.stacked);
  ok(bar.legend.indexOf('掌握 0') !== -1, '图例列出全部 7 档（含 0 题的档位，便于对照）');
  const withM = api.buildLvBarHtml({ 0: 1, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, M: 1 });
  ok(withM.stacked.indexOf('title="掌握 · 1 题（50.0%）"') !== -1, 'M 档悬停提示写「掌握」，不再拼出"LvM"', withM.stacked);
  ok(bar.label === '全库 100 题等级分布：Lv0 88 题，Lv1 6 题，Lv2 3 题，Lv3 2 题，Lv4 1 题，Lv5 0 题，掌握 0 题',
     '读屏描述按 Lv0 → 掌握的顺序念出各档题数', bar.label);
  const empty = api.buildLvBarHtml({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, M: 0 });
  ok(empty.stacked === '' && empty.label.indexOf('%') === -1, '空题库：不渲染段、也不出现除零的百分比', empty.label);
}

console.log('\n[等级分布 · 评分走单题增量（不再为一道题把全库重数一遍）]');
{
  const D = api.getDocs, P = api.getProgress;
  D().length = 0;   // 本段自造题库，避免受前面测试的残留影响
  D().push({ id: 'lv', title: '等级分布', questions: [{ id: 'lvq1' }, { id: 'lvq2' }, { id: 'lvq3' }] });
  const sum = o => ['M',0,1,2,3,4,5].reduce((n,k)=>n+(o[k]||0), 0);
  const c0 = api.computeLvCounts();
  ok(c0[0] === 3 && sum(c0) === 3, '三道新题 → Lv0 三道', JSON.stringify(c0));
  // 造一道"很稳"的题（S=40 天 → Lv4）后重建缓存（模拟另一条路径改完等级并正确失效）
  P().lvq1 = { seen: true, srNext: Date.now() + 1000, lastPracticed: Date.now(),
               fsrs: { d: 5, s: 40, last: Date.now(), reps: 3, lapses: 0 } };
  api.invalidateMemQueue();
  api.computeLvCounts();
  api.applySm2Grade('lvq2', 3, null);   // 沙箱的 fsrsStep 替身固定返回 S=1 → 派生等级 Lv1
  const cache = api.getLvCache();
  ok(cache !== null, '评分后等级分布缓存没被整体作废（saveProgress(true) 透传生效）', String(cache));
  ok(cache && cache[1] === 1 && cache[0] === 1 && cache[4] === 1,
     '增量按单题增减：新评分的进 Lv1、Lv0 减一、那道稳稳的 Lv4 没被误动', JSON.stringify(cache));
  ok(sum(cache) === 3, '分布总数始终等于题目总数（没算漏也没算重）', sum(cache));
  // 最重要的一条守卫：再怎么评，增量结果必须与"清缓存后全量重算"逐档一致（防止误差累积）
  api.applySm2Grade('lvq3', 1, null);   // 忘了：新题 → Lv1（沙箱替身的 S 恒为 1）
  api.applySm2Grade('lvq2', 4, null);   // 简单：已有 fsrs 状态 → 点亮掌握，等级变 'M'
  const fast = Object.assign({}, api.getLvCache());
  api.invalidateMemQueue();
  const slow = api.computeLvCounts();
  const KEYS = ['M',0,1,2,3,4,5];
  const dump = o => KEYS.map(k=>k+':'+(o[k]||0)).join(' ');
  ok(KEYS.every(k=>(fast[k]||0) === (slow[k]||0)),
     '连评两道后，增量缓存与全量重算逐档一致', dump(fast) + '  vs  ' + dump(slow));
  // 非评分路径必须照旧整体作废，否则手动改掌握标记之类的改动会让缓存悄悄过期
  api.invalidateMemQueue();
  ok(api.getLvCache() === null, '其他入口（不传 keepLv）照旧整体作废缓存');
  ok(api.bumpLvCounts(0, 3) === false, '缓存未建立时增量安全跳过（下次全量算出来的就是对的）');
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
  const d = api.warDayAgg('2026-01-05');
  ok(d && d.c[0] === 1 && d.c[2] === 1 && d.c[3] === 2, '四档次数分别归档', JSON.stringify(d && d.c));
  ok(d && d.q.length === 3, '覆盖题数去重（同题重复评分只算一道）', d && d.q.length);
  ok(d && d.mUp === 2 && d.mDown === 1, '掌握「新增 / 打回」分别计数', JSON.stringify(d && { mUp: d.mUp, mDown: d.mDown }));
  ok(d && d.up === 2 && d.down === 1, '等级「升 / 降」分别计数', JSON.stringify(d && { up: d.up, down: d.down }));
  ok(d && d.total === 4, '总次数 = 四档之和', d && String(d.total));
  const day = W()['2026-01-05'];
  ok(day && !day.c && Object.keys(day).length === 1, '当天按「设备」分层存放（合并的最小单位就是这一层）', JSON.stringify(day && Object.keys(day)));
  ok(!W()['2026-01-06'], '别的一天不被串味');
}

console.log('\n[昨日战报 · 跨设备合并（同日相加 · 同设备取新 · 幂等）]');
{
  const W = api.getWarLog, A = api.warDayAgg;
  const dev = api.warDevId();
  ok(typeof dev === 'string' && dev.length >= 8, '本机设备号在第一次用到时生成', String(dev));
  ok(api.warDevId() === dev, '同一台设备反复取号是同一个（否则每次合并都会多出一层）', api.warDevId());
  const t = new Date(2026, 1, 1, 10, 0, 0).getTime();
  api.warLogAdd(t, 'm1', 3, {}, 1, false);                       // 本机：记得 1 次
  const remote = { '2026-02-01': { devB: { c:[0,0,1,0], q:['r1'], nw:1, mUp:0, mDown:0, up:0, down:0, at: t + 1000 } } };
  const n1 = api.warLogMerge(remote);
  let agg = A('2026-02-01');
  ok(n1 === 1, '云端另一台设备的记录被并进来', String(n1));
  ok(agg.total === 2 && agg.uniq === 2, '跨设备：次数相加、覆盖题号取并集', JSON.stringify({ t: agg.total, u: agg.uniq }));
  ok(api.warLogMerge(remote) === 0, '重复合并同一份云端数据是幂等的（次数不会越并越多）', String(api.warLogMerge(remote)));
  ok(A('2026-02-01').total === 2, '幂等合并后总数保持不变', String(A('2026-02-01').total));
  // 同一台设备对同一天只有一份记录：较新的那份覆盖旧的（撤销后计数变少也要能传过去）
  api.warLogMerge({ '2026-02-01': { devB: { c:[0,0,0,0], q:['r1'], nw:1, mUp:0, mDown:0, up:0, down:0, at: t + 2000 } } });
  agg = A('2026-02-01');
  ok(agg.total === 1 && agg.uniq === 2, '同一设备取较新的那份，设备之间仍是相加', JSON.stringify({ t: agg.total, u: agg.uniq }));
  ok(W()['2026-02-01'].devB && W()['2026-02-01'].devB.at === t + 2000, '同设备取较新：旧的那份是被替换，不是叠加',
     String(W()['2026-02-01'].devB && W()['2026-02-01'].devB.at));
  // 没有设备分层的旧桶（旧版本推送过的样子）：挂到固定名下，聚合口径不变
  api.warLogMerge({ '2026-02-01': { c:[1,0,0,0], q:['leg'], nw:1, mUp:0, mDown:0, up:0, down:0 } });
  ok(A('2026-02-01').total === 2, '云端遗留的旧扁平桶也能被算进来', String(A('2026-02-01').total));
  ok(api.warLogMerge({ '2026-02-01': { c:[1,0,0,0], q:['leg'], nw:1, mUp:0, mDown:0, up:0, down:0 } }) === 0,
     '旧扁平桶同样幂等（再并一次不会翻倍）', String(A('2026-02-01').total));
  // 本机自己那层不能被云端更旧的数据盖掉（否则本机刚答的题会被一份旧快照抹掉）
  api.warLogMerge({ '2026-02-01': { [dev]: { c:[9,9,9,9], q:[], nw:0, mUp:0, mDown:0, up:0, down:0, at: 1 } } });
  ok(A('2026-02-01').total === 2, '云端更旧的"本机那份"不会覆盖本机的读数', String(A('2026-02-01').total));
  ok(W()['2026-02-01'][dev].at === t, '本机那层的时间戳没被旧数据改掉', String(W()['2026-02-01'][dev].at));
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
  const dupDocs = nd([{ id:'dup', title:'A', questions:[{ title:'x' }] }, { id:'dup', title:'B', questions:[{ title:'y' }] }]);
  ok(dupDocs.length === 2 && dupDocs[0].id !== dupDocs[1].id,
     '同 id 文档被改名而不是互相覆盖（DINDEX / ORDER 不再静默丢文档）', dupDocs.map(d => d.id).join(','));
  const noIdDoc = nd([{ title:'无 id', questions:[{ title:'x' }] }])[0];
  ok(noIdDoc.id === 'doc' && noIdDoc.questions[0].id === 'doc#1',
     '缺 id 的文档补 doc 前缀，题 id 生成与之一致', noIdDoc.id + ' / ' + noIdDoc.questions[0].id);
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

console.log('\n[存储与归一化的健壮性 · 独立沙箱]');
{
  // 独立沙箱：这里要"真的暴露" safeLocalGet / safeLocalSet 与真实会抛异常的 localStorage。
  // 主沙箱把这两者替身成了内存对象 —— 存储被禁用（隐私模式 / 受限 WebView）时的分支在那里永远测不到，
  // 而解析期执行的代码一旦抛出未捕获异常，整页就不可用，正是必须守住的那条线。
  const boxes = ['safeLocalGet', 'safeLocalSet', 'sanitizeProgressMap', 'searchIndex'].map(n => {
    const f = extractFunction(n);
    if (!f) throw new Error('提取函数失败（可能已改名）：' + n);
    return f;
  });
  const h2 = `
    let _searchIndex = null;
    let DOCS = [];
    let __lsThrows = false;
    const console = { warn(){}, error(){}, log(){} };
    const localStorage = {
      getItem(){ if(__lsThrows) throw new Error('SecurityError'); return null; },
      setItem(){ if(__lsThrows) throw new Error('QuotaExceededError'); },
      removeItem(){ if(__lsThrows) throw new Error('SecurityError'); }
    };
    ${boxes.join('\n')}
    ({ safeLocalGet, safeLocalSet, sanitizeProgressMap, searchIndex,
       setThrows: v => { __lsThrows = v; }, setDocs: d => { DOCS = d; }, resetIdx: () => { _searchIndex = null; } });
  `;
  const api2 = vm.runInContext(h2, vm.createContext({}), { filename: 'extracted-storage.js' });

  api2.setThrows(true);
  let threw = false, got = 'sentinel', wok = null;
  try { got = api2.safeLocalGet('k', 'fallback'); wok = api2.safeLocalSet('k', 'v'); } catch (_) { threw = true; }
  ok(!threw, 'localStorage 抛异常时不向外抛（受限环境页面仍可用）');
  ok(got === 'fallback' && wok === false, '读返回兜底值、写返回 false（调用方可据此提示）', got + ' / ' + wok);

  const sp = api2.sanitizeProgressMap;
  const cleaned = sp({ good: { seen: true }, nul: null, num: 42, arr: [1, 2], str: 'x', ok: {} });
  ok(Object.keys(cleaned).join(',') === 'good,ok', '非对象条目被丢掉（不再产生"有记录但不参与统计"的幽灵条目）', Object.keys(cleaned).join(','));
  ok(Object.keys(sp(null)).length === 0 && Object.keys(sp('x')).length === 0, '整体畸形时返回空表而不是抛错');

  api2.setDocs([{ id: 'd1', title: 'HashMap', questions: [{ id: 'q1', title: 'HashMap 扩容', answer: 'LOAD_FACTOR 0.75', tags: ['Java'] }] }]);
  const idx1 = api2.searchIndex();
  const idx2 = api2.searchIndex();
  ok(idx1 === idx2, '同一份题库只构建一次（搜索输入路径不再每次全量 toLowerCase）');
  ok(idx1.length === 1 && idx1[0].t === 'hashmap 扩容' && idx1[0].a === 'load_factor 0.75' && idx1[0].tags[0] === 'java',
     'title / answer / tags 均按小写入索引', JSON.stringify(idx1[0] && { t: idx1[0].t, a: idx1[0].a }));
  api2.resetIdx();
  api2.setDocs([{ id: 'd2', title: 'Redis', questions: [{ id: 'q2', title: '持久化', answer: 'RDB AOF' }] }]);
  ok(api2.searchIndex()[0].t === '持久化', '题库替换后重建索引（buildIndex 会作废缓存）');
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
  const nw = () => (api.warDayAgg('2026-03-03') || { nw: -1 }).nw;
  ok(nw() === 1, '首刷只算"从未评过分"的题（翻看不打折）', String(nw()));
  api.warLogUndo(t, 'nw1', 3, browsed, 1, false);
  ok(nw() === 0, '撤销首刷题 → nw 对称回退', String(nw()));
}

console.log('\n[撤销评分 · 保留率日志同步回滚]');
{
  const R = api.getRevLog;
  R().length = 0;
  const t = new Date(2026, 3, 8, 9, 0, 0).getTime();
  const pr = { interval: 6, lastPracticed: t - 6 * 86400000, srNext: t, fsrs: { d: 5, s: 6, last: t - 6 * 86400000, reps: 2, lapses: 0 } };
  api.warLogAdd(t, 'rv1', 3, pr, 1, false);   // 有间隔的复习 → 记入保留率日志
  api.warLogAdd(t, 'rv2', 3, {}, 1, false);   // 首刷（无上次间隔）→ 不记
  ok(R().length === 1 && R()[0].qid === 'rv1' && R()[0].d === 6,
     '有间隔的复习才记入日志，且带上 qid', JSON.stringify(R()));
  ok(api.revLogUndo(t + 1, 'rv1') === false && R().length === 1, '时刻不匹配 → 不误删');
  ok(api.revLogUndo(t, 'rv2') === false && R().length === 1, '题目不匹配 → 不误删');
  ok(api.revLogUndo(t, 'rv1') === true && R().length === 0, '撤销评分 → 该条保留率记录被精确删除');
}

const smokeHtmlCsp = (html.match(/Content-Security-Policy[^>]*/) || [''])[0];
console.log('\n[关键实现点静态断言]');
{
  ok(!/CLOZEP|clozeGrade|renderCloze|clozeHeuristic|clozeQueueBuild/.test(html), '回忆训练（cloze）已整体下线：渲染/调度/存储/同步均无残留');
  ok(!/noAutoMaster/.test(html), 'noAutoMaster 分支已随旧挖空模式下线');
  // —— 同款门禁：本轮下线的两块功能，删干净且不许回潮 ——
  ok(!/computeReadiness|READY_MASTERY|READY_VERIFY_DAYS|就绪度/.test(html),
     '「就绪度」卡片已下线（函数 / 阈值 / 文案均无残留）');
  ok(!/_hmMode|_hmAnchor|data-hm-nav|data-hm-mode|hm-month(?!s)/.test(html) && /function buildHeatmapHtml\(\)/.test(html),
     '热力图只保留今年单视图（年/月模式状态、月导航、切块类名均无残留）');
  ok(!/clozeByAI|_clozeCache|function clozeEq\(/.test(html), 'AI 挖空 / 词表缓存 / 填空比对已彻底移除');
  ok(/'hot-data\.json':\{content:hotStr\}/.test(html), '趁热有独立 gist 文件（不与主数据混）');
  ok(/function feedHotFromMemory\(qid, rate\)\{ if\(rate >= Rate\.EASY\) return false; return hotAdd\(qid\) === true; \}/.test(html),
     '趁热进料：倒背如流不动、其余三档去重入队（并回报"这次是否真入榜"，供撤销回滚）');
  // —— 评分档位：UI 四档与 FSRS 四档一一对应。曾经存在过"UI 五档 + 换算表"两层刻度，
  //    那层换算正是"点简单却不涨掌握"事故的温床；现在两者是同一套刻度，这类错位不可能再发生 ——
  ok(/\[Rate\.AGAIN, Rate\.HARD, Rate\.GOOD, Rate\.EASY\]\.map\(/.test(html), '评分按钮由四档枚举生成（档位数不许再手写死）');
  ok(!/MEM_RATES|MEM_EASY_RATE/.test(html), '旧的五档表 / 换算常量已删除（档位只剩一套刻度）');
  ok(!/4:-55/.test(html), '飞出动画的位移表也退回四档');
  // —— 掌握语义：新题第一次评分即使点最高档也不算掌握（防"看一眼就自认会了"）——
  ok(/const newMastered = g===Rate\.EASY \? \(!!pr\.fsrs \|\| !!pr\.mastered\)/.test(html), '掌握要复习阶段验证过才点亮（新题点最高档不标）');
  // —— 记忆模式的三个易错点（都曾真实踩到）——
  ok((html.match(/resetMemoryState\(\);/g) || []).length >= 7,
     '数据整体替换与题目删除的入口都调 resetMemoryState()（导入 / 云拉取×2 / 清进度 / 清空 / 删题 / 删文档，共 7 处）',
     String((html.match(/resetMemoryState\(\);/g) || []).length));
  ok(/const ago = todayNo - dayIndexOf\(lp\)/.test(html),
     '趋势图归日与全站同一口径（不再用 /86400000 取整，夏令时切换不再错一天）');
  ok(/function hmDayDetail\(dayNo, counts, plain\)/.test(html) && /hmDayDetail\(no, counts, true\)/.test(html),
     '热力图明细支持纯文本输出（title / aria-label 不再显示 <b> 字面量）');
  ok(/at: now, qid: qid \}/.test(html) && /function revLogUndo\(at, qid\)/.test(html),
     '保留率日志带 qid，且撤销评分时同步回滚（统计不再包含已撤销的复习）');
  // roving tabindex：365 个格子不能全是 tabindex=0（键盘要按 365 次 Tab 才能走过这块），
  // 只有"今天"可 Tab 到，其余为 -1，进入后用方向键在格子间移动（见 index.html 的键盘处理）
  ok(/role="button" tabindex="\$\{i===todayIdx\?'0':'-1'\}" aria-label="\$\{esc\(cellLabel\)\}"/.test(html)
     && /hm-cell\[data-no\]/.test(html) && /ArrowLeft/.test(html),
     '热力图格子对键盘 / 读屏可达（role + roving tabindex + aria-label + 方向键导航）');
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
     '粒子避让区在 blit 入口统一生效（不再只有星河/松星两个主题遵守）');
  ok(/function applyOrder\(/.test(html) && /applyOrder\(\);/.test(html), 'ORDER 已真正应用到文档渲染顺序');
  ok(/saveOrderCustom: v => set\('orderCustom'/.test(html), 'orderCustom 有写入入口（不再是永假的死开关）');
  ok(/function readFileText\(file\)/.test(html) && /new TextDecoder\('gbk'\)/.test(html), '导入按内容探测编码（UTF-8/GBK）');
  ok(/function flushAiCfgSave\(/.test(html), 'AI 配置防抖落盘可被 flush（关页不丢 Key）');
  ok(/canvas\.width !== Math\.round\(cssW\*dpr\)/.test(html), '趋势图按容器宽 × DPR 绘制（不再拉伸发虚）');
  ok(!/memory\.index = 0; memory\.flipped = false; renderAll\(\); \};/.test(html), '总览/趁热入口不再复用过期的记忆队列快照');
  ok(/fresh\+\+; return; \}/.test(html), '统计里单列"未学"题数（与记忆队列口径一致）');
  // —— 昨日战报：独立存储 + 按自然日归日，绝不碰记忆进度 ——
  ok(/function warLogAdd\(now, qid, g, pr, newLvl, newMastered\)/.test(html), '战报归档函数签名稳定（applySm2Grade 的埋点依赖它）');
  ok(/safeLocalSet\(WARLOG_KEY, JSON\.stringify\(WARLOG\)\)/.test(html), '战报日志落独立 localStorage 键（不混进 learn-data.json 主载荷）');
  ok(/'warlog-data\.json':\{content:warlogStr\}/.test(html), '战报在 gist 里有独立文件（否则手机与电脑各报一半）');
  ok(/function warLogMerge\(remote\)/.test(html) && /function warDayAgg\(day\)/.test(html),
     '战报按「天 → 设备」分层：跨设备相加、同设备取较新（合并天然幂等）');
  ok(/function warLogMigrate\(o\)/.test(html) && /warLogMigrate\(o\)/.test(html),
     '开机加载时把旧版扁平桶归到本机设备名下（无归属的桶上云会在另一端被再记一份 → 次数翻倍）');
  ok((html.match(/applyWarFromGist\(gist\);/g) || []).length === 2,
     '两条云拉取路径共用战报合并逻辑（手动拉取 / 启动自动拉取）',
     String((html.match(/applyWarFromGist\(gist\);/g) || []).length));
  ok(!/const d = WARLOG\[k\.yest\]/.test(html) && !/const wl = WARLOG\[/.test(html),
     '战报 / 热力图明细 / 堆叠柱都走 warDayAgg 汇总，不再直接读单设备的那一层');
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
  ok(/role="button" tabindex="0" aria-expanded="/.test(html) && /card\.setAttribute\('aria-expanded', memory\.flipped\?'true':'false'\)/.test(html),
     '记忆卡对读屏/键盘暴露"可展开"语义');
  ok(/function saveCloudPayload\(/.test(html) && !/\(await Store\.saveDocs\(newDocs\)\) && \(await Store\.saveProgress/.test(html),
     '云端数据落库不再用 && 短路（避免"文档已覆盖、进度没写"还提示本地数据未变）');
  ok(/function applyHotFromGist\(/.test(html), '两条云拉取路径共用同一段热榜落库逻辑');
  ok(/const here = location\.href\.split\('#'\)\[0\]\.split\('\?'\)\[0\];/.test(html),
     'SW 修复只注销"管着当前页面"的注册（不再误伤同域其它应用）');
  const _mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  ok(!/艾宾浩斯/.test(_mf.description || ''), 'PWA 清单描述与当前算法（FSRS）口径一致');
  // —— 等级条：展示等级改由 FSRS 稳定性 S 派生（旧口径是"连续答对几次"的 srLevel 计数器）——
  ok(/function levelOf\(p[,)]/.test(html) && !/pp\.mastered \? 'M' : pp\.srLevel \|\| 0/.test(html)
     && /levelOf\(PROGRESS\[dq\.id\]\)/.test(html),
     '等级分布统计走 levelOf 派生等级，不再读 srLevel 计数器');
  ok(/const level=levelOf\(p\);/.test(html) && /const lv = levelOf\(p\);/.test(html),
     '记忆队列排序与进度页数据行同步改用派生等级（与进度条同一把尺子）');
  ok(/const oldRank = lvRank\(levelOf\(pr\)\), newRank = lvRank\(newLvl\);/.test(html),
     '战报的等级升降按排序权重比较（拿 M 与数字直接比大小会漏计"掌握被打回"）');
  ok(/function invalidateMemQueue\(keepLv\)\{[\s\S]{0,140}?if\(!keepLv\) _lvCountsCache = null;/.test(html),
     '等级分布缓存只在"非评分路径"整体作废（评分路径自行增量，见 bumpLvCounts）');
  ok(/bumpLvCounts\(lvBefore, lvShown\);/.test(html) && /saveProgress\(true\);/.test(html),
     'applySm2Grade 对等级分布做单题增减，并把 keepLv 透传给 saveProgress');
  ok(/\.pbar\.lvbar\{gap:2px\}/.test(html) && /\.pbar\.lvbar > i\{min-width:4px;border-radius:0/.test(html),
     '等级条段间留缝、圆角交给容器裁（逐段圆角会把 2px 的极小段压成怪胶囊）');
  ok(/\.pbar\.lvbar:hover > i\{opacity:\.32\}/.test(html), '等级条支持悬停高亮单段、其余变淡');
  ok(/@media \(hover:hover\)\{\s*\.pbar\.lvbar:hover > i\{opacity:\.32\}/.test(html),
     '悬停高亮包在 hover:hover 里（触屏点过的那段不会一直粘在高亮态）');
  ok(/\.pbar > i\{display:block;height:100%;min-width:2px;border-radius:0 5px 5px 0/.test(html)
     && /\.bigbar > i\{[^}]*border-radius:0 5px 5px 0/.test(html),
     '单段条（刷题 / 文档页）填充统一为"左端交给容器裁 + 右端 5px 前沿圆角"（原先只有 .pbar 自带 3px，左右不对称）');
  ok(!/\.pbar > i\{[^}]*border-radius:3px/.test(html), '不再有"填充自带 3px 圆角"的孤例');
  // —— 顶部全局进度条（总进度）也归入同一套：段不自带圆角 ——
  ok(/\.stats-bar \.bar>i\{display:block;height:100%;background:/.test(html)
     && !/\.stats-bar \.bar>i\{[^}]*border-radius/.test(html),
     '全局进度条（总进度）的段不再自带圆角，改由容器裁（原先两段接缝处会有两个背靠背圆角的豁口）');
  ok(/\.stats-bar \.bar\{[^}]*min-width:72px/.test(html),
     '总进度条带 min-width（flex:1 展开是 flex-basis:0%，缺它时窄屏会被右侧统计项挤成一条线）');
  ok(/\.stats-bar \.bar>i:last-child\{border-radius:0 3px 3px 0\}/.test(html),
     '全局进度条的末段保留同半径前沿圆角（6px 高 ⇒ 3px）');
  ok(/\(masteredPct>0 \? `/.test(html) && /\(seenOnlyPct>0 \? `/.test(html),
     '宽度为 0 的段不渲染，避免 0 宽段占住 :last-child、让真正可见的末段丢掉前沿圆角');
  ok(!/transition:width \.\ds/.test(html),
     '全站不再有"声明了却永远不触发"的 width 过渡（每次渲染都重建节点）');
  ok(/function animateSegBar\(scope, sel, key\)/.test(html)
     && /animateSegBar\(c, '\.bigbar > i', 'browse:'\+d\.id\)/.test(html)
     && /animateSegBar\(c, '\.salary-bar > i', 'salary'\)/.test(html),
     '单段条（浏览页文档进度 / 总览月薪条）的宽度变化改走 WAAPI 补间（换文档时不动画）');
  ok(/_segBarPrev\.clear\(\);/.test(html) && /const _segBarPrev = new Map\(\);/.test(html),
     '数据整体替换后清空各单段条的补间基线');
  ok(!/levels:\{0:0,1:0,2:0,3:0,4:0,5:0,'M':0\}/.test(html) && !/st\.levels\[lv\]\+\+/.test(html),
     'docStats 的 levels 死字段已删除（只写不读，没有任何消费方）');
  ok(/const lvLine = LV_ORDER\.map\(lv=>`\$\{LV_NAME\[lv\]\}: \$\{o\.lvCounts\[lv\]\|\|0\}`\)/.test(html),
     '复制给 AI 的报告里掌握档写作「掌握」，不再拼出 "LvM"');
  ok(!/transition:width \.3s/.test(html), '清掉从未生效的 transition:width（段宽由 flex 分配）');
  ok(!/function animateLvBar/.test(html) && /data-n="\$\{sp\.n\}"/.test(html) && /flex-grow var\(--dur-slow\) var\(--ease-out\)/.test(html),
     '等级条段宽走 CSS 过渡（记忆页改局部更新后段节点得以复用，过渡才真正生效；WAAPI 补帧已删）');
  ok(/@media \(prefers-reduced-motion: no-preference\)\{\s*\.pbar > i\.lvM\{animation:/.test(html),
     'lvM 流光包进 no-preference（reduced-motion 下不再"闪一下再停"）');
  ok(/role="img"/.test(html) && /setAttribute\('aria-label', lvBar\.label\)/.test(html),
     '等级条对读屏暴露一句话描述（纯色块否则等于没有信息）');
  ok(/title="\$\{LV_NAME\[sp\.lv\]\} · \$\{sp\.n\} 题（\$\{sp\.p\}%）"/.test(html),
     '悬停提示用等级名 + 题数 + 占比（原先 M 档会被拼成莫名其妙的"LvM"）');
  /* ── 持久化注册表 ───────────────────────────────────────────────
     这四条守的是「新增持久化项不会再漏」这个机制本身：此前导出与导入各手写一份字段清单，
     REVLOG 就是因为要改两处而被漏掉的（长期只在本地，换机后「真实保留率」永久为空）。
     谁绕过注册表手写清单，这里立刻变红。 */
  ok(/const PERSIST_REGISTRY = \{/.test(html),
     '持久化项收在 PERSIST_REGISTRY 一张表里');
  ok((html.match(/Object\.keys\(PERSIST_REGISTRY\)\.forEach/g) || []).length === 2,
     '导出与导入都遍历注册表（恰好两处）');
  ok(/if\(!spec\.backup \|\| typeof spec\.get !== 'function'\) return;/.test(html),
     '导出只写 backup:true 的项（设备身份 / 密钥 / 时间戳不带出去）');
  ok(/if\(!spec\.backup \|\| typeof spec\.merge !== 'function'\) return;/.test(html),
     '导入只读 backup:true 的项，且逐项独立（单项失败不影响其余）');
  // 写入失败通道：Store 自持状态并通知，不依赖 30+ 个调用点去检查返回值
  ok(/function raiseFault\(kind, msg\)/.test(html) && /onWriteFault: fn =>/.test(html),
     'Store 主动报出写入受阻（不再只靠返回值，调用方无需检查）');
  ok(/id="saveFault"/.test(html) && /role="alert"/.test(html) && /\.save-fault\[hidden\]\{display:none\}/.test(html),
     '写入受阻时显示一条不会自动消失的横幅（toast 3 秒就没了，等于没提示）');
  ok(/const ok = saveLS\(Object\.assign\(loadLS\(\), \{\[k\]:v\}\)\);/.test(html)
      && /if\(!ok\) raiseFault\('local',/.test(html),
     '降级到 localStorage 时也上报真实写入结果（此前恒报成功）');

  /* ── 数据安全与来源唯一性 ─────────────────────────────────────── */
  // 冻结时阻断评分：那时产生的新进度只存在内存，刷新即丢
  ok(/function applySm2Grade\(qid, rate, historyArr\)\{\s*\n\s*if\(blockedByWriteFault\('评分'\)\) return;/.test(html)
      && /function blockedByWriteFault\(what\)\{/.test(html)
      && /Store\.writeFault\(\)/.test(html),
     '写入受阻时拒绝评分（查看/翻页不受影响，横幅给出导出与刷新两条出路）');
  // 保留率日志必须同时进本地备份与云端：它是只增日志，丢了无法重建
  ok(/revlog:REVLOG,updatedAt/.test(html) && /function applyRevFromGist\(gist\)/.test(html)
      && (html.match(/applyRevFromGist\(gist\);/g) || []).length === 2,
     '保留率日志随 learn-data.json 上云（两条拉取路径都应用，与导入备份共用同一 merge）');
  // 主题 id 清单必须从 THEME_SPEC 派生，不能再手写第二份
  ok(/const STARDUST_THEMES = \[\], ALL_CANVAS_THEMES = \[\];/.test(html)
      && !/const STARDUST_THEMES = \['frappe'/.test(html)
      && !/const canvasThemes = \['aurora'/.test(html),
     '主题特效的 id 清单由 THEME_SPEC 的 canvas 声明派生（此前手写两份，与声明是三份信息）');
  ok(!/gradient: t\.gradient/.test(html) && !/canvas: t\.canvas/.test(html)
      && !/getThemeConfig\(name\)\|\|\{\};/.test(html),
     'THEME_CONFIG 只留被读取的字段（canvas / gradient 与 cfg 死变量已清）');
  // 二进制文档不再当纯文本读（乱码会原样进 AI 提示词）
  ok(/请直接粘贴文本，或先另存为 PDF \/ TXT/.test(html) && /const PDF_MAX_PAGES = 80;/.test(html),
     '简历上传只接受能可靠转文本的格式，PDF 提取有页数上限');
  // 统计数字原地滚动
  ok(/window\._sbLastNums/.test(html) && /data-num="seenPct"/.test(html),
     '顶栏统计数字原地滚动（与总览页共用 countUpNum，含 reduced-motion 降级）');
  // 弹簧缓动：只用于低频交互（弹窗/悬停/toast），高频的评分与翻页保持 ease-out
  ok(/--ease-pop:cubic-bezier\(\.34,1\.56,\.64,1\)/.test(html) && /--dur-pop:\.3s/.test(html),
     '弹簧缓动存在，且只作用于低频交互（评分/翻页这类高频操作不弹）');
   // 宽屏桌面端：排版规则必须按视图收口，且全部关在 ≥1024px 断点内（移动端零影响）
   // 浏览页与搜索结果改走同一条阅读版心（搜索页的双列栅格已撤 —— .empty 会落在第一列、显示在左上角）
   ok(/c\.dataset\.view = view;/.test(html)
      && /@media\(min-width:1024px\)\{/.test(html)
      && /\.content\[data-view="browse"\]>:is\(\.doc-head,\.q,\.empty\)/.test(html)
      && /\.content\[data-view="search"\]>:is\(\.doc-head,\.sr-item,\.empty\)\{max-width:var\(--rail-read\)/.test(html),
      '宽屏排版按视图收口（浏览页与搜索结果同走 --rail-read 阅读版心），作用域是 .content 的 data-view 标记');
   // 桌面弹窗宽度：设置与 qmodal 同档；移动端靠 width:96vw!important 压过，所以只加 min-width 断点
   ok(/\.modal\.qmodal\{width:min\(760px,92vw\)/.test(html) && /\.modal\.settings-modal\{width:min\(760px,92vw\)\}/.test(html),
      '设置弹窗与题目表单弹窗在桌面同档加宽到 760px（移动端 width:96vw!important 兜底）');
   // 主题浮层的宽屏定位：必须有函数、有调用，且函数内部对窄屏直接返回（不碰移动端）
   ok(/function placeThemePopup\(\)/.test(html) && /placeThemePopup\(\);/.test(html)
      && /if\(window\.innerWidth <= 768\) return;/.test(html),
      '主题浮层在宽屏按按钮实测位置对齐（且对 ≤768 直接返回，移动端交给原有 CSS）');
   // 主题去克隆：极光这层不许再是星尘的翻版（原来只差配色与数量），必须是自己的机制
   ok(/const AUR_ROT = 100\/180\*Math\.PI;/.test(html)
      && /blitRot\(ctx, sprites\[ti\], p\.x, p\.y, p\.size\*2\.6, a, AUR_ROT, 3\.4\);/.test(html)
      && /p\.x \+= p\.vx\*f;/.test(html)
      && /vx:0\.22\+Math\.random\(\)\*0\.42,/.test(html)
      && /const AUR_STOPS = AUR_RGB\.map/.test(html)
      && !/AUR_RGB\.map\(\(rgb, i\) => glowSprite/.test(html),
      '极光尘：横向定向流动 + 沿光带长轴拉长（不再是静止闪烁圆点），色标数组提到模块常量');
   // 拉长能力放在 blitRot 入口，避免调用方自绘而漏掉避让
   ok(/function blitRot\(ctx, spr, x, y, size, alpha, rot, elong\)\{/.test(html)
      && /if\(e > 1\) ctx\.drawImage\(spr, -size\*0\.5\*e, -size\*0\.5, size\*e, size\);/.test(html),
      'blitRot 支持沿旋转轴拉长（默认 1 不影响既有星芒调用），避让与 alpha 仍在这一个入口处理');
   // 平铺纹理只允许一套缓存机制
   ok(/texPattern\(ctx, 'paperTex', paperTexSprite\(\)\)/.test(html)
      && !/_paperPat/.test(html),
      'paper 的纸纹收拢到统一的 texPattern（原先与 _patCache 并存的第二套三元组已删）');
   // 版心只允许两档：四套版本号（1200/1040/880/820）会让切换标签时版心跳变
   ok(/--rail:1200px; --rail-read:820px;/.test(html)
      && /\.practice-wrap\{max-width:var\(--rail-read\)/.test(html)
      && /\.feature-wrap\{max-width:var\(--rail-read\)/.test(html)
      && /\.an-wrap\{max-width:var\(--rail\)/.test(html)
      && !/\.(practice-wrap|feature-wrap|an-wrap)\{max-width:\d/.test(html),
      '版心收敛为两档令牌（--rail 栅格 / --rail-read 单列阅读），不再有第三个数字');
   // 空搜索结果必须居中：搜索页曾是双列栅格、.empty 落在第一列 → 提示跑到左上角
   ok(!/data-view="search"\]\{display:grid/.test(html)
      && /\.content\[data-view="search"\]>:is\(\.doc-head,\.sr-item,\.empty\)/.test(html),
      '搜索结果页不再用双列栅格，结果条与空态同走一条阅读版心（空态因此居中）');
   // 主题分派必须按 canvas key（_uTheme 存的是 id）—— 只数 case 个数是抓不住这个错的：
   // 早期 12 套 id 与 key 同名，用 id 分派也能全绿，直到经典组 dracula→ember 才静默落兜底星尘。
   const specKeys = new Set([...html.matchAll(/canvas:\s*'([a-z]+)'/g)].map(m=>m[1]).filter(k=>k!=='stardust'&&k!=='none'));
   const caseKeys = new Set([...html.matchAll(/case '([a-z]+)': draw/g)].map(m=>m[1]));
   const missingCase = [...specKeys].filter(k=>!caseKeys.has(k));
   ok(/function canvasKeyOf\(id\)\{/.test(html)
      && /switch\(canvasKeyOf\(_uTheme\)\)\{/.test(html)
      && !/switch\(_uTheme\)\{/.test(html)
      && specKeys.size === 16 && missingCase.length === 0,
      '主题分派按 canvas key 分派（canvasKeyOf 桥接 id→key），16 个 canvas 声明与 case 一一对应'
      + (missingCase.length ? ' —— 缺 case：' + missingCase.join(',') : ''));
   // 写入受阻的守卫必须统一：原先只有记忆评分设防，星级/八股自评静默接受（进度只在内存里，刷新即丢）
   ok(/function blockedByWriteFault\(what\)\{/.test(html)
      && (html.match(/blockedByWriteFault\(/g) || []).length >= 5
      && !/if\(typeof Store !== 'undefined' && Store\.writeFault && Store\.writeFault\(\)\)\{/.test(html),
      '写入受阻守卫统一走 blockedByWriteFault（记忆评分 / 星级标记 / 八股自评口径一致），不再各处自己写一份');
   // 焦点归位只在「焦点原本在内容区、且被重渲染卸载」时补：否则每次刷新都会让 .content 拿到焦点，
   // 被全局含 [tabindex] 的焦点环规则描出整屏发光边框（真实踩过 —— 用户实测反馈）
   ok(/const _focusEl = document\.activeElement;/.test(html)
      && /_focusEl\.closest\('#content'\)/.test(html)
      && /if\(_hadFocusInContent && document\.activeElement === document\.body\) c\.focus\(\{preventScroll:true\}\);/.test(html)
      && !/if\(document\.activeElement === document\.body\) c\.focus\(\{preventScroll:true\}\);/.test(html),
      '焦点归位只在「焦点原本在内容区且被卸载」时补；刷新/首次渲染不补（避免 .content 被焦点环描出整屏边框）');
   // 平滑滚动都要过减动效偏好（另三处滚动在 prefersReduce 时已提前 return，不属于本断言范围）
   // 两处"外层已提前 return"的滚动在 prefersReduce 时根本不会执行（见各自的 reduce 判断），
   // 其余三处必须自己改行为值 —— 断言同时守住这两类写法，避免任何一处退化成无条件平滑
   ok((html.match(/prefersReduce\(\) \? 'auto' : 'smooth'/g) || []).length === 3
      && !/scrollIntoView\(\{behavior:'smooth'/.test(html)
      && (html.match(/if\(reduce \|\| !card/g) || []).length === 2,
      '平滑滚动都过减动效偏好（三处改行为值；刷题/趁热两处在 prefersReduce 时提前 return 不执行）');
   // 卡片按下时的底色跃迁只给无 hover 的设备：桌面端 hover 已有描边+抬升，再叠整块底色是重复信息
   ok(/\.q:active,\.memory-card:active\{transform:scale\(\.996\);transition-duration:\.08s\}/.test(html)
      && /@media \(hover:none\)\{ \.q:active,\.memory-card:active\{background:var\(--panel2\)\} \}/.test(html),
      '卡片按下底色只在 @media(hover:none) 生效（桌面端保留下沉手感，不再整块亮起）');
   // 主题集：每套内置主题必须有**自己**的绘制分支；且删掉的 id 必须在 THEME_ALIAS 里登记
   // 经典组里任何一套都不许再声明 canvas:'stardust'（注释里提到它不算数，这里只看同一行上同时有 group:'classic' 的声明）
   ok(!/group:'classic'[^\n]*canvas:'stardust'/.test(html)
      && (html.match(/case '(ember|scan|film|firefly)': draw/g) || []).length === 4
      && /function drawDraculaEmber\(/.test(html)
      && /function drawNordScan\(/.test(html)
      && /function drawGruvboxFilm\(/.test(html)
      && /function drawEverforestFirefly\(/.test(html)
      && /else if\(theme==='dracula'\)\{/.test(html)
      && /else if\(theme==='everforest'\)\{/.test(html),
      '每套内置主题各有独立特效（不再多主题共用一条绘制分支），且都有对应粒子播种分支');
   ok(/frappe:'midnight', macchiato:'midnight',/.test(html)
      && /rosepine:'dracula', rosepineMoon:'dracula', rosepineDawn:'paper',/.test(html)
      && /onedark:'nord', github:'aurora',/.test(html)
      && ["frappe","macchiato","rosepine","rosepineMoon","rosepineDawn","onedark","github"]
           .every(id => !new RegExp('\\n  ' + id + ': \\{').test(html)),
      '删掉的 7 个主题已从 THEME_SPEC 移除，且全部登记进 THEME_ALIAS（否则老存档会误入「跟随系统」）');
   ok(/let _zrRings = null;/.test(html) && /ctx\.arc\(r\.x, cy, rad, 0, Math\.PI\*2\)/.test(html)
      && !/Math\.sin\(\(x\+drift\)\*k\)/.test(html),
      '子荣不再是「横向正弦波浪」（与子良同模板），改为砚墨晕开的同心环');
   // 首启一次性迁移：同一字段不得调用 stripMarkdown 两遍（那是唯一一处同步阻塞的规模性开销）
   ok(/const stripTxt = s => \{ const t = stripMarkdown\(s\); return t === s \? s : \(cleaned\+\+, t\); \};/.test(html)
      && !/stripMarkdown\(d\.title\) !== d\.title/.test(html)
      && !/stripMarkdown\(q\.answer\) !== q\.answer/.test(html),
      '迁移里每个字段只跑一次 stripMarkdown（原来比较一次、赋值再来一次）');
   // 降级提示走常驻横幅（且不与「写入失败」混用 —— 混了会让降级期间无法评分）
   ok(/function raiseNotice\(msg\)\{/.test(html)
      && /notice: \(\) => _notice,/.test(html)
      && /raiseNotice\('本地数据库无响应/.test(html)
      && !/toast\('本地数据库无响应/.test(html)
      && /if\(typeof Store\.onNotice === 'function'\) Store\.onNotice/.test(html),
      '数据库降级改为常驻横幅（与写入失败独立成通道），不再是一条 3 秒就消失的 toast');
   // 总览空题库引导 + 宽屏网格改为自动排布（否则引导块与薪资卡撞格）
   ok(/const emptyLead = \(tq === 0\)/.test(html)
      && /id=\"ovImport\"/.test(html)
      && /ovImportBtn\.onclick = \(\) => openImportPicker\(\)/.test(html)
      && !/overview\]>\.salary-card\{grid-column:1;grid-row:1/.test(html)
      && /\.content\[data-view=\"overview\"\]> :not\(\.salary-card\):not\(\.ov-grid\):not\(\.ov-trend\)\{grid-column:1\/-1\}/.test(html),
      '总览页空题库引导：文案块与导入按钮块都跨满整行（此前只覆盖 .empty，按钮块独自落进第 1 列）');
   // 收尾批：--faint 不再当正文色、题号徽标可容纳三位数、退出前 flush、回前台补算 --kb
   ok(!/color:var\(--faint\)/.test(html)
      && /const mutedColor = style\.getPropertyValue\('--muted'\)/.test(html)
      && !/faintColor/.test(html)
      && /\.q \.qnum\{flex:none;min-width:26px;height:26px;padding:0 5px;/.test(html)
      && /flushProgressWrite\(\); saveGrillDraft\(true\);/.test(html)
      && /try\{ syncKeyboardInset\(\); \}catch\(_\)\{\}/.test(html),
      '--faint 不再作正文色（图表日期轴随既定政策改 --muted）；题号徽标 min-width；退出前 flush；回前台补算 --kb');
   // 战报与 SW：危险键、206 缓存（sw.js 本文件里没读过，就地读一次）
   const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
   ok(/if\(day==='__proto__'\|\|day==='constructor'\|\|day==='prototype'\) return;/.test(html)
      && /dev!=='__proto__' && dev!=='constructor' && dev!=='prototype'/.test(html)
      && !/if \(resp\.ok\)/.test(swSrc)
      && (swSrc.match(/resp\.status === 200/g) || []).length === 3,
      'warLogMerge 显式挡危险键（day/dev 都来自远端）；SW 三处缓存判定精确到 200');
   // 多标签页：localStorage 无事务，两份内存副本整份覆盖 → 必须监听 storage 事件合并只增日志
   ok(/window\.addEventListener\('storage', e => \{/.test(html)
      && /if\(e\.key === REVLOG_KEY\) mergeRevLogFromBackup\(JSON\.parse\(e\.newValue\)\);/.test(html)
      && /else if\(e\.key === WARLOG_KEY\) warLogMerge\(JSON\.parse\(e\.newValue\)\);/.test(html),
      '跨标签页合并：REVLOG/WARLOG 走 storage 事件并回对端条目（热榜刻意不并，见注释）');
   // 对比度：装饰色派生出「作文字」的一版，九处文字用它；主题调色板一个值都没动
   ok(/function inkOn\(color, bg\)\{/.test(html)
      && /const a3i = inkOn\(t\.accent3, t\.card \|\| t\.bg\);/.test(html)
      && (html.match(/color:var\(--accent3-ink, var\(--accent3\)\)/g) || []).length === 9
      && /color:'\+_accInk\+';/.test(html),
      'accent3 派生 --accent3-ink 供小字使用（九处），确认框确定按钮按 accent 明度取前景');
   // 触屏：颜色类 hover 关进 @media (hover:hover)，不再靠 hover:none 里逐条抄复位值
   ok(/@media \(hover:hover\)\{ \.tab:hover\{/.test(html)
      && /@media \(hover:hover\)\{ \.grade-btn\.g-easy:hover\{/.test(html)
      && !/\n  \.btn:hover\{border-color:var\(--accent2\)\}/.test(html),
      '颜色类 hover 统一关进 @media (hover:hover)（触屏上不再粘住高亮）');
   // 文案 / 语义 / 注入语义三处收尾
   ok(/mock:'八股练习'/.test(html) && /grill:'面试拷打'/.test(html)
      && /' title="保留率：'/.test(html)
      && /\r?\n            \.\.\.q,/.test(html) && !/return Object\.assign\(\{\}, q, \{/.test(html)
      && /tab\.setAttribute\('aria-pressed', tab\.classList\.contains\('active'\)/.test(html)
      && !/aria-selected', 'true'/.test(html),
      '功能名统一（八股练习/面试拷打/保留率）；normalizeDocs 改展开语法；分组 tab 用 aria-pressed');
   // 导入不得逐键覆盖：进度按时间取较新、通关数取较大（旧备份不该抹掉本机新排的 FSRS 状态）
   ok(/function mergeProgressByRecency\(localMap, incoming\)\{/.test(html)
      && /PROGRESS = mergeProgressByRecency\(PROGRESS, sanitizeProgressMap\(v\)\)/.test(html)
      && /if\(nv > cur\) CLEARS\[id\] = nv;/.test(html)
      && !/PROGRESS = Object\.assign\(\{\}, PROGRESS, sanitizeProgressMap\(v\)\)/.test(html),
      '导入按时间/大小合并，不再逐键覆盖（旧备份会静默抹掉本机更新的进度与通关数）');
   // 导入落盘必须等完并处理失败；importJsonDocs 改了签名，两个调用点都得 await
   ok(/async function importJsonDocs\(text, opts\)\{/.test(html)
      && /else await importJsonDocs\(text\);/.test(html)
      && /await importJsonDocs\(JSON\.stringify\(\{ documents: ls\.docs/.test(html)
      && /await Promise\.all\(\[saveDocs\(\), Store\.saveProgress\(PROGRESS\), Store\.saveOrder\(ORDER\), Store\.saveClears\(CLEARS\)\]\);/.test(html)
      && /if\(Store\.writeFault && Store\.writeFault\(\)\) Store\.freeze\(\);/.test(html),
      '导入落盘等完并检查失败（半更新保护），两个调用点都 await');
   // 返回键不得直接丢掉正在编辑的内容（这两个弹窗刻意不支持点遮罩关闭）
   ok(/if\(top\.id === 'addModal' \|\| top\.id === 'editModal'\)\{/.test(html)
      && /confirmDialog\('关闭后会丢失正在编辑的内容，确定关闭吗？'\)/.test(html),
      'Android 返回键对「添加/编辑题目」先确认，不再直接关掉丢草稿');
   // 导出提示必须等真实结果：四个导出点都走 exportWithToast，downloadBlob 不再被直接调用
   ok(/async function exportWithToast\(blob, filename, okMsg\)\{/.test(html)
      && (html.match(/downloadBlob\(/g) || []).length === 2
      && (html.match(/exportWithToast\(blob, `/g) || []).length === 4,   // 只数调用点：定义签名传的是 filename
      '导出改为「成功才提示」：四个导出点统一走 exportWithToast（此前不等结果就 toast 已导出）');
   // 无障碍 / CSP / dvh：三条与用户规模无关的廉价修复
   ok(/id="ovDueCard"\$\{todo>0\?` role="button" tabindex="0"/.test(html)
      && /connect-src 'self' https: http:\/\/localhost:\* http:\/\/127\.0\.0\.1:\*;/.test(html)
      && /@supports \(height:100dvh\)\{/.test(html)
      && !/connect-src 'self' https: http:;/.test(html),
      '总览待复习卡可键盘激活；CSP 去掉裸 http:（保留 localhost 调试）；dvh 兜底改绑 @supports');
   // 写入失败状态必须可恢复：只置位不清零会让一次瞬时失败永久锁死评分（见 clearFault）
   ok(/function clearFault\(\)\{/.test(html)
      && /if\(!_fault \|\| _frozen\) return;/.test(html)
      && /tx\.oncomplete = \(\) => \{ clearFault\(\); res\(true\); \};/.test(html)
      && /else clearFault\(\);/.test(html)
      && /if\(!msg\)\{ el\.hidden = true; return; \}/.test(html),
      '写入失败状态可恢复：瞬时失败随下一次成功写入清除，freeze 仍为持久态（横幅随之收起）');
   // 桌面键盘：两条"根元素不可滚动"的补偿通道
   ok(/const overlayOn = !!document\.querySelector\(/.test(html)
      && /\(e\.key==='k'\|\|e\.key==='K'\) && \(e\.ctrlKey\|\|e\.metaKey\)/.test(html)
      && /searchEl && !overlayOn && e\.key==='\/'/.test(html)
      && /e\.key==='PageDown'\|\|e\.key==='PageUp'/.test(html)
      && /if\(sc && !inner\)\{/.test(html),
      '桌面键盘：Ctrl/⌘+K 与 / 聚焦搜索（两条都先过浮层守卫，焦点不会落到遮罩背后）；PageUp/PageDown/Home/End 显式滚动 .content（焦点在可滚子容器内时让位）');
   // 顶栏：让 .tabs 真的能横向滚动（min-width:0），折行即消失；总览页宽屏改两列
   ok(/\.topbar \.tabs\{min-width:0\}/.test(html)
      && /\.topbar \.search input\{width:140px\}/.test(html)
      && /\.content\[data-view="overview"\]\{display:grid/.test(html)
      && /class="ov-trend"/.test(html)
      && !/\.content\[data-view="overview"\]>div:last-child/.test(html),
      '顶栏靠 min-width:0 恒定单行（那段 overflow-x:auto 这才真的生效）；总览页宽屏两列且趋势卡有具名类');
   // 备份导入的版本判断：旧格式 / 更新版本都要给结论，降级残留恢复则走 quiet 不给误导提示
   ok(/function importJsonDocs\(text, opts\)/.test(html)
      && /const srcVer = Number\.isInteger\(data\.version\)/.test(html)
      && /missing\.push\(PERSIST_LABEL\[key\] \|\| key\)/.test(html)
      && /order: ls\.order \|\| \[\] \}\), \{ quiet: true \}\)/.test(html),
      '备份导入说明版本差异（旧格式缺项 / 备份比本机新），降级残留恢复不当成备份文件');
}

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
