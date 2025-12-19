/* ============================================================
   RESONANT · LISTENER APP ENGINE — V2.6.1 PATCHED
   Admin-driven · Drift-safe · Audio-authoritative
   Metadata-authoritative · Support-the-Artist locked
   OFF AIR hardened · Auto-recovery · Mobile-safe
============================================================ */

/* ------------------------------------------------------------
   CONFIG
------------------------------------------------------------ */
const BROADCAST_KEY = "resonant_broadcast_state_v2";

const SPLASH_TIME = 2200;

const SYNC_FAST = 700;
const SYNC_LIVE = 1000;
const SYNC_IDLE = 1800;

const DRIFT_TOLERANCE = 1500;
const DRIFT_HARD = 3500;

const LIVE_GRACE = 5000;
const BROADCAST_TTL = 20000;

/* ------------------------------------------------------------
   STATE
------------------------------------------------------------ */
const state = {
  phase: "boot", // splash | syncing | offair | live
  url: null,
  startedAt: null,
  duration: null,
  syncTimer: null,
  lastLiveAt: 0,
  artist: null
};

/* ------------------------------------------------------------
   DOM
------------------------------------------------------------ */
const ui = {
  splash: document.getElementById("splash-screen"),
  sync: document.getElementById("sync-screen"),
  offair: document.getElementById("offair-screen"),
  offairBanner: document.getElementById("offair-banner"),
  appRoot: document.querySelector(".app-root"),

  title: document.getElementById("title"),
  artist: document.getElementById("artist-name"),
  catalogArtist: document.getElementById("catalog-artist-name"),
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
  navBtns: document.querySelectorAll(".nav-btn")
};

let iframe = document.getElementById("sc-frame");
let widget = null;
let userPaused = false;

/* ------------------------------------------------------------
   INIT
------------------------------------------------------------ */
window.addEventListener("load", () => {
  bindUI();
  setPhase("splash");

  setTimeout(() => {
    startSync(SYNC_FAST);
  }, SPLASH_TIME);
});

/* ------------------------------------------------------------
   UI
------------------------------------------------------------ */
function bindUI() {
  ui.navBtns.forEach(btn => {
    btn.onclick = () => setTab(btn.dataset.tab);
  });

  ui.playBtn.onclick = togglePlay;

  ui.likeBtn.onclick = () => {
  const key = getLikeKey();
  if (!key) return;

  const liked = localStorage.getItem(key) === "1";
  localStorage.setItem(key, liked ? "0" : "1");
  renderLike();
};

  ui.inviteBtn.onclick = async () => {
  const url = location.href;

  // Mobile / supported share
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Resonant",
        text: "The Underground Music Signal",
        url
      });
      return;
    } catch {
      // user cancelled → fallback to copy
    }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(url);
    showInviteFeedback("Link copied — ready to paste ✨");
  } catch {
    showInviteFeedback("Copy failed — please copy manually");
  }
};


  ui.feedbackSend.onclick = () => {
    const msg = ui.feedbackMsg.value.trim();
    if (!msg) return;
    const link = ui.feedbackLink.value.trim();
    location.href =
      `mailto:edgarochoa1@live.com?subject=Resonant Feedback&body=${encodeURIComponent(
        msg + (link ? "\n\nLink: " + link : "")
      )}`;
    ui.feedbackStatus.textContent = "Thanks for your feedback.";
  };
}

function renderLike() {
  const key = getLikeKey();
  if (!key) return;

  const liked = localStorage.getItem(key) === "1";
  ui.heart.textContent = liked ? "♥" : "♡";
  ui.likeBtn.classList.toggle("liked", liked);
}

/* ------------------------------------------------------------
   PHASES
------------------------------------------------------------ */
function setPhase(phase) {
  if (state.phase === phase) return;
  state.phase = phase;

  ui.splash.classList.add("hidden");
  ui.sync.classList.add("hidden");
  ui.offair.classList.add("hidden");
  ui.offairBanner.classList.add("hidden");
  ui.appRoot.classList.remove("app-ready");

  if (phase === "splash") ui.splash.classList.remove("hidden");
  if (phase === "syncing") ui.sync.classList.remove("hidden");
  if (phase === "offair") {
    ui.offair.classList.remove("hidden");
    ui.offairBanner.classList.remove("hidden");
  }
  if (phase === "live") ui.appRoot.classList.add("app-ready");
}

/* ------------------------------------------------------------
   TABS
------------------------------------------------------------ */
function setTab(tab) {
  ui.tabs.forEach(t => t.classList.remove("active"));
  document.getElementById(`tab-${tab}`)?.classList.add("active");

  ui.navBtns.forEach(b => b.classList.remove("active"));
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add("active");
}

/* ------------------------------------------------------------
   SYNC ENGINE
------------------------------------------------------------ */
function startSync(interval) {
  clearInterval(state.syncTimer);
  state.syncTimer = setInterval(syncTick, interval);
}

function syncTick() {
  const raw = localStorage.getItem(BROADCAST_KEY);
  if (!raw) return guardedOffAir();

  let b;
  try { b = JSON.parse(raw); } catch { return guardedOffAir(); }

  if (
    !b.updatedAt ||
    Date.now() - b.updatedAt > BROADCAST_TTL ||
    b.status !== "live" ||
    !b.url ||
    !b.startedAt
  ) {
    return guardedOffAir();
  }

  state.lastLiveAt = Date.now();

  if (b.url !== state.url || b.startedAt !== state.startedAt) {
    loadTrack(b);
    return;
  }

  checkDrift(b.startedAt);
}

