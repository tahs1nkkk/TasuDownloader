// Medya görünümü: site sekmeleri, kategoriler, ızgara, seçim ve toplu işlemler.
//
// İki tasarım kararı burada yaşıyor:
//  1) Video kapakları. R2 yalnız baytları saklıyor, Worker'da ffmpeg yok. İlk
//     kareyi tarayıcı yakalayıp /api/thumb'a bırakıyor; ikinci açılışta ızgara
//     videoyu hiç indirmiyor. Aynı anda en çok iki üretim çalışır.
//  2) Silme sayfayı yeniden yüklemez. Kart yerinde eriyip gider, ızgara kaldığı
//     yerde kalır — 500 dosyalık bir arşivde başa dönmek can sıkıcıydı.

import {
  $, $$, ALL_SITE, ICON, PALETTE, S, api, clear, confirmBox, dialog, el, fmtBytes,
  mediaURL, newId, promptBox, saveMeta, siteBrand, thumbURL, toast
} from "./core.js";
import { openViewer } from "./viewer.js";
import { openShare } from "./share.js";

const SITE_ORDER = ["RedGifs", "Reddit", "Instagram", "Scrolller", "Coomer", "Other"];
const PAGE = 120;
const MAX_CAT_DEPTH = 5;    // kök = 0; en fazla bu kadar seviye (0..4). Alt-ekle
                           // düğmesi sınıra gelince gizlenir, backend de kırpar.
const OVERSCAN_ROWS = 4;    // pencerenin üstünde/altında yedek satır (kaydırırken
                           // boş kart görülmesin diye)

// DOM geri dönüşümü (windowing): kaydırmayla yalnız görünen kartlar (+ yedek)
// DOM'da kalır; üstte/altta iki "boşluk" (spacer) çıkarılan kartların yerini
// piksel olarak tutar, böylece kaydırma çubuğu ve konumu bozulmaz. 15 bin
// dosyada bile DOM'da birkaç yüz düğüm olur.
let gridRows = [];          // o an görünen (süzülmüş+sıralı) dizi
let winFrom = 0;            // DOM'daki ilk kartın indisi
let winTo = -1;            // DOM'daki son kartın (dışlayan) indisi
let topPad = null;          // üst boşluk (grid item, tam satır)
let botPad = null;          // alt boşluk
let cols = 1;              // ölçülen sütun sayısı
let unit = 0;              // ölçülen satır yüksekliği (kart + satır boşluğu)
let ticking = false;        // scroll rAF gaz kelebeği

/* ------------------------------------------------------------------ süzme */

export function itemMeta(key) {
  return S.meta.items[key] || null;
}

function catOf(key) {
  const entry = itemMeta(key);
  return entry && entry.cat ? entry.cat : "";
}

function descendants(catId) {
  const out = new Set([catId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const cat of S.meta.cats) {
      if (cat.parent && out.has(cat.parent) && !out.has(cat.id)) { out.add(cat.id); grew = true; }
    }
  }
  return out;
}

// visible() bir render döngüsünde defalarca çağrılıyor (renderGrid, renderStats,
// renderSelectBar, her kart tıklaması, pencere her tazelendiğinde). Büyük arşivde
// her seferinde binlerce öğeyi süzüp sıralamak kaydırmayı boğuyordu. Sonucu
// filtre imzasına göre önbelleğe alıyoruz; veri (S.media, meta) değişince imza
// aynı kalabildiği için ayrıca visibleDirty() ile açıkça geçersiz kılınır.
let visCache = null;
let visSig = "";

export function visibleDirty() { visCache = null; }

export function visible() {
  // Ayıraç newline: tek satırlık arama girdisi ile diğer alanlar newline
  // içeremez → alanlar birbirine karışıp çakışamaz.
  const sig = [S.query, S.site, S.kind, S.cat, S.sort].join("\n");
  if (visCache && sig === visSig) return visCache;
  const needle = S.query.toLocaleLowerCase("tr");
  const catSet = S.cat ? descendants(S.cat) : null;
  const rows = S.media.filter((item) => {
    if (S.site && item.site !== S.site) return false;
    if (S.kind && item.kind !== S.kind) return false;
    if (catSet && !catSet.has(catOf(item.key))) return false;
    if (needle && !item.name.toLocaleLowerCase("tr").includes(needle)) return false;
    return true;
  });
  const by = {
    new: (a, b) => b.mtime - a.mtime,
    old: (a, b) => a.mtime - b.mtime,
    big: (a, b) => b.size - a.size,
    name: (a, b) => a.name.localeCompare(b.name, "tr")
  }[S.sort];
  rows.sort(by);
  visCache = rows;
  visSig = sig;
  return rows;
}

