/* ============================================================
   RESONANT · SPONSOR METRICS CORE — v1.2 (FROZEN)
   Pure · Aggregated · Pitch-safe · Sponsor-ready · Backend-ready
============================================================ */
/*
  Philosophy
  ----------
  Sponsors don't buy listeners.
  Sponsors buy attention, depth and consistency.

  CONTRACT
  --------
  • All metrics are session-aggregated
  • No personal data, no identifiers
  • Snapshot fields are semver-stable
  • Any breaking change requires a MAJOR version bump
*/

/* ------------------------------------------------------------
   DEPENDENCIES
------------------------------------------------------------ */

import {
  loadSessions,
  isIntentional,
  computePeak
} from "./metrics-core.js";

/* ------------------------------------------------------------
   CONSTANTS (SEMANTIC)
------------------------------------------------------------ */

// ≥ 15 minutes = meaningful attention
const RETAIN_MS = 15 * 60_000;

// Retention benchmarks (soft, narrative-level)
const HIGH_RETENTION = 0.6;
const MED_RETENTION  = 0.35;

// Average listening depth (minutes)
const HIGH_AVG_MIN = 30;
const MED_AVG_MIN  = 15;

/* ------------------------------------------------------------
   HELPERS (PURE)
------------------------------------------------------------ */

function clamp01(n = 0) {
  return Math.max(0, Math.min(1, n));
}

function msToMinutes(ms = 0) {
  return ms / 60_000;
}

function classify(value, high, medium) {
  if (value >= high) return "high";
  if (value >= medium) return "medium";
  return "low";
}

/* ------------------------------------------------------------
   CORE SUMMARY (FACTUAL + INTERPRETED)
------------------------------------------------------------ */

function getSponsorSummary() {
  const sessions = loadSessions().filter(isIntentional);
  const totalSessions = sessions.length;

  if (!totalSessions) {
    return {
      totalSessions: 0,
      peakListeners: 0,
      totalListeningMs: 0,
      averageListeningMs: 0,
      averageListeningMinutes: 0,
      retentionRate: 0,
      audienceQuality: "low",
      listeningDepth: "low"
    };
  }

  const totalListeningMs = sessions.reduce(
    (sum, s) => sum + (s.listenedMs || 0),
    0
  );

  const averageListeningMs = totalListeningMs / totalSessions;
  const averageListeningMinutes = msToMinutes(averageListeningMs);

  const retainedSessions = sessions.filter(
    s => (s.listenedMs || 0) >= RETAIN_MS
  ).length;

  const retentionRate = retainedSessions / totalSessions;
  const peakListeners = computePeak(sessions);

  return {
    // Raw (auditable)
    totalSessions,
    peakListeners,
    totalListeningMs,
    averageListeningMs,
    averageListeningMinutes,
    retentionRate,

    // Interpreted (business language)
    audienceQuality: classify(retentionRate, HIGH_RETENTION, MED_RETENTION),
    listeningDepth: classify(
      averageListeningMinutes,
      HIGH_AVG_MIN,
      MED_AVG_MIN
    )
  };
}

/* ------------------------------------------------------------
   SCORE LAYER (0–1 · DASHBOARD & PITCH)
------------------------------------------------------------ */

function getSponsorScores(summary) {
  if (!summary || !summary.totalSessions) {
    return {
      retentionScore: 0,
      depthScore: 0,
      peakScore: 0
    };
  }

  return {
    retentionScore: clamp01(summary.retentionRate),
    depthScore: clamp01(summary.averageListeningMinutes / 60),
    peakScore: clamp01(
      summary.peakListeners / summary.totalSessions
    )
  };
}

/* ------------------------------------------------------------
   SNAPSHOT (PUBLIC · SELLABLE · STABLE)
------------------------------------------------------------ */

function getSponsorSnapshot() {
  const summary = getSponsorSummary();
  const scores = getSponsorScores(summary);

  const snapshot = {
    summary,
    scores,

    // Unified signal (weighted)
    signalStrength:
      scores.retentionScore * 0.4 +
      scores.depthScore     * 0.4 +
      scores.peakScore      * 0.2
  };

  return Object.freeze(snapshot);
}

/* ------------------------------------------------------------
   SAFE EXPORT
------------------------------------------------------------ */

export {
  getSponsorSummary,
  getSponsorSnapshot
};
