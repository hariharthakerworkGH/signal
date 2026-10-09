/* data.js - everything that remembers or fetches.
 *
 * The library (IndexedDB), cloud sync (the user's private Gist), TVmaze and
 * Wikidata, imports and exports, and the actions that change a mark. It calls
 * render(), toast() and paintStatus() from ui.js, which load after this file;
 * those only run on events, never while this file is loading.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let storageFull = false;

/* Settings and small caches stay in localStorage: they are tiny, and reading
   them synchronously keeps the first paint simple. */
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v); storageFull = false;
  } catch (e) {
    if (v !== undefined) {
      storageFull = true;
      try { toast(t("err_storage_full"), 9000); } catch (_) {}
    }
    return null;
  }
}
function readLS(k, fallback) { try { return JSON.parse(store(k) || "null") ?? fallback; } catch (e) { return fallback; } }

/* ================= the library lives in IndexedDB =================
   localStorage caps out around 5 MB, and it meant every episode tap
   re-serialised the WHOLE library. IndexedDB has no practical cap and writes
   one show per tap. The pre-v44 localStorage copy is deliberately left in
   place, untouched, so an older version still has something to fall back to;
   Settings has a button to clear it once you are happy. */
const IDB_NAME = "signal", IDB_VER = 1;
let idbHandle = null, idbBroken = false;
function idbOpen() {
  if (idbHandle) return Promise.resolve(idbHandle);
  return new Promise((res, rej) => {
    let rq; try { rq = indexedDB.open(IDB_NAME, IDB_VER); } catch (e) { return rej(e); }
    rq.onupgradeneeded = () => {
      const d = rq.result;
      if (!d.objectStoreNames.contains("shows")) d.createObjectStore("shows", { keyPath: "id" });
      if (!d.objectStoreNames.contains("movies")) d.createObjectStore("movies", { keyPath: "id" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "k" });
    };
    rq.onsuccess = () => { idbHandle = rq.result; res(idbHandle); };
    rq.onerror = () => rej(rq.error);
    rq.onblocked = () => rej(new Error("blocked"));
  });
}
function idbGetAll(name) {
  return idbOpen().then((d) => new Promise((res, rej) => {
    const rq = d.transaction(name, "readonly").objectStore(name).getAll();
    rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error);
  }));
}
function idbWrite(name, puts, dels, clearFirst) {
  return idbOpen().then((d) => new Promise((res, rej) => {
    const tx = d.transaction(name, "readwrite"), st = tx.objectStore(name);
    if (clearFirst) st.clear();
    for (const r of puts || []) st.put(r);
    for (const k of dels || []) st.delete(k);
    tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => rej(tx.error);
  }));
}

let db = [], movies = [], delMap = {};
let ghToken = store("signal.token") || "";
let gistId = store("signal.gistid") || "";
let pushTimer = null, cloudBusy = false, lastCloud = +store("signal.lastcloud") || 0;

/* What has changed since the last write. Only these get sent to disk. */
const dirtyShows = new Set(), deadShows = new Set();
const dirtyMovies = new Set(), deadMovies = new Set();
let metaDirty = false;

function touch(sh) { sh.updatedAt = Date.now(); dirtyShows.add(sh.id); }
function touchMovie(m) { m.updatedAt = Date.now(); dirtyMovies.add(m.id); }

/* The last-resort path: a private window, or storage the browser has blocked.
   Same as v43, 5 MB ceiling and all. */
function saveToLS() {
  store("signal.db", JSON.stringify(db));
  store("signal.del", JSON.stringify(delMap));
  store("signal.movies", JSON.stringify(movies));
}
function persist(full) {
  if (idbBroken) { saveToLS(); return Promise.resolve(); }
  const shPuts = full ? db : db.filter((s) => dirtyShows.has(s.id));
  const mvPuts = full ? movies : movies.filter((m) => dirtyMovies.has(m.id));
  const shDels = [...deadShows], mvDels = [...deadMovies];
  dirtyShows.clear(); deadShows.clear(); dirtyMovies.clear(); deadMovies.clear();
  const writes = [];
  if (full || shPuts.length || shDels.length) writes.push(idbWrite("shows", shPuts, shDels, full));
  if (full || mvPuts.length || mvDels.length) writes.push(idbWrite("movies", mvPuts, mvDels, full));
  if (full || metaDirty) { metaDirty = false; writes.push(idbWrite("meta", [{ k: "del", v: delMap }])); }
  return Promise.all(writes).then(() => { storageFull = false; }).catch(() => {
    // Quota exceeded, or the store went away mid-write. Say so rather than
    // letting the tap look like it worked.
    storageFull = true;
    try { toast(t("err_save"), 9000); } catch (_) {}
    try { render(); } catch (_) {}
  });
}
const saveLocal = () => persist(false);
const saveAll = () => persist(true);
function save() { const p = persist(false); schedulePush(); return p; }