// Küçük yardımcı: hızlı art arda gelen olayları (arama tuşları) tek çağrıya indirir.
function debounce(fn, ms) {
  let timer = null;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

/* ------------------------------------------------------------ site sekmeleri */

function tab(id, label, brand, count) {
  const node = el("button", {
    class: `site-tab${S.site === id ? " on" : ""}`, type: "button",
    // Arka plan sitenin kendi işaretinin bulanıklaştırılmış hâli (CSS'te
    // filter: blur). Böylece her sekme rengini logosundan alıyor, üstüne ayrı
    // bir dolgu kutusu koymaya gerek kalmıyor.
    style: `--tab-bg:${brand.bg};--tab-glow:${brand.glow}`,
    title: label,
    onclick: () => { S.site = id; S.picked.clear(); renderTabs(); renderGrid(); renderSelectBar(); }
  },
    el("span", { class: "site-mark", html: brand.mark }),
    el("span", { class: "site-name" }, label),
    el("span", { class: "site-num" }, String(count))
  );
  return node;
}

export function renderTabs() {
  const host = $("#site-tabs");
  clear(host);
  // Site kavramı yalnız ana arşivde ("main") var. Diğer arşivler dışarıdan dosya
  // yüklemek için; hepsi görünmez "Other" altında toplanır, sekme şeridi gizli.
  if (S.drive !== "main") { host.hidden = true; return; }
  host.hidden = false;
  const counts = new Map();
  for (const item of S.media) counts.set(item.site, (counts.get(item.site) || 0) + 1);

  host.append(tab("", "Tümü", ALL_SITE, S.media.length));
  const seen = new Set(SITE_ORDER);
  for (const site of SITE_ORDER) {
    if (!counts.get(site) && site !== "Other") continue;
    host.append(tab(site, site === "Other" ? "Diğer" : site, siteBrand(site), counts.get(site) || 0));
  }
  // Uygulamanın bilmediği etiketler (özel arşivler) de sekmesini alsın.
  for (const [site, count] of counts) {
    if (!seen.has(site)) host.append(tab(site, site, siteBrand(site), count));
  }
}

/* -------------------------------------------------------------- kategoriler */

function catCount(catId) {
  const set = descendants(catId);
  return S.media.filter((item) => set.has(catOf(item.key))).length;
}

async function editCat(cat) {
  const draft = { name: cat.name, color: cat.color };
  const choice = await dialog({
    title: "Kategoriyi düzenle",
    build: (box) => {
      const input = el("input", { type: "text", value: cat.name, maxlength: 60 });
      input.addEventListener("input", () => { draft.name = input.value; });
      box.append(el("label", { class: "f" }, el("span", {}, "Ad"), input));
      const row = el("div", { class: "swatches" });
      for (const color of PALETTE) {
        const swatch = el("button", {
          type: "button", class: `swatch${color === cat.color ? " on" : ""}`,
          style: `background:${color}`,
          onclick: () => {
            row.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
            swatch.classList.add("on");
            draft.color = color;
          }
        });
        row.append(swatch);
      }
      box.append(el("label", { class: "f" }, el("span", {}, "Renk"), row));
    },
    buttons: [
      { label: "Sil", kind: "danger", value: "delete" },
      { label: "Vazgeç", value: null },
      { label: "Kaydet", kind: "primary", value: "save" }
    ]
  });

  if (choice === "save") {
    cat.name = draft.name.trim() || cat.name;
    cat.color = draft.color;
  } else if (choice === "delete") {
    const ok = await confirmBox("Kategori silinsin mi?",
      "Dosyalar silinmez, yalnız bu kategoriden çıkar.", "Sil", true);
    if (!ok) return;
    const doomed = descendants(cat.id);
    S.meta.cats = S.meta.cats.filter((c) => !doomed.has(c.id));
    for (const [key, entry] of Object.entries(S.meta.items)) {
      if (entry.cat && doomed.has(entry.cat)) delete entry.cat;
    }
    if (doomed.has(S.cat)) S.cat = "";
  } else {
    return;
  }
  saveMeta();
  visibleDirty();
  renderCats();
  renderGrid();
}

// Bir kategorinin köke uzaklığı (kök = 0). Bozuk veriye karşı ziyaret seti ve
// sert bir tavan var: döngü ya da aşırı derinlik olsa bile takılmaz.
function catDepth(catId) {
  let depth = 0;
  let cur = catId;
  const seen = new Set();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = S.meta.cats.find((c) => c.id === cur);
    if (!node || !node.parent) break;
    cur = node.parent;
    depth += 1;
    if (depth > MAX_CAT_DEPTH + 2) break;
  }
  return depth;
}

