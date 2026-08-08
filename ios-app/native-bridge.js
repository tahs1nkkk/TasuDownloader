/*
 * Native bridge for the TasuDownloader iOS app's in-app browser.
 *
 * Plays the role ios-bridge.js plays in the Orion build, but instead of
 * answering messages in JS it forwards them to the app over
 * webkit.messageHandlers.rgNative (the WithReply variant, so postMessage
 * returns a promise). The native side downloads with URLSession and saves
 * straight into Photos — no share sheet, no second tap.
 *
 * The site handlers are the same files the Edge extension ships; they cannot
 * tell the difference. Keep this file the only place that knows it is inside
 * an app.
 */
(() => {
  "use strict";

  if (globalThis.__rgNativeBridgeLoaded) return;
  globalThis.__rgNativeBridgeLoaded = true;

  const VERSION = "__RG_VERSION__";

  function post(payload) {
    let target = null;
    try {
      target = window.webkit.messageHandlers.rgNative;
    } catch {
      target = null;
    }
    if (!target) return Promise.reject(new Error("NO_NATIVE_BRIDGE"));
    try {
      return Promise.resolve(target.postMessage(payload));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /* ---------------------------------------------------------------- chrome.* */

  const runtime = {
    // Handlers guard their download path with `chrome.runtime.id` and throw
    // "Eklenti güncellendi" (extension reloaded) when it is missing. In the app
    // the bridge is always live, so give it a stable id or every handler-routed
    // download fails with that error (Instagram especially).
    id: "tasu-native-bridge",
    lastError: undefined,
    getURL: (path) => String(path || ""),
    getManifest: () => ({ version: VERSION }),
    onMessage: { addListener() {}, removeListener() {} },
    sendMessage(message, callback) {
      const pending = post({ kind: "message", message: message || {} });
      if (typeof callback !== "function") return pending;
      pending
        .then((result) => {
          runtime.lastError = undefined;
          callback(result);
        })
        .catch((error) => {
          // Handlers read chrome.runtime.lastError inside the callback, so it
          // has to be set before and cleared after, extension-style.
          runtime.lastError = { message: String((error && error.message) || error) };
          try {
            callback(undefined);
          } finally {
            runtime.lastError = undefined;
          }
        });
    }
  };

  const changeListeners = new Set();

  const local = {
    get(keys, callback) {
      const pending = post({ kind: "storageGet", keys: keys === undefined ? null : keys }).then((r) => r || {});
      if (typeof callback !== "function") return pending;
      pending.then((r) => callback(r)).catch(() => callback({}));
    },
    set(items, callback) {
      const pending = post({ kind: "storageSet", items: items || {} }).then(() => {});
      if (typeof callback !== "function") return pending;
      pending.then(() => callback()).catch(() => callback());
    },
    remove(keys, callback) {
      const pending = post({ kind: "storageRemove", keys: keys === undefined ? null : keys }).then(() => {});
      if (typeof callback !== "function") return pending;
      pending.then(() => callback()).catch(() => callback());
    }
  };

  // The native settings screen calls this after every change so handlers that
  // subscribed to chrome.storage.onChanged restyle themselves live.
  window.__rgNativeSettingsChanged = (newValue) => {
    const changes = { tasuDownloaderSettings: { newValue: newValue || {} } };
    for (const listener of [...changeListeners]) {
      try {
        listener(changes, "local");
      } catch {
        // One broken listener must not stop the rest.
      }
    }
  };

  const api = {
    runtime,
    storage: {
      local,
      onChanged: {
        addListener: (fn) => changeListeners.add(fn),
        removeListener: (fn) => changeListeners.delete(fn)
      }
    }
  };
  globalThis.chrome = api;
  globalThis.browser = api;

  /* -------------------------------------------------------------- mobile css */

  // Same overrides the Orion build loads from its manifest, embedded by the
  // generator. Injected at documentStart so buttons never flash hidden.
  const MOBILE_CSS = __RG_CSS__;

  function injectCss() {
    if (document.getElementById("rg-ios-app-css")) return;
    const style = document.createElement("style");
    style.id = "rg-ios-app-css";
    style.textContent = MOBILE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }
  injectCss();
  document.addEventListener("DOMContentLoaded", injectCss);

  /* --------------------------------------------------------------- shadow ui */

  // Scrolller builds its controls inside shadow roots the stylesheet cannot
  // cross, so the touch overrides are pushed in from here (ported unchanged
  // from the Orion bridge).
  const SHADOW_HOSTS = ["rg-scrolller-v2-host"];
  const SHADOW_STYLE_ID = "rg-ios-shadow-css";
  const SHADOW_CSS = `
    /* Handler butonu uygulamada görünmemeli — ama üretilen stil sayfasındaki
       "#rg-scrolller-v2-host { opacity: 0 !important }" kuralı ona hiç
       işlemiyordu: handler kendi gölge ağacında ":host { all: initial !important }"
       tanımlıyor ve CSS Scoping'e göre important bildirimlerde İÇ ağaç dışı
       yener. "all", opacity dahil her özelliği sıfırladığı için buton geri
       geliyordu ("ekranda hala fazladan indirme butonu duruyor"). Tek çare aynı
       gölge ağacına, o kuraldan SONRA yazmak.
       display:none değil opacity:0 — native FAB medyayı geometriyle eşleştirip
       bu butonu "URL çözücü" olarak tıklıyor; kutusu ölçülebilir kalmalı. */
    :host {
      opacity: 0 !important;
      pointer-events: none !important;
    }
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
    // Host'u handler ekliyor ve <body> içine koyuyor; documentElement'i
    // subtree'siz izlemek yalnız <html>'in doğrudan çocuklarını görür, yani bu
    // stil pratikte hiç uygulanmıyordu. Subtree açık, ama her mutasyonda değil:
    // Scrolller akışı çok mutasyon üretir, kare başına bir kez yeter.
    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; patch(); });
    };
    try {
      new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    } catch {
      // No observer: the buttons still work, just at desktop size.
    }
  }
  styleShadowUi();

  /* -------------------------------------------------------------- fab helper */

  // The handlers still build their buttons — the app just never shows them (see
  // the opacity rule in the generated CSS). They stay useful as *resolvers*: a
  // handler button knows the real source URL behind a thumbnail, which a raw
  // <video>/<img> src often is not. So the flow is media-first: find the media
  // the user is looking at, then hand off to the handler button covering it,
  // and only download the element's own src when no handler claims it.
  const BUTTON_SELECTOR = __RG_BUTTONS__;

  function onScreen(rect) {
    return rect.width >= 56 && rect.height >= 56
      && rect.bottom > 0 && rect.top < innerHeight
      && rect.right > 0 && rect.left < innerWidth;
  }

  function clickTarget(el) {
    // Scrolller's controls live in a shadow root; the element matched by the
    // selector is the host, and clicking a host does nothing.
    const inner = el.shadowRoot?.querySelector("button");
    (inner || el).click();
  }

  function handlerButtons() {
    return [...document.querySelectorAll(BUTTON_SELECTOR)]
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter((b) => b.rect.width > 0 && b.rect.height > 0);
  }

  // A handler pins its button to a corner of the media it belongs to, so the
  // button's centre lands inside that media's box (allow a little slack for
  // buttons nudged just outside it).
  function buttonFor(rect, buttons) {
    let best = null;
    let bestDistance = Infinity;
    const mx = rect.left + rect.width / 2;
    const my = rect.top + rect.height / 2;
    for (const button of buttons) {
      const bx = button.rect.left + button.rect.width / 2;
      const by = button.rect.top + button.rect.height / 2;
      const inside = bx >= rect.left - 12 && bx <= rect.right + 12
        && by >= rect.top - 12 && by <= rect.bottom + 12;
      if (!inside) continue;
      const distance = Math.hypot(bx - mx, by - my);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = button.el;
      }
    }
    return best;
  }

  function candidates() {
    const buttons = handlerButtons();
    const found = [];

    for (const el of document.querySelectorAll("video")) {
      const rect = el.getBoundingClientRect();
      if (!onScreen(rect)) continue;
      const src = el.currentSrc || el.src
        || [...el.querySelectorAll("source")].map((s) => s.src).find(Boolean) || "";
      found.push({ el, rect, src, image: false, button: buttonFor(rect, buttons) });
    }

    for (const el of document.querySelectorAll("img")) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120 || !onScreen(rect)) continue;
      // A poster frame or a play-button overlay sits on top of a video that is
      // already a candidate; one entry per spot keeps the picker honest.
      if (found.some((m) => Math.abs(m.rect.left - rect.left) < 24 && Math.abs(m.rect.top - rect.top) < 24)) continue;
      found.push({
        el,
        rect,
        src: el.currentSrc || el.src || "",
        image: true,
        button: buttonFor(rect, buttons)
      });
    }

    // Media the handlers do not recognise and that has no usable src of its own
    // is noise in the picker and a dead tap in centre mode.
    return found.filter((m) => m.button || /^https?:/i.test(m.src));
  }

  // A looser on-screen test for site-vouched media: the content script already
  // guarantees these are real, downloadable, and scoped (ads/viewer filtered),
  // so we do not re-impose the 120px floor that drops small thumbnails
  // (genel.md KÖK-FAB-KAPSAM / small-image report).
  function onScreenLoose(rect) {
    return rect.width >= 24 && rect.height >= 24
      && rect.bottom > 0 && rect.top < innerHeight
      && rect.right > 0 && rect.left < innerWidth;
  }

  // KÖK-FAB-KAPSAM: prefer the site's own media list. Each content script may
  // expose window.__rgCollectMedia() returning descriptors it alone can build
  // correctly — ads filtered, viewer/fullscreen scoped, video vs. poster known,
  // and each item's permalink/title for lists. The generic DOM scan is the
  // fallback for sites that do not implement it.
  function collectMedia() {
    if (typeof window.__rgCollectMedia === "function") {
      let list = [];
      try { list = window.__rgCollectMedia() || []; } catch { list = []; }
      const buttons = handlerButtons();
      const mapped = [];
      for (const m of list) {
        const el = m && m.el;
        if (!el || !el.isConnected) continue;
        const rect = el.getBoundingClientRect();
        if (!onScreenLoose(rect)) continue;
        mapped.push({
          el,
          rect,
          src: m.src || "",
          image: m.kind ? m.kind === "image" : !!m.image,
          poster: !!m.poster,
          permalink: m.permalink || "",
          title: m.title || "",
          resolve: typeof m.resolve === "function" ? m.resolve : null,
          button: m.button || buttonFor(rect, buttons)
        });
      }
      return mapped.filter((m) => m.resolve || m.button || /^https?:/i.test(m.src));
    }
    return candidates();
  }

  function grab(media) {
    if (media.resolve) {
      try { media.resolve(); return "clicked"; } catch { /* fall through */ }
    }
    if (media.button) {
      clickTarget(media.button);
      return "clicked";
    }
    runtime.sendMessage({
      type: "DIRECT_DOWNLOAD",
      urls: [media.src],
      imageMode: media.image,
      fallbackSourceUrl: location.href
    });
    return media.image ? "image" : "video";
  }

  // The clean site name for lists, provided by the content script when it can
  // (falls back to the host). Used with the focused media's permalink.
  function cleanSiteName() {
    if (typeof window.__rgSiteName === "string" && window.__rgSiteName) return window.__rgSiteName;
    try { return location.hostname.replace(/^www\./, ""); } catch { return ""; }
  }

  // KÖK-LİSTE: the "+" button asks the page for the focused media's real
  // permalink and a clean title instead of saving the bare address-bar URL.
  window.__rgFocusedLink = () => {
    const media = centreMost(collectMedia());
    const permalink = (media && media.permalink) || "";
    const title = (media && media.title) || "";
    return {
      url: permalink || location.href,
      title: title || cleanSiteName() || document.title || ""
    };
  };

  // KÖK-LİSTE-AVATAR: the "+" also grabs the profile picture of the page you are
  // on, so a saved profile shows a real face instead of a coloured dot. The app
  // uploads it once, keeps it hidden from the archive, and shares it across
  // lists. Conservative on purpose: only when we are sure it is the *avatar*, not
  // a post image. A content script that knows its site's header markup can expose
  // window.__rgSiteAvatar (a URL string or a function returning one); otherwise
  // an Instagram *profile* page's own header image is the honest guess. Anything
  // else returns "" and the app falls back to its own resolvers (Reddit, Coomer).
  window.__rgProfileAvatar = () => {
    try {
      const own = window.__rgSiteAvatar;
      const fromSite = typeof own === "function" ? own() : (typeof own === "string" ? own : "");
      if (fromSite) return absoluteURL(fromSite);
      return instagramProfileAvatar();
    } catch { return ""; }
  };

  function absoluteURL(value) {
    try { return new URL(String(value || ""), location.href).href; } catch { return ""; }
  }

  // Only on a bare profile page ("/<kullanıcı>"): a post ("/<kullanıcı>/p/…" or
  // "/p/…") would hand back the post's picture, not the person's. The live header
  // image beats og:image, which a single-page navigation can leave stale.
  function instagramProfileAvatar() {
    if (!/(^|\.)instagram\.com$/.test(location.hostname)) return "";
    const parts = location.pathname.split("/").filter(Boolean);
    const reserved = ["p", "tv", "reel", "reels", "stories", "explore", "direct", "accounts", "s"];
    if (parts.length !== 1 || reserved.includes(parts[0])) return "";
    const header = document.querySelector("header img");
    if (header && header.src) return header.src;
    const og = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    return absoluteURL(og && og.getAttribute("content"));
  }

  // Feeds scroll vertically, so "the one I am looking at" is the one nearest the
  // middle of the screen height; horizontal distance only breaks ties in grids.
  function centreMost(list) {
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    let best = null;
    let bestScore = Infinity;
    for (const media of list) {
      const mx = media.rect.left + media.rect.width / 2;
      const my = media.rect.top + media.rect.height / 2;
      const score = Math.abs(my - cy) + Math.abs(mx - cx) * 0.25;
      if (score < bestScore) {
        bestScore = score;
        best = media;
      }
    }
    return best;
  }

  /* ------------------------------------------------------------- select mode */

  // Long-pressing the floating button enters a select mode: an overlay covers
  // the page and every on-screen media gets a frame; tapping a frame toggles it
  // (glowing yellow neon when selected). Nothing auto-dismisses — the mode ends
  // when the floating button is pressed again (download the selection) or
  // long-pressed (cancel), or via the İptal control on the bar.
  //
  // KÖK-SEÇİM-KAYDIRMA: the overlay is pointer-TRANSPARENT. An earlier version
  // took the taps itself (pointer-events:auto + touch-action:pan-y), which meant
  // the finger landed on a fixed layer whose only scrollable ancestor is the
  // document — so anywhere the real scroller is something else (Instagram reels,
  // a DM thread, a carousel's horizontal track) the page stayed frozen and the
  // layer rubber-banded instead. Now the touch reaches whatever is actually
  // under it and iOS scrolls it natively, momentum and all.
  //
  // Page taps are still swallowed, but one layer up: click/mousedown/mouseup are
  // cancelled in the capture phase, and touch scrolling never uses those. A tap
  // is recognised from pointerdown→pointerup (iOS sends pointercancel the moment
  // it takes the gesture over for scrolling, so a drag can never toggle), and
  // matched to a frame by coordinates.
  //
  // Selection survives scrolling: an entry whose element leaves the viewport
  // keeps its state with the frame hidden, and reappears on the way back. If a
  // virtualized feed unmounts the element entirely, the src captured at
  // selection time is the honest fallback.
  const PICKER_LAYER_ID = "rg-native-picker";
  let picker = null;

  function postPickerState(active, count) {
    runtime.sendMessage({ type: "PICKER_STATE", active, count });
  }

  function selectedCount() {
    let count = 0;
    for (const entry of picker.entries.values()) if (entry.selected) count += 1;
    return count;
  }

  function styleFrame(entry) {
    const { frame, media, selected } = entry;
    frame.style.left = media.rect.left + "px";
    frame.style.top = media.rect.top + "px";
    frame.style.width = media.rect.width + "px";
    frame.style.height = media.rect.height + "px";
    // Reddit#2: a selected frame glows yellow neon ("sarı neon").
    frame.style.border = selected ? "2.5px solid #ffe600" : "1.5px solid rgba(255,255,255,.5)";
    frame.style.background = selected ? "rgba(255,230,0,.10)" : "transparent";
    frame.style.boxShadow = selected
      ? "0 0 14px 3px rgba(255,230,0,.95), 0 0 40px 10px rgba(255,230,0,.5), inset 0 0 22px rgba(255,230,0,.28)"
      : "none";
  }

  function updateHint() {
    if (!picker) return;
    const count = selectedCount();
    picker.countText.textContent = count ? `${count} seçildi` : "Medyayı seç";
    postPickerState(true, count);
  }

  function toggleEntry(entry) {
    entry.selected = !entry.selected;
    styleFrame(entry);
    updateHint();
  }

  function pickerSync() {
    if (!picker) return;
    const seen = new Set();
    for (const media of collectMedia()) {
      seen.add(media.el);
      let entry = picker.entries.get(media.el);
      if (!entry) {
        const frame = document.createElement("div");
        // Purely decorative: taps are matched by coordinate (entryAt), so the
        // frame must not intercept the touch that scrolls the page.
        frame.style.cssText = [
          "position:fixed", "border-radius:12px", "pointer-events:none",
          "transition:border-color .12s, box-shadow .12s"
        ].join(";");
        const created = { el: media.el, media, selected: false, frame };
        picker.frames.appendChild(frame);
        picker.entries.set(media.el, created);
        entry = created;
      }
      entry.media = media;
      entry.frame.style.display = "";
      styleFrame(entry);
    }
    for (const [el, entry] of picker.entries) {
      if (seen.has(el)) continue;
      if (entry.selected) {
        // Off-screen but chosen: keep the choice, hide the frame.
        entry.frame.style.display = "none";
        continue;
      }
      entry.frame.remove();
      picker.entries.delete(el);
    }
  }

  function pickerOnMove() {
    if (!picker || picker.raf) return;
    picker.raf = requestAnimationFrame(() => {
      if (!picker) return;
      picker.raf = 0;
      pickerSync();
    });
  }

  // The frame under a point. The smallest match wins: a media nested inside
  // another (a carousel slide within a post) is the more specific answer.
  function entryAt(x, y) {
    let best = null;
    let bestArea = Infinity;
    for (const entry of picker.entries.values()) {
      if (entry.frame.style.display === "none") continue;
      const r = entry.media.rect;
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const area = r.width * r.height;
      if (area < bestArea) { bestArea = area; best = entry; }
    }
    return best;
  }

  // Mouse-layer events only. Touch scrolling never produces these, so cancelling
  // them stops the page navigating without costing a single pixel of scroll.
  const PICKER_GUARDED = ["click", "auxclick", "mousedown", "mouseup", "contextmenu", "dragstart"];

  function inPickerControls(target) {
    return Boolean(picker && target && picker.bar.contains(target));
  }

  // Bir <iframe>'in içine düşen dokunuş üst pencereye HİÇ ulaşmaz: pointerdown
  // ve pointerup gömülü belgede kalır, seçim modu o kareyi asla göremez. Reddit
  // gönderilerindeki RedGifs gömülüleri bu yüzden çerçeveleniyor ama seçilemiyor,
  // dokunuş gömülüye gidiyordu ("çerçeveyi algılıyor ama çerçeve seçilmiyor").
  // Seçim modu boyunca iframe'ler dokunuşa kapatılıyor: çerçeve görünür kalır,
  // dokunuş belgeye iner, eşleştirme koordinatla yapılır. Mod bitince kural
  // kalkıyor ve gömülü yeniden oynatılabilir oluyor.
  const PICKER_IFRAME_STYLE_ID = "rg-ios-picker-iframe";

  function setIframesInert(on) {
    const existing = document.getElementById(PICKER_IFRAME_STYLE_ID);
    if (!on) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const style = document.createElement("style");
    style.id = PICKER_IFRAME_STYLE_ID;
    style.textContent = "iframe { pointer-events: none !important; }";
    (document.head || document.documentElement).appendChild(style);
  }

  function pickerGuard(event) {
    if (!picker || inPickerControls(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function pickerDown(event) {
    if (!picker || inPickerControls(event.target)) return;
    picker.tap = { x: event.clientX, y: event.clientY, at: Date.now() };
  }

  function pickerUp(event) {
    if (!picker) return;
    const tap = picker.tap;
    picker.tap = null;
    if (!tap || inPickerControls(event.target)) return;
    // A drag is a scroll, not a choice.
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12) return;
    if (Date.now() - tap.at > 700) return;
    const entry = entryAt(event.clientX, event.clientY);
    if (entry) toggleEntry(entry);
  }

  function pickerDropTap() {
    if (picker) picker.tap = null;
  }

  function setDark(on) {
    if (!picker) return;
    picker.dark = on;
    picker.dim.style.background = on ? "rgba(0,0,0,.55)" : "transparent";
    picker.darkButton.textContent = on ? "Karanlık: Açık" : "Karanlık: Kapalı";
    picker.darkButton.style.background = on ? "rgba(255,230,0,.22)" : "rgba(255,255,255,.16)";
  }

  function pickerCancel() {
    if (!picker) return "cancelled";
    clearInterval(picker.timer);
    if (picker.raf) cancelAnimationFrame(picker.raf);
    removeEventListener("scroll", pickerOnMove, true);
    removeEventListener("resize", pickerOnMove, true);
    for (const type of PICKER_GUARDED) removeEventListener(type, pickerGuard, true);
    removeEventListener("pointerdown", pickerDown, true);
    removeEventListener("pointerup", pickerUp, true);
    removeEventListener("pointercancel", pickerDropTap, true);
    setIframesInert(false);
    picker.layer.remove();
    picker = null;
    postPickerState(false, 0);
    return "cancelled";
  }

  function controlButton(label) {
    const button = document.createElement("button");
    button.textContent = label;
    button.style.cssText = [
      "border:0", "border-radius:999px", "padding:7px 14px", "cursor:pointer",
      "background:rgba(255,255,255,.16)", "color:#fff", "white-space:nowrap",
      "font:600 13px/1 -apple-system,system-ui,sans-serif",
      "-webkit-tap-highlight-color:transparent"
    ].join(";");
    return button;
  }

  function pickerStart() {
    pickerCancel();
    const layer = document.createElement("div");
    layer.id = PICKER_LAYER_ID;
    // pointer-events:none is the whole point — the finger reaches the page's own
    // scroller. Only the control bar opts back in.
    layer.style.cssText = "position:fixed;inset:0;z-index:2147483600;pointer-events:none";

    const dim = document.createElement("div");
    dim.style.cssText = "position:absolute;inset:0;pointer-events:none;transition:background .15s";
    layer.appendChild(dim);

    // Frames live in their own container so the control bar (a later sibling)
    // always paints above them and never gets covered by a frame.
    const frames = document.createElement("div");
    frames.style.cssText = "position:absolute;inset:0;pointer-events:none";
    layer.appendChild(frames);

    const bar = document.createElement("div");
    bar.style.cssText = [
      "position:fixed", "top:calc(env(safe-area-inset-top, 0px) + 12px)",
      "left:50%", "transform:translateX(-50%)", "max-width:94vw", "z-index:5",
      "display:flex", "align-items:center", "gap:9px",
      "padding:8px 12px", "border-radius:999px", "pointer-events:auto",
      "background:rgba(30,30,32,.6)", "border:1px solid rgba(255,255,255,.25)",
      "-webkit-backdrop-filter:blur(18px) saturate(180%)", "backdrop-filter:blur(18px) saturate(180%)",
      "color:#fff", "font:500 13px/1.2 -apple-system,system-ui,sans-serif",
      "box-shadow:0 6px 24px rgba(0,0,0,.4)"
    ].join(";");

    const countText = document.createElement("span");
    countText.style.cssText = "padding:0 4px;min-width:56px;text-align:center";

    const cancelButton = controlButton("İptal");
    cancelButton.addEventListener("click", (event) => { event.stopPropagation(); pickerCancel(); });

    const darkButton = controlButton("Karanlık: Açık");
    darkButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (picker) setDark(!picker.dark);
    });

    bar.append(countText, darkButton, cancelButton);
    layer.appendChild(bar);

    picker = {
      layer, dim, frames, bar, countText, darkButton,
      dark: true,
      entries: new Map(),
      raf: 0,
      tap: null,
      // Scroll and resize reposition immediately; the slow tick catches DOM
      // churn (feeds inserting tiles) that fires no event at all.
      timer: setInterval(pickerSync, 700)
    };
    (document.body || document.documentElement).appendChild(layer);
    setIframesInert(true);
    for (const type of PICKER_GUARDED) addEventListener(type, pickerGuard, true);
    addEventListener("pointerdown", pickerDown, { capture: true, passive: true });
    addEventListener("pointerup", pickerUp, { capture: true, passive: true });
    addEventListener("pointercancel", pickerDropTap, { capture: true, passive: true });
    addEventListener("scroll", pickerOnMove, { capture: true, passive: true });
    addEventListener("resize", pickerOnMove, true);
    setDark(true);

    pickerSync();
    if (!picker.entries.size) {
      pickerCancel();
      return "empty";
    }
    updateHint();
    return "started";
  }

  function pickerConfirm() {
    if (!picker) return "0";
    const chosen = [...picker.entries.values()].filter((e) => e.selected).map((e) => e.media);
    pickerCancel();
    if (!chosen.length) return "0";

    // A media resolves through its own resolver first, else a handler button,
    // else its direct src. Video vs. image comes from the descriptor, not from
    // guessing at a poster (KÖK-VIDEO-POSTER).
    const actions = chosen.filter((m) => m.resolve || (m.button && m.button.isConnected));
    const direct = chosen.filter((m) => !(m.resolve || (m.button && m.button.isConnected)) && /^https?:/i.test(m.src));
    const videos = direct.filter((m) => !m.image).map((m) => m.src);
    const images = direct.filter((m) => m.image).map((m) => m.src);

    // Fire-and-forget on purpose: the caller needs the count synchronously,
    // and the native side serializes the downloads anyway. The stagger gives
    // each resolver/handler time to resolve its media before the next one.
    (async () => {
      for (const media of actions) {
        if (media.resolve) {
          try { media.resolve(); } catch { /* skip this one */ }
        } else {
          clickTarget(media.button);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (videos.length) {
        runtime.sendMessage({
          type: "DIRECT_DOWNLOAD", urls: videos, downloadAll: true, fallbackSourceUrl: location.href
        });
      }
      if (images.length) {
        runtime.sendMessage({
          type: "DIRECT_DOWNLOAD", urls: images, imageMode: true, downloadAll: true, fallbackSourceUrl: location.href
        });
      }
    })();

    return String(actions.length + videos.length + images.length);
  }

  /* ------------------------------------------------------------ entry points */

  // Short tap while browsing: take the media in the middle of the screen.
  window.__rgFabDownload = () => {
    if (picker) return "picker";
    const media = centreMost(collectMedia());
    if (media) return grab(media);

    // Pages with a single page-level button (Instagram's "download all",
    // Coomer post pages) expose no measurable media of their own.
    const fallback = handlerButtons()[0];
    if (fallback) {
      clickTarget(fallback.el);
      return "clicked";
    }
    return "none";
  };

  // Select mode, driven by the native floating button.
  window.__rgFabPicker = (op) => {
    if (op === "start") return pickerStart();
    if (op === "confirm") return pickerConfirm();
    return pickerCancel();
  };
})();
