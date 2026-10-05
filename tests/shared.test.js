"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { catalog, root, assets, sourcePath, readAsset, hostPattern, manifestFor, resetGeneratedDirectory } = require("../scripts/lib/shared-build.js");
const { syncShared } = require("../scripts/build-shared.js");

const mobileSites = ["redgifs", "reddit", "scrolller", "coomer", "instagram"];
test("the catalog reports actual support, not planned Android/OnlyFans support", () => {
  assert.deepEqual(catalog.forPlatform("edge").map((s) => s.id), [...mobileSites.slice(0, 4), "onlyfans", "instagram"]);
  for (const platform of ["ios", "orion"]) assert.deepEqual(catalog.forPlatform(platform).map((s) => s.id), mobileSites);
  assert.equal(catalog.platforms.android.status, "planned");
  assert.deepEqual(catalog.forPlatform("android"), []);
  assert.throws(() => catalog.forPlatform("unknown"), /Unknown platform/);
  assert.throws(() => catalog.forPlatform("__proto__"), /Unknown platform/);
  assert.equal(new Set(catalog.sites.map((s) => s.id)).size, catalog.sites.length);
  assert.equal(new Set(catalog.sites.map((s) => s.domain)).size, catalog.sites.length);
  assert.throws(() => { catalog.sites[0].platforms.push("android"); }, TypeError);
});

for (const site of catalog.sites) {
  test(`${site.name}: one identity for settings and native host guards`, () => {
    const guard = new RegExp(hostPattern(site), "i");
    for (const host of [site.domain, `www.${site.domain}`, `a.b.${site.domain}`]) {
      assert.equal(catalog.fromUrl(`https://${host}/post/1`)?.id, site.id);
      assert.ok(guard.test(host));
    }
    for (const host of [`not${site.domain}`, `${site.domain}.example.org`, site.domain.replace(".", "x")]) {
      assert.equal(catalog.fromUrl(`https://${host}`), null);
      assert.equal(guard.test(host), false);
    }
    assert.equal(catalog.fromUrl(`https://${site.domain}@example.org/`), null);
    for (const platform of site.platforms) assert.ok(Object.hasOwn(catalog.platforms, platform));
  });
}

test("unknown and media-CDN URLs keep the existing Other classification", () => {
  for (const value of ["", null, "not a URL", "https://preview.redd.it/image.jpg", "https://example.org"]) {
    assert.equal(catalog.fromUrl(value), null);
  }
});

test("browser globals load in dependency order without CommonJS", () => {
  const context = vm.createContext({ URL });
  vm.runInContext(readAsset("common/sites.js"), context);
  vm.runInContext(readAsset("common/settings.js"), context);
  assert.equal(context.RG_SETTINGS.siteFromUrl("https://www.instagram.com/p/1"), "Instagram");
  assert.equal(context.RG_SETTINGS.SETTINGS_KEY, "tasuDownloaderSettings");
  assert.equal(context.RG_SETTINGS.LEGACY_SETTINGS_KEY, "rgRipsnipSettings");
  assert.throws(() => vm.runInNewContext(readAsset("common/settings.js"), { URL }), /Load common\/sites.js/);
});

test("every shared asset has one source and checked-in packages are current", () => {
  for (const runtimePath of Object.keys(assets)) assert.ok(fs.existsSync(sourcePath(runtimePath)), runtimePath);
  assert.throws(() => sourcePath("../../outside.js"), /Unknown shared asset/);
  assert.deepEqual(syncShared({ check: true }), []);
});

test("UI pages, the background worker and popup reinjection load catalog before settings", () => {
  function checkOrder(files, label) {
    const normalized = files.map((file) => file.replace(/^orion-ios\//, ""));
    assert.ok(normalized.indexOf("common/settings.js") >= 0, label);
    assert.ok(normalized.indexOf("common/sites.js") >= 0, label);
    assert.ok(normalized.indexOf("common/sites.js") < normalized.indexOf("common/settings.js"), label);
  }
  for (const file of ["edge-extension/popup.html", "edge-extension/archive.html", "orion-ios/popup.html", "orion-ios/harness.html"]) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    checkOrder([...html.matchAll(/<script\b[^>]+src="([^"]+)"/g)].map((match) => match[1]), file);
  }
  const worker = fs.readFileSync(path.join(root, "edge-extension/background.js"), "utf8");
  checkOrder(JSON.parse(`[${worker.match(/importScripts\(([^)]+)\)/)[1]}]`), "background worker");
  const popup = fs.readFileSync(path.join(root, "edge-extension/popup.js"), "utf8");
  let count = 0;
  for (const match of popup.matchAll(/files:\s*(\[[^\]]+\])/g)) {
    const files = JSON.parse(match[1]);
    if (!files.includes("common/settings.js")) continue;
    checkOrder(files, "popup injection");
    count++;
  }
  assert.equal(count, 2);
  const harness = fs.readFileSync(path.join(root, "orion-ios/harness.html"), "utf8");
  for (const dependency of ["common/media-rules.js", "common/download-contract.js"]) {
    assert.ok(harness.indexOf(dependency) >= 0);
    assert.ok(harness.indexOf(dependency) < harness.indexOf('src="orion-ios/ios-bridge.js"'));
  }
});

for (const [platform, filename] of [
  ["edge", "edge-extension/manifest.json"],
  ["orion", "orion-ios/manifest.mv3.json"],
  ["orion", "orion-ios/manifest.mv2.json"]
]) {
  test(`${filename}: preserve injection worlds, dependencies and enabled sites`, () => {
    const manifest = manifestFor(platform, JSON.parse(fs.readFileSync(path.join(root, filename), "utf8")));
    assert.deepEqual(manifestFor(platform, manifest), manifest, "generation must be idempotent");
    for (const site of catalog.forPlatform(platform)) {
      const entry = manifest.content_scripts.find((e) => e.js.includes(site.handler));
      assert.ok(entry, site.id);
      assert.deepEqual(entry.matches, site.matches);
      assert.equal(entry.run_at, "document_idle");
      assert.equal(!!entry.all_frames, !!site.allFrames);
      assert.deepEqual(entry.js.slice(0, 2), ["common/sites.js", "common/settings.js"]);
      const bridge = platform === "edge" ? "common/weblink.js" : "ios-bridge.js";
      assert.ok(entry.js.indexOf(bridge) < entry.js.indexOf(site.handler));
      if (site.folders) assert.ok(entry.js.indexOf("content-folders.js") < entry.js.indexOf(site.handler));
      if (platform === "edge" && site.pageHook) {
        const hook = manifest.content_scripts.find((e) => e.js.includes(site.pageHook));
        assert.equal(hook.world, "MAIN");
        assert.equal(hook.run_at, "document_start");
      }
    }
    if (platform === "orion") {
      assert.equal(manifest.content_scripts.some((e) => e.js.includes("content-onlyfans.js")), false);
      const scrolller = manifest.content_scripts.find((e) => e.js.includes("content-scrolller-v2.js"));
      assert.ok(scrolller.js.indexOf("common/scrolller-resolve.js") < scrolller.js.indexOf("ios-bridge.js"));
    }
  });
}

test("build cleanup rejects project and arbitrary directory targets", () => {
  for (const relative of [".", "shared", "dist", "ios-app", "../outside", "C:/Users"]) {
    assert.throws(() => resetGeneratedDirectory(relative), /Not a disposable build directory/);
  }
});
