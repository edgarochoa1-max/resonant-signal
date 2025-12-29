/* ============================================================
   RESONANT · LISTENER APP ENGINE — 👉 V2.6.2
   FULL COMPILED · DOM-SAFE · FINAL
   Admin-driven · Drift-safe · Audio-authoritative
   Metadata-authoritative · Support-the-Artist locked
   OFF AIR hardened · Auto-recovery · Mobile-safe
============================================================ */

/*
STATUS:
- ENGINE: STABLE
- ROLE: Passive Listener
- AUTHORITY: Admin only
- MODIFICATIONS REQUIRE VERSION BUMP

FREEZE:
- VERSION: v2.6.2
- STATE: FROZEN
- DATE: 2025-12-29
- POLICY:
  * No logic changes
  * No refactors
  * No hotfixes
  * New features require new file or version bump
*/

/* ------------------------------------------------------------
   CONFIG
------------------------------------------------------------ */
const BROADCAST_KEY = "resonant_broadcast_state_v2";
const EXPECTED_BROADCAST_VERSION = 2;

const SPLASH_TIME = 2200;

const SYNC_FAST = 700;
const SYNC_LIVE = 1000;
const SYNC_IDLE = 1800;

const DRIFT_TOLERANCE = 1500;
const DRIFT_HARD = 3500;

const LIVE_GRACE = 5000;
const BROADCAST_TTL = 30000;

const SILENCE_TIMEOUT = 8000;

const SNAPSHOT_KEY = "resonant_broadcast_snapshot_v1";

const WATCHDOG_INTERVAL = 15000;
const WATCHDOG_STALL = 20000;
const WATCHDOG_MAX_RESTARTS = 3;

const DEBUG_AUDIO = false;
const DEBUG_PREFIX = "[Resonant]";
const TAP_HINT_KEY = "resonant_tap_hint_seen_v1";

/* ------------------------------------------------------------
   CHANNELS · STRUCTURE (PATCH 6)
------------------------------------------------------------ */
const CHANNELS = {
  SETS: { id: "sets", label: "Sets", mode: "broadcast", enabled: true },
  TRACKS: { id: "tracks", label: "Tracks", mode: "rotation", enabled: false },
  LABELS: { id: "labels", label: "Labels", mode: "curated", enabled: false }
};

const DEFAULT_CHANNEL = "SETS";
const CHANNEL_KEY = "resonant_active_channel_v1";

/* ------------------------------------------------------------
   STATE
------------------------------------------------------------ */
const state = {
  phase: "splash",
  channel: DEFAULT_CHANNEL,
  url: null,
  startedAt: null,
  duration: null,
  syncTimer: null,
  lastLiveAt: 0,
  artist: null,

  activeAdminId: null,
  handoffNoticeShown: false,

  mode: "broadcast",
  autoIndex: 0,

  pendingBroadcast: null,
  lastBroadcastSeenAt: 0,

  watchdogTimer: null,
  watchdogRestarts: 0
  
};

/* ------------------------------------------------------------
   DOM (GUARDED)
------------------------------------------------------------ */
const ui = {
  splash: document.getElementById("splash-screen"),
  sync: document.getElementById("sync-screen"),
  offair: document.getElementById("offair-screen"),
  offairBanner: document.getElementById("offair-banner"),
  appRoot: document.querySelector(".app-root"),

  title: document.getElementById("title"),
  artist: document.getElementById("artist-name"),
  catalogArtist: document.getElementById("catalog-artist-name") || null,

  cover: document.getElementById("cover"),

  elapsed: document.getElementById("elapsed"),
  remaining: document.getElementById("remaining"),
  progress: document.getElementById("bar-fill"),

  playBtn: document.getElementById("play-btn"),
  livePill: document.getElementById("live-pill"),

  likeBtn: document.getElementById("like-btn"),
  heart: document.getElementById("heart"),
  inviteBtn: document.getElementById("invite-btn"),

  feedbackMsg: document.getElementById("feedback-message"),
  feedbackLink: document.getElementById("feedback-link"),
  feedbackSend: document.getElementById("btn-feedback-send"),
  feedbackStatus: document.getElementById("feedback-status"),

  tabs: document.querySelectorAll(".tab"),
  navBtns: document.querySelectorAll(".nav-btn"),

  tapHint: document.getElementById("tap-hint")
};

