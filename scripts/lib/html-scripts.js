/**
 * index.html 内联 <script> 的解析与词法扫描工具（check-syntax / check-globals / smoke-test 共用）。
 *
 * 为什么单独抽出来：三个脚本原来各写一份"抽取内联脚本"的正则（`[\s"'/]src=` 与旧的 `\bsrc=` 两种写法、
 * "静默空串 / throw / 误报"三种失败策略），修一处不会同修另一处。这里统一约定：
 *   - 抽不到内联块 = 抽取逻辑失效，必须显式报错（绝不静默返回空）
 *   - 跳过 src= 外链、跳过 JSON-LD 等非 JS 类型
 */
'use strict';

/* 匹配不带 src 的内联 script。
   负向前瞻用 [\s"'/]src= 而不是 \bsrc=：后者会误伤 data-src="…"（- 是非词字符，\b 成立），
   把真·内联块整体当作"外链脚本"跳过，静默漏检 */
const INLINE_RE = /<script((?![^>]*[\s"'/]src=)[^>]*)>([\s\S]*?)<\/script>/gi;

/** 非 JS 的脚本类型（JSON-LD / 导入映射 / 模板）：交给 node --check 只会误报 */
function isNonJsType(type) {
  return /json|template|importmap|speculationrules/i.test(type);
}

/** 某个字符下标落在第几行（1 起始） */
function lineOfIndex(text, index) {
  return text.slice(0, index).split('\n').length;
}

/**
 * 抽取全部内联 <script>。
 * @returns {{startLine:number, code:string, type:string}[]} type 为 '' | 'module' | 其它声明值
 */
function extractInlineScripts(html) {
  const out = [];
  let m;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(html)) !== null) {
    const attrs = m[1] || '';
    const typeMatch = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    const type = typeMatch ? typeMatch[1].toLowerCase() : '';
    if (isNonJsType(type)) continue;
    out.push({ startLine: lineOfIndex(html, m.index), code: m[2], type });
  }
  return out;
}

/**
 * 主脚本（应用全部逻辑所在块）：按内容定位而不是写死序号，将来新增内联块也不会挑错。
 * 抽不到直接抛错 —— 静默降级会让下游门禁全部"通过"，比误报危险得多。
 */
function findMainScript(html, marker) {
  const key = marker || 'function renderAnswer(';
  const main = extractInlineScripts(html).find(b => b.code.indexOf(key) !== -1);
  if (!main) throw new Error('未找到包含 `' + key + '` 的主内联脚本（抽取逻辑失效或该函数已改名）');
  return main;
}

/* ---------- 词法扫描：把字符串/注释/正则/模板文本段抹成空白（长度与下标保持不变） ---------- */
function maskCode(s) {
  const out = s.split('');
  const blank = (a, b) => { for (let k = a; k < b && k < out.length; k++) { if (out[k] !== '\n') out[k] = ' '; } };
  const skipStr = (i) => {                       // 普通字符串：' 或 "
    const q = s[i];
    let j = i + 1;
    while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s[j] === q) return j + 1; j++; }
    return s.length;
  };
  // 正则字面量必须先于字符串判断：/[&<>"]/ 里的引号会被当成字符串起点，一路吞到下一个引号 → 遮蔽错位
  const isRegexStart = (i) => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(s[j])) j--;
    if (j < 0) return true;
    return '([{,;:=!&|?+*-<>%~^'.indexOf(s[j]) !== -1;
  };
  const skipRegex = (i) => {
    let j = i + 1, inClass = false;
    while (j < s.length) {
      const ch = s[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) {
        // 连同 flags 一起吞掉：只抹 /…/ 而留下 /gm 的 gm 会被当成标识符引用（误报"未声明"）
        let k = j + 1;
        while (k < s.length && s[k] >= 'a' && s[k] <= 'z') k++;
        return k;
      }
      else if (ch === '\n') return j;
      j++;
    }
    return s.length;
  };
  const scanTpl = (i) => {
    let j = i + 1, segStart = j;
    while (j < s.length) {
      const ch = s[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === '`') { blank(segStart, j); return j + 1; }
      if (ch === '$' && s[j + 1] === '{') {
        blank(segStart, j);                       // 文本段抹掉，插值内部继续按代码扫
        const end = scanCode(j + 2, true);
        j = end + 1; segStart = j; continue;
      }
      j++;
    }
    blank(segStart, s.length);
    return s.length;
  };
  // stopBrace：遇到"与 ${ 配对的 }"才返回。必须维护花括号深度 ——
  // 原实现遇到任意 } 就返回，`${ {a:1} }` / `${ ()=>{...} }` 这类插值会被从中间截断，
  // 其后整段代码被误当成模板文本抹掉（漏报）。
  const scanCode = (i, stopBrace) => {
    let depth = 0;
    while (i < s.length) {
      const ch = s[i], nx = s[i + 1];
      if (ch === '/' && nx === '/') { const nl = s.indexOf('\n', i); const e = nl < 0 ? s.length : nl; blank(i, e); i = e; continue; }
      if (ch === '/' && nx === '*') { const e0 = s.indexOf('*/', i); const e = e0 < 0 ? s.length : e0 + 2; blank(i, e); i = e; continue; }
      // 正则字面量要抹掉而不是只跳过：它的内容（如 /\u0001MD(\d+)\u0001/）会被当成代码扫出假调用
      if (ch === '/' && isRegexStart(i)) { const e = skipRegex(i); blank(i, e); i = e; continue; }
      if (ch === '"' || ch === "'") { const e = skipStr(i); blank(i + 1, e - 1); i = e; continue; }
      if (ch === '`') { i = scanTpl(i); continue; }
      if (ch === '{') { depth++; i++; continue; }
      if (ch === '}') {
        if (stopBrace && depth === 0) return i;
        if (depth > 0) depth--;
        i++; continue;
      }
      i++;
    }
    return i;
  };
  scanCode(0, false);
  return out.join('');
}

/**
 * try 块的 [start, end] 下标区间（在 maskCode 后的骨架上配平花括号）。
 * 用途：判断某个 localStorage 调用是否真的被 try 兜住 —— 只看"前 8 行有没有 try"会漏真问题（try 早已闭合）。
 */
function trySpans(code) {
  const masked = maskCode(code);
  const spans = [];
  const re = /\btry\s*\{/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const open = m.index + m[0].length - 1;   // '{' 的下标
    let depth = 0, i = open;
    for (; i < masked.length; i++) {
      const ch = masked[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    spans.push([open, i]);
  }
  return spans;
}

function isIndexInSpans(spans, index) {
  for (const [a, b] of spans) if (index > a && index < b) return true;
  return false;
}

module.exports = { extractInlineScripts, findMainScript, lineOfIndex, maskCode, trySpans, isIndexInSpans };
