/* ============================================================
   RESONANT · ARTIST METRICS VIEW — V2.0 WORLD CLASS
   View-only · Read-only · Radio-safe · Freeze-ready
============================================================ */

import {
  getTopArtists,
  getArtistSummary,
  getArtistTimeline
} from "../Core/artist-core.js";

import {
  formatDuration,
  getSessionLabel
} from "../Core/metrics-core.js";

/* ------------------------------------------------------------
   STATE
------------------------------------------------------------ */

let currentArtistId = null;

/* ------------------------------------------------------------
   BOOT
------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", boot);

function boot() {
  bindBackButton();
  routeFromURL();
}

/* ------------------------------------------------------------
   ROUTING
------------------------------------------------------------ */

function routeFromURL() {
  const params = new URLSearchParams(window.location.search);
  const artist = params.get("artist");

  if (artist) {
    openArtistProfile(artist);
  } else {
    renderArtistTable();
    showOverview();
  }
}

/* ------------------------------------------------------------
   OVERVIEW TABLE
------------------------------------------------------------ */

function renderArtistTable() {
  const tbody = document.getElementById("artist-table-body");
  if (!tbody) return;

  const artists = getTopArtists(20);
  tbody.innerHTML = "";

  if (!artists.length) {
    renderEmpty(tbody, "No artist data yet.");
    return;
  }

  artists.forEach(artist => {
    const tr = document.createElement("tr");
    tr.className = "artist-row";
    tr.setAttribute("tabindex", "0");
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", `View metrics for ${artist.artistId}`);

    tr.innerHTML = `
      <td class="artist-name">${artist.artistId}</td>
      <td class="artist-sessions">${artist.sessions}</td>
      <td class="artist-time">${formatDuration(
        artist.totalListeningMs
      )}</td>
    `;

    tr.addEventListener("click", () =>
      openArtistProfile(artist.artistId)
    );

    tr.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        openArtistProfile(artist.artistId);
      }
    });

    tbody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   ARTIST PROFILE
------------------------------------------------------------ */

function openArtistProfile(artistId) {
  currentArtistId = artistId;

  const summary = getArtistSummary(artistId);
  if (!summary) {
    renderProfileEmpty();
    return;
  }

  updateProfileSummary(summary);
  renderArtistTimeline(artistId);
  showProfile();
  syncURL(artistId);
}

function updateProfileSummary(summary) {
  setText("artist-profile-name", summary.artistId);
  setText("artist-profile-sessions", summary.totalSessions);
  setText(
    "artist-profile-total",
    formatDuration(summary.totalListeningMs)
  );
  setText(
    "artist-profile-average",
    formatDuration(summary.averageListeningMs)
  );
  setText(
    "artist-profile-completion",
    summary.completionRate != null
      ? `${Math.round(summary.completionRate * 100)}%`
      : "—"
  );
  setText(
    "artist-profile-longest",
    summary.longestListeningStreakMs
      ? formatDuration(summary.longestListeningStreakMs)
      : "—"
  );
  setText(
    "artist-profile-timeband",
    summary.timeOfDayResonance
      ? capitalize(summary.timeOfDayResonance)
      : "—"
  );
}

/* ------------------------------------------------------------
   TIMELINE
------------------------------------------------------------ */

function renderArtistTimeline(artistId) {
  const ul = document.getElementById("artist-timeline");
  if (!ul) return;

  ul.innerHTML = "";

  const sessions = getArtistTimeline(artistId, 10);

  if (!sessions.length) {
    renderEmpty(ul, "No sessions for this artist.");
    return;
  }

  sessions.forEach(session => {
    const li = document.createElement("li");
    li.className = "timeline-item";

    li.innerHTML = `
      <span class="time">${getSessionLabel(
        session.startedAt
      )}</span>
      <span class="detail">${formatDuration(
        session.listenedMs
      )}</span>
    `;

    ul.appendChild(li);
  });
}

/* ------------------------------------------------------------
   NAV / UI
------------------------------------------------------------ */

function bindBackButton() {
  const btn = document.getElementById("artist-back-btn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    clearURL();
    showOverview();
  });
}

function showProfile() {
  toggle("artist-profile", true);
  toggle("artist-overview", false);
}

function showOverview() {
  toggle("artist-profile", false);
  toggle("artist-overview", true);
}

/* ------------------------------------------------------------
   EMPTY STATES
------------------------------------------------------------ */

function renderProfileEmpty() {
  setText("artist-profile-name", "Unknown artist");
  setText("artist-profile-sessions", "—");
  setText("artist-profile-total", "—");
  setText("artist-profile-average", "—");
  setText("artist-profile-completion", "—");
  setText("artist-profile-longest", "—");
  setText("artist-profile-timeband", "—");

  const ul = document.getElementById("artist-timeline");
  if (ul) renderEmpty(ul, "No data available.");
}

/* ------------------------------------------------------------
   HELPERS
------------------------------------------------------------ */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function toggle(id, show) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("hidden", !show);
}

function renderEmpty(container, msg) {
  const el = document.createElement("div");
  el.className = "empty-state";
  el.textContent = msg;
  container.appendChild(el);
}

function capitalize(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ------------------------------------------------------------
   URL SYNC (NON-DESTRUCTIVE)
------------------------------------------------------------ */

function syncURL(artistId) {
  const url = new URL(window.location.href);
  url.searchParams.set("artist", artistId);
  window.history.replaceState({}, "", url);
}

function clearURL() {
  const url = new URL(window.location.href);
  url.searchParams.delete("artist");
  window.history.replaceState({}, "", url);
}
