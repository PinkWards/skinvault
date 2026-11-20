/* SkinVault service worker — one job: open offline, update without a prompt.
   Navigations are network-first, so a new index.html is live the moment it is
   pushed; the cache is only the safety net for a dead signal. Nothing else is
   intercepted: a zip download must go straight to the network, never through
   a cache layer that could hand back a truncated file. */

const CACHE = 'skinvault-shell-v19';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.add(new Request('./', { cache: 'reload' })))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
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
  if (req.mode !== 'navigate' || req.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req, { cache: 'no-store' });
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      const hit = (await cache.match(req)) || (await cache.match('./'));
      return hit || new Response(
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="background:#0a1626;color:#e8f1ff;font:16px system-ui;padding:2rem">' +
        '<h1 style="font-size:1.1rem">SkinVault is offline</h1>' +
        '<p style="color:#8ba6c4">Open it once with a signal and the shell stays cached.</p>',
        { headers: { 'content-type': 'text/html; charset=utf-8' } }
      );
    }
  })());
});
