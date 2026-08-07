/*
 * Eklenti içi arşiv paneli. R2 medyasını iOS galerisi gibi sık bir karede
 * gösterir, bulut listelerini yönetir. Hepsi jeton (Bearer) üzerinden çalışır —
 * Worker çerezi SameSite=Lax olduğu için chrome-extension:// kökeninden giden
 * arka plan istekleri onu taşımaz. Jeton yoksa tek seçenek "Sitede aç" (üst
 * düzey gezinme, Google). Sürücü kavramı iOS'ta da kullanıcıya gösterilmez;
 * varsayılan "main" sürücüsü listelenir.
 */
const C = globalThis.RG_CLOUD;

const S = {
  settings: null,
  files: [],
  site: null,      // null = tümü
  query: "",       // arama kutusu metni (kaynak/isim süzgeci)
  lists: null,     // { lists:[…], tombstones:[…] }
  listsLoaded: false,
  tab: "media",
  viewerList: [],  // görüntüleyicinin gezineceği (süzülmüş) liste
  viewerIndex: -1,
  selMode: false,  // seçim modu
  selected: new Set() // seçili dosya anahtarları
};

// --- küçük DOM yardımcısı ---
function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

const $ = (id) => document.getElementById(id);

function driveName() {
  return (S.settings.cloudDrive || "main").trim() || "main";
}

function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function siteLabel(site) {
  return site === "Other" || !site ? "Diğer" : site;
}

function setConn(text, level = "") {
  const c = $("conn");
  c.textContent = text;
  if (level) c.dataset.level = level; else delete c.dataset.level;
}

function showBanner(html) {
  const b = $("banner");
  if (!html) { b.hidden = true; b.innerHTML = ""; return; }
  b.hidden = false;
  b.innerHTML = html;
}

function openSite() {
  const base = C.normalizeBase(S.settings.cloudBase);
  if (base) chrome.tabs.create({ url: `${base}/` });
}

function shownFiles() {
  let files = S.site ? S.files.filter((f) => (f.site || "Other") === S.site) : S.files;
  const q = (S.query || "").trim().toLowerCase();
  if (q) {
    files = files.filter((f) =>
      `${f.source || ""} ${f.name || ""} ${f.site || ""}`.toLowerCase().includes(q)
    );
  }
  return files;
}

// --- Medya ---------------------------------------------------------------

async function loadMedia() {
  const grid = $("grid");
  grid.innerHTML = "";
  $("mediaEmpty").hidden = true;
  setConn("Yükleniyor…");
  try {
    S.files = await C.listMedia(S.settings, driveName());
    S.files.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    setConn(`Bağlı ✓ · ${S.files.length} dosya`, "done");
    renderSiteFilter();
    renderGrid();
  } catch (e) {
    setConn(e.message || String(e), "error");
    $("mediaEmpty").hidden = false;
    $("mediaEmpty").textContent = e.message || String(e);
  }
}

function renderSiteFilter() {
  const wrap = $("siteFilter");
  wrap.innerHTML = "";
  const sites = [...new Set(S.files.map((f) => f.site || "Other"))].sort();
  if (sites.length <= 1) return;
  const chip = (label, value, count) => el("button", {
    class: `chip${S.site === value ? " on" : ""}`,
    type: "button",
    onclick: () => { S.site = value; renderSiteFilter(); renderGrid(); }
  }, label, el("span", { class: "n" }, String(count)));
  wrap.append(chip("Tümü", null, S.files.length));
  for (const s of sites) {
    wrap.append(chip(siteLabel(s), s, S.files.filter((f) => (f.site || "Other") === s).length));
  }
}

function renderGrid() {
  const grid = $("grid");
  grid.innerHTML = "";
  const files = shownFiles();
  if (!files.length) {
    $("mediaEmpty").hidden = false;
    $("mediaEmpty").textContent = (S.query || "").trim()
      ? "Aramayla eşleşen medya yok."
      : (S.files.length ? "Bu sitede medya yok." : "Bu sürücüde medya yok.");
    return;
  }
  $("mediaEmpty").hidden = true;
  const frag = document.createDocumentFragment();
  files.forEach((f, i) => frag.append(card(f, i)));
  grid.append(frag);
}

