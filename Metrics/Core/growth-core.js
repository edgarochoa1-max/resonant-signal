/* ============================================================
   RESONANT · GROWTH METRICS CORE — v1.2
   Pure · Read-only · Pitch-safe · Backend-ready
============================================================ */

/*
  Philosophy:
  Growth is measured by return, not reach.
  Momentum reflects consistency, not spikes.
*/

import {
  loadSessions,
  isIntentional
} from "./metrics-core.js";

/* ------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------ */

const MOMENTUM_DEADZONE = 1; // sessions
const GROWTH_CLAMP = 3;     // ±300%

/* ------------------------------------------------------------
   HELPERS
------------------------------------------------------------ */

/**
 * Stable UTC day key (YYYY-MM-DD)
 */
function getDayKeyUTC(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/**
 * Intentional sessions grouped by day
 */
function getIntentionalSessionsByDay() {
  const sessions = loadSessions().filter(
    s => isIntentional(s) && typeof s.startedAt === "number"
  );

  const map = new Map();

  sessions.forEach(s => {
    const key = getDayKeyUTC(s.startedAt);
    map.set(key, (map.get(key) || 0) + 1);
  });

  return Array.from(map.entries())
    .map(([day, sessions]) => ({ day, sessions }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/* ------------------------------------------------------------
   PUBLIC API
------------------------------------------------------------ */

/**
 * Sessions grouped by day
 */
function getSessionsByDay() {
  return getIntentionalSessionsByDay();
}

/**
 * Growth rate between first and last day (clamped)
 */
function getGrowthRate() {
  const days = getIntentionalSessionsByDay();
  if (days.length < 2) return 0;

  const first = days[0].sessions;
  const last  = days[days.length - 1].sessions;

  if (first === 0) return 0;

  const raw = (last - first) / first;

  // Clamp for pitch safety
  return Math.max(
    -GROWTH_CLAMP,
    Math.min(GROWTH_CLAMP, raw)
  );
}

/**
 * Average sessions per active day
 */
function getAverageDailySessions() {
  const days = getIntentionalSessionsByDay();
  if (!days.length) return 0;

  const total = days.reduce((sum, d) => sum + d.sessions, 0);
  return total / days.length;
}

/**
 * Momentum indicator
 * Returns: up | down | flat
 */
function getMomentum() {
  const days = getIntentionalSessionsByDay();
  if (days.length < 3) return "flat";

  const [a, b, c] = days.slice(-3).map(d => d.sessions);

  const delta = (c - b) + (b - a);

  if (Math.abs(delta) <= MOMENTUM_DEADZONE) return "flat";
  return delta > 0 ? "up" : "down";
}

/**
 * Unified growth snapshot (pitch-ready)
 */
function getGrowthSnapshot() {
  return {
    sessionsByDay: getSessionsByDay(),
    growthRate: getGrowthRate(),
    averageDailySessions: getAverageDailySessions(),
    momentum: getMomentum()
  };
}

/* ------------------------------------------------------------
   SAFE EXPORT
------------------------------------------------------------ */

export {
  getSessionsByDay,
  getGrowthRate,
  getAverageDailySessions,
  getMomentum,
  getGrowthSnapshot
};