async function loadAll() {
  try {
    const [shows, mvs, meta] = await Promise.all([idbGetAll("shows"), idbGetAll("movies"), idbGetAll("meta")]);
    const m = {}; for (const r of meta) m[r.k] = r.v;
    if (shows.length || mvs.length || m.migrated) {
      db = shows; movies = mvs; delMap = m.del || {};
    } else {
      // First run on this version: carry the localStorage library across.
      db = readLS("signal.db", []) || []; movies = readLS("signal.movies", []) || []; delMap = readLS("signal.del", {}) || {};
      await persist(true);
      await idbWrite("meta", [{ k: "migrated", v: Date.now() }]);
    }
  } catch (e) {
    idbBroken = true;
    db = readLS("signal.db", []) || []; movies = readLS("signal.movies", []) || []; delMap = readLS("signal.del", {}) || {};
  }
  // Newest first. addedAt is set on every add from v44 on; older records fall
  // back to updatedAt, which is the best guess their data allows.
  db.sort((a, b) => (b.addedAt || b.updatedAt || 0) - (a.addedAt || a.updatedAt || 0));
}

/* ================= preferences ================= */
const REGION = (() => { try {
  const l = (navigator.languages && navigator.languages[0]) || navigator.language || "";
  const m = l.match(/[-_]([A-Za-z]{2})$/); return m ? m[1].toUpperCase() : "";
} catch (e) { return ""; } })();
let myPlatforms = readLS("signal.platforms", []);
let discCache = readLS("signal.discover", null);
let mdiscCache = readLS("signal.mdiscover", null);

/* ================= cloud sync via the user's private GitHub Gist ================= */
const GIST_FILE = "signal-db.json";
async function gh(path, opts = {}) {
  const r = await fetch("https://api.github.com" + path, { ...opts,
    headers: { "Authorization": "Bearer " + ghToken, "Accept": "application/vnd.github+json", ...(opts.headers || {}) } });
  if (r.status === 401) throw new Error("BADTOKEN");
  if (!r.ok) throw new Error("HTTP" + r.status);
  return r.json();
}
async function findGist() {
  if (gistId) return gistId;
  // Page through them. v43 looked at the first 100 only, so past that it found
  // nothing, created a SECOND database gist, and the two devices quietly
  // stopped agreeing with each other.
  for (let page = 1; page <= 10; page++) {
    const gists = await gh(`/gists?per_page=100&page=${page}`);
    if (!gists || !gists.length) break;
    const hit = gists.find((g) => g.files && g.files[GIST_FILE]);
    if (hit) { gistId = hit.id; store("signal.gistid", gistId); return gistId; }
    if (gists.length < 100) break;
  }
  return null;
}
function mergeMovies(remote) {
  // A film is a single decision - watched or not - so the newer copy winning
  // outright is honest here in a way it never was for an episode grid.
  const map = {};
  for (const m of remote || []) map[m.id] = m;
  for (const m of movies) if (!map[m.id] || (m.updatedAt || 0) >= (map[m.id].updatedAt || 0)) map[m.id] = m;
  const sig = (a) => JSON.stringify(a.map((m) => [m.id, m.updatedAt, !!m.watched, !!m.dl]).sort());
  const before = sig(movies);
  movies = Object.values(map).filter((m) => !(delMap[m.id] && delMap[m.id] > (m.updatedAt || 0)));
  return before !== sig(movies);
}
function mergeCloud(remoteShows, remoteDel) {
  for (const [id, ts] of Object.entries(remoteDel || {}))
    if (!delMap[id] || ts > delMap[id]) { delMap[id] = ts; metaDirty = true; }
  const local = {}; for (const s of db) local[s.id] = s;
  const out = {};
  for (const s of (remoteShows || [])) out[s.id] = local[s.id] ? mergeShow(local[s.id], s) : s;
  for (const s of db) if (!out[s.id]) out[s.id] = s;
  const sig = (arr) => JSON.stringify(arr.map((s) => [s.id, s.updatedAt,
    Object.keys(s.watched || {}).sort().join(","), Object.keys(s.dl || {}).sort().join(",")]));
  const before = sig(db);
  db = Object.values(out)
    .filter((s) => !(delMap[s.id] && delMap[s.id] > (s.updatedAt || 0)))
    .sort((a, b) => (b.addedAt || b.updatedAt || 0) - (a.addedAt || a.updatedAt || 0));
  return before !== sig(db);
}
async function pullCloud(quiet) {
  if (!ghToken || cloudBusy) return;
  cloudBusy = true; paintStatus();
  try {
    const id = await findGist();
    if (id) {
      const g = await gh("/gists/" + id);
      const f = g.files && g.files[GIST_FILE];
      let content = f && f.content;
      if (f && f.truncated) content = await (await fetch(f.raw_url)).text();
      if (content) {
        const remote = JSON.parse(content);
        const changed = mergeCloud(remote.shows, remote.deleted);
        const mChanged = mergeMovies(remote.movies || []);
        await saveAll();   // a merge can rewrite every record, so write the lot
        if (changed || mChanged) { render(); if (!quiet) toast(t("toast_synced_cloud")); }
      }
    }
    lastCloud = Date.now(); store("signal.lastcloud", String(lastCloud));
  } catch (e) { if (!quiet) toast(e.message === "BADTOKEN" ? t("err_token_rejected") : t("err_cloud_pull")); }
  cloudBusy = false; paintStatus();
}
async function pushCloud() {
  if (!ghToken) return;
  clearTimeout(pushTimer); pushTimer = null;
  try {
    const payload = () => JSON.stringify({ v: 1, ts: Date.now(), shows: db, deleted: delMap, movies });
    let id = await findGist();
    if (id) { await gh("/gists/" + id, { method: "PATCH", body: JSON.stringify({ files: { [GIST_FILE]: { content: payload() } } }) }); }
    else {
      const g = await gh("/gists", { method: "POST",
        body: JSON.stringify({ description: "Signal tracker database (auto-managed)", public: false,
          files: { [GIST_FILE]: { content: payload() } } }) });
      gistId = g.id; store("signal.gistid", gistId);
    }
    lastCloud = Date.now(); store("signal.lastcloud", String(lastCloud));
  } catch (e) { toast(e.message === "BADTOKEN" ? t("err_token_off") : t("err_cloud_push")); }
  paintStatus();
}
function schedulePush() { if (!ghToken) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushCloud, 2500); paintStatus(); }

