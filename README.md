# 万法归元（learn-app）

本地 · 离线 · 私有 · FSRS 间隔重复闪卡记忆。前端是**单文件** `index.html`（零运行时依赖，可直接双击打开），
外层用 Capacitor 打包 Android。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | **唯一源文件**：应用全部 HTML / CSS / JS |
| `sw.js` | Service Worker（离线缓存）。`CACHE` 版本号必须与 `index.html` 的 `SW_VERSION` 一致 |
| `manifest.json` / `icon-*.png` | PWA 清单与图标（192 / 512 / maskable 512） |
| `sync-www.js` | 把根目录资源同步到 `www/`（Capacitor 的 webDir），并校验两处版本号 |
| `scripts/` | 语法检查、引用检查、冒烟测试、图标流水线、Android 构建入口 |
| `www/` | 构建产物（已 gitignore）：唯一源在根目录 |
| `android/` | Capacitor Android 工程；`assets/public` 与 `res/xml/config.xml` 是 `cap sync` 的产物，不要手改 |
| `generated-images/` | 图标流水线的源图与中间产物（已 gitignore，克隆后需自备） |

## 常用命令

```bash
npm run check                     # 语法检查 + 引用/危险模式门禁（提交前必跑）
npm test                          # 冒烟测试：函数级行为验证 + 渲染冒烟（最小 DOM stub 上真跑主脚本、逐页渲染）
npm run verify                    # check + test
npm run cap:sync                  # 根目录 → www/ → android/app/src/main/assets/public
npm run build:android             # 同步 + 打包 debug APK
node scripts/build-android.js     # 只跑 Gradle（可透传任务名，如 assembleRelease）
```

**改完 `index.html` 必须递增两处版本号**：`index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE`（`learn-vNN`）。
否则已安装用户会一直用旧缓存；`npm run cap:sync` 会在打包前校验两处是否一致（但发现不了"内容改了版本没改"）。

## 构建前置

- Node ≥ 18（`npm ci` 安装依赖）
- JDK 21（Capacitor 7 要求；本机路径由 `android/gradle.properties` 的 `org.gradle.java.home` 指定）
- Android SDK（`npm run cap:open` 用 Android Studio，或 `npm run build:android` 走命令行）

## 图标流水线（可选，仅换图标时用）

```bash
python scripts/icon-build.py --src generated-images/selected/source-demoness-05-desktop.png
```

依赖 `pillow` / `numpy` / `opencv-python`（未随仓库声明，需自行安装）。流水线会同时产出
PWA 图标与 Android 的 `mipmap` + 启动图，并打印 `ic_launcher_background.xml` 需要的背景色。

## 已知取舍

- 内联脚本需要 CSP 的 `'unsafe-inline'`；作为补偿，全部 `innerHTML` 注入点都先经 `esc` / Markdown 渲染转义，
  且不存在 `eval` / `document.write`（由 `npm run check` 持续把关）。
- PDF 简历解析按需从 cdnjs 加载 pdf.js，并附 SRI 校验；离线环境下该功能不可用（其余功能全部离线可用）。
- 记忆调度为 FSRS-5（权重与公式对齐 `ts-fsrs` 默认值），排期上限 14 天、目标保留率 0.92 属于产品参数，
  集中在 `index.html` 的 `FSRS_RETENTION` / `FSRS_MAX_INTERVAL` / `MASTERED_MIN_DAYS` 三处声明。
