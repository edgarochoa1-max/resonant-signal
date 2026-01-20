/* ============================================================
   RESONANT · ADMIN CORE
   FILE: admin.core.js
   VERSION: 20.3.2-CORE-STABLE-FREEZE
   STATUS: AUTHORITY SEALED · BROADCAST GRADE
============================================================ */

"use strict";

/* ============================================================
   CONSTANTS
============================================================ */

const PLAYLIST_KEY  = "resonant_admin_playlist_v1";
const SESSION_KEY   = "resonant_admin_session_v1";
const BROADCAST_KEY = "resonant_broadcast_state_v2";
const SNAPSHOT_KEY  = "resonant_broadcast_snapshot_v1";

const EVENT_LOG_LIMIT = 300;
const SESSION_TTL = 1000 * 60 * 60 * 6;
const LEASE_MS = 30 * 1000;

/* ============================================================
   METADATA
============================================================ */

export const CORE_VERSION = "20.3.2-CORE-STABLE-FREEZE";

/* ============================================================
   GLOBAL STATE (SSOT)
============================================================ */

export const STATE = Object.seal({

  /* ADMIN */
  adminBooted: false,
  adminMode: "idle",
  adminId: null,
  adminSessionStartedAt: null,

  /* PLAYLIST */
  playlist: [],
  currentIndex: null,
  currentTrackId: null,
  randomMode: false,

  /* LIVE */
  startedAt: null,
  currentMeta: null,

  /* LOCKS */
  finishing: false,

  /* CONTROL */
  manualPlayIssued: false,
  lastAdvanceReason: null,

  /* HEALTH */
  health: {
    owner: null,
    leaseUntil: null,
    lastHeartbeatAt: null,
    status: "idle"
  },

  /* DEBUG */
  eventLog: [],

  /* UNDO */
  playlistUndo: null
});

/* ============================================================
   EVENT BUS
============================================================ */

const listeners = {};

export function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
}

function emit(event, payload) {
  (listeners[event] || []).forEach(fn => {
    try { fn(payload, getState()); } catch {}
  });
}

/* ============================================================
   EVENT LOG
============================================================ */

function logEvent(reason, patch) {
  STATE.eventLog.push({
    ts: Date.now(),
    reason,
    keys: Object.keys(patch || {})
  });

  if (STATE.eventLog.length > EVENT_LOG_LIMIT) {
    STATE.eventLog.shift();
  }
}

/* ============================================================
   STATE MUTATOR (ATOMIC)
============================================================ */

export function setState(patch = {}, reason = "unknown") {
  if (!patch || typeof patch !== "object") return;

  if (!STATE.adminBooted && reason !== "admin-init") return;

  const next = {};
  for (const k of Object.keys(patch)) {
    if (k in STATE) next[k] = patch[k];
  }

  if (next.playlist && !STATE.finishing) {
    STATE.playlistUndo = JSON.parse(JSON.stringify(STATE.playlist));
  }

  Object.assign(STATE, next);

  if (next.playlist && STATE.currentTrackId && !STATE.finishing) {
    const idx = STATE.playlist.findIndex(t => t.id === STATE.currentTrackId);
    STATE.currentIndex = idx !== -1 ? idx : null;
  }

  logEvent(reason, next);
  emit("state", { reason, patch: next });
}

/* ============================================================
   GETTERS
============================================================ */

export const getState = () => structuredClone(STATE);
export const canOperate = () => STATE.adminBooted && STATE.adminMode === "operator";
export const canAdvance = () => canOperate() && !STATE.finishing;

/* ============================================================
   SESSION
============================================================ */

export function initAdminSession(id = "ADMIN", mode = "operator") {
  setState({
    adminBooted: true,
    adminId: id,
    adminMode: mode,
    adminSessionStartedAt: Date.now(),
    finishing: false
  }, "admin-init");

  loadPlaylist();
}

/* ============================================================
   PLAYLIST
============================================================ */

export function loadPlaylist() {
  if (STATE.startedAt) return;

  try {
    const raw = localStorage.getItem(PLAYLIST_KEY);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      setState({
        playlist: parsed,
        currentIndex: null,
        currentTrackId: null,
        currentMeta: null
      }, "playlist-load-local");
      return;
    }
  } catch {}

  if (!Array.isArray(window.PLAYLIST)) return;

  setState({
    playlist: structuredClone(window.PLAYLIST),
    currentIndex: null,
    currentTrackId: null,
    currentMeta: null
  }, "playlist-seed-official");

  savePlaylist();
}

export function savePlaylist() {
  try {
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(STATE.playlist));
  } catch {}
}

/* ============================================================
   TRANSITIONS
============================================================ */

function begin(reason) {
  if (STATE.finishing) return false;

  setState(
    { finishing: true },
    `begin:${reason}`
  );

  return true;
}

function end(reason) {
  setState(
    { finishing: false },
    `end:${reason}`
  );
}


/* ============================================================
   PLAYBACK (GUARDED)
============================================================ */

