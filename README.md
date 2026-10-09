# 万法归元（learn-app）

本地 · 离线 · 私有 · FSRS 间隔重复闪卡记忆。前端是**单文件** `index.html`（零运行时依赖，可直接双击打开），
外层用 Capacitor 打包 Android。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | **唯一源文件**：应用全部 HTML / CSS / JS |
| `sw.js` | Service Worker（离线缓存，仅网页/PWA 生效；App 内会主动跳过并注销，见下）。`CACHE` 版本号必须与 `index.html` 的 `SW_VERSION` 一致 |
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

## App 原生能力（Capacitor）

App 端只装了三个官方插件（`@capacitor/app`、`@capacitor/filesystem`、`@capacitor/share`），
其余能力仍由 Web 层承担，页面里用 `isNativeApp()`（优先 `Capacitor.isNativePlatform()`，
兜底 `https://localhost` —— 即 `androidScheme:https` 下 App 内 WebView 的源）分流：

| 能力 | 网页端 | App 端 |
| --- | --- | --- |
| 导出（CSV / Markdown） | Blob + `a[download]` | 写进应用缓存目录 + 系统分享面板（Android WebView 不支持 `a[download]`，直接点会毫无反应） |
| 返回键 | —（Esc 关弹窗） | 分层回退：确认框 → 弹窗/主题气泡 → 子页面自己的返回按钮 → 一级页「再按一次退出」 |
| Service Worker | 注册（离线可用 + 有更新时提示刷新） | 不注册，并注销老版本残留的注册（资源随 APK 打包，SW 只会多一层缓存旧资源的风险） |

Android 侧还有两条与 Web 无关、但桌面端很容易忽略的设置，都在 `capacitor.config.json`：
`android.adjustMarginsForEdgeToEdge: "auto"` —— Android 15 强制 edge-to-edge，交给原生给 WebView 让出系统栏区域，
否则顶栏会被状态栏/挖孔压住（WebView 里 CSS `env(safe-area-inset-*)` 的取值随 WebView 版本变化，不能单独依赖它）；
`backgroundColor` —— 首帧之前 WebView 的底色，深色应用上用来消掉白闪。

## 已知取舍

- App 内的导出走系统分享（Filesystem + Share），不再依赖浏览器的下载行为。
- 原生状态栏图标恒为浅色、窗口底色恒为 `#0D0E17`（启动图 → 空窗 → 页面首帧同色，不闪）；
  若要让状态栏跟随应用内主题，需要再装 `@capacitor/status-bar` 并在 `applyTheme` 里同步样式。
- 换肤一律用全平台的圆形扩散（View Transitions），**不做按机型的降级**：能力/偏好上的真实回退只有两种 ——
  内核不支持 VT、用户开了减动效。
- 圆形扩散的"新快照"是在**下一帧绘制之后**取景的，所以新主题必须在 commit 里就绪，晚一帧就会拍到旧内容：
  `applyTheme` 因此**同步**切画布、同步画一帧（`startUnifiedCanvas` → `paintUnifiedFrame`），扩散期间不淡入
  （淡入会让铺开的那一片偏暗），趋势图也同步重画（它绘制时从 CSS 变量读色）。
  反过来，扩散期间**看不见的**逐帧工作全部停掉：背景渐变过渡、`body::before/::after` 的主题动效、
  粒子画布的帧循环（`holdThemeCanvas`，只停循环、不动主题），扩散结束再恢复。
  踩过的坑：把画布切换也一起推迟到扩散结束 → 快照里是旧特效，表现为"铺开的是新配色 + 旧特效，扩散完主题才动起来"。
- 极光主题（aurora）去掉了原作那层 `filter:blur(10px)`：它的动效动的是 `background-position`，
  浏览器没法把这个属性交给合成器，只能每帧在工作线程重绘整屏；再叠一层全屏高斯模糊，等于每帧重做一次整屏模糊。
  它是全应用唯一一处"常驻的每帧整屏重光栅化"（其余主题的星雾走 opacity、流星走 transform，都在合成器上）。
  条纹边缘本由色标过渡（≈40~60px）负责，观感差异很小；要更强质感应把动效改成 transform 位移，而不是加回 blur。
- 画布与特效参数**全平台一致**（dpr 上限 2、逐帧绘制）。曾按窄屏做过"降到 1.5 倍 + 30fps 限帧"的省电降级，
  已回退：限帧会让背景与前景的动画节奏不一致（看起来像掉帧），省电收益也没有实测数据支撑。
  要省电应该做成用户可选的设置项（明示代价），而不是默认降级。
- 内联脚本需要 CSP 的 `'unsafe-inline'`；作为补偿，全部 `innerHTML` 注入点都先经 `esc` / Markdown 渲染转义，
  且不存在 `eval` / `document.write`（由 `npm run check` 持续把关）。
- PDF 简历解析按需从 cdnjs 加载 pdf.js，并附 SRI 校验；离线环境下该功能不可用（其余功能全部离线可用）。
- 记忆调度为 FSRS-5（权重与公式对齐 `ts-fsrs` 默认值），排期上限 14 天、目标保留率 0.92 属于产品参数，
  集中在 `index.html` 的 `FSRS_RETENTION` / `FSRS_MAX_INTERVAL` / `MASTERED_MIN_DAYS` 三处声明。
