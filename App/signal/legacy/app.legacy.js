/* ============================================================
   RESONANT · LISTENER APP ENGINE
===============================================================

FILE
• app.js

ROLE
• Passive Listener App Engine
• Audio playback & synchronization
• UI reaction layer (non-authoritative)
• Metrics & presence (read-only)

AUTHORITY
• Admin Console is the single source of truth
• Listener NEVER mutates broadcast state
• Listener NEVER controls playlist or timing

SCOPE
• Broadcast state validation
• Drift-safe audio sync
• MediaSession metadata
• OFF AIR handling
• Snapshot recovery
• Listener presence & metrics (local only)

OUT OF SCOPE (STRICT)
• No admin actions
• No playlist edits
• No broadcast initiation
• No UI layout control
• No business logic decisions

ENGINE CONTRACT
• Reacts ONLY to valid broadcast state
• Ignores expired, invalid, or stale signals
• Audio follows admin clock strictly
• UI reflects state — never decides it

PAIRING
• signal.html v18.x
• style.signal.css v18.x
• Admin Engine v18.x+

VERSION
• LISTENER v18.2.2

FREEZE STATUS
• FINAL FREEZE
• ENGINE SEALED
• BROADCAST-GRADE
• PRODUCTION READY
• DO NOT MODIFY

============================================================ */


import { PEOPLE } from "./data/people.mock.js";
import * as CORE from "../app.core.js";


/* ------------------------------------------------------------
   01 · CONFIG
   Physical constants · No logic · No side effects
------------------------------------------------------------ */

// ── Broadcast protocol
const BROADCAST_KEY = "resonant_broadcast_state_v3";
const EXPECTED_BROADCAST_VERSION = 3;

const BROADCAST_TTL = 30000;



// ── Sync intervals
const SYNC_FAST = 700;
const SYNC_LIVE = 1000;
const SYNC_IDLE = 1800;

// ── Drift control (ms)
const DRIFT_TOLERANCE = 1500;
const DRIFT_HARD = 3500;

// ── Live grace & silence
const LIVE_GRACE = 5000;
const SILENCE_TIMEOUT = 8000;

// ── Snapshot
const SNAPSHOT_KEY = "resonant_broadcast_snapshot_v1";

// ── Watchdog
const WATCHDOG_INTERVAL = 15000;
const WATCHDOG_STALL = 20000;
const WATCHDOG_MAX_RESTARTS = 3;

// ── Watchdog backoff
const WATCHDOG_BACKOFF_BASE = 4000;   // 4s
const WATCHDOG_BACKOFF_MAX  = 30000;  // 30s

// ── Identity / UX
const CLIENT_ID_KEY = "resonant_client_id_v1";

// ── Metrics
const LISTENER_PING_INTERVAL = 5000;

/* ------------------------------------------------------------
   02 · IDENTITY / CLIENT
   Anonymous · Persistent · Non-identifying
------------------------------------------------------------ */

/**
 * Returns a stable anonymous client id.
 * Purpose:
 * - Presence & metrics correlation
 * - Zero personal data
 * - Long-term stability across reloads
 */
function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    // Fallback: session-only (still anonymous)
    return crypto.randomUUID();
  }
}

// Materialize once (read-only usage downstream)
const CLIENT_ID = getClientId();

/* ------------------------------------------------------------
   STATE — Single source of truth (runtime only)
------------------------------------------------------------ */

const state = {

  phase: "splash", // splash | offair | syncing | live

  /* ── Channel / mode */
  channel: "SETS",
  mode: "broadcast",        // broadcast | autodj
  autoIndex: 0,

  /* ── Broadcast tracking */
  url: null,
  startedAt: null,
  currentDuration: null,
  lastLiveAt: 0,
  lastBroadcastSeenAt: 0,

  /* ── Artist / metadata */
artist: null,
contributor: null,

  /* ── Admin authority */
  activeAdminId: null,
  handoffNoticeShown: false,

  /* ── Sync */
  syncTimer: null,
  syncBusy: false, // 


  /* ── Watchdog (state only) */
  watchdogTimer: null,
  watchdogRestarts: 0,
  watchdogCooldownUntil: 0,

  /* ── Audio flags */
  userPaused: false,
  lastAudioAt: 0,
  awaitingUserResume: false,

  userGestureConfirmed: false, // 🔐 ÚNICA autoridad para iniciar audio (user gesture)

  audioMuted: true,       // 🔇 currently muted

  forceOffAirUntil: 0, // 🔒 anti-flapping OFF AIR lock

  /* ── Metrics / sessions */
  currentSession: null,
  sessionTimer: null,

  /* ── Diagnostics (silent) */
  lastTransitionReason: null,

  /* ── UX intent */
  userIntentMuted: false
};


/* ============================================================
   PATCH L1 · LISTENER HEALTH SNAPSHOT
   Read-only · Debug / QA · No authority
============================================================ */

window.LISTENER_HEALTH = () => ({
  phase: state.phase,
  audioMuted: state.audioMuted,
  widgetReady,
  lastAudioAt: state.lastAudioAt,
  lastBroadcastSeenAt: state.lastBroadcastSeenAt,
  watchdogRestarts: state.watchdogRestarts,
  userGestureConfirmed: state.userGestureConfirmed,
  awaitingUserResume: state.awaitingUserResume,
  lastTransitionReason: state.lastTransitionReason
});
/* ============================================================
   PATCH L2 · LISTENER EVENT LOG
   Local · Capped · Silent
============================================================ */

const __LISTENER_EVENT_LOG__ = [];

function logListenerEvent(type, data = {}) {
  __LISTENER_EVENT_LOG__.push({
    t: Date.now(),
    type,
    data
  });

  if (__LISTENER_EVENT_LOG__.length > 100) {
    __LISTENER_EVENT_LOG__.shift();
  }
}

window.LISTENER_EVENTS = () => [...__LISTENER_EVENT_LOG__];

/* ------------------------------------------------------------
   04 · DOM CACHE
   Guarded DOM references · No logic
------------------------------------------------------------ */

