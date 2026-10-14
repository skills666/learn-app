# 万法归元（learn-app）

本地 · 离线 · 私有 · FSRS 间隔重复闪卡记忆。前端是**单文件** `index.html`（零运行时依赖，可直接双击打开），
外层用 Capacitor 打包 Android。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | **唯一源文件**：应用全部 HTML / CSS / JS |
| `sw.js` | Service Worker（离线缓存，仅网页/PWA 生效；App 内会主动跳过并注销，见下）。`CACHE` 版本号必须与 `index.html` 的 `SW_VERSION` 一致 |
| `manifest.json` / `icon-*.png` | PWA 清单与图标（192 / 512 / maskable 512，均为 256 色调色板 PNG，比原图小约 60%） |
| `sync-www.js` | 把根目录资源同步到 `www/`（Capacitor 的 webDir），校验两处版本号 + 三份资源清单一致性；`--pwa` 时额外同步 PWA 专属资源 |
| `scripts/` | 语法检查、引用检查、冒烟测试、图标流水线、Android 构建入口 |
| `www/` | 构建产物（已 gitignore）：唯一源在根目录。默认只放 APK 需要的 4 个文件 |
| `android/` | Capacitor Android 工程；`assets/public` 与 `res/xml/config.xml` 是 `cap sync` 的产物，不要手改 |
| `android/version.properties` | APK 的 `versionCode` / `versionName`（手写常量，发版时递增；不再由构建时间派生） |
| `generated-images/` | 图标流水线的源图与中间产物（已 gitignore，克隆后需自备） |

## 常用命令

```bash
npm run check                     # 语法检查 + 引用/危险模式门禁（提交前必跑）
npm test                          # 冒烟测试：函数级行为验证 + 渲染冒烟（最小 DOM stub 上真跑主脚本、逐页渲染）
npm run verify                    # check + test
npm run cap:sync                  # 根目录 → www/ → android/app/src/main/assets/public
npm run build:android             # 同步 + 打包 debug APK
node scripts/build-android.js     # 只跑 Gradle（可透传任务名，如 assembleRelease）
node scripts/build-android.js --print-java   # 只打印探测到的 JDK 21 路径，不启动 Gradle
node sync-www.js --pwa            # 把 www/ 当 PWA 站点部署时同步全部资源（含 sw.js 与 512 图标）
```

资源清单有三份（`sw.js` 的 `PRE_CACHE`、`manifest.json` 的 `icons`、`sync-www.js` 的 `FILES_*`），
`node sync-www.js` 会交叉校验它们：新增/改名资源时漏改任何一处都会在打包前直接报错退出。

**改完 `index.html` 必须递增两处版本号**：`index.html` 的 `SW_VERSION` 与 `sw.js` 的 `CACHE`（`learn-vNN`）。
否则已安装用户会一直用旧缓存；`npm run cap:sync` 会在打包前校验两处是否一致（但发现不了"内容改了版本没改"）。

## 构建前置

- Node ≥ 18（`npm ci` 安装依赖）
- JDK 21（Capacitor 7 要求）。**不用手工配置路径**：`scripts/build-android.js` 按
  `LEARN_APP_JAVA_HOME` → `JAVA_HOME` → 常见安装路径（`D:/Java/jdk-21*`、`C:/Program Files/Eclipse Adoptium/jdk-21*`、`/usr/lib/jvm/*21*` …）
  依次探测，并用 `-Dorg.gradle.java.home` 传给 Gradle；找不到会打印候选清单与三种解决办法后退出 1。
  用 Android Studio 构建时不需要它（IDE 用自己的 JDK）。
- Android SDK（`npm run cap:open` 用 Android Studio，或 `npm run build:android` 走命令行）
- 发布包：把签名信息写进 `android/keystore.properties`（已 gitignore，模板见 `android/app/build.gradle` 顶部注释），
  `assembleRelease` 就会用它签名；文件缺失时回退 debug 签名并打警告（未签名的 APK 其实装不上）

## 图标流水线（可选，仅换图标时用）

```bash
python scripts/icon-build.py --src generated-images/selected/source-demoness-05-desktop.png
```

依赖 `pillow` / `numpy` / `opencv-python`（见 `scripts/requirements.txt`，需先 `pip install -r`）。流水线会同时产出
PWA 图标与 Android 的 `mipmap` + 启动图，并打印 `ic_launcher_background.xml` 需要的背景色。

