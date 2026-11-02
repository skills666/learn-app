# Tasks

## 1. 口径层：可提取性 R

- [x] 1.1 在 d:\learn\learn-app\index.html 的 `effectiveNextOf`（L2307 附近）旁新增 `retrievabilityOf(p, now)`，按 design.md D1 的取值分支实现（有 `fsrs.s>0` 走快路径，否则 `fsrsStateOf` 换算，两者皆无返回 `null`），并在函数注释里写明「elapsed 用真实经过时间、故意不跟 `dayIndexOf` 自然日口径统一」及其原因（design.md D2）；验证：函数能在沙箱里被 `extractFunction` 抽出单独调用且不报 ReferenceError
- [x] 1.2 新增两个**各自单独成行**声明的阈值常量 `R_GOOD_TH = 0.9` 与 `R_WARN_TH = 0.7`（合一行会让 `extractConst` 抽不出来）；验证：`node scripts/smoke-test.js` 能把两个常量都取到，无「提取常量失败」
- [x] 1.3 在 d:\learn\learn-app\scripts\smoke-test.js 补 `retrievabilityOf` 的行为断言：已评分题返回 0~1 的数、只有旧 SM-2 字段的题也能算出（不为 `null`）、`{seen:true}` 这类无状态题返回 `null`、同一题 elapsed 越大 R 越小；验证：新增断言全部通过且 `node scripts/smoke-test.js` 整体绿
- [x] 1.4 用一组真实数值校核显示口径：构造 S=1/3/7/20 的题各一道、逾期 15 天，确认界面百分比与手算 `(1 + 19/81 · elapsed/S) ^ -0.5` 一致（47% / 68% / 82% / 92%）；验证：断言里写死这四个期望值的近似区间，跑通即说明展示没算错

## 2. 队列派生与顺序

- [x] 2.1 在 `buildMemoryQueue`（L4609-4646）的构建期顺带算出欠账构成，挂成与既有 `queue.maxOverdue` 同构的派生量（今天到期 / 欠 1~7 / 8~14 / >14 四段，边界取 `FSRS_MAX_INTERVAL` 的 1 倍与 2 倍）；验证：队列项数与四段之和相等（新题单独计数，不混进欠账段）
- [x] 2.2 把队列项的 R 在构建期存入队列项（与 `level`/`overdue` 并列），排序改为「`isNew` → R 升序 → `overdue` 降序 → `level` → `docOrder`」，且**不改 `overdue` 字段本身的语义**；验证：`node scripts/smoke-test.js` 中原有的「昨天 23:00 到期 → 欠 1 天」口径断言仍通过（L682 附近那条），说明旧字段没被动
- [x] 2.3 在 d:\learn\learn-app\scripts\smoke-test.js 补排序行为断言：未评过分的题排在最前、已评题中 R 低者先于 R 高者、R 相同时按 `overdue` 降序、数据不变时重复构建得到相同顺序；验证：四条断言通过
- [x] 2.4 加一条**不变式断言**守住「不设每日上限」这条新契约：同一份数据下 `buildMemoryQueue().length` 恒等于「已到期题数 + 从未排期题数」，与逾期规模无关（把逾期从 1 天推到 60 天，队列长度不变）；验证：该断言通过，且把它临时改成任何裁剪写法时断言必红
- [x] 2.5 确认撤销路径不受排序改动影响：在 smoke-test 里补「评分后撤销仍能定位到被撤销的那道题」；验证：断言通过（对应 L4740-4742 的 `findIndex` 逻辑）

## 3. 记忆模式界面

- [x] 3.1 在记忆卡头部 pmeta（L5144-5149）加 R 显示：展开答案前只显示数字不带语义色，展开后按 `R_GOOD_TH`/`R_WARN_TH` 分档上色，颜色一律走 `--good`/`--warn`/`--bad` 令牌；无状态题显示 `—`；验证：`node scripts/render-smoke.js` 的记忆页渲染通过，且无数据题不出现 0% 或 100%
- [x] 3.2 （本条的三段计数已被 7.2 / 7.5 移除，仅保留中性语气部分）在头部把欠账构成从单一「⚠ 队列最久欠 N 天」改为「最久 + 四段计数」，并在 `maxOverdue > 7` 时把告警色降为中性提示色；验证：渲染冒烟里构造 `maxOverdue = 15` 的样例，输出的该类名为中性类而非 bad 类
- [x] 3.3 （已被 7.6 整体移除，保留记录以免重做）新增独立于 pmeta 的 20 等分分段进度条容器（design.md D7），按 `data-seg` 复用节点、当前所在格高亮，右侧保留精确 `idx/tot`；验证：连续换题 3 次后段条节点未被重建（可用节点同一性检查），窄屏 320px 下不溢出
- [x] 3.4 （已被 7.3 整块移除，保留记录以免重做）实现回归说明态：按 design.md D6 的判定（`maxOverdue > 7` 且标记值 `learnAppReturnBrief_v1` 等于当前全库最大 `lastPracticed`）展示一屏说明 + 开始按钮，展示时写入标记值；验证：连续两次进入记忆模式只说明一次；评一分后再进入可再次说明；说明前后 `queue.length` 完全相同
- [x] 3.5 （随 3.4 一同移除；“不裁剪”本身由 2.4 的不变式断言与 specs 契约守住）验证说明态**不改队列**：在 3.4 的渲染冒烟里加断言——出现说明时队列长度与题目总数一致（全库停练场景），且没有新增任何裁剪分支；验证：断言通过
- [x] 3.6 无障碍补齐：R 与欠账构成需要被读屏读到（参照 `buildLvBarHtml` 里已有的读屏描述做法，L4660），分段进度条给 `role`/`aria` 语义；验证：`node scripts/check-globals.js` 与渲染冒烟通过，并在结构上确认新增节点都带可访问名

