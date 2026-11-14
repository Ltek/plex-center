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

## Steps (each tested before the next)

1. Integration skeleton: manifest, config flow (server pick), options (TVs ↔ users ↔ players), per-user servers.
   Tests with pytest + HA test harness or plain mocks.
2. Websocket API: `config`, `items`, `hubs`, `item`, `image` view. Tests.
3. Card moved to the new API; rename; picker option; integrations panel; now-playing views.
4. Playback in the integration (`play`, `control`, routes) + `sessions` subscribe + entities.
5. Trailers, Up next, Surprise me, profile lock, Watching now.

Not planned: management of the library, Plex sign-in, notifications (automations' job).

## Roadmap (later)

- **Calendar** (upcoming movies and episodes, a day at a time): look at Prismarr as the source. User's idea, 2026-11-14.
- Optional Tautulli Active Streams rows (popular this week, recently watched by user), only if installed.
- Per-device Plex sign-in: not planned; the integration's per-TV users cover it.
