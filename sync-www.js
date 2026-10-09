#!/usr/bin/env node
/**
 * 把根目录的 Web 源文件同步到 www/（Capacitor 的 webDir）。
 *
 * 为什么需要它：根目录和 www/ 各存了一份内容完全相同的 index.html / sw.js …
 * 手工双向维护迟早分叉。这里固定单向约定：
 *   根目录 = 唯一源    www/ = 生成产物
 * `npm run cap:sync` 与 `npm run build:android` 都会先执行本脚本，所以只需要改根目录的文件。
 *
 * 用法：
 *   node sync-www.js         默认（APK 模式）：只同步 FILES_APP
 *   node sync-www.js --pwa   把 www/ 当 PWA 站点部署时：连 PWA 专属资源一起同步
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DEST = path.join(ROOT, 'www');
const AS_PWA = process.argv.slice(2).includes('--pwa');

/* 资源清单拆两组的理由（默认只同步 FILES_APP）：
   APK 里的页面跑在 Capacitor WebView 中，index.html 尾部那段脚本用 IN_NATIVE_SHELL 把 SW 注册整段短路
   （Capacitor 的源是 https://localhost，location.protocol.startsWith('http') 成立，真正拦住注册的是原生壳开关），
   所以 sw.js 不会被注册；WebView 也不渲染标签页、不请求 favicon，manifest 里声明的图标它一个都不会去取
   （App 图标来自 android 的 mipmap）。
   把这两样（icon-512 168KB + maskable 101KB）打进 assets/public 只是白增约 269KB 包体 ——
   PNG 本身已压缩，APK 的 zip 也几乎压不动它。 */
const FILES_APP = ['index.html', 'manifest.json', 'icon-192.png', 'img-bg-dark.jpg'];
// 仅 PWA 用（浏览器直接打开 www/ 的情形）。已移除 1024 的 icon.png：它只在网页的 <link rel="icon"> 里被用到，
// 每次首屏要下 796KB；PWA 图标有 192/512/maskable 就够了
const FILES_PWA = ['sw.js', 'icon-512.png', 'icon-maskable-512.png'];
const FILES = AS_PWA ? FILES_APP.concat(FILES_PWA) : FILES_APP;

/* 版本号一致性校验：index.html 的 SW_VERSION 与 sw.js 的 CACHE 必须同步递增，
   漏改会表现为"页面更新了但离线缓存不刷新"，排查起来很费劲，这里在打包前拦一道。 */
// 正则锚定到行首的声明语句：原来的 /SW_VERSION\s*=\s*'…'/ 会被注释里的一行示例（如 // SW_VERSION = '99'）
// 抢先命中，版本校验就静默失效了
const readVer = (file, re) => (fs.readFileSync(path.join(ROOT, file), 'utf8').match(re) || [])[1];
const swVer = readVer('index.html', /^const SW_VERSION = '([^']+)'/m);
const cacheVer = readVer('sw.js', /^const CACHE = 'learn-v([^']+)'/m);
if(!swVer || !cacheVer || swVer !== cacheVer){
  console.error(`版本号不一致：index.html SW_VERSION='${swVer}'，sw.js CACHE='learn-v${cacheVer}'。请两处同步递增后再打包。`);
  process.exit(1);
}

/* 三清单交叉校验：(i) sw.js 的 PRE_CACHE、(ii) manifest.json 的 icons、(iii) 本脚本的 FILES_APP / FILES_PWA。
   为什么要有：新增或改名一个资源（换图标名最典型）需要改三处，而这三处此前各写各的、没有任何一致性检查 ——
   漏改一处的后果要么是离线首开缺资源、要么是 www/ 里躺着一个谁都不引用的死文件（白增包体），两边都要等线上才发现。 */
const ALL_SET = new Set(FILES_APP.concat(FILES_PWA));
const IS_ICON = /^icon-.*\.png$/;
const problems = [];

