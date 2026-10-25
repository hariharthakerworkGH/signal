/* ui.js - what the screens look like.
 *
 * Draws HTML from the state in data.js. It never listens for taps (app.js
 * does), and every word on screen comes through t(). Icons are inline SVG that
 * takes the colour of the text around it; there are no emoji anywhere.
 *
 * Three places: Next (what to watch now), Library (everything you track), Find
 * (search and what is coming). A show or a film opens as a page; from 720px it
 * opens beside the list instead of over it.
 */

const $ = (id) => document.getElementById(id);
const wide = () => window.matchMedia("(min-width:720px)").matches;

/* ================= icons =================
   24px grid, 1.7 stroke, round caps: one family, so nothing looks imported.
   The brand mark is the app icon itself: a filled square in a rounded square. */
const ICONS = {
  next: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M10 9l5 3-5 3z"/>',
  library: '<rect x="3.5" y="9" width="13" height="11" rx="2.5"/><path d="M7 5.5h10.5A2.5 2.5 0 0 1 20 8v8"/>',
  find: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  settings: '<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="8.5" cy="17" r="2.5"/>',
  sync: '<path d="M20 11.5a8 8 0 0 0-14.3-4.6L4 8.8M4 4.2v4.6h4.6M4 12.5a8 8 0 0 0 14.3 4.6l1.7-1.9M20 19.8v-4.6h-4.6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  more: '<circle cx="5.5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  list: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M9 11V8a3 3 0 0 1 6 0v3"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  alert: '<path d="M12 8.5v4.5M12 16.4v.1"/><path d="M10.3 4.4L3 17.3A2 2 0 0 0 4.7 20.3h14.6A2 2 0 0 0 21 17.3L13.7 4.4a2 2 0 0 0-3.4 0z"/>',
};
const ico = (n, c) => `<svg class="ico ${c || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n]}</svg>`;
const markSvg = (c) => `<svg class="mark ${c || ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.1" y="3.1" width="17.8" height="17.8" rx="5.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="7.3" y="7.3" width="9.4" height="9.4" rx="2.4" fill="currentColor"/></svg>`;

/* ================= what the screens remember ================= */
const TABS = ["next", "library", "find"];
/* 3.x had four tabs; map the one a person last left open onto the new three. */
const OLD_TAB = { today: "next", shows: "library", movies: "library", discover: "find" };
let tab = (() => { const s = store("signal.tab"); return TABS.includes(s) ? s : OLD_TAB[s] || "next"; })();
let libKind = store("signal.libkind") === "movies" ? "movies" : "shows";
let sheet = null;                 // {type: "show" | "movie" | "settings", id}
let modalOpen = false, booted = false;
let libTab = "watching", libLimit = 60, showFilter = "";
let viewMode = store("signal.view") || "grid";
let showSort = store("signal.sort") || "auto";
let movTab = "watchlist", movFilter = "", movLimit = 60, movSort = store("signal.movsort") || "auto";
let discLang = "all", discOpen = null;
let schedOpen = false, dlOpen = false, dlShowAll = {}, stuckOpen = false, menuOpen = false, svcAll = false;
let selSeason = {}, aboutOpen = {}, confirmDel = null, movConfirmDel = null;
let findType = "all", addQ = "", addRes = { state: "idle", shows: [], movies: [], q: "" };

/* ================= small pieces ================= */
const LANG_NAMES = { en: "English", hi: "हिन्दी" };
const LANG_CODE = { English: "en", Spanish: "es", French: "fr", German: "de", Italian: "it", Portuguese: "pt", Japanese: "ja", Korean: "ko",
  Chinese: "zh", Hindi: "hi", Tamil: "ta", Telugu: "te", Malayalam: "ml", Kannada: "kn", Bengali: "bn", Marathi: "mr", Punjabi: "pa",
  Urdu: "ur", Arabic: "ar", Turkish: "tr", Russian: "ru", Polish: "pl", Dutch: "nl", Swedish: "sv", Norwegian: "no", Danish: "da",
  Finnish: "fi", Thai: "th", Indonesian: "id", Vietnamese: "vi", Tagalog: "tl", Hebrew: "he", Greek: "el", Czech: "cs", Hungarian: "hu",
  Ukrainian: "uk", Romanian: "ro" };
/* TVmaze names languages in English ("Korean"); show them in the app's own. */
function langName(name) {
  const code = LANG_CODE[name];
  if (!code) return name;
  try { return new Intl.DisplayNames([LANG === "en" ? (navigator.language || "en") : LANG], { type: "language" }).of(code) || name; } catch (e) { return name; }
}
function posterHTML(url, title, extra) {
  const src = imgSrc(url);
  return `<span class="pwrap"><span class="ini">${initialOf(title)}</span>${src ? `<img src="${src}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}${extra || ""}</span>`;
}
function thumbHTML(url, title) {
  const src = imgSrc(url);
  return `<span class="thumb"><span class="ini">${initialOf(title)}</span>${src ? `<img src="${src}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}</span>`;
}
const dotHTML = (c) => `<span class="dot ${c}"></span>`;
/* A blurred poster behind a heading; the address goes through imgSrc() like every picture. */
const backdropHTML = (url) => { const bg = imgSrc(url); return bg ? `<div class="hbg" style="background-image:url('${bg}')"></div>` : ""; };
/* The marker colour and the word for where a show stands. */
function statusOf(sh) {
  if (dropped(sh)) return { key: "st_dropped", color: "red" };
  if (sh.manual) return { key: "st_manual", color: "" };
  if (isUp(sh)) return { key: "st_upcoming", color: "" };
  const a = airedTotal(sh);
  if (a > 0 && wCount(sh) >= a) return { key: "st_caught", color: "amber" };
  if (sh.inProduction || sh.tmdbStatus === "Returning Series") return { key: "st_onair", color: "cyan" };
  return { key: "st_ended", color: "" };
}
/* The one short line under a show: what is next, or when. */
function subLine(sh) {
  const cat = catOf(sh), wait = Math.max(0, airedTotal(sh) - wCount(sh));
  if (dropped(sh)) return t("st_dropped");
  if (cat === "watching") { const n = nextUnwatched(sh); if (n) return codeOf(n.s, n.e) + " · " + t("left_n", { n: wait }); }
  else if (isUp(sh)) {
    const si = soonInfo(sh), d = (si && si.dateStr) || sh.firstAir;
    return d ? t("premieres", { date: fmtDate(d) + (si && si.ts ? " · " + fmtTime(si.ts) : "") }) : t("date_tba");
  } else if (cat === "waiting") {
    const si = soonInfo(sh);
    return (si && sh.nextEp) ? codeOf(sh.nextEp.s, sh.nextEp.e) + " · " + fmtDate(si.dateStr || localDate(si.ts)) : t("awaiting");
  }
  return "";
}
const recentFirst = (a, b) => (b.addedAt || b.updatedAt || 0) - (a.addedAt || a.updatedAt || 0);
const q2 = (s) => s.toLowerCase();
const checkBtn = (attr, id, label, cls) => `<button class="btn ${cls || "soft"} ic act" ${attr}="${id}" aria-label="${esc(label)}">${ico("check")}</button>`;

