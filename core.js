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
const APP_VERSION = "5.2";
const BUILD = 58;

/* ================= small helpers ================= */
const pad = (n) => String(n).padStart(2, "0");

/* ================= where the viewer is =================
   Every clock time and every "today" is read in ONE zone: the one chosen in
   Settings, else the phone's own. An air time is an exact moment, so it is only
   ever converted for display, never guessed at. */
let TZ_PREF = "";
const isZone = (z) => { try { return !!z && !!new Intl.DateTimeFormat("en", { timeZone: z }); } catch (e) { return false; } };
function setTZ(z) { TZ_PREF = isZone(z) ? z : ""; }
function deviceTZ() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } }
const viewTZ = () => TZ_PREF || deviceTZ() || undefined;
/* Home zone (5.0). A VPN, a privacy setting or a trip changes the zone the phone reports, and with it
   "today" and every air time. So the zone is chosen ONCE (the phone's own, the first time the app opens)
   and kept. Saved: "" or nothing = never chosen, so pin the phone's zone now (also how 4.x users move
   over); "auto" = the viewer asked to follow the phone; anything else = a zone they picked. */
function bootZone(saved, device) {
  if (saved === "auto") return { pref: "", save: "auto" };
  if (isZone(saved)) return { pref: saved, save: saved };
  return isZone(device) ? { pref: device, save: device } : { pref: "", save: null };
}
/* True when the phone now reports a zone whose clock differs from the home zone (a name alone, like
   Asia/Calcutta for Asia/Kolkata, is not a difference). Used to ask once, never to switch by itself. */
function zoneClash(pref, device, ms) {
  if (!pref || !isZone(pref) || !isZone(device)) return false;
  const a = tzOffsetMinutes(pref, new Date(ms)), b = tzOffsetMinutes(device, new Date(ms));
  return a !== null && b !== null && a !== b;
}
/* After a new worker takes over: reload only when this page is older than the newest cache. A page
   fetched fresh at open is already that build, and reloading it would just flash the screen. */
function pageIsStale(cacheKeys, build) {
  const n = (cacheKeys || []).map((k) => /^signal-v(\d+)$/.exec(k)).filter(Boolean).map((m) => +m[1]);
  return !n.length || Math.max(...n) > build;
}
const YMD_DTF = new Map();
function ymd(ms) {
  const tz = viewTZ() || "";
  let f = YMD_DTF.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }); YMD_DTF.set(tz, f); }
  const p = {}; for (const x of f.formatToParts(ms)) p[x.type] = x.value;
  return p.year + "-" + p.month + "-" + p.day;
}
function todayISO() { return ymd(Date.now()); }
/* "UTC+5:30" for a zone, so a place name and its offset can be read together. */
function tzOffsetLabel(tz) {
  const m = tzOffsetMinutes(tz, new Date()); if (m === null) return "";
  const a = Math.abs(m);
  return "UTC" + (m < 0 ? "-" : "+") + Math.floor(a / 60) + (a % 60 ? ":" + pad(a % 60) : "");
}
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
/* Yesterday, today or tomorrow. The browser's word is used, except where it gives yesterday and tomorrow the
   SAME word (Hindi: "कल" for both), which on a calendar is exactly the confusion to avoid; then our own two are used. */
