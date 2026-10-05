"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const { readAsset, root } = require("./lib/shared-build.js");
const { validate } = require("../shared/core/download-contract.js");

// Synthetic page/media only. No live account, CDN, clipboard or download access.
async function run() {
  const browser = await chromium.launch({ headless: true });
  const errors = [], unexpected = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: false });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.hostname === "www.redgifs.com") return route.fulfill({ contentType: "text/html", body: '<!doctype html><style>body{margin:0;background:#eef3fa}.card{position:absolute;left:420px;top:170px;width:340px;height:380px}.card img,.card video{width:100%;height:100%;object-fit:cover}</style><main></main>' });
      if (url.hostname === "media.redgifs.com") return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64") });
      unexpected.push(url.href); return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__messages = []; window.__mode = "ok"; window.__downloadTimers = new Set();
      const schedule = window.setTimeout, cancel = window.clearTimeout;
      window.setTimeout = (fn, ms, ...args) => {
        const timer = schedule(() => { window.__downloadTimers.delete(timer); fn(...args); }, ms);
        if (ms === 18000) window.__downloadTimers.add(timer);
        return timer;
      };
      window.clearTimeout = timer => { window.__downloadTimers.delete(timer); cancel(timer); };
      window.chrome = {
        runtime: {
          id: "fixture", onMessage: { addListener() {} },
          sendMessage(message, callback) {
            if (message.type !== "DIRECT_DOWNLOAD") { callback?.({ ok: true }); return; }
            window.__messages.push(message);
            if (window.__mode === "invalidated") throw new Error("Extension context invalidated.");
            if (window.__mode === "disconnected") {
              chrome.runtime.lastError = { message: "Could not establish connection. Receiving end does not exist." };
              callback?.(); delete chrome.runtime.lastError; return;
            }
            callback?.(window.__mode === "bg20" ? { ok: false, error: "BG20 erişilebilir medya yok (sayfa-url:0/0 api-url:0/0)" } : { ok: true, downloadId: 42 });
          }
        },
        storage: { local: {
          get(_key, callback) { callback?.({}); return Promise.resolve({}); },
          set(_data, callback) { callback?.(); return Promise.resolve(); },
          remove(_key, callback) { callback?.(); return Promise.resolve(); }
        }, onChanged: { addListener() {} } }
      };
    });
    async function fixture(routePath, media = "image") {
      await page.goto(`https://www.redgifs.com${routePath}`);
      await page.locator("main").evaluate((el, kind) => {
        el.innerHTML = `<div class="card" data-feed-item-id="FixtureClip">${kind === "video" ? '<video src="https://media.redgifs.com/FixtureClip.mp4" preload="none"></video>' : '<img src="https://media.redgifs.com/FixtureClip-small.jpg">'}</div>`;
      }, media);
      for (const file of ["common/sites.js", "common/settings.js", "common/ui.js", "common/weblink.js", "content-folders.js", "content-redgifs.js"]) await page.addScriptTag({ content: file === "common/weblink.js" ? fs.readFileSync(path.join(root, "edge-extension", file), "utf8") : readAsset(file) });
      await page.waitForFunction(() => !!document.querySelector(".card .rg-ripsnip-tile-button"));
    }
    async function click(mode) {
      await page.evaluate(mode => { window.__mode = mode; window.__messages.length = 0; }, mode);
      await page.locator(".card").hover();
      await page.locator(".card .rg-ripsnip-tile-button").click();
      await page.waitForFunction(() => !document.querySelector(".card .rg-ripsnip-tile-button").disabled);
    }
    await fixture("/explore/gifs");
    await click("ok");
    const message = await page.evaluate(() => window.__messages[0]);
    assert.equal(validate(message).ok, true, "The actual button must send a valid download request");
    assert.equal(message.fallbackSourceUrl, "https://www.redgifs.com/watch/fixtureclip");
    assert.equal(await page.evaluate(() => window.__messages.length), 1);
    await click("invalidated");
    assert.match(await page.locator("#rg-feedback-host .toast").textContent(), /E_RELOAD.*Ctrl\+R/);
    assert.equal(await page.evaluate(() => window.__downloadTimers.size), 0, "A synchronous runtime failure must clear its deadline");
    await click("disconnected");
    assert.match(await page.locator("#rg-feedback-host .toast").textContent(), /E_CONNECTION/);
    await click("bg20");
    assert.match(await page.locator("#rg-feedback-host .toast").textContent(), /BG20/);

    await fixture("/explore/images");
    await click("ok");
    const imageMessage = await page.evaluate(() => window.__messages[0]);
    assert.equal(validate(imageMessage).ok, true);
    assert.equal(imageMessage.imageMode, true);
    assert.ok(imageMessage.urls.includes("https://media.redgifs.com/FixtureClip-small.jpg"));
    await click("invalidated");
    assert.match(await page.locator("#rg-feedback-host .toast").textContent(), /E_RELOAD/);

    // A transport failure must not trigger Share/Copy Link or retry a download.
    await fixture("/niches/FixtureNiche", "video");
    await click("invalidated");
    assert.match(await page.locator("#rg-feedback-host .toast").textContent(), /E_RELOAD/);
    assert.equal(await page.evaluate(() => window.__messages.length), 1);
    assert.equal(await page.evaluate(() => window.__downloadTimers.size), 0);

    // Explore/niche viewers keep their original route. Their video element can
    // fill the entire overlay while a portrait video is letterboxed inside it.
    await fixture("/explore/gifs", "video");
    await page.locator(".card").evaluate(el => {
      el.setAttribute("role", "dialog");
      el.style.cssText = "position:fixed;inset:40px;width:auto;height:auto";
      const video = el.querySelector("video");
      video.style.objectFit = "contain";
      Object.defineProperties(video, { videoWidth: { configurable: true, value: 720 }, videoHeight: { configurable: true, value: 1280 } });
      video.dispatchEvent(new Event("loadedmetadata"));
    });
    const viewer = page.locator("#rg-ripsnip-viewer-button");
    await viewer.waitFor({ state: "visible" });
    const r = await page.locator("video").boundingBox();
    const b = await viewer.boundingBox();
    assert.ok(Math.abs(b.x - (r.x + (r.width - r.height * 720 / 1280) / 2 + 10)) < 2, "Portrait control must use the painted video, not the viewport");
    assert.ok(Math.abs(b.y - (r.y + 10)) < 2);
    const web = await page.locator("#rg-ripsnip-viewer-web").boundingBox();
    assert.ok(Math.abs(web.x - b.x) < 2 && web.y > b.y + b.height, "Archive control must stay with its download control");
    assert.equal(await page.locator(".card .rg-ripsnip-tile-button").isVisible(), false, "No duplicate corner control behind the viewer");
    await page.locator("video").evaluate(video => { video.style.objectPosition = "right bottom"; video.dispatchEvent(new Event("resize")); });
    await page.waitForFunction(() => {
      const video = document.querySelector("video"), r = video.getBoundingClientRect(), b = document.getElementById("rg-ripsnip-viewer-button").getBoundingClientRect();
      return Math.abs(b.left - (r.right - r.height * 720 / 1280 + 10)) < 2;
    });
    // Metadata changes without DOM insertion or scrolling must reposition now.
    await page.locator("video").evaluate(video => {
      Object.defineProperties(video, { videoWidth: { configurable: true, value: 1920 }, videoHeight: { configurable: true, value: 1080 } });
      video.style.objectPosition = "50% 50%";
      video.dispatchEvent(new Event("resize"));
    });
    await page.waitForFunction(() => {
      const video = document.querySelector("video"), r = video.getBoundingClientRect(), b = document.getElementById("rg-ripsnip-viewer-button").getBoundingClientRect();
      return Math.abs(b.top - (r.top + (r.height - r.width * 1080 / 1920) / 2 + 10)) < 2;
    });
    await page.evaluate(() => {
      const toggle = document.createElement("button"); toggle.id = "fixture-fullscreen"; toggle.textContent = "Fullscreen";
      toggle.onclick = () => document.querySelector(".card").requestFullscreen(); document.body.append(toggle);
    });
    await page.locator("#fixture-fullscreen").click();
    await page.waitForFunction(() => !!document.fullscreenElement?.contains(document.getElementById("rg-ripsnip-viewer-button")));
    assert.equal(await page.evaluate(() => document.fullscreenElement.contains(document.getElementById("rg-ripsnip-viewer-web"))), true);
    assert.equal(await viewer.isVisible(), true);
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => document.getElementById("rg-ripsnip-viewer-button")?.parentElement === document.documentElement);
    // Exit the in-site viewer too: regular preview controls come back.
    await page.locator(".card").evaluate(el => { el.removeAttribute("role"); el.removeAttribute("style"); window.dispatchEvent(new Event("resize")); });
    await viewer.waitFor({ state: "hidden" });
    assert.equal(await page.locator(".card .rg-ripsnip-tile-button").isVisible(), true);
    await page.locator("#fixture-fullscreen").click();
    await page.waitForFunction(() => !!document.fullscreenElement?.contains(document.getElementById("rg-ripsnip-viewer-button")));
    await page.locator(".card").evaluate(el => el.remove());
    await page.waitForFunction(() => document.getElementById("rg-ripsnip-viewer-button")?.parentElement === document.documentElement);
    assert.equal(await viewer.count(), 1, "Removing the fullscreen wrapper must not lose or duplicate its controls");
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, []);
    console.log("RedGifs UI checks passed: video/image messages, actionable connection errors, no failed-transport retries, cleared timers, in-site and native fullscreen anchoring, portrait/landscape metadata updates and viewer exit.");
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