/* ================= Next ================= */
function onboardHTML() {
  return `<div class="empty">${markSvg()}<h3>${t("onboard_title")}</h3><p>${t("onboard_body")}</p>
    <button class="btn primary" data-openadd="1">${ico("plus", "sm")}${t("onboard_cta")}</button>
    <button class="btn ghost" data-ttpick="shows">${t("set_tt_shows")}</button></div>`;
}
function heroCard(x) {
  const s = x.s, n = x.n, pr = dlPrompt && dlPrompt.id === s.id ? dlPrompt : null;
  const a = airedTotal(s), w = wCount(s), code = codeOf(pr ? pr.s : n.s, pr ? pr.e : n.e);
  const line = pr ? t("asked_dl", { code }) : [code, n.name, w + " " + t("d_of_watched", { a })].filter(Boolean).join(" · ");
  return `<section class="hcard">${backdropHTML(s.poster)}<div class="hin">
    <button class="open" data-show="${s.id}" aria-label="${esc(t("open_show", { title: s.title }))}"><span class="kick">${t("continue_watching")}</span><h2 class="clip">${esc(s.title)}</h2><span class="l2 clip">${esc(line)}</span></button>
    ${pr ? `<button class="btn cyan" data-dlnext="${s.id}:${pr.s}:${pr.e}">${ico("download")}${t("btn_mark_downloaded")}</button>`
         : `<button class="btn primary" data-next="${s.id}">${ico("check")}${t("btn_mark_ep", { code })}</button>`}</div></section>`;
}
function readyRow(x) {
  const s = x.s, n = x.n, left = Math.max(0, airedTotal(s) - wCount(s)), code = codeOf(n.s, n.e);
  return `<div class="row"><button class="main" data-show="${s.id}">${thumbHTML(s.poster, s.title)}
    <span class="mid"><b class="clip">${esc(s.title)}</b><span class="l2 clip">${code}${n.name ? " · " + esc(n.name) : ""}</span></span>
    <span class="side">${t("left_n", { n: left })}</span></button>${checkBtn("data-next", s.id, s.title + ": " + t("btn_mark_ep", { code }))}</div>`;
}
function caughtUpHTML() {
  const nxt = scheduleItems(db, null)[0];
  const body = nxt ? t("caught_next", { title: nxt.sh.title, when: fmtDate(nxt.si.dateStr || localDate(nxt.si.ts)) }) : t("caught_none");
  return `<div class="empty">${markSvg()}<h3>${t("caught_title")}</h3><p>${esc(body)}</p>
    <button class="btn" data-tab="find">${t("go_find")}</button></div>`;
}
function dayParts(d) {
  const dt = new Date(d + "T00:00:00");
  return { wd: new Intl.DateTimeFormat(LANG, { weekday: "short" }).format(dt), n: dt.getDate() };
}
function scheduleHTML() {
  const items = scheduleItems(db, schedOpen ? null : 7 * 24 * 3600e3);
  if (!items.length) return "";
  const all = scheduleItems(db, null);
  const shown = items.slice(0, schedOpen ? 80 : 6);
  let h = `<div class="sec"><h2>${t("sec_week")}</h2>${all.length > shown.length || schedOpen
    ? `<button class="more" data-schedtoggle="1">${schedOpen ? t("show_less") : t("full_schedule", { n: all.length })}</button>` : ""}</div><div class="rows">`;
  let day = null;
  for (const { sh, si } of shown) {
    const d = si.dateStr || localDate(si.ts), p = dayParts(d), first = d !== day; day = d;
    h += `<div class="row dense"><button class="main" data-show="${sh.id}">
      <span class="when">${first ? `<span>${esc(p.wd)}</span><b>${p.n}</b>` : ""}</span>${thumbHTML(sh.poster, sh.title)}
      <span class="mid"><b class="clip">${esc(sh.title)}</b><span class="tag">${si.kind === "premiere" ? t("premiere") : si.code}</span></span>
      <span class="side">${si.ts ? fmtTime(si.ts) : ""}</span></button></div>`;
  }
  return h + "</div>";
}
function pendingDownloadsHTML() {
  const isFresh = (v) => typeof v === "number" && v > 1;
  const dlPend = db.filter((x) => dlOn(x) && !dropped(x)).map((x) => {
    let n = 0;
    for (const se of x.seasons) for (const ep of se.eps) { const k = epK(se.season, ep.e); if (isFresh(x.watched[k]) && !(x.dl && x.dl[k])) n++; }
    return { sh: x, n };
  }).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const mvPend = movies.filter((m) => m.dlWant && !m.dl);
  if (!dlPend.length && !mvPend.length) return "";
  const total = dlPend.reduce((a, x) => a + x.n, 0) + mvPend.length;
  let h = `<button class="dlrow" data-dlexp="1" aria-expanded="${dlOpen}">${ico("download")}<span class="txt">${t("dl_pending", { n: total })}</span>${ico(dlOpen ? "down" : "chev")}</button>`;
  if (!dlOpen) return h;
  h += `<div class="dllist">`;
  for (const { sh } of dlPend) {
    const pend = [];
    for (const se of sh.seasons) for (const ep of se.eps) { const k = epK(se.season, ep.e); if (isFresh(sh.watched[k]) && !(sh.dl && sh.dl[k])) pend.push({ s: se.season, e: ep.e }); }
    const CAP = 12, all = !!dlShowAll[sh.id], vis = all ? pend : pend.slice(0, CAP);
    h += `<div class="dlcard"><div class="top"><b class="clip">${esc(sh.title)}</b><button class="btn sm" data-dlall="${sh.id}">${t("dl_all")}</button></div><div class="chips">`;
    for (const p of vis) h += `<button class="btn sm cy" data-dlep="${sh.id}:${p.s}:${p.e}">${codeOf(p.s, p.e)}</button>`;
    if (pend.length > CAP) h += `<button class="btn sm ghost" data-dlmore="${sh.id}">${all ? t("show_less") : t("dl_more", { n: pend.length - CAP })}</button>`;
    h += `</div></div>`;
  }
  if (mvPend.length) {
    h += `<div class="dlcard"><b>${t("tab_movies")}</b><div class="chips">${mvPend.map((m) => `<button class="btn sm cy" data-mvpend="${esc(m.id)}">${esc(m.title.slice(0, 28))}</button>`).join("")}</div></div>`;
  }
  return h + "</div>";
}
function viewNext() {
  if (!db.length && !movies.length) return `<header class="ph"><h1>${t("tab_next")}</h1></header>` + onboardHTML();
  const today = new Intl.DateTimeFormat(LANG, { weekday: "short", day: "numeric", month: "short" }).format(new Date());
  let h = `<header class="ph"><h1>${t("tab_next")}</h1><span class="sub">${esc(today)}</span></header>`;
  let up = upNextItems(db);
  if (dlPrompt && !up.some((x) => x.s.id === dlPrompt.id)) {
    const ps = db.find((x) => x.id === dlPrompt.id);
    if (ps) up = [{ s: ps, n: { s: dlPrompt.s, e: dlPrompt.e, name: "" } }, ...up];
  }
  if (up.length) {
    h += heroCard(up[0]);
    const rest = up.slice(1);
    if (rest.length) h += `<div class="sec"><h2>${t("sec_ready")}</h2>${rest.length > 8
      ? `<button class="more" data-goto="library:watching">${t("see_all")}</button>` : `<span class="meta">${t("more_n", { n: rest.length })}</span>`}</div>
      <div class="rows">${rest.slice(0, 8).map(readyRow).join("")}</div>`;
  } else if (db.length) h += caughtUpHTML();
  return h + scheduleHTML() + pendingDownloadsHTML();
}