/* ================= TVmaze (no account, no key) ================= */
const MAZE = "https://api.tvmaze.com";
async function maze(path) {
  const r = await fetch(MAZE + path);
  if (!r.ok) throw new Error("HTTP" + r.status);
  return r.json();
}
async function fetchFullShow(showId, existingWatched) {
  const det = await maze(`/shows/${showId}?embed[]=episodes&embed[]=nextepisode`);
  const bySeason = {};
  for (const ep of (det._embedded && det._embedded.episodes) || []) {
    if (!ep.season || !ep.number) continue;
    (bySeason[ep.season] = bySeason[ep.season] || []).push({ e: ep.number, air: ep.airdate || null,
      ts: ep.airtime ? (ep.airstamp || null) : null,
      name: (ep.name || "").slice(0, 60) });
  }
  const seasons = Object.keys(bySeason).map(Number).sort((a, b) => a - b)
    .map((sn) => ({ season: sn, eps: bySeason[sn].sort((a, b) => a.e - b.e) }));
  if (seasons.some((x) => x.eps.length > 150)) throw new Error("DAILY");
  const nx = det._embedded && det._embedded.nextepisode;
  const homeOn = (det.webChannel && det.webChannel.name) || (det.network && det.network.name) || null;
  const firstAir = det.premiered || null;
  const tz = ((det.network && det.network.country) || (det.webChannel && det.webChannel.country) || {}).timezone || null;
  const airKind = det.webChannel ? "web" : "net";
  const hasAired = seasons.some((s) => s.eps.some((e) => epLive(e, tz, airKind)));
  return {
    id: det.id, title: det.name,
    year: firstAir ? +firstAir.slice(0, 4) : null,
    poster: (det.image && det.image.medium) || null,
    inProduction: det.status === "Running" || det.status === "In Development",
    tmdbStatus: det.status === "Running" ? "Returning Series" : (det.status || ""),
    runtime: det.averageRuntime || det.runtime || 40,
    imdb: (det.externals && det.externals.imdb) || null,
    watchOn: homeOn ? [homeOn] : [],
    firstAir,
    upcoming: !hasAired,
    tz, airKind,
    nextEp: (nx && (nx.airstamp || nx.airdate)) ? { s: nx.season, e: nx.number,
      ts: nx.airtime ? (nx.airstamp || null) : null,
      date: (nx.airtime && nx.airstamp) ? localDate(nx.airstamp) : nx.airdate } : null,
    seasons,
    watched: existingWatched || {},
    lastSynced: Date.now()
  };
}
/* Synopsis, genres, language and country are fetched when a show is opened and
   kept in memory only. Storing them for a library of hundreds would bloat the
   sync gist for text nobody reads twice. */
const infoCache = {};
async function loadInfo(id, season) {
  const key = id + ":" + (season || "");
  if (infoCache[key]) return infoCache[key];
  infoCache[key] = { loading: true }; render();
  try {
    const det = await maze("/shows/" + id + (season ? "?embed[]=episodes" : ""));
    const eps = ((det._embedded && det._embedded.episodes) || []).filter((e) => e.season === season && e.number);
    const where = det.network || det.webChannel || {};
    infoCache[key] = {
      summary: plain(det.summary).slice(0, 600),
      genres: det.genres || [],
      language: det.language || "",
      country: (where.country && where.country.name) || "",
      runtime: det.averageRuntime || det.runtime || null,
      status: det.status || "",
      imdb: (det.externals && det.externals.imdb) || null,
      rating: det.rating && det.rating.average || null,
      epCount: season ? eps.length : null,
    };
  } catch (e) { infoCache[key] = { error: true }; }
  render();
  return infoCache[key];
}

/* ================= changing marks ================= */
let syncing = false, syncProgress = null; // {i, n, title}
let markMode = {};          // showId -> "watch" | "dl"
let dlPrompt = null;        // {id, s, e}: a just-watched episode waiting for its download answer
let undoState = null;

/* Every change to a mark stamps sh.wts / sh.dts, which is how a sync works out
   which device acted last. Setting sh.watched[k] by hand skips the stamp, so
   all of it goes through these two. */
