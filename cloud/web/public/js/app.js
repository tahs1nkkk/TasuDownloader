// Kabuk: açılış kapısı, görünüm geçişleri, arşiv çekmecesi ve üst çubuk.
//
// Sayfa iki büyük görünümden ibaret (listeler / medya) ve aralarındaki geçiş
// ekranın iki kenarındaki butonlarla yapılıyor. Böylece üstte sekme satırı
// tutmaya gerek kalmıyor — o alan site sekmelerine ayrıldı.

import {
  $, $$, BW_FREE, ICON, PALETTE, S, api, bwCookie, bwGet, bwSet, clear, confirmBox, dialog, el,
  hideScrim, newId, promptBox, saveMeta, showScrim, thumbURL, toast
} from "./core.js";
import * as lists from "./lists.js";
import * as media from "./media.js";
import { closeViewer, isOpen } from "./viewer.js";
import { openUpload, wireDragDrop } from "./upload.js";
import { manageShares } from "./share.js";

/* ---------------------------------------------------------------- görünüm */

function setView(name, direction) {
  S.view = name;
  const listsView = $("#view-lists");
  const mediaView = $("#view-media");
  const active = name === "lists" ? listsView : mediaView;
  const other = name === "lists" ? mediaView : listsView;

  other.hidden = true;
  active.hidden = false;
  active.classList.remove("from-left", "from-right");
  // reflow: aynı sınıf ikinci kez eklendiğinde animasyon tekrar oynasın.
  void active.offsetWidth;
  active.classList.add(direction === "left" ? "from-left" : "from-right");

  $("#edge-left").hidden = name === "lists";
  $("#edge-right").hidden = name === "media";
  $("#media-stats").hidden = name !== "media";
  if (name === "media") media.renderGrid(true);
  $(".stage").scrollTop = 0;
}

function enterApp(view) {
  const chooser = $("#chooser");
  chooser.classList.add("leaving");
  setTimeout(() => { chooser.hidden = true; chooser.classList.remove("leaving"); }, 260);
  $("#app").hidden = false;
  setView(view, view === "lists" ? "left" : "right");
}

function backToChooser() {
  $("#app").hidden = true;
  $("#chooser").hidden = false;
}

/* ------------------------------------------------------------- arşivler */

function currentDrive() {
  return S.meta.drives.find((d) => d.id === S.drive) || S.meta.drives[0];
}

function paintBrand() {
  const drive = currentDrive();
  $("#brand-name").textContent = drive ? drive.name : "Tasu Arşiv";
  // Simge artık gerçek bir <img>; arşivin rengi arkasındaki halo olarak duruyor.
  $("#brand-dot").style.setProperty("--dot", drive ? drive.accent : "");
  $("#brand-ver").textContent = `v${S.version}`;
}

async function switchDrive(id) {
  if (S.drive === id) { closeDrawer(); return; }
  S.drive = id;
  S.site = "";
  S.cat = "";
  S.picked.clear();
  localStorage.setItem("tasu.drive", id);
  paintBrand();
  closeDrawer();
  // Listeler de arşive bağlı. Sunucudan tekrar çekmeye gerek yok — havuz tek,
  // ayrım etikette — ama yeniden çizilmeleri şart, yoksa önceki arşivin notları
  // ekranda kalıyordu.
  await media.load();
  lists.render();
  media.renderCats();
}

function closeDrawer() {
  $("#drive-drawer").hidden = true;
  hideScrim();
}

