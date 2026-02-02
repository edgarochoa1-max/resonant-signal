/* ============================================================
   RESONANT · LISTENER APP
   FILE: app.js
   MODE: SINGLE FILE · CANON · ADMIN-ALIGNED
   STATUS: // FREEZE: listener core stable — do not patch without regression test

============================================================ */
"use strict";

/* ============================================================
   1) CONSTANTS (MATCH ADMIN)
============================================================ */

const BROADCAST_KEY    = "resonant_broadcast_state_v1";
const SNAPSHOT_KEY     = "resonant_broadcast_snapshot_v1";
const SIGNAL_POLL_MS   = 800;
let   LAST_BROADCAST_RAW = null;


// Progress visual window when no duration is known (radio-style)
const PROGRESS_WINDOW_MS = 3 * 60 * 60 * 1000; // 3h

/* ============================================================
   2) STATE (LOCAL · REFLECTION ONLY)
============================================================ */

const STATE = {
  // ADMIN reflection
  phase: "offair",          // offair | live
  startedAt: null,          // ms
  duration: null,           // ms | null
  url: null,                // SoundCloud url
  trackId: null,

  meta: {
    title: "",
    artist: "",
    contributor: null,
    artwork: null
  },

  // AUDIO (listener-only)
  audioUnlocked: false,     // gesture happened
  audioMuted: false,

};

/* ============================================================
   3) DOM CACHE
============================================================ */

const $ = id => document.getElementById(id);

const el = {
  cover: $("cover"),
  title: $("title"),
  artist: $("artist-name"),
  contributor: $("contributor-name"),

  playBtn: $("play-btn"),
  playLabel: document.querySelector("[data-label-play]"),
  stopLabel: document.querySelector("[data-label-stop]"),

  barFill: $("bar-fill"),
  offairScreen: document.querySelector(".offair-screen"),

  tabs: document.querySelectorAll(".tab"),
  navBtns: document.querySelectorAll(".bottom-nav .nav-btn"),

  likeBtn: $("like-btn"),
  shareBtn: $("share-btn"),

  // Artist Support
  catalogArtist: $("catalog-artist-name"),
  linkBandcamp: $("link-bandcamp"),
  linkDeejay: $("link-deejay"),
  linkDiscogs: $("link-discogs"),
  linkJuno: $("link-juno"),
  linkSoundcloud: $("link-soundcloud"),
  linkSubwax: $("link-subwax"),
};

/* ============================================================
   4) SOUNDCLOUD PLAYER (LEGACY MINI-HACK · CANON)
============================================================ */

let scIframe = null;
let scPlayer = null;
let scReady  = false;

function ensureSCPlayer(url) {
  if (!url) return;

  // Cache iframe
  if (!scIframe) {
    scIframe = document.getElementById("sc-frame");
    if (!scIframe) return;
  }

  const nextSrc =
    "https://w.soundcloud.com/player/?" +
    "url=" + encodeURIComponent(url) +
    "&auto_play=false" +
    "&hide_related=true" +
    "&show_comments=false" +
    "&show_user=false" +
    "&show_reposts=false";

  // Recreate widget ONLY if src changed
  if (scIframe.src !== nextSrc || !scPlayer) {
    scReady = false;
    scIframe.src = nextSrc;
    scPlayer = SC.Widget(scIframe);

    scPlayer.bind(SC.Widget.Events.READY, () => {
      scReady = true;

      // 🎨 pull artwork if admin didn't send it
      scPlayer.getCurrentSound(sound => {
        if (sound?.artwork_url && !STATE.meta.artwork) {
          STATE.meta.artwork =
            sound.artwork_url.replace("-large", "-t500x500");
          render();
        }
      });
    });
  }
}

/* ============================================================
   5) USER GESTURE (MINI-HACK)
============================================================ */

function toggleAudioByUser() {
  if (!STATE.url) return;
 if (!scPlayer) return;

  // 🔓 Primer gesto: desbloquea audio y arranca reproducción
  if (!STATE.audioUnlocked) {
  STATE.audioUnlocked = true;
  STATE.audioMuted = false;

    if (scReady) {
      scPlayer.setVolume(100);
      scPlayer.play().catch(() => {});
    } else {
      let tries = 0;
      const tryPlay = () => {
        if (!scReady) {
          if (++tries > 30) return;
          setTimeout(tryPlay, 100);
          return;
        }
        scPlayer.setVolume(100);
        scPlayer.play().catch(() => {});
      };
      tryPlay();
    }

    render();
    return;
  }

  // 🔁 Clicks posteriores: MUTE / UNMUTE (no afecta señal)

if (scReady) {
  scPlayer.getVolume(v => {
    const muted = v === 0;
    scPlayer.setVolume(muted ? 100 : 0);
    STATE.audioMuted = !muted;
    render(); // ✅ UI toggle siempre sincronizado
  });
  return; // evita render doble
}

render();

}

