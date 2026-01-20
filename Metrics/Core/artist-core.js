/* ============================================================
   RESONANT · ARTIST METRICS CORE — v1.1
   Read-only · Pure · Pitch-safe · Backend-ready
============================================================ */

/*
  SCOPE
  • Artist-level aggregations
  • Consumes metrics-core sessions
  • No DOM access
  • No storage writes
  • No side effects

  CONTRACT
  • artistId MUST be stable (string)
  • Sessions are assumed intentional-filtered where required
*/

import {
  loadSessions,
  isIntentional,
  computeCompletionRate,
  computeLongestStreak,
  computeTimeBand
} from "./metrics-core.js";

/* ------------------------------------------------------------
   CONSTANTS
------------------------------------------------------------ */

const UNKNOWN_ARTIST = "unknown";

/* ------------------------------------------------------------
   HELPERS (PURE)
------------------------------------------------------------ */

/**
 * Resolves a stable artist identifier.
 * Priority:
 * 1) artistId
 * 2) artist (string)
 */
function resolveArtistId(session) {
  if (!session || typeof session !== "object") return null;
  return session.artistId || session.artist || null;
}

/**
 * Filters and groups sessions by artistId.
 * Returns Map<string, Session[]>
 */
function groupSessionsByArtist(sessions = []) {
  const map = new Map();

  sessions.forEach(s => {
    if (!isIntentional(s)) return;

    const artistId = resolveArtistId(s);
    if (!artistId) return;

    if (!map.has(artistId)) {
      map.set(artistId, []);
    }

    map.get(artistId).push(s);
  });

  return map;
}

/* ------------------------------------------------------------
   AGGREGATIONS
------------------------------------------------------------ */

/**
 * Top artists by total listening time.
 */
function getTopArtists(limit = 10) {
  const sessions = loadSessions();
  const byArtist = groupSessionsByArtist(sessions);

  const results = [];

  byArtist.forEach((artistSessions, artistId) => {
    const totalListeningMs = artistSessions.reduce(
      (sum, s) => sum + (s.listenedMs || 0),
      0
    );

    results.push({
      artistId,
      totalSessions: artistSessions.length,
      totalListeningMs
    });
  });

  return results
    .sort((a, b) => b.totalListeningMs - a.totalListeningMs)
    .slice(0, limit);
}

/**
 * High-level summary for a single artist.
 */
function getArtistSummary(artistId) {
  if (!artistId) return null;

  const sessions = loadSessions().filter(
    s => isIntentional(s) && resolveArtistId(s) === artistId
  );

  if (!sessions.length) return null;

  const totalListeningMs = sessions.reduce(
    (sum, s) => sum + (s.listenedMs || 0),
    0
  );

  return {
    artistId,
    totalSessions: sessions.length,
    totalListeningMs,
    averageListeningMs: totalListeningMs / sessions.length,
    completionRate: computeCompletionRate(sessions),
    longestListeningStreakMs: computeLongestStreak(sessions),
    timeOfDayResonance: computeTimeBand(sessions)
  };
}

/**
 * Timeline of recent sessions for an artist.
 */
function getArtistTimeline(artistId, limit = 12) {
  if (!artistId) return [];

  return loadSessions()
    .filter(
      s =>
        isIntentional(s) &&
        resolveArtistId(s) === artistId &&
        typeof s.startedAt === "number"
    )
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map(s => ({
      startedAt: s.startedAt,
      listenedMs: s.listenedMs || 0,
      durationMs: s.durationMs || null
    }));
}

/**
 * Lightweight snapshot for all artists.
 * Used for tables, exports and sponsor decks.
 */
function getArtistsSnapshot() {
  const sessions = loadSessions();
  const byArtist = groupSessionsByArtist(sessions);

  const snapshot = [];

  byArtist.forEach((artistSessions, artistId) => {
    const totalListeningMs = artistSessions.reduce(
      (sum, s) => sum + (s.listenedMs || 0),
      0
    );

    snapshot.push({
      artistId,
      totalSessions: artistSessions.length,
      totalListeningMs
    });
  });

  return snapshot;
}

/* ------------------------------------------------------------
   SAFE EXPORT
------------------------------------------------------------ */

export {
  // helpers
  resolveArtistId,
  groupSessionsByArtist,

  // aggregates
  getTopArtists,
  getArtistSummary,
  getArtistTimeline,
  getArtistsSnapshot
};