// Arşiv düzenleme: ad, renk ve kapak görseli. Görsel arşivin kendi
// dosyalarından seçiliyor ve yalnız bu pencere açıldığında yükleniyor.
async function editDrive(drive) {
  const draft = { name: drive.name, accent: drive.accent, banner: drive.banner || "" };

  const choice = await dialog({
    title: "Arşiv",
    build: (box) => {
      const input = el("input", { type: "text", value: drive.name, maxlength: 60 });
      input.addEventListener("input", () => { draft.name = input.value; });
      box.append(el("label", { class: "f" }, el("span", {}, "Ad"), input));

      const colors = el("div", { class: "swatches" });
      for (const color of PALETTE) {
        const swatch = el("button", {
          type: "button", class: `swatch${color === draft.accent ? " on" : ""}`,
          style: `background:${color}`,
          onclick: () => {
            colors.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
            swatch.classList.add("on");
            draft.accent = color;
          }
        });
        colors.append(swatch);
      }
      box.append(el("label", { class: "f" }, el("span", {}, "Renk"), colors));

      const picker = el("div", { class: "picker" });
      const none = el("button", {
        type: "button", class: `picker-none${draft.banner ? "" : " on"}`,
        onclick: () => {
          picker.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
          none.classList.add("on");
          draft.banner = "";
        }
      }, "yok");
      picker.append(none);
      for (const item of S.media.filter((m) => m.kind === "image").slice(0, 120)) {
        const button = el("button", {
          type: "button", class: draft.banner === item.key ? "on" : "", title: item.name,
          onclick: () => {
            picker.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
            button.classList.add("on");
            draft.banner = item.key;
          }
        }, el("img", { src: thumbURL(item.key), loading: "lazy", decoding: "async", alt: "" }));
        picker.append(button);
      }
      box.append(el("label", { class: "f" }, el("span", {}, "Kapak görseli"), picker));
    },
    buttons: [
      { label: "Vazgeç", value: null },
      { label: "Kaydet", kind: "primary", value: "save" }
    ]
  });
  if (choice !== "save") return;

  drive.name = draft.name.trim() || drive.name;
  drive.accent = draft.accent;
  if (draft.banner) drive.banner = draft.banner; else delete drive.banner;
  await saveMeta(true);
  paintBrand();
  openDrawer();
}

function openDrawer() {
  const drawer = $("#drive-drawer");
  clear(drawer);
  drawer.append(el("h2", {}, "Arşivler"));

  for (const drive of S.meta.drives) {
    // Kapak soldan sağa siyaha eriyor: sağdaki ad ve sayı her görselin üstünde
    // okunur kalsın diye, görselin kendisi de tamamen kaybolmasın diye.
    const row = el("button", {
      class: `drive-row${drive.id === S.drive ? " on" : ""}${drive.banner ? " has-art" : ""}`,
      type: "button",
      style: drive.banner ? `--art:url("${thumbURL(drive.banner)}")` : "",
      onclick: () => switchDrive(drive.id),
      oncontextmenu: (event) => { event.preventDefault(); editDrive(drive); }
    },
      el("span", { class: "drive-mark", style: `background:${drive.accent}` }, drive.name.slice(0, 1).toUpperCase()),
      el("span", { class: "drive-meta" },
        el("b", {}, drive.name),
        el("span", {}, drive.id === S.drive ? `${S.media.length} dosya` : "geçmek için dokun"))
    );

    row.append(el("span", {
      class: "drive-kill drive-edit", html: ICON.pencil, title: "Düzenle",
      onclick: (event) => { event.stopPropagation(); editDrive(drive); }
    }));

    if (drive.id !== "main") {
      row.append(el("span", {
        class: "drive-kill", html: ICON.trash, title: "Kaldır",
        onclick: async (event) => {
          event.stopPropagation();
          const ok = await confirmBox("Arşiv listeden kaldırılsın mı?",
            "Dosyalar R2'de durmaya devam eder, yalnız bu arşiv görünmez olur.", "Kaldır", true);
          if (!ok) return;
          S.meta.drives = S.meta.drives.filter((d) => d.id !== drive.id);
          if (S.drive === drive.id) await switchDrive("main");
          saveMeta();
          openDrawer();
        }
      }));
    }
    drawer.append(row);
  }

  drawer.append(el("button", {
    class: "drive-row", type: "button", style: "border-style:dashed",
    onclick: async () => {
      const name = await promptBox("Yeni arşiv", "Arşiv adı", "", "ör. İş, Referanslar");
      if (!name) return;
      const drive = {
        id: newId("d"), name,
        accent: PALETTE[S.meta.drives.length % PALETTE.length]
      };
      S.meta.drives.push(drive);
      await saveMeta(true);
      await switchDrive(drive.id);
    }
  },
    el("span", { class: "drive-mark", style: "background:rgba(255,255,255,.12);color:#fff" }, "+"),
    el("span", { class: "drive-meta" }, el("b", {}, "Yeni arşiv"), el("span", {}, "ayrı bir depo aç"))
  ));

  drawer.append(el("button", {
    class: "drive-row", type: "button", style: "margin-top:14px",
    onclick: () => { closeDrawer(); manageShares(); }
  },
    el("span", { class: "drive-mark", style: "background:rgba(255,255,255,.12);color:#fff" }, "↗"),
    el("span", { class: "drive-meta" }, el("b", {}, "Paylaşımlar"), el("span", {}, "etkin linkleri yönet"))
  ));

  drawer.hidden = false;
  showScrim(closeDrawer);
}

