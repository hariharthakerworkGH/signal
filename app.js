/* app.js - taps, sheets, dialogs, and starting up.
 *
 * One click listener for the whole page. Every button carries a data-<name>
 * attribute and ACTIONS below has a handler under that name; a new button needs
 * nothing else. Sheets and dialogs are "layers": opening one adds a browser
 * history step, so the phone's Back button closes it instead of leaving Signal.
 */

/* ================= layers and the back button ================= */
let layers = 0, skipPops = 0, openerKey = null, modalCtl = null;
const pushLayer = () => history.pushState({ sig: ++layers }, "");
function popLayerSilently() { if (layers > 0) { layers--; skipPops++; history.back(); } }
function restoreOpener() {
  const el = openerKey && focusByKey(openerKey);
  if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  openerKey = null;
}
function openSheet(s) {
  const had = !!sheet;
  if (!had && !modalOpen) openerKey = document.activeElement && document.activeElement !== document.body ? focusKeyOf(document.activeElement) : null;
  sheet = s;
  if (!had) pushLayer();
  render();
  const p = document.querySelector(".panel"); if (p) p.focus({ preventScroll: true });
}
/* A sheet that no longer has anything to show (its show was removed). */
function dropSheet() { if (sheet) { sheet = null; confirmDel = null; movConfirmDel = null; popLayerSilently(); render(); } }
function closeTop() {
  if (modalOpen) { hideModal(); return; }
  if (sheet) { sheet = null; confirmDel = null; movConfirmDel = null; render(); restoreOpener(); }
}
const requestClose = () => { if (layers > 0) history.back(); else closeTop(); };
window.addEventListener("popstate", () => {
  if (skipPops > 0) { skipPops--; return; }
  if (layers > 0) { layers--; closeTop(); }
});

function openModal(html, ctl) {
  if (!modalOpen) { pushLayer(); openerKey = openerKey || (document.activeElement ? focusKeyOf(document.activeElement) : null); }
  modalOpen = true; modalCtl = ctl || null;
  setModal(html);
  $("app").inert = true; $("tabbar").inert = true; $("sheet").inert = true; document.body.style.overflow = "hidden";
  const first = $("modal").querySelector("input:not([type=checkbox]),button.primary,button"); if (first) first.focus({ preventScroll: true });
}
function setModal(html) {
  const m = $("modal"); m.hidden = false;
  m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlgTitle">${html}</div>`;
}
function hideModal() {
  modalOpen = false; modalCtl = null;
  $("modal").hidden = true; $("modal").innerHTML = ""; $("sheet").inert = false;
  paintSheet(); restoreOpener();
}
/* Leaves a dialog without a history step left over (for "Create", "Done"). */
function dismissModal() { if (!modalOpen) return; hideModal(); popLayerSilently(); }

/* ================= toast ================= */
let toastTimer = null;
function toast(text, o) {
  if (typeof o === "number") o = { ms: o };
  o = o || {};
  const el = $("toast"); clearTimeout(toastTimer);
  el.innerHTML = `<div class="t"><span>${esc(text)}</span>${o.undo ? `<button class="btn sm primary" data-undo="1">${t("undo")}</button>` : ""}${o.dlScope ? `<button class="btn sm cy" data-dlbulk="${o.dlScope}:${o.dlId}">${t("btn_mark_downloaded")}</button>` : ""}</div>`;
  toastTimer = setTimeout(() => { el.innerHTML = ""; if (o.undo) undoState = null; }, o.ms || (o.undo ? 8000 : 2800));
}
const clearToast = () => { clearTimeout(toastTimer); $("toast").innerHTML = ""; };

/* ================= opening things ================= */
function setTab(name) {
  tab = name; store("signal.tab", name); window.scrollTo(0, 0); render();
  if (name === "discover") (discTab === "movies" ? fetchMovieDiscover(false) : fetchDiscover(false));
  if (name === "movies") ensureMoviePosters();
}
function openShow(id) {
  const sh = db.find((s) => s.id === id); if (!sh) return;
  manageOpen = false; confirmDel = null; delete selSeason[id];
  openSheet({ type: "show", id });
  if (!sh.manual) loadInfo(id);
}
function openFilm(id) { movConfirmDel = null; openSheet({ type: "movie", id }); ensureMoviePosters(); }
async function openSettings(where) {
  openSheet({ type: "settings" });
  storageInfo = await storageLine(); if (sheet && sheet.type === "settings") render();
  if (where === "services") setTimeout(() => { const s = $("services"); if (s) s.scrollIntoView({ block: "start" }); }, 30);
}

