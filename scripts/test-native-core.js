"use strict";
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { root } = require("./lib/shared-build.js");
if (process.platform !== "darwin") throw new Error("Native core tests require macOS and Apple's JavaScriptCore framework.");
execFileSync(process.execPath, [path.join(root, "scripts/build-ios-app-js.js")], { cwd: root, stdio: "inherit" });
const out = path.join(root, "build", "native-core-tests");
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync("swiftc", [
  "-swift-version", "5", "-framework", "JavaScriptCore",
  path.join(root, "ios-app/Sources/Support/SharedCore.swift"),
  path.join(root, "ios-app/Sources/Downloads/DownloadRequest.swift"),
  path.join(root, "ios-app/Sources/Downloads/MediaNaming.swift"),
  path.join(root, "ios-app/Sources/Downloads/MediaResolver.swift"),
  path.join(root, "tests/native/main.swift"), "-o", out
], { cwd: root, stdio: "inherit" });
execFileSync(out, [root], { cwd: root, stdio: "inherit" });
