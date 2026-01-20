/* ============================================================
   RESONANT · RETENTION METRICS VIEW — V3.0 WORLD CLASS
   View-only · Read-only · Radio-safe · Freeze-ready
============================================================ */

import {
  getRetentionSnapshot
} from "../Core/retention-core.js";

/* ------------------------------------------------------------
   STATE
------------------------------------------------------------ */

let renderedOnce = false;

/* ------------------------------------------------------------
   BOOT
------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", boot);

function boot() {
  renderRetention();
}

/* ------------------------------------------------------------
   RENDER
------------------------------------------------------------ */

function renderRetention() {
  const snapshot = getRetentionSnapshot();

  if (!snapshot) {
    renderEmptyState();
    return;
  }

  const { summary, buckets } = snapshot;

  renderSummary(summary);
  renderBuckets(buckets);

  renderedOnce = true;
}

/* ------------------------------------------------------------
   SUMMARY
------------------------------------------------------------ */

function renderSummary(summary) {
  if (!summary) {
    setSummaryEmpty();
    return;
  }

  setText("retention-total", summary.totalSessions ?? "—");
  setText("retention-retained", summary.retainedSessions ?? "—");

  setText(
    "retention-rate",
    typeof summary.retentionRate === "number"
      ? `${Math.round(summary.retentionRate * 100)}%`
      : "—"
  );
}

/* ------------------------------------------------------------
   BUCKETS
------------------------------------------------------------ */

function renderBuckets(buckets) {
  const ul = document.getElementById("retention-buckets");
  if (!ul) return;

  // Idempotency guard (safe if re-called)
  ul.innerHTML = "";

  if (!Array.isArray(buckets) || !buckets.length) {
    renderEmpty(ul, "No retention data yet.");
    return;
  }

  buckets.forEach(bucket => {
    const li = document.createElement("li");
    li.className = "retention-item";
    li.setAttribute("role", "listitem");

    li.innerHTML = `
      <span class="label">${bucket.label}</span>
      <span class="value">${bucket.count}</span>
    `;

    ul.appendChild(li);
  });
}

/* ------------------------------------------------------------
   EMPTY / FALLBACK STATES
------------------------------------------------------------ */

function renderEmptyState() {
  setSummaryEmpty();

  const ul = document.getElementById("retention-buckets");
  if (ul) {
    ul.innerHTML = "";
    renderEmpty(ul, "No retention data available.");
  }
}

function setSummaryEmpty() {
  setText("retention-total", "—");
  setText("retention-retained", "—");
  setText("retention-rate", "—");
}

/* ------------------------------------------------------------
   UI HELPERS
------------------------------------------------------------ */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderEmpty(container, msg) {
  const el = document.createElement("div");
  el.className = "empty-state";
  el.setAttribute("role", "status");
  el.textContent = msg;
  container.appendChild(el);
}