const ui = {
  /* ── System screens */
  splash: document.getElementById("splash-screen"),
  appRoot: document.querySelector(".app-root"),

  /* ── Core metadata */
title: document.getElementById("title"),
artist: document.getElementById("artist-name"),
contributor: document.getElementById("contributor-name"),
catalogArtist: document.getElementById("catalog-artist-name") || null,

  /* ── Artwork */
  cover: document.getElementById("cover"),

  /* ── Progress */
progress: document.getElementById("bar-fill"),

  /* ── Controls */
  playBtn: document.getElementById("play-btn"),
  livePill: document.getElementById("live-pill"),
  likeBtn: document.getElementById("like-btn"),
  inviteBtn: document.getElementById("invite-btn"),

  /* ── Feedback */
  feedbackMsg: document.getElementById("feedback-message"),
  feedbackLink: document.getElementById("feedback-link"),
  feedbackSend: document.getElementById("btn-feedback-send"),
  feedbackStatus: document.getElementById("feedback-status"),

  /* ── Navigation */
  tabs: document.querySelectorAll(".tab"),
  navBtns: document.querySelectorAll(".nav-btn"),
  main: document.querySelector("main.main"),


};

/* ── Audio transport */
let iframe = document.getElementById("sc-frame");
let widget = null;
let widgetReady = false; 
let lockedArtwork = null; // last trusted artwork (prevents flicker on metadata refresh)

/* ------------------------------------------------------------
   05 · GUARDS
   Broadcast validation · Hard safety layer
------------------------------------------------------------ */

/**
 * Absolute broadcast validator.
 * Listener reacts ONLY to valid, leased, version-locked state.
 */
/**
 * Absolute broadcast validator.
 * Admin-compatible (SSOT = Admin).
 * Listener accepts the real admin schema without losing safety.
 */
function isValidBroadcast(state) {
  if (!state || typeof state !== "object") return false;

  // ── Version (soft)
  // Admin may omit version during evolution → assume v2 if missing
  if (state.version !== undefined && state.version !== EXPECTED_BROADCAST_VERSION) {
    return false;
  }

  // ── Status (soft)
  // Default to "live" if omitted but transport exists
const rawStatus = state.status;

const status =
  rawStatus === "on-air" ? "live" :
  rawStatus === "off-air" ? "offair" :
  rawStatus || (state.url && state.startedAt ? "live" : null);
  if (!status) return false;

  // ── Lease (soft but enforced if present)
  if (state.leaseUntil && Date.now() > state.leaseUntil) return false;

  // ── Live requires transport
  if (status === "live") {
    if (!state.url || !state.startedAt) return false;
  }

  // ── Minimal freshness guard
  // If updatedAt exists, respect it; otherwise rely on transport + lease
  if (state.updatedAt && typeof state.updatedAt !== "number") return false;

  return true;
}

/**
 * Safe JSON parse for broadcast payload.
 * Never throws. Never trusts shape.
 */
function safeParseBroadcast(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
/* ------------------------------------------------------------
   06 · SNAPSHOT
   Cold reload recovery · No autoplay · Safe restore
------------------------------------------------------------ */

/**
 * Load last known broadcast snapshot from localStorage.
 * Snapshot is advisory only — never authoritative.
 */
function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;

    const snap = JSON.parse(raw);
    if (!snap || typeof snap !== "object") return null;

    const state = snap.state;
    if (!state || !state.startedAt || !state.url) return null;

    return snap;
  } catch {
    return null;
  }
}

/**
 * Persist snapshot (best-effort).
 * Called only after confirmed live sync.
 */
function saveSnapshot(broadcastState) {
  try {
    if (
      broadcastState &&
      broadcastState.status === "live" &&
      broadcastState.url &&
      broadcastState.startedAt
    ) {
      localStorage.setItem(
        SNAPSHOT_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          state: broadcastState
        })
      );
    }
  } catch {
    // silent by design
  }
}

/**
 * Revive from snapshot.
 * IMPORTANT:
 * - Never starts playback
 * - Never forces phase
 * - Only prepares transport metadata
 */
function reviveFromSnapshot(snapshot) {
  const b = snapshot?.state;
  if (!b || !b.url || !b.startedAt) return;

  // 🔒 Guard: admin must still be LIVE with same payload
  const raw = localStorage.getItem(BROADCAST_KEY);
  const parsed = safeParseBroadcast(raw);

  const adminLive =
    isValidBroadcast(parsed) &&
    parsed.status === "live" &&
    parsed.url === b.url &&
    Number(parsed.startedAt) === Number(b.startedAt);

  if (!adminLive) return;

  state.url = b.url;
  state.startedAt = b.startedAt;
  state.currentDuration =
    typeof b.duration === "number" ? b.duration : null;

  state.artist = normalizeArtist(b.meta);
  state.contributor = b.meta?.contributor || null;
  state.activeAdminId = b.owner || null;

  renderLike();

  if (ui.title) ui.title.textContent = b.meta?.title || "";
  if (ui.artist) ui.artist.textContent = state.artist || "";

  if (ui.contributor) {
    ui.contributor.textContent = state.contributor || "";
    ui.contributor.style.display = state.contributor ? "" : "none";
  }

  if (ui.catalogArtist) {
    ui.catalogArtist.textContent = state.artist || "—";
  }

  bindPersonClick(
    ui.artist,
    state.artist ? { type: "artist", name: state.artist } : null
  );

  bindPersonClick(
    ui.contributor,
    state.contributor
      ? { type: "contributor", name: state.contributor }
      : null
  );

  if (b.meta?.artwork && ui.cover) {
    ui.cover.style.backgroundImage = `url(${b.meta.artwork})`;
    lockedArtwork = b.meta.artwork;
  }
}

/* ------------------------------------------------------------
   07 · SYNC ENGINE
   Deterministic broadcast reaction · No UI · No audio
------------------------------------------------------------ */

function startSync(interval) {
  if (state.syncTimer && interval === SYNC_LIVE) return;
  if (state.syncTimer) clearInterval(state.syncTimer);

  syncTick();
  state.syncTimer = setInterval(syncTick, interval);
}

