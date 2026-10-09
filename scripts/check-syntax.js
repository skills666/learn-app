/**
 * 语法检查：抽取 index.html 内联 <script> 块 + 独立 js 文件，逐个 `node --check`。
 * 用法：npm run check（或 node scripts/check-syntax.js）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { extractInlineScripts } = require('./lib/html-scripts');

// 以脚本所在位置定位仓库根目录，换机器/换目录都不用改路径
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const blocks = extractInlineScripts(html);
// 抽不到任何块时必须失败：抽取逻辑一旦失配（如 <script> 写法变了），旧实现会照常打印"全部通过"，
// 门禁静默变绿比误报更危险（smoke-test 里的同类检查就是直接 throw 的）
if (!blocks.length) {
  console.error('未能从 index.html 抽取到任何内联 <script> 块：抽取逻辑可能已失效，请检查 scripts/lib/html-scripts.js');
  process.exit(1);
}

// 临时文件写到系统临时目录，不污染仓库
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-app-syntax-'));

const targets = blocks.map((b, i) => {
  // module 块用 .mjs 检查：import/export 在 .js 里会被 node --check 误判成语法错误
  const ext = b.type === 'module' ? '.mjs' : '.js';
  const f = path.join(tmpDir, `block${i + 1}_line${b.startLine}${ext}`);
  fs.writeFileSync(f, b.code, 'utf8');
  return { name: `index.html inline script #${i + 1} (starts line ${b.startLine}${b.type ? ', type=' + b.type : ''})`, file: f };
});

/* 仓库里我们维护的 js：根目录 + scripts/（含所有子目录）递归收集。
   为什么递归：旧实现每层只 readdir 一次（根 + scripts + scripts/lib 三处硬编码），
   再深一层就会静默漏检 —— 门禁漏检比误报危险。三种扩展名都收：.cjs/.mjs 是 Node 的既定写法。 */
const EXT_RE = /\.(?:js|cjs|mjs)$/;
// 跳过的目录都不是"本仓库维护的源码"：node_modules 是第三方；www/ 与 android/**/assets/public 是
// sync-www.js 的产物副本（扫进去只会把同一份代码检查两遍）；隐藏目录与 _probe* 是本地/工具产物
const SKIP_DIR = new Set(['node_modules', 'www', 'android', 'generated-images', 'dist', 'build']);
const shouldSkipDir = (name) => SKIP_DIR.has(name) || name.startsWith('.') || name.startsWith('_probe');
const collect = (dir, prefix) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));   // 排序：输出稳定，CI 日志可比
  for (const e of entries) {
    if (e.isDirectory()) {
      if (shouldSkipDir(e.name)) continue;
      collect(path.join(dir, e.name), prefix + e.name + '/');
    } else if (EXT_RE.test(e.name)) {
      targets.push({ name: prefix + e.name, file: path.join(dir, e.name) });
    }
  }
};
collect(ROOT, '');

let fail = 0;
for (const t of targets) {
  try {
    execFileSync(process.execPath, ['--check', t.file], { stdio: 'pipe' });
    console.log('OK   ' + t.name);
  } catch (e) {
    fail++;
    console.log('FAIL ' + t.name);
    console.log(String(e.stderr || e.stdout || e.message));
  }
}
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(fail === 0 ? '\nAll syntax checks passed.' : `\n${fail} file(s) failed.`);
process.exit(fail === 0 ? 0 : 1);