let iframe = document.getElementById("sc-frame");
let widget = null;
let userPaused = false;
let lastAudioAt = Date.now();

/* ------------------------------------------------------------
   SAFE BROADCAST PARSE
------------------------------------------------------------ */
function safeParseBroadcast(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const b = JSON.parse(raw);
    if (!b || typeof b !== "object") return null;
    if (!b.status) return null;
    if (b.status === "live") {
      if (!b.url || !b.startedAt || !b.updatedAt) return null;
    }
    return b;
  } catch {
    return null;
  }
}

function loadSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap?.state?.updatedAt) return null;
    return snap;
  } catch {
    return null;
  }
}

function reviveFromSnapshot(snap) {
  const b = snap?.state;
  if (!b?.url || !b?.startedAt) return;
  loadTrack({ url: b.url, startedAt: b.startedAt, meta: b.meta || {}, adminId: b.adminId });
}

/* ------------------------------------------------------------
   INIT
------------------------------------------------------------ */
window.addEventListener("load", () => {
  bindUI();
  initTabs();

  const channel = loadActiveChannel();
  setChannel(channel);

  setPhase("splash");

  setTimeout(() => startSync(SYNC_FAST), SPLASH_TIME);

  // 🔒 Listener nunca inicia música
  setTimeout(() => {
    if (state.phase === "splash" || state.phase === "syncing") {
      state.lastBroadcastSeenAt = 0;
      goOffAir();
    }
  }, SPLASH_TIME + 1200);
});

registerServiceWorker();

/* ============================================================
   TAB NAVIGATION — V16 SAFE RESTORE
   Scope: UI only · No engine impact
============================================================ */

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const navButtons = document.querySelectorAll(".nav-btn");

  function activateTab(key) {
    tabs.forEach(t => t.classList.remove("active"));
    navButtons.forEach(b => b.classList.remove("active"));

    const tab = document.getElementById(`tab-${key}`);
    const btn = document.querySelector(`.nav-btn[data-tab="${key}"]`);

    if (!tab || !btn) return;

    tab.classList.add("active");
    btn.classList.add("active");

    document.body.dataset.activeTab = key;
  }

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab);
    });
  });

  // 🔑 DEFAULT
  activateTab("radio");
}

/* ------------------------------------------------------------
   UI
------------------------------------------------------------ */
function bindUI() {

  ui.playBtn && (ui.playBtn.onclick = togglePlay);

  ui.likeBtn && (ui.likeBtn.onclick = () => {
    const key = getLikeKey();
    if (!key) return;
    const liked = localStorage.getItem(key) === "1";
    localStorage.setItem(key, liked ? "0" : "1");
    renderLike();
  });

  if (ui.inviteBtn) {
    ui.inviteBtn.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      const url = location.href;
      if (navigator.share) {
        try {
          await navigator.share({
            title: "Resonant",
            text: "The Underground Music Signal",
            url
          });
          return;
        } catch {}
      }
      try {
        await navigator.clipboard.writeText(url);
        showInviteFeedback("Link copied — ready to paste ✨");
      } catch {
        showInviteFeedback("Copy failed — please copy manually");
      }
    });
  }

  if (ui.feedbackSend) {
    ui.feedbackSend.onclick = () => {
      const msg = ui.feedbackMsg?.value?.trim();
      if (!msg) return;
      const link = ui.feedbackLink?.value?.trim();
      location.href =
        `mailto:edgarochoa1@live.com?subject=Resonant Feedback&body=` +
        encodeURIComponent(msg + (link ? "\n\nLink: " + link : ""));
      ui.feedbackStatus &&
        (ui.feedbackStatus.textContent = "Thanks for your feedback.");
    };
  }
}

