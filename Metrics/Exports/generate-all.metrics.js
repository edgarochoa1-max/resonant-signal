/* ============================================================
   RESONANT · METRICS MASTER EXPORTER — v1.0
   Generates all metrics JSON exports
   Read-only · Deterministic · Freeze-safe
============================================================ */

import { getSnapshot as getPublicSnapshot } from "../Core/metrics-core.js";
import { getArtistsSnapshot } from "../Core/artist-core.js";
import { getGrowthSnapshot } from "../Core/growth-core.js";
import { getRetentionSnapshot } from "../Core/retention-core.js";
import { getSponsorSnapshot } from "../Core/sponsor-core.js";

/* ------------------------------------------------------------
   HELPERS
------------------------------------------------------------ */

function nowISO() {
  return new Date().toISOString();
}

function downloadJSON(filename, data) {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json;charset=utf-8;" }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------
   EXPORTERS
------------------------------------------------------------ */

function exportPublic() {
  downloadJSON("public.metrics.json", {
    meta: { generatedAt: nowISO() },
    summary: getPublicSnapshot()
  });
}

function exportArtist() {
  downloadJSON("artist.metrics.json", {
    meta: { generatedAt: nowISO() },
    artists: getArtistsSnapshot()
  });
}

function exportGrowth() {
  const g = getGrowthSnapshot();
  downloadJSON("growth.metrics.json", {
    meta: { generatedAt: nowISO() },
    summary: {
      growthRate: g.growthRate,
      averageDailySessions: g.averageDailySessions,
      momentum: g.momentum
    },
    timeline: g.sessionsByDay
  });
}

function exportRetention() {
  const r = getRetentionSnapshot();
  downloadJSON("retention.metrics.json", {
    meta: { generatedAt: nowISO() },
    summary: r.summary,
    buckets: r.buckets
  });
}

function exportSponsor() {
  const s = getSponsorSnapshot();
  downloadJSON("sponsor.metrics.json", {
    meta: { generatedAt: nowISO() },
    summary: s.summary,
    scores: s.scores,
    signal: { signalStrength: s.signalStrength }
  });
}

/* ------------------------------------------------------------
   PUBLIC API
------------------------------------------------------------ */

function exportAllMetrics() {
  exportPublic();
  exportArtist();
  exportGrowth();
  exportRetention();
  exportSponsor();
}

export { exportAllMetrics };