/* ================= Library ================= */
function tileHTML(sh) {
  const sub = subLine(sh), a = airedTotal(sh), wait = Math.max(0, a - wCount(sh)), pct = a ? Math.round(wCount(sh) / a * 100) : 0;
  const badge = catOf(sh) === "watching" && wait > 0 ? `<span class="badge chip amber">+${wait}</span>` : "";
  return `<button class="tile" data-show="${sh.id}">${posterHTML(sh.poster, sh.title, `${badge}${!isUp(sh) && a ? `<span class="pbar"><i style="width:${pct}%"></i></span>` : ""}`)}
    <span class="t clip">${esc(sh.title)}</span>${sub ? `<span class="s clip">${esc(sub)}</span>` : ""}</button>`;
}
function rowHTML(sh) {
  const st = statusOf(sh), sub = subLine(sh), wait = Math.max(0, airedTotal(sh) - wCount(sh));
  const end = catOf(sh) === "watching" && wait > 0 ? `<span class="chip amber">+${wait}</span>` : `<span class="chip">${dotHTML(st.color)}${t(st.key)}</span>`;
  return `<div class="row"><button class="main" data-show="${sh.id}">${thumbHTML(sh.poster, sh.title)}
    <span class="mid"><b class="clip">${esc(sh.title)}${sh.year ? ` <span class="faint fw-400">${sh.year}</span>` : ""}</b>${sub ? `<span class="l2 clip">${esc(sub)}</span>` : ""}</span>${end}</button></div>`;
}
function filmRowHTML(m) {
  const future = m.releaseDate && daysAway(m.releaseDate) > 0;
  const when = m.releaseDate ? (future ? fmtDate(m.releaseDate) : String(m.year || m.releaseDate.slice(0, 4))) : (m.manual ? t("date_tba") : String(m.year || ""));
  let act;
  if (!m.watched) act = checkBtn("data-mvw", esc(m.id), m.title + ": " + t("mv_mark_watched"));
  else if (m.dlWant && !m.dl) act = checkBtn("data-mvdlgo", esc(m.id), m.title + ": " + t("btn_mark_downloaded"), "cyan");
  else act = "";
  return `<div class="row"><button class="main" data-film="${esc(m.id)}">${thumbHTML(m.poster, m.title)}
    <span class="mid"><b class="clip">${esc(m.title)}</b><span class="l2 clip">${esc(when)}${m.runtime ? " · " + t("mv_runtime", { n: m.runtime }) : ""}${m.watched && m.watchedAt ? " · " + t("mv_watched_on", { date: m.watchedAt.slice(0, 10) }) : ""}</span></span>
    ${m.dl ? `<span class="chip cyan">${t("mv_dl_done")}</span>` : ""}</button>${act}</div>`;
}
const sortSel = (id, opts, val) => `<span class="sortw"><select id="${id}" class="sortsel" aria-label="${t("sort_label")}">${opts.map(([v, l]) => `<option value="${v}"${val === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>${ico("down", "sm")}</span>`;
function libraryTools(sortHTML, extra) {
  const last = Math.max(0, ...db.map((s) => s.lastSynced || 0));
  return `<div class="tools"><span class="upd">${last ? esc(t("d_synced", { ago: agoLabel(last) })) + " · " : ""}<button class="lnk" data-syncall="1">${t("refresh")}</button></span>
    <span class="end">${sortHTML}${extra || ""}</span></div>`;
}
function libShows() {
  const counts = { watching: 0, waiting: 0, done: 0 };
  db.forEach((s) => counts[catOf(s)]++);
  let h = `<div class="chiprow" role="group" aria-label="${t("tab_shows")}">${["watching", "waiting", "done"].map((c) =>
    `<button class="fchip" data-lib="${c}" aria-pressed="${libTab === c}">${t("cat_" + c)}<span class="n">${counts[c]}</span></button>`).join("")}</div>`;
  const listAll = db.filter((s) => catOf(s) === libTab);
  const list = showFilter ? listAll.filter((s) => q2(s.title || "").includes(q2(showFilter))) : listAll.slice();
  const waiting = libTab === "waiting";
  if (showSort === "az") list.sort(byTitle);
  else if (showSort === "recent") list.sort(recentFirst);
  else if (waiting) list.sort((a, b) => { const x = soonInfo(a), y = soonInfo(b); return (x ? x.ms : Infinity) - (y ? y.ms : Infinity); });
  else if (libTab === "watching") list.sort((a, b) => lastWatched(b) - lastWatched(a) || recentFirst(a, b));
  else list.sort(recentFirst);
  const opts = [["auto", t(waiting ? "sort_soonest" : libTab === "watching" ? "sort_recent_watched" : "sort_recent_added")], ["az", t("sort_az")]];
  if (libTab !== "done") opts.push(["recent", t("sort_recent_added")]);
  h += libraryTools(sortSel("sortSel", opts, showSort), waiting ? "" : `<button class="icon-btn" data-viewtoggle="1" aria-label="${t(viewMode === "grid" ? "view_list" : "view_grid")}">${ico(viewMode === "grid" ? "list" : "grid")}</button>`);
  if (!list.length) return h + `<div class="empty"><p>${esc(showFilter ? t("empty_filter", { cat: t("cat_" + libTab), q: showFilter }) : t("empty_" + libTab))}</p></div>`;
  const shown = list.slice(0, libLimit);
  h += (viewMode === "grid" && !waiting) ? `<div class="grid">${shown.map(tileHTML).join("")}</div>` : `<div class="rows">${shown.map(rowHTML).join("")}</div>`;
  if (list.length > shown.length) h += `<div class="more-row"><button class="btn" data-libmore="1">${t("show_n_more", { n: Math.min(60, list.length - shown.length) })}</button></div>`;
  return h;
}
function libMovies() {
  const wl = movies.filter((m) => !m.watched), wd = movies.filter((m) => m.watched), td = movies.filter((m) => m.watched && m.dlWant && !m.dl);
  const tabs = [["watchlist", "mv_watchlist", wl.length], ["todl", "mv_todl", td.length], ["watched", "mv_watched", wd.length]];
  let h = `<div class="chiprow" role="group" aria-label="${t("tab_movies")}">${tabs.map(([k, l, n]) =>
    `<button class="fchip" data-movtab="${k}" aria-pressed="${movTab === k}">${t(l)}<span class="n">${n}</span></button>`).join("")}</div>`;
  let list = movTab === "watchlist" ? wl : movTab === "todl" ? td : wd;
  if (movFilter) list = list.filter((m) => q2(m.title).includes(q2(movFilter)));
  list = list.slice();
  if (movSort === "az") list.sort(byTitle);
  else if (movTab === "watched") list.sort((a, b) => ((b.watchedAt || "") < (a.watchedAt || "") ? -1 : 1));
  else list.sort(recentFirst);
  h += `<div class="tools"><span></span><span class="end">${sortSel("movSortSel", [["auto", t(movTab === "watched" ? "sort_recent_watched" : "sort_recent_added")], ["az", t("sort_az")]], movSort)}</span></div>`;
  if (!list.length) return h + `<div class="empty"><p>${esc(t("mv_empty_" + movTab))}</p>${movTab === "watchlist" && !movFilter ? `<button class="btn primary" data-openadd="movie">${ico("plus", "sm")}${t("add")}</button>` : ""}</div>`;
  const shown = list.slice(0, movLimit);
  h += `<div class="rows">${shown.map(filmRowHTML).join("")}</div>`;
  if (list.length > shown.length) h += `<div class="more-row"><button class="btn" data-mvmore="1">${t("show_n_more", { n: Math.min(60, list.length - shown.length) })}</button></div>`;
  return h;
}
function viewLibrary() {
  let h = `<header class="ph"><h1>${t("tab_library")}</h1><button class="icon-btn set-btn" data-opensettings="1" aria-label="${t("settings_aria")}">${ico("settings")}</button></header>`;
  if (!db.length && !movies.length) return h + onboardHTML();
  const mv = libKind === "movies", q = mv ? movFilter : showFilter;
  h += `<div class="search">${ico("search", "sm")}<input id="${mv ? "mf" : "sf"}" class="field" type="search" value="${esc(q)}" placeholder="${esc(t("lib_search"))}" aria-label="${esc(t("lib_search"))}" autocomplete="off"></div>
    <div class="seg mt-12" role="group" aria-label="${t("tab_library")}"><button data-libkind="shows" aria-pressed="${!mv}">${t("tab_shows")}</button><button data-libkind="movies" aria-pressed="${mv}">${t("tab_movies")}</button></div>`;
  return h + (mv ? libMovies() : libShows());
}

/* ================= Find ================= */
function viewFind() {
  let h = `<header class="ph"><h1>${t("tab_find")}</h1></header>
    <form id="addForm" role="search"><div class="search big">${ico("search")}<input id="aq" class="field" type="search" enterkeyhint="search" autocomplete="off" value="${esc(addQ)}" placeholder="${esc(t("find_ph"))}" aria-label="${esc(t("find_ph"))}"></div></form>
    <div class="chiprow" role="group" aria-label="${esc(t("find_ph"))}">${[["all", t("find_all")], ["show", t("tab_shows")], ["movie", t("tab_movies")]].map(([k, l]) =>
      `<button class="fchip" data-findtype="${k}" aria-pressed="${findType === k}">${l}</button>`).join("")}</div>`;
  return h + (addRes.state === "idle" ? discoverHTML() : resultsHTML());
}
function resultsHTML() {
  const r = addRes;
  let h = `<div aria-live="polite">`;
  if (r.state === "busy") return h + `<p class="status">${t("add_searching")}</p><div class="skel"></div><div class="skel"></div><div class="skel"></div></div>`;
  if (r.state === "offline") return h + `<p class="status err">${t("add_offline")}</p></div>`;
  if (r.state === "err") h += `<p class="status err">${t("add_err")}</p>`;
  else if (!r.shows.length && !r.movies.length) h += `<p class="status">${esc(t("add_none", { q: r.q }))}</p>`;
  if (r.shows.length) {
    h += `<div class="sec"><h2>${t("tab_shows")}</h2></div><div class="rows">${r.shows.map((x) => {
      const inLib = db.some((s) => s.id === x.id);
      const meta = [x.lang ? langName(x.lang) : "", x.where, x.country].filter(Boolean).join(" · ");
      return `<button class="rcard" ${inLib ? `data-show="${x.id}"` : `data-addshow="${x.id}"`}>${thumbHTML(x.poster, x.name)}
        <span class="mid"><b>${esc(x.name)} <span class="faint fw-400">${x.year || t("tba")}</span></b>${meta ? `<span class="sub">${esc(meta)}</span>` : ""}${x.summary ? `<span class="sub">${esc(x.summary)}</span>` : ""}</span>
        ${inLib ? `<span class="chip">${t("add_in_lib")}</span>` : `<span class="btn soft sm" aria-hidden="true">${ico("plus", "sm")}${t("add_btn")}</span>`}</button>`;
    }).join("")}</div>`;
  }
  if (r.movies.length) {
    h += `<div class="sec"><h2>${t("tab_movies")}</h2></div><div class="rows">${r.movies.map((x) => {
      const inLib = movies.some((m) => m.id === "mv-" + x.id);
      return `<button class="rcard" ${inLib ? `data-film="mv-${esc(x.id)}"` : `data-addmovie="${esc(x.id)}"`}><span class="mid"><b>${esc(x.label)}</b><span class="sub">${esc(x.description || "")}</span></span>
        ${inLib ? `<span class="chip">${t("add_in_lib")}</span>` : `<span class="btn soft sm" aria-hidden="true">${ico("plus", "sm")}${t("add_btn")}</span>`}</button>`;
    }).join("")}</div>`;
  }
  h += `</div><div class="chips mt-16">${findType !== "movie" ? `<button class="btn ghost" data-manualshow="1">${t("add_manual_show")}</button>` : ""}${findType !== "show" ? `<button class="btn ghost" data-manualmovie="1">${t("add_manual_movie")}</button>` : ""}</div>`;
  return h;
}
function discoverHTML() {
  return (findType !== "movie" ? discoverShowsHTML() : "") + (findType !== "show" ? discoverMoviesHTML() : "");
}
function discoverShowsHTML() {
  if (!myPlatforms.length)
    return `<div class="empty"><h3>${t("disc_pick")}</h3><p>${t("disc_pick_body")}</p><button class="btn primary" data-opensettings="services">${t("disc_pick_btn")}</button></div>`;
  const names = myPlatforms.map((id) => (PLATFORMS.find((p) => p.id === id) || {}).label).filter(Boolean).join(", ");
  let h = `<div class="sec"><h2>${t("find_premiering")}</h2><button class="icon-btn" data-discrefresh="1" aria-label="${t("refresh")}" aria-busy="${discLoading}">${ico("sync")}</button></div>
    <p class="subline">${esc(names)} · <button class="lnk" data-opensettings="services">${t("disc_change")}</button></p>`;
  if (discLoading) return h + `<div class="status">${t("disc_loading")}</div><div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
  if (discError && !discCache) return h + `<div class="status err">${t("disc_err")}</div><button class="btn" data-discrefresh="1">${t("retry")}</button>`;
  const all = (discCache && discCache.items) || [];
  const mine = all.filter((it) => !db.some((s) => s.id === it.id));
  const hidden = all.length - mine.length;
  if (!all.length) return h + `<div class="empty"><p>${t("disc_none")}</p></div>`;
  const langs = {}; for (const it of mine) if (it.lang) langs[it.lang] = (langs[it.lang] || 0) + 1;
  const langList = Object.entries(langs).sort((a, b) => b[1] - a[1]);
  if (discLang !== "all" && !langs[discLang]) discLang = "all";
  if (langList.length > 1) h += `<div class="langs" data-sk="langs" role="group" aria-label="${t("disc_lang")}"><button class="fchip" data-disclang="all" aria-pressed="${discLang === "all"}">${t("lang_all")}</button>${langList.map(([l, n]) =>
    `<button class="fchip" data-disclang="${esc(l)}" aria-pressed="${discLang === l}">${esc(langName(l))}<span class="n">${n}</span></button>`).join("")}</div>`;
  const items = mine.filter((it) => discLang === "all" || it.lang === discLang);
  if (!mine.length) h += `<div class="empty"><p>${t("disc_all_in")}</p></div>`;
  h += `<div class="rows">`;
  for (const it of items) {
    const open = discOpen === it.id, inf = infoCache[it.id + ":" + it.season];
    let more = "";
    if (open) {
      if (!inf || inf.loading) more = `<p>${t("info_loading")}</p>`;
      else if (inf.error) more = `<p class="c-red">${t("info_error")}</p>`;
      else more = `${inf.summary ? `<p>${esc(inf.summary)}</p>` : ""}
        <p>${esc(inf.epCount ? t("disc_ep_count", { s: it.season, n: inf.epCount }) : t("disc_ep_none", { s: it.season }))}${inf.runtime ? " · " + t("mv_runtime", { n: inf.runtime }) : ""}${inf.genres.length ? " · " + esc(inf.genres.join(", ")) : ""}</p>
        <div class="links"><a class="btn sm" href="https://www.google.com/search?q=${encodeURIComponent(it.title + " series")}" target="_blank" rel="noopener">${ico("link", "sm")}${t("m_google")}</a>
        <a class="btn sm" href="${inf.imdb ? "https://www.imdb.com/title/" + inf.imdb + "/" : "https://www.imdb.com/find/?q=" + encodeURIComponent(it.title)}" target="_blank" rel="noopener">${ico("link", "sm")}IMDb</a></div>`;
    }
    h += `<div class="row"><button class="main" data-discopen="${it.id}" aria-expanded="${open}">${thumbHTML(it.poster, it.title)}
      <span class="mid"><b class="clip">${esc(it.title)}</b><span class="l2 clip">S${it.season} · ${esc(fmtDate(it.date))}${it.ts ? " · " + esc(fmtTime(it.ts)) : ""} · ${esc(it.platform)}</span></span></button>
      <button class="btn soft sm act" data-discadd="${it.id}">${ico("plus", "sm")}${t("add_btn")}</button></div>${open ? `<div class="frow-more">${more}</div>` : ""}`;
  }
  h += `</div>`;
  if (hidden) h += `<p class="help mt-12">${t("disc_hidden", { n: hidden })}</p>`;
  return h + `<p class="help mt-8">${t("disc_note", { ago: agoLabel(discCache.ts) })}</p>`;
}
function discoverMoviesHTML() {
  let h = `<div class="sec"><h2>${t("find_movies_soon")}</h2><button class="icon-btn" data-mdiscrefresh="1" aria-label="${t("refresh")}" aria-busy="${mdiscLoading}">${ico("sync")}</button></div>`;
  if (mdiscLoading) h += `<div class="status">${t("mdisc_loading")}</div><div class="skel"></div>`;
  if (mdiscError && !mdiscLoading) h += `<div class="status err">${t("mdisc_err", { msg: esc(mdiscError) })}</div><button class="btn" data-mdiscrefresh="1">${t("retry")}</button>`;
  const all = (mdiscCache && mdiscCache.items) || [];
  const items = all.filter((it) => !movies.some((m) => m.id === "mv-" + it.qid || (m.title || "").toLowerCase() === it.title.toLowerCase()));
  if (!all.length && !mdiscLoading && !mdiscError) return h + `<div class="empty"><p>${t("mdisc_empty")}</p></div>`;
  if (all.length && !items.length) h += `<div class="empty"><p>${t("mdisc_all_in")}</p></div>`;
  if (items.length) h += `<div class="fcards" data-sk="fcards" role="region" aria-label="${esc(t("find_movies_soon"))}" tabindex="0">${items.map((it) =>
    `<div class="fcard">${posterHTML(it.poster, it.title)}<b class="clip">${esc(it.title)}</b><span class="d">${esc(fmtDate(it.date))}</span>
      <button class="btn soft sm" data-mdiscadd="${esc(it.qid)}" aria-label="${esc(t("add_btn") + ": " + it.title)}">${ico("plus", "sm")}${t("add_btn")}</button></div>`).join("")}</div>`;
  return h + (mdiscCache ? `<p class="help mt-12">${t("mdisc_note", { ago: agoLabel(mdiscCache.ts) })}</p>` : "");
}

