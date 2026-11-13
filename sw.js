/* MYG Tech service worker — offline support for the public site.
   Bump CACHE when shipping changes that must reach installed apps immediately. */
const CACHE = "myg-v1";
const CORE = [
  "/",
  "/404.html",
  "/manifest.webmanifest",
  "/assets/css/style.css",
  "/assets/js/main.js",
  "/assets/images/myg-tech-logo.svg",
  "/assets/images/myg-monogram.svg",
  "/assets/images/favicon.svg",
  "/assets/images/icon-192.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Fonts: cache-first (cross-origin, rarely change)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }

  // Never touch other origins, Firebase reserved URLs or the private panel.
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/__/") || url.pathname.startsWith("/panel")) return;

  // Pages: network first, fall back to cache when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match("/")))
    );
    return;
  }

  // Static assets: serve from cache, refresh in the background.
  event.respondWith(caches.match(req).then(hit => {
    const network = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || network;
  }));
});