function renderLike() {
  if (!ui.heart || !ui.likeBtn) return;

  const key = getLikeKey();
  const liked = key && localStorage.getItem(key) === "1";

  // 🔒 SIEMPRE el corazón que te gusta
  ui.heart.textContent = "♡";

  if (liked) {
    ui.likeBtn.classList.add("liked");
  } else {
    ui.likeBtn.classList.remove("liked");
  }
}

/* ------------------------------------------------------------
   PHASES
------------------------------------------------------------ */
function setPhase(phase) {
  if (state.phase === phase) return;
  state.phase = phase;

  ui.splash?.classList.add("hidden");
  ui.sync?.classList.add("hidden");
  ui.offair?.classList.add("hidden");
  ui.offairBanner?.classList.add("hidden");

  // ⚠️ NO TOCAR TABS AQUÍ
  // El phase controla SISTEMA, no navegación

  if (phase === "splash") {
    ui.splash?.classList.remove("hidden");
    document.body.style.overflowY = "hidden";
  }

  if (phase === "syncing") {
    ui.sync?.classList.remove("hidden");
    document.body.style.overflowY = "hidden";
  }

  if (phase === "offair") {
    ui.offair?.classList.remove("hidden");
    ui.offairBanner?.classList.remove("hidden");
    document.body.style.overflowY = "hidden";
  }

  if (phase === "live") {
    ui.appRoot?.classList.add("app-ready");
    document.body.style.overflowY = "auto";
    // ❌ NO setTab("radio")
    // ❌ NO forzar vista
  }
}

/* ------------------------------------------------------------
   TABS
------------------------------------------------------------ */
function setTab(tab) {
  ui.tabs?.forEach(t => t.classList.remove("active"));
  document.getElementById(`tab-${tab}`)?.classList.add("active");
  ui.navBtns?.forEach(b => b.classList.remove("active"));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add("active");
}

let defaultTabLocked = false;

function ensureDefaultTabVisible() {
  if (defaultTabLocked) return;

  const activeNav = document.querySelector(".nav-btn.active");
  if (activeNav && activeNav.dataset.tab !== "radio") return;

  setTab("radio");
  defaultTabLocked = true;
}

/* ------------------------------------------------------------
   CHANNEL CONTROL
------------------------------------------------------------ */
function setChannel(channelKey) {
  if (state.channel === channelKey) {
    // 🔒 NO tocar engine si ya estamos ahí
    setTab(CHANNELS[channelKey].id);
    return;
  }

  const channel = CHANNELS[channelKey];
  if (!channel || !channel.enabled) channelKey = DEFAULT_CHANNEL;

  state.channel = channelKey;

  document.body.dataset.channel = channelKey;
  document.body.dataset.channelActive = channel.id;

  saveActiveChannel(channelKey);
  setTab(channel.id);

  debugLog("Channel set:", channelKey);
}

/* ------------------------------------------------------------
   SYNC
------------------------------------------------------------ */
function startSync(interval) {
  if (state.syncTimer) clearInterval(state.syncTimer);
  syncTick();
  state.syncTimer = setInterval(syncTick, interval);
}