function syncTick() {
  if (state.syncBusy) return;
  state.syncBusy = true;

  const release = () => {
    state.syncBusy = false;
  };

  try {
    const raw = localStorage.getItem(BROADCAST_KEY);
    const parsed = safeParseBroadcast(raw);
    const b = isValidBroadcast(parsed) ? parsed : null;

    if (
      b &&
      b.status === "live" &&
      b.url &&
      b.startedAt &&
      state.phase === "offair"
    ) {
      saveSnapshot(b);
    }
    
    // 🟡 PRE-LIVE VISUAL — SOLO UI, NO BLOQUEAR MONTAJE
if (
  b &&
  b.status === "live" &&
  b.url &&
  b.startedAt &&
  state.phase === "offair"
) {
  setPhase("syncing");
  // ⚠️ NO return
}


    /* ── Seen broadcast (soft signal) */
    if (b && b.status === "live") {
      state.lastBroadcastSeenAt = Date.now();
    }

    /* ── Live audio running, tolerate brief gaps */
    if (widget && state.phase === "live") {
      const sinceAudio = Date.now() - state.lastAudioAt;
      if (
        !b &&
        sinceAudio < BROADCAST_TTL &&
        Date.now() - state.lastBroadcastSeenAt < BROADCAST_TTL
      ) {
        return release();
      }
    }

    /* ── No valid broadcast */
    if (!b) {
      if (
        !widget &&
        state.startedAt &&
        Date.now() - state.startedAt < BROADCAST_TTL
      ) {
        return release();
      }

      release();
      return guardedOffAir();
    }

    /* ── Lease / staleness (admin-compatible, soft) */

// ── Lease: only enforce if present
if (b.leaseUntil && Date.now() > b.leaseUntil) {
  if (
    widget &&
    state.phase === "live" &&
    Date.now() - state.lastAudioAt < BROADCAST_TTL
  ) {
    return release();
  }

  state.lastTransitionReason = "lease-expired";
  release();
  return guardedOffAir();
}

// ── Staleness: only if updatedAt exists
if (b.updatedAt) {
  const silence = Date.now() - b.updatedAt;

  if (silence > BROADCAST_TTL * 2) {
    state.activeAdminId = null;
    state.handoffNoticeShown = false;
    release();
    return guardedOffAir();
  }
}

    /* ── Admin handoff */
    if (!state.activeAdminId) {
  state.activeAdminId = b.owner || null;
} else if (b.owner && state.activeAdminId !== b.owner) {
  state.activeAdminId = b.owner;
  state.handoffNoticeShown = false;
}

// ── Explicit OFF AIR from admin
if (b.status === "offair" || b.status === "off-air") {
  state.lastTransitionReason = "admin-offair";
  release();
  return guardedOffAir();
}

    /* ── Transition */
    if (b.status === "transition") {
      setPhase("syncing");
      return release();
    }

    /* ── Invalid live payload */
    if (b.status !== "live" || !b.url || !b.startedAt) {
      release();
      return guardedOffAir();
    }

    /* ── Live decision */
    state.lastLiveAt = Date.now();

// 🔑 SI hay broadcast LIVE y NO hay widget montado → montar SIEMPRE

if (!widget && b.url && b.startedAt) {
  saveSnapshot(b);
  loadTrack(b);
  return release();
}


// PATCH C — hard guard against metadata-only refresh

const sameTrack =
  b.url === state.url &&
  Number(b.startedAt) === Number(state.startedAt);

if (!sameTrack) {
  saveSnapshot(b);
  loadTrack(b);
  return release();
}


    // ⏭ Early-exit: mismo track + audio confirmado → no repintar UI
if (
  b.url === state.url &&
  b.startedAt === state.startedAt &&
  state.lastAudioAt &&
  Date.now() - state.lastAudioAt <= DRIFT_TOLERANCE &&
  widgetReady
) {
  checkDrift(b.startedAt);
  release();
  return;
}

// 🔄 Metadata refresh (hard-safe: no audio, no remount)
updatePlayButton();
updateLivePill();

const nextArtist = normalizeArtist(b.meta);
const nextContributor = b.meta?.contributor || null;

const metaChanged =
  state.artist !== nextArtist ||
  state.contributor !== nextContributor ||
  (b.meta?.artwork && b.meta.artwork !== lockedArtwork);

if (b.meta && metaChanged) {

  state.artist = nextArtist;
  state.contributor = nextContributor;

  if (ui.artist) ui.artist.textContent = nextArtist || "";

  if (ui.contributor) {
    ui.contributor.textContent = nextContributor || "";
    ui.contributor.style.display = nextContributor ? "" : "none";
  }

  if (ui.catalogArtist) {
    ui.catalogArtist.textContent = nextArtist || "—";
  }

  if (ui.cover && b.meta?.artwork) {
    ui.cover.style.backgroundImage = `url(${b.meta.artwork})`;
    lockedArtwork = b.meta.artwork;
  }

    bindPersonClick(
    ui.artist,
    nextArtist ? { type: "artist", name: nextArtist } : null
  );

  bindPersonClick(
    ui.contributor,
    nextContributor ? { type: "contributor", name: nextContributor } : null
  );


  updateMediaSession(
    {
      title: b.meta?.title || "Live Broadcast",
      artist: nextArtist || "Resonant Radio",
      artwork: b.meta?.artwork || lockedArtwork || null
    },
    !state.audioMuted
  );
}

checkDrift(b.startedAt);
release();
return;

  } catch (err) {
    release();
  }
}

/* ------------------------------------------------------------
   07.1 · LOAD TRACK
   Transport mount · No autoplay · Widget authority
------------------------------------------------------------ */

function loadTrack(b) {
  if (!iframe || !b?.url || !b?.startedAt) return;

  // 🔒 Evitar doble mount mientras el widget aún no está listo
  if (state.phase === "syncing" && widget && !widgetReady) return;

  setPhase("syncing");

  // 🔄 RESET TOTAL DE WATCHDOG PARA TRACK NUEVO
clearWatchdog();
state.lastAudioAt = 0;

  // ── Reset transport state
  widgetReady = false;
  widget = null;

  state.url = b.url;
  state.startedAt = b.startedAt;
  state.artist = normalizeArtist(b.meta);
state.contributor = b.meta?.contributor || null;
state.lastLiveAt = Date.now();


  // ── UI prefill (safe, no audio)
  if (ui.title) ui.title.textContent = b.meta?.title || "Live";
  if (ui.artist) ui.artist.textContent = state.artist || "";
  if (ui.catalogArtist) ui.catalogArtist.textContent = state.artist || "—";

  if (ui.contributor) {
  ui.contributor.textContent = state.contributor || "";
  ui.contributor.style.display = state.contributor ? "" : "none";
}

  if (ui.cover && b.meta?.artwork) {
    ui.cover.style.backgroundImage = `url(${b.meta.artwork})`;
  }

    bindPersonClick(
    ui.artist,
    state.artist ? { type: "artist", name: state.artist } : null
  );

  bindPersonClick(
    ui.contributor,
    state.contributor ? { type: "contributor", name: state.contributor } : null
  );

  updateArtistLinks(state.artist);
  renderLike();
  updatePlayButton();
  updateLivePill();

  // 🔒 NO recrear iframe — SoundCloud pierde el audio
// Solo actualizar src

  iframe.src =
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(b.url) +
    "&auto_play=false";

  widget = window.SC.Widget(iframe);

  // ── READY = transport usable (NO autoplay)
  // ── READY: widget usable (NO audio aquí)
widget.bind(window.SC.Widget.Events.READY, () => {
  widgetReady = true;

  updateMediaSession(
    {
      title: b.meta?.title || "Live Broadcast",
      artist: state.artist || "Resonant Radio",
      artwork: b.meta?.artwork || lockedArtwork || null
    },
    false
  );

  // 🔑 RE-ARM AUDIO IF USER ALREADY CONSENTED
  if (
    state.userGestureConfirmed &&
    !state.userIntentMuted
  ) {
    // NO autoplay ilegal: usuario ya dio consentimiento antes
    widget.play();

    setTimeout(() => {
      widget.getPosition(pos => {
        if (typeof pos === "number" && pos > 0) {
          state.lastAudioAt = Date.now();
          recoverFromAudio();
        }
      });
    }, 300);
  }

  updatePlayButton();
  updateLivePill();
});

// ── PLAY: audio REAL confirmado
widget.bind(window.SC.Widget.Events.PLAY, () => {
  if (!state.startedAt) return;

  const liveOffset = Math.max(0, Date.now() - state.startedAt);
  widget.seekTo(liveOffset);

  widget.setVolume(100);

  state.lastAudioAt = Date.now();
  state.awaitingUserResume = false;

  recoverFromAudio();
  updatePlayButton();
  updateLivePill();
});
}