/* ================= searching and adding ================= */
async function runAddSearch() {
  const q = (($("aq") || {}).value || addQ).trim(); addQ = q; if (!q) return;
  if (!navigator.onLine) { addRes = { state: "offline", items: [], q }; render(); return; }
  addRes = { state: "busy", items: [], q }; render();
  try {
    if (addType === "show") {
      const r = await maze("/search/shows?q=" + encodeURIComponent(q));
      const items = (r || []).slice(0, 8).map((x) => x.show).map((h) => ({
        id: h.id, name: h.name, year: h.premiered ? h.premiered.slice(0, 4) : null, poster: h.image && h.image.medium,
        summary: plain(h.summary).slice(0, 120), lang: h.language,
        where: (h.webChannel && h.webChannel.name) || (h.network && h.network.name) || "",
        country: (h.network && h.network.country && h.network.country.name) || (h.webChannel && h.webChannel.country && h.webChannel.country.name) || "" }));
      addRes = { state: "ok", items, q };
    } else addRes = { state: "ok", items: await wdSearch(q), q };
  } catch (e) { addRes = { state: "err", items: [], q }; }
  render();
}
async function addShowFlow(id) {
  toast(t("add_fetching"), 6000);
  try {
    const r = await addShowById(id);
    if (r.dup) { toast(t("add_dup")); openShow(id); return; }
    libTab = catOf(r.show);
    openShow(id);
    toast(t("toast_added_show", { title: r.show.title, n: totalEps(r.show) }));
  } catch (e) { toast(e.message === "DAILY" ? t("err_daily") : t("err_add_failed")); render(); }
}
async function addMovieFlow(qid) {
  const hit = addRes.items.find((x) => x.id === qid); if (!hit) return;
  if (movies.some((m) => m.id === "mv-" + hit.id)) { toast(t("toast_dup_movie")); return; }
  try {
    const det = await wdDetails(hit.id); const m = addMovieFromWd(hit, det);
    openFilm(m.id); toast(t("toast_added_movie", { title: m.title }));
  } catch (e) { toast(t("err_details")); render(); }
}