function syncTick() {
  const raw = localStorage.getItem(BROADCAST_KEY);
  const b = safeParseBroadcast(raw);

  if (b && b.status === "live") state.lastBroadcastSeenAt = Date.now();

  if (widget && state.phase === "live") {
    const sinceAudio = Date.now() - lastAudioAt;
    if (sinceAudio < BROADCAST_TTL * 2 && !b && Date.now() - state.lastBroadcastSeenAt < BROADCAST_TTL) return;

    if (!b) {
      const now = Date.now();
      if (now - state.lastBroadcastSeenAt < BROADCAST_TTL) return;
      const snap = loadSnapshot();
      if (snap && snap.state && now - snap.savedAt < BROADCAST_TTL) {
        if (!state.url || !widget || state.phase !== "live") reviveFromSnapshot(snap);
        return;
      }
      return guardedOffAir();
    }
  }

  if (!b) return guardedOffAir();
  if (b.version !== EXPECTED_BROADCAST_VERSION) return guardedOffAir();

  if (!b.leaseUntil || Date.now() > b.leaseUntil) {
    if (widget && state.phase === "live" && Date.now() - lastAudioAt < BROADCAST_TTL) return;
    return guardedOffAir();
  }

  const silence = Date.now() - b.updatedAt;
  if (silence > BROADCAST_TTL * 2) {
    state.activeAdminId = null;
    state.handoffNoticeShown = false;
    return guardedOffAir();
  }

  if (!state.activeAdminId) state.activeAdminId = b.adminId || null;

  if (state.mode === "autodj" && state.activeAdminId) {
    if (!state.pendingBroadcast) state.pendingBroadcast = b;
    return;
  }

  if (b.adminId && state.activeAdminId !== b.adminId) {
    state.activeAdminId = b.adminId;
    state.handoffNoticeShown = false;
  }

  if (!state.handoffNoticeShown && state.phase === "live") {
    showHandoffNotice();
    state.handoffNoticeShown = true;
  }

  if (b.status === "transition") {
    setPhase("syncing");
    return;
  }

  if (!b.updatedAt || Date.now() - b.updatedAt > BROADCAST_TTL || b.status !== "live" || !b.url || !b.startedAt) {
    return guardedOffAir();
  }

  state.lastLiveAt = Date.now();
  if (b.url !== state.url || b.startedAt !== state.startedAt) return loadTrack(b);
  checkDrift(b.startedAt);
}

/* ------------------------------------------------------------
   OFF AIR
------------------------------------------------------------ */
function guardedOffAir() {
  if (state.phase !== "offair" && state.phase !== "live") setPhase("offair");
  if (userPaused) return;

  if (state.mode === "broadcast" && !state.activeAdminId && Date.now() - state.lastBroadcastSeenAt >= BROADCAST_TTL) {
    if (!widget) return goOffAir();
if (Date.now() - lastAudioAt >= SILENCE_TIMEOUT) return goOffAir();
    return;
  }

  if (widget) {
    widget.isPaused(paused => {
      if (!paused) recoverFromAudio();
      else safeGoOffAir();
    });
    return;
  }
  safeGoOffAir();
}

function safeGoOffAir() {
  if (state.phase === "live" && Date.now() - state.lastLiveAt < LIVE_GRACE) return;
  goOffAir();
}

function goOffAir() {
  closeCurrentSession();
  clearWatchdog();
  if (state.phase === "offair") return;
  stopPlayback(true);
  state.mode = "broadcast";
  state.activeAdminId = null;
  state.pendingBroadcast = null;
  renderLike();
  setPhase("offair");
}

