# Changelog

## v2026.11.15.21

**New**
- **Episode picker**: seasons as chips (with a tick or "3/8 watched"), and each episode as a row with its still,
  number, title, length, how much is watched, a two-line summary, a progress bar and a watched tick. Tap the still
  to play or resume; *Start over* on started or watched episodes. The next episode to watch is outlined.
- **Details header**: the backdrop with the poster, title, ratings (IMDb, Rotten Tomatoes critic 🍅 / audience 🍿,
  TMDB, as Plex has them) and video / audio badges (4K, HD, HDR, Dolby Vision, Atmos, 7.1, 5.1).
- **Up next**: near the end of an episode (default the last 2 minutes), Now playing and the slim bar show the next
  episode with a countdown, *Play next* and *Stop after this* (stops playback when the episode ends). Optional
  auto-play for when the Plex app's own auto-play is off.
- **A–Z jump bar** beside A → Z libraries (hidden while searching or filtering).
- **List view**: a *Grid / list* button in the header (and in the Filters popover); the list shows a small poster,
  title, year · rating · length and two lines of summary. *Libraries show* sets the default.
- **Recent searches** under the search box when it's focused and empty (saved on Enter or when you open a result;
  last 8, with *Clear*).
- **Remembered on each device**: the tab, sort, filters and view come back the next time the dashboard opens.

**Integration**
- Details carry `badges`, `ratings`, and `next` for episodes; new websocket command `plex_center/letters`.

## v2026.11.15.20

**Fixed**
- **Phone posters didn't grow with Scale.** On phones, Home rows divided the width by *Items to show* (5), so posters
  got smaller as the scale went up. Poster size on phones now comes from **Posters across on phones** (default 3);
  a row with more items scrolls sideways instead of shrinking them.
- **Touch targets** stay about 44 px on the screen at any scale (they were 44 px × the scale).
- **Compact header**: the tabs dropdown was squeezed to an empty sliver, and *TV picker: dropdown* kept a wide
  dropdown. The dropdown now has room, and the TV picker is the single button in the compact header.
- **Phone preset** applies wherever the card uses the phone layout: *Layout: Phone* (any screen, also a computer)
  or *Automatic* on a phone. Before, it only applied on phone-sized screens.

**New**
- *Layout → Posters across on phones*; the phone preset sets 3 in portrait and 5 in landscape (both adjustable).

## v2026.11.15.19

**New**
- **Scale (whole card)**: *Layout → Scale*, 50–200 %, makes posters, text and buttons larger or smaller together.
- **Phone preset** (*Layout → Phone preset*): on phone-sized screens it sets the most compact header (one row, tabs as
  a dropdown in portrait, Filters popover, TV buttons as icons, slim controls at the bottom, header hides while
  scrolling) and a larger display: **130 % in portrait, 110 % in landscape** (both adjustable). It follows the
  phone's rotation. Tablets and computers are not affected.
- **After starting a title** (default): the popup or details page closes and Now playing opens for that TV, full
  screen on phones when the side panel isn't shown (close it with the chevron; tap the slim bar's title to open it
  again). *Behaviour → After starting a title → Stay on the details* turns this off.

## v2026.11.14.18

