/* ============================================================
   RESONANT · METRICS ENGINE — V3.1 FINAL (PRESENCE CORE)
   Read-only · Ethical · Pitch-safe · Context-aware
============================================================ */
/*
  Metrics Philosophy:
  Resonant measures presence, not clicks.
  Sessions are counted only after intentional listening.
  No personal data is collected or tracked.
*/

const SESSIONS_KEY = "resonant_sessions_v2";
const BROADCAST_KEY = "resonant_broadcast_state_v2";

const ACTIVE_WINDOW = 20 * 1000; // 20s → presencia real
const MIN_ACTIVE_MS = 15000;
const LIVE_FRESHNESS = 10000;

/* ------------------------------------------------------------
   PUBLIC API
------------------------------------------------------------ */

function renderMetrics() {
  const sessions = loadSessions();

if (!sessions.some(isIntentional)) {
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

function renderLiveStatus() {
  try {
    const raw = localStorage.getItem(BROADCAST_KEY);
    const el = document.getElementById("metrics-status");
    if (!raw || !el) return;

    const b = JSON.parse(raw);
    const now = Date.now();

    const isLive =
      b.status === "live" &&
      typeof b.updatedAt === "number" &&
      now - b.updatedAt < LIVE_FRESHNESS;

    el.classList.toggle("off", !isLive);
    el.querySelector("span:last-child").textContent =
      isLive ? "LIVE" : "OFF AIR";
  } catch {}
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
   SOURCE HELPERS
------------------------------------------------------------ */

function isIntentional(s) {
  return typeof s.listenedMs === "number" && s.listenedMs >= MIN_ACTIVE_MS;
}

function isBroadcast(s) {
  return s.source === "broadcast";
}

function isAutoDJ(s) {
  return s.source === "autodj";
}

/* ------------------------------------------------------------
   METRICS
------------------------------------------------------------ */

function renderActive(sessions) {
  const now = Date.now();

  const active = sessions.filter(s => {
    if (!isIntentional(s)) return false;

    // sesión aún abierta
    if (!s.endedAt) return true;

    // terminó recientemente
    return now - s.endedAt <= ACTIVE_WINDOW;
  });

  setText(
    "metric-active",
    active.length ? active.length : "—"
  );
}

function renderAverage(sessions) {
  const intentional = sessions.filter(
    s => s.endedAt && isIntentional(s)
  );

  if (!intentional.length) {
    setText("metric-average", "—");
    return;
  }

  const totalMs = intentional.reduce(
    (sum, s) => sum + s.listenedMs,
    0
  );

  setText(
    "metric-average",
    formatDuration(totalMs / intentional.length)
  );
}

function renderPeak(sessions) {
  const events = [];

  sessions.forEach(s => {
    if (!s.startedAt || !isIntentional(s)) return;
    const end = s.endedAt || (s.startedAt + s.listenedMs);
    events.push({ t: s.startedAt, d: 1 });
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
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
    .filter(s => isIntentional(s) && s.startedAt)
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
    (min, s) =>
      typeof s.startedAt === "number"
        ? Math.min(min, s.startedAt)
        : min,
    Infinity
  );

  if (first !== Infinity) {
    setText(
      "metrics-since",
      new Date(first).toLocaleDateString()
    );
  }
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

/* ------------------------------------------------------------
   INTERNAL BREAKDOWN (NOT DISPLAYED)
------------------------------------------------------------ */

function getPresenceBreakdown(sessions) {
  const intentional = sessions.filter(isIntentional);
  return {
    total: intentional.length,
    broadcast: intentional.filter(isBroadcast).length,
    autodj: intentional.filter(isAutoDJ).length
  };
}

/* ------------------------------------------------------------
   SAFE PUBLIC EXPORT
------------------------------------------------------------ */

window.ResonantMetrics = {
  renderMetrics,
  renderLiveStatus
};
