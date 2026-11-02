# Proposal

## Why

统计口径有两处在说谎，而且说谎的方向恰好都会误导决策：

1. **总览的「待复习」不含未学题，但复习队列含**。`computeAllStats` 把没有任何进度记录的题计入 `fresh` 后直接 `return`，不进 `due`（d:\learn\learn-app\index.html L3351），而 `buildMemoryQueue` 会把它们全部入队（L4634、L4637）。代码里自己留了这句话：`const todo = due + fresh; // 记忆队列实际会排给你的题量`（L3476）。可这张卡面上 `fresh` 只是小字尾巴「待复习 · 未学 N」（L3513），真正平级显示两个数的是顶部统计条（L3404-3405）。**用户按卡面数字理解自己的欠账，就会得出「队列只有一半」这种错判**——本次起因正是如此。

2. **到期预测图把三种时间状态压进同一根柱**。`buckets[0] += overdue`（L5471）让第 0 列同时代表「今天到期」和「全部逾期」；`if(!n) overdue++`（L5463）又把**从未排期**的题也算进逾期；于是停练半个月后第 0 列是一根顶天柱，`peakIdx`（L5474）顺带把「峰值 · 今天 · N 题」报成一个既做不到、也不被要求的当日任务。这张图在最需要它说话的时刻，信息量归零。

## What Changes

- **总览把「待复习」与「未学」提成两个平级数字**，并在卡面上说明「复习队列 = 两者之和」。不改 `due`/`fresh` 的定义（那是队列口径的既有契约），只改呈现权重与说明。
- **到期预测区分三类时间状态**：今天到期 / 逾期 / 从未排期，不再互相顶名。从未排期的题不得计入逾期。
- **逾期按欠账深度分段**（1~7 天 / 8~14 天 / >14 天），并入当日那一列时以分段形式呈现，而不是压成同色一整块；分段边界沿用 `FSRS_MAX_INTERVAL` 的 1 倍与 2 倍。
- **「峰值」提示不再把欠账当作当日任务**：峰值只反映真实排期的分布，逾期以欠账形式单独说一句。
- **窗口内总题数、列数、`✅ N 天内无排期` 等既有语义保持不变**（只拆分构成，不改变统计总量）。

**明确不做**：不设每日题量上限、不裁剪队列、不把任何到期题推迟——与 change `memory-surface-readability` 同一立场，本 change 只改「数字怎么说」，不改「哪些题进队列」。

**不改的**：`computeAllStats` 的 `due`/`fresh` 判定条件、`buildMemoryQueue` 的入队条件、`effectiveNextOf` 与 `dayIndexOf` 的既有口径、`FSRS_MAX_INTERVAL` 等排期参数。

## Capabilities

### New Capabilities

- `stats-presentation`：约束学习统计量（待复习、未学、逾期、到期预测与峰值）如何定义与呈现，使同一个数字在不同界面口径一致，且不会把欠账误报成当日必须完成的任务。

### Modified Capabilities

（无）

## Impact

- **代码**：d:\learn\learn-app\index.html 两处——总览卡片模板 `renderOverview`（L3470-3514，含 `todo` 变量与卡面小字）、到期预测图 `buildForecastHtml`（L5454-5492）及其调用点（L5639-5640 传的 `days = FSRS_MAX_INTERVAL`）。配套 CSS 见 `.fc-strip` / `.stat-foot`。
- **既有断言必须同步**（这三条直接匹配当前写法或当前输出，改代码不改断言会立刻红）：
  - d:\learn\learn-app\scripts\smoke-test.js L836 静态匹配 `if(idx < days) buckets[idx]++; else later++;`
  - 同文件 L563-566：列数 14（按 `/<i class=/g` 计数）、`未来 14 天共 <b>2</b> 题待复习`、`另有 1 题排在 14 天以后`
  - 同文件 L686-694：今天 18:00 到期的题计入总数且落在第 0 列、第 0 列带 `today` 类
  - 同文件 L568：`14 天内无排期` 的措辞（且不得写成「未来无排期」）
- **跨 change 协同**：欠账分段边界与 change `memory-surface-readability` 的队列构成计数是同一个概念，必须共用同一套常量，不得各声明一遍（该 change 的 design.md D5）。建议本 change 后做。
- **展示语气联动**：逾期在卡面与脚注上的红色（`--bad`，L5489）与「长期欠账不用告警语气」这条决定同调，两处一起收敛，否则同一件事在两个页面情绪不一致。
- **版本号双写**：`index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE` 必须同步递增。
- **不受影响**：排期数值、PROGRESS 字段、云同步载荷、队列内容与顺序、Android 层。