function isVideo(f) {
  return f.isVideo || f.kind === "video";
}

function card(f, index) {
  const node = el("div", {
    class: `card${S.selected.has(f.key) ? " sel" : ""}`,
    title: f.name,
    onclick: () => { if (S.selMode) toggleSel(f, node); else openViewerAt(index); }
  });
  node.dataset.key = f.key;

  const img = el("img", { loading: "lazy", draggable: "false", src: C.mediaURL(S.settings, f.key, { thumb: isVideo(f) }), alt: "" });
  img.addEventListener("error", () => img.replaceWith(el("div", { class: "ph" }, isVideo(f) ? "▶" : "🖼")));
  node.append(img);

  if (isVideo(f)) node.append(el("span", { class: "vid" }, "▶"));

  // Seçim tiki — hover'da ya da seçim modunda görünür, tıklayınca seçer
  node.append(el("button", {
    class: "pick", type: "button", title: "Seç", "aria-label": "Seç",
    onclick: (e) => { e.stopPropagation(); toggleSel(f, node); }
  }, S.selected.has(f.key) ? "✓" : ""));

  node.append(el("button", {
    class: "del", type: "button", title: "Sil",
    onclick: (e) => { e.stopPropagation(); removeFromGrid(f); }
  }, "🗑"));
  return node;
}

// --- Çoklu seçim -----------------------------------------------------------

function toggleSel(f, node) {
  if (S.selected.has(f.key)) S.selected.delete(f.key);
  else S.selected.add(f.key);

  const on = S.selected.has(f.key);
  if (node) {
    node.classList.toggle("sel", on);
    const pick = node.querySelector(".pick");
    if (pick) pick.textContent = on ? "✓" : "";
  }

  if (!S.selMode && S.selected.size) enterSel();
  else if (S.selMode && !S.selected.size) exitSel();
  else updateSelBar();
}

function enterSel() {
  S.selMode = true;
  document.body.classList.add("selmode");
  $("selbar").hidden = false;
  updateSelBar();
}

function exitSel() {
  S.selMode = false;
  S.selected.clear();
  document.body.classList.remove("selmode");
  $("selbar").hidden = true;
  renderGrid();
}

function updateSelBar() {
  $("selCount").textContent = `${S.selected.size} seçili`;
  $("selDelete").disabled = !S.selected.size;
}

// Seçilenleri buluttan siler; işlem bitince seçim modundan otomatik çıkar.
async function deleteSelected() {
  const keys = [...S.selected];
  if (!keys.length || !confirm(`${keys.length} öğe buluttan silinsin mi?`)) return;
  $("selDelete").disabled = true;
  const failed = [];
  for (const key of keys) {
    const f = S.files.find((x) => x.key === key);
    if (!f) continue;
    try { await serverDelete(f); }
    catch { failed.push(f.name || key); }
  }
  exitSel();               // bug4: işlem sonrası otomatik çık
  renderSiteFilter();
  renderGrid();
  if (failed.length) alert(`${failed.length} öğe silinemedi:\n${failed.join("\n")}`);
}

// Sunucudan siler ve yerel durumdan düşürür. Başarısızsa false döner.
async function serverDelete(f) {
  await C.deleteMedia(S.settings, f.key);
  S.files = S.files.filter((x) => x.key !== f.key);
  S.viewerList = S.viewerList.filter((x) => x.key !== f.key);
  setConn(`Bağlı ✓ · ${S.files.length} dosya`, "done");
}

async function removeFromGrid(f) {
  if (!confirm(`Silinsin mi?\n${f.name}`)) return;
  try {
    await serverDelete(f);
    renderSiteFilter();
    renderGrid();
  } catch (e) {
    alert(`Silinemedi: ${e.message || e}`);
  }
}

// --- Görüntüleyici (iOS pager gibi ileri/geri) ---------------------------

function openViewerAt(index) {
  S.viewerList = shownFiles();
  S.viewerIndex = index;
  $("viewer").hidden = false;
  renderViewer();
}

