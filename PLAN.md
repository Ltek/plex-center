# Plex Center (Ltek): integration + card

One HACS **integration** (`plex_center`) that also serves the **Dashboard card** (`custom:plex-center-card`).
The integration holds every Plex connection and runs playback; the card is only a front end. Supersedes the
card-only plan in `/shared/user/code/plex-library-card/PLAN.md` (that code is the starting point for the card).

Repo: `Ltek/plex-center` (HACS category *integration*), working copy `/shared/user/code/plex-center`.
Version `YYYY.MM.DD.BUILD` in `manifest.json` and the card's `BUILD_NUMBER`, CHANGELOG `## v<version>`, tag on push.

## Verified 2026-11-14

- HA's Plex integration exposes its loaded servers: `homeassistant.components.plex.helpers.get_plex_servers(hass)`
  (`{machine_id: PlexServer wrapper}`; `.plex_server` is a plexapi `PlexServer` logged in with the admin token).
- `wrapper.switch_user(username)` / plexapi `PlexServer.switchUser(username)`: the admin opens the server as a
  managed Home user, **no PIN**. HA uses it for `play_media`'s `username`.
- Internal API → fallback: the Plex config entry's `server_config` (`url`, `token`, `verify_ssl`) + our own
  `plexapi.server.PlexServer(...)`. plexapi is already installed with HA (Plex requires `PlexAPI==4.18.2`).

## Integration

