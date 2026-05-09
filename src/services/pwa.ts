import { getWorkoutMediaUrls } from '@/data/workoutPlan';

const MEDIA_CACHE_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then(registration => {
      let lastMediaCacheRequestAt = 0;

      const cacheMedia = (force = false) => {
        const now = Date.now();
        if (!force && now - lastMediaCacheRequestAt < MEDIA_CACHE_REFRESH_INTERVAL_MS) return;

        const worker = registration.active ?? navigator.serviceWorker.controller ?? registration.waiting;
        if (!worker) return;

        lastMediaCacheRequestAt = now;
        worker.postMessage({
          type: 'CACHE_URLS',
          urls: getWorkoutMediaUrls(),
        });
      };

      cacheMedia(true);
      void navigator.serviceWorker.ready.then(() => cacheMedia(true)).catch(() => undefined);

      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', () => {
          if (registration.active) cacheMedia(true);
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => cacheMedia(true));
      window.addEventListener('focus', () => cacheMedia());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') cacheMedia();
      });
    }).catch(() => undefined);
  });
}
