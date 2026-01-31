/* ============================================================
   RESONANT · LISTENER ENGINE
===============================================================

ROLE
• Channel audio engine (SETS)
• Broadcast consumption
• Drift control (soft + hard)
• Watchdog & recovery
• Headend-grade resilience

AUTHORITY
• Audio element
• Timers & side effects

PAIRING
• app.core.js  → multichannel state & helpers
• app.ui.js    → render only
• app.boot.js  → lifecycle glue

STATUS
• CANON
• MULTICHANNEL READY
• BROADCAST-GRADE · HEADEND
=============================================================== */

"use strict";

import * as CORE from "./app.core.js";

/* ------------------------------------------------------------
   CHANNEL BINDING (CANON)
------------------------------------------------------------ */

// Snapshot channel identifier (ENGINE → CORE)
const CHANNEL_KEY = "SETS";

function getChannel() {
  return CORE.state;
}

// init defaults (safe)
const channel = getChannel();
if (channel) {
  channel.userIntentMuted ??= false;
}

/* ------------------------------------------------------------
   INTERNALS
------------------------------------------------------------ */

let audio = null;
let syncTimer = null;
let watchdogTimer = null;
let prefetchAudio = null;

let watchdogCooldownUntil = 0;


let userGestureConfirmed = false;

export function confirmUserGesture() {
  userGestureConfirmed = true;

  setTimeout(() => {
    attemptPlay();
  }, 0);
}



/* ------------------------------------------------------------
   AUDIO SETUP
------------------------------------------------------------ */

function ensureAudio() {
  const channel = getChannel();
  if (!channel) return null;

  if (audio) return audio;

  audio = new Audio();
audio.preload = "auto";
audio.playsInline = true;
audio.muted = false;

// 🔒 DOM attach (REQUIRED for mobile autoplay)
if (!document.body.contains(audio)) {
  audio.style.display = "none";
  document.body.appendChild(audio);
}


  audio.addEventListener("playing", () => {
    const channel = getChannel();
    if (!channel) return;
    channel.lastAudioAt = Date.now();
  });

  audio.addEventListener("ended", () => {
  const channel = getChannel();
  if (!channel) return;

  // Only treat ended as failure if broadcast is stale
  if (CORE.isBroadcastStale(channel)) {
    channel.lastTransitionReason = "audio-ended-stale";
    forceOffAir("audio-ended");
  }
});

  audio.addEventListener("error", () => {
    const channel = getChannel();
    if (!channel) return;

    channel.lastErrorType = "decode";
    channel.lastTransitionReason = "audio-error";
    restartAudio();
  });

  return audio;
}

/* ------------------------------------------------------------
   PREFETCH (HEADEND STYLE)
------------------------------------------------------------ */

function prefetchSource(url) {
  if (!url) return;

  if (prefetchAudio) {
    prefetchAudio.src = "";
    prefetchAudio = null;
  }

  prefetchAudio = new Audio();
  prefetchAudio.preload = "auto";
  prefetchAudio.src = url;
  prefetchAudio.playsInline = true;

}

/* ------------------------------------------------------------
   BROADCAST INGEST (SETS)
------------------------------------------------------------ */

export function ingestBroadcast(raw) {
  const channel = getChannel();
  if (!channel) return;

  const parsed = CORE.safeParseBroadcast(raw);
  if (!CORE.isValidBroadcast(parsed)) return;

  const isLive =
  parsed.status === "live" ||
  parsed.phase === "live" ||
  parsed.phase === "syncing";

if (!isLive) {
  forceOffAir("admin-offair");
  return;
}

  channel.lastBroadcastSeenAt = Date.now();
  CORE.saveSnapshot(CHANNEL_KEY, parsed);
  enterLive(parsed);
}

/* ------------------------------------------------------------
   LIVE ENTRY
------------------------------------------------------------ */

function enterLive(b) {
  const channel = getChannel();
  if (!channel) return;

  channel.forceOffAirUntil ??= 0;

  if (Date.now() < channel.forceOffAirUntil) return;

  if (!b.url) {
    channel.lastTransitionReason = "no-url";
    return;
  }

  const a = ensureAudio();
  a.muted = channel.userIntentMuted;

  channel.phase = "live";
  channel.lastLiveAt = Date.now();
  channel.sourceMode = "live";
  channel.url = b.url;

  // 🔔 UI PHASE SYNC (CANON)
document.body.setAttribute("data-phase", "live");

  channel.startedAt = b.startedAt;
  channel.currentDuration =
    b.duration || b.currentDuration || null;

  const meta = b.meta ?? b;

// METADATA (ROOT OR META)
channel.artist = CORE.normalizeArtist(meta);
channel.artistSlug =
  CORE.normalizeSlug(
    meta?.artistSlug || channel.artist
  );

channel.title = CORE.normalizeTitle(meta);

channel.contributor = CORE.normalizeContributor(meta);
channel.contributorSlug = CORE.normalizeSlug(
    meta?.contributorSlug || channel.contributor
);

// ARTWORK
channel.artwork = meta?.artwork?.cover || meta?.artwork || null;

  channel.lastTransitionReason = "enter-live";
  channel.watchdogRestarts = 0;

  // 🔑 URL NORMALIZATION (CANON)
const resolvedUrl =
  typeof b.url === "string"
    ? b.url
    : typeof b.url === "object"
    ? b.url.url
    : null;

if (!resolvedUrl) {
  channel.lastTransitionReason = "invalid-url";
  forceOffAir("invalid-url");
  return;
}

a.src = resolvedUrl;
a.load();


if (b.nextUrl) {
  prefetchSource(b.nextUrl);
}

// defer play to next microtask (prevents race)
setTimeout(() => {
  attemptPlay();
}, 0);

startSync();
startWatchdog();

}

