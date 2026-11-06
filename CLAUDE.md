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
  stored as `signal.tz`), else the device's. No location is asked for or sent;
  the zone name is all that is needed. A row's day is the viewer's day for its
  air time, so the date and the time beside it can never disagree.
- **Buckets** come from `catOf()`, never stored: WATCHING (aired episodes left
  to watch), UP TO DATE (current, or a premiere still ahead), DONE (finished,
  ended, or nothing aired in 18 months). `bucketOverride` is the user's manual
  say and always wins; a dropped show keeps its history and leaves tracking.
- **Up next** (`upNextItems`) is the shows in WATCHING, most recently watched
  first; a show never started only counts if it aired this week.
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
reloads when the app is left, and it never reloads twice within 20 seconds. The
splash (`#splash`, drawn from tokens, about 1.25 s, a moment under reduced motion)
covers the start and any update; an inline script removes it after 10 s if the
app cannot start. The first open after 4.0 still needs one extra open, because the
4.0 worker has no reload.

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

- **Next** (`viewNext`): one hero card for the show you were last on with the one
  filled button, then "Ready to watch" rows, this week's schedule, and a single
  "N to download" line that expands.
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

The interface is near-neutral graphite so the posters carry the colour; it is made
of hairlines and small type, not cards and big buttons. 3.0 looked like a template
because it was sized like one (15px type, 40-44px controls, 12-20px corners, four
accent colours). Dials: ENERGY 2 / RHYTHM 3 / MOTION 2, density high - screens
differ on purpose (a hero card on Next, a poster grid in Library, a backdrop and
episode rows on a show). The identity motif is the app icon, a filled square in a
rounded square: every status marker is a small rounded square, never a circle.

Scale: 14px body, 12-13px for secondary text, 11px for chips and tab labels. Controls
are 28px (small), 34px (default), 36px (icon button), 40-44px for the one main
button and the search field; tab bar 56px (a 76px rail from 720px). No topbar.
Corners 4px (chips, thumbs), 6-8px (buttons, cards, posters), 12px (panels). Rows are
separated by hairlines (`--hair`), not by cards or hover boxes. A figure that is
only a figure (73 episodes to watch) is a line of text, not a card. On a phone a
row's action is an icon button (`.btn.ic` with a `.lbl` kept for screen readers).

Typeface: DM Sans, shipped in `fonts/`, weights 400-600 only (that is all the
file has). Open and geometric, easy to read small on dark, covers Latin Extended.
Other scripts fall through to the phone's own UI font. No webfont is fetched.

Amber is the one deliberate accent. **The solid amber button is for the one main
action on a screen** (the hero's "Mark watched", a title page's sticky bar,
onboarding). Every
repeated action (each card, each row) uses `.btn.soft`, a selected chip is a tinted
outline, and a rating or "watched" tag is `.chip.tint`. `--cyan` (muted) is only for
"downloaded" and for links; red is for what cannot be undone. Violet is gone: a
future date is plain dim text. Episode codes are dim, not coloured. Do not add a
colour.

Every colour is a token in the `:root` block of `style.css`; nothing outside it
writes a raw colour (hover steps, inks, scrims and shadows are tokens too, and
shadows are tinted with the page colour).

Three text tiers - `--text`, `--dim`, `--faint` - and **every one clears WCAG AA
(4.5:1) on all five surfaces** it can land on: `--well`, `--bg`, `--card`, `--up`
and `--hi` (the toast), in both themes. Measured in 4.0: the lowest in dark is
`--faint` on `--hi` at 5.08, in light `--faint` on `--hi` at 4.72; every accent
and the red clear 4.5 on all five. The edge of an input is `--edge`, 3:1 on the
surfaces it sits on. The light amber fill is only 2.06:1 on white, so a filled
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
