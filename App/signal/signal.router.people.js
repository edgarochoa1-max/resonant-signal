/* ============================================================
   SIGNAL · PERSON ROUTER
   VERSION: 2.0.2 — CANON FINAL
===============================================================

ROLE
• Hash-based routing for Person views
• Overlay on top of RADIO view
• UI coordination only (NO data ownership)

RULES
• NO global state
• NO normalization logic
• NO data mutation
• Uses DATA lookups only

PAIRING
• /App/data/people.index.js
• app.ui.js (implicit via dataset.view)

STATUS
• CANON · ROUTER-LAYER · SEALED
=============================================================== */

"use strict";

/* ------------------------------------------------------------
   IMPORTS
------------------------------------------------------------ */

import { getPersonBySlug } from "../data/people.index.js";

/* ------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------ */

const VIEW = Object.freeze({
  RADIO: "radio",
  PERSON: "person"
});

/* ------------------------------------------------------------
   DOM (GUARDED)
------------------------------------------------------------ */

const personView   = document.getElementById("person-view");
const personBack   = document.getElementById("person-back");
const personImage  = document.getElementById("person-image");
const personRole   = document.getElementById("person-role");
const personName   = document.getElementById("person-name");
const personBio    = document.getElementById("person-bio");
const personLinks  = document.getElementById("person-links");

const appRoot = document.querySelector(".app-root");
const artistNameEl = document.getElementById("artist-name");
const contributorNameEl = document.getElementById("contributor-name");

let prevPointerEvents = "";

/* ------------------------------------------------------------
   ACCESSIBILITY (ONCE)
------------------------------------------------------------ */

if (personView) {
  personView.setAttribute("role", "dialog");
  personView.setAttribute("aria-modal", "true");
  personView.setAttribute("aria-hidden", "true");
}

/* ------------------------------------------------------------
   MICRO-UX · CLICK + ENTER
------------------------------------------------------------ */

function enablePersonNavigation(el, type) {
  if (!el) return;

  el.style.cursor = "pointer";
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");

  const trigger = () => {
    const slug = el.dataset.slug;
    if (!slug) return;

    const nextHash = `#/${type}/${encodeURIComponent(slug)}`;
    if (location.hash === nextHash) return;

    window.location.hash = nextHash;
  };

  el.addEventListener("click", trigger);
  el.addEventListener("keydown", e => {
    if (e.key === "Enter") trigger();
  });
}

enablePersonNavigation(artistNameEl, "artist");
enablePersonNavigation(contributorNameEl, "contributor");

/* ------------------------------------------------------------
   ROUTER CORE
------------------------------------------------------------ */

function renderFromHash() {
  const raw = (location.hash || "").replace("#/", "");
  if (!raw) return renderRadioView();

  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 2) {
    const [type, slug] = parts;
    if ((type === "artist" || type === "contributor") && slug) {
      return renderPersonView(type, slug);
    }
  }

  renderRadioView();
}

function renderPersonView(type, slug) {
  if (!personView) return;

  const profile = getPersonBySlug(slug);
  if (!profile) return renderRadioView();

  document.body.dataset.view = VIEW.PERSON;

  /* 🔒 SCROLL LOCK */
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  /* 🔒 APP LOCK */
  if (appRoot) {
    prevPointerEvents = appRoot.style.pointerEvents || "";
    appRoot.setAttribute("aria-hidden", "true");
    appRoot.style.pointerEvents = "none";
  }

  personView.classList.remove("hidden");
  personView.setAttribute("aria-hidden", "false");

  /* 🎯 FOCUS */
  personView.setAttribute("tabindex", "-1");
  personView.focus();

  setText(personName, profile.name);
  setText(personRole, type.toUpperCase());
  setText(personBio, profile.bio || "Profile coming soon.");

  if (personImage) {
    if (profile.image) {
      personImage.src = profile.image;
      personImage.style.display = "";
    } else {
      personImage.removeAttribute("src");
      personImage.style.display = "none";
    }
  }

  if (personLinks) {
    personLinks.innerHTML = "";
    const links = profile.links || {};
    Object.entries(links).forEach(([label, url]) => {
      if (!url) return;
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label;
      li.appendChild(a);
      personLinks.appendChild(li);
    });
  }
}

function renderRadioView() {
  document.body.dataset.view = VIEW.RADIO;

  /* 🔓 SCROLL UNLOCK */
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";

  if (personView) {
    personView.classList.add("hidden");
    personView.setAttribute("aria-hidden", "true");
  }

  /* 🔓 APP UNLOCK */
  if (appRoot) {
    appRoot.removeAttribute("aria-hidden");
    if (prevPointerEvents) {
      appRoot.style.pointerEvents = prevPointerEvents;
    } else {
      appRoot.style.removeProperty("pointer-events");
    }
  }

  /* 🔔 UI RESYNC (IMPORTANT) */
  document.dispatchEvent(new Event("resonant:ui-resync"));
}

/* ------------------------------------------------------------
   EVENTS
------------------------------------------------------------ */

window.addEventListener("hashchange", renderFromHash);

if (personBack) {
  personBack.addEventListener("click", () => {
    history.back();
  });
}

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (document.body.dataset.view !== VIEW.PERSON) return;
  history.back();
});

/* ------------------------------------------------------------
   INIT
------------------------------------------------------------ */

renderFromHash();

/* ------------------------------------------------------------
   HELPERS
------------------------------------------------------------ */

function setText(el, value) {
  if (el) el.textContent = value || "—";
}

/* ============================================================
   END · person.router.js
=============================================================== */
