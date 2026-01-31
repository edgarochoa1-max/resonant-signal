/* ============================================================
   RESONANT · LISTENER BOOT
===============================================================

ROLE
• App entrypoint
• Wire CORE ↔ ENGINE ROUTER ↔ UI
• Poll broadcast state
• Lifecycle + guards

AUTHORITY
• Initializes systems only
• No business logic
• No audio logic

PAIRING
• app.core.js
• engine.router.js
• app.ui.js

STATUS
• CANON
• HEADEND-GRADE
=============================================================== */
"use strict";

/* IMPORTS — MUST BE FIRST */
import * as CORE from "./app.core.js";
import * as ENGINE_ROUTER from "./engine.router.js";
import * as UI from "./app.ui.js";

/* ------------------------------------------------------------
   ADMIN → LISTENER HANDSHAKE (EVENT-DRIVEN)
------------------------------------------------------------ */

window.addEventListener("resonant:broadcast", e => {
  try {
    const raw = localStorage.getItem(CORE.BROADCAST_KEY);
    if (!raw || raw === lastRawSeen) return;

    lastRawSeen = raw;

    if (typeof ENGINE_ROUTER.ingestBroadcast === "function") {
      ENGINE_ROUTER.ingestBroadcast(raw);
    }
  } catch {
    // silent by design
  }
});


/* ------------------------------------------------------------
   LISTENER IDENTITY (PASSIVE)
------------------------------------------------------------ */

const LISTENER_ID =
  sessionStorage.getItem("resonant_listener_id") ||
  crypto.randomUUID();

sessionStorage.setItem("resonant_listener_id", LISTENER_ID);

/* ------------------------------------------------------------
   ADMIN / LISTENER HARD ISOLATION
------------------------------------------------------------ */

if (window.__RESONANT_ADMIN__ === true) {
  console.warn("⛔ Listener boot blocked inside Admin context");
  throw new Error("Listener boot aborted: admin context detected");
}


/* ------------------------------------------------------------
   CONFIG
------------------------------------------------------------ */

const POLL_INTERVAL = 1000;
const RENDER_INTERVAL = CORE.SYNC_LIVE ?? 1000;

let lastRawSeen = null;
let pollTimer = null;
let renderTimer = null;

function startRenderLoop() {
  if (renderTimer) return;
  if (typeof UI.render !== "function") return;

  renderTimer = setInterval(UI.render, RENDER_INTERVAL);
}

function pingAdminListener() {
  try {
    window.dispatchEvent(
      new CustomEvent("resonant:listener-ping", {
        detail: { id: LISTENER_ID }
      })
    );
  } catch {}
}

/* ------------------------------------------------------------
   BOOT
------------------------------------------------------------ */

function boot() {
  // Explicit initial phase & view (BOOT authority)
document.body.setAttribute("data-phase", "offair");
document.body.setAttribute("data-view", "radio");


  // NOTE:
  // data-phase is initialized here ONLY.
  // Any subsequent phase change MUST be decided by ENGINE
  // and reflected exclusively via UI layer.

  // 1. Bind UI immediately (DOM only)
  if (typeof UI.bindUI === "function") {
    UI.bindUI();
  }

  // 2. Snapshot rehydration (PASSIVE, advisory)
  const snap = typeof CORE.loadSnapshot === "function"
    ? CORE.loadSnapshot()
    : null;

  if (
    snap?.state &&
    (!snap.savedAt || Date.now() - snap.savedAt < CORE.BROADCAST_TTL)
  ) {
    try {
      const raw = JSON.stringify(snap.state);
      lastRawSeen = raw;

      if (typeof ENGINE_ROUTER.ingestBroadcast === "function") {
        ENGINE_ROUTER.ingestBroadcast(raw);
      }
    } catch {
      // silent by design
    }
  }

  // 3. Initial render
  setTimeout(() => {
    if (typeof UI.render === "function") {
      UI.render();
    }
  }, 0);

  // 4. Background systems
  startBroadcastPolling();

  startRenderLoop();
  setInterval(pingAdminListener, 8000);


}

/* ------------------------------------------------------------
   BROADCAST POLLING (DELEGATED AUTHORITY)
------------------------------------------------------------ */

function startBroadcastPolling() {
  if (pollTimer) return;

  pollTimer = setInterval(() => {
    try {
      const raw = localStorage.getItem(CORE.BROADCAST_KEY);
      if (!raw || raw === lastRawSeen) return;

      lastRawSeen = raw;

      // 🔒 TTL, version, authority handled by ENGINE
      if (typeof ENGINE_ROUTER.ingestBroadcast === "function") {
        ENGINE_ROUTER.ingestBroadcast(raw);
      }
    } catch {
      // silent by design
    }
  }, POLL_INTERVAL);
}

/* ------------------------------------------------------------
   USER GESTURE UNLOCK (AUTOPLAY)
------------------------------------------------------------ */

document.addEventListener(
  "pointerdown",
  () => {
    try {
      ENGINE_ROUTER.confirmUserGesture?.();
      window.__RESONANT_USER_GESTURE__ = true;
    } catch {}
  },
  { once: true }
);


/* ------------------------------------------------------------
   START
------------------------------------------------------------ */

boot();

/* ============================================================
   END · app.boot.js
===============================================================

CANON NOTES
• BOOT sets initial OFF AIR explicitly
• BOOT never interprets broadcast validity
• BOOT never touches audio
• ENGINE is sole authority for TTL & state
• Render tick is deterministic (radio-grade)
• Autoplay unlock is passive & isolated
=============================================================== */
