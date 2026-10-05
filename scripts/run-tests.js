"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
// Explicit files prevent Node from treating platform-specific build helpers as
// tests, or running native/package builders concurrently against the same output.
const files = fs.readdirSync(path.join(root, "tests"))
  .filter((name) => name.endsWith(".test.js"))
  .sort().map((name) => path.join(root, "tests", name));
if (!files.length) throw new Error("No test files found.");
const result = spawnSync(process.execPath, ["--test", ...files], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
