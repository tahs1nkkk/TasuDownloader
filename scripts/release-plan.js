"use strict";
const { execFileSync } = require("node:child_process");
const { root } = require("./lib/shared-build.js");
const { planChanges, parseVersionSource } = require("./lib/release-plan.js");
// Preview tracked and untracked local work; NUL delimiters preserve spaces.
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
const files = process.argv.length > 2 ? process.argv.slice(2) : [
  ...git("diff", "--name-only", "-z", "HEAD"),
  ...git("ls-files", "--others", "--exclude-standard", "-z")
];
let previousVersions;
try {
  previousVersions = parseVersionSource(execFileSync("git", ["show", "HEAD:shared/core/version.js"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
} catch {
  // First migration has no committed version catalog; all shared clients apply.
}
console.log(JSON.stringify(planChanges(files, { previousVersions }), null, 2));