/* ================= a show ================= */
function curSeason(sh) {
  if (selSeason[sh.id] != null && sh.seasons.some((s) => s.season === selSeason[sh.id])) return selSeason[sh.id];
  const open = sh.seasons.find((se) => se.eps.some((ep) => aired(sh, ep) && !sh.watched[epK(se.season, ep.e)]));
  return (open || sh.seasons[sh.seasons.length - 1] || { season: 1 }).season;
}
/* The top of a title page: a blurred poster, the buttons over it, then the poster and name. */
function titleTop(poster, title, status, meta, more) {
  return `<div class="tp-top">${backdropHTML(poster)}<div class="tp-btns"><button class="icon-btn back" data-closesheet="1" aria-label="${t("back")}">${ico("back")}</button>${more || "<span></span>"}</div></div>
    <div class="tp-head">${posterHTML(poster, title)}<div class="tx"><h1 id="sheetTitle">${esc(title)}</h1>${meta ? `<p class="meta">${esc(meta)}</p>` : ""}${status}</div></div>`;
}
function menuShow(sh) {
  const up = isUp(sh), cat = catOf(sh), a = airedTotal(sh), done = a > 0 && wCount(sh) >= a;
  const gq = encodeURIComponent(sh.title + " next episode");
  const imdbUrl = sh.imdb ? "https://www.imdb.com/title/" + sh.imdb + "/" : "https://www.imdb.com/find/?q=" + encodeURIComponent(sh.title);
  const row = (attr, label, sub, cls) => `<button class="mrow ${cls || ""}" ${attr}><span>${label}</span>${sub ? `<span class="s">${sub}</span>` : ""}</button>`;
  return `<div class="menu-scrim" data-closemenu="1"></div><section class="menu" role="dialog" aria-modal="true" aria-label="${esc(t("menu_aria", { title: sh.title }))}"><div class="grab" aria-hidden="true"></div>
    <button class="mrow" role="switch" aria-checked="${dlOn(sh)}" data-dltrack="${sh.id}"><span class="two"><span>${t("m_dl_reminders")}</span><small>${t("m_dl_sub")}</small></span><span class="switch" aria-hidden="true"><i></i></span></button>
    ${!up && !done ? row(`data-catchup="${sh.id}"`, t("m_caught")) : ""}
    ${sh.manual ? "" : row(`data-sync="${sh.id}"`, t("m_refresh_now"), esc(sh.syncFail ? failWhy(sh.syncFail) : t("d_synced", { ago: agoLabel(sh.lastSynced) })))}
    ${dropped(sh) ? row(`data-bucket="${sh.id}:resume"`, t("m_resume"))
      : `${cat === "waiting" ? row(`data-bucket="${sh.id}:done"`, t("m_to_done")) : cat === "done" ? row(`data-bucket="${sh.id}:active"`, t("m_to_active")) : ""}${row(`data-bucket="${sh.id}:dropped"`, t("m_drop"), t("m_drop_sub"))}`}
    ${!up && !sh.manual ? row(`data-unlock="${sh.id}"`, t(sh.unlockAll ? "m_relock" : "m_unlock")) : ""}
    ${sh.manual ? row(`data-manadd="${sh.id}"`, t("m_add_eps")) : ""}
    <a class="mrow lk" href="https://www.google.com/search?q=${gq}" target="_blank" rel="noopener"><span>${t("m_google")}</span><span class="s">${t("m_opens")}</span></a>
    <a class="mrow lk" href="${imdbUrl}" target="_blank" rel="noopener"><span>${t("m_imdb")}</span><span class="s">${t("m_opens")}</span></a>
    ${confirmDel === sh.id ? `<div class="confirm"><p class="q">${esc(t("m_remove_q", { title: sh.title }))}</p><div class="btns"><button class="btn danger" data-delyes="${sh.id}">${t("yes_remove")}</button><button class="btn" data-delno="1">${t("keep_it")}</button></div></div>`
      : row(`data-del="${sh.id}"`, t("m_remove"), "", "danger")}</section>`;
}
function sheetShow(sh) {
  const up = isUp(sh), a = airedTotal(sh), w = wCount(sh), st = statusOf(sh);
  const inf = sh.manual ? null : infoCache[sh.id + ":"];
  const next = nextUnwatched(sh), done = a > 0 && w >= a, pr = dlPrompt && dlPrompt.id === sh.id ? dlPrompt : null;
  const pct = a ? Math.round(w / a * 100) : 0;
  const meta = [sh.year, sh.runtime ? t("mv_runtime", { n: sh.runtime }) : "", (sh.watchOn || [])[0], inf && inf.language ? langName(inf.language) : ""].filter(Boolean).join(" · ");
  let h = `<div class="pg-scroll">${titleTop(sh.poster, sh.title, `<span class="chip">${dotHTML(st.color)}${t(st.key)}</span>`, meta,
    `<button class="icon-btn" data-menu="1" aria-label="${t("more_aria")}" aria-haspopup="dialog" aria-expanded="${menuOpen}">${ico("more")}</button>`)}<div class="tp-body">`;
  if (up) {
    const si = soonInfo(sh), d = (si && si.dateStr) || sh.firstAir;
    h += `<div class="upcoming"><b>${esc(t("upcoming_title", { when: d ? fmtDate(d) + (si && si.ts ? " · " + fmtTime(si.ts) : "") : t("tba") }))}</b><p>${t("upcoming_body")}</p></div>`;
  } else {
    h += `<div class="prog"><div class="line"><span><b>${fmtNum(w)}</b> ${t("d_of_watched", { a })}</span>${next ? `<span>${t("d_next", { code: codeOf(next.s, next.e) })}</span>` : ""}</div>
      <div class="bar" role="img" aria-label="${esc(t("d_progress_aria", { w, a }))}"><i style="width:${pct}%"></i></div></div>
      ${sh.nextEp && sh.nextEp.date ? `<p class="help mt-8">${esc(t("d_next_airs", { code: codeOf(sh.nextEp.s, sh.nextEp.e), when: fmtDate(sh.nextEp.date) + (sh.nextEp.ts ? " · " + fmtTime(sh.nextEp.ts) : "") }))}</p>` : ""}`;
  }
  if (inf && !inf.loading && !inf.error) {
    if (inf.summary) h += `<p class="about${aboutOpen[sh.id] ? "" : " clamp"}">${esc(inf.summary)}</p>${inf.summary.length > 120 ? `<button class="about-more" data-aboutmore="${sh.id}">${t(aboutOpen[sh.id] ? "less" : "d_about_more")}</button>` : ""}`;
    const g = inf.genres.map((x) => `<span class="chip">${esc(x)}</span>`).join("") + (inf.rating ? `<span class="chip tint">${t("info_rating", { n: inf.rating })}</span>` : "");
    if (g) h += `<div class="chips">${g}</div>`;
  } else if (inf && inf.loading) h += `<p class="help mt-12">${t("info_loading")}</p>`;
  if (!up) {
    const cs = curSeason(sh), seas = sh.seasons.find((x) => x.season === cs) || sh.seasons[0];
    if (seas) {
      h += `<div class="seasons" data-sk="seasons" role="group" aria-label="${t("d_seasons")}">${sh.seasons.map((se) => {
        const ai = se.eps.filter((ep) => aired(sh, ep)).length, on = se.eps.filter((ep) => sh.watched[epK(se.season, ep.e)]).length;
        return `<button class="schip" data-seas="${sh.id}:${se.season}" aria-pressed="${se.season === cs}">${t("d_season", { n: se.season })}<span class="n">${ai ? on + "/" + ai : t("d_not_aired")}</span></button>`;
      }).join("")}</div>`;
      const ai = seas.eps.filter((ep) => aired(sh, ep)).length, modeDl = dlOn(sh) && markMode[sh.id] === "dl";
      const allOn = modeDl ? seas.eps.some((ep) => sh.watched[epK(cs, ep.e)]) && seas.eps.every((ep) => !sh.watched[epK(cs, ep.e)] || (sh.dl && sh.dl[epK(cs, ep.e)]))
                           : ai > 0 && seas.eps.every((ep) => !aired(sh, ep) || sh.watched[epK(cs, ep.e)]);
      h += `<div class="sbar">${dlOn(sh) ? `<div class="seg" role="group" aria-label="${t("mode_label")}"><button data-mm="${sh.id}:watch" aria-pressed="${!modeDl}">${t("mode_watched")}</button><button data-mm="${sh.id}:dl" aria-pressed="${modeDl}">${t("mode_dl")}</button></div>` : "<span></span>"}
        <button class="btn sm ghost" data-season="${sh.id}:${cs}:${allOn ? 0 : 1}" ${ai ? "" : "disabled"}>${t(modeDl ? (allOn ? "d_clear_dl" : "d_mark_dl") : (allOn ? "d_clear_season" : "d_mark_season"))}</button></div>`;
      h += `<div class="eps">${seas.eps.map((ep) => {
        const k = epK(cs, ep.e), ok = aired(sh, ep), on = !!sh.watched[k], dl = !!(sh.dl && sh.dl[k]) && dlOn(sh);
        const pressed = modeDl ? dl : on, d = epDate(ep);
        const name = ep.name || t("ep_n", { n: ep.e });
        const mt = ok ? (d ? `<span>${esc(fmtDate(d))}</span>` : "") + (modeDl ? "" : (dl ? `<span class="chip cyan">${t("ep_downloaded")}</span>` : ""))
                      : `<span>${esc(t("ep_airs", { date: (d ? fmtDate(d) : t("tba")) + (ep.ts ? " · " + fmtTime(ep.ts) : "") }))}</span>`;
        return `<button class="ep${modeDl ? (dl ? " dl" : "") : (on ? " on" : "")}" data-ep="${sh.id}:${cs}:${ep.e}" aria-pressed="${pressed}" ${ok ? "" : "disabled"}
          aria-label="${esc(ok ? t("ep_aria", { n: ep.e, name }) : t("ep_aria_locked", { n: ep.e, name }))}">
          <span class="num">${ep.e}</span><span class="tx"><span class="tt clip">${esc(name)}</span><span class="mt">${mt}</span></span>
          <span class="box">${ico(ok ? "check" : "lock")}</span></button>`;
      }).join("")}</div>`;
    }
  }
  h += `<p class="tp-note">${sh.syncFail ? esc(failWhy(sh.syncFail)) : t("d_synced", { ago: agoLabel(sh.lastSynced) })}</p></div></div>`;
  if (!up) {
    const code = next ? codeOf(next.s, next.e) : "";
    h += `<div class="tp-bar">${pr ? `<button class="btn cyan big" data-dlnext="${sh.id}:${pr.s}:${pr.e}">${ico("download")}${t("btn_mark_downloaded")}</button>`
      : next ? `<button class="btn primary big" data-next="${sh.id}">${ico("check")}${t("btn_mark_ep", { code })}</button>`
      : `<button class="btn big" disabled>${done ? t("d_all_caught") : t("d_nothing_aired")}</button>`}</div>`;
  }
  return h + (menuOpen ? menuShow(sh) : "");
}

