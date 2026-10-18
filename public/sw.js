const APP_CACHE = 'performance-os-app-v5';
const DATA_CACHE = 'performance-os-data-v5';
const NETWORK_TIMEOUT_MS = 2500;
const SUPABASE_HOST = 'gobicwnqqadquxpbdbae.supabase.co';
const MEDIA_CACHE = 'performance-os-media-v4';
const MEDIA_METADATA_CACHE = 'performance-os-media-meta-v4';
const WORKOUT_MEDIA_HOST = 'raw.githubusercontent.com';
const WORKOUT_MEDIA_PATH = '/yuhonas/free-exercise-db/';
const MEDIA_CACHE_MAX_ITEMS = 160;
const MEDIA_CACHE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MEDIA_WARMUP_BATCH_SIZE = 8;
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

function isWorkoutMediaUrl(url) {
  return (
    url.hostname === WORKOUT_MEDIA_HOST &&
    url.pathname.includes(WORKOUT_MEDIA_PATH)
  );
}

function mediaMetadataRequest(url) {
  return new Request(`${self.location.origin}/__media-cache-meta__?url=${encodeURIComponent(url)}`);
}

async function setMediaLastUsed(metadataCache, url) {
  await metadataCache.put(
    mediaMetadataRequest(url),
    new Response(String(Date.now()), {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    }),
  );
}

async function getMediaLastUsed(metadataCache, url) {
  const response = await metadataCache.match(mediaMetadataRequest(url));
  const value = response ? Number(await response.text()) : 0;
  return Number.isFinite(value) ? value : 0;
}

async function deleteMediaEntry(mediaCache, metadataCache, request) {
  await Promise.all([
    mediaCache.delete(request),
    metadataCache.delete(mediaMetadataRequest(request.url)),
  ]);
}

async function pruneWorkoutMediaCache() {
  const [mediaCache, metadataCache] = await Promise.all([
    caches.open(MEDIA_CACHE),
    caches.open(MEDIA_METADATA_CACHE),
  ]);
  const now = Date.now();
  const requests = await mediaCache.keys();
  const entries = await Promise.all(
    requests.map(async request => ({
      request,
      lastUsed: await getMediaLastUsed(metadataCache, request.url),
    })),
  );
  const liveUrls = new Set(requests.map(request => request.url));

  await Promise.all(
    entries
      .filter(entry => entry.lastUsed > 0 && now - entry.lastUsed > MEDIA_CACHE_MAX_AGE_MS)
      .map(entry => deleteMediaEntry(mediaCache, metadataCache, entry.request)),
  );

  const retained = entries
    .filter(entry => entry.lastUsed === 0 || now - entry.lastUsed <= MEDIA_CACHE_MAX_AGE_MS)
    .sort((a, b) => a.lastUsed - b.lastUsed);
  const overflow = Math.max(0, retained.length - MEDIA_CACHE_MAX_ITEMS);

  await Promise.all(
    retained
      .slice(0, overflow)
      .map(entry => deleteMediaEntry(mediaCache, metadataCache, entry.request)),
  );

  const metadataRequests = await metadataCache.keys();
  await Promise.all(
    metadataRequests
      .filter(request => {
        const metadataUrl = new URL(request.url).searchParams.get('url');
        return !metadataUrl || !liveUrls.has(metadataUrl);
      })
      .map(request => metadataCache.delete(request)),
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (canCache(response)) cache.put(request, response.clone());
  return response;
}

function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function networkFirstWithTimeout(request, cacheName, timeoutMs, fallbackRequest) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (canCache(response)) {
      const cacheKey = request.mode === 'navigate' ? '/index.html' : request;
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackRequest) {
      const fallback = await cache.match(fallbackRequest);
      if (fallback) return fallback;
    }
    return Response.error();
  }
}

async function cacheWorkoutMediaRequest(request, mediaCache, metadataCache) {
  const cached = await mediaCache.match(request);
  if (cached) {
    await setMediaLastUsed(metadataCache, request.url);
    return;
  }

  const response = await fetch(request);
  if (!canCache(response)) return;

  await mediaCache.put(request, response);
  await setMediaLastUsed(metadataCache, request.url);
}

async function warmWorkoutMedia(urls) {
  const [mediaCache, metadataCache] = await Promise.all([
    caches.open(MEDIA_CACHE),
    caches.open(MEDIA_METADATA_CACHE),
  ]);
  const requests = urls
    .map(url => new Request(url, { mode: 'cors', credentials: 'omit' }))
    .filter(request => isWorkoutMediaUrl(new URL(request.url)));

  for (let index = 0; index < requests.length; index += MEDIA_WARMUP_BATCH_SIZE) {
    const batch = requests.slice(index, index + MEDIA_WARMUP_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(request => cacheWorkoutMediaRequest(request, mediaCache, metadataCache)),
    );
  }
  await pruneWorkoutMediaCache();
}

async function cacheFirstWorkoutMedia(request, event) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (canCache(response)) {
    const responseForCache = response.clone();
    event.waitUntil(
      caches.open(MEDIA_METADATA_CACHE)
        .then(async metadataCache => {
          await cache.put(request, responseForCache);
          await setMediaLastUsed(metadataCache, request.url);
        })
        .then(() => pruneWorkoutMediaCache())
        .catch(() => undefined),
    );
  }

  return response;
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
          .filter(key => ![APP_CACHE, DATA_CACHE, MEDIA_CACHE, MEDIA_METADATA_CACHE].includes(key))
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls
    .filter(url => typeof url === 'string')
    .filter(url => {
      try {
        return isWorkoutMediaUrl(new URL(url));
      } catch {
        return false;
      }
    })
    .slice(0, MEDIA_CACHE_MAX_ITEMS);

  event.waitUntil(warmWorkoutMedia(urls).catch(() => undefined));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithTimeout(request, APP_CACHE, NETWORK_TIMEOUT_MS, '/index.html'));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, APP_CACHE));
    return;
  }

  if (url.hostname === SUPABASE_HOST && !url.pathname.includes('/auth/')) {
    event.respondWith(networkFirstWithTimeout(request, DATA_CACHE, NETWORK_TIMEOUT_MS));
    return;
  }

  if (isWorkoutMediaUrl(url)) {
    event.respondWith(cacheFirstWorkoutMedia(request, event));
  }
});
