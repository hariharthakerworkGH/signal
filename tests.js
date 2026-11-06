/* tests.js - checks for the logic that must never silently break.
 *
 * Runs in tests.html (open it from the same folder, served) and under Node. It
 * loads i18n.js and core.js only, so it never touches a real library, the
 * network, or your data. Results land in window.testResults.
 *
 * What is checked here is what once went wrong or would be quiet when it did:
 * marks lost in a merge, an episode unlocking a day early, a translation that
 * is missing, a cache list that names a file that does not exist.
 */
const TESTS = [];
const test = (name, fn) => TESTS.push({ name, fn });
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg ? msg + ": " : "") + "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); };
const yes = (c, msg) => { if (!c) throw new Error(msg || "expected true"); };
function atTime(iso, fn) { const real = Date.now; Date.now = () => Date.parse(iso); try { return fn(); } finally { Date.now = real; } }
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const T = (n) => 1700000000000 + n;
const ep = (e, extra) => ({ e, air: null, ts: null, name: "", ...extra });
const show = (o) => ({ id: 1, title: "X", seasons: [], watched: {}, ...o });

/* ---------- merging two devices ---------- */
test("merge: marks made on two devices before syncing are both kept", () => {
  const laptop = { id: 1, updatedAt: T(100), watched: { "1-6": T(100) }, wts: { "1-6": T(100) } };
  const phone = { id: 1, updatedAt: T(90), watched: { "1-5": T(90) }, wts: { "1-5": T(90) } };
  eq(Object.keys(mergeShow(laptop, phone).watched).sort(), ["1-5", "1-6"]);
});
test("merge: an unmark travels, it is not brought back by the other side's stale mark", () => {
  const a = { id: 1, updatedAt: T(300), watched: {}, wts: { "1-3": T(300) } };
  const b = { id: 1, updatedAt: T(200), watched: { "1-3": T(200) }, wts: { "1-3": T(200) } };
  eq(Object.keys(mergeShow(a, b).watched), []);
});
test("merge: a later mark beats an earlier unmark", () => {
  const c = { id: 1, updatedAt: T(400), watched: { "1-3": T(400) }, wts: { "1-3": T(400) } };
  const d = { id: 1, updatedAt: T(300), watched: {}, wts: { "1-3": T(300) } };
  eq(Object.keys(mergeShow(c, d).watched), ["1-3"]);
});
test("merge: when the OTHER device acted last, its unmark wins over this device's older mark", () => {
  const local = { id: 1, updatedAt: T(100), watched: { "1-3": T(100) }, wts: { "1-3": T(100) } };
  const remote = { id: 1, updatedAt: T(300), watched: {}, wts: { "1-3": T(300) } };
  eq(Object.keys(mergeShow(local, remote).watched), []);
});
test("merge: when the OTHER device acted last, its mark wins over this device's older unmark", () => {
  const local = { id: 1, updatedAt: T(100), watched: {}, wts: { "1-3": T(100) } };
  const remote = { id: 1, updatedAt: T(300), watched: { "1-3": T(300) }, wts: { "1-3": T(300) } };
  eq(Object.keys(mergeShow(local, remote).watched), ["1-3"]);
});
test("merge: data from before timestamps existed keeps its marks", () => {
  eq(Object.keys(mergeShow({ id: 1, updatedAt: T(20), watched: {} }, { id: 1, updatedAt: T(10), watched: { "1-1": 1 } }).watched), ["1-1"]);
});
test("merge: a single deliberate mark is not downgraded to a bulk mark", () => {
  const bulk = { id: 1, updatedAt: T(50), watched: { "1-1": 1 }, wts: { "1-1": T(50) } };
  const one = { id: 1, updatedAt: T(60), watched: { "1-1": T(60) }, wts: { "1-1": T(60) } };
  yes(mergeShow(bulk, one).watched["1-1"] > 1);
});
test("merge: the newer copy supplies the other fields and updatedAt is the larger", () => {
  const m = mergeShow({ id: 1, title: "Old", updatedAt: T(1), watched: {} }, { id: 1, title: "New", updatedAt: T(9), watched: {} });
  eq([m.title, m.updatedAt], ["New", T(9)]);
});