/* ------------------------------------------------------------
   SUPPORT THE ARTIST
------------------------------------------------------------ */
function updateArtistLinks(artist) {
  const name = artist?.trim();
  const hasArtist = Boolean(name);
  const q = hasArtist ? encodeURIComponent(name) : "";

  setArtistLink("link-bandcamp", hasArtist ? `https://bandcamp.com/search?q=${q}` : null);
  setArtistLink("link-discogs", hasArtist ? `https://www.discogs.com/search/?q=${q}&type=artist` : null);
  setArtistLink("link-soundcloud", hasArtist ? `https://soundcloud.com/search?q=${q}` : null);
  setArtistLink("link-juno", hasArtist ? "https://www.juno.co.uk/" : null);
  setArtistLink("link-deejay", hasArtist ? "https://www.deejay.de" : null);
  setArtistLink("link-subwax", hasArtist ? "https://subwax.es/" : null);
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
   PLAYER
------------------------------------------------------------ */
function loadTrack(b) {
  clearWatchdog();

  state.url = b.url;
  renderLike();

  state.startedAt = b.startedAt;
  state.duration = null;
  state.lastLiveAt = Date.now();
  state.artist = b.meta?.artist || null;
  userPaused = false;

  ui.title && (ui.title.textContent = b.meta?.title || "Loading mix…");
  ui.artist && (ui.artist.textContent = state.artist || "");
  ui.catalogArtist && (ui.catalogArtist.textContent = state.artist || "—");
  updateArtistLinks(state.artist);

  if (ui.cover) ui.cover.style.backgroundImage = b.meta?.artwork ? `url(${b.meta.artwork})` : "";

  updateMediaSession({ title: b.meta?.title, artist: b.meta?.artist, artwork: b.meta?.artwork });

  ui.elapsed && (ui.elapsed.textContent = "0:00");
  ui.remaining && (ui.remaining.textContent = "-0:00");
  ui.progress && (ui.progress.style.width = "0%");

  setPhase("live");

  const fresh = iframe?.cloneNode();
  if (iframe && fresh) iframe.parentNode.replaceChild(fresh, iframe);
  iframe = fresh || iframe;
  if (!iframe) return;

  iframe.src = "https://w.soundcloud.com/player/?url=" + encodeURIComponent(b.url) + "&auto_play=false";
  widget = window.SC?.Widget?.(iframe);
  if (!widget) return;

  widget.bind(window.SC.Widget.Events.READY, () => {
    widget.getDuration(dur => {
      if (typeof dur === "number" && dur > 0) {
        state.duration = dur;
        ui.remaining && (ui.remaining.textContent = "-" + formatTime(dur));
      }
    });
    const offset = Math.max(0, Date.now() - b.startedAt);
    widget.seekTo(offset);
    widget.play();
    lastAudioAt = Date.now();
    ui.livePill?.classList.remove("off");
    startSync(SYNC_LIVE);
  });

  widget.bind(window.SC.Widget.Events.PLAY, recoverFromAudio);
  widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, e => {
    lastAudioAt = Date.now();
    updateProgress(e.currentPosition, e.duration);
  });
    
}

/* ------------------------------------------------------------
   METRICS
------------------------------------------------------------ */
let currentSession = null;
let sessionTimer = null;

function startListeningSession() {
  if (currentSession || state.phase !== "live") return;
  currentSession = { startedAt: Date.now(), listenedMs: 0, endedAt: null, source: state.mode };
  sessionTimer = setInterval(() => currentSession && (currentSession.listenedMs += 1000), 1000);
}

function closeCurrentSession() {
  if (!currentSession) return;
  clearInterval(sessionTimer);
  sessionTimer = null;
  currentSession.endedAt = Date.now();
  try {
    const key = "resonant_sessions_v2";
    const raw = localStorage.getItem(key);
    const sessions = raw ? JSON.parse(raw) : [];
    sessions.push(currentSession);
    localStorage.setItem(key, JSON.stringify(sessions));
  } catch {}
  currentSession = null;
}

/* ------------------------------------------------------------
   AUDIO CONFIRMATION
------------------------------------------------------------ */

function recoverFromAudio() {
  state.lastLiveAt = Date.now();
  userPaused = false;
  if (state.phase !== "live") setPhase("live");

  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));

  ui.offair?.classList.add("hidden");
  ui.offairBanner?.classList.add("hidden");
  ui.livePill?.classList.remove("off");

  startListeningSession();
  startSync(SYNC_LIVE);
  startWatchdog();
}

/* ------------------------------------------------------------
   PLAY / PAUSE
------------------------------------------------------------ */
function togglePlay() {
  if (!widget) return;
  widget.isPaused(paused => {
    userPaused = !paused;
    if (paused) widget.play();
    else {
      widget.pause();
      clearWatchdog();
    }
  });
}

function stopPlayback(force = false) {
  if (!force && Date.now() - lastAudioAt < SILENCE_TIMEOUT) return;
  try { widget?.pause(); } catch {}
  ui.livePill?.classList.add("off");
}

/* ------------------------------------------------------------
   WATCHDOG
------------------------------------------------------------ */
function startWatchdog() {
  if (state.watchdogTimer) return;
  state.watchdogTimer = setInterval(() => {
    if (!widget || userPaused || state.phase !== "live") return;
    const silence = Date.now() - lastAudioAt;
    if (silence < WATCHDOG_STALL) return;
    state.watchdogRestarts++;
    stopPlayback(true);
    if (state.watchdogRestarts >= WATCHDOG_MAX_RESTARTS) {
      clearWatchdog();
      goOffAir();
      return;
    }
    guardedOffAir();
  }, WATCHDOG_INTERVAL);
}

