/* ============================================================
   RESONANT · SPONSOR METRICS SCHEMA — v1.0
   Data Contract · Pitch-safe · Read-only · Stable
============================================================ */

/*
  PURPOSE
  -------
  • Define sponsor-facing metrics contract
  • Used in:
      - Sponsor dashboards
      - Pitch decks
      - CSV / JSON exports
      - White-label / B2B APIs
  • Aggregated only
  • No personal identifiers
  • Business-readable language
*/

/* ------------------------------------------------------------
   TYPE DEFINITIONS (DOCUMENTATION)
------------------------------------------------------------ */

/**
 * SponsorSummary
 * High-level audience quality indicators
 *
 * @property {number} totalSessions
 * @property {number} peakListeners
 * @property {number} totalListeningMs
 * @property {number} averageListeningMs
 * @property {number} averageListeningMinutes
 * @property {number} retentionRate            // 0–1
 *
 * @property {"low"|"medium"|"high"} audienceQuality
 * @property {"low"|"medium"|"high"} listeningDepth
 */

/**
 * SponsorScores
 * Normalized scores (0–1) for dashboards & weighting
 *
 * @property {number} retentionScore
 * @property {number} depthScore
 * @property {number} peakScore
 */

/**
 * SponsorSnapshot
 * Complete sponsor-facing data package
 *
 * @property {SponsorSummary} summary
 * @property {SponsorScores} scores
 * @property {number} signalStrength          // 0–1
 */

/* ------------------------------------------------------------
   RUNTIME GUARDS (LIGHTWEIGHT)
------------------------------------------------------------ */

function isSponsorSummary(obj) {
  return (
    obj &&
    typeof obj.totalSessions === "number" &&
    typeof obj.peakListeners === "number" &&
    typeof obj.totalListeningMs === "number" &&
    typeof obj.averageListeningMs === "number" &&
    typeof obj.averageListeningMinutes === "number" &&
    typeof obj.retentionRate === "number" &&
    ["low", "medium", "high"].includes(obj.audienceQuality) &&
    ["low", "medium", "high"].includes(obj.listeningDepth)
  );
}

function isSponsorScores(obj) {
  return (
    obj &&
    typeof obj.retentionScore === "number" &&
    typeof obj.depthScore === "number" &&
    typeof obj.peakScore === "number"
  );
}

function isSponsorSnapshot(obj) {
  return (
    obj &&
    isSponsorSummary(obj.summary) &&
    isSponsorScores(obj.scores) &&
    typeof obj.signalStrength === "number"
  );
}

/* ------------------------------------------------------------
   SAFE EXPORT
------------------------------------------------------------ */

export {
  isSponsorSummary,
  isSponsorScores,
  isSponsorSnapshot
};
