"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { root, readAsset, nativeRuleFiles } = require("../scripts/lib/shared-build.js");
const { normalize, validate } = require("../shared/core/download-contract.js");
const fixtures = require("./fixtures/shared-core.json");

// No URL, document, fetch, timers or CommonJS: matches the bare native runtime.
const context = vm.createContext({});
for (const file of nativeRuleFiles) vm.runInContext(readAsset(file), context);
for (const fixture of fixtures) {
  test(`shared native/JS fixture: ${fixture.name}`, () => {
    const reply = JSON.parse(context.RG_NATIVE_CORE.call(fixture.operation, JSON.stringify(fixture.input)));
    if (fixture.error) {
      assert.equal(reply.ok, false);
      assert.ok(reply.error.startsWith(fixture.error));
      assert.ok(!reply.error.includes("private.mp4"));
    } else {
      assert.equal(reply.ok, true);
      if (fixture.expectedSubset) {
        for (const [key, expected] of Object.entries(fixture.expectedSubset)) assert.deepEqual(reply.value[key], expected, key);
      } else assert.deepEqual(reply.value, fixture.expected);
    }
  });
}

test("normalization is idempotent and does not mutate the caller", () => {
  const input = { type: "DIRECT_DOWNLOAD", urls: ["blob:local", "https://media.example/a.jpg"] };
  const copy = JSON.stringify(input);
  const request = normalize(input);
  assert.deepEqual(normalize(request), request);
  request.urls.push("https://media.example/extra.jpg");
  assert.equal(JSON.stringify(input), copy);
  for (const timeout of [NaN, Infinity, -Infinity]) assert.equal(validate({ ...input, transferTimeoutMs: timeout }).ok, false);
  assert.equal(normalize({ type: "DIRECT_DOWNLOAD", namingUrl: null }).namingUrl, null);
});

test("Edge rejects malformed download messages before any network/download call", () => {
  let listener;
  const notices = [];
  const event = { addListener() {} };
  const chrome = {
    runtime: { onMessage: { addListener(value) { listener = value; } } },
    storage: { local: { get(_keys, callback) { callback({}); } } },
    tabs: { onUpdated: event, onCreated: event, sendMessage(...args) { notices.push(args); return Promise.resolve(); } },
    downloads: { download() { throw new Error("Unexpected download"); } }
  };
  const sandbox = vm.createContext({ chrome, URL, console });
  sandbox.importScripts = (...files) => {
    for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, "edge-extension", file), "utf8"), sandbox);
  };
  vm.runInContext(fs.readFileSync(path.join(root, "edge-extension/background.js"), "utf8"), sandbox);
  let response;
  const handled = listener({ type: "DIRECT_DOWNLOAD", urls: "wrong" }, {}, (result) => { response = result; });
  assert.equal(handled, false);
  assert.equal(response.code, "DLC01");
  // Exercise the real Edge naming entry point, not just the helper.
  assert.equal(vm.runInContext('filenameFor("https://cdn.example/sample-large_1920x1080.mp4").split("/").pop()', sandbox), "sample.mp4");
  vm.runInContext('notify(7, { type: "RG_HELPER_STATUS", text: "fixture" })', sandbox);
  assert.equal(notices.length, 1);
  assert.equal(notices[0][2].frameId, 0, "Accepted-download notices must not broadcast to RedGifs embeds");
});

test("Orion reports the same contract errors through promise and callback APIs", async () => {
  const chrome = { runtime: {}, storage: { local: { get(_keys, cb) { cb({}); } } } };
  const sandbox = vm.createContext({ chrome, URL, console, location: { href: "https://example.org", hostname: "example.org" }, document: { getElementById() { return null; } } });
  sandbox.window = sandbox;
  for (const file of ["common/sites.js", "common/settings.js", "common/media-rules.js", "common/download-contract.js"]) vm.runInContext(readAsset(file), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "orion-ios/ios-bridge.js"), "utf8"), sandbox);
  const result = await chrome.runtime.sendMessage({ type: "DIRECT_DOWNLOAD", urls: 3 });
  assert.equal(result.code, "DLC01");
  const callbackResult = await new Promise((resolve) => chrome.runtime.sendMessage({ type: "DIRECT_DOWNLOAD", contractVersion: 3 }, resolve));
  assert.equal(callbackResult.code, "DLC02");
});
