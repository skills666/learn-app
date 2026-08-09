const CACHE = 'learn-v11';

// chest.js 也用 Network First，确保更新后能及时获取新版本
const PRE_CACHE = ['index.html', 'manifest.json', 'chest.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRE_CACHE).catch(() => {})));
  self.skipWaiting();
});

// 统一策略：所有资源 Network First（先网络，失败回退缓存）
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).then(resp => {
      // 只缓存成功响应
      if (resp.ok) {
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
