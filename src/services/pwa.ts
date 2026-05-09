import { getWorkoutMediaUrls } from '@/data/workoutPlan';

export function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then(registration => {
      const cacheMedia = () => {
        const worker = registration.active ?? navigator.serviceWorker.controller;
        worker?.postMessage({
          type: 'CACHE_URLS',
          urls: getWorkoutMediaUrls(),
        });
      };

      if (registration.active) {
        cacheMedia();
      } else {
        registration.addEventListener('updatefound', () => {
          registration.installing?.addEventListener('statechange', () => {
            if (registration.active) cacheMedia();
          });
        });
      }
    }).catch(() => undefined);
  });
}
