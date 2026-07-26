/* Dungeon Escape — minimal PWA service worker.
   Goal: make the app installable and load static assets fast. The game itself
   needs a live socket.io connection, so real-time traffic is never intercepted. */
const CACHE = 'dungeon-escape-v1';

// App shell + core static assets worth pre-caching. Kept small on purpose;
// everything else is cached lazily on first fetch.
const CORE = [
    '/',
    '/static/styles/main.css',
    '/static/styles/game.css',
    '/static/styles/dialog.css',
    '/static/scripts/dialog.js',
    '/static/assets/logo.svg',
    '/static/assets/favicon.svg',
    '/static/manifest.webmanifest',
    '/static/assets/icons/icon-192.png',
    '/static/assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    // Never touch same-origin realtime traffic or cross-origin requests.
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/socket.io')) return;

    // Navigations (HTML): network-first so a running server always wins, with a
    // cached shell as offline fallback.
    if (req.mode === 'navigate') {
        e.respondWith(
            fetch(req)
                .then((res) => { cachePut(req, res.clone()); return res; })
                .catch(() => caches.match(req).then((m) => m || caches.match('/')))
        );
        return;
    }

    // Static assets: cache-first, revalidating in the background.
    e.respondWith(
        caches.match(req).then((cached) => {
            const network = fetch(req)
                .then((res) => { cachePut(req, res.clone()); return res; })
                .catch(() => cached);
            return cached || network;
        })
    );
});

function cachePut(req, res) {
    if (!res || res.status !== 200 || res.type === 'opaque') return;
    caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {});
}
