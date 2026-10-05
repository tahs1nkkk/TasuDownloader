"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { root } = require("./lib/shared-build.js");
const { planChanges, parseVersionSource } = require("./lib/release-plan.js");
const { sourceState } = require("./lib/release-bundle.js");

function ciPlan({ eventName, event, state, git }) {
  let plan;
  if (eventName === "workflow_dispatch") {
    const scope = event.inputs?.scope || "all";
    if (!["all", "edge", "ios", "orion"].includes(scope)) throw new Error("Unknown build scope");
    plan = {
      targets: scope === "all" ? ["edge", "ios", "orion"] : [scope],
      pendingPlatforms: scope === "all" ? ["android"] : [], requiresReview: [], reasons: [],
      coordinated: scope === "all", selection: "manual-build-only"
    };
  } else if (eventName === "push") {
    const before = event.before;
    if (!/^[a-f0-9]{40,64}$/.test(before || "")) throw new Error("Missing push base revision");
    let previousVersions;
    let files;
    if (/^0+$/.test(before)) {
      files = git("ls-files", "-z").split("\0").filter(Boolean);
    } else {
      // A missing base commit must fail, not silently narrow the affected set.
      files = git("diff", "--name-only", "-z", before, state.sourceRevision).split("\0").filter(Boolean);
      try { previousVersions = parseVersionSource(git("show", `${before}:shared/core/version.js`)); } catch { /* First source migration. */ }
    }
    plan = { ...planChanges(files, { previousVersions }), selection: "push-diff-build-only" };
  } else throw new Error("Only push and manual build events are supported");
  if (plan.requiresReview.length) throw new Error(`Unclassified changes need review: ${plan.requiresReview.join(", ")}`);
  const unsupported = plan.targets.filter((target) => !["edge", "ios", "orion"].includes(target));
  if (unsupported.length) throw new Error(`Separate packaging/deployment review required: ${unsupported.join(", ")}`);
  return { ...plan, ...state, published: false };
}

if (require.main === module) {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const plan = ciPlan({ eventName: process.env.GITHUB_EVENT_NAME, event, state: sourceState(), git });
  const file = path.join(root, "dist/release-plan.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(plan, null, 2) + "\n");
  const extensionTargets = plan.targets.filter((target) => target !== "ios").join(",");
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_targets=${plan.targets.length > 0}\nios=${plan.targets.includes("ios")}\nextension_targets=${extensionTargets}\n`);
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Prepared-build scope\n\nTargets: ${plan.targets.join(", ") || "none"}.\n\nPending: ${plan.pendingPlatforms.join(", ") || "none"}.\n\nNo release will be published by this workflow.\n`);
}
module.exports = { ciPlan };
