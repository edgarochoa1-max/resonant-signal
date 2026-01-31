/* ============================================================
   RESONANT · ADMIN UI
   FILE: admin.ui.js
   VERSION: 20.4.2-UI-CANON-FINAL
   STATUS: SEALED · BROADCAST GRADE
============================================================ */

"use strict";

import * as CORE from "./admin.core.js";
import * as ENGINE from "./admin.engine.js";

/* ============================================================
   UTIL — FAIL SAFE DOM
============================================================ */

const PLAYLIST_DENSITY_KEY = "resonant_playlist_density";

function requireEl(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`⚠️ ADMIN UI — Missing DOM element: #${id}`);
    return null;
  }
  return el;
}

/* ============================================================
   DOM CACHE
============================================================ */

let loginCard, adminPanel;
let stopBtn, nextBtn;
let playlistEl, masterStatusPill;
let saveBtn, importBtn, shuffleBtn, exportBtn;
let importFileInput;
let elapsedEl, progressEl;
let monitorArtistEl, monitorTitleEl, monitorContributorEl;
let addUrlInput, addMixBtn;
let undoPlaylistBtn;
let resetBtn;
let healthListenersEl;

let uiEventsBound = false;
let progressTimer = null;

/* ============================================================
   CACHE DOM
============================================================ */

export function cacheAdminDOM() {
  loginCard = requireEl("admin-login");
  adminPanel = requireEl("admin-panel");

  stopBtn = requireEl("admin-stop-btn");
  nextBtn = requireEl("admin-next-btn");

  playlistEl = requireEl("admin-playlist");
  masterStatusPill = requireEl("admin-master-status");

  elapsedEl = requireEl("admin-elapsed");
  progressEl = requireEl("admin-progress");

  monitorArtistEl = requireEl("admin-track-artist");
  monitorTitleEl = requireEl("admin-track-title");
  monitorContributorEl = requireEl("admin-track-contributor");

  saveBtn = requireEl("admin-save-btn");
  importBtn = requireEl("admin-import-playlist-btn");
  resetBtn = requireEl("admin-reset-btn");
  shuffleBtn = requireEl("admin-shuffle-btn");
  exportBtn = requireEl("admin-export-btn");
  undoPlaylistBtn = requireEl("admin-undo-playlist-btn");

  importFileInput = requireEl("admin-import-file");

  addUrlInput = requireEl("admin-add-url");
  addMixBtn = requireEl("admin-add-mix-btn");

  healthListenersEl = requireEl("health-listeners");


}

/* ============================================================
   BODY MODES & LOCK
============================================================ */

function applyBodyModes() {
  const state = CORE.getState();
  if (!state.adminBooted || !playlistEl) return;

  document.body.classList.remove(
    "mode-operator",
    "mode-observer",
    "mode-live",
    "is-finishing"
  );

  document.body.classList.add("admin-body");
  document.body.classList.add(
    state.adminMode === "operator"
      ? "mode-operator"
      : "mode-observer"
  );

  if (Number.isFinite(state.startedAt) && state.currentTrackId) {
    document.body.classList.add("mode-live");
  }

  if (state.finishing) {
    document.body.classList.add("is-finishing");
    playlistEl.classList.add("locked");
  } else {
    playlistEl.classList.remove("locked");
  }
}

/* ============================================================
   MASTER STATUS
============================================================ */

function updateMasterStatus() {
  if (!masterStatusPill) return;

  masterStatusPill.classList.remove("on", "off", "warn");

  const { startedAt, currentTrackId } = CORE.getState();

  if (Number.isFinite(startedAt) && currentTrackId) {
    masterStatusPill.textContent = "ON AIR";
    masterStatusPill.classList.add("on");
  } else {
    masterStatusPill.textContent = "OFF AIR";
    masterStatusPill.classList.add("off");
  }
}

/* ============================================================
   HEALTH
============================================================ */