// <video> öğesini yok etmeden önce durdur; yoksa src koparken "yüklenemedi"
// gibi bir hata olayı tetikleniyor (bug5).
function stopViewerMedia() {
  const v = $("viewerBody").querySelector("video");
  if (v) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch { /* yok say */ } }
  $("viewerBody").innerHTML = "";
}

function renderViewer() {
  const f = S.viewerList[S.viewerIndex];
  const body = $("viewerBody");
  stopViewerMedia();
  if (!f) { closeViewer(); return; }

  const url = C.mediaURL(S.settings, f.key);
  if (isVideo(f)) {
    body.append(el("video", { src: url, controls: "", autoplay: "", playsinline: "" }));
  } else {
    body.append(el("img", { src: url, alt: f.name }));
  }

  $("viewerName").textContent = f.name;
  $("viewerSub").textContent = `${siteLabel(f.site)} · ${humanSize(f.size)} · ${S.viewerIndex + 1}/${S.viewerList.length}`;
  $("viewerPrev").disabled = S.viewerIndex <= 0;
  $("viewerNext").disabled = S.viewerIndex >= S.viewerList.length - 1;
}

function viewerStep(delta) {
  const next = S.viewerIndex + delta;
  if (next < 0 || next >= S.viewerList.length) return;
  S.viewerIndex = next;
  renderViewer();
}

function closeViewer() {
  $("viewer").hidden = true;
  stopViewerMedia();
}

async function viewerDelete() {
  const f = S.viewerList[S.viewerIndex];
  if (!f || !confirm(`Buluttan silinsin mi?\n${f.name}`)) return;
  const at = S.viewerIndex;
  try {
    await serverDelete(f);   // S.viewerList'ten de düşer
    renderSiteFilter();
    renderGrid();
    if (!S.viewerList.length) { closeViewer(); return; }
    S.viewerIndex = Math.min(at, S.viewerList.length - 1);
    renderViewer();
  } catch (e) {
    alert(`Silinemedi: ${e.message || e}`);
  }
}

// --- Listeler ------------------------------------------------------------

