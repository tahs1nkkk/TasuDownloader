"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("node:https");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const { root } = require("./lib/shared-build.js");

// A fresh browser profile and a loopback HTTPS server exercise the REAL DNR
// header/cookie flow, without user accounts, live sites or production keys.
async function run() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tasu-archive-browser-"));
  let context, server;
  const token = "synthetic-archive-key";
  const requests = [];
  const output = path.join(root, "dist", "popup-preview");
  fs.mkdirSync(output, { recursive: true });
  const files = [
    { key: "main/Reddit/sample.jpg", name: "sample.jpg", site: "Reddit", kind: "image", mtime: 2, size: 100 },
    { key: "main/Scrolller/sample.mp4", name: "sample.mp4", site: "Scrolller", kind: "video", mtime: 1, size: 100 }
  ];
  try {
    const openssl = process.platform === "win32" ? "C:/Program Files/Git/usr/bin/openssl.exe" : "openssl";
    execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=archive.test",
      "-keyout", path.join(scratch, "key.pem"), "-out", path.join(scratch, "cert.pem")], { stdio: "pipe", windowsHide: true });
    server = https.createServer({ key: fs.readFileSync(path.join(scratch, "key.pem")), cert: fs.readFileSync(path.join(scratch, "cert.pem")) }, (req, res) => {
      const url = new URL(req.url, "https://archive.test");
      requests.push({ path: url.pathname, search: url.search, authorization: req.headers.authorization, cookie: req.headers.cookie });
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, X-Tasu-Bw, Content-Type");
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
      if (url.pathname === "/auth/app") {
        if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403); res.end("denied fixture"); return; }
        res.writeHead(302, { Location: url.searchParams.get("next") || "/", "Set-Cookie": "tasu_fixture=ok; Secure; HttpOnly; SameSite=Lax; Path=/" });
        res.end(); return;
      }
      if (url.pathname === "/api/media") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(files)); return; }
      if (url.pathname === "/api/lists") { res.setHeader("Content-Type", "application/json"); res.end('{"lists":[],"tombstones":[]}'); return; }
      if (url.pathname.startsWith("/api/")) {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#5376b2"/></svg>'); return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end("<!doctype html><title>Local Tasu Archive fixture</title><h1>Local archive fixture</h1>");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `https://archive.test:${server.address().port}`;
    const extension = path.join(root, "edge-extension");
    context = await chromium.launchPersistentContext(path.join(scratch, "profile"), {
      channel: "chromium", headless: true, ignoreHTTPSErrors: true, acceptDownloads: false,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--host-resolver-rules=MAP archive.test 127.0.0.1", "--no-proxy-server"]
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.origin === origin || url.protocol === "chrome-extension:" ? route.continue() : route.abort();
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const id = new URL(worker.url()).hostname;
    await worker.evaluate(async ({ origin, token }) => {
      await chrome.storage.local.set({ tasuDownloaderSettings: { cloudBase: origin, cloudToken: token, cloudDestination: "local" } });
    }, { origin, token });
    const popup = await context.newPage();
    const errors = [];
    popup.on("pageerror", (error) => errors.push(error.message));
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.locator('.tool-tile[data-route="archive"]').click();
    const opened = context.waitForEvent("page");
    await popup.locator("#openArchiveMedia").click();
    const archive = await opened;
    await archive.waitForURL(`${origin}/?go=media`, { timeout: 20_000 }).catch(async error => {
      console.error("Archive fixture diagnostic", {
        requests: requests.map(request => ({ path: request.path, authorized: request.authorization === `Bearer ${token}` })),
        body: (await archive.locator("body").textContent()).slice(0, 180),
        ruleCount: await worker.evaluate(async () => (await chrome.declarativeNetRequest.getSessionRules()).length)
      });
      throw error;
    });
    const auth = requests.find((request) => request.path === "/auth/app");
    assert.equal(auth?.authorization, `Bearer ${token}`, "The real navigation must receive the auth header");
    const landed = requests.find((request) => request.path === "/" && request.search === "?go=media");
    assert.equal(landed?.authorization, undefined, "Authorization must not leak into redirected page requests");
    assert.ok(landed?.cookie?.includes("tasu_fixture=ok"), "Login sets a first-party session cookie");
    assert.equal(requests.some((request) => request.search.includes(token)), false);
    await popup.waitForFunction(async () => (await chrome.declarativeNetRequest.getSessionRules()).length === 0);
    assert.equal((await worker.evaluate(() => chrome.alarms.getAll())).length, 0);

    const gallery = await context.newPage();
    gallery.on("pageerror", (error) => errors.push(error.message));
    await gallery.goto(`chrome-extension://${id}/archive.html`);
    await gallery.locator("#grid .card").nth(1).waitFor();
    await gallery.screenshot({ animations: "disabled", path: path.join(output, "gallery-glass.png") });
    // Stub only the browser's disk write, then exercise the real archive sender route.
    await worker.evaluate(() => { chrome.downloads.download = async () => 987654; });
    await gallery.evaluate(async key => {
      await chrome.runtime.sendMessage({ type: "DOWNLOAD_ARCHIVE_MEDIA", key });
    }, files[0].key);
    await gallery.waitForFunction(async () => (await chrome.storage.session.get("tasuDownloadFeedback")).tasuDownloadFeedback?.some(([id]) => id === 987654));
    const route = await worker.evaluate(async () => (await chrome.storage.session.get("tasuDownloadFeedback")).tasuDownloadFeedback.find(([id]) => id === 987654)[1]);
    assert.equal(route.extensionPage, true);
    const galleryId = await gallery.evaluate(async () => (await chrome.tabs.getCurrent()).id);
    assert.equal(route.tabId, galleryId, "Real extension gallery sender must identify the source tab");
    await worker.evaluate(targetTabId => chrome.runtime.sendMessage({ type: "RG_UI_DOWNLOAD_STATUS", targetTabId, text: "Sentetik indirme tamamlandı.", level: "success" }), galleryId);
    await gallery.locator('#rg-feedback-host .toast[data-level="success"]').waitFor();
    await gallery.locator("#mediaKind").selectOption("video");
    assert.equal(await gallery.locator("#grid .card").count(), 1);
    assert.equal(await gallery.locator("#grid .card").getAttribute("data-key"), files[1].key);
    await gallery.locator("#mediaKind").selectOption("all");
    await gallery.locator("#grid .card").first().hover();
    await gallery.locator("#grid .card .pick").first().click();
    await gallery.locator("#selAll").click();
    assert.equal(await gallery.locator("#selCount").textContent(), "2 seçili");
    // UI download wiring is checked without writing even the fixture to Downloads.
    await gallery.evaluate(() => {
      window.__archiveDownloads = [];
      const original = chrome.runtime.sendMessage.bind(chrome.runtime);
      chrome.runtime.sendMessage = (message) => {
        if (message.type !== "DOWNLOAD_ARCHIVE_MEDIA") return original(message);
        window.__archiveDownloads.push(message);
        return Promise.resolve({ ok: true, downloadId: window.__archiveDownloads.length });
      };
    });
    await gallery.locator("#selDownload").click();
    await gallery.locator("#rg-feedback-host .picker .download").click();
    await gallery.waitForFunction(() => window.__archiveDownloads.length === 2);
    await gallery.locator("#selCancel").click();
    await gallery.locator("#grid .card").first().click();
    await gallery.locator("#viewerDownload").click();
    await gallery.waitForFunction(() => window.__archiveDownloads.length === 3);
    const debug = await context.newPage();
    debug.on("pageerror", error => errors.push(error.message));
    await debug.goto(`chrome-extension://${id}/debug-guide.html`);
    await debug.locator("#stepTitle").filter({ hasText: /./ }).waitFor();
    assert.equal(await debug.locator("body").evaluate(el => getComputedStyle(el).color), "rgb(29, 48, 74)");
    await debug.screenshot({ animations: "disabled", path: path.join(output, "debug-glass.png") });
    await debug.locator("#markFailed").click();
    await debug.locator("#diagnosticOutput").fill('{"fixture":true}');
    await debug.locator("#saveFailure").click();
    await debug.locator('#rg-feedback-host .toast[data-level="error"]').waitFor();
    await debug.locator("#markPassed").click();
    await debug.locator('#rg-feedback-host .toast[data-level="success"]').waitFor();
    await debug.setViewportSize({ width: 390, height: 844 });
    assert.ok(await debug.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Debug guide must fit a narrow window");
    assert.deepEqual(errors, []);
    console.log("Real extension checks passed: scoped header login, cookie redirect, rule cleanup, gallery filter, select-all and download controls.");
  } finally {
    if (context) await context.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    // Remove only the exact disposable profile/certificate directory created above.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
