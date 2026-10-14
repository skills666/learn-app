# 实现清单：记忆模式跳过（add-memory-skip）

按 Superpowers 的 TDD 纪律排序：先写会让实现"红→绿"的断言，再落地代码。

## 阶段 1 · 测试先行（先失败）

- [x] 1.1 `scripts/smoke-test.js`：把 `skipMemoryQuestion` 加入 `funcs` 提取表与沙箱返回；新增断言组「记忆模式跳过 · 零副作用」：
  - 跳过使 `memory.index` 前进 1
  - 跳过不写 `PROGRESS`
  - 跳过不入 `memory._history`
  - 跳过不喂趁热榜 `HOT`
  - 跳过复位 `memory.flipped`
  - 跳过不替换 `memory.queue` 数组引用
  - 空队列时跳过不越界
- [x] 1.2 `scripts/render-smoke.js`：断言记忆页骨架含 `id="memSkip"`

## 阶段 2 · 实现（转绿）

- [x] 2.1 `index.html`：新增 `skipMemoryQuestion()`（紧跟 `undoMemoryGrade` 之后）
- [x] 2.2 `index.html`：骨架 `#memControls` 之后加 `.mem-skip-row` + `#memSkip` 按钮
- [x] 2.3 `index.html`：`bindMemoryCard` 加 `#memSkip` 的 onclick（调 `skipMemoryQuestion` + 渲染）
- [x] 2.4 `index.html`：`keydown` 的 MEMORY 分支加 `S` 键 → 点 `#memSkip`
- [x] 2.5 `index.html`：加 `.mem-skip-row` CSS

## 阶段 3 · 收尾

- [x] 3.1 `index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE` 同步递增（130 → 131）
- [x] 3.2 跳过相关的 smoke-test / render-smoke 断言全部通过

## 附：过程中发现的既有问题（不属于本变更，但一并处理/上报）

- [x] 修复 `index.html` 一处既有语法错误：WebGL2 渲染层说明的块注释里，「…一并删除。 */」
      提前闭合了注释，导致「三条硬约束 ①②③」漏在注释外、整段内联脚本 `node --check` 失败。
      已删掉那个多余的 `*/`，让注释正常延伸到原定结束处（纯注释改动，不影响运行）。
- [ ] （未处理，超出本变更范围）`npm run verify` 仍有 9 条**主题子系统**失败：smoke-test 报
      「内置视觉主题 11 套 / canvas key 分派 / 别名表 / 评分爆发形态 / 缩略图签名」缺 `aurora,ripple,zirong,gruvbox`；
      render-smoke 报这 4 个主题首帧 `draw=0`。这属于主题体系被改到一半的遗留状态，与记忆跳过无关，需另行确认意图后再处理。
