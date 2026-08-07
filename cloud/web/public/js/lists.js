// Listeler görünümü.
//
// Listeler kategoriler altında toplanır. Varsayılan kategori bağlantıların
// geldiği sitedir (RedGifs, Reddit, …) — çünkü zaten arşivin doğal ayrımı bu.
// İsteyen listeyi kendi açtığı bir kategoriye taşır; o zaman site tahmini
// devre dışı kalır. Her liste ayrıca banner ve vurgu rengi taşır.
//
// Bilerek gösterilmeyen şey: eklenme tarihi. Sayı "x adet" olarak yazılır.

import {
  $, ICON, PALETTE, S, api, clear, confirmBox, dialog, el, hostOf, isoNow, linkLabel, mediaURL,
  newId, promptBox, saveMeta, siteBrand, thumbURL, toast
} from "./core.js";

const SITE_HINTS = [
  [/redgifs\./i, "RedGifs"],
  [/reddit\.|redd\.it/i, "Reddit"],
  [/instagram\./i, "Instagram"],
  [/scrolller\./i, "Scrolller"],
  [/coomer\.|kemono\./i, "Coomer"]
];

function siteOfURL(url) {
  const host = hostOf(url);
  for (const [pattern, name] of SITE_HINTS) if (pattern.test(host)) return name;
  return "";
}

// Listenin sitesi: bağlantılarında en çok geçen site. Karışıksa "Diğer".
function siteOfList(list) {
  const tally = new Map();
  for (const item of list.items || []) {
    const site = siteOfURL(item.url);
    if (site) tally.set(site, (tally.get(site) || 0) + 1);
  }
  let best = "";
  let top = 0;
  for (const [site, count] of tally) if (count > top) { best = site; top = count; }
  return best || "Other";
}

/* --------------------------------------------------------- liste değiştirme */

// Listeler sunucuda tek satırlık "aptalca" bir snapshot: bütünü indirir,
// değiştirir, bütünü geri yazarız (iOS'la birebir aynı yol). Çakışmayı
// azaltmak için değişiklikten hemen önce en tazeyi çekip onun üstünde
// oynuyoruz — eklentinin addWebLink deseninin aynısı. `apply` false dönerse
// (hedef liste artık yoksa) yazma iptal edilir.
async function mutate(apply) {
  let snap = null;
  try {
    snap = await api.get("/api/lists");
  } catch (error) {
    // 404 = henüz kayıt yok; boş snapshot'la devam et. Diğer hatalar durdurur.
    if (error.status !== 404) { toast(`Kaydedilemedi: ${error.message}`, "err"); return false; }
  }
  const lists = Array.isArray(snap && snap.lists) ? snap.lists : [];
  const tombstones = Array.isArray(snap && snap.tombstones) ? snap.tombstones : [];
  if (apply(lists, tombstones) === false) return false;
  try {
    await api.put("/api/lists", { lists, tombstones });
  } catch (error) {
    toast(`Kaydedilemedi: ${error.message}`, "err");
    return false;
  }
  S.lists = lists
    .filter((list) => list && typeof list.id === "string")
    .sort((a, b) => (b.items || []).length - (a.items || []).length);
  S.listTombstones = tombstones;
  render();
  return true;
}

async function renameList(list, name) {
  const clean = String(name || "").trim();
  if (!clean || clean === list.name) return;
  await mutate((lists) => {
    const target = lists.find((l) => l && l.id === list.id);
    if (!target) return false;
    target.name = clean.slice(0, 60);
    target.updatedAt = isoNow();
  });
}

// Silme, iOS'un merge'ini kandırmamak için mezar taşı bırakır: deletedAt (şimdi)
// listenin updatedAt'inden büyük olduğundan uzak cihaz listeyi diriltemez.
async function deleteList(list) {
  const count = (list.items || []).length;
  const ok = await confirmBox(
    "Listeyi sil",
    `"${list.name}" listesi${count ? ` ve ${count} bağlantı` : ""} silinecek. Bu, telefondaki uygulamadan da silinir.`,
    "Sil", true
  );
  if (!ok) return;
  const done = await mutate((lists, tombstones) => {
    const index = lists.findIndex((l) => l && l.id === list.id);
    if (index === -1) return false;
    lists.splice(index, 1);
    tombstones.push({ id: list.id, deletedAt: isoNow() });
  });
  if (done) toast("Liste silindi");
}

async function removeItem(list, item) {
  await mutate((lists) => {
    const target = lists.find((l) => l && l.id === list.id);
    if (!target || !Array.isArray(target.items)) return false;
    const before = target.items.length;
    target.items = target.items.filter((it) =>
      it && !((item.id && it.id === item.id) || it.url === item.url));
    if (target.items.length === before) return false;
    target.updatedAt = isoNow();
  });
}