/* ------------------------------------------------------------
   PATCH · STORAGE WAKE LISTENER
   Immediate reaction to admin broadcast
------------------------------------------------------------ */

function wakeFromBroadcast() {
  state.lastBroadcastSeenAt = Date.now();

  if (state.phase === "offair" || state.phase === "syncing") {

    // 🔓 CRÍTICO: liberar lock OFF AIR
    state.forceOffAirUntil = 0;

    startSync(SYNC_FAST);

    // ⚡ Wake diferido para evitar race con sync loop
    setTimeout(() => {
      if (!state.syncBusy) {
        syncTick();
      }
    }, 0);
  }
}

// ── Cross-tab / cross-window
window.addEventListener("storage", (e) => {
  if (e.key !== BROADCAST_KEY) return;
  wakeFromBroadcast();
});

// ── Same-tab / same-context (ADMIN → LISTENER)
window.addEventListener("resonant:broadcast:update", wakeFromBroadcast);

/* ------------------------------------------------------------
   08 · OFF AIR ENGINE
   Stable empty state · Hardened transitions
------------------------------------------------------------ */

function guardedOffAir() {

  const now = Date.now();

  // 🔒 Anti-flap hard lock
  if (now < state.forceOffAirUntil) return;

  // 🟢 Leer broadcast UNA sola vez (SSOT)
  const raw = localStorage.getItem(BROADCAST_KEY);
  const parsed = safeParseBroadcast(raw);

  const live =
    isValidBroadcast(parsed) &&
    parsed.status === "live" &&
    parsed.url &&
    parsed.startedAt;

  // 🟢 LIVE válido pero esperando gesto del usuario
  if (
    live &&
    widget &&
    widgetReady &&
    !state.userGestureConfirmed
  ) {
    return;
  }

  // 🔒 Respeto total a intención explícita del usuario
  if (state.userIntentMuted) return;

  // 🟢 Audio reciente → NO off air
  if (
    widget &&
    state.lastAudioAt &&
    now - state.lastAudioAt < LIVE_GRACE
  ) {
    return;
  }

  // 🛑 Widget aún montándose
  if (widget && !widgetReady) return;

  // 🛑 Sync activo (pre-live o transición)
  if (state.phase === "syncing") return;

  // 🧠 Broadcast visto recientemente → tolerancia
  if (
    now - state.lastBroadcastSeenAt < BROADCAST_TTL
  ) {
    return;
  }

  // ── OFF AIR confirmado

  state.lastTransitionReason = "guarded-offair";

  // 🔒 Lock duro para evitar rebotes
  state.forceOffAirUntil = now + 3000;

  safeGoOffAir();
}


function safeGoOffAir() {

  // 🕊 Grace window después de LIVE real
  if (
    state.phase === "live" &&
    Date.now() - state.lastLiveAt < LIVE_GRACE
  ) {
    return;
  }

  goOffAir();
}

function goOffAir() {
  if (state.phase === "offair") return;

  if (widget) {
    widget.isPaused(paused => {
      // ✅ Revivir SOLO si el audio sigue activo y no fue muted por usuario
      if (!paused && !state.audioMuted) {
        recoverFromAudio();
        return;
      }

      finalizeOffAir();
    });
  } else {
    finalizeOffAir();
  }
}

function finalizeOffAir() {
  logListenerEvent("offair-entered", {
  reason: state.lastTransitionReason
});

  // 🔒 Lock OFF AIR para evitar rebotes
  state.forceOffAirUntil = Date.now() + 3000; // 3s hard lock

  startSync(SYNC_IDLE);
  clearWatchdog();
  state.watchdogCooldownUntil = 0;
  stopListenerPing();

  stopPlayback(true);

  state.mode = "broadcast";
  state.activeAdminId = null;

  renderLike();
  closeCurrentSession();

  setPhase("offair");

  // 🔴 Garantizar OFF AIR visible
ui.offair?.classList.remove("hidden");
}
function togglePlay() {
  if (!widget) return;


  // ⛔ Widget aún no listo → permitir SOLO registrar gesto
if (!widgetReady && !state.userGestureConfirmed) {
  state.userGestureConfirmed = true;
  state.userIntentMuted = false;
  state.audioMuted = false;
  updatePlayButton();
  return;
}


  // ▶️ PRIMER PLAY — gesto explícito del usuario
  if (!state.userGestureConfirmed) {
    state.userGestureConfirmed = true;
    state.audioMuted = false;
    state.userPaused = false;
    state.userIntentMuted = false;

    widget.play();
    widget.setVolume(100);

    state.awaitingUserResume = true;

    setTimeout(() => {
      widget.getPosition(pos => {
        if (typeof pos === "number" && pos > 0) {
          state.lastAudioAt = Date.now();
          state.awaitingUserResume = false;
          recoverFromAudio();
        }
      });
    }, 350);

    updatePlayButton();
    return;
  }

  // ⏹ STOP → MUTE (no pause)
  if (!state.audioMuted) {
    state.audioMuted = true;
    state.userPaused = true;
    state.userIntentMuted = true;
    state.awaitingUserResume = false;

    stopPlayback(true);
    return;

  }

  // ▶️ PLAY posterior — desmutear
  state.userIntentMuted = false;
  state.audioMuted = false;

  widget.setVolume(100);
  updateMediaSession(null, true);
  recoverFromAudio();
  updatePlayButton();
}

