/* ============================================================
   RESONANT · ADMIN CORE
   FILE: admin.core.js
   VERSION: 20.4.2-CORE-CANON-FINAL
   STATUS: AUTHORITY SEALED · BROADCAST GRADE · 24/7 READY
============================================================ */

"use strict";

/* ============================================================
   CONSTANTS
============================================================ */

const PLAYLIST_KEY  = "resonant_admin_playlist_v1";
const BROADCAST_KEY = "resonant_broadcast_state_v3";
const SNAPSHOT_KEY  = "resonant_broadcast_snapshot_v1";

const EVENT_LOG_LIMIT = 300;
const LEASE_MS = 30 * 1000;

const ADMIN_INSTANCE_ID =
  sessionStorage.getItem("resonant_admin_id") ||
  crypto.randomUUID();

sessionStorage.setItem("resonant_admin_id", ADMIN_INSTANCE_ID);

/* ============================================================
   METADATA
============================================================ */

export const CORE_VERSION = "20.4.2-CORE-CANON-FINAL";

/* ============================================================
   GLOBAL STATE (SSOT)
============================================================ */

const STATE = {
  adminBooted: false,
  adminMode: "idle",
  adminId: null,
  adminSessionStartedAt: null,

  playlist: [],
  currentIndex: null,
  currentTrackId: null,
  anchorIndexAtStart: null,
  randomMode: false,

  startedAt: null,
  currentMeta: null,

  finishing: false,

  manualPlayIssued: false,
  lastAdvanceReason: null,

  // 🔹 LISTENERS (PATCH 7.3)
  listeners: 0,
  listenersMap: Object.create(null),

  health: {
    owner: null,
    leaseUntil: null,
    lastHeartbeatAt: null,
    status: "idle"
  },

  eventLog: [],
  playlistUndo: null,
  lastAdvanceAt: null,
};

/* ============================================================
   EVENT BUS
============================================================ */

const listeners = {};

export function on(event, fn) {
  (listeners[event] ||= []).push(fn);
}

function emit(event, payload) {
  (listeners[event] || []).forEach(fn => {
    try { fn(payload, getState()); } catch {}
  });
}
/* ============================================================
   LISTENERS — HEARTBEAT AUTHORITY
   PATCH 7.3
============================================================ */

const LISTENER_TTL = 20_000;

export function reportListenerPing(id) {
  if (!id || !STATE.adminBooted) return;

  STATE.listenersMap[id] = Date.now();
  cleanupListeners();
}


function cleanupListeners() {
  const now = Date.now();
  let count = 0;

  for (const id in STATE.listenersMap) {
    if (now - STATE.listenersMap[id] > LISTENER_TTL) {
      delete STATE.listenersMap[id];
    } else {
      count++;
    }
  }

  if (STATE.listeners !== count) {
  setState(
    { listeners: count },
    "listeners-update"
  );
}

}

/* ============================================================
   STATE ACCESS
============================================================ */

export function getState() {
  return {
    ...STATE,
    playlist: [...STATE.playlist],
    health: { ...STATE.health }
  };
}

// ============================================================
// STEP 1 CANON — OPERATOR AUTHORITY
// Rule: If admin explicitly booted, operator CAN operate.
// Lease & health are informational only in STEP 1.
// ============================================================

export const canOperate = () => {
  return STATE.adminBooted === true;
};

export const canAdvance = () =>
  canOperate() && !STATE.finishing;

/* ============================================================
   LEASE — AUTHORITY CONTROL (CANON)
============================================================ */

export function hasLease() {
  return (
    STATE.health.owner === ADMIN_INSTANCE_ID &&
    typeof STATE.health.leaseUntil === "number" &&
    STATE.health.leaseUntil > Date.now()
  );
}

export function acquireLease() {
  const now = Date.now();

  if (
    !STATE.health.owner ||
    STATE.health.leaseUntil === null ||
    STATE.health.leaseUntil < now
  ) {
    setState(
      {
        health: {
          ...STATE.health,
          owner: ADMIN_INSTANCE_ID,
          leaseUntil: now + LEASE_MS,
          lastHeartbeatAt: now,
          status: "ok"
        }
      },
      "lease-acquire"
    );
    return true;
  }

  return STATE.health.owner === ADMIN_INSTANCE_ID;
}

