/* ============================================================
   🔒 RESONANT V17 — PATCH 17.0.1
   STATUS: STABLE · SEALED
   CHANGELOG:
   - Fix addMix metadata resolution (DJ / Podcast safe)
   - Fix malformed function block
============================================================ */

/* ------------------------------------------------------
   IMPORTS
------------------------------------------------------ */
import { PLAYLIST } from "./playlist.official.js";
console.log("🧠 Admin JS parsed & loaded (v2.4.1)");
/* ------------------------------------------------------
   BOOT SAFETY CHECK
------------------------------------------------------ */
if (!Array.isArray(PLAYLIST)) {
  throw new Error("❌ PLAYLIST not loaded or invalid");
}
/* ------------------------------------------------------
   IMMUTABLE SOURCE OF TRUTH
------------------------------------------------------ */
Object.freeze(PLAYLIST);
/* ------------------------------------------------------
   CONFIG
------------------------------------------------------ */
const ADMIN_PIN = "5040";
const BROADCAST_KEY = "resonant_broadcast_state_v2";
const PLAYLIST_STORAGE_KEY = "resonant_admin_playlist_v1";
const HEARTBEAT_INTERVAL = 3000;
const SNAPSHOT_KEY = "resonant_broadcast_snapshot_v1";
const RANDOM_MODE_KEY = "resonant_admin_random_mode";

const LEASE_DURATION = 20000;
const WIDGET_READY_TIMEOUT = 6000; // ms

/* ------------------------------------------------------
   ADMIN ID
------------------------------------------------------ */
const ADMIN_ID = (() => {
  const key = "resonant_admin_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
})();

/* ------------------------------------------------------
   STATE
------------------------------------------------------ */
let playlist = loadPlaylist() || [...PLAYLIST];
let currentIndex = null;
let randomMode = false;
let startedAt = null;
let monitorTimer = null;
let heartbeatTimer = null;
let currentMeta = null;
let finishing = false;
let restoringFromSnapshot = false;

// 🔒 STABILITY FLAGS
let adminBooted = false;
let manualPlayIssued = false;
function safeAdvance(reason = "auto") {
  if (!playlist.length) return;

  finishing = false;

  if (currentIndex === null) {
    playIndex(0);
    return;
  }

  const nextIndex = randomMode
    ? getRandomIndex()
    : (currentIndex + 1) % playlist.length;

  playIndex(nextIndex);
}


document.addEventListener("keydown", e => {
  if (e.shiftKey && e.key.toLowerCase() === "n") {
    if (
      e.target &&
      (e.target.tagName === "INPUT" ||
       e.target.tagName === "TEXTAREA" ||
       e.target.isContentEditable)
    ) return;

    e.preventDefault();
    console.log("⏭️ Operator override: Shift+N");
    safeAdvance("manual");
  }
});

/* ------------------------------------------------------
   DOM
------------------------------------------------------ */
let loginCard, panel;
let pinInput, pinSubmit, pinError;

let playBtn, stopBtn, nextBtn, prevBtn;
let randomToggle;
let playlistEl;

let resetBtn, shuffleBtn, exportBtn, saveBtn;
let addBtn, newUrlInput;

let masterStatusPill;

let titleEl, artistEl, coverEl;
let elapsedEl, progressEl;

let previewFrame;
let widget = null;

