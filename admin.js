/* ============================================================
   RESONANT · ADMIN MASTER CLOCK — V2.4 FINAL (FROZEN)
   Broadcast Console · Playlist Authority · AUTO-ADVANCE ENABLED
   ADMIN = SINGLE SOURCE OF TRUTH (Artist + Title)
============================================================ */

/* ------------------------------------------------------
   IMPORTS
------------------------------------------------------ */
import { PLAYLIST } from "./playlist.official.js";

/* ------------------------------------------------------
   CONFIG
------------------------------------------------------ */
const ADMIN_PIN = "5040";
const BROADCAST_KEY = "resonant_broadcast_state_v2";
const PLAYLIST_STORAGE_KEY = "resonant_admin_playlist_v1";
const HEARTBEAT_INTERVAL = 3000;

/* ------------------------------------------------------
   STATE
------------------------------------------------------ */
let playlist = loadPlaylist() || normalizeInitialPlaylist([...PLAYLIST]);
let currentIndex = null;
let randomMode = false;
let startedAt = null;
let monitorTimer = null;
let heartbeatTimer = null;
let currentMeta = null;
let finishing = false;

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
  savePlaylist(); // persist canonical playlist on first load
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
  localStorage.setItem(
    BROADCAST_KEY,
    JSON.stringify({
      version: 2,
      source: "admin",
      updatedAt: Date.now(),
      ...payload
    })
  );
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
   META NORMALIZATION (CANONICAL)
------------------------------------------------------ */
function normalizeMetaFromSound(soundTitle, fallbackArtist = "") {
  const raw = (soundTitle || "").trim();
  const fb  = (fallbackArtist || "").trim();

  if (!raw) {
    return { artist: fb || "Unknown Artist", title: "Untitled" };
  }

  // 1) Detect guest pattern: [with X] or (with X)
  const withMatch =
    raw.match(/\[\s*with\s+([^\]]+)\s*\]/i) ||
    raw.match(/\(\s*with\s+([^)]+)\s*\)/i);

  const guest = withMatch?.[1]?.trim() || "";

  // 2) Build working string WITHOUT guest segment
  let s = raw
    .replace(/\[\s*with\s+[^\]]+\s*\]/ig, "")
    .replace(/\(\s*with\s+[^)]+\s*\)/ig, "")
    .replace(/\(feat\.?\s+[^)]+\)/ig, "")
    .replace(/\bfeat\.?\s+.+$/ig, "")
    .replace(/\bby\s+(.+)$/ig, "")
    .trim();

  const parts = s
    .split(/\s*(?:—|–|\s-\s|\s\|\s)\s*/g)
    .map(p => p.trim())
    .filter(Boolean);

  const clean = t =>
    (t || "")
      .replace(/\b(19|20)\d{2}\b/g, "")
      .replace(/\blive\s*@.+$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  // ✅ PRIORITY RULE: guest artist wins
  if (guest) {
    const baseTitle = clean(parts[0]) || clean(s) || "Live Set";
    const artistFinal = clean(guest) || fb || "Unknown Artist";
    return {
      artist: artistFinal,
      title: baseTitle
    };
  }

  // --- fallback behavior ---
  const eq = (a, b) =>
    a && b &&
    a.toLowerCase().replace(/[^a-z0-9]/g, "") ===
    b.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (parts.length >= 2) {
    const artist = clean(parts[0]) || fb || "Unknown Artist";
    const title =
      clean(parts.slice(1).filter(p => !eq(p, artist)).join(" — ")) ||
      "Live Set";
    return { artist, title };
  }

  return {
    artist: fb || "Unknown Artist",
    title: clean(parts[0]) || "Untitled"
  };
}

/* ------------------------------------------------------
   INITIAL PLAYLIST NORMALIZATION (ON LOAD)
------------------------------------------------------ */
function normalizeInitialPlaylist(rawPlaylist) {
  return rawPlaylist.map(entry => {
    const canonical = normalizeMetaFromSound(
      entry.title || "",
      entry.artist || ""
    );
    return {
      ...entry,
      artist: canonical.artist,
      title: canonical.title
    };
  });
}

/* ------------------------------------------------------
   PLAYLIST UI
------------------------------------------------------ */
function renderPlaylist() {
  playlistEl.innerHTML = "";
  playlist.forEach((track, i) => {
    const li = document.createElement("li");
    li.className = "admin-mix-row" + (i === currentIndex ? " active" : "");
    li.innerHTML = `
      <span>
        <strong>${track.artist}</strong>
        <small> — ${track.title}</small>
      </span>
      <div class="row-actions">
        <button data-play="${i}">▶</button>
        <button data-up="${i}">↑</button>
        <button data-down="${i}">↓</button>
        <button data-delete="${i}">✕</button>
      </div>`;
    playlistEl.appendChild(li);
  });
}