/* ------------------------------------------------------------
   OFF AIR (PATCHED)
------------------------------------------------------------ */
function guardedOffAir() {
  if (userPaused) return; // 🔒 PATCH: pause manual ≠ off air

  if (widget) {
    widget.isPaused(paused => {
      if (!paused) {
        recoverFromAudio();
        return;
      }
      safeGoOffAir();
    });
    return;
  }
  safeGoOffAir();
}

function safeGoOffAir() {
  if (
    state.phase === "live" &&
    Date.now() - state.lastLiveAt < LIVE_GRACE
  ) return;

  goOffAir();
}

function goOffAir() {
  if (state.phase === "offair") return;
  stopPlayback();
  setPhase("offair");
}

/* ------------------------------------------------------------
   SUPPORT THE ARTIST — LINK ENGINE
------------------------------------------------------------ */
function updateArtistLinks(artist) {
  const name = artist?.trim();
  const hasArtist = Boolean(name);
  const q = hasArtist ? encodeURIComponent(name) : "";

  // SEARCH-SAFE
  setArtistLink(
    "link-bandcamp",
    hasArtist ? `https://bandcamp.com/search?q=${q}` : null
  );

  setArtistLink(
    "link-discogs",
    hasArtist
      ? `https://www.discogs.com/search/?q=${q}&type=artist`
      : null
  );

  setArtistLink(
    "link-soundcloud",
    hasArtist ? `https://soundcloud.com/search?q=${q}` : null
  );

  // DESTINATION LINKS (no search)
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
   PLAYER
------------------------------------------------------------ */
function loadTrack(b) {
  state.url = b.url;
  renderLike(); // ❤️ ACTUALIZA LIKE SEGÚN ESTE SET

  state.startedAt = b.startedAt;
  state.duration = null;
  state.lastLiveAt = Date.now();
  state.artist = b.meta?.artist || null;

  userPaused = false;

  ui.title.textContent = b.meta?.title || "Loading mix…";

  const artist = state.artist;
  ui.artist.textContent = artist || "";
  ui.catalogArtist.textContent = artist || "—";
  updateArtistLinks(artist);

  ui.cover.style.backgroundImage = b.meta?.artwork
    ? `url(${b.meta.artwork})`
    : "";

  ui.elapsed.textContent = "0:00";
  ui.remaining.textContent = "-0:00";
  ui.progress.style.width = "0%";

  setPhase("live");

  const fresh = iframe.cloneNode();
  iframe.parentNode.replaceChild(fresh, iframe);
  iframe = fresh;

  iframe.src =
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(b.url) +
    "&auto_play=false";

  widget = SC.Widget(iframe);

  widget.bind(SC.Widget.Events.READY, () => {
    widget.getDuration(dur => {
      if (typeof dur === "number" && dur > 0) {
        state.duration = dur;
        ui.remaining.textContent = "-" + formatTime(dur);
      }
    });

    const offset = Math.max(0, Date.now() - b.startedAt);
    widget.seekTo(offset);
    widget.play();

    ui.livePill.classList.remove("off");
    startSync(SYNC_LIVE);
  });

  widget.bind(SC.Widget.Events.PLAY, recoverFromAudio);
  widget.bind(SC.Widget.Events.PLAY_PROGRESS, e => {
    updateProgress(e.currentPosition, e.duration);
  });
}

function recoverFromAudio() {
  state.lastLiveAt = Date.now();
  userPaused = false;

  renderLike(); // ✅ FIX: fuerza estado correcto del ❤️

  if (state.phase !== "live") setPhase("live");
  ui.livePill.classList.remove("off");
  startSync(SYNC_LIVE);
}

function togglePlay() {
  if (!widget) return;
  widget.isPaused(p => {
    userPaused = !p;
    p ? widget.play() : widget.pause();
  });
}

function stopPlayback() {
  try { widget?.pause(); } catch {}
  ui.livePill.classList.add("off");
}

/* ------------------------------------------------------------
   DRIFT CONTROL
------------------------------------------------------------ */
function checkDrift(startedAt) {
  if (!widget || !startedAt) return;

  widget.getPosition(pos => {
    if (typeof pos !== "number") return;

    const correct = Date.now() - startedAt;
    const drift = pos - correct;

    if (Math.abs(drift) <= DRIFT_TOLERANCE) return;

    widget.seekTo(correct);

    if (Math.abs(drift) > DRIFT_HARD && !userPaused) {
      widget.play();
    }
  });
}

/* ------------------------------------------------------------
   PROGRESS
------------------------------------------------------------ */
function updateProgress(pos, dur) {
  const total = state.duration || dur;
  if (!total) return;

  ui.progress.style.width =
    `${Math.min(100, (pos / total) * 100)}%`;

  ui.elapsed.textContent = formatTime(pos);
  ui.remaining.textContent =
    "-" + formatTime(Math.max(0, total - pos));
}

/* ------------------------------------------------------------
   VISIBILITY
------------------------------------------------------------ */
document.addEventListener("visibilitychange", () => {
  if (document.hidden) startSync(SYNC_IDLE);
  else {
    startSync(SYNC_FAST);
    forceResync();
  }
});

function forceResync() {
  if (!widget || !state.startedAt) return;

  widget.getPosition(pos => {
    if (typeof pos !== "number") return;

    const correct = Date.now() - state.startedAt;
    const drift = pos - correct;

    if (Math.abs(drift) > DRIFT_TOLERANCE) {
      widget.seekTo(correct);
    }
  });
}

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

/* ------------------------------------------------------------
   UTILS
------------------------------------------------------------ */
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