/* ------------------------------------------------------
   INIT
------------------------------------------------------ */
window.addEventListener("load", () => {
  loginCard = document.getElementById("admin-login");
  panel     = document.getElementById("admin-panel");

  pinInput  = document.getElementById("admin-pin-input");
  pinSubmit = document.getElementById("admin-pin-submit");
  pinError  = document.getElementById("admin-pin-error");

  playBtn = document.getElementById("admin-play-btn");
  stopBtn = document.getElementById("admin-stop-btn");
  nextBtn = document.getElementById("admin-next-btn");
  prevBtn = document.getElementById("admin-prev-btn");

  randomToggle = document.getElementById("admin-random-mode");
  playlistEl   = document.getElementById("admin-playlist");

  resetBtn   = document.getElementById("admin-reset-btn");
  shuffleBtn = document.getElementById("admin-shuffle-btn");
  exportBtn  = document.getElementById("admin-export-btn");
  saveBtn    = document.getElementById("admin-save-btn");

  addBtn      = document.getElementById("admin-add-btn");
  newUrlInput = document.getElementById("admin-new-url");

  masterStatusPill = document.getElementById("admin-master-status");

  titleEl    = document.getElementById("admin-track-title");
  artistEl   = document.getElementById("admin-track-artist");
  coverEl    = document.getElementById("admin-cover");
  elapsedEl  = document.getElementById("admin-elapsed");
  progressEl = document.getElementById("admin-progress");

  previewFrame = document.getElementById("admin-preview-frame");

  initLogin();
  savePlaylist();
  renderPlaylist();
  bindControls();
});

/* ------------------------------------------------------
   LOGIN
------------------------------------------------------ */
function initLogin() {
  pinSubmit.onclick = tryLogin;
  pinInput.addEventListener("keydown", e => {
    if (e.key === "Enter") tryLogin();
  });
}

function tryLogin() {
  if (pinInput.value.trim() !== ADMIN_PIN) {
    pinError.textContent = "Incorrect PIN";
    pinInput.value = "";
    return;
  }

  loginCard.classList.add("hidden");
  panel.classList.remove("hidden");
  pinError.textContent = "";

  adminBooted = true;

  restoreFromSnapshot();

  if (currentIndex === null && playlist.length) {
    console.log("▶️ AUTO-START AFTER LOGIN");
    playIndex(0);
  }
}

/* ------------------------------------------------------
   STORAGE
------------------------------------------------------ */
function loadPlaylist() {
  try {
    const raw = localStorage.getItem(PLAYLIST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePlaylist() {
  localStorage.setItem(
    PLAYLIST_STORAGE_KEY,
    JSON.stringify(playlist)
  );
}

/* ------------------------------------------------------
   BROADCAST
------------------------------------------------------ */
function publishBroadcast(payload) {
  const state = {
    version: 2,
    source: "admin",
    adminId: ADMIN_ID,
    leaseUntil: Date.now() + LEASE_DURATION,
    updatedAt: Date.now(),
    ...payload
  };

  localStorage.setItem(BROADCAST_KEY, JSON.stringify(state));
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ state }));
}

/* ------------------------------------------------------
   SNAPSHOT RESTORE (SAFE)
------------------------------------------------------ */
function restoreFromSnapshot() {
  if (!adminBooted || manualPlayIssued) return;

  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;

    const snap = JSON.parse(raw).state;
    if (!snap) return;
    if (snap.adminId !== ADMIN_ID) return;
    if (snap.leaseUntil < Date.now()) return;

    const index = playlist.findIndex(t => t.url === snap.url);
    if (index === -1) return;

    restoringFromSnapshot = true;

    currentIndex = index;
    startedAt = snap.startedAt;
    currentMeta = snap.meta || null;

    resolveMetadataAndBroadcast(playlist[currentIndex]);

    setTimeout(() => restoringFromSnapshot = false, 1500);
  } catch {}
}