/* ================= a film ================= */
function sheetMovie(m) {
  const future = m.releaseDate && daysAway(m.releaseDate) > 0;
  const meta = [m.releaseDate ? (future ? fmtDate(m.releaseDate) : (m.year || m.releaseDate.slice(0, 4))) : "", m.runtime ? t("mv_runtime", { n: m.runtime }) : ""].filter(Boolean).join(" · ");
  const chips = [];
  if (m.manual) chips.push(`<span class="chip">${t("st_manual")}</span>`);
  if (m.watched) chips.push(`<span class="chip tint">${t("mv_watched")}</span>`);
  if (m.dl) chips.push(`<span class="chip cyan">${t("mv_dl_done")}</span>`);
  let primary;
  if (!m.watched) primary = `<button class="btn primary big" data-mvw="${esc(m.id)}">${ico("check")}${t("mv_mark_watched")}</button>`;
  else if (m.dlWant && !m.dl) primary = `<button class="btn cyan big" data-mvdlgo="${esc(m.id)}">${ico("download")}${t("btn_mark_downloaded")}</button>`;
  else primary = "";
  const undo = m.watched ? `<button class="btn big" data-mvw="${esc(m.id)}">${t("mv_unwatch")}</button>` : "";
  return `<div class="pg-scroll">${titleTop(m.poster, m.title, chips.length ? `<span class="chips">${chips.join("")}</span>` : "", meta)}<div class="tp-body">
    ${m.watched && m.watchedAt ? `<p class="help">${t("mv_watched_on", { date: m.watchedAt.slice(0, 10) })}</p>` : ""}
    <div class="group"><h3>${t("mv_details")}</h3><div class="card"><div class="kv">
      <div class="r"><label for="mvd">${t("mv_release")}</label><div class="inline"><input type="date" id="mvd" class="field" value="${esc(m.releaseDate || "")}"><button class="btn sm" data-mvdate="${esc(m.id)}">${t("save")}</button></div></div>
      ${m.manual ? `<div class="r"><label for="mvt">${t("mv_title")}</label><div class="inline"><input id="mvt" class="field w-title" value="${esc(m.title)}"><button class="btn sm" data-mvtitle="${esc(m.id)}">${t("save")}</button></div></div>` : ""}
      </div><div class="btns">${isWdMovie(m.id) ? `<button class="btn sm" data-mvref="${esc(m.id)}">${ico("sync", "sm")}${t("mv_refresh")}</button>` : ""}
      ${m.dlWant ? `<button class="btn sm" data-mvskip="${esc(m.id)}">${t("mv_skip_dl")}</button>` : ""}
      <a class="btn sm" href="https://www.google.com/search?q=${encodeURIComponent(m.title + " where to watch")}" target="_blank" rel="noopener">${ico("link", "sm")}${t("mdisc_where")}</a></div></div></div>
    <div class="group">${movConfirmDel === m.id ? `<div class="card"><p>${esc(t("m_remove_q", { title: m.title }))}</p><div class="btns"><button class="btn danger" data-mvdelyes="${esc(m.id)}">${t("yes_remove")}</button><button class="btn" data-mvdelno="1">${t("keep_it")}</button></div></div>`
      : `<button class="btn danger block" data-mvdel="${esc(m.id)}">${t("mv_remove")}</button>`}</div></div></div>
    ${primary || undo ? `<div class="tp-bar">${primary}${primary && m.watched ? undo : primary ? "" : undo}</div>` : ""}`;
}