/* ============================================================
   6) ADMIN PAYLOAD NORMALIZATION
============================================================ */

function normalizeBroadcast(obj) {
  if (!obj || typeof obj !== "object") return null;

  const status = obj.status || obj.phase;
  const isLive = status === "live";
  if (!status) return null;

  const url = obj.soundcloud?.url || obj.url || null;
  const startedAt = obj.startedAt || null;

  if (isLive && (!url || !startedAt)) return null;

  const meta = obj.meta && typeof obj.meta === "object"
    ? {
        title: obj.meta.title || "",
        artist: obj.meta.artist || "",
        contributor: obj.meta.contributor || null,
        artwork: obj.meta.artwork || null
      }
    : null;

  return {
    phase: isLive ? "live" : "offair",
    trackId: obj.trackId || null,
    startedAt: isLive ? startedAt : null,
    url: isLive ? url : null,
    duration: Number.isFinite(obj.duration) ? obj.duration : null,
    meta
  };
}

function ingest(raw) {
  if (!raw) return;

  let parsed;
  try { parsed = JSON.parse(raw); } catch { return; }

  const next = normalizeBroadcast(parsed);

if (!next) {
  if (STATE.phase !== "offair") {
    STATE.phase = "offair";
    resetOffair();
    render();
  }
  return;
}

  // Evitar procesamiento si los datos no han cambiado
  if (
    STATE.phase === next.phase &&
    STATE.trackId === next.trackId &&
    STATE.startedAt === next.startedAt
  ) {
    return; // Si son los mismos datos, salir
  }

  const wasOffair = STATE.phase !== "live";
  const goingLive = wasOffair && next.phase === "live";

  if (goingLive) {
    STATE.startedAt = next.startedAt || Date.now();
STATE.trackId   = next.trackId || null;
STATE.url       = next.url || null;
STATE.duration  = Number.isFinite(next.duration)
  ? next.duration * 1000
  : null;

    if (next.meta) {
      STATE.meta = {
        title: next.meta.title || "",
        artist: next.meta.artist || "",
        contributor: next.meta.contributor || null,
        artwork: next.meta.artwork || null
      };
      renderArtistSupport();
    }

    // 🎨 Refrescar la portada si hay cambio de track
    if (STATE.meta.artwork && el.cover) {
      el.cover.style.backgroundImage = `url("${STATE.meta.artwork}")`;
    }

    // Refrescar visualmente la UI con la transición
    if (el.barFill) {
      el.barFill.dataset.ratio = "0";
      el.barFill.style.width = "0%";
    }

// PREWARM: prepara widget + artwork antes del gesto (sin audio)
ensureSCPlayer(STATE.url);

   STATE.phase = "live";
render();
return;

  }

  // Si no es un cambio de fase, simplemente procesamos el estado
  STATE.phase = next.phase;
  STATE.trackId = next.trackId || null;
  STATE.url = next.url || null;
STATE.duration = Number.isFinite(next.duration)
  ? next.duration * 1000
  : null;

  // Autotransición de metadatos
  if (STATE.trackId !== next.trackId) {
    scReady = false;
      STATE.audioMuted = false; // 🔧 reset mute on new track
    STATE.startedAt = next.startedAt || Date.now();
    if (el.barFill) {
      el.barFill.dataset.ratio = "0";
      el.barFill.style.width = "0%";
    }
  }

  if (next.meta) {
    STATE.meta = {
      title: (next.meta.title && String(next.meta.title).trim()) ? next.meta.title : STATE.meta.title,
      artist: (next.meta.artist && String(next.meta.artist).trim()) ? next.meta.artist : STATE.meta.artist,
      contributor: next.meta.contributor !== undefined ? next.meta.contributor : STATE.meta.contributor,
      artwork: (next.meta.artwork && String(next.meta.artwork).trim()) ? next.meta.artwork : STATE.meta.artwork
    };
    renderArtistSupport();
  }

  // Persistir el estado en el snapshot (rápido inicio)
  try {
    if (STATE.phase === "live" && STATE.url && STATE.startedAt) {
      localStorage.setItem(
  SNAPSHOT_KEY,
  JSON.stringify({
    startedAt: STATE.startedAt,
    url: STATE.url,
    duration: STATE.duration || null,
    trackId: STATE.trackId || null, // 👈 agregar
    meta: STATE.meta
  })
);

    }
  } catch {}

  // PATCH 3 — reset cuando se sale de LIVE
  if (STATE.phase !== "live") {
  resetOffair();
}
  render();
}

