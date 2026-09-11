/**
 * 语法检查：抽取 index.html 内联 <script> 块 + 独立 js 文件，逐个 `node --check`。
 * 用法：npm run check（或 node scripts/check-syntax.js）
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// 以脚本所在位置定位仓库根目录，换机器/换目录都不用改路径
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 匹配不带 src 的内联 script
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, blocks = [];
while ((m = re.exec(html)) !== null) {
  const before = html.slice(0, m.index);
  const line = before.split('\n').length;
  blocks.push({ startLine: line, code: m[1] });
}

// 临时文件写到系统临时目录，不污染仓库
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-app-syntax-'));

const targets = blocks.map((b, i) => {
  const f = path.join(tmpDir, `block${i + 1}_line${b.startLine}.js`);
  fs.writeFileSync(f, b.code, 'utf8');
  return { name: `index.html inline script #${i + 1} (starts line ${b.startLine})`, file: f };
});
targets.push({ name: 'chest.js', file: path.join(ROOT, 'chest.js') });
targets.push({ name: 'sw.js', file: path.join(ROOT, 'sw.js') });
targets.push({ name: 'sync-www.js', file: path.join(ROOT, 'sync-www.js') });

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
