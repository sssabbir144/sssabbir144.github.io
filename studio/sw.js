/* Ss Animation — service worker (offline-first for the studio only).
   Scope is limited to /studio/ by this file's location. */
const CACHE = "ssanim-studio-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./studio.css?v=4",
  "./studio.js?v=4",
  "./icon.svg",
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
    caches.match(e.request, { ignoreSearch: false }).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
