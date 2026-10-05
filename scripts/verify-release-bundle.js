"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { root } = require("./lib/shared-build.js");
const { verifyBundle } = require("./lib/release-bundle.js");
const directory = path.join(root, "dist/prepared-release");
const plan = JSON.parse(fs.readFileSync(path.join(directory, "release-plan.json"), "utf8"));
const manifest = verifyBundle(plan, directory);
fs.writeFileSync(path.join(directory, "release-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Verified package set\n\n${manifest.targets.join(", ")} — ${manifest.artifacts.length} artifacts from one commit.\n\nState: prepared, not published. Android is not an available build. Device smoke tests and publication approval are still required.\n`);
}
console.log(`Verified ${manifest.artifacts.length} artifacts. Nothing was published.`);