function listMeta(id) {
  if (!S.meta.lists[id]) S.meta.lists[id] = {};
  return S.meta.lists[id];
}

// Listeler sunucuda tek havuzda duruyor (eklenti oraya yazıyor), arşive
// bölünmesi tamamen bu taraftaki bir etiket. Etiketsiz liste ana arşive ait
// sayılıyor; böylece eski kayıtlar bir yerde kaybolmuyor.
function driveOfList(id) {
  return listMeta(id).drive || "main";
}

function bannerCSS(entry, site) {
  const banner = entry.banner || "";
  if (banner.startsWith("grad:")) {
    const [a, b] = banner.slice(5).split(",");
    return `linear-gradient(135deg, ${a}, ${b})`;
  }
  if (banner.startsWith("media:")) return `url("${mediaURL(banner.slice(6))}")`;
  if (banner.startsWith("https://")) return `url("${banner}")`;
  return siteBrand(site).grad;
}

/* ------------------------------------------------------------ özelleştirme */

function swatchRow(colors, current, onPick) {
  const row = el("div", { class: "swatches" });
  for (const color of colors) {
    const button = el("button", {
      type: "button", class: `swatch${color === current ? " on" : ""}`,
      style: `background:${color}`, "aria-label": color,
      onclick: () => {
        row.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
        button.classList.add("on");
        onPick(color);
      }
    });
    row.append(button);
  }
  return row;
}

async function customize(list, refresh) {
  const entry = listMeta(list.id);
  const draft = {
    name: list.name, banner: entry.banner || "", accent: entry.accent || "", cat: entry.cat || "",
    drive: entry.drive || "main"
  };

  await dialog({
    title: list.name,
    build: (box, close) => {
      // ---- liste adı (görünüm değil, gerçek liste — /api/lists'e, iOS'a gider)
      const nameInput = el("input", { type: "text", value: list.name, maxlength: 60 });
      nameInput.addEventListener("input", () => { draft.name = nameInput.value; });
      box.append(el("label", { class: "f" }, el("span", {}, "Liste adı"), nameInput));

      // Banner iki ayrı seçenek: renk ya da görsel. Eskiden ikisi alt alta
      // duruyordu ve pencere açılır açılmaz altmış tam boy fotoğraf indiriyordu.
      // Şimdi görsel sekmesine geçilmeden tek bir istek bile gitmiyor.
      const grads = [
        ["#fbbf24", "#ec4899"], ["#38bdf8", "#8b5cf6"], ["#34d399", "#0ea5e9"],
        ["#f4525f", "#f59e0b"], ["#a78bfa", "#ec4899"], ["#1f2937", "#4b5563"]
      ];
      const gradRow = el("div", { class: "swatches" });
      for (const [a, b] of grads) {
        const value = `grad:${a},${b}`;
        const button = el("button", {
          type: "button", class: `swatch${draft.banner === value ? " on" : ""}`,
          style: `background:linear-gradient(135deg,${a},${b})`,
          onclick: () => {
            gradRow.querySelectorAll(".swatch").forEach((s) => s.classList.remove("on"));
            button.classList.add("on");
            draft.banner = value;
          }
        });
        gradRow.append(button);
      }

      const pane = el("div", {});
      const picker = el("div", { class: "picker" });
      let filled = false;

      const fillPicker = () => {
        if (filled) return;
        filled = true;
        const images = S.media.filter((m) => m.kind === "image").slice(0, 120);
        if (!images.length) {
          picker.append(el("div", { class: "list-empty" }, "Arşivde görsel yok."));
          return;
        }
        for (const item of images) {
          const value = `media:${item.key}`;
          const button = el("button", {
            type: "button", class: draft.banner === value ? "on" : "", title: item.name,
            onclick: () => {
              picker.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
              button.classList.add("on");
              draft.banner = value;
            }
          // Kapak, tam boy dosya değil: seçici de ızgarayla aynı /api/thumb'ı okuyor.
          }, el("img", { src: thumbURL(item.key), loading: "lazy", decoding: "async", alt: "" }));
          picker.append(button);
        }
      };

      const tabs = el("div", { class: "seg" });
      const setMode = (mode) => {
        for (const button of tabs.querySelectorAll("button")) {
          button.classList.toggle("on", button.dataset.mode === mode);
        }
        clear(pane);
        if (mode === "image") { fillPicker(); pane.append(picker); }
        else { pane.append(gradRow); }
      };
      for (const [mode, text] of [["color", "Renk"], ["image", "Görsel"]]) {
        tabs.append(el("button", {
          type: "button", class: "pill", dataset: { mode }, onclick: () => setMode(mode)
        }, text));
      }

      box.append(el("label", { class: "f" }, el("span", {}, "Banner"), tabs, pane));
      setMode(draft.banner.startsWith("media:") ? "image" : "color");

      // ---- vurgu rengi
      box.append(el("label", { class: "f" }, el("span", {}, "Vurgu rengi"),
        swatchRow(PALETTE, draft.accent, (color) => { draft.accent = color; })));

      // ---- kategori
      const select = el("select");
      select.append(el("option", { value: "" }, "Otomatik (site)"));
      for (const cat of S.meta.listCats) {
        select.append(el("option", { value: cat.id, selected: cat.id === draft.cat }, cat.name));
      }
      select.append(el("option", { value: "__new" }, "+ Yeni kategori…"));
      select.value = draft.cat || "";
      select.addEventListener("change", async () => {
        if (select.value !== "__new") { draft.cat = select.value; return; }
        select.value = draft.cat || "";
        const name = await promptBox("Yeni liste kategorisi", "Kategori adı", "", "ör. Favoriler");
        if (!name) return;
        const cat = { id: newId("lc"), name, color: PALETTE[S.meta.listCats.length % PALETTE.length] };
        S.meta.listCats.push(cat);
        draft.cat = cat.id;
        select.append(el("option", { value: cat.id, selected: true }, cat.name));
        select.value = cat.id;
      });
      box.append(el("label", { class: "f" }, el("span", {}, "Kategori"), select));

      // ---- arşiv
      const driveSelect = el("select");
      for (const drive of S.meta.drives) {
        driveSelect.append(el("option", { value: drive.id }, drive.name));
      }
      driveSelect.value = draft.drive;
      driveSelect.addEventListener("change", () => { draft.drive = driveSelect.value; });
      box.append(el("label", { class: "f" }, el("span", {}, "Arşiv"), driveSelect));

      box.append(el("button", {
        class: "vbtn", type: "button", style: "width:100%;justify-content:center",
        onclick: () => {
          delete entry.banner; delete entry.accent; delete entry.cat; delete entry.drive;
          saveMeta(); refresh(); close(null);
        }
      }, "Varsayılana döndür"));
    },
    buttons: [
      { label: "Vazgeç", value: null },
      {
        label: "Kaydet", kind: "primary",
        run: async () => {
          if (draft.banner) entry.banner = draft.banner; else delete entry.banner;
          if (draft.accent) entry.accent = draft.accent; else delete entry.accent;
          if (draft.cat) entry.cat = draft.cat; else delete entry.cat;
          if (draft.drive && draft.drive !== "main") entry.drive = draft.drive; else delete entry.drive;
          saveMeta();
          // Ad değiştiyse gerçek listeyi de yaz (mutate render'ı kendi yapar);
          // yoksa yalnız görünüm değişti, elle tazele.
          if (draft.name.trim() && draft.name.trim() !== list.name) await renameList(list, draft.name);
          else refresh();
          return null;
        }
      }
    ]
  });
}

