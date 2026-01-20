/* ============================================================
   RESONANT · ADMIN UI
   FILE: admin.ui.js
   VERSION: 20.3.6-UI-CANON-STABLE
   STATUS: SEALED · BROADCAST GRADE
============================================================ */

"use strict";

import * as CORE from "./admin.core.js";
import * as ENGINE from "./admin.engine.js";

/* ============================================================
   UTIL — FAIL SAFE DOM
============================================================ */

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
let stopBtn, nextBtn, randomToggle;
let playlistEl, masterStatusPill;
let saveBtn, importBtn, resetBtn, shuffleBtn, exportBtn;
let playlistIO, importFileInput;
let elapsedEl, progressEl;
let monitorArtistEl, monitorTitleEl, monitorContributorEl;
let addUrlInput, addMixBtn;
let undoPlaylistBtn;

let healthOwnerEl, healthStatusEl, healthLeaseEl;

let uiEventsBound = false;
let uiHeartbeat = null;

/* ============================================================
   CACHE DOM
============================================================ */

export function cacheAdminDOM() {
  loginCard = requireEl("admin-login");
  adminPanel = requireEl("admin-panel");

  stopBtn = requireEl("admin-stop-btn");
  nextBtn = requireEl("admin-next-btn");
  randomToggle = requireEl("admin-random-mode");

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

  playlistIO = requireEl("admin-playlist-io");
  importFileInput = requireEl("admin-import-file");

  addUrlInput = requireEl("admin-add-url");
  addMixBtn = requireEl("admin-add-mix-btn");

  healthOwnerEl = requireEl("admin-health-owner");
  healthStatusEl = requireEl("admin-health-status");
  healthLeaseEl  = requireEl("admin-health-lease");
}

/* ============================================================
   BODY MODES & LOCK
============================================================ */

function applyBodyModes() {
  const state = CORE.getState();
  if (!state.adminBooted) return;

  document.body.className = "admin-body";
  document.body.classList.add(
    state.adminMode === "operator"
      ? "mode-operator"
      : "mode-observer"
  );

  if (state.startedAt && state.currentTrackId) {
    document.body.classList.add("mode-live");
  }

  if (state.finishing) {
    document.body.classList.add("is-finishing");
    playlistEl?.classList.add("locked");
  } else {
    document.body.classList.remove("is-finishing");
    playlistEl?.classList.remove("locked");
  }
}

/* ============================================================
   MASTER STATUS
============================================================ */

function updateMasterStatus() {
  if (!masterStatusPill) return;

  const { startedAt } = CORE.getState();
  masterStatusPill.className = "pill";

  if (startedAt) {
    masterStatusPill.textContent = "ON AIR";
    masterStatusPill.classList.add("on");
  } else {
    masterStatusPill.textContent = "OFF AIR";
    masterStatusPill.classList.add("off");
  }
}

function updateRandomToggle() {
  if (!randomToggle) return;
  randomToggle.checked = !!CORE.getState().randomMode;
}

/* ============================================================
   HEALTH
============================================================ */

function renderAdminHealth() {
  const h = CORE.getState().health;
  if (!h) return;

  healthOwnerEl && (healthOwnerEl.textContent = h.owner || "—");

  if (healthStatusEl) {
    healthStatusEl.textContent = h.status || "unknown";
    healthStatusEl.className = `health ${h.status}`;
  }

  if (healthLeaseEl) {
    if (!h.leaseUntil) {
      healthLeaseEl.textContent = "—";
    } else {
      const ms = h.leaseUntil - Date.now();
      healthLeaseEl.textContent =
        ms > 0 ? `${Math.ceil(ms / 1000)}s` : "expired";
    }
  }
}

/* ============================================================
   LIVE MONITOR (SNAPSHOT-DRIVEN)
============================================================ */

function renderLiveMonitorMeta() {
  const snapshot = CORE.getBroadcastSnapshot();

  if (!snapshot?.track) {
    monitorArtistEl && (monitorArtistEl.textContent = "—");
    monitorTitleEl && (monitorTitleEl.textContent = "—");
    monitorContributorEl && (monitorContributorEl.textContent = "—");
    return;
  }

  monitorArtistEl &&
    (monitorArtistEl.textContent =
      snapshot.track.artist?.name || "—");

  monitorTitleEl &&
    (monitorTitleEl.textContent =
      snapshot.track.title || "—");

  monitorContributorEl &&
    (monitorContributorEl.textContent =
      snapshot.track.contributor?.name || "—");
}

/* ============================================================
   PROGRESS (SAFE & DETERMINISTIC)
============================================================ */

function updateProgressUI() {
  if (!progressEl || !elapsedEl) return;

  const state = CORE.getState();

  if (
    !state.startedAt ||
    !state.currentMeta ||
    !Number.isFinite(state.currentMeta.duration)
  ) {
    progressEl.style.width = "0%";
    elapsedEl.textContent = "0:00";
    return;
  }

  const elapsed = Date.now() - state.startedAt;
  const duration = state.currentMeta.duration;

  const ratio = Math.min(elapsed / duration, 1);
  progressEl.style.width = `${ratio * 100}%`;

  const sec = Math.floor(elapsed / 1000);
  elapsedEl.textContent =
    Math.floor(sec / 60) + ":" +
    String(sec % 60).padStart(2, "0");
}

