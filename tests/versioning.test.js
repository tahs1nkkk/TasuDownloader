"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { versions, iosBuild, buildInfo } = require("../scripts/lib/versioning.js");
const { makeSource } = require("../scripts/make-ios-source.js");
const { root } = require("../scripts/lib/shared-build.js");

test("iOS build versions are deterministic and increase with CI runs", () => {
  assert.equal(iosBuild("").version, versions.platforms.ios);
  const prefix = versions.platforms.ios.split(".").slice(0, 2).join(".");
  const patch = Number(versions.platforms.ios.split(".")[2]);
  assert.equal(iosBuild("40").version, `${prefix}.${patch + 40}`);
  assert.equal(iosBuild("41").version, `${prefix}.${patch + 41}`);
  assert.equal(iosBuild("41").buildNumber, "41");
  for (const value of ["0", "-1", "1.5", "bad", "01", Infinity]) assert.throws(() => iosBuild(value), /Invalid TASU_BUILD_NUMBER/);
});
test("the iOS feed uses the bundle version and only advertises supported sites", () => {
  const args = { repo: "test-owner/test-repo", date: "2026-09-05", size: 1000 };
  const source = makeSource(args);
  assert.equal(source.apps[0].version, buildInfo("ios").platformVersion);
  assert.equal(source.apps[0].versions[0].version, source.apps[0].version);
  assert.equal(source.apps[0].bundleIdentifier, "com.tasuapps.tasudownloader");
  assert.ok(source.apps[0].localizedDescription.includes("Instagram"));
  assert.ok(!source.apps[0].localizedDescription.includes("OnlyFans"));
  assert.throws(() => makeSource({ ...args, version: "1.0.0" }), /does not match/);
  assert.throws(() => makeSource({ ...args, size: NaN }), /IPA size/);
});
test("the Edge hub build is stamped from the Edge platform version", () => {
  const catalog = fs.readFileSync(path.join(root, "edge-extension/hub/catalog.js"), "utf8");
  assert.deepEqual(catalog.match(/\bbuild: "([^"]*)"/g), [`build: "${versions.platforms.edge}"`]);
});
test("all existing platforms record the same core and contract version", () => {
  const infos = ["edge", "orion", "ios"].map(buildInfo);
  assert.equal(new Set(infos.map((info) => info.coreVersion)).size, 1);
  assert.equal(new Set(infos.map((info) => info.downloadContractVersion)).size, 1);
  assert.throws(() => buildInfo("android"), /No implemented build/);
  assert.throws(() => buildInfo("__proto__"), /No implemented build/);
  const config = fs.readFileSync(path.join(root, "ios-app/Versions.xcconfig"), "utf8");
  assert.ok(config.includes(`MARKETING_VERSION = ${iosBuild("").version}`));
  const project = fs.readFileSync(path.join(root, "ios-app/project.yml"), "utf8");
  assert.ok(project.includes('CFBundleShortVersionString: "$(MARKETING_VERSION)"'));
  assert.ok(project.includes('CFBundleVersion: "$(CURRENT_PROJECT_VERSION)"'));
});