function relDayWord(n) {
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: "auto" });
  if (n === -1 || n === 1) { if (rtf.format(-1, "day") === rtf.format(1, "day")) return t(n < 0 ? "rel_yesterday" : "rel_tomorrow"); }
  return cap(rtf.format(n, "day"));
}
function fmtDate(iso) {
  const n = daysAway(iso); if (n === null || isNaN(n)) return iso || t("tba");
  const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: "auto" });
  if (n >= -1 && n <= 1) return relDayWord(n);
  const d = new Date(iso + "T00:00:00").toLocaleDateString(loc(), { weekday: "short", day: "numeric", month: "short" });
  return n > 1 && n <= 7 ? d + " · " + rtf.format(n, "day") : d;
}
function fmtDay(iso) {   // heading over a day's episodes
  const n = daysAway(iso);
  const d = new Date(iso + "T00:00:00").toLocaleDateString(loc(), { weekday: "long", day: "numeric", month: "short" });
  return n !== null && n >= -1 && n <= 1 ? relDayWord(n) + " · " + d : d;
}
function fmtTime(ts) { return new Date(ts).toLocaleTimeString(loc(), { hour: "numeric", minute: "2-digit", timeZone: viewTZ() }); }
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
// With no clock time all TVmaze knows is the DATE, in the show's own zone. The episode
// could land at any hour of it, so it unlocks when that date has ended there (US Pacific
// when no zone is on record): a few hours late is better than saying it is out before it is.
/* `where` is a show (preferred: its service may have a known release hour) or a bare zone name. */
function airMoment(ep, where) {
  const sh = where && typeof where === "object" ? where : null, tz = sh ? sh.tz : where;
  const rule = sh && dropRule(sh);
  return rule ? localDayMs(ep.air, rule.tz, false) + rule.h * 3600e3 : localDayMs(ep.air, tz, true);
}
function epLive(ep, where) {
  if (ep.ts) return new Date(ep.ts).getTime() <= Date.now();
  if (!ep.air) return false;
  return Date.now() >= airMoment(ep, where);
}
function aired(sh, ep) { return (sh && sh.unlockAll) ? true : epLive(ep, sh || null); }
function isUp(sh) {
  if (sh.unlockAll) return false; // the user has declared the air dates wrong; treat the grid as live
  return !(sh.seasons && sh.seasons.some((se) => se.eps.some((ep) => epLive(ep, sh))));
}
function localDate(ts) { return ymd(new Date(ts).getTime()); }

/* TVmaze sends noon UTC as the "time" of an episode whose time it does not know.
   Before 4.1 that was kept as a real moment, so such an episode unlocked hours early
   and showed a time nobody announced. A show saved by 4.1 or later carries tv:2 (its
   times were read properly); for any other show noon UTC is not believed, and the
   show is refreshed on opening to get the true time back. */
const FAKE_NOON = /T12:00:00(?:\.0+)?(?:Z|\+00:00)$/;
function stripFakeTimes(sh) {
  if (!sh || sh.tv) return false;
  let changed = false;
  for (const se of sh.seasons || []) for (const ep of se.eps || []) if (ep.ts && FAKE_NOON.test(ep.ts)) { ep.ts = null; changed = true; }
  const nx = sh.nextEp;
  if (nx && nx.ts && FAKE_NOON.test(nx.ts)) { nx.date = nx.ts.slice(0, 10); nx.ts = null; changed = true; }   // the fake time is the air date at noon UTC
  return changed;
}
/* Only a show with something recent or coming can be wrong on screen; an old finished one cannot. */
function needsTimeFix(sh) {
  if (!sh || sh.tv || sh.manual) return false;
  if (sh.nextEp) return true;
  const from = ymd(Date.now() - 3 * 864e5);
  return (sh.seasons || []).some((se) => se.eps.some((ep) => ep.air && ep.air >= from));
}
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
    if (!epLive(ep, sh)) continue;
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
  } else if (sh.nextEp) {
    // With a real air time the day is the viewer's day for that moment (8pm in New York is already tomorrow in Delhi),
    // so the row's date and the time beside it can never disagree. Without a time it is the date TVmaze gave.
    ts = sh.nextEp.ts; dateStr = ts ? localDate(ts) : sh.nextEp.date; code = codeOf(sh.nextEp.s, sh.nextEp.e);
  }
  if (!ts && !dateStr) return null;
  const ms = ts ? new Date(ts).getTime() : airMoment({ air: dateStr }, sh);
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
/* Every show with something aired and unwatched, as {s, n}. Nothing is left out for
   being old or never started: only a tick (watched, or the show dropped) takes a
   show off this list. Order: what you watched most recently first, then the rest by
   what aired most recently. (Before 4.3 a show you had never started was dropped
   once its OLDEST unwatched episode was a week old, so a premiere vanished.) */
