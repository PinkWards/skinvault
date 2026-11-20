/* SkinVault service worker — one job: open offline, update without a prompt.
   Navigations are network-first, so a new index.html is live the moment it is
   pushed; the cache is only the safety net for a dead signal. The archive shelf
   is cached beside the shell because it is the one file the app cannot rebuild
   offline, and it is matched with the query string ignored so a cache-buster
   cannot hide it. Nothing else is intercepted: a zip download must go straight
   to the network, never through a cache layer that could hand back a truncated
   file. */

const CACHE = 'skinvault-shell-v21';
const SHELL = ['./', 'extra.json'];

const isArchive = (req) => {
  if (req.method !== 'GET') return false;
  try {
    const u = new URL(req.url);
    return u.origin === self.location.origin && /\/extra\.json$/.test(u.pathname);
  } catch (e) { return false; }
};

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) =>
        c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
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

  // Archive shelf: always the network when it answers, the cache when it does
  // not. Stored under the bare name so every cache-busted request finds it.
  if (isArchive(req)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(new Request('extra.json'), fresh.clone());
        return fresh;
      } catch (err) {
        const hit = (await cache.match(req, { ignoreSearch: true })) ||
                    (await cache.match('extra.json', { ignoreSearch: true }));
        return hit || Response.error();
      }
    })());
    return;
  }

  if (req.mode !== 'navigate' || req.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req, { cache: 'no-store' });
      // One page, one cache key. Keying on the request instead lets every
      // "?utm=..." or "?debug=1" navigation add another full copy of the app.
      if (fresh && fresh.ok) cache.put('./', fresh.clone());
      return fresh;
    } catch (err) {
      const hit = (await cache.match('./')) || (await cache.match(req));
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
