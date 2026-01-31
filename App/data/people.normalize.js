/* ============================================================
   RESONANT · DATA · PEOPLE NORMALIZE
===============================================================

ROLE
• Pure text normalization helpers
• Search & index preparation
• Locale-safe, deterministic

RULES
• NO state
• NO side effects
• NO DOM
• NO async

STATUS
• CANON
• DATA-HELPERS
=============================================================== */

"use strict";

/* ------------------------------------------------------------
   INTERNAL
------------------------------------------------------------ */

function stripDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ------------------------------------------------------------
   PUBLIC API
------------------------------------------------------------ */

export function normalizeText(input) {
  if (!input || typeof input !== "string") return "";

  return stripDiacritics(input)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeSlug(input) {
  if (!input || typeof input !== "string") return "";

  return stripDiacritics(input)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
