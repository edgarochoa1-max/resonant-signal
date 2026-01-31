/* ============================================================
   RESONANT · LISTENER UI
===============================================================

FILE
• app.ui.js

ROLE
• UI reflection layer
• DOM updates only
• Accessibility + state mirroring

AUTHORITY
• State comes from CORE
• Behavior comes from ENGINE ROUTER

OUT OF SCOPE
• No audio logic
• No broadcast logic
• No state mutation

STATUS
• UI-CANON v20.4.2
• SEALED · FREEZE
=============================================================== */

"use strict";

import * as CORE from "./app.core.js";
import * as ENGINE_ROUTER from "./engine.router.js";

/* ============================================================
   DOM REFERENCES
=============================================================== */

const $ = id => document.getElementById(id);

const el = {
  cover: $("cover"),
  title: $("title"),
  artist: $("artist-name"),
  contributor: $("contributor-name"),

  playBtn: $("play-btn"),
  playLabel: document.querySelector("[data-label-play]"),
  stopLabel: document.querySelector("[data-label-stop]"),

  likeBtn: $("like-btn"),
  shareBtn: $("share-btn"),

  barFill: $("bar-fill"),
  catalogArtist: $("catalog-artist-name"),

  playerCard: document.querySelector(".player-card"),
  navBtns: document.querySelectorAll(".nav-btn"),

  offair: document.querySelector(".offair-screen"),
  livePill: document.getElementById("live-pill"),

};
/* ============================================================
   VIEW ROUTER (UI ONLY)
=============================================================== */

function switchTab(tabName) {
  document.body.dataset.view = tabName;

  const tabs = document.querySelectorAll(".tab");
  const navBtns = document.querySelectorAll(".nav-btn");

  tabs.forEach(tab => {
    tab.classList.toggle(
      "active",
      tab.id === `tab-${tabName}`
    );
  });

  navBtns.forEach(btn => {
    btn.classList.toggle(
      "active",
      btn.dataset.tab === tabName
    );
  });
}

/* ============================================================
   PUBLIC API
=============================================================== */

export function render() {
  const channel = CORE.getActiveChannelState?.();

  /* ----------------------------------------------------------
     NO CHANNEL → HARD OFF AIR (GLOBAL)
  ---------------------------------------------------------- */

  if (!channel) {
    document.body.dataset.phase = "offair";
    renderOffAir();
    return;
  }

  /* ----------------------------------------------------------
     PHASE MIRROR
  ---------------------------------------------------------- */

document.body.dataset.phase = channel.phase || "offair";

  // 🔒 VIEW AUTHORITY GUARD
if (!document.body.dataset.view) {
  switchTab("radio");
}

// PERSON VIEW → overlay tiene autoridad total
if (document.body.dataset.view === "person") {
  return;
}

const isRadioView = document.body.dataset.view === "radio";


  /* ----------------------------------------------------------
     RADIO VIEW ONLY — PLAYER LOGIC
  ---------------------------------------------------------- */

  if (isRadioView) {
    if (!CORE.shouldRenderPlayer()) {
      renderOffAir();
      return;
    }

    if (channel.phase === "live") {
      renderPhase(channel);
      renderMeta(channel);
      renderCover(channel);
      renderLike(channel);
    } else if (channel.phase === "offair") {
      renderOffAir();
    } else {
      renderIdle(channel);
    }
  }

  /* ----------------------------------------------------------
     ALWAYS RENDER
  ---------------------------------------------------------- */

  renderCatalog(channel);
}

/* ============================================================
   RENDERERS
=============================================================== */

function renderOffAir() {
  if (el.offair) {
    el.offair.classList.remove("hidden");
    el.offair.setAttribute("aria-hidden", "false");
  }

  if (el.livePill) el.livePill.style.opacity = "0";

  stopProgressLoop();

  if (el.cover) el.cover.style.backgroundImage = "";
  if (el.barFill) el.barFill.style.width = "0%";

  if (el.artist) el.artist.textContent = "";
  if (el.contributor) el.contributor.style.display = "none";

  renderLike(null);

  if (el.playerCard) {
el.playerCard.style.pointerEvents = "none";
  }
}

function renderIdle(channel) {
  if (el.offair) {
    el.offair.classList.add("hidden");
    el.offair.setAttribute("aria-hidden", "true");
  }

  if (el.livePill) el.livePill.style.opacity = "0.5";

  stopProgressLoop();

  if (el.playerCard) {
    el.playerCard.style.pointerEvents = "none";
  }
}

function renderPhase(channel) {
  if (el.offair) {
    el.offair.classList.add("hidden");
    el.offair.setAttribute("aria-hidden", "true");
  }

  if (el.playerCard) {
    el.playerCard.style.pointerEvents = "auto";
  }

  if (el.livePill) el.livePill.style.opacity = "1";

  const playing =
    channel.phase === "live" &&
    !channel.userIntentMuted &&
    !channel.awaitingUserResume;

  // ARIA — audio activo
  el.playBtn?.setAttribute(
    "aria-pressed",
    String(playing)
  );

  // Progress
  if (playing) {
    startProgressLoop();
  } else {
    stopProgressLoop();
  }

  // LABELS — RADIO SEMANTICS
  if (el.playLabel) {
    el.playLabel.hidden = playing;
    el.playLabel.textContent = "Play signal";
  }

  if (el.stopLabel) {
    el.stopLabel.hidden = !playing;
    el.stopLabel.textContent = "Stop signal";
  }
}

