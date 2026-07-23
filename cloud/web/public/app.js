/*
 * Tasu Arşiv ön yüzü.
 *
 * İki kaynaktan okur:
 *  - Listeler: bu sitenin kendi /api/lists ucu (Pages Functions → Supabase).
 *  - Medya: PC'deki medya sunucusu (Tailscale Funnel adresi), tarayıcıdan
 *    doğrudan. Token her istekte Bearer olarak gider; medya adresi ve token
 *    yalnız bu tarayıcının localStorage'ında durur.
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

  function show(view) {
    $("login").hidden = view !== "login";
    $("view-lists").hidden = view !== "lists";
    $("view-media").hidden = view !== "media";
    $("btn-logout").hidden = view === "login";
    $("tab-lists").classList.toggle("active", view === "lists");
    $("tab-media").classList.toggle("active", view === "media");
  }

  /* ------------------------------------------------------------------ giriş */

  async function tryLogin() {
    const token = $("token-input").value.trim();
    if (!token) return;
    const media = $("media-input").value.trim();
    const response = await fetch("/api/health", { headers: { Authorization: `Bearer ${token}` } })
      .catch(() => null);
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
    show("login");
  }

  /* ---------------------------------------------------------------- listeler */

  function esc(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  async function loadLists() {
    const root = $("lists-root");
    root.innerHTML = "";
    $("lists-empty").hidden = true;
    const response = await fetch("/api/lists", { headers: authHeaders() }).catch(() => null);
    if (response && response.status === 401) { logout(); return; }
    if (!response || (response.status !== 200 && response.status !== 404)) {
      root.innerHTML = `<p class="error">Listeler alınamadı (${response ? response.status : "ağ"}).</p>`;
      return;
    }
    const snapshot = response.status === 200 ? await response.json() : { lists: [] };
    const lists = (snapshot.lists || []).slice()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (!lists.length) {
      $("lists-empty").hidden = false;
      return;
    }
    for (const list of lists) {
      const block = document.createElement("div");
      block.className = "list-block";
      const items = (list.items || []).map((item) => {
        let host = "";
        try { host = new URL(item.url).host.replace(/^www\./, ""); } catch { host = ""; }
        return `<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
          <span class="title">${esc(item.title || item.url)}</span>
          <span class="host">${esc(host)}</span>
        </a>`;
      }).join("");
      block.innerHTML = `<div class="list-head">
          <h3>${esc(list.name)}</h3>
          <span>${(list.items || []).length} bağlantı</span>
        </div>${items}`;
      root.appendChild(block);
    }
  }

  /* ------------------------------------------------------------------ medya */

  function bytes(n) {
    if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
    if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
    return Math.max(1, Math.round(n / 1024)) + " KB";
  }

  function streamURL(name) {
    return `${store.mediaBase}/files/${encodeURIComponent(name)}?token=${encodeURIComponent(store.token)}`;
  }

  async function loadMedia() {
    const root = $("media-root");
    root.innerHTML = "";
    if (!store.mediaBase) {
      $("media-note").hidden = false;
      return;
    }
    $("media-note").hidden = true;
    const response = await fetch(`${store.mediaBase}/files`, { headers: authHeaders() }).catch(() => null);
    if (!response || !response.ok) {
      root.innerHTML = `<p class="error">Medya sunucusuna ulaşılamadı${response ? ` (${response.status})` : ""} — PC açık mı, funnel çalışıyor mu?</p>`;
      return;
    }
    const files = await response.json();
    if (!files.length) {
      root.innerHTML = '<p class="muted">Sunucu boş.</p>';
      return;
    }
    for (const file of files) {
      const item = document.createElement("div");
      item.className = "media-item";
      item.innerHTML = `<span class="kind">${file.kind === "video" ? "▶ video" : file.kind === "image" ? "🖼 görsel" : "dosya"}</span>
        <span class="name">${esc(file.name)}</span>
        <span class="meta"><span>${bytes(file.size)}</span><span>${new Date(file.mtime).toLocaleDateString("tr-TR")}</span></span>`;
      item.addEventListener("click", () => openViewer(file));
      root.appendChild(item);
    }
  }

  function openViewer(file) {
    const body = $("viewer-body");
    $("viewer-name").textContent = file.name;
    body.innerHTML = "";
    if (file.kind === "video") {
      const video = document.createElement("video");
      video.src = streamURL(file.name);
      video.controls = true;
      video.autoplay = true;
      body.appendChild(video);
    } else if (file.kind === "image") {
      const img = document.createElement("img");
      img.src = streamURL(file.name);
      body.appendChild(img);
    } else {
      const link = document.createElement("a");
      link.href = streamURL(file.name);
      link.textContent = "İndir";
      link.style.padding = "24px";
      body.appendChild(link);
    }
    $("viewer").showModal();
  }

  /* ------------------------------------------------------------------ olaylar */

  $("btn-login").addEventListener("click", tryLogin);
  $("token-input").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
  $("btn-logout").addEventListener("click", logout);
  $("tab-lists").addEventListener("click", () => { show("lists"); loadLists(); });
  $("tab-media").addEventListener("click", () => { show("media"); loadMedia(); });
  $("viewer-close").addEventListener("click", () => {
    $("viewer-body").innerHTML = "";
    $("viewer").close();
  });

  if (store.token) {
    show("lists");
    loadLists();
  } else {
    $("media-input").value = store.mediaBase;
    show("login");
  }
})();