async function addCat(parent = null) {
  // Yeni çocuğun derinliği = ebeveyn derinliği + 1; tavanı aşarsa reddet.
  if (parent && catDepth(parent) + 1 >= MAX_CAT_DEPTH) {
    toast("Daha derine alt kategori açılamıyor", "err");
    return;
  }
  const name = await promptBox(parent ? "Yeni alt kategori" : "Yeni kategori", "Kategori adı", "",
    parent ? "ör. Albüm 1" : "ör. Favoriler");
  if (!name) return;
  S.meta.cats.push({
    id: newId("c"), drive: S.drive, name, parent,
    color: PALETTE[S.meta.cats.length % PALETTE.length], order: S.meta.cats.length
  });
  saveMeta();
  renderCats();
}

function chip(cat) {
  const kids = S.meta.cats.filter((c) => c.parent === cat.id && c.drive === S.drive);
  const open = S.openCats.has(cat.id);
  const node = el("button", {
    class: `cat-chip${S.cat === cat.id ? " on" : ""}${open ? " open" : ""}`,
    type: "button",
    style: S.cat === cat.id ? `background:${cat.color}` : "",
    oncontextmenu: (event) => { event.preventDefault(); editCat(cat); },
    onclick: () => { S.cat = S.cat === cat.id ? "" : cat.id; S.picked.clear(); renderCats(); renderGrid(); }
  },
    el("span", { class: "cat-swatch", style: `background:${cat.color}` }),
    cat.name,
    el("span", { class: "site-num" }, String(catCount(cat.id)))
  );
  if (kids.length) {
    node.append(el("span", {
      class: "cat-caret", html: ICON.chevronDown,
      onclick: (event) => {
        event.stopPropagation();
        if (open) S.openCats.delete(cat.id); else S.openCats.add(cat.id);
        renderCats();
      }
    }));
  }
  return { node, kids, open };
}

// Bir kategoriyi ve (açıksa) tüm alt ağacını özyinelemeli çizer. Her açık düğümün
// altında çocukları girintili bir şeritte (.cat-kids iç içe geçtikçe girinti
// derinleşir) ve —derinlik sınırına gelmediyse— o seviyeye bir "+ Alt kategori"
// düğmesi gelir. Caret zaten her derinlikte çalışıyor (S.openCats).
function renderBranch(host, cat, depth) {
  const { node, kids, open } = chip(cat);
  host.append(node);
  if (!open) return;
  const row = el("div", { class: "cat-kids" });
  for (const kid of kids) renderBranch(row, kid, depth + 1);
  if (depth + 1 < MAX_CAT_DEPTH) {
    row.append(el("button", {
      class: "cat-chip cat-add", type: "button", onclick: () => addCat(cat.id)
    }, "+ Alt kategori"));
  }
  host.append(row);
}

export function renderCats() {
  const host = $("#cat-bar");
  clear(host);

  host.append(el("button", {
    class: `cat-chip${S.cat ? "" : " on"}`, type: "button",
    style: S.cat ? "" : "background:var(--accent);color:var(--on-accent)",
    onclick: () => { S.cat = ""; renderCats(); renderGrid(); }
  }, "Tümü"));

  for (const cat of S.meta.cats.filter((c) => !c.parent && c.drive === S.drive)) {
    renderBranch(host, cat, 0);
  }

  host.append(el("button", {
    class: "cat-chip cat-add", type: "button", onclick: () => addCat(null)
  }, "+ Kategori"));
}

/* ----------------------------------------------------------------- kapaklar */

