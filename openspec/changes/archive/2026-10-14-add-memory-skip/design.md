# 设计：记忆模式跳过（add-memory-skip）

## 方案概述

把跳过的核心状态变更抽成独立函数 `skipMemoryQuestion()`（便于 smoke-test 直接提取并断言零副作用），事件按钮与键盘快捷键各自调用它 + 触发渲染。

## 插入点

### 1. 新函数 `skipMemoryQuestion()`

位置：`index.html` 约 L5015（紧跟在 `undoMemoryGrade()` 之后），语义上与撤销平级。

```js
// 跳过当前题目：纯游标推进，不写进度、不进撤销栈、不动队列数组
function skipMemoryQuestion(){
  if(!memory.queue || !memory.queue.length) return;
  memory.index++;
  memory.flipped = false;
}
```

### 2. 骨架模板加按钮

位置：`#memControls` 之后，新起一行 `.mem-skip-row`。始终可见（不受 flipped 控制）。

```html
<div class="mem-skip-row"><button type="button" class="btn sm" id="memSkip">⏭ 跳过</button></div>
```

### 3. 事件绑定

位置：`bindMemoryCard()` 末尾，`#memAICodeBtn` 绑定之前。

```js
w.querySelector('#memSkip').onclick = (e) => {
  e.stopPropagation();
  if(_memGradeBusy) return;
  skipMemoryQuestion();
  memory._justGraded = true;
  renderMemory(c);
};
```

### 4. 键盘快捷键 S

位置：`keydown` 的 `view===Views.MEMORY` 分支（约 L8578-8583）。
沿用现有模式（S → click 按钮），保持委托链路与按钮完全一致。

```js
else if(e.key === 's' || e.key === 'S'){
  const skipBtn = document.querySelector('#memSkip'); if(skipBtn) skipBtn.click();
}
```

### 5. CSS

位置：`.mem-grade-row` 样式区附近（约 L781-788）。低调、不抢评分按钮焦点。

```css
.mem-skip-row{text-align:right;margin-top:6px}
.mem-skip-row .btn{font-size:var(--fs-xs);opacity:.7}
.mem-skip-row .btn:active{opacity:1}
```

## 边界行为

| 场景 | 表现 |
|------|------|
| 跳过最后一题 | index >= length → renderMemory 走空态分支 → 显示"全部掌握" |
| 再进记忆模式 | 30min 内缓存返回同队列 → skipped 题重现；过期后 rebuild → 按到期正常出现 |
| 撤销上一步 | undoMemoryGrade 重建队列 → 跳过题可能回到队首（正常） |
| 切走再切回 | renderMemory 入口：index 仍 >= length → 重建，skipped 题按到期重现 |

## TDD 映射（Superpowers 纪律）

先写 `scripts/smoke-test.js` 断言（`skipMemoryQuestion` 被提取后在沙箱执行），再写实现。
断言项：
1. `PROGRESS[qid]` 不变
2. `memory._history.length` 不变
3. `HOT.length` 不变
4. `memory.index` 前进 1
5. `memory.flipped === false`
6. `memory.queue` 数组引用未变

## 版本号

`index.html` 改动 → 递增 `const SW_VERSION` + `sw.js` 的 `const CACHE`（两处同值）。
