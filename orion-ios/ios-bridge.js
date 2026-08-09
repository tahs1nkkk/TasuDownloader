/*
 * Orion (iOS / iPadOS) bridge.
 *
 * The desktop build routes every save through background.js -> chrome.downloads.
 * iOS exposes no downloads manager to extensions, and a file an extension writes
 * cannot reach Photos anyway. So this build ships no background worker at all:
 * the bridge answers the same messages here in the content world, fetches the
 * media itself, and hands the finished file to the iOS share sheet, where
 * "Save Image" / "Save Video" is the only route into Photos.
 *
 * Every site handler (content-redgifs.js, content-reddit.js, ...) is copied from
 * edge-extension/ untouched by scripts/build-orion-ios.js. Keep this file the
 * only place that knows the platform differs.
 */
(() => {
  "use strict";

  const api = globalThis.chrome || globalThis.browser;
  if (!api || !api.runtime) return;
  if (globalThis.__rgIosBridgeLoaded) return;
  globalThis.__rgIosBridgeLoaded = true;

  const MIME_BY_EXT = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif"
  };

  /* ---------------------------------------------------------------- storage */

  const SETTINGS_KEY = "tasuDownloaderSettings";

  // Settings the phone cannot honour, forced on every read so no stale stored
  // value or popup edit can bring back a control that does not work on touch.
  function applyMobileSettings(stored) {
    const settings = { ...(stored || {}) };
    settings.buttonVisibility = "always"; // :hover never fires on a touch screen
    settings.rightShiftDownload = false; // no hardware keyboard
    settings.buttonSize = Math.max(48, Number(settings.buttonSize) || 48);
    return settings;
  }

  function wantsSettings(keys) {
    if (keys === null || keys === undefined) return true;
    if (typeof keys === "string") return keys === SETTINGS_KEY;
    if (Array.isArray(keys)) return keys.includes(SETTINGS_KEY);
    return typeof keys === "object" && SETTINGS_KEY in keys;
  }

  // Wrapping the read rather than seeding the store avoids a race: handlers ask
  // for settings as soon as they load, which can be before any write lands.
  function forceMobileSettingsOnRead() {
    const local = api.storage && api.storage.local;
    if (!local || typeof local.get !== "function") return;

    const nativeGet = local.get.bind(local);
    const patch = (result, keys) => {
      if (!wantsSettings(keys)) return result;
      const out = result && typeof result === "object" ? result : {};
      out[SETTINGS_KEY] = applyMobileSettings(out[SETTINGS_KEY]);
      return out;
    };

    try {
      local.get = function get(keys, callback) {
        if (typeof callback === "function") return void nativeGet(keys, (r) => callback(patch(r, keys)));
        const result = nativeGet(keys);
        return result && typeof result.then === "function"
          ? result.then((r) => patch(r, keys))
          : patch(result, keys);
      };
    } catch {
      // Read-only storage object: the CSS layer still keeps buttons visible.
    }
  }

  // Orion's storage support is still marked beta. Fall back to localStorage so a
  // missing chrome.storage degrades the settings, not the download button.
  function installStoragePolyfill() {
    if (api.storage && api.storage.local && typeof api.storage.local.get === "function") return;

    const STORE_KEY = "__rgIosBridgeStorage";
    const read = () => {
      try {
        return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      } catch {
        return {};
      }
    };
    const write = (value) => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(value));
      } catch {
        // Private mode or a full quota: settings stay at their defaults.
      }
    };

    const local = {
      get(keys, callback) {
        const all = read();
        let out = {};
        if (keys === null || keys === undefined) out = all;
        else if (typeof keys === "string") out = { [keys]: all[keys] };
        else if (Array.isArray(keys)) for (const key of keys) out[key] = all[key];
        else for (const key of Object.keys(keys)) out[key] = key in all ? all[key] : keys[key];
        if (typeof callback === "function") return void callback(out);
        return Promise.resolve(out);
      },
      set(items, callback) {
        write({ ...read(), ...(items || {}) });
        if (typeof callback === "function") return void callback();
        return Promise.resolve();
      },
      remove(keys, callback) {
        const all = read();
        for (const key of [].concat(keys || [])) delete all[key];
        write(all);
        if (typeof callback === "function") return void callback();
        return Promise.resolve();
      }
    };

    try {
      api.storage = { ...(api.storage || {}), local, onChanged: { addListener() {}, removeListener() {} } };
    } catch {
      // chrome.storage is non-writable here; handlers will use their defaults.
    }
  }

  /* -------------------------------------------------------------- filenames */

  function cleanFileName(value) {
    return String(value || "video")
      .replace(/^https?:\/\//i, "")
      .replace(/[^a-z0-9._-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function extensionFor(url) {
    try {
      const match = new URL(url).pathname.match(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i);
      if (match) return match[0].toLowerCase();
    } catch {
      // Fall through to the default below.
    }
    return ".mp4";
  }

  // Mirrors background.js filenameFor(), minus the directory part: Photos has no
  // folders, so only the leaf name survives the trip through the share sheet.
  function fileNameFor(url, site) {
    const ext = extensionFor(url);
    let label = "redgifs-video";
    try {
      const parsed = new URL(url);
      const supplied = site === "Coomer" ? parsed.searchParams.get("f") : "";
      label = cleanFileName(supplied || parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname);
    } catch {
      label = "redgifs-video";
    }
    label = label.replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i, "");
    return `${label}${ext}`;
  }

  function mimeFor(filename, blobType) {
    if (blobType && blobType !== "application/octet-stream") return blobType;
    const match = String(filename).match(/\.[a-z0-9]+$/i);
    return (match && MIME_BY_EXT[match[0].toLowerCase()]) || "application/octet-stream";
  }

  function siteFromUrl(value) {
    const settings = globalThis.RG_SETTINGS;
    if (settings && typeof settings.siteFromUrl === "function") return settings.siteFromUrl(value);
    return "Other";
  }

  /* ------------------------------------------------------------------- panel */

  let panelHost = null;
  let panelRoot = null;
  const queue = [];
  // Last URL we could not fetch, kept only so the "open in a new tab" escape
  // hatch still has a target. It must never enter the queue: entries there are
  // expected to carry a blob.
  let fallbackUrl = null;

  function ensurePanel() {
    if (panelRoot) return panelRoot;

    panelHost = document.createElement("div");
    panelHost.id = "rg-ios-bridge";
    // The panel outlives SPA navigations on Reddit/Instagram, so pin it to the
    // viewport and keep it out of the site's stacking contexts.
    panelHost.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;";
    const shadow = panelHost.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        /* Clear Orion's bottom toolbar, or the panel renders behind it. */
        .wrap { pointer-events: none; display: flex; justify-content: center; padding: 0 12px calc(env(safe-area-inset-bottom, 0px) + 76px); }
        .card {
          pointer-events: auto; display: none; width: 100%; max-width: 460px;
          box-sizing: border-box; padding: 12px 14px; border-radius: 16px;
          background: rgba(28, 28, 30, 0.96); color: #fff;
          font: 500 15px/1.35 -apple-system, system-ui, sans-serif;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
        }
        .card.on { display: block; }
        .row { display: flex; align-items: center; gap: 10px; }
        .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; opacity: 0.75; }
        .msg { margin: 2px 0 10px; font-size: 14px; }
        .bar { height: 4px; border-radius: 2px; background: rgba(255,255,255,0.18); overflow: hidden; margin: 0 0 10px; }
        .bar > i { display: block; height: 100%; width: 0%; background: #0a84ff; transition: width 0.15s linear; }
        button {
          font: 600 15px/1 -apple-system, system-ui, sans-serif; color: #fff;
          border: 0; border-radius: 11px; padding: 12px 14px; width: 100%;
          min-height: 44px; /* iOS minimum touch target */
          background: #0a84ff; cursor: pointer; -webkit-appearance: none;
        }
        button[disabled] { opacity: 0.45; }
        /* The escape hatch is only an answer to a failed download. Offering it
           beside a finished file just turns saving into a choice. */
        button.ghost { background: rgba(255,255,255,0.14); margin-top: 8px; display: none; }
        .card.failed button.ghost { display: block; }
        .x { width: 36px; height: 36px; min-height: 36px; padding: 0; border-radius: 18px; background: rgba(255,255,255,0.14); font-size: 17px; }
      </style>
      <div class="wrap">
        <div class="card">
          <div class="row"><span class="name"></span><button class="x" type="button" aria-label="Kapat">×</button></div>
          <div class="msg"></div>
          <div class="bar"><i></i></div>
          <button class="save" type="button" disabled>Fotoğraflara kaydet</button>
          <button class="ghost" type="button">Yeni sekmede aç</button>
        </div>
      </div>`;

    (document.body || document.documentElement).appendChild(panelHost);
    panelRoot = {
      card: shadow.querySelector(".card"),
      name: shadow.querySelector(".name"),
      msg: shadow.querySelector(".msg"),
      bar: shadow.querySelector(".bar"),
      fill: shadow.querySelector(".bar > i"),
      save: shadow.querySelector(".save"),
      ghost: shadow.querySelector(".ghost"),
      close: shadow.querySelector(".x")
    };

    panelRoot.close.addEventListener("click", () => {
      queue.length = 0;
      hidePanel();
    });
    // This click is the fresh user activation navigator.share() needs.
    panelRoot.save.addEventListener("click", () => void saveHead());
    panelRoot.ghost.addEventListener("click", () => {
      const target = (queue[0] && queue[0].url) || fallbackUrl;
      if (target) window.open(target, "_blank", "noopener");
    });

    return panelRoot;
  }

  function showPanel({ name, msg, progress, ready, failed }) {
    const ui = ensurePanel();
    ui.card.classList.add("on");
    if (failed !== undefined) ui.card.classList.toggle("failed", Boolean(failed));
    if (name !== undefined) ui.name.textContent = name;
    if (msg !== undefined) ui.msg.textContent = msg;
    if (progress === null) ui.bar.style.display = "none";
    else if (progress !== undefined) {
      ui.bar.style.display = "block";
      ui.fill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
    }
    if (ready !== undefined) ui.save.disabled = !ready;
  }

  function hidePanel() {
    if (panelRoot) panelRoot.card.classList.remove("on");
  }

  /* ------------------------------------------------------------------ saving */

  const ARM_MESSAGE = "Hazır. Kaydet'e dokun, sonra \"Videoyu kaydet\" veya \"Görüntüyü kaydet\" seç.";

  // Which credentials mode a host actually accepted. Coomer serves media from
  // sibling subdomains, so the first attempt is a cross-origin one that may be
  // refused; remembering the answer keeps every later download on that CDN from
  // paying the same wasted round trip.
  const credentialsByHost = new Map();

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  }

  // An HTTP status explains a dead candidate far better than the generic CORS
  // "Failed to fetch" thrown by whichever credentials mode we happened to try
  // second, so it wins when both attempts fail.
  function preferError(current, next) {
    if (!current) return next;
    return /^HTTP \d+$/.test(current.message || "") ? current : next;
  }

  function formatBytes(bytes) {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  async function fetchBlob(url, onProgress, options = {}) {
    // Cross-origin CDN reads need cookies on Coomer and Instagram but are
    // rejected outright by hosts that disallow credentialed CORS, so try the
    // permissive form first and retry without credentials before giving up.
    // Reordering rather than shortening: a remembered mode can go stale when the
    // session's cookies change, and the other one still has to be reachable.
    const host = hostOf(url);
    const remembered = credentialsByHost.get(host);
    const modes = remembered === "omit" ? ["omit", "include"] : ["include", "omit"];

    let response = null;
    let lastError = null;
    for (const credentials of modes) {
      // A candidate that has not even produced response headers in time is
      // stalling. When a fallback is queued behind it, drop it and move on
      // rather than waiting out the CDN's own timeout.
      const controller = new AbortController();
      const stallTimer = options.firstByteTimeoutMs
        ? setTimeout(() => controller.abort(), options.firstByteTimeoutMs)
        : 0;
      try {
        response = await fetch(url, { credentials, referrer: location.href, signal: controller.signal });
        // Headers are in, so the leash has done its job. Clear it here rather
        // than in the finally: the timer must not survive to abort the body
        // stream, which is read after this loop exits.
        clearTimeout(stallTimer);
        if (response.ok) {
          credentialsByHost.set(host, credentials);
          break;
        }
        lastError = preferError(lastError, new Error(`HTTP ${response.status}`));
        response = null;
      } catch (error) {
        lastError = preferError(lastError, controller.signal.aborted ? new Error("STALLED") : error);
        response = null;
        if (controller.signal.aborted) break;
      } finally {
        if (stallTimer) clearTimeout(stallTimer);
      }
    }
    if (!response) throw lastError || new Error("FETCH_FAILED");

    const total = Number(response.headers.get("content-length")) || 0;
    if (!response.body) return await response.blob();

    const reader = response.body.getReader();
    const chunks = [];
    const started = Date.now();
    let received = 0;
    let lastReport = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      // Repainting on every chunk costs more than the readout is worth, and a
      // slow CDN delivers a lot of them.
      const now = Date.now();
      if (now - lastReport < 120) continue;
      lastReport = now;
      onProgress(total ? Math.round((received / total) * 100) : null, received, now - started);
    }
    onProgress(total ? 100 : null, received, Date.now() - started);
    return new Blob(chunks, { type: response.headers.get("content-type") || "" });
  }

  // auto: called straight after the fetch instead of from the panel's button.
  // navigator.share() needs transient user activation, and the download tap is
  // still good for a few seconds, so a quick fetch reaches the share sheet with
  // no second tap. A slow one loses the activation and falls back to the button.
  async function saveHead({ auto = false } = {}) {
    const head = queue[0];
    if (!head || !head.blob) return;

    const file = new File([head.blob], head.filename, { type: mimeFor(head.filename, head.blob.type) });
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) {
      // No file sharing: fall back to a normal download, which lands in Files
      // rather than Photos but at least keeps the media.
      const href = URL.createObjectURL(head.blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = head.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 30000);
      shiftQueue("Dosyalar'a kaydedildi (paylaşım sayfası desteklenmiyor).");
      return;
    }

    try {
      await navigator.share({ files: [file] });
      shiftQueue("Kaydedildi.");
    } catch (error) {
      // AbortError just means the share sheet was dismissed; keep the item.
      if (error && error.name === "AbortError") return;
      // Losing the activation is the expected outcome for a large file, not a
      // failure worth reporting. Arm the button and let the user tap once more.
      if (auto) {
        showPanel({ msg: ARM_MESSAGE, progress: null, ready: true });
        return;
      }
      showPanel({ msg: `Paylaşım başarısız: ${error && error.message || error}`, ready: true });
    }
  }

  function shiftQueue(doneMessage) {
    queue.shift();
    if (!queue.length) {
      showPanel({ msg: doneMessage, progress: null, ready: false });
      setTimeout(hidePanel, 1600);
      return;
    }
    const next = queue[0];
    showPanel({ name: next.filename, msg: `${doneMessage} Sırada ${queue.length} dosya var.`, progress: null, ready: true });
  }

  function enqueue(entry, { autoShare = false } = {}) {
    queue.push(entry);
    if (queue.length === 1) {
      showPanel({
        name: entry.filename,
        msg: autoShare ? "Paylaşım sayfası açılıyor…" : ARM_MESSAGE,
        progress: null,
        ready: true
      });
    } else {
      showPanel({ msg: `Sırada ${queue.length} dosya var.` });
    }
  }

  /* ----------------------------------------------------------- message logic */

  async function prepare(url, site, wantImage, options = {}) {
    // İndirilen adres ile adın türetildiği adres ayrı olabilir: Coomer'ın
    // indirilebilir adresi bir karma, gerçek ad `namingUrl`'in `?f=`
    // parametresinde. background.js aynı ayrımı `downloadToFile(..., namingUrl)`
    // ile yapıyor; burada okunmadığı için dosyalar karma adıyla kaydediliyordu.
    const filename = fileNameFor(options.namingUrl || url, site);
    showPanel({ name: filename, msg: "İndiriliyor…", progress: 0, ready: false, failed: false });
    // Coomer's CDN often answers without a content-length, which left the bar at
    // 0% for the whole transfer and made a working download look frozen. Show
    // the bytes and the rate instead, so a slow host reads as slow, not stuck.
    const blob = await fetchBlob(url, (percent, received, elapsed) => {
      const rate = elapsed > 400 ? ` · ${formatBytes((received / elapsed) * 1000)}/sn` : "";
      showPanel({ msg: `İndiriliyor… ${formatBytes(received)}${rate}`, progress: percent });
    }, options);
    if (wantImage && !/^image\//i.test(blob.type || "")) throw new Error("NOT_AN_IMAGE");
    if (!blob.size) throw new Error("EMPTY_BODY");
    return { blob, url, filename };
  }

  async function handleDirectDownload(message) {
    const site = siteFromUrl(message.fallbackSourceUrl || location.href);
    const wantImage = Boolean(message.imageMode);
    const namingUrl = typeof message.namingUrl === "string" ? message.namingUrl : "";
    const errors = [];

    // Scrolller'da DOM'un verdiği adres çoğu zaman kare bir önizleme ya da
    // ölçeklenmiş türev; yetkili kaynak medyanın KENDİ içerik sayfası. Önce o
    // çözülüp sonuçlar DOM adreslerinin önüne konuyor — background.js
    // (`[...scrolllerUrls, ...message.urls]`) ve Swift `Downloader` da tam
    // olarak bunu yapıyor. Bu yapı anahtarı hiç okumadığı için "akışta video
    // inmiyor" / "tam ekranda görsel inmiyor" ikilisi burada sürüyordu.
    //
    // Yalnız tek indirmede: toplu indirmede her adres ayrı bir dosya, çözülen
    // adresleri eklemek aynı medyayı ikilerdi (Swift tarafındaki koşulun aynısı).
    //
    // `fallbackSourceUrl`'e genişletilemez: o yalnız adres çubuğu, çözmek
    // Reddit galerisinde seçilen karenin yerine gönderinin ilk görselini
    // indirmek olurdu. Bkz. debug-notes/parite.md.
    let resolved = [];
    if (message.scrolllerSourceUrl && !message.downloadAll && globalThis.RG_SCROLLLER) {
      showPanel({ msg: "Kaynak sayfa çözülüyor…", progress: null, ready: false, failed: false });
      resolved = await globalThis.RG_SCROLLLER.resolveMediaViaScrolller(message.scrolllerSourceUrl);
    }

    const urls = [...new Set([...resolved, ...(message.urls || [])]
      .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)))];
    if (!urls.length) {
      showPanel({ msg: "İndirilecek URL bulunamadı.", progress: null, ready: false });
      return { ok: false, error: "IOS01: indirilecek URL yok" };
    }

    if (message.downloadAll) {
      let saved = 0;
      // Toplu indirmede ad tek tek adresten gelir; `namingUrl` burada
      // uygulanırsa bütün dosyalar aynı adı alır (background.js de bu dalda
      // adresin kendisini geçiyor).
      for (const url of urls) {
        try {
          enqueue(await prepare(url, site, wantImage));
          saved += 1;
        } catch (error) {
          errors.push(`${url}: ${error && error.message || error}`);
        }
      }
      if (saved) return { ok: true, mode: "queued", count: saved };
      return failAll(urls, errors);
    }

    // Single-item mode: the candidate list is ordered best-first, so stop at the
    // first URL that actually delivers bytes of the right kind.
    for (const [index, url] of urls.entries()) {
      // content-coomer.js asks for a short leash on its preferred candidate so a
      // stalling CDN hands over to the already-loaded thumbnail instead of
      // blocking. Only meaningful while something is still queued behind it.
      const hasFallback = index < urls.length - 1;
      const firstByteTimeoutMs = hasFallback && message.fallbackOnNoTransfer
        ? Number(message.transferTimeoutMs) || 2500
        : 0;
      try {
        enqueue(await prepare(url, site, wantImage, { firstByteTimeoutMs, namingUrl }), { autoShare: true });
        // The download tap's activation may still be alive; if it is, this
        // reaches the share sheet with no second tap.
        await saveHead({ auto: true });
        return { ok: true, mode: wantImage ? "image" : "media", url };
      } catch (error) {
        errors.push(`${url}: ${error && error.message || error}`);
      }
    }
    return failAll(urls, errors);
  }

  function failAll(urls, errors) {
    const detail = `IOS02 hiçbir aday indirilemedi (${errors.length}/${urls.length})`;
    showPanel({
      name: "",
      msg: `${detail}. "Yeni sekmede aç" ile deneyip medyaya basılı tutarak kaydedebilirsin.`,
      progress: null,
      ready: false,
      failed: true
    });
    fallbackUrl = urls[urls.length - 1];
    return { ok: false, error: `${detail}: ${errors.join(" | ")}` };
  }

  function handle(message) {
    if (!message || typeof message !== "object") return null;

    if (message.type === "DIRECT_DOWNLOAD") return handleDirectDownload(message);

    if (message.type === "OPEN_TAB") {
      window.open(message.url, "_blank", "noopener");
      return Promise.resolve({ ok: true });
    }

    if (message.type === "START_RIPSNIP") {
      // Ripsnip drives a second tab from the background worker; there is no
      // worker here, and the flow is unusable on a phone regardless.
      showPanel({ name: "", msg: "Ripsnip yedeği iOS sürümünde yok. Doğrudan indirmeyi kullan.", progress: null, ready: false });
      return Promise.resolve({ ok: false, error: "IOS03: Ripsnip iOS'ta desteklenmiyor" });
    }

    return Promise.resolve({ ok: false, error: `IOS04: desteklenmeyen mesaj (${message.type})` });
  }

  function installMessagePatch() {
    const patched = function sendMessage(...args) {
      // Collapse the (extensionId, message, options, callback) overloads down to
      // the (message, callback) shape the site handlers actually use.
      const callback = args.find((arg) => typeof arg === "function") || null;
      const message = typeof args[0] === "string" && args.length > 1 ? args[1] : args[0];

      const result = handle(message) || Promise.resolve({ ok: false, error: "IOS05: mesaj işlenemedi" });
      const settled = result.catch((error) => ({ ok: false, error: String(error && error.message || error) }));

      if (callback) {
        settled.then((response) => {
          try {
            callback(response);
          } catch {
            // A throwing handler callback must not break the save pipeline.
          }
        });
        return undefined;
      }
      return settled;
    };

    try {
      api.runtime.sendMessage = patched;
    } catch {
      try {
        Object.defineProperty(api.runtime, "sendMessage", { value: patched, writable: true, configurable: true });
      } catch {
        // Nothing else to try; the handlers' own error paths will surface it.
      }
    }
  }

  /* --------------------------------------------------------------- shadow ui */

  // Scrolller builds its controls inside shadow roots, so ios-mobile.css cannot
  // reach them from the manifest. The same touch overrides are pushed in here.
  // Every other handler works in the light DOM and is covered by the stylesheet.
  const SHADOW_HOSTS = ["rg-scrolller-v2-host", "rg-scrolller-card-buttons"];
  const SHADOW_STYLE_ID = "rg-ios-shadow-css";
  // min-* rather than width/height: the card buttons are 38px and need to grow,
  // but the main control is already 52px and must not shrink to match.
  const SHADOW_CSS = `
    button {
      min-width: 44px !important;
      min-height: 44px !important;
      touch-action: manipulation !important;
      -webkit-tap-highlight-color: transparent !important;
    }
  `;

  function styleShadowUi() {
    const patch = () => {
      for (const id of SHADOW_HOSTS) {
        const root = document.getElementById(id)?.shadowRoot;
        if (!root || root.getElementById(SHADOW_STYLE_ID)) continue;
        const style = document.createElement("style");
        style.id = SHADOW_STYLE_ID;
        style.textContent = SHADOW_CSS;
        root.appendChild(style);
      }
    };
    patch();
    // The handler recreates its hosts whenever Scrolller rebuilds the page.
    try {
      new MutationObserver(patch).observe(document.documentElement, { childList: true });
    } catch {
      // No observer: the buttons still work, they are just the desktop size.
    }
  }

  /* ------------------------------------------------------------------- setup */

  // MV2 has no content_scripts "world": "MAIN", so the RedGifs clipboard hook is
  // injected here instead of from the manifest, which keeps both builds equal.
  function injectRedgifsPageHook() {
    if (!/(^|\.)redgifs\.com$/i.test(location.hostname)) return;
    try {
      const script = document.createElement("script");
      script.src = api.runtime.getURL("page-hook-redgifs.js");
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch {
      // content-redgifs.js has a visible-clipboard fallback for this.
    }
  }

  installStoragePolyfill();
  forceMobileSettingsOnRead();
  installMessagePatch();
  styleShadowUi();
  injectRedgifsPageHook();
})();