/* ------------------------------------------------------------
   PLAY CONTROL
------------------------------------------------------------ */

function attemptPlay() {
  const channel = getChannel();
  if (!channel) return;

  const a = ensureAudio();
  if (!a) return;
  if (!a.src) return;

  if (channel.userIntentMuted) {
    a.muted = true;
    return;
  }

  a.muted = false;

  if (!userGestureConfirmed) {
    channel.awaitingUserResume = true;

    setTimeout(() => {
      if (userGestureConfirmed) attemptPlay();
    }, 500);

    return;
  }

  const p = a.play();

if (p && typeof p.then === "function") {
  p.then(() => {
    channel.awaitingUserResume = false;
    channel.lastAudioAt = Date.now();

    // 🔔 UX + STATE SYNC
    document.body.setAttribute("data-phase", "live");

    if (channel.phase !== "live") {
      channel.phase = "live";
      channel.lastLiveAt = Date.now();
    }
  }).catch(() => {
    channel.awaitingUserResume = true;
    channel.lastTransitionReason = "autoplay-blocked";

    // 🔔 UX SIGNAL (needs user tap)
    document.body.setAttribute("data-phase", "syncing");
  });
}
}

/* ------------------------------------------------------------
   SYNC LOOP (SOFT + HARD)
------------------------------------------------------------ */

function startSync() {
  const channel = getChannel();
  if (!channel) return;
  stopSync();

  syncTimer = setInterval(() => {
    if (channel.phase !== "live" && channel.phase !== "syncing") return;

    if (CORE.isBroadcastStale(channel)) {
      forceOffAir("ttl-expired");
      return;
    }

    if (!channel.startedAt) return;

    const a = ensureAudio();
    if (!a.src) return;

    const expected = (Date.now() - channel.startedAt) / 1000;
    const diff = a.currentTime - expected;
    const driftMs = Math.abs(diff) * 1000;

    if (driftMs > CORE.DRIFT_SOFT && driftMs < CORE.DRIFT_HARD) {
  a.currentTime =
    a.currentTime - Math.sign(diff) * Math.min(Math.abs(diff), 0.25);
  channel.lastTransitionReason = "soft-drift-correct";
}

    if (driftMs >= CORE.DRIFT_HARD) {
      a.currentTime = expected;
      channel.lastTransitionReason = "hard-drift-correct";
    }

    if (channel.phase !== "live") {
      channel.phase = "live";
      channel.lastLiveAt = Date.now();
    }
  }, CORE.SYNC_LIVE);
}

function stopSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

function restartAudio() {
  const channel = getChannel();
  if (!channel) return;

  const a = ensureAudio();
  if (!a) return;

  a.pause();
  a.currentTime = 0;

  if (!channel.userIntentMuted) {
  userGestureConfirmed = true;
  attemptPlay();
}

}

function startWatchdog() {
  stopWatchdog();

  watchdogTimer = setInterval(() => {
    const channel = getChannel();
if (!channel || !["live","syncing"].includes(channel.phase)) return;

    const now = Date.now();

    // ⛔ Backoff activo
    if (now < watchdogCooldownUntil) return;

    const last = channel.lastAudioAt || 0;

    if (now - last > CORE.WATCHDOG_TIMEOUT) {
      channel.lastTransitionReason = "watchdog-timeout";
      channel.watchdogRestarts++;

      if (channel.watchdogRestarts >= CORE.WATCHDOG_MAX_RESTARTS) {
        channel.lastTransitionReason = "watchdog-max-restarts";
        forceOffAir("watchdog-failed");
        return;
      }

      watchdogCooldownUntil = now + Math.min(
        CORE.WATCHDOG_BACKOFF_BASE * channel.watchdogRestarts,
        CORE.WATCHDOG_BACKOFF_MAX
      );

      restartAudio();
    }
  }, CORE.WATCHDOG_INTERVAL);
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

/* ------------------------------------------------------------
   OFF AIR
------------------------------------------------------------ */

function forceOffAir(reason) {
  const channel = getChannel();
  if (!channel) return;

  stopSync();
  stopWatchdog();

  if (audio) {
   audio.pause();
audio.removeAttribute("src");
audio.currentTime = 0;
audio.load();

  }

  if (prefetchAudio) {
    prefetchAudio.removeAttribute("src");
    prefetchAudio.load();
    prefetchAudio = null;
  }

channel.phase = "offair";
channel.sourceMode = "fallback";
channel.forceOffAirUntil = Date.now() + CORE.LIVE_GRACE;

// 🔔 UI PHASE SYNC
document.body.setAttribute("data-phase", "offair");

channel.lastTransitionReason = reason;
channel.lastOffAirReason = reason;

  channel.watchdogRestarts = 0;
  channel.awaitingUserResume = false;
  watchdogCooldownUntil = 0;

}

/* ------------------------------------------------------------
   USER INTENT
------------------------------------------------------------ */

export function toggleUserMute() {
  const channel = getChannel();
  if (!channel) return;

  channel.userIntentMuted = !channel.userIntentMuted;

  if (channel.userIntentMuted) {
    if (audio) audio.muted = true;
  } else {
    attemptPlay();
  }
}

export function onUserIntent(intent) {
  if (intent === "toggle") {
    toggleUserMute();
  }
}


/* ------------------------------------------------------------
   VISIBILITY
------------------------------------------------------------ */

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  const channel = getChannel();
if (channel?.phase === "live" && !channel.userIntentMuted) {
  attemptPlay();
}
});

/* ============================================================
   END · app.engine.js
===============================================================

CANON NOTES
• Listener never advances content
• Admin controls ring & scheduling
• Drift handled softly before hard seek
• Watchdog classifies failure type
• Prefetch improves seamless transitions
• Cable-headend ready
=============================================================== */
