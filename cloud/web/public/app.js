/*
 * Tasu Arşiv ön yüzü.
 *
 * İki kaynaktan okur:
 *  - Listeler: bu sitenin kendi /api/lists ucu (Pages Functions → Supabase).
 *  - Medya: PC'deki medya sunucusu (Tailscale Funnel adresi), tarayıcıdan
 *    doğrudan — yükleme ve silme dahil. Token her istekte Bearer olarak gider;
 *    medya adresi ve token yalnız bu tarayıcının localStorage'ında durur.
 *
 * Bilinçli olarak framework'süz: iki görünümlü kişisel bir site için Next/React
 * bundle'ı taşımak, "en az bağımlılık" kuralının tam tersi olurdu.
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const store = {
    get token() { return localStorage.getItem("tasuToken") || ""; },
    set token(v) { v ? localStorage.setItem("tasuToken", v) : localStorage.removeItem("tasuToken"); },
    get mediaBase() { return (localStorage.getItem("tasuMedia") || "").replace(/\/+$/, ""); },
    set mediaBase(v) { v ? localStorage.setItem("tasuMedia", v) : localStorage.removeItem("tasuMedia"); }
  };
  const authHeaders = () => ({ Authorization: `Bearer ${store.token}` });

  /* ---------------------------------------------------------------- durum */

  // Uygulamadaki site renkleriyle aynı; bilinmeyen host'a isminden türetilen
  // sabit bir renk düşer, böylece her satırın kimliği olur.
  const SITE_TINTS = {
    "redgifs.com": "#FF3B5C",
    "reddit.com": "#FF4500",
    "scrolller.com": "#3D8BFD",
    "coomer.st": "#22C55E",
    "instagram.com": "#E1306C"
  };

  let listsCache = [];
  let mediaCache = [];
  let mediaKind = "";
  let mediaNewestFirst = true;

  /* ---------------------------------------------------------------- yardımcı */

  function esc(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  }

  function bytes(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    return Math.max(1, Math.round(n / 1024)) + " KB";
  }

  function hostOf(url) {
    try { return new URL(url).host.replace(/^www\./, ""); } catch { return ""; }
  }

  function tintFor(host) {
    const base = Object.keys(SITE_TINTS).find((h) => host === h || host.endsWith("." + h));
    if (base) return SITE_TINTS[base];
    let hash = 0;
    for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${hash % 360} 45% 55%)`;
  }

  let toastTimer = 0;
  function toast(message, kind) {
    const el = $("toast");
    el.textContent = message;
    el.className = kind || "";
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function streamURL(name) {
    return `${store.mediaBase}/files/${encodeURIComponent(name)}?token=${encodeURIComponent(store.token)}`;
  }

  function skeletons(root, count) {
    root.innerHTML = "";
    for (let i = 0; i < count; i += 1) {
      const sk = document.createElement("div");
      sk.className = "skeleton";
      root.appendChild(sk);
    }
  }

  function emptyState(root, title, detail) {
    root.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>${esc(title)}</b>${esc(detail)}</div>`;
  }

  /* ---------------------------------------------------------------- görünüm */

  function show(view) {
    $("login").hidden = view !== "login";
    $("view-lists").hidden = view !== "lists";
    $("view-media").hidden = view !== "media";
    $("btn-logout").hidden = view === "login";
    $("tab-lists").setAttribute("aria-selected", String(view === "lists"));
    $("tab-media").setAttribute("aria-selected", String(view === "media"));
  }

  /* ---------------------------------------------------------------- giriş */

  async function tryLogin() {
    const token = $("token-input").value.trim();
    if (!token) return;
    const media = $("media-input").value.trim();
    $("btn-login").disabled = true;
    const response = await fetch("/api/health", { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => null);
    $("btn-login").disabled = false;
    if (!response || !response.ok) {
      $("login-error").hidden = false;
      $("login-error").textContent = response && response.status === 401
        ? "Anahtar yanlış."
        : "Siteye ulaşılamadı — ortam değişkenleri ayarlı mı?";
      return;
    }
    store.token = token;
    if (media) store.mediaBase = media;
    show("lists");
    loadLists();
  }

  function logout() {
    store.token = "";
    $("media-input").value = store.mediaBase;
    show("login");
  }

  /* ---------------------------------------------------------------- listeler */

  function renderLists() {
    const root = $("lists-root");
    const query = $("lists-search").value.trim().toLowerCase();
    root.innerHTML = "";

    const lists = listsCache
      .filter((list) => !query
        || list.name.toLowerCase().includes(query)
        || (list.items || []).some((i) => (i.title || i.url).toLowerCase().includes(query)))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    if (!lists.length) {
      emptyState(root, query ? "Eşleşme yok" : "Henüz liste yok",
        query ? "Aramayı temizleyip tekrar dene." : "Uygulamada oluşturduğun listeler burada görünür.");
      return;
    }

    for (const list of lists) {
      const block = document.createElement("div");
      block.className = "list-block";
      const items = (list.items || [])
        .filter((i) => !query || (i.title || i.url).toLowerCase().includes(query)
          || list.name.toLowerCase().includes(query))
        .map((item) => {
          const host = hostOf(item.url);
          return `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
            <span class="dot" style="background:${tintFor(host)}"></span>
            <span class="title">${esc(item.title || item.url)}</span>
            <span class="host">${esc(host)}</span>
          </a>`;
        }).join("");
      const when = list.updatedAt ? new Date(list.updatedAt).toLocaleDateString("tr-TR") : "";
      block.innerHTML = `<div class="list-head">
          <h3>${esc(list.name)}</h3>
          <span>${(list.items || []).length} bağlantı · ${esc(when)}</span>
        </div>${items}`;
      root.appendChild(block);
    }
  }

  async function loadLists() {
    skeletons($("lists-root"), 2);
    const response = await fetch("/api/lists", { headers: authHeaders() }).catch(() => null);
    if (response && response.status === 401) { logout(); return; }
    if (!response || (response.status !== 200 && response.status !== 404)) {
      emptyState($("lists-root"), "Listeler alınamadı",
        `Sunucu ${response ? response.status : "ağ hatası"} döndürdü.`);
      return;
    }
    const snapshot = response.status === 200 ? await response.json() : { lists: [] };
    listsCache = snapshot.lists || [];
    renderLists();
  }

  /* ---------------------------------------------------------------- medya */

  function renderMedia() {
    const root = $("media-root");
    const query = $("media-search").value.trim().toLowerCase();
    root.innerHTML = "";

    let files = mediaCache.filter((f) =>
      (!mediaKind || f.kind === mediaKind) && (!query || f.name.toLowerCase().includes(query)));
    files = files.sort((a, b) => mediaNewestFirst ? b.mtime - a.mtime : a.size < b.size ? 1 : -1);

    if (!files.length) {
      emptyState(root, query || mediaKind ? "Eşleşme yok" : "Sunucu boş",
        query || mediaKind ? "Filtreyi gevşetip tekrar dene."
          : "Uygulamadan indirdiklerin ya da buraya bıraktıkların burada listelenir.");
      return;
    }

    for (const file of files) {
      const card = document.createElement("div");
      card.className = "media-card";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", file.name);
      const thumb = file.kind === "image"
        ? `<img src="${streamURL(file.name)}" alt="" loading="lazy">`
        : `<span class="glyph">${file.kind === "video" ? "▶" : "📄"}</span>`;
      card.innerHTML = `<div class="thumb">
          ${thumb}
          <span class="badge ${file.kind}">${file.kind === "video" ? "VİDEO" : file.kind === "image" ? "GÖRSEL" : "DOSYA"}</span>
        </div>
        <div class="meta">
          <span class="name">${esc(file.name)}</span>
          <span class="sub"><span>${bytes(file.size)}</span><span>${new Date(file.mtime).toLocaleDateString("tr-TR")}</span></span>
        </div>`;
      const open = () => openViewer(file);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      root.appendChild(card);
    }
  }

  function renderStats() {
    const total = mediaCache.reduce((sum, f) => sum + f.size, 0);
    $("stat-count").textContent = String(mediaCache.length);
    $("stat-size").textContent = bytes(total);
    $("media-stats").hidden = false;
  }

  async function loadMedia() {
    if (!store.mediaBase) {
      $("media-note").hidden = false;
      $("media-stats").hidden = true;
      $("media-root").innerHTML = "";
      return;
    }
    $("media-note").hidden = true;
    skeletons($("media-root"), 8);
    const [filesRes, healthRes] = await Promise.all([
      fetch(`${store.mediaBase}/files`, { headers: authHeaders() }).catch(() => null),
      fetch(`${store.mediaBase}/health`, { headers: authHeaders() }).catch(() => null)
    ]);
    if (!filesRes || !filesRes.ok) {
      $("media-stats").hidden = true;
      emptyState($("media-root"), "Medya sunucusuna ulaşılamadı",
        `${filesRes ? "HTTP " + filesRes.status : "Ağ hatası"} — PC açık mı, funnel çalışıyor mu?`);
      return;
    }
    mediaCache = await filesRes.json();
    renderStats();
    if (healthRes && healthRes.ok) {
      const health = await healthRes.json();
      $("stat-free").textContent = health.freeBytes ? bytes(health.freeBytes) : "–";
    }
    renderMedia();
  }

  /* ---------------------------------------------------------------- yükleme */

  // fetch yükleme ilerlemesi vermez; XHR verir. Kişisel arşivde "yüzde kaç"
  // sorusunun cevabı olmalı.
  function uploadOne(file) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `${store.mediaBase}/files/${encodeURIComponent(file.name)}`);
      xhr.setRequestHeader("Authorization", `Bearer ${store.token}`);
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          toast(`${file.name}: %${Math.round((e.loaded / e.total) * 100)}`);
        }
      });
      xhr.addEventListener("load", () =>
        xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
      xhr.addEventListener("error", () => reject(new Error("ağ hatası")));
      xhr.send(file);
    });
  }

  async function uploadFiles(fileList) {
    if (!store.mediaBase) {
      toast("Önce medya sunucusu adresi gerekli", "err");
      return;
    }
    const files = [...fileList];
    let done = 0;
    for (const file of files) {
      try {
        await uploadOne(file);
        done += 1;
      } catch (error) {
        toast(`${file.name}: ${error.message}`, "err");
      }
    }
    if (done) toast(`${done} dosya yüklendi`, "ok");
    loadMedia();
  }

  /* ---------------------------------------------------------------- inceleme */

  let viewing = null;

  function openViewer(file) {
    viewing = file;
    const body = $("viewer-body");
    $("viewer-name").textContent = file.name;
    $("viewer-download").href = streamURL(file.name);
    body.innerHTML = "";
    if (file.kind === "video") {
      const video = document.createElement("video");
      video.src = streamURL(file.name);
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      body.appendChild(video);
    } else if (file.kind === "image") {
      const img = document.createElement("img");
      img.src = streamURL(file.name);
      img.alt = file.name;
      body.appendChild(img);
    }
    $("viewer").showModal();
  }

  function closeViewer() {
    $("viewer-body").innerHTML = "";
    viewing = null;
    $("viewer").close();
  }

  async function deleteViewing() {
    if (!viewing) return;
    if (!confirm(`"${viewing.name}" sunucudan silinsin mi? Geri alınamaz.`)) return;
    const response = await fetch(`${store.mediaBase}/files/${encodeURIComponent(viewing.name)}`, {
      method: "DELETE",
      headers: authHeaders()
    }).catch(() => null);
    if (response && response.ok) {
      toast("Silindi", "ok");
      closeViewer();
      loadMedia();
    } else {
      toast("Silinemedi", "err");
    }
  }

  /* ---------------------------------------------------------------- olaylar */

  $("btn-login").addEventListener("click", tryLogin);
  $("token-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
  $("media-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
  $("btn-logout").addEventListener("click", logout);

  $("tab-lists").addEventListener("click", () => { show("lists"); loadLists(); });
  $("tab-media").addEventListener("click", () => { show("media"); loadMedia(); });

  $("lists-search").addEventListener("input", renderLists);
  $("lists-refresh").addEventListener("click", loadLists);

  $("media-search").addEventListener("input", renderMedia);
  for (const chip of document.querySelectorAll(".chip")) {
    chip.addEventListener("click", () => {
      mediaKind = chip.dataset.kind;
      for (const other of document.querySelectorAll(".chip")) {
        other.setAttribute("aria-pressed", String(other === chip));
      }
      renderMedia();
    });
  }
  $("media-sort").addEventListener("click", () => {
    mediaNewestFirst = !mediaNewestFirst;
    $("media-sort").textContent = mediaNewestFirst ? "Yeni → eski" : "Büyük → küçük";
    renderMedia();
  });

  $("btn-pick").addEventListener("click", () => $("file-input").click());
  $("file-input").addEventListener("change", (e) => {
    if (e.target.files.length) uploadFiles(e.target.files);
    e.target.value = "";
  });
  const drop = $("drop-zone");
  for (const type of ["dragenter", "dragover"]) {
    drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add("armed"); });
  }
  for (const type of ["dragleave", "drop"]) {
    drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove("armed"); });
  }
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  });

  $("viewer-close").addEventListener("click", closeViewer);
  $("viewer-delete").addEventListener("click", deleteViewing);
  $("viewer").addEventListener("close", () => { $("viewer-body").innerHTML = ""; });

  /* ---------------------------------------------------------------- açılış */

  if (store.token) {
    show("lists");
    loadLists();
  } else {
    $("media-input").value = store.mediaBase;
    show("login");
  }
})();
