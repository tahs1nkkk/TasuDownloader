// Shared "add link to web" helper — injected before every site content script
// (right after common/settings.js). Lets the user file the current post as a
// link into one of their cloud lists, straight from the site, without
// downloading the media. Özellik D.
//
//   window.rgMakeWebButton(getMeta)  -> a styled <button>; on click it opens a
//        picker next to itself. getMeta() must return { url, title }.
//   window.rgAddToWeb(meta, { anchor }) -> opens the picker directly.
//
// The picker asks the background for the existing lists (the token lives there —
// the Worker cookie is SameSite=Lax so a content-script fetch would be
// unauthorised), then PUTs the chosen list back through the background too.
(() => {
  if (window.__rgWebLinkHelper) return;
  window.__rgWebLinkHelper = true;

  const MENU_ID = "rg-web-menu";
  const STYLE_ID = "rg-web-style";
  const TOAST_ID = "rg-web-toast";

  let lastX = window.innerWidth / 2;
  let lastY = window.innerHeight / 2;
  document.addEventListener("mousemove", (e) => { lastX = e.clientX; lastY = e.clientY; }, { passive: true, capture: true });
  document.addEventListener("pointerdown", (e) => { lastX = e.clientX; lastY = e.clientY; }, { passive: true, capture: true });

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Bulunulan sitenin adı — seçici yalnız o sitenin listelerini göstersin diye.
  // background.js'teki siteOfList ile aynı ölçüt (orada URL'den, burada konaktan).
  const SITE_HINTS = [
    [/redgifs\./i, "RedGifs"],
    [/reddit\.|redd\.it/i, "Reddit"],
    [/instagram\./i, "Instagram"],
    [/scrolller\./i, "Scrolller"],
    [/coomer\.|kemono\./i, "Coomer"]
  ];
  function currentSite() {
    const host = location.hostname || "";
    for (const [pattern, name] of SITE_HINTS) if (pattern.test(host)) return name;
    return "";
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .rg-web-btn {
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        box-sizing: border-box; border: 0; border-radius: 8px; cursor: pointer;
        padding: 6px 10px; background: #0f766e; color: #ecfeff;
        font: 600 12px/1 system-ui,-apple-system,Segoe UI,sans-serif;
        white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.35);
      }
      .rg-web-btn:hover { background: #0d9488; }
      .rg-web-btn:disabled { opacity: .6; cursor: default; }
      .rg-web-icon {
        box-sizing: border-box !important; margin: 0 !important; padding: 0 !important;
        width: var(--rg-web-size, 40px) !important; height: var(--rg-web-size, 40px) !important;
        display: grid; place-items: center !important;
        appearance: none !important; -webkit-appearance: none !important; outline: none !important;
        border: 0 !important; border-radius: 999px !important; color: #ecfeff !important;
        background: rgba(15,118,110,.95) !important; box-shadow: 0 6px 18px rgba(0,0,0,.48) !important;
        cursor: pointer !important; pointer-events: auto !important; z-index: 2147483647 !important;
      }
      .rg-web-icon:hover { background: #0d9488 !important; }
      .rg-web-icon svg { width: 56% !important; height: 56% !important; pointer-events: none !important; }
      #${MENU_ID} {
        position: fixed; z-index: 2147483647; min-width: 190px; max-width: 280px;
        max-height: 60vh; overflow: auto;
        background: #1e293b; border: 1px solid rgba(148,163,184,.22);
        border-radius: 10px; padding: 5px; box-shadow: 0 12px 34px rgba(0,0,0,.55);
        font: 500 12px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;
      }
      #${MENU_ID} .rg-wm-head { padding: 6px 10px 8px; color: #94a3b8; font-size: 11px; letter-spacing: .04em; }
      #${MENU_ID} .rg-wm-item {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        width: 100%; text-align: left; border: 0; border-radius: 6px;
        padding: 8px 10px; background: transparent; color: #e2e8f0; cursor: pointer;
      }
      #${MENU_ID} .rg-wm-item:hover { background: rgba(13,148,136,.35); }
      #${MENU_ID} .rg-wm-item .rg-wm-n { color: #94a3b8; font-size: 11px; font-weight: 700; }
      #${MENU_ID} .rg-wm-new { color: #5eead4; }
      #${MENU_ID} .rg-wm-sep { height: 1px; margin: 4px 6px; background: rgba(148,163,184,.18); }
      #${TOAST_ID} {
        position: fixed; z-index: 2147483647; left: 50%; bottom: 26px; transform: translateX(-50%);
        max-width: 82vw; padding: 10px 16px; border-radius: 10px;
        background: #0f172a; color: #e2e8f0; border: 1px solid rgba(148,163,184,.25);
        box-shadow: 0 12px 34px rgba(0,0,0,.55);
        font: 600 13px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;
      }
      #${TOAST_ID}.err { border-color: rgba(248,113,113,.6); color: #fecaca; }
    `;
    document.documentElement.appendChild(style);
  }

  function toast(text, isErr) {
    ensureStyle();
    const old = document.getElementById(TOAST_ID);
    if (old) old.remove();
    const box = document.createElement("div");
    box.id = TOAST_ID;
    if (isErr) box.className = "err";
    box.textContent = text;
    document.documentElement.appendChild(box);
    setTimeout(() => { if (box.isConnected) box.remove(); }, isErr ? 4200 : 2600);
  }

  function closeMenu() {
    const m = document.getElementById(MENU_ID);
    if (m) m.remove();
  }

  // background.js "sunucuya kaydedildi" bilgisini Windows bildirimi yerine
  // sayfanın altında toast olarak gösterir (özellik B, revize). Yalnız üst
  // çerçevede dinle ki iframe'li sitelerde (redgifs embed) tek mesaj çıksın.
  if (window.top === window && chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === "RG_CLOUD_TOAST") toast(message.text || "Sunucuya kaydedildi ✓");
    });
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (reply) => {
          if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
          resolve(reply || { ok: false, error: "yanıt yok" });
        });
      } catch (e) {
        resolve({ ok: false, error: (e && e.message) || String(e) });
      }
    });
  }

  async function submit(meta, { listId, newListName } = {}) {
    const reply = await send({
      type: "ADD_WEB_LINK",
      url: meta.url,
      title: meta.title || "",
      listId: listId || "",
      newListName: newListName || ""
    });
    if (reply && reply.ok) {
      toast(reply.duplicate ? `Bu bağlantı zaten listede: ${reply.listName}` : `Listeye eklendi: ${reply.listName}`);
    } else {
      toast(`Eklenemedi: ${(reply && reply.error) || "bilinmeyen hata"}`, true);
    }
  }

  // meta = { url, title }; opts.anchor = element to position under (optional).
  window.rgAddToWeb = async function rgAddToWeb(meta, opts = {}) {
    if (!meta || !meta.url) { toast("Bu öğe için bağlantı bulunamadı", true); return; }
    ensureStyle();
    closeMenu();

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    let left = clamp(lastX, 8, window.innerWidth - 200);
    let top = clamp(lastY, 8, window.innerHeight - 120);
    if (opts.anchor && opts.anchor.getBoundingClientRect) {
      const r = opts.anchor.getBoundingClientRect();
      left = clamp(r.left, 8, window.innerWidth - 200);
      top = clamp(r.bottom + 6, 8, window.innerHeight - 120);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      closeMenu();
      if (fn) fn();
    };

    const head = document.createElement("div");
    head.className = "rg-wm-head";
    head.textContent = "Yükleniyor…";
    menu.appendChild(head);
    document.documentElement.appendChild(menu);

    const onOutside = (e) => { if (!menu.contains(e.target)) finish(); };
    const onKey = (e) => { if (e.key === "Escape") finish(); };
    function cleanup() {
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
    }
    setTimeout(() => {
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);

    const reply = await send({ type: "GET_LISTS" });
    if (settled) return;
    if (!reply || !reply.ok) {
      head.textContent = reply && reply.error ? reply.error : "Listeler alınamadı";
      return;
    }

    const lists = Array.isArray(reply.lists) ? reply.lists : [];
    // Yalnız bulunulan sitenin listeleri. Site tanınmıyorsa (ör. redgifs embed'i
    // farklı bir konakta) hepsini göster ki kullanıcı takılıp kalmasın. Yeni
    // liste bu sitede açılır: eklenen ilk bağlantı onu bu siteye ait yapar.
    const site = currentSite();
    const scoped = site ? lists.filter((l) => (l.site || "") === site) : lists;
    head.textContent = site ? `Hangi ${site} listesine?` : "Hangi listeye?";

    const mkItem = (label, count, onClick, extraClass) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `rg-wm-item${extraClass ? ` ${extraClass}` : ""}`;
      const t = document.createElement("span");
      t.textContent = label;
      b.appendChild(t);
      if (count != null) {
        const n = document.createElement("span");
        n.className = "rg-wm-n";
        n.textContent = String(count);
        b.appendChild(n);
      }
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
      return b;
    };

    for (const l of scoped) {
      menu.appendChild(mkItem(l.name || "(adsız)", l.count, () => finish(() => submit(meta, { listId: l.id }))));
    }
    const sep = document.createElement("div");
    sep.className = "rg-wm-sep";
    menu.appendChild(sep);
    menu.appendChild(mkItem("➕ Yeni liste…", null, () => {
      const name = window.prompt("Yeni liste adı:", "");
      finish(() => {
        const clean = (name || "").trim();
        if (clean) submit(meta, { newListName: clean });
      });
    }, "rg-wm-new"));
  };

  function wireWebClick(btn, getMeta) {
    btn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      let meta = {};
      try { meta = getMeta() || {}; } catch { meta = {}; }
      window.rgAddToWeb(meta, { anchor: btn });
    });
  }

  // getMeta() -> { url, title }. Returns a ready-to-append pill button (in-flow).
  window.rgMakeWebButton = function rgMakeWebButton(getMeta) {
    ensureStyle();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rg-web-btn";
    btn.textContent = "＋ Web listesi";
    btn.title = "Bu gönderiyi web listesine bağlantı olarak ekle";
    wireWebClick(btn, getMeta);
    return btn;
  };

  // Round icon button that mirrors a site's overlay download buttons. The caller
  // positions it (parent host + inline left/top). `size` matches the neighbour.
  window.rgMakeWebIconButton = function rgMakeWebIconButton(getMeta, { size = 40 } = {}) {
    ensureStyle();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rg-web-icon";
    btn.title = "Bu gönderiyi web listesine ekle";
    btn.setAttribute("aria-label", btn.title);
    btn.style.setProperty("--rg-web-size", `${size}px`);
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="M12 8.5v5M9.5 11h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
    wireWebClick(btn, getMeta);
    return btn;
  };
})();
