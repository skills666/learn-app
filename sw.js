const CACHE = 'learn-v19';

// 预缓存静态资源，确保离线可用
const PRE_CACHE = ['index.html', 'manifest.json', 'chest.js', 'img-bg-dark.jpg', 'icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    // 逐个 add 并容错：单个资源 404 只跳过它自己，不让 addAll 的原子失败拖垮整个离线首开
    caches.open(CACHE).then(c => Promise.all(
      PRE_CACHE.map(u => c.add(u).catch(err => console.warn('[SW] 预缓存资源失败:', u, err)))
    ))
  );
  self.skipWaiting();
});

// 策略：
// - 同源静态资源：Network First（先网络，失败回退缓存），仅缓存 GET 请求
// - 第三方 API 请求：Network Only，不缓存（避免缓存敏感数据或过期响应）
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // 第三方请求（Gitee API、AI API 等）：仅走网络，不缓存
  if (url.origin !== location.origin) {
    e.respondWith(fetch(e.request).catch(() => new Response(null, {status: 503, statusText: 'Service Unavailable'})));
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
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// 通知客户端有新版本可用
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
