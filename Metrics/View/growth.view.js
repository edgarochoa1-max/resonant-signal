/* ============================================================
   RESONANT · GROWTH METRICS VIEW — V2.0 WORLD CLASS
   View-only · Read-only · Radio-safe · Freeze-ready
============================================================ */

import {
  getSessionsByDay,
  getGrowthRate,
  getAverageDailySessions,
  getMomentum
} from "../Core/growth-core.js";

/* ------------------------------------------------------------
   BOOT
------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", boot);

function boot() {
  renderGrowth();
}

/* ------------------------------------------------------------
   RENDER
------------------------------------------------------------ */

function renderGrowth() {
  renderSummary();
  renderTimeline();
}

/* ------------------------------------------------------------
   SUMMARY
------------------------------------------------------------ */

function renderSummary() {
  const rate = safeNumber(getGrowthRate());
  const avg = safeNumber(getAverageDailySessions());
  const momentum = getMomentum();

  setText(
    "growth-rate",
    rate != null ? `${Math.round(rate * 100)}%` : "—"
  );

  setText(
    "growth-average",
    avg != null ? avg.toFixed(1) : "—"
  );

  setText(
    "growth-momentum",
    formatMomentum(momentum)
  );
}

/* ------------------------------------------------------------
   TIMELINE
------------------------------------------------------------ */

function renderTimeline() {
  const ul = document.getElementById("growth-timeline");
  if (!ul) return;

  ul.innerHTML = "";

  const days = getSessionsByDay();

  if (!Array.isArray(days) || !days.length) {
    renderEmpty(ul, "No growth data yet.");
    return;
  }

  days.forEach(day => {
    const li = document.createElement("li");
    li.className = "timeline-item";

    li.innerHTML = `
      <span class="time">${day.day}</span>
      <span class="detail">${day.sessions} sessions</span>
    `;

    ul.appendChild(li);
  });
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
  el.textContent = msg;
  container.appendChild(el);
}

function formatMomentum(m) {
  switch (m) {
    case "up":
      return "Growing ↑";
    case "down":
      return "Declining ↓";
    case "flat":
      return "Stable →";
    default:
      return "—";
  }
}

function safeNumber(n) {
  return typeof n === "number" && !Number.isNaN(n) ? n : null;
}
