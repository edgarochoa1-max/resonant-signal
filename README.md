# Resonant — The Underground Music Signal

Resonant is a **broadcast-grade, invite-only underground music signal**.  
It synchronizes curated DJ sets in real time using a single authoritative admin console, delivering a consistent listening experience across all clients.

This repository contains the **production-ready frozen build** of Resonant.

---

## ✨ Philosophy

- **Admin is the single source of truth**
- **Listeners are strictly passive**
- **No autoplay**
- **No algorithmic manipulation**
- **No user tracking**
- **Music first, always**

Resonant measures *presence*, not clicks.

---

## 🧱 Architecture Overview

### 1. Listener App (Public)
Passive PWA that reacts only to valid broadcast state.

- `App/signal.html` → UI Shell (FINAL LOCK)
- `App/style.signal.css` → Visual layer (FINAL LOCK)
- `App/app.js` → Listener Engine (FINAL LOCK)
- `App/playlist.official.js` → Canonical playlist (FROZEN)
- `sw.js` → Service Worker (UI shell only)

### 2. Admin Console (Private)
Authoritative broadcast control surface.

- Playlist authority
- Live state control
- Transition safety
- Observer / operator modes
- Metrics (read-only, ethical)

> ⚠️ Admin files are **never cached** and are excluded from the Service Worker by design.

---

## 🔒 Freeze Status

All critical components are **sealed**.

| Component | Status |
|---------|--------|
| Listener Engine (`app.js`) | 🔒 Frozen |
| Listener UI (`signal.html`) | 🔒 Frozen |
| Listener CSS (`style.signal.css`) | 🔒 Frozen |
| Playlist (`playlist.official.js`) | 🔒 Frozen |
| Admin CSS (`style.admin.css`) | 🔒 Frozen |
| Service Worker (`sw.js`) | 🔒 Frozen |

### Change Policy
- UI file change → **Service Worker cache version bump**
- Logic change → **Major version only**
- Contract violation → **Reject**

---

## 📡 Broadcast Model

- Admin writes a **signed, leased broadcast state**
- Listener validates:
  - Version
  - Lease
  - Timestamp
- If invalid → OFF AIR
- If live → drift-safe sync via SoundCloud widget
- Snapshot recovery included
- Watchdog & freeze guards active

---

## 🚫 What Resonant Does NOT Do

- ❌ Cache audio
- ❌ Control SoundCloud streams
- ❌ Track users
- ❌ Mutate playlist on the listener
- ❌ Allow multiple authorities
- ❌ Auto-play on load

---

## 🧠 Metrics Philosophy

- Anonymous
- Local-only
- Presence-based
- No personal data
- No cross-device identity

Metrics exist to **understand signal health**, not users.

---

## 🛠 Service Worker Strategy

- UI shell cached only
- HTML → Network-first
- CSS / JS / images → Cache-first
- Audio & iframes → Never touched
- Admin / Gate / Metrics → Network only

Safe for:
- Mobile
- PWA install
- Netlify / static hosting

---

## 📱 Supported Platforms

- Mobile Safari (iOS)
- Chrome / Android
- Desktop Chrome / Safari
- PWA install (iOS & Android)

---

## 🧭 Project Status

**Production-ready. Broadcast-grade.**

Current focus:
- Admin refinement
- Real-world testing
- Mobile performance validation
- Stability under load

No redesign planned.

---

## 🧩 License & Credits

All mixes and tracks belong to their respective artists and labels.  
Resonant exists for **promotional and cultural purposes only**.

> Support the artists. Own the sound.

---

## ✨ Signature

**Resonant**  
_The Underground Music Signal_

Built with intention.  
Sealed with discipline.