/* ================= dialogs ================= */
function numField(id, v, max) { return `<input id="${id}" class="field" type="number" inputmode="numeric" min="1" max="${max}" value="${v}">`; }
const clampN = (el, max, dflt) => Math.max(1, Math.min(max, +(el && el.value) || dflt || 1));
function manualShowModal() {
  let seasons = [8], title = "", plat = "";
  const read = () => {
    if ($("manTitle")) { title = $("manTitle").value; plat = $("manPlat").value; }
    seasons = seasons.map((c, i) => clampN($("ms" + i), 150, c));
  };
  const draw = () => setModal(`<h2 id="dlgTitle">${t("ms_title")}</h2><p class="help">${t("ms_help")}</p>
    <input id="manTitle" class="field" value="${esc(title)}" placeholder="${esc(t("ms_title_ph"))}" aria-label="${esc(t("ms_title_ph"))}">
    <input id="manPlat" class="field" value="${esc(plat)}" placeholder="${esc(t("ms_plat_ph"))}" aria-label="${esc(t("ms_plat_ph"))}">
    ${seasons.map((c, i) => `<div class="row"><label for="ms${i}">${t("d_season", { n: i + 1 })}</label>${numField("ms" + i, c, 150)}<span class="muted">${t("ms_eps")}</span></div>`).join("")}
    <button class="btn ghost self-start" data-mact="addseason">${ico("plus", "sm")}${t("ms_add_season")}</button>
    <div class="btns"><button class="btn ghost" data-mact="close">${t("cancel")}</button><button class="btn primary" data-mact="create">${t("ms_create")}</button></div>`);
  openModal("", { onAction(v) {
    if (v === "close") return requestClose();
    read();
    if (v === "addseason") { seasons.push(8); draw(); const f = $("ms" + (seasons.length - 1)); if (f) f.focus(); return; }
    if (v === "create") {
      if (!title.trim()) { toast(t("err_title_required")); return; }
      const sh = createManualShow(title.trim(), plat.trim(), seasons);
      dismissModal(); libTab = catOf(sh); openShow(sh.id); toast(t("toast_added_manual", { title: sh.title }));
    }
  } });
  draw(); const f = $("manTitle"); if (f) f.focus();
}
function manualMovieModal() {
  openModal(`<h2 id="dlgTitle">${t("mm_title")}</h2><p class="help">${t("mm_help")}</p>
    <input id="mmTitle" class="field" placeholder="${esc(t("mm_title_ph"))}" aria-label="${esc(t("mm_title_ph"))}">
    <div class="row"><label class="w-auto" for="mmDate">${t("mm_date")}</label><input id="mmDate" class="field w-auto" type="date"></div>
    <div class="btns"><button class="btn ghost" data-mact="close">${t("cancel")}</button><button class="btn primary" data-mact="create">${t("mm_create")}</button></div>`, { onAction(v) {
    if (v === "close") return requestClose();
    const title = $("mmTitle").value.trim();
    if (!title) { toast(t("err_title_required")); return; }
    const m = createManualMovie(title, $("mmDate").value || null);
    if (!m) { toast(t("toast_dup_movie")); return; }
    dismissModal(); openFilm(m.id); toast(t("toast_added_movie", { title }));
  } });
}
function addEpisodesModal(id) {
  const sh = db.find((x) => x.id === id); if (!sh) return;
  const last = sh.seasons.length ? sh.seasons[sh.seasons.length - 1].season : 0;
  openModal(`<h2 id="dlgTitle">${esc(t("ae_title", { title: sh.title }))}</h2>
    <div class="row"><label for="aeS">${t("ae_season")}</label>${numField("aeS", Math.max(1, last), 99)}</div>
    <div class="row"><label for="aeN">${t("ae_count")}</label>${numField("aeN", 1, 150)}</div>
    <div class="btns"><button class="btn ghost" data-mact="close">${t("cancel")}</button><button class="btn primary" data-mact="go">${t("ae_add")}</button></div>`, { onAction(v) {
    if (v === "close") return requestClose();
    const sn = clampN($("aeS"), 99), cnt = clampN($("aeN"), 150);
    const capped = addManualEpisodes(sh, sn, cnt);
    dismissModal(); render();
    toast(capped ? t("toast_capped") : t("toast_eps_added", { n: cnt, s: sn }));
  } });
}