function renderAdminHealth() {
  const state = CORE.getState();
  const h = state.health || {};
  const now = Date.now();

  const hasLease =
    h.owner === state.adminId &&
    Number.isFinite(h.leaseUntil) &&
    h.leaseUntil > now;

  const live =
    Number.isFinite(state.startedAt) &&
    state.currentTrackId;

    const listeners =
  Number.isFinite(state.listeners)
    ? state.listeners
    : "—";

  const modeEl = requireEl("health-mode");
  const roleEl = requireEl("health-role");
  const leaseEl = requireEl("health-lease");
  const hbEl   = requireEl("health-heartbeat");
  const statusEl = requireEl("health-status-text");

  // MODE
if (modeEl) {
  const mode =
    state.adminMode === "operator" ? "Operator" :
    state.adminMode === "observer" ? "Observer" :
    "—";
  modeEl.textContent = mode;
}

// ROLE (humano, no UUID técnico)
if (roleEl) {
  roleEl.textContent = "Admin";
}

// LEASE
if (leaseEl) {
  leaseEl.textContent = hasLease ? "OK" : "Lost";
}

// HEARTBEAT
if (hbEl) {
  hbEl.textContent = state.startedAt ? "Active" : "Idle";
}

// STATUS
if (statusEl) {
  statusEl.textContent = live ? "On Air" : "Off Air";
}


 // LISTENERS (humano)
if (healthListenersEl) {
  if (!Number.isFinite(state.listeners)) {
    healthListenersEl.textContent = "—";
  } else if (state.listeners === 0) {
    healthListenersEl.textContent = "0";
  } else {
    healthListenersEl.textContent = String(state.listeners);
  }
}


}

/* ============================================================
   LIVE MONITOR (SNAPSHOT)
============================================================ */

function renderLiveMonitorMeta() {
  const snapshot = CORE.getBroadcastSnapshot();

  if (!snapshot?.track) {
    monitorArtistEl && (monitorArtistEl.textContent = "—");
    monitorTitleEl && (monitorTitleEl.textContent = "—");
    monitorContributorEl && (monitorContributorEl.textContent = "—");
    return;
  }

  monitorArtistEl.textContent =
    snapshot.track.artist?.name || "—";
  monitorTitleEl.textContent =
    snapshot.track.title || "—";
  monitorContributorEl.textContent =
    snapshot.track.contributor?.name || "—";
}

/* ============================================================
   PROGRESS (LIVE ONLY)
============================================================ */

function startProgressLoop() {
  if (progressTimer) return;
  progressTimer = setInterval(updateProgressUI, 500);
}

function stopProgressLoop() {
  if (!progressTimer) return;
  clearInterval(progressTimer);
  progressTimer = null;

  progressEl && (progressEl.style.width = "0%");
  elapsedEl && (elapsedEl.textContent = "0:00");
}

