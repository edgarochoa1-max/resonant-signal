/* ============================================================
   RESONANT · PEOPLE MOCK DATA
   VERSION: 2.0.0 — CANON ARRAY (SEALED)
============================================================ */

export const PEOPLE = [
  {
    id: "jane-doe",
    slug: "jane-doe",
    name: "Jane Doe",
    type: "artist",

    image: "/assets/people/jane-doe.jpg",
    role: "DJ / Selector",
    location: "Berlin, DE",

    bio: `
Jane Doe is an underground electronic artist based in Berlin.
Her work centers on long-form, vinyl-driven DJ sets that move
fluidly between deep house, minimal, and hypnotic techno.

Rather than focusing on trends or peak-time moments, her
selections prioritize flow, patience, and subtle progression.
Each set unfolds slowly, allowing space for tension, release,
and narrative continuity.

Most sessions are recorded live with minimal post-processing,
preserving the raw energy and intentional imperfections of
the moment.
    `.trim(),

    links: {
      soundcloud: "https://soundcloud.com/janedoe",
      bandcamp: "https://janedoe.bandcamp.com",
      discogs: "https://www.discogs.com/artist/000000-Jane-Doe",
      ra: "https://ra.co/dj/janedoe",
      instagram: "https://instagram.com/janedoe"
    },

    metadata: {
      activeSince: 2014,
      styles: ["minimal", "deep house", "hypnotic techno"],
      vinylOnly: true,
      booking: false
    }
  },

  {
    id: "resonant-curator",
    slug: "resonant-curator",
    name: "Resonant Curator",
    type: "contributor",

    image: "/assets/people/resonant-curator.jpg",
    role: "Resident Curator",
    location: "Global",

    bio: `
Resident curator at Resonant, responsible for shaping the
editorial direction of the signal. The role focuses on
coherence, long-form narrative, and alignment between artists,
contributors, and transmissions.

Rather than dictating taste, the work centers on context,
curation, and restraint—allowing each artist to exist within
a broader underground continuum while preserving their
individual voice.
    `.trim(),

    links: {
      website: "https://resonant.radio",
      ra: "https://ra.co/promoter/resonant"
    },

    metadata: {
      activeSince: 2023,
      focus: [
        "editorial curation",
        "long-form narrative",
        "underground culture"
      ],
      booking: false
    }
  },

  {
    id: "john-smith",
    slug: "john-smith",
    name: "John Smith",
    type: "contributor",

    image: "/assets/people/john-smith.jpg",
    role: "Selector / Contributor",
    location: "EU",

    bio: `
Selector and contributor for Resonant transmissions. John’s
contributions emphasize deep, minimal, and non-trend-driven
electronic music, with a focus on flow, restraint, and
musical longevity.

His role supports the signal through careful selection and
contextual alignment, reinforcing Resonant’s commitment to
timeless underground sound rather than short-lived cycles.
    `.trim(),

    links: {
      soundcloud: "https://soundcloud.com/johnsmith",
      instagram: "https://instagram.com/johnsmith"
    },

    metadata: {
      activeSince: 2021,
      focus: ["selection", "support curation"],
      booking: false
    }
  }
];

/* ============================================================
   FREEZE NOTES
   - PEOPLE is a canonical ARRAY
   - id / slug / name are mandatory
   - Compatible with people.index.js
   - Compatible with signal.router.people.js
   - Editorial content preserved 1:1
   - SAFE TO FREEZE · SAFE TO EXTEND (versioned only)
============================================================ */
