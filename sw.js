/* Signal's service worker.
 *
 * It does two jobs: let the app open with no connection, and make sure that when
 * there IS a connection the app you open is the newest one, not last week's.
 *
 * How the second job works. Every script and the stylesheet are asked for as
 * name?v=<BUILD> (see index.html), so a new build is a new address and can never
 * be answered from an old copy, in this cache or in the browser's own. The page
 * itself (index.html) is always asked for fresh, with a short patience: on a bad
 * connection you get the saved page after NAV_WAIT rather than a blank screen.
 * The new worker takes over at once (skipWaiting + claim) and app.js reloads the
 * page when that happens, so an update needs no close-and-reopen.
 *
 * BUILD must match BUILD in core.js (tests.js checks), and goes up every release.
 */
const BUILD = 51;
const CACHE_NAME = "signal-v" + BUILD;
const V = "?v=" + BUILD;
const NAV_WAIT = 3000;

/* Every file the app is made of. If one is missing here the app still opens
   online but not offline; if one is listed that does not exist, install fails
   and the old worker keeps running. tests.js checks both. */
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css" + V,
  "./i18n.js" + V,
  "./core.js" + V,
  "./data.js" + V,
  "./ui.js" + V,
  "./app.js" + V,
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./fonts/DMSans-latin.woff2",
  "./fonts/DMSans-latin-ext.woff2",
];

self.addEventListener("install", (e) => {
  // "reload" skips the browser's own cache, so a new build is cached from the
  // network and never from a copy the server said could be kept for ten minutes.
  // If any file fails the install fails, and the working old version stays.
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(APP_SHELL.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The page: the network if it answers in time, else the saved copy. Whatever the
   network sends is saved for the next time, even if it arrived too late to use. */
function freshPage(req) {
  const net = fetch(req.url, { cache: "no-cache" }).then((res) => {
    if (!res || !res.ok) throw new Error("page " + (res && res.status));
    const copy = res.clone();
    caches.open(CACHE_NAME).then((c) => c.put("./index.html", copy)).catch(() => {});
    return res;
  });
  net.catch(() => {});   // a late failure after the saved page was served is not an error
  const patience = new Promise((_, no) => setTimeout(no, NAV_WAIT));
  return Promise.race([net, patience]).catch(() =>
    caches.match("./index.html").then((hit) => hit || caches.match("./")).then((hit) => hit || net));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // TVmaze, Wikidata, Wikipedia and GitHub are live data. Serving a cached air
  // date or a cached gist would be worse than saying you are offline, so these
  // go straight to the network and the app's own error handling takes over.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") { e.respondWith(freshPage(req)); return; }

  const keep = (res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  };

  // A ?v= file belongs to one build and never changes: saved copy first, and the
  // network only if it is somehow missing.
  if (url.search.startsWith("?v=")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(keep)));
    return;
  }

  // Icons, fonts and the manifest: answer from the cache at once and quietly
  // pick up a newer copy for next time.
  e.respondWith(
    caches.match(req).then((hit) => {
      const live = fetch(req).then(keep).catch(() => hit);
      return hit || live;
    })
  );
});
