// Service worker: lets the tracker open offline. Same-origin files are fetched from the
// network first (so updates show up right away) and fall back to the last cached copy.
// API calls to other sites are not touched, and saved data stays in localStorage.
const CACHE = 'stance-tracker-v8';
const FILES = [
  './', 'index.html', 'app.html', 'cards.html', 'matrix.html', 'terminal.html', 'compare.html', 'roadmap.html', 'pixel.html',
  'legends.js', 'core.js', 'goals.js', 'summary.js', 'theme-boot.js', 'icon.svg', 'manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
          .then(hit => hit || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))
      )
  );
});
