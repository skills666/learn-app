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

// 仓库根目录的 js（sw.js / sync-www.js 等）：自动收集，新增根目录脚本不会漏检
fs.readdirSync(ROOT).filter(f => f.endsWith('.js')).sort().forEach(f => {
  targets.push({ name: f, file: path.join(ROOT, f) });
});
// 工具脚本（含 scripts/lib/）：它们语法出错会直接让 check / test / 构建全链路挂掉
const scriptDir = path.join(ROOT, 'scripts');
fs.readdirSync(scriptDir).filter(f => f.endsWith('.js')).sort().forEach(f => {
  targets.push({ name: 'scripts/' + f, file: path.join(scriptDir, f) });
});
const libDir = path.join(scriptDir, 'lib');
if (fs.existsSync(libDir)) {
  fs.readdirSync(libDir).filter(f => f.endsWith('.js')).sort().forEach(f => {
    targets.push({ name: 'scripts/lib/' + f, file: path.join(libDir, f) });
  });
}

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