/* ---------- has it aired ---------- */
test("aired: an exact timestamp in the past is live, in the future is not", () => {
  atTime("2026-10-09T12:00:00Z", () => { yes(epLive(ep(1, { ts: "2026-10-09T11:00:00Z" })), "past"); yes(!epLive(ep(1, { ts: "2026-10-09T13:00:00Z" })), "future"); });
});
test("aired: with no clock time an episode waits until its date has ENDED in the show's own zone", () => {
  const e = ep(1, { air: "2026-10-09" });   // 23:59:59 on 9 Oct in Kolkata is 18:29:59 UTC the same day
  atTime("2026-10-08T18:31:00Z", () => yes(!epLive(e, "Asia/Kolkata"), "the moment the date began there"));
  atTime("2026-10-09T10:00:00Z", () => yes(!epLive(e, "Asia/Kolkata"), "that evening"));
  atTime("2026-10-09T18:31:00Z", () => yes(epLive(e, "Asia/Kolkata"), "next morning"));
});
test("aired: with no timezone on record it assumes US Pacific, so nothing unlocks early", () => {
  const e = ep(1, { air: "2026-10-09" });   // the date ends at 06:59:59 UTC on the 10th in Pacific summer time
  atTime("2026-10-10T06:59:00Z", () => yes(!epLive(e, null)));
  atTime("2026-10-10T07:01:00Z", () => yes(epLive(e, null)));
});

/* ---------- times TVmaze does not know ---------- */
// For an episode with no air time TVmaze sends its date at 12:00 UTC. Kept as a real moment it
// unlocked a US evening show at 8 in the morning and printed a time nobody announced.
const fakeNoon = (d) => d + "T12:00:00+00:00";
test("times: noon UTC saved by an older version is not believed, so the date rule applies", () => {
  const sh = show({ tz: "America/New_York", seasons: [{ season: 1, eps: [ep(1, { air: "2026-10-09", ts: fakeNoon("2026-10-09") })] }] });
  yes(stripFakeTimes(sh), "should report a change");
  eq(sh.seasons[0].eps[0].ts, null);
  atTime("2026-10-09T13:00:00Z", () => yes(!aired(sh, sh.seasons[0].eps[0]), "9am in New York is not the evening"));
});
test("times: a show saved by 4.1 keeps a genuine 12:00 UTC time (8am in New York is real)", () => {
  const sh = show({ tv: 2, seasons: [{ season: 1, eps: [ep(1, { air: "2026-10-09", ts: fakeNoon("2026-10-09") })] }] });
  eq(stripFakeTimes(sh), false); eq(sh.seasons[0].eps[0].ts, fakeNoon("2026-10-09"));
});
test("times: the next-episode date survives losing its fake time", () => {
  const sh = show({ nextEp: { s: 2, e: 1, ts: fakeNoon("2026-11-20"), date: "2026-11-21" } });
  stripFakeTimes(sh); eq([sh.nextEp.ts, sh.nextEp.date], [null, "2026-11-20"]);
});
test("times: only a show with something recent or coming is worth refreshing for its times", () => {
  const soon = addDays(5), old = "2015-01-01";
  yes(needsTimeFix(show({ seasons: [{ season: 1, eps: [ep(1, { air: soon })] }] })), "coming");
  yes(!needsTimeFix(show({ seasons: [{ season: 1, eps: [ep(1, { air: old })] }] })), "old and finished");
  yes(!needsTimeFix(show({ tv: 2, seasons: [{ season: 1, eps: [ep(1, { air: soon })] }] })), "already read properly");
});