## 4. 进度页与导出

- [x] 4.1 在 `buildAnalyticsData` 的 rows（L5195-5227）加 `r` 字段，复用同一次 `fsrsStateOf` 调用的结果，不新增第二次全量遍历；验证：`node scripts/smoke-test.js` 里 rows 相关断言通过，且行数与题数一致
- [ ] 4.2 进度页表格加「可提取性」列（**实现偏差**：进度页实际没有逐题表格，rows 只喂 CSV 与报告；已改为 an-grid 新增「平均可提取性」卡片 + 逐题 R 进 CSV，待用户确认这个替代表达）；验证：`node scripts/render-smoke.js` 的进度页通过，表头与数据列数一致
- [x] 4.3 CSV 与复制报告把 R **追加在现有列之后**（不中间插入，避免打乱既有列序），并在报告文本里与已有的「平均稳定性 S / 平均难度 D」并排；验证：手工比对一次导出表头，确认旧列顺序未变、新列在末尾
- [x] 4.4 在 smoke-test 的 CSV 断言组里补一条：数据行携带 `r` 且仍不携带 `ef`（守住 L554 那条既有断言的意图）；验证：两条同时通过

## 5. 集成与发布门
- [x] 5.1 同步递增版本号：`index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE` 同轮修改；验证：`node sync-www.js` 不因两处不一致拒绝打包
- [x] 5.2 跑全量门禁 `npm run verify`（check-syntax + check-globals + smoke-test + render-smoke）；验证：四条命令全绿
- [x] 5.3 若实现中改写了被静态断言匹配源码文本的写法，同步修 d:\learn\learn-app\scripts\smoke-test.js 里对应的正则断言；验证：`npm run verify` 绿，且不存在"改了源码没改断言"或反之的情况
- [x] 5.4 在浏览器 / 雷电里走查一次「停练回归」场景（已用本地静态服务器 + 真 Chrome 实测：说明出现一次、不重复拦人、说明前后队列恒为 40 题、新题最前且已评题按 R 升序）；雷电未做（归 change3 的 6.4）；验证：观察结果与 specs 的四个场景逐条对得上，尤其「说明不减少队列」

## 7. 修订：移除回归说明屏、欠账三段与总览等式（用户实测后决定，理由见 design.md D9）

- [x] 7.1 从 `buildMemoryQueue` 删掉 `seg` 的构建期遍历与 `queue.seg` 挂载（两个消费者已都没了，不留死代码）；保留 `maxOverdue` 与队列项的 `r`；验证：`node scripts/smoke-test.js` 里不再有任何读 `seg` 的断言，且「队列长度不随逾期规模变化」那条不变式仍通过
- [x] 7.2 删掉分段进度条右侧的欠账构成文字（`memSegText` / `.mp-txt` 及其 CSS），段条只保留 20 格进度；验证：渲染冒烟的记忆页输出不含「欠 1~7 天」，且 `data-seg` 仍为 20 个节点、`sameNode` 复用断言仍通过
- [x] 7.3 删掉回归说明屏：`buildMemBriefHtml` / `memBriefRef` / `memReturnBriefNeeded` / `renderMemory` 里的说明分支 / `learnAppBrief_v1` 标记键全部移除；验证：`check-globals` 不报未定义引用；长期未练数据下进入记忆模式直接看到答题卡；卡片头部「🕒 队列最久欠 N 天」的中性语气保留（对应 specs「不插入打断式说明屏」与「长期欠账不使用告警语气」两条场景）
- [x] 7.4 删掉总览卡上的等式行 `.ov-eq`（保留「到期 / 未学」两个同权重数字）；验证：宽屏下五张卡行高与改动前一致（保留率卡不再被顶高），且「等式右边等于队列条数」那条跳页断言改为直接比较 `ov-pair` 两数之和与 `buildMemoryQueue().length`
- [x] 7.5 同步清理已取消特性的冒烟/渲染断言与 specs 描述（`memory-scheduling` 的 delta 已把「回归说明只解释、不裁剪」换成「长期欠账不使用告警语气」）；验证：`npm run verify` 全绿且 `openspec validate --strict` 无告警

- [x] 7.6 整体移除 20 格分段进度条（用户实测：与等级分布条形状相同、语义不同，被当成残留）：删 `MEM_PROG_SEGS` / `memProgIdx` / `buildMemProgHtml` / `paintMemProg` / `.mem-prog` 及其 CSS / 骨架里的 `#memProg` 容器 / `paintMemoryCard` 里的调用；验证：`npm run verify` 全绿；源码 grep `mem-prog|MEM_PROG_SEGS|buildMemProgHtml|memProgIdx|paintMemProg` 为 0 命中；浏览器实测记忆页顶部只剩等级分布那一条横带，`11/40` 与 R 读数仍在

## Workflow follow-up

- 实现完成并通过评审后归档本 change，把四条新 Requirement 合进 d:\learn\learn-app\openspec\specs\memory-scheduling\spec.md。
- 归档前确认 `openspec validate --strict` 无告警（Requirement 描述 500 字上限）。
- d:\learn\learn-app\openspec\project.md 有两处过期内容（写成 `FSRS_MAX_INTERVAL` 14 天、以及一个非本工作区的绝对路径），修正需用户单独批准，不在本 change 范围内。
- 第二梯队与滑动评分（H1）不进本 change，另开。