// Izgara artık hiçbir zaman asıl dosyayı göstermiyor — yalnız /api/thumb.
// Eskiden videolar kapak alıyor ama görseller tam boyuyla çiziliyordu: 200
// piksellik bir kareye 8 MB'lık fotoğrafı indirip ölçekleyen tarayıcı hem ağı
// hem de kaydırmayı boğuyordu. "Her açılışta yeniden iniyor" şikâyeti de
// buradan geliyordu, çünkü tam boy dosyalar tarayıcı önbelleğine sığmıyordu.
//
// Kapak yoksa sunucu 204 döner (404 değil — konsol temiz kalsın); <img> boş
// gövdede `error` verir, tarayıcı bir kez üretip /api/thumb'a bırakır; ikinci
// açılışta doğrudan gelir. Aynı anda en çok iki üretim çalışır.
const THUMB_EDGE = 480;
const queue = [];
let running = 0;

function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift();
    running += 1;
    job().catch(() => {}).finally(() => { running -= 1; pump(); });
  }
}

function fitBox(width, height) {
  const w = width || THUMB_EDGE;
  const h = height || THUMB_EDGE;
  const scale = Math.min(1, THUMB_EDGE / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function storeThumb(canvas, key) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  if (!blob) throw new Error("kare alınamadı");
  // Sunucuya bırakmak "en iyi çaba": başarısız olsa da kullanıcı kapağı görür.
  fetch(thumbURL(key), { method: "PUT", credentials: "same-origin", body: blob }).catch(() => {});
  return blob;
}

async function videoThumb(src, key) {
  const video = el("video", { preload: "metadata", muted: true, playsinline: true, crossorigin: "use-credentials" });
  video.src = src;
  await new Promise((resolve, reject) => {
    const stop = setTimeout(() => reject(new Error("zaman aşımı")), 20000);
    const fail = () => { clearTimeout(stop); reject(new Error("video açılamadı")); };
    video.addEventListener("error", fail, { once: true });
    video.addEventListener("loadedmetadata", () => {
      // Tam sıfırıncı kare çoğu videoda siyah; biraz ileri sararız.
      video.currentTime = Math.min(0.6, (video.duration || 1) * 0.1);
    }, { once: true });
    video.addEventListener("seeked", () => { clearTimeout(stop); resolve(); }, { once: true });
  });

  const box = fitBox(video.videoWidth, video.videoHeight);
  const canvas = el("canvas");
  canvas.width = box.w;
  canvas.height = box.h;
  canvas.getContext("2d").drawImage(video, 0, 0, box.w, box.h);
  video.src = "";
  return storeThumb(canvas, key);
}

async function imageThumb(src, key) {
  const source = await new Promise((resolve, reject) => {
    const probe = new Image();
    probe.decoding = "async";
    probe.addEventListener("load", () => resolve(probe), { once: true });
    probe.addEventListener("error", () => reject(new Error("görsel açılamadı")), { once: true });
    probe.src = src;
  });

  const box = fitBox(source.naturalWidth, source.naturalHeight);
  const canvas = el("canvas");
  canvas.width = box.w;
  canvas.height = box.h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, box.w, box.h);
  return storeThumb(canvas, key);
}

function wantThumb(item, img) {
  queue.push(async () => {
    try {
      const blob = item.kind === "video"
        ? await videoThumb(mediaURL(item.key), item.key)
        : await imageThumb(mediaURL(item.key), item.key);
      const url = URL.createObjectURL(blob);
      img.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
      img.src = url;
    } catch {
      // Kapak üretilemedi (bozuk dosya, desteklenmeyen kodek). Görselde asıl
      // dosyayı göstermek hiç göstermemekten iyi; videoda film şeridi kalsın.
      if (item.kind === "image") img.src = mediaURL(item.key);
      else img.replaceWith(el("div", { class: "fallback" }, "🎞"));
    }
  });
  pump();
}

