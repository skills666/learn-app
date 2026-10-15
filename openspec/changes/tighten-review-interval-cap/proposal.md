# Proposal

## Why

用户长期处于「面试随时可能发生」的状态，需要任何一道题都不会太久不出现。当前 `FSRS_MAX_INTERVAL = 14`（`index.html` L2206）把熟练题的最长间隔放到 14 天，面试抽到时可能已经凉了。把上限收紧到 7 天，让「最大陈旧度」= 一周一循环，贴合随时面试。

## What Changes

- `FSRS_MAX_INTERVAL`：`14` → `7`（天）。只压「天花板」，低/中段间隔不变，四档评分→间隔的映射算法不动。
- 一次性重排存量：把已经按旧上限排到 >7 天的题，按新上限重新排期（复用已有的 `rescheduleAllProgress`），否则老数据仍停在原来的 14 天，新 cap 只对之后的评分生效。
- 明确不改：`FSRS_RETENTION`(0.92)、`MASTERED_MIN_DAYS`(4)、`FSRS_AGAIN_INTERVAL`(0.5) 全部保持；记忆/趁热等**模式与交互一律不动**（本次只调间隔）。

## Capabilities

### New Capabilities
- `memory-scheduling`: 记忆模式的复习排期规则——四档评分如何映射为下次间隔、以及全局目标保留率与「任何题最长间隔（陈旧度上限）」等固定参数约束。本次先把「最长间隔 = 7 天」钉为契约。

### Modified Capabilities
（无）

## Impact

- `index.html`：常量 `FSRS_MAX_INTERVAL`（L2206）。
- `index.html`：启动迁移——在 `_paceStale` 同类的「按现行参数重排」路径上，让新 cap 对存量生效（若不改参数触发条件，则需一个一次性重排标记，仿 `learnAppStripMd_v2` 的做法）。
- 测试：`scripts/smoke-test.js` 现有断言含 `FSRS_MAX_INTERVAL = 14`（如固定参数那条），需同步为 7；补一条「熟练题排期不超过 7 天」的行为断言。
- 版本号：`index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE` 同步 +1。
- 不影响：数据存储结构、云同步、评分链路、其它模式。
