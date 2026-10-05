"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { root } = require("../scripts/lib/shared-build.js");
const { ciPlan } = require("../scripts/plan-ci-release.js");
const state = { sourceRevision: "a".repeat(40), sourceDirty: false };
const before = "b".repeat(40);
function planFor(files) {
  return ciPlan({ eventName: "push", event: { before }, state, git(...args) {
    if (args[0] === "show") throw new Error("Pre-migration source");
    assert.deepEqual(args, ["diff", "--name-only", "-z", before, state.sourceRevision]);
    return files.join("\0");
  } });
}
test("CI chooses all existing clients for shared work and only Edge for Edge work", () => {
  assert.deepEqual(planFor(["shared/sites/reddit.js"]).targets, ["edge", "ios", "orion"]);
  assert.deepEqual(planFor(["edge-extension/popup.js"]).targets, ["edge"]);
  assert.deepEqual(planFor(["global_rules.md"]).targets, []);
});
test("manual build scopes do not authorize publishing", () => {
  const plan = ciPlan({ eventName: "workflow_dispatch", event: { inputs: { scope: "ios" } }, state });
  assert.deepEqual(plan.targets, ["ios"]);
  assert.equal(plan.published, false);
  assert.equal(plan.selection, "manual-build-only");
  assert.throws(() => ciPlan({ eventName: "workflow_dispatch", event: { inputs: { scope: "android" } }, state }), /Unknown build scope/);
});
test("unknown paths, unsupported web deployment and missing history need review", () => {
  assert.throws(() => planFor(["src/unknown.js"]), /Unclassified/);
  assert.throws(() => planFor(["cloud/web/src/worker.js"]), /Separate packaging/);
  assert.throws(() => ciPlan({ eventName: "push", event: {}, state }), /base revision/);
  assert.throws(() => ciPlan({ eventName: "push", event: { before }, state, git() { throw new Error("missing history"); } }), /missing history/);
});
test("workflows parse and the prepared set waits for checks and all requested builds", () => {
  const read = (name) => YAML.parse(fs.readFileSync(path.join(root, ".github/workflows", name), "utf8"));
  const workflow = read("build-ios-app.yml");
  assert.equal(workflow.name, "iOS App");
  assert.equal(workflow.permissions.contents, "read");
  assert.deepEqual(workflow.jobs.assemble.needs, ["plan", "checks", "extensions", "ios"]);
  assert.match(workflow.jobs.assemble.if, /needs\.checks\.result == 'success'/);
  assert.match(workflow.jobs.assemble.if, /needs\.ios\.result == 'success'/);
  assert.match(workflow.jobs.assemble.if, /needs\.extensions\.result == 'success'/);
  assert.equal(workflow.jobs.ios.uses, "./.github/workflows/native-ios.yml");
  assert.match(workflow.jobs.ios.with.build_number, /github.run_number/);
  const native = read("native-ios.yml");
  assert.ok(native.on.workflow_call);
  assert.equal(native.permissions.contents, "read");
  const steps = native.jobs.build.steps.map((step) => step.run || "").join("\n");
  assert.ok(steps.indexOf("npm run test:native") < steps.indexOf("stage-ios-package.js stamp"));
  assert.ok(steps.indexOf("stage-ios-package.js stamp") < steps.indexOf("xcodegen generate"));
  assert.ok(steps.includes("stage-ios-package.js record"));
  for (const name of ["build-ios-app.yml", "native-ios.yml", "checks.yml"]) {
    const parsed = read(name);
    assert.equal(parsed.permissions.contents, "read");
    const text = JSON.stringify(parsed);
    assert.doesNotMatch(text, /gh release|delete-asset|contents\\?":\\?"write/);
    for (const job of Object.values(parsed.jobs)) {
      if (!job.steps) continue;
      const installs = job.steps.findIndex((step) => step.run === "npm ci");
      const tests = job.steps.findIndex((step) => step.run === "npm test");
      if (tests >= 0) assert.ok(installs >= 0 && installs < tests, `${name} installs dependencies before tests`);
    }
  }
});