PWA 的 512 / 192 图标另外做过一次 256 色调色板量化（256 色 + Floyd-Steinberg 抖动，肉眼无差别：
两个 512 图标合计 674KB → 269KB）。改图标后若要重新压一次：

```bash
python -c "from PIL import Image; im=Image.open('icon-512.png'); im.quantize(colors=256, dither=Image.FLOYDSTEINBERG).save('icon-512.png', optimize=True)"
```

## App 原生能力（Capacitor）

App 端只装了三个官方插件（`@capacitor/app`、`@capacitor/filesystem`、`@capacitor/share`）
与一个社区插件 `@capacitor-community/safe-area`（系统栏沉浸，见下），
其余能力仍由 Web 层承担，页面里用 `isNativeApp()`（优先 `Capacitor.isNativePlatform()`，
兜底 `https://localhost` —— 即 `androidScheme:https` 下 App 内 WebView 的源）分流：

| 能力 | 网页端 | App 端 |
| --- | --- | --- |
| 导出（CSV / Markdown） | Blob + `a[download]` | 写进应用缓存目录 + 系统分享面板（Android WebView 不支持 `a[download]`，直接点会毫无反应） |
| 返回键 | —（Esc 关弹窗） | 分层回退：确认框 → 弹窗/主题气泡/热力图日详情 → 子页面自己的返回按钮 → 一级页「再按一次退出」 |
| 软键盘 | 浏览器自己把布局视口压矮，输入框自动可见 | `adjustResize`（Android 14 及以下系统缩窗）+ safe-area 插件让出键盘高度（Android 15 起系统不再缩窗）+ Web 层 `visualViewport` 写的 `--kb` 兜底：三种机制各自兜住一段，不重复让位 |
| 屏幕常亮 | 同左（浏览器支持 Screen Wake Lock 时生效） | 记忆 / 趁热 / 模考 / 拷打**进行中**按住屏幕，切页或结束即释放（浏览器原生 API，不装插件） |
| Service Worker | 注册（离线可用 + 有更新时提示刷新） | 不注册，并注销老版本残留的注册（资源随 APK 打包，SW 只会多一层缓存旧资源的风险） |

Android 侧还有几条与 Web 无关、但桌面端很容易忽略的设置：

- **沉浸式系统栏**（真 edge-to-edge）：`MainActivity` 里 `EdgeToEdge.enable(this, SystemBarStyle.dark(...))`，
  `capacitor.config.json` 里 `android.adjustMarginsForEdgeToEdge: "disable"` —— WebView 铺满整屏
  （含状态栏/导航栏区域），系统栏不再是"外部黑边"：边上的颜色就是页面自己画出来的背景，
  滚动内容从它下面滑过。初始图标定死浅色（启动图/首帧前是深色底），运行期由 Web 侧按应用主题接管。
- **`@capacitor-community/safe-area`**：Android WebView 的 `env(safe-area-inset-*)` 在 Chromium < 140 上
  恒为 0（已知 bug），插件按 WebView 版本分流 —— 新内核走原生 `env()`（真沉浸），老内核自动加 padding 兜底；
  系统栏图标明暗也由它提供（`SafeArea.setSystemBarsStyle`，见 `applyTheme`）。
- `backgroundColor` —— 首帧之前 WebView 的底色，深色应用上用来消掉白闪。

## 已知取舍

- **APK 里不放 PWA 专属资源**（`sw.js`、`icon-512.png`、`icon-maskable-512.png`）：App 内不注册 Service Worker
  （见下表最后一行），WebView 也不请求 favicon / 清单图标，打包进去只是白增约 269KB 包体。
  `www/` 默认只同步 APK 需要的 4 个文件；要把 `www/` 当 PWA 站点部署时用 `node sync-www.js --pwa`。
- **版本号手写**（`android/version.properties`）：由构建时间派生会出现"同一小时同号、时钟回拨变小、
  每次构建 versionName 都不同"，代价是发版时必须记得递增。
- **空 `catch` 分级**：清理类（`URL.revokeObjectURL` / `bmp.close` / `focus`）、探测类（能力检测、编码回退链）
  保持空 catch；启动、持久化、网络、渲染副作用这几类一律走 `warnSilent` 留痕 ——
  静默失败最难查，而"什么都记"会把控制台淹掉。