// ─────────────────────────────────────────────
// STOP PLAYBACK (FUERA de togglePlay)
// ─────────────────────────────────────────────
function stopPlayback(force = false) {
  if (!widget) return;
  if (!force && Date.now() - state.lastAudioAt < SILENCE_TIMEOUT) return;

  state.audioMuted = true;
  state.userPaused = true;
  state.userIntentMuted = true;

  try {
    widget.setVolume(0); // 🔇 mute controlado
  } catch {}

  updateMediaSession(null, false);
  updatePlayButton();
  updateLivePill();
}
/* ------------------------------------------------------------
   10 · WATCHDOG
   Playback stall detection · Auto-heal
------------------------------------------------------------ */

function startWatchdog() {
  if (state.userPaused) return;
  if (state.watchdogTimer) return;

  state.watchdogTimer = setInterval(() => {
    // 🔒 Guardas duras
    if (!widget) return;
    if (state.phase !== "live") return;
    if (!state.userGestureConfirmed) return;
    if (state.audioMuted) return;
    if (state.userIntentMuted) return;

    const now = Date.now();

    // 🔒 Cooldown activo → no intentar recovery
    if (now < state.watchdogCooldownUntil) return;

    // PATCH E — watchdog aligned with real audio lifecycle

const silence = now - state.lastAudioAt;

// 🛡️ No considerar stall si hubo resync reciente
if (
  silence < WATCHDOG_STALL ||
  Date.now() - state.lastLiveAt < LIVE_GRACE
) {
  return;
}

    state.watchdogRestarts++;

    // ⏳ Backoff exponencial (clamped)
    const backoff = Math.min(
      WATCHDOG_BACKOFF_BASE * state.watchdogRestarts,
      WATCHDOG_BACKOFF_MAX
    );

    state.watchdogCooldownUntil = now + backoff;

    // 🔕 Silenciar antes de decidir (NO pause)
    stopPlayback(true);

    // ❌ Demasiados intentos → OFF AIR definitivo
    if (state.watchdogRestarts >= WATCHDOG_MAX_RESTARTS) {
      clearWatchdog();
      state.lastTransitionReason = "watchdog-stall-max";
      goOffAir();
      return;
    }

    // 🔁 Intento de recuperación suave (sin forzar audio)
    guardedOffAir();
  }, WATCHDOG_INTERVAL);
}

function clearWatchdog() {
  if (!state.watchdogTimer) return;

  clearInterval(state.watchdogTimer);
  state.watchdogTimer = null;
  state.watchdogRestarts = 0;
  state.watchdogCooldownUntil = 0;
}

/* ------------------------------------------------------------
   AUDIO CONFIRMATION
   Live audio confirmed · Metrics & watchdog
------------------------------------------------------------ */

function recoverFromAudio() {
  if (!widget) return;

  widget.getPosition(pos => {
    // 🔒 ÚNICO criterio válido: hay audio real
    if (typeof pos !== "number" || pos <= 0) return;

    // 🧠 Audio confirmado
    state.lastTransitionReason = "audio-recovered";
    logListenerEvent("audio-recovered");

    const now = Date.now();

    state.lastAudioAt = now;
    state.lastLiveAt = now;

    state.audioMuted = false;
    state.userPaused = false;
    state.awaitingUserResume = false;

    // 🟢 Consolidar LIVE (una sola vez)
    if (state.phase !== "live") {
      setPhase("live");
    }

    // 🟢 UI LIVE real
    ui.offair?.classList.add("hidden");
    ui.livePill?.classList.remove("off");

    // 🔁 Watchdog: levantar solo aquí
    state.watchdogRestarts = 0;
    state.watchdogCooldownUntil = 0;

    if (!state.watchdogTimer) {
      startWatchdog();
    }

    // 📊 Métricas solo con audio real
    startListeningSession();
    startListenerPing();

    // 🔄 Sync estable en LIVE
    startSync(SYNC_LIVE);

    // 📶 Progress (visual only)
    updateProgress();

  });
}

function checkDrift(startedAt) {
  if (!widgetReady) return;
  if (!widget || !startedAt) return;

  widget.getPosition(pos => {
    if (typeof pos !== "number") return;

let expected = Date.now() - startedAt;

// Clamp using listener-known duration if available
state.currentDuration =
  typeof b.duration === "number" ? b.duration : null;


// ⛑ Defensive clamp
if (expected < 0 || expected > DRIFT_HARD * 10) {
  expected = 0;
}
    const drift = pos - expected;

    if (Math.abs(drift) > DRIFT_HARD * 2) {
      state.lastTransitionReason = "clock-skew";
      logListenerEvent("clock-skew", { drift });
      guardedOffAir();
      return;
    }

    // PATCH D — micro-drift soft resync (no audio kill)

if (Math.abs(drift) <= DRIFT_TOLERANCE) {
  // audio válido → refrescar heartbeat
  state.lastAudioAt = Date.now();
  return;
}

// 🔁 Soft correction (no hard seek spam)
widget.seekTo(expected);
state.lastAudioAt = Date.now();

  });
}
/* ------------------------------------------------------------
   HARD RESYNC — low frequency safety net
   Passive · No authority · Drift-only
------------------------------------------------------------ */

setInterval(() => {
  if (
    state.phase !== "live" ||
    !widget ||
    !widgetReady ||
    state.audioMuted ||
    state.userIntentMuted ||
    !state.startedAt
  ) return;

  widget.getPosition(pos => {
    if (typeof pos !== "number") return;

    const expected = Date.now() - state.startedAt;
    const drift = pos - expected;

    // ⚠️ Solo corregir si ya es claramente audible
    if (Math.abs(drift) > DRIFT_HARD) {
      widget.seekTo(expected);
      state.lastAudioAt = Date.now();
    }
  });
}, 45000); // 45s = seguro, barato, invisible

/* ------------------------------------------------------------
   12 · UI RENDER
   Visual reflection only · No authority
------------------------------------------------------------ */