/* ---- TV Time ---- */
function ttPickerModal(items) {
  const sinceYears = (y) => new Date(Date.now() - y * 365.25 * 864e5).toISOString().slice(0, 10);
  const pick = (cut) => items.forEach((x) => { x.sel = x.last >= cut; });
  pick(sinceYears(2));
  const est = (n) => Math.max(1, Math.ceil(n * 2 * 0.7 / 60));
  const goLabel = () => { const n = items.filter((x) => x.sel).length; return { n, label: t("tt_go", { n }) + " (" + t("tt_est", { m: est(n) }) + ")", warn: n > 150 ? t("tt_warn", { n, m: est(n) }) : "" }; };
  const rows = () => items.map((it, i) => `<label><input type="checkbox" data-ttrow="${i}" ${it.sel ? "checked" : ""}><span class="clip grow">${esc(it.name)}</span><span class="n">${t("tt_eps_year", { n: Object.keys(it.eps).length, y: it.last.slice(0, 4) || "?" })}</span></label>`).join("");
  const refresh = () => { const g = goLabel(); const b = $("ttGo"); if (b) { b.textContent = g.label; b.disabled = !g.n; } const w = $("ttWarn"); if (w) w.textContent = g.warn; };
  const g0 = goLabel();
  openModal(`<h2 id="dlgTitle">${t("tt_title")}</h2><p class="help">${t("tt_help", { n: items.length })}</p>
    <div class="chiprow"><button class="btn sm" data-mact="p2">${t("tt_recent2")}</button><button class="btn sm" data-mact="p4">${t("tt_recent4")}</button><button class="btn sm" data-mact="all">${t("tt_all")}</button><button class="btn sm" data-mact="none">${t("tt_none")}</button></div>
    <div class="pick" id="ttRows">${rows()}</div><p class="help c-red" id="ttWarn">${g0.warn}</p>
    <div class="btns"><button class="btn ghost" data-mact="close">${t("cancel")}</button><button class="btn primary" id="ttGo" data-mact="go">${esc(g0.label)}</button></div>`, {
    onAction(v) {
      if (v === "close") return requestClose();
      if (v === "p2") pick(sinceYears(2)); else if (v === "p4") pick(sinceYears(4));
      else if (v === "all") items.forEach((x) => { x.sel = true; }); else if (v === "none") items.forEach((x) => { x.sel = false; });
      else if (v === "go") return ttRunModal(items.filter((x) => x.sel));
      $("ttRows").innerHTML = rows(); refresh();
    },
    onChange(el) { if (el.dataset.ttrow != null) { items[+el.dataset.ttrow].sel = el.checked; refresh(); } },
  });
}
async function ttRunModal(sel) {
  const res = await ttImport(sel, (s) => setModal(`<h2 id="dlgTitle">${t("tt_running", { i: s.i + 1, n: s.n })}</h2><p class="fw-600">${esc(s.name)}</p>
    <p class="help mono">${t("tt_counts", { a: s.added, m: s.merged, s: s.skipped })}</p><div class="bar"><i style="width:${Math.round((s.i + 1) / s.n * 100)}%"></i></div>
    <div class="btns"><button class="btn danger" data-mact="stop">${t("stop_here")}</button></div>`));
  modalCtl = { onAction(v) { if (v === "done") { dismissModal(); render(); } } };
  setModal(`<h2 id="dlgTitle">${t(res.stopped ? "tt_stopped" : "tt_complete")}</h2><p class="help">${t("tt_summary", { a: res.added, m: res.merged, s: res.skipped.length })}</p>
    ${res.skipped.length ? `<div class="pick">${res.skipped.map((x) => `<label style="min-height:0"><span class="grow">${esc(x.n)}</span><span class="n" style="white-space:normal;text-align:end">${esc(t("skip_" + x.code, { n: x.count }))}</span></label>`).join("")}</div>` : ""}
    <div class="btns"><button class="btn primary" data-mact="done">${t("done")}</button></div>`);
  const b = document.querySelector('[data-mact="done"]'); if (b) b.focus();
}

/* ================= connecting sync ================= */
async function connectSync() {
  const tok = ($("tokenInput").value || "").trim();
  if (!tok) { toast(t("toast_token_empty")); return; }
  // Check the token before keeping it. v43 accepted anything and then failed
  // on every push, for ever, with no clue why.
  try {
    const r = await fetch("https://api.github.com/gists?per_page=1", { headers: { Authorization: "Bearer " + tok, Accept: "application/vnd.github+json" } });
    if (r.status === 401) { toast(t("err_token_check_401")); return; }
    if (r.status === 403 || r.status === 404) { toast(t("err_token_scope")); return; }
    if (!r.ok) throw new Error("HTTP" + r.status);
  } catch (e) { toast(t("err_token_net")); return; }
  ghToken = tok; store("signal.token", ghToken);
  toast(t("toast_connected"));
  await pullCloud(false); schedulePush(); render();
}

