# Signal

A private tracker for the shows and films you are watching.

It runs entirely in the browser. Your watch history never leaves your device
unless you send it somewhere yourself — to your own private GitHub Gist, to
keep a phone and a laptop in step, or to a backup file you save. There is no
account, no server, no analytics and nothing to sign up for.

## What it does

- **Track episodes.** A grid per season, one numbered cell per episode. Tap to
  mark watched. Cells that have not aired yet are locked, and unlock themselves
  the moment they do.
- **Know what is next.** The top of the page answers "what do I put on now",
  and a schedule shows what airs in the next seven days.
- **Track films too,** with a watchlist, release dates, and a separate list of
  the ones you still need to download.
- **Find new things.** Discover lists premieres on the platforms you subscribe
  to over the next 60 days, and films releasing in the next 90.
- **Work offline.** Once opened, it opens again with no connection. Adding and
  syncing need the internet; everything you have already saved does not.
- **Sync two devices** through a private Gist, using a GitHub token with only
  the `gist` permission. Marks merge episode by episode, so marking different
  episodes on a phone and a laptop keeps both.

## Where the data comes from

- [TVmaze](https://www.tvmaze.com) — shows, episodes, air dates, premieres
- [Wikidata](https://www.wikidata.org) — films and release dates
- Wikipedia — film posters

All three are free and need no API key. Nothing else is contacted, except the
GitHub API if you turn sync on.

## Running it

It is four static files with no build step. Serve the folder over HTTP and open
it:

```bash
py -m http.server 8777
```

A service worker is involved, so it needs `http://` or `https://` — opening
`index.html` straight off the disk will not work.

## Backing up

Settings → **Export backup** writes a JSON file of everything. Do it now and
then. If you have not turned sync on, one clear of your browser data takes the
lot — the app will remind you about this, once a month, and you can snooze it.

## Versions

`APP_VERSION` in `index.html` and `CACHE_NAME` in `sw.js` are bumped together,
and every released version is kept whole in `signal-versions/v<N>` so any of
them can be put back as-is.