/* ------------------------------------------------------
   CONTROLS
------------------------------------------------------ */
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

  randomToggle.onchange = () => randomMode = randomToggle.checked;

  resetBtn.onclick   = resetPlaylist;
  shuffleBtn.onclick = shufflePlaylist;
  exportBtn.onclick  = exportPlaylist;
  saveBtn.onclick    = savePlaylist;
  addBtn.onclick     = addMix;
}

/* ------------------------------------------------------
   CORE TRANSPORT
------------------------------------------------------ */
function playIndex(index) {
  const track = playlist[index];
  if (!track) return;

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
  publishBroadcast({ status: "off", url: null, startedAt: null });
  updateMasterStatus(false);
  elapsedEl.textContent = "0:00";
}

function next() {
  if (currentIndex === null) return;
  playIndex(randomMode ? getRandomIndex() : (currentIndex + 1) % playlist.length);
}

function prev() {
  if (currentIndex === null) return;
  playIndex(randomMode ? getRandomIndex() : Math.max(0, currentIndex - 1));
}

/* ------------------------------------------------------
   METADATA + BROADCAST (NO RE-PARSING)
------------------------------------------------------ */
function resolveMetadataAndBroadcast(track) {
  titleEl.textContent = track.title;
  artistEl.textContent = track.artist;
  coverEl.style.backgroundImage = "";
  elapsedEl.textContent = "0:00";
  progressEl.style.width = "100%";

  const fresh = previewFrame.cloneNode();
  previewFrame.parentNode.replaceChild(fresh, previewFrame);
  previewFrame = fresh;

  previewFrame.src =
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(track.url) +
    "&auto_play=false";

  widget = SC.Widget(previewFrame);

  widget.bind(SC.Widget.Events.READY, () => {
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

      publishBroadcast({
        status: "live",
        url: track.url,
        startedAt,
        meta: currentMeta
      });

      updateMasterStatus(true);
      startMonitor();
      startHeartbeat();

      widget.bind(SC.Widget.Events.FINISH, () => {
  if (finishing) return;
  finishing = true;

  stopHeartbeat();
  clearMonitor();

  publishBroadcast({
    status: "transition",
    url: null,
    startedAt: null
  });

  setTimeout(() => {
    finishing = false;
    randomMode ? playIndex(getRandomIndex()) : next();
  }, 300);
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
   ADD MIX (CANONICAL INGEST)
------------------------------------------------------ */
function addMix() {
  const url = newUrlInput.value.trim();
  if (!url.includes("soundcloud.com")) return;

  newUrlInput.value = "";

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  document.body.appendChild(iframe);

  iframe.src =
    "https://w.soundcloud.com/player/?url=" +
    encodeURIComponent(url) +
    "&auto_play=false";

  const tempWidget = SC.Widget(iframe);

  tempWidget.bind(SC.Widget.Events.READY, () => {
    tempWidget.getCurrentSound(sound => {

      const canonical = normalizeMetaFromSound(sound?.title || "", "");

      playlist.push({
        url,
        artist: canonical.artist,
        title: canonical.title,
        artwork: sound?.artwork_url
          ? sound.artwork_url.replace("-large", "-t500x500")
          : null
      });

      savePlaylist();
      renderPlaylist();
      document.body.removeChild(iframe);
    });
  });
}

/* ------------------------------------------------------
   PLAYLIST OPS
------------------------------------------------------ */
function moveTrack(i, d) {
  const t = i + d;
  if (t < 0 || t >= playlist.length) return;
  [playlist[i], playlist[t]] = [playlist[t], playlist[i]];
  if (currentIndex === i) currentIndex = t;
  savePlaylist();
  renderPlaylist();
}

function deleteTrack(i) {
  if (i === currentIndex) return;
  playlist.splice(i, 1);
  savePlaylist();
  renderPlaylist();
}

function resetPlaylist() {
  if (!confirm("Reset playlist?")) return;
  playlist = normalizeInitialPlaylist([...PLAYLIST]);
  currentIndex = null;
  stop();
  savePlaylist();
  renderPlaylist();
}

function shufflePlaylist() {
  playlist.sort(() => Math.random() - 0.5);
  savePlaylist();
  renderPlaylist();
}

function exportPlaylist() {
  alert(playlist.map(t => t.url).join("\n"));
}

/* ------------------------------------------------------
   RANDOM
------------------------------------------------------ */
function getRandomIndex() {
  if (playlist.length <= 1) return 0;
  let i;
  do i = Math.floor(Math.random() * playlist.length);
  while (i === currentIndex);
  return i;
}

/* ============================================================
   ADMIN STATUS: FROZEN · SINGLE SOURCE OF TRUTH · V2.4
============================================================ */
// 🧪 TEST: force next track (SHIFT + N)
document.addEventListener("keydown", e => {
  if (e.shiftKey && e.key.toLowerCase() === "n") {
    console.log("🧪 FORCE NEXT TRACK");

    finishing = false;
    stopHeartbeat();
    clearMonitor();

    publishBroadcast({
      status: "transition",
      url: null,
      startedAt: null
    });

    setTimeout(() => {
      next();
    }, 300);
  }
});
