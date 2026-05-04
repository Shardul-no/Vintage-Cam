const CACHE_NAME = 'vintage-cam-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './filters.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