**New** (phones; settings under *Header*)
- **Compact phone header** (on by default): one row with the tabs on the left and icon buttons on the right.
  Search is an icon that opens a full-width search bar; the TV picker is one button that opens a *Play on* sheet
  (each TV with its state and who's watching); filters use the Filters popover.
- **44 px touch targets** for buttons, chips, tabs and fields on phones.
- Optional:
  - **Separate header layout for phones**, edited with *Editing the layout for: Tablets / Phones*.
  - **Tabs** as a dropdown, or as a **tab bar at the bottom** (icons and names, within thumb reach).
  - **Swipe** left / right on the content to change tab.
  - **Hide the header while scrolling down**; it comes back when scrolling up.
  - **Active filters as chips** under the header, each removable with ✕ (phones and tablets).

## v2026.11.14.17

**Fixed**
- **Phone header**: each header group gets its own full-width line, so the tabs are no longer squeezed and cut off
  (they scroll sideways when there are many). Empty groups take no space.

**New**
- **Filters popover**: one *Filters* button (with the number of active filters) opens a panel with All / Unwatched,
  sort, genre, decade, rating and *Under 2 h*, plus *Clear*; changes apply at once. *Header → Library filters*:
  Automatic (popover on phones, inline on tablets, the default), always popover, or always inline.

**Changed**
- With the target *This device*, the button reads **Open on this device** (Plex Web and the Plex app open the
  title's page; they can't start playback from a link).

## v2026.11.14.16

**Fixed**
- **Target: This device on a phone** now opens the title in the **Plex app** (its own link,
  `plex://libraries/<server>/unmatched/…`). On phones, app.plex.tv dropped the title and showed its main menu. If the
  app doesn't open within 2 s, Plex Web opens instead. Computers keep Plex Web. The app and Plex Web open the title's
  page; press Play there.

**New**
- *Library → Details & popups → "This device" opens*: Automatic (default), the Plex app, or Plex Web.

## v2026.11.14.15

**Fixed**
- Auto Rotate's fade now fades **in** as slowly as it fades out (the new set used to appear at once). The setting is
  renamed **Fade time**.
- **Every title has a Trailer button.** Plex only knows a trailer when Plex Pass trailers are on; without one, the
  button searches YouTube for "<title> <year> trailer".

**New**
- **Target** dropdown in a title's details and in the Resume / Start over popup: any TV, or **This device**. On this
  device, Play opens the title in Plex Web, and a trailer plays in the card (YouTube) or opens in YouTube / Plex Web.
  Option *Library → Details & popups → Target dropdown* (on by default).
- **Auto-close time** for popups and the full-screen details on phones: 30 s without a press by default, 0 = never.
  A trailer playing in the card and Surprise me stay open.

## v2026.11.14.14

**New**
- **Trailers on the TV**: *Trailer on <TV>* plays a Plex title's own trailer in Plex, or a Coming Soon title's
  YouTube trailer in the TV's YouTube app. *Trailer here* and *On this device* stay for YouTube trailers. Action
  `plex_center.play_trailer`.
- **Search from Home** across every library the TV's user can see, with results grouped by library.
- **More library filters** in the header: genre, decade, content rating and *Under 2 h* (movies). New header item
  *Genre / decade / rating / length*.
- **Plex rows**: *+ Plex row* adds a section from Plex's own rows ("Because you watched…", "Top rated", …), for one
  library or the whole server, with the same style options as the other sections.
- **Volume and power** in the player: volume down / mute / up with the level, and a power button (also when nothing
  plays). `plex_center.control` gains `volume_up`, `volume_down`, `mute`, `power_on`, `power_off`.
- **Mark watched / unwatched** from a title's details, for the TV's Plex user. Action `plex_center.mark`.

**Changed**
- A section's style is grouped in collapsible sub-sections: Header, Items, Item Size & Shape, Text & Colors,
  Info Lines. A new section opens its style straight away.

## v2026.11.14.13

**Changed**
- Collapsible sub-sections in the card editor look like the other Ltek cards: uppercase title in the accent color,
  a 22 px accent chevron on the right, and a divider line between them.
- "Auto play" is now **Auto Rotate**, and "Each line" is now **Info Lines**.
- A section's width, height, corner radius, item background and item border are grouped under **Item Size & Shape**.

**New**
- **Fade speed** for Auto Rotate's fade (0–3000 ms), next to how often the next set comes.

## v2026.11.14.12

**New** (Recently Added and Coming Soon, in each section's style)
- **Items to show**, default 5. The row or column fits exactly that many.
- **Scroll to see more items**: the rest are a scroll away (up to *Items to load*).
- **Auto play**: *Ticker* scrolls on its own at the speed you set (px/s); *Fade* fades out the current set and
  fades in the next one every few seconds. Both pause while the pointer is over the section, loop at the end, and
  stay still when the device asks for reduced motion.

**Fixed**
- *Home*'s section list: each section has its own icon, and the pencil and trash icons always sit in the same
  columns, so the icons line up from row to row.

## v2026.11.14.11

**Changed**
- **Sensor rows are merged into the sections.** *Coming Soon* has a *Sensors* choice (none ticked = automatic:
  Radarr / Sonarr), and *Recently Added* a *Source* (Plex Center, recommended, or a sensor such as
  `sensor.plex_recently_added`). Existing sensor rows convert on their own into Coming Soon / Recently Added
  sections, keeping their title, place, visibility and style. The separate "Rows from upcoming-media sensors" list
  is gone (its rows couldn't be removed from the ordered list).
- **Movies and TV chips** in a section's header turn each kind on or off; the *All* chip is gone.
- The style of a section opens with the **pencil** next to it in *Home*; the extra "Style" heading is gone.
- Layout names: **Row** and **Column** (was "Row of posters" and "List (upcoming-media style)").

**New**
- **Divider line** under any section's header, or none, with its own color (default: the color of the section's
  title).

## v2026.11.14.10

**New**
- **Coming Soon** section, built in: upcoming movies and episodes from the Radarr / Sonarr upcoming-media sensors,
  found automatically, merged and sorted by date. Trailers play from it. Replaces upcoming-media-card.
- **More sections**: *+ Recently Added* and *+ Coming Soon* in *Home* add as many as you like, each with its own
  title, order, show / hide and style.
- **Movies, TV or both** per section, and optional **All / Movies / TV chips** in the section's header.
- **Section header**: show or hide the title, the number of items and the icon; title in the section style
  (all caps, accent color) or plain; collapsible on or off.
- **Item height** for the list layout, and **size and color for each line** (lines 1–4) besides the title.

**Changed**
- "Recently added" is now titled **Recently Added**, matching **Coming Soon**.

## v2026.11.14.9

**New**
- **Style per Home section** for *Recently added* and each sensor row (Radarr / Sonarr coming soon, …): a *Style*
  panel under each section in *Home*.
  - **Layout**: a row of posters, or the **upcoming-media list**: a stack of items with the title and four lines on
    the left, the backdrop fading in on the right, and a "new" corner flag.
  - **Image**: poster or fanart; **Collapsible** with a header bar (icon, title, item count, start collapsed).
  - Icon, number of items, item width, corner radius, title and line size, title / line / flag colors, item
    background and border. Unset values follow the card's Appearance settings.
- Recently added items now get the same lines as upcoming-media sensors: episode, added date and time,
  SxxEyy · rating · runtime, genres; the "new" flag marks unwatched items.

## v2026.11.14.8

**New**
- **Tab order**: under *Library → Tab order*, move Home and each library left or right. Libraries added later go
  at the end.

## v2026.11.14.7

**New**
- **Search box width**: a slider under *Header* (100–800 px, default 280 px).

## v2026.11.14.6

**New**
- **Header layout** (new *Header* section in the card editor). Every header item (title, tabs, search, Surprise me,
  All / Unwatched, sort, TV picker) can be:
  - shown or hidden,
  - put in the **Library / Home** header or the **Player** header (above the player side panel on tablets),
  - placed in row 1, 2 or 3, on the left, in the middle or on the right,
  - ordered, for items in the same place.

  Rows with nothing to show are left out. Without the side panel, Player items appear in the Library header.
  The default is unchanged.
- **TV buttons as icons**: show the name, an icon, or both; pick any MDI icon per TV (default `mdi:television`).

## v2026.11.14.5

**Changed**
- **One header row**: the card title, then the tabs (Home, Movies, TV, …) right after it on every tab, then on the
  right the search, Surprise me, the All / Unwatched chips and the sort. The TV picker has its own row below.
  The tabs were missing on library tabs before.

**New**
- **Surprise me** button: icon only (default), icon and text, or text only; your own text and any MDI icon
  (default `mdi:auto-fix`).

## v2026.11.14.4

**Changed**
- **Configure** (the integration's TV settings) now explains itself: a list of the TVs with their Plex user, players
  and whether they're reachable, and when to use *Edit*, *Find new TVs*, *Add a TV by hand* and *Remove TVs*. The menu
  showed raw names (add, detect, remove) before.
- Every field on a TV's page has a short explanation.
- **Find new TVs** now shows what it found and lets you pick which to add, or says that nothing new was found.

## v2026.11.14.3

**Fixed**
- **Tablet side panel** no longer runs past the bottom of the screen: the card fits the screen height, the poster
  shrinks to fit, and the *Play on* list scrolls if there are many TVs.
- **The library scrolls on its own** while the player / status side stays in place (the header with the tabs stays
  at the top of the library side).

**New**
- *Now playing → Fit the card to the screen height* (on by default) and *Space above / below the card*, for the
  dashboard header and margins.

## v2026.11.14.2

**Fixed**
- **Fanart** now changes every row on the Home tab and the library grid (wide backdrops), not only upcoming-media rows.
- **TV picker** shows buttons when set to buttons, also on narrow cards and phones (it always fell back to a dropdown).
- **Slim controls** move to the bottom of the card when set to bottom. They were also being overwritten by the time read-out.

**Changed**
- Card editor: only one top section open at a time, and all start closed. "Look" is now **Appearance**, "Home tab" is now
  **Home**, "Slim bar" is now **Slim controls**.
- TVs in the editor are listed in one column; each TV's player badge glows green when reachable and red when not.
- Layout options moved to the top of Appearance; Appearance's groups are collapsible (Layout, Card, Posters & rows,
  Text, Colors, Row text).

**New**
- **Home**: order the sections (Watching now, Continue watching, Recently added, each sensor row, extra cards) and
  show / hide each one.
- **Card** look: background (theme, transparent, custom color or CSS), border width and color, corner radius, shadow
  and padding.
- **Text sizes in pixels** with sliders: card title, section headings, poster titles, poster lines. Older
  large / medium / small settings convert automatically.

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
