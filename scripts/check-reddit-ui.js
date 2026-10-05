"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { root, readAsset } = require("./lib/shared-build.js");

// Synthetic posts, nested shadow DOM, API messages and embeds only. No accounts,
// actual messages/media, external pages or filesystem downloads are accessed.
async function run() {
  const browser = await chromium.launch({ headless: true });
  const errors = [], unexpected = [];
  const output = path.join(root, "dist/popup-preview"); fs.mkdirSync(output, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: false });
    await context.route("**/*", route => {
      const u = new URL(route.request().url());
      if (/redd\.it$/.test(u.hostname)) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#adc9d9"/><circle cx="300" cy="300" r="150" fill="#e7f0f5"/></svg>' });
      if (u.hostname === "www.redgifs.com") return route.fulfill({ contentType: "text/html", body: '<!doctype html><body style="margin:0;background:#cbd7e8"><p>Synthetic embedded player</p></body>' });
      if (u.hostname === "www.reddit.com") return route.fulfill({ contentType: "text/html", body: '<!doctype html><style>body{margin:0;background:#edf2f7;font:16px system-ui}main{min-height:1600px}article{position:absolute;width:300px}img,iframe,video{display:block;width:300px;height:300px;border:0;object-fit:cover}.slides{display:flex;width:900px}.slides img{flex:none}.viewport{width:300px;height:300px;overflow:hidden}</style><main></main>' });
      unexpected.push(u.href); return route.abort();
    });
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__messages = []; window.__listeners = []; window.__intervals = 0; window.__frames = 0;
      const raf = window.requestAnimationFrame; window.requestAnimationFrame = fn => { window.__frames++; return raf(fn); };
      const interval = window.setInterval; window.setInterval = (...args) => { window.__intervals++; return interval(...args); };
      window.chrome = {
        runtime: { id: "fixture", onMessage: { addListener(fn) { window.__listeners.push(fn); } }, sendMessage(message, callback) {
          window.__messages.push(message);
          const reply = message.type === "GET_LISTS" ? { ok: true, lists: [{ id: "test", name: "Test listesi", site: "Reddit", count: 1 }] } : { ok: true, downloadId: 42, listName: "Test listesi" };
          callback?.(reply); return Promise.resolve(reply);
        } },
        storage: { local: { get(key, callback) { callback({}); }, set() {} }, onChanged: { addListener() {} } }
      };
      // Edge has this helper too; its existence must NOT imply native iOS.
      window.rgChooseFolder = async () => "";
    });
    async function fixture(html, setup) {
      await page.goto("https://www.reddit.com/");
      await page.locator("main").evaluate((el, html) => { el.innerHTML = html; }, html);
      if (setup) await page.evaluate(setup);
      for (const file of ["common/sites.js", "common/settings.js", "common/ui.js", "common/weblink.js", "content-reddit.js"]) {
        await page.addScriptTag({ content: file === "common/weblink.js" ? fs.readFileSync(path.join(root, "edge-extension", file), "utf8") : readAsset(file) });
      }
      await page.waitForFunction(() => !!document.getElementById("rg-downloader-reddit-overlay"));
    }
    const one = page.locator("#rg-downloader-reddit-overlay"), web = page.locator("#rg-downloader-reddit-web"), multi = page.locator(".rg-downloader-reddit-multi-button");
    const picker = page.locator("#rg-feedback-host .picker");
    const post = (id, left, top, html) => `<article id="${id}" style="left:${left}px;top:${top}px" permalink="/r/fixture/comments/${id}/title/"><h3>${id}</h3>${html}</article>`;
    await fixture(post("first", 100, 80, '<img src="https://i.redd.it/first.jpg">') + post("second", 650, 80, '<img src="https://i.redd.it/second.jpg">'));
    for (const [id, x] of [["first", 250], ["second", 800]]) {
      await page.mouse.move(x, 250);
      await page.waitForFunction(id => document.getElementById("rg-downloader-reddit-overlay").__rgDownloaderImage?.src.includes(id), id);
      assert.equal(await web.getAttribute("data-rg-visible"), "1");
      await one.click();
      assert.equal(await page.evaluate(id => window.__messages.filter(m => m.type === "DIRECT_DOWNLOAD").at(-1).urls.every(u => u.includes(id)), id), true);
    }
    await page.mouse.move(1100, 700);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("rg-downloader-reddit-web")).opacity === "0");
    assert.equal(await web.evaluate(el => getComputedStyle(el).pointerEvents), "none");
    assert.equal(await page.evaluate(() => window.__intervals), 0);
    const idleFrames = await page.evaluate(async () => {
      const before = window.__frames; await new Promise(resolve => setTimeout(resolve, 500)); return window.__frames - before;
    });
    assert.ok(idleFrames < 8, `Idle UI must not trigger a mutation/frame loop (${idleFrames})`);

    // Five candidate URLs (three logical assets), with duplicate nodes/variants.
    await fixture(post("gallery", 450, 80, '<div class="viewport"><div class="slides"><img src="https://preview.redd.it/title-v0-alpha.jpg?width=600&amp;s=one" srcset="https://preview.redd.it/title-v0-alpha.jpg?width=300&amp;s=two 300w"><img src="https://i.redd.it/beta.png"><img src="https://preview.redd.it/gamma.jpeg?width=900&amp;s=three"></div></div><a href="https://i.redd.it/alpha.jpg" hidden>original</a><img src="https://i.redd.it/beta.png" hidden>'));
    await page.mouse.move(600, 240);
    await page.waitForFunction(() => document.querySelector(".rg-downloader-reddit-multi-button").dataset.rgVisible === "1");
    await multi.click(); await picker.waitFor();
    assert.equal(await picker.locator(".item").count(), 3, "Fallback URLs must not be separate selectable items");
    await picker.locator(".item").nth(1).click();
    await picker.locator(".download").click();
    await page.waitForFunction(() => window.__messages.filter(m => m.type === "DIRECT_DOWNLOAD").length === 2);
    const downloads = await page.evaluate(() => window.__messages.filter(m => m.type === "DIRECT_DOWNLOAD"));
    assert.ok(downloads.every(m => m.imageMode === true && !m.downloadAll));
    assert.ok(downloads[0].urls.some(u => u.includes("preview.redd.it")), "Keep a signed fallback for one logical image");
    assert.ok(downloads.every(m => m.urls.every(u => !u.includes("beta"))), "Deselected image cannot leak into fallback candidates");

    await fixture(post("shadow", 100, 80, '<fixture-media></fixture-media>'), () => {
      const shadow = document.querySelector("fixture-media").attachShadow({ mode: "open" });
      shadow.innerHTML = '<img src="https://i.redd.it/shadow.jpg" style="display:block;width:300px;height:300px">';
    });
    await page.mouse.move(250, 230);
    await page.waitForFunction(() => document.getElementById("rg-downloader-reddit-overlay").dataset.rgVisible === "1");
    assert.equal(await one.count(), 1);
    await one.click();
    assert.ok(await page.evaluate(() => window.__messages.some(m => m.urls?.[0]?.includes("shadow.jpg"))));
    await page.evaluate(() => document.querySelector("fixture-media").shadowRoot.querySelector("img").src = "https://i.redd.it/replaced.jpg");
    await page.mouse.move(260, 240); await one.click();
    assert.ok(await page.evaluate(() => window.__messages.filter(m => m.type === "DIRECT_DOWNLOAD").at(-1).urls[0].includes("replaced.jpg")));

    await fixture(post("embed", 450, 80, '<iframe src="https://www.redgifs.com/ifr/fixtureone"></iframe>') + post("embedtwo", 50, 550, '<iframe src="https://www.redgifs.com/ifr/fixturetwo"></iframe>'));
    // Entering a cross-origin player still exposes controls in the Reddit parent.
    await page.mouse.move(600,240);
    await page.waitForFunction(() => document.getElementById("rg-downloader-reddit-web").dataset.rgVisible === "1");
    assert.equal(await one.getAttribute("data-rg-hover-only"),"1");assert.equal(await multi.getAttribute("data-rg-visible"),"0");assert.equal(await multi.evaluate(el=>getComputedStyle(el).display),"none");
    await page.evaluate(()=>document.documentElement.dataset.rgDownloaderButtonVisibility="always");await page.mouse.move(1200,800);await page.waitForFunction(()=>getComputedStyle(document.getElementById("rg-downloader-reddit-overlay")).opacity==="0");
    await page.mouse.move(600,240);await page.waitForFunction(()=>getComputedStyle(document.getElementById("rg-downloader-reddit-overlay")).opacity==="1");
    await one.click();
    const embed = await page.evaluate(() => window.__messages.find(m => m.type === "DIRECT_DOWNLOAD"));
    assert.equal(embed.site, "RedGifs"); assert.equal(embed.fallbackSourceUrl, "https://www.redgifs.com/watch/fixtureone");
    await web.click();
    await page.locator("#rg-web-menu .rg-wm-item").first().click();
    assert.equal(await page.evaluate(() => window.__messages.find(m => m.type === "ADD_WEB_LINK").url), "https://www.reddit.com/r/fixture/comments/embed/title/");
    for (const frame of page.frames().filter(frame => frame.url().includes("redgifs.com"))) {
      await frame.addScriptTag({ content: readAsset("common/ui.js") });
      await frame.evaluate(() => RG_UI.toast("Synthetic completion", "success"));
      assert.equal(await frame.locator("#rg-feedback-host").count(), 0, "Embeds must not render duplicate notification boxes");
    }

    await fixture(post("video", 450, 80, '<video src="https://v.redd.it/fixture/sample.mp4"></video>'));
    await page.mouse.move(600, 240);
    await page.waitForFunction(() => document.getElementById("rg-downloader-reddit-overlay").__rgDownloaderImage?.tagName === "VIDEO");
    await one.click();
    assert.deepEqual(await page.evaluate(() => window.__messages.find(m => m.type === "DIRECT_DOWNLOAD").urls), ["https://v.redd.it/fixture/sample.mp4"]);

    await page.locator("#rg-reddit-search-trigger").click();
    await page.locator("#rg-sp-user").fill("fixture_user");
    await page.locator("#rg-sp-c-reddit").check(); await page.locator("#rg-sp-c-google").check();
    await page.screenshot({ animations: "disabled", path: path.join(output, "reddit-search-glass.png") });
    assert.equal(await page.locator("#rg-reddit-search-panel").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(241, 245, 252)");
    await page.locator("#rg-reddit-search-panel .rg-sp-btn").click();
    assert.ok(await page.evaluate(() => window.__messages.filter(m => m.type === "OPEN_TAB").length >= 2), "Folder helper must not collapse Edge searches to one provider");
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log("Reddit UI checks passed: hovered post targeting, shared hover fade, three-item gallery/fallback grouping, deselection, shadow DOM, hover-only RedGifs embed download without multi, no iframe toasts, search theme/providers and no polling.");
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