// Yükleme anında, yerel File'dan kapak üretir ve /api/thumb'a bırakır. Baytlar
// zaten elde olduğu için ağdan tekrar indirmek yok; böylece yeni yüklenen
// dosyalar ilk görüntülemede "tam dosyayı indirip kapak üret" fırtınasını hiç
// yaşatmaz. En iyi çaba: başarısızsa ilk görüntüleme eski yola (404 → üret)
// düşer. Kuyruğa alınır ki toplu yüklemede CPU kilitlenmesin.
export function thumbFromFile(file, key) {
  const type = file.type || "";
  const kind = type.startsWith("video/") ? "video" : type.startsWith("image/") ? "image" : "";
  if (!kind) return;
  queue.push(async () => {
    const url = URL.createObjectURL(file);
    try {
      if (kind === "video") await videoThumb(url, key);
      else await imageThumb(url, key);
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  pump();
}

/* ------------------------------------------------------------------ ızgara */

function togglePick(key, node) {
  if (S.picked.has(key)) S.picked.delete(key); else S.picked.add(key);
  node.classList.toggle("picked", S.picked.has(key));
  renderSelectBar();
}

function card(item, index) {
  const node = el("div", {
    class: `media-card${S.picked.has(item.key) ? " picked" : ""}`,
    title: item.name, dataset: { key: item.key },
    // Ayrı bir "seçim modu" yok: karta basmak açar, sol üstteki tike basmak
    // seçer. Bir şey seçiliyken kartın kendisi de seçime katılır — 200 dosyayı
    // işaretlerken her seferinde küçük tiki bulmak işkenceydi.
    onclick: (event) => {
      if (event.target.closest(".check")) return;
      if (S.picked.size) togglePick(item.key, node);
      else openViewer(visible(), index, onDeleted);
    }
  });

  if (item.kind === "video" || item.kind === "image") {
    // draggable="false": kapağı tutup çekince tarayıcı onu sürüklenen bir dosya
    // sanıyor, ızgara altından kayıyor ve yükleme penceresi açılıyordu.
    const img = el("img", {
      loading: "lazy", decoding: "async", alt: "", draggable: "false", src: thumbURL(item.key)
    });
    img.addEventListener("error", () => { wantThumb(item, img); }, { once: true });
    node.append(img);
    if (item.kind === "video") {
      node.append(el("span", { class: "play-badge" }, el("span", { html: ICON.play })));
    }
  } else {
    node.append(el("div", { class: "fallback" }, "📄"));
  }

  node.append(
    el("span", { class: "media-size" }, fmtBytes(item.size)),
    el("span", { class: "media-name" }, item.name),
    el("button", {
      class: "check", type: "button", title: "Seç", "aria-label": "Seç", html: ICON.check,
      onclick: (event) => { event.stopPropagation(); togglePick(item.key, node); }
    })
  );
  return node;
}

function renderStats(rows) {
  const dock = $("#media-stats");
  if (S.view !== "media" || S.picked.size) { dock.hidden = true; return; }
  const images = rows.filter((r) => r.kind === "image").length;
  const videos = rows.filter((r) => r.kind === "video").length;
  const bytes = rows.reduce((sum, r) => sum + (r.size || 0), 0);
  clear(dock);
  dock.append(
    el("span", { class: "stat" }, el("b", {}, String(rows.length)), "dosya"),
    el("span", { class: "stat" }, el("b", {}, String(images)), "görsel"),
    el("span", { class: "stat" }, el("b", {}, String(videos)), "video"),
    el("span", { class: "stat" }, el("b", {}, fmtBytes(bytes)))
  );
  dock.hidden = false;
}

// DOM geri dönüşümü. Eskiden sonsuz kaydırma yalnız ekliyordu: 1200 dosyada
// onuncu sayfa 1200 kart demekti, kaydırma her seferinde donuyordu. Şimdi yalnız
// görünen kartlar (+ yedek satırlar) DOM'da; üstte/altta iki boşluk (spacer)
// çıkarılan kartların yerini piksel olarak tutuyor, böylece kaydırma çubuğu ve
// konum bozulmuyor. Kartlar kare (aspect-ratio:1) olduğundan satır yüksekliği
// canlı bir karttan birebir ölçülür — sapma birikmez.
function stageEl() { return $(".stage"); }

// topPad ile botPad arasını temizler ve winFrom..winTo kartlarını basar.
function fillWindow(root) {
  let node = topPad.nextSibling;
  while (node && node !== botPad) { const next = node.nextSibling; node.remove(); node = next; }
  const frag = document.createDocumentFragment();
  for (let i = winFrom; i < winTo; i += 1) frag.append(card(gridRows[i], i));
  botPad.before(frag);
}

// Kaydırma konumuna göre görünen pencereyi hesaplar; değiştiyse yalnız o aralığı
// yeniden çizer ve boşlukları satır cinsinden ayarlar.
function paintWindow(root, keepIfSame) {
  const stage = stageEl();
  if (!stage || !topPad || !botPad) return;

  const style = getComputedStyle(root);
  const tracks = style.gridTemplateColumns.split(" ").filter((t) => t && t !== "none");
  cols = Math.max(1, tracks.length);
  const gap = parseFloat(style.rowGap) || 12;
  const live = root.querySelector(".media-card");
  let cardH = live ? live.getBoundingClientRect().height : 0;
  if (!cardH) {
    const inner = root.clientWidth - (cols - 1) * gap;
    cardH = inner > 0 ? inner / cols : 0;
  }

  // Görünüm henüz düzenlenmemişse (kapı ekranı açıkken load() çağrılır): boşluksuz
  // ilk PAGE kartı çiz; görünür olunca ilk gerçek ölçüm pencereyi düzeltir.
  if (cardH < 1) {
    if (winTo < 0) {
      winFrom = 0; winTo = Math.min(gridRows.length, PAGE);
      topPad.style.height = "0px"; botPad.style.height = "0px";
      fillWindow(root);
    }
    return;
  }
  unit = cardH + gap;

  const total = gridRows.length;
  const totalRows = Math.ceil(total / cols);
  const rootTop = root.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop;
  const viewTop = stage.scrollTop - rootTop;
  let firstRow = Math.floor(viewTop / unit) - OVERSCAN_ROWS;
  let lastRow = Math.ceil((viewTop + stage.clientHeight) / unit) + OVERSCAN_ROWS;
  firstRow = Math.max(0, firstRow);
  lastRow = Math.min(totalRows, Math.max(firstRow + 1, lastRow));

  const from = firstRow * cols;
  const to = Math.min(total, lastRow * cols);
  if (keepIfSame && from === winFrom && to === winTo) return;
  winFrom = from; winTo = to;

  topPad.style.height = `${firstRow * unit}px`;
  botPad.style.height = `${Math.max(0, totalRows - lastRow) * unit}px`;
  fillWindow(root);
}

// Tek kaydırma/yeniden-boyut dinleyicisinden çağrılır (wire'da rAF ile gazlanır).
function syncWindow() {
  const root = $("#media-root");
  if (!topPad || !botPad || !root || S.view !== "media" || !gridRows.length) return;
  paintWindow(root, true);
}

export function renderGrid(keepPos = false) {
  const root = $("#media-root");
  gridRows = visible();
  clear(root);
  winFrom = 0; winTo = -1;

  if (!gridRows.length) {
    topPad = null; botPad = null;
    root.append(el("div", { class: "empty" },
      el("b", {}, S.media.length ? "Bu süzgeçte dosya yok" : "Arşiv boş"),
      S.media.length ? "Site sekmesini ya da aramayı değiştir." : "Telefondan indirdiklerin buraya düşer."));
    renderStats(gridRows);
    return;
  }

  // Boşluklar birer grid item (tam satır); aralarındaki kartlar da grid akışında.
  topPad = el("div", { class: "grid-pad" });
  botPad = el("div", { class: "grid-pad" });
  root.append(topPad, botPad);
  if (!keepPos) stageEl().scrollTop = 0;

  paintWindow(root, false);
  // İlk boyama tahminle başlamış olabilir (henüz canlı kart yok); bir sonraki
  // kare gerçek ölçümle pencereyi düzeltsin.
  requestAnimationFrame(() => { if (gridRows.length && S.view === "media") paintWindow(root, false); });

  renderStats(gridRows);
}

/* -------------------------------------------------------- silme / güncelleme */

// Görüntüleyici ya da toplu silme bir dosyayı kaldırdığında ızgarayı yerinde
// günceller: ekranda görünen silinen kartlar yerinde erir, animasyon bitince
// pencere taze listeden yeniden kurulur (windowing'de indisler kaydığı için).
function onDeleted(keys) {
  const gone = new Set(keys);
  S.media = S.media.filter((item) => !gone.has(item.key));
  for (const key of gone) { delete S.meta.items[key]; S.picked.delete(key); }
  visibleDirty();

  let melting = false;
  for (const node of $$("#media-root .media-card")) {
    if (gone.has(node.dataset.key)) { node.classList.add("leaving"); melting = true; }
  }
  const refresh = () => { if (S.view === "media") renderGrid(true); };
  if (melting) setTimeout(refresh, 300); else refresh();

  renderTabs();
  // Seçili son dosya da gittiyse alttaki eylem çubuğu kapanmalı; eskiden
  // ekranda asılı kalıyordu (renderStats'ı da bu çağrı yeniliyor).
  renderSelectBar();
  updateChooserCount();
}

export function updateChooserCount() {
  const badge = $("#chooser-media");
  if (badge) badge.textContent = `${S.media.length} dosya`;
}

/* ----------------------------------------------------------------- seçim */

// Seçim "mod" değil, durum: çubuk yalnız en az bir dosya seçiliyken var.
// Eskiden ayrı bir Seç düğmesi modu açıyordu ve son dosya silindiğinde mod
// açık kaldığı için çubuk boş boş ekranda kalıyordu.
export function renderSelectBar() {
  const bar = $("#select-bar");
  const active = S.picked.size > 0;
  S.selecting = active;
  bar.hidden = !active;
  // "Siteye taşı" yalnız ana arşivde anlamlı; diğer arşivlerde site yok, gizle.
  const siteBtn = bar.querySelector('[data-act="site"]');
  if (siteBtn) siteBtn.hidden = S.drive !== "main";
  document.body.classList.toggle("selecting", active);
  $("#sel-count").textContent = `${S.picked.size} seçildi`;
  renderStats(visible());
}

async function pickCategory(title) {
  const cats = S.meta.cats.filter((c) => c.drive === S.drive);
  return dialog({
    title,
    text: cats.length ? null : "Henüz kategori yok. Önce medya sayfasından bir kategori ekle.",
    build: (box, close) => {
      const tree = el("div", { class: "tree" });
      tree.append(el("button", { type: "button", onclick: () => close({ id: "" }) },
        el("span", { class: "cat-swatch", style: "background:#6b7280" }), "Kategorisiz"));
      // Tüm ağacı derinliğe göre girintili göster; her seviyeden kategori seçilebilir.
      const addBranch = (cat, depth) => {
        tree.append(el("button", {
          type: "button", style: depth ? `padding-left:${12 + depth * 18}px` : "",
          onclick: () => close({ id: cat.id })
        }, el("span", { class: "cat-swatch", style: `background:${cat.color}` }), cat.name));
        if (depth > MAX_CAT_DEPTH) return;
        for (const kid of cats.filter((c) => c.parent === cat.id)) addBranch(kid, depth + 1);
      };
      for (const cat of cats.filter((c) => !c.parent)) addBranch(cat, 0);
      box.append(tree);
    },
    buttons: [{ label: "Vazgeç", value: null }]
  });
}

async function pickSite(title) {
  return dialog({
    title,
    build: (box, close) => {
      const tree = el("div", { class: "tree" });
      for (const site of SITE_ORDER) {
        const brand = siteBrand(site);
        tree.append(el("button", { type: "button", onclick: () => close(site) },
          el("span", { class: "site-mark", html: brand.mark }),
          site === "Other" ? "Diğer" : site));
      }
      box.append(tree);
    },
    buttons: [{ label: "Vazgeç", value: null }]
  });
}

async function bulk(action) {
  const keys = [...S.picked];
  if (!keys.length && action !== "all" && action !== "cancel") {
    toast("Önce dosya seç", "err");
    return;
  }

  if (action === "cancel") {
    S.picked.clear();
    for (const node of $$("#media-root .media-card")) node.classList.remove("picked");
    renderSelectBar();
    return;
  }

  if (action === "all") {
    const rows = visible();
    const allPicked = rows.every((r) => S.picked.has(r.key));
    for (const row of rows) { if (allPicked) S.picked.delete(row.key); else S.picked.add(row.key); }
    for (const node of $$("#media-root .media-card")) {
      node.classList.toggle("picked", S.picked.has(node.dataset.key));
    }
    renderSelectBar();
    return;
  }

  if (action === "delete") {
    const ok = await confirmBox(`${keys.length} dosya silinsin mi?`,
      "Bu işlem geri alınamaz; dosyalar R2'den kalkar.", "Sil", true);
    if (!ok) return;
    try {
      await api.post("/api/media/bulk", { action: "delete", keys });
      onDeleted(keys);
      S.picked.clear();
      renderSelectBar();
      toast(`${keys.length} dosya silindi`, "ok");
    } catch (error) { toast(`Silinemedi: ${error.message}`, "err"); }
    return;
  }

  if (action === "cat") {
    const choice = await pickCategory("Kategoriye taşı");
    if (!choice) return;
    for (const key of keys) {
      const entry = S.meta.items[key] || (S.meta.items[key] = {});
      if (choice.id) entry.cat = choice.id; else delete entry.cat;
      if (!Object.keys(entry).length) delete S.meta.items[key];
    }
    saveMeta();
    visibleDirty();
    renderCats();
    renderGrid();
    toast(`${keys.length} dosya taşındı`, "ok");
    return;
  }

  if (action === "site") {
    const site = await pickSite("Siteye taşı");
    if (!site) return;
    try {
      const result = await api.post("/api/media/bulk", { action: "move", keys, drive: S.drive, site });
      const moved = result.moved || {};
      for (const item of S.media) {
        const target = moved[item.key];
        if (!target) continue;
        // Meta anahtarı da yeni yola taşınmalı, yoksa kategori kaybolur.
        if (S.meta.items[item.key]) {
          S.meta.items[target] = S.meta.items[item.key];
          delete S.meta.items[item.key];
        }
        item.key = target;
        item.site = site;
      }
      saveMeta();
      visibleDirty();
      S.picked.clear();
      renderTabs(); renderSelectBar(); renderGrid();
      toast(`${Object.keys(moved).length} dosya taşındı`, "ok");
    } catch (error) { toast(`Taşınamadı: ${error.message}`, "err"); }
    return;
  }

  if (action === "share") {
    await openShare(keys);
  }
}

/* ------------------------------------------------------------------- veri */

export async function load() {
  try {
    S.media = await api.get(`/api/media?drive=${encodeURIComponent(S.drive)}`) || [];
  } catch (error) {
    toast(`Medya alınamadı: ${error.message}`, "err");
    S.media = [];
  }
  visibleDirty();
  renderTabs();
  renderCats();
  renderGrid();
  updateChooserCount();
}

const SORTS = [
  { id: "new", icon: "sortNew", label: "Yeni → eski" },
  { id: "old", icon: "sortOld", label: "Eski → yeni" },
  { id: "big", icon: "sortBig", label: "Büyükten küçüğe" },
  { id: "name", icon: "sortName", label: "Ada göre" }
];

export function wire() {
  const search = $("#media-search");
  // Her tuşta tüm ızgarayı yıkıp kurmak en belirgin jank'ti. S.query anında
  // güncellenir (süzme/küçük-harf için) ama yeniden çizim ~160ms geciktirilir.
  const runSearch = debounce(() => renderGrid(), 160);
  search.addEventListener("input", () => { S.query = search.value.trim(); runSearch(); });

  // Windowing: tek kaydırma dinleyicisi, rAF ile gazlanır. Görünen pencereyi
  // kaydırma konumuna göre tazeler; yalnız medya görünümünde ve ızgara kuruluyken
  // iş yapar (aksi halde erken çıkar).
  stageEl().addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; syncWindow(); });
  }, { passive: true });
  window.addEventListener("resize", () => syncWindow());

  const sort = $("#media-sort");
  const paintSort = () => {
    const current = SORTS.find((s) => s.id === S.sort) || SORTS[0];
    sort.innerHTML = ICON[current.icon];
    sort.title = current.label;
    sort.setAttribute("aria-label", `Sıralama: ${current.label}`);
  };
  sort.addEventListener("click", () => {
    const at = SORTS.findIndex((s) => s.id === S.sort);
    S.sort = SORTS[(at + 1) % SORTS.length].id;
    paintSort();
    renderGrid();
  });
  paintSort();

  // Tür süzgeci: iki bağımsız düğme, ikisi de kapalıysa hepsi görünür.
  for (const button of $$("#view-media [data-kind]")) {
    const kind = button.dataset.kind;
    button.innerHTML = ICON[kind];
    button.addEventListener("click", () => {
      S.kind = S.kind === kind ? "" : kind;
      for (const other of $$("#view-media [data-kind]")) {
        other.classList.toggle("on", other.dataset.kind === S.kind);
      }
      S.picked.clear();
      renderSelectBar();
      renderGrid();
    });
  }

  for (const button of $$("#select-bar [data-act]")) {
    button.addEventListener("click", () => bulk(button.dataset.act));
  }
}

export { onDeleted };