function setWatched(sh, k, on, val) {
  sh.watched = sh.watched || {}; sh.wts = sh.wts || {};
  if (on) sh.watched[k] = val || 1; else delete sh.watched[k];
  sh.wts[k] = Date.now();
}
function setDl(sh, k, on) {
  sh.dl = sh.dl || {}; sh.dts = sh.dts || {};
  if (on) sh.dl[k] = 1; else delete sh.dl[k];
  sh.dts[k] = Date.now();
}
function toggleEp(id, s, e) {
  const sh = db.find((x) => x.id === id); if (!sh) return;
  const seas = sh.seasons.find((x) => x.season === s); if (!seas) return;
  const ep = seas.eps.find((x) => x.e === e); if (!ep) return;   // a sync can retire an episode a stale button still points at
  if (!aired(sh, ep)) return;
  const k = epK(s, e);
  const label = codeOf(s, e) + (ep.name ? " · " + ep.name : "");
  if (dlOn(sh) && markMode[sh.id] === "dl") {
    const on = !(sh.dl && sh.dl[k]);
    setDl(sh, k, on);
    toast(t(on ? "toast_dl_on" : "toast_dl_off", { ep: label }));
    touch(sh); save(); render(); return;
  }
  const before = catOf(sh);
  const marking = !(sh.watched && sh.watched[k]);
  setWatched(sh, k, marking, Date.now());   // a timestamp, not 1: a single deliberate mark
  if (marking && dlOn(sh) && !(sh.dl && sh.dl[k])) dlPrompt = { id: sh.id, s, e };
  else if (dlPrompt && dlPrompt.id === sh.id) dlPrompt = null;
  const after = catOf(sh);
  toast(t(marking ? "toast_marked" : "toast_unmarked", { ep: label }) + (before !== after ? " " + t("toast_moved", { cat: t("cat_" + after) }) : ""));
  touch(sh); save(); render();
}
/* Putting marks back is itself an action, so the restored keys are stamped
   now - otherwise the undo would never reach the other device. */
function restoreMarks(sh, snap) {
  const now = Date.now(); sh.wts = sh.wts || {}; sh.watched = sh.watched || {};
  for (const k of new Set([...Object.keys(sh.watched), ...Object.keys(snap)])) {
    const had = Object.prototype.hasOwnProperty.call(sh.watched, k);
    const want = Object.prototype.hasOwnProperty.call(snap, k);
    if (had !== want) sh.wts[k] = now;
  }
  sh.watched = { ...snap };
}
function applyUndo() {
  if (!undoState) return;
  if (undoState.kind === "show") {
    const sh = undoState.show;
    if (!db.some((x) => x.id === sh.id)) {
      db.splice(Math.min(undoState.index, db.length), 0, sh);
      delete delMap[sh.id]; metaDirty = true; deadShows.delete(sh.id);
      touch(sh); save(); render();
    }
  } else {
    const sh = db.find((x) => x.id === undoState.id);
    if (sh) { restoreMarks(sh, undoState.watched); touch(sh); save(); render(); }
  }
  undoState = null;
}
function markBulkDownloaded(id, scope) {
  const sh = db.find((x) => x.id === id); if (!sh) return;
  let n = 0;
  for (const se of sh.seasons) {
    if (scope !== "all" && se.season !== +scope) continue;
    for (const ep of se.eps) {
      const k = epK(se.season, ep.e);
      if (sh.watched && sh.watched[k] && !(sh.dl && sh.dl[k])) { setDl(sh, k, true); n++; }
    }
  }
  touch(sh); save(); render();
  toast(t("toast_bulk_dl", { n }));
}
function markSeason(id, s, on) {
  const sh = db.find((x) => x.id === id); if (!sh) return;
  const seas = sh.seasons.find((x) => x.season === s); if (!seas) return;
  if (dlOn(sh) && markMode[sh.id] === "dl") {
    undoState = null;
    for (const ep of seas.eps) {
      const k = epK(s, ep.e);
      if (on && sh.watched && sh.watched[k]) setDl(sh, k, true);
      if (!on) setDl(sh, k, false);
    }
    touch(sh); save(); render();
    toast(t(on ? "toast_season_dl_on" : "toast_season_dl_off", { n: s }));
    return;
  }
  undoState = { kind: "marks", id: sh.id, watched: { ...(sh.watched || {}) } };
  for (const ep of seas.eps) {
    const k = epK(s, ep.e);
    if (on && aired(sh, ep)) setWatched(sh, k, true, 1);
    if (!on) setWatched(sh, k, false);
  }
  touch(sh); save(); render();
  toast(t(on ? "toast_season_on" : "toast_season_off", { n: s }), { undo: true, dlScope: (on && dlOn(sh)) ? String(s) : null, dlId: sh.id });
}
function catchUp(id) {
  const sh = db.find((x) => x.id === id); if (!sh) return;
  undoState = { kind: "marks", id: sh.id, watched: { ...(sh.watched || {}) } };
  for (const k of Object.keys(sh.watched || {})) setWatched(sh, k, false);
  for (const s of sh.seasons) for (const ep of s.eps) if (aired(sh, ep)) setWatched(sh, epK(s.season, ep.e), true, 1);
  touch(sh); save(); render();
  toast(t("toast_caught_up", { cat: t("cat_" + catOf(sh)) }), { undo: true, dlScope: dlOn(sh) ? "all" : null, dlId: sh.id });
}
function markNext(id) { const sh = db.find((x) => x.id === id); const n = sh && nextUnwatched(sh); if (n) toggleEp(id, n.s, n.e); }
function removeShow(id) {
  const i = db.findIndex((s) => s.id === id); if (i < 0) return;
  const sh = db[i];
  // Marking a season has had an Undo since v43; removing a show with two
  // hundred watched episodes did not. Now it does.
  undoState = { kind: "show", show: sh, index: i };
  db.splice(i, 1); deadShows.add(id); dirtyShows.delete(id);
  delMap[id] = Date.now(); metaDirty = true;
  save();
  toast(t("toast_removed", { title: sh.title }), { undo: true });
}

