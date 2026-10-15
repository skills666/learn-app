# Tasks

## 1. 反斜杠转义还原（renderAnswer）

- [x] 1.1 在 `renderAnswer` 引入「占位式」反斜杠还原：仅在代码围栏/行内码之外，把 `\X`（`X` 为 ASCII 标点白名单 `` \ ` * _ { } [ ] ( ) # + - . ! < > ~ | " ``）临时替换为独立控制符占位，末尾回填成**已转义**的字面字符，确保还原出的 `*`/`` ` `` 不再被后续加粗/代码正则二次解释。验证：`scripts/smoke-test.js` 新增断言 `\<form\>`→`<form>`、`form\-data`→`form-data`、`\*\*x\*\*` 渲染为字面 `**x**`（不加粗），`npm test` 通过
- [x] 1.2 保证还原不侵入代码：验证围栏内 `a \* b`、正则 `\d+`、`\.`，以及正文里「`\` + 字母/数字」的 `C:\temp`、`\d` 全部原样保留。验证：`npm test` 相应断言通过

## 2. 列表渲染（renderAnswer）

- [x] 2.1 在段落切分前按行识别无序 `^([-*+]) +` 与有序 `^\d+\. +`，聚成 `<ul>/<ol>` + `<li>`，行首落在围栏占位符内的行不识别。验证：断言 `- 前端部分`→含 `<ul>`/`<li>前端部分</li>`、`1. 创建表单`→含 `<ol>`/`<li>创建表单</li>`
- [x] 2.2 抑制误判：验证 `--`、`-词`（标记后无空格）、正文 `3.14`（点后非空格）不被当作列表；列表块整体作为块级输出、不被 `<p>` 包裹。验证：`npm test` 通过

## 3. 回归与渲染冒烟

- [x] 3.1 复跑 `renderAnswer`/`stripMarkdown` 既有断言（代码块不被 `<p>` 包裹、围栏内容原样、CRLF 分段、HTML 转义、行内加粗/代码）确认无回退。验证：`npm test` 全绿
- [x] 3.2 验证真实渲染管线：刷题答案区 `#pAnswerBody` 与浏览答案框 `.q` 经修复后符号正确、列表成符号。验证：`scripts/render-smoke.js` 相关断言通过

## 4. 版本双写与门禁

- [x] 4.1 递增 `index.html` 的 `const SW_VERSION` 与 `sw.js` 的 `const CACHE`，两处数字保持一致。验证：`node sync-www.js` 版本校验通过
- [x] 4.2 运行完整门禁。验证：`npm run check` 与 `npm run verify`（= check + test）全部通过

## 5. 松列表与有序起始号（修正 ①）

- [x] 5.1 先写失败断言：`renderAnswer('1. 甲\n\n2. 乙\n\n3. 丙')` 输出为**一个** `<ol start="1">` 含三个 `<li>`（不是三个各一项的 `<ol>`）；`renderAnswer('3. 丙\n\n4. 丁')` 首项保留起始号。验证：未改代码前新断言 FAIL
- [x] 5.2 重写 `renderAnswer` 块级处理：改为行级扫描，连续列表项（跨空行）聚合为一个 `<ul>/<ol>`，无序用 `<ul>`、有序用 `<ol start="N">`（N=首项序号）；非列表且非空行才打断列表。验证：`npm test`（含 5.1 与既有列表断言）全绿

## 6. 搜索摘要清理符号（②）

- [x] 6.1 先写断言：`renderSearch` 路径的摘要文本对含 `\<form\>` 的答案不出现反斜杠（抽出可测的摘要归一化辅助函数，断言其将答案降为无多余符号的纯文本）。验证：未改前 FAIL
- [x] 6.2 `renderSearch` 摘要改为先对 `raw` 做反斜杠还原 + Markdown 去标记（复用共享工具）后再截断显示；保持围绕命中位置截取与 `esc`。验证：`npm test` 与 `scripts/render-smoke.js` 相关断言通过

## 7. 导入丢弃无正文标题（③，B 方案）

- [x] 7.1 先写断言：`parseMarkdownToDoc` 对「`# java`↵`# web`↵`## 题目`+正文」只产出「题目」这一道（java/web 空标题被丢弃）；全是空标题时 `questions.length===0`。验证：未改前 FAIL
- [x] 7.2 `parseMarkdownToDoc` 生成 questions 后过滤掉正文为空（trim 后）的题目（在 map 前取下一标题位置算 body 并筛选）。验证：`npm test` 相应断言通过，既有 `normalizeDocs`/导入断言无回退

## 8. 回归与门禁（补充部分）

- [x] 8.1 复跑 `renderAnswer`/`stripMarkdown`/`renderTitle` 既有断言与新增 5-7 断言。验证：`npm test` 全绿
- [x] 8.2 再次递增 `index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE`（本轮代码改动，需与 4.1 叠加再进一位），两处一致。验证：`node sync-www.js` 通过
- [x] 8.3 跑 `npm run check` + `npm run verify`。验证：全部通过

## Workflow follow-up

- 实现并自测通过后，按项目评审要求在合适时机归档本变更（`/opsx:archive`）。
- `www/` 同步与 Android 打包（`cap sync` / `build`）在 apply 阶段按常规流程执行，不在本变更规划范围内展开。
