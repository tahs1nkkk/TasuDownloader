"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { root, catalog } = require("./lib/shared-build.js");

// Real extension documents/storage, synthetic tab pixels only. No user browser,
// live media, external requests, production credentials or Downloads writes.
async function run() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tasu-popup-ui-"));
  const output = path.join(root, "dist", "popup-preview");
  fs.mkdirSync(output, { recursive: true });
  let context;
  const errors = [], externalRequests = [];
  try {
    const extension = path.join(root, "edge-extension");
    context = await chromium.launchPersistentContext(path.join(scratch, "profile"), {
      channel: "chromium", headless: true, viewport: { width: 416, height: 600 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith("chrome-extension:")) return route.continue();
      externalRequests.push(url);
      return route.abort();
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).hostname;
    const url = `chrome-extension://${id}/popup.html`;
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__ui = { captures: 0, scans: 0, reloads: 0 };
      const originalQuery = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = (query, callback) => {
        if (!query.active) { window.__ui.scans++; return originalQuery(query, callback); }
        const tabs = [{ id: 900, active: true, windowId: 1, width: 1280, url: "https://scrolller.com/" }];
        if (callback) { callback(tabs); return; }
        return Promise.resolve(tabs);
      };
      chrome.runtime.reload = () => { window.__ui.reloads++; };
      chrome.tabs.captureVisibleTab = async () => {
        window.__ui.captures++;
        if (sessionStorage.getItem("captureFailure")) throw new Error("Synthetic missing action grant");
        const canvas = document.createElement("canvas");
        canvas.width = 1280; canvas.height = 800;
        const ctx = canvas.getContext("2d");
        const gradient = ctx.createLinearGradient(900, 0, 1150, 600);
        gradient.addColorStop(0, "#abb6e5"); gradient.addColorStop(.5, "#d5c7dc"); gradient.addColorStop(1, "#9dd0c9");
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 800);
        ctx.fillStyle = "#698aab"; ctx.fillRect(1120, 160, 80, 160);
        ctx.fillStyle = "#eadbc6"; ctx.fillRect(860, 380, 200, 140);
        return canvas.toDataURL("image/jpeg");
      };
    });
    async function ready() {
      await page.waitForFunction(() => document.documentElement.dataset.popupReady === "true");
      await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
    }
    async function home() { await page.locator(".brand").click(); }
    async function screen(name) {
      await home();
      await page.locator(name === "settings" ? "#openSettings" : `[data-screen="home"] [data-route="${name}"]`).click();
      await page.locator(`[data-screen="${name}"]:not([hidden])`).waitFor();
    }
    await page.goto(url);
    await ready();
    await page.waitForFunction(() => document.getElementById("glassBackdrop").dataset.state === "captured");
    assert.equal(await page.locator('[data-screen="home"] details, [data-screen="home"] summary').count(), 0, "Home navigation remains tile-based");
    assert.equal(await page.locator(".site-tile").count(), catalog.forPlatform("edge").length);
    assert.equal(await page.evaluate(() => window.__ui.scans), 0, "Duplicate tab scanning is lazy");
    assert.equal(await page.evaluate(() => window.__ui.captures), 1);
    assert.equal(await page.locator(".screen:not([hidden])").count(), 1);
    assert.equal(await page.locator("#homeStatus").textContent(), "Scrolller sekmesi açık");
    await page.screenshot({ animations: "disabled", path: path.join(output, "home.png") });
    assert.ok(await page.evaluate(() => {
      const el = document.getElementById("screenScroller");
      return el.scrollHeight <= el.clientHeight;
    }), "The home view fits the popup without scrolling");

    const tile = page.locator('.site-tile[data-route="scrolller"]');
    const surface = () => tile.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(await page.locator(".site-grid").evaluate(el => getComputedStyle(el).gap), "0px");
    assert.equal(await page.locator(".tool-grid").evaluate(el => getComputedStyle(el).gap), "0px");
    assert.ok(await tile.locator(".site-blur").evaluate(el => getComputedStyle(el).filter.includes("blur")));
    const whiteBefore = await surface();
    const neighbour = await page.locator('.site-tile[data-route="coomer"]').boundingBox();
    await tile.hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.site-tile[data-route="scrolller"] .site-label')).opacity === "1");
    assert.equal(await surface(), whiteBefore, "Hover must not whiten the button");
    assert.deepEqual(await page.locator('.site-tile[data-route="coomer"]').boundingBox(), neighbour, "Expansion must not push neighbours");
    await page.screenshot({ animations: "disabled", path: path.join(output, "home-hover.png") });
    assert.equal(await tile.locator(".site-blur").evaluate(el => getComputedStyle(el).opacity), "0");
    assert.equal(await tile.locator(".site-logo").evaluate(el => getComputedStyle(el).opacity), "1");
    await page.locator(".brand").hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.site-tile[data-route="scrolller"] .site-label')).opacity === "0");
    assert.equal(await tile.locator(".site-logo").evaluate(el => getComputedStyle(el).opacity), "0");
    const tool = page.locator('.tool-tile[data-route="archive"]');
    await tool.hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.tool-tile[data-route="archive"] > span:last-child')).opacity === "1");
    assert.notEqual(await tool.locator(".tool-icon").evaluate(el => getComputedStyle(el).transform), "none");
    await page.screenshot({ animations: "disabled", path: path.join(output, "tools-hover.png") });
    await tile.click();
    assert.equal(await page.locator('.screen:not([hidden])').getAttribute("data-screen"), "scrolller");
    await page.locator('[data-setting="scrolllerButtons"]').uncheck();
    await page.waitForFunction(async () => (await chrome.storage.local.get("tasuDownloaderSettings")).tasuDownloaderSettings.scrolllerButtons === false);
    await page.screenshot({ animations: "disabled", path: path.join(output, "scrolller.png") });

    for (const site of catalog.forPlatform("edge")) {
      await screen(site.id);
      assert.equal(await page.locator(`.screen:not([hidden]) h1`).textContent(), site.name);
    }
    await screen("archive");
    await page.locator('[data-setting="cloudBase"]').fill("https://archive.example.test");
    await page.locator('[data-setting="cloudToken"]').fill("synthetic-private-key");
    await page.locator('[data-setting="cloudToken"]').press("Tab");
    await page.waitForFunction(async () => (await chrome.storage.local.get("tasuDownloaderSettings")).tasuDownloaderSettings.cloudToken === "synthetic-private-key");
    await page.locator("#screenScroller").evaluate((el) => { el.scrollTop = 0; });
    await page.screenshot({ animations: "disabled", path: path.join(output, "archive.png") });
    for (const tool of ["downloads", "duplicates", "debug"]) await screen(tool);
    assert.equal(await page.locator("#openQuickGallery").count(),0);
    assert.ok(await page.evaluate(() => window.__ui.scans >= 1));

    await screen("settings");
    assert.equal(await page.locator('[data-screen="settings"] [data-setting="cloudToken"]').count(), 0);
    assert.equal(await page.locator('[data-screen="settings"] [data-setting="scrolllerButtons"]').count(), 0);
    await page.screenshot({ animations: "disabled", path: path.join(output, "settings.png") });
    const header = await page.locator(".topbar").boundingBox();
    await page.locator("#screenScroller").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    assert.deepEqual(await page.locator(".topbar").boundingBox(), header, "Header must not scroll");
    assert.ok(await page.locator("#screenScroller").evaluate((el) => el.scrollTop > 100));
    await page.locator("#folderNew").fill("UI test folder");
    await page.locator("#folderAdd").click();
    await page.waitForFunction(async () => (await chrome.storage.local.get("tasuDownloaderSettings")).tasuDownloaderSettings.mediaFolders?.includes("UI test folder"));
    await page.locator("#reset").click();
    await page.locator('#settingsStatus[data-level="done"]').waitFor();
    const stored = await page.evaluate(() => chrome.storage.local.get("tasuDownloaderSettings"));
    assert.equal(stored.tasuDownloaderSettings.cloudToken, "synthetic-private-key", "Reset preserves credentials");
    assert.equal(stored.tasuDownloaderSettings.scrolllerButtons, false, "Reset preserves site preferences");
    assert.deepEqual(stored.tasuDownloaderSettings.mediaFolders, []);

    // Two same-tick changes must survive the asynchronous read/modify/write path.
    await page.evaluate(() => {
      for (const [key, value] of [["folderLayout", "legacy"], ["buttonVisibility", "always"]]) {
        const control = document.querySelector(`[data-setting="${key}"]`);
        control.value = value;
        control.dispatchEvent(new Event("change"));
      }
    });
    await page.waitForFunction(async () => {
      const s = (await chrome.storage.local.get("tasuDownloaderSettings")).tasuDownloaderSettings;
      return s.folderLayout === "legacy" && s.buttonVisibility === "always";
    });

    await page.locator("#glassEnabled").uncheck();
    assert.equal(await page.locator("#glassBackdrop").getAttribute("data-state"), "disabled");
    await page.waitForFunction(async () => (await chrome.storage.local.get("tasuPopupPreferences")).tasuPopupPreferences.glassEnabled === false);
    assert.equal(await page.locator("#glassBackdrop").evaluate((el) => el.style.backgroundImage), "");
    await page.reload(); await ready();
    assert.equal(await page.evaluate(() => window.__ui.captures), 0, "Opt-out prevents capture on next open");
    await screen("settings");
    await page.locator("#glassEnabled").check();
    await page.waitForFunction(() => document.getElementById("glassBackdrop").dataset.state === "captured");
    await screen("archive"); await home();
    assert.equal(await page.evaluate(() => window.__ui.captures), 1, "Navigation never recaptures");

    const allStorage = await page.evaluate(() => chrome.storage.local.get(null));
    assert.equal(JSON.stringify(allStorage).includes("data:image"), false, "Pixels never enter storage");
    await page.evaluate(() => sessionStorage.setItem("captureFailure", "yes"));
    await page.reload(); await ready();
    await page.waitForFunction(() => window.__ui.captures === 1);
    assert.equal(await page.locator("#glassBackdrop").getAttribute("data-state"), "fallback");
    await page.screenshot({ animations: "disabled", path: path.join(output, "fallback.png") });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await tile.focus();
    assert.equal(await tile.evaluate((el) => getComputedStyle(el).transitionDuration), "0s");
    assert.equal(await tile.locator(".site-label").evaluate((el) => getComputedStyle(el).opacity), "1", "Keyboard focus reveals names");
    await tile.press("Enter");
    await page.keyboard.press("Alt+ArrowLeft");
    assert.equal(await page.locator(".screen:not([hidden])").getAttribute("data-screen"), "home");
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    await page.locator(".brand").focus();
    assert.equal(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), true);
    assert.equal(await page.locator('.site-tile[data-route="instagram"] .site-label').evaluate((el) => getComputedStyle(el).opacity), "1", "Touch users can see site names without hover");
    await cdp.detach();
    await page.locator("#reloadExtension").click();
    await page.waitForFunction(() => window.__ui.reloads === 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, [], "The popup must not make any remote asset or screenshot requests");
    console.log("Popup UI checks passed: all screens, bundled icons, hover, fixed header, saved controls, private glass opt-out/fallback, scoped reset, keyboard, reduced motion and reload.");
    console.log(`Synthetic preview screenshots: ${output}`);
  } finally {
    if (context) await context.close();
    // Exact disposable directory created by this test, never a browser/user root.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
