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

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) return false;
    if (rect.bottom < 0 || rect.top > innerHeight) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.05;
  }

  const KNOWN_BUTTONS = [
    "#rg-ripsnip-viewer-button",
    "#rg-ripsnip-helper-button",
    "#rg-ig-one",
    ".rg-downloader-reddit-button",
    ".rg-coomer-download",
    ".rg-ripsnip-tile-button"
  ];

  // The app's floating download button asks the page what to grab. Site
  // handlers know best, so their buttons are tried first; the generic
  // biggest-media fallback covers pages without a handler.
  window.__rgFabDownload = () => {
    for (const selector of KNOWN_BUTTONS) {
      const el = [...document.querySelectorAll(selector)].find(isVisible);
      if (el) {
        el.click();
        return "clicked";
      }
    }
    const scrolller = document.getElementById("rg-scrolller-v2-host")?.shadowRoot?.querySelector("button");
    if (scrolller) {
      scrolller.click();
      return "clicked";
    }

    const videos = [...document.querySelectorAll("video")]
      .map((v) => ({
        src: v.currentSrc || v.src || [...v.querySelectorAll("source")].map((s) => s.src).find(Boolean) || "",
        rect: v.getBoundingClientRect()
      }))
      .filter((m) => /^https?:/i.test(m.src) && m.rect.width > 100 && m.rect.bottom > 0 && m.rect.top < innerHeight)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    if (videos[0]) {
      runtime.sendMessage({ type: "DIRECT_DOWNLOAD", urls: [videos[0].src], fallbackSourceUrl: location.href });
      return "video";
    }

    const images = [...document.querySelectorAll("img")]
      .map((i) => ({ src: i.currentSrc || i.src || "", rect: i.getBoundingClientRect() }))
      .filter((m) => /^https?:/i.test(m.src) && m.rect.width > 180 && m.rect.height > 180 && m.rect.bottom > 0 && m.rect.top < innerHeight)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    if (images[0]) {
      runtime.sendMessage({ type: "DIRECT_DOWNLOAD", urls: [images[0].src], imageMode: true, fallbackSourceUrl: location.href });
      return "image";
    }
    return "none";
  };
})();
