(() => {
  if (window.__rgRipsnipHelperLoaded) return;
  window.__rgRipsnipHelperLoaded = true;

  const BUTTON_ID = "rg-ripsnip-helper-button";
  const STATUS_ID = "rg-ripsnip-helper-status";
  const VIEWER_BUTTON_ID = "rg-ripsnip-viewer-button";
  const VIEWER_WEB_ID = "rg-ripsnip-viewer-web"; // özellik D: "web listesi"
  const AVATAR_BUTTON_ID = "rg-ripsnip-avatar-button";
  const TILE_BUTTON_CLASS = "rg-ripsnip-tile-button";
  const TILE_READY_ATTR = "data-rg-ripsnip-tile-ready";
  const STORAGE_KEY = "rgHelperButtonPosition";
  const PENDING_PROFILE_KEY = "rgRipsnipPendingProfileTile";
  const PROFILE_RETURN_KEY = "rgRipsnipProfileReturnUrl";
  const PROFILE_WATCH_KEY = "rgRipsnipProfileWatchUrl";
  const { SETTINGS_KEY, DEFAULT_SETTINGS } = globalThis.RG_SETTINGS;
  let capturedClipboardText = "";
  let dragState = null;
  let suppressNextClick = false;
  let pendingProfileResumeStarted = false;
  let statusTimer = null;
  let settings = { ...DEFAULT_SETTINGS };
  // Folder picked for the current user-initiated download (set by run* handlers).
  let chosenFolder = "";

  // On a niche page (/niches/{name}) downloads auto-sort into a per-niche
  // subfolder — no manual chooser needed.
  function currentNicheFolder() {
    const m = location.pathname.match(/\/niches\/([^/?#]+)/i);
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }

  // Sayfadaki RedGifs kullanıcı adı — profil (/users/{ad}) URL'sinden, yoksa
  // izleme sayfasında (tek yaratıcı) DOM'daki yaratıcı bağlantısından.
  function currentRedgifsUser() {
    const m = location.pathname.match(/\/users\/([^/?#]+)/i);
    if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
    if (/^\/(?:watch|ifr)\//i.test(location.pathname)) {
      const a = document.querySelector("a[href^='/users/'], a[href*='redgifs.com/users/']");
      const mm = a && /\/users\/([^/?#]+)/i.exec(a.getAttribute("href") || "");
      if (mm) { try { return decodeURIComponent(mm[1]); } catch { return mm[1]; } }
    }
    return "";
  }

  // Kaynak etiketi — özellik A: RedGifs'te niche'ten indirilmişse hem kullanıcı
  // adı hem niche adı kaydedilsin ("<user> niche:<ad>"); değilse yalnız kullanıcı.
  function currentSource() {
    const parts = [];
    const user = currentRedgifsUser();
    const niche = currentNicheFolder();
    if (user) parts.push(user);
    if (niche) parts.push(`niche:${niche}`);
    return parts.join(" ");
  }

  function isNicheDirectoryPage() {
    return /^\/niches\/?$/i.test(location.pathname);
  }

  // Show the shared folder chooser; returns folder name, "" for main, or null if cancelled.
  // On niche pages, skip the menu (the niche subfolder is applied automatically).
  async function pickFolder() {
    if (currentNicheFolder()) return "";
    return window.rgChooseFolder ? await window.rgChooseFolder() : "";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function setStatus(text, level = "idle") {
    const status = document.getElementById(STATUS_ID);
    if (!status) return;
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
    status.textContent = level === "error" ? text : "";
    status.dataset.level = level;
    if (level === "error" && text) {
      statusTimer = setTimeout(() => {
        status.textContent = "";
        status.dataset.level = "idle";
        statusTimer = null;
      }, 5000);
    }
  }

  function toErrorCode(error) {
    const text = String(error && (error.message || error) || "");
    if (/viewer video/i.test(text)) return "E_NO_VIEWER_VIDEO";
    if (/center item|no Redgifs video is visible|no center video/i.test(text)) return "E_NO_CENTER_VIDEO";
    if (/ad/i.test(text)) return "E_AD";
    if (/video menu/i.test(text)) return "E_NO_MENU";
    if (/share option/i.test(text)) return "E_SHARE";
    if (/copy link/i.test(text)) return "E_COPY";
    if (/clipboard|copied/i.test(text)) return "E_CLIPBOARD";
    if (/direct media/i.test(text)) return "E_DIRECT";
    if (/disabled/i.test(text)) return "E_DISABLED";
    if (/Ripsnip URL input/i.test(text)) return "E_RIPSNIP_INPUT";
    if (/Ripsnip submit/i.test(text)) return "E_RIPSNIP_SUBMIT";
    if (/timed out/i.test(text)) return "E_TIMEOUT";
    if (/Download failed/i.test(text)) return "E_DOWNLOAD";
    return "E_FAILED";
  }

  function installUi() {
    if (document.getElementById(BUTTON_ID)) {
      installProfileTileButtons();
      installFeedVideoButtons();
      updateViewerButton();
      resumePendingProfileOpen();
      return;
    }
    if (document.getElementById(STATUS_ID)) {
      installProfileTileButtons();
      installFeedVideoButtons();
      updateViewerButton();
      resumePendingProfileOpen();
      return;
    }

    const style = document.createElement("style");
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        z-index: 2147483647;
        left: auto;
        right: 18px;
        top: 92px;
        width: 54px;
        height: 54px;
        border: 0;
        border-radius: 999px;
        padding: 0;
        color: #fff;
        background: #2563eb;
        display: grid;
        place-items: center;
        box-shadow: 0 10px 28px rgba(0,0,0,.42), 0 0 0 2px rgba(255,255,255,.18);
        cursor: grab;
        touch-action: none;
        user-select: none;
        transition: transform .12s ease, background .12s ease;
      }
      #${BUTTON_ID}[data-dragging="1"] {
        cursor: grabbing;
        transition: none;
      }
      #${BUTTON_ID}:hover {
        background: #1d4ed8;
        transform: scale(1.05);
      }
      #${BUTTON_ID}:disabled {
        opacity: .7;
        cursor: wait;
        transform: none;
      }
      #${BUTTON_ID} svg {
        width: 28px;
        height: 28px;
        display: block;
        pointer-events: none;
      }
      #${STATUS_ID} {
        position: fixed;
        z-index: 2147483647;
        left: 50%;
        bottom: 28px;
        transform: translateX(-50%);
        max-width: min(280px, calc(100vw - 32px));
        padding: 9px 13px;
        border-radius: 999px;
        color: #fff;
        background: rgba(18,18,18,.56);
        backdrop-filter: blur(6px);
        font: 500 12px/1.25 system-ui, -apple-system, Segoe UI, sans-serif;
        text-align: center;
        pointer-events: none;
        display: none;
      }
      #${STATUS_ID}:not(:empty) {
        display: block;
      }
      #${STATUS_ID}[data-level="done"] {
        background: rgba(22, 101, 52, .62);
      }
      #${STATUS_ID}[data-level="error"] {
        background: rgba(153, 27, 27, .68);
      }
      .${TILE_BUTTON_CLASS} {
        position: absolute;
        z-index: 2147483000;
        top: 10px;
        right: 10px;
        width: var(--rg-ripsnip-button-size, 44px);
        height: var(--rg-ripsnip-button-size, 44px);
        border: 0;
        border-radius: 999px;
        padding: 0;
        display: grid;
        place-items: center;
        color: #fff;
        background: rgba(37, 99, 235, .72);
        box-shadow: 0 6px 16px rgba(0,0,0,.35);
        opacity: 0;
        transform: scale(.92);
        cursor: pointer;
        transition: opacity .12s ease, transform .12s ease, background .12s ease;
      }
      [${TILE_READY_ATTR}="1"]:hover > .${TILE_BUTTON_CLASS},
      html[data-rg-ripsnip-button-visibility="always"] .${TILE_BUTTON_CLASS},
      .${TILE_BUTTON_CLASS}:focus-visible {
        opacity: 1;
        transform: scale(1);
      }
      .${TILE_BUTTON_CLASS}:hover {
        background: rgba(37, 99, 235, .96);
      }
      .${TILE_BUTTON_CLASS} svg {
        width: calc(var(--rg-ripsnip-button-size, 44px) * .55);
        height: calc(var(--rg-ripsnip-button-size, 44px) * .55);
        pointer-events: none;
      }
      html.rg-viewer-open .${TILE_BUTTON_CLASS} { display: none !important; }
      #${VIEWER_BUTTON_ID} {
        position: fixed;
        z-index: 2147483647;
        width: var(--rg-ripsnip-button-size, 44px);
        height: var(--rg-ripsnip-button-size, 44px);
        border: 0;
        border-radius: 999px;
        padding: 0;
        display: none;
        place-items: center;
        color: #fff;
        background: rgba(37, 99, 235, .82);
        box-shadow: 0 8px 24px rgba(0,0,0,.42), 0 0 0 1px rgba(255,255,255,.18);
        cursor: pointer;
      }
      #${VIEWER_BUTTON_ID}:hover {
        background: rgba(37, 99, 235, .98);
      }
      #${VIEWER_BUTTON_ID}:disabled {
        opacity: .58;
        cursor: wait;
      }
      #${VIEWER_BUTTON_ID} svg {
        width: calc(var(--rg-ripsnip-button-size, 44px) * .55);
        height: calc(var(--rg-ripsnip-button-size, 44px) * .55);
        pointer-events: none;
      }
      #${AVATAR_BUTTON_ID} {
        position: fixed;
        z-index: 2147483647;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 999px;
        padding: 0;
        display: none;
        place-items: center;
        color: #fff;
        background: rgba(37, 99, 235, .9);
        box-shadow: 0 6px 18px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.2);
        cursor: pointer;
      }
      #${AVATAR_BUTTON_ID}:hover { background: rgba(37, 99, 235, 1); }
      #${AVATAR_BUTTON_ID}:disabled { opacity: .58; cursor: wait; }
      #${AVATAR_BUTTON_ID} svg { width: 22px; height: 22px; pointer-events: none; }
    `;
    document.documentElement.appendChild(style);

    let button = null;
    if (window.top !== window && settings.iframeButton) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.title = "Download current Redgifs video";
      button.setAttribute("aria-label", "Download current Redgifs video");
      button.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        </svg>
      `;
      button.addEventListener("pointerdown", startDrag);
      button.addEventListener("click", run);
    }

    const status = document.createElement("div");
    status.id = STATUS_ID;
    status.dataset.level = "idle";

    if (button) document.documentElement.append(button);
    document.documentElement.append(status);
    const viewerButton = document.createElement("button");
    viewerButton.id = VIEWER_BUTTON_ID;
    viewerButton.type = "button";
    viewerButton.title = "Download this video";
    viewerButton.setAttribute("aria-label", "Download this video");
    viewerButton.innerHTML = downloadIconSvg(24);
    viewerButton.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    viewerButton.addEventListener("click", runViewerDownload);
    document.documentElement.append(viewerButton);
    // Web listesi butonu artık updateViewerButton() içinde tembel oluşturuluyor
    // (installUi tek sefer çalışıp erken dönebiliyor — özellik D dayanıklılığı).

    const avatarButton = document.createElement("button");
    avatarButton.id = AVATAR_BUTTON_ID;
    avatarButton.type = "button";
    avatarButton.title = "Profil fotoğrafını indir";
    avatarButton.setAttribute("aria-label", "Profil fotoğrafını indir");
    avatarButton.innerHTML = downloadIconSvg(22);
    avatarButton.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
    avatarButton.addEventListener("click", runAvatarDownload);
    document.documentElement.append(avatarButton);
    if (button && window.top !== window) {
      button.style.left = "12px";
      button.style.top = "12px";
      button.style.right = "auto";
    }
    restoreButtonPosition();
    installProfileTileButtons();
    installFeedVideoButtons();
    resumePendingProfileOpen();
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function placeButton(x, y, persist = false) {
    const button = document.getElementById(BUTTON_ID);
    const status = document.getElementById(STATUS_ID);
    if (!button) return;

    const size = 54;
    const left = clamp(x, 8, window.innerWidth - size - 8);
    const top = clamp(y, 8, window.innerHeight - size - 8);

    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.style.right = "auto";

    if (status) {
      status.style.left = `${clamp(left - 196, 8, window.innerWidth - 266)}px`;
      status.style.top = `${clamp(top + 62, 8, window.innerHeight - 40)}px`;
      status.style.right = "auto";
    }

    if (persist) {
      chrome.storage.local.set({ [STORAGE_KEY]: { left, top } });
    }
  }

  function restoreButtonPosition() {
    if (window.top !== window) return;
    chrome.storage.local.get(STORAGE_KEY, (items) => {
      const pos = items && items[STORAGE_KEY];
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        placeButton(pos.left, pos.top);
      }
    });
  }

  function loadSettings() {
    chrome.storage.local.get(SETTINGS_KEY, (items) => {
      settings = { ...DEFAULT_SETTINGS, ...(items && items[SETTINGS_KEY] || {}) };
      settings.feedButtons = true;
      settings.profileButtons = true;
      syncConfiguredUi();
    });
  }

  function syncConfiguredUi() {
    document.documentElement.dataset.rgRipsnipButtonVisibility = settings.buttonVisibility === "always" ? "always" : "hover";
    document.documentElement.style.setProperty("--rg-ripsnip-button-size", `${clamp(Number(settings.buttonSize) || 44, 28, 72)}px`);

    const iframeButton = document.getElementById(BUTTON_ID);
    if (window.top !== window && iframeButton) {
      iframeButton.style.display = settings.iframeButton ? "grid" : "none";
    }

    if (!settings.profileButtons) removeTileButtons("profile");
    if (!settings.feedButtons) removeTileButtons("feed");
    installProfileTileButtons();
    installFeedVideoButtons();
    updateViewerButton();
  }

  function removeTileButtons(kind) {
    for (const button of document.querySelectorAll(`.${TILE_BUTTON_CLASS}[data-rg-ripsnip-kind="${kind}"]`)) {
      const parent = button.parentElement;
      button.remove();
      if (parent && !parent.querySelector(`.${TILE_BUTTON_CLASS}`)) {
        parent.removeAttribute(TILE_READY_ATTR);
      }
    }
  }

  function startDrag(event) {
    if (window.top !== window) return;
    if (event.button !== 0) return;
    const button = document.getElementById(BUTTON_ID);
    const rect = button.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      moved: false
    };
    button.dataset.dragging = "1";
    button.setPointerCapture(event.pointerId);
    button.addEventListener("pointermove", moveDrag);
    button.addEventListener("pointerup", endDrag, { once: true });
    button.addEventListener("pointercancel", endDrag, { once: true });
  }

  function moveDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragState.moved = true;
    placeButton(dragState.left + dx, dragState.top + dy);
  }

  function endDrag(event) {
    const button = document.getElementById(BUTTON_ID);
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    button.removeEventListener("pointermove", moveDrag);
    delete button.dataset.dragging;

    if (dragState.moved) {
      const rect = button.getBoundingClientRect();
      placeButton(rect.left, rect.top, true);
      suppressNextClick = true;
      setTimeout(() => {
        suppressNextClick = false;
      }, 0);
    }

    dragState = null;
  }

  function visibleRect(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return {
      rect,
      visible:
        rect.width >= 8 &&
        rect.height >= 8 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity || 1) > 0.05
    };
  }

  function isProbablyAdElement(el) {
    if (!el || el === document || el === document.documentElement || el === document.body) return false;

    // Redgifs sponsored-creator ads: ".creatorImage" wrapper, no data-feed-item-id,
    // and an image hosted OFF redgifs (e.g. servefilesonly.com / ctimages).
    if (/\bcreatorImage\b/i.test(el.className || "")) return true;
    if (el.closest?.(".creatorImage")) return true;
    const adImg = el.matches?.("img") ? el : el.querySelector?.("img[src]");
    if (adImg && !el.querySelector?.("[data-feed-item-id]") && !el.closest?.("[data-feed-item-id]")) {
      try {
        const host = new URL(adImg.currentSrc || adImg.src, location.href).hostname;
        if (host && !/(?:^|\.)redgifs\.com$|(?:^|\.)redd\.it$|redditmedia|gifdeliverynetwork/i.test(host)) {
          return true; // image from a non-redgifs host → ad
        }
      } catch { /* ignore */ }
    }

    const container =
      el.closest(
        "[data-ad], [data-ads], [data-testid*='ad' i], [class*='ad-' i], [class*='ads' i], [id*='ad-' i], [id*='ads' i], iframe"
      ) || el;

    const label = [
      container.getAttribute && container.getAttribute("aria-label"),
      container.getAttribute && container.getAttribute("title"),
      container.getAttribute && container.getAttribute("data-testid"),
      container.getAttribute && container.getAttribute("class"),
      container.getAttribute && container.getAttribute("id"),
      container.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (/\b(ad|ads|advertisement|advertising|sponsored|sponsor|promoted|promo|outbrain|taboola)\b/i.test(label)) {
      return true;
    }

    const externalLinks = [...container.querySelectorAll?.("a[href]") || []].filter((link) => {
      try {
        const host = new URL(link.href, location.href).hostname;
        return host && !host.endsWith("redgifs.com");
      } catch {
        return false;
      }
    });

    const redgifsWatchLinks = [...container.querySelectorAll?.("a[href*='/watch/']") || []].filter((link) => {
      try {
        const host = new URL(link.href, location.href).hostname;
        return host === "redgifs.com" || host.endsWith(".redgifs.com");
      } catch {
        return false;
      }
    });

    if (externalLinks.length > 0 && redgifsWatchLinks.length === 0) return true;

    const iframes = [...container.querySelectorAll?.("iframe[src]") || []];
    if (iframes.some((frame) => {
      try {
        const host = new URL(frame.src, location.href).hostname;
        return host && !host.endsWith("redgifs.com");
      } catch {
        return false;
      }
    })) {
      return true;
    }

    return false;
  }

  function closestVideoContainer(el) {
    return (
      el.closest("article, section, main, [data-testid], [class*='gif' i], [class*='video' i], [class*='feed' i]") ||
      el.parentElement ||
      el
    );
  }

  function clickElement(el) {
    const target = el.closest("button,[role='button'],a,[tabindex]") || el;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    target.focus?.();
    target.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, composed: true, pointerId: 1, pointerType: "mouse", clientX: x, clientY: y }));
    target.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true, composed: true, pointerId: 1, pointerType: "mouse", clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, composed: true, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true, composed: true, clientX: x, clientY: y }));
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, composed: true, buttons: 1, clientX: x, clientY: y }));
    target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, composed: true, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 0, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true, buttons: 0, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, button: 0, buttons: 0, clientX: x, clientY: y }));
    target.click();
  }

  async function clickPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) throw new Error("Share option not found.");
    clickElement(el);
    await sleep(180);
  }

  function downloadIconSvg(size = 19) {
    return `
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
      </svg>
    `;
  }

  function isProfilePage() {
    return /^\/users\//i.test(location.pathname);
  }

  function isLikelyProfileAvatar(media) {
    if (!settings.hideRedgifsProfileAvatars && location.hostname.endsWith("redgifs.com")) return false;
    if (!settings.hideRedditProfileAvatars && /reddit\.com$/i.test(location.hostname)) return false;

    const rect = media.getBoundingClientRect();
    const style = window.getComputedStyle(media);
    const label = [
      media.getAttribute("alt"),
      media.getAttribute("aria-label"),
      media.getAttribute("class"),
      media.closest("[class*='avatar' i], [data-testid*='avatar' i]")?.getAttribute("class")
    ].filter(Boolean).join(" ");

    return (
      /avatar|profile|userpic|user-pic|pfp/i.test(label) ||
      rect.top < 260 && rect.width <= 140 && rect.height <= 140 && parseFloat(style.borderRadius || "0") >= rect.width * 0.35
    );
  }

  function profileContentBounds() {
    const tabText = [...document.querySelectorAll("button,[role='tab'],a,div,span")]
      .filter((el) => visibleRect(el).visible)
      .find((el) => /^gifs$/i.test((el.textContent || "").trim()));
    const tabRect = tabText?.getBoundingClientRect();
    const main = document.querySelector("main") || document.body;
    const mainRect = main.getBoundingClientRect();

    return {
      top: tabRect ? tabRect.bottom - 4 : 280,
      left: Math.max(0, mainRect.left - 8),
      right: Math.min(window.innerWidth, mainRect.right + 8)
    };
  }

  function isInProfileGrid(media) {
    const rect = media.getBoundingClientRect();
    const bounds = profileContentBounds();
    if (rect.bottom < bounds.top) return false;
    if (rect.left < bounds.left - 8 || rect.right > bounds.right + 8) return false;
    if (isLikelyProfileAvatar(media)) return false;
    if (rect.width < 110 || rect.height < 110) return false;
    if (rect.width > 420 || rect.height > 520) return false;

    const ratio = rect.width / rect.height;
    if (ratio < 0.45 || ratio > 2.2) return false;

    return true;
  }

  function tileRootFromMedia(media) {
    const link = media.closest("a[href]");
    const candidate =
      link ||
      media.closest("article, [role='listitem'], [data-testid], [class*='grid' i] > *, [class*='tile' i], [class*='card' i]") ||
      media.parentElement;
    if (!candidate || candidate === document.body || candidate === document.documentElement) return null;

    const rect = candidate.getBoundingClientRect();
    const mediaRect = media.getBoundingClientRect();
    if (!isInProfileGrid(media)) return null;
    if (mediaRect.width < 90 || mediaRect.height < 90) return null;
    if (rect.width > window.innerWidth * 0.95 || rect.height > window.innerHeight * 0.95) return null;
    if (rect.left > window.innerWidth * 0.82) return null;
    if (isProbablyAdElement(candidate)) return null;
    return candidate;
  }

  function installProfileTileButtons() {
    if (!settings.profileButtons) {
      removeTileButtons("profile");
      return;
    }
    if (!isProfilePage()) return;

    const medias = [...document.querySelectorAll("img, video")]
      .filter((media) => visibleRect(media).visible)
      .filter((media) => {
        const rect = media.getBoundingClientRect();
        return rect.width >= 90 && rect.height >= 90;
      });

    for (const media of medias) {
      const root = tileRootFromMedia(media);
      if (!root || root.getAttribute(TILE_READY_ATTR) === "1") continue;

      root.setAttribute(TILE_READY_ATTR, "1");
      const style = window.getComputedStyle(root);
      if (style.position === "static") root.style.position = "relative";
      root.style.overflow = root.style.overflow || "hidden";

      const button = document.createElement("button");
      button.type = "button";
      button.className = TILE_BUTTON_CLASS;
      button.dataset.rgRipsnipKind = "profile";
      button.title = "Download this video";
      button.setAttribute("aria-label", "Download this video");
      button.innerHTML = downloadIconSvg(19);
      button.addEventListener("click", (event) => runTileDownload(event, root, media));
      root.appendChild(button);
    }
  }

  function feedRootFromVideo(video) {
    const check = visibleRect(video);
    if (!check.visible) return null;
    const videoRect = check.rect;
    if (videoRect.width < 150 || videoRect.height < 150) return null;
    if (isProfilePage() && isInProfileGrid(video)) return null;
    if (isProbablyAdElement(video) || isProbablyAdElement(closestVideoContainer(video))) return null;

    const hasRedgifsSource = [video.currentSrc, video.src, video.poster, ...[...video.querySelectorAll("source")].map((source) => source.src)]
      .filter(Boolean)
      .some((value) => /redgifs|gifdeliverynetwork/i.test(value));
    if (!hasRedgifsSource && !location.hostname.endsWith("redgifs.com")) return null;

    const candidates = [];
    let node = video.parentElement;
    for (let depth = 0; node && depth < 9; depth += 1, node = node.parentElement) {
      if (node === document.body || node === document.documentElement || node.tagName === "MAIN") continue;
      const rect = node.getBoundingClientRect();
      const containsVideo =
        rect.left <= videoRect.left + 2 &&
        rect.top <= videoRect.top + 2 &&
        rect.right >= videoRect.right - 2 &&
        rect.bottom >= videoRect.bottom - 2;
      const area = Math.max(1, rect.width * rect.height);
      const videoArea = Math.max(1, videoRect.width * videoRect.height);

      if (
        containsVideo &&
        rect.width <= window.innerWidth * 0.98 &&
        rect.height <= window.innerHeight * 1.55 &&
        area <= videoArea * 4.5 &&
        !isProbablyAdElement(node)
      ) {
        candidates.push({ node, area });
      }
    }

    return candidates.sort((a, b) => a.area - b.area)[0]?.node || video.parentElement;
  }

  function installFeedVideoButtons() {
    if (!settings.feedButtons || isNicheDirectoryPage()) {
      removeTileButtons("feed");
      return;
    }
    if (window.top !== window) return;

    const videos = [...document.querySelectorAll("video")]
      .filter((video) => visibleRect(video).visible)
      .filter((video) => {
        const rect = video.getBoundingClientRect();
        return rect.width >= 150 && rect.height >= 150;
      });

    for (const video of videos) {
      const root = feedRootFromVideo(video);
      if (!root || root.getAttribute(TILE_READY_ATTR) === "1") continue;

      root.setAttribute(TILE_READY_ATTR, "1");
      const style = window.getComputedStyle(root);
      if (style.position === "static") root.style.position = "relative";
      root.style.overflow = root.style.overflow || "hidden";

      const button = document.createElement("button");
      button.type = "button";
      button.className = TILE_BUTTON_CLASS;
      button.dataset.rgRipsnipKind = "feed";
      button.title = "Download this video";
      button.setAttribute("aria-label", "Download this video");
      button.innerHTML = downloadIconSvg(19);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => runFeedVideoDownload(event, root, video));
      root.appendChild(button);
    }

    // On feed/niches/tag pages, non-playing posts are poster images (no <video>),
    // so the loop above only tags the one centered video. Install buttons on every
    // card that carries a /watch/ link too — download resolves via the slug/API.
    installWatchCardButtons();
    // Universal: every grid/feed cell carries data-feed-item-id (video or image).
    installGifPreviewButtons();
  }

  function installWatchCardButtons() {
    if (!settings.feedButtons || isNicheDirectoryPage() || window.top !== window) return;
    if (isProfilePage()) return; // profile grid handled by its own installer

    for (const link of document.querySelectorAll("a[href*='/watch/']")) {
      const watchUrl = normalizeRedgifsWatchUrl(link.href);
      if (!watchUrl) continue;

      // Pick the card container: the link itself if large, else nearest big ancestor.
      let card = link;
      const lr = link.getBoundingClientRect();
      if (lr.width < 150 || lr.height < 150) {
        let node = link.parentElement;
        for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
          const r = node.getBoundingClientRect();
          if (r.width >= 150 && r.height >= 150) { card = node; break; }
        }
      }
      if (!(card instanceof HTMLElement)) continue;
      const cr = card.getBoundingClientRect();
      if (cr.width < 150 || cr.height < 150) continue;
      if (!visibleRect(card).visible) continue;
      if (isProbablyAdElement(card)) continue;
      if (card.getAttribute(TILE_READY_ATTR) === "1") continue;
      if (card.querySelector(`.${TILE_BUTTON_CLASS}`)) continue; // already has a button

      card.setAttribute(TILE_READY_ATTR, "1");
      if (window.getComputedStyle(card).position === "static") card.style.position = "relative";

      const button = document.createElement("button");
      button.type = "button";
      button.className = TILE_BUTTON_CLASS;
      button.dataset.rgRipsnipKind = "feed";
      button.title = "Download this video";
      button.setAttribute("aria-label", "Download this video");
      button.innerHTML = downloadIconSvg(19);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => runWatchCardDownload(event, watchUrl, card));
      card.appendChild(button);
    }
  }

  async function runWatchCardDownload(event, watchUrl, card) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");

    try {
      const folder = await pickFolder();
      if (folder === null) return;
      chosenFolder = folder;
      const video = card.querySelector("video");
      const directUrls = settings.directDownloads
        ? collectDirectMediaCandidates(card, video, { includePerformance: false })
        : [];
      // watchUrl → background resolves the mp4 via the Redgifs API by slug.
      await sendDirectDownload(directUrls, watchUrl, {
        allowRipsnipFallback: false,
        preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
        expectedSlug: expectedSlugFromUrl(watchUrl)
      });
      setStatus("", "idle");
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  // Universal grid/feed installer: every Redgifs item carries its slug in
  // data-feed-item-id, so put a button on EACH cell (not just the one with a
  // live <video>). Covers explore/gifs, explore/images, niches and the feed.
  function installGifPreviewButtons() {
    if (!settings.feedButtons || isNicheDirectoryPage() || window.top !== window) return;

    for (const item of document.querySelectorAll("[data-feed-item-id]")) {
      const slug = item.getAttribute("data-feed-item-id");
      if (!slug || !/^[a-z0-9]{4,}$/i.test(slug)) continue;

      const rect = item.getBoundingClientRect();
      if (rect.width < 110 || rect.height < 110) continue;
      if (!visibleRect(item).visible) continue;
      if (isProbablyAdElement(item)) continue;
      if (item.getAttribute(TILE_READY_ATTR) === "1") continue;
      if (item.querySelector(`.${TILE_BUTTON_CLASS}`)) continue; // avoid duplicates

      item.setAttribute(TILE_READY_ATTR, "1");
      if (window.getComputedStyle(item).position === "static") item.style.position = "relative";

      // Both explore grids use ".tileItem", so class can't tell them apart —
      // the page path does: /explore/images = images, everything else = video.
      const isImage = /\/images(?:\/|$|\?)/i.test(location.pathname) || /GifPreview_isImage/i.test(String(item.className || ""));

      const button = document.createElement("button");
      button.type = "button";
      button.className = TILE_BUTTON_CLASS;
      button.dataset.rgRipsnipKind = "feed";
      button.title = isImage ? "Görseli indir" : "Videoyu indir";
      button.setAttribute("aria-label", button.title);
      button.innerHTML = downloadIconSvg(19);
      // Top-LEFT so it stays on the media when the cell goes fullscreen
      // (right:10px would land at the screen's top-right corner).
      button.style.left = "10px";
      button.style.right = "auto";
      button.addEventListener("pointerdown", (event) => { event.preventDefault(); event.stopPropagation(); });
      if (isImage) {
        button.addEventListener("click", (event) => runImagePreviewDownload(event, item, slug));
      } else {
        button.addEventListener("click", (event) => runWatchCardDownload(event, `https://www.redgifs.com/watch/${slug.toLowerCase()}`, item));
      }
      item.appendChild(button);
    }
  }

  async function runImagePreviewDownload(event, item, slug) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");

    try {
      const folder = await pickFolder();
      if (folder === null) return;
      chosenFolder = folder;
      // Build several candidates (prefer -large, then clean, then displayed).
      // The background downloads the FIRST one that actually returns an image
      // (skips the S3 AccessDenied XML that non-existent variants produce).
      const img = [...item.querySelectorAll("img")]
        .map((i) => ({ i, r: i.getBoundingClientRect() }))
        .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0]?.i;
      const raw = img ? avatarBestUrl(img) : "";
      const large = redgifsLargeImage(raw);
      // Clean = strip any size suffix → {Slug}.jpg
      const clean = raw.replace(/-(?:small|mobile|mini|thumbnail|thumb|preview|poster|sd|medium|large)(\.(?:jpg|jpeg|png|webp))/i, "$1");
      const candidates = [...new Set([large, clean, raw].filter(Boolean))];
      console.info("[rg-redgifs] görsel indirme", { slug, raw, candidates });
      if (!candidates.length) throw new Error("No image url.");
      await sendDirectDownload(candidates, "", { allowRipsnipFallback: false, imageMode: true });
      setStatus("", "idle");
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  async function waitForCenterVideo(timeoutMs = 7000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        currentVideoRect();
        return true;
      } catch {
        await sleep(120);
      }
    }
    return false;
  }

  function viewerVideoRect() {
    const item = viewerVideoItem();
    if (!item) throw new Error("No viewer video.");
    return item.rect;
  }

  function viewerVideoItem() {
    const videos = [...document.querySelectorAll("video")]
      .map((video) => {
        const rect = video.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        const area = width * height;
        const container = closestVideoContainer(video);
        const hasRedgifsSource = [video.currentSrc, video.src, video.poster, ...[...video.querySelectorAll("source")].map((source) => source.src)]
          .filter(Boolean)
          .some((value) => /redgifs|gifdeliverynetwork/i.test(value));
        return {
          video,
          rect,
          area,
          isAd: isProbablyAdElement(video) || isProbablyAdElement(container),
          hasRedgifsSource
        };
      })
      .filter((item) => item.area > 30000)
      .filter((item) => !item.isAd)
      .filter((item) => item.hasRedgifsSource || location.hostname.endsWith("redgifs.com"))
      .sort((a, b) => b.area - a.area);

    return videos[0] || null;
  }

  function isWatchPage() {
    return /^\/watch\//i.test(location.pathname) && location.hostname.endsWith("redgifs.com");
  }

  // Özellik D — görüntüleyici indirme butonunun altındaki "web listesi" butonunu
  // (yoksa) oluştur. installUi() tek sefer çalışıp erken döndüğü için burada
  // tembel kuruyoruz; helper (weblink.js) geç yüklenirse sonraki turda yakalanır.
  function ensureViewerWebButton() {
    let web = document.getElementById(VIEWER_WEB_ID);
    if (web && web.isConnected) return web;
    if (!window.rgMakeWebIconButton) return null;
    web = window.rgMakeWebIconButton(() => {
      let url = "";
      try {
        if (isWatchPage()) url = normalizeRedgifsWatchUrl(location.href) || location.href;
        else { const it = viewerVideoItem(); if (it && it.video) url = watchUrlFromFeedItem(it.video) || ""; }
      } catch { /* yoksay */ }
      return { url: url || location.href, title: document.title };
    }, { size: clamp(Number(settings.buttonSize) || 44, 28, 72) });
    web.id = VIEWER_WEB_ID;
    web.style.position = "fixed";
    web.style.display = "none";
    document.documentElement.append(web);
    return web;
  }

  function updateViewerButton() {
    const button = document.getElementById(VIEWER_BUTTON_ID);
    if (!button) return;

    const web = ensureViewerWebButton();
    const hideViewer = () => {
      button.style.display = "none";
      if (web) web.style.display = "none";
      document.documentElement.classList.remove("rg-viewer-open");
    };

    const onViewerPage = isProfilePage() || isWatchPage();
    if (window.top !== window || !onViewerPage || !settings.profileButtons) { hideViewer(); return; }

    const item = viewerVideoItem();
    if (!item || (isProfilePage() && isInProfileGrid(item.video))) { hideViewer(); return; }

    // Use the actual rendered (letterbox-corrected) video box so the button
    // sits on the video's visible top-left, not the page corner.
    const box = videoContentRect(item.video);
    const size = clamp(Number(settings.buttonSize) || 44, 28, 72);
    const left = clamp(box.left + 10, 8, window.innerWidth - size - 8);
    const top = clamp(box.top + 10, 8, window.innerHeight - size - 8);
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.style.display = "grid";
    if (web) {
      web.style.left = `${left}px`;
      web.style.top = `${clamp(top + size + 8, 8, window.innerHeight - size - 8)}px`;
      web.style.display = "grid";
    }
    // Viewer open → hide the per-tile buttons so only this one shows.
    document.documentElement.classList.add("rg-viewer-open");
  }

  // MOST RELIABLE: Redgifs stores each video's slug on its .GifPreview wrapper
  //   <div class="GifPreview ..." data-feed-item-id="{slug}">
  // The active/fullscreen one also has class GifPreview_isActive.
  function slugFromFeedItem(el) {
    const host = el && el.closest && el.closest("[data-feed-item-id]");
    const id = host && host.getAttribute("data-feed-item-id");
    return (id && /^[a-z0-9]{4,}$/i.test(id)) ? id : "";
  }

  function watchUrlFromFeedItem(el) {
    const slug = slugFromFeedItem(el);
    return slug ? `https://www.redgifs.com/watch/${slug.toLowerCase()}` : null;
  }

  // The currently-active (fullscreen/centered) item's slug.
  function activeFeedItemSlug() {
    const active = document.querySelector(".GifPreview_isActive[data-feed-item-id]");
    const id = active && active.getAttribute("data-feed-item-id");
    return (id && /^[a-z0-9]{4,}$/i.test(id)) ? id : "";
  }

  // Feed/viewer videos are HLS blobs; the real slug lives in the manifest URL:
  //   https://api.redgifs.com/v2/gifs/{slug}/hd.m3u8
  function redgifsSlugFromApiUrl(url) {
    const m = String(url || "").match(/api\.redgifs\.com\/v2\/gifs\/([a-z0-9]+)(?:\/|\?|#|$)/i);
    return m ? m[1] : "";
  }

  // Slug of the currently-playing video, from the most recent HLS manifest fetch.
  function currentApiSlug() {
    const names = performance.getEntriesByType("resource").map((e) => e.name).reverse();
    for (const url of names) {
      if (!/\.m3u8/i.test(url)) continue;
      const slug = redgifsSlugFromApiUrl(url);
      if (slug && slug.length >= 4) return slug;
    }
    // Fallback: any /v2/gifs/{slug}/ reference (most recent).
    for (const url of names) {
      const slug = redgifsSlugFromApiUrl(url);
      if (slug && slug.length >= 4) return slug;
    }
    return "";
  }

  function currentWatchUrlFromApi() {
    const slug = currentApiSlug();
    return slug ? `https://www.redgifs.com/watch/${slug.toLowerCase()}` : null;
  }

  // Actual CDN mp4/webm URLs the page has already fetched (correct filename case).
  // Most recent first — the currently-playing item is usually last-loaded.
  function playingCdnMediaUrls() {
    return performance.getEntriesByType("resource")
      .map((e) => e.name)
      .filter((n) => /^https?:\/\/(?:media|thumbs\d*)\.redgifs\.com\/[^/?#]+\.(?:mp4|webm)(?:[?#]|$)/i.test(n))
      .reverse();
  }

  // CDN media URLs whose filename matches the given watch URL's slug.
  function cdnUrlsForWatch(watchUrl) {
    const slugKey = redgifsMediaNameKey(expectedSlugFromUrl(watchUrl) || "");
    const urls = playingCdnMediaUrls();
    if (!slugKey) return urls;
    const matched = urls.filter((u) => {
      const k = redgifsMediaNameKey(u);
      return k.includes(slugKey) || slugKey.includes(k);
    });
    return matched.length ? matched : urls;
  }

  // Compute the actual painted video box inside its element (object-fit: contain).
  function videoContentRect(video) {
    const r = video.getBoundingClientRect();
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return r;
    const scale = Math.min(r.width / vw, r.height / vh);
    const cw = vw * scale, ch = vh * scale;
    const left = r.left + (r.width - cw) / 2;
    const top = r.top + (r.height - ch) / 2;
    return { left, top, width: cw, height: ch, right: left + cw, bottom: top + ch };
  }

  // ── Profile avatar (profile picture) download ─────────────────────────────

  let _avatarCache = null, _avatarCacheAt = 0;
  function findProfileAvatar() {
    if (!isProfilePage()) return null;
    const now = Date.now();
    if (_avatarCache && _avatarCache.isConnected && now - _avatarCacheAt < 1200) return _avatarCache;
    const candidates = [...document.querySelectorAll("img")].filter((img) => {
      const r = img.getBoundingClientRect();
      if (r.width < 40 || r.width > 240) return false;
      if (Math.abs(r.width - r.height) > 24) return false; // roughly square
      if (r.top > 440 || r.bottom < 0) return false;        // near the header
      if (!(img.currentSrc || img.src)) return false;
      if (isProbablyAdElement(img)) return false;           // never on ads
      const radius = parseFloat(window.getComputedStyle(img).borderRadius || "0");
      return radius >= r.width * 0.35; // rounded → avatar
    });
    _avatarCache = candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    })[0] || null;
    _avatarCacheAt = now;
    return _avatarCache;
  }

  // A full-size video is open (viewer/lightbox) — hide the avatar button then.
  function viewerOpen() {
    const item = viewerVideoItem();
    return Boolean(item && item.rect.width > 300 && item.rect.height > 300 && item.rect.top < window.innerHeight * 0.6);
  }

  function avatarBestUrl(avatar) {
    let url = avatar.currentSrc || avatar.src || "";
    let bestW = 0;
    for (const part of (avatar.srcset || "").split(",")) {
      const [u, d] = part.trim().split(/\s+/);
      const w = parseInt(d) || 0;
      if (u && w >= bestW) { bestW = w; url = u; }
    }
    return url;
  }

  // Force the high-resolution -large variant of a Redgifs image URL.
  function redgifsLargeImage(url) {
    if (!url) return url;
    try {
      const u = new URL(url, location.href);
      if (!/(?:media|thumbs\d*)\.redgifs\.com/i.test(u.hostname)) return url;
      u.pathname = u.pathname.replace(
        /-(small|mobile|mini|thumbnail|thumb|preview|poster|sd|medium)(\.(?:jpg|jpeg|png|webp))$/i,
        "-large$2"
      );
      return u.toString();
    } catch {
      return url;
    }
  }

  let avatarMouseX = -1, avatarMouseY = -1;
  function updateAvatarButton() {
    const button = document.getElementById(AVATAR_BUTTON_ID);
    if (!button) return;
    if (window.top !== window || !settings.redgifsAvatarDownload || !isProfilePage() || viewerOpen()) {
      button.style.display = "none";
      return;
    }
    const avatar = findProfileAvatar();
    if (!avatar) { button.style.display = "none"; return; }

    const r = avatar.getBoundingClientRect();
    // Hover-only: show while the cursor is over the avatar or the button itself.
    const overAvatar = avatarMouseX >= r.left && avatarMouseX <= r.right && avatarMouseY >= r.top && avatarMouseY <= r.bottom;
    const shown = button.style.display !== "none";
    const b = button.getBoundingClientRect();
    const overButton = shown && avatarMouseX >= b.left && avatarMouseX <= b.right && avatarMouseY >= b.top && avatarMouseY <= b.bottom;
    if (!overAvatar && !overButton) { button.style.display = "none"; return; }

    button.style.left = `${clamp(r.right - 42, 8, window.innerWidth - 48)}px`;
    button.style.top = `${clamp(r.bottom - 42, 8, window.innerHeight - 48)}px`;
    button.__rgAvatar = avatar;
    button.style.display = "grid";
  }

  async function runAvatarDownload(event) {
    event.preventDefault();
    event.stopPropagation();
    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");
    try {
      const folder = await pickFolder();
      if (folder === null) return;
      chosenFolder = folder;
      const avatar = button.__rgAvatar || findProfileAvatar();
      if (!avatar) throw new Error("No avatar image.");
      const url = avatarBestUrl(avatar);
      if (!url) throw new Error("No avatar url.");
      console.info("[rg-redgifs] avatar indirme", url);
      await sendDirectDownload([url], "", { allowRipsnipFallback: false, skipReachability: true });
      setStatus("", "idle");
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
      updateAvatarButton();
    }
  }

  function findCloseViewerButton() {
    const candidates = [...document.querySelectorAll("button,[role='button'],a")]
      .filter((el) => visibleRect(el).visible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const label = [
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
          el.getAttribute("data-testid"),
          el.textContent
        ].filter(Boolean).join(" ").trim();
        return { el, rect, label };
      })
      .filter((item) => item.rect.top < window.innerHeight * 0.25 && item.rect.left > window.innerWidth * 0.55)
      .filter((item) => /close|dismiss|back|×|x/i.test(item.label) || item.rect.width <= 56 && item.rect.height <= 56);

    return candidates.sort((a, b) => b.rect.left - a.rect.left || a.rect.top - b.rect.top)[0]?.el || null;
  }

  async function closeViewerOrBack() {
    const close = findCloseViewerButton();
    if (close) {
      await clickAndWait(close, 220);
      return;
    }
    history.back();
    await sleep(300);
  }

  function sendStartRipsnip(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "START_RIPSNIP", url }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function sendDirectDownload(urls, fallbackSourceUrl = "", options = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Direct media timed out.")), 18000);
      chrome.runtime.sendMessage({ type: "DIRECT_DOWNLOAD", urls, fallbackSourceUrl, folderName: chosenFolder, subFolder: currentNicheFolder(), source: currentSource(), ...options }, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || response.ok === false) {
          reject(new Error(response?.error || "Direct media not found."));
          return;
        }
        resolve(response);
      });
    });
  }

  function expectedSlugFromUrl(url) {
    try {
      const parsed = new URL(url);
      const match = parsed.pathname.match(/\/(?:watch|ifr)\/([^/?#]+)/i);
      return match ? redgifsMediaNameKey(match[1]) : "";
    } catch {
      return "";
    }
  }

  function redgifsMediaNameKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|gif)$/i, "")
      .replace(/-(mobile|mini|large|hd|sd|silent|poster|thumbnail|preview|thumb|small)$/i, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function expectedSlugFromMedia(root, media, fallbackUrl = "") {
    const fromFallback = expectedSlugFromUrl(fallbackUrl);
    if (fromFallback) return fromFallback;

    const values = [];
    for (const el of [media, root]) {
      if (!(el instanceof Element)) continue;
      for (const value of [el.currentSrc, el.src, el.poster, el.href]) {
        if (value) values.push(value);
      }
      for (const attr of el.attributes || []) {
        if (/^(href|src|poster|style)$/i.test(attr.name) || attr.name.toLowerCase().startsWith("data-")) {
          values.push(attr.value);
        }
      }
    }

    for (const value of values) {
      const match = String(value).match(/\/([^/?#]+?)(?:-(?:mobile|mini|large|hd|sd|silent|poster|thumbnail|preview|thumb|small))?\.(?:mp4|webm|mov|m4v|jpg|jpeg|png|gif)(?:[?#]|$)/i);
      if (match) return redgifsMediaNameKey(match[1]);
    }
    return "";
  }

  async function copyProfileShareLinkWithFallback(fallbackUrl) {
    try {
      return await copyCurrentShareLink({ allowViewerVideo: true });
    } catch (error) {
      if (fallbackUrl) return fallbackUrl;
      throw error;
    }
  }

  async function returnFromProfileTile(returnUrl) {
    history.back();
    await sleep(550);

    if (returnUrl && location.href !== returnUrl && /\/watch\//i.test(location.pathname)) {
      location.assign(returnUrl);
    }
  }

  async function runTileDownload(event, root, media) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");

    try {
      const folder = await pickFolder();
      if (folder === null) return;
      chosenFolder = folder;
      const returnUrl = location.href;
      const fallbackUrl = findProfileTileWatchUrl(root, media);
      const directUrls = settings.directDownloads ? collectDirectMediaCandidates(root, media) : [];
      if (settings.directDownloads && directUrls.length) {
        await sendDirectDownload(directUrls, fallbackUrl, {
          allowRipsnipFallback: false,
          preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
          expectedSlug: expectedSlugFromMedia(root, media, fallbackUrl)
        });
        return;
      }

      const openResult = await openProfileTile(root, media, fallbackUrl, returnUrl);
      if (openResult === "navigating") return;

      const url = await copyProfileShareLinkWithFallback(fallbackUrl);
      await sendDirectDownload([], url, {
        allowRipsnipFallback: false,
        preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
        expectedSlug: expectedSlugFromUrl(url)
      });
      await returnFromProfileTile(returnUrl);
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  async function runFeedVideoDownload(event, root, video) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");

    try {
      const folder = await pickFolder();
      if (folder === null) return;
      chosenFolder = folder;
      // Reliable slug from the video's own data-feed-item-id; then fallbacks.
      const fallbackUrl = watchUrlFromFeedItem(video) || findProfileTileWatchUrl(root, video) || currentWatchUrlFromApi() || deriveCurrentShareUrl();
      let directUrls = settings.directDownloads ? collectDirectMediaCandidates(root, video, { includePerformance: true }) : [];
      if (settings.directDownloads) directUrls = [...new Set([...directUrls, ...cdnUrlsForWatch(fallbackUrl)])];
      console.info("[rg-redgifs] feed indirme", { directUrls: directUrls.length, fallbackUrl, feedItem: slugFromFeedItem(video), sample: directUrls.slice(0, 3) });

      // First try direct/API resolution. If it fails (e.g. niches feed videos
      // are blob/HLS with no derivable slug → E_DIRECT), fall back to the
      // share-menu "Copy Link" flow instead of giving up.
      let ok = false;
      if (settings.directDownloads && (directUrls.length || fallbackUrl)) {
        try {
          await sendDirectDownload(directUrls, fallbackUrl, {
            allowRipsnipFallback: false,
            preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
            expectedSlug: expectedSlugFromMedia(root, video, fallbackUrl)
          });
          ok = true;
        } catch (e) {
          console.warn("[rg-redgifs] doğrudan yol başarısız, Copy Link'e düşülüyor:", e && e.message || e);
          ok = false;
        }
      }

      if (!ok) {
        if (!settings.directDownloads) throw new Error("Direct media disabled.");
        console.info("[rg-redgifs] Copy Link yedeği çalışıyor");
        video.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
        await sleep(250);
        const url = await copyCurrentShareLink();
        await sendDirectDownload([], url, {
          allowRipsnipFallback: false,
          preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
          expectedSlug: expectedSlugFromUrl(url)
        });
      }
      setStatus("", "idle");
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  async function runViewerDownload(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");

    try {
      const folder = await pickFolder();
      if (folder === null) return;
      chosenFolder = folder;
      const item = viewerVideoItem();
      if (!item) throw new Error("No viewer video.");

      if (!settings.directDownloads) throw new Error("Direct media disabled.");

      const container = closestVideoContainer(item.video);
      // Exact slug from the fullscreen video's own data-feed-item-id (immune to
      // grid-preview m3u8 noise), then the active item, then fallbacks.
      const fallbackUrl = watchUrlFromFeedItem(item.video)
        || (activeFeedItemSlug() ? `https://www.redgifs.com/watch/${activeFeedItemSlug()}` : null)
        || normalizeRedgifsWatchUrl(location.href)
        || deriveCurrentShareUrl();
      let directUrls = collectDirectMediaCandidates(container, item.video, { allowViewerVideo: true, includePerformance: true });
      directUrls = [...new Set([...directUrls, ...cdnUrlsForWatch(fallbackUrl)])];
      console.info("[rg-redgifs] viewer indirme", { directUrls: directUrls.length, fallbackUrl, feedItem: slugFromFeedItem(item.video), active: activeFeedItemSlug(), sample: directUrls.slice(0, 3) });

      // Try the reliable direct/API path first (same as the working profile tile).
      let ok = false;
      if (directUrls.length || fallbackUrl) {
        try {
          await sendDirectDownload(directUrls, fallbackUrl, {
            allowRipsnipFallback: false,
            preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
            expectedSlug: expectedSlugFromMedia(container, item.video, fallbackUrl)
          });
          ok = true;
        } catch (e) {
          console.warn("[rg-redgifs] viewer doğrudan yol başarısız:", e && e.message || e);
        }
      }
      if (!ok) {
        console.info("[rg-redgifs] viewer Copy Link yedeği");
        const url = await copyCurrentShareLink({ allowViewerVideo: true });
        await sendDirectDownload([], url, {
          allowRipsnipFallback: false,
          preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
          expectedSlug: expectedSlugFromUrl(url)
        });
      }
      setStatus("", "idle");
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
      updateViewerButton();
    }
  }

  async function clickAndWait(el, waitMs = 160) {
    clickElement(el);
    await sleep(waitMs);
  }

  async function openProfileTile(root, media, knownWatchUrl, returnUrl) {
    const mediaEl = media || root.querySelector("video, img") || root;
    const directLink = findProfileTileDirectLink(root, mediaEl);

    if (directLink) {
      clickElement(directLink);
      if (await waitForViewerVideoLoose(1800)) return "opened";
    }

    const watchUrl = knownWatchUrl || findProfileTileWatchUrl(root, mediaEl);
    if (watchUrl) {
      sessionStorage.setItem(PENDING_PROFILE_KEY, "1");
      sessionStorage.setItem(PROFILE_RETURN_KEY, returnUrl || location.href);
      sessionStorage.setItem(PROFILE_WATCH_KEY, watchUrl);
      location.assign(watchUrl);
      return "navigating";
    }

    clickElement(mediaEl);
    if (await waitForViewerVideoLoose(5000)) return "opened";

    throw new Error("No viewer video.");
  }

  function findProfileTileDirectLink(root, media) {
    const nodes = profileTileSearchNodes(root, media);
    return nodes
      .filter((node) => node instanceof HTMLAnchorElement)
      .find((link) => normalizeRedgifsWatchUrl(link.href)) || null;
  }

  function findProfileTileWatchUrl(root, media) {
    const nodes = profileTileSearchNodes(root, media);

    for (const node of nodes) {
      if (node instanceof HTMLAnchorElement) {
        const direct = normalizeRedgifsWatchUrl(node.href);
        if (direct) return direct;
      }
    }

    for (const node of nodes) {
      for (const value of profileTileAttributeValues(node)) {
        const direct = normalizeRedgifsWatchUrl(value);
        if (direct) return direct;
      }
    }

    for (const node of nodes) {
      for (const value of profileTileAttributeValues(node)) {
        if (!/(?:redgifs|gifdeliverynetwork|https?:|\/\/)/i.test(value)) continue;
        const fromMedia = redgifsWatchUrlFromMediaUrl(value);
        if (fromMedia) return fromMedia;
      }
    }

    return null;
  }

  function profileTileSearchNodes(root, media) {
    const seen = new Set();
    const nodes = [];

    function add(node) {
      if (!(node instanceof Element) || seen.has(node)) return;
      seen.add(node);
      nodes.push(node);
    }

    add(root);
    add(media);

    let node = media;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      add(node);
      if (node === root) break;
    }

    for (const start of [media, root]) {
      node = start;
      for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
        add(node);
      }
    }

    const scopedRoots = [root, media].filter((item) => item instanceof Element);
    for (const base of scopedRoots) {
      for (const node of base.querySelectorAll("a[href], video, img, source, [src], [poster], [style], [data-testid], [data-id], [id], [class]")) {
        add(node);
      }
    }

    return nodes;
  }

  function profileTileAttributeValues(node) {
    const values = [];
    for (const attr of node.attributes || []) {
      if (/^(href|src|poster|style|id|class)$/i.test(attr.name) || attr.name.toLowerCase().startsWith("data-")) {
        values.push(attr.value);
      }
    }
    return values.filter(Boolean);
  }

  function normalizeRedgifsWatchUrl(value) {
    const normalized = normalizeRedgifsUrl(value);
    if (!normalized) return null;

    try {
      const parsed = new URL(normalized);
      const match = parsed.pathname.match(/\/(?:watch|ifr)\/([^/?#]+)/i);
      return match ? redgifsWatchUrlFromSlug(match[1]) : null;
    } catch {
      return null;
    }
  }

  async function resumePendingProfileOpen() {
    if (pendingProfileResumeStarted || window.top !== window || !location.hostname.endsWith("redgifs.com")) return;
    if (sessionStorage.getItem(PENDING_PROFILE_KEY) !== "1") return;

    pendingProfileResumeStarted = true;
    const returnUrl = sessionStorage.getItem(PROFILE_RETURN_KEY) || "";
    const fallbackUrl = sessionStorage.getItem(PROFILE_WATCH_KEY) || normalizeRedgifsWatchUrl(location.href);

    try {
      if (!(await waitForViewerVideoLoose(10000))) throw new Error("No viewer video.");
      const directUrls = settings.directDownloads ? collectDirectMediaCandidates(null, null, { allowViewerVideo: true }) : [];
      if (settings.directDownloads && directUrls.length) {
        await sendDirectDownload(directUrls, fallbackUrl, {
          allowRipsnipFallback: false,
          preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
          expectedSlug: expectedSlugFromUrl(fallbackUrl)
        });
        sessionStorage.removeItem(PENDING_PROFILE_KEY);
        sessionStorage.removeItem(PROFILE_RETURN_KEY);
        sessionStorage.removeItem(PROFILE_WATCH_KEY);

        if (returnUrl && returnUrl !== location.href) {
          await returnFromProfileTile(returnUrl);
        }
        return;
      }

      const url = await copyProfileShareLinkWithFallback(fallbackUrl);
      await sendDirectDownload([], url, {
        allowRipsnipFallback: false,
        preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
        expectedSlug: expectedSlugFromUrl(url)
      });
      sessionStorage.removeItem(PENDING_PROFILE_KEY);
      sessionStorage.removeItem(PROFILE_RETURN_KEY);
      sessionStorage.removeItem(PROFILE_WATCH_KEY);

      if (returnUrl && returnUrl !== location.href) {
        await returnFromProfileTile(returnUrl);
      }
    } catch (error) {
      sessionStorage.removeItem(PENDING_PROFILE_KEY);
      sessionStorage.removeItem(PROFILE_RETURN_KEY);
      sessionStorage.removeItem(PROFILE_WATCH_KEY);
      setStatus(toErrorCode(error), "error");
    } finally {
      pendingProfileResumeStarted = false;
    }
  }

  async function waitForViewerVideoLoose(timeoutMs = 7000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        viewerVideoRect();
        return true;
      } catch {
        await sleep(120);
      }
    }
    return false;
  }

  function currentVideoRect(options = {}) {
    if (options.allowViewerVideo) {
      try {
        return viewerVideoRect();
      } catch {
        // Fall through to strict center selection.
      }
    }

    const viewportCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const videos = [...document.querySelectorAll("video")]
      .map((video) => {
        const rect = video.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        const center = {
          x: Math.max(0, Math.min(window.innerWidth, rect.left + rect.width / 2)),
          y: Math.max(0, Math.min(window.innerHeight, rect.top + rect.height / 2))
        };
        const distance = Math.hypot(center.x - viewportCenter.x, center.y - viewportCenter.y);
        const container = closestVideoContainer(video);
        const hasRedgifsSource = [video.currentSrc, video.src, video.poster, ...[...video.querySelectorAll("source")].map((source) => source.src)]
          .filter(Boolean)
          .some((value) => /redgifs|gifdeliverynetwork/i.test(value));
        return {
          rect,
          area: width * height,
          width,
          height,
          distance,
          isAd: isProbablyAdElement(video) || isProbablyAdElement(container),
          hasRedgifsSource
        };
      })
      .filter((item) => item.area > 50000)
      .filter((item) => {
        const insideCenter =
          viewportCenter.x >= item.rect.left &&
          viewportCenter.x <= item.rect.right &&
          viewportCenter.y >= item.rect.top &&
          viewportCenter.y <= item.rect.bottom;
        return insideCenter;
      })
      .filter((item) => !item.isAd)
      .filter((item) => item.hasRedgifsSource || location.hostname.endsWith("redgifs.com"))
      .sort((a, b) => a.distance - b.distance || b.area - a.area);

    if (!videos[0]) {
      throw new Error("No center video.");
    }

    return videos[0].rect;
  }

  async function clickVideoMoreMenu(options = {}) {
    const videoRect = currentVideoRect(options);
    if (window.top !== window) {
      const x = Math.min(window.innerWidth - 18, Math.max(18, videoRect.right - 34));
      const y = Math.min(window.innerHeight - 18, Math.max(18, videoRect.bottom - 126));
      await clickPoint(x, y);
      return { x: Math.round(x), y: Math.round(y), label: "iframe-share-fixed" };
    }

    const selector = "button,[role='button'],[tabindex],a,[aria-label],[data-testid]";
    const candidates = [...document.querySelectorAll(selector)]
      .map((el) => {
        const check = visibleRect(el);
        const rect = check.rect;
        const label = [
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
          el.getAttribute("data-testid"),
          el.textContent
        ].filter(Boolean).join(" ").trim();
        return {
          el,
          label,
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
          width: rect.width,
          height: rect.height,
          visible: check.visible
        };
      })
      .filter((item) => item.visible)
      .filter((item) => !isProbablyAdElement(item.el))
      .filter((item) => item.width <= 110 && item.height <= 110)
      .filter((item) => {
        const inVideoRightBand =
          item.x >= videoRect.left + videoRect.width * 0.72 &&
          item.x <= videoRect.right + 45 &&
          item.y >= videoRect.top + videoRect.height * 0.45 &&
          item.y <= videoRect.bottom + 25;
        const notTopNav = item.y > window.innerHeight * 0.35;
        const notHelperButton = item.el.id !== BUTTON_ID && item.el.id !== STATUS_ID;
        return inVideoRightBand && notTopNav && notHelperButton;
      });

    const explicit = candidates
      .filter((item) => /share|more|options|overflow|ellipsis|\.\.\./i.test(item.label))
      .sort((a, b) => b.y - a.y)[0];
    const iframeShare =
      window.top !== window
        ? candidates
            .filter((item) => !/download|fullscreen|full\s*screen|expand|sd|hd|quality|mute|volume|view|eye/i.test(item.label))
            .filter((item) => item.y < videoRect.bottom - 70)
            .sort((a, b) => Math.abs(a.x - videoRect.right) - Math.abs(b.x - videoRect.right) || b.y - a.y)[0]
        : null;
    const picked = explicit || iframeShare || (window.top === window ? candidates.sort((a, b) => b.y - a.y || b.x - a.x)[0] : null);

    if (picked) {
      await clickAndWait(picked.el);
      return { x: Math.round(picked.x), y: Math.round(picked.y), label: picked.label };
    }

    throw new Error(window.top !== window ? "Share option not found." : "No Redgifs video menu found. The centered item may be an ad.");
  }

  function findByText(pattern) {
    const nodes = [...document.querySelectorAll("button,[role='button'],[role='menuitem'],a,div,span")]
      .filter((el) => visibleRect(el).visible)
      .filter((el) => pattern.test((el.textContent || "").trim()));
    return nodes
      .map((el) => el.closest("button,[role='button'],[role='menuitem'],a") || el)
      .find((el) => visibleRect(el).visible);
  }

  async function readClipboardText() {
    if (window.top !== window) return "";

    try {
      return await navigator.clipboard.readText();
    } catch {
      const textarea = document.createElement("textarea");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      document.execCommand("paste");
      const value = textarea.value;
      textarea.remove();
      return value;
    }
  }

  function normalizeRedgifsUrl(value) {
    const match = String(value || "").match(/https?:\/\/\S+/i);
    if (!match) return null;
    try {
      const parsed = new URL(match[0].replace(/[)\]}.,;]+$/, ""));
      if (parsed.hostname === "redgifs.com" || parsed.hostname.endsWith(".redgifs.com")) {
        return parsed.toString();
      }
    } catch {
      return null;
    }
    return null;
  }

  function redgifsWatchUrlFromSlug(slug) {
    const clean = String(slug || "")
      .trim()
      .split("?")[0]
      .split("#")[0]
      .replace(/\.(mp4|webm|mov|m4v)$/i, "")
      .replace(/\.(jpg|jpeg|png|gif)$/i, "")
      .replace(/-(mobile|mini|large|hd|sd|silent|poster|thumbnail|preview|thumb|small)$/i, "")
      .replace(/[^a-z0-9-]/gi, "");

    if (!clean || clean.length < 4) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return null;
    return `https://www.redgifs.com/watch/${clean.toLowerCase()}`;
  }

  function redgifsWatchUrlFromMediaUrl(value) {
    if (!value) return null;
    const str = String(value);
    // Only derive a slug from an ACTUAL media reference — a redgifs media host
    // or a media file extension. Bare attribute/class strings like "isLoaded"
    // must NOT be turned into watch/isloaded.
    const hasMediaHost = /(?:media|thumbs\d*)\.redgifs\.com|redgifs\.com\/(?:watch|ifr)\/|gifdeliverynetwork/i.test(str);
    const hasMediaExt = /\.(?:mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.test(str);
    if (!hasMediaHost && !hasMediaExt) return null;
    try {
      const parsed = new URL(str, location.href);
      const basename = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
      if (/\.(?:mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i.test(basename)) {
        const byBasename = redgifsWatchUrlFromSlug(basename);
        if (byBasename) return byBasename;
      }

      const match = parsed.href.match(/\/([A-Za-z][A-Za-z0-9-]{5,})(?:-(?:mobile|mini|large|hd|sd|silent|poster|thumbnail|preview|thumb|small))?\.(?:mp4|webm|mov|m4v|jpg|jpeg|png|gif)(?:[?#]|$)/i);
      return match ? redgifsWatchUrlFromSlug(match[1]) : null;
    } catch {
      return null;
    }
  }

  function visibleVideo() {
    return [...document.querySelectorAll("video")]
      .map((video) => {
        const rect = video.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        return { video, rect, area: width * height };
      })
      .filter((item) => item.area > 50000)
      .sort((a, b) => b.area - a.area)[0];
  }

  function directMediaUrlsFromValue(value, options = {}) {
    const raw = String(value || "");
    if (!raw) return [];

    const texts = [raw];
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded !== raw) texts.push(decoded);
    } catch {
      // Keep the raw value.
    }

    const urls = [];
    for (const text of texts) {
      const matches = text.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [];
      for (const match of matches) {
        const clean = match.replace(/[.,;]+$/, "");
        if (/\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(clean)) {
          urls.push(clean);
        }

        if (
          options.includeImages &&
          /^https?:\/\/(?:media|thumbs\d*)\.redgifs\.com\//i.test(clean) &&
          /\.(jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i.test(clean) &&
          !/-(?:poster|thumbnail|thumb|preview|mobile|mini|small)\.(?:jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i.test(clean)
        ) {
          urls.push(clean);
        }

        const poster = clean.match(/^https?:\/\/(?:media|thumbs\d*)\.redgifs\.com\/([^/?#]+?)(?:-(?:poster|thumbnail|thumb|preview|mobile|mini|large|hd|sd|silent|small))?\.(?:jpg|jpeg|png|webp)(?:[?#].*)?$/i);
        if (poster) {
          urls.push(`https://media.redgifs.com/${poster[1]}.mp4`);
          urls.push(`https://media.redgifs.com/${poster[1]}.webm`);
        }

        const derivative = clean.match(/^(https?:\/\/(?:media|thumbs\d*)\.redgifs\.com\/)([^/?#]+?)-(?:mobile|mini|large|hd|sd|silent|small)\.(mp4|webm)(?:[?#].*)?$/i);
        if (derivative) {
          urls.push(`${derivative[1]}${derivative[2]}.${derivative[3].toLowerCase()}`);
        }
      }
    }

    return urls;
  }

  function preferredVideoElement(options = {}) {
    const viewportCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const videos = [...document.querySelectorAll("video")]
      .map((video) => {
        const rect = video.getBoundingClientRect();
        const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        const area = width * height;
        const center = {
          x: Math.max(0, Math.min(window.innerWidth, rect.left + rect.width / 2)),
          y: Math.max(0, Math.min(window.innerHeight, rect.top + rect.height / 2))
        };
        const distance = Math.hypot(center.x - viewportCenter.x, center.y - viewportCenter.y);
        const container = closestVideoContainer(video);
        const hasRedgifsSource = [video.currentSrc, video.src, video.poster, ...[...video.querySelectorAll("source")].map((source) => source.src)]
          .filter(Boolean)
          .some((src) => /redgifs|gifdeliverynetwork/i.test(src));
        return { video, rect, area, distance, container, hasRedgifsSource };
      })
      .filter((item) => item.area > (options.allowViewerVideo ? 30000 : 50000))
      .filter((item) => !isProbablyAdElement(item.video) && !isProbablyAdElement(item.container))
      .filter((item) => item.hasRedgifsSource || location.hostname.endsWith("redgifs.com"));

    if (options.allowViewerVideo) {
      return videos.sort((a, b) => b.area - a.area)[0]?.video || null;
    }

    return videos
      .filter((item) =>
        viewportCenter.x >= item.rect.left &&
        viewportCenter.x <= item.rect.right &&
        viewportCenter.y >= item.rect.top &&
        viewportCenter.y <= item.rect.bottom
      )
      .sort((a, b) => a.distance - b.distance || b.area - a.area)[0]?.video || null;
  }

  function collectDirectMediaCandidates(root = null, media = null, options = {}) {
    if (options.includeImages == null) {
      // Redgifs (top window): images/gifs are always downloadable now (no setting).
      options.includeImages = window.top === window ? true : Boolean(settings.redditImages);
    }

    const elements = new Set();

    function addElement(el) {
      if (el instanceof Element && !isProbablyAdElement(el)) elements.add(el);
    }

    if (root || media) {
      for (const node of profileTileSearchNodes(root, media)) addElement(node);
    } else {
      const video = preferredVideoElement(options) || visibleVideo()?.video;
      const container = video ? closestVideoContainer(video) : null;
      addElement(video);
      addElement(container);
      if (container) {
        for (const node of container.querySelectorAll("video, source, img, a[href], [src], [poster], [style], [data-testid], [data-id], [id], [class]")) {
          addElement(node);
        }
      }
    }

    const values = [];
    for (const el of elements) {
      for (const value of [el.currentSrc, el.src, el.poster, el.href]) {
        if (value) values.push(value);
      }

      for (const attr of el.attributes || []) {
        if (/^(href|src|poster|style)$/i.test(attr.name) || attr.name.toLowerCase().startsWith("data-")) {
          values.push(attr.value);
        }
      }

      for (const source of el.querySelectorAll?.("source[src]") || []) {
        values.push(source.src);
      }
    }

    return [...new Set(values.flatMap((value) => directMediaUrlsFromValue(value, options)))];
  }

  function deriveCurrentShareUrl() {
    const currentUrl = normalizeRedgifsUrl(location.href);
    if (currentUrl && /\/watch\//i.test(currentUrl)) return currentUrl;

    // Prefer the reliable data-feed-item-id of the active item.
    const active = activeFeedItemSlug();
    if (active) return `https://www.redgifs.com/watch/${active}`;

    const currentVideo = visibleVideo();
    if (!currentVideo) return null;

    const card =
      currentVideo.video.closest("article, section, main, [data-testid], [class*='gif'], [class*='video']") ||
      currentVideo.video.parentElement ||
      document;

    const localWatchLink = [...card.querySelectorAll("a[href*='/watch/']")]
      .map((link) => normalizeRedgifsUrl(link.href))
      .find(Boolean);
    if (localWatchLink) return localWatchLink;

    const srcs = [
      currentVideo.video.currentSrc,
      currentVideo.video.src,
      currentVideo.video.poster,
      ...[...currentVideo.video.querySelectorAll("source")].map((source) => source.src)
    ].filter(Boolean);

    for (const src of srcs) {
      const fromMedia = redgifsWatchUrlFromMediaUrl(src);
      if (fromMedia) return fromMedia;
    }

    const attrs = [];
    for (const el of [currentVideo.video, card, ...card.querySelectorAll("[src],[href],[poster],[style],[data-testid],[data-id],[id],[class]")]) {
      for (const attr of ["src", "href", "poster", "style", "data-testid", "data-id", "id", "class"]) {
        const value = el.getAttribute && el.getAttribute(attr);
        if (value) attrs.push(value);
      }
    }

    for (const attr of attrs) {
      const directWatch = normalizeRedgifsUrl(attr);
      if (directWatch && /\/watch\//i.test(directWatch)) return directWatch;
      const fromAttr = redgifsWatchUrlFromMediaUrl(attr);
      if (fromAttr) return fromAttr;
    }

    const resourceUrls = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /redgifs|gifdeliverynetwork|media/i.test(name))
      .reverse();

    for (const resourceUrl of resourceUrls) {
      const fromResource = redgifsWatchUrlFromMediaUrl(resourceUrl);
      if (fromResource) return fromResource;
    }

    const text = card.textContent || "";
    const watchTextMatch = text.match(/https?:\/\/(?:www\.)?redgifs\.com\/watch\/[a-z0-9-]+/i);
    if (watchTextMatch) return normalizeRedgifsUrl(watchTextMatch[0]);

    return null;
  }

  function findClickableByText(pattern) {
    return [...document.querySelectorAll("button,[role='button'],[role='menuitem'],a,div,span")]
      .filter((el) => visibleRect(el).visible)
      .filter((el) => pattern.test((el.textContent || "").trim()))
      .map((el) => {
        const clickable = el.closest("button,[role='button'],[role='menuitem'],a") || el;
        const rect = clickable.getBoundingClientRect();
        return { el: clickable, area: rect.width * rect.height, rect };
      })
      .filter((item) => visibleRect(item.el).visible)
      .sort((a, b) => a.area - b.area)[0]?.el || null;
  }

  function findExactClickableText(text) {
    const pattern = new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    return findClickableByText(pattern) || findByText(pattern);
  }

  async function waitForClickableText(text, timeoutMs = 1800) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const el = findExactClickableText(text);
      if (el) return el;
      await sleep(90);
    }
    return null;
  }

  async function waitForCopiedLink(previous, timeoutMs = 8000) {
    const started = Date.now();
    let last = "";
    while (Date.now() - started < timeoutMs) {
      const captured = normalizeRedgifsUrl(capturedClipboardText);
      if (captured && capturedClipboardText !== previous) return captured;

      if (window.top === window) {
        last = await readClipboardText().catch(() => "");
        const url = normalizeRedgifsUrl(last);
        if (url && last !== previous) return url;
      }

      await sleep(150);
    }
    return null;
  }

  async function copyCurrentShareLink(options = {}) {
    await sleep(80);

    const previousClipboard = await readClipboardText().catch(() => "");
    capturedClipboardText = "";
    await clickVideoMoreMenu(options);

    let copy = (await waitForClickableText("Copy Link", 900)) || findClickableByText(/^copy\s+link$/i) || findByText(/^copy\s+link$/i);

    if (!copy) {
      let share = await waitForClickableText("Share", 1200);
      if (!share) {
        await clickVideoMoreMenu(options);
        copy = (await waitForClickableText("Copy Link", 900)) || findClickableByText(/^copy\s+link$/i) || findByText(/^copy\s+link$/i);
      }
      if (!copy && share) {
        await clickAndWait(share, 350);
        copy = (await waitForClickableText("Copy Link", 2200)) || findClickableByText(/^copy\s+link$/i) || findByText(/^copy\s+link$/i);
      }
    }

    if (!copy) {
      await clickVideoMoreMenu(options);
      copy = (await waitForClickableText("Copy Link", 1200)) || findClickableByText(/^copy\s+link$/i) || findByText(/^copy\s+link$/i);
    }

    if (!copy && window.top !== window) {
      const videoRect = currentVideoRect(options);
      for (const offset of [116, 136, 146, 106]) {
        const x = Math.min(window.innerWidth - 18, Math.max(18, videoRect.right - 34));
        const y = Math.min(window.innerHeight - 18, Math.max(18, videoRect.bottom - offset));
        await clickPoint(x, y);
        copy = (await waitForClickableText("Copy Link", 900)) || findClickableByText(/^copy\s+link$/i) || findByText(/^copy\s+link$/i);
        if (copy) break;
      }
    }

    if (!copy) throw new Error("Copy Link option not found.");
    await clickAndWait(copy, 120);

    const copied = await waitForCopiedLink(previousClipboard);
    if (!copied) throw new Error("Copied Redgifs link could not be read from clipboard.");
    return copied;
  }

  async function run() {
    if (suppressNextClick) return;

    const button = document.getElementById(BUTTON_ID);
    if (!button || button.disabled) return;

    button.disabled = true;
    setStatus("", "idle");

    try {
      const folder = await pickFolder();
      if (folder === null) return;
      chosenFolder = folder;
      const fallbackUrl = deriveCurrentShareUrl();
      const directUrls = settings.directDownloads ? collectDirectMediaCandidates(null, null, { allowViewerVideo: false }) : [];
      if (settings.directDownloads && directUrls.length) {
        await sendDirectDownload(directUrls, fallbackUrl, {
          allowRipsnipFallback: false,
          preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
          expectedSlug: expectedSlugFromUrl(fallbackUrl)
        });
        setStatus("", "idle");
        return;
      }

      const url = await copyCurrentShareLink();
      setStatus("", "idle");
      await sendDirectDownload([], url, {
        allowRipsnipFallback: false,
        preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
        expectedSlug: expectedSlugFromUrl(url)
      });
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "RG_HELPER_STATUS") return;
    if (message.level === "error") {
      setStatus(toErrorCode(message.text), "error");
    } else {
      setStatus("", "idle");
    }
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "RG_RIPSNIP_PAGE_HOOK" || data.type !== "CLIPBOARD_WRITE") return;
    capturedClipboardText = String(data.text || "");
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
    settings = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    settings.feedButtons = true;
    settings.profileButtons = true;
    syncConfiguredUi();
  });

  // Right Shift → indir
  let shiftDownloading = false;
  window.addEventListener("keydown", async (event) => {
    if (event.code !== "ShiftRight") return;
    if (!settings.rightShiftDownload) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
    if (shiftDownloading) return;

    shiftDownloading = true;
    setStatus("", "idle");
    try {
      chosenFolder = ""; // quick shortcut → main folder
      const fallbackUrl = deriveCurrentShareUrl();
      const directUrls = settings.directDownloads
        ? collectDirectMediaCandidates(null, null, { allowViewerVideo: true, includePerformance: true })
        : [];
      if (settings.directDownloads && (directUrls.length || fallbackUrl)) {
        await sendDirectDownload(directUrls, fallbackUrl, {
          allowRipsnipFallback: false,
          preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
          expectedSlug: expectedSlugFromUrl(fallbackUrl)
        });
      } else {
        const url = await copyCurrentShareLink({ allowViewerVideo: true });
        await sendDirectDownload([], url, {
          allowRipsnipFallback: false,
          preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
          expectedSlug: expectedSlugFromUrl(url)
        });
      }
      setStatus("", "idle");
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      shiftDownloading = false;
    }
  }, { passive: true });

  // ── App floating-button bridge ─────────────────────────────────────────────
  // The in-app browser drives downloads from here instead of the hidden tile
  // buttons. RedGifs sponsored-creator tiles and off-redgifs ad images are
  // dropped by isProbablyAdElement, and only media that carries a real slug
  // (data-feed-item-id / a /watch/ link) is vouched for, so the app never offers
  // a download on an ad. Each item carries its watch-page permalink so the list
  // saves the real link, not the domain. Downloads route through the same
  // resolvers the visible buttons use — direct CDN mp4/jpg first, Copy-Link
  // fallback for blob/HLS feed videos.

  // The app has no folder chooser, so downloads land in the main folder (niche
  // pages still auto-sort via currentNicheFolder() inside sendDirectDownload).
  async function bridgeWatchCardDownload(watchUrl, card) {
    chosenFolder = "";
    const video = card && card.querySelector ? card.querySelector("video") : null;
    const directUrls = settings.directDownloads
      ? [...new Set([
          ...collectDirectMediaCandidates(card, video, { includePerformance: false }),
          ...cdnUrlsForWatch(watchUrl)
        ])]
      : [];
    try {
      await sendDirectDownload(directUrls, watchUrl, {
        allowRipsnipFallback: false,
        preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
        expectedSlug: expectedSlugFromUrl(watchUrl)
      });
      return;
    } catch (error) {
      // Direct CDN + slug-API both came up empty (the "url bulunamadı" case a
      // grid card with no live <video> hits). Bring the card into view and let
      // the share-menu Copy-Link path resolve it, exactly like the visible
      // feed-video button does, instead of surfacing the error (KÖK-VIDEO-POSTER).
      console.warn("[rg-redgifs] köprü kart doğrudan yol başarısız, Copy Link:", error && error.message || error);
    }
    try { card?.scrollIntoView?.({ block: "center", inline: "center", behavior: "instant" }); } catch { /* ignore */ }
    await sleep(200);
    const url = await copyCurrentShareLink();
    await sendDirectDownload([], url, {
      allowRipsnipFallback: false,
      preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
      expectedSlug: expectedSlugFromUrl(url)
    });
  }

  // Grid/feed cells that carry a /watch/ link but no data-feed-item-id — the
  // shape some niches and creator layouts render. Mirrors installWatchCardButtons'
  // card resolution so the app sees exactly the media the on-card buttons would.
  function bridgeWatchLinkCells(seen) {
    const out = [];
    for (const link of document.querySelectorAll("a[href*='/watch/']")) {
      const watchUrl = normalizeRedgifsWatchUrl(link.href);
      if (!watchUrl) continue;
      let card = link;
      const lr = link.getBoundingClientRect();
      if (lr.width < 120 || lr.height < 120) {
        let node = link.parentElement;
        for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
          const r = node.getBoundingClientRect();
          if (r.width >= 120 && r.height >= 120) { card = node; break; }
        }
      }
      if (!(card instanceof HTMLElement) || seen.has(card)) continue;
      const cr = card.getBoundingClientRect();
      if (cr.width < 120 || cr.height < 120) continue;
      if (!visibleRect(card).visible) continue;
      if (isProbablyAdElement(card)) continue;
      seen.add(card);
      const media = card.querySelector("video, img") || card;
      out.push({ el: media, kind: card.querySelector("video") ? "video" : "image", src: "",
        permalink: watchUrl, title: "",
        resolve: () => bridgeWatchCardDownload(watchUrl, card).catch(() => {}) });
    }
    return out;
  }

  async function bridgeImageDownload(item) {
    chosenFolder = "";
    const img = [...item.querySelectorAll("img")]
      .map((i) => ({ i, r: i.getBoundingClientRect() }))
      .sort((a, b) => b.r.width * b.r.height - a.r.width * a.r.height)[0]?.i;
    const raw = img ? avatarBestUrl(img) : "";
    const large = redgifsLargeImage(raw);
    const clean = raw.replace(/-(?:small|mobile|mini|thumbnail|thumb|preview|poster|sd|medium|large)(\.(?:jpg|jpeg|png|webp))/i, "$1");
    const candidates = [...new Set([large, clean, raw].filter(Boolean))];
    if (!candidates.length) throw new Error("No image url.");
    await sendDirectDownload(candidates, "", { allowRipsnipFallback: false, imageMode: true });
  }

  async function bridgeViewerDownload(item) {
    chosenFolder = "";
    const container = closestVideoContainer(item.video);
    const fallbackUrl = watchUrlFromFeedItem(item.video)
      || (activeFeedItemSlug() ? `https://www.redgifs.com/watch/${activeFeedItemSlug()}` : null)
      || normalizeRedgifsWatchUrl(location.href)
      || deriveCurrentShareUrl();
    let directUrls = collectDirectMediaCandidates(container, item.video, { allowViewerVideo: true, includePerformance: true });
    directUrls = [...new Set([...directUrls, ...cdnUrlsForWatch(fallbackUrl)])];
    try {
      await sendDirectDownload(directUrls, fallbackUrl, {
        allowRipsnipFallback: false,
        preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
        expectedSlug: expectedSlugFromMedia(container, item.video, fallbackUrl)
      });
      return;
    } catch { /* blob/HLS with no derivable slug → Copy Link fallback */ }
    const url = await copyCurrentShareLink({ allowViewerVideo: true });
    await sendDirectDownload([], url, {
      allowRipsnipFallback: false,
      preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
      expectedSlug: expectedSlugFromUrl(url)
    });
  }

  async function bridgeTileDownload(root, media) {
    chosenFolder = "";
    const fallbackUrl = findProfileTileWatchUrl(root, media);
    const directUrls = settings.directDownloads ? collectDirectMediaCandidates(root, media) : [];
    if (settings.directDownloads && directUrls.length) {
      await sendDirectDownload(directUrls, fallbackUrl, {
        allowRipsnipFallback: false,
        preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
        expectedSlug: expectedSlugFromMedia(root, media, fallbackUrl)
      });
      return;
    }
    const returnUrl = location.href;
    const openResult = await openProfileTile(root, media, fallbackUrl, returnUrl);
    if (openResult === "navigating") return;
    const url = await copyProfileShareLinkWithFallback(fallbackUrl);
    await sendDirectDownload([], url, {
      allowRipsnipFallback: false,
      preferRipsnipWhenOpen: settings.ripsnipWhenOpen,
      expectedSlug: expectedSlugFromUrl(url)
    });
    await returnFromProfileTile(returnUrl);
  }

  function bridgeFeedCell(item) {
    const slug = item.getAttribute("data-feed-item-id");
    if (!slug || !/^[a-z0-9]{4,}$/i.test(slug)) return null;
    const rect = item.getBoundingClientRect();
    if (rect.width < 90 || rect.height < 90) return null;
    if (!visibleRect(item).visible) return null;
    if (isProbablyAdElement(item)) return null;

    const watchUrl = `https://www.redgifs.com/watch/${slug.toLowerCase()}`;
    const media = item.querySelector("video, img") || item;
    const isImage = /\/images(?:\/|$|\?)/i.test(location.pathname) || /GifPreview_isImage/i.test(String(item.className || ""));
    if (isImage) {
      return { el: media, kind: "image", src: "", permalink: watchUrl, title: "",
        resolve: () => bridgeImageDownload(item).catch(() => {}) };
    }
    return { el: media, kind: "video", src: "", permalink: watchUrl, title: "",
      resolve: () => bridgeWatchCardDownload(watchUrl, item).catch(() => {}) };
  }

  window.__rgSiteName = "redgifs.com";
  window.__rgCollectMedia = () => {
    const out = [];
    const seen = new Set();

    // A fullscreen / watch-page viewer (one big video filling the screen) takes
    // priority: return just it so the app doesn't also frame the grid tiles
    // behind it, and fullscreen taps count as a single download.
    const viewer = viewerVideoItem();
    if (
      viewer &&
      viewer.rect.width > 300 &&
      viewer.rect.height > 300 &&
      !(isProfilePage() && isInProfileGrid(viewer.video))
    ) {
      const permalink = watchUrlFromFeedItem(viewer.video)
        || (activeFeedItemSlug() ? `https://www.redgifs.com/watch/${activeFeedItemSlug()}` : null)
        || normalizeRedgifsWatchUrl(location.href)
        || location.href;
      out.push({ el: viewer.video, kind: "video", src: "", permalink, title: "",
        resolve: () => bridgeViewerDownload(viewer).catch(() => {}) });
      return out;
    }

    // Profile grids don't use data-feed-item-id; resolve each tile through the
    // proven tile flow (direct URL, else open + Copy Link).
    if (isProfilePage()) {
      const medias = [...document.querySelectorAll("img, video")]
        .filter((media) => visibleRect(media).visible)
        .filter((media) => {
          const r = media.getBoundingClientRect();
          return r.width >= 90 && r.height >= 90;
        });
      for (const media of medias) {
        const root = tileRootFromMedia(media);
        if (!root || seen.has(root)) continue;
        seen.add(root);
        const watchUrl = findProfileTileWatchUrl(root, media);
        out.push({ el: media, kind: media.tagName === "VIDEO" ? "video" : "image", src: "",
          permalink: watchUrl || location.href, title: "",
          resolve: () => bridgeTileDownload(root, media).catch(() => {}) });
      }
      return out;
    }

    // Feed / explore / niches grids: every cell carries its slug in
    // data-feed-item-id (video or image).
    for (const item of document.querySelectorAll("[data-feed-item-id]")) {
      if (seen.has(item)) continue;
      const descriptor = bridgeFeedCell(item);
      if (!descriptor) continue;
      seen.add(item);
      out.push(descriptor);
    }

    // Some niches and creator layouts render cards with a /watch/ link but no
    // data-feed-item-id, so the loop above finds nothing ("niches'te hiçbir
    // video algılanmıyor"). Fall back to those cards — canonical watch links are
    // RedGifs' most stable structure, so this covers the pages the attribute
    // scan misses without inventing per-layout selectors.
    if (!out.length) out.push(...bridgeWatchLinkCells(seen));
    return out;
  };

  loadSettings();
  installUi();
  let installPending = false;
  const observer = new MutationObserver(() => {
    if (installPending || document.hidden) return;
    installPending = true;
    window.requestAnimationFrame(() => {
      installPending = false;
      installUi();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  function updateFloatingButtons() {
    if (document.hidden) return;
    updateViewerButton();
    updateAvatarButton();
  }
  let avatarMovePending = false;
  document.addEventListener("mousemove", (event) => {
    avatarMouseX = event.clientX;
    avatarMouseY = event.clientY;
    if (avatarMovePending) return;
    avatarMovePending = true;
    window.requestAnimationFrame(() => { avatarMovePending = false; updateAvatarButton(); });
  }, { passive: true, capture: true });
  window.addEventListener("scroll", () => window.requestAnimationFrame(updateFloatingButtons), { passive: true });
  window.addEventListener("resize", () => window.requestAnimationFrame(updateFloatingButtons));
  setInterval(updateFloatingButtons, 700);
})();
