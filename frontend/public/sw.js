const SHELL_CACHE = 'paladio-shell-v1';
const DATA_CACHE = 'paladio-data-v1';
const STATIC_ASSETS = ['/logo-white.png', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isShellRequest(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/logo-white.png' ||
    url.pathname === '/favicon.png' ||
    url.pathname === '/favicon.ico'
  );
}

const CACHEABLE_TILE_DOMAINS = [
  'tile.openstreetmap.org',
  'openfreemap.org',
  'basemaps.cartocdn.com',
];

function hostnameMatchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith('.' + domain);
}

function isCacheableDataRequest(url) {
  const hostname = (url.hostname || '').toLowerCase();
  return (
    url.pathname.startsWith('/api/trips') ||
    url.pathname.includes('/tiles/') ||
    CACHEABLE_TILE_DOMAINS.some((domain) => hostnameMatchesDomain(hostname, domain))
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (isShellRequest(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  if (isCacheableDataRequest(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