export function renewLease() {
  if (!hasLease()) return false;

  setState(
    {
      health: {
        ...STATE.health,
        leaseUntil: Date.now() + LEASE_MS,
        lastHeartbeatAt: Date.now(),
        status: "ok"
      }
    },
    "lease-renew"
  );

  return true;
}

/* ============================================================
   STATE MUTATOR (ATOMIC)
============================================================ */

export function setState(patch = {}, reason = "unknown") {
  if (!patch || typeof patch !== "object") return;

  if (
    STATE.adminBooted &&
    Object.prototype.hasOwnProperty.call(patch, "adminMode")
  ) {
    delete patch.adminMode;
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "startedAt") &&
    !["play-start", "advance-start", "stop"].includes(reason)
  ) {
    delete patch.startedAt;
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "currentMeta") &&
    !["play-start", "advance-start", "stop"].includes(reason)
  ) {
    delete patch.currentMeta;
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "finishing") &&
    !reason.startsWith("begin:") &&
    !reason.startsWith("end:")
  ) {
    delete patch.finishing;
  }

  if (!STATE.adminBooted && reason !== "admin-init") return;

  const next = {};
  let playlistTouched = false;
  let playlistUndoExplicit = false;

  for (const k of Object.keys(patch)) {
    if (k in STATE) {
      next[k] = patch[k];
      if (k === "playlist") playlistTouched = true;
      if (k === "playlistUndo") playlistUndoExplicit = true;
    }
  }

  if (playlistTouched && !playlistUndoExplicit && !STATE.finishing) {
    STATE.playlistUndo = structuredClone(STATE.playlist);
  }

  Object.assign(STATE, next);

  if (playlistTouched && STATE.currentTrackId) {
    const idx = STATE.playlist.findIndex(t => t?.id === STATE.currentTrackId);
    if (idx >= 0) STATE.currentIndex = idx;
  }

  logEvent(reason, next);
  emit("state", { reason, patch: next });
}

/* ============================================================
   EVENT LOG
============================================================ */

function logEvent(reason, patch) {
  STATE.eventLog.push({
    ts: Date.now(),
    reason,
    keys: Object.keys(patch || {}),
    trackId: STATE.currentTrackId,
    index: STATE.currentIndex,
    status: STATE.startedAt ? "live" : "offair"
  });

  if (STATE.eventLog.length > EVENT_LOG_LIMIT) {
    STATE.eventLog.shift();
  }
}

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
  rehydrateFromBroadcast();
}

/* ============================================================
   PLAYLIST LOAD / SAVE
============================================================ */

function loadPlaylist() {
  if (STATE.startedAt) return;

  try {
    const raw = localStorage.getItem(PLAYLIST_KEY);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      setState({ playlist: parsed.map(normalizeTrack) }, "playlist-load-local");
      return;
    }
  } catch {}

  if (Array.isArray(window.PLAYLIST)) {
    setState(
      { playlist: structuredClone(window.PLAYLIST).map(normalizeTrack) },
      "playlist-seed-official"
    );
    savePlaylist();
  }
}

export function savePlaylist() {
  try {
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(STATE.playlist));
  } catch {}
}

/* ============================================================
   PLAYLIST UNDO
============================================================ */

export function undoPlaylist(reason = "undo") {
  if (!canOperate() || STATE.finishing || !STATE.playlistUndo) return false;

  const prev = structuredClone(STATE.playlistUndo);

  setState(
    {
      playlist: prev,
      playlistUndo: null
    },
    `playlist-undo:${reason}`
  );

  savePlaylist();
  return true;
}

/* ============================================================
   TRACK UPDATE
============================================================ */

export function updateTrackField(index, path, value) {
  if (!canOperate() || STATE.finishing) return false;

  const track = STATE.playlist[index];
  if (!track) return false;

  const next = structuredClone(track);
  const parts = path.split(".");
  let ref = next;

  while (parts.length > 1) {
    const k = parts.shift();
    ref[k] ||= {};
    ref = ref[k];
  }

  ref[parts[0]] = value;

  const playlist = [...STATE.playlist];
  playlist[index] = normalizeTrack(next);

  setState({ playlist }, "playlist-edit-field");
  savePlaylist();
  return true;
}

/* ============================================================
   TRACK NORMALIZATION
============================================================ */