function upNextItems(shows) {
  return shows.filter((s) => catOf(s) === "watching").map((s, i) => ({ s, n: nextUnwatched(s), i })).filter((x) => x.n)
    .sort((a, b) => lastWatched(b.s) - lastWatched(a.s) || lastAiredMs(b.s) - lastAiredMs(a.s) || a.i - b.i);
}
/* Episodes already out and not ticked, newest first, as {sh, s, e, name, ms, dateStr}.
   withinMs limits how far back (null = all). An episode marked watched OR downloaded
   is done with; a dropped show has none. Used for the "Released earlier" list.
   seenMs (5.1) also returns ticked ones that came out within that many ms, so the list can show
   yesterday with its marks: each row carries st = "w" (watched), "d" (downloaded only) or ""
   (still to do). The window matters: a real library holds 20,000 ticked episodes. */
function pastItems(shows, withinMs, seenMs) {
  const now = Date.now(), out = [], seenCut = seenMs ? ymd(now - seenMs - 2 * 864e5) : "";   // 2 days of slack for zones
  for (const sh of shows) {
    if (dropped(sh)) continue;
    for (const se of sh.seasons || []) for (const ep of se.eps || []) {
      const k = epK(se.season, ep.e);
      const w =!!(sh.watched && sh.watched[k]), d = !!(sh.dl && sh.dl[k]);
      if ((w || d) && (!seenMs || (!ep.ts && ep.air && ep.air < seenCut))) continue;   // cheap date test first: airMoment below is the costly part
      if (!aired(sh, ep)) continue;
      const ms = ep.ts ? new Date(ep.ts).getTime() : (ep.air ? airMoment(ep, sh) : 0);
      if (!ms || ms > now || (withinMs != null && now - ms > withinMs) || ((w || d) && now - ms > seenMs)) continue;
      out.push({ sh, s: se.season, e: ep.e, name: ep.name || "", ms, dateStr: epDate(ep), st: w ? "w" : d ? "d" : "" });
    }
  }
  return out.sort((a, b) => b.ms - a.ms || a.sh.id - b.sh.id || a.s - b.s || a.e - b.e);
}
/* Films you added BEFORE they came out (or on the day) and have not ticked, from their
   release day on, newest first, as {m, ms, dateStr}. A film added after it was out, or with
   no known add date, is your own watchlist, not something you were waiting for, so it
   stays in the Library only. Like episodes, nothing here expires by time. */
