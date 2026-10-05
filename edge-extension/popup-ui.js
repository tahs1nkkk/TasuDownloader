"use strict";

// Popup-only presentation. No shared downloader or native settings are changed.
(() => {
  const PREFS_KEY = "tasuPopupPreferences";
  const sites = globalThis.RG_SITES.forPlatform("edge");
  const icons = { redgifs: "redgifs.png", reddit: "reddit.png", scrolller: "scrolller.png", coomer: "coomer.svg", onlyfans: "onlyfans.png", instagram: "instagram.webp" };
  const screens = [...document.querySelectorAll("[data-screen]")];
  const scroller = document.getElementById("screenScroller");
  let route = "home";
  let lastHomeTrigger = null;
  let glassEnabled = true;
  let captureAttempted = false;
  let capturedBackground = "";
  let prefsRevision = 0;

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(svg.namespaceURI, "use");
    use.setAttribute("href", `assets/menu-icons.svg#${name}`);
    svg.append(use);
    return svg;
  }

  function logo(site) {
    const wrapper = document.createElement("span");
    wrapper.className = "site-logo";
    const image = document.createElement("img");
    image.src = `assets/sites/${icons[site.id]}`;
    image.alt = "";
    image.width = image.height = 50;
    image.addEventListener("error", () => { wrapper.textContent = site.name.slice(0, 2); }, { once: true });
    wrapper.append(image);
    return wrapper;
  }

  function showScreen(next, focus = true) {
    const screen = screens.find((item) => item.dataset.screen === next);
    if (!screen) return;
    route = next;
    document.getElementById("popupStatus").hidden = true;
    for (const item of screens) item.hidden = item !== screen;
    scroller.scrollTop = 0;
    document.getElementById("openSettings").setAttribute("aria-current", next === "settings" ? "page" : "false");
    if (focus) {
      const target = next === "home" && lastHomeTrigger ? lastHomeTrigger : screen.querySelector("h1");
      target?.focus({ preventScroll: true });
    }
    document.dispatchEvent(new CustomEvent("popup:navigate", { detail: { screen: next } }));
  }

  function showError(message) {
    if (globalThis.RG_UI) { globalThis.RG_UI.toast(message, "error"); return; }
    const status = document.getElementById("popupStatus");
    status.textContent = message;
    status.hidden = false;
  }

  for (const site of sites) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "site-tile";
    tile.dataset.route = site.id;
    tile.setAttribute("aria-label", `${site.name} ayarları`);
    const label = document.createElement("span");
    label.className = "site-label";
    const title = document.createElement("strong");
    title.textContent = site.name;
    const hint = document.createElement("small");
    hint.textContent = "Ayarları aç →";
    label.append(title, hint);
    tile.append(logo(site), label);
    const blurred = document.createElement("img");
    blurred.className = "site-blur";
    blurred.src = `assets/sites/${icons[site.id]}`;
    blurred.alt = "";
    blurred.setAttribute("aria-hidden", "true");
    tile.prepend(blurred);
    document.getElementById("siteGrid").append(tile);

    const heading = document.querySelector(`[data-site-heading="${site.id}"]`);
    const identity = document.createElement("div");
    identity.className = "site-identity";
    const text = document.createElement("div");
    const h1 = document.createElement("h1");
    h1.tabIndex = -1;
    h1.textContent = site.name;
    const domain = document.createElement("p");
    domain.textContent = site.domain;
    text.append(h1, domain);
    identity.append(logo(site), text);
    const open = document.createElement("button");
    open.type = "button";
    open.className = "site-open";
    open.append("Siteyi aç", icon("external"));
    open.addEventListener("click", () => {
      chrome.tabs.create({ url: site.url }).catch(() => showError("Site açılamadı. Yeniden dene."));
    });
    heading.append(identity, open);
  }
  document.getElementById("siteCount").textContent = `${sites.length} BAĞLANTI`;

  for (const screen of screens.filter((item) => item.dataset.screen !== "home")) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "back-button";
    back.dataset.route = "home";
    back.append(icon("back"), "Ana sayfa");
    screen.prepend(back);
  }
  for (const select of document.querySelectorAll("[data-bandwidth]")) {
    for (const speed of [0, 1, 2, 5, 10, 20, 50, 100, 200, 500]) {
      select.add(new Option(speed ? `${speed} Mbps` : "Sınırsız", String(speed)));
    }
  }
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-route]");
    if (!trigger) return;
    if (route === "home") lastHomeTrigger = trigger;
    showScreen(trigger.dataset.route);
  });
  document.addEventListener("keydown", (event) => {
    if (route !== "home" && event.altKey && event.key === "ArrowLeft") {
      event.preventDefault();
      showScreen("home");
    }
  });
  document.getElementById("reloadExtension").addEventListener("click", () => document.dispatchEvent(new Event("popup:reload")));

  function applyBackground() {
    const backdrop = document.getElementById("glassBackdrop");
    backdrop.style.backgroundImage = glassEnabled && capturedBackground ? `url("${capturedBackground}")` : "";
    backdrop.dataset.state = !glassEnabled ? "disabled" : capturedBackground ? "captured" : "fallback";
  }

  // Native action popups cannot blur pixels in the separate tab window. Capture
  // ONCE per popup lifetime, downsample/blur once, and retain only the blurred
  // small image in this document. No timer, disk, storage, telemetry or upload.
  async function captureBackground(tab) {
    if (!glassEnabled || captureAttempted || !tab || !tab.active || tab.incognito || !/^https?:\/\//i.test(tab.url || "")) return;
    captureAttempted = true;
    let image;
    let canvas;
    try {
      let data = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 35 });
      if (!glassEnabled) return;
      image = new Image();
      image.src = data;
      data = "";
      await image.decode();
      if (!glassEnabled) return;
      canvas = document.createElement("canvas");
      canvas.width = 208;
      canvas.height = 300;
      const ctx = canvas.getContext("2d");
      // Sample the top-right tab area, where the toolbar popup normally opens.
      const scale = Math.max(1, image.naturalWidth / Math.max(1, tab.width || image.naturalWidth));
      const sw = Math.min(image.naturalWidth, 416 * scale);
      const sh = Math.min(image.naturalHeight, 600 * scale);
      ctx.fillStyle = "#e6eaf3";
      ctx.fillRect(0, 0, 208, 300);
      ctx.filter = "blur(13px)";
      ctx.drawImage(image, Math.max(0, image.naturalWidth - sw), 0, sw, sh, -20, -20, 248, 340);
      capturedBackground = canvas.toDataURL("image/jpeg", .65);
    } catch {
      // Restricted pages, missing action grants and capture failures use the
      // built-in glass gradient. Never ask for broader host permissions.
    } finally {
      if (image) image.src = "";
      if (canvas) canvas.width = canvas.height = 0;
      applyBackground();
    }
  }

  let active = null;
  const glassControl = document.getElementById("glassEnabled");
  glassControl.addEventListener("change", () => {
    prefsRevision++;
    glassEnabled = glassControl.checked;
    if (!glassEnabled) capturedBackground = "";
    applyBackground();
    const nextGlass = glassEnabled;
    chrome.storage.local.get(PREFS_KEY).then(stored => chrome.storage.local.set({ [PREFS_KEY]: { ...stored[PREFS_KEY], glassEnabled: nextGlass } })).catch(() => showError("Görünüm tercihi kaydedilemedi."));
    // If disabled after a capture, re-enabling waits until the next popup open.
    if (glassEnabled && captureAttempted && !capturedBackground) {
      const status = document.getElementById("settingsStatus");
      status.textContent = "Cam arka plan için menüyü kapatıp yeniden açabilirsin.";
      status.dataset.level = "idle";
    }
    void captureBackground(active);
  });
  window.addEventListener("pagehide", () => {
    glassEnabled = false;
    capturedBackground = "";
    applyBackground();
  }, { once: true });

  async function initPresentation() {
    try {
      const revision = prefsRevision;
      const source = new URLSearchParams(location.search).get("tasuTab");
      const tabQuery = /^\d+$/.test(source||"") ? chrome.tabs.get(Number(source)).then(t=>[t]).catch(()=>[]) : chrome.tabs.query({ active: true, currentWindow: true });
      const [stored, tabs] = await Promise.all([chrome.storage.local.get(PREFS_KEY), tabQuery]);
      active = tabs[0] || null;
      if (revision === prefsRevision) glassEnabled = stored[PREFS_KEY]?.glassEnabled !== false;
      glassControl.checked = glassEnabled;
      const site = globalThis.RG_SITES.fromUrl(active?.url);
      if (site) {
        const tile = document.querySelector(`.site-tile[data-route="${site.id}"]`);
        const dot = document.createElement("span");
        dot.className = "active-dot";
        dot.setAttribute("aria-hidden", "true");
        tile?.append(dot);
        document.getElementById("homeStatus").textContent = `${site.name} sekmesi açık`;
      }
      applyBackground();
      void captureBackground(active);
    } catch { applyBackground(); }
  }
  showScreen("home", false);
  void initPresentation();
})();
