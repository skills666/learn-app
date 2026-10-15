# Design

## Context

当前记忆卡骨架（`renderMemory`）在评分行下面挂着两块：`#memControls`（`.pcontrols`，撤销按钮所在的行，仅 `memory.flipped` 时显示）和一个**独立的** `.mem-skip-row`（`#memSkip`，始终可见）。`#memControls` 的内容由 `paintMemoryCard` 每次重建：有撤销记录时填 `#flashUndo`，并按 `flipped` 切显隐；`applyMemFlip` 同步切 `#memControls` 的显隐。见 proposal.md - Why 与 Impact。

## Goals / Non-Goals

**Goals:**
- 「跳过」并入 `#memControls`，与「撤销」同行、左右对称，且随 `flipped` 一起显隐。
- `S` 键生效条件与按钮可见性对齐（仅展开后可用）。
- 复用现有 `.pcontrols`/`.spacer`，不新增布局容器。

**Non-Goals:**
- 不改跳过的行为语义、零副作用不变量、本轮收尾逻辑（见 specs `memory-skip`）。
- 不改撤销、评分的既有行为。

## Decisions

1. **左右用 `.spacer` 撑开**：`paintMemoryCard` 把 `#memControls.innerHTML` 拼成「撤销(有记录才出) + `<span class=spacer>` + 跳过」，`#memSkip` 常驻该行 → 撤销居左、跳过居右；无撤销记录时 spacer 仍把跳过顶到右侧。
   - 备选：给 `.pcontrols` 用 `justify-content:space-between`——但撤销缺席时会把跳过挤到左侧，不满足「跳过恒在右」，故弃。
2. **`#memSkip` 从骨架 `renderMemory` 移除、改由 `paintMemoryCard` 产出**：与 `#flashUndo` 同一重建路径，避免骨架里留一个需要手动同步显隐的孤立节点。点击仍走 `bindMemoryCard` 里对 `#memSkip` 的委托/绑定（每次重建后需保证可点——沿用现有对 `#memControls` 的容器级委托更稳）。
   - 决策：`#memSkip` 点击改为挂在 `#memControls` 容器上委托（与 `#memControls` 已委托 `#flashUndo` 同一处），避免按钮被 `paintMemoryCard` 重建后丢绑定。
3. **`S` 键**：`keydown` 记忆分支 `else if(e.key==='s'...)` 前加 `&& memory.flipped` 条件；未展开时按 S 不触发（按钮本就不可见）。
4. **动画/显隐**：跳过随 `#memControls` 的 `flipped` 显隐自动生效，无需单独控制；移除 `.mem-skip-row` 的 CSS（L798-800）。

## Risks / Trade-offs

- [重建后 `#memSkip` 绑定丢失] → 用 `#memControls` 容器级事件委托（`e.target.closest('#memSkip')`），与撤销同处理，规避逐按钮重绑。
- [render-smoke 断言 `id="memSkip"` 现基于骨架] → 同步改为断言「`paintMemoryCard` 在展开态产出的 `#memControls` 含 `#memSkip`」或至少源码存在该产出分支；避免断言与实际渲染路径脱节。
- [触控目标] 跳过/撤销同排，窄屏 `flex-wrap` 时堆叠可接受（`.pcontrols` 已 `flex-wrap:wrap`）。

## Migration Plan

纯前端小改，无数据迁移。回滚 = 还原 `index.html` 与 `sw.js` 版本号。
