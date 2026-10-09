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
`ACTIONS` - nothing else.

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
- **Aired** is decided by `epLive()`: an exact `airstamp` when TVmaze has one,
  otherwise the air date read in the show's own timezone - start of day for a
  streaming drop, end of day for a broadcast network. With no timezone on
  record it assumes US Pacific, the latest of the big ones, so nothing unlocks
  early.
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

The Hindi was written by the assistant and has not been read by a native
speaker. It needs that before release.

CSS uses logical properties (`inline-start`, `margin-block`), so a right-to-left
language can be added without redoing the layout. None is shipped yet.

## Design

**Direction (3.0).** A dark, poster-led tracker. Dark because posters read best on
a near-black ground and most viewing is in a dim room. Dials: ENERGY 2 / RHYTHM 3
/ MOTION 2 - screens differ on purpose (a rail of posters on Today, a grid in
Shows, a backdrop and episode rows on a show, rows with a thumbnail for movies).
The identity motif is the app icon itself, a filled square in a rounded square:
every status marker is a small rounded square, never a circle.

Typeface: DM Sans, shipped in `fonts/`, weights 400-600 only (that is all the
file has). Open and geometric, easy to read small on dark, covers Latin Extended.
Other scripts fall through to the phone's own UI font. No webfont is fetched.

Amber is the one deliberate accent. **The solid amber button is for the one main
action on a screen** (top-bar Add, a show's "Mark watched", onboarding). Every
repeated action (each card, each row, each Add in a list) uses `.btn.soft`.
Cyan = the app telling you something, violet = a date in the future, red =
careful. Do not add a fifth colour.

Every colour is a token in the `:root` block of `style.css`; nothing outside it
writes a raw colour (hover steps, inks, scrims and shadows are tokens too, and
shadows are tinted with the page colour).

Three text tiers - `--text`, `--dim`, `--faint` - and **every one clears WCAG AA
(4.5:1) on all five surfaces** it can land on: `--well`, `--bg`, `--card`,
`--cardup` and the toast. Measured in 3.0: the lowest is `--faint` on the toast at
4.83. A dark theme makes it easy to add a quieter grey that fails; don't. Measure
any new colour against all five first. Soft-button text, button inks and text over
the blurred poster backdrop (worst case a pure white poster) were measured too.
Disabled controls are exempt.

Tap targets are at least 24x24 CSS px with 8px between them (the WCAG 2.2 AA web
figure; 44pt/48dp is iOS and Android native and does not apply). Inputs are 16px
so iOS does not zoom.

No emoji as icons, ever. Icons are inline SVG in the `ICONS` map (`ui.js`), 1.7
stroke, `currentColor`, `aria-hidden`. No em dashes in any text a person reads
(app name included). Few inline styles: spacing and alignment are classes
(`.mt-12`, `.grow`); only a dynamic width or a backdrop image stays inline.

Numbers first, one short line per item, details behind a tap. A warning is said
once, one banner at a time. Comments explain why, in plain English.

## Working on it

There is no git on the owner's machine. Node is at `C:\Program Files\nodejs`
(not on the bash PATH); Python is `py`.

1. Serve the folder (`py -m http.server`) and open it. The service worker caches
   aggressively: clear the cache and unregister it before re-testing. In the
   desktop app's browser pane a service worker does not register on a locally
   served page, and the pane caches scripts across reloads (fetch each file with
   `cache: "reload"` first); verify offline behaviour on the live site.
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
4. Versions on screen read like an app's: `3.0`, `3.1` for features, `3.1.1` for a
   fix, `4.0` for a rebuild (`APP_VERSION` in core.js). Every release also raises
   the hidden `BUILD` counter by one, with `CACHE_NAME` in sw.js (`signal-v<BUILD>`).
5. `APP_SHELL` in sw.js must list every file the page loads (`tests.html` checks it).
   One typo and `addAll()` rejects: nothing is cached, silently.
6. Copy the whole app to `signal-versions/<version>` so any version can be
   restored, and verify the copy in a separate command.
7. Never ask for the owner's GitHub token. To debug, ask for an exported backup
   file - it has no credentials in it.
