const CACHE_NAME = 'smart-home-offline-v4';
const STATIC_ASSETS = [
  '/',
  '/local',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/smart_home_ui.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRITICAL: Bypass service worker for dev server HMR, Supabase APIs, and non-GET requests
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.pathname.includes('webpack') ||
    url.pathname.includes('turbopack') ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-first with cache fallback strategy for JS/CSS assets and pages when offline
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic' &&
          (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/_next/static/'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache when network fails (e.g. connected to offline ESP32 SoftAP)
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/local').then((localCache) => localCache || caches.match('/'));
          }
          return new Response('Offline mode active.', { status: 503 });
        });
      })
  );
});
