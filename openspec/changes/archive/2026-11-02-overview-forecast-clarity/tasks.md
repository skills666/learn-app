# Tasks

## 1. 深度口径统一（先锁住现状，再动）

- [x] 1.1 在 d:\learn\learn-app\index.html 新增共享函数 `overdueOf(r, todayNo)`，按 design.md D2 的四条规则实现，并让 `buildAnalyticsData` 的 rows 改用它（L5215-5216 那段内联判断删掉）；验证：新增行为断言——普通逾期题返回正确天数、`mastered` 且无任何时间戳的题返回 0（守住「不出现逾期两万天」这个既有兜底）、今天晚些到期返回 0
- [x] 1.2 把「表格侧改动没有改变任何题的 overdue 结果」写成回归断言，用 L676-683 那组同一道题跨页对照的构造（昨天 23:00 到期 → 表格与队列都是 1 天）；验证：`node scripts/smoke-test.js` 通过，且原有的两页口径一致断言仍绿

## 2. 到期预测：三类分开计数

- [x] 2.1 在 `buildForecastHtml`（L5454-5492）把 `!r.next` 的分支从「计入逾期」改为「计入未排期」，并把今天到期、逾期、未排期三类分别统计；验证：新增断言——只翻看过未评分的题出现在未排期计数、不出现在逾期计数；有 next 且已过期的进逾期
- [x] 2.2 逾期按 `FSRS_MAX_INTERVAL` 与它的 2 倍切成三段（边界由上限推导，**不写死数字**），常量与 change `memory-surface-readability` 的欠账分段共用一份声明；验证：断言里把上限临时视为 7 与 14 两种取值，三段边界随动；且 `node scripts/check-globals.js` 不报重复声明。**实现说明**：未新增常量，分段边界与 change `memory-surface-readability` 的队列构成一样直接从 `FSRS_MAX_INTERVAL`（本函数里的局部变量 `days`）推导，两边共用同一个源，结构上不存在两份声明
- [x] 2.3 未排期题不计入「未来 N 天共 X 题」的总数，改由脚注单列一句「另有 W 题从未排期」；验证：构造含未排期题的用例，总数不含它们，脚注含 W；同时确认原有那条 `未来 14 天共 <b>2</b> 题` 断言（smoke-test L565）仍通过

## 3. 到期预测：分段呈现与峰值

- [x] 3.1 第 0 列保持单个 `<i>` 节点、class 仍含 `today`，用 `linear-gradient` 硬色标按占比切出逾期三段（design.md D1）；段信息同时写入 `data-seg` 与 `title`；验证：按 `/<i class=/g` 数出的列数仍等于 `FSRS_MAX_INTERVAL`（既有断言不红），且 `cells[0]` 仍含 `today`（L694 那条不红）
- [x] 3.2 占比低于可读阈值的段不绘制，但数字仍在 `title` 与脚注报出；阈值在实现时按 320px 窄屏实测定值；验证：构造「一段只有 1 题、另一段 999 题」的数据，输出里没有假精确的等高分段，且两段数字都能从脚注读到
- [x] 3.3 峰值改为只在 `idx ≥ 1` 的未来列中选取，逾期不参与；未来列全空但有逾期时走新分支「今天之后 N 天内无新排期 · 欠账 X 题」；`sum === 0` 时保留原文案 `✅ N 天内无排期`；验证：三条分支各一条断言，并确认 L568 那条「含 `14 天内无排期` 且不含 `未来无排期`」仍通过
- [x] 3.4 逾期存在时单独说一句「欠了多少题、最久欠多少天」，与峰值不混在一条提示里；验证：构造逾期 + 未来排期并存的数据，输出里两者分居不同片段
- [x] 3.5 把脚注与卡面的逾期色由 `--bad` 降为 `--warn`/中性（design.md D6），与 `memory-surface-readability` 对记忆卡头部的处理同调；验证：渲染冒烟里 `maxOverdue` 超限的样例输出不含 bad 类/坏色值

## 4. 总览卡：两个数平级

- [x] 4.1 卡面改为「到期 N · 未学 M」同等字号字重并排 + 下方等式「复习队列 = N + M」（把已有但只活在 title 里的 `todo`，L3476 显示出来）；验证：`node scripts/render-smoke.js` 的总览页通过，且输出的两个数字字号类名同级、等式文本含 `todo` 值
- [x] 4.2 保持 `ov-act` 脉冲与颜色条件不变（只跟 `due > 0`），未学不加告警色；验证：无到期题但有未学题时卡面不出现告警脉冲类
- [x] 4.3 无未学题时不显示多余占位；验证：`fresh === 0` 的样例输出里没有「未学 0」这种虚增项（对应 specs 的「没有未学题时不虚增」）
- [x] 4.4 核对卡面数字与记忆模式队列总数一致：构造「一半题从未学过」的场景，等式右边等于队列长度；验证：一条跨页断言（总览等式 vs `buildMemoryQueue().length`）通过——**这条就是本次起因的守门测试**

## 5. 集成与发布门

- [x] 5.1 同步 d:\learn\learn-app\scripts\smoke-test.js 里被影响的所有断言与 rows 构造（至少：静态匹配 `if(idx < days) buckets[idx]++; else later++;` 那条 L836、列数与总数文案 L563-566、今天晚些到期 L686-694、无排期措辞 L568）；验证：`npm run verify` 绿，且不存在「改了源码没改断言」或「改了断言没改源码」
- [x] 5.2 同步递增版本号：`index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE`；验证：`node sync-www.js` 不拒绝打包
- [x] 5.3 跑 `npm run verify` 全量门禁；验证：check-syntax、check-globals、smoke-test、render-smoke 四条全绿
- [x] 5.4 造一次「全库停练半个月」的数据在浏览器里实看预测图（已实测：混合深度那组第 0 列 `title` 为「今天到期 0 · 欠 1~7 天 4 · 8~14 天 3 · 超过 14 天 3」且 background 带 linear-gradient；全库同深时只有一段 → 按设计不画分段；脚注走「今天之后 7 天内无新排期 · 欠账 30 题」新分支，峰值不再报今天）；未排期单列那条由冒烟断言覆盖（本批数据 rows 全部有 next）；验证：观察结果与 specs 的四条 Requirement 场景逐条对得上

## Workflow follow-up

- 实现完成并通过评审后归档本 change，创建 d:\learn\learn-app\openspec\specs\stats-presentation\spec.md（delta 的 `## Purpose` 会被带进主 spec）。
- 归档前跑 `openspec validate --strict` 确认无 500 字告警。
- 与 change `memory-surface-readability` 的先后：那个先做时，本 change 复用它的欠账分段常量；本 change 先做时，由本 change 声明、另一个引用。不允许两份声明。
- 项目底稿 d:\learn\learn-app\openspec\project.md 有两处过期内容（`FSRS_MAX_INTERVAL` 仍写 14 天、一个非本工作区的绝对路径），修正需用户单独批准，不在本 change 范围内。
