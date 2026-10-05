"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { root } = require("./lib/shared-build.js");
const { packageInfo, recordArtifact, newOutputDirectory, sourceState } = require("./lib/release-bundle.js");

if (process.platform !== "darwin") throw new Error("iOS staging requires the macOS native build");
const state = sourceState();
const info = packageInfo("ios", state);
if (process.argv[2] === "stamp") {
  const file = path.join(root, "ios-app/Resources/generated/build-info.json");
  const previous = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const key of ["platform", "platformVersion", "coreVersion", "downloadContractVersion", "buildNumber"]) {
    if (previous[key] !== info[key]) throw new Error(`Stale native payload: ${key}`);
  }
  fs.writeFileSync(file, JSON.stringify(info, null, 2) + "\n");
} else if (process.argv[2] === "record") {
  const plist = path.join(root, "build/Build/Products/Release-iphoneos/TasuDownloader.app/Info.plist");
  const value = (key) => execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print ${key}`, plist], { encoding: "utf8" }).trim();
  if (value("CFBundleShortVersionString") !== info.platformVersion || value("CFBundleVersion") !== info.buildNumber ||
      value("CFBundleIdentifier") !== "com.tasuapps.tasudownloader") throw new Error("Built iOS bundle identity differs from its payload");
  const directory = newOutputDirectory("dist/ios-package");
  fs.copyFileSync(path.join(root, "dist/TasuDownloader.ipa"), path.join(directory, "TasuDownloader.ipa"));
  recordArtifact(directory, "ios", "TasuDownloader.ipa", state);
} else throw new Error("Expected stamp or record");
