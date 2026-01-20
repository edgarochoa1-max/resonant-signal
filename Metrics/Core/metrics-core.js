/* ============================================================
   RESONANT · METRICS CORE — v5.0 (FROZEN)
   Public · Read-only · Ethical · Pitch-safe · Local-first
============================================================ */
/*
  Metrics Philosophy
  ------------------
  Resonant measures presence, not clicks.
  Metrics are derived only from intentional listening.
  No personal data. No fingerprinting. No tracking.

  CONTRACT
  --------
  • Snapshot shape is semver-stable
  • Any breaking change requires MAJOR version bump
  • Safe for dashboards, exports, sponsors & backend ingestion
*/

/* ------------------------------------------------------------
   STORAGE KEYS (LOCAL SOURCE)
------------------------------------------------------------ */

const SESSIONS_KEY  = "resonant_sessions_v2";
const BROADCAST_KEY = "resonant_broadcast_state_v2";

/* ------------------------------------------------------------
   THRESHOLDS & WINDOWS
------------------------------------------------------------ */

const ACTIVE_WINDOW_MS   = 20_000; // listener considered active
const MIN_ACTIVE_MS      = 15_000; // intentional listening threshold
const LIVE_FRESHNESS_MS  = 10_000; // broadcast freshness window

/* ------------------------------------------------------------
   SESSION CONTRACT (INTERNAL · NORMALIZED)
------------------------------------------------------------ */
/*
  A session is considered valid if:
  • listenedMs >= MIN_ACTIVE_MS
  • startedAt exists
*/

function normalizeSession(raw = {}) {
  const startedAt   = Number(raw.startedAt) || null;
  const endedAt     = Number(raw.endedAt) || null;
  const lastSeenAt  = Number(raw.lastSeenAt) || endedAt || null;
  const listenedMs  = Math.max(0, Number(raw.listenedMs) || 0);
  const durationMs  = Number(raw.durationMs) || null;
  const artistId    = raw.artistId || raw.artist || null;

  return {
    startedAt,
    endedAt,
    lastSeenAt,
    listenedMs,
    durationMs,
    artistId
  };
}

/* ------------------------------------------------------------
   LOADERS (SAFE · LOCAL)
------------------------------------------------------------ */

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const data = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return [];
    return data.map(normalizeSession);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------
   SESSION QUALIFIERS
------------------------------------------------------------ */

function isIntentional(session) {
  return (
    typeof session.listenedMs === "number" &&
    session.listenedMs >= MIN_ACTIVE_MS &&
    typeof session.startedAt === "number"
  );
}

/* ------------------------------------------------------------
   BROADCAST STATE (SOURCE-AGNOSTIC)
------------------------------------------------------------ */

function getLiveStatus(source = localStorage) {
  try {
    const raw = source.getItem(BROADCAST_KEY);
    if (!raw) return "off";

    const b = JSON.parse(raw);
    const now = Date.now();

    if (
      b?.status === "live" &&
      typeof b.updatedAt === "number" &&
      now - b.updatedAt <= LIVE_FRESHNESS_MS
    ) {
      return "live";
    }
  } catch {}

  return "off";
}

/* ------------------------------------------------------------
   SNAPSHOT — AGGREGATED · STABLE · SELLABLE
------------------------------------------------------------ */

function getSnapshot() {
  const now = Date.now();

  const sessions = loadSessions().filter(isIntentional);

  const activeSessions = sessions.filter(s => {
    const ref = s.lastSeenAt || s.endedAt || s.startedAt;
    return ref ? now - ref <= ACTIVE_WINDOW_MS : false;
  });

  const totalListeningMs = sessions.reduce(
    (sum, s) => sum + s.listenedMs,
    0
  );

  const averageListeningMs =
    sessions.length > 0
      ? totalListeningMs / sessions.length
      : 0;

  const snapshot = {
    /* Volume */
    totalSessions: sessions.length,
    activeListeners: activeSessions.length,

    /* Time */
    totalListeningMs,
    averageListeningMs,
    longestListeningStreakMs: computeLongestStreak(sessions),

    /* Collective behavior */
    peakConcurrentListeners: computePeak(sessions),
    completionRate: computeCompletionRate(sessions),
    timeOfDayResonance: computeTimeBand(sessions),

    /* Cultural signal */
    newArtistExposure: computeNewArtistExposure(sessions),

    /* State */
    liveStatus: getLiveStatus()
  };

  return Object.freeze(snapshot);
}

/* ------------------------------------------------------------
   COMPUTATIONS (PURE · DEFENSIVE)
------------------------------------------------------------ */

function computePeak(sessions = []) {
  const events = [];

  sessions.forEach(s => {
    if (!s.startedAt) return;

    const end =
      s.endedAt ||
      s.lastSeenAt ||
      (s.startedAt + s.listenedMs);

    if (!end || end <= s.startedAt) return;

    events.push({ t: s.startedAt, d: 1 });
    events.push({ t: end, d: -1 });
  });

  events.sort((a, b) => a.t - b.t);

  let current = 0;
  let peak = 0;

  for (const e of events) {
    current += e.d;
    if (current > peak) peak = current;
  }

  return peak;
}

function computeNewArtistExposure(sessions = []) {
  const seen = new Set();
  let count = 0;

  sessions.forEach(s => {
    if (!s.artistId) return;
    if (!seen.has(s.artistId)) {
      seen.add(s.artistId);
      count++;
    }
  });

  return count;
}

function computeCompletionRate(sessions = []) {
  if (!sessions.length) return 0;

  let sum = 0;

  sessions.forEach(s => {
    if (!s.durationMs || s.durationMs <= 0) {
      sum += 1;
    } else {
      sum += Math.min(1, s.listenedMs / s.durationMs);
    }
  });

  return sum / sessions.length;
}

function computeLongestStreak(sessions = []) {
  let max = 0;
  sessions.forEach(s => {
    if (s.listenedMs > max) max = s.listenedMs;
  });
  return max;
}

function computeTimeBand(sessions = []) {
  const bands = {
    early: 0, // 05–11
    day:   0, // 12–17
    night: 0, // 18–22
    late:  0  // 23–04
  };

  sessions.forEach(s => {
    if (!s.startedAt) return;
    const h = new Date(s.startedAt).getHours();
    if (h >= 5 && h < 12) bands.early++;
    else if (h < 18) bands.day++;
    else if (h < 23) bands.night++;
    else bands.late++;
  });

  return Object.entries(bands)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/* ------------------------------------------------------------
   FORMAT HELPERS (PURE · UI-SAFE)
------------------------------------------------------------ */

function formatDuration(ms = 0) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

function getSessionLabel(ts) {
  if (!ts) return "Listening session";

  const d = new Date(ts);
  const h = d.getHours();

  const moment =
    h >= 5 && h < 12 ? "Early session" :
    h < 18 ? "Daytime session" :
    h < 23 ? "Night session" :
    "Late session";

  return `${moment} · ${d.toLocaleDateString()}`;
}

/* ------------------------------------------------------------
   SAFE EXPORT (ES MODULE)
------------------------------------------------------------ */

export {
  // loaders
  loadSessions,

  // qualifiers
  isIntentional,

  // snapshot & state
  getSnapshot,
  getLiveStatus,

  // computations
  computePeak,
  computeNewArtistExposure,
  computeCompletionRate,
  computeLongestStreak,
  computeTimeBand,

  // format
  formatDuration,
  getSessionLabel
};
