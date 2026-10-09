/* ui.js - what the screens look like.
 *
 * Draws HTML from the state in data.js. It never listens for taps (app.js
 * does), and every word on screen comes through t(). Icons are inline SVG that
 * takes the colour of the text around it; there are no emoji anywhere.
 */

const $ = (id) => document.getElementById(id);

/* ================= icons =================
   24px grid, 1.7 stroke, round caps: one family, so nothing looks imported.
   The brand mark is the app icon itself: a filled square in a rounded square. */
const ICONS = {
  today: '<rect x="3" y="4.5" width="18" height="16" rx="3.2"/><path d="M3 9.8h18M8 3v3.2M16 3v3.2"/><path d="M10.2 13.2l3.6 2.1-3.6 2.1z" fill="currentColor" stroke="none"/>',
  shows: '<rect x="3" y="5" width="18" height="12" rx="2.8"/><path d="M8.5 21h7M12 17v4"/>',
  movies: '<rect x="3" y="4" width="18" height="16" rx="2.8"/><path d="M7.5 4v16M16.5 4v16M3 9h4.5M3 15h4.5M16.5 9H21M16.5 15H21"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="M15.8 8.2l-2.1 5.5-5.5 2.1 2.1-5.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  settings: '<path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20"/><circle cx="15" cy="7" r="2.4"/><circle cx="9" cy="17" r="2.4"/>',
  sync: '<path d="M20 11.5a8 8 0 0 0-14.3-4.6L4 8.8M4 4.2v4.6h4.6M4 12.5a8 8 0 0 0 14.3 4.6l1.7-1.9M20 19.8v-4.6h-4.6"/>',
  check: '<path d="M5 12.8l4.6 4.6L19 7.8"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  down: '<path d="M6 9.5l6 6 6-6"/>',
  up: '<path d="M6 14.5l6-6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  alert: '<path d="M12 8.5v4.5M12 16.4v.1"/><path d="M10.3 4.4L3 17.3A2 2 0 0 0 4.7 20.3h14.6A2 2 0 0 0 21 17.3L13.7 4.4a2 2 0 0 0-3.4 0z"/>',
};
const ico = (n, c) => `<svg class="ico ${c || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n]}</svg>`;
const markSvg = (c) => `<svg class="mark ${c || ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.1" y="3.1" width="17.8" height="17.8" rx="5.2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="7.3" y="7.3" width="9.4" height="9.4" rx="2.4" fill="currentColor"/></svg>`;

/* ================= what the screens remember ================= */
const TABS = ["today", "shows", "movies", "discover"];
let tab = TABS.includes(store("signal.tab")) ? store("signal.tab") : "today";
let sheet = null;                 // {type: "show" | "movie" | "add" | "settings", id}
let modalOpen = false, booted = false;
let libTab = "watching", libLimit = 60, showFilter = "";
let viewMode = store("signal.view") || "grid";
let showSort = store("signal.sort") || "auto";
let movTab = "watchlist", movFilter = "", movLimit = 60, movSort = store("signal.movsort") || "auto";
let discTab = "shows", discLang = "all", discOpen = null;
let schedOpen = false, dlOpen = false, dlShowAll = {}, stuckOpen = false, manageOpen = false, svcAll = false;
let selSeason = {}, aboutOpen = {}, confirmDel = null, movConfirmDel = null;
let addType = "show", addQ = "", addRes = { state: "idle", items: [], q: "" };

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
/* The marker colour and the word for where a show stands. */
function statusOf(sh) {
  if (dropped(sh)) return { key: "st_dropped", color: "red" };
  if (sh.manual) return { key: "st_manual", color: "" };
  if (isUp(sh)) return { key: "st_upcoming", color: "violet" };
  const a = airedTotal(sh);
  if (a > 0 && wCount(sh) >= a) return { key: "st_caught", color: "amber" };
  if (sh.inProduction || sh.tmdbStatus === "Returning Series") return { key: "st_onair", color: "cyan" };
  return { key: "st_ended", color: "" };
}
/* The one short line under a show: what is next, or when. */
function subLine(sh) {
  const cat = catOf(sh), wait = Math.max(0, airedTotal(sh) - wCount(sh));
  if (dropped(sh)) return { text: t("st_dropped"), cls: "" };
  if (cat === "watching") { const n = nextUnwatched(sh); if (n) return { text: codeOf(n.s, n.e) + " · " + t("left_n", { n: wait }), cls: "cyan" }; }
  else if (isUp(sh)) {
    const si = soonInfo(sh), d = (si && si.dateStr) || sh.firstAir;
    return { text: d ? t("premieres", { date: fmtDate(d) + (si && si.ts ? " · " + fmtTime(si.ts) : "") }) : t("date_tba"), cls: "violet" };
  } else if (cat === "waiting") {
    const si = soonInfo(sh);
    return { text: (si && sh.nextEp) ? codeOf(sh.nextEp.s, sh.nextEp.e) + " · " + fmtDate(si.dateStr || localDate(si.ts)) : t("awaiting"), cls: "" };
  }
  return { text: "", cls: "" };
}
const recentFirst = (a, b) => (b.addedAt || b.updatedAt || 0) - (a.addedAt || a.updatedAt || 0);
const q2 = (s) => s.toLowerCase();

