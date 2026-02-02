/* ============================================================
   RESONANT · ADMIN MEGACORE
   FILE: admin.js
   VERSION: 2.0.0-ADMIN-PRODUCTION-v1
   STATUS: SEALED · PRODUCTION · BROADCAST GRADE
============================================================ */

"use strict";

/* ============================================================
   CONSTANTS
============================================================ */

const BROADCAST_KEY = "resonant_broadcast_state_v1";
const HEARTBEAT_MS  = 10_000;
const TRANSITION_MS = 1200;
const PLAYLIST_KEY = "resonant_admin_playlist_v1";

/* ============================================================
   STATE · SSOT
============================================================ */

const STATE = {
  playlist: Array.isArray(window.PLAYLIST) ? window.PLAYLIST : [],
  order: null,
  liveTrackId: null,
  phase: "offair", // offair | live | holding
  startedAt: null,
  lock: false,
  role: "operator",
  heartbeatAt: null
};

// UI gate: admin is OFF AIR until login
let UI_READY = false;

/* ============================================================
   DOM
============================================================ */

const $ = id => document.getElementById(id);

const els = {
  body: document.body,
  login: $("admin-login"),
  panel: $("admin-panel"),
  pin: $("admin-pin"),
  loginBtn: $("admin-login-btn"),
  statusPill: $("admin-master-status"),
  healthMode: $("health-mode"),
  healthRole: $("health-role"),
  healthLease: $("health-lease"),
  healthListeners: $("health-listeners"),
  healthHeartbeat: $("health-heartbeat"),
  healthStatus: $("health-status-text"),
  artist: $("admin-track-artist"),
  title: $("admin-track-title"),
  contributor: $("admin-track-contributor"),
  elapsed: $("admin-elapsed"),
  progress: document.getElementById("admin-progress"),
  playlist: $("admin-playlist"),
  next: $("admin-next-btn"),
  stop: $("admin-stop-btn"),
  shuffle: $("admin-shuffle-btn"),
  addUrl: $("admin-add-url"),
  addBtn: $("admin-add-mix-btn"),
  save: $("admin-save-btn"),
  undo: $("admin-undo-playlist-btn"),
  reset: $("admin-reset-btn"),
  importBtn: $("admin-import-playlist-btn"),
  importFile: $("admin-import-file"),
  exportBtn: $("admin-export-btn")
};

/* ============================================================
   BOOT
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  initLogin();
  bindUI();
  rehydratePlaylist();          // ⬅️ CLAVE
  STATE.order = null;           // ⬅️ fuerza rebuild
  startHeartbeat();
  renderAll();                  // ahora sí hay order
});


/* ============================================================
   LOGIN
============================================================ */

function initLogin() {
  els.loginBtn.addEventListener("click", enter);
  els.pin.addEventListener("keydown", e => {
    if (e.key === "Enter") enter();
  });
}

function enter() {
  UI_READY = true;
  els.login.hidden = true;
  els.panel.hidden = false;
  els.body.classList.add("admin-ui-ready");

  rehydratePlaylist();
  STATE.order = null;      // 🔥 fuerza rebuild
  renderPlaylist();        // 🔥 render explícito

  rehydrateBroadcast();    // luego sincroniza live
  renderAll();
}

/* ============================================================
   HELPERS
============================================================ */

function getOrder() {
  const ids = new Set(STATE.playlist.map(t => t.id));
  let order = Array.isArray(STATE.order)
    ? STATE.order.filter(id => ids.has(id))
    : STATE.playlist.map(t => t.id);

  for (const t of STATE.playlist) {
    if (!order.includes(t.id)) order.push(t.id);
  }

  STATE.order = order;
  return order;
}

function getTrackById(id) {
  return STATE.playlist.find(t => t.id === id) || null;
}