/* ================= settings ================= */
async function storageLine() {
  if (idbBroken) {
    let n = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("signal.") === 0) n += k.length + ((localStorage.getItem(k) || "").length); } } catch (e) {}
    return { text: t("set_storage_fallback", { mb: (n / 1048576).toFixed(2) }), legacy: 0 };
  }
  let used = null, quota = null;
  try { const est = await navigator.storage.estimate(); used = est.usage; quota = est.quota; } catch (e) {}
  const legacy = (() => { try { return (store("signal.db") || "").length; } catch (e) { return 0; } })();
  return { text: (used != null ? t("set_storage_using", { used: (used / 1048576).toFixed(1), of: quota ? t("set_storage_of", { q: Math.round(quota / 1048576) }) : "" }) + " " : "") + t("n_shows", { n: db.length }) + ", " + t("n_movies", { n: movies.length }) + ".", legacy };
}
let storageInfo = { text: "", legacy: 0 };
function sheetSettings() {
  const plats = platformsByRelevance(REGION), visible = plats.filter((p, i) => svcAll || i < 12 || myPlatforms.includes(p.id));
  const lastExp = +store("signal.lastexport") || 0;
  return `<div class="phead"><button class="icon-btn" data-closesheet="1" aria-label="${t("back")}">${ico("back")}</button><h2 id="sheetTitle">${t("set_title")}</h2></div><div class="pbody">
    <div class="group"><h3><label for="langSel">${t("set_lang")}</label></h3><select id="langSel" class="field">${SUPPORTED_LANGS.map((l) => `<option value="${l}"${LANG === l ? " selected" : ""}>${LANG_NAMES[l]}</option>`).join("")}</select></div>
    <div class="group" id="services"><h3>${t("set_services")}</h3><div class="card"><p>${t("set_services_help")}</p><div class="chips">${visible.map((p) =>
      `<button class="fchip" data-svc="${p.id}" aria-pressed="${myPlatforms.includes(p.id)}">${esc(p.label)}</button>`).join("")}</div>
      ${plats.length > visible.length || svcAll ? `<button class="btn sm ghost self-start" data-svcall="1">${svcAll ? t("set_services_less") : t("set_services_all", { n: plats.length })}</button>` : ""}</div></div>
    <div class="group"><h3>${t("set_sync")}</h3><div class="card"><p>${t("set_sync_help")}</p>
      <p>${ghToken ? t("set_connected", { ago: agoLabel(lastCloud) }) : t("set_not_connected")}</p>
      <input id="tokenInput" class="field" type="password" autocomplete="off" placeholder="${esc(t("set_token_ph"))}" aria-label="${esc(t("set_token_ph"))}">
      <div class="btns"><button class="btn primary" data-savetoken="1">${t("set_connect")}</button>${ghToken ? `<button class="btn" data-pullnow="1">${t("set_sync_now")}</button><button class="btn danger" data-cleartoken="1">${t("set_disconnect")}</button>` : ""}</div>
      <details class="how"><summary>${t("set_how")}</summary><p>${t("set_how_body")}</p></details></div></div>
    <div class="group"><h3>${t("set_data")}</h3><div class="card"><p>${t("set_data_note")}${lastExp ? " " + t("set_last_export", { ago: agoLabel(lastExp) }) : ""}</p>
      <div class="btns"><button class="btn" data-exportdb="1">${t("set_export")}</button><button class="btn" data-importbtn="1">${t("set_import")}</button></div>
      <div class="btns"><button class="btn" data-ttpick="shows">${t("set_tt_shows")}</button><button class="btn" data-ttpick="movies">${t("set_tt_movies")}</button></div></div></div>
    <div class="group"><h3>${t("set_storage")}</h3><div class="card"><p class="meter">${esc(storageInfo.text)}</p>
      ${storageInfo.legacy > 1000 ? `<button class="btn sm self-start" data-clearlegacy="1">${t("set_clear_old", { mb: (storageInfo.legacy / 1048576).toFixed(1) })}</button><p>${t("set_clear_old_help")}</p>` : ""}</div></div>
    <div class="group"><h3>${t("set_about")}</h3><div class="card"><p><b>${t("set_version", { v: APP_VERSION })}</b></p><p>${t("set_credit")}</p></div></div></div>`;
}

