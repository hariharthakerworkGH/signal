# Signal - project brief

A personal tracker for the shows and films someone is watching, from anywhere: a
static PWA, vanilla JS, no build step, no framework, no server. Hosted on GitHub
Pages. Watch history lives in the browser; the only copy that leaves the device is
the user's own private GitHub Gist, or a backup file they save themselves.

Nothing personal belongs in this file - it is published with the app.

## Hard rules

- No analytics, no trackers, no ads. The only network calls allowed are the
  data sources below and the user's own private Gist. No LLM in the app.
- Data sources, all keyless and public: TVmaze (shows, episodes, air dates,
  premiere schedule), Wikidata (films and release dates), Wikipedia REST
  (film posters). Nothing else without a reason written down here.
- The GitHub token is the user's. It is used only to read and write their own
  Gist, is never sent anywhere else, and never appears in a backup file, in the
  Gist payload, or on screen.
- Never lose a watch mark. A sync, an import or a refresh may add marks; it may
  never silently drop one the user made on another device.
- Never silently overwrite a release date, a title or a mark the user set by
  hand.
- Air dates lock the grid. An episode that has not aired cannot be marked,
  unless the user has explicitly hit "Data wrong? Unlock" on that show.
- Say it plainly when data is missing - "episode count not announced", not an
  empty list. Written for someone who is not a programmer: no jargon on screen.
- A backup or sync file is a file from outside. Check its records before
  believing them (`importDb`), and never put a picture address into the page
  without `imgSrc()`.

## Files

Classic scripts sharing one scope, loaded in this order by `index.html`:

- `i18n.js` every word on screen, per language (`STRINGS`).
- `core.js` plain logic: when something has aired, which tab a show belongs in,
  the merge of two devices, dates and languages, the streaming-service list.
  No DOM, no storage, no network, so it runs under tests and under Node.
- `data.js` everything that remembers or fetches: IndexedDB, the Gist sync,
  TVmaze and Wikidata, imports and exports, and the actions that change a mark.
- `ui.js` what the screens look like (HTML from state, icons). Never listens.
- `app.js` taps, sheets, dialogs, the back button, starting up.
- `style.css` the whole look. `sw.js` offline. `manifest.json`, two icons,
  `fonts/` (DM Sans, with its licence).
- `tests.js` + `tests.html` the checks. `.claude/launch.json` is local only.

Clicks are handled by one delegated listener against the `ACTIONS` table in
`app.js`. A new button needs a `data-<name>` attribute and a matching key in
`ACTIONS` - nothing else (`tests.js` fails on a `data-` name with no handler, and
on a `t("key")` that English or Hindi lacks). The ⋯ menu closes itself on any
action except those in `KEEP_MENU`.

## How the tracking works

- A show is a list of seasons, each a list of episodes `{e, air, ts, name}`.
  `watched` and `dl` are maps keyed `"season-episode"`. Marks are independent
  of each other - treat them that way everywhere, especially when merging.
- Every change to a mark goes through `setWatched()` / `setDl()`, which stamp
  `sh.wts[key]` / `sh.dts[key]` with the time. That stamp is the only thing
  that lets a sync tell which device acted last. Writing `sh.watched[k]`
  directly skips it and quietly breaks merging.
- A `watched` value of `1` means a bulk or imported mark; a timestamp means a
  single deliberate one. Only the latter raises the download prompt and counts
  as "what I was watching lately", so the merge keeps whichever is more specific.
- **Aired** is decided by `epLive()`: an exact `ts` when TVmaze gave a real
  clock time, otherwise the END of the air date in the show's own timezone (US
  Pacific when none is on record), for every kind of show, so nothing unlocks
  early. TVmaze fills an unknown time with a fake `<date>T12:00:00+00:00`; that
  is never believed. Shows saved by 4.1 or later carry `tv: 2` (times already
  read the new way); on any other show `stripFakeTimes()` drops a noon-UTC time
  and `needsTimeFix()` makes it refresh when opened.
