# 规格：记忆模式跳过行为（skip-behavior）

> 说明：下面的 `Requirement:` / `Scenario:` / `SHALL` / `WHEN` / `THEN` 是给 AI 与工具识别的记号（类似表单里固定的字段名），不是要求谁去读的英文。`Requirement` = 一条需求，`Scenario` = 一个可验证的场景，`SHALL/WHEN/THEN` = "必须做到 / 当……时 / 那么……"。正文一律中文。

## ADDED Requirements（新增需求）

### Requirement: 记忆卡跳过操作

记忆卡 SHALL 提供一个「跳过」动作：在不评分的前提下推进到队列里的下一道题，队列数组保持不变，题目进度保持不变。

#### Scenario: 用户点跳过（或按 S 键）

- **WHEN** 记忆卡当前正展示题目 Q
- **AND** 用户点击「跳过」按钮或按 `S` 键
- **THEN** `memory.index` 前进 1（显示下一道题）
- **AND** 卡片翻面态复位（`memory.flipped` 为 false）
- **AND** `PROGRESS[Q.id]` 保持不变（不写评分/间隔/稳定性/等级）
- **AND** `memory._history` 长度不变（跳过不进撤销栈、不可撤销）
- **AND** 趁热打铁队列（HOT）不变（跳过不喂热榜）
- **AND** `memory.queue` 数组内容不变（不 splice / 不 push / 不 rebuild）

#### Scenario: 跳过队列里的最后一道题

- **WHEN** 用户对队列里的最后一道题点跳过
- **THEN** `memory.index` 达到或超过 `memory.queue.length`
- **AND** 记忆页进入完成/空态（复用现有渲染分支，不新增分支）
- **AND** 被跳过的那道题在下次进入记忆模式、队列重建后仍会按到期正常出现

#### Scenario: 答案未翻面时也能跳过

- **WHEN** 用户还没点开答案（`memory.flipped` 为 false）
- **THEN** 「跳过」按钮仍然可见且可点
- **AND** 点击效果与已翻面时一致（纯推进，不触发翻面）

### Requirement: 跳过零副作用不变量

跳过 SHALL 与评分动作互不干扰：任何因跳过产生的路径都不得触碰 FSRS 排期、统计、打卡、云同步脏标记。

#### Scenario: 跳过不标记数据为脏

- **WHEN** 用户执行跳过
- **THEN** 不调用 `saveProgress` / `markDirty` / `invalidateMemQueue`
- **AND** 不会因此触发题库或进度的云端上传
