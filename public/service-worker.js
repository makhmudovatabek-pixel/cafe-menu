const CACHE_NAME = 'abdulla-ata-shell-v14';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/styles.css?v=tuesday-day-off-notice-1',
  '/app.js?v=tuesday-day-off-notice-1',
  '/manifest.json',
  '/images/pwa-icon-192.svg',
  '/images/pwa-icon-512.svg',
  '/images/beshbarmak.png',
  '/images/lagman.png',
  '/images/manti.png',
  '/images/plov.png',
  '/images/slide-dastarkhan.png',
  '/images/slide-tea.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_FILES);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('abdulla-ata-shell-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/api/public-data') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  // Keep administrator API calls online-only; never cache logins or edits.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(request)) || (request.mode === 'navigate' ? caches.match('/index.html') : Response.error());
    }
  })());
});
