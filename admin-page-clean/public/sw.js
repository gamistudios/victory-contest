/*
 * Tombstone service worker.
 *
 * The admin used to be a PWA (vite-plugin-pwa). Phones that visited the old
 * build still have that service worker registered; it serves its cached shell
 * forever, which keeps the app broken on those devices even after redeploys.
 * This file lives at the same path (/admin/sw.js): an installed worker sees it
 * as an update, activates, deletes the old caches, unregisters itself, and
 * reloads the open clients. The app itself no longer registers any worker.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("workbox-") || n.includes("precache"))
          .map((n) => caches.delete(n))
      );
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
