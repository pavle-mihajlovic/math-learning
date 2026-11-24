/* Road to Rudin service worker (B10).
 * vite.config.ts copies this file to dist/sw.js and fills in VERSION and PRECACHE at build time.
 * It is plain JS on purpose: it runs outside the app bundle.
 *
 * Caches
 *   rtr-shell-<version>  app shell: index.html, hashed JS/CSS, KaTeX + MathLive fonts, icons.
 *                        Replaced as a whole on each deploy.
 *   rtr-content          unit JSON and figures. Survives deploys. Filled chapter by chapter
 *                        by src/pwa/offline.ts and by normal use.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `rtr-shell-${VERSION}`;
const CONTENT = 'rtr-content';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('rtr-shell-') && key !== SHELL) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

async function fromShell(req) {
  const cache = await caches.open(SHELL);
  return cache.match(req, { ignoreSearch: true });
}

/** Cache first, then network; stores what it fetches. */
async function cacheFirst(req, cacheName) {
  const hit = (await fromShell(req)) || (await caches.match(req, { ignoreSearch: true }));
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(cacheName);
    cache.put(req, res.clone());
  }
  return res;
}

/** Answer from the cache at once and refresh it in the background (content PRs show up on the next open). */
async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CONTENT);
  const hit = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req)
    .then((res) => {
      if (res.ok) return cache.put(req, res.clone()).then(() => res);
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  const res = await update;
  return res || new Response('offline', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    // Single-page app with hash routes: every navigation is index.html. Cache first for a fast start;
    // a new deploy arrives as a new service worker and the app offers a reload.
    event.respondWith(
      fromShell('/index.html').then((hit) => hit || fetch(req)).catch(() => fetch(req)),
    );
    return;
  }
  if (path.startsWith('/content/')) {
    event.respondWith(staleWhileRevalidate(event, req));
    return;
  }
  if (path.startsWith('/figures/')) {
    event.respondWith(cacheFirst(req, CONTENT));
    return;
  }
  if (path.startsWith('/assets/') || path.startsWith('/mathlive/') || path.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req, SHELL));
  }
});