/* ---------- the viewer's own time zone ---------- */
test("zone: clock times and 'today' follow the zone chosen in Settings", () => {
  setLang("en");
  try {
    setTZ("Asia/Kolkata"); yes(/5:30/.test(fmtTime("2026-10-09T12:00:00Z")), "12:00 UTC is 5:30 pm in Kolkata: " + fmtTime("2026-10-09T12:00:00Z"));
    atTime("2026-10-09T12:00:00Z", () => {
      setTZ("Pacific/Kiritimati"); eq(todayISO(), "2026-10-10");   // UTC+14: already the next day
      setTZ("Pacific/Pago_Pago"); eq(todayISO(), "2026-10-09");    // UTC-11: still the same morning
    });
    setTZ("Pacific/Kiritimati"); eq(localDate("2026-10-09T12:00:00Z"), "2026-10-10");
  } finally { setTZ(""); }
});
test("zone: a schedule row's day is the viewer's day for the air time shown beside it", () => {
  const sh = { id: 1, title: "X", seasons: [{ season: 1, eps: [{ e: 1, air: "2026-10-01", ts: null }] }], nextEp: { s: 1, e: 1, date: "2026-11-07", ts: "2026-11-07T20:00:00Z" } };   // 8pm UTC, Friday
  try {
    atTime("2026-11-06T10:00:00Z", () => {
      setTZ("Asia/Kolkata"); eq(soonInfo(sh).dateStr, "2026-11-08");        // 1:30 am Saturday in Delhi
      setTZ("America/New_York"); eq(soonInfo(sh).dateStr, "2026-11-07");    // 3 pm Friday in New York
    });
  } finally { setTZ(""); }
});
test("zone: the schedule is in the order of the days its rows show, even for a date-only row", () => {
  const mk = (id, nextEp) => ({ id, title: "S" + id, seasons: [{ season: 1, eps: [{ e: 1, air: "2026-10-01", ts: null }] }], nextEp });
  const dateOnly = mk(1, { s: 2, e: 1, date: "2026-11-08", ts: null });                            // Sunday, no time announced
  const timed = mk(2, { s: 2, e: 1, date: "2026-11-09", ts: "2026-11-09T01:30:00Z" });             // 7 am Monday in Delhi
  try {
    atTime("2026-11-06T10:00:00Z", () => {
      setTZ("Asia/Kolkata");
      eq(scheduleItems([timed, dateOnly], null).map((x) => x.sh.id), [1, 2]);   // Sunday's row first, whatever hour it opens
    });
  } finally { setTZ(""); }
});
test("zone: a name that is not a zone falls back to the phone's own", () => { setTZ("Mars/Olympus"); eq(TZ_PREF, ""); setTZ("Asia/Kolkata"); eq(TZ_PREF, "Asia/Kolkata"); setTZ(""); });
test("zone: an offset reads like UTC+5:30", () => { eq(tzOffsetLabel("Asia/Kolkata"), "UTC+5:30"); eq(tzOffsetLabel("Asia/Kathmandu"), "UTC+5:45"); });
test("aired: 'Data wrong? Unlock' opens everything", () => {
  yes(aired(show({ unlockAll: true }), ep(1, { air: "2999-01-01" })));
});

/* ---------- which tab a show belongs in ---------- */
const live = (n) => ({ season: 1, eps: Array.from({ length: n }, (_, i) => ep(i + 1, { air: "2000-01-01" })) });
test("buckets: aired and unwatched is WATCHING", () => eq(catOf(show({ seasons: [live(3)], watched: { "1-1": 1 }, inProduction: true })), "watching"));
test("buckets: caught up on a show still running is UP TO DATE", () => eq(catOf(show({ seasons: [live(2)], watched: { "1-1": 1, "1-2": 1 }, inProduction: true, nextEp: { s: 2, e: 1, ts: null, date: addDays(10) } })), "waiting"));
test("buckets: caught up on a show that ended is DONE", () => eq(catOf(show({ seasons: [live(2)], watched: { "1-1": 1, "1-2": 1 }, inProduction: false })), "done"));
test("buckets: a dropped show is DONE whatever else is true", () => eq(catOf(show({ seasons: [live(3)], bucketOverride: "dropped", inProduction: true })), "done"));
test("buckets: the user's own override beats the computed bucket", () => eq(catOf(show({ seasons: [live(2)], watched: { "1-1": 1, "1-2": 1 }, inProduction: true, bucketOverride: "done" })), "done"));
test("buckets: a premiere that has not aired is UP TO DATE", () => eq(catOf(show({ seasons: [{ season: 1, eps: [ep(1, { air: addDays(30) })] }], firstAir: addDays(30) })), "waiting"));
test("up next: most recently watched first, and old backlog you never started is left out", () => {
  const mk = (id, last) => show({ id, seasons: [live(3)], watched: last ? { "1-1": last } : {}, inProduction: true });
  const items = upNextItems([mk(1, T(10)), mk(2, T(99)), mk(3, 0)]);
  eq(items.map((x) => x.s.id), [2, 1]);
});