- **Usual drop hour (4.2).** `DROP_AT` in core.js lists services whose date-only episodes
  open at a known hour (Netflix: 02:00 US Pacific). `dropRule(sh)` matches the show's
  service; `airMoment(ep, show)` then uses it instead of end-of-date. Only add a service
  with a written source: Disney+, Hulu, Apple TV, HBO Max, Paramount+ and Prime Video vary
  by show and stay on end-of-date. A real `ts` always beats the table.
- **Calendar file (4.2).** `icsCalendar()` (core.js) writes episodes still to come as an
  .ics: a real time is a UTC instant (the calendar shows it in its owner's zone), a
  date-only episode is an all-day event, no hour invented. Capped at 40 per show.
- **The viewer's zone.** Every clock time, "today" and the day a schedule row
  sits under is read in `viewTZ()`: the zone chosen in Settings (`TZ_PREF`,
  stored as `signal.tz`). No location is asked for or sent; the zone name is all
  that is needed. A row's day is the viewer's day for its air time, so the date and
  the time beside it can never disagree.
- **Home zone (5.0): a VPN or a trip must not move it.** The app never looks at an IP
  address, so the only way a VPN reaches it is through the phone's reported zone. So the
  zone is PINNED: `bootZone()` saves the phone's zone the first time the app opens (and
  for anyone who updates from 4.x with nothing saved), and from then on `signal.tz` is
  what counts. `"auto"` is the one opt-in to follow the phone ("Follow this phone" in
  Settings). If the phone later reports a zone whose UTC offset differs (`zoneClash()`),
  a banner offers Keep or Switch; Keep stores `signal.tzseen` so it asks again only when
  the phone's zone changes again. Known limit: if the very first open happens behind a
  VPN, that zone is pinned; the Settings list fixes it. Whether an episode has aired is an
  exact moment (`epLive`), so it never depends on the viewer's zone at all.
- **Refresh failures (5.0).** Only HTTP 404 and 410 are hard ("gone", stop refreshing).
  403, 429 and 451 are what a VPN exit address or a rate limit produce: they are soft
  ("blocked"), the show is tried again, and the stale banner says TVmaze refused the
  connection and that a VPN can cause it. A refusal must never retire a show.
- **Buckets** come from `catOf()`, never stored: WATCHING (aired episodes left
  to watch), UP TO DATE (current, or a premiere still ahead), DONE (finished,
  ended, or nothing aired in 18 months). `bucketOverride` is the user's manual
  say and always wins; a dropped show keeps its history and leaves tracking.
- **Next is two things (5.2), and a day is never shown twice.** On top, the **Ready to
  watch carousel** (`pendingItems`): every show with aired episodes left and every released
  film not yet ticked, newest release first ("Out yesterday" and "Out today" in amber), the
  tick on the cover, 12 shown and "See all" lays all of them out three across in place.
  Nothing is left out for being old: only a tick (watched, or the show dropped) takes an
  item off it. Below it, ONE **calendar** (`calendarFlow`, drawn by `calendarHTML`): each day
  once, oldest at the top, then Yesterday, Today (both always shown, even empty), Tomorrow and
  a 7-day horizon; "Later" opens the rest and "Earlier" opens one more week per tap
  (`earlier.next` skips empty weeks). Every row says what the person did: empty tick = still to
  do, amber check = watched, cyan tick = downloaded only, amber check plus a cyan arrow = both
  (`dlmark`). Three or more episodes of one show on one day become one row (`groupRows`,
  "8 episodes · 0 watched"; it has no tick, so the person ticks from the carousel or the
  show). Rule: a list on Next may never empty by itself because time passed, and **never
  split one timeline into two lists by a state** (aired/unaired, ticked/unticked): 5.0 and 5.1
  printed "Released earlier" and "This week" side by side and the same dates appeared twice.
  The test that guards it is `calendar: each day once`; before changing this screen write
  the owner's question as a test: back after 3 days, what did I miss, what airs today,
  what aired yesterday, watched or downloaded? `pastItems(shows, withinMs, seenMs)` still
  returns each aired row with `st` = `w` / `d` / empty and `calendarFlow` adds `dl`;
  `seenMs` is a window on purpose (a real library holds 20,000 ticked episodes and the
  unwindowed list took 390 ms a redraw). Rows are ordered by the day printed on them, then by
  moment. **Films (4.4)** sit in the same calendar: a film added before (or on) its release
  day and not yet ticked is on its day (`pastFilms` when out, `comingFilms` when ahead). A film added
  after it was out, or with no add date, stays in Library > Movies only. The "Downloaded it?"
  ask (`dlAskHTML`) is a fixed card above the tab bar, never part of the page flow, because in
  the flow it pushed the covers down and a tap landed on the wrong one.
