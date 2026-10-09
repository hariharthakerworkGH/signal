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
test("aired: a streaming drop unlocks at the start of its date in the show's own timezone", () => {
  const e = ep(1, { air: "2026-10-09" });   // midnight 9 Oct in Kolkata is 18:30 UTC on the 8th
  atTime("2026-10-08T18:00:00Z", () => yes(!epLive(e, "Asia/Kolkata", "web"), "half an hour early"));
  atTime("2026-10-08T18:31:00Z", () => yes(epLive(e, "Asia/Kolkata", "web"), "just after"));
});
test("aired: a broadcast episode waits until the END of its date", () => {
  const e = ep(1, { air: "2026-10-09" });
  atTime("2026-10-09T10:00:00Z", () => yes(!epLive(e, "Asia/Kolkata", "net"), "same evening"));
  atTime("2026-10-09T18:31:00Z", () => yes(epLive(e, "Asia/Kolkata", "net"), "next day"));
});
test("aired: with no timezone on record it assumes US Pacific, so nothing unlocks early", () => {
  const e = ep(1, { air: "2026-10-09" });
  atTime("2026-10-09T06:59:00Z", () => yes(!epLive(e, null, "web")));
  atTime("2026-10-09T07:01:00Z", () => yes(epLive(e, null, "web")));
});
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
  const sw = await env.text("sw.js"); const m = sw.match(/CACHE_NAME = "([^"]+)"/);
  eq(m && m[1], "signal-v" + BUILD);
});
test("offline: every file the cache list names exists (one typo caches nothing, silently)", async (env) => {
  const sw = await env.text("sw.js"), list = [...sw.match(/APP_SHELL = \[([\s\S]*?)\]/)[1].matchAll(/"\.\/([^"]*)"/g)].map((x) => x[1]).filter(Boolean);
  const missing = []; for (const f of list) if (!(await env.exists(f))) missing.push(f);
  eq(missing, []); yes(list.length >= 10, "the list looks too short: " + list.length);
});
test("offline: every script, stylesheet and font the page loads is in the cache list", async (env) => {
  const sw = await env.text("sw.js"), html = await env.text("index.html"), css = await env.text("style.css");
  const inList = new Set([...sw.match(/APP_SHELL = \[([\s\S]*?)\]/)[1].matchAll(/"\.\/([^"]*)"/g)].map((x) => x[1]));
  const need = [...html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png|json|webmanifest))"/g)].map((x) => x[1])
    .concat([...css.matchAll(/url\("([^"]+\.woff2)"\)/g)].map((x) => x[1]));
  eq([...new Set(need)].filter((f) => !inList.has(f)), []);
});

async function runAll(env) {
  const out = [];
  for (const tc of TESTS) {
    try { await tc.fn(env); out.push({ name: tc.name, ok: true }); }
    catch (e) { out.push({ name: tc.name, ok: false, error: String((e && e.message) || e) }); }
  }
  return out;
}
