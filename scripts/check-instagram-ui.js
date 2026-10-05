"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { root, readAsset } = require("./lib/shared-build.js");

// Synthetic Instagram-shaped DOM/API, never a real profile, session or download.
async function run() {
  const browser = await chromium.launch({ headless: true });
  const output = path.join(root, "dist", "popup-preview");
  fs.mkdirSync(output, { recursive: true });
  const errors = [], unexpected = [];
  let apiCount = 0, profileCount = 0, singlePost = true;
  const image = n => ({ image_versions2: { candidates: [{ url: `https://media.test/${n}.jpg`, width: 800, height: 1400 }] } });
  const nodes = [image(1), { ...image(2), video_versions: [{ url: "https://media.test/2.mp4", width: 800, height: 1400 }] }, image(3)];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: false });
    await context.route("**/*", route => {
      const u = new URL(route.request().url());
      if (u.hostname === "media.test") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1400"><rect width="800" height="1400" fill="#b6ccdf"/><circle cx="400" cy="600" r="180" fill="#e4eff5"/></svg>' });
      if (u.pathname.startsWith("/api/v1/media/")) {
        apiCount++;
        return route.fulfill({ json: { items: [singlePost ? image(1) : { carousel_media: nodes }] } });
      }
      if (u.pathname.startsWith("/api/v1/users/web_profile_info/")) {
        profileCount++;
        return route.fulfill({ status: 429, headers: { "Retry-After": "300" }, json: { message: "fixture rate limit" } });
      }
      if (u.hostname === "www.instagram.com") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><style>body{margin:0;background:#e9eef4;font:16px system-ui}nav{position:absolute;left:10px;top:10px}main{min-height:1600px}.story{position:absolute;left:480px;top:100px;width:320px;height:560px;object-fit:contain}.post{display:block;position:absolute;left:480px;top:100px;width:320px;height:400px}.post img{width:100%;height:100%;object-fit:cover}</style></head><body><nav><a href="/unrelated/">Unrelated header</a></nav><main></main></body></html>' });
      unexpected.push(u.href); return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__downloads = []; window.__intervals = 0; window.__queries = 0;
      const original = window.setInterval;
      window.setInterval = (...args) => { window.__intervals++; return original(...args); };
      const q = Element.prototype.querySelectorAll;
      Element.prototype.querySelectorAll = function(...args) { window.__queries++; return q.apply(this, args); };
      window.chrome = {
        runtime: { id: "fixture", onMessage: { addListener() {} }, sendMessage(message, callback) { if (message.type === "DIRECT_DOWNLOAD") window.__downloads.push(message); callback?.({ ok: true, downloadId: 42 }); } },
        storage: { local: { get(key, callback) { callback({}); }, set() {} }, onChanged: { addListener() {} } }
      };
    });
    async function fixture(url, html) {
      await page.goto(url);
      await page.locator("main").evaluate((el, html) => { el.innerHTML = html; }, html);
      await page.waitForFunction(() => [...document.images].every(img => img.complete));
      for (const file of ["common/sites.js", "common/settings.js", "common/ui.js", "common/weblink.js", "content-instagram.js"]) {
        const content = file === "common/weblink.js" ? fs.readFileSync(path.join(root, "edge-extension", file), "utf8") : readAsset(file);
        await page.addScriptTag({ content });
      }
      await page.waitForFunction(() => !!document.getElementById("rg-ig-one"));
    }
    await fixture("https://www.instagram.com/stories/demo/1234/", '<img class="story" src="https://media.test/story.jpg">');
    await page.mouse.move(650, 350);
    await page.waitForFunction(() => document.getElementById("rg-ig-one").dataset.visible === "1");
    const box = await page.locator("#rg-ig-one").boundingBox();
    assert.ok(Math.abs(box.x - 490) < 2 && Math.abs(box.y - 110) < 2, `Story button must use media, not header: ${JSON.stringify(box)}`);
    assert.equal(await page.locator("#rg-ig-all").getAttribute("data-visible"), "0");
    await page.screenshot({ animations: "disabled", path: path.join(output, "instagram-story.png") });
    await page.locator(".story").evaluate(el => { el.style.height = "640px"; window.dispatchEvent(new Event("resize")); });
    await page.waitForFunction(() => Math.abs(document.getElementById("rg-ig-one").getBoundingClientRect().y - 150) < 2);
    await page.mouse.move(60, 700);
    await page.waitForFunction(() => document.getElementById("rg-ig-one").dataset.visible === "0");
    assert.ok(await page.locator("#rg-ig-one").evaluate(el => getComputedStyle(el).transitionProperty.includes("opacity")));
    await page.waitForFunction(() => getComputedStyle(document.getElementById("rg-ig-one")).opacity === "0");
    assert.equal(await page.evaluate(() => window.__intervals), 0, "No perpetual Instagram scan interval");

    // A plain profile tile stays single both before and after the API response.
    await fixture("https://www.instagram.com/demo/", '<a class="post" href="/p/AAAAAAAAAAA/"><img src="https://media.test/one.jpg"></a>');
    await page.mouse.move(620, 300);
    await page.waitForFunction(() => document.getElementById("rg-ig-one").dataset.visible === "1");
    assert.equal(await page.locator("#rg-ig-all").getAttribute("data-visible"), "0");
    await page.waitForResponse(response => response.url().includes("/api/v1/media/"));
    await page.mouse.move(630, 305);
    assert.equal(await page.locator("#rg-ig-all").getAttribute("data-visible"), "0");
    // Hydration can replace our DOM nodes: recreate them without a polling loop.
    await page.locator("#rg-ig-one").evaluate(el => el.remove());
    await page.waitForFunction(() => !!document.getElementById("rg-ig-one"));
    singlePost = false;
    await fixture("https://www.instagram.com/demo/", '<a class="post" href="/p/BBBBBBBBBBB/"><img src="https://media.test/one.jpg"></a>');
    await page.locator(".post").evaluate(el => { el.insertAdjacentHTML("beforeend", '<svg aria-label="Carousel" width="24" height="24"></svg>'); });
    await page.mouse.move(50, 700); await page.mouse.move(620, 300);
    await page.waitForFunction(() => document.getElementById("rg-ig-all").dataset.visible === "1");
    const before = await page.evaluate(() => window.__queries);
    for (let i = 0; i < 30; i++) await page.mouse.move(600 + i, 300 + i);
    const after = await page.evaluate(() => window.__queries);
    assert.ok(after - before < 12, `Hover must reuse its context, not rescan the tree (${after - before})`);
    await page.locator("#rg-ig-all").click();
    const picker = page.locator("#rg-feedback-host .picker");
    await picker.waitFor();
    assert.equal(await picker.locator('.item[aria-pressed="true"]').count(), 3);
    assert.notEqual(await picker.locator(".item").first().evaluate(el => getComputedStyle(el).boxShadow), "none");
    await picker.locator(".item").nth(1).click();
    await page.screenshot({ animations: "disabled", path: path.join(output, "multi-preview.png") });
    await picker.locator(".download").click();
    await page.waitForFunction(() => window.__downloads.length === 1);
    const sent = await page.evaluate(() => window.__downloads[0]);
    assert.deepEqual(sent.urls, ["https://media.test/1.jpg", "https://media.test/3.jpg"]);
    assert.equal(sent.downloadAll, true);
    await page.locator("#rg-ig-all").click(); await picker.waitFor();
    for (const item of await picker.locator(".item").all()) await item.click();
    assert.equal(await picker.locator(".download").isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => window.__downloads.length), 1, "Cancel cannot download");
    await page.locator('#rg-feedback-host .toast[data-level="warning"]').waitFor();
    assert.ok(apiCount <= 2, `Repeated downloads should reuse the post API response (${apiCount})`);

    // Picker placement is above the anchor when space is available; viewport-safe otherwise.
    await page.evaluate(() => {
      const button = document.createElement("button"); button.id = "fixture-picker-anchor";
      button.style.cssText = "position:fixed;left:500px;top:700px;width:44px;height:44px"; document.body.append(button);
      void RG_UI.chooseMedia(button, [{ url: "https://media.test/1.jpg" }, { url: "javascript:alert(1)" }, { url: "https://media.test/1.jpg" }]);
    });
    await picker.waitFor();
    assert.equal(await picker.locator(".item").count(), 1, "Unsafe and duplicate URLs must be removed");
    const pickerBox = await picker.boundingBox();
    assert.ok(pickerBox.y + pickerBox.height < 700);
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => RG_UI.toast("Test tamamlandı.", "success"));
    assert.equal(await page.locator("#rg-feedback-host .toast").evaluate(el => getComputedStyle(el).transitionDuration), "0s");
    // The companion archive button must fade too, and never intercept clicks while hidden.
    singlePost = true;
    await fixture("https://www.instagram.com/p/AAAAAAAAAAA/", '<article style="position:absolute;left:480px;top:100px;width:320px;height:400px"><a href="/p/AAAAAAAAAAA/"><img src="https://media.test/one.jpg" style="width:320px;height:400px;object-fit:cover"></a></article>');
    await page.mouse.move(620, 300);
    await page.waitForFunction(() => document.getElementById("rg-ig-web").dataset.visible === "1");
    assert.equal(await page.locator("#rg-ig-web").evaluate(el => getComputedStyle(el).backgroundColor), "rgba(255, 255, 255, 0.95)");
    await page.mouse.move(60, 700);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("rg-ig-web")).opacity === "0");
    assert.equal(await page.locator("#rg-ig-web").evaluate(el => getComputedStyle(el).pointerEvents), "none");

    // A clipped feed carousel: slide one is still inside the WINDOW after moving,
    // but it is outside the POST. The old viewport-only selection hid all controls.
    singlePost = false;
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await fixture("https://www.instagram.com/", '<article style="position:absolute;left:480px;top:100px;width:320px;height:400px"><a href="/p/CCCCCCCCCCC/">Post</a><div style="overflow:hidden;width:320px;height:360px"><div id="slides" style="display:flex;width:960px;transition:transform 100ms ease"><img src="https://media.test/1.jpg" style="width:320px;height:360px;flex:none"><img src="https://media.test/2.jpg" style="width:320px;height:360px;flex:none"><img src="https://media.test/3.jpg" style="width:320px;height:360px;flex:none"></div></div><svg aria-label="Carousel"></svg></article>');
    await page.mouse.move(620, 300);
    await page.waitForFunction(() => document.getElementById("rg-ig-one").dataset.visible === "1");
    for (const slide of [1, 2]) {
      await page.locator("#slides").evaluate((el, slide) => { el.style.transform = `translateX(-${slide * 320}px)`; }, slide);
      await page.waitForFunction(slide => Math.abs(document.querySelectorAll("#slides img")[slide].getBoundingClientRect().left - 480) < 1, slide);
      await page.waitForFunction(() => document.getElementById("rg-ig-one").dataset.visible === "1");
      await page.locator("#rg-ig-one").click();
      await page.waitForFunction(count => window.__downloads.length === count, slide);
      const message = await page.evaluate(() => window.__downloads.at(-1));
      assert.deepEqual(message.urls, [slide === 1 ? "https://media.test/2.mp4" : "https://media.test/3.jpg"]);
      await page.mouse.move(620, 300);
    }
    await page.locator("#rg-ig-all").click(); await picker.waitFor();
    assert.equal(await picker.locator(".item").count(), 3);
    assert.ok((await picker.locator(".item").first().boundingBox()).width >= 115);
    assert.equal(await picker.locator("h2,p").count(), 0, "No redundant preview instructions");
    const tileBox = await picker.locator(".item").first().boundingBox();
    const badgeBox = await picker.locator(".kind").first().boundingBox();
    assert.ok(badgeBox.x > tileBox.x + tileBox.width / 2 && badgeBox.y > tileBox.y + tileBox.height / 2);
    assert.equal(await picker.locator(".kind svg").count(), 3);
    await page.screenshot({ animations: "disabled", path: path.join(output, "multi-preview-large.png") });
    await page.keyboard.press("Escape");

    await fixture("https://www.instagram.com/demo/", '<header><img alt="Demo profile picture" src="https://media.test/avatar.jpg" style="position:absolute;left:480px;top:100px;width:120px;height:120px;border-radius:50%"></header>');
    await page.mouse.move(540, 165);
    await page.waitForFunction(() => document.getElementById("rg-ig-one").dataset.visible === "1");
    await page.locator("#rg-ig-one").click();
    await page.waitForFunction(() => window.__downloads.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__downloads[0].urls), ["https://media.test/avatar.jpg"]);
    await page.locator("#rg-ig-one").click();
    await page.waitForFunction(() => window.__downloads.length === 2);
    assert.equal(profileCount, 1, "429 cooldown must not issue another profile request");

    await fixture("https://www.instagram.com/direct/t/fixture/", '<div role="row"><img src="https://media.test/message.jpg" style="position:absolute;left:480px;top:100px;width:320px;height:240px"></div><img alt="Profile picture" src="https://media.test/avatar.jpg" style="width:40px;height:40px;border-radius:50%">');
    await page.mouse.move(620, 200);
    await page.waitForFunction(() => document.getElementById("rg-ig-one").dataset.visible === "1");
    assert.equal(await page.locator("#rg-ig-all").getAttribute("data-visible"), "0");
    await page.locator("#rg-ig-one").click();
    await page.waitForFunction(() => window.__downloads.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__downloads[0].urls), ["https://media.test/message.jpg"]);
    await page.mouse.move(15, 15);
    await page.waitForFunction(() => document.getElementById("rg-ig-one").dataset.visible === "0");
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    await fixture("https://www.instagram.com/direct/t/fixture/", '<div role="row"><video src="https://media.test/message.mp4" style="position:absolute;left:480px;top:100px;width:320px;height:240px"></video></div>');
    await page.mouse.move(620, 200);
    await page.waitForFunction(() => document.getElementById("rg-ig-one").dataset.visible === "1");
    await page.locator("#rg-ig-one").click();
    await page.waitForFunction(() => window.__downloads.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__downloads[0].urls), ["https://media.test/message.mp4"]);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log("Instagram UI checks passed: clipped carousel slides 2/3, 429 avatar fallback/cooldown, visible DM image/video, large icon-only previews, story anchoring, hover fade, cache, selection/cancel and reduced motion.");
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
