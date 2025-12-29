/* ============================================================
   RESONANT · SERVICE WORKER — V16 FINAL (COMPILED)
   UI Shell Cache · Network First HTML
   NO AUDIO CACHE · NO SC CACHE
   ============================================================ */

const CACHE_VERSION = "resonant-v16-shell-v3";

/* ------------------------------------------------------------
   UI SHELL (PUBLIC APP ONLY)
------------------------------------------------------------ */
const SHELL_CACHE = [
  "/",
  "/style.index.css",
  "/manifest.webmanifest",

  // Public App
  "/App/signal.html",
  "/App/app.js",
  "/App/playlist.official.js",
  "/App/style.signal.css"
];

/* ------------------------------------------------------------
   INSTALL — cache UI shell only
------------------------------------------------------------ */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL_CACHE))
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
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
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

  /* ------------------------------------------
     🚫 NEVER TOUCH AUDIO / SOUNDCLOUD
  ------------------------------------------ */
  if (
    url.hostname.includes("soundcloud.com") ||
    url.hostname.includes("sndcdn.com") ||
    req.destination === "audio" ||
    req.destination === "iframe"
  ) {
    return;
  }

  /* ------------------------------------------
     🚫 NEVER CACHE CONTROL SURFACES
  ------------------------------------------ */
  if (
    url.pathname.startsWith("/Admin") ||
    url.pathname.startsWith("/Metrics") ||
    url.pathname.startsWith("/Gate")
  ) {
    event.respondWith(fetch(req));
    return;
  }

  /* ------------------------------------------
     HTML → NETWORK FIRST (PUBLIC APP ONLY)
  ------------------------------------------ */
  if (req.mode === "navigate") {
    if (url.pathname.startsWith("/App") || url.pathname === "/") {
      event.respondWith(
        fetch(req).catch(() => caches.match(req))
      );
    } else {
      event.respondWith(fetch(req));
    }
    return;
  }

  /* ------------------------------------------
     CSS / JS / IMAGES → CACHE FIRST
  ------------------------------------------ */
  if (
    req.destination === "style" ||
    req.destination === "script" ||
    req.destination === "image"
  ) {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;

        return fetch(req).then(res => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(cache => {
            cache.put(req, clone);
          });
          return res;
        });
      })
    );
    return;
  }

  /* ------------------------------------------
     DEFAULT → NETWORK
  ------------------------------------------ */
  event.respondWith(fetch(req));
});
