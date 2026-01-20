/* ============================================================
   RESONANT · SERVICE WORKER — V16 FINAL FREEZE
   UI Shell Cache · Network-first HTML
   NO AUDIO CACHE · NO SC CACHE
   ------------------------------------------------------------
   STATUS: FROZEN · BROADCAST GRADE · PRODUCTION READY
   CHANGE POLICY:
   - UI file change  → bump CACHE_VERSION
   - Logic change    → MAJOR VERSION ONLY
   ============================================================ */

const CACHE_VERSION = "resonant-v16-shell-v5-freeze";

/* ------------------------------------------------------------
   UI SHELL (PUBLIC APP ONLY)
   ONLY FILES THAT ACTUALLY EXIST
------------------------------------------------------------ */
const SHELL_CACHE = [
  "/",
  "/manifest.webmanifest",

  // Public Listener App
  "/App/signal.html",
  "/App/app.js",
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

  // ⛔ Only handle GET requests
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
    if (url.pathname === "/" || url.pathname.startsWith("/App")) {
      event.respondWith(
        fetch(req).catch(() => caches.match(req))
      );
    } else {
      event.respondWith(fetch(req));
    }
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
     DEFAULT → NETWORK ONLY
  ------------------------------------------ */
  event.respondWith(fetch(req));
});

/* ============================================================
   END OF FILE — SERVICE WORKER
   FREEZE CONFIRMED
============================================================ */