function updateProgressUI() {
  if (!progressEl || !elapsedEl) return;

  const state = CORE.getState();

  if (
    !Number.isFinite(state.startedAt) ||
    !state.currentMeta ||
    !Number.isFinite(state.currentMeta.duration)
  ) {
    progressEl.style.width = "0%";
    elapsedEl.textContent = "0:00";
    return;
  }

  let duration = state.currentMeta.duration;
  if (duration > 0 && duration < 1000) duration *= 1000;

  const elapsed = Date.now() - state.startedAt;
  const ratio = Math.min(Math.max(elapsed / duration, 0), 1);

  progressEl.style.width = `${ratio * 100}%`;

  const sec = Math.max(0, Math.floor(elapsed / 1000));
  elapsedEl.textContent =
    Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

/* ============================================================
   PLAYLIST RENDER + STATE
============================================================ */

export function renderPlaylist() {
  if (!playlistEl) return;

  const state = CORE.getState();
  playlistEl.innerHTML = "";

  if (!state.playlist?.length) {
    const li = document.createElement("li");
    li.className = "playlist-empty";
    li.textContent = "No tracks available.";
    playlistEl.appendChild(li);
    return;
  }

  state.playlist.forEach((track, i) => {
    const li = document.createElement("li");
    li.className = "admin-mix-row";
    li.dataset.index = i;

    li.innerHTML = `
      <div class="mix-title editable">
        <input class="row-artist" data-field="artist" value="${track.artist?.name ?? ""}" placeholder="Artist" />
        <input class="row-title" data-field="title" value="${track.title ?? ""}" placeholder="Title" />
        <input class="row-contributor" data-field="contributor" value="${track.contributor?.name ?? ""}" placeholder="Contributor" />
      </div>

      <div class="row-actions">
        <button data-action="play">▶</button>
        <button data-action="up">↑</button>
        <button data-action="down">↓</button>
        <button data-action="delete">✖</button>
      </div>
    `;

    playlistEl.appendChild(li);
  });

  applyPlaylistState();
}

function applyPlaylistState() {
  const state = CORE.getState();
  const rows = playlistEl?.querySelectorAll(".admin-mix-row") || [];

  let activeRow = null;

  rows.forEach((row, index) => {
    row.classList.remove("active", "playing", "live-active");

    const track = state.playlist[index];
    if (!track) return;

    if (index === state.currentIndex) {
      row.classList.add("active");
      activeRow = row;
    }

    if (
      Number.isFinite(state.startedAt) &&
      state.currentTrackId === track.id
    ) {
      row.classList.add("playing", "live-active");
      activeRow = row;
    }
  });

  if (activeRow) {
    const c = playlistEl.getBoundingClientRect();
    const r = activeRow.getBoundingClientRect();
    playlistEl.scrollTop +=
      r.top - c.top - c.height / 2 + r.height / 2;
  }
}

/* ============================================================
   UI EVENTS
============================================================ */

export function bindUIEvents() {
  if (uiEventsBound) return;
  uiEventsBound = true;

  stopBtn?.addEventListener("click", () => {
  if (!CORE.canOperate()) return;
  ENGINE.emergencyStop("ui-stop");
  stopProgressLoop();
});

  resetBtn?.addEventListener("click", () => {
    if (!CORE.canOperate()) return;
    ENGINE.emergencyStop("ui-reset");
    stopProgressLoop();
  });

  nextBtn?.addEventListener("click", () => {
  if (!CORE.canOperate()) return;
  ENGINE.safeAdvance("ui-next");
});

  shuffleBtn?.addEventListener("click", ENGINE.shufflePlaylist);

  saveBtn?.addEventListener("click", () => {
    if (!CORE.canOperate()) return;
    CORE.savePlaylist();
  });

  undoPlaylistBtn?.addEventListener("click", () => {
    if (!CORE.canOperate()) return;
    CORE.undoPlaylist("ui-undo");
  });

  playlistEl?.addEventListener("click", e => {
    const btn = e.target.closest("button");
    const row = e.target.closest(".admin-mix-row");
    if (!btn || !row) return;
    if (!CORE.canOperate() || CORE.getState().finishing) return;

    const i = Number(row.dataset.index);

    switch (btn.dataset.action) {
      case "play":   ENGINE.playIndex(i, "manual"); break;
      case "delete": ENGINE.deleteTrack(i); break;
      case "up":     ENGINE.moveTrackUp(i); break;
      case "down":   ENGINE.moveTrackDown(i); break;
    }
  });

  playlistEl?.addEventListener("change", e => {
    const input = e.target;
    const row = input.closest(".admin-mix-row");
    if (!row || !input.dataset.field) return;
    if (!CORE.canOperate() || CORE.getState().finishing) return;

    const index = Number(row.dataset.index);
    const value = input.value;

    if (input.dataset.field === "artist")
      CORE.updateTrackField(index, "artist.name", value);
    if (input.dataset.field === "title")
      CORE.updateTrackField(index, "title", value);
    if (input.dataset.field === "contributor")
      CORE.updateTrackField(index, "contributor.name", value);
  });

  addMixBtn?.addEventListener("click", () => {
  console.warn("Add mix disabled: ENGINE.addMixFromURL not implemented");
});

}

/* ============================================================
   VISIBILITY
============================================================ */

export function showLoginOnly() {
  loginCard && (loginCard.style.display = "block");
  adminPanel && (adminPanel.style.display = "none");
}

export function showAdminUI() {
  loginCard && (loginCard.style.display = "none");
  adminPanel && (adminPanel.style.display = "block");
  document.body.classList.add("admin-ui-ready");

  renderPlaylist();
  renderLiveMonitorMeta();
  renderAdminHealth();
  applyBodyModes();
  updateMasterStatus();
  bindUIEvents();
}

/* ============================================================
   STATE → UI SYNC (SINGLE SOURCE)
============================================================ */

let lastPlaylistSig = null;

CORE.on("state", () => {
  const state = CORE.getState();

  const sig = JSON.stringify(
    state.playlist.map(t => [
      t.id,
      t.title,
      t.artist?.name,
      t.contributor?.name
    ])
  );

  if (sig !== lastPlaylistSig) {
    lastPlaylistSig = sig;
    renderPlaylist();
  }

  applyBodyModes();
  updateMasterStatus();
  applyPlaylistState();
  renderLiveMonitorMeta();
  renderAdminHealth();

  const live =
  Number.isFinite(state.startedAt) &&
  state.currentTrackId &&
  Number.isFinite(state.currentMeta?.duration) &&
  !state.finishing;

if (live) startProgressLoop();
else stopProgressLoop();

});

/* ============================================================
   END admin.ui.js · CANON SEALED
============================================================ */
