// 口袋伙伴 Service Worker
// 版本号更新会触发缓存更新
const CACHE_NAME = 'pocket-pet-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap',
];

// ── 安装：预缓存核心资源 ──
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── 激活：清理旧缓存 ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch：缓存优先，网络回退 ──
self.addEventListener('fetch', event => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;

  // NFC / 邀请码参数透传，不走缓存
  const url = new URL(event.request.url);
  if (url.searchParams.has('nfc') || url.searchParams.has('invite')) {
    return; // 直接走网络
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // 只缓存成功的同源请求
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // 离线时返回主页
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── 推送通知（宠物状态提醒）──
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '口袋伙伴';
  const options = {
    body: data.body || '你的宠物需要你了！',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' },
    actions: [
      { action: 'open', title: '查看宠物' },
      { action: 'dismiss', title: '稍后' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── 点击通知 ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── 后台同步（宠物状态离线更新）──
self.addEventListener('sync', event => {
  if (event.tag === 'pet-status-sync') {
    event.waitUntil(syncPetStatus());
  }
});

async function syncPetStatus() {
  console.log('[SW] Background sync: pet status');
  // 实际部署时在此处同步服务器数据
}
