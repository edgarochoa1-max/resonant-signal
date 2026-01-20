/* ============================================================
   RESONANT · ADMIN ENGINE
   FILE: admin.engine.js
   VERSION: 20.3.2-ENGINE-STABLE-FREEZE
   STATUS: CORE-ALIGNED · BROADCAST-GRADE
============================================================ */

"use strict";

console.info("🔥 RESONANT ADMIN ENGINE — STABLE FREEZE");
window.__ENGINE_LOADED__ = true;

import * as CORE from "./admin.core.js";

/* ============================================================
   CONSTANTS
============================================================ */

const HEARTBEAT_INTERVAL = 1000;

/* ============================================================
   HEARTBEAT (ENGINE = DELEGATOR ONLY)
============================================================ */

let heartbeat = null;

function startHeartbeat() {
  if (heartbeat) return;

  const state = CORE.getState();
  if (!state.startedAt) return;

  heartbeat = setInterval(engineTick, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (!heartbeat) return;
  clearInterval(heartbeat);
  heartbeat = null;
}

/* ============================================================
   PLAYLIST OPS (SAFE · CORE AUTHORITY)
============================================================ */

export function shufflePlaylist() {
  const state = CORE.getState();
  if (!CORE.canOperate()) return;
  if (state.finishing) return;

  const shuffled = [...state.playlist]
    .map(v => ({ v, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ v }) => v);

  CORE.setState({ playlist: shuffled }, "playlist-shuffle");
  CORE.savePlaylist();
}

export function deleteTrack(index) {
  const state = CORE.getState();
  if (!CORE.canOperate()) return;
  if (state.finishing) return;
  if (!state.playlist[index]) return;

  const playlist = [...state.playlist];
  const wasLive = playlist[index]?.id === state.currentTrackId;

  playlist.splice(index, 1);

  CORE.setState({ playlist }, "playlist-delete");
  CORE.savePlaylist();

  // Si se borró el track live, CORE decide qué sigue
  if (wasLive) {
    CORE.safeAdvance("delete-live");
  }
}

export function moveTrackUp(index) {
  const state = CORE.getState();
  if (!CORE.canOperate()) return;
  if (state.finishing) return;
  if (index <= 0) return;

  const playlist = [...state.playlist];
  [playlist[index - 1], playlist[index]] =
    [playlist[index], playlist[index - 1]];

  CORE.setState({ playlist }, "playlist-move-up");
  CORE.savePlaylist();
}

export function moveTrackDown(index) {
  const state = CORE.getState();
  if (!CORE.canOperate()) return;
  if (state.finishing) return;
  if (index >= state.playlist.length - 1) return;

  const playlist = [...state.playlist];
  [playlist[index], playlist[index + 1]] =
    [playlist[index + 1], playlist[index]];

  CORE.setState({ playlist }, "playlist-move-down");
  CORE.savePlaylist();
}

export async function addMixFromURL(url) {
  const state = CORE.getState();
  if (!CORE.canOperate()) return;
  if (state.finishing) return;
  if (!url) return;

  try {
    new URL(url);
  } catch {
    return;
  }

  if (state.playlist.some(t => t?.source?.url === url)) return;

  let title = "Untitled";
  let artist = "Unknown Artist";
  let artwork = null;
  let platform = "url";

  if (/soundcloud\.com/i.test(url)) {
    platform = "soundcloud";
    try {
      const res = await fetch(
        `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.title) title = data.title;
        if (data?.author_name) artist = data.author_name;
        if (data?.thumbnail_url) artwork = data.thumbnail_url;
      }
    } catch {}
  }

  const track = {
    id:
      "manual-" +
      (window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : Math.random().toString(36).slice(2)),
    title,
    artist: { name: artist },
    contributor: null,
    source: { platform, url },
    artwork,
    duration: null
  };

  CORE.setState(
    { playlist: [...state.playlist, track] },
    "playlist-add-url"
  );
  CORE.savePlaylist();
}

export function undoPlaylist() {
  if (!CORE.canOperate()) return;
  return CORE.undoPlaylist();
}

/* ============================================================
   PLAYBACK (CORE AUTHORITY)
============================================================ */

export function playIndex(index, reason = "manual") {
  if (!CORE.canOperate()) return false;

  const ok = CORE.playIndex(index, reason);
  if (!ok) return false;

  startHeartbeat();
  return true;
}

export function safeAdvance(reason = "auto") {
  if (!CORE.canOperate()) return false;

  const ok = CORE.safeAdvance(reason);
  if (!ok) return false;

  startHeartbeat();
  return true;
}

/* ============================================================
   HEARTBEAT TICK (NO TRANSITIONS HERE)
============================================================ */

function engineTick() {
  const state = CORE.getState();

  if (!CORE.canOperate()) {
    stopHeartbeat();
    return;
  }

  if (!state.startedAt) {
    stopHeartbeat();
    return;
  }

  if (!state.currentMeta) return;
  if (!Number.isFinite(state.currentMeta.duration)) return;
  if (state.finishing) return;

  const elapsed = Date.now() - state.startedAt;
  const duration = state.currentMeta.duration;

  if (elapsed >= duration) {
    CORE.safeAdvance("auto-end");
  }
}

/* ============================================================
   EMERGENCY
============================================================ */

export function emergencyStop(reason = "manual") {
  if (!CORE.canOperate()) return false;

  CORE.emergencyStop(reason);
  stopHeartbeat();
  return true;
}

/* ============================================================
   KILL SWITCH
============================================================ */

export function killSwitch(reason = "kill-switch") {
  if (!CORE.canOperate()) return;
  if (CORE.getState().finishing) return;

  CORE.emergencyStop(reason);
  stopHeartbeat();

  console.warn("🟥 KILL SWITCH ACTIVATED:", reason);
}

/* ============================================================
   CANONICAL IMPORT
============================================================ */

export function importCanonicalPlaylist(data) {
  if (!CORE.canOperate()) return false;
  if (!Array.isArray(data)) return false;
  if (CORE.getState().finishing) return false;

  const seeded = data.map(t => ({
    ...t,
    id:
      t.id ||
      (window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : "seed-" + Math.random().toString(36).slice(2))
  }));

  CORE.setState(
    {
      playlist: seeded,
      currentIndex: null,
      currentTrackId: null,
      currentMeta: null
    },
    "playlist-import-canonical"
  );

  CORE.savePlaylist();
  return true;
}

/* ============================================================
   END admin.engine.js
============================================================ */
