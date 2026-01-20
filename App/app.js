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
• LISTENER v18.2.1

FREEZE STATUS
• FINAL FREEZE
• ENGINE SEALED
• BROADCAST-GRADE
• PRODUCTION READY
• DO NOT MODIFY

============================================================ */


/* ------------------------------------------------------------
   01 · CONFIG
   Physical constants · No logic · No side effects
------------------------------------------------------------ */

// ── Broadcast protocol
const BROADCAST_KEY = "resonant_broadcast_state_v2";
const EXPECTED_BROADCAST_VERSION = 2;
const BROADCAST_TTL = 30000;

// ── Splash / boot
const SPLASH_TIME = 2200;

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
  /* ── Engine phase */
  phase: "splash",          // splash | syncing | live | offair
  splashUntil: 0,           // ⏱ HARD splash lock

  /* ── Channel / mode */
  channel: "SETS",
  mode: "broadcast",        // broadcast | autodj
  autoIndex: 0,

  /* ── Broadcast tracking */
  url: null,
  startedAt: null,
  lastLiveAt: 0,
  lastBroadcastSeenAt: 0,

  /* ── Artist / metadata */
  artist: null,

  /* ── Admin authority */
  activeAdminId: null,
  handoffNoticeShown: false,

  /* ── Sync */
  syncTimer: null,
  syncBusy: false, // 🔒 PATCH v18.1.2 — mutex real


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
  sync: document.getElementById("sync-screen"),
  offair: document.getElementById("offair-screen"),
  offairBanner: document.getElementById("offair-banner"),
  appRoot: document.querySelector(".app-root"),

  /* ── Core metadata */
  title: document.getElementById("title"),
  artist: document.getElementById("artist-name"),
  catalogArtist: document.getElementById("catalog-artist-name") || null,

  /* ── Artwork */
  cover: document.getElementById("cover"),

  /* ── Progress */
  elapsed: document.getElementById("elapsed"),
  remaining: document.getElementById("remaining"),
  progress: document.getElementById("bar-fill"),

  /* ── Controls */
  playBtn: document.getElementById("play-btn"),
  livePill: document.getElementById("live-pill"),
  likeBtn: document.getElementById("like-btn"),
  heart: document.getElementById("heart"),
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


  /* ── UX hints */
  tapHint: document.getElementById("tap-hint")
};

/* ── Audio transport */
let iframe = document.getElementById("sc-frame");
let widget = null;
let widgetReady = false; 
let lockedArtwork = null;

/* ------------------------------------------------------------
   05 · GUARDS
   Broadcast validation · Hard safety layer
------------------------------------------------------------ */

/**
 * Absolute broadcast validator.
 * Listener reacts ONLY to valid, leased, version-locked state.
 */
