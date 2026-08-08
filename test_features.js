// jsdom 集成测试：弱项复习 + 模拟面试 + MD 导出
// 验证：0 运行时错误；弱项聚合、自评写入进度；模拟面试计时/自评/交卷/导出 MD 内容正确。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('C:/Users/ctqin/.workbuddy/binaries/node/workspace/node_modules/jsdom');

const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const errors = [];
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra !== undefined ? '-> ' + JSON.stringify(extra) : ''); }
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.__lastBlob = null;
    if (!window.URL) window.URL = {};
    window.URL.createObjectURL = (blob) => { window.__lastBlob = blob; return 'blob:fake'; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () {}; // 阻止导航
    if (!window.CSS) window.CSS = {};
    window.CSS.escape = window.CSS.escape || ((s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'));
    window.confirm = () => true;
    window.alert = (m) => { errors.push('alert:' + m); };
    window.onerror = (m) => { errors.push('onerror:' + m); };
  }
});

const win = dom.window;
const doc = win.document;
win.addEventListener('error', (e) => errors.push('event-error:' + (e.error ? e.error.message : e.message)));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(200); // 等 init() 完成

  console.log('\n[0] 启动与无错误检查');
  check('无运行时错误', errors.length === 0, errors);
  check('初始为总览视图', win.eval("view") === 'overview');
  check('题目已导入(>200)', win.eval("totalQuestions()") > 200, win.eval("totalQuestions()"));

  console.log('\n[1] 弱项复习：聚合 + 自评写入进度 + ✅移出弱项');
  doc.querySelector('.tab[data-view="weak"]').click();
  await sleep(50);
  check('弱项复习视图已激活', win.eval("view") === 'weak');
  const weakLen = win.eval("weak.queue.length");
  check('弱项聚合非空', weakLen > 0, weakLen);
  const firstQid = win.eval("weak.queue[0]");
  const goodBtn = doc.querySelector('.grade-btn[data-rate="good"]');
  check('存在自评按钮', !!goodBtn);
  if (goodBtn) goodBtn.click();
  await sleep(30);
  const prog = win.eval("PROGRESS['" + firstQid + "']");
  check('自评写入 selfRate=good', prog && prog.selfRate === 'good', prog);
  check('自评写入 lastPracticed', prog && typeof prog.lastPracticed === 'number', prog);
  check('✅熟练后移出本次队列', win.eval("weak.queue.length") === weakLen - 1, win.eval("weak.queue.length"));
  check('✅熟练后队列不含该题', win.eval("weak.queue.indexOf('" + firstQid + "')") === -1);
  // 重新聚合：自评 good 的题不再出现
  win.eval("startWeakReview()");
  await sleep(30);
  check('重算弱项仍排除已评good的题', win.eval("weak.queue.indexOf('" + firstQid + "')") === -1);

  console.log('\n[2] 模拟面试：配置 -> 抽题 -> 计时 -> 自评 -> 交卷');
  doc.querySelector('.tab[data-view="mock"]').click();
  await sleep(50);
  check('进入模拟面试配置页', !!doc.querySelector('#mockStart'));
  doc.querySelector('#mockCount').value = '3';
  doc.querySelector('#mockSecs').value = '600';
  doc.querySelector('#mockScope').value = 'all';
  doc.querySelector('#mockStart').click();
  await sleep(50);
  const mockLen = win.eval("mock.queue.length");
  check('按数量抽取(=3)', mockLen === 3, mockLen);
  check('已渲染第一题', !!doc.querySelector('#mockReveal'));

  // 逐题：显示答案 -> 自评 -> 下一题
  for (let i = 0; i < 3; i++) {
    const qid = win.eval("mock.queue[mock.index]");
    doc.querySelector('#mockReveal').click();           // 显示答案
    await sleep(20);
    check(`第${i+1}题 已揭示并可自评`, win.eval("mock.revealed") === true);
    const rateBtn = doc.querySelector('.grade-btn[data-rate="good"]');
    rateBtn.click();                                    // 自评熟练
    await sleep(20);
    const a = win.eval("mock.answers['" + qid + "']");
    check(`第${i+1}题 自评已记录`, a && a.selfRate === 'good', a);
    doc.querySelector('#mockNext').click();              // 下一题 / 交卷
    await sleep(20);
  }
  check('交卷后进入复盘', win.eval("mock.done") === true);
  check('复盘页有导出按钮', !!doc.querySelector('#mockExport'));

  console.log('\n[3] 导出复盘 MD（交给 AI 阅卷）');
  win.__lastBlob = null;
  doc.querySelector('#mockExport').click();
  await sleep(30);
  check('生成了 Blob', !!win.__lastBlob);
  const md = win.__lastBlob ? await win.__lastBlob.text() : '';
  check('MD 含“模拟面试复盘”标题', md.includes('# 模拟面试复盘'));
  check('MD 含“我的回答”', md.includes('**我的回答：**'));
  check('MD 含“参考答案”', md.includes('**参考答案：**'));
  check('MD 含“自评”', md.includes('**自评：**'));
  check('MD 含“阅卷要求”', md.includes('阅卷要求'));
  const countQ = (md.match(/## 第 \d+ 题/g) || []).length;
  check('MD 含 3 道题', countQ === 3, countQ);
  check('MD 模拟面试自评写入进度', win.eval("Object.values(PROGRESS).filter(p=>p.selfRate).length") > 0);

  console.log('\n[4] 计时自动揭示');
  doc.querySelector('#mockRedo').click();
  await sleep(30);
  doc.querySelector('#mockCount').value = '1';
  doc.querySelector('#mockSecs').value = '10';   // 受应用下限约束（最小 10 秒）
  doc.querySelector('#mockScope').value = 'all';
  doc.querySelector('#mockStart').click();
  await sleep(30);
  check('未揭示', win.eval("mock.revealed") === false);
  // 强制计时归零，验证自动揭示分支（避免真的等 10 秒）
  win.eval("mock.timeLeft = 0;");
  await sleep(1300); // 等下一次 tick 触发 timeLeft<=0
  check('计时到自动揭示', win.eval("mock.revealed") === true, win.eval("mock.revealed"));
  check('计时到点无错误', errors.length === 0, errors);

  console.log('\n[5] 模拟面试：按难度梯度出题（由易到难）');
  win.eval("mock.queue=[]; mock.done=false;");   // 清空上一场，回到配置页
  doc.querySelector('.tab[data-view="mock"]').click();
  await sleep(30);
  doc.querySelector('#mockCount').value = '30';
  doc.querySelector('#mockSecs').value = '600';
  doc.querySelector('#mockScope').value = 'all';
  doc.querySelector('#mockOrder').value = 'difficulty';
  doc.querySelector('#mockStart').click();
  await sleep(30);
  const qlist = win.eval("mock.queue");
  const ranks = qlist.map(id => win.eval("difficultyRank('" + id + "')"));
  let sorted = true;
  for (let i = 1; i < ranks.length; i++) if (ranks[i] < ranks[i - 1]) sorted = false;
  check('难度梯度排序（由易到难）', sorted, ranks.slice(0, 6));
  check('scopeName 含难度标记', win.eval("mock.scopeName").includes('难度'));

  console.log('\n[6] Markdown 直接导入（无需 raw/ 与脚本）');
  // 准备测试用的 .md 文本（两种常见结构）
  const mdA = '# 题目一\n这是答案一\n# 题目二\n这是答案二\n';
  const mdB = '# 我的笔记\n## 问题A\n回答A\n## 问题B\n回答B\n';
  const beforeDocs = win.eval("DOCS.length");
  // 通过 FileReader 路径注入：直接调用内部导入函数（模拟选文件）
  win.eval("importMarkdownDoc(" + JSON.stringify(mdA) + ", '导入测试A.md')");
  await sleep(20);
  const docA = win.eval("DOCS.find(d=>d.title==='导入测试A')");
  check('mdA 生成文档', !!docA, docA);
  check('mdA 解析出 2 题', docA && docA.questions.length === 2, docA && docA.questions.length);
  check('mdA 文档标题取自文件名', docA && docA.title === '导入测试A');
  win.eval("importMarkdownDoc(" + JSON.stringify(mdB) + ", '导入测试B.md')");
  await sleep(20);
  const docB = win.eval("DOCS.find(d=>d.title==='我的笔记')");
  check('mdB 用首个H1作文档标题', !!docB && docB.title === '我的笔记', docB && docB.title);
  check('mdB 解析出 2 题（## 为题目）', docB && docB.questions.length === 2, docB && docB.questions.length);
  check('mdB 题目为 问题A/问题B', docB && docB.questions[0].title==='问题A' && docB.questions[1].title==='问题B',
        docB && docB.questions.map(q=>q.title));
  check('总文档数增加 2', win.eval("DOCS.length") === beforeDocs + 2, win.eval("DOCS.length"));
  // 重复导入应合并去重（不再新增）
  win.eval("importMarkdownDoc(" + JSON.stringify(mdA) + ", '导入测试A.md')");
  await sleep(20);
  check('重复导入不重复建文档', win.eval("DOCS.length") === beforeDocs + 2, win.eval("DOCS.length"));

  console.log('\n[7] 刷题闯关：未揭示答案也能跳下一题（人性化）');
  win.eval("startPractice('all')");
  await sleep(30);
  check('进入刷题模式', win.eval("view") === 'practice');
  const nextBtn = doc.querySelector('#nextBtn');
  check('下一题按钮存在', !!nextBtn);
  check('未揭示时下一题按钮不禁用', nextBtn && !nextBtn.disabled, nextBtn && nextBtn.disabled);
  // 不揭示答案直接点下一题，应该成功跳转
  const idxBefore = win.eval("practice.index");
  doc.querySelector('#nextBtn').click();
  await sleep(20);
  check('未揭示也可成功进入下一题', win.eval("practice.index") === idxBefore+1, win.eval("practice.index"));

  console.log('\n[8] 删除文档 + 导出空白应用（交给别人用自己的笔记）');
  win.eval("importMarkdownDoc('# 删除测试A\\n答a\\n# 删除测试B\\n答b\\n','删除测试.md')");
  await sleep(20);
  const delId = win.eval("DOCS.find(d=>d.title==='删除测试').id");
  check('导入了待删文档', !!delId, delId);
  const beforeDel = win.eval("DOCS.length");
  win.eval("deleteDocument("+JSON.stringify(delId)+")");
  await sleep(20);
  check('删除后文档数 -1', win.eval("DOCS.length")===beforeDel-1, win.eval("DOCS.length"));
  check('删除后该文档已不存在', win.eval("DOCS.findIndex(d=>d.id==='"+delId+"')")===-1);
  win.__lastBlob = null;
  win.eval("exportBlankApp()");
  await sleep(40);
  check('导出空白应用生成 Blob', !!win.__lastBlob);
  const blankHtml = win.__lastBlob ? await win.__lastBlob.text() : '';
  check('空白文件标记 blank:true', /"blank"\s*:\s*true/.test(blankHtml));
  check('空白文件 documents 为空', /"documents"\s*:\s*\[\]/.test(blankHtml));
  const domB = new JSDOM(blankHtml, { runScripts:'dangerously', url:'http://localhost/', pretendToBeVisual:true });
  await new Promise(r=>setTimeout(r,300));
  check('空白文件加载后 DOCS 为空（不会回填内置 226 题）', domB.window.eval("DOCS.length")===0, domB.window.eval("DOCS.length"));

  console.log('\n[9] AI 功能：按钮存在 + API 配置存取');
  // AI 配置存取
  win.eval("saveApiConfig({url:'https://test.api.com/v1',key:'sk-test',model:'test-model'})");
  await sleep(20);
  check('AI 配置已保存', win.eval("!!aiConfig && aiConfig.model==='test-model'"), win.eval("aiConfig && aiConfig.model"));
  win.eval("loadApiConfig()");
  await sleep(10);
  check('AI 配置可重新加载', win.eval("!!aiConfig && aiConfig.model==='test-model'"), win.eval("aiConfig && aiConfig.model"));
  // AI 按钮存在
  win.eval("startPractice('all')");
  await sleep(30);
  check('刷题视图有 AI 查询按钮', !!doc.querySelector('#aiAskBtn'));
  win.eval("startWeakReview()");
  await sleep(30);
  check('弱项复习有 AI 查询按钮', !!doc.querySelector('#weakAIBtn'));
  // 模拟面试 AI 按钮
  win.eval("mock.queue=[]; mock.done=false; aiAnswer={};");
  doc.querySelector('.tab[data-view="mock"]').click();
  await sleep(30);
  doc.querySelector('#mockCount').value = '1';
  doc.querySelector('#mockSecs').value = '600';
  doc.querySelector('#mockScope').value = 'all';
  doc.querySelector('#mockStart').click();
  await sleep(20);
  check('模拟面试有 AI 查询按钮', !!doc.querySelector('#mockAIBtn'));
  // 交卷后检查 AI 阅卷按钮
  doc.querySelector('#mockReveal').click();
  await sleep(10);
  doc.querySelector('.grade-btn[data-rate="good"]').click();
  await sleep(10);
  doc.querySelector('#mockNext').click();
  await sleep(20);
  check('复盘页有 AI 阅卷按钮', !!doc.querySelector('#mockAIGrade'));
  // API 调用不配置时 toast 提示
  win.eval("aiConfig = null; aiGradingLoading = false;");
  doc.querySelector('#mockAIGrade').click();
  await sleep(20);
  // askAI 无配置时 toast
  win.eval("view='practice'; startPractice('all');");
  await sleep(20);
  doc.querySelector('#aiAskBtn').click();
  await sleep(20);

  console.log(`\n==== 结果：通过 ${pass} / 失败 ${fail} / 错误 ${errors.length} ====`);
  process.exit(fail || errors.length ? 1 : 0);
})().catch(e => { console.error('测试崩溃:', e); process.exit(2); });
