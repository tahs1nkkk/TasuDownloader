(() => {
  if (window.top !== window || window.__rgCoomerLoaded) return;
  window.__rgCoomerLoaded = true;

  const BUTTON_CLASS = "rg-coomer-download";
  const LINK_HOST_CLASS = "rg-coomer-media-link";
  const VIDEO_HOST_CLASS = "rg-coomer-video-host";
  const STYLE_ID = "rg-coomer-style";
  const SETTINGS_KEY = globalThis.RG_SETTINGS.SETTINGS_KEY;
  let settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS };
  let scanScheduled = false;

  function isPostPage() {
    return /^\/[^/]+\/user\/[^/]+\/post\/[^/?]+\/?$/i.test(location.pathname);
  }

  // A single creator's own page ("/{service}/user/{id}"), i.e. their post grid —
  // NOT the site's creator directory (/, /artists), which really is a wall of
  // other creators and ads. Only here do we vouch for grid thumbnails, avatar
  // and banner.
  function isCreatorProfilePage() {
    return /^\/[^/]+\/user\/[^/]+\/?$/i.test(location.pathname);
  }

  // The site-wide post walls: /posts (recent) and /posts/popular (with its
  // ?date=&period= day/week/month filters). A grid of post cards from many
  // creators, same markup as a profile grid — so the thumbnail→full-image
  // download works here too, and the user can grab pictures without opening
  // each post (which is what currently throws API errors).
  function isListingGridPage() {
    return /^\/posts(?:\/popular)?\/?$/i.test(location.pathname);
  }

  // The full-size media URL behind a grid thumbnail. Coomer serves previews from
  // img.coomer.st/thumbnail/data/<hash>.<ext> and the original from
  // coomer.st/data/<hash>.<ext> — same path, so the transform is exact.
  function fullFromThumbnail(value) {
    const thumb = directThumbnailUrl(value);
    if (!thumb) return "";
    try {
      const parsed = new URL(thumb);
      const path = parsed.pathname.replace(/^\/thumbnail\//, "/");
      return `https://coomer.st${path}`;
    } catch {
      return "";
    }
  }

  // Avatar (/icons/) and banner (/banners/) live on img.coomer.st regardless of
  // the header's markup, so match by URL not by fragile class names.
  function profileAssetUrl(value, kind) {
    try {
      const parsed = new URL(String(value || ""), location.href);
      const dir = kind === "avatar" ? "/icons/" : "/banners/";
      return parsed.hostname === "img.coomer.st" && parsed.pathname.startsWith(dir)
        ? parsed.href
        : "";
    } catch {
      return "";
    }
  }

  function bestImgUrl(img) {
    if (!img) return "";
    let url = img.currentSrc || img.getAttribute("src") || "";
    let bestW = 0;
    for (const part of (img.getAttribute("srcset") || "").split(",")) {
      const [u, d] = part.trim().split(/\s+/);
      const w = parseInt(d) || 0;
      if (u && w >= bestW) { bestW = w; url = u; }
    }
    return url;
  }

  // The header's avatar and banner images, as {img, url, kind} — the profile
  // picture and cover the report asks the app to detect too.
  function profileHeaderAssets() {
    const found = [];
    const seen = new Set();
    for (const img of document.querySelectorAll("header img, .user-header img, main img")) {
      const src = bestImgUrl(img);
      const avatar = profileAssetUrl(src, "avatar");
      const banner = avatar ? "" : profileAssetUrl(src, "banner");
      const url = avatar || banner;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      found.push({ img, url, kind: avatar ? "avatar" : "banner" });
    }
    return found;
  }

  function mediaKind(url) {
    let value = String(url || "");
    try {
      const parsed = new URL(value, location.href);
      value = `${parsed.pathname} ${parsed.searchParams.get("f") || ""}`;
    } catch { /* keep raw */ }
    if (/\.(?:jpg|jpeg|png|webp|gif)(?:\s|$)/i.test(value)) return "image";
    if (/\.(?:mp4|webm|mov|m4v)(?:\s|$)/i.test(value)) return "video";
    return "";
  }

  function directMediaUrl(value) {
    try {
      const parsed = new URL(String(value || ""), location.href);
      const isCoomerHost = parsed.hostname === "coomer.st" || parsed.hostname.endsWith(".coomer.st");
      return isCoomerHost && parsed.pathname.startsWith("/data/") && mediaKind(parsed.href)
        ? parsed.href
        : "";
    } catch {
      return "";
    }
  }

  function directThumbnailUrl(value) {
    try {
      const parsed = new URL(String(value || ""), location.href);
      return parsed.hostname === "img.coomer.st"
        && parsed.pathname.startsWith("/thumbnail/data/")
        && mediaKind(parsed.href) === "image"
        ? parsed.href
        : "";
    } catch {
      return "";
    }
  }

  function profileName() {
    const direct = document.querySelector(".post__user-name, .user-header__name");
    if (direct?.textContent?.trim()) return globalThis.RG_SETTINGS.cleanPathPart(direct.textContent.trim(), "user");
    const headerSpans = [...document.querySelectorAll("main section header h1 a span")];
    const xpathEquivalent = headerSpans.findLast?.((span) => span.textContent?.trim())
      || [...headerSpans].reverse().find((span) => span.textContent?.trim());
    if (xpathEquivalent?.textContent?.trim()) {
      return globalThis.RG_SETTINGS.cleanPathPart(xpathEquivalent.textContent.trim(), "user");
    }
    const id = location.pathname.match(/\/user\/([^/]+)/i)?.[1] || "user";
    return globalThis.RG_SETTINGS.cleanPathPart(id, "user");
  }

  // A listing-grid card's creator, for the download folder. Every card on the
  // popular/recent walls belongs to a different creator, so the folder must come
  // from that card's own "/{service}/user/{creator}/…" href — profileName()
  // only makes sense on a single creator's page.
  function creatorFromCard(card) {
    const id = (card.getAttribute("href") || "").match(/\/user\/([^/]+)/i)?.[1];
    return id ? globalThis.RG_SETTINGS.cleanPathPart(id, "user") : profileName();
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${LINK_HOST_CLASS} {
        position: relative !important; display: inline-block !important; vertical-align: top !important;
        line-height: 0 !important; overflow: visible !important;
      }
      .${VIDEO_HOST_CLASS} { position: relative !important; }
      .${BUTTON_CLASS} {
        all: initial !important; position: absolute !important; left: 8px !important; top: 8px !important;
        z-index: 2147483647 !important; width: 40px !important; height: 40px !important;
        display: grid !important; place-items: center !important; box-sizing: border-box !important;
        border: 0 !important; border-radius: 999px !important; color: #fff !important;
        background: rgba(37,99,235,.94) !important; box-shadow: 0 6px 18px rgba(0,0,0,.48) !important;
        cursor: pointer !important; pointer-events: auto !important;
        opacity: 0 !important; transform: scale(.92) !important;
        transition: opacity .12s ease, transform .12s ease, background .12s ease !important;
      }
      /* Buton, kartın üstüne gelince belirir (grid'de 50 mavi daire kalabalık
         etmesin). Global "Buton görünürlüğü → Her zaman" seçilirse ya da
         dokunmatik ekranda (:hover hiç tetiklenmez) sürekli görünür. Web-listesi
         ikonu da aynı görünürlüğü izler ki tek başına havada durmasın. */
      .${LINK_HOST_CLASS} > .rg-web-icon,
      .${VIDEO_HOST_CLASS} > .rg-web-icon {
        opacity: 0 !important; transition: opacity .12s ease !important;
      }
      .${LINK_HOST_CLASS}:hover > .${BUTTON_CLASS},
      .${VIDEO_HOST_CLASS}:hover > .${BUTTON_CLASS},
      .${LINK_HOST_CLASS}:hover > .rg-web-icon,
      .${VIDEO_HOST_CLASS}:hover > .rg-web-icon,
      html[data-rg-downloader-button-visibility="always"] .${BUTTON_CLASS},
      html[data-rg-downloader-button-visibility="always"] .${LINK_HOST_CLASS} > .rg-web-icon,
      html[data-rg-downloader-button-visibility="always"] .${VIDEO_HOST_CLASS} > .rg-web-icon,
      .${BUTTON_CLASS}:focus-visible {
        opacity: 1 !important; transform: scale(1) !important;
      }
      .${BUTTON_CLASS}:hover { background: #1d4ed8 !important; }
      .${BUTTON_CLASS}:disabled { opacity: .58 !important; cursor: wait !important; }
      .${BUTTON_CLASS} svg { width: 22px !important; height: 22px !important; pointer-events: none !important; }
      @media (hover: none) {
        .${BUTTON_CLASS} { opacity: 1 !important; transform: none !important; }
        .${LINK_HOST_CLASS} > .rg-web-icon,
        .${VIDEO_HOST_CLASS} > .rg-web-icon { opacity: 1 !important; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    applyButtonVisibility();
  }

  // Global "Buton görünürlüğü" ayarını köke yansıt; CSS bununla PC'de "Her zaman"
  // modunu açar. Telefonda/dokunmatikte buton zaten @media(hover:none) ile hep
  // görünür — bu ayar yalnız fareli ekranı (PC) etkiler.
  function applyButtonVisibility() {
    document.documentElement.dataset.rgDownloaderButtonVisibility =
      settings.buttonVisibility === "always" ? "always" : "hover";
  }

  function sendDownload(url, fallbackUrl, userName) {
    // The already-rendered thumbnail is the fast, browser-context equivalent
    // of "Save image as". Coomer's full-size CDN can take 10-15 seconds even
    // before chrome.downloads returns an id, so use the loaded image first.
    const urls = [...new Set([fallbackUrl, url].filter(Boolean))];
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "DIRECT_DOWNLOAD",
        urls,
        folderName: userName,
        source: userName || "", // özellik A: Coomer'da yalnız kullanıcı adı
        skipReachability: true,
        fallbackOnNoTransfer: urls.length > 1,
        transferTimeoutMs: fallbackUrl ? 900 : 2500,
        namingUrl: url,
        preserveAlternatives: true,
        allowRipsnipFallback: false
      }, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!result || result.ok === false) reject(new Error(result?.error || "Download failed"));
        else resolve(result);
      });
    });
  }

  function makeButton(url, kind, fallbackUrl = "", userName = null) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.dataset.rgKind = kind;
    button.title = kind === "video" ? "Videoyu indir" : "Görseli indir";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`;
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      try {
        await sendDownload(url, fallbackUrl, userName || profileName());
        button.style.setProperty("background", "#15803d", "important");
        setTimeout(() => button.style.removeProperty("background"), 900);
      } catch (error) {
        console.error("[rg-coomer] download failed", error);
        button.style.setProperty("background", "#b91c1c", "important");
        button.title = String(error?.message || error || "E_FAILED");
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  function removeButtons() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
    document.querySelectorAll(`.${LINK_HOST_CLASS} > .rg-web-icon, .${VIDEO_HOST_CLASS} > .rg-web-icon`).forEach((b) => b.remove());
    document.querySelectorAll(`.${LINK_HOST_CLASS}`).forEach((element) => element.classList.remove(LINK_HOST_CLASS));
    document.querySelectorAll(`.${VIDEO_HOST_CLASS}`).forEach((element) => element.classList.remove(VIDEO_HOST_CLASS));
  }

  // Özellik D — indirme butonunun hemen altına "web listesine ekle". Yalnız
  // gerçek gönderi sayfasında (isPostPage); ızgara/profil küçük görsellerinde
  // değil. Kapsam: "sadece ana medya". Bağlantı = gönderinin permalink'i.
  function addWebButton(host) {
    if (!window.rgMakeWebIconButton || !isPostPage()) return;
    if (host.querySelector(":scope > .rg-web-icon")) return;
    const web = window.rgMakeWebIconButton(
      () => ({ url: location.href, title: document.title || profileName() }),
      { size: 40 }
    );
    web.style.position = "absolute";
    web.style.left = "8px";
    web.style.top = "56px";
    host.appendChild(web);
  }

  function addLinkButton(anchor, url, kind, userName = null) {
    if (anchor.querySelector(`:scope > .${BUTTON_CLASS}`)) return;
    anchor.classList.add(LINK_HOST_CLASS);
    const media = anchor.querySelector(kind === "image" ? "img" : "video");
    const loadedUrl = kind === "image"
      ? directThumbnailUrl(media?.currentSrc || media?.getAttribute("src"))
      : "";
    anchor.appendChild(makeButton(url, kind, loadedUrl, userName));
    addWebButton(anchor);
  }

  function videoSource(video) {
    const values = [
      video.currentSrc,
      video.getAttribute("src"),
      ...[...video.querySelectorAll("source[src]")].map((source) => source.getAttribute("src"))
    ];
    const urls = [...new Set(values.map(directMediaUrl).filter(Boolean))];
    return urls.find((url) => /\.mp4(?:$|[?#])/i.test(url)) || urls[0] || "";
  }

  function addVideoButton(video, url) {
    const host = video.parentElement;
    if (!host || host.querySelector(`:scope > .${BUTTON_CLASS}[data-rg-kind="video"]`)) return;
    host.classList.add(VIDEO_HOST_CLASS);
    host.appendChild(makeButton(url, "video"));
    addWebButton(host);
  }

  // A profile grid card's full-size image, derived from its thumbnail. Video
  // posts have no direct file here (the real video lives on the post page), so
  // those cards are left to the post-page flow; image posts download in place.
  function gridCardImage(card) {
    const img = card.querySelector("img");
    return img ? fullFromThumbnail(bestImgUrl(img)) : "";
  }

  function scan() {
    if (!settings.coomerButtons || !(isPostPage() || isCreatorProfilePage() || isListingGridPage())) {
      removeButtons();
      return;
    }
    ensureStyle();

    if (isPostPage()) {
      for (const anchor of document.querySelectorAll("main a[href]")) {
        const url = directMediaUrl(anchor.href);
        const kind = mediaKind(url);
        if (url && kind) addLinkButton(anchor, url, kind);
      }
      for (const video of document.querySelectorAll("main video")) {
        const url = videoSource(video);
        if (url) addVideoButton(video, url);
      }
      return;
    }

    // A creator page also carries an avatar + banner (the listing walls don't).
    if (isCreatorProfilePage()) {
      for (const asset of profileHeaderAssets()) {
        const host = asset.img.closest("a") || asset.img.parentElement;
        if (host && !host.querySelector(`:scope > .${BUTTON_CLASS}`)) {
          host.classList.add(LINK_HOST_CLASS);
          host.appendChild(makeButton(asset.url, "image"));
        }
      }
    }

    // Post-card thumbnails on a profile grid AND the /posts, /posts/popular
    // walls share the same markup. Deriving the full image from the thumbnail
    // downloads the picture in place, without opening the post — the only way
    // through while Coomer's post pages are throwing API errors. On the walls
    // each card is a different creator, so the folder name comes from the card.
    const perCard = isListingGridPage();
    for (const card of document.querySelectorAll("main a[href*='/post/']")) {
      const url = gridCardImage(card);
      if (url) addLinkButton(card, url, "image", perCard ? creatorFromCard(card) : null);
    }
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  // --- App floating-button bridge --------------------------------------------
  // The in-app browser drives downloads from here instead of the visible
  // buttons. Coomer's creator grids and any pop-up gifs are advertising, so we
  // only ever vouch for media on an actual post page; everywhere else we return
  // nothing and the app offers no download (Coomer ad-frame report). Each item
  // carries the post permalink so the list saves the real link, not the domain.
  window.__rgSiteName = "coomer.st";
  window.__rgCollectMedia = () => {
    const title = profileName();
    const out = [];
    const seen = new Set();

    if (isPostPage()) {
      const permalink = location.href;
      for (const anchor of document.querySelectorAll("main a[href]")) {
        const url = directMediaUrl(anchor.href);
        if (!url || mediaKind(url) !== "image") continue;
        const img = anchor.querySelector("img");
        if (!img || seen.has(img)) continue;
        seen.add(img);
        out.push({ el: img, kind: "image", src: url, permalink, title });
      }
      for (const video of document.querySelectorAll("main video")) {
        const url = videoSource(video);
        if (!url || seen.has(video)) continue;
        seen.add(video);
        out.push({ el: video, kind: "video", src: url, permalink, title });
      }
      return out;
    }

    // Profile grids and the /posts + /posts/popular walls: avatar/banner
    // (profile only), then every post-card image — so the picker multi-selects
    // a whole wall straight from the thumbnails, without opening each post
    // (which is what currently API-errors). On the walls each card is a
    // different creator, so the folder/title comes from the card.
    if (isCreatorProfilePage() || isListingGridPage()) {
      if (isCreatorProfilePage()) {
        for (const asset of profileHeaderAssets()) {
          out.push({ el: asset.img, kind: "image", src: asset.url, permalink: location.href, title });
          seen.add(asset.img);
        }
      }
      const perCard = isListingGridPage();
      for (const card of document.querySelectorAll("main a[href*='/post/']")) {
        const img = card.querySelector("img");
        if (!img || seen.has(img)) continue;
        const url = gridCardImage(card);
        if (!url) continue;
        seen.add(img);
        const permalink = (() => { try { return new URL(card.getAttribute("href"), location.href).href; } catch { return location.href; } })();
        out.push({ el: img, kind: "image", src: url, permalink, title: perCard ? creatorFromCard(card) : title });
      }
      return out;
    }

    return [];
  };

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleScan);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    applyButtonVisibility();
    scheduleScan();
  });
  chrome.storage.local.get(SETTINGS_KEY, (items) => {
    settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS, ...(items?.[SETTINGS_KEY] || {}) };
    applyButtonVisibility();
    scan();
  });
})();