/* ================= adding and refreshing shows ================= */
async function addShowById(showId) {
  if (db.some((s) => s.id === showId)) return { dup: true };
  const show = await fetchFullShow(showId);
  touch(show); show.addedAt = Date.now();
  db.unshift(show); save();
  return { show };
}
function createManualShow(title, platform, counts) {
  const today = todayISO();
  const show = { id: -Date.now(), title, year: null, poster: null,
    inProduction: false, tmdbStatus: "", runtime: 40, imdb: null,
    watchOn: platform ? [platform] : [], firstAir: null, upcoming: false, nextEp: null,
    seasons: counts.map((c, i) => ({ season: i + 1, eps: Array.from({ length: c }, (_, j) => ({ e: j + 1, air: today, ts: null, name: "" })) })),
    watched: {}, lastSynced: Date.now(), manual: true };
  show.addedAt = Date.now();
  touch(show); db.unshift(show); save();
  return show;
}
/* Returns true if the season hit the 150 cap. */
function addManualEpisodes(sh, sn, cnt) {
  let seas = sh.seasons.find((x) => x.season === sn);
  if (!seas) { seas = { season: sn, eps: [] }; sh.seasons.push(seas); sh.seasons.sort((a, b) => a.season - b.season); }
  const start = seas.eps.length ? Math.max(...seas.eps.map((e) => e.e)) : 0;
  const today = todayISO();
  for (let j = 1; j <= cnt; j++) seas.eps.push({ e: start + j, air: today, ts: null, name: "" });
  let capped = false;
  if (seas.eps.length > 150) { seas.eps = seas.eps.slice(0, 150); capped = true; }
  touch(sh); save();
  return capped;
}
async function syncShow(id, silent) {
  const sh = db.find((s) => s.id === id); if (!sh || syncing) return;
  if (sh.manual) { toast(t("err_manual_nosync")); return; }
  if (!navigator.onLine) { toast(t("err_offline_sync")); return; }
  syncing = true; syncProgress = null; if (!silent) toast(t("toast_syncing_one", { title: sh.title }), 5000); paintStatus(); render();
  try {
    const fresh = await fetchFullShow(id, sh.watched);
    Object.assign(sh, fresh); clearSyncFail(sh); touch(sh); save();
    if (!silent) toast(t("toast_synced_one", { title: sh.title }));
  } catch (e) {
    noteSyncFail(sh, e); touch(sh); save();
    if (!silent) toast(t("toast_sync_failed_one", { title: sh.title, why: failWhy(sh.syncFail) }), 6000);
  }
  syncing = false; paintStatus(); render();
}
/* Every refresh, explicit or on opening. TVmaze rate-limits, so shows go one
   at a time with a pause; v43 fired them back to back, so a big library was the
   case most likely to fail, and it still said "Sync complete". */
async function refreshShows(targets, announce) {
  if (syncing || !targets.length) return { ok: 0, failed: [] };
  syncing = true;
  let ok = 0; const failed = [];
  for (let i = 0; i < targets.length; i++) {
    syncProgress = { i: i + 1, n: targets.length, title: targets[i].title }; paintStatus();
    try {
      const fresh = await fetchFullShow(targets[i].id, targets[i].watched);
      Object.assign(targets[i], fresh); clearSyncFail(targets[i]); touch(targets[i]); save(); ok++;
    } catch (e) { noteSyncFail(targets[i], e); touch(targets[i]); failed.push(targets[i].title); }
    if (i < targets.length - 1) await sleep(600);
  }
  syncing = false; syncProgress = null; paintStatus(); render();
  if (announce) {
    if (failed.length) toast(t("toast_sync_partial", { ok, n: failed.length, names: failed.slice(0, 3).join(", ") + (failed.length > 3 ? "…" : "") }), 7000);
    else toast(t("toast_synced_n", { n: ok }));
  }
  return { ok, failed };
}
/* The button asks for everything, so it retries the stuck shows too. */
async function syncAll() {
  if (syncing) return;
  if (!navigator.onLine) { toast(t("err_offline_sync")); return; }
  const targets = db.filter(syncable);
  if (!targets.length) { toast(t("toast_nothing_to_sync")); return; }
  await refreshShows(targets, true);
}
/* Opening the app refreshes whatever has gone stale, skipping the shows that
   can never succeed (they used to cost 600ms each on every open). */
