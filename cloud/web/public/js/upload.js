// Dosya ekleme penceresi.
//
// Akış bilinçli olarak iki aşamalı: önce bütün yüklemeler biter, sonra "bunlar
// nereye gitsin?" sorulur. Tersi (önce hedef, sonra yükleme) her seferinde
// aynı soruyu tekrarlatıyordu; oysa insan dosyaları sürükledikten sonra
// karar veriyor. Yükleme sırasında pencere kapatılabilir, iş arka planda sürer.

import { $, S, api, bwUploadHeaders, dialog, el, fmtBytes, toast } from "./core.js";

const MAX_PARALLEL = 2;

function putFile(file, onProgress) {
  return new Promise((resolve, reject) => {
    const name = file.name.replace(/[\\/]/g, "_").slice(0, 180);
    const url = `/api/media/${encodeURIComponent(name)}?drive=${encodeURIComponent(S.drive)}&site=Other`;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.withCredentials = true;
    // Bant genişliği sınırı sunucuda uygulanıyor; hangi hız olduğunu istek söyler.
    for (const [name, value] of Object.entries(bwUploadHeaders())) {
      xhr.setRequestHeader(name, value);
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

// Yükleme bitince: hedef site + kategori. İkisi de isteğe bağlı.
async function placeFiles(keys, reload) {
  const sites = ["Other", "RedGifs", "Reddit", "Instagram", "Scrolller", "Coomer"];
  const siteSelect = el("select");
  for (const site of sites) {
    siteSelect.append(el("option", { value: site }, site === "Other" ? "Diğer (olduğu gibi bırak)" : site));
  }

  const catSelect = el("select");
  catSelect.append(el("option", { value: "" }, "Kategorisiz"));
  for (const cat of S.meta.cats.filter((c) => c.drive === S.drive)) {
    catSelect.append(el("option", { value: cat.id }, cat.parent ? `— ${cat.name}` : cat.name));
  }

  await dialog({
    title: `${keys.length} dosya yüklendi`,
    build: (box) => {
      box.append(el("label", { class: "f" }, el("span", {}, "Site sekmesi"), siteSelect));
      box.append(el("label", { class: "f" }, el("span", {}, "Kategori"), catSelect));
    },
    buttons: [
      { label: "Şimdilik böyle kalsın", value: null },
      {
        label: "Uygula", kind: "primary",
        run: async () => {
          let finalKeys = keys;
          if (siteSelect.value && siteSelect.value !== "Other") {
            try {
              const result = await api.post("/api/media/bulk", {
                action: "move", keys, drive: S.drive, site: siteSelect.value
              });
              finalKeys = keys.map((key) => (result.moved && result.moved[key]) || key);
            } catch (error) {
              toast(`Taşınamadı: ${error.message}`, "err");
            }
          }
          if (catSelect.value) {
            for (const key of finalKeys) {
              const entry = S.meta.items[key] || (S.meta.items[key] = {});
              entry.cat = catSelect.value;
            }
            await api.put("/api/meta", S.meta).catch(() => {});
          }
          return null;
        }
      }
    ]
  });

  await reload();
}

/* ------------------------------------------------------------------ pencere */

export function openUpload(files, reload) {
  const queue = [...(files || [])];
  const listBox = el("div", { class: "up-list" });
  const input = $("#file-input");

  const drop = el("div", { class: "drop" },
    el("b", {}, "Dosyaları buraya sürükle"),
    el("small", {}, "veya tıklayıp seç — görsel ve video"));

  let running = 0;
  let started = 0;
  let done = 0;
  let failed = 0;
  const uploaded = [];
  let finishHook = null;

  const rowFor = (file) => {
    const bar = el("i", { class: "up-bar" });
    const pct = el("span", { class: "pc" }, "0%");
    const row = el("div", { class: "up-item" },
      el("span", { class: "nm" }, file.name),
      el("span", { class: "pc", style: "color:var(--text-faint)" }, fmtBytes(file.size)),
      pct, bar);
    listBox.append(row);
    return { row, bar, pct };
  };

  const maybeFinish = () => {
    if (running || queue.length) return;
    if (!started) return;
    if (finishHook) finishHook();
  };

  const pump = () => {
    while (running < MAX_PARALLEL && queue.length) {
      const file = queue.shift();
      const { row, bar, pct } = rowFor(file);
      running += 1;
      started += 1;
      putFile(file, (ratio) => {
        bar.style.width = `${Math.round(ratio * 100)}%`;
        pct.textContent = `${Math.round(ratio * 100)}%`;
      }).then((result) => {
        done += 1;
        row.classList.add("done");
        pct.textContent = "✓";
        bar.style.width = "100%";
        if (result && result.key) uploaded.push(result.key);
      }).catch(() => {
        failed += 1;
        row.classList.add("fail");
        pct.textContent = "✕";
      }).finally(() => {
        running -= 1;
        pump();
        maybeFinish();
      });
    }
  };

  const add = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => f.size > 0);
    if (!incoming.length) return;
    queue.push(...incoming);
    pump();
  };

  return dialog({
    title: "Dosya ekle",
    build: (box, close) => {
      drop.onclick = () => { input.value = ""; input.click(); };
      input.onchange = () => add(input.files);

      drop.addEventListener("dragover", (event) => {
        event.preventDefault();
        drop.classList.add("armed");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("armed"));
      drop.addEventListener("drop", (event) => {
        event.preventDefault();
        drop.classList.remove("armed");
        add(event.dataTransfer.files);
      });

      box.append(drop, listBox);

      finishHook = async () => {
        if (failed) toast(`${failed} dosya yüklenemedi`, "err");
        if (!uploaded.length) return;
        const keys = uploaded.splice(0, uploaded.length);
        close(null);
        await placeFiles(keys, reload);
      };

      if (queue.length) pump();
    },
    buttons: [{ label: "Kapat", value: null }]
  }).then(() => {
    input.onchange = null;
    if (done && !uploaded.length) return reload();
    return null;
  });
}

// Sayfanın herhangi bir yerine dosya sürüklenince pencere kendiliğinden açılır.
//
// "Yalnız dışarıdan gelen dosya" şartı iki kapıdan geçiyor: dataTransfer'da
// gerçekten Files olacak VE sürükleme bu sayfada başlamamış olacak. İkincisi
// şart, çünkü ızgaradaki bir kapağı tutup sürüklediğinde tarayıcı onu da dosya
// gibi ilan ediyor ve yükleme penceresi durduk yere açılıyordu.
export function wireDragDrop(reload) {
  let open = false;
  let internal = false;

  document.addEventListener("dragstart", () => { internal = true; }, true);
  document.addEventListener("dragend", () => { internal = false; }, true);

  window.addEventListener("dragenter", (event) => {
    if (internal) return;
    if (!event.dataTransfer || !Array.from(event.dataTransfer.types).includes("Files")) return;
    if (open) return;
    open = true;
    openUpload([], reload).then(() => { open = false; });
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    internal = false;
  });
}