/* ================= the status line: one message at a time ================= */
function bannerHTML() {
  if (storageFull) return `<div class="banner warn" role="alert">${ico("alert")}<span class="txt">${t("b_storage_full")}</span><button class="btn sm" data-bannerexport="1">${t("b_export")}</button></div>`;
  if (syncing && syncProgress) return `<div class="banner" role="status">${ico("sync")}<span class="txt">${esc(t("b_syncing", { i: syncProgress.i, n: syncProgress.n, title: syncProgress.title }))}</span></div>`;
  const stale = staleShows().length;
  if (stale) return `<div class="banner">${ico("alert")}<span class="txt">${t("b_stale", { n: stale })}</span><button class="btn sm soft" data-syncall="1">${t("b_refresh")}</button></div>`;
  const stk = db.filter((s) => !dropped(s) && stuck(s));
  if (stk.length) {
    return `<div class="banner">${ico("alert")}<span class="txt">${t("b_stuck", { n: stk.length })}</span><button class="btn sm ghost" data-stucktoggle="1" aria-expanded="${stuckOpen}">${t(stuckOpen ? "b_stuck_hide" : "b_stuck_see")}</button></div>`
      + (stuckOpen ? `<div class="stucklist">${stk.map((s) => `<div><span class="clip">${esc(s.title)}</span><small>${esc(failWhy(s.syncFail))}</small></div>`).join("")}<p>${t("b_stuck_note")}</p></div>` : "");
  }
  const nag = db.length > 0 && !ghToken && Date.now() - (+store("signal.lastexport") || 0) > 30 * 864e5 && Date.now() > (+store("signal.nagsnooze") || 0);
  if (nag) return `<div class="banner"><span class="txt">${t("b_nag")}</span><button class="btn sm soft" data-bannerexport="1">${t("b_export")}</button><button class="btn sm ghost" data-nagsnooze="1">${t("b_later")}</button></div>`;
  return "";
}
function paintStatus() {
  const b = $("banner"); if (!b) return;
  const html = bannerHTML();
  if (b.innerHTML !== html) b.innerHTML = html;
}

