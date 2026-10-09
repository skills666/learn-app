#!/usr/bin/env node
/**
 * 渲染冒烟：在最小 DOM stub 上**真正执行** index.html 的主脚本，然后把每个页面都渲染一遍。
 *
 * 为什么需要这一层：check（语法 + 静态引用）与 smoke-test（函数级行为）全绿，并不能保证"页面能打开"。
 * 真实事故：缓存变量 `_hmCountsCache` 的声明行在编辑中丢失 ——
 *   非严格模式下 `invalidateMemQueue` 里的**赋值**静默创建了隐式全局（不报错），
 *   而 `hmDayCounts` 里的**读取**直接抛 ReferenceError → 进度页必崩、其它页面看起来完全正常。
 *   语法检查抓不到（语法合法）、静态引用检查抓不到（函数都存在），只有"真跑一次"才能兜住。
 *
 * 覆盖：主脚本整体执行（含顶层立即执行代码、init 异步流程）+ 全部视图渲染 + 弹窗/交互函数调用。
 * 用法：npm test（或 node scripts/render-smoke.js）
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { findMainScript } = require('./lib/html-scripts');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---------- 最小 DOM stub ---------- */
let elSeq = 0;
function stubCtx() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  return new Proxy({
    canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '', font: '',
    textAlign: '', textBaseline: '', globalAlpha: 1, globalCompositeOperation: '',
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => ({}),
    measureText: () => ({ width: 0 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform: noop, save: noop, restore: noop,
  }, {
    get(t, k) { return k in t ? t[k] : noop; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function stubEl(tag) {
  const cls = new Set();
  const el = {
    __id: ++elSeq,
    tagName: String(tag || 'div').toUpperCase(),
    innerHTML: '', outerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    hidden: false, href: '', download: '', src: '', type: '', accept: '', multiple: false,
    placeholder: '', name: '', id: '', title: '', rows: 1, min: 0, max: 0, selected: false,
    files: [], className: '', contentEditable: false, spellcheck: false, isComposing: false,
    scrollTop: 0, scrollLeft: 0, scrollHeight: 0, clientWidth: 0, clientHeight: 0,
    offsetWidth: 0, offsetHeight: 0, offsetParent: null, offsetTop: 0, offsetLeft: 0,
    width: 0, height: 0, naturalWidth: 0, naturalHeight: 0, complete: true,
    _cls: cls,
    dataset: {},
    style: new Proxy({ cssText: '', setProperty() {}, removeProperty() {}, getPropertyValue: () => '' }, {
      get(t, k) { return k in t ? t[k] : ''; },
      set(t, k, v) { t[k] = v; return true; },
    }),
    classList: {
      add: (...c) => c.forEach(x => cls.add(x)),
      remove: (...c) => c.forEach(x => cls.delete(x)),
      toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : !!f; if (on) cls.add(c); else cls.delete(c); return on; },
      contains: c => cls.has(c),
      get length() { return cls.size; },
    },
    getContext: () => stubCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }),
    animate: () => ({ onfinish: null, oncancel: null, finished: Promise.resolve(), cancel() {}, play() {}, pause() {} }),
    querySelector: () => stubEl('div'),
    querySelectorAll: () => [],
    closest: () => null,
    matches: () => false,
    contains: () => false,
    getAttribute: () => null,
    setAttribute() {}, removeAttribute() {}, hasAttribute: () => false,
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    appendChild(c) { return c; }, insertBefore(c) { return c; }, append() {}, prepend() {},
    removeChild() {}, replaceChild() {}, remove() {}, insertAdjacentHTML() {}, insertAdjacentElement() { return null; },
    replaceChildren() {}, cloneNode() { return stubEl(tag); }, focus() {}, blur() {}, click() {},
    scrollIntoView() {}, scrollTo() {}, scrollBy() {},
    toBlob(cb) { if (cb) cb({ size: 1024, type: 'image/jpeg' }); },
    toDataURL: () => 'data:image/png;base64,', play: () => Promise.resolve(), pause() {}, load() {},
    setSelectionRange() {}, select() {}, setCustomValidity() {}, reportValidity: () => true,
    get firstChild() { return null; }, get lastChild() { return null; },
    get nextSibling() { return null; }, get previousSibling() { return null; },
    get parentElement() { return null; }, get parentNode() { return null; },
    get children() { return []; }, get childNodes() { return []; },
    isConnected: true, ownerDocument: null,
  };
  return el;
}
function stubStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: i => Array.from(m.keys())[i] || null,
    get length() { return m.size; },
  };
}
const queryCache = new Map();
function q(sel) {
  const key = String(sel);
  if (!queryCache.has(key)) queryCache.set(key, stubEl(key.replace(/^[#.]/, '')));
  return queryCache.get(key);
}
const documentStub = {
  querySelector: q,
  querySelectorAll: () => [],
  getElementById: id => q('#' + id),
  createElement: tag => stubEl(tag),
  createElementNS: (ns, tag) => stubEl(tag),
  createTextNode: () => stubEl('#text'),
  createDocumentFragment: () => stubEl('#fragment'),
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  body: stubEl('body'), head: stubEl('head'), documentElement: stubEl('html'),
  hidden: false, visibilityState: 'visible', title: '', readyState: 'complete',
  activeElement: null, cookie: '', referrer: '',
  contains: () => false, execCommand: () => true, hasFocus: () => true,
  getElementsByTagName: () => [], getElementsByClassName: () => [],
};
documentStub.body.ownerDocument = documentStub;

const win = {
  document: documentStub,
  innerWidth: 800, innerHeight: 600, outerWidth: 800, outerHeight: 600,
  devicePixelRatio: 1, scrollX: 0, scrollY: 0, pageXOffset: 0, pageYOffset: 0,
  location: { href: 'http://localhost/', protocol: 'http:', host: 'localhost', origin: 'http://localhost', search: '', hash: '', pathname: '/' },
  navigator: { onLine: true, userAgent: 'node-render-smoke', clipboard: null, serviceWorker: null, storage: null },
  localStorage: stubStorage(), sessionStorage: stubStorage(),
  addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
  matchMedia: () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  // rAF 不执行：动画链（粒子引擎、撒花）依赖真实帧循环，同步触发会把 stub 拉进绘图细节，与本次目标无关
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  // setTimeout 同步执行：让 toast 收尾、入场动画收尾、whenScreenClear 轮询等链路都被真实走一遍
  setTimeout: (fn) => { try { if (typeof fn === 'function') fn(); } catch (e) { throw e; } return 0; },
  clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  performance: { now: () => Date.now(), timeOrigin: 0 },
  console: { log() {}, warn() {}, error() {}, info() {}, debug() {}, table() {}, trace() {} },
  CSS: { escape: s => String(s).replace(/[^\w-]/g, '\\$&') },
  fetch: () => Promise.reject(new Error('render-smoke: 无网络')),
  confirm: () => true, alert() {}, prompt: () => null,
  Image: function () { return stubEl('img'); },
  FileReader: function () {
    return { readAsText() {}, readAsArrayBuffer() {}, abort() {}, addEventListener() {}, onload: null, onerror: null, result: null, error: null };
  },
  MutationObserver: function () { return { observe() {}, disconnect() {}, takeRecords: () => [] }; },
  AbortController: globalThis.AbortController,
  TextEncoder: globalThis.TextEncoder, TextDecoder: globalThis.TextDecoder,
  Blob: globalThis.Blob, URL: globalThis.URL, Promise: globalThis.Promise,
  indexedDB: undefined, caches: undefined,   // 逼出 localStorage 降级路径（顺带覆盖降级分支）
  __errors: [],
};
win.window = win;
win.self = win;
win.globalThis = win;
win.top = win;
win.console.error = (...a) => { win.__errors.push(a.map(String).join(' ')); };

const ctx = vm.createContext(win);

/* ---------- 执行主脚本 + 注入测试桥 ---------- */
const main = findMainScript(html, 'function renderAnswer(').code;
const bridge = `
globalThis.__T = {
  views: Views,
  setView: v => { view = v; },
  setDoc: id => { currentDocId = id; },
  setSearch: t => { searchTerm = t; },
  setBrowseFrom: v => { browseFrom = v; },
  // 注意 1：灌数据必须走这里，而不是 importJsonDocs ——
  //   导入路径内部会调 saveDocs() → invalidateMemQueue()，那条链路会把"未声明变量"隐式建成全局，
  //   从而掩盖掉真实启动路径（从存储读入后直接渲染）才会暴露的 ReferenceError。
  // 注意 2：这里只清"该清的那几个缓存"（统计/等级/搜索索引/队列），
  //   绝不能顺手调 invalidateMemQueue() —— 它会碰到热力图计数缓存，等于替产品把 bug 藏起来。
  _bump: () => { _statsCache = null; _lvCountsCache = null; _searchIndex = null; _memQueueDirty = true; },
  setDocs: d => { DOCS = d; buildIndex(); globalThis.__T._bump(); },
  setProgress: p => { PROGRESS = p; globalThis.__T._bump(); },
  setHot: a => { HOT = a; },
  setGrill: o => { Object.assign(grill, o); },
  // 屏幕常亮的"什么时候按住"由 needWakeLock 决定，是纯状态判断，交给用例直接问；
  // syncWake 暴露出来是为了让用例能驱动一次"申请/释放"（真机上由浏览器执行）
  wakeWant: () => needWakeLock(),
  syncWake: () => syncWakeLock(),
  // 软键盘避让的高度算法（--kb）：纯算术，直接问；DOM/CSS 侧已在真实浏览器里实测过
  kbInset: () => kbInset(),
  setWarLog: o => { WARLOG = o; },
  setRevLog: a => { REVLOG = a; },
  startPractice: scope => startPractice(scope),
  startMock: () => startMock(),
  setMockCfg: c => { Object.assign(mock.cfg, c); },
  renderWar: () => { const r = buildWarReport(Date.now()); if (r) renderWarReport(r); return !!r; },
  warTotal: () => document.querySelector('#warTotal').textContent,   // 战报大数字（次），用来核对跨设备合并的口径
  finishMock: () => { mock.done = true; },
  renderAll: () => renderAll(),
  html: () => document.querySelector('#content').innerHTML,
  stats: () => computeAllStats(),
  lvCounts: () => computeLvCounts(),
  hmCounts: () => hmDayCounts(),
  docs: () => DOCS.map(d => d.id),
};
`;

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra === undefined ? '' : '   -> ' + extra)); }
};

