const CACHE = 'vinted-tracker-v5';
const STATIC = [
  './static/css/style.css',
  './static/js/shared.js',
  './static/js/app.js',
  './static/js/analytics.js',
  './manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith('http')) return;
  const url = new URL(e.request.url);

  // index.html : toujours réseau pour avoir la dernière version
  if (url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(e.request).catch(() => caches.match('./')));
    return;
  }

  // Supabase et CDN : réseau uniquement
  if (url.hostname.includes('supabase.co') || url.hostname.includes('jsdelivr.net')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // CSS / JS / icônes : cache first
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }))
  );
});