function clearWatchdog() {
  if (!state.watchdogTimer) return;
  clearInterval(state.watchdogTimer);
  state.watchdogTimer = null;
  state.watchdogRestarts = 0;
}

/* ------------------------------------------------------------
   DRIFT
------------------------------------------------------------ */
function checkDrift(startedAt) {
  if (!widget || !startedAt) return;
  widget.getPosition(pos => {
    if (typeof pos !== "number") return;
    const correct = Date.now() - startedAt;
    const drift = pos - correct;
    if (Math.abs(drift) <= DRIFT_TOLERANCE) return;
    widget.seekTo(correct);
    if (Math.abs(drift) > DRIFT_HARD && !userPaused) widget.play();
  });
}

/* ------------------------------------------------------------
   PROGRESS
------------------------------------------------------------ */
function updateProgress(pos, dur) {
  const total = state.duration || dur;
  if (!total) return;
  ui.progress && (ui.progress.style.width = `${Math.min(100, (pos / total) * 100)}%`);
  ui.elapsed && (ui.elapsed.textContent = formatTime(pos));
  ui.remaining && (ui.remaining.textContent = "-" + formatTime(Math.max(0, total - pos)));
}

/* ------------------------------------------------------------
   VISIBILITY
------------------------------------------------------------ */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    closeCurrentSession();
    startSync(SYNC_IDLE);
  } else {
    startSync(SYNC_FAST);
    forceResync();
  }
});

function forceResync() {
  if (!widget || !state.startedAt) return;
  widget.getPosition(pos => {
    if (typeof pos !== "number") return;
    const correct = Date.now() - state.startedAt;
    if (Math.abs(pos - correct) > DRIFT_TOLERANCE) widget.seekTo(correct);
  });
}

/* ------------------------------------------------------------
   LIKES / UI HELPERS
------------------------------------------------------------ */
function getLikeKey() {
  return state.url ? `resonant_like_${state.url}` : null;
}

function showInviteFeedback(text) {
  if (!ui.inviteBtn) return;
  const original = ui.inviteBtn.textContent;
  ui.inviteBtn.classList.add("copied");
  ui.inviteBtn.textContent = text;
  setTimeout(() => {
    ui.inviteBtn.classList.remove("copied");
    ui.inviteBtn.textContent = original;
  }, 2200);
}

function showHandoffNotice() {
  if (!ui.livePill) return;
  ui.livePill.textContent = "SYNCED";
  ui.livePill.classList.remove("off");
  setTimeout(() => ui.livePill && (ui.livePill.textContent = "LIVE"), 2000);
}

/* ------------------------------------------------------------
   UTILS
------------------------------------------------------------ */
function loadActiveChannel() {
  try {
    const raw = localStorage.getItem(CHANNEL_KEY);
    if (raw && CHANNELS[raw] && CHANNELS[raw].enabled) return raw;
  } catch {}
  return DEFAULT_CHANNEL;
}

function saveActiveChannel(channel) {
  try { localStorage.setItem(CHANNEL_KEY, channel); } catch {}
}

function debugLog(...args) {
  if (!DEBUG_AUDIO) return;
  console.log(DEBUG_PREFIX, ...args);
}

function updateMediaSession({ title, artist, artwork }) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || "Resonant",
      artist: artist || "The Underground Music Signal",
      artwork: artwork ? [{ src: artwork, sizes: "512x512", type: "image/png" }] : []
    });
    navigator.mediaSession.setActionHandler("play", () => widget?.play());
    navigator.mediaSession.setActionHandler("pause", () => widget?.pause());
  } catch {}
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

window.addEventListener("beforeunload", closeCurrentSession);

/* ------------------------------------------------------------
   SERVICE WORKER REGISTER
------------------------------------------------------------ */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

