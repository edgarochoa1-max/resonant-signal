/* ============================================================
   RESONANT · DATA · PEOPLE INDEX
===============================================================

ROLE
• Build in-memory indexes for People
• Fast lookup by id / slug / name
• Pure functions only

RULES
• NO fetch
• NO async
• NO DOM
• NO side effects
• Deterministic & sealed

PAIRING
• people.mock.js
• people.normalize.js

STATUS
• CANON
• DATA-LAYER
=============================================================== */

"use strict";

import { PEOPLE } from "./people.mock.js";
import {
  normalizeText,
  normalizeSlug
} from "./people.normalize.js";

/* ------------------------------------------------------------
   INTERNAL INDEXES (IMMUTABLE)
------------------------------------------------------------ */

const byId = Object.create(null);
const bySlug = Object.create(null);
const byName = Object.create(null);

/* ------------------------------------------------------------
   INDEX BUILD (ONCE)
------------------------------------------------------------ */

(function buildIndexes() {
  if (!Array.isArray(PEOPLE)) {
    console.error("❌ PEOPLE mock is not an array");
    return;
  }

  for (const person of PEOPLE) {
    if (!person || !person.id) continue;

    // byId
    byId[person.id] = person;

    // bySlug
    if (person.slug) {
      const slug = normalizeSlug(person.slug);
      if (slug) bySlug[slug] = person;
    }

    // byName (searchable)
    if (person.name) {
      const nameKey = normalizeText(person.name);
      if (!byName[nameKey]) byName[nameKey] = [];
      byName[nameKey].push(person);
    }
  }

  Object.freeze(byId);
  Object.freeze(bySlug);
  Object.freeze(byName);
})();

/* ------------------------------------------------------------
   PUBLIC API — LOOKUPS
------------------------------------------------------------ */

export function getPersonById(id) {
  if (!id) return null;
  return byId[id] || null;
}

export function getPersonBySlug(slug) {
  if (!slug) return null;
  const key = normalizeSlug(slug);
  return bySlug[key] || null;
}

/* ------------------------------------------------------------
   SEARCH
------------------------------------------------------------ */

export function searchPeople(query) {
  if (!query || typeof query !== "string") return [];

  const q = normalizeText(query);
  if (!q) return [];

  const results = [];

  for (const key in byName) {
    if (key.includes(q)) {
      results.push(...byName[key]);
    }
  }

  // de-dupe by id
  const seen = new Set();
  return results.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

/* ------------------------------------------------------------
   DEBUG (SAFE)
------------------------------------------------------------ */

export const __PEOPLE_INDEX__ = Object.freeze({
  count: PEOPLE.length,
  ids: Object.keys(byId).length,
  slugs: Object.keys(bySlug).length
});