/* ================= putting it all on screen ================= */
/* The text that is typed into index.html itself, not drawn by a function. */
function applyStatic() {
  document.documentElement.lang = LANG;
  document.title = t("app_title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  paintChrome();
}
/* The tab bar is drawn here, not typed in HTML, so it uses the same icon set as everything else.
   The brand mark and the settings button only show in the left rail (wide screens). */
function paintChrome() {
  $("tabbar").innerHTML = `<span class="tab-brand" aria-hidden="true">${markSvg()}</span>`
    + TABS.map((k) => `<button class="tab" data-tab="${k}">${ico(k)}<span>${t("tab_" + k)}</span></button>`).join("")
    + `<span class="tab-sp"></span><button class="tab-set" data-opensettings="1" aria-label="${esc(t("settings_aria"))}">${ico("settings")}</button>`;
}
/* Remember where you were before the view is thrown away and rebuilt, so
   marking an episode never bounces you up the page or loses your cursor. */
const pageScroller = () => document.querySelector(".pg-scroll") || document.querySelector(".panel");
function captureKeep() {
  const ae = document.activeElement;
  const fk = ae && ae !== document.body ? focusKeyOf(ae) : null;
  const sel = ae && typeof ae.selectionStart === "number" ? ae.selectionStart : null;
  const panel = pageScroller();
  const rails = {}; document.querySelectorAll("[data-sk]").forEach((el) => { rails[el.dataset.sk] = el.scrollLeft; });
  return { y: window.scrollY, ay: $("app").scrollTop, py: panel ? panel.scrollTop : 0, rails, fk, sel };
}
function restoreKeep(k) {
  document.querySelectorAll("[data-sk]").forEach((el) => { if (k.rails[el.dataset.sk] != null) el.scrollLeft = k.rails[el.dataset.sk]; });
  const panel = pageScroller(); if (panel) panel.scrollTop = k.py;
  if ($("app").scrollTop !== k.ay) $("app").scrollTop = k.ay;
  if (window.scrollY !== k.y && !sheet) window.scrollTo(0, k.y);
  if (k.fk) {
    const el = focusByKey(k.fk);
    if (el && el !== document.activeElement) {
      try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
      if (k.sel != null && el.setSelectionRange) { try { el.setSelectionRange(k.sel, k.sel); } catch (e) {} }
    }
  }
}
function focusKeyOf(el) {
  if (el.id) return "#" + el.id;
  for (const a of el.attributes) if (a.name.startsWith("data-") && a.name !== "data-sk") return `[${a.name}="${a.value.replace(/"/g, '\\"')}"]`;
  return null;
}
function focusByKey(k) { try { return document.querySelector(k); } catch (e) { return null; } }

function render() {
  if (!booted) return;
  const keep = captureKeep();
  $("view").innerHTML = tab === "library" ? viewLibrary() : tab === "find" ? viewFind() : viewNext();
  document.querySelectorAll(".tab").forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  paintSheet();
  paintStatus();
  restoreKeep(keep);
}
function paintSheet() {
  const el = $("sheet");
  const open = !!sheet;
  const page = open && (sheet.type === "show" || sheet.type === "movie");
  const pane = page && wide();                       // wide: the show sits beside the list, which stays usable
  const lock = (open && !pane) || modalOpen;
  $("app").inert = lock; $("tabbar").inert = lock;
  document.body.style.overflow = lock ? "hidden" : "";
  el.className = pane ? "pane" : "";
  if (!open) { if (el.innerHTML) el.innerHTML = ""; return; }
  let body = "";
  if (sheet.type === "show") { const sh = db.find((s) => s.id === sheet.id); if (!sh) { dropSheet(); return; } body = sheetShow(sh); }
  else if (sheet.type === "movie") { const m = movieById(sheet.id); if (!m) { dropSheet(); return; } body = sheetMovie(m); }
  else body = sheetSettings();
  const had = el.querySelector(".panel"), hadMenu = !!el.querySelector(".menu");
  el.innerHTML = `${pane ? "" : `<div class="scrim" data-closesheet="1"></div>`}<div class="panel${page ? " pg" : ""}" tabindex="-1" role="${pane ? "region" : "dialog"}"${pane ? "" : ' aria-modal="true"'} aria-labelledby="sheetTitle">${body}</div>`;
  // A redraw (marking an episode) must not replay the slide-in of what is already open.
  const still = [];
  if (had) still.push(".panel", ".scrim");
  if (hadMenu) still.push(".menu", ".menu-scrim");
  for (const sel of still) { const n = el.querySelector(sel); if (n) n.style.animation = "none"; }
  if (menuOpen) el.querySelectorAll(".pg-scroll,.tp-bar").forEach((n) => { n.inert = true; });   // the menu is modal: Tab must not wander behind it
}
