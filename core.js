/* core.js - the parts of Signal that are plain logic.
 *
 * No DOM, no storage, no network in this file, so the same code runs in the
 * page, in tests.html, and under Node. Anything that touches the screen, the
 * database or the internet lives in ui.js and data.js. Load order:
 * i18n.js, core.js, data.js, ui.js (classic scripts, one shared scope).
 */

/* APP_VERSION is what shows on screen (3.0, 3.1, 4.0: major for a rebuild,
   minor for features, a third number only for a fix). BUILD is a hidden counter
   that goes up by one every release and must match CACHE_NAME in sw.js, which
   is how the service worker knows a new build has landed. Bump both. */
const APP_VERSION = "3.1";
const BUILD = 49;

/* ================= small helpers ================= */
const pad = (n) => String(n).padStart(2, "0");
function todayISO() { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
const epK = (s, e) => s + "-" + e;
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function plain(x) {
  return String(x || "").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}
/* Poster URLs come from TVmaze and Wikipedia, but also from any backup file
   you import. Dropped into src="..." unescaped, a crafted one could close the
   attribute and run script while the sync token sits in localStorage. Anything
   that is not a plain https URL is simply not shown. */
function imgSrc(u) { const s = String(u || ""); return /^https:\/\/[^"'<>\s]+$/i.test(s) ? esc(s) : ""; }
const initialOf = (title) => esc(String(title || "?").trim().slice(0, 1).toLocaleUpperCase());

/* ================= language and formats ================= */
const SUPPORTED_LANGS = ["en", "hi"];
let LANG = "en";
function pickLang(saved, navLangs) {
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  for (const l of navLangs || []) { const b = String(l).toLowerCase().split("-")[0]; if (SUPPORTED_LANGS.includes(b)) return b; }
  return "en";
}
function setLang(l) { LANG = SUPPORTED_LANGS.includes(l) ? l : "en"; }
/* English leaves the locale to the phone (so en-GB reads 11 Oct and en-US
   Oct 11); any other language uses its own. */
const loc = () => (LANG === "en" ? undefined : LANG);

/* t("key", {n: 3}) - strings live in i18n.js. A string can be an object
   {one, other} for plurals; the browser's own plural rules choose. A missing
   translation falls back to English, then to the key, so nothing goes blank. */
function t(key, vars) {
  let v = STRINGS[LANG] && STRINGS[LANG][key];
  if (v === undefined) v = STRINGS.en[key];
  if (v === undefined) return key;
  if (typeof v === "object") {
    const n = vars && vars.n;
    const cat = n == null ? "other" : new Intl.PluralRules(LANG).select(n);
    v = v[cat] || v.other;
  }
  return v.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
}
const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase(loc()) + s.slice(1) : s);
const fmtNum = (n) => Number(n).toLocaleString(loc());
function daysAway(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000);
}
/* "Today", "Tomorrow", "Sun, Oct 11 - in 3 days": the words for today and
   tomorrow come from the browser, so every language gets them for free. */
function fmtDate(iso) {
  const n = daysAway(iso); if (n === null || isNaN(n)) return iso || t("tba");
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: "auto" });
  if (n >= -1 && n <= 1) return cap(rtf.format(n, "day"));
  const d = new Date(iso + "T00:00:00").toLocaleDateString(loc(), { weekday: "short", day: "numeric", month: "short" });
  return n > 1 && n <= 7 ? d + " · " + rtf.format(n, "day") : d;
}
function fmtDay(iso) {   // heading over a day's episodes
  const n = daysAway(iso);
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: "auto" });
  const d = new Date(iso + "T00:00:00").toLocaleDateString(loc(), { weekday: "long", day: "numeric", month: "short" });
  return n !== null && n >= 0 && n <= 1 ? cap(rtf.format(n, "day")) + " · " + d : d;
}
function fmtTime(ts) { return new Date(ts).toLocaleTimeString(loc(), { hour: "numeric", minute: "2-digit" }); }
function agoLabel(ts) {
  if (!ts) return t("never");
  const h = Math.floor((Date.now() - ts) / 36e5);
  if (h < 1) return t("just_now");
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: "auto", style: "short" });
  return h < 24 ? rtf.format(-h, "hour") : rtf.format(-Math.floor(h / 24), "day");
}
function byTitle(a, b) { return String(a.title || "").localeCompare(String(b.title || ""), loc(), { numeric: true, sensitivity: "base" }); }