/* --------------------------------------------------------------------- tema */

// Üç durum: cihaza uy → açık → koyu → cihaza uy. "auto" hiçbir öznitelik
// bırakmaz, böylece CSS'teki prefers-color-scheme kuralı iş görür.
const THEMES = [
  { id: "auto", icon: "contrast", label: "Tema: cihaza uy" },
  { id: "light", icon: "sun", label: "Tema: açık" },
  { id: "dark", icon: "moon", label: "Tema: koyu" }
];

function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  const root = document.documentElement;
  if (theme.id === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme.id);
  localStorage.setItem("tasu.theme", theme.id);

  const button = $("#btn-theme");
  if (button) {
    button.innerHTML = ICON[theme.icon];
    button.title = theme.label;
    button.setAttribute("aria-label", theme.label);
    button.dataset.theme = theme.id;
  }
  return theme.id;
}

function wireTheme() {
  let current = applyTheme(localStorage.getItem("tasu.theme") || "auto");
  $("#btn-theme").addEventListener("click", () => {
    const next = THEMES[(THEMES.findIndex((t) => t.id === current) + 1) % THEMES.length];
    current = applyTheme(next.id);
    toast(next.label, "ok");
  });
}

/* ----------------------------------------------------------------- ayarlar */

// Sürgü 1–1000 arası düz bir aralık olsaydı düşük değerleri seçmek imkânsız
// olurdu (ilk on pikselde 1–10 Mbps). Bunun yerine kademeler var; son kademe
// sınırsız demek.
const BW_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, BW_FREE];

const bwText = (mbps) => (!mbps || mbps >= BW_FREE ? "sınırsız" : `${mbps} Mbps`);

function bwRow(text, value, onPick) {
  const start = value ? Math.max(0, BW_STEPS.indexOf(value)) : BW_STEPS.length - 1;
  const out = el("span", { class: "bw-val" }, bwText(value));
  const range = el("input", {
    type: "range", min: 0, max: BW_STEPS.length - 1, step: 1, value: start
  });
  range.addEventListener("input", () => {
    const mbps = BW_STEPS[Number(range.value)];
    out.textContent = bwText(mbps);
    onPick(mbps >= BW_FREE ? 0 : mbps);
  });
  return el("label", { class: "f" },
    el("span", {}, text),
    el("div", { class: "bw" }, range, out));
}

async function openPrefs() {
  const draft = bwGet();
  const choice = await dialog({
    title: "Ayarlar",
    build: (box) => {
      box.append(bwRow("İndirme", draft.down, (v) => { draft.down = v; }));
      box.append(bwRow("Yükleme", draft.up, (v) => { draft.up = v; }));
    },
    buttons: [
      { label: "Vazgeç", value: null },
      { label: "Kaydet", kind: "primary", value: "save" }
    ]
  });
  if (choice !== "save") return;
  const saved = bwSet(draft.down, draft.up);
  toast(`İndirme ${bwText(saved.down)} · yükleme ${bwText(saved.up)}`, "ok");
}

/* ------------------------------------------------------------------ açılış */

async function reloadAll() {
  await Promise.all([media.load(), lists.load()]);
  media.renderCats();
}

