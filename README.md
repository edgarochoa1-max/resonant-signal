# Resonant MVP — Dual Mode Player (SoundCloud / Radio.co)

## Quick Start
1. Open `index.html` with a local server (VS Code Live Server).
2. In `app.js`, set:
   - `CONFIG.MODE = 'soundcloud'` and put your `SOUNDCLOUD_URL` (set/playlist or track URL), **or**
   - `CONFIG.MODE = 'radioco'` and fill `RADIOCO_STATION_ID` and `RADIOCO_STREAM`.
3. Gate: to unlock the player, enter your email and **two** invite emails. (MVP stores in `localStorage`).

## Metadata
- **SoundCloud**: Uses Widget API to pull `artist (user.username)`, `title`, `artwork`, and progress (time bar).
- **Radio.co**: Polls `https://public.radio.co/api/v2/{station_id}/track/current` for now playing + artwork.
  (Stream plays via `<audio>`).

## Notes
- Links “BUY ON BANDCAMP / DISCOGS” perform a search query using artist + title.
- This is an MVP — no backend yet. Replace with your future Supabase/Airtable endpoint for invites and audit trail.