function resetOffair() {
  STATE.startedAt = null;
  STATE.url = null;
  STATE.duration = null;
  STATE.trackId = null;

  STATE.audioUnlocked = false;
  STATE.audioMuted = false;

  try {
    if (scPlayer && scReady) scPlayer.pause();
  } catch {}

  scReady = false;

  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {}

  if (el.barFill) {
    el.barFill.dataset.ratio = "0";
    el.barFill.style.width = "0%";
  }
}

/* ============================================================
   7) SNAPSHOT (FAST BOOT)
============================================================ */

function ingestSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;

    const snap = JSON.parse(raw);
    if (!snap || !snap.url || !snap.startedAt) return;

    STATE.startedAt = snap.startedAt || null;
STATE.url = snap.url || null;
STATE.duration = snap.duration || null;
STATE.trackId = snap.trackId || null;
STATE.meta = snap.meta || {};

// 🔒 snapshot NO activa señal
STATE.phase = "offair";


  } catch {}
}

/* ============================================================
   8) PHASE → CSS AUTHORITY
============================================================ */

function updatePhaseCSS() {
  const prev = document.body.getAttribute("data-phase");

  let next = "offair";

  if (STATE.phase === "live") {
    if (STATE.audioUnlocked && !scReady) {
      next = "syncing";
    } else {
      next = "live";
    }
  }

  if (prev !== next) {
    document.body.classList.add("phase-transition");
    document.body.setAttribute("data-phase", next);

    // 🔒 AUTORIDAD TOTAL
    document.body.toggleAttribute(
      "data-offair",
      next === "offair"
    );

    setTimeout(() => {
      document.body.classList.remove("phase-transition");
    }, 420);
  }
}

/* ============================================================
   9) RENDER
============================================================ */

function render() {
  if (!document.body) return;

  updatePhaseCSS();

  // Aseguramos que el metadata se renderice siempre que haya datos
  const statusLabel = document.getElementById("signal-status-label");

  if (statusLabel) {
  if (STATE.phase !== "live") {
    statusLabel.textContent = "Signal is resting";
  } 
  else if (!STATE.audioUnlocked) {
    statusLabel.textContent = "Tap to start listening";
  } 
  else if (!scReady) {
    statusLabel.textContent = "Syncing stream…";
  }
   else {
    statusLabel.textContent = "Now transmitting";
  }
}

  // Mostrar metadata de inmediato (sin esperar el desbloqueo de audio)
  if (el.title) el.title.textContent = STATE.meta.title || "—";
  if (el.artist) el.artist.textContent = STATE.meta.artist || "—";

  if (el.contributor) {
    if (STATE.meta.contributor) {
      el.contributor.textContent = STATE.meta.contributor;
      el.contributor.style.display = "";
    } else {
      el.contributor.style.display = "none";
    }
  }

  if (el.cover) {
    const art = STATE.meta.artwork || "";
    el.cover.style.backgroundImage = art ? `url("${art}")` : "";
  }

  renderProgress();
  updateUI();
}

function renderArtistSupport() {
  if (el.catalogArtist) {
    el.catalogArtist.textContent = STATE.meta.artist || "—";
  }

  const artist =
    STATE.meta.artist &&
    typeof STATE.meta.artist === "string" &&
    STATE.meta.artist.trim();

  if (artist) {
    const q = encodeURIComponent(artist);

    if (el.linkSoundcloud)
      el.linkSoundcloud.href = `https://soundcloud.com/search?q=${q}`;

    if (el.linkDiscogs)
      el.linkDiscogs.href = `https://www.discogs.com/search/?q=${q}&type=artist`;

    if (el.linkBandcamp)
      el.linkBandcamp.href = `https://bandcamp.com/search?q=${q}&item_type=a`;

    if (el.linkJuno)
      el.linkJuno.href = `https://www.juno.co.uk/search/?q%5Ball%5D=${q}`;

    if (el.linkDeejay)
      el.linkDeejay.href = `https://www.deejay.de/search?query=${q}`;

    if (el.linkSubwax)
      el.linkSubwax.href = `https://subwax.es/?s=${q}`;
  } else {
    [
      el.linkSoundcloud,
      el.linkDiscogs,
      el.linkBandcamp,
      el.linkJuno,
      el.linkDeejay,
      el.linkSubwax
    ].forEach(link => {
      if (!link) return;
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.setAttribute("aria-disabled", "true");
    });
  }
}

