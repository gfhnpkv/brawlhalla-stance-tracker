// Service worker: lets the tracker open offline. Same-origin files are fetched from the
// network first (so updates show up right away) and fall back to the last cached copy.
// Pictures (portraits/ and weapons/, not index.json) are cache-first in their own cache instead:
// they rarely change, so repeat visits show them with no network at all. Bump IMG_CACHE after
// replacing a picture under the same name.
// API calls to other sites are not touched, and saved data stays in localStorage.
const CACHE = 'stance-tracker-v19';
const IMG_CACHE = 'stance-tracker-img-v1';
const isPicture = url => /\/(portraits|weapons)\/.+\.(avif|png|jpe?g|webp|svg)$/i.test(url.pathname);
const FILES = [
  './', 'index.html', 'classic.html', 'redesign-clean.html', 'app.html', 'stances.html', 'stats.html',
  'legends.js', 'stance-data.js', 'core.js', 'goals.js', 'history.js', 'summary.js', 'shareimage.js', 'crest.js', 'theme-boot.js', 'icon.svg', 'manifest.webmanifest', 'portraits/index.json', '404.html'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  if (isPicture(url)) {
    event.respondWith(
      caches.open(IMG_CACHE).then(cache => cache.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      })))
    );
    return;
  }

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
