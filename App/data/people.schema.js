/* ============================================================
   RESONANT · DATA · PEOPLE SCHEMA
===============================================================

ROLE
• Canonical shape contract for a Person entity
• Documentation + consistency layer
• Future validation / ingestion reference

RULES
• NO logic
• NO validation
• NO side effects
• Shape only

STATUS
• CANON
• DATA-CONTRACT
=============================================================== */

"use strict";

/* ------------------------------------------------------------
   PERSON SCHEMA (REFERENCE)
------------------------------------------------------------ */

export const PERSON_SCHEMA = Object.freeze({
  id: "",            // stable internal id
  slug: "",          // URL-safe identifier
  name: "",          // display name

  role: "",          // artist | contributor | label | curator | etc

  bio: "",           // short biography (optional)

  links: {
    website: "",
    instagram: "",
    soundcloud: "",
    bandcamp: "",
    spotify: ""
  },

  sources: {
    discogs: "",
    musicbrainz: "",
    internal: ""
  },

  meta: {
    createdAt: 0,
    updatedAt: 0
  }
});