- **宽屏（≥1024px）只做"读得舒服"这一层**：此前宽屏没有任何正向排版规则（全项目唯一的 \`min-width\`
  是给 \`.qmodal\` 加宽的那条 769px），桌面端于是把移动端布局等比拉宽到 \`--rail\`(1200px)，
  14px 中文一行 80+ 字。现按视图收口：题目浏览页与搜索结果的阅读区限宽居中（820px ≈ 40~50 汉字）、
  搜索结果宽屏改双列、设置弹窗与 \`.qmodal\` 同档加宽到 760px；另补两条桌面键盘通道
  （\`Ctrl/⌘+K\` 与 \`/\` 聚焦搜索、\`PageUp/PageDown/Home/End\` 显式滚动 \`.content\` —— 根元素是
  \`overflow:hidden\`，浏览器默认翻页键落在不滚动的根上，此前等于无效）。全部关在 ≥1024px 断点内，
  移动端与平板零影响。**不做宽屏侧栏导航**：顶部标签栏在 1200px 版心下仍有富余，改侧栏等于重写
  整套导航与入场动画，收益不抵风险（真要做得对照 Apple HIG 的"标签栏 → 侧栏"自适应，另起一轮）。
  同类作品里 Anki 桌面版的复习屏同为「空格显示答案 + 数字 1-4 评分」，那套本项目已经一致，
  它多出来的是全局单键导航，同样属于另一轮。
- **顶栏 769px 以上恒定单行**：`.tabs` 一直是写好了横向滚动的（`overflow-x:auto` + 隐藏滚动条 +
  `-webkit-overflow-scrolling:touch`），但 flex 项的 `min-width` 默认 `auto` —— 内容多宽就不肯再窄一寸，
  那段滚动因而从未生效，顶栏只能在总宽约 870px 处整体折成两行。放开这个下限即修复（只加在桌面断点里，
  移动端折行是既定行为）。总览页在宽屏同时改两列：薪资卡与统计卡并排，趋势图仍占整行。
- **备份导入会说明版本对不上**：导出载荷自 v5 起带 `version`。导入**不按版本号分叉合并逻辑**（每个 `merge`
  都已自适应缺失字段，分叉只会多一张要维护的映射表），但会告诉用户两种原本静默的情况：
  没有 `version` 的旧备份（当年没带 `revlog` / `warlog`）、以及比本机更新的备份（部分数据本机不认识）。
  以前用户只会看到「导入完成」，然后发现保留率与战报一直是空的。

- App 内的导出走系统分享（Filesystem + Share），不再依赖浏览器的下载行为。
- 窗口底色恒为 `#0D0E17`（启动图 → 空窗 → 页面首帧同色，不闪）；启动期状态栏图标恒为浅色，
  运行期由 `applyTheme` 按"应用主题"（而非系统深浅）切图标明暗 —— 浅色主题下状态栏就是页面自己的白底。
- 换肤一律用全平台的圆形扩散（View Transitions），**不做按机型的降级**：能力/偏好上的真实回退只有两种 ——
  内核不支持 VT、用户开了减动效。
- 圆形扩散的"新快照"是在**下一帧绘制之后**取景的，所以新主题必须在 commit 里就绪，晚一帧就会拍到旧内容：
  `applyTheme` 因此**同步**切画布、同步画一帧（`startUnifiedCanvas` → `paintUnifiedFrame`），扩散期间不淡入
  （淡入会让铺开的那一片偏暗），趋势图也同步重画（它绘制时从 CSS 变量读色）。
  反过来，扩散期间**看不见的**逐帧工作全部停掉：背景渐变过渡、`body::before/::after` 的主题动效、
  粒子画布的帧循环（`holdThemeCanvas`，只停循环、不动主题），扩散结束再恢复。
  踩过的坑：把画布切换也一起推迟到扩散结束 → 快照里是旧特效，表现为"铺开的是新配色 + 旧特效，扩散完主题才动起来"。
- **主题集按"机制是否独一份"取舍，不按配色分族**：现役 11 套 + 自定义背景图，每套一个独立机制 ——
  斜光 丁达尔光束 │ 粒子 星链成网 │ 松星 两色星点 │ 星河 螺旋星流（以上四套：Canvas 2D 引擎）│
  绢 斜纹织物 + 各向异性高光（浅底）│ 垂帘 极光帘幕（竖向射线 + 发射谱色）│ 雨窗 雨滴物理（重力/铺展/拖尾/折射）│
  云海 FBM 云 + 透视压缩（浅底）│ 年轮 扭曲空间年轮 + 纤维 + 导管 │ 霜原 冰晶自边缘生长 + 冰面反光 │
  默片 3D 噪声颗粒 + gate weave + 划痕/灰尘。
