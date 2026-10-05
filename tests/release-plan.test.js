"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { planChanges, parseVersionSource } = require("../scripts/lib/release-plan.js");
const { versions } = require("../scripts/lib/versioning.js");

test("shared changes require coordinated clients without advertising an Android build", () => {
  const plan = planChanges(["shared/core/download-contract.js"]);
  assert.deepEqual(plan.targets, ["edge", "ios", "orion"]);
  assert.deepEqual(plan.pendingPlatforms, ["android"]);
  assert.equal(plan.coordinated, true);
});
test("platform-only work does not force unrelated app releases", () => {
  assert.deepEqual(planChanges(["edge-extension/popup.js"]).targets, ["edge"]);
  assert.deepEqual(planChanges(["ios-app/Sources/Settings/SettingsScreen.swift"]).targets, ["ios"]);
  assert.deepEqual(planChanges(["orion-ios/ios-bridge.js"]).targets, ["orion"]);
  assert.deepEqual(planChanges(["cloud/web/public/style.css"]).targets, ["web"]);
  assert.equal(planChanges(["edge-extension/popup.js"]).coordinated, false);
});
test("indirect dependencies include the clients that actually consume them", () => {
  assert.deepEqual(planChanges(["orion-ios/ios-mobile.css"]).targets, ["ios", "orion"]);
  assert.deepEqual(planChanges(["edge-extension/common/settings.js"]).targets, ["edge", "ios", "orion"]);
  assert.deepEqual(planChanges(["cloud/web/src/worker.js"]).targets, ["edge", "ios", "web"]);
  assert.deepEqual(planChanges(["edge-extension/icon-32.png"]).targets, ["edge", "orion"]);
});
test("a platform-only version bump can stay independent of the shared core", () => {
  const before = { coreVersion: versions.coreVersion, platforms: { ...versions.platforms, ios: "1.0.0" } };
  const plan = planChanges(["shared/core/version.js", "edge-extension/common/version.js"], { previousVersions: before });
  assert.deepEqual(plan.targets, ["ios"]);
  assert.equal(plan.coordinated, false);
});
test("unclassified changes request review; documentation alone has no release", () => {
  assert.deepEqual(planChanges(["shared/README.md", "global_rules.md", "ios-app/README.md"]).targets, []);
  assert.deepEqual(planChanges(["src/new-integration.js"]).requiresReview, ["src/new-integration.js"]);
});

test("previous versions are read without evaluating historical JavaScript", () => {
  const source = require("node:fs").readFileSync(require.resolve("../shared/core/version.js"), "utf8");
  assert.deepEqual(parseVersionSource(source), versions);
  assert.equal(parseVersionSource("throw new Error('must never execute')"), undefined);
  assert.equal(parseVersionSource(source + '\ncoreVersion: "2.0.0"'), undefined);
});
