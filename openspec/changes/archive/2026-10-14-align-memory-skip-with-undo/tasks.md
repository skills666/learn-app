# Tasks

## 1. 布局与显隐（跳过并入撤销行）

- [x] 1.1 改 `renderMemory` 骨架：删除独立的 `.mem-skip-row`/`#memSkip`，`#memSkip` 不再常驻骨架（`index.html` L4979-4980）；核对源码不再出现 `.mem-skip-row` 容器。
- [x] 1.2 改 `paintMemoryCard`：`#memControls.innerHTML` 拼成「撤销(有 `_history` 才出) + `<span class="spacer">` + `#memSkip` 跳过」，跳过恒在右（`index.html` 约 L5089-5091）；验证：展开答案后同一行左右出现撤销/跳过，未展开整行隐藏。
- [x] 1.3 移除 `.mem-skip-row` 相关 CSS（L798-800），确认 `.pcontrols`/`.spacer` 已够布局；验证：无遗留死 CSS（`check-globals.js` 未使用类应报 0）。

## 2. 事件与键盘

- [x] 2.1 `#memSkip` 点击改挂到 `#memControls` 容器委托（`e.target.closest('#memSkip')`），与 `#flashUndo` 同处（`bindMemoryCard` 约 L5058）；验证：`paintMemoryCard` 每次重建后跳过仍可点，且仍走 `skipMemoryQuestion()`、零副作用不变。
- [x] 2.2 `keydown` 记忆分支的 `S` 键加 `memory.flipped` 条件（约 L8617）；验证：未展开按 S 无反应，展开后按 S 等于点跳过。

## 3. 测试同步（行为不变，路径变了）

- [x] 3.1 更新 `scripts/smoke-test.js` 静态断言：把「骨架含 `#memSkip`」改为核对 `#memControls` 填充分支产出 `#memSkip`（不再断言独立骨架行）。
- [x] 3.2 更新 `scripts/render-smoke.js`：`#memSkip` 现由 `paintMemoryCard` 在展开态填入，调整记忆页断言使其仍覆盖「跳过存在于控件行」，不出现假失败。

## 4. 集成校验

- [x] 4.1 `index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE` 同步 +1；验证：`node sync-www.js` 版本一致性检查通过。
- [x] 4.2 跑 `npm run verify`（check-syntax + check-globals + smoke + render）全绿；手动在浏览器/真机展开记忆卡确认撤销/跳过同行左右对称、未展开不可见、S 键仅展开生效、跳过仍能收尾本轮。

## Workflow follow-up

- 评审通过后运行 `/opsx:apply`（或让我执行）进入实现；本清单仅规划，未改任何应用代码。
- 实现并满足评审后，用 `openspec archive align-memory-skip-with-undo` 归档，把 delta 并入主 `memory-skip` 规格。