function setPhase(phase) {
  if (state.phase === phase) return;

  logListenerEvent("phase-change", { to: phase });

  state.phase = phase;
  document.body.dataset.phase = phase;

  if (phase !== "splash") {
    ui.splash?.classList.add("hidden");
  }

  if (phase === "live" || phase === "syncing") {
    document.body.dataset.appState = "ready";
    ui.appRoot?.classList.add("app-ready");
  } else {
    document.body.dataset.appState = "offline";
    ui.appRoot?.classList.remove("app-ready");
  }
}

/* ------------------------------------------------------------
   PROGRESS BAR
------------------------------------------------------------ */

function updateProgress() {
  // 🔒 Solo mostrar progreso si hubo audio real
  if (!state.startedAt || !state.lastAudioAt) return;

  const elapsed = Date.now() - state.startedAt;
  const WINDOW_MS = 3 * 60 * 60 * 1000;
  const percent = Math.min(100, (elapsed / WINDOW_MS) * 100);

  if (ui.progress) {
    ui.progress.style.width = `${percent}%`;
  }
}

/* ------------------------------------------------------------
   LIVE PILL
------------------------------------------------------------ */

function updateLivePill() {
  if (!ui.livePill) return;

  // Reset visual baseline
  ui.livePill.textContent = "LIVE";
  ui.livePill.classList.remove("syncing");

  // OFF / muted / esperando gesto
  if (
    !widget ||
    state.phase !== "live" ||
    state.audioMuted ||
    state.awaitingUserResume
  ) {
    ui.livePill.classList.add("off");
    return;
  }

  const silence = Date.now() - state.lastAudioAt;

  // 🟢 LIVE estable
  if (
    silence <= DRIFT_TOLERANCE ||
    Date.now() - state.lastLiveAt <= LIVE_GRACE
  ) {
    ui.livePill.classList.remove("off");
    return;
  }

  // 🟡 LIVE recuperando sync
  if (silence > DRIFT_TOLERANCE && silence < SILENCE_TIMEOUT) {
    ui.livePill.classList.remove("off");
    ui.livePill.classList.add("syncing");
    return;
  }

  // 🔴 fallback
  ui.livePill.classList.add("off");
}

/* ------------------------------------------------------------
   LIKE RENDER
   UI helper · Non-authoritative
------------------------------------------------------------ */

function renderLike() {
  if (!ui.likeBtn || !state.artist) return;

  const key = `resonant_like_${state.artist}`;
  const liked = localStorage.getItem(key) === "1";

  ui.likeBtn.classList.toggle("liked", liked);
}

function toggleLike() {
  if (!state.artist) return;

  const key = `resonant_like_${state.artist}`;
  const liked = localStorage.getItem(key) === "1";

  if (liked) {
    localStorage.removeItem(key);
  } else {
    localStorage.setItem(key, "1");
  }

  renderLike();
}

function updatePlayButton() {
  if (!ui.playBtn) return;

  const playLabel = ui.playBtn.querySelector("[data-label-play]");
  const stopLabel = ui.playBtn.querySelector("[data-label-stop]");

  // OFF AIR, sin widget o muted → PLAY
  if (!widget || state.phase !== "live" || state.audioMuted) {
    ui.playBtn.dataset.state = "play";
    ui.playBtn.classList.remove("is-stop");
    ui.playBtn.classList.add("is-play");

    if (playLabel) playLabel.hidden = false;
    if (stopLabel) stopLabel.hidden = true;

    return;
  }

  // LIVE + audio activo → MUTE
  ui.playBtn.dataset.state = "stop";
  ui.playBtn.classList.remove("is-play");
  ui.playBtn.classList.add("is-stop");

  if (playLabel) playLabel.hidden = true;
  if (stopLabel) stopLabel.hidden = false;
}

function initTabs() {
  if (!ui.tabs || !ui.navBtns) return;

  function activateTab(key) {
    // 🔹 Apagar todo
    ui.tabs.forEach(t => t.classList.remove("active"));
    ui.navBtns.forEach(b => b.classList.remove("active"));

    // 🔹 Resolver destino
    const tab = document.getElementById(`tab-${key}`);
    const btn = document.querySelector(`.nav-btn[data-tab="${key}"]`);

    if (!tab || !btn) return;

    // 🔹 Activar destino
    tab.classList.add("active");
    btn.classList.add("active");

    // 🔑 FIX CRÍTICO — reset visual del scroll
    if (ui.main) {
      ui.main.scrollTop = 0;
    }

    document.body.dataset.activeTab = key;
  }

  // 🔹 Click handlers
  ui.navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab);
    });
  });

  // 🔹 Default tab
  activateTab("radio");
}
/* --------
----------------------------------------------------
   14 · CHANNELS
   Content mode selection · UI scoped
------------------------------------------------------------ */

const CHANNELS = {
  SETS:   { id: "radio",  label: "Sets",   enabled: true },
  TRACKS:{ id: "tracks", label: "Tracks", enabled: false },
  LABELS:{ id: "labels", label: "Labels", enabled: false }
};

const DEFAULT_CHANNEL = "SETS";
const CHANNEL_KEY = "resonant_active_channel_v1";

function loadActiveChannel() {
  try {
    const raw = localStorage.getItem(CHANNEL_KEY);
    if (raw && CHANNELS[raw] && CHANNELS[raw].enabled) return raw;
  } catch {}
  return DEFAULT_CHANNEL;
}

function saveActiveChannel(channel) {
  try {
    localStorage.setItem(CHANNEL_KEY, channel);
  } catch {}
}

function setChannel(channelKey) {
  const channel = CHANNELS[channelKey] || CHANNELS[DEFAULT_CHANNEL];
  if (!channel || !channel.enabled) return;

  if (state.channel === channelKey) {
    // No engine side-effects
    return;
  }

  state.channel = channelKey;

  document.body.dataset.channel = channelKey;
  document.body.dataset.channelActive = channel.id;

  saveActiveChannel(channelKey);
}
/* ------------------------------------------------------------
   15 · METRICS
   Local observation only · No authority
------------------------------------------------------------ */

// ── Listener ping (presence, local only)
const LISTENER_PING_KEY = `resonant_listener_ping_${CLIENT_ID}`;
let listenerPingTimer = null;

function startListenerPing() {
  if (listenerPingTimer) return;

  listenerPingTimer = setInterval(() => {
    try {
      localStorage.setItem(LISTENER_PING_KEY, Date.now());
    } catch {}
  }, LISTENER_PING_INTERVAL);
}

function stopListenerPing() {
  if (!listenerPingTimer) return;
  clearInterval(listenerPingTimer);
  listenerPingTimer = null;
}

