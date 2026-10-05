// Shared, isolated feedback and download selection UI. No framework or polling.
(() => {
  const root = typeof globalThis === "undefined" ? window : globalThis;
  if (root.RG_UI || typeof document === "undefined") return;
  const buttonSelector = '.rg-ig-btn,#rg-ig-web,.rg-coomer-download,.rg-of-download,.rg-ripsnip-tile-button,#rg-ripsnip-helper-button,#rg-ripsnip-viewer-button,#rg-ripsnip-avatar-button,.rg-downloader-reddit-button,.rg-downloader-reddit-multi-button,#rg-scrolller-v2-button,#rg-scrolller-v2-web,.rg-web-icon,.rg-web-btn';
  const theme = `:is(${buttonSelector}){background:rgba(255,255,255,.95)!important;color:#263c56!important;border:1px solid #fff!important;border-radius:14px!important;box-shadow:0 3px 12px #13264326,inset 0 1px 0 #fff!important;backdrop-filter:none!important;transition:opacity 140ms ease,scale 160ms ease!important}
    :is(${buttonSelector}):hover{background:rgba(255,255,255,.95)!important;scale:1.04}
    #rg-folder-menu,#rg-ig-menu,#rg-web-menu{background:#f1f5fb!important;color:#22354e!important;border:1px solid #fff!important;border-radius:16px!important;backdrop-filter:none!important;box-shadow:0 6px 25px #142d5126!important}
    #rg-folder-menu button,#rg-ig-menu button,#rg-web-menu button{color:#22354e!important;background:#ffffffb8!important;border:1px solid #fff!important}
    #rg-folder-menu .rg-fm-head,#rg-web-menu .rg-wm-head,#rg-web-menu .rg-wm-n{color:#455870!important}
    @media(prefers-reduced-motion:reduce){:is(${buttonSelector}){transition:none!important;scale:1!important}}`;
  const uiCSS = `:host{all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;color-scheme:light!important}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}button:focus-visible{outline:3px solid #5286c3;outline-offset:3px}[hidden]{display:none!important}
    .toast{position:absolute;left:50%;bottom:max(22px,env(safe-area-inset-bottom));transform:translate(-50%,18px);opacity:0;max-width:min(500px,calc(100vw - 28px));padding:13px 17px;border:1px solid #fff;border-left:5px solid var(--state,#5487bc);border-radius:16px;background:#f0f6ff;color:#183350;font:600 13px/1.5 system-ui,sans-serif;box-shadow:0 8px 28px #15345426;transition:opacity 170ms ease,transform 170ms ease;overflow-wrap:anywhere;pointer-events:none}
    .toast[data-level=success]{--state:#2c9566;background:#eaf8ef;color:#174b34}.toast[data-level=error]{--state:#c34659;background:#fff0f2;color:#7a2030}.toast[data-level=warning]{--state:#b78325;background:#fff7e7;color:#6f4b0e}.toast.show{opacity:1;transform:translate(-50%,0)}
    .picker{position:absolute;width:min(432px,calc(100vw - 24px));padding:14px;background:#f1f5fc;border:1px solid #fff;border-radius:20px;box-shadow:0 12px 40px #10213f40;pointer-events:auto;font:13px/1.4 system-ui,sans-serif;color:#20324b;animation:enter 170ms ease;overflow:auto;max-height:calc(100vh - 24px)}
    .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:5px;max-height:340px;overflow:auto}
    .item{position:relative;aspect-ratio:1;min-width:0;padding:0;border:2px solid #fff;border-radius:12px;overflow:hidden;background:#dce5f1;transition:scale 150ms ease;box-shadow:none;color:#304c6e}.item:hover{scale:1.03}.item[aria-pressed=true]{border-color:#38a874;box-shadow:0 0 0 1px #62cf9c,0 0 9px #3fb98280}.item img{width:100%;height:100%;object-fit:cover;display:block}.item .check{position:absolute;left:5px;top:5px;width:18px;height:18px;border-radius:50%;background:#218d5a;color:white;font-size:12px;display:grid;place-items:center}.item[aria-pressed=false] .check{display:none}.kind{position:absolute;right:5px;bottom:5px;width:24px;height:24px;display:grid;place-items:center;border:1px solid white;border-radius:8px;background:#fffffff0;color:#263b53}.kind svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .actions{display:flex;gap:8px;margin-top:13px}.actions button{flex:1;border:1px solid white;border-radius:12px;background:#fff;color:#223b58;padding:10px;font-weight:600}.actions .download{background:#e3f4e9;color:#20563b}.actions button:disabled{opacity:.5;cursor:default}
    @keyframes enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;
  let host, shadow, toastNode, toastTimer, pickerClose, lastText = "", lastTime = 0;
  function installTheme(target = document) {
    if (target.getElementById?.("rg-glass-theme")) return;
    const style = document.createElement("style");
    style.id = "rg-glass-theme"; style.textContent = theme;
    (target.documentElement || target).append(style);
  }
  function ensure() {
    const parent = document.fullscreenElement || document.documentElement;
    if (!host?.isConnected) {
      host = document.createElement("div"); host.id = "rg-feedback-host";
      shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style"); style.textContent = uiCSS;
      toastNode = document.createElement("div"); toastNode.className = "toast"; toastNode.setAttribute("role", "status");
      shadow.append(style, toastNode);
    }
    if (host.parentElement !== parent) parent.append(host);
  }
  function levelFor(text, level) {
    if (/error|err|fail/.test(level)) return "error";
    if (/warn|cancel|skip/.test(level)) return "warning";
    if (/started|başlat|indiriliyor|download started/i.test(text)) return "info";
    return /done|success|ok|passed/.test(level) ? "success" : "info";
  }
  function toast(text, level = "info") {
    if (!text) return;
    // Embedded RedGifs players must not each draw a copy of the tab notification.
    if (root.top && root.top !== root && /(^|\.)redgifs\.com$/i.test(location.hostname)) return;
    text = String(text).slice(0, 600);
    if (text === lastText && Date.now() - lastTime < 600) return;
    lastText = text; lastTime = Date.now();
    ensure(); clearTimeout(toastTimer);
    toastNode.classList.remove("show");
    toastNode.textContent = text; toastNode.dataset.level = levelFor(text, level);
    // Commit the hidden start state once per notification, never in a scroll loop.
    void toastNode.offsetHeight;
    toastNode.classList.add("show");
    toastTimer = setTimeout(() => toastNode?.classList.remove("show"), toastNode.dataset.level === "error" ? 5500 : 3200);
  }
  function safeURL(value) {
    if (!value || typeof value !== "string") return "";
    try { const url = new URL(value, location.href); return /^https?:$/.test(url.protocol) ? url.href : ""; } catch { return ""; }
  }
  function chooseMedia(anchor, values, title = "İndirilecek medyalar") {
    pickerClose?.(null);
    const seen = new Set();
    const items = values.map((item) => typeof item === "string" ? { url: item } : { ...item }).filter((item) => {
      item.url = safeURL(item.url);
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url); return true;
    });
    if (!items.length) { toast("İndirilebilir medya bulunamadı.", "warning"); return Promise.resolve(null); }
    ensure();
    return new Promise((resolve) => {
      const previousFocus = document.activeElement;
      const selected = new Set(items.map((_, i) => i));
      const panel = document.createElement("section"); panel.className = "picker";
      panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", title);
      const grid = document.createElement("div"); grid.className = "grid";
      const actions = document.createElement("div"); actions.className = "actions";
      const download = document.createElement("button"); download.type = "button"; download.className = "download";
      const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "İptal";
      const update = () => { download.textContent = `İndir (${selected.size})`; download.disabled = !selected.size; };
      for (const [i, item] of items.entries()) {
        const button = document.createElement("button"); button.type = "button"; button.className = "item";
        button.setAttribute("aria-label", `${i + 1}. medya`); button.setAttribute("aria-pressed", "true");
        const isVideo = item.kind === "video" || /\.(mp4|webm|m3u8)(?:[?#]|$)/i.test(item.url);
        const preview = safeURL(item.thumbnail || (!isVideo ? item.url : ""));
        if (preview) {
          const img = document.createElement("img"); img.src = preview; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
          img.addEventListener("error", () => { img.remove(); button.prepend(isVideo ? "▶" : "▧"); }, { once: true });
          button.append(img);
        } else button.append(isVideo ? "▶" : "▧");
        const kind = document.createElement("span"); kind.className = "kind"; kind.title = isVideo ? "Video" : "Fotoğraf"; kind.setAttribute("aria-hidden", "true");
        kind.innerHTML = isVideo ? '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="12" height="14" rx="3"/><path d="m15 9 6-3v12l-6-3z"/></svg>' : '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/></svg>';
        button.setAttribute("aria-label", `${i + 1}. medya · ${isVideo ? "Video" : "Fotoğraf"}`);
        const check = document.createElement("span"); check.className = "check"; check.textContent = "✓";
        button.append(kind, check);
        button.addEventListener("click", () => { selected.has(i) ? selected.delete(i) : selected.add(i); button.setAttribute("aria-pressed", String(selected.has(i))); update(); });
        grid.append(button);
      }
      actions.append(download, cancel); panel.append(grid, actions); shadow.append(panel); update();
      const position = () => {
        if (anchor && !anchor.isConnected) { finish(null); return; }
        const r = anchor?.getBoundingClientRect() || { left: innerWidth / 2 - 160, top: innerHeight / 2, bottom: innerHeight / 2 };
        const width = panel.offsetWidth, height = panel.offsetHeight;
        panel.style.left = `${Math.max(12, Math.min(r.left, innerWidth - width - 12))}px`;
        panel.style.top = `${Math.max(12, Math.min(r.top >= height + 20 ? r.top - height - 10 : r.bottom + 10, innerHeight - height - 12))}px`;
      };
      let finished = false;
      function finish(result) {
        if (finished) return; finished = true;
        panel.remove(); pickerClose = null;
        document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", keydown, true);
        window.removeEventListener("scroll", position, true); window.removeEventListener("resize", position);
        (anchor?.isConnected ? anchor : previousFocus)?.focus?.({ preventScroll: true });
        if (result === null) toast("İndirme iptal edildi.", "warning");
        resolve(result);
      }
      const outside = (event) => { if (!event.composedPath().includes(host) && !event.composedPath().includes(anchor)) finish(null); };
      const keydown = (event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(null); }
        if (event.key === "Tab") {
          const buttons = [...panel.querySelectorAll("button:not(:disabled)")];
          const index = buttons.indexOf(shadow.activeElement);
          event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      };
      download.addEventListener("click", () => finish(items.filter((_, i) => selected.has(i))));
      cancel.addEventListener("click", () => finish(null));
      panel.addEventListener("pointerdown", (event) => event.stopPropagation());
      document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", keydown, true);
      window.addEventListener("scroll", position, { capture: true, passive: true }); window.addEventListener("resize", position);
      pickerClose = finish; position(); download.focus({ preventScroll: true });
    });
  }
  root.RG_UI = Object.freeze({ toast, chooseMedia, installTheme, get busy() { return !!pickerClose; } });
  if (document.documentElement) installTheme();
  document.addEventListener("fullscreenchange", () => { if (host) ensure(); });
  if (typeof chrome !== "undefined") chrome.runtime?.onMessage?.addListener((message) => {
    if (message.type === "RG_UI_DOWNLOAD_STATUS" && message.targetTabId != null) {
      chrome.tabs?.getCurrent?.(tab => { if (tab?.id === message.targetTabId) toast(message.text, message.level); });
      return;
    }
    if (message.type === "RG_UI_DOWNLOAD_STATUS" || message.type === "RG_HELPER_STATUS") toast(message.text, message.level || message.state);
    if (message.type === "RG_CLOUD_TOAST") toast(message.text, "success");
  });
})();