function pastFilms(movies, withinMs, seenMs) {
  const now = Date.now(), td = todayISO(), out = [];
  for (const m of movies || []) {
    if ((m.watched && !seenMs) || !m.releaseDate || m.releaseDate > td || !m.addedAt || ymd(m.addedAt) > m.releaseDate) continue;
    const ms = new Date(m.releaseDate + "T00:00:00").getTime();
    if ((withinMs != null && now - ms > withinMs) || (m.watched && now - ms > seenMs)) continue;
    out.push({ m, ms, dateStr: m.releaseDate, st: m.watched ? "w" : "" });
  }
  return out.sort((a, b) => b.ms - a.ms || String(a.m.id).localeCompare(String(b.m.id)));
}
/* The same films while they are still ahead (after today), within the stretch, soonest first. */
function comingFilms(movies, withinMs) {
  const now = Date.now(), td = todayISO(), out = [];
  for (const m of movies || []) {
    if (m.watched || !m.releaseDate || m.releaseDate <= td) continue;
    const ms = new Date(m.releaseDate + "T00:00:00").getTime();
    if (withinMs != null && ms - now > withinMs) continue;
    out.push({ m, ms, dateStr: m.releaseDate });
  }
  return out.sort((a, b) => a.ms - b.ms || String(a.m.id).localeCompare(String(b.m.id)));
}
/* What is dated in the next stretch, soonest first. */
function scheduleItems(shows, withinMs) {
  return shows.filter((x) => !dropped(x)).map((sh) => ({ sh, si: soonInfo(sh) }))
    .filter((x) => x.si && (withinMs == null || x.si.ms - Date.now() <= withinMs))
    // By the day shown on the row first (a date-only row opens at the END of its day in the show's zone,
    // which can be a few hours into the next day for the viewer), then by the moment inside that day.
    .sort((a, b) => (a.si.dateStr || "").localeCompare(b.si.dateStr || "") || a.si.ms - b.si.ms);
}
/* ================= one calendar (5.2) =================
   5.0 and 5.1 drew "Released earlier" and "This week" as two lists split by whether an episode had aired, so the
   same dates were printed twice and a person back after three days could not tell what they had missed from what
   was on. Now there are two pieces and neither repeats the other:
   - pendingItems: what is WAITING for you (aired, not ticked), shows and released films, freshest release first.
   - calendarFlow: ONE timeline, every day once, oldest at the top, today in the middle, tomorrow below; each row
     carries its state (watched, downloaded, to do, or still to air). Yesterday and today are always there. */
function pendingItems(shows, movies) {
  const out = [];
  for (const x of upNextItems(shows)) {
    const sh = x.s; let ms = 0, d = null;
    scan: for (let i = sh.seasons.length - 1; i >= 0; i--) {   // newest unticked aired episode: from the end, stop at the first
      const se = sh.seasons[i];
      for (let j = se.eps.length - 1; j >= 0; j--) {
        const ep = se.eps[j];
        if ((sh.watched && sh.watched[epK(se.season, ep.e)]) || !aired(sh, ep)) continue;
        ms = ep.ts ? new Date(ep.ts).getTime() : (ep.air ? airMoment(ep, sh) : 0); d = epDate(ep); break scan;
      }
    }
    out.push({ sh, n: x.n, ms, d });
  }
  for (const f of pastFilms(movies, null)) out.push({ m: f.m, ms: f.ms, d: f.dateStr });
  return out.sort((a, b) => b.ms - a.ms);   // a stable sort: ties keep the old "last watched first" order
}
/* opt.back = how many older days (groups with something in them) are opened above yesterday;
   opt.later = open everything after the next 7 days. Returns
   { days: [{ d, rows: [{ key, d, ms, st, sh|m, s, e, name, ahead }] }], earlier: { groups, todo } | null, later: n, laterOpen } */