async function loadLists() {
  const wrap = $("lists");
  wrap.innerHTML = "";
  $("listsEmpty").hidden = true;
  try {
    S.lists = (await C.getLists(S.settings)) || { lists: [], tombstones: [] };
    S.listsLoaded = true;
    renderLists();
  } catch (e) {
    $("listsEmpty").hidden = false;
    $("listsEmpty").textContent = e.message || String(e);
  }
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function renderLists() {
  const wrap = $("lists");
  wrap.innerHTML = "";
  const lists = Array.isArray(S.lists.lists) ? S.lists.lists : [];
  const visible = lists
    .filter((l) => l && typeof l.id === "string")
    .sort((a, b) => (b.items || []).length - (a.items || []).length);
  if (!visible.length) {
    $("listsEmpty").hidden = false;
    $("listsEmpty").textContent = "Bulutta liste yok.";
    return;
  }
  $("listsEmpty").hidden = true;
  for (const list of visible) wrap.append(listCard(list));
}

function listCard(list) {
  const items = list.items || [];
  const ul = el("ul", { class: "list-items" });
  for (const item of items) {
    const note = String(item.title || "").trim();
    ul.append(el("li", { class: "list-item" },
      el("a", { class: "lk", href: item.url, target: "_blank", rel: "noreferrer noopener", title: item.url },
        el("span", { class: "t" }, note || item.url),
        el("span", { class: "h" }, hostOf(item.url))
      ),
      el("button", {
        class: "icon-btn", type: "button", title: "Girişi sil",
        onclick: () => removeItem(list, item)
      }, "Sil")
    ));
  }
  return el("div", { class: "list-card" },
    el("div", { class: "list-head" },
      el("h2", {}, list.name || "(adsız)"),
      el("div", { class: "list-head-actions" },
        el("span", { class: "count" }, `${items.length} öğe`),
        el("button", { class: "icon-btn", type: "button", title: "Listeyi sil", onclick: () => removeList(list) }, "Listeyi sil")
      )
    ),
    ul
  );
}

async function saveLists() {
  await C.putLists(S.settings, S.lists);
}

async function removeItem(list, item) {
  list.items = (list.items || []).filter((x) => x !== item);
  try { await saveLists(); renderLists(); }
  catch (e) { alert(`Kaydedilemedi: ${e.message || e}`); }
}

async function removeList(list) {
  if (!confirm(`Liste silinsin mi?\n${list.name || list.id}`)) return;
  S.lists.lists = (S.lists.lists || []).filter((l) => l.id !== list.id);
  S.lists.tombstones = [...new Set([...(S.lists.tombstones || []), list.id])];
  try { await saveLists(); renderLists(); }
  catch (e) { alert(`Silinemedi: ${e.message || e}`); }
}

// --- Sekmeler + kapı -----------------------------------------------------

function switchTab(tab) {
  S.tab = tab;
  if (S.selMode) exitSel();
  for (const b of document.querySelectorAll(".tab")) b.classList.toggle("on", b.dataset.tab === tab);
  $("mediaTab").hidden = tab !== "media";
  $("listsTab").hidden = tab !== "lists";
  $("siteFilter").hidden = tab !== "media"; // çipler yalnız medya sekmesinde
  $("archiveSearch").hidden = tab !== "media"; // arama kutusu da yalnız medyada
  if (tab === "lists" && !S.listsLoaded) loadLists();
}

function applyGate() {
  if (!C.isConfigured(S.settings)) {
    setConn("Ayarsız", "error");
    showBanner("Worker adresi girilmemiş. Eklenti simgesine tıkla → <strong>Sunucu / Bulut</strong> bölümünden adresi ve jetonu gir.");
    $("tabs").hidden = true;
    $("mediaTab").hidden = true;
    $("archiveSearch").hidden = true;
    return false;
  }
  if (!C.hasToken(S.settings)) {
    setConn("Jeton yok", "error");
    showBanner("Eklenti içi ızgara ve listeler <strong>jeton</strong> ister (Worker çerezi SameSite=Lax olduğu için arka plan isteğine gelmez). Tam arşivi Google ile taramak için <a href=\"#\" id=\"bnrSite\">Sitede aç</a>.");
    const link = $("bnrSite");
    if (link) link.addEventListener("click", (e) => { e.preventDefault(); openSite(); });
    $("tabs").hidden = true;
    $("mediaTab").hidden = true;
    $("archiveSearch").hidden = true;
    return false;
  }
  showBanner(null);
  $("tabs").hidden = false;
  return true;
}

async function init() {
  S.settings = await C.getSettings();

  $("refresh").addEventListener("click", () => {
    if (S.tab === "media") loadMedia();
    else { S.listsLoaded = false; loadLists(); }
  });
  $("openSite").addEventListener("click", openSite);
  $("archiveSearch").addEventListener("input", (e) => {
    S.query = e.target.value || "";
    renderGrid();
  });
  for (const b of document.querySelectorAll(".tab")) b.addEventListener("click", () => switchTab(b.dataset.tab));
  $("viewerClose").addEventListener("click", closeViewer);
  $("viewerDelete").addEventListener("click", viewerDelete);
  $("viewerPrev").addEventListener("click", () => viewerStep(-1));
  $("viewerNext").addEventListener("click", () => viewerStep(1));
  $("viewer").addEventListener("click", (e) => { if (e.target === $("viewer")) closeViewer(); });
  $("selDelete").addEventListener("click", deleteSelected);
  $("selCancel").addEventListener("click", exitSel);
  document.addEventListener("keydown", (e) => {
    if (!$("viewer").hidden) {
      if (e.key === "Escape") closeViewer();
      else if (e.key === "ArrowLeft") viewerStep(-1);
      else if (e.key === "ArrowRight") viewerStep(1);
      return;
    }
    if (e.key === "Escape" && S.selMode) exitSel();
  });

  // Bir kareyi tutup sürükleyince tarayıcı bunu "dosya bırakma/gezinme" sanıp
  // sayfayı değiştirmesin (bug6). Görseller zaten draggable=false.
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  if (applyGate()) loadMedia();
}

init();
