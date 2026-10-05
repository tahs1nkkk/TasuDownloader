// Dosya ekleme sihirbazı.
//
// Hedef *önce* seçiliyor, sonra dosyalar geliyor. "Tasu Arşiv"de (main) akış üç
// adımlı: (1) hangi site sekmesi, (2) hangi kategori, (3) dosyalar. Diğer
// arşivlerde site kavramı yok (yalnız dışarıdan dosya), o yüzden site adımı
// atlanır ve sihirbaz doğrudan kategoriyle başlar (site sabiten "Other").
// Böylece her yükleme doğrudan doğru yere iniyor — eskiden önce "Other"a
// yükleyip sonra taşıyorduk, o fazladan tur ve "sonra neredeydi?" belirsizliği
// kalktı. Yükleme sırasında pencere kapatılabilir, iş arka planda sürer; biten
// dosyalara seçilen kategori işlenir, orijinali yüklenen dosyadan (ağ yok)
// küçük resim üretilip depolanır ve sonda net bir durum özeti ("tamamlandı" /
// "şunlar yüklenemedi: …") gösterilir.

import { $, S, bwUploadHeaders, clear, dialog, el, fmtBytes, saveMeta, siteBrand } from "./core.js";
import { thumbFromFile } from "./media.js";

const MAX_PARALLEL = 2;

// Sekmedeki sırayla; "Other" en sonda ve "Diğer" olarak yazılıyor.
const SITE_ORDER = ["RedGifs", "Reddit", "Instagram", "Scrolller", "Coomer", "Other"];
const SITE_LABEL = { Other: "Diğer" };
const siteLabel = (site) => SITE_LABEL[site] || site;

function putFile(file, site, onProgress) {
  return new Promise((resolve, reject) => {
    const name = file.name.replace(/[\\/]/g, "_").slice(0, 180);
    const url = `/api/media/${encodeURIComponent(name)}`
      + `?drive=${encodeURIComponent(S.drive)}&site=${encodeURIComponent(site)}`;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.withCredentials = true;
    // Bant genişliği sınırı sunucuda uygulanıyor; hangi hız olduğunu istek söyler.
    for (const [header, value] of Object.entries(bwUploadHeaders())) {
      xhr.setRequestHeader(header, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({ ok: true }); }
      } else {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("ağ hatası"));
    xhr.send(file);
  });
}

/* ------------------------------------------------------------------- sihirbaz */