- **Yesterday and tomorrow words (5.2).** `relDayWord(n)` writes them. Hindi's own
  `RelativeTimeFormat` gives "कल" for both -1 and +1, so when the two match the app uses the
  `rel_yesterday` / `rel_tomorrow` strings instead.
- Dates are local `YYYY-MM-DD` strings built the local way - never
  `toISOString()`, which is a day behind in India.
- Cloud sync is a private Gist holding `{shows, deleted, movies}`. Deletions are
  tombstones in `deleted`, so a delete on one device does not get resurrected by
  the other. Pull on open and on tab focus, push 2.5s after a change.
- Without GitHub, a backup file is the sync: Export (or the phone's share sheet) on one
  device, Import on the other. `parseBackup()` checks the records, then `importDb` MERGES
  through `mergeCloud`/`mergeMovies`, exactly like a Gist pull, so an import adds and never
  replaces. The file carries `deleted` too and never the token.
- Merging is per key, never per show (`mergeMarks` / `mergeShow`). Taking
  whichever whole show had the newer `updatedAt` loses a mark every time two
  devices touch different episodes before syncing. Where neither side has a
  timestamp the mark wins.
- A show that cannot be refreshed (a daily serial over 150 episodes, a TVmaze id
  that now 404s) is recorded with a reason (`noteSyncFail`) and stops counting as
  stale, otherwise the "not refreshed" warning could never clear.
- A film's poster and article are filled in the background and must NOT change
  its `updatedAt`: a cosmetic fill would otherwise beat a watched mark made on
  another device.

## Updating, and the splash

The app updates the moment it is opened; nobody has to close and reopen it.
`index.html` is fetched fresh (`no-cache`, three seconds' patience, then the saved
copy), it names each script as `?v=<BUILD>`, and a new `sw.js` takes over at once
(`skipWaiting` + `clients.claim`). `registerSW()` in `app.js` checks for a new
worker at start and every time the app becomes visible; on `controllerchange` it
saves the library, then reloads. It waits if a dialog or a field is in use and
reloads when the app is left, and it never reloads twice within 20 seconds. Two
rules keep that honest (5.0, both proved in a browser against a served copy):
the reload is skipped when the page is already the newest build (`pageIsStale()`
compares `BUILD` with the newest `signal-v<N>` cache), so a fresh open after a release
boots once, on the new build, with no second load; and only the FIRST
`controllerchange` of a first-visit page (the worker claiming it) is ignored, never
the later ones, or a page opened before the worker existed and left open would miss
every update. The splash (`#splash`, drawn from tokens, about 1.25 s, a moment under
reduced motion) covers the start and any update; an inline script removes it after
10 s if the app cannot start.

## Storage

The library lives in IndexedDB (`signal` -> `shows`, `movies`, `meta`), one
record per show, written through `persist()`. Settings, preferences and the
Discover caches stay in localStorage, where reading them synchronously at boot
is worth more than the space. Synopsis, genres, language and country are fetched
when a show is opened and kept in memory only, so a library of hundreds does not
bloat the sync Gist.

The pre-v44 localStorage copy of the library is left in place on purpose as a
rollback point; Settings has a button to clear it. If IndexedDB is unavailable
(a private window, blocked site data) the app falls back to localStorage
wholesale, 5 MB ceiling and all.

## Languages

English and Hindi. Every word on screen goes through `t("key", {vars})`; nothing
is typed into `ui.js`, `app.js` or `index.html` as visible text. A value can be
`{one, other}` for plurals. Dates, times, "today", "tomorrow" and "in 3 days" are
written by the browser (`Intl`), so every language gets them for free. Show titles
and episode names are names and are never translated.

To add a language: its code in `SUPPORTED_LANGS` (core.js), its name in
`LANG_NAMES` (ui.js), a block in `i18n.js`. `tests.html` fails if a language
lacks a key English has, or has one it lacks, or drops a `{placeholder}`.

The Hindi was written by the assistant and has since been read by a Hindi
reader and accepted. Hindi text runs wider and taller than English: check every
new screen in it.

CSS uses logical properties (`inline-start`, `margin-block`), so a right-to-left
language can be added without redoing the layout. None is shipped yet.

## Design

**Direction (4.0).** 3.1 had the right look and the wrong map: four tabs, three
add paths, a topbar, and a settings sheet holding everything else. 4.0 keeps the
look and rebuilds the map as three places, each with one job:

- **Next** (`viewNext`): the day in large type (weekday over date, in the viewer's zone)
  with a count chip, the "Ready to watch" carousel of everything pending (shows and
  released films), then ONE calendar that runs from what you missed, through yesterday and
  today, to what is coming (5.2; the 4.0 to 5.1 hero card and the separate "earlier" and
  "this week" lists are gone), and a single "N to download" line that expands.
- **Library** (`viewLibrary`): Shows | Movies, search, status chips with counts,
  grid or list. Settings is the icon in its header (and the rail's foot on wide).
- **Find** (`viewFind`): one search for shows and films; idle, it is Discover.

A show or film is a page (`.panel.pg`): backdrop, header, progress, season chips,
episode rows, and a sticky bar with the one main action. Everything else lives in
the `⋯` menu (`.menu`), never in a row of buttons. From 720px the tabs become a
76px left rail, the list is a fixed 340-380px column and the open title sits
beside it in `#sheet.pane` (no scrim, list stays usable); non-title sheets become a
centred panel. Light and dark follow `prefers-color-scheme`; the light set has its
own tokens and clears the same 4.5:1 rule.

**Poster wall (5.0).** 4.x was correct and quiet, and for a phone it was a utility. 5.0
keeps the map and the amber and makes it something to have on a phone: a near-black
graphite with a cool tint so the posters carry the colour, big round touch targets, a
hero whose blurred backdrop and tilted cover come from the show itself, a sideways wall of
covers with the tick on the art, and a tab bar that floats as a pill (a left rail from
720px). Dials: ENERGY 3 / RHYTHM 3 / MOTION 3, density medium. The identity motif is the
app icon, a filled square in a rounded square: every status marker AND every tick is a
rounded square, never a circle. **The tick (`.tick`, `checkBtn`)** is an empty rounded
square on a cover or a row; ticking it fills it amber and draws the check (cyan for
"downloaded"). app.js puts class `done` on the card or row, waits 260 ms so the fill is
seen, then saves the mark and redraws; with reduced motion there is no wait. Only
transform, opacity, colour and a stroke animate. A tick is 44px; the episode box in a
show's list is 32px.

Scale: 15px body, 12-13px for secondary text, 11px for tab labels. Controls are 36px
(small), 40px (default), 44px (icon button, tick, field), 50px for the one main button
(`.btn.big`, 16px radius) and 52px for the search field; the pill tab bar is 56px tall
buttons inside a 6px frame (a 76px rail from 720px). Corners: 8px (small), 14px (buttons,
chips, fields, tiles), 18-20px (covers, cards, banners), 24px (hero, sheets, menus).
Rows have no hairlines or cards; the gap and the thumbs separate them. A figure that
is only a figure (73 episodes to watch) is a line of text, not a card. A repeated
action is a tick, not a labelled button. Gradients are allowed only as the scrim that
keeps text readable over a poster.

Typeface: DM Sans, shipped in `fonts/`, weights 400-600 only (that is all the
file has). Open and geometric, easy to read small on dark, covers Latin Extended.
Other scripts fall through to the phone's own UI font. No webfont is fetched.

Amber is the one deliberate accent. **The solid amber button is for the one main
action on a screen** (the hero's "Mark watched", a title page's sticky bar,
onboarding). Every repeated action (each cover, each row) is a `.tick`; a quieter
labelled one uses `.btn.soft`, a selected chip is a tinted outline, and a rating or
"watched" tag is `.chip.tint`. `--cyan` (muted) is only for
"downloaded" and for links; red is for what cannot be undone. Violet is gone: a
future date is plain dim text. Episode codes are dim, not coloured. Do not add a
colour.

Every colour is a token in the `:root` block of `style.css`; nothing outside it
writes a raw colour (hover steps, inks, scrims and shadows are tokens too, and
shadows are tinted with the page colour).

Three text tiers - `--text`, `--dim`, `--faint` - and **every one clears WCAG AA
(4.5:1) on all five surfaces** it can land on: `--well`, `--bg`, `--card`, `--up`
and `--hi` (the toast), in both themes. Measured in 5.0: the lowest in dark is
`--faint` (#9594A6) on `--hi` (#292934) at 4.84, in light `--faint` on `--hi` at 4.72;
every accent and the red clear 4.5 on all five. The edge of an input or an empty tick
is `--edge` (#7C7C8F dark), 3:1 on the surfaces it sits on (3.52 on `--hi`). The light amber fill is only 2.06:1 on white, so a filled
amber control always carries a dark ink glyph or label (9:1) and an unchecked box
keeps its `--edge` outline. A dark theme makes it easy to add
a quieter grey that fails; don't. Measure any new colour against all five first.
Soft-button text, button inks and text over the blurred poster backdrop (worst case
a pure white poster) were measured too. Disabled controls are exempt.

Tap targets are at least 24x24 CSS px with 8px between them (the WCAG 2.2 AA web
figure; 44pt/48dp is iOS and Android native and does not apply). Inputs are 16px
so iOS does not zoom.

No emoji as icons, ever. Icons are inline SVG in the `ICONS` map (`ui.js`), 1.7
stroke, `currentColor`, `aria-hidden`. No em dashes in any text a person reads
(app name included). No inline styles except a dynamic width (a progress bar) or a backdrop image:
spacing, size and alignment are classes, because an inline size is how an old, larger
scale survives a redesign.

Numbers first, one short line per item, details behind a tap. A warning is said
once, one banner at a time. Comments explain why, in plain English.

## Working on it

There is no git on the owner's machine. Node is at `C:\Program Files\nodejs`
(not on the bash PATH); Python is `py`.

1. Serve the folder (`py -m http.server`) and open it. The scripts and stylesheet
   are asked for as `name?v=<BUILD>` and the service worker answers those from its
   cache, so while testing without a version bump you MUST unregister the worker
   and delete its caches before each reload, or you keep seeing the old file. The
   desktop app's browser pane does register a worker on a local page; an update
   can be proved end to end by serving a copy, bumping BUILD in the copy and
   calling `registration.update()`.
2. Open `tests.html`, or run `tests.js` under Node (load `i18n.js`, `core.js`,
   `tests.js` in one `vm` context and call `runAll`). They never touch a real
   library. Anything that touches marks, sync or time gets a test, and a new test
   should be shown to fail first (change the code, watch it catch it).
3. Before any release, tap the app with real pointer clicks at phone size (the browser
   pane's coordinate click, not `el.click()` or `setTab()`, which skip hit-testing) and
   sweep `document.elementFromPoint` over every button on every tab. 3.0 shipped with an
   empty full-screen `#sheet` over the tab bar because every earlier check went round the
   hit-test. Also run it against a real backup after a reload, not a fresh profile.
   Test with a throwaway browser profile, never the owner's real data. Anything
   that touches marks or sync is checked against a copy of a real backup first.
4. Versions on screen read like an app's: `4.0`, `4.1` for features, `4.0.1` for a
   fix, `5.0` for a rebuild (`APP_VERSION` in core.js). Every release also raises
   the hidden `BUILD` counter by one in THREE places that `tests.js` keeps equal:
   `BUILD` in core.js, `BUILD` in sw.js (`CACHE_NAME` is `signal-v<BUILD>`), and
   every `?v=<BUILD>` in index.html. Forget one and the update never reaches anyone.
5. `APP_SHELL` in sw.js must list every file the page loads, spelled as the page
   asks for it (`style.css?v=<BUILD>`; `tests.html` checks it). One typo and
   `addAll()` rejects: nothing is cached, silently.
6. Copy the whole app to `signal-versions/<version>` so any version can be
   restored, and verify the copy in a separate command.
7. Never ask for the owner's GitHub token. To debug, ask for an exported backup
   file - it has no credentials in it.