**Setup (config flow, no login):** pick the Plex server (from the Plex integration). Options: the TVs, each =
name + Plex Home user (dropdown of the server's users; suggested by name: Living Room TV ↔ LivingRoom) + players
(PiPup, ADB, Plex client, suggested by area/name) + route (auto / PiPup / ADB / Plex). Tokens never leave HA.

**Per-user servers:** one `PlexServer` per mapped user (switchUser, cached, refreshed on 401). Admin TVs (PIN)
use the admin server directly; no PIN is ever asked for or stored.

**Websocket commands (card API, `plex_center/…`):**

| Command | Returns |
|---|---|
| `config` | TVs (name, user, players, route, live state), libraries per TV user, version |
| `items` | a library's items for a TV's user: paging, sort (title, added, year, rating, last viewed), filters (unwatched, in progress, genre, year, content rating), search |
| `hubs` | Plex hubs for the user: On Deck / Continue Watching, Recently Added, … (server or library) |
| `item` | full details: summary, year, rating, runtime, genres, cast, resume offset, watched, trailer/extras, seasons → episodes |
| `sessions` (subscribe) | who's watching what on which player: user, device, title, poster, progress (pushed on change) |
| `image` | signed image URL (`/api/plex_center/image/<server>/<key>?…`, served by an authenticated view; no token in the URL) |
| `random` | a random pick from a library / filter (Surprise me) |

**Actions (services):** `plex_center.play` (tv, item key or search, mode play / resume / restart / next episode),
`plex_center.play_trailer` (tv or "here"), `plex_center.control` (play, pause, stop, seek, skip, home). They run the
routes proven in `/shared/user/tv-tests/`:

- **PiPup**: `pipup.launch_app` uri + `click` (`action-button-watch` / `action-button-watchFromStart`) + `method: ok`;
  Back before starting if something plays; Stop = Back; seek via media_player / `pipup.seek`.
- **ADB**: `androidtv.adb_command` wake + `am start` link, then OK (play) or tap Restart by id; Back / Home keys.
- **Plex** (Plex Web, Plex HTPC: clients that accept remote control): `media_player.play_media` with the Plex
  payload (`username`, `offset`, `resume`).

**Entities:** per TV a `media_player.<tv>_plex_center` (combined now playing: Plex session + PiPup/ADB state,
poster, series/season/episode; play/pause/stop/seek routed as above) and a `sensor.plex_center_watching` (count +
sessions). The integration registers the card's JS (static path + `add_extra_js_url`), like Tautulli Active Streams.

## Card (front end only)

From plex-library-card, with: name **Plex Center**; TV picker chips / dropdown / hidden (fixed TV per card); all data
from `plex_center/*` (no browse_media, no sign_path); Home rows: Continue Watching (per TV user, with progress),
Recently Added, upcoming-media sensor rows (Radarr/Sonarr), **Watching now**; library grid with real filters/sort;
detail with summary, cast, Resume <time> / Start over / trailer; now-playing views: **slim bar** (top/bottom,
controls toggle) and **side panel** (tablet); Up next, Surprise me, profile lock; layouts auto / tablet / phone.
Integrations panel lists what was detected (Plex, PiPup, ADB, Android TV Remote, Cast, Tautulli, Sonarr, Radarr,
upcoming-media sensors).

## Steps (each tested before the next): all done by v2026.11.14.15

1. Integration skeleton: manifest, config flow (server pick), options (TVs ↔ users ↔ players), per-user servers.
   Tests with pytest + HA test harness or plain mocks.
2. Websocket API: `config`, `items`, `hubs`, `item`, `image` view. Tests.
3. Card moved to the new API; rename; picker option; integrations panel; now-playing views.
4. Playback in the integration (`play`, `control`, routes) + `sessions` subscribe + entities.
5. Trailers, Up next, Surprise me, profile lock, Watching now.

Not planned: management of the library, Plex sign-in, notifications (automations' job).

## Roadmap / to-do (updated 2026-11-14, v2026.11.14.15)

### Done
- Integration: no-login per-TV Plex users, TV detection + Configure page with explanations, websocket API, image proxy,
  playback routes (PiPup `method: ok`, ADB, Plex remote control), actions `play`, `control` (incl. volume / power),
  `play_trailer`, `mark`; search, filter choices, Plex hubs.
- Card: Home with Watching now, Continue watching, Recently Added / Coming Soon / Plex row sections (any number; sensor
  choice; Movies / TV filter + toggle chips; Row / Column; items to show, scroll, Auto Rotate ticker / fade with fade
  time; header, divider, item size & shape, text & colors, info lines), Home search across libraries, library tabs
  with order, filters (unwatched, genre, decade, rating, under 2 h) and sort, details (target TV or this device,
  Resume / Start over, next episode, trailer with YouTube search fallback, mark watched, auto-close), now playing
  (side panel fitting the screen, slim controls top / bottom with remote buttons, scrub, volume, power), configurable
  header (two headers, three rows, left / middle / right, TV icons, search width), Appearance, tablet / phone layouts.
- Old upcoming-media sensor rows migrate into sections.

### To check on the user's system (built, not yet confirmed)
- [ ] Plex's own trailer (an extra) opens and plays from its `plex://libraries/…/unmatched/…` link + Watch press.
- [ ] *Under 2 h* filter (Plex `duration<<`).
- [ ] Power off through PiPup: the TV may go into a standby PiPup can't wake from (seen 2026-11-13); remote needed.
- [ ] Mark watched / unwatched refreshes everywhere for the TV's user.
- [ ] Plex rows (hubs) list and items for managed users.
- [ ] SHIELD (media room): PiPup + `method: ok` (only TCLs tested).

### Next (card editor)
- [x] **Global defaults: gather every card-wide setting** (done in v2026.11.26.150) (user's request, 2026-11-25). Move into Global defaults:
  - *Counts as watched at* (`watched_pct`), now in Continue watching: it also decides Next Episode and the watched ticks.
  - From the Library panel's *Every screen* part, the settings that apply on every page: *Start on* (`start_tab`),
    *Hold to play* and its hold times (`hold_play`, `hold_ms`, `hold_mark_ms`, `hold_markall_ms`), *Tapping a poster*
    (`tap_action`), *Remember the tab, filters, sort and view* (`remember_view`), *Recent searches*
    (`recent_searches`), and the details popup's *Target dropdown*, *"This device" opens* and *Auto-close time*
    (`popup_target`, `local_app`, `popup_timeout`). The A–Z jump bar stays in Library.
  - *Weeks start on* (`week_start`) next to Date format and Clock (Calendar keeps a link).
  - Check: the *"New" flag on unwatched items* (Appearance → Posters) applies to every row; leave it in Appearance
    unless it reads better with the watched settings.
  - Keep a short "set in Global defaults" link where each setting used to be, so nobody hunts for it. Config keys
    don't change (editor only), so nothing in anyone's YAML moves.

- [ ] **Old-style chips in the editor → the normal `plce-pick` chips** (user's request, 2026-11-26; next build). The
  buttons that use the older `plce-chip` look (light outline, larger, as in the Log panel) become the editor's usual
  chips:
  - Log: **Errors / Errors and info** (a choice: `plce-pick`, lit when chosen), **Refresh** and **Clear** (actions).
  - Showtime Remote: **Add a button** and the lighting examples (`data-rmladd`), **Remove** (`data-rmldel`).
  - The Reset chips (`data-secreset`, `data-scrreset`, `data-hreset`, `data-fldreset`, `data-lookresetall`,
    `data-rowtextclear`): same chip size and shape, keeping their red hover so they still read as a reset.
  - Leave the non-button labels as they are (Controls layout's Row / place / style tags, "In use", "Hidden").
  - Check every panel in a render afterwards for any other button that still has the old look.

### Next (recommended, in order)
1. [ ] **Entity per TV** `media_player.<tv>_plex_center` (now playing with poster / show / episode; controls routed) and
   **`sensor.plex_center_watching`**. Lets the Theater Movie Lighting automation use one entity per room.
2. [ ] **"New title added" event** (`plex_center_new_title`) for notifications; replaces the Plex Recently Added sensor
   for automations.
3. [ ] **Health checks** in HA Repairs: PiPup too old, clicks not allowed for Plex, ADB disconnected.
4. [ ] **Kids limit per TV** (max content rating, enforced in the integration).
5. [ ] **Collections and playlists** as tabs or chips.
6. [ ] **Voice** (Assist custom sentences → `plex_center.play`).

### Later
- [ ] **Calendar** (upcoming movies and episodes, a day at a time), source: Prismarr. User's idea, 2026-11-14.
- [ ] Optional Tautulli Active Streams rows (popular this week, recently watched by user), only if installed.
- [ ] PiPup feature request (posted): foreground app + screenshot endpoint, so ADB is no longer needed for the
  screenshot background.

### Not planned
- Library management, Plex sign-in in the browser, notifications from the card (automations' job), Google Cast
  playback (plays in Cast's own receiver, not the Plex app).