export function openUpload(files, reload) {
  const input = $("#file-input");
  // Site sekmeleri yalnız "Tasu Arşiv"e (main) özgü; diğer arşivlerde site
  // adımı atlanır ve bayt anahtarı sabiten "Other" altına yazılır.
  const hasSites = S.drive === "main";
  const state = {
    step: hasSites ? 1 : 2,
    site: hasSites ? null : "Other",
    cat: "",
    queue: [...(files || [])].filter((f) => f.size > 0),
    running: 0,
    started: 0,
    done: 0,
    failed: 0,
    uploaded: [],          // sunucudan dönen anahtarlar
    fails: [],             // { name, reason }
    finished: false,
    ui: null               // adım 3'te { listBox, status }
  };

  return dialog({
    title: "Dosya ekle",
    build: (box, close) => {
      const steps = el("div", { class: "wz-steps" });
      const body = el("div", { class: "wz-body" });
      const foot = el("div", { class: "wz-foot" });
      box.append(steps, body, foot);

      /* ---- yükleme makinesi (adım 3) — ilerleme doğrudan DOM'a işlenir ---- */

      const rowFor = (file) => {
        const bar = el("i", { class: "up-bar" });
        const pct = el("span", { class: "pc" }, "0%");
        const row = el("div", { class: "up-item" },
          el("span", { class: "nm" }, file.name),
          el("span", { class: "pc", style: "color:var(--text-faint)" }, fmtBytes(file.size)),
          pct, bar);
        state.ui.listBox.append(row);
        return { row, bar, pct };
      };

      const refreshStatus = () => {
        if (!state.ui) return;
        const host = state.ui.status;
        clear(host);
        if (state.running || state.queue.length) {
          host.className = "wz-status";
          const total = state.started + state.queue.length;
          host.append(el("span", {}, `Yükleniyor… ${state.done}/${total}`));
          return;
        }
        if (!state.started) return;
        if (!state.finished) {
          state.finished = true;
          renderFoot();                         // "Kapat" → "Bitti"
        }
        if (state.failed === 0) {
          host.className = "wz-status ok";
          host.append(el("span", {}, `Yükleme tamamlandı — ${state.done} dosya.`));
          return;
        }
        host.className = "wz-status err";
        host.append(el("b", {}, state.done
          ? `${state.done} dosya yüklendi, ${state.failed} dosya yüklenemedi:`
          : `${state.failed} dosya yüklenemedi:`));
        const list = el("ul", { class: "wz-fails" });
        for (const fail of state.fails) {
          list.append(el("li", {}, `${fail.name} — ${fail.reason}`));
        }
        host.append(list);
      };

      const pump = () => {
        while (state.running < MAX_PARALLEL && state.queue.length) {
          const file = state.queue.shift();
          const { row, bar, pct } = rowFor(file);
          state.running += 1;
          state.started += 1;
          refreshStatus();
          putFile(file, state.site, (ratio) => {
            bar.style.width = `${Math.round(ratio * 100)}%`;
            pct.textContent = `${Math.round(ratio * 100)}%`;
          }).then((result) => {
            state.done += 1;
            row.classList.add("done");
            pct.textContent = "✓";
            bar.style.width = "100%";
            if (result && result.key) {
              state.uploaded.push(result.key);
              // Baytlar zaten elde: kapağı yerel dosyadan (ağ yok) üret ve
              // /api/thumb'a yaz — ilk görüntülemede tam indirme fırtınası olmaz.
              thumbFromFile(file, result.key);
              if (state.cat) {
                const entry = S.meta.items[result.key] || (S.meta.items[result.key] = {});
                entry.cat = state.cat;
              }
            }
          }).catch((error) => {
            state.failed += 1;
            state.fails.push({ name: file.name, reason: error.message || "hata" });
            row.classList.add("fail");
            pct.textContent = "✕";
          }).finally(() => {
            state.running -= 1;
            pump();
            refreshStatus();
          });
        }
      };

      const addFiles = (fileList) => {
        const incoming = Array.from(fileList || []).filter((f) => f.size > 0);
        if (!incoming.length) return;
        state.queue.push(...incoming);
        pump();
      };

      /* ------------------------------------------------------------ çizim */

      const renderSteps = () => {
        clear(steps);
        // İç adım numaraları sabit (1=Site, 2=Kategori, 3=Yükle); non-main'de
        // Site elenip görünen numara sıradaki konuma göre yeniden veriliyor.
        const plan = hasSites
          ? [[1, "Site"], [2, "Kategori"], [3, "Yükle"]]
          : [[2, "Kategori"], [3, "Yükle"]];
        plan.forEach(([n, label], i) => {
          const cls = n === state.step ? "on" : (n < state.step ? "past" : "");
          steps.append(el("span", { class: `wz-step ${cls}` }, el("i", {}, String(i + 1)), label));
        });
      };

      const renderSite = () => {
        const hint = state.queue.length
          ? `Bu ${state.queue.length} dosya hangi site sekmesine gitsin?`
          : "Dosyalar hangi site sekmesine gitsin?";
        body.append(el("p", { class: "wz-hint" }, hint));
        const grid = el("div", { class: "wz-sites" });
        for (const site of SITE_ORDER) {
          const brand = siteBrand(site);
          grid.append(el("button", {
            type: "button",
            class: `wz-site ${state.site === site ? "on" : ""}`,
            style: `--chip-glow:${brand.glow}`,
            onclick: () => { state.site = site; render(); }
          }, el("span", { class: "wz-mark", html: brand.mark }), el("span", { class: "wz-name" }, siteLabel(site))));
        }
        body.append(grid);
      };

      const renderCat = () => {
        body.append(el("p", { class: "wz-hint" }, "Kategori seç (isteğe bağlı)."));
        const tree = el("div", { class: "wz-cats tree" });
        const mk = (id, name, depth) => el("button", {
          type: "button",
          class: state.cat === id ? "on" : "",
          style: depth ? `padding-left:${12 + depth * 18}px` : "",
          onclick: () => { state.cat = id; render(); }
        }, name);
        tree.append(mk("", "Kategorisiz", 0));
        const cats = S.meta.cats.filter((c) => c.drive === S.drive);
        // Her seviyede alt kategori olabilir; ağacı derinliğe göre girintili çiz.
        const addBranch = (cat, depth) => {
          tree.append(mk(cat.id, cat.name, depth));
          for (const kid of cats.filter((c) => c.parent === cat.id)) addBranch(kid, depth + 1);
        };
        for (const parent of cats.filter((c) => !c.parent)) addBranch(parent, 0);
        body.append(tree);
      };

      const renderUpload = () => {
        const catName = state.cat
          ? (S.meta.cats.find((c) => c.id === state.cat)?.name || "Kategori")
          : "Kategorisiz";
        if (hasSites) {
          const brand = siteBrand(state.site);
          body.append(el("div", { class: "wz-summary" },
            el("span", { class: "wz-mark sm", html: brand.mark }),
            el("span", { class: "wz-sum-txt" }, `${siteLabel(state.site)} · ${catName}`)));
        } else {
          body.append(el("div", { class: "wz-summary" },
            el("span", { class: "wz-sum-txt" }, catName)));
        }

        const drop = el("div", { class: "drop" },
          el("b", {}, "Dosyaları buraya sürükle"),
          el("small", {}, "veya tıklayıp seç — görsel ve video"));
        const listBox = el("div", { class: "up-list" });
        const status = el("div", { class: "wz-status" });
        state.ui = { listBox, status };

        drop.onclick = () => { input.value = ""; input.click(); };
        input.onchange = () => addFiles(input.files);
        drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("armed"); });
        drop.addEventListener("dragleave", () => drop.classList.remove("armed"));
        drop.addEventListener("drop", (event) => {
          event.preventDefault();
          event.stopPropagation();              // pencere işleyicisi ikinci sihirbaz açmasın
          drop.classList.remove("armed");
          addFiles(event.dataTransfer.files);
        });

        body.append(drop, listBox, status);
        pump();                                 // kuyruktaki dosyalar hemen başlasın
        refreshStatus();
      };

      const renderFoot = () => {
        clear(foot);
        const spacer = el("span", { class: "wz-spacer" });
        const btn = (label, kind, onclick, disabled) =>
          el("button", { type: "button", class: `vbtn ${kind || ""}`, disabled, onclick }, label);

        if (state.step === 1) {
          foot.append(
            btn("Vazgeç", "", () => close(null)),
            spacer,
            btn("İleri", "primary", () => { state.step = 2; render(); }, !state.site));
        } else if (state.step === 2) {
          foot.append(
            hasSites
              ? btn("Geri", "", () => { state.step = 1; render(); })
              : btn("Vazgeç", "", () => close(null)),
            spacer,
            btn("İleri", "primary", () => { state.step = 3; render(); }));
        } else {
          foot.append(
            btn("Geri", "", () => { state.step = 2; render(); }, state.started > 0),
            spacer,
            btn(state.finished ? "Bitti" : "Kapat", "primary", () => close(null)));
        }
      };

      const renderBody = () => {
        clear(body);
        if (state.step === 1) renderSite();
        else if (state.step === 2) renderCat();
        else renderUpload();
      };

      const render = () => { renderSteps(); renderBody(); renderFoot(); };
      render();
    },
    buttons: []
  }).then(async () => {
    input.onchange = null;
    if (!state.done) return;
    if (state.cat && state.uploaded.length) await saveMeta(true);
    await reload();
  });
}

