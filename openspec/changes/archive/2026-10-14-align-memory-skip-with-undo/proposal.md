# Proposal

## Why

记忆模式的「跳过」按钮目前单独占一行、且始终可见，视觉上比四个评分按钮还抢眼，显得突兀。它的使用场景是「翻到答案、发现这题不对/不想现在做」——本质和「撤销」是同一层级的辅助操作，应该收进答案展开后才出现的控件行里，和撤销左右对称摆放，降低存在感。

## What Changes

- 「跳过」按钮从独立的 `.mem-skip-row` 移入答案展开后才显示的 `#memControls`（`.pcontrols`）控件行。
- 「跳过」与「撤销」同一行、左右对称：撤销靠左、跳过靠右（中间用现成的 `.spacer` 撑开）。
- 「跳过」的可见性改为与「撤销」一致：**只有展开答案（`memory.flipped`）后才出现**，未展开时不显示。
- 键盘 `S` 快捷键相应改为仅在答案已展开时生效（与按钮可见性对齐，避免触发一个看不见的按钮）。
- 「跳过」的行为语义、零副作用不变量、本轮收尾逻辑**不变**，只改可见性与布局。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `memory-skip`: 「记忆卡跳过操作」需求变更——跳过入口从「始终可见的独立行」改为「答案展开后可见、与撤销同行左右对称」；`S` 键生效条件对齐为「已展开」。零副作用与本轮收尾相关要求不变。

## Impact

- 受影响代码：`index.html`
  - 骨架：删除 `.mem-skip-row` 独立行，`#memSkip` 归入 `#memControls`（L4979-4980）。
  - 绘制：`paintMemoryCard` 里 `#memControls` 的填充同时产出撤销 + 跳过两个按钮；`applyMemFlip`/`paintMemoryCard` 已按 `flipped` 控制 `#memControls` 显隐，跳过随之生效。
  - 事件：`#memSkip` 的点击处理保留，但只在展开态可达。
  - 键盘：`keydown` 记忆分支里 `S` 键加 `memory.flipped` 判定。
  - 样式：移除 `.mem-skip-row` 相关 CSS（L798-800）；`.pcontrols`/`.spacer` 复用现有。
- 受影响测试：`scripts/render-smoke.js` 断言「骨架含 #memSkip」仍成立（#memSkip 改由 paintMemoryCard 填入 #memControls，需相应调整为断言其存在于控件行/展开态）；`scripts/smoke-test.js` 静态断言里对 `#memSkip` 的引用核对。
- 版本号：`index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE` 同步 +1。
- 不涉及数据/存储/同步；不改评分逻辑。
