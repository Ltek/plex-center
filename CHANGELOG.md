# Changelog

## v2026.11.19.90

**Changed**
- **Surprise me:** the countdown ring says **Cancel**; tapping it stops the countdown and leaves the pick on screen.
  Pause / Continue are gone. **Something else** is now **Find New Surprise**, and **Not tonight** is gone (close
  with the X).

**Added**
- Setting **Countdown** under Every screen → Surprise me (`surprise_countdown`, on by default). Off: no ring, and
  nothing plays until you tap Play now.

## v2026.11.19.89

**Changed**
- **Surprise me:** the countdown is a ring around the number in the middle of the fanart, and a **Pause** button
  stops the timer (**Continue** starts it again). Tapping the ring pauses and continues too.

## v2026.11.19.88

**Changed**
- **The info card's layout** (details, Calendar quick look, Coming Soon, Surprise me, Resume): the poster at the
  left (episodes show the show's poster), then the date (Calendar and Coming Soon) or the type, the **show** as the
  title, the **episode title** under it, and one row with **S · E**, rating, runtime and badges. The status
  (Available / Missing / Monitored) sits at the right over the fanart.

## v2026.11.19.87

**Changed**
- **Every title popup shares the one card**: details, the Calendar's quick look, Coming Soon, **Surprise me** and
  the **Resume / Start over** popup all show the fanart with the type, title, episode line, rating, runtime and
  badges over it. Now playing uses the same title, episode line and rating / runtime pills.
- **Coming Soon details** look like the Calendar's: release type and date, status (Available / Missing /
  Monitored), episode line, runtime, network and genres (instead of the raw text lines).
- **Buttons:** *Play on*, **Trailer** and **Mark watched** share one row (the season chip goes there too); **Open
  show** sits next to Play and Start over.

## v2026.11.19.86

