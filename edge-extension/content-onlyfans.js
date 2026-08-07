(() => {
  if (window.top !== window || window.__rgOnlyfansLoaded) return;
  window.__rgOnlyfansLoaded = true;

  const BUTTON_CLASS = "rg-of-download";
  const LINK_HOST_CLASS = "rg-of-media-link";
  const VIDEO_HOST_CLASS = "rg-of-video-host";
  const STYLE_ID = "rg-of-style";
  const SETTINGS_KEY = globalThis.RG_SETTINGS.SETTINGS_KEY;
  let settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS };
  let scanScheduled = false;

  // OnlyFans'ın görsel/poster CDN'leri: cdn2/cdn3/public/thumbs.onlyfans.com ve
  // benzeri alt alan adları. Sınıf adları Vue derlemesinde değiştiği için host'a
  // göre eşliyoruz, fragile class isimlerine göre değil.
  const CDN_RE = /(?:^|\.)onlyfans\.com$|(?:^|\.)of\.gg$/i;

  // Kök yolun ilk parçası bunlardan biriyse profil/kullanıcı sayfası değildir.
  const RESERVED = new Set([
    "my", "posts", "search", "notifications", "chats", "settings", "help",
    "terms", "privacy", "about", "home", "p", "u", "collections", "lists",
    "statements", "referrals", "vault", "get", "blog", "faq"
  ]);

  // Sohbet/DM sayfaları kapsam dışı (kullanıcı kararı: mesajlar hariç). Geri kalan
  // her yer — akış, profil, tekil gönderi — desteklenir.
  function isChatPage() {
    return /^\/my\/chats(?:\/|$)/i.test(location.pathname);
  }
  function isSupportedPage() {
    return !isChatPage();
  }

  // ---- HLS keşfi (MAIN kancasından gelen postMessage'lar) --------------------
  // page-hook-onlyfans.js oynatıcının çektiği .m3u8 adreslerini buraya iletir.
  const hlsSeen = []; // { url, ts } — en yeni sonda
  const HLS_MAX = 40;
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "RG_OF_HOOK" || data.kind !== "hls" || !data.url) return;
    const existing = hlsSeen.find((h) => h.url === data.url);
    if (existing) existing.ts = data.ts || Date.now();
    else hlsSeen.push({ url: data.url, ts: data.ts || Date.now() });
    while (hlsSeen.length > HLS_MAX) hlsSeen.shift();
  });

  function digitsIn(value) {
    return String(value || "").match(/\d{5,}/g) || [];
  }

  // Bir video için en olası m3u8: önce çevresindeki medya-id'leriyle eşleşen,
  // yoksa afterTs'den sonra gelen en yeni, yoksa genel en yeni istek.
  function hlsForIds(ids, afterTs) {
    const pool = afterTs ? hlsSeen.filter((h) => h.ts >= afterTs) : hlsSeen.slice();
    if (ids && ids.length) {
      for (let i = pool.length - 1; i >= 0; i--) {
        if (ids.some((id) => pool[i].url.includes(id))) return pool[i].url;
      }
    }
    return pool.length ? pool[pool.length - 1].url : "";
  }

  function waitForHls(ids, afterTs, timeoutMs) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      (function poll() {
        const url = hlsForIds(ids, afterTs);
        if (url) return resolve(url);
        if (Date.now() > deadline) return resolve("");
        setTimeout(poll, 200);
      })();
    });
  }

  // ---- Kullanıcı adı / klasör -------------------------------------------------
  function usernameFromPath() {
    const segs = location.pathname.split("/").filter(Boolean);
    // /<username>
    if (segs.length === 1 && !RESERVED.has(segs[0].toLowerCase())) return segs[0];
    // /<postId>/<username>
    if (segs.length === 2 && /^\d+$/.test(segs[0]) && !RESERVED.has(segs[1].toLowerCase())) return segs[1];
    return "";
  }

  // Akışta her kartın yazarı farklı; medyanın çevresindeki profil bağlantısından
  // (/<username>) kullanıcı adını çıkar.
  function creatorFromElement(el) {
    let node = el;
    for (let i = 0; node && i < 8; i++, node = node.parentElement) {
      const links = node.querySelectorAll ? node.querySelectorAll('a[href^="/"]') : [];
      for (const anchor of links) {
        const href = (anchor.getAttribute("href") || "").split("?")[0];
        const segs = href.split("/").filter(Boolean);
        if (segs.length === 1 && /^[a-z0-9._-]+$/i.test(segs[0]) && !RESERVED.has(segs[0].toLowerCase())) {
          return segs[0];
        }
      }
    }
    return "";
  }

  function profileName(el) {
    const name = usernameFromPath() || (el ? creatorFromElement(el) : "") || "OnlyFans";
    return globalThis.RG_SETTINGS.cleanPathPart(name, "OnlyFans");
  }

  // ---- Görsel tespiti ---------------------------------------------------------
  function bestImgUrl(img) {
    if (!img) return "";
    let url = img.currentSrc || img.getAttribute("src") || "";
    let bestW = 0;
    for (const part of (img.getAttribute("srcset") || "").split(",")) {
      const [candidate, descriptor] = part.trim().split(/\s+/);
      const width = parseInt(descriptor) || 0;
      if (candidate && width >= bestW) { bestW = width; url = candidate; }
    }
    return url;
  }

  function imageUrlFrom(img) {
    try {
      const parsed = new URL(bestImgUrl(img), location.href);
      return CDN_RE.test(parsed.hostname) ? parsed.href : "";
    } catch {
      return "";
    }
  }

  function hasImageExt(value) {
    try {
      return /\.(jpg|jpeg|png|webp|gif)$/i.test(new URL(value, location.href).pathname);
    } catch {
      return false;
    }
  }

  // Avatar / emoji / arayüz ikonlarını ele: gerçek gönderi görselleri büyüktür.
  function isBigEnough(img) {
    const rect = img.getBoundingClientRect();
    const width = Math.max(img.naturalWidth || 0, rect.width || 0);
    const height = Math.max(img.naturalHeight || 0, rect.height || 0);
    return width >= 200 && height >= 200;
  }

  function isChromeUi(el) {
    return !!(el.closest && el.closest('nav, [role="navigation"], [role="menu"], [role="tablist"]'));
  }

  // ---- Stil (Coomer'daki hover-reveal deseniyle birebir) ---------------------
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${LINK_HOST_CLASS} { position: relative !important; }
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
      /* Buton, medyanın üstüne gelince belirir; global "Her zaman" seçilir ya da
         dokunmatik ekranda (:hover hiç tetiklenmez) sürekli görünür. */
      .${LINK_HOST_CLASS}:hover > .${BUTTON_CLASS},
      .${VIDEO_HOST_CLASS}:hover > .${BUTTON_CLASS},
      html[data-rg-downloader-button-visibility="always"] .${BUTTON_CLASS},
      .${BUTTON_CLASS}:hover,
      .${BUTTON_CLASS}:active,
      .${BUTTON_CLASS}:focus-visible {
        opacity: 1 !important; transform: scale(1) !important;
      }
      .${BUTTON_CLASS}:hover { background: #1d4ed8 !important; }
      .${BUTTON_CLASS}:disabled { opacity: .58 !important; cursor: wait !important; }
      .${BUTTON_CLASS} svg { width: 22px !important; height: 22px !important; pointer-events: none !important; }
      @media (hover: none) {
        .${BUTTON_CLASS} { opacity: 1 !important; transform: none !important; }
      }
    `;
    (document.head || document.documentElement).appendChild(style);
    applyButtonVisibility();
  }

  function applyButtonVisibility() {
    document.documentElement.dataset.rgDownloaderButtonVisibility =
      settings.buttonVisibility === "always" ? "always" : "hover";
  }

  // ---- İndirme çağrıları ------------------------------------------------------
  function sendImage(realUrl, namingUrl, creator) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "DIRECT_DOWNLOAD",
        urls: [realUrl],
        folderName: creator,
        source: creator,
        site: "OnlyFans",
        skipReachability: true,
        namingUrl,
        preserveAlternatives: true,
        allowRipsnipFallback: false
      }, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!result || result.ok === false) reject(new Error(result?.error || "İndirme başarısız"));
        else resolve(result);
      });
    });
  }

  function sendBlob(blobUrl, namingUrl, creator) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: "OF_HLS_DOWNLOAD",
        blobUrl,
        namingUrl,
        folderName: creator,
        source: creator
      }, (result) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!result || result.ok === false) reject(new Error(result?.error || "İndirme başarısız"));
        else resolve(result);
      });
    });
  }

  // ---- HLS dizme (içerik betiği bağlamında; oynatıcının çerez/Referer/CORS'u) -
  async function fetchText(url) {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(`m3u8 ${res.status}`);
    return res.text();
  }

  function resolveUri(uri, base) {
    return new URL(uri, base).href;
  }

  // Master çalma listesinden en yüksek bant genişlikli varyantın medya-listesi
  // URL'si; zaten medya listesiyse "" döner.
  function parseMaster(text, baseUrl) {
    const lines = text.split(/\r?\n/);
    let best = null;
    for (let i = 0; i < lines.length; i++) {
      if (!/^#EXT-X-STREAM-INF/i.test(lines[i].trim())) continue;
      const bandwidth = parseInt((lines[i].match(/BANDWIDTH=(\d+)/i) || [])[1] || "0", 10);
      let j = i + 1;
      while (j < lines.length && (!lines[j].trim() || lines[j].trim().startsWith("#"))) j++;
      const uri = lines[j] ? lines[j].trim() : "";
      if (uri && (!best || bandwidth > best.bandwidth)) best = { bandwidth, uri };
    }
    return best ? resolveUri(best.uri, baseUrl) : "";
  }

  function parseMedia(text, baseUrl) {
    const segments = [];
    let initUri = "";
    let encMethod = "";
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^#EXT-X-KEY/i.test(line)) {
        const method = ((line.match(/METHOD=([A-Z0-9-]+)/i) || [])[1] || "").toUpperCase();
        if (method && method !== "NONE") encMethod = method;
        continue;
      }
      if (/^#EXT-X-MAP/i.test(line)) {
        const uri = (line.match(/URI="([^"]+)"/i) || [])[1];
        if (uri) initUri = resolveUri(uri, baseUrl);
        continue;
      }
      if (line.startsWith("#")) continue;
      segments.push(resolveUri(line, baseUrl));
    }
    return { segments, initUri, encMethod };
  }

  // Parçaları sırayı koruyarak sınırlı eşzamanlılıkla indir (çok parçalı video
  // seri indirmede çok yavaş olur).
  async function fetchAllOrdered(urls, concurrency, onProgress) {
    const results = new Array(urls.length);
    let index = 0;
    let done = 0;
    async function worker() {
      while (index < urls.length) {
        const mine = index++;
        const res = await fetch(urls[mine], { credentials: "include" });
        if (!res.ok) throw new Error(`parça ${res.status}`);
        results[mine] = await res.arrayBuffer();
        done++;
        if (onProgress) onProgress(done, urls.length);
      }
    }
    const pool = [];
    for (let i = 0; i < Math.min(concurrency, urls.length); i++) pool.push(worker());
    await Promise.all(pool);
    return results;
  }

  async function assembleHls(masterUrl, onProgress) {
    const masterText = await fetchText(masterUrl);
    let mediaUrl = masterUrl;
    let mediaText = masterText;
    const variant = parseMaster(masterText, masterUrl);
    if (variant) { mediaUrl = variant; mediaText = await fetchText(variant); }

    const { segments, initUri, encMethod } = parseMedia(mediaText, mediaUrl);
    // Şifreli akışlar (AES-128 / SAMPLE-AES / Widevine) kapsam dışı: DRM çözme
    // yapmıyoruz. Kullanıcıya net söyle.
    if (encMethod) throw new Error(`Şifreli/DRM akış (${encMethod}) — indirilemiyor`);
    if (!segments.length) throw new Error("HLS parçası bulunamadı");

    const urls = initUri ? [initUri, ...segments] : segments;
    const buffers = await fetchAllOrdered(urls, 6, onProgress);
    // fMP4 (EXT-X-MAP) → geçerli parçalı mp4; aksi halde TS parçaları → .ts.
    const ext = initUri ? "mp4" : "ts";
    const type = initUri ? "video/mp4" : "video/mp2t";
    return { blob: new Blob(buffers, { type }), ext };
  }

  async function downloadVideo(video, button) {
    const ids = [...new Set([
      ...digitsIn(video.getAttribute("poster")),
      ...digitsIn(video.closest("[data-id]") && video.closest("[data-id]").getAttribute("data-id")),
      ...digitsIn(video.closest("a[href]") && video.closest("a[href]").getAttribute("href"))
    ])];

    let master = hlsForIds(ids, 0);
    if (!master) {
      // Oynatıcıyı tetikle: tıklama bir kullanıcı hareketidir, play() m3u8 fetch'ini
      // başlatır; kancadan yeni bir m3u8 gelmesini bekle.
      const clickTs = Date.now();
      try { video.muted = true; await video.play(); } catch { /* oynatma reddedilse de bekleriz */ }
      master = await waitForHls(ids, clickTs, 6000);
    }
    if (!master) throw new Error("m3u8 bulunamadı — videoyu bir kez oynatmayı deneyin");

    const creator = profileName(video);
    const { blob, ext } = await assembleHls(master, (done, total) => {
      button.title = `İndiriliyor… %${Math.round((done / total) * 100)}`;
    });
    const blobUrl = URL.createObjectURL(blob);
    const idGuess = ids[0] || String(Date.now());
    const namingUrl = `https://onlyfans.com/${encodeURIComponent(creator)}/${idGuess}.${ext}`;
    try {
      await sendBlob(blobUrl, namingUrl, creator);
    } finally {
      // İndirme tarayıcı sürecinde başladıktan sonra blob'u bir süre canlı tut,
      // sonra bırak (erken revoke indirmeyi yarıda keser).
      setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch { /* yut */ } }, 120000);
    }
  }

  // ---- Butonlar ---------------------------------------------------------------
  function makeButton(kind, onDownload) {
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
      const originalTitle = kind === "video" ? "Videoyu indir" : "Görseli indir";
      try {
        await onDownload(button);
        button.style.setProperty("background", "#15803d", "important");
        button.title = originalTitle;
        setTimeout(() => button.style.removeProperty("background"), 900);
      } catch (error) {
        console.error("[rg-onlyfans] download failed", error);
        button.style.setProperty("background", "#b91c1c", "important");
        button.title = String((error && error.message) || error || "E_FAILED");
      } finally {
        button.disabled = false;
      }
    });
    return button;
  }

  function addImageButton(img) {
    const realUrl = imageUrlFrom(img);
    if (!realUrl || isChromeUi(img) || !isBigEnough(img)) return;
    const host = img.parentElement;
    if (!host || host.querySelector(`:scope > .${BUTTON_CLASS}`)) return;
    host.classList.add(LINK_HOST_CLASS);
    const creator = profileName(img);
    const naming = hasImageExt(realUrl)
      ? realUrl
      : `https://onlyfans.com/${encodeURIComponent(creator)}/${digitsIn(realUrl)[0] || Date.now()}.jpg`;
    host.appendChild(makeButton("image", () => sendImage(realUrl, naming, creator)));
  }

  function addVideoButton(video) {
    if (isChromeUi(video)) return;
    const host = video.parentElement;
    if (!host || host.querySelector(`:scope > .${BUTTON_CLASS}[data-rg-kind="video"]`)) return;
    host.classList.add(VIDEO_HOST_CLASS);
    host.appendChild(makeButton("video", (button) => downloadVideo(video, button)));
  }

  function removeButtons() {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
    document.querySelectorAll(`.${LINK_HOST_CLASS}`).forEach((el) => el.classList.remove(LINK_HOST_CLASS));
    document.querySelectorAll(`.${VIDEO_HOST_CLASS}`).forEach((el) => el.classList.remove(VIDEO_HOST_CLASS));
  }

  function scan() {
    if (!settings.onlyfansButtons || !isSupportedPage()) {
      removeButtons();
      return;
    }
    ensureStyle();
    const root = document.querySelector("main") || document.body;
    for (const img of root.querySelectorAll("img")) addImageButton(img);
    for (const video of root.querySelectorAll("video")) addVideoButton(video);
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  // ---- Uygulama içi tarayıcı köprüsü (yalnız görseller) ----------------------
  // OnlyFans videoları blob:/MSE olduğu için app'in src tabanlı indiricisine
  // yaramaz; köprüde yalnız görselleri sunuyoruz. Görünür video butonu HLS
  // akışını kendi hallediyor.
  window.__rgSiteName = "onlyfans.com";
  window.__rgCollectMedia = () => {
    if (!isSupportedPage()) return [];
    const out = [];
    const seen = new Set();
    const root = document.querySelector("main") || document.body;
    for (const img of root.querySelectorAll("img")) {
      const url = imageUrlFrom(img);
      if (!url || seen.has(img) || isChromeUi(img) || !isBigEnough(img)) continue;
      seen.add(img);
      out.push({ el: img, kind: "image", src: url, permalink: location.href, title: profileName(img) });
    }
    return out;
  };

  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleScan);
  window.addEventListener("scroll", scheduleScan, { passive: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
    applyButtonVisibility();
    scheduleScan();
  });
  chrome.storage.local.get(SETTINGS_KEY, (items) => {
    settings = { ...globalThis.RG_SETTINGS.DEFAULT_SETTINGS, ...(items && items[SETTINGS_KEY] || {}) };
    applyButtonVisibility();
    scan();
  });
})();
