/* ============================================================
   RESONANT · SERVICE WORKER
   UI Shell Cache · Network-first HTML
   NO AUDIO CACHE · NO SC CACHE
   ------------------------------------------------------------
   STATUS: STABLE · MEGACORE SAFE · PRODUCTION READY
   CHANGE POLICY:
   - UI / JS change → bump CACHE_VERSION
   ============================================================ */

const CACHE_VERSION = "resonant-v16-shell-v7-megacore";

/* ------------------------------------------------------------
   UI SHELL (ONLY REAL FILES)
------------------------------------------------------------ */
const SHELL_CACHE = [
  "/",
  "/manifest.webmanifest",

  // Listener HTML
  "/App/signal.html",

  // Listener MegaCore
  "/App/signal/app.js",

  // Styles
  "/App/signal/style.signal.css"
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

  // ⛔ Only GET
  if (req.method !== "GET") return;

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
     🚫 NEVER CACHE ADMIN / CONTROL
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
     HTML → NETWORK FIRST
  ------------------------------------------ */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  /* ------------------------------------------
     CSS / JS → CACHE FIRST
  ------------------------------------------ */
  if (
    req.destination === "style" ||
    req.destination === "script"
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

/* ============================================================
   END SERVICE WORKER
   MEGACORE COMPATIBLE
============================================================ */