/* ================= Today ================= */
function onboardHTML() {
  return `<div class="empty">${markSvg()}<h3>${t("onboard_title")}</h3><p>${t("onboard_body")}</p>
    <button class="btn primary" data-openadd="1">${ico("plus", "sm")}${t("onboard_cta")}</button>
    <button class="btn ghost" data-ttpick="shows">${t("set_tt_shows")}</button></div>`;
}
function upCard(x) {
  const s = x.s, n = x.n, pr = dlPrompt && dlPrompt.id === s.id ? dlPrompt : null;
  const a = airedTotal(s), w = wCount(s), pct = a ? Math.round(w / a * 100) : 0;
  return `<div class="ncard">
    <button class="tile" data-show="${s.id}" aria-label="${esc(t("open_show", { title: s.title }))}">${posterHTML(s.poster, s.title, `<span class="pbar"><i style="width:${pct}%"></i></span>`)}</button>
    <div><h3 class="clip">${esc(s.title)}</h3><div class="epline clip"><span class="code">${pr ? codeOf(pr.s, pr.e) : codeOf(n.s, n.e)}</span>${!pr && n.name ? ` <span class="muted">${esc(n.name)}</span>` : ""}</div></div>
    ${pr ? `<p class="asked">${t("asked_dl", { code: codeOf(pr.s, pr.e) })}</p><button class="btn cyan sm" data-dlnext="${s.id}:${pr.s}:${pr.e}">${ico("download", "sm")}${t("btn_mark_downloaded")}</button>`
         : `<button class="btn soft sm" data-next="${s.id}">${ico("check", "sm")}${t("btn_mark_watched")}</button>`}
  </div>`;
}
function caughtUpHTML() {
  const nxt = scheduleItems(db, null)[0];
  const body = nxt ? t("caught_next", { title: nxt.sh.title, when: fmtDate(nxt.si.dateStr || localDate(nxt.si.ts)) }) : t("caught_none");
  return `<div class="empty mt-20">${markSvg()}<h3>${t("caught_title")}</h3><p>${esc(body)}</p>
    <button class="btn" data-tab="discover">${t("go_discover")}</button></div>`;
}
function scheduleHTML() {
  const items = scheduleItems(db, schedOpen ? null : 7 * 24 * 3600e3);
  if (!items.length) return "";
  const all = scheduleItems(db, null);
  const shown = items.slice(0, schedOpen ? 80 : 8);
  let h = `<div class="sec"><h2>${t("sec_week")}</h2>${all.length > shown.length || schedOpen
    ? `<button class="more" data-schedtoggle="1">${schedOpen ? t("show_less") : t("full_schedule", { n: all.length })}</button>` : ""}</div><div class="sched">`;
  let day = null;
  for (const { sh, si } of shown) {
    const d = si.dateStr || localDate(si.ts);
    if (d !== day) { h += `<div class="day-h">${esc(fmtDay(d))}</div>`; day = d; }
    h += `<button class="srow" data-show="${sh.id}">${thumbHTML(sh.poster, sh.title)}
      <span class="mid"><b class="clip">${esc(sh.title)}</b>${si.kind === "premiere" ? `<span class="chip violet">${t("premiere")}</span>` : `<span class="code">${si.code}</span>`}</span>
      <span class="when">${si.ts ? fmtTime(si.ts) : ""}</span></button>`;
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
  let h = `<div class="sec"><h2>${t("sec_download")}<span class="n">${total}</span></h2>
    <button class="more" data-dlexp="1" aria-expanded="${dlOpen}">${dlOpen ? t("hide") : t("show")}</button></div>`;
  if (!dlOpen) return h;
  h += `<div class="stack">`;
  for (const { sh } of dlPend) {
    const pend = [];
    for (const se of sh.seasons) for (const ep of se.eps) { const k = epK(se.season, ep.e); if (isFresh(sh.watched[k]) && !(sh.dl && sh.dl[k])) pend.push({ s: se.season, e: ep.e }); }
    const CAP = 12, all = !!dlShowAll[sh.id], vis = all ? pend : pend.slice(0, CAP);
    h += `<div class="card"><div class="kv"><div class="r"><b class="clip">${esc(sh.title)}</b><button class="btn sm" data-dlall="${sh.id}">${t("dl_all")}</button></div></div><div class="chips">`;
    for (const p of vis) h += `<button class="btn sm cy" data-dlep="${sh.id}:${p.s}:${p.e}">${codeOf(p.s, p.e)}</button>`;
    if (pend.length > CAP) h += `<button class="btn sm ghost" data-dlmore="${sh.id}">${all ? t("show_less") : t("dl_more", { n: pend.length - CAP })}</button>`;
    h += `</div></div>`;
  }
  if (mvPend.length) {
    h += `<div class="card"><b>${t("tab_movies")}</b><div class="chips">${mvPend.map((m) => `<button class="btn sm cy" data-mvpend="${esc(m.id)}">${esc(m.title.slice(0, 28))}</button>`).join("")}</div></div>`;
  }
  return h + "</div>";
}
function viewToday() {
  if (!db.length && !movies.length) return onboardHTML();
  const st = libraryStats(db);
  let h = `<div class="statrow"><button class="stat" data-goto="shows:watching"><b>${fmtNum(st.backlog)}</b><span>${t("stat_backlog", { n: st.backlog })}</span></button>
    <div class="stat"><b>${fmtNum(st.today)}</b><span>${t("stat_today")}</span></div></div>`;
  let up = upNextItems(db);
  if (dlPrompt && !up.some((x) => x.s.id === dlPrompt.id)) {
    const ps = db.find((x) => x.id === dlPrompt.id);
    if (ps) up = [{ s: ps, n: { s: dlPrompt.s, e: dlPrompt.e, name: "" } }, ...up];
  }
  if (up.length) {
    h += `<div class="sec"><h2>${t("sec_upnext")}<span class="n">${up.length}</span></h2>${up.length > 12 ? `<button class="more" data-goto="shows:watching">${t("see_all")}</button>` : ""}</div>
      <div class="rail" role="region" aria-label="${t("sec_upnext")}" tabindex="0" data-sk="rail">${up.slice(0, 12).map(upCard).join("")}</div>`;
  } else if (db.length) h += caughtUpHTML();
  return h + scheduleHTML() + pendingDownloadsHTML();
}

/* ================= Shows ================= */
function filterBar(id, value, ph, sortId, sortOpts, sortVal, toggle) {
  return `<div class="rowtools"><div class="search">${ico("search", "sm")}<input id="${id}" class="field" type="search" value="${esc(value)}" placeholder="${esc(ph)}" aria-label="${esc(ph)}" autocomplete="off"></div>
    <div class="tools-end"><select id="${sortId}" class="field w-auto" aria-label="${t("sort_label")}">${sortOpts.map(([v, l]) => `<option value="${v}"${sortVal === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>${toggle || ""}</div></div>`;
}
function tileHTML(sh) {
  const st = statusOf(sh), sub = subLine(sh), wait = Math.max(0, airedTotal(sh) - wCount(sh)), a = airedTotal(sh);
  const pct = a ? Math.round(wCount(sh) / a * 100) : 0;
  const badge = catOf(sh) === "watching" && wait > 0 ? `<span class="badge chip amber">+${wait}</span>` : "";
  return `<button class="tile" data-show="${sh.id}">${posterHTML(sh.poster, sh.title,
    `<span class="dotp">${dotHTML(st.color)}</span>${badge}${!isUp(sh) ? `<span class="pbar"><i style="width:${pct}%"></i></span>` : ""}`)}
    <span class="t clip">${esc(sh.title)}</span>${sub.text ? `<span class="s clip ${sub.cls}">${esc(sub.text)}</span>` : ""}</button>`;
}
function rowHTML(sh) {
  const st = statusOf(sh), sub = subLine(sh), a = airedTotal(sh), pct = a ? Math.round(wCount(sh) / a * 100) : 0;
  return `<div class="lrow"><button class="main" data-show="${sh.id}">${thumbHTML(sh.poster, sh.title)}
    <span class="mid"><b class="clip">${esc(sh.title)}${sh.year ? ` <span class="faint fw-400">${sh.year}</span>` : ""}</b>
    ${sub.text ? `<span class="sub clip">${esc(sub.text)}</span>` : ""}${!isUp(sh) && a ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ""}</span>
    <span class="end">${dotHTML(st.color)}<span class="sub">${t(st.key)}</span></span></button></div>`;
}
function viewShows() {
  if (!db.length) return onboardHTML();
  const counts = { watching: 0, waiting: 0, done: 0 };
  db.forEach((s) => counts[catOf(s)]++);
  let h = `<div class="seg" role="group" aria-label="${t("tab_shows")}">${["watching", "waiting", "done"].map((c) =>
    `<button data-lib="${c}" aria-pressed="${libTab === c}">${t("cat_" + c)}<span class="n">${counts[c]}</span></button>`).join("")}</div>`;
  const listAll = db.filter((s) => catOf(s) === libTab);
  let list = showFilter ? listAll.filter((s) => q2(s.title || "").includes(q2(showFilter))) : listAll.slice();
  const waiting = libTab === "waiting";
  if (showSort === "az") list.sort(byTitle);
  else if (showSort === "recent") list.sort(recentFirst);
  else if (waiting) list.sort((a, b) => { const x = soonInfo(a), y = soonInfo(b); return (x ? x.ms : Infinity) - (y ? y.ms : Infinity); });
  else if (libTab === "watching") list.sort((a, b) => lastWatched(b) - lastWatched(a) || recentFirst(a, b));
  else list.sort(recentFirst);
  const sortOpts = [["auto", t(waiting ? "sort_soonest" : libTab === "watching" ? "sort_recent_watched" : "sort_recent_added")], ["az", t("sort_az")]];
  if (libTab !== "done") sortOpts.push(["recent", t("sort_recent_added")]);
  if (listAll.length > 10 || showFilter)
    h += filterBar("sf", showFilter, t("filter_shows"), "sortSel", sortOpts, showSort,
      waiting ? "" : `<button class="icon-btn" data-viewtoggle="1" aria-label="${t(viewMode === "grid" ? "view_list" : "view_grid")}">${ico(viewMode === "grid" ? "list" : "grid")}</button>`);
  else h += `<div class="rowtools"><div class="grow"></div><div class="tools-end"><select id="sortSel" class="field w-auto" aria-label="${t("sort_label")}">${sortOpts.map(([v, l]) => `<option value="${v}"${showSort === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>${waiting ? "" : `<button class="icon-btn" data-viewtoggle="1" aria-label="${t(viewMode === "grid" ? "view_list" : "view_grid")}">${ico(viewMode === "grid" ? "list" : "grid")}</button>`}</div></div>`;
  if (!list.length) {
    const msg = showFilter ? t("empty_filter", { cat: t("cat_" + libTab), q: showFilter }) : t("empty_" + libTab);
    return h + `<div class="empty"><p>${esc(msg)}</p></div>`;
  }
  const shown = list.slice(0, libLimit);
  h += (viewMode === "grid" && !waiting) ? `<div class="grid">${shown.map(tileHTML).join("")}</div>` : `<div class="list">${shown.map(rowHTML).join("")}</div>`;
  if (list.length > shown.length) h += `<div class="more-row"><button class="btn" data-libmore="1">${t("show_n_more", { n: Math.min(60, list.length - shown.length) })}</button></div>`;
  return h;
}

/* ================= Movies ================= */
function filmRowHTML(m) {
  const future = m.releaseDate && daysAway(m.releaseDate) > 0;
  const when = m.releaseDate ? (future ? fmtDate(m.releaseDate) : String(m.year || m.releaseDate.slice(0, 4))) : (m.manual ? t("date_tba") : String(m.year || ""));
  let primary;
  if (!m.watched) primary = `<button class="btn soft sm ic" data-mvw="${esc(m.id)}">${ico("check", "sm")}<span class="lbl">${t("mv_mark_watched")}</span></button>`;
  else if (m.dlWant && !m.dl) primary = `<button class="btn cyan sm ic" data-mvdlgo="${esc(m.id)}">${ico("download", "sm")}<span class="lbl">${t("btn_mark_downloaded")}</span></button>`;
  else primary = `<button class="btn sm" data-mvw="${esc(m.id)}">${t("mv_unwatch")}</button>`;
  return `<div class="lrow"><button class="main" data-film="${esc(m.id)}">${thumbHTML(m.poster, m.title)}
    <span class="mid"><b class="clip">${esc(m.title)}</b><span class="sub clip">${esc(when)}${m.runtime ? " · " + t("mv_runtime", { n: m.runtime }) : ""}${m.watched && m.watchedAt ? " · " + t("mv_watched_on", { date: m.watchedAt.slice(0, 10) }) : ""}</span></span>
    ${m.dl ? `<span class="chip cyan">${t("mv_dl_done")}</span>` : ""}</button><span class="end">${primary}</span></div>`;
}
function viewMovies() {
  const wl = movies.filter((m) => !m.watched), wd = movies.filter((m) => m.watched), td = movies.filter((m) => m.watched && m.dlWant && !m.dl);
  let h = `<div class="seg" role="group" aria-label="${t("tab_movies")}">
    <button data-movtab="watchlist" aria-pressed="${movTab === "watchlist"}">${t("mv_watchlist")}<span class="n">${wl.length}</span></button>
    <button data-movtab="todl" aria-pressed="${movTab === "todl"}">${t("mv_todl")}<span class="n">${td.length}</span></button>
    <button data-movtab="watched" aria-pressed="${movTab === "watched"}">${t("mv_watched")}<span class="n">${wd.length}</span></button></div>`;
  const soon = movies.filter((m) => m.releaseDate && daysAway(m.releaseDate) > 0).sort((a, b) => a.releaseDate < b.releaseDate ? -1 : 1).slice(0, 8);
  if (movTab === "watchlist" && soon.length) {
    h += `<div class="sec"><h2>${t("mv_soon")}</h2></div><div class="rail" role="region" aria-label="${t("mv_soon")}" tabindex="0" data-sk="rail">${soon.map((m) =>
      `<div class="ncard"><button class="tile" data-film="${esc(m.id)}" aria-label="${esc(m.title)}">${posterHTML(m.poster, m.title)}</button>
       <div><h3 class="clip">${esc(m.title)}</h3><span class="chip violet">${esc(fmtDate(m.releaseDate))}</span></div></div>`).join("")}</div>`;
  }
  let list = movTab === "watchlist" ? wl : movTab === "todl" ? td : wd;
  const total = list.length;
  if (movFilter) list = list.filter((m) => q2(m.title).includes(q2(movFilter)));
  list = list.slice();
  if (movSort === "az") list.sort(byTitle);
  else if (movTab === "watched") list.sort((a, b) => ((b.watchedAt || "") < (a.watchedAt || "") ? -1 : 1));
  else list.sort(recentFirst);
  const sortOpts = [["auto", t(movTab === "watched" ? "sort_recent_watched" : "sort_recent_added")], ["az", t("sort_az")]];
  if (total > 10 || movFilter) h += filterBar("mf", movFilter, t("filter_movies"), "movSortSel", sortOpts, movSort, "");
  if (!list.length) return h + `<div class="empty"><p>${esc(t("mv_empty_" + movTab))}</p>${movTab === "watchlist" ? `<button class="btn primary" data-openadd="movie">${ico("plus", "sm")}${t("add")}</button>` : ""}</div>`;
  const shown = list.slice(0, movLimit);
  h += `<div class="list">${shown.map(filmRowHTML).join("")}</div>`;
  if (list.length > shown.length) h += `<div class="more-row"><button class="btn" data-mvmore="1">${t("show_n_more", { n: Math.min(60, list.length - shown.length) })}</button></div>`;
  return h;
}

/* ================= Discover ================= */
function viewDiscover() {
  let h = `<div class="seg" role="group" aria-label="${t("tab_discover")}">
    <button data-disctab="shows" aria-pressed="${discTab === "shows"}">${t("tab_shows")}</button>
    <button data-disctab="movies" aria-pressed="${discTab === "movies"}">${t("tab_movies")}</button></div>`;
  return h + (discTab === "movies" ? discoverMoviesHTML() : discoverShowsHTML());
}
function discoverShowsHTML() {
  if (!myPlatforms.length)
    return `<div class="empty mt-20"><h3>${t("disc_pick")}</h3><p>${t("disc_pick_body")}</p><button class="btn primary" data-opensettings="services">${t("disc_pick_btn")}</button></div>`;
  const names = myPlatforms.map((id) => (PLATFORMS.find((p) => p.id === id) || {}).label).filter(Boolean).join(", ");
  let h = `<div class="sec"><h2>${t("disc_title_shows")}</h2><button class="icon-btn" data-discrefresh="1" aria-label="${t("refresh")}" aria-busy="${discLoading}">${ico("sync")}</button></div>
    <p class="help mb-10">${t("disc_on", { list: esc(names) })} <button class="lnk" data-opensettings="services">${t("disc_change")}</button></p>`;
  if (discLoading) return h + `<div class="status">${t("disc_loading")}</div><div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
  if (discError && !discCache) return h + `<div class="status err">${t("disc_err")}</div><button class="btn" data-discrefresh="1">${t("retry")}</button>`;
  const all = (discCache && discCache.items) || [];
  const mine = all.filter((it) => !db.some((s) => s.id === it.id));
  const hidden = all.length - mine.length;
  if (!all.length) return h + `<div class="empty"><p>${t("disc_none")}</p></div>`;
  const langs = {}; for (const it of mine) if (it.lang) langs[it.lang] = (langs[it.lang] || 0) + 1;
  const langList = Object.entries(langs).sort((a, b) => b[1] - a[1]);
  if (discLang !== "all" && !langs[discLang]) discLang = "all";
  if (langList.length > 1) h += `<div class="langs" data-sk="langs" role="group" aria-label="${t("disc_lang")}"><button data-disclang="all" aria-pressed="${discLang === "all"}">${t("lang_all")}</button>${langList.map(([l, n]) =>
    `<button data-disclang="${esc(l)}" aria-pressed="${discLang === l}">${esc(langName(l))} <span class="mono faint">${n}</span></button>`).join("")}</div>`;
  const items = mine.filter((it) => discLang === "all" || it.lang === discLang);
  if (!mine.length) h += `<div class="empty"><p>${t("disc_all_in")}</p></div>`;
  for (const it of items) {
    const open = discOpen === it.id, inf = infoCache[it.id + ":" + it.season];
    let more = "";
    if (open) {
      if (!inf || inf.loading) more = `<p>${t("info_loading")}</p>`;
      else if (inf.error) more = `<p class="c-red">${t("info_error")}</p>`;
      else more = `${inf.summary ? `<p>${esc(inf.summary)}</p>` : ""}
        <p class="mono help">${esc(inf.epCount ? t("disc_ep_count", { s: it.season, n: inf.epCount }) : t("disc_ep_none", { s: it.season }))}${inf.runtime ? " · " + t("mv_runtime", { n: inf.runtime }) : ""}${inf.genres.length ? " · " + esc(inf.genres.join(", ")) : ""}</p>
        <div class="links"><a class="btn sm" href="https://www.google.com/search?q=${encodeURIComponent(it.title + " series")}" target="_blank" rel="noopener">${ico("link", "sm")}${t("m_google")}</a>
        <a class="btn sm" href="${inf.imdb ? "https://www.imdb.com/title/" + inf.imdb + "/" : "https://www.imdb.com/find/?q=" + encodeURIComponent(it.title)}" target="_blank" rel="noopener">${ico("link", "sm")}IMDb</a></div>`;
    }
    h += `<div class="dcard"><div class="top"><button class="open" data-discopen="${it.id}" aria-expanded="${open}">${thumbHTML(it.poster, it.title)}
      <span class="mid"><b>${esc(it.title)}</b><span class="code c-violet">S${it.season} · ${esc(fmtDate(it.date))}${it.ts ? " · " + esc(fmtTime(it.ts)) : ""}</span>
      <span class="chips"><span class="chip">${esc(it.platform)}</span>${it.lang ? `<span class="chip">${esc(langName(it.lang))}</span>` : ""}</span></span></button>
      <button class="btn soft sm go" data-discadd="${it.id}">${t("add_btn")}</button></div>${open ? `<div class="more">${more}</div>` : ""}</div>`;
  }
  if (hidden) h += `<p class="help mt-12">${t("disc_hidden", { n: hidden })}</p>`;
  return h + `<p class="help mt-8">${t("disc_note", { ago: agoLabel(discCache.ts) })}</p>`;
}
function discoverMoviesHTML() {
  let h = `<div class="sec"><h2>${t("disc_title_movies")}</h2><button class="icon-btn" data-mdiscrefresh="1" aria-label="${t("refresh")}" aria-busy="${mdiscLoading}">${ico("sync")}</button></div>`;
  if (mdiscLoading) h += `<div class="status">${t("mdisc_loading")}</div><div class="skel"></div><div class="skel"></div>`;
  if (mdiscError && !mdiscLoading) h += `<div class="status err">${t("mdisc_err", { msg: esc(mdiscError) })}</div><button class="btn" data-mdiscrefresh="1">${t("retry")}</button>`;
  const all = (mdiscCache && mdiscCache.items) || [];
  const items = all.filter((it) => !movies.some((m) => m.id === "mv-" + it.qid || (m.title || "").toLowerCase() === it.title.toLowerCase()));
  if (!all.length && !mdiscLoading && !mdiscError) return h + `<div class="empty"><p>${t("mdisc_empty")}</p></div>`;
  if (all.length && !items.length) h += `<div class="empty"><p>${t("mdisc_all_in")}</p></div>`;
  for (const it of items) {
    h += `<div class="dcard"><div class="top"><div class="open">${thumbHTML(it.poster, it.title)}
      <span class="mid"><b>${esc(it.title)}</b><span class="code c-violet">${esc(fmtDate(it.date))}</span>
      <a class="btn sm ghost flush" href="https://www.google.com/search?q=${encodeURIComponent(it.title + " release date where to watch")}" target="_blank" rel="noopener">${ico("link", "sm")}${t("mdisc_where")}</a></span></div>
      <button class="btn soft sm go" data-mdiscadd="${esc(it.qid)}">${t("add_btn")}</button></div></div>`;
  }
  return h + (mdiscCache ? `<p class="help mt-12">${t("mdisc_note", { ago: agoLabel(mdiscCache.ts) })}</p>` : "");
}

/* ================= the show sheet ================= */
function curSeason(sh) {
  if (selSeason[sh.id] != null && sh.seasons.some((s) => s.season === selSeason[sh.id])) return selSeason[sh.id];
  const open = sh.seasons.find((se) => se.eps.some((ep) => aired(sh, ep) && !sh.watched[epK(se.season, ep.e)]));
  return (open || sh.seasons[sh.seasons.length - 1] || { season: 1 }).season;
}
function sheetShow(sh) {
  const up = isUp(sh), a = airedTotal(sh), w = wCount(sh), cat = catOf(sh), st = statusOf(sh);
  const inf = sh.manual ? null : infoCache[sh.id + ":"];
  const next = nextUnwatched(sh), done = a > 0 && w >= a, pr = dlPrompt && dlPrompt.id === sh.id ? dlPrompt : null;
  const pct = a ? Math.round(w / a * 100) : 0;
  const chips = [];
  if (sh.year) chips.push(`<span class="chip">${sh.year}</span>`);
  if (inf && inf.language) chips.push(`<span class="chip">${esc(langName(inf.language))}</span>`);
  if (inf && inf.country) chips.push(`<span class="chip">${esc(inf.country)}</span>`);
  if (sh.runtime) chips.push(`<span class="chip">${t("mv_runtime", { n: sh.runtime })}</span>`);
  for (const p of sh.watchOn || []) chips.push(`<span class="chip">${esc(p)}</span>`);
  const bg = imgSrc(sh.poster);
  let h = `<div class="phead"><button class="icon-btn" data-closesheet="1" aria-label="${t("back")}">${ico("back")}</button><div class="grow"></div>
    ${sh.manual ? "" : `<button class="icon-btn" data-sync="${sh.id}" aria-label="${t("refresh")}" aria-busy="${syncing}">${ico("sync")}</button>`}</div>
    <div class="hero">${bg ? `<div class="hero-bg" style="background-image:url('${bg}')"></div>` : ""}
    <div class="hero-in">${posterHTML(sh.poster, sh.title)}<div class="hero-text"><h1 id="sheetTitle">${esc(sh.title)}</h1>
    <div class="meta"><span class="chip">${dotHTML(st.color)}${t(st.key)}</span>${chips.join("")}</div></div></div></div><div class="pbody">`;
  if (up) {
    const si = soonInfo(sh), d = (si && si.dateStr) || sh.firstAir;
    h += `<div class="upcoming"><b>${esc(t("upcoming_title", { when: d ? fmtDate(d) + (si && si.ts ? " · " + fmtTime(si.ts) : "") : t("tba") }))}</b><p>${t("upcoming_body")}</p></div>`;
  } else {
    h += `<div class="prog"><div class="line"><span><b>${fmtNum(w)}</b> ${t("d_of_watched", { a })}</span>${next ? `<span class="code">${t("d_next", { code: codeOf(next.s, next.e) })}</span>` : ""}</div>
      <div class="bar" role="img" aria-label="${esc(t("d_progress_aria", { w, a }))}"><i style="width:${pct}%"></i></div></div>
      ${sh.nextEp && sh.nextEp.date ? `<p class="help mt-8">${esc(t("d_next_airs", { code: codeOf(sh.nextEp.s, sh.nextEp.e), when: fmtDate(sh.nextEp.date) + (sh.nextEp.ts ? " · " + fmtTime(sh.nextEp.ts) : "") }))}</p>` : ""}
      <div class="actions">${pr ? `<button class="btn cyan" data-dlnext="${sh.id}:${pr.s}:${pr.e}">${ico("download", "sm")}${t("btn_mark_downloaded")}</button>`
        : next ? `<button class="btn primary" data-next="${sh.id}">${ico("check", "sm")}${t("btn_mark_ep", { code: codeOf(next.s, next.e) })}</button>`
        : `<button class="btn" disabled>${done ? t("d_all_caught") : t("d_nothing_aired")}</button>`}</div>`;
  }
  if (inf && !inf.loading && !inf.error) {
    if (inf.summary) h += `<p class="about${aboutOpen[sh.id] ? "" : " clamp"}">${esc(inf.summary)}</p>${inf.summary.length > 180 ? `<button class="about-more" data-aboutmore="${sh.id}">${t(aboutOpen[sh.id] ? "less" : "d_about_more")}</button>` : ""}`;
    const g = inf.genres.map((x) => `<span class="chip">${esc(x)}</span>`).join("") + (inf.rating ? `<span class="chip tint">${t("info_rating", { n: inf.rating })}</span>` : "");
    if (g) h += `<div class="chips mt-12">${g}</div>`;
  } else if (inf && inf.loading) h += `<p class="help mt-14">${t("info_loading")}</p>`;
  if (!up) {
    const cs = curSeason(sh), seas = sh.seasons.find((x) => x.season === cs) || sh.seasons[0];
    if (seas) {
      h += `<div class="seasons" data-sk="seasons" role="group" aria-label="${t("d_seasons")}">${sh.seasons.map((se) => {
        const ai = se.eps.filter((ep) => aired(sh, ep)).length, on = se.eps.filter((ep) => sh.watched[epK(se.season, ep.e)]).length;
        return `<button class="schip" data-seas="${sh.id}:${se.season}" aria-pressed="${se.season === cs}"><b>${t("d_season", { n: se.season })}</b><span>${ai ? on + "/" + ai : t("d_not_aired")}</span></button>`;
      }).join("")}</div>`;
      const ai = seas.eps.filter((ep) => aired(sh, ep)).length, modeDl = dlOn(sh) && markMode[sh.id] === "dl";
      const allOn = modeDl ? seas.eps.some((ep) => sh.watched[epK(cs, ep.e)]) && seas.eps.every((ep) => !sh.watched[epK(cs, ep.e)] || (sh.dl && sh.dl[epK(cs, ep.e)]))
                           : ai > 0 && seas.eps.every((ep) => !aired(sh, ep) || sh.watched[epK(cs, ep.e)]);
      h += `<div class="seasonbar"><h2>${t("d_season", { n: cs })}</h2>
        <button class="btn sm" data-season="${sh.id}:${cs}:${allOn ? 0 : 1}" ${ai ? "" : "disabled"}>${t(modeDl ? (allOn ? "d_clear_dl" : "d_mark_dl") : (allOn ? "d_clear_season" : "d_mark_season"))}</button></div>`;
      if (dlOn(sh)) h += `<div class="seg mb-8" role="group" aria-label="${t("mode_label")}"><button data-mm="${sh.id}:watch" aria-pressed="${!modeDl}">${t("mode_watched")}</button><button data-mm="${sh.id}:dl" aria-pressed="${modeDl}">${t("mode_dl")}</button></div>`;
      h += `<div class="eps">${seas.eps.map((ep) => {
        const k = epK(cs, ep.e), ok = aired(sh, ep), on = !!sh.watched[k], dl = !!(sh.dl && sh.dl[k]) && dlOn(sh);
        const pressed = modeDl ? dl : on, d = epDate(ep);
        const name = ep.name || t("ep_n", { n: ep.e });
        const meta = ok ? (d ? `<span>${esc(fmtDate(d))}</span>` : "") + (modeDl ? "" : (dl ? `<span class="chip cyan">${t("ep_downloaded")}</span>` : ""))
                        : `<span>${esc(t("ep_airs", { date: (d ? fmtDate(d) : t("tba")) + (ep.ts ? " · " + fmtTime(ep.ts) : "") }))}</span>`;
        return `<button class="ep${modeDl ? (dl ? " dl" : "") : (on ? " on" : "")}" data-ep="${sh.id}:${cs}:${ep.e}" aria-pressed="${pressed}" ${ok ? "" : "disabled"}
          aria-label="${esc(ok ? t("ep_aria", { n: ep.e, name }) : t("ep_aria_locked", { n: ep.e, name }))}">
          <span class="num">${ep.e}</span><span><span class="tt clip">${esc(name)}</span><span class="mt">${meta}</span></span>
          <span class="box">${ico(ok ? "check" : "lock", "sm")}</span></button>`;
      }).join("")}</div>`;
    }
  }
  /* management lives behind one tap, so the screen above stays about watching */
  const gq = encodeURIComponent(sh.title + " next episode");
  const imdbUrl = sh.imdb ? "https://www.imdb.com/title/" + sh.imdb + "/" : "https://www.imdb.com/find/?q=" + encodeURIComponent(sh.title);
  h += `<div class="manage"><button class="head" data-manage="1" aria-expanded="${manageOpen}">${t("manage")}${ico(manageOpen ? "up" : "down", "sm")}</button>`;
  if (manageOpen) {
    h += `<div class="items">
      <button data-dltrack="${sh.id}"><span>${t("m_dl_reminders")}</span><span class="sub">${t(dlOn(sh) ? "m_on" : "m_off")}</span></button>
      ${!up && !done ? `<button data-catchup="${sh.id}">${t("m_caught")}</button>` : ""}
      ${!up && !sh.manual ? `<button data-unlock="${sh.id}"><span>${t(sh.unlockAll ? "m_relock" : "m_unlock")}</span></button>` : ""}
      ${sh.manual ? `<button data-manadd="${sh.id}">${t("m_add_eps")}</button>` : ""}
      ${dropped(sh) ? `<button data-bucket="${sh.id}:resume">${t("m_resume")}</button>` : `${cat === "waiting" ? `<button data-bucket="${sh.id}:done">${t("m_to_done")}</button>` : cat === "done" ? `<button data-bucket="${sh.id}:active">${t("m_to_active")}</button>` : ""}<button data-bucket="${sh.id}:dropped">${t("m_drop")}</button>`}
      <a href="https://www.google.com/search?q=${gq}" target="_blank" rel="noopener"><span>${t("m_google")}</span>${ico("link", "sm")}</a>
      <a href="${imdbUrl}" target="_blank" rel="noopener"><span>${t("m_imdb")}</span>${ico("link", "sm")}</a>
      ${confirmDel === sh.id ? `<div class="confirm"><span class="danger">${esc(t("m_remove_q", { title: sh.title }))}</span><button class="btn danger sm" data-delyes="${sh.id}">${t("yes_remove")}</button><button class="btn sm" data-delno="1">${t("keep_it")}</button></div>`
        : `<button class="danger" data-del="${sh.id}">${t("m_remove")}</button>`}</div>`;
  }
  h += `</div><p class="help mt-16 center">${sh.syncFail ? esc(failWhy(sh.syncFail)) : t("d_synced", { ago: agoLabel(sh.lastSynced) })}</p></div>`;
  return h;
}

/* ================= the film sheet ================= */
function sheetMovie(m) {
  const future = m.releaseDate && daysAway(m.releaseDate) > 0, bg = imgSrc(m.poster);
  const chips = [];
  if (m.releaseDate) chips.push(`<span class="chip ${future ? "violet" : ""}">${esc(future ? fmtDate(m.releaseDate) : (m.year || m.releaseDate.slice(0, 4)))}</span>`);
  if (m.runtime) chips.push(`<span class="chip">${t("mv_runtime", { n: m.runtime })}</span>`);
  if (m.manual) chips.push(`<span class="chip">${t("st_manual")}</span>`);
  if (m.watched) chips.push(`<span class="chip tint">${t("mv_watched")}</span>`);
  if (m.dl) chips.push(`<span class="chip cyan">${t("mv_dl_done")}</span>`);
  let primary;
  if (!m.watched) primary = `<button class="btn primary" data-mvw="${esc(m.id)}">${ico("check", "sm")}${t("mv_mark_watched")}</button>`;
  else if (m.dlWant && !m.dl) primary = `<button class="btn cyan" data-mvdlgo="${esc(m.id)}">${ico("download", "sm")}${t("btn_mark_downloaded")}</button>`;
  else primary = `<button class="btn" data-mvw="${esc(m.id)}">${t("mv_unwatch")}</button>`;
  return `<div class="phead"><button class="icon-btn" data-closesheet="1" aria-label="${t("back")}">${ico("back")}</button></div>
    <div class="hero">${bg ? `<div class="hero-bg" style="background-image:url('${bg}')"></div>` : ""}<div class="hero-in">${posterHTML(m.poster, m.title)}
    <div class="hero-text"><h1 id="sheetTitle">${esc(m.title)}</h1><div class="meta">${chips.join("")}</div></div></div></div>
    <div class="pbody"><div class="actions">${primary}${m.watched && m.dlWant && !m.dl ? `<button class="btn" data-mvw="${esc(m.id)}">${t("mv_unwatch")}</button>` : ""}</div>
    ${m.watched && m.watchedAt ? `<p class="help mt-10">${t("mv_watched_on", { date: m.watchedAt.slice(0, 10) })}</p>` : ""}
    <div class="group"><h3>${t("mv_details")}</h3><div class="card"><div class="kv">
      <div class="r"><label for="mvd">${t("mv_release")}</label><div class="inline"><input type="date" id="mvd" class="field" value="${esc(m.releaseDate || "")}"><button class="btn sm" data-mvdate="${esc(m.id)}">${t("save")}</button></div></div>
      ${m.manual ? `<div class="r"><label for="mvt">${t("mv_title")}</label><div class="inline"><input id="mvt" class="field w-title" value="${esc(m.title)}"><button class="btn sm" data-mvtitle="${esc(m.id)}">${t("save")}</button></div></div>` : ""}
      </div><div class="btns">${isWdMovie(m.id) ? `<button class="btn sm" data-mvref="${esc(m.id)}">${ico("sync", "sm")}${t("mv_refresh")}</button>` : ""}
      ${m.dlWant ? `<button class="btn sm" data-mvskip="${esc(m.id)}">${t("mv_skip_dl")}</button>` : ""}
      <a class="btn sm" href="https://www.google.com/search?q=${encodeURIComponent(m.title + " where to watch")}" target="_blank" rel="noopener">${ico("link", "sm")}${t("mdisc_where")}</a></div></div></div>
    <div class="group">${movConfirmDel === m.id ? `<div class="card"><p>${esc(t("m_remove_q", { title: m.title }))}</p><div class="btns"><button class="btn danger" data-mvdelyes="${esc(m.id)}">${t("yes_remove")}</button><button class="btn" data-mvdelno="1">${t("keep_it")}</button></div></div>`
      : `<button class="btn danger block" data-mvdel="${esc(m.id)}">${t("mv_remove")}</button>`}</div></div>`;
}

/* ================= the add sheet ================= */
function sheetAdd() {
  const show = addType === "show";
  let h = `<div class="phead"><button class="icon-btn" data-closesheet="1" aria-label="${t("close")}">${ico("close")}</button><h2 id="sheetTitle">${t("add_title")}</h2></div><div class="pbody">
    <div class="add-top"><div class="seg" role="group" aria-label="${t("add_title")}"><button data-addtype="show" aria-pressed="${show}">${t("tab_shows")}</button><button data-addtype="movie" aria-pressed="${!show}">${t("tab_movies")}</button></div>
    <form id="addForm" class="add-form" role="search"><div class="search">${ico("search", "sm")}<input id="aq" class="field" type="search" enterkeyhint="search" autocomplete="off" value="${esc(addQ)}" placeholder="${esc(t(show ? "add_ph_show" : "add_ph_movie"))}" aria-label="${esc(t(show ? "add_ph_show" : "add_ph_movie"))}"></div>
    <button class="btn primary" type="submit" ${addRes.state === "busy" ? "disabled" : ""}>${t("add_search")}</button></form></div><div aria-live="polite">`;
  if (addRes.state === "idle") h += `<p class="status">${t(show ? "add_hint_show" : "add_hint_movie")}</p>`;
  else if (addRes.state === "busy") h += `<p class="status">${t("add_searching")}</p><div class="skel"></div><div class="skel"></div><div class="skel"></div>`;
  else if (addRes.state === "offline") h += `<p class="status err">${t("add_offline")}</p>`;
  else if (addRes.state === "err") h += `<p class="status err">${t("add_err")}</p>`;
  else if (!addRes.items.length) h += `<p class="status">${esc(t("add_none", { q: addRes.q }))}</p>`;
  if (addRes.state === "ok") {
    h += addRes.items.map((r) => {
      if (show) {
        const inLib = db.some((s) => s.id === r.id);
        const meta = [r.lang ? langName(r.lang) : "", r.where, r.country].filter(Boolean).join(" · ");
        return `<button class="rcard" ${inLib ? `data-show="${r.id}"` : `data-addshow="${r.id}"`}>${thumbHTML(r.poster, r.name)}
          <span class="mid"><b>${esc(r.name)} <span class="faint fw-400">${r.year || t("tba")}</span></b>${meta ? `<span class="sub" style="-webkit-line-clamp:1">${esc(meta)}</span>` : ""}${r.summary ? `<span class="sub">${esc(r.summary)}</span>` : ""}</span>
          ${inLib ? `<span class="chip">${t("add_in_lib")}</span>` : `<span class="btn soft sm" aria-hidden="true">${t("add_btn")}</span>`}</button>`;
      }
      const inLib = movies.some((m) => m.id === "mv-" + r.id);
      return `<button class="rcard" ${inLib ? `data-film="mv-${esc(r.id)}"` : `data-addmovie="${esc(r.id)}"`} ><span class="mid"><b>${esc(r.label)}</b><span class="sub">${esc(r.description || "")}</span></span>
        ${inLib ? `<span class="chip">${t("add_in_lib")}</span>` : `<span class="btn soft sm" aria-hidden="true">${t("add_btn")}</span>`}</button>`;
    }).join("");
  }
  h += `</div>`;
  if (addRes.state === "ok" || addRes.state === "err") h += `<div class="mt-14"><button class="btn ghost block" data-${show ? "manualshow" : "manualmovie"}="1">${t(show ? "add_manual_show" : "add_manual_movie")}</button></div>`;
  return h + `</div>`;
}

/* ================= the settings sheet ================= */
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
  return `<div class="phead"><button class="icon-btn" data-closesheet="1" aria-label="${t("close")}">${ico("close")}</button><h2 id="sheetTitle">${t("set_title")}</h2></div><div class="pbody">
    <div class="group"><h3><label for="langSel">${t("set_lang")}</label></h3><select id="langSel" class="field">${SUPPORTED_LANGS.map((l) => `<option value="${l}"${LANG === l ? " selected" : ""}>${LANG_NAMES[l]}</option>`).join("")}</select></div>
    <div class="group" id="services"><h3>${t("set_services")}</h3><div class="card"><p>${t("set_services_help")}</p><div class="chips">${visible.map((p) =>
      `<button class="btn sm" data-svc="${p.id}" aria-pressed="${myPlatforms.includes(p.id)}">${esc(p.label)}</button>`).join("")}</div>
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
    <div class="group"><h3>${t("set_about")}</h3><div class="card"><p><b class="c-text">${t("set_version", { v: APP_VERSION })}</b></p><p>${t("set_credit")}</p></div></div></div>`;
}

/* ================= banner and the sync button ================= */
function bannerHTML() {
  if (storageFull) return `<div class="banner warn" role="alert">${ico("alert")}<span class="txt">${t("b_storage_full")}</span><button class="btn sm" data-bannerexport="1">${t("b_export")}</button></div>`;
  if (syncing && syncProgress) return `<div class="banner" role="status">${ico("sync")}<span class="txt">${esc(t("b_syncing", { i: syncProgress.i, n: syncProgress.n, title: syncProgress.title }))}</span></div>`;
  const stale = staleShows().length;
  if (stale) return `<div class="banner">${ico("alert")}<span class="txt">${t("b_stale", { n: stale })}</span><button class="btn sm" data-syncall="1">${t("b_refresh")}</button></div>`;
  const stk = db.filter((s) => !dropped(s) && stuck(s));
  if (stk.length) {
    return `<div class="banner">${ico("alert")}<span class="txt">${t("b_stuck", { n: stk.length })}</span><button class="btn sm ghost" data-stucktoggle="1" aria-expanded="${stuckOpen}">${t(stuckOpen ? "b_stuck_hide" : "b_stuck_see")}</button></div>`
      + (stuckOpen ? `<div class="stucklist">${stk.map((s) => `<div><span class="clip">${esc(s.title)}</span><small>${esc(failWhy(s.syncFail))}</small></div>`).join("")}<p>${t("b_stuck_note")}</p></div>` : "");
  }
  const nag = db.length > 0 && !ghToken && Date.now() - (+store("signal.lastexport") || 0) > 30 * 864e5 && Date.now() > (+store("signal.nagsnooze") || 0);
  if (nag) return `<div class="banner">${ico("alert")}<span class="txt">${t("b_nag")}</span><button class="btn sm soft" data-bannerexport="1">${t("b_export")}</button><button class="btn sm ghost" data-nagsnooze="1">${t("b_later")}</button></div>`;
  return "";
}
function paintStatus() {
  const b = $("banner"); if (!b) return;
  const html = bannerHTML();
  if (b.innerHTML !== html) b.innerHTML = html;
  const s = $("syncBtn");
  if (s) {
    const busy = syncing || cloudBusy || !!pushTimer;
    s.setAttribute("aria-busy", String(busy));
    s.title = s.getAttribute("aria-label") + (ghToken ? " · " + (busy ? "…" : t("set_connected", { ago: agoLabel(lastCloud) })) : "");
  }
}

/* ================= putting it all on screen ================= */
/* The text that is typed into index.html itself, not drawn by a function. */
function applyStatic() {
  document.documentElement.lang = LANG;
  document.title = t("app_title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { const v = t(el.dataset.i18nAria); el.setAttribute("aria-label", v); if (el.matches(".icon-btn")) el.title = v; });
  paintChrome();
}
/* The icons in the top bar and the tab bar are drawn here, not typed in HTML,
   so they use the same icon set as everything else. */
function paintChrome() {
  document.querySelectorAll("[data-ico]").forEach((el) => { el.innerHTML = ico(el.dataset.ico); });
  document.querySelectorAll("[data-mark]").forEach((el) => { el.innerHTML = markSvg(); });
  $("tabbar").innerHTML = TABS.map((k) => `<button class="tab" data-tab="${k}">${ico(k)}<span>${t("tab_" + k)}</span>${k === "today" ? `<span class="badge-n" id="todayBadge" hidden></span>` : ""}</button>`).join("");
}
/* Remember where you were before the view is thrown away and rebuilt, so
   marking an episode never bounces you up the page or loses your cursor. */
function captureKeep() {
  const ae = document.activeElement;
  const fk = ae && ae !== document.body ? focusKeyOf(ae) : null;
  const sel = ae && typeof ae.selectionStart === "number" ? ae.selectionStart : null;
  const panel = document.querySelector(".panel");
  const rails = {}; document.querySelectorAll("[data-sk]").forEach((el) => { rails[el.dataset.sk] = el.scrollLeft; });
  return { y: window.scrollY, py: panel ? panel.scrollTop : 0, rails, fk, sel };
}
function restoreKeep(k) {
  document.querySelectorAll("[data-sk]").forEach((el) => { if (k.rails[el.dataset.sk] != null) el.scrollLeft = k.rails[el.dataset.sk]; });
  const panel = document.querySelector(".panel"); if (panel) panel.scrollTop = k.py;
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
  $("view").innerHTML = tab === "shows" ? viewShows() : tab === "movies" ? viewMovies() : tab === "discover" ? viewDiscover() : viewToday();
  document.querySelectorAll(".tab").forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const badge = $("todayBadge"); if (badge) { const n = libraryStats(db).today; badge.textContent = n > 9 ? "9+" : String(n); badge.hidden = !n; }
  paintSheet();
  paintStatus();
  restoreKeep(keep);
}
function paintSheet() {
  const el = $("sheet");
  const open = !!sheet;
  $("app").inert = open || modalOpen; $("tabbar").inert = open || modalOpen;
  document.body.style.overflow = open || modalOpen ? "hidden" : "";
  if (!open) { if (el.innerHTML) el.innerHTML = ""; return; }
  let body = "";
  if (sheet.type === "show") { const sh = db.find((s) => s.id === sheet.id); if (!sh) { dropSheet(); return; } body = sheetShow(sh); }
  else if (sheet.type === "movie") { const m = movieById(sheet.id); if (!m) { dropSheet(); return; } body = sheetMovie(m); }
  else if (sheet.type === "add") body = sheetAdd();
  else body = sheetSettings();
  const had = el.querySelector(".panel");
  el.innerHTML = `<div class="scrim" data-closesheet="1"></div><div class="panel" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">${body}</div>`;
  if (had) { const p = el.querySelector(".panel"); p.style.animation = "none"; el.querySelector(".scrim").style.animation = "none"; }
}