function renderProgress() {
  if (!el.barFill) return;

  if (STATE.phase !== "live" || !STATE.startedAt) {
    el.barFill.style.width = "0%";
    return;
  }

  const elapsed = Date.now() - STATE.startedAt;

  let ratio;
  if (STATE.duration && STATE.duration > 1000) {
    ratio = elapsed / STATE.duration;
  } else {
    ratio = elapsed / PROGRESS_WINDOW_MS;
  }

  ratio = Math.min(Math.max(ratio, 0), 1);

  const prev = parseFloat(el.barFill.dataset.ratio || "0");
  const next = Math.max(prev, ratio);

  el.barFill.dataset.ratio = next.toFixed(4);
  el.barFill.style.width = `${next * 100}%`;
}

function updateUI() {
  if (!el.playBtn) return;

  const active = STATE.audioUnlocked && scReady;

  el.playBtn.setAttribute("aria-pressed", active ? "true" : "false");

  if (el.playLabel && el.stopLabel) {
  const showPlay = !STATE.audioUnlocked || STATE.audioMuted;

  el.playLabel.hidden = !showPlay;
  el.stopLabel.hidden = showPlay;
}

  document.body.toggleAttribute(
  "data-muted",
  STATE.audioMuted === true
);

}

/* ============================================================
   10) NAV
============================================================ */

function activateTab(name) {
  el.tabs.forEach(tab => {
    tab.classList.toggle("active", tab.id === `tab-${name}`);
  });

  el.navBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });

  document.body.setAttribute("data-view", name);
}

/* ============================================================
   11) BUTTONS (LIKE / SHARE)
============================================================ */

function bindButtons() {
  if (el.likeBtn) {
    el.likeBtn.addEventListener("click", () => {
      el.likeBtn.classList.toggle("liked");
      el.likeBtn.setAttribute(
        "aria-pressed",
        el.likeBtn.classList.contains("liked") ? "true" : "false"
      );
    });
  }

  if (el.shareBtn) {
    el.shareBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        el.shareBtn.classList.add("copied");
        setTimeout(() => el.shareBtn.classList.remove("copied"), 1200);
      } catch {}
    });
  }
}

/* ============================================================
   12) EVENTS (ADMIN → LISTENER)
============================================================ */

window.addEventListener("storage", e => {
  if (e.key === BROADCAST_KEY) ingest(e.newValue);
});

document.addEventListener("resonant:broadcast", () => {
  ingest(localStorage.getItem(BROADCAST_KEY));
});

// CANON: render inicial SIEMPRE se ejecuta.
// OFFAIR visual es autoridad por defecto en cold boot.

/* ============================================================
   13) BOOT
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  const broadcast = localStorage.getItem(BROADCAST_KEY);

if (broadcast) {
  ingest(broadcast);        // ADMIN MANDA
} else {
  ingestSnapshot();         // solo fallback visual
  render();                 // 🔒 FORZAR OFFAIR VISUAL
}

LAST_BROADCAST_RAW = localStorage.getItem(BROADCAST_KEY);

setInterval(() => {
  const raw = localStorage.getItem(BROADCAST_KEY);

  // same-tab autodetect (storage no dispara en la misma pestaña)
  if (raw && raw !== LAST_BROADCAST_RAW) {
    LAST_BROADCAST_RAW = raw;
    ingest(raw);
    return;
  }

  // si el admin limpió la señal (raw=null), forzar OFFAIR
  if (!raw && LAST_BROADCAST_RAW) {
    LAST_BROADCAST_RAW = null;
    STATE.phase = "offair";
    resetOffair();
    render();
  }
}, SIGNAL_POLL_MS);

  if (el.playBtn)
    el.playBtn.addEventListener("click", toggleAudioByUser);

  el.navBtns.forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });

  bindButtons();

  console.info("RESONANT LISTENER · ADMIN-ALIGNED · READY");
});

/* ============================================================
   END app.js · CANON
============================================================ */
