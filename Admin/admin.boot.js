/* ============================================================
   RESONANT · ADMIN BOOT
   FILE: admin.boot.js
   ADMIN SIDE
   STATUS: 🔒 SEALED · CANON · BROADCAST-GRADE
   VERSION: 20.4.2


   ROLE
   - Single entry point
   - Defines READY state explicitly
   - Orchestrates CORE / UI / ENGINE
   - No UI ambiguity
============================================================ */

"use strict";

import * as CORE from "./admin.core.js";
import * as ENGINE from "./admin.engine.js";
import * as UI from "./admin.ui.js";

/* ============================================================
   INTERNAL STATE
============================================================ */

let loginInProgress = false;
let bootCompleted = false;

/* ============================================================
   ENV DETECTION
============================================================ */

const IS_SECURE_CONTEXT =
  location.protocol === "https:" ||
  location.hostname === "localhost";

/* ============================================================
   UTIL
============================================================ */

function requireEl(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`❌ Missing DOM element: #${id}`);
  return el;
}

/* ============================================================
   FINALIZE BOOT — SINGLE SOURCE OF TRUTH
============================================================ */

function finalizeBoot() {
  if (bootCompleted) return;

  bootCompleted = true;
  loginInProgress = false;

  // ============================================================
  // 1. AUTHORITATIVE SESSION INIT
  // ============================================================
  CORE.initAdminSession("ADMIN", "operator");

  // ============================================================
  // 2. AUTHORITATIVE LEASE ACQUIRE
  // ============================================================
  CORE.acquireLease();

  // Failsafe: lease MUST exist
  if (!CORE.hasLease()) {
    console.warn("[ADMIN BOOT] Lease missing — forcing reacquire");
    CORE.acquireLease();
  }

  // ============================================================
  // 3. UI UNLOCK
  // ============================================================
  UI.showAdminUI();

const loginCard = document.getElementById("admin-login");
if (loginCard) loginCard.style.display = "none";

// ⏳ Asegurar DOM + UI antes de engine handshake
requestAnimationFrame(() => {
  ENGINE.onAdminReady();
});


  // ============================================================
  // 4. FINAL ASSERT
  // ============================================================
  console.info("[ADMIN BOOT] READY", {
  mode: CORE.getState().adminMode,
  lease: CORE.hasLease(),
  playlist: CORE.getState().playlist.length,
  live: !!CORE.getState().startedAt
});

}

/* ============================================================
   LOGIN (DEV / PROD EXPLICIT)
============================================================ */

const DEV_LOGIN =
  location.hostname === "localhost" ||
  location.hostname === "127.0.0.1";

async function handleLogin(e) {
  e?.preventDefault();
  if (loginInProgress || bootCompleted) return;

  const input = requireEl("admin-pin");
  const msg   = requireEl("admin-login-msg");
  const btn   = requireEl("admin-login-btn");

  const password = (input.value || "").trim();

  if (!password) {
    msg.textContent = "Password required";
    msg.classList.remove("hidden");
    return;
  }

  loginInProgress = true;
  btn.disabled = true;
  msg.classList.add("hidden");

  try {
    if (DEV_LOGIN) {
      console.warn("⚠️ ADMIN LOGIN — DEV BYPASS ENABLED");
      finalizeBoot();
      return;
    }

    throw new Error("PROD login not implemented");

  } catch (err) {
    console.error("LOGIN ERROR", err);
    msg.textContent = "Login error";
    msg.classList.remove("hidden");
  } finally {
    if (!bootCompleted) {
      loginInProgress = false;
      btn.disabled = false;
    }
  }
}

/* ============================================================
   BOOTSTRAP
============================================================ */

function bootAdmin() {
  // 1. Cache DOM una sola vez
  UI.cacheAdminDOM();

  // 2. UI entra en modo login puro
  UI.showLoginOnly();

  // 3. Bind login controls
  const loginBtn   = requireEl("admin-login-btn");
  const loginInput = requireEl("admin-pin");

  loginBtn.addEventListener("click", handleLogin);
  loginInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleLogin(e);
  }
});


  loginInput.focus();
}

/* ============================================================
   START
============================================================ */

document.addEventListener("DOMContentLoaded", bootAdmin);

/* ============================================================
   END admin.boot.js · CANON SEALED
============================================================ */
