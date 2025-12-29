# 🛰️ Resonant Radio

**The Underground Music Signal**

Resonant is an invite-only underground radio system designed for
synchronized listening of curated DJ sets.
It operates as a **single-authority broadcast**, prioritizing
stability, determinism, and audio continuity over feature complexity.

This repository contains the **frozen broadcast core** of Resonant.

---

## Status

🧊 **FROZEN — Stable Broadcast Core**

- Version: **Resonant V16**
- Listener Engine: **v2.6.x**
- Admin Console: **v2.4**
- UI Role: Passive Shell
- Authority Model: Single Admin

Changes to the core require an explicit **version bump**.

---

## System Overview

Resonant consists of:

- **One Admin** (single source of truth)
- **Many passive Listeners**
- `localStorage` used as a broadcast bus
- SoundCloud Widget as the audio transport
- Time-based synchronization using a shared `startedAt` timestamp

> Silence is preferred over corruption.

---

## Architecture Principles

- **Single Authority**  
  Only one admin can broadcast at any time.

- **Time-Based Sync**  
  Listeners align playback using `startedAt`.

- **Lease-Based Validity**  
  Broadcasts expire automatically if the admin disappears.

- **Explicit States**  
  `live`, `transition`, `offair`

---

## Authority Model

### Admin

- Exactly **one admin is authoritative**
- Identified by a persistent `ADMIN_ID`
- Publishes broadcast state including:
  - `adminId`
  - `leaseUntil`
  - `updatedAt`
  - `url`
  - `startedAt`
  - metadata (artist, title, artwork)

Admin identity persists via `sessionStorage`,
allowing safe recovery after reloads or crashes.

---

### Listener

- Passive role — **no authority**
- Locks onto the **first valid adminId**
- Ignores conflicting admins unless:
  - The lease expires
  - A ghost admin is detected
  - A soft handoff occurs

Listeners never compete for control.

---

## Broadcast State Contract

Stored in `localStorage` as the broadcast bus.

```json
{
  "version": 2,
  "status": "live",
  "adminId": "uuid",
  "leaseUntil": 123456789,
  "updatedAt": 123456789,
  "url": "https://soundcloud.com/...",
  "startedAt": 123456789,
  "meta": {
    "artist": "Artist Name",
    "title": "Track / Set Title",
    "artwork": "https://..."
  }
}