/* ============================================================
   PLAYLIST RENDER
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
      <div class="mix-title">
        <span class="row-artist">${track.artist?.name || "Unknown Artist"}</span>
        <span class="row-title">${track.title || "Untitled"}</span>
        <span class="row-contributor">${track.contributor?.name || ""}</span>
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

/* ============================================================
   PLAYLIST STATE
============================================================ */

function applyPlaylistState() {
  if (!playlistEl) return;

  const state = CORE.getState();
  const rows = playlistEl.querySelectorAll(".admin-mix-row");

  rows.forEach((row, index) => {
    row.classList.remove("active", "playing", "live", "live-active");

    const track = state.playlist[index];
    if (!track) return;

    if (index === state.currentIndex) {
      row.classList.add("active");
    }

    if (state.startedAt && state.currentTrackId === track.id) {
      row.classList.add("playing", "live", "live-active");
    }
  });
}

/* ============================================================
   UI EVENTS
============================================================ */

export function bindUIEvents() {
  if (uiEventsBound) return;
  uiEventsBound = true;

  stopBtn?.addEventListener("click", () =>
    ENGINE.emergencyStop("ui-stop")
  );

  nextBtn?.addEventListener("click", () => {
    if (!CORE.canOperate() || CORE.getState().finishing) return;
    ENGINE.safeAdvance("ui-next");
  });

  randomToggle?.addEventListener("change", () =>
    CORE.setState(
      { randomMode: randomToggle.checked },
      "ui-random-toggle"
    )
  );

  playlistEl?.addEventListener("click", e => {
    const btn = e.target.closest("button");
    const row = e.target.closest(".admin-mix-row");
    if (!btn || !row) return;

    const i = Number(row.dataset.index);
    const action = btn.dataset.action;

    if (!CORE.canOperate()) return;
    if (CORE.getState().finishing && action !== "play") return;

    if (action === "play") ENGINE.playIndex(i, "manual");
    if (action === "delete") ENGINE.deleteTrack(i);
    if (action === "up") ENGINE.moveTrackUp(i);
    if (action === "down") ENGINE.moveTrackDown(i);
  });

  addMixBtn?.addEventListener("click", async () => {
    if (!addUrlInput.value) return;
    await ENGINE.addMixFromURL(addUrlInput.value.trim());
    addUrlInput.value = "";
  });

  shuffleBtn?.addEventListener("click", ENGINE.shufflePlaylist);
  saveBtn?.addEventListener("click", CORE.savePlaylist);
  undoPlaylistBtn?.addEventListener("click", CORE.undoPlaylist);

  resetBtn?.addEventListener("click", () =>
    ENGINE.resetPlaylistToCanonical?.()
  );

  exportBtn?.addEventListener("click", () => {
    const data = JSON.stringify(CORE.getState().playlist, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "resonant-playlist.json";
    a.click();

    URL.revokeObjectURL(url);
  });

  importBtn?.addEventListener("click", () => {
    importFileInput?.click();
  });

  importFileInput?.addEventListener("change", async () => {
    if (!CORE.canOperate()) return;

    const file = importFileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      ENGINE.importCanonicalPlaylist(data);
    } catch (err) {
      console.error("❌ Import failed", err);
    } finally {
      importFileInput.value = "";
    }
  });
}

/* ============================================================
   UI HEARTBEAT (SAFE)
============================================================ */

export function startUIHeartbeat() {
  if (uiHeartbeat) return;

  uiHeartbeat = setInterval(() => {
    const state = CORE.getState();
    if (!state.adminBooted) return;

    applyBodyModes();
    updateMasterStatus();
    updateRandomToggle();
    updateProgressUI();
    applyPlaylistState();
    renderLiveMonitorMeta();
    renderAdminHealth();
  }, 1000);
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

  renderPlaylist();
  renderLiveMonitorMeta();
  updateProgressUI();
  bindUIEvents();
  startUIHeartbeat();
}

/* ============================================================
   STATE → UI SYNC
============================================================ */

let lastPlaylistSig = null;

CORE.on("state", ({ reason }) => {
  const state = CORE.getState();
  const sig = JSON.stringify(state.playlist.map(t => t.id));

  if (sig !== lastPlaylistSig) {
    lastPlaylistSig = sig;
    renderPlaylist();
  }

  if (
    reason.startsWith("playlist-") ||
    reason.includes("play") ||
    reason.includes("advance") ||
    reason === "stop"
  ) {
    applyBodyModes();
    updateMasterStatus();
    applyPlaylistState();
    renderLiveMonitorMeta();
    updateProgressUI();
    renderAdminHealth();
  }
});

/* ============================================================
   END admin.ui.js
============================================================ */
