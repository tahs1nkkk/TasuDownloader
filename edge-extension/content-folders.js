// Generated from shared/ui/folders.js; run npm run build:shared. Do not edit.
// Shared source; platform packages are generated from this file.
// Shared folder chooser — injected before every site content script.
// Exposes window.rgChooseFolder(): shows a small menu at the cursor listing the
// user's custom folders and resolves to the chosen folder name.
//   resolves ""    -> "Ana klasör" (default downloadPath)
//   resolves name  -> that custom folder
//   resolves null  -> cancelled (do not download)
// If the user has no custom folders configured, resolves "" immediately.
(() => {
  if (window.__rgFoldersHelper) return;
  window.__rgFoldersHelper = true;

  const { SETTINGS_KEY } = globalThis.RG_SETTINGS;
  const MENU_ID = "rg-folder-menu";
  const STYLE_ID = "rg-folder-style";

  let folders = [];
  let lastX = window.innerWidth / 2;
  let lastY = window.innerHeight / 2;

  function loadFolders() {
    chrome.storage.local.get(SETTINGS_KEY, (items) => {
      const s = (items && items[SETTINGS_KEY]) || {};
      folders = Array.isArray(s.mediaFolders) ? s.mediaFolders.filter(Boolean) : [];
    });
  }
  loadFolders();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SETTINGS_KEY]) loadFolders();
  });

  document.addEventListener("mousemove", (e) => { lastX = e.clientX; lastY = e.clientY; }, { passive: true, capture: true });
  document.addEventListener("pointerdown", (e) => { lastX = e.clientX; lastY = e.clientY; }, { passive: true, capture: true });

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${MENU_ID} {
        position: fixed; z-index: 2147483647; min-width: 160px; max-height: 60vh; overflow: auto;
        background: #1e293b; border: 1px solid rgba(148,163,184,.22);
        border-radius: 10px; padding: 5px; box-shadow: 0 12px 34px rgba(0,0,0,.55);
        font: 500 12px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;
      }
      #${MENU_ID} .rg-fm-head {
        padding: 6px 10px 8px; color: #94a3b8; font-size: 11px; letter-spacing: .04em;
      }
      #${MENU_ID} .rg-fm-item {
        position: relative; display: block; width: 100%; text-align: left; border: 0; border-radius: 6px;
        padding: 8px 10px 8px 20px; background: transparent; color: #e2e8f0; cursor: pointer;
      }
      #${MENU_ID} .rg-fm-item::before {
        content: ""; position: absolute; left: 8px; top: 8px; bottom: 8px;
        width: 3px; border-radius: 999px; background: var(--rg-fm-color, #64748b);
      }
      #${MENU_ID} .rg-fm-item:hover { background: rgba(37,99,235,.35); }
      #${MENU_ID} .rg-fm-sep { height: 1px; margin: 4px 6px; background: rgba(148,163,184,.18); }
    `;
    document.documentElement.appendChild(style);
  }

  function colorFor(label) {
    const colors = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#22d3ee", "#f97316"];
    let hash = 0;
    for (const ch of String(label || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return colors[hash % colors.length];
  }

  function closeMenu() {
    const m = document.getElementById(MENU_ID);
    if (m) m.remove();
  }

  window.rgChooseFolder = function rgChooseFolder() {
    return new Promise((resolve) => {
      const list = folders.slice();
      if (!list.length) { resolve(""); return; }

      ensureStyle();
      closeMenu();

      const menu = document.createElement("div");
      menu.id = MENU_ID;
      menu.style.left = `${clamp(lastX, 8, window.innerWidth - 180)}px`;
      menu.style.top = `${clamp(lastY, 8, window.innerHeight - Math.min(400, (list.length + 2) * 40))}px`;

      let settled = false;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        cleanup();
        closeMenu();
        resolve(val);
      };

      const head = document.createElement("div");
      head.className = "rg-fm-head";
      head.textContent = "Hangi klasöre?";
      menu.appendChild(head);

      const mk = (label, val, color) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rg-fm-item";
        b.textContent = label;
        b.style.setProperty("--rg-fm-color", color);
        b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); finish(val); });
        return b;
      };

      menu.appendChild(mk("Ana klasör", "", "#64748b"));
      const sep = document.createElement("div");
      sep.className = "rg-fm-sep";
      menu.appendChild(sep);
      for (const f of list) menu.appendChild(mk(f, f, colorFor(f)));

      document.documentElement.appendChild(menu);

      const onOutside = (e) => { if (!menu.contains(e.target)) finish(null); };
      const onKey = (e) => { if (e.key === "Escape") finish(null); };
      const onScroll = () => finish(null);
      function cleanup() {
        document.removeEventListener("pointerdown", onOutside, true);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("scroll", onScroll, true);
      }
      setTimeout(() => {
        document.addEventListener("pointerdown", onOutside, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("scroll", onScroll, true);
      }, 0);
    });
  };
})();
