// ⚠️ 版本号变更时必须与 index.html 里的 SW_VERSION 同步递增（两处数字必须完全一致，sync-www.js 会在打包前校验）
// 图标等预缓存资源变更时同样要递增，否则老用户会一直用缓存里的旧图标。
// 注意：这里不要写死"当前是几" —— 曾经写过"当前 '62'"，而实际早已是 64，注释本身就是错的。
const CACHE = 'learn-v75';

// 预缓存静态资源，确保离线可用。
// 注意：1024 的 icon.png 已删除——它只在 <link rel="icon"> 里被用到，浏览器每次首屏都会下 796KB，
// 而 App 图标由 android 的 mipmap 提供、PWA 图标有 192/512/maskable 就够了。
const PRE_CACHE = ['index.html', 'manifest.json', 'img-bg-dark.jpg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    // 逐个抓取并容错：单个资源 404 只跳过它自己，不让原子失败拖垮整个离线首开。
    // 用 {cache:'reload'} 绕开 HTTP 缓存：否则重装 SW 时可能把浏览器缓存里的旧 index.html / 旧图标存进新缓存
    caches.open(CACHE).then(c => Promise.all(
      PRE_CACHE.map(u => fetch(u, { cache: 'reload' }).then(resp => {
        if (resp.ok) return c.put(u, resp);
        console.warn('[SW] 预缓存响应异常，已跳过:', u, resp.status);
      }).catch(err => console.warn('[SW] 预缓存资源失败:', u, err)))
    ))
  );
  // 只有"首次安装"（还没有 active 的 SW）才直接接管：此时不存在旧版本竞争，新用户也能立刻离线可用。
  // 更新场景（已有 active）保持 waiting：由页面弹「有新版本可用，是否立即刷新」决定何时切换；
  // 否则新 SW 会绕过后台提示悄悄接管，页面里那套更新提示就成了永远看不到的死代码。
  // 注：index.html 的 SW_VERSION 机制在"版本递增"时会主动注销并重装 SW，那条路径不受影响。
  if(!self.registration.active) self.skipWaiting();
});

// 策略：
// - 同源静态资源：Network First（先网络，失败回退缓存），仅缓存 GET 请求
// - 第三方 API 请求：Network Only，不缓存（避免缓存敏感数据或过期响应）
self.addEventListener('fetch', e => {
  // only-if-cached 请求不能走 fetch()（会抛错），直接放行交给浏览器自己处理（SW cookbook 的标准短路）
  if (e.request.cache === 'only-if-cached' && e.request.mode !== 'no-store') return;
  const url = new URL(e.request.url);

  // 第三方请求（Gitee API、AI API 等）：仅走网络，不缓存
  if (url.origin !== location.origin) {
    // 离线时用 Response.error() 明确表达"网络错误"：对 no-cors 请求（如 CDN 脚本）
    // 返回自造的 503 响应在规范上属边缘情况，各内核表现并不一致
    e.respondWith(fetch(e.request).catch(() => Response.error()));
    return;
  }

  // 页面导航请求：强制走网络（绕过 HTTP 缓存），确保版本升级/修复能立即生效；离线时回退缓存的 index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then(async resp => {
        // 缓存写入放在 respondWith 链内完成：waitUntil 在事件派发结束后再调用会失败，导致离线缓存一直不更新
        // 只缓存成功响应：404/5xx 错误页不能当作 index.html 存入缓存，否则离线时会一直打开错误页
        if (resp.ok) {
          try { const copy = resp.clone(); const c = await caches.open(CACHE); await c.put('index.html', copy); } catch(_) {}
        }
        return resp;
      }).catch(() => caches.match('index.html').then(r => r || Response.error()))
    );
    return;
  }

  // 非 GET 请求（如 POST）：直接走网络，不回退缓存（缓存策略仅针对 GET）
  if (e.request.method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }

  // 同源 GET 请求：Network First，仅缓存成功的响应
  e.respondWith(
    fetch(e.request).then(async resp => {
      if (resp.ok) {
        try { const copy = resp.clone(); const c = await caches.open(CACHE); await c.put(e.request, copy); } catch(_) {}
      }
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || Response.error()))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // 只清理本应用的缓存（learn- 前缀）：同域若还部署了其它 PWA，删掉它们的缓存属于破坏性副作用
    // （index.html 里的版本修复逻辑同样是只删 learn- 前缀，两处保持一致）
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k.indexOf('learn-') === 0).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 通知客户端有新版本可用
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
