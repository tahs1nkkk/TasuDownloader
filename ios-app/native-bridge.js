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
    const changes = { rgRipsnipSettings: { newValue: newValue || {} } };
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
  const SHADOW_HOSTS = ["rg-scrolller-v2-host", "rg-scrolller-card-buttons"];
  const SHADOW_STYLE_ID = "rg-ios-shadow-css";
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
    try {
      new MutationObserver(patch).observe(document.documentElement, { childList: true });
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

  function grab(media) {
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

  // Long-pressing the floating button enters a select mode: the page dims and
  // every candidate gets a frame; tapping a frame toggles it (glowing white
  // when selected). Nothing auto-dismisses — the mode ends when the floating
  // button is pressed again (download the selection) or long-pressed (cancel).
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
    frame.style.border = selected ? "2.5px solid #fff" : "1.5px solid rgba(255,255,255,.45)";
    frame.style.background = selected ? "rgba(255,255,255,.07)" : "transparent";
    frame.style.boxShadow = selected
      ? "0 0 14px 3px rgba(255,255,255,.95), 0 0 36px 9px rgba(255,255,255,.45), inset 0 0 20px rgba(255,255,255,.25)"
      : "none";
  }

  function updateHint() {
    if (!picker) return;
    const count = selectedCount();
    picker.hintText.textContent = count
      ? `${count} seçildi — indirme butonu başlatır`
      : "Medyaya dokunarak seç";
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
    for (const media of candidates()) {
      seen.add(media.el);
      let entry = picker.entries.get(media.el);
      if (!entry) {
        const frame = document.createElement("div");
        frame.style.cssText = [
          "position:fixed", "border-radius:12px", "pointer-events:auto",
          // pan-y lets a drag that starts on a frame still scroll the page;
          // only a clean tap toggles.
          "touch-action:pan-y", "-webkit-tap-highlight-color:transparent",
          "transition:border-color .12s, box-shadow .12s"
        ].join(";");
        const created = { el: media.el, media, selected: false, frame };
        frame.addEventListener("click", (event) => {
          event.stopPropagation();
          event.preventDefault();
          toggleEntry(created);
        });
        picker.layer.appendChild(frame);
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

  function pickerCancel() {
    if (!picker) return "cancelled";
    clearInterval(picker.timer);
    if (picker.raf) cancelAnimationFrame(picker.raf);
    removeEventListener("scroll", pickerOnMove, true);
    removeEventListener("resize", pickerOnMove, true);
    picker.layer.remove();
    picker = null;
    postPickerState(false, 0);
    return "cancelled";
  }

  function pickerStart() {
    pickerCancel();
    const layer = document.createElement("div");
    layer.id = PICKER_LAYER_ID;
    layer.style.cssText = "position:fixed;inset:0;z-index:2147483600;pointer-events:none";

    const dim = document.createElement("div");
    dim.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,.5)";
    layer.appendChild(dim);

    const hint = document.createElement("div");
    hint.style.cssText = [
      "position:fixed", "top:calc(env(safe-area-inset-top, 0px) + 12px)",
      "left:50%", "transform:translateX(-50%)", "max-width:88vw",
      "display:flex", "align-items:center", "gap:10px",
      "padding:9px 14px", "border-radius:999px", "pointer-events:auto",
      "background:rgba(30,30,32,.55)", "border:1px solid rgba(255,255,255,.25)",
      "-webkit-backdrop-filter:blur(18px) saturate(180%)", "backdrop-filter:blur(18px) saturate(180%)",
      "color:#fff", "font:500 13px/1.2 -apple-system,system-ui,sans-serif",
      "box-shadow:0 6px 24px rgba(0,0,0,.4)"
    ].join(";");
    const hintText = document.createElement("span");
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "İptal";
    cancelButton.style.cssText = [
      "border:0", "border-radius:999px", "padding:5px 11px", "cursor:pointer",
      "background:rgba(255,255,255,.18)", "color:#fff",
      "font:600 12px/1 -apple-system,system-ui,sans-serif",
      "-webkit-tap-highlight-color:transparent"
    ].join(";");
    cancelButton.addEventListener("click", pickerCancel);
    hint.append(hintText, cancelButton);
    layer.appendChild(hint);

    picker = {
      layer,
      hintText,
      entries: new Map(),
      raf: 0,
      // Scroll and resize reposition immediately; the slow tick catches DOM
      // churn (feeds inserting tiles) that fires no event at all.
      timer: setInterval(pickerSync, 700)
    };
    (document.body || document.documentElement).appendChild(layer);
    addEventListener("scroll", pickerOnMove, { capture: true, passive: true });
    addEventListener("resize", pickerOnMove, true);

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

    const clicks = chosen.filter((m) => m.button && m.button.isConnected);
    const direct = chosen.filter((m) => !(m.button && m.button.isConnected) && /^https?:/i.test(m.src));
    const videos = direct.filter((m) => !m.image).map((m) => m.src);
    const images = direct.filter((m) => m.image).map((m) => m.src);

    // Fire-and-forget on purpose: the caller needs the count synchronously,
    // and the native side serializes the downloads anyway. The stagger gives
    // each handler button time to resolve its media before the next click.
    (async () => {
      for (const media of clicks) {
        clickTarget(media.button);
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

    return String(clicks.length + videos.length + images.length);
  }

  /* ------------------------------------------------------------ entry points */

  // Short tap while browsing: take the media in the middle of the screen.
  window.__rgFabDownload = () => {
    if (picker) return "picker";
    const media = centreMost(candidates());
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
