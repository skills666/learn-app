# 项目上下文：万法归元（learn-app）

本文件是 OpenSpec 的全局底稿，供人与 AI 编程助手共同参照。描述项目是什么、受哪些约束、代码怎么组织，不描述某一次的具体改动（那是 `changes/` 的职责）。

## 一句话定位

本地 · 离线 · 私有 · 基于 FSRS 间隔重复的面试闪卡记忆应用。前端是**单文件** `d:\tools\WorkBuddy-workspace\2026-08-02-19-57-34\learn-app\index.html`（零运行时框架依赖，可直接双击打开），外层用 Capacitor 7 打包 Android。

## 技术栈

- 前端：单文件 HTML，内联 CSS + 原生 JavaScript（无框架、无构建期转译）。
- 记忆调度：FSRS-5（权重与公式对齐 `ts-fsrs` 默认值）。产品参数集中在 `index.html` 的 `FSRS_RETENTION`（0.92）/ `FSRS_MAX_INTERVAL`（14 天）/ `MASTERED_MIN_DAYS`（4 天）三处声明。
- 移动壳：Capacitor 7，插件 `@capacitor/app` / `@capacitor/filesystem` / `@capacitor/share` + 社区 `@capacitor-community/safe-area`。
- 存储：全部走 `localStorage`（经 `safeLocalGet` / `safeLocalSet` 包装）；进度、题库、战报、趁热榜各自独立 key。

## 核心约束（改代码前必读）

1. **唯一源在根目录**：`index.html` 是唯一手写源文件；`www/` 是 `sync-www.js` 生成的产物（已 gitignore），`android/app/src/main/assets/public/` 是 `cap sync` 的产物，都不手改。
2. **版本号双写**：改完 `index.html` 必须同步递增两处 —— `index.html` 的 `const SW_VERSION = '…'` 与 `sw.js` 的 `const CACHE = 'learn-v…'`。`sync-www.js` 会校验两处一致，否则拒绝打包。
3. **提交前门禁**：`npm run check`（语法 + 引用/危险模式）；`npm test`（冒烟：`scripts/smoke-test.js` 函数级行为 + `scripts/render-smoke.js` 逐页渲染）；`npm run verify` = 两者。新代码要带上对应断言。
4. **记忆/趁热的零副作用原则**：趁热打铁（hot）与记忆模式（memory）的非评分动作（翻面、跳过）不得写 `PROGRESS`、不进 FSRS 排期、不改统计/打卡、不进撤销栈、不喂趁热榜。
5. **内联脚本 CSP**：允许 `'unsafe-inline'`，但所有 `innerHTML` 注入点必须先经 `esc` / Markdown 渲染转义；禁止 `eval` / `document.write`（门禁持续把关）。

## 目录结构速览

| 路径 | 说明 |
| --- | --- |
| `index.html` | 唯一源：全部 HTML / CSS / JS |
| `sw.js` | Service Worker（仅 PWA 生效，App 内跳过并注销） |
| `sync-www.js` | 根目录 → `www/` 单向同步 + 版本号/资源清单交叉校验 |
| `scripts/` | 语法检查、引用检查、冒烟测试、渲染冒烟、图标流水线、Android 构建入口 |
| `www/` | 构建产物（gitignore） |
| `android/` | Capacitor Android 工程 |
| `openspec/` | 规格驱动文档（本目录，纯 Markdown，不参与打包） |

## 常用命令

```bash
npm run check        # 语法 + 引用/危险模式门禁
npm test             # 冒烟测试（函数级 + 渲染级）
npm run verify       # check + test
npm run cap:sync     # 根目录 → www/ → android assets
npm run build:android  # 同步 + 打包 debug APK
```
