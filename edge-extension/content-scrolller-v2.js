(() => {
  if (window.top !== window || window.__rgScrolllerV2Loaded) return;
  window.__rgScrolllerV2Loaded = true;

  const HOST_ID = "rg-scrolller-v2-host";
  const BUTTON_ID = "rg-scrolller-v2-button";
  const WEB_BUTTON_ID = "rg-scrolller-v2-web";
  const CLEANUP_STYLE_ID = "rg-scrolller-cleanup-style";
  const PICKER_HOST_ID = "rg-scrolller-picker-host";
  const SETTINGS_KEY = globalThis.RG_SETTINGS.SETTINGS_KEY;
  let settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS };

  function applyCleanupSelectors() {
    let style = document.getElementById(CLEANUP_STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = CLEANUP_STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    const selectors = Array.isArray(settings.scrolllerHiddenSelectors) ? settings.scrolllerHiddenSelectors : [];
    const rules = selectors.filter(safeHiddenSelector).map((selector) => `${selector}{display:none!important;visibility:hidden!important}`).join("\n");
    if (style.textContent !== rules) style.textContent = rules;
  }

  function uniqueSelector(element) {
    if (!(element instanceof Element)) return "";
    if (element.id && !/\d{5,}/.test(element.id)) {
      const selector = `#${CSS.escape(element.id)}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    for (const name of ["data-testid", "aria-label"]) {
      const value = element.getAttribute(name);
      if (!value || value.length > 80) continue;
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const selector = `${element.localName}[${name}="${escaped}"]`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }

    const parts = [];
    let node = element;
    while (node instanceof Element && node !== document.body && parts.length < 6) {
      let part = node.localName;
      const classes = [...node.classList]
        .filter((name) => name.length < 50 && !/^(?:active|open|show|hover|css-|jsx-)/i.test(name))
        .slice(0, 2);
      if (classes.length) part += classes.map((name) => `.${CSS.escape(name)}`).join("");
      const siblings = node.parentElement ? [...node.parentElement.children].filter((item) => item.localName === node.localName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
      parts.unshift(part);
      const selector = parts.join(" > ");
      try {
        if (document.querySelectorAll(selector).length === 1) return selector;
      } catch { /* try a longer path */ }
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function cleanupTargetFor(element) {
    if (!(element instanceof Element)) return null;
    const popupLike = element.closest([
      "dialog", "[role='dialog']", "[aria-modal='true']", "aside",
      "[class*='popup' i]", "[class*='popover' i]", "[class*='banner' i]",
      "[class*='cookie' i]", "[class*='notice' i]", "[class*='modal' i]"
    ].join(","));
    let candidate = popupLike || (element.matches("svg, path, span") ? element.parentElement : element);
    if (!(candidate instanceof Element) || candidate.matches("html, body, main, #root, #app, [id*='root' i], [id*='app' i]")) return null;
    const viewportArea = Math.max(1, innerWidth * innerHeight);
    let rect = candidate.getBoundingClientRect();
    let mediaCount = candidate.querySelectorAll("img, video").length;
    if (rect.width * rect.height > viewportArea * 0.7 && mediaCount) {
      candidate = element.matches("svg, path, span") ? element.parentElement : element;
      if (!(candidate instanceof Element) || candidate.matches("img, video")) return null;
      rect = candidate.getBoundingClientRect();
      mediaCount = candidate.querySelectorAll("img, video").length;
    }
    if (rect.width * rect.height > viewportArea * 0.9 && mediaCount > 3) return null;
    if (rect.width * rect.height > viewportArea * 0.9) return null;
    return candidate;
  }

  function safeHiddenSelector(selector) {
    if (typeof selector !== "string" || !selector) return false;
    const start = selector.trim().toLowerCase();
    if (["html", "body", "main", "#root", "#app"].some((name) => start === name || start.startsWith(`${name} `) || start.startsWith(`${name}>`) || start.startsWith(`${name}.`) || start.startsWith(`${name}:`))) return false;
    try {
      const matches = [...document.querySelectorAll(selector)];
      return matches.every((element) => {
        if (element.matches("html, body, main, #root, #app, [id*='root' i], [id*='app' i]")) return false;
        const rect = element.getBoundingClientRect();
        const huge = rect.width * rect.height > innerWidth * innerHeight * 0.9;
        const manyMedia = element.querySelectorAll("img, video").length > 3;
        return !(huge && manyMedia);
      });
    } catch {
      return false;
    }
  }

  function startCleanupPicker() {
    document.getElementById(PICKER_HOST_ID)?.remove();
    const host = document.createElement("div");
    host.id = PICKER_HOST_ID;
    host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>:host{all:initial!important;pointer-events:none!important}#box{display:none;position:fixed;box-sizing:border-box;border:3px solid #f59e0b;background:rgba(245,158,11,.12);pointer-events:none}#tip{position:fixed;left:50%;top:16px;transform:translateX(-50%);padding:9px 14px;border-radius:999px;color:#fff;background:#111827;font:600 12px system-ui;white-space:nowrap}</style><div id="box"></div><div id="tip">Gizlenecek öğeye tıkla · İptal: Esc</div>`;
    document.documentElement.appendChild(host);
    const box = shadow.getElementById("box");
    let target = null;

    const finish = () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      host.remove();
    };
    const onMove = (event) => {
      target = cleanupTargetFor(event.target);
      if (!target || target.id?.startsWith("rg-scrolller-")) {
        box.style.display = "none";
        return;
      }
      const rect = target.getBoundingClientRect();
      box.style.display = "block";
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    };
    const onClick = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const selected = target || cleanupTargetFor(event.target);
      const selector = uniqueSelector(selected);
      finish();
      if (!selector || !safeHiddenSelector(selector)) return;
      chrome.storage.local.get(SETTINGS_KEY, (items) => {
        const current = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS, ...(items?.[SETTINGS_KEY] || {}) };
        const list = Array.isArray(current.scrolllerHiddenSelectors) ? current.scrolllerHiddenSelectors : [];
        current.scrolllerHiddenSelectors = [...new Set([...list, selector])];
        chrome.storage.local.set({ [SETTINGS_KEY]: current });
      });
    };
    const onKey = (event) => {
      if (event.key === "Escape") finish();
    };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  function visibleArea(element) {
    const rect = element.getBoundingClientRect();
    const width = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
    return width * height;
  }

  function httpUrls(values) {
    return [...new Set(values.filter((value) => typeof value === "string" && /^https?:\/\//i.test(value)))];
  }

  function urlsFromSrcset(srcset) {
    return String(srcset || "")
      .split(",")
      .map((part) => {
        const [url, descriptor = "0"] = part.trim().split(/\s+/);
        return { url, score: Number.parseFloat(descriptor) || 0 };
      })
      .filter((item) => item.url)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.url);
  }

  function dataAttributeUrls(element) {
    const names = [
      "data-original", "data-original-src", "data-full", "data-full-src",
      "data-image", "data-image-url", "data-media", "data-media-url", "data-src"
    ];
    const urls = [];
    let node = element;
    for (let depth = 0; node instanceof Element && depth < 5; depth += 1, node = node.parentElement) {
      for (const name of names) {
        const value = node.getAttribute(name);
        if (value) urls.push(value);
      }
    }
    return httpUrls(urls);
  }

  function largerCdnVariants(url) {
    try {
      const parsed = new URL(url);
      const results = [];
      if (/\/(?:thumb(?:nail)?s?|small|medium|preview)\//i.test(parsed.pathname)) {
        for (const size of ["original", "large"]) {
          const copy = new URL(parsed.href);
          copy.pathname = copy.pathname.replace(/\/(?:thumb(?:nail)?s?|small|medium|preview)\//i, `/${size}/`);
          results.push(copy.href);
        }
      }
      const resizeKeys = ["w", "width", "h", "height", "q", "quality", "fit", "format"];
      if (resizeKeys.some((key) => parsed.searchParams.has(key))) {
        const copy = new URL(parsed.href);
        for (const key of resizeKeys) copy.searchParams.delete(key);
        results.push(copy.href);
      }
      return results;
    } catch {
      return [];
    }
  }

  function qualityScore(url) {
    const value = String(url || "").toLowerCase();
    const dimension = [...value.matchAll(/(?:^|[^0-9])(2160|1440|1080|720|480|360)(?:p|[^0-9]|$)/g)]
      .reduce((best, match) => Math.max(best, Number(match[1]) || 0), 0);
    let score = dimension;
    if (/original|source|full|4k|uhd/.test(value)) score += 5000;
    else if (/large|hd/.test(value)) score += 2500;
    if (/\.mp4(?:[?#]|$)/.test(value)) score += 10000;
    if (/thumb|preview|small|mobile|mini|\bsd\b/.test(value)) score -= 2500;
    return score;
  }

  function isScrolllerContentPath(pathname) {
    return /-[a-z0-9]{6,}\/?$/i.test(String(pathname || ""));
  }

  function scrolllerContentUrlFor(media) {
    if (isScrolllerContentPath(location.pathname) && viewerLayerFor(media)) return location.href;
    const mediaRectValue = media.getBoundingClientRect();
    const mediaArea = Math.max(1, mediaRectValue.width * mediaRectValue.height);
    let node = media;
    for (let depth = 0; node instanceof Element && depth < 7; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (depth > 1 && rect.width * rect.height > mediaArea * 5 && node.querySelectorAll("img, video").length > 1) break;
      // Every anchor inside this ancestor, not just the first two levels. The
      // feed nests the post link several wrappers below the card (title row,
      // overlay, subreddit chip), so the old ":scope > a" pair found nothing and
      // the candidate ended up with neither a url nor a source page — which is
      // the "indirilecek url bulunamadı" the report describes. The area guard
      // above already stops the walk before it reaches a shared container.
      const links = [node.matches("a[href]") ? node : null, ...node.querySelectorAll("a[href]")]
        .filter(Boolean)
        .slice(0, 24);
      for (const link of links) {
        try {
          const url = new URL(link.href, location.href);
          if (url.hostname.endsWith("scrolller.com") && isScrolllerContentPath(url.pathname)) return url.href;
        } catch { /* ignore invalid links */ }
      }
    }
    if (isScrolllerContentPath(location.pathname)) {
      const rect = media.getBoundingClientRect();
      const area = visibleArea(media);
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const nearCenter = Math.abs(centerX - innerWidth / 2) < innerWidth * 0.38
        && Math.abs(centerY - innerHeight / 2) < innerHeight * 0.38;
      if (viewerLayerFor(media) || (nearCenter && area > innerWidth * innerHeight * 0.12)) return location.href;
    }
    return "";
  }

  function looksLikeVideoPreview(image) {
    const imageRect = image.getBoundingClientRect();
    const imageArea = Math.max(1, imageRect.width * imageRect.height);
    let node = image.parentElement;
    for (let depth = 0; node instanceof Element && depth < 6; depth += 1, node = node.parentElement) {
      const rect = node.getBoundingClientRect();
      if (depth > 1 && rect.width * rect.height > imageArea * 5 && node.querySelectorAll("img, video").length > 1) break;
      const signature = `${node.id || ""} ${typeof node.className === "string" ? node.className : ""} ${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`;
      if (/\b(?:video|play|duration)\b/i.test(signature)) return true;
      if (node.querySelector("video, [aria-label*='play' i], [title*='play' i], [class*='play' i], [class*='video' i], [data-video], [data-video-url]")) return true;
      if (/\b\d{1,2}:\d{2}\b/.test(String(node.textContent || ""))) return true;
    }
    return false;
  }

  function contextVideoUrls(media) {
    const viewer = viewerLayerFor(media);
    const root = viewer || media.closest("article, li, [role='dialog'], [aria-modal='true']") || media.parentElement?.parentElement;
    if (!root) return [];
    const values = [];
    const text = String(root.textContent || "");
    values.push(...(text.match(/https?:\/\/[^\s"'<>]+?\.(?:mp4|webm|m4v|mov)(?:\?[^\s"'<>]*)?/gi) || []));
    for (const element of [root, ...root.querySelectorAll("video, source, [data-src], [data-url], [data-video], [data-video-url]")].slice(0, 80)) {
      for (const name of ["src", "data-src", "data-url", "data-video", "data-video-url"]) {
        const value = element.getAttribute?.(name);
        if (value) values.push(value);
      }
    }
    return httpUrls(values)
      .filter((url) => /\.(?:mp4|webm|m4v|mov)(?:[?#]|$)/i.test(url))
      .sort((a, b) => qualityScore(b) - qualityScore(a));
  }

  function ownVideoUrls(video) {
    return httpUrls([
      ...dataAttributeUrls(video),
      ...[...video.querySelectorAll("source")].flatMap((source) => [source.src, ...urlsFromSrcset(source.srcset)]),
      video.src,
      video.currentSrc
    ])
      .filter((url) => /\.(?:mp4|webm|m4v|mov)(?:[?#]|$)/i.test(url))
      .sort((a, b) => qualityScore(b) - qualityScore(a));
  }

  function isTrustedScrolllerMediaUrl(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "scrolller.com" || host.endsWith(".scrolller.com")
        || host === "redgifs.com" || host.endsWith(".redgifs.com")
        || host.includes("gifdeliverynetwork");
    } catch {
      return false;
    }
  }

  function isAdvertisementMedia(media) {
    const contentUrl = scrolllerContentUrlFor(media);
    let node = media;
    for (let depth = 0; node instanceof Element && depth < 7; depth += 1, node = node.parentElement) {
      if (node.matches("ins, [data-ad], [data-ad-slot], [data-ad-unit], [aria-label*='advertisement' i], [aria-label*='sponsored' i]")) return true;
      const signature = `${node.id || ""} ${typeof node.className === "string" ? node.className : ""} ${node.getAttribute("data-testid") || ""}`;
      if (/(?:^|[-_\s])(ads?|advert(?:isement|ising)?|sponsored|promoted|taboola|outbrain)(?:$|[-_\s])/i.test(signature)) return true;
      if (node.matches("a[href*='doubleclick'], a[href*='googlesyndication'], a[href*='adservice']")) return true;
      const label = String(node.getAttribute("aria-label") || node.getAttribute("title") || "");
      if (/\b(?:advertisement|sponsored|promoted)\b/i.test(label)) return true;
      const text = String(node.textContent || "").trim();
      if (depth < 4 && text.length < 240 && /\b(?:advertisement|sponsored|promoted)\b/i.test(text)) return true;
      if (!contentUrl && depth < 5) {
        const externalLinks = [...node.querySelectorAll(":scope > a[href], :scope > * > a[href]")];
        if (externalLinks.some((link) => {
          try { return !new URL(link.href, location.href).hostname.endsWith("scrolller.com"); }
          catch { return false; }
        })) return true;
      }
    }
    return false;
  }

  function videoUrls(video) {
    const direct = httpUrls([
      ...contextVideoUrls(video),
      ...ownVideoUrls(video)
    ])
      .filter((url) => /\.(?:mp4|webm|m4v|mov)(?:[?#]|$)/i.test(url))
      .sort((a, b) => qualityScore(b) - qualityScore(a));
    return direct;
  }

  function imageUrls(image) {
    const picture = image.closest("picture");
    const pictureSources = picture
      ? [...picture.querySelectorAll("source")].flatMap((source) => urlsFromSrcset(source.srcset))
      : [];
    const declared = httpUrls([
      ...dataAttributeUrls(image),
      ...urlsFromSrcset(image.srcset),
      ...pictureSources,
      image.src,
      image.currentSrc
    ]);
    return httpUrls([...declared.flatMap((url) => largerCdnVariants(url)), ...declared]);
  }

  // The one being looked at. The feed scrolls vertically, so "mine" is the card
  // nearest the middle of the screen; before, the largest media on screen won,
  // which on a tall card meant the half-scrolled neighbour.
  function bestVisibleMedia() {
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;
    return visibleMediaCandidates()
      .map((candidate) => ({
        candidate,
        distance: Math.abs(candidate.rect.top + candidate.rect.height / 2 - centerY)
          + Math.abs(candidate.rect.left + candidate.rect.width / 2 - centerX) * 0.25
      }))
      .sort((a, b) => a.distance - b.distance)
      .map((item) => item.candidate)[0] || null;
  }

  function mediaRect(media) {
    const rect = media.getBoundingClientRect();
    const result = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
    if (!(media instanceof HTMLVideoElement) || rect.width <= 0 || rect.height <= 0) return result;

    let sourceWidth = media.videoWidth || Number(media.getAttribute("width")) || 0;
    let sourceHeight = media.videoHeight || Number(media.getAttribute("height")) || 0;
    const cssRatio = String(getComputedStyle(media).aspectRatio || "").match(/([\d.]+)\s*\/\s*([\d.]+)/);
    if ((!sourceWidth || !sourceHeight) && cssRatio) {
      sourceWidth = Number(cssRatio[1]);
      sourceHeight = Number(cssRatio[2]);
    }
    if ((!sourceWidth || !sourceHeight) && viewerLayerFor(media)) {
      sourceWidth = 16;
      sourceHeight = 9;
    }
    const objectFit = getComputedStyle(media).objectFit;
    const shouldContain = /contain|scale-down/.test(objectFit) || (viewerLayerFor(media) && objectFit !== "cover");
    if (!sourceWidth || !sourceHeight || !shouldContain) return result;
    const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      right: rect.left + (rect.width + width) / 2,
      bottom: rect.top + (rect.height + height) / 2,
      width,
      height
    };
  }

  function viewerLayerFor(media) {
    let node = media;
    const viewportArea = Math.max(1, innerWidth * innerHeight);
    while (node instanceof Element && node !== document.body && node !== document.documentElement) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const dialogLike = node.matches("dialog[open], [role='dialog'], [aria-modal='true']");
      const fixedViewportLayer = style.position === "fixed" && rect.width * rect.height > viewportArea * 0.55;
      if (dialogLike || fixedViewportLayer) return node;
      node = node.parentElement;
    }
    return null;
  }

  function onlyTopViewerCandidates(candidates) {
    const layered = candidates
      .map((candidate) => ({ candidate, layer: viewerLayerFor(candidate.media) }))
      .filter((item) => item.layer);
    if (!layered.length) return candidates;

    const layers = [...new Set(layered.map((item) => item.layer))];
    const topLayer = layers.sort((a, b) => {
      const zA = Number.parseInt(getComputedStyle(a).zIndex, 10) || 0;
      const zB = Number.parseInt(getComputedStyle(b).zIndex, 10) || 0;
      if (zA !== zB) return zB - zA;
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
    })[0];
    return candidates.filter((candidate) => topLayer.contains(candidate.media));
  }

  function overlaps(a, b) {
    const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const intersection = width * height;
    return intersection / Math.max(1, Math.min(a.width * a.height, b.width * b.height)) > 0.72;
  }

  function visibleMediaCandidates() {
    const rawVideos = [...document.querySelectorAll("video")]
      .filter((media) => !isAdvertisementMedia(media))
      .filter((media) => viewerLayerFor(media) || scrolllerContentUrlFor(media));
    const rawVideoRects = rawVideos.map((video) => mediaRect(video));
    let videos = rawVideos
      .map((media) => {
        const ownUrls = ownVideoUrls(media);
        return {
          media,
          rect: mediaRect(media),
          area: visibleArea(media),
          urls: videoUrls(media),
          sourcePageUrl: scrolllerContentUrlFor(media),
          trustedOwnSource: ownUrls.some(isTrustedScrolllerMediaUrl),
          kind: "video"
        };
      })
      .filter((item) => item.area > 18000 && item.rect.width >= 140 && item.rect.height >= 100 && (item.urls.length || item.sourcePageUrl))
      // A trusted own source proves it; so does a scrolller content page around
      // it. Requiring the first alone dropped every video Scrolller plays from a
      // blob: url — which is most of them — so the picker collected nothing and
      // "çoklu indirmede videolar inmiyor" followed. Ads have neither.
      .filter((item) => item.trustedOwnSource || Boolean(item.sourcePageUrl));

    const viewerVideos = videos.filter((item) => viewerLayerFor(item.media));
    if (viewerVideos.length > 1) {
      const mainViewerVideo = viewerVideos.sort((a, b) => Number(b.trustedOwnSource) - Number(a.trustedOwnSource) || b.area - a.area)[0];
      videos = videos.filter((item) => !viewerLayerFor(item.media) || item === mainViewerVideo);
    }

    const imageElements = [...document.querySelectorAll("img")]
      .filter((image) => !isAdvertisementMedia(image))
      .filter((image) => !/logo|icon|avatar|profile|badge|sprite/i.test(`${image.currentSrc} ${image.src} ${image.alt}`))
      .filter((image) => !rawVideoRects.some((videoRect) => overlaps(mediaRect(image), videoRect)));

    const videoPosters = imageElements
      .filter((media) => looksLikeVideoPreview(media))
      .map((media) => ({
        media,
        rect: mediaRect(media),
        area: visibleArea(media),
        urls: contextVideoUrls(media),
        sourcePageUrl: scrolllerContentUrlFor(media),
        kind: "video"
      }))
      .filter((item) => item.area > 18000 && item.rect.width >= 140 && item.rect.height >= 100 && (item.urls.length || item.sourcePageUrl));

    // Görsellerde de içerik sayfası taşınıyor. Eskiden yalnız `urls` vardı: DOM'un
    // verdiği CDN adresi tutmazsa (imzası geçmiş, boyutlandırılmış türev 404) elde
    // hiçbir şey kalmıyor, indirme sessizce düşüyordu — "tam ekranda görsel
    // indirilmiyor" buydu. Sayfa adresi, adres tutmadığında çağıranın (uygulamada
    // yerel çözücü) başvurabileceği ikinci kapı.
    const images = imageElements
      .map((media) => ({
        media, rect: mediaRect(media), area: visibleArea(media),
        urls: imageUrls(media), sourcePageUrl: scrolllerContentUrlFor(media), kind: "image"
      }))
      .filter((item) => item.area > 18000 && item.rect.width >= 140 && item.rect.height >= 100 && item.urls.length)
      .filter((image) => !videos.some((video) => overlaps(image.rect, video.rect)))
      .filter((image) => !videoPosters.some((video) => video.media === image.media));

    return onlyTopViewerCandidates([...videos, ...videoPosters, ...images])
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
      .slice(0, 30);
  }

  // Kaynak etiketi — özellik A: Scrolller'da belirgin "kullanıcı" yok; en yakın
  // karşılık, URL'deki alt-dizin/koleksiyon (ör. "r/cats"). İçerik sayfasında boş.
  function currentScrolllerSource() {
    const segs = location.pathname.split("/").filter(Boolean);
    if (!segs.length) return "";
    const ri = segs.indexOf("r");
    if (ri >= 0 && segs[ri + 1]) return `r/${segs[ri + 1]}`;
    if (!isScrolllerContentPath(location.pathname)) {
      const first = segs[0];
      if (first && !/^(explore|following|about|settings|login|signup)$/i.test(first)) return first;
    }
    return "";
  }

  function sendDownload(urls, folderName = "", options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "DIRECT_DOWNLOAD",
        urls,
        imageMode: options.imageMode === true,
        preserveAlternatives: true,
        scrolllerSourceUrl: options.scrolllerSourceUrl || "",
        source: currentScrolllerSource(),
        allowRipsnipFallback: false,
        folderName
      }, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!result || result.ok === false) reject(new Error(result?.error || "Download failed"));
        else resolve(result);
      });
    });
  }

  async function downloadCurrent(options = {}) {
    const candidate = isScrolllerContentPath(location.pathname)
      ? { urls: [], sourcePageUrl: location.href, kind: "video" }
      : bestVisibleMedia();
    if (!candidate) throw new Error("E_NO_MEDIA: görünür medya bulunamadı");
    let folder = "";
    if (options.chooseFolder && window.rgChooseFolder) {
      folder = await window.rgChooseFolder();
      if (folder === null) return { ok: false, cancelled: true };
    }
    const response = await sendDownload(candidate.urls, folder || "", {
      imageMode: candidate.kind === "image",
      scrolllerSourceUrl: candidate.sourcePageUrl || ""
    });
    console.info("[rg-scrolller-v2] indirme başladı", response);
    return response;
  }

  async function downloadCandidate(candidate, options = {}) {
    let folder = "";
    if (options.chooseFolder && window.rgChooseFolder) {
      folder = await window.rgChooseFolder();
      if (folder === null) return { ok: false, cancelled: true };
    }
    return sendDownload(candidate.urls, folder || "", {
      imageMode: candidate.kind === "image",
      scrolllerSourceUrl: candidate.sourcePageUrl || ""
    });
  }

  function install() {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.dataset.rgVersion = "0.23.1";
    host.style.setProperty("all", "initial", "important");
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("right", "18px", "important");
    host.style.setProperty("top", "92px", "important");
    host.style.setProperty("display", "block", "important");

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        /* Shadow ağacındaki !important bildirimleri, ağaç sınırını aşarken host'un
           kendi (inline) !important stillerini YENER (CSS Scoping kuralı: important
           için iç ağaç dışı yener). Bu yüzden host'a install()'da verilen
           position:fixed / top / z-index, :host'un all:initial'ı tarafından eziliyor;
           buton sayfa akışına düşüp en dibe kayıyor ve kullanıcıya HİÇ görünmüyordu.
           Çözüm: konumu :host içinde, all:initial'dan SONRA vermek — aynı kuralda
           sonraki bildirim kazanır ve sayfa CSS'ine karşı da bağışık kalır. */
        :host {
          all: initial !important;
          position: fixed !important;
          right: 18px !important;
          top: 92px !important;
          z-index: 2147483647 !important;
          display: block !important;
        }
        button {
          all: initial; width: 52px; height: 52px; display: grid; place-items: center;
          box-sizing: border-box; border: 0; border-radius: 999px; color: #fff;
          background: #2563eb; box-shadow: 0 10px 28px rgba(0,0,0,.5), 0 0 0 2px rgba(255,255,255,.2);
          cursor: pointer; font-family: system-ui, sans-serif;
        }
        button:hover { background: #1d4ed8; }
        button:disabled { opacity: .6; cursor: wait; }
        svg { width: 28px; height: 28px; pointer-events: none; }
        /* Özellik D — indirme butonunun hemen altında "web listesine ekle". */
        #${WEB_BUTTON_ID} { margin-top: 10px; background: #0f766e; }
        #${WEB_BUTTON_ID}:hover { background: #0d9488; }
        #${WEB_BUTTON_ID} svg { width: 26px; height: 26px; }
        #status { display: none; position: absolute; right: 0; top: 124px; width: max-content; max-width: 260px;
          padding: 8px 11px; border-radius: 8px; color: #fff; background: rgba(127,29,29,.94);
          font: 600 12px/1.3 system-ui, sans-serif; }
        #status:not(:empty) { display: block; }
      </style>
      <button id="${BUTTON_ID}" type="button" title="Görünen Scrolller medyasını indir" aria-label="Görünen Scrolller medyasını indir">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        </svg>
      </button>
      <button id="${WEB_BUTTON_ID}" type="button" title="Bu gönderiyi web listesine ekle" aria-label="Bu gönderiyi web listesine ekle">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M12 8.5v5M9.5 11h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
      <div id="status" role="status"></div>
    `;

    const button = shadow.getElementById(BUTTON_ID);
    const status = shadow.getElementById("status");
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = "";
      try {
        await downloadCurrent({ chooseFolder: true });
      } catch (error) {
        console.error("[rg-scrolller-v2] hata", error);
        status.textContent = String(error?.message || error || "E_FAILED");
      } finally {
        button.disabled = false;
      }
    });

    // Özellik D — görünen medyanın permalink'ini web listesine ekle. Kapsam:
    // "sadece ana medya" (tek, görünür öğe). Menü/toast light DOM'da açılır.
    const webButton = shadow.getElementById(WEB_BUTTON_ID);
    if (webButton && window.rgAddToWeb) {
      webButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const candidate = visibleMediaCandidates()[0];
        const url = (candidate && candidate.sourcePageUrl) || location.href;
        window.rgAddToWeb({ url, title: document.title || "" }, { anchor: webButton });
      });
    } else if (webButton) {
      webButton.style.display = "none";
    }

    document.documentElement.appendChild(host);
    console.info("[rg-scrolller-v2] izole indirme kontrolü yüklendi", { version: host.dataset.rgVersion });
  }

  let installScheduled = false;
  function ensureInstalled() {
    const host = document.getElementById(HOST_ID);
    if (host?.isConnected) {
      host.style.setProperty("display", "block", "important");
      return;
    }
    install();
  }

  // Scrolller replaces large DOM sections during hydration and route changes.
  // Recreate the isolated control whenever the site removes it. The button is
  // intentionally fixed and always visible; it no longer depends on hover.
  const observer = new MutationObserver(() => {
    if (installScheduled) return;
    installScheduled = true;
    requestAnimationFrame(() => {
      installScheduled = false;
      ensureInstalled();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => {
    applyCleanupSelectors();
    ensureInstalled();
  }, 800);

  function loadSettings() {
    chrome.storage.local.get(SETTINGS_KEY, (items) => {
      settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS, ...(items?.[SETTINGS_KEY] || {}) };
      applyCleanupSelectors();
      ensureInstalled();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    applyCleanupSelectors();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "RG_SCROLLLER_PICK_HIDE") {
      startCleanupPicker();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "RG_SCROLLLER_RESET_HIDDEN") {
      const next = { ...settings, scrolllerHiddenSelectors: [] };
      chrome.storage.local.set({ [SETTINGS_KEY]: next }, () => sendResponse({ ok: true }));
      return true;
    }
    if (message.type === "RG_SCROLLLER_DOWNLOAD_CURRENT") {
      downloadCurrent({ chooseFolder: false })
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      return true;
    }
  });

  // --- App floating-button bridge --------------------------------------------
  // visibleMediaCandidates() already does everything the app needs: ads are
  // filtered, only the top viewer layer counts (no framing the feed behind a
  // fullscreen viewer), and each candidate knows whether it is a video or an
  // image and its best-quality url or source page. Reuse it wholesale so the
  // floating button and the picker match the on-card buttons exactly.
  window.__rgSiteName = "scrolller.com";
  window.__rgCollectMedia = () =>
    visibleMediaCandidates().map((candidate) => ({
      el: candidate.media,
      kind: candidate.kind,
      src: candidate.urls[0] || "",
      permalink: candidate.sourcePageUrl || location.href,
      title: "",
      // Route through the site's own downloader so the scrolllerSourceUrl path
      // (videos with no direct url) keeps working (KÖK-VIDEO-POSTER).
      resolve: () => { downloadCandidate(candidate, {}).catch(() => {}); }
    }));

  ensureInstalled();
  loadSettings();
})();