/* --------------------------------------------------------------- kart çizimi */

function card(list) {
  const entry = listMeta(list.id);
  const site = siteOfList(list);
  const items = list.items || [];

  const node = el("div", { class: `list-card${entry.collapsed ? " collapsed" : ""}` });

  const banner = el("div", { class: "list-banner", style: `--banner:${bannerCSS(entry, site)}` });
  banner.append(el("button", {
    class: "list-edit", type: "button", "aria-label": "Listeyi özelleştir",
    html: ICON.pencil,
    onclick: (event) => { event.stopPropagation(); customize(list, render); }
  }));
  node.append(banner);

  const del = el("button", {
    class: "list-del", type: "button", "aria-label": "Listeyi sil",
    html: ICON.trash,
    onclick: (event) => { event.stopPropagation(); deleteList(list); }
  });

  const toggle = el("button", {
    class: "list-toggle", type: "button", "aria-label": "Daralt / genişlet",
    html: ICON.chevronDown,
    onclick: () => {
      const collapsed = node.classList.toggle("collapsed");
      if (collapsed) entry.collapsed = true; else delete entry.collapsed;
      saveMeta();
    }
  });

  node.append(el("div", { class: "list-head" },
    el("h3", { title: list.name }, list.name),
    el("span", { class: "list-count" }, `${items.length} adet`),
    del,
    toggle
  ));

  const body = el("div", {});
  if (!items.length) {
    body.append(el("div", { class: "list-empty" }, "Bu listede henüz bağlantı yok."));
  } else {
    for (const item of items.slice(0, 400)) {
      // Ad adresten geliyor (profilse kullanıcı adı, gönderiyse "kullanıcı |
      // tür"); eklentinin kaydettiği başlık varsa altına ikinci satır olarak
      // düşüyor. Ham URL artık hiçbir yerde ad olarak görünmüyor.
      const name = linkLabel(item.url, item.title);
      const note = String(item.title || "").trim();
      // Madde noktası artık sitenin küçük işareti — satıra bakınca nereden
      // geldiği okunuyor. İşaret bağlantının kendi adresinden çıkarılıyor;
      // liste karışıksa her satır kendi sitesini gösterir.
      const link = el("a", {
        class: "list-link", href: item.url, target: "_blank", rel: "noreferrer noopener",
        title: `${note ? `${note}\n` : ""}${item.url}`
      },
        el("span", { class: "list-ico", html: siteBrand(siteOfURL(item.url)).mark }),
        el("span", { class: "title" },
          el("b", {}, name),
          note && note !== name ? el("small", {}, note) : null),
        el("span", { class: "host" }, hostOf(item.url))
      );
      const drop = el("button", {
        class: "list-link-del", type: "button", "aria-label": "Bağlantıyı sil",
        html: ICON.x,
        onclick: (event) => { event.preventDefault(); event.stopPropagation(); removeItem(list, item); }
      });
      body.append(el("div", { class: "list-row" }, link, drop));
    }
  }
  node.append(el("div", { class: "list-body" }, body));
  return node;
}