function calendarFlow(shows, movies, opt) {
  const o = opt || {}, td = todayISO(), yd = ymd(Date.now() - 864e5), seenMs = 30 * 864e5;
  const rows = [], seen = new Set();
  const take = (r) => { if (seen.has(r.key)) return false; seen.add(r.key); return true; };   // one row per episode, wherever it came from
  for (const x of pastItems(shows, null, seenMs)) { const r = { key: x.sh.id + ":" + x.s + ":" + x.e, d: x.dateStr, ms: x.ms, st: x.st, dl: !!(x.sh.dl && x.sh.dl[epK(x.s, x.e)]), sh: x.sh, s: x.s, e: x.e, name: x.name }; if (take(r)) rows.push(r); }
  for (const x of pastFilms(movies, null, seenMs)) { const r = { key: "f:" + x.m.id, d: x.dateStr, ms: x.ms, st: x.st, m: x.m }; if (take(r)) rows.push(r); }
  // Days before yesterday wait behind "Earlier". back = how many days before yesterday are open; a tap opens a week more
  // but jumps over empty weeks (earlier.next), so a tap always shows something new.
  const gap = (d) => Math.round((Date.parse(yd) - Date.parse(d)) / 864e5);
  const old = [...new Set(rows.filter((r) => r.d < yd).map((r) => r.d))].sort().reverse();
  const hidden = new Set(old.filter((d) => gap(d) > (o.back || 0)));
  const earlier = hidden.size ? { groups: hidden.size, todo: rows.filter((r) => hidden.has(r.d) && !r.st).length, next: 7 * Math.ceil(gap([...hidden].sort().reverse()[0]) / 7) } : null;
  const keep = rows.filter((r) => !hidden.has(r.d));
  const horizon = o.later ? null : ymd(Date.now() + 7 * 864e5);
  let later = 0;
  const ahead = [];
  for (const { sh, si } of scheduleItems(shows, null)) {
    const d = si.dateStr || localDate(si.ts);
    ahead.push({ key: si.kind === "premiere" ? sh.id + ":prem" : sh.id + ":" + sh.nextEp.s + ":" + sh.nextEp.e, d: d < td ? td : d, ms: si.ms, st: "", sh, kind: si.kind, code: si.code, ts: si.ts, ahead: true });
  }
  for (const x of comingFilms(movies, null)) ahead.push({ key: "f:" + x.m.id, d: x.dateStr, ms: x.ms, st: "", m: x.m, ahead: true });
  for (const r of ahead) { if (!take(r)) continue; if (horizon && r.d > horizon) later++; else keep.push(r); }
  const by = new Map([[yd, []], [td, []]]);
  for (const r of keep) { if (!by.has(r.d)) by.set(r.d, []); by.get(r.d).push(r); }
  const days = [...by].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, rs]) => ({ d, rows: rs.sort((a, b) => a.ms - b.ms || String(a.key).localeCompare(String(b.key))) }));
  return { days, earlier, later, laterOpen: !!o.later };
}
/* A season dropped in one day (eight episodes at once) is ONE line, "8 episodes, 3 watched", not eight that push today
   off the screen. Fewer than three of a show on a day stay separate rows; a row still to come is never grouped. */
