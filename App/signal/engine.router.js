/* ============================================================
   RESONANT · ENGINE ROUTER
===============================================================

ROLE
• Internal engine dispatcher
• Routes broadcast events to channel engines
• Forwards user intent to active engine
• NO UI
• NO DOM
• NO audio logic
• NO state ownership

PAIRING
• app.core.js
• app.engine.js        (SETS)
• app.engine.tracks.js (future)
• app.engine.video.js  (future)

STATUS
• CANON
• HEADEND-GRADE
• MULTICHANNEL-READY (PASSIVE)

// 🔒 FREEZE — ROUTER INVARIANTS
// - Router is stateless
// - Router never mutates CORE
// - Router never controls playback
// - Router never touches UI / DOM
// - Router only validates + delegates
// Any change below requires version bump

=============================================================== */

"use strict";

import * as CORE from "./app.core.js";
import * as EngineSETS from "./app.engine.js";

/* ------------------------------------------------------------
   ENGINE REGISTRY (PASSIVE)
------------------------------------------------------------ */

const ENGINE_REGISTRY = Object.freeze({
  SETS: EngineSETS
  // TRACKS: EngineTRACKS (future)
  // VIDEO: EngineVIDEO  (future)
});

/* ------------------------------------------------------------
   ENGINE RESOLUTION (BROADCAST-FIRST)
------------------------------------------------------------ */

function resolveEngineFromState(state) {
  const key = (state?.channel || "SETS").toUpperCase();
  return ENGINE_REGISTRY[key] || null;
}


/* ------------------------------------------------------------
   BROADCAST INGEST (GLOBAL ENTRY)
------------------------------------------------------------ */

export function ingestBroadcast(raw) {
  const state = CORE.safeParseBroadcast(raw);
  if (!state) return;

  // 🔒 AUTHORITY GUARD (ADMIN-TRUSTED)
if (
  state.authority !== undefined &&
  state.authority !== "admin"
) return;


  // 🔒 VERSION HARD GUARD
  if (state.version !== CORE.EXPECTED_BROADCAST_VERSION) return;

  const engine = resolveEngineFromState(state);
  if (!engine || typeof engine.ingestBroadcast !== "function") return;

  // NOTE:
  // Router forwards RAW broadcast only.
  // Engines decide parsing depth, TTL handling, and behavior.
  engine.ingestBroadcast(raw);
}

/* ------------------------------------------------------------
   USER INTENT (FORWARD ONLY)
------------------------------------------------------------ */

export function toggleUserMute() {
  const channel = CORE.getActiveChannelState?.();
  const engine = resolveEngineFromState(channel || {});
  if (engine && typeof engine.toggleUserMute === "function") {
    engine.toggleUserMute();
  }
}

export function confirmUserGesture() {
  const channel = CORE.getActiveChannelState?.();
  const engine = resolveEngineFromState(channel || {});
  if (engine && typeof engine.confirmUserGesture === "function") {
    engine.confirmUserGesture();
  }
}

export function forwardUserIntent(intent) {
  const channel = CORE.getActiveChannelState?.();
  const engine = resolveEngineFromState(channel || {});
  if (!engine || typeof engine.onUserIntent !== "function") return;
  engine.onUserIntent(intent);
}


/* ------------------------------------------------------------
   DEBUG HOOK (DEV ONLY · NON-AUTH)
------------------------------------------------------------ */

if (typeof window !== "undefined" && location.hostname === "localhost") {
  window.__RESONANT_DEBUG_INGEST__ = ingestBroadcast;
}

/* ============================================================
   END · engine.router.js
===============================================================

CANON NOTES
• Router is stateless
• Router never mutates CORE
• Router never controls playback
• Router never knows about UI
• Engines own behavior
• CORE owns description
• TTL is enforced by ENGINE, not router
=============================================================== */