/* ================= when has something aired ================= */
// Building a formatter is the slow part (about a millisecond), and a library of hundreds of
// shows asks for the same few zones thousands of times, so each zone's is kept.
const TZ_DTF = new Map();
function tzOffsetMinutes(tz, at) {
  try {
    let dtf = TZ_DTF.get(tz);
    if (!dtf) {
      dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit",
        day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      TZ_DTF.set(tz, dtf);
    }
    const p = {}; for (const x of dtf.formatToParts(at)) if (x.type !== "literal") p[x.type] = x.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch (e) { return null; }
}
function localDayMs(dateStr, tz, atEnd) {
  if (!dateStr) return Infinity;
  const naive = atEnd
    ? Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10), 23, 59, 59)
    : Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10), 0, 0, 0);
  let off = tz ? tzOffsetMinutes(tz, new Date(naive)) : null;
  if (off === null) off = -7 * 60; // no timezone on record: assume US Pacific, the latest of the big ones, so nothing unlocks early
  return naive - off * 60000;
}
// When TVmaze has no air time we infer from the kind of service:
// streaming drops at the start of its release date, broadcast airs in the evening.
function airMoment(ep, tz, kind) { return localDayMs(ep.air, tz, kind === "net"); }
function epLive(ep, tz, kind) {
  if (ep.ts) return new Date(ep.ts).getTime() <= Date.now();
  if (!ep.air) return false;
  return Date.now() >= airMoment(ep, tz, kind);
}
function aired(sh, ep) { return (sh && sh.unlockAll) ? true : epLive(ep, sh && sh.tz, sh && sh.airKind); }
function isUp(sh) {
  if (sh.unlockAll) return false; // the user has declared the air dates wrong; treat the grid as live
  return !(sh.seasons && sh.seasons.some((se) => se.eps.some((ep) => epLive(ep, sh.tz, sh.airKind))));
}
function localDate(ts) { const d = new Date(ts); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function epDate(ep) { return ep.ts ? localDate(ep.ts) : (ep.air || null); }

/* ================= what a show is ================= */
const airedTotal = (sh) => sh.seasons.reduce((a, s) => a + s.eps.filter((ep) => aired(sh, ep)).length, 0);
const totalEps = (sh) => sh.seasons.reduce((a, s) => a + s.eps.length, 0);
const wCount = (sh) => Object.keys(sh.watched || {}).length;
const dropped = (sh) => sh.bucketOverride === "dropped";
const dlOn = (sh) => sh.dlTrack !== false; // default ON; an explicit false is an opt-out
const codeOf = (s, e) => "S" + pad(s) + "E" + pad(e);
function nextUnwatched(sh) {
  for (const s of sh.seasons) for (const ep of s.eps)
    if (aired(sh, ep) && !sh.watched[epK(s.season, ep.e)]) return { s: s.season, e: ep.e, name: ep.name || "" };
  return null;
}
/* The newest deliberate mark. A bulk or imported mark is stored as 1, a single
   tap as a timestamp, so only taps count as "what I was watching lately". */
function lastWatched(sh) {
  let m = 0; for (const v of Object.values(sh.watched || {})) if (typeof v === "number" && v > 1 && v > m) m = v;
  return m;
}
function lastAiredMs(sh) {
  let m = 0;
  for (const se of sh.seasons) for (const ep of se.eps) {
    if (!epLive(ep, sh.tz, sh.airKind)) continue;
    const ts = ep.ts ? new Date(ep.ts).getTime() : (ep.air ? new Date(ep.air + "T00:00:00").getTime() : 0);
    if (ts > m) m = ts;
  }
  return m;
}
/* The next thing to look forward to: a premiere, or the next episode. null
   when there is nothing dated, it already passed, or it is over 99 days off. */
function soonInfo(sh) {
  const now = Date.now();
  let ts = null, dateStr = null, kind = "episode", code = "";
  if (isUp(sh)) {
    kind = "premiere";
    let first = null;
    for (const se of (sh.seasons || [])) { for (const ep of se.eps) { first = ep; break; } if (first) break; }
    if (first && (first.ts || first.air)) { ts = first.ts || null; dateStr = first.ts ? localDate(first.ts) : first.air; } // a timestamp wins: same rule as epDate()
    else dateStr = sh.firstAir;
  } else if (sh.nextEp) { ts = sh.nextEp.ts; dateStr = sh.nextEp.date; code = codeOf(sh.nextEp.s, sh.nextEp.e); }
  if (!ts && !dateStr) return null;
  const ms = ts ? new Date(ts).getTime() : localDayMs(dateStr, sh.tz, sh.airKind === "net");
  if (ms < now - 3600e3) return null;
  const n = daysAway(dateStr || localDate(ts));
  if (n > 99) return null;
  return { ms, kind, code, dateStr, ts };
}
/* WATCHING, UP TO DATE or DONE. Computed, never stored; bucketOverride is the
   user's own say and always wins. */
function catOf(sh) {
  if (dropped(sh)) return "done";   // stopped following: keeps its history, leaves active tracking
  if (isUp(sh)) return "waiting";
  if (airedTotal(sh) - wCount(sh) > 0) return "watching";
  if (sh.bucketOverride === "done") return "done";
  if (sh.bucketOverride === "active") return "waiting";
  if (!(sh.inProduction || sh.tmdbStatus === "Returning Series")) return "done";
  if (!soonInfo(sh)) {
    const la = lastAiredMs(sh);
    if (la && Date.now() - la > 18 * 30.44 * 864e5) return "done";
  }
  return "waiting";
}
/* Shows with something aired and unwatched, most recently watched first, as
   {s, n}. A show you have never started only counts if it aired this week, so
   old backlog does not crowd out new premieres. */
function upNextItems(shows, weekMs) {
  const wk = weekMs || 7 * 24 * 3600e3;
  return shows.filter((s) => catOf(s) === "watching").map((s) => ({ s, n: nextUnwatched(s) })).filter((x) => {
    if (!x.n) return false;
    if (wCount(x.s) > 0) return true;
    const seas = x.s.seasons.find((z) => z.season === x.n.s);
    const ep = seas && seas.eps.find((z) => z.e === x.n.e);
    if (!ep) return false;
    const at = ep.ts ? new Date(ep.ts).getTime() : (ep.air ? new Date(ep.air + "T00:00:00").getTime() : 0);
    return at > 0 && Date.now() - at < wk;
  }).map((x, i) => ({ ...x, i })).sort((a, b) => lastWatched(b.s) - lastWatched(a.s) || a.i - b.i);
}
/* What is dated in the next stretch, soonest first. */
function scheduleItems(shows, withinMs) {
  return shows.filter((x) => !dropped(x)).map((sh) => ({ sh, si: soonInfo(sh) }))
    .filter((x) => x.si && (withinMs == null || x.si.ms - Date.now() <= withinMs)).sort((a, b) => a.si.ms - b.si.ms);
}
function libraryStats(shows) {
  let eps = 0, mins = 0, done = 0, watching = 0, backlog = 0, today = 0; const td = todayISO();
  for (const s of shows) {
    const w = wCount(s); eps += w; mins += w * (s.runtime || 40);
    const a = airedTotal(s); if (!dropped(s)) backlog += Math.max(0, a - w);
    if (a > 0 && w >= a && !isUp(s)) done++; else if (w > 0) watching++;
    if (dropped(s)) continue;
    if (isUp(s)) { const si = soonInfo(s); if (((si && si.dateStr) || s.firstAir) === td) today++; continue; }
    for (const se of s.seasons) { if (se.eps.some((ep) => epDate(ep) === td)) { today++; break; } }
  }
  return { eps, mins, done, watching, backlog, today };
}

/* ================= why a show would not refresh ================= */
/* lastSynced only moves when a TVmaze fetch SUCCEEDS, so a show that can never
   succeed stays "stale" for ever and the warning never clears. A hard failure
   will not fix itself, so it stops counting as stale and gets named instead. */
const syncable = (s) => !dropped(s) && !s.manual && (s.inProduction || s.upcoming || s.tmdbStatus === "Returning Series");
function noteSyncFail(sh, e) {
  const m = (e && e.message) || "";
  if (m === "DAILY") sh.syncFail = { at: Date.now(), hard: true, code: "daily" };
  else if (/^HTTP4/.test(m)) sh.syncFail = { at: Date.now(), hard: true, code: "gone" };
  else if (/^HTTP/.test(m)) sh.syncFail = { at: Date.now(), hard: false, code: "error", status: m.slice(4) };
  else sh.syncFail = { at: Date.now(), hard: false, code: "offline" };
}
function clearSyncFail(sh) { if (sh.syncFail) delete sh.syncFail; }
const stuck = (s) => !!(s.syncFail && s.syncFail.hard);
/* v45 stored the reason as English text; newer ones store a code. Both read. */
const failWhy = (f) => (f.code ? t("why_" + f.code, { n: f.status }) : f.why || "");

/* ================= merging two devices ================= */
/* Marks are independent facts, so they merge one key at a time. v43 kept
   whichever whole show had the newer updatedAt, which threw away a mark every
   time two devices touched different episodes before syncing. sh.wts[key]
   records WHEN watched[key] last changed, so an unmark travels across too.
   Where neither side has a timestamp (data from before v44) the mark wins:
   never lose a watch mark. */
function mergeMarks(aOn, aTs, bOn, bTs) {
  aOn = aOn || {}; bOn = bOn || {}; aTs = aTs || {}; bTs = bTs || {};
  const keys = new Set([...Object.keys(aOn), ...Object.keys(bOn), ...Object.keys(aTs), ...Object.keys(bTs)]);
  const marks = {}, ts = {};
  for (const k of keys) {
    const inA = Object.prototype.hasOwnProperty.call(aOn, k), inB = Object.prototype.hasOwnProperty.call(bOn, k);
    const tA = aTs[k], tB = bTs[k];
    if (tA != null && tB != null) ts[k] = Math.max(tA, tB);
    else if (tA != null) ts[k] = tA;
    else if (tB != null) ts[k] = tB;
    let on;
    if (inA === inB) on = inA;                           // both agree
    else if (tA != null && tB != null) on = (tA >= tB) ? inA : inB; // whoever acted last
    else if (tA != null) on = inA;                       // only this side is informed
    else if (tB != null) on = inB;
    else on = true;                                      // no timestamps: keep the mark
    // The stored value carries meaning: 1 is a bulk or imported mark, a
    // timestamp is a single deliberate one, which is what drives the download
    // prompt. Keep the more specific of the two.
    if (on) marks[k] = Math.max(Number(inA ? aOn[k] : 0) || 0, Number(inB ? bOn[k] : 0) || 0) || 1;
  }
  return { marks, ts };
}
function mergeShow(a, b) {            // a = this device, b = the gist
  const out = { ...((a.updatedAt || 0) >= (b.updatedAt || 0) ? a : b) };
  const w = mergeMarks(a.watched, a.wts, b.watched, b.wts); out.watched = w.marks; out.wts = w.ts;
  const d = mergeMarks(a.dl, a.dts, b.dl, b.dts);          out.dl = d.marks;      out.dts = d.ts;
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

/* ================= streaming services ================= */
/* TVmaze calls Apple's service "Apple TV", not "Apple TV+", so the old match
   never fired and Apple shows never reached Discover. The names below are the
   ones TVmaze really uses (checked against its full schedule). r lists the
   countries a service belongs to; empty means it is sold almost everywhere.
   A leading "=" means the whole name must match, for short names that would
   otherwise hit inside longer ones. */
const PLATFORMS = [
  { id: "netflix",     label: "Netflix",     match: ["netflix"],               r: [] },
  { id: "prime",       label: "Prime Video", match: ["prime video", "amazon"], r: [] },
  { id: "disney",      label: "Disney+",     match: ["disney+"],               r: [] },
  { id: "appletv",     label: "Apple TV",    match: ["apple tv"],              r: [] },
  { id: "hbomax",      label: "HBO Max",     match: ["hbo"],                   r: [] },
  { id: "paramount",   label: "Paramount+",  match: ["paramount+"],            r: [] },
  { id: "youtube",     label: "YouTube",     match: ["youtube"],               r: [] },
  { id: "crunchyroll", label: "Crunchyroll", match: ["crunchyroll"],           r: [] },
  { id: "viu",         label: "Viu",         match: ["=viu"],                  r: [] },
  { id: "hulu",        label: "Hulu",        match: ["hulu"],                  r: ["US"] },
  { id: "peacock",     label: "Peacock",     match: ["peacock"],               r: ["US"] },
  { id: "iplayer",     label: "BBC iPlayer", match: ["bbc iplayer"],           r: ["GB"] },
  { id: "itvx",        label: "ITVX",        match: ["itvx"],                  r: ["GB"] },
  { id: "crave",       label: "Crave",       match: ["crave"],                 r: ["CA"] },
  { id: "stan",        label: "Stan",        match: ["=stan"],                 r: ["AU"] },
  { id: "binge",       label: "Binge",       match: ["=binge"],                r: ["AU"] },
  { id: "rtlplus",     label: "RTL+",        match: ["rtl+"],                  r: ["DE", "NL"] },
  { id: "joyn",        label: "Joyn",        match: ["joyn"],                  r: ["DE"] },
  { id: "canalplus",   label: "Canal+",      match: ["canal+"],                r: ["FR"] },
  { id: "nrk",         label: "NRK TV",      match: ["nrk tv"],                r: ["NO"] },
  { id: "wavve",       label: "wavve",       match: ["wavve"],                 r: ["KR"] },
  { id: "tving",       label: "TVING",       match: ["tving"],                 r: ["KR"] },
  { id: "iqiyi",       label: "iQIYI",       match: ["iqiyi"],                 r: ["CN"] },
  { id: "abema",       label: "ABEMA",       match: ["abema"],                 r: ["JP"] },
  { id: "jiohotstar",  label: "JioHotstar",  match: ["hotstar", "jiocinema", "jiohotstar"], r: ["IN"] },
  { id: "zee5",        label: "ZEE5",        match: ["zee5"],                  r: ["IN"] },
  { id: "sonyliv",     label: "SonyLIV",     match: ["sonyliv"],               r: ["IN"] },
];
/* Nearby services first, then the ones sold everywhere, then the rest. */
function platformsByRelevance(region) {
  const rank = (p) => (p.r.includes(region) ? 0 : p.r.length === 0 ? 1 : 2);
  return PLATFORMS.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
}
function platformMatch(channelName, mine) {
  const c = (channelName || "").toLowerCase();
  return PLATFORMS.filter((p) => mine.includes(p.id)
    && p.match.some((m) => (m[0] === "=" ? c === m.slice(1) : c.includes(m))));
}
