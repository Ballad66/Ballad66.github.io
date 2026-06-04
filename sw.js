// 菇房采收工具 Service Worker
// 版本号：更新时修改这里，会自动清理旧缓存
const CACHE_VERSION = 'mushroom-v1.0';
const CACHE_NAME = CACHE_VERSION;

// 需要缓存的资源（离线可用）
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // SheetJS CDN - 离线写Excel需要
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

// ─── 安装：预缓存核心资源 ─────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // 逐个缓存，某个失败不影响整体
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err => {
              console.warn('[SW] Failed to cache:', url, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Installed, skipping waiting');
        return self.skipWaiting();
      })
  );
});

// ─── 激活：清理旧缓存 ─────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...', CACHE_NAME);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// ─── 请求拦截：缓存优先（离线友好）─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API请求（阿里云AI）不缓存，直接走网络
  if (url.hostname.includes('dashscope') || url.hostname.includes('aliyuncs')) {
    return; // 让浏览器正常处理
  }

  // GET请求才缓存
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) {
          // 有缓存：返回缓存，后台更新
          fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, response.clone());
                });
              }
            })
            .catch(() => {}); // 离线时静默失败
          return cached;
        }
        // 无缓存：走网络并存入缓存
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200 || response.type === 'opaque') {
              return response;
            }
            const toCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, toCache);
            });
            return response;
          })
          .catch(() => {
            // 彻底离线：返回离线提示
            if (event.request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// ─── 推送通知（预留，后续可启用）─────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || '菇房工具', {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'mushroom-notice'
  });
});