function groupRows(rows) {
  const by = new Map();
  for (const r of rows) if (r.sh && !r.ahead) { const g = by.get(r.sh.id); if (g) g.push(r); else by.set(r.sh.id, [r]); }
  const out = [], done = new Set();
  for (const r of rows) {
    const g = r.sh && !r.ahead ? by.get(r.sh.id) : null;
    if (g && g.length >= 3) { if (!done.has(r.sh.id)) { done.add(r.sh.id); out.push({ group: true, sh: r.sh, rows: g, n: g.length, w: g.filter((x) => x.st === "w").length }); } }
    else out.push(r);
  }
  return out;
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
  else if (/^HTTP(404|410)$/.test(m)) sh.syncFail = { at: Date.now(), hard: true, code: "gone" };
  else if (/^HTTP(403|429|451)$/.test(m)) sh.syncFail = { at: Date.now(), hard: false, code: "blocked", status: m.slice(4) };   // a VPN exit TVmaze refuses, or a busy one: try again later
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

/* ================= a backup file from outside ================= */
/* Nothing here touches the library: it only says what a file holds, with every record
   checked first. A show needs an id and a list of seasons, a film needs an id, and a
   deletion record needs a time. `bad` names the way a file failed. */
function parseBackup(text) {
  let j; try { j = JSON.parse(text); } catch (e) { return { bad: "invalid" }; }
  if (!j || typeof j !== "object" || !Array.isArray(j.shows)) return { bad: "notbackup" };
  const del = {};
  if (j.deleted && typeof j.deleted === "object" && !Array.isArray(j.deleted))
    for (const [id, ts] of Object.entries(j.deleted)) if (Number.isFinite(+ts) && +ts > 0) del[id] = +ts;
  return {
    shows: j.shows.filter((s) => s && typeof s === "object" && s.id != null && Array.isArray(s.seasons)),
    movies: Array.isArray(j.movies) ? j.movies.filter((m) => m && typeof m === "object" && m.id != null) : [],
    deleted: del,
  };
}

/* ================= calendar file (.ics) ================= */
/* Every episode still to come, as an event a calendar app can show in its owner's own
   zone. An episode with a real clock time is a timed event (an instant, so the calendar
   converts it to wherever its owner is). One with only a date is an all-day event on
   that date: no hour was announced, so none is invented. The text is RFC 5545: commas,
   semicolons and newlines escaped, lines folded at 75 bytes, CRLF between lines. */
function icsText(s) { return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function icsFold(line) {
  let out = "", n = 0;
  for (const ch of line) {
    const c = ch.codePointAt(0), b = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (n + b > 75) { out += "\r\n "; n = 1; }
    out += ch; n += b;
  }
  return out;
}
const icsInstant = (ms) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, "");   // an instant in UTC, not a calendar day
function icsDayAfter(iso) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + 1));
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}
function icsCalendar(shows, films, now) {
  now = now || Date.now();
  const lines = [], stamp = icsInstant(now); let count = 0;
  const event = (uid, summary, note, ts, date, mins) => {
    count++;
    lines.push("BEGIN:VEVENT", "UID:" + uid + "@signal", "DTSTAMP:" + stamp);
    if (ts) lines.push("DTSTART:" + icsInstant(new Date(ts).getTime()), "DTEND:" + icsInstant(new Date(ts).getTime() + mins * 60000));
    else lines.push("DTSTART;VALUE=DATE:" + date.replace(/-/g, ""), "DTEND;VALUE=DATE:" + icsDayAfter(date));
    lines.push("SUMMARY:" + icsText(summary));
    if (note) lines.push("DESCRIPTION:" + icsText(note));
    lines.push("END:VEVENT");
  };
  for (const sh of shows || []) {
    if (dropped(sh)) continue;
    let n = 0;
    for (const se of sh.seasons || []) for (const ep of se.eps || []) {
      if (n >= 40) break;                                   // a daily serial would otherwise fill a year
      if ((!ep.ts && !ep.air) || epLive(ep, sh) || (sh.watched && sh.watched[epK(se.season, ep.e)])) continue;
      event("ep-" + sh.id + "-" + se.season + "-" + ep.e, sh.title + " " + codeOf(se.season, ep.e), ep.name, ep.ts, ep.air, +sh.runtime > 0 ? +sh.runtime : 60);
      n++;
    }
  }
  for (const m of films || []) {
    if (m.watched || !m.releaseDate || m.releaseDate < ymd(now)) continue;
    event("mv-" + m.id, t("ics_film", { title: m.title }), "", null, m.releaseDate, 0);
  }
  const head = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Signal//Watch tracker//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + icsText(t("ics_cal")), "X-WR-TIMEZONE:" + viewTZ()];
  return { count, text: [...head, ...lines, "END:VCALENDAR"].map(icsFold).join("\r\n") + "\r\n" };
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
/* When a service puts a whole season or episode out, for a show that has a date but no clock time.
   The date is the service's own (TVmaze gives the US date), so it opens at `h` hours into that date in `tz`.
   A guess, kept short on purpose: only a service whose hour is well documented goes here, and `h` carries
   a margin after the usual hour, so a late drop still never shows as out early. Netflix drops at midnight Pacific.
   Disney+, Hulu, Apple TV, HBO Max, Paramount+ and Prime Video were checked in 4.2 and vary between midnight and
   evening by show, so they stay on the safe end-of-date rule until a per-show source exists. */
const DROP_AT = { netflix: { tz: "America/Los_Angeles", h: 2 } };
function dropRule(sh) {
  const name = String((sh.watchOn && sh.watchOn[0]) || "").toLowerCase();
  if (!name) return null;
  for (const p of PLATFORMS) if (DROP_AT[p.id] && p.match.some((m) => name.includes(m))) return DROP_AT[p.id];
  return null;
}
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