**Changed**
- **One details card everywhere.** A title's details and the Calendar's quick look are now the same card, in the
  quick look's format with the information over the fanart:
  - over the fanart: what it is (*Movie*, *TV show*, *Episode · <show>*, or the Calendar's release type and date),
    the title, the episode line (*S3 · E1*), then the rating, the runtime and the 4K / HDR / Atmos badges;
  - **rating and runtime are larger pills** (e.g. *TMDB 7.2*, *Rotten Tomatoes 🍅 91%*, *⏱ 1h 13m*);
  - below: the Calendar's status chips, year · content rating · genres · studio, *Ends at*, the summary and cast,
    Play on (with the season chip), and the buttons.

## v2026.11.19.85

**Changed**
- **Every TV item opens its episode.** Recently Added used to list (and open) the show; TV libraries now give the
  newest added episode of each show, like Continue watching and Coming Soon.
- **Open show on every episode**, Coming Soon too: from Sonarr / Radarr the card now asks with the TV, so an
  episode of a show that's in Plex links straight to it; otherwise Open show finds the show in Plex by its name
  (or says it isn't in Plex yet).

## v2026.11.19.84

**Fixed**
- A show's **season chips** were squashed and cut off at the bottom of its details. The season is now one chip
  on the *Play on* row (e.g. *Season 3 · 2/8*); tapping it opens a menu of the seasons with how many episodes of
  each are watched. Only the episode list scrolls.

**New**
- **View all** on any section with more items than fit at once (Continue watching, Next Episode, Coming Soon,
  Plex rows, extra rows): opens them all in a popup grid. Recently Added keeps its own (the library, newest first).
  Per row and screen: Header → *Show “View all”*.
- **Cycle** chip in the section header (and on the Continue watching banner): turns the section's scrolling or
  fading on and off. Per row and screen, Layout → **Cycle content** (*Scroll* or *Fade*; defaults to the row's Auto
  rotate, else Fade for Continue watching and Scroll for the rest) and *Cycle chip in the header*.

## v2026.11.19.83

**Fixed**
- Home showed *not a valid option at 'watched_pct'* and no Continue watching, Next Episode or Recently Added when
  the card was newer than the running integration (Home Assistant not restarted after the update). The card asks
  the old way then; restart Home Assistant to get Next Episode and the watched %.

## v2026.11.19.82

**New**
- **Next Episode** section on Home (right after Continue watching): for each show you're watching, the next
  episode you haven't started. It's in Plex, so it isn't in Coming Soon. Shows with an episode in progress stay in
  Continue watching. Its own panel in the editor (Screen Profile like the other rows).
- **Counts as watched at** (Continue watching → Every screen, 95 % by default): an episode or movie watched this far
  leaves Continue watching; for a show, the episode after it moves to Next Episode.
- **Open show** on every episode: its details, the Continue watching banner, the Resume / Start over popup, Now
  playing (and its *TV is off* panel) and the Calendar's quick look. It opens the show's seasons and episodes.

**Changed**
- **Continue watching** shows each show once, with its latest episode in progress, and leaves out anything past the
  watched %.
- **Coming Soon** leaves out what's already in Plex: downloaded (Sonarr / Radarr), linked to Plex, or in Recently
  Added, Continue watching or Next Episode.

## v2026.11.17.81

**Fixed**
- **Tapping Watching now didn't open Now playing** for a show paused more than 2 minutes: .80 treated any Plex
  pause that long as a leftover from a TV that was turned off. Removed; only the TV's own power decides now.
- A TV woken with its remote while Plex still reports the paused title it was turned off with (its app is gone)
  shows **Ready to resume** in Watching now, Now playing and the TV selector, and Play resumes it, instead of
  controls that do nothing.

## v2026.11.17.80

**Fixed**
- **A TV that's turned off no longer shows as on or playing.** Plex keeps a paused session long after the TV
  goes off; Plex Center now reads the TV's power from the TV itself (PiPup, ADB, Android TV Remote), never from the
  Plex player. Its session leaves Watching now and Now playing.
- **Playing on a TV that was asleep or on its screensaver** (the "Plex is not on screen within 25 s" error):
  - the TV is turned on and the screensaver closed first (and any "not responding" box);
  - no Back press when nothing really plays (the stale Plex session used to trigger one);
  - Plex gets 45 s to open; if it still isn't on screen, Home and one more try;
  - a clear message when it fails: *Plex didn't open on Living Room TV. Try again.*
- **Turn off is never a deep sleep.** Only ADB's sleep key or the Android TV Remote's Power key (the same standby
  as the TV's remote), so Home Assistant can wake it again. PiPup's turn off is never used. A TV with neither has
  no Turn off button.

**New**
- **Resume where you left off.** When a TV is turned off while something plays or is paused, Plex Center
  remembers it (kept through restarts).
  - Watching now shows it as a card: *TV off · Paused at 6:29 of 43:46*, with **Resume** and ✕.
  - Now playing shows *TV is off* with **Turn on and resume**.
  - The TV selector marks the TV with an amber dot and a ⏯ icon; its menus say *Off · Resume <title>*.
  - Resume turns the TV on, closes the screensaver and starts the title at Plex's saved position. Other apps
    (optional): opens the app and presses Play, best effort.
  - New action `plex_center.resume` (tv).
  - Forgotten when something else plays on that TV, on ✕, when the episode is marked watched, or after the
    *Forget after* time.
  - Settings (Watching now → Every screen → When a TV is turned off): *Keep it, to resume later* (default) or
    *Drop it*; *Forget after* (12 h, 0 = never); *Keep other apps too* (off).
- **Android TV Remote player per TV** (Plex Center → Configure → a TV), filled in automatically: used for the TV's
  power state and for turning it on and off.

## v2026.11.17.79

**Changed**
- Removed unused code: the rest of the old slim Now playing bar (its markup, styles, settings and button handlers),
  two editor panels and three helpers nothing called, and three unused names in the integration. No visible change;
  old `slim_*` settings are still cleaned out of saved configs.

## v2026.11.17.78

**New**
- Watching now → Header → Chevron:
  - **Chevron size** (0 = a little larger than the header text, the new default; it was the same size and looked
    too small).
  - **Chevron weight**: *Header text* (default), *Light*, *Normal*, *Bold*, *Heavy*.
  - More placements: *Left of the header text*, *Right of the text* (default), *After the count*, *Far right*.

## v2026.11.17.77

**New**
- Section **Header** options (per row, per screen):
  - **Section Title** placement: *Left* (default), *Center* or *Right*.
  - **Chips** placement (Movies and TV chips): *Center* or *Right* (default).
  - **Show “View all”** (Recently Added), on by default.

**Changed**
- **Hide Section Title** and **Movies and TV chips** moved from the top of a row's profile into its *Header* section.

## v2026.11.17.76

**Changed**
- **Now playing no longer opens by itself** when the page loads and the selected TV is playing. It opens when you
  tap a Watching now card or start a title. To have it open by itself, turn on Now playing → Side panel →
  *Open by itself when the selected TV is playing* (off by default).
- **Watching now's chevron** sits right next to the header text and takes its size, weight and colour.
  Watching now → Header → *Chevron*: *Left of the header text* or *Right of the text* (default).

## v2026.11.17.75

**Fixed**
- **Watching now didn't collapse**: tapping its header turned the chevron but the cards stayed. They fold away now.

**Changed**
- A collapsible Watching now keeps its normal section header; tapping the header (or Enter / Space) folds and
  unfolds it.

**New**
- Watching now → *Header*: **Show the header icon** and **Show the chevron** (collapsible pages), both on by default.

## v2026.11.17.74

**New**
- **Watching now includes TVs playing other apps** (Watching now → *Include TVs playing other apps*, on by default).
  A TV playing HBO Max, Netflix and so on gets a card with the title, the TV and the app, and its progress, read
  from the TV itself (Plex doesn't know about it). Tapping it opens that TV's controls. The header chip counts it.
  A TV whose playback Plex already reports shows once.

## v2026.11.17.73

**Fixed**
- **Now playing poster** when the TV plays another app (HBO Max, Netflix …): the TV's picture often doesn't load
  (a 404 from Home Assistant), which left an empty box. A TV icon and the app's name show under it now, so they appear
  whenever there's no picture.

## v2026.11.17.72

**New**
- **Calendar on phones: Month / Week / Day** buttons and a *Today* chip under the header.
  - *Month* is the compact month with the chosen day's entries below (as before).
  - *Week* shows a strip of the week's 7 days, then every day's entries under its own heading.
  - *Day* shows the same strip with that day picked, then its entries.
  - Tapping a day in the strip or a day heading opens that Day; the arrows step a month, a week or a day.
  - The phone calendar now opens in the *Opens in* view from the Calendar settings (Month by default).

## v2026.11.17.71

**New**
- **Watching now chip** for the header (Controls layout → *Watching now*, hidden by default): shows how many are
  watching and opens the Watching now cards in a popover on any page. Tapping a card opens that TV's controls.

**Changed**
- **Watching now options are per page** (Home, Calendar, Library), each a checkbox: *Show on page*, *Collapsible*
  and *Start collapsed*. Collapsible appears for the pages it shows on, Start collapsed for the collapsible ones.
  Older settings carry over (*Also above the library and Calendar pages*, *Collapsible*, *Start collapsed*).

## v2026.11.17.70

**New**
- **Hold to play** (Library → *Hold to play*, on by default, *Hold for* 2 s): Play, Resume, Start over and the ▶ on
  posters and episodes start only after being held; the button fills while you hold it, and a quick tap shows
  *Hold Play for 2 s to start*. Keyboard Enter still plays at once. The Now playing controls aren't affected.
- **Play on in the Calendar's quick look**: when the title is in Plex, a *Play on* chip next to Play picks the TV
  (or this device).

**Changed**
- In a title's details, **Play on** and the **Play / Start over / Trailer / Mark watched** buttons are above the
  season and episode list (they were below it, often off screen).

## v2026.11.17.69

**Changed** (Now playing, tablets and full screen)
- A **Close (X)** button at the top-right of the poster. On tablets it hides the side panel until something else
  plays or you tap a Watching now card; full screen it closes the view.
- **Move to a different TV** is an overlay at the top-left of the poster.
- The **power button** is off by default (*Watching now → Power button on the Now playing poster*); when on, it sits
  at the bottom-right of the poster and **asks before turning the TV off**.

**New** (Watching now)
- **Collapsible**, with **Start collapsed on Home** and **Start collapsed on the library and Calendar pages** as
  separate settings. Watching now also shows on the **Calendar** page (with *Also above the library and Calendar
  pages*).

**Fixed**
- Watching now showed *S2026 · Eundefined* for live TV (no season / episode numbers).

## v2026.11.17.68

**Changed**
- **Text Lines: *Hidden* is a checkbox** next to each field instead of a choice in the line list. A hidden field
  keeps its line and order (shown, disabled), so un-hiding puts it back where it was. Fields hidden by default
  (Year, Day, Date, Time, Studio on rows) have a place to come back to. Earlier "Hidden" choices are kept.

## v2026.11.17.67

**Fixed**
- **The details panel scrolled away with the library** on tablets. The card clipped its content with
  `overflow: hidden`, which made it a scroll box and stopped the panel from staying put. It now uses
  `overflow: clip` (the same rounded corners), and the panel stays in view just below the dashboard's header while
  the library scrolls; a panel taller than the screen scrolls on its own.

## v2026.11.17.66

**New: Text Lines place each field**
- In every **Text Lines** section, each piece of information is a field with a **Line** (1–5, or *Hidden*), its
  **order** on the line (1st, 2nd…) and its own **size, weight and colour**. Fields on the same line are joined with
  “ · ”; empty ones are left out. Locked, each field shows as chips (*Air date · Line 3 · 1st*, or *Hidden*);
  *Unlock to edit*. **Reset to defaults** (asks first) puts the screen's lines back.
- **Calendar**: Title, New season / Premiere / Finale, Episode, Episode title, Release type, **Air date**, **Time**,
  **Network / studio**, **Runtime** (each on its own now). Defaults are today's lines.
- **Rows** (Recently Added, Coming Soon, Plex rows, Continue watching, Library): Title, Episode title, Release /
  added, Episode number, Rating, Runtime, Genres, and (hidden by default) Year, Day, Date, Time, Studio. A row keeps
  its current lines (Appearance → Row text) until you change one of its fields.
- **Watching now**: Title, Episode, Episode title, Year, Who and where, Paused.

**Changed**
- **One panel per row**: each Recently Added, Coming Soon and Plex row has its own panel in *Sections* (named by
  its title, e.g. *Coming Soon · Movies coming soon*), with its Source, its Screen Profile and *Remove this row*
  (asks first) for rows you added. **+ Recently Added / + Coming Soon / + Plex row** are at the top of *Sections*.

## v2026.11.17.65

**Changed: one layout for every panel**
1. What you're editing: the **row chips** (Recently Added, Coming Soon, Plex rows), then that row's **Source** as a
   chip (*Source: Plex Center ▾*) that opens its options. Each row has its own source, shared by every screen
   type.
2. **Screen Profile** (subtitle, *Select Screen type to edit that profile.*, the screen chips), then
   *Settings for <screen>* with that screen's settings and Reset.
3. **Every screen**: settings that don't depend on the screen type, at the bottom.
- **Home**: Screen Profile first (the section order / show / hide list, then the add buttons, no subtitle); under
  *Every screen*: Auto Rotate and Surprise me. Its Reset clears that screen's order and visible sections.
- Watching now, Library and Calendar: their profile first, their other options (the library list, Watching now's
  options, the Calendar's page settings) under *Every screen*.

## v2026.11.16.64

**New**
- **Time between sections** (Home → Auto Rotate, with Stagger on; 1–15 s, default 3 s): sections that fade or
  slide change one at a time, this long apart, in Home order. A section changes at most once per round (number of
  sections × the gap, or its own cycle if longer); the editor shows the result, e.g. *3 sections: one changes every
  3 s, so each changes every 9 s*.
- **Compact icon picker** everywhere in the editor (surprise me, section header icons, page icons, TV icons): a
  chip with the icon and its name that opens a small panel with a search box (any `mdi:` name, Enter to use it),
  a grid of common icons and *Default*. Replaces Home Assistant's large icon field.

**Changed**
- **Home panel** in groups: *Add a section*, *Auto Rotate*, *Surprise me*, then **Sections** (screen chips and the
  order / show / hide list) last.

## v2026.11.16.63

**New**
- **Stagger auto-rotate** (Home panel, card-wide, off by default): sections that fade or slide change one after
  another, spread evenly over the cycle (in Home order) instead of all at once; scrolling rows start a moment apart
  and run at slightly different speeds so they don't move in step.

## v2026.11.16.62

**Fixed**
- **Auto Rotate (scroll, fade, slide) stopped on the live dashboard** but worked with the editor open. Dashboards
  detach and re-attach cards while loading or resizing; that stopped the timers, and the sections didn't repaint
  afterwards (nothing had changed), so they never started again. Re-attaching now repaints the Home sections and
  restarts them. Affects every section and the Continue watching banner.
- **Scroll never moved on the live dashboard**: rows snap to the nearest poster, and the browser pulled each
  1–2 px step straight back. Snapping is off while a row or column auto-scrolls.

## v2026.11.16.61

**Changed** (every section panel)
- **Layout** is only how items show and move: layout, items to show, scroll, Auto Rotate (direction and timings),
  items to load. For the Continue watching banner, *Scroll to see more items* is hidden (one title at a time) and
  *Items to load* reads **Titles to rotate through**.
- **Content Visuals** is how each item looks: image style, border, icons, watched tick, Fanart / Fanart fade
  settings, corner radius, and the **"New" flag** on / off (moved from Layout) with its colour.
- The Fanart fade sliders no longer clash with Auto Rotate's fade: **Image fade starts at** and **Image fade
  length**.

## v2026.11.16.60

**New** (Layout → Auto Rotate, per section and screen)
- **Scroll direction**: rows scroll **Left** or **Right** (Right starts at the end and moves back), columns **Up** or
  **Down**.
- **Continue watching banner: Slide** (new, next to Fade): the title slides out and the next one slides in,
  **Left**, **Right**, **Up** or **Down**, with *Next title every* (default 5 s) and *Slide time*.

## v2026.11.16.59

**Fixed**
- **Continue watching banner didn't fade**: it paused whenever the mouse was anywhere over it (on a computer that's
  most of the time), and any repaint (new progress from the TV, a state update) restarted its timer. It now pauses
  only while the pointer is on its buttons, and one timer keeps running across repaints. First change after
  *Next set every* + 2 × the fade time (7.4 s with the defaults).

## v2026.11.16.58

**Fixed**
- **Continue watching's auto-rotate** didn't work: the regular refresh repainted the section every few seconds,
  restarting the timer before it fired. It now repaints only when something changed. The **banner fades** to the
  next title (it used to jump), and its Auto Rotate offers *Off / Fade*.
- **Fade in and fade out take the same time**: the next set's images load while the old set fades out (they used
  to pop in, so the fade-in looked shorter), and both use the same easing.
- **Items to show** slider no longer runs off the editor (shorter label, the note below it); it's hidden for the
  banner.
- **Fanart fade** blends smoothly: the fade from dark to the picture is eased instead of a straight line.

**Changed**
- Auto-rotate defaults: **next set every 5 s**, **fade time 1200 ms**.
- *Ticker* is now **Scroll** (*Scrolling speed*).

## v2026.11.16.57

**Fixed**
- **Edge blur** on the Fanart box backdrop now blurs the box itself, so its edges dissolve completely (it only
  added a soft glow around a sharp box before).

**New** (Content Visuals)
- Box backdrop: **Box fade direction** (No fade, Bottom to top, Top to bottom, Left to right, Right to left, Center
  out, Out to center) and **Fade starts at** %.
- Gradient backdrop: **Fade starts at** % (fully dark up to there, then fading out to the strength).
- **Fanart fade**: **Fade starts at (from the left)** %, with the fade distance and image width.

## v2026.11.16.56

**New** (Content Visuals, per section and screen)
- **Fanart** text backdrop:
  - *Gradient*: **direction** (Bottom to top, Top to bottom, Left to right, Right to left, Center out, Out to
    center) and **strength** (how far it reaches across the image), with the opacity. The gradient now covers the
    whole image, not only the text area.
  - *A box only behind the text*: **edge blur** (soft edges), with the opacity.
- **Fanart fade** (renamed from *Fanart – fade*): **fade distance** (how long the fade is) and **image width**.
- Also for the Calendar.

## v2026.11.16.55

**New** (Continue watching)
- **Layout per screen**: *Banner, one at a time* (the tablets' default), *Row* (the phones' default) or *Column*.
  Row and Column work like the other sections: items to show, scroll, auto-rotate (ticker or fade), header, and
  Content Visuals (Poster / Fanart / Fanart – fade). The banner can auto-rotate too (the next title every N
  seconds; it pauses while the pointer is on it).
- **Mark watched** on the banner, after a confirmation. *Mark watched / unwatched* in a title's details asks first
  too.

**Changed**
- Continue watching's panel has the same Screen Profile as the rows (Section Title, Header, Layout, Text Lines,
  Content Visuals, Reset).

## v2026.11.16.54

**Changed** (every section panel)
- **Screen Profile** is a subtitle with *Select Screen type to edit that profile*; the screen's settings sit under a
  divider that reads **Settings for <screen>** (no filled box, no *Content & Layout* heading).
- **Section Title**, with **Hide Section Title** (moved out of Header).
- **Text Lines** now holds all text settings (title and lines 1–4: show, size, weight, colour); *Text Attributes* is
  gone and its title / line sizes and colours moved into Text Lines on each screen.
- **Content Visuals** (was *Item Visuals*): image style, border, icons, watched tick, corner radius and the
  **"New" flag colour** (moved from Text Attributes).

**New**
- **Fanart text backdrop** (Content Visuals, for Fanart and Fanart – fade): *Gradient from the bottom*, *A box only
  behind the text* or *None*, and its **opacity**, per section and screen. Also for the Calendar.
- **Resets** (both ask first): **Reset this screen type** in Screens clears everything for that screen type (its
  screen settings, Home order and visible sections, every section's settings on it); **Reset** next to *Settings
  for <screen>* in a section clears just that section on that screen. Sources and other screen types are kept.

**Fixed**
- A section row's look is its own: a second Coming Soon or Recently Added row no longer takes the first row's
  look. (A second row set to Fanart only through the old card-wide image style may need Fanart set again.)

## v2026.11.16.53

**Changed: screen profiles**
- In each section panel, **only the Source is shared** by every screen type (Recently Added's source, Coming Soon's
  sensors / Sonarr-Radarr, a Plex row's library and row). **Everything else is the screen's profile**: pick the
  screen chip once and the box below it, *Settings for <screen>*, shows and edits that screen's title, Movies / TV,
  header, layout, items to show, auto-rotate, text and visuals.
- The box: **Content & Layout** (title, Show), then the collapsible **Header**, **Layout** (was *Items*: row /
  column, items to show, scroll, auto-rotate, "New" flag), **Text Lines**, **Text Attributes** (was *Text &
  Colors*) and **Item Visuals** (was *Item Size & Shape*, now also the image style chips, border, icons and watched
  tick).
- Watching now, Continue watching, Library and Calendar use the same screen box for their visuals.
- *Items to show* is one setting per screen (was separate tablet / phone settings).
- Existing row settings are copied to every screen profile (phones keep their own item count), so nothing changes on
  the dashboard.

## v2026.11.16.52

**Fixed**
- **Cut-off text on Fanart rows**: a row in Fanart now shows half as many items across as Posters across (wider
  tiles, so the lines fit), titles are kept to two lines, and the text never runs above the image. A row's own
  *Items to show* still wins.

**Changed** (section panels)
- *Look* is now **Visuals**. The row's **Title** and **Show** (Movies / TV) are there too.
- **Info Lines** is merged into Visuals: **Text lines** is a collapsible section of its own (title and lines 1–4:
  show, size, weight, colour, per screen). Existing Info Lines sizes and colours move there for every screen.
- **Source** (Plex row, Recently Added source, Coming Soon sensors) is a collapsible section.
- Appearance → *Posters & rows* no longer has the card-wide **Image style**: it's per section, in Visuals.
  A card set to Fanart gets Fanart in every section's Visuals, so nothing changes on the dashboard.

## v2026.11.16.51

**Changed: the editor has one place per section**
- **Sections** group with a panel each: **Watching now**, **Continue watching**, **Recently Added**, **Coming
  Soon**, **Plex rows**, **Library**, **Calendar**. Each holds everything about that section: what it shows (the
  same on every screen) and its **Look per screen type**, with the **Image style** as chips at the top: *Poster*,
  *Fanart*, *Fanart – fade* (the upcoming-media look).
- **Chips instead of dropdowns**: screen types (the lit chip is the one being edited; a green dot marks the one in
  the preview; one choice for the whole editor), the rows of a section (e.g. *Coming Soon* and a second Coming Soon
  row, with *+ Add*), and the controls layout being edited.
- **Home** keeps order and show / hide per screen type; its pencil opens the section's panel. Adding a row opens
  it there.
- **Screens** shows one screen type at a time (chips) and now also has the side-panel settings. *Libraries show*
  moved to **Library**, which also holds the library list and behaviour (was under Apps & devices). *Now playing*
  and *Appearance → Items* are gone (their settings are in Watching now, Screens and the section panels).
- Each Home row has its own look per screen; a row's old pencil image is copied to every screen type.

## v2026.11.16.50

**New**
- **Appearance → Items**: a look for each kind of item **on each screen type**: Watching now, Continue watching,
  Recently Added, Coming Soon, Plex rows, Library grid and Calendar (pick the kind and the screen; the screen in the
  preview is marked). The same options as the Calendar's look: **Image style** (*Poster*, *Fanart* with a shade
  behind the text, *Fanart – fade*, the upcoming-media look), show / size / weight / colour for each text line,
  left border, movie / TV icon in the corner, the watched tick; resets for each and *Reset all*.
  Only what you change applies; a Home section's own settings (its pencil) still win.
- **Home per screen type**: *Order and show / hide on* picks the screen type; each has its own order and visible
  sections. A section's content and style stay the same on every screen. Existing order / hidden sections are
  copied to every screen type.

## v2026.11.16.49

**After updating: restart Home Assistant** (the calendar command now marks what's in Plex and watched).

**New** (Calendar → *Look (per screen type)*; each of the four screen types has its own look)
- **Image style**: *Poster*, *Fanart* (the backdrop behind the text, shaded so it stays readable) or **Fanart –
  fade** (the upcoming-media look: the backdrop on the right fading in behind the text).
- **Each text line** (title, episode / release info, air date and time, network / studio · runtime): show or
  hide, size, weight and colour (four-mode), each with its own reset; *Reset all* for the screen. Posters and panels
  grow with the title size.
- **Coloured left border** on or off; **movie / TV icon** in the lower-right corner; **air time** in the
  lower-right corner instead of the date line.
- **Status marks**: a solid green dot when it's available (downloaded), a **tick when this TV's Plex user has
  watched it**. The calendar now matches each entry to Plex (by TMDB / TVDB id) for the selected TV's Plex user,
  so the quick look shows *Watched* and offers Play straight away.
- Applies to the Week and Day views and the phone list (Month view keeps its compact blocks).

## v2026.11.16.48

**New**
- **Calendar on phones** (like nzb360): a compact month (each day with up to three coloured dots and a
  *New season* / *Premiere* / *Finale* label), the chosen day outlined, and that day's entries as cards below:
  a colour bar, poster, title, what it is (`2x01 – 2x08` for a season dropped at once, with a count ring) and when.
  Back / forward move a month; the filters sit behind a filter button. Tap a card for the quick look.
- **Coming Soon from Sonarr / Radarr**: a Coming Soon section's *Source* can be **Plex Center: Sonarr / Radarr**
  (each show's next episode and each movie's next release, the next 60 days, with *New season* flags, Radarr's
  trailer and the release type). It is also used automatically when there are no upcoming-media sensors. With this,
  the *Sonarr Upcoming Media* and *Radarr Upcoming Media* integrations are no longer needed.

## v2026.11.16.47

**After updating: restart Home Assistant** (the integration has a new command).

**New**
- **Calendar page** (in the page menu, after Home): upcoming episodes from Sonarr and movie releases from Radarr,
  each release its own entry (**in cinemas**, **digital**, **Blu-ray**). Read through Home Assistant's own Sonarr
  and Radarr integrations (their address and API key; the key never leaves Home Assistant); duplicates across
  instances (e.g. 1080p and 4K Radarr) are shown once.
  - **Month** (6 weeks, colour-coded entries, *New season* / *Premiere* / *Finale*, “+N more”), **Week** (a column
    per day with poster cards) and **Day** (a list with posters and overviews); *Today* and back / forward.
  - **Filters** with coloured dots: In cinemas, Digital, Blu-ray, Episodes; status: Monitored, Missing,
    Available.
  - **Quick look** on tap: fanart and poster, type, date and time, status, network / studio, runtime, genres,
    overview; **Trailer** (Radarr's trailer, else a YouTube search) on the TV or this device; **Play** / **Play next
    episode** when the title is in Plex.
  - A note when Sonarr or Radarr can't be reached.
  - Editor: *Calendar* panel: show the page, the view it opens in, first day of the week, entries per day.
- Integration: `plex_center/calendar` websocket command; `plex_center/config` reports which of Sonarr / Radarr
  are set up.

The design and features follow Prismarr's calendar; the code is Plex Center's own (Prismarr is AGPL-3.0, Plex
Center MIT: nothing was copied).

## v2026.11.16.46

**Changed** (Controls layout panel)
- An **In use** chip shows the layout the screen in the preview uses (Standard, Compact one row or ★ name).
- **Opening the panel edits the layout in use** on the screen in the preview.
- A small **Reset** chip next to *Editing* resets Standard to its built-in defaults (after a confirm); shown when
  Standard has been changed.
- Each item has an **icon for what it is** (page menu, search, genre, sort, TV picker, …) instead of the drag
  lines.
- **Colour-coded chips** in the locked list: the place (Header blue, Player header purple, Footer green, Filters
  popup amber), then row, side and style in quieter styles.

## v2026.11.16.45

**New**
- **Saved controls layouts.** In *Controls layout*: *Save as new layout* stores the list you're editing under a
  name (and can use it right away on the screen in the preview); *Copy Compact one row* starts one from the
  built-in compact layout; *Rename*, *Delete* (screens using it go back to Standard), *Export* and *Import* (adds a
  new layout, never replaces one). *Editing* picks which layout the list edits and says which screens use it.
  Each screen picks its layout in *Screens → Controls layout to use*: **Standard**, **Compact one row** or any
  saved layout (★). Several screens can share one.
- **Show the title** (in every layout), next to the Title, now in Controls layout.

**Changed**
- Renamed for clarity: the *Layout* panel is **Screens**; its *Layout* setting is **Device type** (*Automatic
  (phone when the card is narrower than 600 px)*, *Always tablet / computer*, *Always phone*); *Header & footer* is
  **Controls layout**; *Header & footer arrangement* is **Controls layout to use**, and *Shared* is **Standard**.
- A screen's "Custom for this screen" list becomes a saved layout named after the screen (for example
  *Phone: portrait*), used by that screen: nothing changes on the dashboard.

## v2026.11.16.44

**New**
- **Active filters is a Header & footer item**: show / hide it, and place it like any other item (Header, Player
  header or Footer, row 1–3, left / middle / right). It replaces the separate *Show the active filters as chips*
  checkbox; cards that had it on get the item shown in their arrangements.

**Changed**
- Layout → each screen: *Header layout* is now **Header & footer arrangement**, with clearer choices:
  **Shared** (the arrangement edited in Header & footer, used by every screen set to Shared), **Compact one row**
  (built in: pages left, buttons right) and **Custom for this screen** (its own list, picked under *Editing* in
  Header & footer).

## v2026.11.16.43

**After updating: restart Home Assistant, then close and reopen the Companion App.**

**Fixed**
- **The card often failed to load in the Android Companion App** ("Configuration error" / *Custom element doesn't
  exist*) while it worked in a PC browser. The card was loaded only as an extra frontend module, which Home
  Assistant fetches after the frontend starts, so a dashboard could render before the card was defined, most often
  in the phone app on a cold start. The card is now a **Dashboard resource** (Settings → Dashboards → Resources,
  type *JavaScript module*), the way cards normally load, at `/plex_center/plex-center-card.js?v=<version>&m=<file
  time>`. Plex Center keeps that one entry up to date on every start (a new build updates its URL) and removes
  duplicates of it. Only when resources can't be edited (dashboards in YAML mode, Lovelace not set up, or an
  error) is the card still loaded as an extra frontend module; it is never loaded both ways.
- `lovelace` is now in the manifest's `after_dependencies`, so the resources exist when the card is registered.

## v2026.11.16.42

**Removed**
- **The slim bar.** Watching now replaces it: tap a Watching now card for the controls (full screen on phones).
  Screens that used the slim bar change to *Off*; tablets can still show the side panel while something plays
  (per screen, in Layout).

**New**
- **Watching now → Show**: *Every TV (and other Plex players)* (default) or *Only the TV in the selector*; it
  follows the selector.
- **Watching now above the library pages** too (on by default; Now playing panel), so the controls are one tap
  away from any page.

## v2026.11.16.41

**Fixed**
- **The slim bar still showed on Home next to Watching now** when the TV's Plex user in Plex Center differed from
  the user in the Plex session (for example a Shield set to another user while *MediaRoom* watches on it). A
  session is now matched to a TV by the Plex user, else by the player's name (e.g. *SHIELD* → Shield), else by what
  that TV is playing. The same matching is used for the Watching now remote button, *Move to a different TV*,
  Up next and the TV menus.

## v2026.11.16.40

**Changed**
- **The Filters button** looks like the TV picker chip (theme colors, name in bold, a chevron) instead of turning
  the Accent color when filters are on; the count is a small neutral badge.

## v2026.11.16.39

**Fixed**
- **The Filters popup** is only as large as its content, centered, and *Clear* / *Done* are normal-size buttons
  (Done was stretched across the panel).

**Changed**
- **Active-filter chips** (Header & footer → *Show the active filters as chips*) no longer have an ✕. Tapping one
  opens a menu like the TV picker's: the other choices (current one ticked) and **Remove filter**. The
  **All / Unwatched** chip is always shown when that item is visible (as *All* or *Unwatched*).

## v2026.11.16.38

**New**
- **Every library filter is its own item** in Header & footer: *All / Unwatched*, *Genre*, *Decade*, *Content
  rating*, *Under 2 h*, *Sort*, *Grid / list*, plus the **Filters button**. Each can be shown or hidden, ordered,
  and placed in the Header, the Player header, the Footer or the **Filters popup**.
- **Filter chips**: Genre, Decade, Content rating and Sort show as a chip with the current value (for example
  *Genre Comedy*, highlighted when set) that opens a menu to pick from (*Any …* clears it). Each item's *Style*
  can be the chip (default) or a dropdown; All / Unwatched can be two buttons (default) or one chip.
- **The Filters popup** shows exactly the items placed in it, in list order; the Filters button appears only when
  it has something, and its count is the active filters inside it.
- Per screen (Layout), *Library filters*: **As placed in Header & footer** (default on tablets) or **All in the
  Filters popup** (default on phones).

**Changed**
- The old *All / Unwatched* and *Genre / decade / rating / length* items are split into the new items, in the same
  places; a Filters button is added where *All / Unwatched* was.

## v2026.11.16.37

**Fixed**
- **Middle items weren't centered** when a header row was too full to fit on one line (for example on a library
  page, where All / Unwatched, sort and the filters join the row): the row wrapped as a whole and the middle group
  ended up on the right. Header rows are now three columns, left and right of equal width with the middle exactly
  in the center; items that don't fit wrap inside their own column. Phones (stacked groups), the one-row header and
  the footer keep their layouts.

## v2026.11.16.36

**New**
- **Saved presets** (Appearance → Page menu): *Save as new preset* stores how the page buttons look now (the preset
  and every ticked group) under a name, in this card's settings. Saved presets show in the Preset list with a ★.
  With one picked: *Update “name”* saves your changes into it, *Delete “name”* removes it and keeps the look as the
  card's own settings. Export includes a saved preset's full look and name.

**Removed**
- The sample buttons in the editor: the dashboard preview shows page button changes as you make them (the note at
  the top still says when the screen in the preview shows a chip instead of buttons).

## v2026.11.16.35

**Fixed**
- **The page buttons' glow and drop shadow were cut off** at the edges of the page bar: the bar scrolls sideways,
  and a scrolling box clips anything drawn outside it. The bar now keeps room inside for the glow / shadow (as
  much as they reach, up to 24 px) and pulls back out by the same amount, so the buttons stay where they were. The
  one-row header no longer clips it either.

## v2026.11.16.34

**New**
- **Export style / Import style** in Appearance → Page menu. Export shows the page button style as text, with
  *Copy to clipboard*, to use on another Plex Center card (page icons stay with each card). Import takes that text,
  or **a Color Light Manager Button Style** (the Button Styles export: a single style, a layered style, or the
  library file, of which the first style is used): its background, line and gradient borders, glow, drop shadow,
  text, icon color and size become the page button settings, all groups ticked, starting from Neon. Colors set to
  "match" (the light's color) become the Accent. Import replaces the current page style and keeps the page icons.

## v2026.11.15.33

**New**
- **Appearance → Page menu works like the Style Builder** (for the page buttons only):
  - a **live sample** at the top (an *Active* and two *Not active* buttons, drawn with the card's own styles), which
    follows every change, also when the preview shows another page menu type;
  - the preset, then **one checkbox per group**: Content, Background, Line border, **Gradient border**, **Glow**,
    **Drop shadow**, Text, Icon, Button shape. Tick a group to set its own values (it opens); untick it to use the
    preset's again (its values are cleared);
  - **Active / Not active** colors in each group (was "current page" / other pages);
  - new: gradient lines (top and bottom, bottom, top or all four edges; width; colors), glow (off, active page
    only, every page; color, blur, spread, opacity), drop shadow (X, Y, blur, spread, color, opacity), and an
    underline for the active page in the Line border group;
  - *Page icons* in their own section; *Back to the preset* keeps them.
- The presets use the new groups: *Glass* has an active glow and a soft shadow, *Neon* gradient lines, an active
  glow and a shadow.

**Changed**
- "Current page marked by" is replaced by the groups above; *underline* and *glow* settings migrate.

## v2026.11.15.32

**Changed**
- **Play on** (was *Target*) on the details page and the Resume / Start over popup is a chip with the TV's icon and
  name that opens the same menu as the other pickers: each TV with its state, *This device*, the current one ticked.
- **Coming Soon** (and other titles that aren't in the library) no longer show a Play on picker: there is nothing
  to play, only the trailer.

## v2026.11.15.31

**Fixed**
- **Phones (Companion App) kept an old copy of the card** after an update, so the card and its saved settings
  could disagree and HA showed *Configuration error*. The integration now serves the card itself with
  `Cache-Control: no-cache` and an ETag: every device checks for a newer copy on each load (a quick "not changed"
  answer when there isn't one).
- **The card never shows "Configuration error"** for its own settings any more: if part of the config can't be
  read, the card still loads and shows the reason at the top.
- **Older copy notice**: when a device runs an older card than the one in Home Assistant, the card says so, with
  a *Reload* button. (`plex_center/config` now returns `card_version`, read from the card file.)

## v2026.11.15.30

**New**
- **"In the preview now"**: Layout marks the screen the card is showing (for example *Phone: portrait* when the
  card is narrow or set to Layout: Phone), so it's clear which screen's settings the preview follows.
- **Appearance → Page menu warns** when the screen in the preview shows the page menu as a chip or icon button: the
  page menu styles only show where *Page menu* is *Buttons*.

## v2026.11.15.29

**New**
- **Appearance → Page menu**: the look of the page menu buttons (header or footer).
  - **Presets**: *Standard* (icon above the name, the current page in the accent: the old bottom bar, now the
    default), *Underline* (the old header tabs), *Pill*, *Outline*, *Glass*, *Neon*. Their colors follow the theme
    and the Accent.
  - **Overrides** on top of the preset: show icons / names, icon above or beside, **an icon for each page**
    (also used by the page chip and its menu), text size / weight / colors, icon size / colors, background,
    border, corner radius, height, spacing, and how the current page is marked (color, underline, fill, glow).
    Sliders show the preset's value until changed; *Back to the preset* clears the overrides and keeps the icons.
- Other buttons and chips keep their fixed design (theme colors and the Accent).

**Changed**
- The page menu buttons default to *Standard*. Pick *Underline* for the previous header-tab look.

## v2026.11.15.28

**Changed**
- **Page menu** (was *Tabs*), per screen in Layout: **Buttons** (was *Tabs*), a chip that opens a menu, or an icon
  button that opens a menu.
- **Footer**: the Header panel is now **Header & footer**. Any item (page menu, search, Surprise me, TV picker,
  filters, sort, view) can go in the Header, the Player header or the **Footer**, each with up to three rows and
  left / middle / right. Per screen: *The footer sticks to the bottom of the screen* (on for phones). Menus opened
  from the footer open upward.
- *A tab bar at the bottom* is now the page menu in the footer: screens that used it get their own layout with the
  page menu in the footer, set to Buttons.
- **Header & footer list is locked by default**: each item shows as chips (where, row, left / middle / right, or
  Hidden). *Unlock to edit* shows the controls; *Editing: lock* hides them again.

## v2026.11.15.27

**Changed**
- **Move to a different TV** replaces the *Play on* list under Now playing (full screen and side panel). It opens
  a menu of the other TVs (with their state; a TV already playing something is marked). Picking one stops the
  title here and starts it there; on TVs that can seek (PiPup) it continues from the same place.
- **Watching now cards for your TVs are buttons**: tapping one opens that TV's Now playing controls (full screen
  when there's no side panel). A remote icon marks them; sessions on other devices stay plain.
- **No duplicate slim bar on Home**: while Watching now shows the playing TV, the slim bar is hidden there. It
  still shows on library tabs.

## v2026.11.15.26

**Changed**
- **No more dropdowns for tabs and the TV picker.** Per screen, *Tabs* is Tabs, **a chip** (page icon, name and a
  chevron) or **an icon button** that opens a menu, or a bottom tab bar. *TV picker* is a button for each TV,
  **a chip** (status dot, TV icon and name) or **an icon button** that opens a menu, or hidden.
- **The menu** opens under its button: a title, one row per page or TV with its icon, a second line (Movies /
  TV shows; who is watching or the TV's state), a tick and highlight on the current one, and a status dot for TVs.
  It closes when you pick, tap outside, or press Escape. It replaces the *Play on* sheet.
- Settings that used *A dropdown* change to *A chip*; *Phone: portrait* tabs default to a chip.

## v2026.11.15.25

**Changed**
- **Four screens, each with its own settings**: *Layout* has *Tablet / computer: landscape*, *Tablet / computer:
  portrait*, *Phone: portrait* and *Phone: landscape*. The card uses the one that matches the device and how it's
  held. Every screen sets, separately (nothing is shared or copied):
  - Scale, **Posters across** (defaults 6 / 4 / 3 / 5; every Home row, the library grid and search), Libraries show;
  - Header layout (the main layout, one row, or its own), Tabs (tabs / dropdown / bottom bar), **Search** (a box, or
    an icon that opens a search bar), **TV picker** (buttons / dropdown / one button that opens a list / hidden),
    Library filters (in the header / popover), hide the header while scrolling, swipe to change tab;
  - Now playing (side panel on tablets / slim controls / off) and the slim controls' position.
- "Compact" is gone: its parts (one-row header, search icon, TV button) are now separate choices.
- **Editor order**, in two groups. *Card*: Layout, Header, Home, Now playing, Appearance. *Apps & devices*: TVs,
  Library, Integrations found. The Header panel edits the main layout and any screen set to *its own layout*.
- Home sections follow the screen's *Posters across*; a section can still set its own count for tablets and for
  phones. *Items per row* and *Poster width* are replaced by *Posters across*.
- Old settings migrate: card-wide ones (scale, libraries show, TV picker, filters, Now playing, slim position,
  items per row) fill both tablet screens; the phone settings fill both phone screens.

## v2026.11.15.24

**Changed**
- **Layout** is now the first panel in the editor (it was inside Appearance). It holds the layout choice, the
  title, *Tablets and computers* (Scale, Libraries show) and the phone settings (*Phone: portrait*,
  *Phone: landscape*, *Phone: both orientations*), which replace the separate Phone panel.

**Fixed**
- **Libraries show** (grid / list, on tablets and phones) didn't change the view: the view remembered on the
  device kept winning. Changing the setting now applies at once; the grid / list button still changes it per
  device.

## v2026.11.15.23

**New**
- **Phone panel** in the editor: everything the phone layout uses, in one place.
  - *Portrait* and *Landscape*: Scale (default 100 %), **Posters across** (default 3 / 5; sets every Home row,
    the library grid and search, so Recently Added, Coming Soon, Continue watching and Plex rows all match), Tabs
    (dropdown / tabs / bottom bar).
  - *Both orientations*: Header (compact one row, same as tablets, or its own layout), Library filters
    (popover / inline), Libraries show (grid / list), Now playing (slim / off) and its position, hide the header
    while scrolling, swipe to change tab.
  - The other panels now set tablets and computers; their phone options moved here. A Home section can still
    set its own count on phones (*Items to show on phones*).
- Replaces the **Phone preset**. Old settings migrate: `phone_preset`, `preset_portrait_scale` / `_across`,
  `phone_across`, `phone_tabs`, `phone_compact`, `phone_header`, `hide_on_scroll`; with the preset on, your own
  slim position, header and TV dropdown are kept as the Phone panel's choices.

**Changed**
- **Now playing shows only while a movie or episode plays**: no side panel, slim bar or full screen for an idle
  or switched-off TV. (*Side panel: Always* is gone.) After *Play*, the full-screen view opens when playback
  starts and closes itself if nothing starts within 90 s.

## v2026.11.15.22

**Fixed**
- **Settings changed in the editor had no effect while the phone preset was on.** The preset replaced Now playing,
  the slim bar position, the TV picker, the header layout and the other options it covers, so changing them did
  nothing. The preset now only fills in options the card doesn't set: anything set in the config wins, and a card
  with its own `header:` keeps it (unless *Separate header layout for phones* is set). *TV picker: dropdown* keeps
  the dropdown.

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
