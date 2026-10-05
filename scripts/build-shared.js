"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { root, edgeOutputs } = require("./lib/shared-build.js");

function syncShared({ check = false } = {}) {
  const changed = [];
  // Compute every output before writing anything; a missing source must fail early.
  for (const [file, expected] of edgeOutputs()) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n") : null;
    if (current === expected) continue;
    changed.push(path.relative(root, file));
    if (!check) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, expected, "utf8");
    }
  }
  if (check && changed.length) {
    throw new Error(`Shared outputs are stale. Run npm run build:shared:\n${changed.join("\n")}`);
  }
  return changed;
}

if (require.main === module) {
  const check = process.argv.includes("--check");
  const changed = syncShared({ check });
  console.log(check ? "Shared assets and site manifests are in sync." : `Shared build: ${changed.length} files updated.`);
}
module.exports = { syncShared };
