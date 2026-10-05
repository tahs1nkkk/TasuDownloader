"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { unzipSync } = require("fflate");
const { root, catalog, assets, readAsset, generatedAsset, handlerFiles } = require("../scripts/lib/shared-build.js");
const { buildInfo } = require("../scripts/lib/versioning.js");

function build(script, ...args) {
  execFileSync(process.execPath, [path.join(root, "scripts", script), ...args], { cwd: root, encoding: "utf8", timeout: 60000 });
}
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("native iOS bundles shared sources and its exact supported catalog", () => {
  build("build-ios-app-js.js");
  const base = "ios-app/Resources/generated/";
  const sites = catalog.forPlatform("ios");
  assert.deepEqual(JSON.parse(read(base + "sites.json")), sites.map(({ id, name, url, tint }) => ({ id, name, url, tint })));
  const core = read(base + "rg-core.js");
  assert.deepEqual(JSON.parse(read(base + "build-info.json")), buildInfo("ios"));
  assert.ok(core.includes(`const VERSION = "${buildInfo("ios").platformVersion}"`));
  // The native pure-rules payload must contain no dependency on browser APIs.
  const bare = vm.createContext({});
  vm.runInContext(read(base + "rg-shared-rules.js"), bare);
  assert.equal(JSON.parse(bare.RG_NATIVE_CORE.call("stripVariant", '"sample-large"')).value, "sample");
  assert.ok(core.includes(readAsset("common/sites.js")));
  assert.ok(core.includes(readAsset("common/settings.js")));
  assert.ok(core.indexOf(readAsset("common/sites.js")) < core.indexOf(readAsset("common/settings.js")));
  const handlers = read(base + "rg-handlers.js");
  for (const site of sites) for (const file of handlerFiles(site)) assert.ok(handlers.includes(readAsset(file)), file);
  assert.equal(handlers.includes(readAsset("content-onlyfans.js")), false);
  const hooks = read(base + "rg-page-hook.js");
  assert.equal(hooks.includes(readAsset("page-hook-onlyfans.js")), false);

  // Execute the real page-world bundle: syntax-only checks miss bad host escaping.
  for (const [hostname, expected] of [["redgifs.com", true], ["www.redgifs.com", true], ["redgifs.com.example.org", false], ["reddit.com", false]]) {
    const context = { location: { hostname }, window: {}, navigator: {}, document: { addEventListener() {} } };
    vm.runInNewContext(hooks, context);
    assert.equal(!!context.window.__rgRipsnipPageHookLoaded, expected, hostname);
  }
  // No supported handler may execute on an unrelated site in the native browser.
  vm.runInNewContext(handlers, { location: { hostname: "example.org" } });
});

for (const mv2 of [false, true]) {
  test(`Orion MV${mv2 ? 2 : 3} ships canonical runtime files, hooks and popup dependencies`, () => {
    build("build-orion-ios.js", ...(mv2 ? ["--mv2"] : []));
    const base = "dist/orion-ios/";
    const manifest = JSON.parse(read(base + "manifest.json"));
    const archived = unzipSync(fs.readFileSync(path.join(root, "dist/RedGifsDownloader-orion-ios.xpi")));
    assert.deepEqual(JSON.parse(Buffer.from(archived["manifest.json"]).toString("utf8")), manifest);
    assert.ok(archived["common/settings.js"]);
    assert.equal(Object.keys(archived).some((file) => file.includes("\\") || file.includes("harness")), false);
    assert.equal(manifest.manifest_version, mv2 ? 2 : 3);
    assert.equal(manifest.version, buildInfo("orion").platformVersion);
    assert.deepEqual(JSON.parse(read(base + "build-info.json")), buildInfo("orion"));
    const files = new Set(manifest.content_scripts.flatMap((e) => [...e.js, ...(e.css || [])]));
    for (const entry of manifest.web_accessible_resources) {
      if (typeof entry === "string") files.add(entry);
      else for (const file of entry.resources) files.add(file);
    }
    for (const file of files) {
      assert.ok(fs.existsSync(path.join(root, base, file)), file);
      if (Object.hasOwn(assets, file)) assert.equal(read(base + file), generatedAsset(file), file);
    }
    assert.ok(files.has("common/scrolller-resolve.js"));
    assert.ok(files.has("page-hook-redgifs.js"));
    assert.equal(files.has("content-onlyfans.js"), false);
    const popup = read(base + "popup.html");
    assert.ok(popup.indexOf('src="common/sites.js"') >= 0);
    assert.ok(popup.indexOf('src="common/sites.js"') < popup.indexOf('src="common/settings.js"'));
  });
}