- **两条渲染路径**（2026-10 起）：粒子型主题走 Canvas 2D 引擎（`drawX` + 粒子播种），
  物理型主题（绢 / 垂帘 / 雨窗 / 云海 / 年轮 / 霜原 / 默片）走 **WebGL2 图层**
  （`GL_SHADER_OF` 登记 key→着色器名 + 一段片元着色器 + `THEME_SPEC` 里的 `scene`）。
  为什么要分：Canvas 2D 没有逐片元能力，"背景折射 / 体积云 / 各向异性高光 / 冰晶生长"这类效果
  只能靠逐帧拼几何去糊，糊出来就是一层贴纸感 —— 雨滴是一串等亮圆点、绢是棋盘格、云海是渐变条带，这几个都是真踩过的形态。
  GPU 那条有三条硬约束：**无 WebGL2 / 着色器编译失败 / 上下文丢失一律落到 2D 静态兜底**
  （用同一个 `scene` 画的静止背景，保证"降级后不是一块空白画布"，门禁里有断言守着）；
  后备缓冲按像素预算封顶、并按**实际帧间隔**自适应降档（片元着色器是填充率敏感）；
  生命周期与 2D 完全共用（同一套 rAF / 后台暂停 / 减动效 / resize 入口，不新增定时器与监听）。
  还踩过一次：GPU 图层是**不透明**的，对它做"从 0 淡入"等于每次切过去先闪一帧纯黑 —— 所以它不做淡入。
  命名一律用"画面里能看到的现象"，不再用配色出处（原来的"北欧""复古"都是在说出处）。
  一轮真实踩过的坑：曾按"配色是否同族"把 11 套砍到 5 套，把全站**唯一**的纯 CSS 复合特效（垂帘）、
  唯一的位移场（雨窗）、唯一的风景构图（云海）一起删了 —— 而真正算得上"同族换色"的只有 3 套。
  判断留删要看机制的重合度，颜色只是外观。被删的 5 个 id 全部登记在 `THEME_ALIAS` 里就近映射
  （不登记会让老存档的偏好解析失败、退回"跟随系统深浅"）。
  两处与主题绑定的"手感"表要一起维护：`SWATCH_SIG`（缩略图的签名元素，配 `.sig-*` 样式）与
  `BURST_STYLE`（评分那一爆的形态，五种运动学：dot / ray / spiral / bloom / ring）——
  加主题时只改 `THEME_SPEC` 是不够的，门禁里有一条专门对这两张表逐个对账的断言。
- 主题的 CSS 背景动效**不要叠 `filter:blur()`**（这条真踩过，那层全屏模糊已去掉）：
  动 `background-position` 的话浏览器没法把它交给合成器，只能每帧在工作线程重绘整屏，再叠一层全屏高斯模糊
  等于每帧重做一次整屏模糊 —— 那是全应用唯一一处"常驻的每帧整屏重光栅化"。
  现在的动效都在合成器上（星雾走 opacity、流星走 transform）；要更强质感应改成 transform 位移，而不是加回 blur。
- 画布与特效参数**全平台一致**（dpr 上限 2、逐帧绘制）。曾按窄屏做过"降到 1.5 倍 + 30fps 限帧"的省电降级，
  已回退：限帧会让背景与前景的动画节奏不一致（看起来像掉帧），省电收益也没有实测数据支撑。
  要省电应该做成用户可选的设置项（明示代价），而不是默认降级。
- 内联脚本需要 CSP 的 `'unsafe-inline'`；作为补偿，全部 `innerHTML` 注入点都先经 `esc` / Markdown 渲染转义，
  且不存在 `eval` / `document.write`（由 `npm run check` 持续把关）。
- PDF 简历解析按需从 cdnjs 加载 pdf.js，并附 SRI 校验；离线环境下该功能不可用（其余功能全部离线可用）。
- 记忆调度为 FSRS-5（权重与公式对齐 `ts-fsrs` 默认值），排期上限 14 天、目标保留率 0.92 属于产品参数，
  集中在 `index.html` 的 `FSRS_RETENTION` / `FSRS_MAX_INTERVAL` / `MASTERED_MIN_DAYS` 三处声明。