/* ------------------------------------------------------
   UI HELPERS
------------------------------------------------------ */
function updateMasterStatus(live) {
  masterStatusPill.textContent = live ? "LIVE" : "OFF AIR";
  masterStatusPill.classList.toggle("off", !live);
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------
   PLAYBACK
------------------------------------------------------ */
function playIndex(index) {
  const track = playlist[index];
  if (!track) return;

  manualPlayIssued = true;
  finishing = false;
  currentIndex = index;
  startedAt = Date.now();

  clearMonitor();
  resolveMetadataAndBroadcast(track);
  renderPlaylist();
}

function stop() {
  stopHeartbeat();
  clearMonitor();

  startedAt = null;
  currentMeta = null;
  currentIndex = null;
  finishing = false;

  try { widget?.pause(); } catch {}
  widget = null;

  /* 🔒 EXPLICIT OFF AIR CONTRACT */
  publishBroadcast({
    status: "offair"
  });

  updateMasterStatus(false);
  elapsedEl.textContent = "0:00";
}

function next() {
  if (currentIndex === null) return;
  playIndex(
    randomMode
      ? getRandomIndex()
      : (currentIndex + 1) % playlist.length
  );
}

function prev() {
  if (currentIndex === null) return;
  playIndex(
    randomMode
      ? getRandomIndex()
      : Math.max(0, currentIndex - 1)
  );
}

/* ------------------------------------------------------
   METADATA + BROADCAST
------------------------------------------------------ */
function resolveMetadataAndBroadcast(track) {
  titleEl.textContent = track.title;
  artistEl.textContent = track.artist;
  coverEl.style.backgroundImage = "";
  elapsedEl.textContent = "0:00";
  progressEl.style.width = "0%";

  const fresh = previewFrame.cloneNode();
  previewFrame.parentNode.replaceChild(fresh, previewFrame);
  previewFrame = fresh;

  previewFrame.src =
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(track.url) +
    "&auto_play=false";

  widget = SC.Widget(previewFrame);

  let readyResolved = false;

  const failSafe = setTimeout(() => {
    if (!readyResolved) stop();
  }, WIDGET_READY_TIMEOUT);

  widget.bind(SC.Widget.Events.READY, () => {
    if (readyResolved) return;
    readyResolved = true;
    clearTimeout(failSafe);

    widget.getCurrentSound(sound => {
      currentMeta = {
        title: track.title,
        artist: track.artist,
        artwork: sound?.artwork_url
          ? sound.artwork_url.replace("-large", "-t500x500")
          : null
      };

      if (currentMeta.artwork) {
        coverEl.style.backgroundImage = `url(${currentMeta.artwork})`;
      }

      if (!restoringFromSnapshot) {
        publishBroadcast({
          status: "live",
          url: track.url,
          startedAt,
          meta: currentMeta
        });
      }

      updateMasterStatus(true);
      startMonitor();
      startHeartbeat();

      // 🔁 AUTO-ADVANCE · RADIO CORE
      widget.bind(SC.Widget.Events.FINISH, () => {
        if (finishing) return;
        finishing = true;

        publishBroadcast({
          status: "transition",
          url: track.url,
          startedAt,
          meta: currentMeta
        });

        setTimeout(() => safeAdvance("auto"), 300);
      });
    });
  });
}

/* ------------------------------------------------------
   HEARTBEAT
------------------------------------------------------ */
function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!startedAt || currentIndex === null || !currentMeta) return;

    publishBroadcast({
      status: "live",
      url: playlist[currentIndex].url,
      startedAt,
      meta: currentMeta
    });
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

/* ------------------------------------------------------
   MONITOR
------------------------------------------------------ */
function startMonitor() {
  clearMonitor();
  monitorTimer = setInterval(() => {
    if (!startedAt) return;
    elapsedEl.textContent = formatTime(Date.now() - startedAt);
  }, 1000);
}

function clearMonitor() {
  clearInterval(monitorTimer);
  monitorTimer = null;
}

/* ------------------------------------------------------
   PLAYLIST UI + OPS (SIN CAMBIOS)
------------------------------------------------------ */
function renderPlaylist() {
  playlistEl.innerHTML = "";

  playlist.forEach((track, i) => {
    const li = document.createElement("li");
    li.className = "admin-mix-row" + (i === currentIndex ? " active" : "");

    li.innerHTML = `
      <span>
        <strong
          contenteditable="true"
          data-field="artist"
          data-index="${i}"
        >${track.artist}</strong>
        <small
          contenteditable="true"
          data-field="title"
          data-index="${i}"
        > — ${track.title}</small>
      </span>
      <div class="row-actions">
        <button data-play="${i}">▶</button>
        <button data-up="${i}">↑</button>
        <button data-down="${i}">↓</button>
        <button data-delete="${i}">✕</button>
      </div>
    `;

    playlistEl.appendChild(li);
  });
}

