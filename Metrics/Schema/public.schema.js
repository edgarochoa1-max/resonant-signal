/* ============================================================
   RESONANT · PUBLIC METRICS SCHEMA — v1.0
   Data Contract · Public-facing · Read-only · Stable
============================================================ */

/*
  PURPOSE
  -------
  • Define the public-facing metrics contract
  • Used in:
      - Public metrics page
      - Press kits
      - Investor previews
      - Landing pages
  • Aggregated only
  • No personal data
  • No artist-level monetization data
*/

/* ------------------------------------------------------------
   TYPE DEFINITIONS (DOCUMENTATION)
------------------------------------------------------------ */

/**
 * PublicSnapshot
 * High-level live signal overview
 *
 * @property {number} totalSessions
 * @property {number} activeListeners
 * @property {number} totalListeningMs
 * @property {number} averageListeningMs
 * @property {number} longestListeningStreakMs
 *
 * @property {number} peakConcurrentListeners
 * @property {number} completionRate          // 0–1
 * @property {"early"|"day"|"night"|"late"|null} timeOfDayResonance
 * @property {number} newArtistExposure
 *
 * @property {"live"|"off"} liveStatus
 */

/* ------------------------------------------------------------
   RUNTIME GUARD
------------------------------------------------------------ */

function isPublicSnapshot(obj) {
  return (
    obj &&
    typeof obj.totalSessions === "number" &&
    typeof obj.activeListeners === "number" &&
    typeof obj.totalListeningMs === "number" &&
    typeof obj.averageListeningMs === "number" &&
    typeof obj.longestListeningStreakMs === "number" &&
    typeof obj.peakConcurrentListeners === "number" &&
    typeof obj.completionRate === "number" &&
    (obj.timeOfDayResonance === null ||
      ["early", "day", "night", "late"].includes(obj.timeOfDayResonance)) &&
    typeof obj.newArtistExposure === "number" &&
    (obj.liveStatus === "live" || obj.liveStatus === "off")
  );
}

/* ------------------------------------------------------------
   SAFE EXPORT
------------------------------------------------------------ */

export {
  isPublicSnapshot
};
