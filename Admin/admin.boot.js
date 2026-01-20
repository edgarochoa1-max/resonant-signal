/* ============================================================
   RESONANT · ADMIN BOOT
   FILE: admin.boot.js
   VERSION: 20.3.4-BOOT-STABLE-FREEZE
   STATUS: ORCHESTRATOR ONLY · SEALED
============================================================ */

"use strict";

import * as CORE from "./admin.core.js";
import * as ENGINE from "./admin.engine.js";
import * as UI from "./admin.ui.js";


/* ============================================================
   INTERNAL STATE
============================================================ */

let loginInProgress = false;
let shortcutsBound = false;

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
   FINAL BOOT (SINGLE ENTRY POINT)
============================================================ */

function finalizeBoot() {
  // Siempre entramos limpios
  CORE.emergencyStop("boot-clean");

  // Inicializa sesión (carga playlist)
  CORE.initAdminSession("ADMIN", "operator");

  // Mostrar UI (UI maneja heartbeat internamente)
  UI.showAdminUI();

  bindAdminShortcuts();

  console.info("🟢 ADMIN BOOT — READY");
}

/* ============================================================
   SHORTCUTS (OPERATOR ONLY)
============================================================ */

function bindAdminShortcuts() {
  if (shortcutsBound) return;
  shortcutsBound = true;

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;

    const t = e.target;
    const tag = (t?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;

    if (!CORE.canOperate()) return;
    if (CORE.getState().finishing) return;

    const key = e.key.toLowerCase();
    const shift = e.shiftKey;
    const meta = e.metaKey;

    if (shift && !meta && key === "n") {
      e.preventDefault();
      ENGINE.safeAdvance("kbd-next");
    }

    if (shift && !meta && key === "k") {
      e.preventDefault();
      ENGINE.emergencyStop("kbd-stop");
    }

    if (shift && meta && key === "k") {
      e.preventDefault();
      ENGINE.killSwitch("kbd-kill");
    }
  });
}

/* ============================================================
   LOGIN (DEV SAFE)
============================================================ */

async function handleLogin(e) {
  e?.preventDefault();
  if (loginInProgress) return;

  const input   = requireEl("admin-pin");
  const msg     = requireEl("admin-login-msg");
  const btn     = requireEl("admin-login-btn");
  const spinner = document.getElementById("loading-spinner");

  const password = (input.value || "").trim();

  if (!password) {
    msg.textContent = "Password required";
    msg.classList.remove("hidden");
    return;
  }

  loginInProgress = true;
  btn.disabled = true;
  msg.classList.add("hidden");
  spinner?.classList.remove("hidden");

  try {
    // DEV MODE
    if (!IS_SECURE_CONTEXT) {
      console.warn("⚠️ DEV MODE LOGIN (NO CRYPTO)");
      finalizeBoot();
      return;
    }

    // PROD MODE (pendiente)
    msg.textContent = "Secure login required";
    msg.classList.remove("hidden");

  } catch (err) {
    console.error("LOGIN ERROR", err);
    msg.textContent = "Login error";
    msg.classList.remove("hidden");
  } finally {
    loginInProgress = false;
    btn.disabled = false;
    spinner?.classList.add("hidden");
  }
}

/* ============================================================
   BOOTSTRAP
============================================================ */

function bootAdmin() {
  UI.cacheAdminDOM();
  UI.showLoginOnly();

  const loginBtn   = requireEl("admin-login-btn");
  const loginInput = requireEl("admin-pin");

  loginBtn.addEventListener("click", handleLogin);
  loginInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin(e);
  });

  loginInput.focus();
}

/* ============================================================
   START
============================================================ */

document.addEventListener("DOMContentLoaded", bootAdmin);

/* ============================================================
   END admin.boot.js
============================================================ */
