/* ============================================================
   RESONANT · LISTENER CORE
===============================================================

ROLE
• Single source of truth (runtime state)
• Configuration & constants
• Pure helpers
• Diagnostics & descriptors
• NO audio
• NO DOM
• NO timers
• NO side effects

PAIRING
• app.engine.js  → consumes & mutates state
• app.ui.js      → reads state only
• app.boot.js    → initializes lifecycle

STATUS
• CANON
• STABLE
• BROADCAST-GRADE
• HEADEND-READY
• SAFE TO EXTEND (versioned only)
=============================================================== */

"use strict";

/* ------------------------------------------------------------
   CONFIG · PROTOCOL
------------------------------------------------------------ */

export const BROADCAST_KEY = "resonant_broadcast_state_v3";
export const SNAPSHOT_KEY  = "resonant_broadcast_snapshot_v1";

export const EXPECTED_BROADCAST_VERSION = 3;
export const BROADCAST_TTL = 30_000;

/* ------------------------------------------------------------
   CONFIG · SYNC / DRIFT
------------------------------------------------------------ */

export const SYNC_LIVE = 1000;

export const DRIFT_SOFT = 1200;
export const DRIFT_HARD = 3500;

export const LIVE_GRACE = 5000;

/* ------------------------------------------------------------
   CONFIG · WATCHDOG
------------------------------------------------------------ */

export const WATCHDOG_INTERVAL = 15_000;
export const WATCHDOG_TIMEOUT  = 20_000;
export const WATCHDOG_MAX_RESTARTS = 3;

export const WATCHDOG_BACKOFF_BASE = 4000;
export const WATCHDOG_BACKOFF_MAX  = 30_000;

/* ------------------------------------------------------------
   CONFIG · IDENTITY / METRICS
------------------------------------------------------------ */

export const CLIENT_ID_KEY = "resonant_client_id_v1";

/* ------------------------------------------------------------
   CORE STATE (RUNTIME ONLY)
------------------------------------------------------------ */

const _state = {
  phase: "offair",
  channel: "SETS",

  url: null,
  startedAt: null,
  currentDuration: null,

  lastBroadcastSeenAt: 0,
  lastLiveAt: 0,
  updatedAt: 0,

  sourceMode: "unknown",

  artist: null,
  artistSlug: "",

  title: null,

  contributor: null,
  contributorSlug: "",

  artwork: null,

  activeAdminId: null,

  userIntentMuted: false,
  awaitingUserResume: false,

  lastAudioAt: 0,

  forceOffAirUntil: 0,

  watchdogRestarts: 0,
  watchdogCooldownUntil: 0,

  currentSession: null,
  totalLiveJoins: 0,
  totalOffAirEvents: 0,

  lastTransitionReason: "boot-offair",
  lastOffAirReason: "boot",
  lastErrorType: null
};

export const state = Object.seal(_state);

/* ------------------------------------------------------------
   IDENTITY
------------------------------------------------------------ */

export function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export const CLIENT_ID = getClientId();

/* ------------------------------------------------------------
   BROADCAST VALIDATION (PURE)
------------------------------------------------------------ */

export function safeParseBroadcast(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function isValidBroadcast(b) {
  if (!b || typeof b !== "object") return false;

  if (
    b.version !== undefined &&
    b.version !== EXPECTED_BROADCAST_VERSION
  ) return false;

  if (b.leaseUntil && Date.now() > b.leaseUntil) return false;

  const phase = b.phase || b.status;

if (phase === "live" || phase === "syncing") {
  if (!b.url || !b.startedAt) return false;
}

if (phase !== "live" && phase !== "offair" && phase !== "syncing") {
  return false;
}

  if (b.updatedAt && typeof b.updatedAt !== "number") return false;

  return true;
}

/* ------------------------------------------------------------
   SNAPSHOT HELPERS (ADVISORY)
------------------------------------------------------------ */

export function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    return snap?.state ? snap : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(channelKey, broadcastState) {
  try {
    if (
      broadcastState?.status === "live" &&
      broadcastState.url &&
      broadcastState.startedAt
    ) {
      localStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify({
          channel: channelKey,
          savedAt: Date.now(),
          state: broadcastState
        })
      );
    }
  } catch {}
}

/* ------------------------------------------------------------
   NORMALIZERS
------------------------------------------------------------ */

export function normalizeContributor(meta) {
  if (!meta?.contributor) return null;
  if (typeof meta.contributor === "string") return meta.contributor;
  if (typeof meta.contributor === "object") return meta.contributor.name || null;
  return null;
}

export function normalizeTitle(meta) {
  if (!meta?.title) return null;
  if (typeof meta.title === "string") return meta.title;
  if (typeof meta.title === "object") return meta.title.name || null;
  return null;
}

export function normalizeArtist(meta) {
  if (!meta?.artist) return null;
  if (typeof meta.artist === "string") return meta.artist;
  if (typeof meta.artist === "object") return meta.artist.name || null;
  return null;
}

export function normalizeSlug(value) {
  if (!value || typeof value !== "string") return "";
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}


/* ------------------------------------------------------------
   CHANNEL ACCESSORS
------------------------------------------------------------ */

export function getActiveChannelKey() {
  return state.channel;
}

export function getActiveChannelState() {
  return state;
}

/* ------------------------------------------------------------
   DERIVED STATE (READ-ONLY)
------------------------------------------------------------ */

export function isOffAir() {
  return state.phase === "offair";
}

export function isLive() {
  return (
    state.phase === "live" &&
    Number.isFinite(state.startedAt) &&
    !!state.url
  );
}

export const hasBroadcast = isLive;

export function isBroadcastStale(channel = state) {
  if (!channel.lastBroadcastSeenAt) return true;
  return Date.now() - channel.lastBroadcastSeenAt > BROADCAST_TTL;
}

export function shouldRenderPlayer() {
  return ["live", "offair", "syncing", "waiting"].includes(state.phase);
}


/* ------------------------------------------------------------
   DEBUG (READ-ONLY)
------------------------------------------------------------ */

if (typeof window !== "undefined") {
  window.RESONANT_CORE_DEBUG = () => ({
    phase: state.phase,
    sourceMode: state.sourceMode,
    url: state.url,
    artist: state.artist,
    contributor: state.contributor,
    userIntentMuted: state.userIntentMuted,
    awaitingUserResume: state.awaitingUserResume,
    lastTransitionReason: state.lastTransitionReason,
    lastOffAirReason: state.lastOffAirReason,
    watchdogRestarts: state.watchdogRestarts
  });
}

/* ============================================================
   END · app.core.js
===============================================================

FREEZE POLICY
• CORE never decides playback
• CORE never advances content
• CORE only describes state
• Extensions require version bump
=============================================================== */