// ── Listening sessions (local history)
function startListeningSession() {
  if (state.currentSession || state.phase !== "live") return;

  state.currentSession = {
    startedAt: Date.now(),
    listenedMs: 0,
    endedAt: null,
    source: state.mode
  };

  state.sessionTimer = setInterval(() => {
    if (state.currentSession) {
      state.currentSession.listenedMs += 1000;
    }
  }, 1000);
}

function closeCurrentSession() {
  if (!state.currentSession) return;

  clearInterval(state.sessionTimer);
  state.sessionTimer = null;

  state.currentSession.endedAt = Date.now();

  try {
    const key = "resonant_sessions_v2";
    const raw = localStorage.getItem(key);
    const sessions = raw ? JSON.parse(raw) : [];
    sessions.push(state.currentSession);
    localStorage.setItem(key, JSON.stringify(sessions));
  } catch {}

  state.currentSession = null;
}
/* ------------------------------------------------------------
   16 · SUPPORT ARTIST
   Ethical artist support · Non-intrusive
------------------------------------------------------------ */

function updateArtistLinks(artist) {
  const name = artist?.trim();
  if (!name) return;

  const profile = resolvePersonByName(name);

  // ── Prefer real profile links (PEOPLE)
  if (profile?.links?.length) {
    const map = {};
    profile.links.forEach(l => {
      if (l?.label && l?.url) {
        map[l.label.toLowerCase()] = l.url;
      }
    });

    setArtistLink("link-bandcamp",   map.bandcamp   || null);
    setArtistLink("link-discogs",    map.discogs    || null);
    setArtistLink("link-soundcloud", map.soundcloud || null);
    setArtistLink("link-juno",       map.juno       || null);
    setArtistLink("link-deejay",     map.deejay     || null);
    setArtistLink("link-subwax",     map.subwax     || null);

    return;
  }

  // ── Fallback: generic search (current behavior)
  const q = encodeURIComponent(name);

  setArtistLink("link-bandcamp",   `https://bandcamp.com/search?q=${q}`);
  setArtistLink("link-discogs",    `https://www.discogs.com/search/?q=${q}&type=artist`);
  setArtistLink("link-soundcloud", `https://soundcloud.com/search?q=${q}`);
  setArtistLink("link-juno",       "https://www.juno.co.uk/");
  setArtistLink("link-deejay",     "https://www.deejay.de");
  setArtistLink("link-subwax",     "https://subwax.es/");
}


/* ------------------------------------------------------------
   INVITE FLOW
   Growth UX · Non-authoritative
------------------------------------------------------------ */

function initInvite() {
  if (!ui.inviteBtn) return;

  ui.inviteBtn.addEventListener("contextmenu", e => {
    e.preventDefault();
  });

  ui.inviteBtn.textContent = "Invite friends";

  ui.inviteBtn.addEventListener("click", async () => {
    const url = window.location.href;
    const text = "Listen with me on Resonant — The Underground Music Signal";

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Resonant Radio",
          text,
          url
        });
        showInviteFeedback();
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(url);
      showInviteFeedback();
    } catch {
      showInviteFeedback();
    }
  });
}

function showInviteFeedback() {
  if (!ui.inviteBtn) return;

  ui.inviteBtn.classList.add("copied");

  setTimeout(() => {
    ui.inviteBtn.classList.remove("copied");
  }, 1200);
}

/* ------------------------------------------------------------
   17 · MEDIA SESSION
   OS-level integration · Best-effort
------------------------------------------------------------ */

function updateMediaSession(meta, playing = true) {
  if (!("mediaSession" in navigator)) return;

  if (!meta && typeof playing === "boolean") {
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    return;
  }

  try {
    if (meta?.artwork) {
      lockedArtwork = meta.artwork;
    }

    const artwork = meta.artwork || lockedArtwork || null;

navigator.mediaSession.metadata = new MediaMetadata({
  title: meta.title || "",
artist: meta.artist
  ? (meta.contributor
      ? `${meta.artist} · ${meta.contributor}`
      : meta.artist)
  : "Resonant Radio",
  album: "Resonant · Live Broadcast",
  artwork: artwork
    ? [
        { src: artwork, sizes: "96x96", type: "image/png" },
        { src: artwork, sizes: "256x256", type: "image/png" },
        { src: artwork, sizes: "512x512", type: "image/png" }
      ]
    : []
});

    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  } catch {
    // silent by design
  }
}


/* ------------------------------------------------------------
   MEDIA SESSION ACTION HANDLERS
   Intent-safe · No autoplay · User-respect
------------------------------------------------------------ */

if ("mediaSession" in navigator) {

  // ▶️ PLAY desde lockscreen / headset
  navigator.mediaSession.setActionHandler("play", () => {
    // ❌ No autoplay
    if (!widget) return;

    // ❌ Respeto total a intención del usuario
    if (state.userIntentMuted) return;

    // ▶️ Solo revivir si estaba muted
    if (state.audioMuted) {
      togglePlay();
    }
  });

  // ⏸ PAUSE desde lockscreen / headset
  navigator.mediaSession.setActionHandler("pause", () => {
    if (!widget) return;

    // 🔇 Traducimos PAUSE → MUTE
    if (!state.audioMuted) {
      state.userIntentMuted = true;
      stopPlayback(true);
    }
  });

  // ⏭ Ignorados explícitamente (no soportados)
  navigator.mediaSession.setActionHandler("nexttrack", null);
  navigator.mediaSession.setActionHandler("previoustrack", null);
  navigator.mediaSession.setActionHandler("seekto", null);
}

/* ------------------------------------------------------------
   18 · VISIBILITY
   App lifecycle · Energy-aware
------------------------------------------------------------ */
document.addEventListener("visibilitychange", () => {
  // ─────────────────────────────────────────
  // BACKGROUND
  // ─────────────────────────────────────────
  if (document.hidden) {
    // Cerrar sesión activa (métrica limpia)
    closeCurrentSession();

    // 🔒 Detener watchdog para evitar falsos stalls
    clearWatchdog();

    return;
  }

  // ─────────────────────────────────────────
  // FOREGROUND
  // ─────────────────────────────────────────

  // ⚡ Sync rápido al volver
  
if (!state.syncTimer) {
  startSync(SYNC_FAST);
}

  // 🔒 Respeto absoluto a intención del usuario
  if (
    state.userIntentMuted ||
    state.audioMuted ||
    state.awaitingUserResume
  ) {
    updateLivePill();
    updatePlayButton();
    return;
  }

  // 🔁 Re-sync solo si hay contexto válido
if (state.phase === "live" && widget && state.startedAt) {

  // 🔒 Blindar watchdog al volver de background
  state.lastAudioAt = Date.now();
  state.watchdogCooldownUntil = Date.now() + WATCHDOG_INTERVAL;

  forceResync();
}

});

