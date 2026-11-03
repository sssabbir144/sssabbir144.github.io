/* Ss Animation — service worker (offline-first for the studio only).
   Scope is limited to /studio/ by this file's location. */
const CACHE = "ssanim-studio-v30";
const ASSETS = [
  "./",
  "./index.html",
  "./studio.css?v=19",
  "./studio.js?v=20",
  "./icon.svg", "./icon-192.png?v=3", "./icon-512.png?v=3", "./icon-maskable-512.png?v=3", "./apple-touch-icon.png", "./logo-badge.png?v=2", "./logo-bordered-1200.png",
  "./manifest.webmanifest", "./login-design.webp", "./dashboard-banner.webp?v=2", "./banner-poster.webp?v=2",
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
  if (e.request.destination === "video" || e.request.headers.has("range")) return;
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request, { ignoreSearch: false }).then((hit) =>
        hit || fetch(e.request).then((res) => {
          if (res.status === 200) {
            const copy = res.clone();
            cache.put(e.request, copy);
          }
          return res;
        }).catch(() => cache.match("./index.html"))
      )
    )
  );
});
