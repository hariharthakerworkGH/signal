/* Signal's service worker.
 *
 * Until v44 the app deleted any service worker it found, so it could not open
 * at all without a connection - which made a nonsense of the friendly
 * "offline, your saved data is safe" messages, because you could never get far
 * enough to read them. Your watch history was sitting in the browser the whole
 * time, unreachable.
 *
 * CACHE_NAME must match APP_VERSION in index.html. Bump the two together:
 * the version name is how an old cache gets cleared out on activate.
 */
const CACHE_NAME = "signal-v44";

/* Every file the app is made of. All four of them - if that ever stops being
   true, this list is what breaks first. */
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(APP_SHELL))
      // One missing file should not leave the app with no worker at all.
      .catch(() => {})
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

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // TVmaze, Wikidata, Wikipedia and GitHub are live data. Serving a cached air
  // date or a cached gist would be worse than saying you are offline, so these
  // go straight to the network and the app's own error handling takes over.
  if (url.origin !== self.location.origin) return;

  // A navigation with no connection still has to render something, and the
  // whole app is one HTML file, so that file is the answer.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put("./index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html").then((hit) => hit || caches.match("./")))
    );
    return;
  }

  // Everything else: answer from the cache immediately, and quietly pick up a
  // newer copy in the background for next time.
  e.respondWith(
    caches.match(req).then((hit) => {
      const live = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || live;
    })
  );
});
