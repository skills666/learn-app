# Tasks

## 1. 调参 + 存量重排

- [x] 1.1 把 `FSRS_MAX_INTERVAL` 由 `14` 改为 `7`（`index.html` L2206）；验证：读该行值为 7，且 `fsrsIntervalDays` 的 clamp 上界随之变 7。
- [x] 1.2 加一次性重排标记，让新上限对存量生效：仿 `learnAppStripMd_v2` 的做法，在 init 里若未见 `learnAppCap7_v1` 标记，则调用 `rescheduleAllProgress()` 落库并写标记（`index.html`，紧邻 `_paceStale` 那段之后）；验证：升级后原来排到 >7 天的题下次到期回到 ≤7 天，且 stable/difficulty 不被改动。

## 2. 测试同步

- [x] 2.1 更新 `scripts/smoke-test.js` 里断言固定参数的那条：`FSRS_MAX_INTERVAL = 14` → `= 7`；验证：`node scripts/smoke-test.js` 该断言通过。
- [x] 2.2 在 `scripts/smoke-test.js` 补一条行为断言：对高稳定度题 `fsrsStep(...,GOOD/EASY)` 返回的 `interval ≤ 7`（可复用 `api.applySm2Grade`/`fsrsStep` 沙箱，或断言 `FSRS_MAX_INTERVAL=7` 且 `fsrsIntervalDays` 末位 clamp 用该常量）；验证：该断言由绿转红能捕获回归。

## 3. 收尾

- [x] 3.1 `index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE` 同步 +1；验证：`node sync-www.js` 版本一致性通过。
- [x] 3.2 跑 `npm run verify`（check-syntax + check-globals + smoke + render）全绿；真机/浏览器抽查：记忆模式评 GOOD/EASY 的按钮「N 天后」最大不超过 7。

## Workflow follow-up

- 评审通过后运行 `/opsx:apply`（或让我执行）进入实现；本清单仅规划，未改应用代码。
- 实现并 `npm run verify` 通过后，`openspec archive tighten-review-interval-cap` 归档，把 `memory-scheduling` 能力并入主规格。
