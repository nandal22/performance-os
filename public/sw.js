const APP_CACHE = 'performance-os-app-v3';
const MEDIA_CACHE = 'performance-os-media-v3';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-touch-icon.svg',
];

function canCache(response) {
  return response && (response.ok || response.type === 'opaque');
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (canCache(response)) cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (canCache(response)) cache.put('/index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('/index.html')) ?? Response.error();
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => ![APP_CACHE, MEDIA_CACHE].includes(key))
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls
    .filter(url => typeof url === 'string')
    .slice(0, 160);

  event.waitUntil(
    caches.open(MEDIA_CACHE).then(cache =>
      Promise.allSettled(urls.map(url => cache.add(new Request(url, { mode: 'cors' })))),
    ),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, APP_CACHE));
    return;
  }

  if (
    url.hostname === 'raw.githubusercontent.com' &&
    url.pathname.includes('/yuhonas/free-exercise-db/')
  ) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
  }
});
