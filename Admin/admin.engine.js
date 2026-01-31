/* ============================================================
   RESONANT · ADMIN ENGINE
   FILE: admin.engine.js
   VERSION: 20.4.2-ENGINE-CANON-FINAL
   STATUS: CORE-ALIGNED · BROADCAST-GRADE · 24/7 READY
============================================================ */

"use strict";

console.info("🔥 RESONANT ADMIN ENGINE — CANON FINAL");
window.__ENGINE_LOADED__ = true;

import * as CORE from "./admin.core.js";

/* ============================================================
   CONSTANTS
============================================================ */

const HEARTBEAT_INTERVAL = 1000;
const WATCHDOG_INTERVAL  = 2000;
const DEAD_AIR_GRACE     = 3000;

/* ============================================================
   INTERNAL TIMERS
============================================================ */

let heartbeat = null;
let watchdog  = null;
let lastAudioPulse = Date.now();

/* ============================================================
   WATCHDOG — CORE RECOVERY DRIVER
============================================================ */

function startWatchdog() {
  if (watchdog) return;
  watchdog = setInterval(watchdogTick, WATCHDOG_INTERVAL);
}

function stopWatchdog() {
  if (!watchdog) return;
  clearInterval(watchdog);
  watchdog = null;
}

function watchdogTick() {
  // PATCH 6 CANON:
  // Watchdog advance DISABLED.
  // Operator-only transport.
  return;
}


/* ============================================================
   HEARTBEAT — SINGLE CLOCK
============================================================ */

function canHeartbeat(state) {
  return (
    CORE.canOperate() &&
    Number.isFinite(state.startedAt) &&
    state.currentTrackId &&
    !state.finishing &&
    Number.isFinite(state.currentMeta?.duration)
  );
}

function startHeartbeat() {
  if (heartbeat) return;

  const state = CORE.getState();
  if (!canHeartbeat(state)) return;

  heartbeat = setInterval(engineTick, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (!heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = null;
}

/* ============================================================
   DEAD AIR GUARD
============================================================ */

function markAudioPulse() {
  lastAudioPulse = Date.now();
}

function deadAirCheck(state) {
  // STEP 1 CANON:
  // Dead-air recovery disabled.
  // Operator controls all transitions.
  return false;
}

/* ============================================================
   HEARTBEAT TICK
============================================================ */

function engineTick() {
  const state = CORE.getState();

  if (!canHeartbeat(state)) {
    stopHeartbeat();
    return;
  }

  if (deadAirCheck(state)) return;

  markAudioPulse();

}

/* ============================================================
   PLAYBACK CONTROL (UI → ENGINE → CORE)
============================================================ */

export function playIndex(index, reason = "manual") {
  if (!CORE.canOperate()) return false;
  const ok = CORE.playIndex(index, reason);
  if (ok) startHeartbeat();
  return ok;
}

export function safeAdvance(reason = "manual-next") {
  if (!CORE.canOperate()) return false;
  const ok = CORE.safeAdvance(reason);
  if (ok) startHeartbeat();
  return ok;
}

export function emergencyStop(reason = "manual-stop") {
  if (!CORE.canOperate()) return false;
  CORE.emergencyStop(reason);
  stopHeartbeat();
  return true;
}

/* ============================================================
   PLAYLIST OPS (CORE AUTHORITY)
============================================================ */

export function shufflePlaylist() {
  const state = CORE.getState();
  if (!CORE.canOperate() || state.finishing) return;

  const shuffled = [...state.playlist]
    .map(v => ({ v, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ v }) => v);

  CORE.replacePlaylist(shuffled, "playlist-shuffle");
}

export function deleteTrack(index) {
  const state = CORE.getState();
  if (!CORE.canOperate() || state.finishing) return;

  const wasLive = state.playlist[index]?.id === state.currentTrackId;
  const playlist = [...state.playlist];
  playlist.splice(index, 1);

  CORE.replacePlaylist(playlist, "playlist-delete");

  if (wasLive) CORE.safeAdvance("delete-live");
}

export function moveTrackUp(index) {
  const state = CORE.getState();
  if (!CORE.canOperate() || state.finishing || index <= 0) return;

  const playlist = [...state.playlist];
  [playlist[index - 1], playlist[index]] =
    [playlist[index], playlist[index - 1]];

  CORE.replacePlaylist(playlist, "playlist-move-up");
}

export function moveTrackDown(index) {
  const state = CORE.getState();
  if (!CORE.canOperate() || state.finishing) return;
  if (index >= state.playlist.length - 1) return;

  const playlist = [...state.playlist];
  [playlist[index], playlist[index + 1]] =
    [playlist[index + 1], playlist[index]];

  CORE.replacePlaylist(playlist, "playlist-move-down");
}

/* ============================================================
   VISIBILITY SAFETY
============================================================ */

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopHeartbeat();
  else if (canHeartbeat(CORE.getState())) startHeartbeat();
});

/* ============================================================
   BOOT
============================================================ */

// 🔑 ENGINE READY HANDSHAKE
export function onAdminReady() {
  const state = CORE.getState();

  // Start heartbeat if already live
  if (
    CORE.canOperate() &&
    state.currentTrackId &&
    Number.isFinite(state.startedAt)
  ) {
    startHeartbeat();
  }
}

/* ============================================================
   END admin.engine.js · CANON SEALED
============================================================ */
