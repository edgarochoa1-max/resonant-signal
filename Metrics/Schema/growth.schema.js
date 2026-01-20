/* ============================================================
   RESONANT · GROWTH METRICS SCHEMA — v1.0
   Data Contract · Read-only · Pitch-safe · Backend-ready
============================================================ */

/*
  PURPOSE
  -------
  • Define the expected structure of growth metrics
  • Shared contract between:
      - Growth Core
      - Views (charts / tables)
      - Exports (CSV / JSON)
      - Future backend / BI tools
  • No logic, no DOM, no storage
*/

/* ------------------------------------------------------------
   TYPE DEFINITIONS (DOCUMENTATION)
------------------------------------------------------------ */

/**
 * GrowthDay
 * Daily aggregated intentional sessions
 *
 * @property {string} day            // YYYY-MM-DD (UTC)
 * @property {number} sessions       // count
 */

/**
 * GrowthSummary
 * High-level growth indicators
 *
 * @property {number} growthRate           // decimal (e.g. 0.25 = +25%)
 * @property {number} averageDailySessions
 * @property {"up"|"down"|"flat"} momentum
 */

/**
 * GrowthSnapshot
 * Unified growth payload
 *
 * @property {GrowthDay[]} timeline
 * @property {GrowthSummary} summary
 */

/* ------------------------------------------------------------
   RUNTIME GUARDS (LIGHTWEIGHT)
------------------------------------------------------------ */

function isGrowthDay(obj) {
  return (
    obj &&
    typeof obj.day === "string" &&
    typeof obj.sessions === "number"
  );
}

function isGrowthSummary(obj) {
  return (
    obj &&
    typeof obj.growthRate === "number" &&
    typeof obj.averageDailySessions === "number" &&
    (obj.momentum === "up" ||
     obj.momentum === "down" ||
     obj.momentum === "flat")
  );
}

function isGrowthSnapshot(obj) {
  return (
    obj &&
    Array.isArray(obj.timeline) &&
    obj.timeline.every(isGrowthDay) &&
    isGrowthSummary(obj.summary)
  );
}

/* ------------------------------------------------------------
   SAFE EXPORT
------------------------------------------------------------ */

export {
  // guards
  isGrowthDay,
  isGrowthSummary,
  isGrowthSnapshot
};