/* ================= the actions ================= */
const ACTIONS = {
  /* navigation */
  tab: (v) => setTab(v),
  goto: (v) => { const [tb, lib] = v.split(":"); if (lib) { libTab = lib; libLimit = 60; } if (sheet) { sheet = null; popLayerSilently(); } setTab(tb); },
  show: (v) => { if (sheet && sheet.type === "add") { sheet = null; popLayerSilently(); } openShow(+v); },
  film: (v) => openFilm(v),
  closesheet: () => requestClose(),
  openadd: (v) => { if (v === "movie") addType = "movie"; else if (v === "show") addType = "show"; openSheet({ type: "add" }); const f = $("aq"); if (f) f.focus(); },
  opensettings: (v) => openSettings(v),
  mact: (v, el) => modalCtl && modalCtl.onAction(v, el),
  undo: () => { applyUndo(); clearToast(); },
  dlbulk: (v) => { const [scope, id] = v.split(":"); clearToast(); markBulkDownloaded(+id, scope); },

  /* banner */
  syncall: () => syncAll(),
  stucktoggle: () => { stuckOpen = !stuckOpen; paintStatus(); },
  bannerexport: () => { exportDb(); render(); },
  nagsnooze: () => { store("signal.nagsnooze", String(Date.now() + 7 * 864e5)); render(); },

  /* today */
  next: (v) => markNext(+v),
  dlnext: (v) => { const [id, s, e] = v.split(":").map(Number); const sh = db.find((x) => x.id === id); if (!sh) return;
    setDl(sh, epK(s, e), true); dlPrompt = null; touch(sh); save(); render(); toast(t("toast_dl_on", { ep: codeOf(s, e) })); },
  dlep: (v) => { const [id, s, e] = v.split(":").map(Number); const sh = db.find((x) => x.id === id); if (!sh) return;
    setDl(sh, epK(s, e), true); touch(sh); save(); render(); toast(t("toast_dl_on", { ep: codeOf(s, e) })); },
  dlall: (v) => { const sh = db.find((x) => x.id === +v); if (!sh) return; let n = 0;
    for (const se of sh.seasons) for (const ep of se.eps) { const k = epK(se.season, ep.e);
      if (typeof (sh.watched || {})[k] === "number" && sh.watched[k] > 1 && !(sh.dl && sh.dl[k])) { setDl(sh, k, true); n++; } }
    touch(sh); save(); render(); toast(t("toast_bulk_dl", { n })); },
  dlmore: (v) => { dlShowAll[+v] = !dlShowAll[+v]; render(); },
  dlexp: () => { dlOpen = !dlOpen; render(); },
  schedtoggle: () => { schedOpen = !schedOpen; render(); },
  mvpend: (v) => { const m = movieById(v); if (!m) return; m.dl = true; m.dlWant = false; touchMovie(m); save(); render(); toast(t("toast_mv_dl", { title: m.title })); },

  /* shows */
  lib: (v) => { libTab = v; libLimit = 60; render(); },
  libmore: () => { libLimit += 60; render(); },
  viewtoggle: () => { viewMode = viewMode === "grid" ? "list" : "grid"; store("signal.view", viewMode); render(); },

  /* inside a show */
  seas: (v) => { const [id, s] = v.split(":").map(Number); selSeason[id] = s; render(); },
  ep: (v) => { const [id, s, e] = v.split(":").map(Number); toggleEp(id, s, e); },
  season: (v) => { const [id, s, on] = v.split(":").map(Number); markSeason(id, s, !!on); },
  mm: (v) => { const [id, mode] = v.split(":"); markMode[+id] = mode; render(); },
  catchup: (v) => catchUp(+v),
  dltrack: (v) => { const sh = db.find((x) => x.id === +v); if (!sh) return;
    sh.dlTrack = dlOn(sh) ? false : true; touch(sh); save(); render(); toast(t(dlOn(sh) ? "toast_dl_reminders_on" : "toast_dl_reminders_off")); },
  unlock: (v) => { const sh = db.find((x) => x.id === +v); if (!sh) return; sh.unlockAll = !sh.unlockAll; touch(sh); save(); render();
    toast(t(sh.unlockAll ? "toast_unlock_on" : "toast_unlock_off")); },
  bucket: (v) => { const [id, mode] = v.split(":"); const sh = db.find((x) => x.id === +id); if (!sh) return;
    sh.bucketOverride = mode === "resume" ? null : mode; touch(sh); save(); render();
    toast(mode === "dropped" ? t("toast_dropped", { title: sh.title }) : mode === "resume" ? t("toast_resumed", { title: sh.title })
      : t("toast_filed", { title: sh.title, cat: t(mode === "done" ? "cat_done" : "cat_waiting") })); },
  sync: (v) => syncShow(+v),
  manadd: (v) => addEpisodesModal(+v),
  manage: () => { manageOpen = !manageOpen; render(); },
  aboutmore: (v) => { aboutOpen[+v] = !aboutOpen[+v]; render(); },
  del: (v) => { confirmDel = +v; render(); },
  delno: () => { confirmDel = null; render(); },
  delyes: (v) => { const id = +v; confirmDel = null; if (sheet) { sheet = null; popLayerSilently(); } removeShow(id); render(); },

  /* movies */
  movtab: (v) => { movTab = v; movLimit = 60; render(); },
  mvmore: () => { movLimit += 60; render(); },
  mvw: (v) => { const m = movieById(v); if (!m) return; m.watched = !m.watched;
    if (m.watched) { m.watchedAt = todayISO(); if (!m.dl) m.dlWant = true; } else { m.watchedAt = null; m.dlWant = false; }
    touchMovie(m); save(); render(); toast(t(m.watched ? "toast_mv_watched" : "toast_mv_unwatched", { title: m.title })); },
  mvdlgo: (v) => { const m = movieById(v); if (!m) return; m.dl = true; m.dlWant = false; touchMovie(m); save(); render(); toast(t("toast_mv_dl", { title: m.title })); },
  mvskip: (v) => { const m = movieById(v); if (!m) return; m.dlWant = false; touchMovie(m); save(); render(); toast(t("toast_mv_skip", { title: m.title })); },
  mvdate: (v) => { const m = movieById(v); if (!m) return; const val = ($("mvd") || {}).value || "";
    m.releaseDate = val || null; m.year = val ? +val.slice(0, 4) : null; touchMovie(m); save(); render();
    toast(val ? t("toast_mv_date_set", { title: m.title, date: val }) : t("toast_mv_date_clear", { title: m.title })); },
  mvtitle: (v) => { const m = movieById(v); if (!m) return; const val = (($("mvt") || {}).value || "").trim();
    if (!val) { toast(t("err_title_required")); return; } m.title = val; touchMovie(m); save(); render(); toast(t("toast_mv_title")); },
  mvref: async (v, el) => { const m = movieById(v); if (!m) return; if (!navigator.onLine) { toast(t("err_need_net")); return; }
    el.disabled = true;
    try { const det = await wdDetails(m.id.slice(3));
      if (det.rel) { m.releaseDate = det.rel; m.year = +det.rel.slice(0, 4); }
      if (det.run) m.runtime = det.run;
      if (det.article && !m.article) { m.article = det.article; m.poster = undefined; }
      touchMovie(m); save(); render(); ensureMoviePosters();
      toast(det.rel ? t("toast_mv_refreshed", { title: m.title, date: det.rel }) : t("toast_mv_nodate", { title: m.title }));
    } catch (e) { el.disabled = false; toast(t("err_refresh")); } },
  mvdel: (v) => { movConfirmDel = v; render(); },
  mvdelno: () => { movConfirmDel = null; render(); },
  mvdelyes: (v) => { movies = movies.filter((m) => m.id !== v); deadMovies.add(v); dirtyMovies.delete(v);
    delMap[v] = Date.now(); metaDirty = true; movConfirmDel = null; if (sheet) { sheet = null; popLayerSilently(); } save(); render(); },

  /* discover */
  disctab: (v) => { discTab = v; render(); if (v === "movies") fetchMovieDiscover(false); else fetchDiscover(false); },
  disclang: (v) => { discLang = v; render(); },
  discopen: (v) => { const id = +v; discOpen = discOpen === id ? null : id; render();
    if (discOpen === id) { const it = ((discCache && discCache.items) || []).find((x) => x.id === id); if (it && !infoCache[id + ":" + it.season]) loadInfo(id, it.season); } },
  discadd: (v, el) => { el.disabled = true; addShowFlow(+v); },
  discrefresh: () => fetchDiscover(true),
  mdiscrefresh: () => fetchMovieDiscover(true),
  mdiscadd: (v) => { const it = ((mdiscCache && mdiscCache.items) || []).find((x) => x.qid === v); if (!it) return;
    const m = { id: "mv-" + it.qid, title: it.title, year: +it.date.slice(0, 4), releaseDate: it.date, runtime: null, article: it.article || null, poster: it.poster,
      watched: false, watchedAt: null, dlWant: false, dl: false, addedAt: Date.now(), updatedAt: Date.now() };
    movies.unshift(m); dirtyMovies.add(m.id); save(); render(); toast(t("toast_added_movie", { title: it.title })); },

  /* the add sheet */
  addtype: (v) => { addType = v; addRes = { state: "idle", items: [], q: "" }; render(); const f = $("aq"); if (f) f.focus(); },
  addshow: (v) => addShowFlow(+v),
  addmovie: (v) => addMovieFlow(v),
  manualshow: () => manualShowModal(),
  manualmovie: () => manualMovieModal(),

  /* settings */
  svc: (v) => { myPlatforms = myPlatforms.includes(v) ? myPlatforms.filter((x) => x !== v) : [...myPlatforms, v];
    store("signal.platforms", JSON.stringify(myPlatforms)); discCache = null; store("signal.discover", "null"); render(); },
  svcall: () => { svcAll = !svcAll; render(); },
  savetoken: () => connectSync(),
  cleartoken: () => { ghToken = ""; gistId = ""; store("signal.token", ""); store("signal.gistid", ""); toast(t("toast_disconnected")); render(); },
  pullnow: () => pullCloud(false),
  exportdb: () => { exportDb(); render(); },
  importbtn: () => $("importFile").click(),
  ttpick: (v) => $(v === "movies" ? "mvFile" : "ttFile").click(),
  clearlegacy: async () => { try { for (const k of ["signal.db", "signal.movies", "signal.del"]) localStorage.removeItem(k); } catch (e) {}
    storageInfo = await storageLine(); render(); toast(t("set_cleared")); },
};
const ACT_KEYS = Object.keys(ACTIONS);
document.addEventListener("click", (ev) => {
  let el = ev.target;
  while (el && el.nodeType === 1) {
    if (el.dataset) for (const k of ACT_KEYS) if (k in el.dataset) { ACTIONS[k](el.dataset[k], el, ev); return; }
    el = el.parentElement;
  }
});
document.addEventListener("submit", (ev) => { if (ev.target.id === "addForm") { ev.preventDefault(); runAddSearch(); } });
document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.id === "sf") { showFilter = el.value; libLimit = 60; render(); }
  else if (el.id === "mf") { movFilter = el.value; movLimit = 60; render(); }
  else if (el.id === "aq") addQ = el.value;
});
document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.id === "sortSel") { showSort = el.value; store("signal.sort", showSort); render(); }
  else if (el.id === "movSortSel") { movSort = el.value; store("signal.movsort", movSort); render(); }
  else if (el.id === "langSel") { setLang(el.value); store("signal.lang", LANG); applyStatic(); render(); }
  else if (modalCtl && modalCtl.onChange) modalCtl.onChange(el);
});
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && (modalOpen || sheet)) { ev.preventDefault(); requestClose(); }
});

