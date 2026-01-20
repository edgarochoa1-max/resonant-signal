/* ============================================================
   RESONANT · SPONSOR METRICS VIEW — V2.0 WORLD CLASS
   View-only · Pitch-safe · Read-only · Freeze-ready
============================================================ */

import { getSponsorSnapshot } from "../Core/sponsor-core.js";
import { formatDuration } from "../Core/metrics-core.js";

/* ------------------------------------------------------------
   BOOT
------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", boot);

function boot() {
  renderSponsor();
}

/* ------------------------------------------------------------
   RENDER
------------------------------------------------------------ */

function renderSponsor() {
  const snapshot = getSponsorSnapshot();

  if (!snapshot || !snapshot.summary) {
    renderEmptyState();
    return;
  }

  const s = snapshot.summary;

  setText("sponsor-total-sessions", s.totalSessions ?? "—");

  setText(
    "sponsor-total-time",
    s.totalListeningMs
      ? formatDuration(s.totalListeningMs)
      : "—"
  );

  setText(
    "sponsor-average",
    s.averageListeningMs
      ? formatDuration(s.averageListeningMs)
      : "—"
  );

  setText(
    "sponsor-retention",
    typeof s.retentionRate === "number"
      ? `${Math.round(s.retentionRate * 100)}%`
      : "—"
  );

  setText("sponsor-peak", s.peakListeners ?? "—");
}

/* ------------------------------------------------------------
   EMPTY STATE
------------------------------------------------------------ */

function renderEmptyState() {
  setText("sponsor-total-sessions", "—");
  setText("sponsor-total-time", "—");
  setText("sponsor-average", "—");
  setText("sponsor-retention", "—");
  setText("sponsor-peak", "—");
}

/* ------------------------------------------------------------
   UI HELPERS
------------------------------------------------------------ */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