console.log('\n[主脚本整体执行 · 最小 DOM stub]');
try {
  vm.runInContext(main + '\n' + bridge, ctx, { filename: 'index-main.js' });
  ok(true, '主脚本（含顶层立即执行代码）执行完毕，无异常抛出');
} catch (e) {
  ok(false, '主脚本执行抛异常', (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)));
  console.log('\n结果：' + pass + ' 通过 / ' + (fail + 1) + ' 失败（主脚本没能跑起来，后续检查全部跳过）');
  process.exit(1);
}

const T = ctx.__T;
/** 直接调用桥函数时也要兜住异常：否则首个未捕获异常会直接终止整个脚本，后面的检查全都跑不到 */
const call = (label, fn) => {
  try { return { v: fn() }; }
  catch (e) { ok(false, label + ' 调用抛异常', (e && e.message) ? e.message : String(e)); return { v: undefined }; }
};
const render = (view, label) => {
  try {
    T.setView(view);
    T.renderAll();
    ok(true, label + ' 渲染无异常');
    return T.html();
  } catch (e) {
    ok(false, label + ' 渲染抛异常', (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)));
    return '';
  }
};

console.log('\n[空库 · 各页面渲染]');
{
  const hOv = render(T.views.OVERVIEW, '总览');
  ok(hOv.indexOf('salary-num') !== -1, '总览含薪资卡', hOv.slice(0, 80));
  ok(hOv.indexOf('就绪度') === -1, '总览页不再有就绪度卡片');
  render(T.views.DOCS, '文档');
  render(T.views.ANALYTICS, '进度');
  ok(render(T.views.MEMORY, '记忆').indexOf('题库还是空的') !== -1, '空库的记忆页给导入引导（而不是"全部掌握"）');
  render(T.views.GRILL, '拷打');
  render(T.views.HOT, '趁热');
}

