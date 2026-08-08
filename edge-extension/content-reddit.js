(() => {
  if (window.__rgDownloaderRedditLoaded) return;
  window.__rgDownloaderRedditLoaded = true;
  console.info("%c[rg-reddit] content script yüklendi", "color:#ff4500;font-weight:bold", location.href);

  const { SETTINGS_KEY, DEFAULT_SETTINGS } = globalThis.RG_SETTINGS;
  const READY_ATTR = "data-rg-downloader-reddit-ready";
  const BUTTON_CLASS = "rg-downloader-reddit-button";
  const MULTI_BUTTON_CLASS = "rg-downloader-reddit-multi-button";
  const OVERLAY_ID = "rg-downloader-reddit-overlay";
  const WEB_BUTTON_ID = "rg-downloader-reddit-web"; // özellik D: "web listesi"
  const STATUS_ID = "rg-downloader-reddit-status";
  let settings = { ...DEFAULT_SETTINGS };
  let statusTimer = null;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toErrorCode(error) {
    const text = String(error && (error.message || error) || "");
    if (/disabled/i.test(text)) return "E_DISABLED";
    if (/not found|no image/i.test(text)) return "E_NO_IMAGE";
    if (/timed out/i.test(text)) return "E_TIMEOUT";
    if (/Download failed/i.test(text)) return "E_DOWNLOAD";
    return "E_FAILED";
  }

  function setStatus(text, level = "idle") {
    const status = document.getElementById(STATUS_ID);
    if (!status) return;
    if (statusTimer) clearTimeout(statusTimer);
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

  function downloadIconSvg() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
      </svg>
    `;
  }

  function multiIconSvg() {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="7" width="10" height="10" rx="2" stroke="currentColor" stroke-width="2.2"/>
        <path d="M9 3h8a2 2 0 0 1 2 2v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M10 10v4m0 0 2-2m-2 2-2-2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function installStyle() {
    if (document.getElementById("rg-downloader-reddit-style")) {
      // Stil zaten var ama butonlar bir postla birlikte DOM'dan sökülmüş
      // olabilir (Reddit akışı ekran dışı postları geri dönüştürür) — bug 7:
      // "kaydırdıktan sonra buton çıkmıyor". Butonları her hâlükârda tazele.
      ensureButtons();
      return;
    }
    const style = document.createElement("style");
    style.id = "rg-downloader-reddit-style";
    style.textContent = `
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
        background: rgba(153, 27, 27, .68);
        backdrop-filter: blur(6px);
        font: 500 12px/1.25 system-ui, -apple-system, Segoe UI, sans-serif;
        text-align: center;
        pointer-events: none;
        display: none;
      }
      #${STATUS_ID}:not(:empty) {
        display: block;
      }
      .${BUTTON_CLASS} {
        position: absolute;
        z-index: 2147483646;
        top: 0;
        left: 0;
        width: var(--rg-downloader-reddit-button-size, 44px);
        height: var(--rg-downloader-reddit-button-size, 44px);
        border: 0;
        border-radius: 999px;
        padding: 0;
        display: grid;
        place-items: center;
        color: #fff;
        background: rgba(37, 99, 235, .76);
        box-shadow: 0 8px 20px rgba(0,0,0,.38);
        opacity: 0;
        transform: scale(.92);
        cursor: pointer;
        transition: opacity .12s ease, transform .12s ease, background .12s ease;
      }
      [${READY_ATTR}="1"]:hover > .${BUTTON_CLASS},
      [${READY_ATTR}="1"]:hover > .${MULTI_BUTTON_CLASS},
      html[data-rg-downloader-button-visibility="always"] .${BUTTON_CLASS},
      html[data-rg-downloader-button-visibility="always"] .${MULTI_BUTTON_CLASS},
      .${BUTTON_CLASS}[data-rg-visible="1"],
      .${MULTI_BUTTON_CLASS}[data-rg-visible="1"],
      .${BUTTON_CLASS}:focus-visible {
        opacity: 1;
        transform: scale(1);
      }
      .${MULTI_BUTTON_CLASS} {
        position: absolute;
        z-index: 2147483646;
        top: 0;
        left: 0;
        width: var(--rg-downloader-reddit-button-size, 44px);
        height: var(--rg-downloader-reddit-button-size, 44px);
        border: 0;
        border-radius: 999px;
        padding: 0;
        display: none;
        place-items: center;
        color: #fff;
        background: rgba(15, 23, 42, .78);
        box-shadow: 0 8px 20px rgba(0,0,0,.38);
        opacity: 0;
        transform: scale(.92);
        cursor: pointer;
        transition: opacity .12s ease, transform .12s ease, background .12s ease;
      }
      .${BUTTON_CLASS}:hover {
        background: rgba(37, 99, 235, .98);
      }
      .${MULTI_BUTTON_CLASS}:hover {
        background: rgba(15, 23, 42, .96);
      }
      .${BUTTON_CLASS}:disabled,
      .${MULTI_BUTTON_CLASS}:disabled {
        opacity: .55;
        cursor: wait;
      }
      .${BUTTON_CLASS} svg,
      .${MULTI_BUTTON_CLASS} svg {
        width: calc(var(--rg-downloader-reddit-button-size, 44px) * .55);
        height: calc(var(--rg-downloader-reddit-button-size, 44px) * .55);
        pointer-events: none;
      }
      .${MULTI_BUTTON_CLASS}[data-rg-visible="1"] {
        display: grid;
      }
    `;
    document.documentElement.appendChild(style);

    const status = document.createElement("div");
    status.id = STATUS_ID;
    status.dataset.level = "idle";
    document.documentElement.appendChild(status);

    ensureButtons();
  }

  // Overlay butonları tekildir; updateOverlayButtons onları etkin görselin post
  // kökünün içine taşır. Reddit akışı o postu ekran dışına çıkınca DOM'dan
  // söküp yok edebilir — böylece butonlar da yok olur ve "kaydırdıktan sonra
  // buton çıkmıyor" (bug 7). Bu yüzden yalnızca canlı belgede bağlı değillerse
  // yeniden yaratılırlar (getElementById kopuk düğümü bulamaz → null → yenile).
  function ensureButtons() {
    if (!document.getElementById(OVERLAY_ID)) {
      const single = document.createElement("button");
      single.id = OVERLAY_ID;
      single.type = "button";
      single.className = BUTTON_CLASS;
      single.title = "Download original image";
      single.setAttribute("aria-label", "Download original image");
      single.innerHTML = downloadIconSvg();
      single.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      single.addEventListener("click", runOverlayImageDownload);
      document.documentElement.appendChild(single);
    }

    const existingMulti = document.querySelector(`.${MULTI_BUTTON_CLASS}`);
    if (!existingMulti || !existingMulti.isConnected) {
      const multi = document.createElement("button");
      multi.type = "button";
      multi.className = MULTI_BUTTON_CLASS;
      multi.title = "Download all images in this post";
      multi.setAttribute("aria-label", "Download all images in this post");
      multi.innerHTML = multiIconSvg();
      multi.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      multi.addEventListener("click", runOverlayMultiDownload);
      document.documentElement.appendChild(multi);
    }

    // Özellik D: tek görsel butonunun ALTINDA "web listesi" butonu. Tekildir,
    // updateOverlayButtons onu etkin görselin post köküne taşıyıp konumlar.
    if (window.rgMakeWebIconButton && (!document.getElementById(WEB_BUTTON_ID) || !document.getElementById(WEB_BUTTON_ID).isConnected)) {
      const web = window.rgMakeWebIconButton(() => {
        const img = web.__rgDownloaderImage;
        return { url: postPermalink(img) || location.href, title: postTitle(img) || document.title };
      }, { size: clamp(Number(settings.buttonSize) || 44, 28, 72) });
      web.id = WEB_BUTTON_ID;
      web.style.position = "absolute";
      web.style.display = "none";
      document.documentElement.appendChild(web);
    }
  }

  function isProfileAvatar(img) {
    if (!settings.hideRedditProfileAvatars) return false;
    const rect = img.getBoundingClientRect();
    const label = [
      img.alt,
      img.getAttribute("aria-label"),
      img.getAttribute("class"),
      img.closest("[data-testid*='avatar' i], [class*='avatar' i], faceplate-img")?.getAttribute("class")
    ].filter(Boolean).join(" ");

    const visible = rect.width > 0 && rect.height > 0;
    return /avatar|profile|user icon|snoovatar/i.test(label) || visible && rect.width <= 96 && rect.height <= 96;
  }

  const REDDIT_IMG_HOST_RE = /redd\.it|redditmedia|redditstatic|preview\.redd|external-preview\.redd|v\.redd\.it/i;
  const REDDIT_IMG_SKIP_RE = /emoji|icon|avatar|snoovatar|award/i;

  // Recursively query a selector across the light DOM and every nested shadow root.
  function deepQueryAll(selector, root = document) {
    const out = [];
    const walk = (node) => {
      if (!node) return;
      if (node.querySelectorAll) {
        for (const el of node.querySelectorAll(selector)) out.push(el);
      }
      // Descend into any shadow roots found under this node
      const hosts = node.querySelectorAll ? node.querySelectorAll("*") : [];
      for (const host of hosts) {
        if (host.shadowRoot) walk(host.shadowRoot);
      }
    };
    walk(root);
    return [...new Set(out)];
  }

  // Walk up the ancestor chain, crossing shadow-root boundaries via host.
  function deepClosest(el, selector) {
    let node = el;
    while (node) {
      if (node.nodeType === 1 && node.matches?.(selector)) return node;
      if (node.parentElement) {
        node = node.parentElement;
      } else if (node.parentNode && node.parentNode.host) {
        node = node.parentNode.host; // jump out of a shadow root to its host
      } else {
        node = node.parentNode;
      }
    }
    return null;
  }

  // Gather all <img> elements including nested shadow roots (shreddit uses them)
  function queryAllImages(root = document) {
    return deepQueryAll("img", root);
  }

  function isCandidateImage(img) {
    const check = visibleRect(img);
    if (!check.visible) return false;
    const rect = check.rect;
    if (rect.width < 120 || rect.height < 120) return false;
    if (isProfileAvatar(img)) return false;
    const src = [img.currentSrc, img.src, img.srcset].filter(Boolean).join(" ");
    if (!REDDIT_IMG_HOST_RE.test(src)) return false;
    if (REDDIT_IMG_SKIP_RE.test(src)) return false;
    return true;
  }

  function isPotentialGalleryImage(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    if (isProfileAvatar(img)) return false;
    const src = [img.currentSrc, img.src, img.srcset].filter(Boolean).join(" ");
    if (!REDDIT_IMG_HOST_RE.test(src)) return false;
    if (REDDIT_IMG_SKIP_RE.test(src)) return false;
    return true;
  }

  function imageRoot(img) {
    const imgRect = img.getBoundingClientRect();
    const selectors = [
      "shreddit-post",
      "[data-testid='post-container']",
      "article",
      "figure",
      "a[href]",
      "div"
    ];
    const candidates = [];
    let node = img.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      if (node === document.body || node === document.documentElement) continue;
      if (!selectors.some((selector) => node.matches?.(selector))) continue;
      const rect = node.getBoundingClientRect();
      const contains =
        rect.left <= imgRect.left + 2 &&
        rect.top <= imgRect.top + 2 &&
        rect.right >= imgRect.right - 2 &&
        rect.bottom >= imgRect.bottom - 2;
      const area = Math.max(1, rect.width * rect.height);
      const imageArea = Math.max(1, imgRect.width * imgRect.height);
      if (contains && rect.width <= window.innerWidth * 0.98 && area <= imageArea * 5) {
        candidates.push({ node, area });
      }
    }
    return candidates.sort((a, b) => a.area - b.area)[0]?.node || img.parentElement;
  }

  function postRoot(img) {
    const post = deepClosest(img, "shreddit-post, [data-testid='post-container'], article");
    if (!post) return imageRoot(img);
    const images = queryAllImages(post).filter(isPotentialGalleryImage);
    return images.length > 1 ? post : imageRoot(img);
  }

  function activeImageInRoot(root) {
    const viewportCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return queryAllImages(root)
      .filter(isCandidateImage)
      .map((img) => {
        const rect = img.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        const area = visibleWidth * visibleHeight;
        const center = {
          x: Math.max(0, Math.min(window.innerWidth, rect.left + rect.width / 2)),
          y: Math.max(0, Math.min(window.innerHeight, rect.top + rect.height / 2))
        };
        const distance = Math.hypot(center.x - viewportCenter.x, center.y - viewportCenter.y);
        return { img, rect, area, distance };
      })
      .filter((item) => item.area > 10000)
      .sort((a, b) => b.area - a.area || a.distance - b.distance)[0]?.img || null;
  }

  function activeImageOnPage() {
    const viewportCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return queryAllImages()
      .filter(isCandidateImage)
      .map((img) => {
        const rect = img.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
        const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
        const area = visibleWidth * visibleHeight;
        const center = {
          x: Math.max(0, Math.min(window.innerWidth, rect.left + rect.width / 2)),
          y: Math.max(0, Math.min(window.innerHeight, rect.top + rect.height / 2))
        };
        const distance = Math.hypot(center.x - viewportCenter.x, center.y - viewportCenter.y);
        return { img, rect, area, distance };
      })
      .filter((item) => item.area > 10000)
      .sort((a, b) => b.area - a.area || a.distance - b.distance)[0]?.img || null;
  }

  function imageIdentity(img) {
    const urls = collectImageUrls(imageRoot(img), img);
    return urls[0] || img.currentSrc || img.src || "";
  }

  function imageUrlKey(url) {
    try {
      const parsed = new URL(url);
      return decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || parsed.pathname).toLowerCase();
    } catch {
      return String(url || "").split("?")[0].toLowerCase();
    }
  }

  function isAvatarishElement(el) {
    if (!(el instanceof Element)) return false;
    const label = [
      el.getAttribute("aria-label"),
      el.getAttribute("alt"),
      el.getAttribute("class"),
      el.getAttribute("data-testid")
    ].filter(Boolean).join(" ");
    return /avatar|profile|user icon|snoovatar/i.test(label) ||
      Boolean(el.closest("[data-testid*='avatar' i], [class*='avatar' i], faceplate-img"));
  }

  function isLikelyAvatarUrl(url) {
    return /avatar|snoovatar|profileicon|styles\.redditmedia\.com\/.*icon/i.test(String(url || ""));
  }

  function bestImageUrl(urls) {
    const list = [...new Set(urls || [])].filter((url) => !isLikelyAvatarUrl(url));
    return (
      list.find((url) => /^https?:\/\/i\.redd\.it\//i.test(url)) ||
      list.find((url) => /^https?:\/\/preview\.redd\.it\//i.test(url)) ||
      list.find((url) => /redditmedia\.com/i.test(url)) ||
      list[0] ||
      ""
    );
  }

  function allImageUrlsInRoot(root) {
    const seen = new Set();
    const urlSeen = new Set();
    const urls = [];
    // Add EVERY candidate for an image (best first, then fallbacks like the
    // signed preview.redd.it) so the background can fall through if the i.redd.it
    // original returns an HTML consent page (NSFW). `seen` dedupes by image,
    // `urlSeen` dedupes exact URLs.
    const addBest = (candidates) => {
      const best = bestImageUrl(candidates);
      const identity = imageUrlKey(best);
      if (!best || !identity || seen.has(identity)) return;
      seen.add(identity);
      const ordered = [best, ...(candidates || []).filter((u) => u && u !== best)];
      for (const u of ordered) {
        if (!urlSeen.has(u)) { urlSeen.add(u); urls.push(u); }
      }
    };

    for (const img of queryAllImages(root).filter(isPotentialGalleryImage)) {
      addBest(collectImageUrls(imageRoot(img), img));
    }

    for (const el of deepQueryAll("a[href], source[srcset], [style], [data-url], [data-media-url], [data-testid]", root)) {
      if (isAvatarishElement(el)) continue;
      const candidates = [];
      if (el instanceof HTMLAnchorElement) candidates.push(...redditOriginalFromUrl(el.href));
      if (el instanceof HTMLSourceElement) candidates.push(...urlsFromSrcset(el.srcset));
      for (const attr of el.attributes || []) {
        if (/^(href|src|srcset|style)$/i.test(attr.name) || attr.name.toLowerCase().startsWith("data-")) {
          candidates.push(...redditOriginalFromUrl(attr.value), ...urlsFromSrcset(attr.value));
        }
      }
      addBest(candidates);
    }

    return urls;
  }

  function updateButtonPositions(root) {
    const single = root.querySelector(`.${BUTTON_CLASS}`);
    const multi = root.querySelector(`.${MULTI_BUTTON_CLASS}`);
    if (!single) return;

    const img = activeImageInRoot(root) || root.querySelector("img");
    if (!img) {
      single.style.display = "none";
      if (multi) multi.style.display = "none";
      return;
    }

    const rect = img.getBoundingClientRect();
    const size = clamp(Number(settings.buttonSize) || 44, 28, 72);
    const gap = 8;
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    if (visibleWidth < 80 || visibleHeight < 80) {
      single.style.display = "none";
      if (multi) multi.style.display = "none";
      return;
    }

    const left = 10;
    const top = 10;
    single.style.left = `${left}px`;
    single.style.top = `${top}px`;
    single.style.display = "grid";
    single.__rgDownloaderImage = img;

    if (multi) {
      const multiRoot = multi.__rgDownloaderRoot || root;
      const count = uniqueImageCount(multiRoot);
      multi.style.left = `${left + size + gap}px`;
      multi.style.top = `${top}px`;
      multi.dataset.rgVisible = count > 1 ? "1" : "0";
    }
  }

  function updateOverlayButtons() {
    const single = document.getElementById(OVERLAY_ID);
    const multi = document.querySelector(`.${MULTI_BUTTON_CLASS}`);
    if (!single || !multi) return;
    const web = document.getElementById(WEB_BUTTON_ID);

    const hideButtons = () => {
      single.style.display = "none";
      multi.style.display = "none";
      if (web) web.style.display = "none";
      delete single.dataset.rgVisible;
      delete multi.dataset.rgVisible;
    };

    if (!settings.redditImages) {
      hideButtons();
      return;
    }

    const img = activeImageOnPage();
    if (!img) {
      hideButtons();
      return;
    }

    const rect = img.getBoundingClientRect();
    const targetRoot = imageRoot(img);
    if (!targetRoot) {
      hideButtons();
      return;
    }

    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    if (visibleWidth < 80 || visibleHeight < 80) {
      hideButtons();
      return;
    }

    const style = window.getComputedStyle(targetRoot);
    if (style.position === "static") targetRoot.style.position = "relative";
    targetRoot.setAttribute(READY_ATTR, "1");
    if (single.parentElement !== targetRoot || multi.parentElement !== targetRoot) {
      targetRoot.append(single, multi);
    }
    if (web && web.parentElement !== targetRoot) targetRoot.append(web);

    const size = clamp(Number(settings.buttonSize) || 44, 28, 72);
    const gap = 8;
    const rootRect = targetRoot.getBoundingClientRect();
    const maxLeft = Math.max(8, rootRect.width - size - 8);
    const maxTop = Math.max(8, rootRect.height - size - 8);
    const left = clamp(rect.left - rootRect.left + 10, 8, maxLeft);
    const top = clamp(rect.top - rootRect.top + 10, 8, maxTop);
    const post = postRoot(img);

    single.style.left = `${left}px`;
    single.style.top = `${top}px`;
    single.style.display = "grid";
    delete single.dataset.rgVisible;
    single.__rgDownloaderImage = img;
    single.__rgDownloaderRoot = imageRoot(img);

    // Web listesi butonu tam tek görsel butonunun altında (özellik D).
    if (web) {
      web.style.left = `${left}px`;
      web.style.top = `${clamp(top + size + gap, 8, maxTop)}px`;
      web.style.display = "grid";
      web.__rgDownloaderImage = img;
    }

    multi.style.left = `${clamp(left + size + gap, 8, maxLeft)}px`;
    multi.style.top = `${top}px`;
    multi.__rgDownloaderRoot = post || imageRoot(img);
    if (uniqueImageCount(multi.__rgDownloaderRoot) > 1) {
      multi.style.display = "grid";
      delete multi.dataset.rgVisible;
    } else {
      multi.style.display = "none";
      delete multi.dataset.rgVisible;
    }
  }

  function movePostButtonsToActiveImage(post) {
    const single = post.querySelector(`:scope > .${BUTTON_CLASS}`);
    const multi = post.querySelector(`:scope > .${MULTI_BUTTON_CLASS}`);
    if (!single || !multi) return;

    const activeImg = activeImageInRoot(post);
    if (!activeImg) return;

    const targetRoot = imageRoot(activeImg);
    if (!targetRoot || targetRoot === post || targetRoot.contains(single)) {
      updateButtonPositions(targetRoot || post);
      return;
    }

    const style = window.getComputedStyle(targetRoot);
    if (style.position === "static") targetRoot.style.position = "relative";
    targetRoot.setAttribute(READY_ATTR, "1");
    targetRoot.append(single, multi);
    single.__rgDownloaderImage = activeImg;
    multi.__rgDownloaderRoot = post;
    updateButtonPositions(targetRoot);
  }

  function uniqueImageCount(root) {
    if (!root) return 0;
    const identities = new Set(
      queryAllImages(root)
        .filter(isPotentialGalleryImage)
        .map(imageIdentity)
        .filter(Boolean)
    );
    if (identities.size > 1) return identities.size;

    const hasGalleryUi = deepQueryAll(
      '[aria-roledescription="carousel"], button[aria-label="Next"], button[aria-label="Previous"], button[aria-label="Go back"]',
      root
    ).length > 0;
    return hasGalleryUi ? 2 : identities.size;
  }

  function decodeMaybe(value) {
    const values = [String(value || "").replace(/&amp;/g, "&")];
    try {
      const decoded = decodeURIComponent(values[0]);
      if (decoded !== values[0]) values.push(decoded);
    } catch {
      // Keep raw value.
    }
    return values;
  }

  function normalizeUrl(value) {
    if (!value) return "";
    try {
      return new URL(value, location.href).toString();
    } catch {
      return "";
    }
  }

  function redditOriginalFromUrl(value) {
    const urls = [];
    for (const raw of decodeMaybe(value)) {
      const matches = raw.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [raw];
      for (const item of matches) {
        const clean = normalizeUrl(item.replace(/[.,;]+$/, ""));
        if (!clean) continue;

        try {
          const parsed = new URL(clean);
          const wrapped = parsed.searchParams.get("url") || parsed.searchParams.get("u");
          if (wrapped) urls.push(...redditOriginalFromUrl(wrapped));

          if (/^(preview|external-preview)\.redd\.it$/i.test(parsed.hostname)) {
            const original = new URL(parsed.toString());
            original.hostname = "i.redd.it";
            original.search = "";
            urls.push(original.toString());
          }

          const isRedditImageHost =
            /^(i|preview|external-preview)\.redd\.it$/i.test(parsed.hostname) ||
            /(?:^|\.)redditmedia\.com$/i.test(parsed.hostname) ||
            /(?:^|\.)redditstatic\.com$/i.test(parsed.hostname);

          if (isRedditImageHost && /\.(jpg|jpeg|png|webp|gif)(?:$|[?#])/i.test(parsed.pathname + parsed.search)) {
            urls.push(clean);
          }
        } catch {
          // Ignore malformed candidate.
        }
      }
    }
    return urls;
  }

  function urlsFromSrcset(srcset) {
    return String(srcset || "")
      .split(",")
      .map((part) => {
        const [url, descriptor] = part.trim().split(/\s+/);
        const width = Number((descriptor || "").replace(/[^\d.]/g, "")) || 0;
        return { url, width };
      })
      .filter((item) => item.url)
      .sort((a, b) => b.width - a.width)
      .flatMap((item) => redditOriginalFromUrl(item.url));
  }

  function collectImageUrls(root, img) {
    const values = [];
    const direct = [
      ...redditOriginalFromUrl(img.currentSrc),
      ...redditOriginalFromUrl(img.src),
      ...urlsFromSrcset(img.srcset)
    ];
    const scope = imageRoot(img) || root;

    function addValue(value) {
      if (value) values.push(value);
    }

    function addElement(el) {
      if (!(el instanceof Element)) return;
      addValue(el.href);
      addValue(el.currentSrc);
      addValue(el.src);
      addValue(el.srcset);
      for (const attr of el.attributes || []) {
        if (/^(href|src|srcset|style)$/i.test(attr.name) || attr.name.toLowerCase().startsWith("data-")) {
          addValue(attr.value);
        }
      }
    }

    addElement(img);
    addElement(scope);
    for (const el of scope.querySelectorAll?.("a[href], img[src], source[srcset], [style], [data-url], [data-media-url]") || []) {
      addElement(el);
    }

    for (const source of scope.querySelectorAll?.("source[srcset]") || []) {
      direct.push(...urlsFromSrcset(source.srcset));
    }
    direct.push(...urlsFromSrcset(img.srcset));

    const anchorOriginals = [...scope.querySelectorAll?.("a[href]") || []]
      .flatMap((link) => redditOriginalFromUrl(link.href));
    direct.unshift(...anchorOriginals);

    const resolved = [...direct, ...values.flatMap(redditOriginalFromUrl)];
    for (const value of [img.currentSrc, img.src]) {
      const clean = normalizeUrl(value);
      if (clean && /\.(jpg|jpeg|png|webp|gif)(?:$|[?#])/i.test(clean)) resolved.push(clean);
    }
    return [...new Set(resolved)];
  }

  function sendDirectDownload(urls, options = {}) {
    console.info("[rg-reddit] indirme URL'leri", { count: (urls || []).length, downloadAll: !!options.downloadAll, urls });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Direct media timed out.")), options.downloadAll ? 60000 : 18000);
      chrome.runtime.sendMessage({ type: "DIRECT_DOWNLOAD", urls, allowRipsnipFallback: false, ...options }, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || response.ok === false) {
          console.warn("[rg-reddit] arka plan HATA", response);
          reject(new Error(response?.error || "Direct media not found."));
          return;
        }
        console.info("[rg-reddit] arka plan yanıtı", response);
        resolve(response);
      });
    });
  }

  async function runImageDownload(event, root, img) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");

    try {
      if (!settings.redditImages) throw new Error("Images disabled.");
      const activeImg = button.__rgDownloaderImage || activeImageInRoot(root) || img;
      const urls = collectImageUrls(root, activeImg);
      if (!urls.length) throw new Error("Original image not found.");
      const folder = window.rgChooseFolder ? await window.rgChooseFolder() : "";
      if (folder === null) return;
      await sendDirectDownload(urls, { folderName: folder, source: postSource(activeImg) });
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
      updateButtonPositions(root);
    }
  }

  async function runMultiDownload(event, root) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");

    try {
      if (!settings.redditImages) throw new Error("Images disabled.");
      const multiRoot = button.__rgDownloaderRoot || root;
      const urls = allImageUrlsInRoot(multiRoot);
      if (!urls.length) throw new Error("Original image not found.");
      const folder = window.rgChooseFolder ? await window.rgChooseFolder() : "";
      if (folder === null) return;
      await sendDirectDownload(urls, { downloadAll: true, folderName: folder, source: postSource(multiRoot) });
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
      updateButtonPositions(root);
    }
  }

  async function runOverlayImageDownload(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");

    try {
      if (!settings.redditImages) throw new Error("Images disabled.");
      const img = button.__rgDownloaderImage || activeImageOnPage();
      if (!img) throw new Error("Original image not found.");
      const urls = collectImageUrls(imageRoot(img), img);
      if (!urls.length) throw new Error("Original image not found.");
      const folder = window.rgChooseFolder ? await window.rgChooseFolder() : "";
      if (folder === null) return;
      await sendDirectDownload(urls, { folderName: folder, source: postSource(img) });
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
      updateOverlayButtons();
    }
  }

  async function runOverlayMultiDownload(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;
    button.disabled = true;
    setStatus("", "idle");

    try {
      if (!settings.redditImages) throw new Error("Images disabled.");
      const root = button.__rgDownloaderRoot || postRoot(activeImageOnPage());
      const urls = allImageUrlsInRoot(root);
      if (!urls.length) throw new Error("Original image not found.");
      const folder = window.rgChooseFolder ? await window.rgChooseFolder() : "";
      if (folder === null) return;
      await sendDirectDownload(urls, { downloadAll: true, folderName: folder, source: postSource(root) });
    } catch (error) {
      setStatus(toErrorCode(error), "error");
    } finally {
      button.disabled = false;
      updateOverlayButtons();
    }
  }

  function installButtons() {
    installStyle();
    document.documentElement.dataset.rgDownloaderButtonVisibility = settings.buttonVisibility === "always" ? "always" : "hover";
    document.documentElement.style.setProperty("--rg-downloader-reddit-button-size", `${clamp(Number(settings.buttonSize) || 44, 28, 72)}px`);

    if (!settings.redditImages) {
      for (const button of document.querySelectorAll(`.${BUTTON_CLASS}, .${MULTI_BUTTON_CLASS}`)) {
        button.style.display = "none";
      }
      return;
    }
    updateOverlayButtons();
  }

  function updateAllButtonPositions() {
    updateOverlayButtons();
  }

  function loadSettings() {
    chrome.storage.local.get(SETTINGS_KEY, (items) => {
      const saved = items && items[SETTINGS_KEY] || {};
      settings = { ...DEFAULT_SETTINGS, ...saved };
      if (!Object.prototype.hasOwnProperty.call(saved, "redditImages")) settings.redditImages = true;
      installButtons();
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
    const saved = changes[SETTINGS_KEY].newValue || {};
    settings = { ...DEFAULT_SETTINGS, ...saved };
    if (!Object.prototype.hasOwnProperty.call(saved, "redditImages")) settings.redditImages = true;
    installButtons();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "RG_HELPER_STATUS") return;
    if (message.level === "error") setStatus(toErrorCode(message.text), "error");
  });

  // ── REDDIT SEARCH PANEL ──────────────────────────────────────────────────

  const SEARCH_PANEL_ID = "rg-reddit-search-panel";
  const SEARCH_TRIGGER_ID = "rg-reddit-search-trigger";
  const SEARCH_STYLE_ID = "rg-reddit-search-style";

  // Persistent state: survives panel open/close, reset only after search
  let spUsername = "";
  let spSubreddit = "";
  let spProviders = { reddit: true, old: true, google: false, bing: false };
  let spOpen = false;

  function spSanitize(value) {
    return String(value || "")
      .trim()
      .replace(/^https?:\/\/(?:www\.|old\.|new\.)?reddit\.com\//i, "")
      .replace(/^\/+/, "")
      .replace(/^(?:u|user|r)\//i, "")
      .replace(/^@/, "")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .slice(0, 40);
  }

  function spBuildUrl(username, subreddit, provider) {
    const user = spSanitize(username);
    const sub = spSanitize(subreddit);
    if (!user) return "";
    const u = encodeURIComponent(user);
    const authorQ = encodeURIComponent(`author:${user}`);
    const s = sub ? encodeURIComponent(sub) : "";

    // author: searches Reddit's INDEX, which a hidden profile does NOT hide —
    // so this finds the user's posts across subreddits even when their /user/
    // page is empty. t=all is required or old posts don't show (the main reason
    // it looked empty). Subreddit narrows via restrict_sr.
    if (provider === "old") {
      if (sub) return `https://old.reddit.com/r/${s}/search?q=${authorQ}&restrict_sr=on&sort=new&t=all&include_over_18=on`;
      return `https://old.reddit.com/search?q=${authorQ}&sort=new&t=all&include_over_18=on`;
    }

    // Google/Bing: the user's post pages carry the "u/{user}" byline — match the
    // exact handle (not the bare name, which hits mentions / similar names).
    if (provider === "google" || provider === "bing") {
      const q = sub ? `site:reddit.com/r/${sub} "u/${user}"` : `site:reddit.com "u/${user}"`;
      const base = provider === "google" ? "https://www.google.com/search?q=" : "https://www.bing.com/search?q=";
      return base + encodeURIComponent(q);
    }

    // Reddit (new): same global author: index search with t=all.
    if (sub) return `https://www.reddit.com/r/${s}/search/?q=${authorQ}&restrict_sr=1&sort=new&t=all&include_over_18=on`;
    return `https://www.reddit.com/search/?q=${authorQ}&sort=new&t=all`;
  }

  function installSearchStyle() {
    if (document.getElementById(SEARCH_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = SEARCH_STYLE_ID;
    s.textContent = `
      #${SEARCH_TRIGGER_ID} {
        position: fixed;
        z-index: 2147483644;
        bottom: 20px;
        left: 20px;
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 999px;
        background: rgba(37,99,235,.88);
        color: #fff;
        display: grid;
        place-items: center;
        box-shadow: 0 4px 18px rgba(0,0,0,.4);
        cursor: pointer;
        transition: background .12s, transform .12s;
      }
      #${SEARCH_TRIGGER_ID}:hover { background: rgba(37,99,235,1); transform: scale(1.07); }
      #${SEARCH_TRIGGER_ID} svg { width: 22px; height: 22px; pointer-events: none; }
      #${SEARCH_PANEL_ID} {
        position: fixed;
        z-index: 2147483645;
        bottom: 72px;
        left: 20px;
        width: 270px;
        background: #1e293b;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,.55);
        padding: 14px;
        color: #e2e8f0;
        font: 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;
        display: none;
      }
      #${SEARCH_PANEL_ID}.rg-sp-open { display: block; }
      #${SEARCH_PANEL_ID} .rg-sp-hdr {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
      }
      #${SEARCH_PANEL_ID} .rg-sp-title { font-weight: 600; font-size: 13px; color: #f1f5f9; }
      #${SEARCH_PANEL_ID} .rg-sp-x {
        background: none; border: none; color: #94a3b8; cursor: pointer;
        padding: 2px 5px; border-radius: 4px; font-size: 15px; line-height: 1;
      }
      #${SEARCH_PANEL_ID} .rg-sp-x:hover { color: #fff; }
      #${SEARCH_PANEL_ID} input[type="text"] {
        width: 100%; box-sizing: border-box;
        background: #0f172a; border: 1px solid #334155; border-radius: 6px;
        color: #e2e8f0; padding: 6px 8px; margin-bottom: 7px;
        font: 12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif; outline: none;
      }
      #${SEARCH_PANEL_ID} input[type="text"]:focus { border-color: #3b82f6; }
      #${SEARCH_PANEL_ID} .rg-sp-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 10px;
      }
      #${SEARCH_PANEL_ID} .rg-sp-lbl {
        display: flex; align-items: center; gap: 5px; cursor: pointer;
        font-size: 12px; color: #cbd5e1;
      }
      #${SEARCH_PANEL_ID} .rg-sp-lbl input[type="checkbox"] {
        accent-color: #3b82f6; width: 14px; height: 14px; cursor: pointer;
      }
      #${SEARCH_PANEL_ID} .rg-sp-btn {
        width: 100%; background: #2563eb; color: #fff; border: none;
        border-radius: 7px; padding: 7px;
        font: 600 12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;
        cursor: pointer; transition: background .1s;
      }
      #${SEARCH_PANEL_ID} .rg-sp-btn:hover { background: #1d4ed8; }
    `;
    document.documentElement.appendChild(s);
  }

  function installSearchPanel() {
    if (document.getElementById(SEARCH_TRIGGER_ID)) return;
    installSearchStyle();

    const trigger = document.createElement("button");
    trigger.id = SEARCH_TRIGGER_ID;
    trigger.type = "button";
    trigger.title = "Reddit kullanıcı ara";
    trigger.setAttribute("aria-label", "Reddit kullanıcı ara");
    trigger.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.2"/>
      <path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;

    const panel = document.createElement("div");
    panel.id = SEARCH_PANEL_ID;
    panel.innerHTML = `
      <div class="rg-sp-hdr">
        <span class="rg-sp-title">Kullanıcı Ara</span>
        <button class="rg-sp-x" type="button" aria-label="Kapat">✕</button>
      </div>
      <input type="text" id="rg-sp-user" placeholder="u/kullanici" spellcheck="false" autocomplete="off">
      <input type="text" id="rg-sp-sub" placeholder="r/subreddit (opsiyonel)" spellcheck="false" autocomplete="off">
      <div class="rg-sp-grid">
        <label class="rg-sp-lbl"><input type="checkbox" id="rg-sp-c-reddit"> Reddit</label>
        <label class="rg-sp-lbl"><input type="checkbox" id="rg-sp-c-old"> Old Reddit</label>
        <label class="rg-sp-lbl"><input type="checkbox" id="rg-sp-c-google"> Google</label>
        <label class="rg-sp-lbl"><input type="checkbox" id="rg-sp-c-bing"> Bing</label>
      </div>
      <button class="rg-sp-btn" type="button">Ara</button>
    `;

    document.documentElement.append(trigger, panel);

    const elUser = () => document.getElementById("rg-sp-user");
    const elSub = () => document.getElementById("rg-sp-sub");
    const elC = (p) => document.getElementById(`rg-sp-c-${p}`);

    function syncToPanel() {
      elUser().value = spUsername;
      elSub().value = spSubreddit;
      elC("reddit").checked = spProviders.reddit;
      elC("old").checked = spProviders.old;
      elC("google").checked = spProviders.google;
      elC("bing").checked = spProviders.bing;
    }

    function saveFromPanel() {
      spUsername = elUser().value;
      spSubreddit = elSub().value;
      spProviders.reddit = elC("reddit").checked;
      spProviders.old = elC("old").checked;
      spProviders.google = elC("google").checked;
      spProviders.bing = elC("bing").checked;
    }

    function openPanel() {
      syncToPanel();
      panel.classList.add("rg-sp-open");
      spOpen = true;
      elUser().focus();
    }

    function closePanel() {
      saveFromPanel(); // preserve text & checkbox state on close
      panel.classList.remove("rg-sp-open");
      spOpen = false;
    }

    function doSearch() {
      saveFromPanel();
      if (!spSanitize(spUsername)) { elUser().focus(); return; }
      let active = Object.entries(spProviders).filter(([, v]) => v).map(([k]) => k);
      // In the app every OPEN_TAB navigates the one and only WebView, so firing
      // several at once makes them stomp each other — the profile search "did
      // nothing" because the last provider (or a web-search page) replaced the
      // one the user wanted. There, open a single tab, preferring Reddit itself.
      const nativeApp = typeof window.rgChooseFolder === "function" || globalThis.__rgNativeBridgeLoaded === true;
      if (nativeApp && active.length > 1) {
        active = [active.includes("reddit") ? "reddit" : active.includes("old") ? "old" : active[0]];
      }
      for (const p of active) {
        const url = spBuildUrl(spUsername, spSubreddit, p);
        if (url) chrome.runtime.sendMessage({ type: "OPEN_TAB", url });
      }
      // Reset text only after a successful search
      spUsername = "";
      spSubreddit = "";
      closePanel();
    }

    trigger.addEventListener("click", () => { if (spOpen) closePanel(); else openPanel(); });
    panel.querySelector(".rg-sp-x").addEventListener("click", closePanel);
    panel.querySelector(".rg-sp-btn").addEventListener("click", doSearch);

    // Live-save text as user types so closing never loses input
    panel.addEventListener("input", (e) => {
      if (e.target.id === "rg-sp-user") spUsername = e.target.value;
      if (e.target.id === "rg-sp-sub") spSubreddit = e.target.value;
      if (e.target.type === "checkbox") {
        const map = { "rg-sp-c-reddit": "reddit", "rg-sp-c-old": "old", "rg-sp-c-google": "google", "rg-sp-c-bing": "bing" };
        if (map[e.target.id]) spProviders[map[e.target.id]] = e.target.checked;
      }
    });

    panel.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch();
      if (e.key === "Escape") closePanel();
    });

    // Click outside → close (save text)
    document.addEventListener("click", (e) => {
      if (!spOpen) return;
      if (panel.contains(e.target) || trigger.contains(e.target)) return;
      closePanel();
    }, { capture: true, passive: true });
  }

  // ── APP FLOATING-BUTTON BRIDGE ─────────────────────────────────────────────
  // The in-app browser's floating button collects media from here rather than
  // scanning the DOM generically. This is where Reddit's own rules — real post
  // media only (host + size + avatar filtered), the currently-visible slide of
  // a carousel, one frame per post — are enforced, so the picker stops framing
  // avatars, off-screen carousel siblings, and non-media tiles (Reddit reports
  // #3/#4/#5/#8). Each item resolves through collectImageUrls so the download
  // gets the original (with the NSFW preview fallbacks), and carries the post
  // permalink + title for the list (KÖK-LİSTE).

  function postContainer(el) {
    return deepClosest(el, "shreddit-post, [data-testid='post-container'], article") || imageRoot(el);
  }

  function postPermalink(el) {
    const post = postContainer(el);
    const attr = post?.getAttribute?.("permalink") || post?.getAttribute?.("content-href");
    if (attr) return normalizeUrl(attr) || location.href;
    const link = post?.querySelector?.("a[href*='/comments/']");
    if (link) return normalizeUrl(link.getAttribute("href")) || location.href;
    return location.href;
  }

  function postTitle(el) {
    const post = postContainer(el);
    const heading = (post?.getAttribute?.("post-title") || "").trim()
      || post?.querySelector?.("[slot='title'], h1, h3")?.textContent?.trim()
      || post?.querySelector?.("a[href*='/comments/']")?.textContent?.trim()
      || "";
    // The saved list note wants the post's own words, not just the headline —
    // "listeye kaydederken postun açıklama yazısını alsın". Reddit keeps the body
    // in a text-body slot; append it when it adds something the title doesn't.
    const body = post?.querySelector?.("[slot='text-body'], [data-post-click-location='text-body'], [id$='-post-rtjson-content']")
      ?.textContent?.trim() || "";
    if (body && body !== heading) {
      const extra = body.replace(/\s+/g, " ").slice(0, 280);
      return heading ? `${heading} — ${extra}` : extra;
    }
    return heading;
  }

  // Kaynak etiketi — özellik A: "her sitede hangi kullanıcıdan indirdiysek"
  // arşivde aramayla süzülebilsin. Reddit'te hem subreddit hem kullanıcı:
  // "r/<sub> u/<user>". shreddit-post öznitelikleri; yoksa permalink'ten türet.
  function postSource(el) {
    const post = postContainer(el);
    let sub = "";
    let user = "";
    if (post && post.getAttribute) {
      sub = (post.getAttribute("subreddit-prefixed-name") || post.getAttribute("subreddit-name") || "").replace(/^\/?r\//i, "");
      user = (post.getAttribute("author") || "").replace(/^\/?u\//i, "");
    }
    const permalink = postPermalink(el);
    if (!sub) {
      const m = /\/r\/([^/]+)/i.exec(permalink);
      if (m) sub = m[1];
    }
    if (!user) {
      const a = post && post.querySelector && post.querySelector("a[href*='/user/'], a[href*='/u/']");
      const m = a && /\/(?:user|u)\/([^/?#]+)/i.exec(a.getAttribute("href") || "");
      if (m) user = m[1];
    }
    const parts = [];
    if (sub) parts.push(`r/${sub.replace(/[^A-Za-z0-9_-]/g, "")}`);
    if (user) parts.push(`u/${user.replace(/[^A-Za-z0-9_-]/g, "")}`);
    return parts.join(" ");
  }

  // A RedGifs watch URL from an embed's src/href (Reddit renders RedGifs posts
  // as an <iframe src=".../ifr/{slug}"> or an embed carrying a /watch/ link).
  function redgifsWatchFromEmbed(value) {
    const m = String(value || "").match(/redgifs\.com\/(?:ifr|watch)\/([a-z0-9]+)/i);
    return m ? `https://www.redgifs.com/watch/${m[1].toLowerCase()}` : "";
  }

  // Every RedGifs embed on the page, one descriptor each. The download routes
  // through the background's RedGifs resolver via fallbackSourceUrl (the same
  // path the RedGifs site itself uses), so "RedGifs embed algılanmıyor" and the
  // animated-gif posts behind those embeds ("gif algılanmıyor") both resolve.
  function redgifsEmbedItems(seen) {
    const out = [];
    const nodes = [
      ...deepQueryAll("iframe[src*='redgifs.com']"),
      ...deepQueryAll("a[href*='redgifs.com/watch/'], a[href*='redgifs.com/ifr/']")
    ];
    for (const node of nodes) {
      const watchUrl = redgifsWatchFromEmbed(node.getAttribute?.("src") || node.getAttribute?.("href"));
      if (!watchUrl) continue;
      const post = postContainer(node) || node;
      if (seen.has(post)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) continue;
      if (onScreenArea(rect) < 10000) continue;
      seen.add(post);
      const embedSource = postSource(node);
      out.push({
        el: node, kind: "video", src: "",
        permalink: postPermalink(node), title: postTitle(node),
        // Özellik C: Reddit içindeki redgifs embed'i sunucuya "RedGifs" olarak
        // yazılsın (reddit değil). site override arka planda URL'den türeteni ezer.
        resolve: () => sendDirectDownload([], { fallbackSourceUrl: watchUrl, site: "RedGifs", source: embedSource }).catch(() => {})
      });
    }
    return out;
  }

  // Bir <video>'nun DOM'da duran gerçek dosya adresleri. DASH/MSE ile oynatılan
  // Reddit videolarında `currentSrc` bir `blob:` olur — indirilemez, o yüzden
  // elenir ve çözüm kalıcı bağlantıya kalır.
  function directVideoUrls(node) {
    const raw = [
      node.currentSrc,
      node.getAttribute("src"),
      ...[...node.querySelectorAll("source")].map((source) => source.getAttribute("src"))
    ];
    const out = [];
    for (const value of raw) {
      const url = String(value || "");
      if (!/^https?:/i.test(url) || out.includes(url)) continue;
      out.push(url);
    }
    return out;
  }

  // Reddit'in kendi video ve GIF'leri hiç toplanmıyordu: tarama yalnız <img>
  // üzerindeydi. Reddit yüklenen GIF'i mp4'e çevirip <video> ile oynatır, bu
  // yüzden "gifleri algılamıyor" oluyordu. DOM'da indirilebilir bir mp4 varsa o
  // gönderilir; yoksa gönderinin kalıcı bağlantısı yollanır ve çözüm çağırana
  // (eklentide arka plan, uygulamada native çözücü) bırakılır.
  function redditVideoItems(seen) {
    const out = [];
    for (const node of deepQueryAll("video")) {
      const post = postContainer(node) || node;
      if (seen.has(post)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) continue;
      if (onScreenArea(rect) < 10000) continue;
      const urls = directVideoUrls(node);
      const permalink = postPermalink(node);
      if (!urls.length && !permalink) continue;
      seen.add(post);
      const source = postSource(node);
      out.push({
        el: node, kind: "video", src: urls[0] || "",
        permalink, title: postTitle(node),
        resolve: () => sendDirectDownload(urls, { fallbackSourceUrl: permalink, source }).catch(() => {})
      });
    }
    return out;
  }

  // How much of the element is actually on screen — a carousel's off-screen
  // slides translate outside the viewport and score ~0, so they never frame.
  function onScreenArea(rect) {
    const w = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const h = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return w * h;
  }

  window.__rgSiteName = "reddit.com";
  window.__rgCollectMedia = () => {
    if (!settings.redditImages) return [];
    const out = [];
    const seen = new Set();

    // RedGifs embeds first, so their post is claimed before the image scan can
    // frame the embed's poster thumbnail as a still image.
    for (const item of redgifsEmbedItems(seen)) out.push(item);

    // Videolar/GIF'ler görsellerden önce: bir GIF gönderisinin kapak <img>'i
    // gönderiyi kapıp hareketli medyayı sabit görsele indirgemesin.
    for (const item of redditVideoItems(seen)) out.push(item);

    // One media per post: the largest currently-visible candidate image wins,
    // which in an open gallery is exactly the slide the user is looking at.
    const byPost = new Map();
    for (const img of queryAllImages().filter(isCandidateImage)) {
      const area = onScreenArea(img.getBoundingClientRect());
      if (area < 10000) continue;
      const post = postContainer(img);
      if (seen.has(post)) continue;
      const prev = byPost.get(post);
      if (!prev || area > prev.area) byPost.set(post, { img, area });
    }
    for (const { img } of byPost.values()) {
      const urls = collectImageUrls(imageRoot(img), img);
      out.push({
        el: img,
        kind: "image",
        src: bestImageUrl(urls) || img.currentSrc || img.src || "",
        permalink: postPermalink(img),
        title: postTitle(img),
        resolve: () => {
          const fresh = collectImageUrls(imageRoot(img), img);
          if (fresh.length) sendDirectDownload(fresh, { source: postSource(img) }).catch(() => {});
        }
      });
    }
    return out;
  };

  // ── INIT ─────────────────────────────────────────────────────────────────

  loadSettings();
  installSearchPanel();
  let _installPending = false;
  const observer = new MutationObserver(() => {
    if (_installPending) return;
    _installPending = true;
    window.requestAnimationFrame(() => {
      _installPending = false;
      installButtons();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("scroll", () => window.requestAnimationFrame(() => {
    installButtons();
    updateAllButtonPositions();
  }), { passive: true });
  window.addEventListener("resize", () => window.requestAnimationFrame(updateAllButtonPositions));
  setTimeout(installButtons, 1200);
  setInterval(() => {
    if (!document.hidden) updateAllButtonPositions();
  }, 650);
})();
