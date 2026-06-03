const CACHE_NAME = 'tubeflow-cache-v9';
const ASSETS = [
  './',
  './index.html',
  './static/styles.css',
  './static/app.js',
  './static/icon.svg',
  './static/icon-192.png',
  './static/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => console.warn("Cache warm failed", err));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  
  // Skip API queries, third-party extractor fetches, and local dev posts so they never get cached
  if (
    event.request.method !== 'GET' ||
    url.includes('/api/') || 
    url.includes('cobalt') || 
    url.includes('invidious') || 
    url.includes('piped')
  ) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request).catch(() => {
        // Optional fallback logic if offline
      });
    })
  );
});
