# memory-skip Specification

## Purpose
定义记忆模式「跳过」的行为契约：在不写任何进度、不动队列数组的前提下推进游标，让手机端遇到「题目有误、暂时不方便改」时能先跳过、留到电脑上再处理，同时保证 FSRS 排期、统计、打卡、云同步不被污染。

## Requirements

### Requirement: 记忆卡跳过操作

「跳过」SHALL 与「撤销」同处记忆卡答案展开后才出现的控件行、左右对称摆放，只在答案已展开时可见可用；在不评分的前提下推进到队列里的下一道题，队列数组与题目进度保持不变。

#### Scenario: 用户点跳过（或按 S 键）

- **WHEN** 记忆卡答案已展开（`memory.flipped` 为 true），当前展示题目 Q
- **AND** 用户点击「跳过」按钮或按 `S` 键
- **THEN** `memory.index` 前进 1（显示下一道题）
- **AND** 卡片翻面态复位（`memory.flipped` 为 false）
- **AND** `PROGRESS[Q.id]` 保持不变（不写评分/间隔/稳定性/等级）
- **AND** `memory._history` 长度不变（跳过不进撤销栈、不可撤销）
- **AND** 趁热打铁队列（HOT）不变（跳过不喂热榜）
- **AND** `memory.queue` 数组内容不变（不 splice / 不 push / 不 rebuild）

#### Scenario: 答案未翻面时也能跳过

- **WHEN** 用户还没点开答案（`memory.flipped` 为 false）
- **THEN** 「跳过」按钮不显示（与「撤销」一样藏在展开后才出现的控件行内）
- **AND** 此时按 `S` 键不产生任何效果（不推进游标、不触发翻面）

#### Scenario: 只靠跳过也能把本轮收尾

- **WHEN** 用户把本轮到期题逐一跳过、`memory.index` 到达队列末尾
- **THEN** 记忆页显示「本轮已刷完 · 仍跳过 N 题」的收尾态，而不是误报「全部掌握」
- **AND** 本轮内被跳过的题不再回到眼前（游标不再绕回第一题死循环）
- **AND** 这些题在下次进入记忆模式、队列重建后按到期正常出现

#### Scenario: 与撤销同行、左右对称

- **WHEN** 答案已展开
- **THEN** 「撤销」（若本轮有可撤销记录）位于控件行左侧，「跳过」位于同一行右侧
- **AND** 当本轮无撤销记录时「撤销」缺席，「跳过」仍在该行右侧可见

### Requirement: 跳过零副作用不变量

跳过 SHALL 与评分动作互不干扰：任何因跳过产生的路径都不得触碰 FSRS 排期、统计、打卡、云同步脏标记。

#### Scenario: 跳过不标记数据为脏

- **WHEN** 用户执行跳过
- **THEN** 不调用 `saveProgress` / `markDirty` / `invalidateMemQueue`
- **AND** 不会因此触发题库或进度的云端上传
