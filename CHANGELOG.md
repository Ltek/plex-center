# Changelog

## v2026.11.14.1

First release: the Plex Center integration and its Dashboard card.

**Integration**
- **No login.** Uses the Plex server of Home Assistant's Plex integration, and opens it as each TV's Plex Home
  user (managed users without a PIN) on the server side. No Plex token ever reaches a browser.
- **TVs found automatically**: PiPup and Android TV (ADB) players, paired with the Plex player in the same area or
  with a matching name, and matched to a Plex Home user by name (Living Room TV ↔ LivingRoom). Edit, add, remove or
  re-detect them under *Configure*.
- **Actions** `plex_center.play` (by key or title; play, start over, next episode) and `plex_center.control`
  (play, pause, Stop = Back, Home, seek, skip), for the card, scripts, automations and voice.
- **Playback routes**: PiPup (opens the title and presses Watch / Restart), ADB, or Plex's own remote control for
  players that accept it (Plex Web, Plex HTPC). Chosen automatically per TV, or set by hand.
- **Card API**: libraries, paged items with sort / search / unwatched, Continue Watching and Recently Added, full
  details (summary, cast, seasons, episodes, next episode, resume time), Watching now, random pick; images through
  HA with signed URLs.

**Card** (`custom:plex-center-card`, registered by the integration)
- Home: Watching now, Continue Watching (per TV user, with resume time and progress), Recently added, rows from
  upcoming-media sensors (Radarr, Sonarr, …) in upcoming-media-card's poster or fanart style, extra cards.
- Library tabs with Unwatched, sorting and search; watched marks and progress on posters; details with summary,
  cast, "ends at", Resume / Start over; shows → seasons → episodes; Play next episode.
- TV picker as buttons, a dropdown or hidden; "ask which TV each time"; lock to one TV for wall tablets.
- Now playing as a side panel (tablets: poster, big controls, Play on list) or a slim bar (top or bottom, with a
  button to show the remote buttons); scrub, ±10 / ±30 s, Stop, Home.
- Resume / Start over prompt, Surprise me with a countdown, tap-to-play option.
- Tablet and phone layouts; an editor panel that lists the related integrations found.
