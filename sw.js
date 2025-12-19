/* ============================================================
   RESONANT · SERVICE WORKER — BROADCAST SAFE
   UI Shell Cache · Network First HTML
   NO AUDIO CACHE · NO SC CACHE
   ============================================================ */

const CACHE_VERSION = "resonant-v16-shell-v2";

const SHELL_CACHE = [
  "/",
  "/index.html",
  "/style.index.css",
  "/app.js",
  "/manifest.webmanifest"
];

/* ------------------------------------------------------------
   INSTALL — cache UI shell only
------------------------------------------------------------ */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(SHELL_CACHE);
    })
  );
  self.skipWaiting();
});

/* ------------------------------------------------------------
   ACTIVATE — clean old caches
------------------------------------------------------------ */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ------------------------------------------------------------
   FETCH STRATEGY
------------------------------------------------------------ */
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // 🚫 Never touch SoundCloud or external audio
  if (
    url.hostname.includes("soundcloud.com") ||
    url.hostname.includes("sndcdn.com") ||
    req.destination === "audio" ||
    req.destination === "iframe"
  ) {
    return;
  }

  // HTML → network first (always fresh broadcast)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // CSS / JS / Images → cache first
  if (
    req.destination === "style" ||
    req.destination === "script" ||
    req.destination === "image"
  ) {
    event.respondWith(
      caches.match(req).then(cached => {
        return (
          cached ||
          fetch(req).then(res => {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(req, clone));
            return res;
          })
        );
      })
    );
    return;
  }

  // Default → passthrough
  event.respondWith(fetch(req));
});