/* ---- files chosen from Settings ---- */
function readFile(file, cb) { const r = new FileReader(); r.onload = () => cb(String(r.result)); r.readAsText(file); }
$("importFile").onchange = (e) => { if (e.target.files[0]) importDb(e.target.files[0]); e.target.value = ""; };
$("ttFile").onchange = (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  if (!navigator.onLine) { toast(t("toast_tt_need_net")); return; }
  readFile(f, (text) => { const items = ttParseFile(text);
    if (!items) toast(t("toast_tt_wrong")); else if (!items.length) toast(t("toast_tt_none")); else ttPickerModal(items); });
};
$("mvFile").onchange = (e) => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  readFile(f, (text) => { const items = mvParseFile(text);
    if (!items) toast(t("toast_mvtt_wrong")); else if (!items.length) toast(t("toast_mvtt_none"));
    else { let added = 0; for (const m of items) if (!movies.some((x) => x.id === m.id)) { movies.push(m); dirtyMovies.add(m.id); added++; }
      save(); render(); toast(t("toast_mvtt_done", { n: added, dup: items.length - added })); } });
};

/* ================= starting up ================= */
/* Offline support. Until v44 the app deleted every service worker it found,
   so it could not open at all without a connection. */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener("statechange", () => {
        // Cache-first means the tab you are in keeps running the old build.
        // Say so, rather than leaving you wondering why a change is missing.
        if (w.state === "installed" && navigator.serviceWorker.controller) toast(t("toast_new_version"), 8000);
      });
    });
  }).catch(() => {});
}
window.addEventListener("online", () => toast(t("toast_online")));
window.addEventListener("offline", () => toast(t("toast_offline")));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pullCloud(true);
  else { if (pushTimer) pushCloud(); saveLocal(); }   // flush anything still pending before the tab is frozen
});

(async () => {
  setLang(pickLang(store("signal.lang"), navigator.languages));
  applyStatic();
  await loadAll();
  booted = true;
  render();
  registerSW();
  if (tab === "discover") (discTab === "movies" ? fetchMovieDiscover(false) : fetchDiscover(false));
  if (tab === "movies") ensureMoviePosters();
  await pullCloud(true);
  await refreshStale();
})();
