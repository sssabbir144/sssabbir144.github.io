/* Ss Animation — service worker (offline-first for the studio only).
   Scope is limited to /studio/ by this file's location. */
const CACHE = "ssanim-studio-v20";
const ASSETS = [
  "./",
  "./index.html",
  "./studio.css?v=13",
  "./studio.js?v=16",
  "./icon.svg", "./icon-192.png", "./icon-512.png", "./logo-badge.png", "./logo-master.png",
  "./manifest.webmanifest",
  "../site-final-v2.css?v=20261029-6"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request, { ignoreSearch: false }).then((hit) =>
        hit || fetch(e.request).then((res) => {
          const copy = res.clone();
          cache.put(e.request, copy);
          return res;
        }).catch(() => cache.match("./index.html"))
      )
    )
  );
});
