const CACHE = 'learn-v13';

// 预缓存静态资源，确保离线可用
const PRE_CACHE = ['index.html', 'manifest.json', 'chest.js', 'img-bg-dark.jpg', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRE_CACHE).catch(err => {
      console.warn('[SW] 预缓存部分资源失败:', err);
    }))
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
      fetch(e.request, { cache: 'no-cache' }).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put('index.html', copy));
        return resp;
      }).catch(() => caches.match('index.html'))
    );
    return;
  }

  // 同源请求：Network First，仅缓存成功的 GET 响应
  e.respondWith(
    fetch(e.request).then(resp => {
      if (resp.ok && e.request.method === 'GET') {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return resp;
    }).catch(() => caches.match(e.request))
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