console.log('\n[有数据 · 各页面渲染]');
{
  T.setDocs([
    { id: 'd1', title: 'Java 基础', questions: [
      { id: 'q1', title: 'HashMap 扩容机制', answer: '负载因子 0.75，扩容翻倍' },
      { id: 'q2', title: 'volatile 语义', answer: '可见性 + 禁止重排序' }] },
    { id: 'd2', title: 'JVM', questions: [
      { id: 'q3', title: 'G1 回收流程', answer: '初始标记 → 并发标记 → 最终标记 → 筛选回收' }] },
  ]);
  ok(T.docs().length === 2, '就位两篇文档（等价于启动时从存储读入）', T.docs().join(','));

  const DAY = 86400000, now = Date.now();
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  T.setProgress({
    q1: { seen: true, mastered: true, lastPracticed: now - 2 * DAY, srNext: now - DAY, interval: 6, fsrs: { d: 5, s: 6, last: now - 2 * DAY, reps: 3, lapses: 0 } },
    q2: { seen: true, lastPracticed: now - 9 * DAY, srNext: now + DAY, interval: 3, fsrs: { d: 6, s: 3, last: now - 9 * DAY, reps: 2, lapses: 0 } },
    q3: { practiced: true, lastPracticed: now - 3 * DAY },
  });
  const yk = (() => { const t = new Date(now); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
  // 昨天的战报：本机 14 次 + 另一台设备 3 次（按「设备」分层）——
  // 页面上的大数字必须是两台设备相加的 17，否则手机/电脑又会各报一半（用户实测过的那个问题）
  T.setWarLog({ [yk]: {
    devB: { c: [0, 0, 2, 1], q: ['q3'], nw: 0, mUp: 1, mDown: 0, up: 1, down: 0, at: now },
    devA: { c: [1, 2, 8, 3], q: ['q1', 'q2', 'q3'], nw: 2, mUp: 2, mDown: 0, up: 3, down: 1, at: now + 1 },
  } });
  T.setRevLog([{ d: 3, r: 1, at: now - 5 * DAY, qid: 'q1' }, { d: 12, r: 0, at: now - 2 * DAY, qid: 'q2' }]);
  T.setHot([{ qid: 'q2', addedAt: now }]);

  const stats = call('computeAllStats', () => T.stats()).v || {};
  ok(stats.tq === 3 && stats.ts === 3, '统计口径：3 题已看', JSON.stringify({ tq: stats.tq, ts: stats.ts }));

  render(T.views.OVERVIEW, '总览');
  render(T.views.DOCS, '文档');

  const hAn = render(T.views.ANALYTICS, '进度');
  const hm = call('hmDayCounts', () => T.hmCounts()).v;
  ok(!!hm && hm.size > 0, '热力图当天计数可用（hmDayCounts）', hm ? String(hm.size) : '调用失败');
  ok(hAn.indexOf('an-wrap') !== -1, '进度页骨架已渲染');
  ok(hAn.indexOf('hm-cell') !== -1, '进度页含热力图格子（buildHeatmapHtml 真实跑通）');
  ok(hAn.indexOf('hmSwitch') === -1 && hAn.indexOf('data-hm-nav') === -1, '进度页只有今年热力图，不再有年/月切换与月导航');
  ok(hAn.indexOf('fc-strip') !== -1, '进度页含到期预测条');
  ok(hAn.indexOf('rt-bar') !== -1 || hAn.indexOf('暂无复习记录') !== -1, '进度页含保留率区块');
  ok(hAn.indexOf('tag-item') !== -1 || hAn.indexOf('暂无标签数据') !== -1, '进度页含标签掌握度区块');

  const hMem = render(T.views.MEMORY, '记忆');
  ok(hMem.indexOf('lvbar') !== -1 || hMem.indexOf('全部掌握') !== -1, '记忆页含全库等级条（或如实显示已复习完）');
  ok(hMem.indexOf('<button type="button" class="grade-btn mem-grade') !== -1, '记忆四档评分是真按钮（键盘/读屏可达）');

  const hHot = render(T.views.HOT, '趁热');
  ok(hHot.indexOf('hotCard') !== -1 || hHot.indexOf('热榜是空的') !== -1, '趁热页渲染正常');

  render(T.views.GRILL, '拷打');

  T.setSearch('扩容');
  const hSearch = render(T.views.SEARCH, '搜索结果');
  ok(hSearch.indexOf('sr-item') !== -1 || hSearch.indexOf('没有匹配') !== -1, '搜索页渲染正常');

  T.setDoc('d1');
  T.setBrowseFrom(T.views.DOCS);
  const hBrowse = render(T.views.BROWSE, '题目浏览');
  ok(hBrowse.indexOf('doc-head') !== -1, '浏览页含文档头');
  ok(hBrowse.indexOf('data-qid') !== -1, '浏览页渲染出题目卡片');

  call('startPractice', () => T.startPractice('d1'));
  const hPrac = render(T.views.PRACTICE, '刷题');
  ok(hPrac.indexOf('pcard') !== -1 || hPrac.indexOf('done-card') !== -1, '刷题页渲染正常');

  call('setMockCfg', () => T.setMockCfg({ count: 2, scope: 'all' }));
  call('startMock', () => T.startMock());
  const hMock = render(T.views.MOCK, '八股练习');
  ok(hMock.indexOf('mock-card') !== -1 || hMock.indexOf('mock-result') !== -1, '八股练习页渲染正常');

  T.finishMock();
  const hMockResult = render(T.views.MOCK, '八股结果页');
  ok(hMockResult.indexOf('score-summary') !== -1, '八股结果页含评分汇总');

  const war = call('renderWarReport', () => T.renderWar()).v;
  ok(!!war, '战报（昨日有数据）能构建并渲染');
  const warN = call('warTotal', () => T.warTotal()).v;
  ok(warN === '17', '战报大数字 = 昨天的跨设备合计量（本机 14 + 另一台 3）', String(warN));
  // 旧版扁平桶（升级前写下的当天记录）仍按原口径可读；本机那份在写入/加载时会被迁到设备名下
  T.setWarLog({ [yk]: { c: [1, 2, 8, 3], q: ['q1', 'q2', 'q3'], nw: 2, mUp: 2, mDown: 0, up: 3, down: 1 } });
  const legacyWar = call('renderWarReport', () => T.renderWar()).v;
  ok(!!legacyWar && call('warTotal', () => T.warTotal()).v === '14', '旧格式（无设备分层）的当天记录照旧统计',
     String(call('warTotal', () => T.warTotal()).v));
}

console.log('\n[屏幕常亮：只在"进行中"的页面按住 Screen Wake Lock]');
{
  // 假 wakeLock：request 返回"then 同步执行"的 thenable —— 让"申请"与"释放"两个分支
  // 都能落在同一段同步断言里（真异步的话，微任务跑完前断言就已经执行了）
  const calls = { req: 0, rel: 0 };
  ctx.navigator.wakeLock = {
    request: () => {
      calls.req++;
      return { then(fn) { fn({ addEventListener() {}, release() { calls.rel++; } }); return { catch() {} }; } };
    },
  };
  const want = () => call('needWakeLock', () => T.wakeWant()).v;

  T.setView(T.views.OVERVIEW); T.renderAll();
  ok(want() === false, '总览页不按住屏幕（不进复习就不申请，省电）');
  T.setView(T.views.MEMORY); T.renderAll();
  ok(want() === true, '记忆模式还有待复习的卡 → 按住');
  T.syncWake();
  ok(calls.req === 1, '进入复习后申请了屏幕常亮', 'req=' + calls.req);
  T.setView(T.views.OVERVIEW); T.renderAll();
  T.syncWake();
  ok(calls.rel === 1, '离开复习页立即释放', 'rel=' + calls.rel);

  T.setGrill({ started: false, ended: false });
  T.setView(T.views.GRILL); T.renderAll();
  ok(want() === false, '拷打配置页（未开始）不按住');
  T.setGrill({ started: true, ended: false });
  T.renderAll();
  ok(want() === true, '拷打进行中按住（一段回答要写几分钟）');
  T.setGrill({ ended: true });
  T.renderAll();
  ok(want() === false, '拷打结束后放掉');

  call('startMock', () => T.startMock());
  T.setView(T.views.MOCK); T.renderAll();
  ok(want() === true, '模考答题中按住');
  T.finishMock(); T.renderAll();
  ok(want() === false, '模考结果页放掉');

  T.setView(T.views.MEMORY); T.renderAll();
  ctx.document.hidden = true;
  ok(want() === false, '切后台时不申请（浏览器也只在页面可见时才给）');
  ctx.document.hidden = false;
  delete ctx.navigator.wakeLock;   // 收尾：别把假插件留给后面的用例
}

console.log('\n[软键盘避让：--kb 的算法]');
{
  const kb = () => call('kbInset', () => T.kbInset()).v;
  const vv = (h, top) => { ctx.visualViewport = { height: h, offsetTop: top || 0 }; };
  const oldH = ctx.innerHeight;
  ctx.innerHeight = 800;
  delete ctx.visualViewport;
  ok(kb() === 0, '没有 visualViewport 的旧内核 → 0（CSS 里 var(--kb) 退回 0，等于没写）');
  vv(800);
  ok(kb() === 0, '键盘没弹起（可见高度 = 布局高度）→ 0');
  vv(400);
  ok(kb() === 400, '键盘吃掉 400px → --kb = 400px', 'kb=' + kb());
  vv(760);
  ok(kb() === 0, '高度差 40px 视为地址栏收展，不当键盘（阈值 80px）');
  vv(400, 40);
  ok(kb() === 360, '浏览器把可视区上移 40px 时按"实际被遮住的高度"算', 'kb=' + kb());
  ctx.innerHeight = oldH;
  delete ctx.visualViewport;   // 收尾
}

console.log('\n[运行时错误日志]');
ok(ctx.__errors.length === 0, '执行期间 console.error 无输出', ctx.__errors.slice(0, 3).join(' || '));

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