/* ---------- why a show would not refresh ---------- */
test("refresh failures: a daily serial and a vanished show are hard, a server hiccup is not", () => {
  const a = {}, b = {}, c = {}, d = {};
  noteSyncFail(a, new Error("DAILY")); noteSyncFail(b, new Error("HTTP404")); noteSyncFail(c, new Error("HTTP503")); noteSyncFail(d, new TypeError("Failed to fetch"));
  eq([stuck(a), stuck(b), stuck(c), stuck(d)], [true, true, false, false]);
  eq([a.syncFail.code, b.syncFail.code, c.syncFail.code, d.syncFail.code], ["daily", "gone", "error", "offline"]);
});
test("refresh failures: a reason stored as English text by v45 still reads", () => yes(failWhy({ why: "old text" }) === "old text"));
test("refresh failures: a success clears the note", () => { const s = { syncFail: { hard: true } }; clearSyncFail(s); yes(!s.syncFail); });

/* ---------- picture addresses ---------- */
test("images: only plain https addresses are used", () => {
  eq(imgSrc("https://static.tvmaze.com/a.jpg"), "https://static.tvmaze.com/a.jpg");
  for (const bad of ["javascript:alert(1)", "http://x/a.jpg", 'https://x/a" onerror="x', "https://x/a b.jpg", "", null, "data:image/png;base64,AAAA"]) eq(imgSrc(bad), "", String(bad));
});
test("images: an address can never close an attribute or a quote", () => yes(!/["'<>]/.test(imgSrc("https://x/a.jpg"))));

/* ---------- languages ---------- */
test("language: every language has every English key, and none that English lacks", () => {
  const en = Object.keys(STRINGS.en);
  for (const l of SUPPORTED_LANGS) {
    const k = Object.keys(STRINGS[l] || {});
    eq(en.filter((x) => !k.includes(x)), [], l + " is missing");
    eq(k.filter((x) => !en.includes(x)), [], l + " has extra");
  }
});
test("language: a translation keeps every {placeholder} the English has", () => {
  const ph = (v) => (typeof v === "object" ? Object.values(v).join(" ") : v).match(/\{\w+\}/g) || [];
  const bad = [];
  for (const l of SUPPORTED_LANGS) for (const k of Object.keys(STRINGS.en)) {
    const need = new Set(ph(STRINGS.en[k])), have = new Set(ph(STRINGS[l][k]));
    for (const p of need) if (!have.has(p)) bad.push(l + "." + k + " lacks " + p);
  }
  eq(bad, []);
});
test("language: counts pick the right word (1 show, 2 shows)", () => { setLang("en"); eq([t("n_shows", { n: 1 }), t("n_shows", { n: 2 })], ["1 show", "2 shows"]); });
test("language: a missing key falls back to English, then to the key itself", () => {
  const saved = STRINGS.hi.back; delete STRINGS.hi.back; setLang("hi");
  try { eq(t("back"), STRINGS.en.back); eq(t("no_such_key_at_all"), "no_such_key_at_all"); } finally { STRINGS.hi.back = saved; setLang("en"); }
});
test("language: it is chosen from the saved choice, then the phone, then English", () => {
  eq(pickLang("hi", ["en-US"]), "hi"); eq(pickLang(null, ["fr-FR", "hi-IN"]), "hi"); eq(pickLang(null, ["fr-FR"]), "en"); eq(pickLang("xx", []), "en");
});
test("dates: 'today' and 'tomorrow' come from the browser, in the chosen language", () => {
  setLang("en"); eq([fmtDate(addDays(0)), fmtDate(addDays(1))], ["Today", "Tomorrow"]);
  setLang("hi"); const h = fmtDate(addDays(0)); setLang("en");
  yes(h && h !== "Today" && /[ऀ-ॿ]/.test(h), "Hindi 'today' should be Devanagari, got " + h);
});
test("dates: a missing date reads as TBA, not 'undefined'", () => { setLang("en"); eq(fmtDate(null), "TBA"); });

/* ---------- streaming services ---------- */
test("services: Apple TV matches the name TVmaze really uses", () => eq(platformMatch("Apple TV", ["appletv"]).length, 1));
test("services: short names match whole, so Stan does not hit inside Constance TV", () => {
  eq(platformMatch("Stan", ["stan"]).length, 1); eq(platformMatch("Constance TV", ["stan"]).length, 0); eq(platformMatch("Previu", ["viu"]).length, 0);
});
test("services: the viewer's own country comes first, then worldwide, then the rest", () => {
  eq(platformsByRelevance("IN").slice(0, 3).map((p) => p.r[0]), ["IN", "IN", "IN"]);
  eq(platformsByRelevance("US")[0].id, "hulu"); eq(platformsByRelevance("")[0].r.length, 0);
});

/* ---------- the numbers on Today ---------- */
test("stats: episodes left to watch ignore dropped shows", () => {
  const a = show({ id: 1, seasons: [live(3)], watched: { "1-1": 1 }, inProduction: true });
  const b = show({ id: 2, seasons: [live(5)], bucketOverride: "dropped" });
  eq(libraryStats([a, b]).backlog, 2);
});

/* ---------- offline: the cache list ---------- */
test("offline: the cache is named after this build, so an old one is cleared", async (env) => {
  const sw = await env.text("sw.js");
  eq(+(sw.match(/const BUILD = (\d+)/) || [])[1], BUILD, "BUILD in sw.js");
  yes(/CACHE_NAME = "signal-v" \+ BUILD/.test(sw), "CACHE_NAME must be built from BUILD");
});
test("offline: every file the cache list names exists (one typo caches nothing, silently)", async (env) => {
  const sw = await env.text("sw.js"), list = [...sw.match(/APP_SHELL = \[([\s\S]*?)\]/)[1].matchAll(/"\.\/([^"]*)"/g)].map((x) => x[1]).filter(Boolean);
  const missing = []; for (const f of list) if (!(await env.exists(f))) missing.push(f);
  eq(missing, []); yes(list.length >= 10, "the list looks too short: " + list.length);
});
test("offline: every script, stylesheet and font the page loads is in the cache list", async (env) => {
  const sw = await env.text("sw.js"), html = await env.text("index.html"), css = await env.text("style.css");
  const inList = new Set([...sw.match(/APP_SHELL = \[([\s\S]*?)\]/)[1].matchAll(/"\.\/([^"]*)"/g)].map((x) => x[1]));
  const need = [...html.matchAll(/(?:src|href)="([^"#:?]+\.(?:js|css|png|json|webmanifest))(?:\?[^"]*)?"/g)].map((x) => x[1])
    .concat([...css.matchAll(/url\("([^"]+\.woff2)"\)/g)].map((x) => x[1]));
  eq([...new Set(need)].filter((f) => !inList.has(f)), []);
});

/* ---------- updating: opening the app must give the newest one ---------- */
// A script asked for by a name that never changes can be answered from a copy the browser or the
// cache kept. Asked for as name?v=<BUILD>, a new build is a new address and cannot be.
test("update: every script and the stylesheet is asked for by this build's number", async (env) => {
  const html = await env.text("index.html"), sw = await env.text("sw.js");
  const files = [...html.matchAll(/(?:src|href)="([^"#:?]+\.(?:js|css))(\?[^"]*)?"/g)];
  yes(files.length >= 6, "could not read the page's files: " + files.length);
  const bad = [];
  for (const [, name, q] of files) {
    if (q !== "?v=" + BUILD) bad.push(name + " is asked for as " + name + (q || "") + ", not ?v=" + BUILD);
    if (!sw.includes('"./' + name + '" + V')) bad.push(name + " is not cached under its ?v= name in sw.js");
  }
  eq(bad, []);
});
/* sw.js run against a made-up network and cache: what an open gets when the connection is good,
   gone, or slow, and that a new build's files are fetched, not served from the old build's. */
async function swHarness(env, serve) {
  const code = (await env.text("sw.js")).replace(/NAV_WAIT = \d+/, "NAV_WAIT = 40");
  const abs = (u) => new URL(typeof u === "string" ? u : u.url, "https://x.test/signal/").href;
  class Req { constructor(u, o) { this.url = abs(u); this.method = "GET"; this.mode = (o && o.mode) || "cors"; } }
  const res = (body, ok = true) => ({ ok, status: ok ? 200 : 404, body, clone() { return this; } });
  const stores = new Map(), handlers = {}, net = { files: serve, down: false, slow: false, asked: [] };
  const fetchFn = (u) => {
    net.asked.push(abs(u));
    if (net.down) return Promise.reject(new TypeError("offline"));
    if (net.slow) return new Promise((r) => setTimeout(() => r(res(net.files[abs(u)])), 400));
    return Promise.resolve(abs(u) in net.files ? res(net.files[abs(u)]) : res("", false));
  };
  const cacheOf = (n) => { if (!stores.has(n)) stores.set(n, new Map());
    return { addAll: (rs) => Promise.all(rs.map((r) => fetchFn(r).then((x) => { if (!x.ok) throw new Error("404 " + r.url); stores.get(n).set(abs(r), x); }))),
      put: (r, x) => { stores.get(n).set(abs(r), x); return Promise.resolve(); }, match: (r) => Promise.resolve(stores.get(n).get(abs(r))) }; };
  const cachesFn = { open: (n) => Promise.resolve(cacheOf(n)), keys: () => Promise.resolve([...stores.keys()]), delete: (n) => Promise.resolve(stores.delete(n)),
    match: (r) => { for (const m of stores.values()) if (m.has(abs(r))) return Promise.resolve(m.get(abs(r))); return Promise.resolve(undefined); } };
  const self_ = { location: { origin: "https://x.test" }, addEventListener: (k, f) => { handlers[k] = f; }, skipWaiting() {}, clients: { claim() {} } };
  new Function("self", "caches", "fetch", "Request", "URL", "setTimeout", code)(self_, cachesFn, fetchFn, Req, URL, setTimeout);
  const fire = (kind, extra) => { let p; handlers[kind](Object.assign({ waitUntil: (x) => { p = x; }, respondWith: (x) => { p = x; } }, extra)); return Promise.resolve(p); };
  return { net, stores, install: () => fire("install"), open: (u) => fire("fetch", { request: Object.assign(new Req(u || "./"), { mode: "navigate" }) }),
    get: (u) => fire("fetch", { request: new Req(u) }) };
}
const swSite = (build, pageBody) => {
  const f = { "https://x.test/signal/": pageBody, "https://x.test/signal/index.html": pageBody, "https://x.test/signal/manifest.json": "m", "https://x.test/signal/icon-192.png": "i", "https://x.test/signal/icon-512.png": "i",
    "https://x.test/signal/fonts/DMSans-latin.woff2": "f", "https://x.test/signal/fonts/DMSans-latin-ext.woff2": "f" };
  for (const n of ["style.css", "i18n.js", "core.js", "data.js", "ui.js", "app.js"]) f["https://x.test/signal/" + n + "?v=" + BUILD] = n + " of build " + build;
  return f;
};
test("update: online, opening the app shows the newest page, not the one saved last time", async (env) => {
  const h = await swHarness(env, swSite(1, "page one")); await h.install();
  h.net.files = swSite(2, "page two");
  eq((await h.open()).body, "page two");
  eq((await (await h.stores.get("signal-v" + BUILD).get("https://x.test/signal/index.html"))).body, "page two", "saved for next time");
});
test("update: offline, opening the app shows the saved page", async (env) => {
  const h = await swHarness(env, swSite(1, "page one")); await h.install();
  h.net.down = true; eq((await h.open()).body, "page one");
});
test("update: on a slow connection the saved page appears after a short wait, not a blank screen", async (env) => {
  const h = await swHarness(env, swSite(1, "page one")); await h.install();
  h.net.files = swSite(2, "page two"); h.net.slow = true;
  eq((await h.open()).body, "page one");
});
test("update: a saved script is answered from the cache, and a missing one is fetched and kept", async (env) => {
  const h = await swHarness(env, swSite(1, "page one")); await h.install();
  const before = h.net.asked.length;
  eq((await h.get("core.js?v=" + BUILD)).body, "core.js of build 1"); eq(h.net.asked.length, before, "no network for a saved script");
  h.net.files["https://x.test/signal/extra.js?v=" + BUILD] = "extra";
  eq((await h.get("extra.js?v=" + BUILD)).body, "extra"); h.net.down = true;
  eq((await h.get("extra.js?v=" + BUILD)).body, "extra", "kept for offline");
});
test("update: a build with a missing file does not install, so the working version stays", async (env) => {
  const f = swSite(2, "page two"); delete f["https://x.test/signal/ui.js?v=" + BUILD];
  const h = await swHarness(env, f); let failed = false;
  try { await h.install(); } catch (e) { failed = true; }
  yes(failed, "install should reject");
});

/* ---------- taps ---------- */
// 3.0 shipped with the empty #sheet, a full-screen fixed box, over the tab bar: nothing could be tapped.
test("taps: a full-screen container that starts empty is hidden while it is empty", async (env) => {
  const css = await env.text("style.css"), html = await env.text("index.html");
  const full = [...css.matchAll(/(^|\n)(#[\w-]+)\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0/g)].map((m) => m[2]);
  yes(full.length > 0, "no full-screen container found: this check needs updating");
  for (const id of full) {
    if (!new RegExp('id="' + id.slice(1) + '"(?![^>]*hidden)[^>]*>\\s*</div>').test(html)) continue;   // starts with content, or hidden (a global [hidden] rule covers it)
    yes(new RegExp(id + "(:empty|\\[hidden\\])\\s*\\{[^}]*display:\\s*none").test(css), id + " covers the screen even when closed");
  }
});

// A button whose data- name has no handler does nothing, silently. 4.0 renamed most of them.
test("taps: every data-<name> a screen draws has a handler in ACTIONS", async (env) => {
  const app = await env.text("app.js"), ui = await env.text("ui.js"), html = await env.text("index.html");
  const handled = new Set([...app.match(/const ACTIONS = \{([\s\S]*?)\n\};/)[1].matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]));
  yes(handled.size > 40, "could not read ACTIONS: " + handled.size);
  const used = new Set([...(ui + app + html).matchAll(/\sdata-([a-z]+)=/g)].map((m) => m[1]));
  const plain = new Set(["i18n", "sk", "ttrow", "mact"]);   // read by other code, not by the click table
  eq([...used].filter((n) => !handled.has(n) && !plain.has(n)).sort(), []);
});
test("language: every word the screens ask for exists in English and Hindi", async (env) => {
  const src = (await env.text("ui.js")) + (await env.text("app.js")) + (await env.text("index.html"));
  const keys = new Set([...src.matchAll(/\bt\(\s*(?:[^"')]*\?\s*)?"([a-z][a-z0-9_]*)"(?!\s*\+)/g)].map((m) => m[1]));   // "cat_" + x is a family, not a key
  for (const m of src.matchAll(/\b(?:data-i18n|data-i18n-aria)="([a-z0-9_]+)"/g)) keys.add(m[1]);
  yes(keys.size > 100, "could not read the keys: " + keys.size);
  for (const lang of ["en", "hi"]) eq([...keys].filter((k) => !(k in STRINGS[lang])).sort(), [], lang);
});

async function runAll(env) {
  const out = [];
  for (const tc of TESTS) {
    try { await tc.fn(env); out.push({ name: tc.name, ok: true }); }
    catch (e) { out.push({ name: tc.name, ok: false, error: String((e && e.message) || e) }); }
  }
  return out;
}