const STALE_MS = 12 * 3600 * 1000, WARN_MS = 3 * 864e5;
const staleShows = () => db.filter((s) => syncable(s) && !stuck(s) && (!s.lastSynced || Date.now() - s.lastSynced > WARN_MS));
async function refreshStale() {
  if (!navigator.onLine) return;
  await refreshShows(db.filter((s) => syncable(s) && !stuck(s) && (!s.lastSynced || Date.now() - s.lastSynced > STALE_MS)), false);
}

/* ================= export and import ================= */
function exportDb() {
  const blob = new Blob([JSON.stringify({ v: 3, exported: new Date().toISOString(), shows: db, movies }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "signal-backup-" + todayISO() + ".json"; a.click();
  store("signal.lastexport", String(Date.now()));
}
/* A backup is a file from outside, so its records are checked before they are
   believed: a show needs an id and a list of seasons, a film needs an id. */
function importDb(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (!Array.isArray(j.shows)) { toast(t("err_not_backup")); return; }
      const shows = j.shows.filter((s) => s && typeof s === "object" && s.id != null && Array.isArray(s.seasons));
      db = shows; db.forEach((x) => touch(x));
      if (Array.isArray(j.movies)) { movies = j.movies.filter((m) => m && typeof m === "object" && m.id != null); movies.forEach((x) => touchMovie(x)); }
      saveAll().then(() => { schedulePush(); render(); toast(t("toast_imported", { shows: db.length, movies: movies.length })); });
    } catch (e) { toast(t("err_import_invalid")); }
  };
  r.readAsText(file);
}

/* ================= discover ================= */
async function fetchDiscover(force) {
  if (discLoading) return;
  if (!force && discCache && discCache.v === 2 && Date.now() - discCache.ts < 24 * 3600 * 1000) { render(); return; }
  if (!navigator.onLine) { toast(t("err_offline_discover")); return; }
  if (!myPlatforms.length) { render(); return; }
  discLoading = true; discError = false; render();
  const found = {};
  try {
    const all = await maze("/schedule/full");
    const limit = new Date(); limit.setDate(limit.getDate() + 60);
    const limISO = limit.getFullYear() + "-" + pad(limit.getMonth() + 1) + "-" + pad(limit.getDate());
    const today = todayISO();
    for (const ep of all || []) {
      if (ep.number !== 1) continue;
      const show = (ep._embedded && ep._embedded.show) || ep.show; if (!show) continue;
      const d = (ep.airtime && ep.airstamp) ? localDate(ep.airstamp) : (ep.airdate || null);
      if (!d || d < today || d > limISO) continue;
      const hits = platformMatch(show.webChannel && show.webChannel.name, myPlatforms);
      if (!hits.length) continue;
      if (!found[show.id] || d < found[show.id].date) found[show.id] = {
        id: show.id, title: show.name,
        poster: (show.image && show.image.medium) || null,
        date: d, season: ep.season, ts: ep.airtime ? (ep.airstamp || null) : null,
        platform: hits[0].label, lang: show.language || null,
      };
    }
    discCache = { v: 2, ts: Date.now(), items: Object.values(found).sort((a, b) => a.date < b.date ? -1 : 1) };
    store("signal.discover", JSON.stringify(discCache));
  } catch (e) { discError = true; }
  discLoading = false; render();
}
async function fetchMovieDiscover(force) {
  if (mdiscLoading) return;
  if (!force && mdiscCache && mdiscCache.v === 2 && Date.now() - mdiscCache.ts < 24 * 3600 * 1000) {
    render(); loadPosters(mdiscCache.items, () => store("signal.mdiscover", JSON.stringify(mdiscCache))); return;   // top up any posters still missing
  }
  if (!navigator.onLine) { toast(t("err_offline_movies")); return; }
  mdiscLoading = true; mdiscError = null; render();
  try {
    const iso = (ms) => new Date(ms).toISOString().slice(0, 10) + "T00:00:00Z";
    const q = `SELECT ?f ?fLabel ?d ?sl ?article WHERE {
  ?f wdt:P31 wd:Q11424; wdt:P577 ?d; wdt:P345 ?imdb; wikibase:sitelinks ?sl .
  FILTER(?d >= "${iso(Date.now())}"^^xsd:dateTime && ?d <= "${iso(Date.now() + 90 * 864e5)}"^^xsd:dateTime)
  FILTER(?sl >= 4 || EXISTS { ?f wdt:P495 wd:Q668 } || EXISTS { ?f wdt:P364 wd:Q1568 })
  FILTER NOT EXISTS { ?f wdt:P577 ?older . FILTER(?older < "${iso(Date.now() - 365 * 864e5)}"^^xsd:dateTime) }
  OPTIONAL { ?article schema:about ?f ; schema:isPartOf <https://en.wikipedia.org/> . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?sl) LIMIT 60`;
    const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q),
      { headers: { Accept: "application/sparql-results+json" } });
    if (!r.ok) throw new Error("Wikidata replied " + r.status);
    const j = await r.json();
    const map = {};
    for (const b of (j.results && j.results.bindings) || []) {
      const label = b.fLabel && b.fLabel.value; if (!label || /^Q\d+$/.test(label)) continue;
      const qid = b.f.value.split("/").pop(), d = b.d.value.slice(0, 10);
      const art = b.article && b.article.value ? decodeURIComponent(b.article.value.split("/").pop()) : null;
      if (!map[qid] || d < map[qid].date) map[qid] = { qid, title: label, date: d, article: art };
    }
    mdiscCache = { v: 2, ts: Date.now(), items: Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1) };
    store("signal.mdiscover", JSON.stringify(mdiscCache));
    mdiscLoading = false; render();          // show the list first, posters fill in after
    await loadPosters(mdiscCache.items, () => store("signal.mdiscover", JSON.stringify(mdiscCache)));
  } catch (e) { mdiscError = (e && e.message) || "request failed"; }
  mdiscLoading = false; render();
}
/* One poster loader for every list of films: each item has an article title
   and, once looked up, a poster URL (or null for "none"). Four at a time. */