export function normalizeTrack(raw = {}) {
  const s = v => (typeof v === "string" ? v.trim() : "");

  const contributorName = s(raw.contributor?.name || raw.contributor);

  return {
    id: raw.id || crypto.randomUUID(),
    title: s(raw.title),
    artist: { name: s(raw.artist?.name || raw.artist) },
    contributor: contributorName ? { name: contributorName } : null,
    artwork: raw.artwork || null,
    source:
      typeof raw.source === "object" && raw.source !== null
        ? raw.source
        : typeof raw.source === "string"
          ? { platform: "url", url: raw.source }
          : null,
    duration: Number.isFinite(raw.duration) ? raw.duration : 0,
    meta: {
      inferredContributor: !!raw.meta?.inferredContributor
    }
  };
}

/* ============================================================
   PLAYBACK CORE
============================================================ */

function setCurrentIndex(index) {
  const track = STATE.playlist[index];
  if (!track) return false;

  STATE.currentIndex = index;
  STATE.currentTrackId = track.id;
  STATE.anchorIndexAtStart = index;

  STATE.currentMeta = {
    title: track.title || "Untitled",
    artist: track.artist || { name: "Unknown" },
    contributor: track.contributor || null,
    artwork: track.artwork || null,
    source: track.source || null,
    duration:
      Number.isFinite(track.duration) && track.duration > 0
        ? (track.duration > 1000 ? track.duration : track.duration * 1000)
        : 60 * 60 * 1000
  };

  return true;
}

export function playIndex(index, reason = "manual") {
  if (!canOperate() || STATE.finishing) return false;


  const track = STATE.playlist[index];
  if (!track || !track.source) return false;

  if (!begin("play")) return false;

  try {
    if (!setCurrentIndex(index)) return false;

  setState(
  {
    startedAt: Date.now(),
    manualPlayIssued: true,
    lastAdvanceReason: "manual"
  },
  "play-start"
);

// 🔒 resetear cooldown en play manual
STATE.lastAdvanceAt = null;

persistBroadcast();
return true;


  } finally {
    end("play-exit");
  }
}

function resolveNextIndex() {
  if (!STATE.playlist.length) return null;
  if (
    STATE.currentIndex === null ||
    !Number.isFinite(STATE.currentIndex) ||
    STATE.currentIndex >= STATE.playlist.length - 1
  ) return 0;

  return STATE.currentIndex + 1;
}

export function safeAdvance(reason = "auto") {
  if (!canAdvance() || !STATE.playlist.length) return false;

  const now = Date.now();
  if (STATE.lastAdvanceAt && now - STATE.lastAdvanceAt < 1500) {
    return false; // ⛔ cooldown duro
  }

  if (!begin("advance")) return false;

  try {
    const next = STATE.randomMode
      ? Math.floor(Math.random() * STATE.playlist.length)
      : resolveNextIndex();

    if (next === null) return false;
    if (!setCurrentIndex(next)) return false;

    setState({
  startedAt: Date.now(),
  manualPlayIssued: false,
  lastAdvanceReason: reason
}, "advance-start");

// ⛔ marcar avance para cooldown
STATE.lastAdvanceAt = Date.now();

persistBroadcast();
return true;

  } finally {
    end("advance-exit");
  }
}

export function watchdogAdvance() {
  return false;
}


/* ============================================================
   TRANSITION LOCKS
============================================================ */

function begin(reason) {
  if (STATE.finishing) return false;
  setState({ finishing: true }, `begin:${reason}`);
  return true;
}

function end(reason) {
  setState({ finishing: false }, `end:${reason}`);
}

/* ============================================================
   EMERGENCY STOP
============================================================ */

export function emergencyStop(reason = "stop") {
  if (!begin("emergency")) return false;

  setState({
    startedAt: null,
    currentIndex: null,
    currentTrackId: null,
    currentMeta: null,
    anchorIndexAtStart: null,
    manualPlayIssued: false,
    lastAdvanceReason: reason
  }, "stop");

  try {
    localStorage.setItem(
      BROADCAST_KEY,
      JSON.stringify({
        version: 3,
        owner: STATE.adminId,
        status: "offair",
        trackId: null,
        url: null,
        startedAt: null,
        duration: null,
        meta: null,
        leaseUntil: Date.now() + LEASE_MS,
        updatedAt: Date.now()
      })
    );

    localStorage.removeItem(SNAPSHOT_KEY);
window.dispatchEvent(
  new CustomEvent("resonant:broadcast", {
    detail: {
      version: 3,
      updatedAt: Date.now()
    }
  })
);
  } catch {}

  end("emergency-exit");
  return true;
}

