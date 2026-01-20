/* ============================================================
   RESONANT · ARTIST METRICS SCHEMA — v1.0
   Data Contract · Read-only · Pitch-safe · Backend-ready
============================================================ */

/*
  PURPOSE
  -------
  • Define the expected structure of artist-level metrics
  • Acts as a shared contract between:
      - Core (computations)
      - Views (UI rendering)
      - Exports (CSV / JSON)
      - Future backend / API
  • No logic, no state, no side effects
*/

/* ------------------------------------------------------------
   TYPE DEFINITIONS (DOCUMENTATION)
------------------------------------------------------------ */

/**
 * ArtistSnapshot
 * Lightweight aggregated metrics per artist
 *
 * @property {string} artistId
 * @property {number} totalSessions
 * @property {number} totalListeningMs
 */

/**
 * ArtistSummary
 * Detailed metrics for a single artist
 *
 * @property {string} artistId
 * @property {number} totalSessions
 * @property {number} totalListeningMs
 * @property {number} averageListeningMs
 * @property {number} completionRate          // 0–1
 * @property {number} longestListeningStreakMs
 * @property {"early"|"day"|"night"|"late"|null} timeOfDayResonance
 */

/**
 * ArtistTimelineItem
 * Individual listening session reference
 *
 * @property {number} startedAt                // timestamp (ms)
 * @property {number} listenedMs
 * @property {?number} durationMs
 */

/* ------------------------------------------------------------
   RUNTIME GUARDS (LIGHTWEIGHT, OPTIONAL)
------------------------------------------------------------ */

function isArtistSnapshot(obj) {
  return (
    obj &&
    typeof obj.artistId === "string" &&
    typeof obj.totalSessions === "number" &&
    typeof obj.totalListeningMs === "number"
  );
}

function isArtistSummary(obj) {
  return (
    obj &&
    typeof obj.artistId === "string" &&
    typeof obj.totalSessions === "number" &&
    typeof obj.totalListeningMs === "number" &&
    typeof obj.averageListeningMs === "number" &&
    typeof obj.completionRate === "number" &&
    typeof obj.longestListeningStreakMs === "number"
  );
}

function isArtistTimelineItem(obj) {
  return (
    obj &&
    typeof obj.startedAt === "number" &&
    typeof obj.listenedMs === "number"
  );
}

/* ------------------------------------------------------------
   SAFE EXPORT
------------------------------------------------------------ */

export {
  // guards
  isArtistSnapshot,
  isArtistSummary,
  isArtistTimelineItem
};