/* ------------------------------------------------------------------ çizim */

function matches(list, query) {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("tr");
  if (list.name.toLocaleLowerCase("tr").includes(needle)) return true;
  return (list.items || []).some((item) =>
    (item.title || "").toLocaleLowerCase("tr").includes(needle) ||
    (item.url || "").toLowerCase().includes(needle));
}

export function render() {
  const root = $("#lists-root");
  if (!root) return;
  clear(root);

  const mine = S.lists.filter((list) => driveOfList(list.id) === S.drive);
  const visible = mine.filter((list) => matches(list, S.listQuery));
  if (!visible.length) {
    root.append(el("div", { class: "empty" },
      el("b", {}, mine.length ? "Eşleşen liste yok" : "Bu arşivde liste yok"),
      mine.length ? "Aramayı değiştirmeyi dene." : "Listeyi düzenleyip bu arşive taşıyabilirsin."));
    return;
  }

  // Gruplama: özel kategori varsa o, yoksa bağlantıların sitesi.
  const groups = new Map();
  for (const list of visible) {
    const entry = listMeta(list.id);
    const custom = entry.cat && S.meta.listCats.find((c) => c.id === entry.cat);
    const key = custom ? `c:${custom.id}` : `s:${siteOfList(list)}`;
    if (!groups.has(key)) {
      const site = custom ? null : siteOfList(list);
      groups.set(key, {
        name: custom ? custom.name : (site === "Other" ? "Diğer" : site),
        color: custom ? custom.color : siteBrand(site).glow,
        lists: []
      });
    }
    groups.get(key).lists.push(list);
  }

  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0].startsWith("c:") !== b[0].startsWith("c:")) return a[0].startsWith("c:") ? -1 : 1;
    return b[1].lists.length - a[1].lists.length;
  });

  for (const [, group] of ordered) {
    const section = el("section", {});
    section.append(el("div", { class: "list-cat-head" },
      el("span", { class: "cat-swatch", style: `background:${group.color}` }),
      el("h2", {}, group.name),
      el("span", { class: "rule" }),
      el("span", { class: "badge" }, `${group.lists.length} liste`)
    ));
    const grid = el("div", { class: "list-grid" });
    for (const list of group.lists) grid.append(card(list));
    section.append(grid);
    root.append(section);
  }
}

/* ------------------------------------------------------------------ veri */

export async function load() {
  try {
    const payload = await api.get("/api/lists");
    const lists = Array.isArray(payload && payload.lists) ? payload.lists : [];
    S.lists = lists
      .filter((list) => list && typeof list.id === "string")
      .sort((a, b) => (b.items || []).length - (a.items || []).length);
    // Mezar taşlarını sakla: düzenleme/silme geri yazarken snapshot'ta kalmalı,
    // yoksa uzak cihaz sildiğimiz listeyi diriltir.
    S.listTombstones = Array.isArray(payload && payload.tombstones) ? payload.tombstones : [];
  } catch (error) {
    // 404 = hiç senkron yapılmamış; hata değil, boş durum.
    if (error.status !== 404) toast(`Listeler alınamadı: ${error.message}`, "err");
    S.lists = [];
    S.listTombstones = [];
  }
  render();
  const badge = $("#chooser-lists");
  if (badge) badge.textContent = `${S.lists.length} liste`;
}

export function wire() {
  const search = $("#lists-search");
  search.addEventListener("input", () => { S.listQuery = search.value.trim(); render(); });

  $("#lists-collapse").addEventListener("click", (event) => {
    const anyOpen = S.lists.some((list) => !listMeta(list.id).collapsed);
    for (const list of S.lists) {
      const entry = listMeta(list.id);
      if (anyOpen) entry.collapsed = true; else delete entry.collapsed;
    }
    event.currentTarget.textContent = anyOpen ? "Hepsini aç" : "Hepsini kapat";
    saveMeta();
    render();
  });
}