// (i) sw.js 的 PRE_CACHE ↔ 本脚本清单：双向核对
const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const preCacheRaw = (swSrc.match(/^const PRE_CACHE = \[([^\]]*)\]/m) || [])[1];
if (preCacheRaw === undefined) {
  problems.push('sw.js 里找不到行首的 `const PRE_CACHE = [...]`（抽取正则失配，请人工核对后再打包）');
} else {
  const precached = preCacheRaw.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  for (const f of ALL_SET) {
    if (f === 'sw.js') continue;   // sw.js 是 SW 本体，不可能也不需要被自己预缓存
    if (!precached.includes(f)) problems.push(`sw.js 的 PRE_CACHE 缺少：${f}（离线首开会缺这个资源）`);
  }
  for (const f of precached) {
    if (!ALL_SET.has(f)) problems.push(`sw.js 的 PRE_CACHE 多出清单外的资源：${f}（是否忘了加进 FILES_APP / FILES_PWA？）`);
  }
}

// (ii) manifest.json 的 icons ↔ 本脚本清单：引用的必须存在，清单里的图标必须都被声明
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const manifestIcons = (manifest.icons || []).map(i => String(i.src).trim());
for (const src of manifestIcons) {
  if (!ALL_SET.has(src)) problems.push(`manifest.json 引用了清单外的图标：${src}`);
}
for (const f of ALL_SET) {
  if (IS_ICON.test(f) && !manifestIcons.includes(f)) problems.push(`清单里的图标没写进 manifest.json 的 icons：${f}`);
}

if (problems.length) {
  console.error('资源清单不一致（sw.js 的 PRE_CACHE / manifest.json 的 icons / 本脚本的 FILES_* 三处必须对齐）：');
  problems.forEach(p => console.error('  - ' + p));
  console.error('请三处同步修改后再打包：漏一处会让离线首开缺资源、或让 APK / 站点白带体积。');
  process.exit(1);
}

fs.mkdirSync(DEST, { recursive: true });
let copied = 0, skipped = 0;
for(const f of FILES){
  const src = path.join(ROOT, f);
  if(!fs.existsSync(src)){ console.warn('  [skip] 缺少源文件：' + f); skipped++; continue; }
  const out = path.join(DEST, f);
  if(fs.existsSync(out) && fs.readFileSync(src).equals(fs.readFileSync(out))){ skipped++; continue; }
  fs.copyFileSync(src, out);
  console.log('  [sync] ' + f);
  copied++;
}
/* 清理 www/ 里的遗留文件：上一版被移除的资源（如已删掉的 1024 图标、以及现在不再进包的 PWA 专属资源）
   若留着，cap sync 会一并打进 APK，白白增大体积。
   必须递归：旧实现 `if(fs.statSync(p).isDirectory()) continue;` 会把整个子目录（连同里面的遗留文件）跳过，
   与那段注释想表达的意图正好相反 —— 目录里的旧资源就一直躺在包里没人管。 */
let cleaned = 0;
const keep = new Set(FILES);
const sweep = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(DEST, p).split(path.sep).join('/');   // 清单里是正斜杠，Windows 下要对齐
    if (e.isDirectory()) {
      sweep(p);
      // 清完还是空的才删目录：里面若还有保留文件（理论上不会），rmdirSync 会抛错，忽略即可
      try { fs.rmdirSync(p); console.log('  [clean] ' + rel + '/（整目录已空）'); cleaned++; } catch(_) {}
      continue;
    }
    if (keep.has(rel)) continue;
    fs.unlinkSync(p);
    console.log('  [clean] ' + rel);
    cleaned++;
  }
};
if (fs.existsSync(DEST)) sweep(DEST);
console.log(`www/ 同步完成（${AS_PWA ? 'PWA 模式：含 PWA 专属资源' : 'APK 模式：只同步 FILES_APP'}）：更新 ${copied} 个；跳过 ${skipped} 个（内容一致或缺源文件）` + (cleaned ? `；清理遗留 ${cleaned} 个` : ''));