async function loadPosters(items, done) {
  const pending = items.filter((x) => x.article && x.poster === undefined);
  if (!pending.length) return;
  let i = 0;
  const worker = async () => {
    while (i < pending.length) {
      const it = pending[i++];
      try {
        const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(it.article.replace(/ /g, "_")));
        it.poster = r.ok ? (((await r.json()).thumbnail || {}).source || null) : null;
      } catch (e) { it.poster = null; }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (done) done();
  render();
}

/* ================= films (Wikidata) ================= */
const WD = "https://www.wikidata.org/w/api.php";
async function wdSearch(q) {
  const u = WD + "?action=wbsearchentities&language=en&format=json&origin=*&limit=8&search=" + encodeURIComponent(q);
  const r = await fetch(u); if (!r.ok) throw new Error("wd");
  return (await r.json()).search || [];
}
async function wdDetails(qid) {
  const u = WD + "?action=wbgetentities&props=claims|sitelinks&format=json&origin=*&ids=" + qid;
  const r = await fetch(u); if (!r.ok) throw new Error("wd");
  const ent = ((await r.json()).entities || {})[qid] || {};
  const claims = ent.claims || {};
  let rel = null, run = null;
  const p577 = claims.P577 && claims.P577[0]?.mainsnak?.datavalue?.value?.time;
  if (p577) rel = p577.slice(1, 11);
  const p2047 = claims.P2047 && claims.P2047[0]?.mainsnak?.datavalue?.value?.amount;
  if (p2047) run = Math.round(Math.abs(parseFloat(p2047)));
  const article = (ent.sitelinks && ent.sitelinks.enwiki && ent.sitelinks.enwiki.title) || null;
  return { rel, run, article };
}
const movieById = (id) => movies.find((m) => m.id === id);
const isWdMovie = (id) => /^mv-Q\d+$/.test(id || "");
function addMovieFromWd(hit, det) {
  const m = { id: "mv-" + hit.id, title: hit.label, year: det.rel ? +det.rel.slice(0, 4) : null,
    releaseDate: det.rel || null, runtime: det.run || null, article: det.article || null,
    watched: false, watchedAt: null, dlWant: false, dl: false,
    addedAt: Date.now(), updatedAt: Date.now() };
  movies.unshift(m); dirtyMovies.add(m.id); save();
  return m;
}
/* Returns the new film, or null if one with that title is already there. */
function createManualMovie(title, date) {
  if (movies.some((m) => (m.title || "").toLowerCase() === title.toLowerCase())) return null;
  const nm = { id: "mvman-" + Date.now(), title, year: date ? +date.slice(0, 4) : null, releaseDate: date || null, runtime: null,
    watched: false, watchedAt: null, dlWant: false, dl: false, manual: true,
    addedAt: Date.now(), updatedAt: Date.now() };
  movies.unshift(nm); dirtyMovies.add(nm.id); save();
  return nm;
}
/* Films added before 3.0 have no poster or article. Fill them in the
   background, a few at a time. This must NOT bump updatedAt: a poster is
   cosmetic, and a newer timestamp would let it beat a watched mark made on
   another device. It is saved on this device only; the next real change
   carries it to the gist. */
let posterBusy = false;
async function ensureMoviePosters() {
  if (posterBusy || !navigator.onLine) return;
  const todo = movies.filter((m) => isWdMovie(m.id) && (m.article === undefined || (m.article && m.poster === undefined))).slice(0, 40);
  if (!todo.length) return;
  posterBusy = true;
  try {
    for (const m of todo) {
      if (m.article === undefined) {
        try { m.article = (await wdDetails(m.id.slice(3))).article || null; } catch (e) { continue; }
        dirtyMovies.add(m.id);
      }
    }
    await loadPosters(todo, () => { for (const m of todo) dirtyMovies.add(m.id); persist(false); });
  } finally { posterBusy = false; }
}

/* ================= importing from TV Time ================= */
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function mvParseFile(text) {
  const rows = parseCSV(text); const head = rows[0]; const ix = {}; head.forEach((h, i) => ix[h] = i);
  if (!("entity_type" in ix) || !("series_name" in ix)) return null;
  const nameCol = ("movie_name" in ix) ? ix.movie_name : ix.series_name;
  const map = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row || row.length < 3) continue;
    if ((row[ix.entity_type] || "").trim() !== "movie") continue;
    const name = (row[nameCol] || row[ix.series_name] || "").trim(); if (!name) continue;
    const rel = (row[ix.release_date] || "").slice(0, 10);
    const year = /^\d{4}/.test(rel) && rel.slice(0, 4) !== "0001" ? +rel.slice(0, 4) : null;
    const key = (name + "|" + (year || "")).toLowerCase();
    const type = row[ix.type] || "";
    const when = (row[ix.created_at] || "").slice(0, 10);
    if (!map[key]) map[key] = { id: "mv-tt-" + key.replace(/[^a-z0-9]+/g, "-").slice(0, 60),
      title: name, year, releaseDate: year && rel.slice(0, 4) !== "0001" ? rel : null, runtime: null,
      watched: false, watchedAt: null, dlWant: false, dl: false, addedAt: Date.now(), updatedAt: Date.now() };
    if (type === "watch" || type === "rewatch") {
      map[key].watched = true;
      if (!map[key].watchedAt || when > map[key].watchedAt.slice(0, 10)) map[key].watchedAt = when || null;
    }
  }
  return Object.values(map);
}
function ttParseFile(text) {
  const rows = parseCSV(text);
  const head = rows[0]; const ix = {}; head.forEach((h, i) => ix[h] = i);
  const need = ["series_name", "season_number", "ep_no", "s_id", "created_at"];
  for (const n of need) if (!(n in ix)) return null;
  const shows = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row || row.length < head.length - 2) continue;
    const name = row[ix.series_name], sn = row[ix.season_number], en = row[ix.ep_no];
    if (!name || !sn || !en) continue;
    if (ix.is_special !== undefined && (row[ix.is_special] === "1")) continue;
    const key = name;
    if (!shows[key]) shows[key] = { name, sid: row[ix.s_id] || null, eps: {}, last: "", first: "9999" };
    shows[key].eps[sn + "-" + en] = 1;
    const d = row[ix.created_at] || "";
    if (d > shows[key].last) shows[key].last = d;
    if (d && d < shows[key].first) shows[key].first = d;
  }
  const all = Object.values(shows);
  let firstDate = "9999", total = 0;
  for (const sh of all) {
    total += Object.keys(sh.eps).length;
    if (sh.first && sh.first !== "9999" && sh.first < firstDate) firstDate = sh.first;
  }
  if (firstDate === "9999") firstDate = "";
  store("signal.legacy", JSON.stringify({ eps: total, since: firstDate, captured: Date.now() }));
  return all.sort((a, b) => a.last < b.last ? 1 : -1);
}
async function ttLookup(it) {
  if (it.sid) {
    try {
      const r = await fetch(MAZE + "/lookup/shows?thetvdb=" + encodeURIComponent(it.sid));
      if (r.ok) return r.json();
    } catch (e) {}
  }
  try {
    const r = await fetch(MAZE + "/singlesearch/shows?q=" + encodeURIComponent(it.name));
    if (r.ok) return r.json();
  } catch (e) {}
  return null;
}
let ttCancel = false;
/* Walks the chosen shows one by one (TVmaze is polite-rate-limited), marking
   what the export says was watched. onStep reports progress to the screen. */