/* ============================================================
   BROADCAST PERSIST / HEALTH
============================================================ */

function persistBroadcast() {
  const now = Date.now();
  if (STATE.startedAt && !STATE.currentMeta?.source) return;

  try {
    localStorage.setItem(
      BROADCAST_KEY,
      JSON.stringify({
        version: 3,
        owner: STATE.adminId,
        status: STATE.startedAt ? "live" : "offair",
        trackId: STATE.currentTrackId || null,
        url: STATE.currentMeta?.source || null,
        startedAt: STATE.startedAt || null,
        duration: Number.isFinite(STATE.currentMeta?.duration)
          ? STATE.currentMeta.duration
          : null,
        meta: STATE.currentMeta
          ? {
              title: STATE.currentMeta.title || "",
              artist:
                typeof STATE.currentMeta.artist === "string"
                  ? STATE.currentMeta.artist
                  : STATE.currentMeta.artist?.name || "",
              contributor:
                typeof STATE.currentMeta.contributor === "string"
                  ? STATE.currentMeta.contributor
                  : STATE.currentMeta.contributor?.name || null,
              artwork: STATE.currentMeta.artwork || null
            }
          : null,
        leaseUntil: now + LEASE_MS,
        updatedAt: now
      })
    );

    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify(getBroadcastSnapshot())
    );

window.dispatchEvent(
  new CustomEvent("resonant:broadcast", {
    detail: {
      version: 3,
      updatedAt: now
    }
  })
);
  } catch {}
}

export function syncHealthFromBroadcast() {
  try {
    const raw = localStorage.getItem(BROADCAST_KEY);
    if (!raw) throw 0;

    const b = JSON.parse(raw);
    const now = Date.now();

    let status = "ok";
    if (!b.updatedAt) status = "degraded";
    else if (b.leaseUntil && b.leaseUntil < now) status = "degraded";
    else if (b.status === "offair") status = "idle";

    // 🔒 Do not override local lease owner
if (b.owner && b.owner !== ADMIN_INSTANCE_ID) return;

setState({
  health: {
    owner: ADMIN_INSTANCE_ID,
    leaseUntil: b.leaseUntil || null,
    lastHeartbeatAt: b.updatedAt || null,
    status
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

/* ============================================================
   REHYDRATION (BOOT RECOVERY)
============================================================ */

function rehydrateFromBroadcast() {
  try {
    if (!STATE.adminBooted) return;

    const raw = localStorage.getItem(BROADCAST_KEY);
    if (!raw) return;

    const b = JSON.parse(raw);
    if (b.status !== "live" || !b.trackId) return;

    const idx = STATE.playlist.findIndex(t => t.id === b.trackId);
    if (idx < 0) return;

    // SOLO sincronizar índice, NO arrancar playback
    STATE.currentIndex = idx;
    STATE.currentTrackId = b.trackId;
    STATE.currentMeta = b.meta;
    STATE.anchorIndexAtStart = idx;
  } catch {}
}


/* ============================================================
   SNAPSHOT
============================================================ */

export function getBroadcastSnapshot() {
  if (!STATE.startedAt || !STATE.currentMeta) return null;

  return {
    startedAt: STATE.startedAt,
    index: STATE.currentIndex,
    track: {
      id: STATE.currentTrackId,
      ...STATE.currentMeta
    }
  };
}

/* ============================================================
   PLAYLIST OPS API
============================================================ */

export function replacePlaylist(playlist, reason = "playlist-replace") {
  if (!canOperate() || STATE.finishing || !Array.isArray(playlist)) return false;

  setState(
    { playlist: playlist.map(normalizeTrack) },
    reason
  );

  savePlaylist();
  return true;
}

/* ============================================================
   BACKGROUND TASKS
============================================================ */

setInterval(() => {
  if (STATE.adminBooted) syncHealthFromBroadcast();
}, 1000);

setInterval(() => {
  if (STATE.adminBooted && hasLease()) renewLease();
}, LEASE_MS / 2);
setInterval(() => {
  
  if (STATE.adminBooted) cleanupListeners();
}, 5_000);

/* ============================================================
   END admin.core.js · CANON SEALED
============================================================ */