// Sayfanın herhangi bir yerine dosya bırakılınca sihirbaz kendiliğinden açılır.
//
// Dosyalar kuyruğa alınır ama sihirbaz yine baştan (main'de site, diğerlerinde
// kategori) başlar: "önce hedefi seç" kuralı bozulmaz, sürükle-bırak kolaylığı
// da kalır.
// "Yalnız dışarıdan gelen dosya" şartı iki kapıdan geçiyor: dataTransfer'da
// gerçekten Files olacak VE sürükleme bu sayfada başlamamış olacak — ızgaradaki
// bir kapağı tutup sürüklemek yükleme penceresini açmasın.
export function wireDragDrop(reload) {
  let open = false;
  let internal = false;

  document.addEventListener("dragstart", () => { internal = true; }, true);
  document.addEventListener("dragend", () => { internal = false; }, true);

  const hasFiles = (event) =>
    event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files");

  window.addEventListener("dragover", (event) => {
    if (!internal && hasFiles(event)) event.preventDefault();
  });
  window.addEventListener("drop", (event) => {
    internal = false;
    if (!hasFiles(event)) return;
    event.preventDefault();
    // Zaten bir diyalog (sihirbaz dahil) açıksa yeni pencere açma: açık sihirbazın
    // kendi bırakma alanı dosyayı devralır, kapalıyken de başka diyaloğun üstüne
    // yükleme açılmaz.
    if (open || document.querySelector("#dialogs")?.classList.contains("on")) return;
    open = true;
    openUpload(Array.from(event.dataTransfer.files || []), reload).then(() => { open = false; });
  });
}