async function ttImport(sel, onStep) {
  ttCancel = false;
  const skipped = []; let added = 0, merged = 0;
  for (let i = 0; i < sel.length; i++) {
    if (ttCancel) break;
    const it = sel[i];
    onStep({ i, n: sel.length, name: it.name, added, merged, skipped: skipped.length });
    try {
      const found = await ttLookup(it);
      if (!found || !found.id) { skipped.push({ n: it.name, code: "notfound" }); continue; }
      await sleep(650);
      let target = db.find((x) => x.id === found.id);
      if (!target) {
        const full = await fetchFullShow(found.id);
        full.addedAt = Date.now();
        touch(full); db.unshift(full); target = full; added++;
      } else merged++;
      let hit = 0;
      for (const seas of target.seasons) for (const ep of seas.eps) {
        if (it.eps[seas.season + "-" + ep.e] && epLive(ep, target.tz, target.airKind)) { setWatched(target, epK(seas.season, ep.e), true, 1); hit++; }
      }
      if (hit === 0 && !db.find((x) => x.id === found.id && x !== target)) skipped.push({ n: it.name, code: "nomatch", count: Object.keys(it.eps).length });
      touch(target); saveLocal();
    } catch (e) {
      if ((e && e.message) === "DAILY") skipped.push({ n: it.name, code: "daily" });
      else skipped.push({ n: it.name, code: "network" });
    }
    await sleep(650);
  }
  save();
  return { added, merged, skipped, stopped: ttCancel };
}

/* ================= state the screens read ================= */
let discLoading = false, discError = false, mdiscLoading = false, mdiscError = null;
