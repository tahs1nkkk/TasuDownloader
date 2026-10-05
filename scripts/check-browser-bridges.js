"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { root } = require("./lib/shared-build.js");
const { buildInfo } = require("./lib/versioning.js");

// Exercise real DOM, shadow roots and browser promises, but never contact a
// media site, open an OS share sheet or save a user's files.
const origin = "https://tasu-harness.test";
const dist = path.join(root, "dist");
const imageURL = "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64");

async function run() {
  execFileSync(process.execPath, [path.join(root, "scripts/build-orion-ios.js"), "--no-archive"], { cwd: root, stdio: "inherit" });
  execFileSync(process.execPath, [path.join(root, "scripts/build-ios-app-js.js")], { cwd: root, stdio: "inherit" });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      serviceWorkers: "block", acceptDownloads: false
    });
    const unexpectedRequests = [];
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        if (url.pathname === "/native.html") {
          return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><head></head><body>Native bridge fixture</body></html>" });
        }
        const file = path.resolve(dist, "." + decodeURIComponent(url.pathname));
        if (file.startsWith(dist + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
          const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
          return route.fulfill({ contentType: types[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
        }
      }
      if (url.hostname === "upload.wikimedia.org") {
        // Every URL in the old interactive harness is now a local fixture.
        const found = url.href === imageURL;
        return route.fulfill({
          status: found ? 200 : 404,
          headers: { "access-control-allow-origin": origin, "access-control-allow-credentials": "true" },
          contentType: found ? "image/png" : "text/plain", body: found ? png : "Fixture not found"
        });
      }
      unexpectedRequests.push(url.href);
      return route.abort();
    });

    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`${origin}/__harness.html`);
    await page.waitForFunction(() => /^\d+\/\d+ passed$/.test(document.title), null, { timeout: 30_000 });
    const failures = await page.locator("#out li.f").allTextContents();
    assert.deepEqual(failures, [], "Orion browser regressions");
    assert.deepEqual(pageErrors, [], "Orion uncaught errors");
    console.log(`Orion browser harness: ${await page.title()}`);
    await page.close();

    const native = await context.newPage();
    native.on("pageerror", (error) => pageErrors.push(error.message));
    await native.goto(`${origin}/native.html`);
    await native.evaluate(() => {
      window.__nativePosts = [];
      window.__rejectNative = false;
      window.webkit = { messageHandlers: { rgNative: { postMessage(payload) {
        window.__nativePosts.push(payload);
        if (window.__rejectNative) return Promise.reject(new Error("fixture native failure"));
        return Promise.resolve(payload.kind === "storageGet" ? {} : { ok: true });
      } } } };
    });
    await native.addScriptTag({ content: fs.readFileSync(path.join(root, "ios-app/Resources/generated/rg-core.js"), "utf8") });
    const result = await native.evaluate(async () => {
      const runtime = chrome.runtime;
      window.__nativePosts.length = 0;
      const invalid = await runtime.sendMessage({ type: "DIRECT_DOWNLOAD", urls: "not-an-array" });
      const invalidCallback = await new Promise((resolve) => runtime.sendMessage({ type: "DIRECT_DOWNLOAD", imageMode: "yes" }, resolve));
      const invalidPosts = window.__nativePosts.length;
      const message = {
        type: "DIRECT_DOWNLOAD", urls: ["https://media.example/two.mp4", "https://media.example/one.mp4"],
        site: "Reddit", fallbackSourceUrl: "https://scrolller.com/",
        scrolllerSourceUrl: "https://scrolller.com/selected-post", namingUrl: "example-hd.mp4"
      };
      const valid = await runtime.sendMessage(message);
      const validCallback = await new Promise((resolve) => runtime.sendMessage(message, resolve));
      const posts = [...window.__nativePosts];
      window.__rejectNative = true;
      let rejected = false;
      try { await runtime.sendMessage(message); } catch { rejected = true; }
      const callbackFailure = await new Promise((resolve) => runtime.sendMessage(message, (value) => {
        resolve({ empty: value === undefined, error: runtime.lastError?.message });
      }));
      return {
        invalid, invalidCallback, invalidPosts, valid, validCallback, posts, message,
        rejected, callbackFailure, errorCleared: runtime.lastError === undefined,
        version: runtime.getManifest().version, loaded: window.__rgNativeBridgeLoaded,
        styled: !!document.getElementById("rg-ios-app-css"), fab: typeof window.__rgFabDownload
      };
    });
    assert.equal(result.invalid.code, "DLC01");
    assert.equal(result.invalidCallback.code, "DLC01");
    assert.equal(result.invalidPosts, 0, "Invalid downloads must never reach native code");
    assert.deepEqual(result.valid, { ok: true });
    assert.deepEqual(result.validCallback, { ok: true });
    const normalized = require("../shared/core/download-contract.js").normalize(result.message);
    assert.deepEqual(result.posts, Array.from({ length: 2 }, () => ({ kind: "message", message: normalized })));
    assert.equal(result.rejected, true);
    assert.deepEqual(result.callbackFailure, { empty: true, error: "fixture native failure" });
    assert.equal(result.errorCleared, true);
    assert.equal(result.version, buildInfo("ios").platformVersion);
    assert.equal(result.loaded, true);
    assert.equal(result.styled, true);
    assert.equal(result.fab, "function");
    assert.deepEqual(pageErrors, [], "Native bridge uncaught errors");
    assert.deepEqual(unexpectedRequests, [], "Unrecognized network requests (all were blocked)");
    console.log("Native browser bridge: validation, source ordering, callback/promise errors and version checks passed.");
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