function escapeAttr(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function guard(fn) {
  if (STATE.lock) return;

  STATE.lock = true;
  els.body.classList.add("is-finishing");

  try {
    fn();
  } finally {
    setTimeout(() => {
      STATE.lock = false;
      els.body.classList.remove("is-finishing");
      renderPlaylist();
    }, TRANSITION_MS);
  }
}

function persistPlaylist() {
  localStorage.setItem(
    PLAYLIST_KEY,
    JSON.stringify({
      playlist: STATE.playlist,
      order: STATE.order ?? null
    })
  );
}

function rehydratePlaylist() {
  try {
    const raw = localStorage.getItem(PLAYLIST_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);
    if (!data) return;

    if (Array.isArray(data.playlist)) {
      STATE.playlist = data.playlist;
    }

    if (Array.isArray(data.order)) {
      STATE.order = data.order;
    } else {
      STATE.order = null; // ⬅️ rebuild automático
    }

  } catch (error) {
    console.error("Error loading playlist:", error);
  }
}


/* ============================================================
   CORE ACTIONS
============================================================ */

function play(trackId) {
  if (STATE.phase === "live" && STATE.liveTrackId === trackId) return;

  const track = getTrackById(trackId);
  if (!track || !track.source?.url) return;

  guard(() => {
  STATE.liveTrackId = trackId;
  STATE.phase = "holding";
  STATE.startedAt = Date.now();
  emitBroadcast(track);
  renderStatus();
  scrollToLive();

     setTimeout(() => {
    if (STATE.liveTrackId !== trackId) return;

    STATE.phase = "live";
    STATE.startedAt = Date.now();
    emitBroadcast(track);
    renderStatus();
  }, TRANSITION_MS);
});

}

function stop() {
  if (STATE.lock) return;
  if (STATE.phase !== "live") return;

  guard(() => {
    STATE.liveTrackId = null;
    STATE.phase = "offair";
    STATE.startedAt = null;
    emitBroadcast(null);
    renderAll();
  });
}

function next() {
  if (STATE.lock) return;
  if (STATE.phase !== "live") return;

  const order = getOrder();
  if (!order.length) return;

  let i = order.indexOf(STATE.liveTrackId);
  if (i === -1) {
    i = 0;
    STATE.liveTrackId = order[0];
  }

  const nextId = order[(i + 1) % order.length];
  play(nextId);
}

function shuffle() {
  if (STATE.lock) return;

  if (STATE.phase === "live" && STATE.liveTrackId) {
    const i = STATE.order.indexOf(STATE.liveTrackId);
    if (i > 0) {
      STATE.order = [
        STATE.liveTrackId,
        ...STATE.order.filter(id => id !== STATE.liveTrackId)
      ];
    }
  }

  const order = getOrder();
  if (order.length < 2) return;

  const shuffled = [...order];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  if (STATE.liveTrackId && !shuffled.includes(STATE.liveTrackId)) {
    shuffled.unshift(STATE.liveTrackId);
  }

  STATE.order = shuffled;
  persistPlaylist();
  if (STATE.phase !== "live") renderPlaylist();
}

/* ============================================================
   PLAYLIST STRUCTURE
============================================================ */

function moveRow(id, dir) {
  if (id === STATE.liveTrackId && STATE.phase === "live") return;

  if (STATE.lock) return;

  const order = getOrder();
  const i = order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;

  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  STATE.order = next;

  persistPlaylist();
  renderPlaylist();
}

function deleteRow(id) {
  if (id === STATE.liveTrackId) return;

  STATE.playlist = STATE.playlist.filter(t => t.id !== id);
  if (STATE.order) {
    STATE.order = STATE.order.filter(x => x !== id);
    if (!STATE.order.length) STATE.order = null;
  }

  persistPlaylist();
  renderAll();
}

/* ============================================================
   BROADCAST EMISSION
============================================================ */

function emitBroadcast(track) {
  const payload = track ? {
    version: 1,
    status: STATE.phase === "holding" ? "holding" : "live",  // Ensure correct status
    trackId: track.id,
    startedAt: STATE.startedAt,
durationSec: Number.isFinite(track.duration) ? track.duration : null, // seconds (CANON)
    soundcloud: { url: track.source.url },
    meta: {
      title: track.title || "",
      artist: track.artist?.name || "",
      contributor: track.contributor?.name || null,
      artwork: track.artwork || null
    },
    updatedAt: Date.now()
  } : {
    version: 1,
    status: "offair",
    updatedAt: Date.now()
  };

  localStorage.setItem(BROADCAST_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent("resonant:broadcast", { detail: payload }));

  STATE.heartbeatAt = Date.now();
}

/* ============================================================
   REHYDRATION
============================================================ */

function rehydrateBroadcast() {
  if (!UI_READY) return;

  try {
    const raw = localStorage.getItem(BROADCAST_KEY);
    if (!raw) return;

    const b = JSON.parse(raw);
    if (!["live", "holding"].includes(b.status) || !b.trackId || !b.startedAt) return;

    STATE.liveTrackId = b.trackId;
    if (!STATE.startedAt) STATE.startedAt = b.startedAt;
    STATE.phase = b.status === "holding" ? "holding" : "live";

    const track = getTrackById(STATE.liveTrackId);
    if (!track || !track.duration) {
      renderAll();
      return;
    }

    const order = getOrder();
    const now = Date.now();
    const elapsed = now - STATE.startedAt;

if (elapsed >= track.duration * 1000) {
      const currentIndex = order.indexOf(STATE.liveTrackId);
      if (currentIndex !== -1) {
const skips = Math.floor(elapsed / (track.duration * 1000));
        let nextIndex = (currentIndex + skips) % order.length;
        let nextId = order[nextIndex];

        if (nextId === STATE.liveTrackId && order.length > 1) {
          nextIndex = (nextIndex + 1) % order.length;
          nextId = order[nextIndex];
        }

        STATE.phase = "live";
        STATE.liveTrackId = nextId;
STATE.startedAt = STATE.startedAt + skips * track.duration * 1000;
      }
    }

    renderAll();
  } catch {}
}

/* ============================================================
   HEARTBEAT
============================================================ */

function startHeartbeat() {
  setInterval(() => {
    if (STATE.phase === "live" && STATE.liveTrackId) {
      const track = getTrackById(STATE.liveTrackId);
      if (track) emitBroadcast(track);
    }
  }, HEARTBEAT_MS);
}

/* ============================================================
   AUTO ADVANCE ENGINE · AUTONOMOUS
============================================================ */

const AUTO_ADVANCE_TICK_MS = 1000;

function resolveAutoAdvance() {
  if (STATE.phase !== "live") return;
  if (!STATE.startedAt) return;
  if (STATE.lock) return;

  const track = getTrackById(STATE.liveTrackId);
  if (!track || !track.duration) return;

  const now = Date.now();
  const elapsed = now - STATE.startedAt;

const durationMs = track.durationSec * 1000;

if (elapsed < durationMs) return;

const order = getOrder();
if (!order.length) return;

const currentIndex = order.indexOf(STATE.liveTrackId);
if (currentIndex === -1) return;

const skips = Math.min(
  Math.floor(elapsed / durationMs),
  1
);
const nextIndex = (currentIndex + skips) % order.length;
const nextId = order[nextIndex];

if (nextId === STATE.liveTrackId) return;

STATE.phase = "live";
STATE.liveTrackId = nextId;
STATE.startedAt = STATE.startedAt + skips * durationMs;

  const nextTrack = getTrackById(nextId);
  if (!nextTrack) return;

  emitBroadcast(nextTrack);
}

// Autonomous continuity tick
setInterval(resolveAutoAdvance, AUTO_ADVANCE_TICK_MS);

/* ============================================================
   BROADCAST TTL FAILSAFE
============================================================ */

setInterval(() => {
  if (STATE.phase !== "live") return;
  if (!STATE.heartbeatAt) return;

  const age = Date.now() - STATE.heartbeatAt;
  const TTL = HEARTBEAT_MS * 3; // 30s hard limit

  if (age > TTL) {
    console.warn("⚠️ TTL expired → forcing OFF AIR");

    STATE.liveTrackId = null;
    STATE.phase = "offair";
    STATE.startedAt = null;
    STATE.lock = false;

    emitBroadcast(null);
    renderAll();
  }
}, HEARTBEAT_MS);

/* ============================================================
   LOCAL PROGRESS TICK (UI ONLY)
============================================================ */

setInterval(() => {
  if (STATE.phase !== "live" || !STATE.startedAt) return;
  renderMonitor();
}, 500);

/* ============================================================
   RENDER
============================================================ */

function renderAll() {
  renderStatus();
  // renderHealth(); // ⚠️ desactivado si no existe
  renderMonitor();
  renderPlaylist();
}


function renderStatus() {
  const isLive = STATE.phase === "live";
  const isHolding = STATE.phase === "holding";

  els.statusPill.textContent = isLive
    ? "ON AIR"
    : isHolding
    ? "HOLDING"
    : "OFF AIR";

  els.statusPill.classList.toggle("on", isLive);
  els.statusPill.classList.toggle("holding", isHolding);
  els.statusPill.classList.toggle("off", !isLive && !isHolding);

  els.body.classList.toggle("mode-live", isLive);
  els.body.classList.toggle("mode-holding", isHolding);
}


function renderMonitor() {
  const track = getTrackById(STATE.liveTrackId);

  els.artist.textContent = track?.artist?.name || "—";
  els.title.textContent = track?.title || "—";
  els.contributor.textContent = track?.contributor?.name || "—";

  if (!STATE.startedAt || STATE.phase !== "live") {
  els.elapsed.textContent = "0:00";
  els.progress.style.transition = "none";
  els.progress.style.width = "0%";
  return;
}

  const elapsed = Date.now() - STATE.startedAt;
  const sec = Math.floor(elapsed / 1000);
  els.elapsed.textContent =
    `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  if (track?.durationSec && track.durationSec > 120) {
  const durationMs = track.durationSec * 1000;

  const pct = Math.max(0, Math.min(elapsed / durationMs, 1));
  els.progress.style.transition = "none";
  els.progress.style.width = `${pct * 100}%`;
} else {
  // 🔒 CANON FALLBACK — duration unreliable
  const PERIOD_MS = 2 * 60 * 60 * 1000; // 2 HOURS
  const loop = (elapsed % PERIOD_MS) / PERIOD_MS;
  els.progress.style.transition = "none";
  els.progress.style.width = `${loop * 100}%`;
}

} // ← CIERRA renderMonitor()

function renderPlaylist() {
  els.playlist.innerHTML = "";

  if (!Array.isArray(STATE.playlist) || !STATE.playlist.length) {
    return;
  }
  
  const locked = STATE.lock;
  els.playlist.classList.toggle("locked", locked);

  const order = getOrder();
  order.forEach(id => {
    const track = getTrackById(id);
    if (!track) return;

    const isLive = id === STATE.liveTrackId;
    const disableEdit = isLive && STATE.phase === "live";

    const li = document.createElement("li");
    li.className = "admin-mix-row";
    li.dataset.id = id;
    if (isLive) li.classList.add("playing", "live-active");
    if (disableEdit) li.classList.add("locked-live");

    li.innerHTML = `
      <div class="mix-title">
        <input class="row-artist" value="${escapeAttr(track.artist?.name || "")}" ${disableEdit ? "disabled" : ""} />
        <input class="row-title" value="${escapeAttr(track.title || "")}" ${disableEdit ? "disabled" : ""} />
        <input class="row-contributor" value="${escapeAttr(track.contributor?.name || "")}" ${disableEdit ? "disabled" : ""} />
      </div>
      <div class="row-actions">
        <button data-action="play" ${isLive ? 'aria-disabled="true" class="is-live-play"' : ""}>▶</button>
        <button data-action="up" ${disableEdit ? "disabled" : ""}>▲</button>
        <button data-action="down" ${disableEdit ? "disabled" : ""}>▼</button>
        <button data-action="delete" ${disableEdit ? "disabled" : ""}>✕</button>
      </div>
    `;
    els.playlist.appendChild(li);
  });
}

function scrollToLive() {
  const row = els.playlist.querySelector(".admin-mix-row.playing");
  if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
}

/* ============================================================
   EVENTS
============================================================ */

function bindUI() {

function addButtonListener(buttonId, action) {
  document.getElementById(buttonId)?.addEventListener("click", action);
}

addButtonListener("admin-next-btn", next);
addButtonListener("admin-stop-btn", stop);
addButtonListener("admin-shuffle-btn", shuffle);

  els.playlist.addEventListener("click", e => {
    const btn = e.target.closest("button[data-action]");
    const row = e.target.closest(".admin-mix-row");
    if (!btn || !row) return;

    const id = row.dataset.id;
    const action = btn.dataset.action;

    if (action === "play") return play(id);
    if (STATE.lock) return;

    if (action === "up") moveRow(id, -1);
    if (action === "down") moveRow(id, +1);
    if (action === "delete") deleteRow(id);
  });

  els.importBtn?.addEventListener("click", () => els.importFile.click());

  els.playlist.addEventListener("input", e => {
    const row = e.target.closest(".admin-mix-row");
    if (!row) return;

    const id = row.dataset.id;
    const isLive = id === STATE.liveTrackId && STATE.phase === "live";
    if (isLive) return;

    const track = getTrackById(id);
    if (!track) return;

    if (e.target.classList.contains("row-artist")) {
      track.artist = track.artist || {};
      track.artist.name = e.target.value;
    }

    if (e.target.classList.contains("row-title")) {
      track.title = e.target.value;
    }

    if (e.target.classList.contains("row-contributor")) {
      track.contributor = track.contributor || {};
      track.contributor.name = e.target.value;
    }

    persistPlaylist();
  });

  els.save?.addEventListener("click", () => {
    persistPlaylist();
    console.info("💾 Playlist saved");
  });

  els.undo?.addEventListener("click", () => {
    rehydratePlaylist();
    renderAll();
    console.info("↩️ Playlist restored");
  });

  els.reset?.addEventListener("click", () => {
    if (STATE.phase === "live") return;

    STATE.playlist = [];
    STATE.order = null;

    persistPlaylist();
    renderAll();
  });

  els.exportBtn?.addEventListener("click", () => {
    const data = {
      playlist: STATE.playlist,
      order: STATE.order
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "resonant-playlist.json";
    a.click();
  });
}

/* ============================================================
   END · CANON FINAL · FREEZE READY
============================================================ */