function bindControls() {
  playlistEl.onclick = e => {
    const d = e.target.dataset;
    if (d.play) playIndex(+d.play);
    if (d.up) moveTrack(+d.up, -1);
    if (d.down) moveTrack(+d.down, 1);
    if (d.delete) deleteTrack(+d.delete);
  };

  playBtn.onclick = () => currentIndex !== null && playIndex(currentIndex);
  stopBtn.onclick = stop;
  nextBtn.onclick = next;
  prevBtn.onclick = prev;

  randomToggle.checked = localStorage.getItem(RANDOM_MODE_KEY) === "1";
  randomMode = randomToggle.checked;

  randomToggle.onchange = () => {
    randomMode = randomToggle.checked;
    localStorage.setItem(RANDOM_MODE_KEY, randomMode ? "1" : "0");
  };

  resetBtn.onclick   = resetPlaylist;
  shuffleBtn.onclick = shufflePlaylist;
  exportBtn.onclick  = exportPlaylist;
  saveBtn.onclick    = savePlaylist;
  addBtn.onclick     = addMix;
}
playlistEl.addEventListener("blur", e => {
  const field = e.target.dataset.field;
  const index = e.target.dataset.index;

  if (!field || index === undefined) return;
  const track = playlist[index];
  if (!track) return;

  let value = e.target.textContent.trim();

  if (field === "title") {
    value = value.replace(/^—/, "").trim();
  }

  if (!value) return;

  track[field] = value;
  savePlaylist();
}, true);

/* ------------------------------------------------------
   SAFETY STUBS (ANTI-CRASH)
------------------------------------------------------ */
function getRandomIndex() {
  if (!playlist || !playlist.length) return 0;
  return Math.floor(Math.random() * playlist.length);
}

function addMix() {
  const url = newUrlInput.value.trim();
  if (!url) return;

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src =
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(url);

  document.body.appendChild(iframe);
  const widget = SC.Widget(iframe);

  let done = false;

  widget.bind(SC.Widget.Events.READY, () => {
    widget.getCurrentSound(sound => {
      if (!sound || done) return;
      done = true;

      playlist.push({
        url,
        artist: sound.user?.username || "Unknown Artist",
        title: sound.title || "Untitled"
      });

      savePlaylist();
      renderPlaylist();
      iframe.remove();
    });
  });

  newUrlInput.value = "";
}

function deleteTrack(index) {
  if (index < 0 || index >= playlist.length) return;
  playlist.splice(index, 1);
  savePlaylist();
  renderPlaylist();
}

function moveTrack(index, dir) {
  const target = index + dir;
  if (target < 0 || target >= playlist.length) return;

  [playlist[index], playlist[target]] =
    [playlist[target], playlist[index]];

  savePlaylist();
  renderPlaylist();
}

function resetPlaylist() {
  if (!confirm("Reset playlist to original state?")) return;
  playlist = [...PLAYLIST];
  savePlaylist();
  renderPlaylist();
}

function shufflePlaylist() {
  for (let i = playlist.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
  }

  savePlaylist();
  renderPlaylist();
}

function exportPlaylist() {
  const text = playlist.map(t => t.url).join("\n");
  navigator.clipboard.writeText(text);
  alert("Playlist copied to clipboard");
}


/* ------------------------------------------------------
   WATCHDOG (SEALED)
------------------------------------------------------ */
const WATCHDOG_INTERVAL = 5000;
const WATCHDOG_GRACE = 12000;

setInterval(() => {
  try {
    if (!startedAt || currentIndex === null) return;

    const raw = localStorage.getItem(BROADCAST_KEY);
    if (!raw) return;

    const state = JSON.parse(raw);
    if (!state || state.status !== "live") return;

    if (Date.now() - state.updatedAt > WATCHDOG_GRACE) {
      stopHeartbeat();
      clearMonitor();
      finishing = false;
      playIndex(currentIndex);
    }
  } catch {}
}, WATCHDOG_INTERVAL);