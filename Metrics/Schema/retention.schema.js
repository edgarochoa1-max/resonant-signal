/* ============================================================
   RESONANT · RETENTION METRICS SCHEMA — v1.0
   Data Contract · Read-only · Pitch-safe · Stable
============================================================ */

/*
  PURPOSE
  -------
  • Define the retention metrics data contract
  • Used by:
      - Retention dashboards
      - Sponsor decks
      - CSV / JSON exports
      - Future analytics API
  • Aggregated only
  • No personal or session identifiers
*/

/* ------------------------------------------------------------
   TYPE DEFINITIONS (DOCUMENTATION)
------------------------------------------------------------ */

/**
 * RetentionBucket
 * Distribution of listening depth
 *
 * @property {string} label        // e.g. "0–5m", "5–15m", "15m+"
 * @property {number} count
 */

/**
 * RetentionSummary
 * High-level retention indicators
 *
 * @property {number} totalSessions
 * @property {number} retainedSessions     // ≥ threshold (e.g. 15m)
 * @property {number} retentionRate         // 0–1
 */

/**
 * RetentionSnapshot
 * Complete retention view
 *
 * @property {RetentionSummary} summary
 * @property {RetentionBucket[]} buckets
 */

/* ------------------------------------------------------------
   RUNTIME GUARDS (LIGHTWEIGHT)
------------------------------------------------------------ */

function isRetentionBucket(obj) {
  return (
    obj &&
    typeof obj.label === "string" &&
    typeof obj.count === "number"
  );
}

function isRetentionSummary(obj) {
  return (
    obj &&
    typeof obj.totalSessions === "number" &&
    typeof obj.retainedSessions === "number" &&
    typeof obj.retentionRate === "number"
  );
}

function isRetentionSnapshot(obj) {
  return (
    obj &&
    isRetentionSummary(obj.summary) &&
    Array.isArray(obj.buckets) &&
    obj.buckets.every(isRetentionBucket)
  );
}

/* ------------------------------------------------------------
   SAFE EXPORT
------------------------------------------------------------ */

export {
  isRetentionBucket,
  isRetentionSummary,
  isRetentionSnapshot
};
