// Offline support: every file the app needs is cached on install and served
// from the cache first. Bump VERSION whenever a cached file changes.
const VERSION = 'risewell-v7';
const FILES = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/logic.js',
  'fonts/nunito.woff2',
  'manifest.webmanifest',
  'icons/icon-48.png',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('index.html')))
  );
});