function setCurrentIndex(index) {
  if (typeof index !== "number") return false;
  if (index < 0 || index >= STATE.playlist.length) return false;

  const track = STATE.playlist[index];
  if (!track) return false;

  STATE.currentIndex = index;
  STATE.currentTrackId = track.id;
  STATE.currentMeta = {
    title: track.title || "Untitled",
    artist: track.artist || { name: "Unknown Artist" },
    contributor: track.contributor || null,
    artwork: track.artwork || null,
    source: track.source || null,
    duration:
      Number.isFinite(track.duration) && track.duration > 0
        ? track.duration * 1000
        : 60 * 60 * 1000
  };

  return true;
}

export function playIndex(index, reason = "manual") {
  if (!canAdvance()) return false;
  if (!begin("play-index")) return false;

  try {
    if (!setCurrentIndex(index)) return false;

    setState({
      startedAt: Date.now(),
      manualPlayIssued: reason === "manual"
    }, "play-start");

    persistBroadcast();

    return true;
  } finally {
    end("play-index-exit");
  }
}

export function safeAdvance(reason = "auto") {
  if (!canAdvance()) return false;
  if (!STATE.playlist.length) return false;
  if (!begin("advance")) return false;

  try {
    const next = STATE.randomMode
      ? Math.floor(Math.random() * STATE.playlist.length)
      : (STATE.currentIndex ?? -1) + 1;

    if (!setCurrentIndex(next >= STATE.playlist.length ? 0 : next)) return false;

    setState({
      startedAt: Date.now(),
      manualPlayIssued: false
    }, "advance-start");

    persistBroadcast();
    return true;
  } finally {
    end("advance-exit");
  }
}

/* ============================================================
   EMERGENCY
============================================================ */

export function emergencyStop(reason = "stop") {
  if (!begin("emergency")) return false;

  setState({
    startedAt: null,
    currentIndex: null,
    currentTrackId: null,
    currentMeta: null,
    manualPlayIssued: false
  }, "stop");

  try {
    localStorage.removeItem(BROADCAST_KEY);
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {}

  end("emergency-exit");
  return true;
}

/* ============================================================
   BROADCAST PERSIST
============================================================ */

function persistBroadcast() {
  try {
    const now = Date.now();
    localStorage.setItem(
      BROADCAST_KEY,
      JSON.stringify({
        owner: STATE.adminId,
        startedAt: STATE.startedAt,
        currentIndex: STATE.currentIndex,
        randomMode: STATE.randomMode,
        leaseUntil: now + LEASE_MS,
        updatedAt: now
      })
    );

    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({
        startedAt: STATE.startedAt,
        currentIndex: STATE.currentIndex,
        trackId: STATE.currentTrackId,
        currentMeta: STATE.currentMeta
      })
    );
  } catch {}
}

/* ============================================================
   HEALTH (CORE ONLY)
============================================================ */

export function syncHealthFromBroadcast() {
  try {
    const raw = localStorage.getItem(BROADCAST_KEY);
    if (!raw) throw 0;

    const b = JSON.parse(raw);
    const now = Date.now();

    setState({
      health: {
        owner: b.owner ?? null,
        leaseUntil: b.leaseUntil ?? null,
        lastHeartbeatAt: b.updatedAt ?? null,
        status: b.leaseUntil < now ? "degraded" : "ok"
      }
    }, "health-sync");
  } catch {
    setState({
      health: {
        owner: null,
        leaseUntil: null,
        lastHeartbeatAt: null,
        status: "lost"
      }
    }, "health-lost");
  }
}

setInterval(() => {
  if (!STATE.adminBooted) return;
  syncHealthFromBroadcast();
}, 1000);

/* ============================================================
   UNDO / RESET
============================================================ */

export function undoPlaylist() {
  if (!STATE.playlistUndo || STATE.finishing) return false;
  setState({ playlist: STATE.playlistUndo }, "playlist-undo");
  STATE.playlistUndo = null;
  return true;
}

export function resetPlaylistToCanonical() {
  if (STATE.startedAt) return false;
  if (!Array.isArray(window.PLAYLIST)) return false;

  setState({
    playlist: structuredClone(window.PLAYLIST),
    currentIndex: null,
    currentTrackId: null,
    currentMeta: null
  }, "playlist-reset");

  savePlaylist();
  return true;
}
/* ============================================================
   SNAPSHOT (UI READ-ONLY)
============================================================ */

export function getBroadcastSnapshot() {
  if (!STATE.startedAt || !STATE.currentMeta) return null;

  return {
    startedAt: STATE.startedAt,
    index: STATE.currentIndex,
    track: {
      id: STATE.currentTrackId,
      title: STATE.currentMeta.title,
      artist: STATE.currentMeta.artist,
      contributor: STATE.currentMeta.contributor,
      artwork: STATE.currentMeta.artwork,
      source: STATE.currentMeta.source,
      duration: STATE.currentMeta.duration
    }
  };
}


/* ============================================================
   END admin.core.js
============================================================ */