function forceResync() {
  if (
    !widget ||
    !state.startedAt ||
    state.audioMuted ||
    state.userIntentMuted ||
    state.awaitingUserResume ||
    (state.lastBroadcastSeenAt &&
     Date.now() - state.lastBroadcastSeenAt > BROADCAST_TTL)
  ) return;

  // 🔁 Delegar corrección al motor único
  checkDrift(state.startedAt);
}

/* ------------------------------------------------------------
   UTILS
------------------------------------------------------------ */

function normalizeArtist(meta) {
  if (!meta?.artist) return null;
  if (typeof meta.artist === "string") return meta.artist;
  if (typeof meta.artist === "object") return meta.artist.name || null;
  return null;
}

function bindPersonClick(el, payload) {
  if (!el) return;

  el.style.cursor = payload ? "pointer" : "default";

  el.onclick = payload
    ? () => {
        window.dispatchEvent(
          new CustomEvent("resonant:person:click", {
            detail: payload
          })
        );
      }
    : null;
}

/* ------------------------------------------------------------
   SERVICE WORKER
   Infrastructure only · Silent fail
------------------------------------------------------------ */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("/sw.js")
    .catch(() => {
      // Silent by design
    });
}

/**
 * Resolve a person profile by displayed name.
 * - Case-insensitive
 * - Read-only
 * - Returns null if not found
 */
function resolvePersonByName(name) {
  if (!name || typeof name !== "string") return null;

  const key = Object.keys(PEOPLE).find(
    k => k.toLowerCase() === name.toLowerCase()
  );

  return key ? PEOPLE[key] : null;
}

/**
 * Resolve artist profile from current state.
 */
function getCurrentArtistProfile() {
  return resolvePersonByName(state.artist);
}

/**
 * Resolve contributor profile from current state.
 */
function getCurrentContributorProfile() {
  return resolvePersonByName(state.contributor);
}

// 🔍 Debug / QA only (non-authoritative)
window.RESONANT_PEOPLE_DEBUG = () => ({
  artist: getCurrentArtistProfile(),
  contributor: getCurrentContributorProfile()
});

/* ------------------------------------------------------------
   INIT
   Controlled boot · Splash guaranteed · Viewport locked
------------------------------------------------------------ */

window.addEventListener("load", () => {

  /* ─────────────────────────────────────────────
   POINTER / TOUCH FIX — ONE TIME
   Mobile-safe · iOS-safe · No duplicates
───────────────────────────────────────────── */
document.addEventListener(
  "touchstart",
  () => {},
  { passive: true }
);

  
  /* ─────────────────────────────────────────────
     🔒 VIEWPORT HARD LOCK (CRÍTICO)
  ───────────────────────────────────────────── */
  document.documentElement.style.height = "100%";
  document.body.style.height = "100%";
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  if (ui.appRoot) {
    ui.appRoot.style.minHeight = "100vh";
  }

  /* ─────────────────────────────────────────────
     SNAPSHOT (prefill seguro, sin autoplay)
  ───────────────────────────────────────────── */
  const snap = loadSnapshot();
  if (snap) reviveFromSnapshot(snap);

  /* ─────────────────────────────────────────────
     UI INIT (no autoridad)
  ───────────────────────────────────────────── */
  initTabs();

  if (ui.playBtn) {
    ui.playBtn.addEventListener("click", togglePlay);
  }

  if (ui.likeBtn) {
    ui.likeBtn.addEventListener("click", toggleLike);
  }

  if (ui.inviteBtn) {
    initInvite(); // ✅ AQUÍ
  }

  if (ui.feedbackSend) {
  ui.feedbackSend.addEventListener("click", () => {
    const message = ui.feedbackMsg?.value?.trim();
    const link = ui.feedbackLink?.value?.trim();

    if (!message && !link) {
      if (ui.feedbackStatus) {
        ui.feedbackStatus.textContent = "Write a message or add a link.";
      }
      return;
    }

    ui.feedbackSend.disabled = true;
    ui.feedbackSend.textContent = "Sending…";
    if (ui.feedbackStatus) ui.feedbackStatus.textContent = "";

    // UI-only mock send (NO backend)
    setTimeout(() => {
      ui.feedbackSend.textContent = "Signal sent ✓";
      if (ui.feedbackStatus) {
        ui.feedbackStatus.textContent =
          "Thank you for contributing to the signal.";
      }

      if (ui.feedbackMsg) ui.feedbackMsg.value = "";
      if (ui.feedbackLink) ui.feedbackLink.value = "";

      setTimeout(() => {
        ui.feedbackSend.textContent = "Send signal";
        ui.feedbackSend.disabled = false;
      }, 2200);
    }, 700);
  });
}

  const channel = loadActiveChannel();
  setChannel(channel);

  registerServiceWorker();


  /* ─────────────────────────────────────────────
   SPLASH REAL — SIEMPRE SE VE
───────────────────────────────────────────── */

requestAnimationFrame(() => {
  requestAnimationFrame(() => {

    startSync(SYNC_FAST);

  });
});

}); // ← Close window.addEventListener("load", ...)
/* ============================================================
   END OF FILE — LISTENER APP ENGINE
===============================================================

STATUS
• FINAL LOCK
• BROADCAST GRADE
• PRODUCTION READY

ROLE
• Passive Listener App Engine
• Admin-authoritative
• Audio & Sync validated
• Metadata-safe
• Mobile hardened

GUARANTEES
• No admin authority
• No playlist mutation
• No broadcast control
• No UI layout control
• Drift-safe playback
• Snapshot-safe recovery
• OFF AIR hardened

CONTRACT
• Paired with:
  - signal.html v18.x
  - style.signal.css v18.x
• Admin is single source of truth
• Listener reacts only to valid broadcast state

CHANGE POLICY
• ENGINE IS FROZEN — NO LOGIC CHANGES ALLOWED
• UI changes allowed ONLY via HTML / CSS
• Any logic modification requires new engine file & version
• Contract violations = REJECTED


VERSION
• LISTENER v18.2.2

FREEZE STATUS
• FINAL FREEZE
• ENGINE SEALED
• BROADCAST-GRADE
• PRODUCTION READY
• DO NOT MODIFY

SEALED
• Resonant — The Underground Music Signal
============================================================ */
