// Versioned so deployed clients delete stale page shells and app assets.
const CACHE_NAME = 'smart-home-offline-v8';

// These are app routes, not ESP32 endpoints. Cache their app shells while the
// device has internet so the installed VikaTech PWA can boot without it later.
const OFFLINE_ROUTES = [
  '/',
  '/local',
  '/boards',
  '/presets',
  '/schedules',
  '/alarms',
  '/analytics',
  '/logs',
  '/profile',
  '/settings',
];

const STATIC_ASSETS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/smart_home_ui.png',
  '/images/vikatech-local-network.png',
];

const APP_SHELL_PATHS = new Set(OFFLINE_ROUTES);

function canonicalRequest(url) {
  return new Request(new URL(url.pathname, self.location.origin).href, {
    method: 'GET',
    credentials: 'same-origin',
  });
}

function isRscRequest(request, url) {
  return request.headers.get('RSC') === '1' ||
    request.headers.has('Next-Router-State-Tree') ||
    url.searchParams.has('_rsc');
}

async function cacheResponse(cache, request, response, { htmlOnly = false } = {}) {
  if (!response || !response.ok || (response.type !== 'basic' && response.type !== 'default')) return;
  if (htmlOnly && !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) return;
  await cache.put(request, response.clone());
}

// Cache each route plus its first-party Next.js JS/CSS assets. Failed routes or
// optional images are ignored individually so installation can still succeed.
async function precacheRoute(cache, path) {
  try {
    const url = new URL(path, self.location.origin);
    const response = await fetch(new Request(url.href, { cache: 'reload', credentials: 'same-origin' }));
    if (!response.ok || (response.type !== 'basic' && response.type !== 'default')) return;
    await cacheResponse(cache, canonicalRequest(url), response, { htmlOnly: true });

    const html = await response.clone().text();
    const assetPaths = new Set();
    const assetPattern = /(?:src|href)=["'](\/_next\/static\/[^"'?#]+(?:\?[^"']*)?)["']/g;
    let match;
    while ((match = assetPattern.exec(html)) !== null) {
      const assetUrl = new URL(match[1], self.location.origin);
      assetUrl.search = '';
      assetPaths.add(assetUrl.pathname);
    }

    await Promise.all([...assetPaths].map(async (assetPath) => {
      try {
        const assetUrl = new URL(assetPath, self.location.origin);
        const assetResponse = await fetch(new Request(assetUrl.href, { cache: 'reload', credentials: 'same-origin' }));
        if (assetResponse.ok && (assetResponse.type === 'basic' || assetResponse.type === 'default')) {
          await cacheResponse(cache, assetUrl.href, assetResponse);
        }
      } catch {
        // Some lazy-loaded chunks are intentionally fetched only when needed.
      }
    }));
  } catch {
    // A single unavailable route should not prevent the PWA from installing.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all([
      ...OFFLINE_ROUTES.map((path) => precacheRoute(cache, path)),
      ...STATIC_ASSETS.map(async (path) => {
        try {
          const url = new URL(path, self.location.origin);
          const response = await fetch(new Request(url.href, { cache: 'reload', credentials: 'same-origin' }));
          await cacheResponse(cache, url.href, response);
        } catch {
          // Optional image/icon files do not block installation.
        }
      }),
    ]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((cacheName) => cacheName !== CACHE_NAME)
      .map((cacheName) => caches.delete(cacheName)));
    await self.clients.claim();
  })());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'VikaTech';
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/favicon.png',
    tag: payload.tag || `vikatech-${Date.now()}`,
    renotify: Boolean(payload.tag),
    data: {
      url: payload.url || '/',
      type: payload.type || 'system',
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        client.postMessage({ type: 'vikatech-push-resubscribe' });
      }
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => 'focus' in client);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // This worker only caches the VikaTech web origin. Direct HTTP calls from
  // the page to the ESP32 are cross-origin and go straight to the local board.
  if (
    url.origin !== self.location.origin ||
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.pathname.includes('webpack') ||
    url.pathname.includes('turbopack') ||
    url.pathname.startsWith('/api/') ||
    request.method !== 'GET'
  ) {
    return;
  }

  // RSC responses are internal Next.js navigation data, not documents. Never
  // cache them under the route URL or they can be replayed as a blank/text page
  // when the phone switches to the ESP32 SoftAP.
  if (isRscRequest(request, url)) return;

  // Hashed Next.js assets are immutable; prefer the cache once downloaded.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cacheResponse(cache, request, response);
        return response;
      } catch {
        return new Response('Required VikaTech app asset is not cached yet.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })());
    return;
  }

  // Network-first for navigations: update cached page shells while online, and
  // load the cached same-origin app shell when the phone is on ESP32 SoftAP.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && (response.type === 'basic' || response.type === 'default')) {
          await cacheResponse(cache, canonicalRequest(url), response, { htmlOnly: true });
        }
        return response;
      } catch {
        const cachedPage = await caches.match(canonicalRequest(url));
        if (cachedPage) return cachedPage;
        const localPage = await caches.match(new URL('/local', self.location.origin).href);
        if (localPage) return localPage;
        const homePage = await caches.match(new URL('/', self.location.origin).href);
        if (homePage) return homePage;
        return new Response(
          '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VikaTech offline</title><body style="font-family:system-ui;padding:24px"><h1>VikaTech is not cached on this device yet</h1><p>Reconnect to the internet, open VikaTech once, then try local control again.</p></body></html>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
      }
    })());
    return;
  }

  // Cache first-party app-shell routes and public assets after successful visits.
  if (APP_SHELL_PATHS.has(url.pathname) || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && (response.type === 'basic' || response.type === 'default')) {
          await cacheResponse(cache, canonicalRequest(url), response, { htmlOnly: true });
        }
        return response;
      } catch {
        return (await caches.match(request)) ||
          (await caches.match(canonicalRequest(url))) ||
          new Response('Offline mode active.', { status: 503 });
      }
    })());
  }
});
