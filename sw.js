// 口袋伙伴 Service Worker
// ⚠️ 每次部署新版本，只需修改这一行版本号
const CACHE_VERSION = 'v4';
const CACHE_NAME    = 'pocket-pet-' + CACHE_VERSION;

// 静态资源（图标/manifest）走缓存优先，几乎不变
const STATIC_ASSETS = [
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── 安装：预缓存静态资源 ──
self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Static asset cache failed (non-fatal):', err);
      }))
      .then(() => self.skipWaiting())   // 立即接管，不等旧 SW 退出
  );
});

// ── 激活：删除所有旧版本缓存 ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_NAME, '— clearing old caches');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => { console.log('[SW] Deleting:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())  // 立即控制所有页面
  );
});

// ── Fetch 策略 ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // NFC / 邀请参数：完全走网络，不读也不写缓存
  if (url.searchParams.has('nfc') || url.searchParams.has('invite')) return;

  // index.html → 网络优先，失败才用缓存（保证总拿最新游戏）
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname === url.origin + '/') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))   // 离线 fallback
    );
    return;
  }

  // 静态资源（图标/字体等）→ 缓存优先，网络回退
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') return caches.match('./index.html');
      });
    })
  );
});

// ── 推送通知 ──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || '口袋伙伴', {
    body:    data.body    || '你的宠物需要你了！',
    icon:    './icons/icon-192.png',
    badge:   './icons/icon-192.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || './' },
    actions: [{ action: 'open', title: '查看宠物' }, { action: 'dismiss', title: '稍后' }],
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(list => {
        for (const c of list) if ('focus' in c) return c.focus();
        return clients.openWindow(url);
      })
  );
});
