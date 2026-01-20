/* ============================================================
   RESONANT · PUBLIC METRICS VIEW — V5.0 WORLD CLASS
   RADIO-GRADE · READ-ONLY · SAFE LOOP · FREEZE-READY
============================================================ */

import {
  loadSessions,
  isIntentional,
  getSnapshot,
  getLiveStatus,
  formatDuration,
  getSessionLabel
} from "../Core/metrics-core.js";

/* ------------------------------------------------------------
   STATE
------------------------------------------------------------ */

let lastSnapshotHash = null;
let renderTimer = null;

/* ------------------------------------------------------------
   BOOT
------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", boot);

function boot() {
  safeRender();
  renderTimer = setInterval(safeRender, 5000); // radio-grade refresh
}

/* ------------------------------------------------------------
   SAFE RENDER LOOP
------------------------------------------------------------ */

function safeRender() {
  try {
    renderLiveStatus();

    if (getLiveStatus() !== "live") {
      showOffAir();
      return;
    }

    const snapshot = getSnapshot();
    const hash = stableHash(snapshot);

    if (hash === lastSnapshotHash) return;
    lastSnapshotHash = hash;

    renderMetrics(snapshot);

  } catch (err) {
    console.warn("[PublicMetrics] render skipped:", err);
  }
}

/* ------------------------------------------------------------
   LIVE STATUS
------------------------------------------------------------ */

function renderLiveStatus() {
  const el = document.getElementById("metrics-status");
  if (!el) return;

  const status = getLiveStatus();
  el.classList.toggle("off", status !== "live");

  const label = el.querySelector("span:last-child");
  if (label) label.textContent = status === "live" ? "LIVE" : "OFF AIR";
}

function showOffAir() {
  toggle("metrics-empty", true);
  toggle("metrics-timeline", false);
}

/* ------------------------------------------------------------
   METRICS RENDER
------------------------------------------------------------ */

function renderMetrics(snapshot) {
  const sessions = loadSessions().filter(isIntentional);

  if (!sessions.length) {
    showEmptyState();
    return;
  }

  hideEmptyState();

  setText("metric-new-artists", snapshot.newArtistExposure ?? "—");
  setText("metric-active", snapshot.activeListeners ?? "—");

  setText(
    "metric-average",
    snapshot.averageListeningMs
      ? formatDuration(snapshot.averageListeningMs)
      : "—"
  );

  setText(
    "metric-completion",
    snapshot.completionRate != null
      ? `${Math.round(snapshot.completionRate * 100)}%`
      : "—"
  );

  setText(
    "metric-longest",
    snapshot.longestListeningStreakMs
      ? formatDuration(snapshot.longestListeningStreakMs)
      : "—"
  );

  setText(
    "metric-total-time",
    snapshot.totalListeningMs
      ? formatDuration(snapshot.totalListeningMs)
      : "—"
  );

  setText("metric-peak", snapshot.peak ?? "—");

  setText(
    "metric-timeband",
    snapshot.timeOfDayResonance
      ? capitalize(snapshot.timeOfDayResonance)
      : "—"
  );

  renderTimeline(sessions);
  renderSince(sessions);
  renderInsight(sessions);
}

/* ------------------------------------------------------------
   TIMELINE
------------------------------------------------------------ */

function renderTimeline(sessions) {
  const ul = document.getElementById("metrics-timeline");
  if (!ul) return;

  ul.innerHTML = "";

  sessions
    .filter(s => typeof s.startedAt === "number")
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 8)
    .forEach(s => {
      const li = document.createElement("li");
      li.className = "timeline-item";
      li.innerHTML = `
        <span class="time">${getSessionLabel(s.startedAt)}</span>
        <span class="detail">${formatDuration(s.listenedMs)}</span>
      `;
      ul.appendChild(li);
    });
}

/* ------------------------------------------------------------
   SINCE
------------------------------------------------------------ */

function renderSince(sessions) {
  const el = document.getElementById("metrics-since");
  if (!el) return;

  const first = sessions.reduce(
    (min, s) =>
      typeof s.startedAt === "number"
        ? Math.min(min, s.startedAt)
        : min,
    Infinity
  );

  el.textContent =
    first !== Infinity
      ? new Date(first).toLocaleDateString()
      : "—";
}

/* ------------------------------------------------------------
   INSIGHT
------------------------------------------------------------ */

function renderInsight(sessions) {
  const el = document.getElementById("metrics-insight");
  if (!el) return;

  const avgMs =
    sessions.reduce((sum, s) => sum + (s.listenedMs || 0), 0) /
    sessions.length;

  el.textContent =
    avgMs >= 15 * 60 * 1000
      ? "Listeners stayed connected for meaningful sessions."
      : "Listening sessions reflect intentional presence.";
}

/* ------------------------------------------------------------
   UI HELPERS
------------------------------------------------------------ */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showEmptyState() {
  toggle("metrics-empty", true);
  toggle("metrics-timeline", false);
}

function hideEmptyState() {
  toggle("metrics-empty", false);
  toggle("metrics-timeline", true);
}

function toggle(id, show) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("hidden", !show);
}

/* ------------------------------------------------------------
   UTILITIES
------------------------------------------------------------ */

function capitalize(str = "") {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function stableHash(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}
