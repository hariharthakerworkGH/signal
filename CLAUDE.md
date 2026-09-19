# Signal - project brief

A personal episode and film tracker: a static PWA, vanilla JS, no build step, no
framework, no server. Hosted on GitHub Pages. Watch history lives in the browser;
the only copy that leaves the device is the user's own private GitHub Gist, or a
backup file they save themselves.

Nothing personal belongs in this file - it is published with the app.

## Hard rules

- No analytics, no trackers, no ads. The only networks calls allowed are the
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

## How the tracking works

- A show is a list of seasons, each a list of episodes `{e, air, ts, name}`.
  `watched` and `dl` are maps keyed `"season-episode"`. Marks are independent
  of each other - treat them that way everywhere, especially when merging.
- Every change to a mark goes through `setWatched()` / `setDl()`, which stamp
  `sh.wts[key]` / `sh.dts[key]` with the time. That stamp is the only thing
  that lets a sync tell which device acted last. Writing `sh.watched[k]`
  directly skips it and quietly breaks merging.
- A `watched` value of `1` means a bulk or imported mark; a timestamp means a
  single deliberate one. Only the latter raises the download prompt, so the
  merge keeps whichever value is more specific.
- **Aired** is decided by `epLive()`: an exact `airstamp` when TVmaze has one,
  otherwise the air date read in the show's own timezone - start of day for a
  streaming drop, end of day for a broadcast network. With no timezone on
  record it assumes US Pacific.
- **Buckets** come from `catOf()`, never stored: WATCHING (aired episodes left
  to watch), UP TO DATE (current, or a premiere still ahead), DONE (finished,
  ended, or nothing aired in 18 months). `bucketOverride` is the user's manual
  say and always wins; a dropped show keeps its history and leaves tracking.
- Dates are local `YYYY-MM-DD` strings built the local way - never
  `toISOString()`, which is a day behind in India.
- Cloud sync is a private Gist holding `{shows, deleted, movies}`. Deletions are
  tombstones in `deleted`, so a delete on one device does not get resurrected by
  the other. Pull on open and on tab focus, push 2.5s after a change.
- Merging is per key, never per show (`mergeMarks` / `mergeShow`). Taking
  whichever whole show had the newer `updatedAt` loses a mark every time two
  devices touch different episodes before syncing. Where neither side has a
  timestamp - anything written before v44 - the mark wins.

## Storage

The library lives in IndexedDB (`signal` → `shows`, `movies`, `meta`), one
record per show, written through `persist()`. Settings, preferences and the
Discover caches stay in localStorage, where being able to read them
synchronously at boot is worth more than the space.

The pre-v44 localStorage copy of the library is left in place on purpose as a
rollback point; Settings has a button to clear it. If IndexedDB is unavailable
(a private window, blocked site data) the app falls back to localStorage
wholesale, 5 MB ceiling and all.

## Layout

Everything is one `index.html` - markup, CSS and about 1,700 lines of JS in one
`<script>`. Splitting it into ES modules (no build step, same as the expense
tracker) is still worth doing; until then, keep the section banner comments
accurate, because they are the only navigation there is.

Clicks are handled by one delegated listener against the `ACTIONS` table, not
by per-element `onclick`. A new button needs a `data-<name>` attribute and a
matching key in `ACTIONS` - nothing else.

`sw.js` caches the four app files so it opens offline. `CACHE_NAME` in `sw.js`
must match `APP_VERSION` in `index.html`; bump them together, or a stale cache
never gets cleared. `manifest.json` plus two PNG icons complete the app.

## Design

Dark, terminal-flavoured: amber is the user's own action, cyan is the app
telling them something, violet is a date in the future, red is a warning. The
palette is the `:root` block in `index.html` and nothing outside it defines a
raw colour.

Numbers first, one short line per item, details behind a tap. A warning is said
once, never repeated per row. Comments explain why, in plain English,
especially where a rule looks odd.

Three text tiers - `--text`, `--dim`, `--faint` - and **every one of them
clears WCAG AA (4.5:1) on all four surfaces** it can land on: the page
background, `--card`, `--cardup` and the `#191B28` episode cell. A dark theme
makes it very easy to add a fourth, quieter grey that fails; don't. If a new
colour is needed, measure it against all four before using it. Disabled
controls (the dashed unaired cells) are exempt - WCAG does not set a contrast
requirement for inactive components.

Tap targets are at least 24x24 CSS px with 8px between them. That is the WCAG
2.2 AA web figure; the 44pt/48dp numbers people quote are iOS and Android
native guidance and do not apply here.

No emoji as icons, ever - an emoji is a different picture on every platform,
ignores the palette and cannot take a colour. Icons are inline SVG in the
`ICON` map, `currentColor`, 1.6 stroke, `aria-hidden` when a text label is
already beside them. The header still uses a few monochrome symbol glyphs
(gear, refresh, check); moving those into `ICON` too is unfinished work.

## Working on it

There is no Node and no git on the owner's machine; Python is `py`.

1. Serve the folder (`py -m http.server`) and open it - there is no build step,
   so a reload is the whole edit cycle. The service worker caches aggressively:
   clear the cache and unregister it before re-testing, or stale files are
   served.
2. Test with a throwaway browser profile, never the owner's real data. Anything
   that touches watch marks or sync gets checked against a copy of a real
   backup file first.
3. Bump `APP_VERSION` in index.html and `CACHE_NAME` in sw.js together.
4. Copy the whole app to `signal-versions/v<N>` so any version can be restored,
   and verify the copy in a separate command.
5. Never ask for the owner's GitHub token. To debug, ask for an exported backup
   file - it has no credentials in it.
