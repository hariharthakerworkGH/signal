# Signal

A private tracker for the shows and movies you are watching, from anywhere.

It runs entirely in the browser. Your watch history never leaves your device
unless you send it somewhere yourself: to your own private GitHub Gist, to keep a
phone and a laptop in step, or to a backup file you save. There is no account, no
server, no analytics and nothing to sign up for.

## What it does

- **Today.** What to watch next, one tap to mark it, and what airs this week.
- **Shows.** A poster for every show, sorted by what you watched last. Open one
  for a numbered list of episodes with their titles and air dates; tap to mark.
  Episodes that have not aired are locked and unlock themselves when they do.
- **Movies.** A watchlist, release dates, and a list of the ones you still need to
  download, with posters.
- **Discover.** New premieres on the streaming services you use over the next 60
  days, filterable by language, and movies releasing in the next 90.
- **International.** Search finds shows from anywhere TVmaze covers and tells you
  the language, service and country. English and Hindi so far; dates and times
  follow your phone's own settings.
- **Offline.** Once opened, it opens again with no connection.
- **Sync two devices** through a private Gist, using a GitHub token that has only
  the `gist` permission. Marks merge episode by episode, so marking different
  episodes on a phone and a laptop keeps both.

## Where the data comes from

- [TVmaze](https://www.tvmaze.com): shows, episodes, air dates, premieres
- [Wikidata](https://www.wikidata.org): movies and release dates
- Wikipedia: movie posters

All three are free and need no key. Nothing else is contacted, except the GitHub
API if you turn sync on.

## Running it

Static files, no build step. Serve the folder over HTTP and open it:

```bash
py -m http.server 8777
```

It uses a service worker, so it needs `http://` or `https://`; opening
`index.html` from disk will not work. Open `tests.html` the same way to run the
checks.

## Backing up

Settings, then **Export a backup**, writes a JSON file of everything. Do it now
and then. If you have not turned sync on, clearing your browser's data takes the
lot, and the app reminds you once a month.

## Versions

`APP_VERSION` and `BUILD` in `core.js` and `CACHE_NAME` in `sw.js` move together,
and every released version is kept whole in `signal-versions/<version>` so any of
them can be put back as it was.
