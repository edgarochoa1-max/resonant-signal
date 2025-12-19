/* ============================================================
   RESONANT · METRICS ENGINE — V2.2 FINAL (COMPILED)
   Read-only · Ethical · Pitch-safe · Context-aware
============================================================ */

const SESSIONS_KEY = "resonant_sessions_v2";
const BROADCAST_KEY = "resonant_broadcast_state_v2";

const ACTIVE_WINDOW = 5 * 60 * 1000; // 5 minutes
const MIN_ACTIVE_MS = 15000;         // 15s threshold
const LIVE_FRESHNESS = 10000;        // 10s heartbeat window

/* ------------------------------------------------------------
   INIT
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  renderMetrics();
  renderLiveStatus();
  setInterval(renderLiveStatus, 3000); // keep pill honest
});

/* ------------------------------------------------------------
   CORE
------------------------------------------------------------ */
function renderMetrics() {
  const sessions = loadSessions();

  if (!sessions.length) {
    showEmptyState();
    return;
  }

  hideEmptyState();

  renderTotals(sessions);
  renderActive(sessions);
  renderAverage(sessions);
  renderPeak(sessions);
  renderTimeline(sessions);
  renderSince(sessions);
}

/* ------------------------------------------------------------
   LOAD
------------------------------------------------------------ */
function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------
   METRICS
------------------------------------------------------------ */
function renderTotals(sessions) {
  setText("metric-sessions", sessions.length);
}

function renderActive(sessions) {
  const now = Date.now();

  const active = sessions.filter(s => {
    const end = s.endedAt || now;
    return (
      now - end <= ACTIVE_WINDOW &&
      s.listenedMs >= MIN_ACTIVE_MS
    );
  }).length;

  setText("metric-active", active);
}

function renderAverage(sessions) {
  const closed = sessions.filter(
    s => s.endedAt && s.listenedMs > 0
  );

  if (!closed.length) {
    setText("metric-average", "—");
    return;
  }

  const totalMs = closed.reduce((sum, s) => sum + s.listenedMs, 0);
  setText("metric-average", formatDuration(totalMs / closed.length));
}

function renderPeak(sessions) {
  const events = [];

  sessions.forEach(s => {
    if (!s.startedAt) return;

    const end =
      s.endedAt ||
      (s.startedAt + (s.listenedMs || 0));

    events.push({ t: s.startedAt, d: +1 });
    events.push({ t: end, d: -1 });
  });

  events.sort((a, b) => a.t - b.t);

  let current = 0;
  let peak = 0;

  events.forEach(e => {
    current += e.d;
    if (current > peak) peak = current;
  });

  setText("metric-peak", peak);
}

/* ------------------------------------------------------------
   TIMELINE
------------------------------------------------------------ */
function renderTimeline(sessions) {
  const ul = document.getElementById("metrics-timeline");
  if (!ul) return;

  ul.innerHTML = "";

  sessions
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, 8)
    .forEach(s => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="time">${formatDate(s.startedAt)}</span>
        <span class="detail">${formatDuration(s.listenedMs)}</span>
      `;
      ul.appendChild(li);
    });
}

/* ------------------------------------------------------------
   RANGE
------------------------------------------------------------ */
function renderSince(sessions) {
  const first = sessions.reduce(
    (min, s) => Math.min(min, s.startedAt || Infinity),
    Infinity
  );

  if (first !== Infinity) {
    setText("metrics-since", new Date(first).toLocaleDateString());
  }
}

/* ------------------------------------------------------------
   LIVE STATUS (EDITORIAL · HEARTBEAT-BASED)
------------------------------------------------------------ */
function renderLiveStatus() {
  try {
    const raw = localStorage.getItem(BROADCAST_KEY);
    const el = document.getElementById("metrics-status");
    if (!raw || !el) return;

    const b = JSON.parse(raw);
    const now = Date.now();

    const isLive =
      b.status === "live" &&
      b.updatedAt &&
      now - b.updatedAt < LIVE_FRESHNESS;

    el.classList.toggle("off", !isLive);
    el.querySelector("span:last-child").textContent =
      isLive ? "LIVE" : "OFF AIR";
  } catch {}
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
   FORMAT
------------------------------------------------------------ */
function formatDuration(ms = 0) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}