function renderMeta(channel) {
  // ARTIST
  if (el.artist) {
    el.artist.textContent = channel.artist || "—";
    el.artist.dataset.slug = channel.artistSlug || "";
    el.artist.classList.toggle("is-clickable", !!channel.artistSlug);
  }

  // TITLE
  if (el.title) {
    el.title.textContent = channel.title || "—";
  }

  // CONTRIBUTOR
  if (el.contributor) {
    el.contributor.textContent = channel.contributor || "—";
    el.contributor.style.display = channel.contributor ? "" : "none";
    el.contributor.dataset.slug = channel.contributorSlug || "";
    el.contributor.classList.toggle("is-clickable", !!channel.contributorSlug);
  }
}


function renderCover(channel) {
  if (!el.cover) return;

  el.cover.style.backgroundImage =
    channel.artwork ? `url(${channel.artwork})` : "";
}

function renderProgress(channel) {
  if (!el.barFill || !channel.startedAt) return;

  const LOOP_MS = 60_000;
  const elapsed = Date.now() - channel.startedAt;
  const pct = ((elapsed % LOOP_MS) / LOOP_MS) * 100;

  el.barFill.style.width = `${pct}%`;
}

function renderCatalog(channel) {
  if (!el.catalogArtist) return;

  const artist = (channel?.artist || "").trim();

  el.catalogArtist.textContent = artist || "—";

  if (!artist) return;

  const q = encodeURIComponent(artist);

  const links = {
    bandcamp: `https://bandcamp.com/search?q=${q}`,
    soundcloud: `https://soundcloud.com/search?q=${q}`,
    discogs: `https://www.discogs.com/search/?q=${q}&type=artist`,
    juno: `https://www.junodownload.com/search/?q=${q}`,
    deejay: `https://www.deejay.de/search?query=${q}`,
    subwax: `https://subwax.com/search?q=${q}`
  };

  Object.entries(links).forEach(([key, url]) => {
    const btn = document.getElementById(`link-${key}`);
    if (!btn) return;
    btn.href = url;
    btn.style.display = ""; // 👈 CLAVE
  });
}


/* ============================================================
   LIKE (LOCAL ONLY)
=============================================================== */

const LIKES_KEY = "resonant_likes_v1";

function readLikes() {
  try {
    return JSON.parse(localStorage.getItem(LIKES_KEY)) || {};
  } catch {
    return {};
  }
}

function writeLikes(obj) {
  try {
    localStorage.setItem(LIKES_KEY, JSON.stringify(obj));
  } catch {}
}

function isLiked(url) {
  return !!readLikes()[url];
}

function toggleLike(url) {
  const likes = readLikes();
  likes[url] ? delete likes[url] : (likes[url] = true);
  writeLikes(likes);
  return !!likes[url];
}

function setLikeUI(liked) {
  if (!el.likeBtn) return;
  el.likeBtn.classList.toggle("liked", !!liked);
  el.likeBtn.setAttribute("aria-pressed", String(!!liked));
}

function renderLike(channel) {
  setLikeUI(channel?.url && isLiked(channel.url));
}

/* ============================================================
   PROGRESS LOOP (RAF)
=============================================================== */

let progressRAF = null;

function startProgressLoop() {
  if (progressRAF) return;
  progressRAF = requestAnimationFrame(tick);
}

function tick() {
  const channel = CORE.getActiveChannelState?.();

  if (channel?.phase === "live") {
    renderProgress(channel);
    progressRAF = requestAnimationFrame(tick);
  } else {
    stopProgressLoop();
  }
}

function stopProgressLoop() {
  if (!progressRAF) return;
  cancelAnimationFrame(progressRAF);
  progressRAF = null;
}

/* ============================================================
   UI BINDINGS (ONCE)
=============================================================== */

let uiBound = false;

export function bindUI() {
  if (uiBound) return;
  uiBound = true;

  // ▶️ PLAY / STOP SIGNAL
  if (el.playBtn) {
    el.playBtn.addEventListener("click", () => {
      const channel = CORE.getActiveChannelState?.();
      if (!channel) return;

      // Si está sonando → STOP (mute)
      if (channel.phase === "live" && !channel.userIntentMuted) {
        ENGINE_ROUTER.toggleUserMute?.();
      } 
      // Si está muteado / esperando → PLAY
      else {
        ENGINE_ROUTER.forwardUserIntent?.("toggle");
      }
    });
  }

    // ❤️ LIKE TOGGLE
  if (el.likeBtn) {
    el.likeBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();

      const channel = CORE.getActiveChannelState?.();
      if (!channel?.url) return;

      const liked = toggleLike(channel.url);
      setLikeUI(liked);
    });
  }
  // 🧭 NAVIGATION BAR
  el.navBtns?.forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      const tab = btn.dataset.tab;
      if (!tab) return;
      switchTab(tab);
    });
  });
  // 👤 ARTIST VIEW
  if (el.artist) {
    el.artist.addEventListener("click", () => {
      const slug = el.artist.dataset.slug;
      if (!slug) return;
      window.location.hash = `#/artist/${slug}`;
      document.body.dataset.view = "person";
    });
  }

  // 👤 CONTRIBUTOR VIEW
  if (el.contributor) {
    el.contributor.addEventListener("click", () => {
      const slug = el.contributor.dataset.slug;
      if (!slug) return;
      window.location.hash = `#/contributor/${slug}`;
      document.body.dataset.view = "person";
    });
  }

}


/* ============================================================
   END · app.ui.js
===============================================================

CANON NOTES
• UI reflects state only
• Phases are mirrored verbatim
• OFF AIR overlay is exclusive
• No audio knowledge
• Broadcast-grade stability
=============================================================== */
