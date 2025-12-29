/* ============================================================
   RESONANT · PUBLIC METRICS VIEW — PHASE 0
   Stream-level metrics · Netlify-safe
============================================================ */

document.addEventListener("DOMContentLoaded", () => {
  if (window.ResonantMetrics) {
    ResonantMetrics.renderMetrics();
    ResonantMetrics.renderLiveStatus();
  }
});
