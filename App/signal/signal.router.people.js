/* ============================================================
   SIGNAL · PERSON ROUTER
   VERSION: 2.0.0 — CANON SEALED
===============================================================

ROLE
• Hash-based routing for Person views
• View coordination only (NO data ownership)
• Delegates resolution to DATA layer

RULES
• NO global state
• NO normalization logic
• NO data mutation
• Uses DATA lookups only

PAIRING
• /App/data/people.index.js

STATUS
• CANON
• ROUTER-LAYER
=============================================================== */

"use strict";

/* ------------------------------------------------------------
   IMPORTS
------------------------------------------------------------ */

import {
  getPersonBySlug
} from "../data/people.index.js";

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

    window.location.hash = `/${type}/${encodeURIComponent(slug)}`;
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
  const raw = (location.hash || "").replace("#", "");
  if (!raw || raw === "/") return renderRadioView();

  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 2) {
    const [type, slug] = parts;
    if (type === "artist" || type === "contributor") {
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

  // 🔒 UX lock
  if (appRoot) {
    prevPointerEvents = appRoot.style.pointerEvents || "";
    appRoot.setAttribute("aria-hidden", "true");
    appRoot.style.pointerEvents = "none";
  }

  personView.classList.remove("hidden");

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
    Object.keys(links).forEach(label => {
      const url = links[label];
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
  if (personView) personView.classList.add("hidden");

  // 🔓 UX unlock
  if (appRoot) {
    appRoot.removeAttribute("aria-hidden");
    appRoot.style.pointerEvents = prevPointerEvents;
  }
}

/* ------------------------------------------------------------
   EVENTS
------------------------------------------------------------ */

window.addEventListener("hashchange", renderFromHash);

if (personBack) {
  personBack.addEventListener("click", () => {
    if (location.hash && location.hash !== "#/") history.back();
    else window.location.hash = "/";
  });
}

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (document.body.dataset.view !== VIEW.PERSON) return;

  if (location.hash && location.hash !== "#/") history.back();
  else window.location.hash = "/";
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
