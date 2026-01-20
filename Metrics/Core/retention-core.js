/* ============================================================
   RESONANT · RETENTION METRICS CORE — v1.1 (FROZEN)
   Pure · Read-only · Pitch-safe · Backend-ready
============================================================ */
/*
  Retention Philosophy
  --------------------
  Retention measures depth, not return frequency.
  A retained session reflects sustained presence over time.
  No user identity. No cohorts. No tracking.

  CONTRACT
  --------
  • Retention is session-based, not user-based
  • Buckets are time-based and semver-stable
  • Snapshot shape is safe for sponsors & decks
*/

/* ------------------------------------------------------------
   DEPENDENCIES
------------------------------------------------------------ */

import {
  loadSessions,
  isIntentional
} from "./metrics-core.js";

/* ------------------------------------------------------------
   CONSTANTS (SEMANTIC)
------------------------------------------------------------ */

const MS_5_MIN  = 5  * 60_000;
const MS_15_MIN = 15 * 60_000;

/*
  Retention Buckets
  -----------------
  These buckets define listening depth.
  Changing them requires a MAJOR version bump.
*/
const RETENTION_BUCKETS = Object.freeze([
  { label: "0–5m",   min: 0,        max: MS_5_MIN },
  { label: "5–15m",  min: MS_5_MIN, max: MS_15_MIN },
  { label: "15m+",   min: MS_15_MIN, max: Infinity }
]);

/* ------------------------------------------------------------
   CORE LOGIC (PURE)
------------------------------------------------------------ */

function getRetentionBuckets() {
  const sessions = loadSessions().filter(isIntentional);

  const counts = RETENTION_BUCKETS.map(b => ({
    label: b.label,
    count: 0
  }));

  sessions.forEach(s => {
    const ms = s.listenedMs || 0;

    const bucket = RETENTION_BUCKETS.find(
      b => ms >= b.min && ms < b.max
    );

    if (!bucket) return;

    const target = counts.find(c => c.label === bucket.label);
    if (target) target.count++;
  });

  return counts;
}

function getRetentionSummary() {
  const sessions = loadSessions().filter(isIntentional);

  const totalSessions = sessions.length;

  const retainedSessions = sessions.filter(
    s => s.listenedMs >= MS_15_MIN
  ).length;

  const retentionRate =
    totalSessions > 0
      ? retainedSessions / totalSessions
      : 0;

  return {
    totalSessions,
    retainedSessions,
    retentionRate
  };
}

/* ------------------------------------------------------------
   SNAPSHOT (STABLE · SELLABLE)
------------------------------------------------------------ */

function getRetentionSnapshot() {
  const snapshot = {
    summary: getRetentionSummary(),
    buckets: getRetentionBuckets()
  };

  return Object.freeze(snapshot);
}

/* ------------------------------------------------------------
   SAFE EXPORT
------------------------------------------------------------ */

export {
  getRetentionBuckets,
  getRetentionSummary,
  getRetentionSnapshot
};