async function boot() {
  // iOS uygulamasının WebView'ı kendini böyle tanıtır; hover'sız ve daha yoğun
  // cam bir varyant devreye girer.
  const params = new URLSearchParams(location.search);
  if (params.get("app") === "1" || /TasuArchiveApp/.test(navigator.userAgent)) {
    document.documentElement.classList.add("ios");
  }

  try {
    const config = await api.get("/api/config");
    if (config && config.version) S.version = config.version;
  } catch { /* sürüm kozmetik */ }

  try {
    const meta = await api.get("/api/meta");
    if (meta) S.meta = { ...S.meta, ...meta };
    if (meta && meta.degraded) toast("Ayarlar okunamadı, geçici olarak varsayılan düzen", "err");
  } catch (error) {
    toast(`Ayarlar alınamadı: ${error.message}`, "err");
  }

  const saved = localStorage.getItem("tasu.drive");
  if (saved && S.meta.drives.some((d) => d.id === saved)) S.drive = saved;
  paintBrand();

  lists.wire();
  media.wire();
  wireDragDrop(reloadAll);

  await reloadAll();

  // Doğrudan bir görünüme bağlantı: /?go=media kapıyı atlar.
  const go = params.get("go");
  if (go === "media" || go === "lists") enterApp(go);
}

/* ------------------------------------------------------------------ bağlama */

function wireShell() {
  for (const half of $$(".half")) {
    half.addEventListener("click", () => enterApp(half.dataset.go));
  }

  $("#edge-left").addEventListener("click", () => setView("lists", "left"));
  $("#edge-right").addEventListener("click", () => setView("media", "right"));

  $("#btn-drives").addEventListener("click", openDrawer);
  $(".brand").addEventListener("click", backToChooser);
  wireTheme();

  // Çerez her istekte gidiyor; sekme açılır açılmaz yerinde olsun.
  bwCookie();
  $("#btn-prefs").innerHTML = ICON.gauge;
  $("#btn-prefs").addEventListener("click", openPrefs);

  $("#btn-add").addEventListener("click", () => openUpload([], reloadAll));

  $("#btn-refresh").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    await reloadAll();
    button.disabled = false;
    toast("Yenilendi", "ok");
  });

  $("#btn-logout").addEventListener("click", async () => {
    const ok = await confirmBox("Çıkış yapılsın mı?", "Tekrar girmek için Google hesabın gerekecek.", "Çıkış yap");
    if (ok) location.href = "/auth/logout";
  });

  document.addEventListener("keydown", (event) => {
    if (isOpen() || $("#dialogs").classList.contains("on")) return;
    if (event.target.matches("input, select, textarea")) return;
    if (event.key === "ArrowLeft") setView("lists", "left");
    if (event.key === "ArrowRight") setView("media", "right");
    if (event.key === "Escape" && !$("#drive-drawer").hidden) closeDrawer();
    if (event.key === "/") { event.preventDefault(); $(S.view === "lists" ? "#lists-search" : "#media-search").focus(); }
  });

  // Dokunmatikte yatay kaydırma da görünüm değiştirir; kenar butonları telefonda
  // dar kaldığı için asıl gezinme bu.
  const swipe = { x: 0, y: 0, on: false };
  const stage = $(".stage");
  stage.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) { swipe.on = false; return; }
    swipe.x = event.touches[0].clientX;
    swipe.y = event.touches[0].clientY;
    swipe.on = true;
  }, { passive: true });
  stage.addEventListener("touchend", (event) => {
    if (!swipe.on || isOpen() || $("#dialogs").classList.contains("on")) return;
    swipe.on = false;
    const dx = event.changedTouches[0].clientX - swipe.x;
    const dy = event.changedTouches[0].clientY - swipe.y;
    // Dikey kaydırmayı yanlışlıkla geçiş saymamak için yatay bileşen baskın olmalı.
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const target = dx < 0 ? "media" : "lists";
    if (S.view === target) return;
    setView(target, dx < 0 ? "right" : "left");
  }, { passive: true });

  // Dynamic Island / durum çubuğu dokunuşu. iOS'un "başa dön" davranışı
  // WebView'ın kendi kaydırıcısına gider; asıl kaydırıcı ise `.stage` olduğu
  // için dokunuş hiçbir şey yapmıyordu. Sarmalayıcı bunu çağırıyor.
  window.tasuScrollTop = () => {
    const drawer = $("#drive-drawer");
    const target = drawer.hidden ? stage : drawer;
    target.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Geri tuşu görüntüleyiciyi kapatsın, sayfadan çıkmasın.
  window.addEventListener("popstate", () => { if (isOpen()) closeViewer(); });
}

wireShell();
boot();