function isValidBroadcast(state) {
  if (!state || typeof state !== "object") return false;

  // ── Version lock
  if (state.version !== EXPECTED_BROADCAST_VERSION) return false;

  // ── Required fields
  if (!state.status || !state.updatedAt || !state.leaseUntil) return false;

  // ── Lease expired
  if (Date.now() > state.leaseUntil) return false;

  // ── Live requires transport
  if (state.status === "live") {
    if (!state.url || !state.startedAt) return false;
  }

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
    if (!state || !state.updatedAt) return null;

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
    localStorage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        state: broadcastState
      })
    );
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

  state.url = b.url;
  state.startedAt = b.startedAt;
  state.artist = normalizeArtist(b.meta);
  state.activeAdminId = b.owner || null;

  renderLike();

  if (ui.title) ui.title.textContent = b.meta?.title || "";
  if (ui.artist) ui.artist.textContent = state.artist || "";
  if (ui.catalogArtist) ui.catalogArtist.textContent = state.artist || "—";

  if (b.meta?.artwork) {
    if (ui.cover) {
      ui.cover.style.backgroundImage = `url(${b.meta.artwork})`;
    }
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

    // 🔔 WAKE FROM OFF AIR (ONLY)
    if (
      b &&
      b.status === "live" &&
      b.url &&
      b.startedAt &&
      state.phase === "offair"
    ) {
      saveSnapshot(b);
    }

    // ⛔ SPLASH HARD LOCK — OBSERVE ONLY
    if (
      state.phase === "splash" &&
      Date.now() < state.splashUntil
    ) {
      return release();
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

    /* ── Lease / staleness */
    if (!b.leaseUntil || Date.now() > b.leaseUntil) {
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

    const silence = Date.now() - b.updatedAt;

    if (silence > BROADCAST_TTL * 2) {
      state.activeAdminId = null;
      state.handoffNoticeShown = false;
      release();
      return guardedOffAir();
    }

    /* ── Admin handoff */
    if (!state.activeAdminId) {
  state.activeAdminId = b.owner || null;
} else if (b.owner && state.activeAdminId !== b.owner) {
  state.activeAdminId = b.owner;
  state.handoffNoticeShown = false;
}

// ── Explicit OFF AIR from admin
if (b.status === "offair") {
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

// 🔄 Metadata refresh (solo si cambió algo)
updatePlayButton();
updateLivePill();

const sameMeta =
  state.url === b.url &&
  state.startedAt === b.startedAt &&
  state.artist === normalizeArtist(b.meta);

if (b.meta && !sameMeta) {
  if (ui.title) ui.title.textContent = b.meta?.title || "";
  const artistName = normalizeArtist(b.meta);

if (ui.artist) ui.artist.textContent = artistName || "";
if (ui.catalogArtist) {
  ui.catalogArtist.textContent = artistName || "—";
}

  if (ui.cover && b.meta?.artwork) {
    ui.cover.style.backgroundImage = `url(${b.meta.artwork})`;
    lockedArtwork = b.meta.artwork;
  }

  updateMediaSession(
    {
      title: b.meta?.title || "Live Broadcast",
      artist: b.meta?.artist || "Resonant Radio",
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
  state.lastLiveAt = Date.now();

  // ── UI prefill (safe, no audio)
  if (ui.title) ui.title.textContent = b.meta?.title || "Live";
  if (ui.artist) ui.artist.textContent = state.artist || "";
  if (ui.catalogArtist) ui.catalogArtist.textContent = state.artist || "—";

  if (ui.cover && b.meta?.artwork) {
    ui.cover.style.backgroundImage = `url(${b.meta.artwork})`;
  }

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

window.addEventListener("storage", (e) => {
  if (e.key !== BROADCAST_KEY) return;

  state.lastBroadcastSeenAt = Date.now();

  if (state.phase === "offair") {
    startSync(SYNC_FAST);

    // ⚡ Wake diferido para evitar race con sync loop
    setTimeout(() => {
      if (!state.syncBusy) {
  syncTick();
}
    }, 0);
  }
});

/* ------------------------------------------------------------
   08 · OFF AIR ENGINE
   Stable empty state · Hardened transitions
------------------------------------------------------------ */

function guardedOffAir() {
  // 🔒 Respeto total a intención explícita del usuario
  if (state.userIntentMuted) return;

  // 🔒 Anti-flapping lock
  if (Date.now() < state.forceOffAirUntil) return;

  // 🟢 Señal válida presente → no entrar OFF AIR
const raw = localStorage.getItem(BROADCAST_KEY);
const parsed = safeParseBroadcast(raw);
const live = isValidBroadcast(parsed) && parsed.status === "live";

if (
  live &&
  Date.now() - state.lastAudioAt < LIVE_GRACE
) {
  return;
}

  // 🛑 NO OFF AIR mientras el widget se está montando
if (widget && !widgetReady) return;

  // 🛑 NO OFF AIR durante fase de syncing
  if (state.phase === "syncing") return;
  
  // 🔒 No OFF AIR durante corrección de drift
if (
  state.phase === "live" &&
  widget &&
  widgetReady &&
  Date.now() - state.lastLiveAt < LIVE_GRACE
) {
  return;
}

  // 🔇 Si el usuario ya interactuó pero está muted o esperando gesto, no forzar OFF AIR
  if (
    state.userGestureConfirmed &&
    (state.audioMuted || state.awaitingUserResume)
  ) {
    return;
  }

  // 🧠 Tolerancia corta tras último audio válido

if (
  Date.now() - state.lastBroadcastSeenAt < BROADCAST_TTL &&
  Date.now() - state.lastAudioAt < BROADCAST_TTL
) {
  return;
}

  // ── A partir de aquí, OFF AIR es legítimo

  if (!widget) {
    safeGoOffAir();
    return;
  }

  widget.isPaused(paused => {
    if (
      !paused &&
      state.startedAt &&
      Date.now() - state.lastBroadcastSeenAt < BROADCAST_TTL
    ) {
      recoverFromAudio();
      updateLivePill();
      return;
    }

    state.lastTransitionReason = "no-valid-broadcast";
    safeGoOffAir();
    updateLivePill();
  });
}

function safeGoOffAir() {
  // 🕊 Grace window después de LIVE real
  if (
    state.phase === "live" &&
    Date.now() - state.lastLiveAt < LIVE_GRACE
  ) return;

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
  ui.offairBanner?.classList.remove("hidden");
}
function togglePlay() {
  if (!widget) return;

  // ❌ Nunca permitir play durante splash
  if (state.phase === "splash") return;

  if (!widgetReady && !state.userGestureConfirmed) {
  showTapToResume();
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
        } else {
          showTapToResume();
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
    ui.offairBanner?.classList.add("hidden");
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
  });
}

function checkDrift(startedAt) {
  if (!widgetReady) return;
  if (!widget || !startedAt) return;

  widget.getPosition(pos => {
    if (typeof pos !== "number") return;

let expected = Date.now() - startedAt;

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
   12 · UI RENDER
   Visual reflection only · No authority
------------------------------------------------------------ */

function setPhase(phase) {
  logListenerEvent("phase-change", { to: phase });

  // 🔒 Permitir transición splash → live / syncing / offair
  state.phase = phase;

  document.body.dataset.phase = state.phase;

  if (ui.splash && state.phase !== "splash") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ui.splash.classList.add("splash-hide");
      });
    });
  }

  if (state.phase === "live" || state.phase === "syncing") {
  document.body.dataset.appState = "ready";
  ui.appRoot?.classList.add("app-ready");
} else {
  document.body.dataset.appState = "offline";
  ui.appRoot?.classList.remove("app-ready");
}

  if (ui.splash) {
    ui.splash.setAttribute(
      "aria-hidden",
      state.phase !== "splash" ? "true" : "false"
    );
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

  // OFF / no audio / esperando gesto
 if (
  !widget ||
  state.phase !== "live" ||
  state.audioMuted ||        // 👈 prioridad
  state.awaitingUserResume
) {

    ui.livePill.textContent = "LIVE";
    ui.livePill.classList.add("off");
    return;
  }

  const silence = Date.now() - state.lastAudioAt;

// PATCH F — LIVE visual lock
if (
  silence <= DRIFT_TOLERANCE ||
  Date.now() - state.lastLiveAt <= LIVE_GRACE
) {
  ui.livePill.textContent = "LIVE";
  ui.livePill.classList.remove("off");
  return;
}


// 🟡 Solo mostrar SYNCING si:
// - hay widget
// - estamos en fase live
// - el audio se cayó hace rato
if (
  widget &&
  state.phase === "live" &&
  silence > DRIFT_TOLERANCE &&
  silence < SILENCE_TIMEOUT
) {
  ui.livePill.textContent = "SYNCING";
  ui.livePill.classList.remove("off");
  return;
}

// 🔴 Todo lo demás → OFF visual
ui.livePill.textContent = "LIVE";
ui.livePill.classList.add("off");

}

/* ------------------------------------------------------------
   LIKE RENDER
   UI helper · Non-authoritative
------------------------------------------------------------ */

function renderLike() {
  if (!ui.heart || !ui.likeBtn || !state.artist) return;

  const key = `resonant_like_${state.artist}`;
  const liked = localStorage.getItem(key) === "1";

  // Mantener mismo icono siempre
  ui.heart.textContent = "♡";

  // Solo cambiar estado visual
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

function showTapToResume() {
  if (!ui.tapHint) return;

  ui.tapHint.classList.remove("hidden");

  const resume = () => {
  ui.tapHint.classList.add("hidden");

  // 🔑 Clear awaiting state
  state.awaitingUserResume = false;

  widget?.play();

  // 🔁 Force audio confirmation (do not rely only on PLAY event)
  setTimeout(() => {
    widget?.getPosition(pos => {
      if (typeof pos === "number") {
        state.lastAudioAt = Date.now();
        recoverFromAudio();
      }
    });
  }, 300);

  document.removeEventListener("click", resume);
  document.removeEventListener("touchstart", resume);
};



  document.addEventListener("click", resume, { once: true });
  document.addEventListener("touchstart", resume, { once: true });
}


function updatePlayButton() {
  if (!ui.playBtn) return;

  // OFF AIR, sin widget o muted → mostrar PLAY (▶ unmute / listen)
  if (!widget || state.phase !== "live" || state.audioMuted) {
    ui.playBtn.dataset.state = "play";   // ▶
    ui.playBtn.classList.remove("is-stop");
    ui.playBtn.classList.add("is-play");
    return;
  }

  // LIVE + audio sonando (unmuted) → mostrar STOP (⏹ mute)
  ui.playBtn.dataset.state = "stop";     // ⏹
  ui.playBtn.classList.remove("is-play");
  ui.playBtn.classList.add("is-stop");
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
  const hasArtist = Boolean(name);
  const q = hasArtist ? encodeURIComponent(name) : "";

  setArtistLink(
    "link-bandcamp",
    hasArtist ? `https://bandcamp.com/search?q=${q}` : null
  );
  setArtistLink(
    "link-discogs",
    hasArtist ? `https://www.discogs.com/search/?q=${q}&type=artist` : null
  );
  setArtistLink(
    "link-soundcloud",
    hasArtist ? `https://soundcloud.com/search?q=${q}` : null
  );
  setArtistLink(
    "link-juno",
    hasArtist ? "https://www.juno.co.uk/" : null
  );
  setArtistLink(
    "link-deejay",
    hasArtist ? "https://www.deejay.de" : null
  );
  setArtistLink(
    "link-subwax",
    hasArtist ? "https://subwax.es/" : null
  );
}

function setArtistLink(id, url) {
  const el = document.getElementById(id);
  if (!el) return;

  if (!url) {
    el.removeAttribute("href");
    el.classList.add("disabled");
    el.onclick = e => e.preventDefault();
    return;
  }

  el.href = url;
  el.target = "_blank";
  el.rel = "noopener noreferrer";
  el.classList.remove("disabled");
  el.onclick = null;
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
  artist: normalizeArtist(meta) || "Resonant Radio",
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

    // 🔋 Sync lento (menos consumo)
    if (state.phase !== "splash") {
      startSync(SYNC_IDLE);
    }

    return;
  }

  // ─────────────────────────────────────────
  // FOREGROUND
  // ─────────────────────────────────────────
  if (state.phase === "splash") return;

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


function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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

  const channel = loadActiveChannel();
  setChannel(channel);

  /* ─────────────────────────────────────────────
   SPLASH REAL — SIEMPRE SE VE
───────────────────────────────────────────── */
state.splashUntil = Date.now() + SPLASH_TIME;
setPhase("splash");

requestAnimationFrame(() => {
  requestAnimationFrame(() => {

    startSync(SYNC_FAST);

   setTimeout(() => {
  if (state.phase !== "splash") return;

  const raw = localStorage.getItem(BROADCAST_KEY);
  const parsed = safeParseBroadcast(raw);
  const valid = isValidBroadcast(parsed) && parsed.status === "live";

  if (valid) {
    setPhase("syncing");
  } else {
    goOffAir(); // ⬅️ ESTO ES LO QUE FALTABA
  }
}, SPLASH_TIME);

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
• Any logic change = MAJOR VERSION
• Any UI change = HTML/CSS only
• Contract violations = REJECTED

VERSION
• LISTENER v18.2.1

FREEZE STATUS
• LOCKED
• ENGINE SEALED
• DO NOT MODIFY

SEALED
• Resonant — The Underground Music Signal
============================================================ */
