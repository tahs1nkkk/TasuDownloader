"use strict";
const { assets, catalog } = require("./shared-build.js");
const { versions } = require("./versioning.js");

// Read-only dependency planning. This never builds, publishes or installs updates.
function planChanges(files, { previousVersions, currentVersions = versions } = {}) {
  const targets = new Set();
  const reasons = [];
  const unresolved = [];
  let sharedChanged = false;
  let androidAffected = false;
  function add(file, affected, reason) {
    for (const target of affected) targets.add(target);
    reasons.push({ file, targets: affected, reason });
  }
  function shared(file, reason) {
    sharedChanged = true;
    androidAffected = true;
    add(file, Object.keys(catalog.platforms).filter((key) => catalog.platforms[key].status === "implemented"), reason);
  }
  for (const raw of [...new Set(files)]) {
    const file = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    if (file.endsWith(".md")) continue;
    if (["shared/core/version.js", "edge-extension/common/version.js"].includes(file)) {
      if (!previousVersions || previousVersions.coreVersion !== currentVersions.coreVersion) {
        shared(file, "shared core version");
      } else {
        const changed = Object.keys(currentVersions.platforms).filter((key) => previousVersions.platforms?.[key] !== currentVersions.platforms[key]);
        add(file, changed.filter((key) => catalog.platforms[key]?.status === "implemented"), "platform-only version update");
        if (changed.includes("android")) androidAffected = true;
      }
    } else if (file.startsWith("shared/") && !file.endsWith(".md")) {
      shared(file, "shared runtime or contract");
    } else if (file.startsWith("edge-extension/") && Object.hasOwn(assets, file.slice("edge-extension/".length))) {
      shared(file, "generated shared runtime");
    } else if (file === "ios-app/Sources/Downloads/DownloadRequest.swift") {
      shared(file, "generated shared contract");
    } else if (file === "orion-ios/ios-mobile.css") {
      add(file, ["ios", "orion"], "mobile styles used by both iOS clients");
    } else if (file.startsWith("ios-app/")) {
      add(file, ["ios"], "native iOS integration");
    } else if (file.startsWith("orion-ios/")) {
      add(file, ["orion"], "Orion integration");
    } else if (file.startsWith("edge-extension/")) {
      const icon = /^edge-extension\/icon-[0-9]+\.png$/.test(file);
      add(file, icon ? ["edge", "orion"] : ["edge"], icon ? "reused extension icon" : "Edge integration");
    } else if (file.startsWith("native-music/") || file.startsWith("integrations/")) {
      add(file, ["edge"], "Windows hub module or frozen integration snapshot");
    } else if (file.startsWith("cloud/web/public/")) {
      add(file, ["web"], "archive UI");
    } else if (file.startsWith("cloud/")) {
      add(file, ["edge", "ios", "web"], "cloud service or data contract");
      androidAffected = true;
    } else if (file.startsWith("scripts/") || file.startsWith("tests/") || file.startsWith(".github/workflows/") || /^package(?:-lock)?\.json$/.test(file)) {
      shared(file, "build, test or dependency compatibility");
    } else if (file.startsWith("android-app/")) {
      if (catalog.platforms.android.status === "implemented") add(file, ["android"], "Android integration");
      else androidAffected = true;
    } else if (!file.endsWith(".md") && file !== ".gitignore") {
      unresolved.push(file);
    }
  }
  return {
    coreVersion: currentVersions.coreVersion,
    coordinated: sharedChanged || targets.size > 1,
    targets: ["edge", "ios", "orion", "android", "web"].filter((target) => targets.has(target)),
    pendingPlatforms: androidAffected && catalog.platforms.android.status !== "implemented" ? ["android"] : [],
    requiresReview: unresolved,
    reasons
  };
}
// Read the previous literal version declaration without executing historical code.
// If its format is unfamiliar, callers conservatively require all shared clients.
function parseVersionSource(source) {
  const values = {};
  for (const key of ["coreVersion", "edge", "orion", "ios", "android"]) {
    const pattern = new RegExp(`\\b${key}:\\s*(?:"([0-9]+\\.[0-9]+\\.[0-9]+)"|(null))`, "g");
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== 1) return undefined;
    values[key] = matches[0][1] ?? null;
  }
  if (!values.coreVersion) return undefined;
  const { coreVersion, ...platforms } = values;
  return { coreVersion, platforms };
}
module.exports = { planChanges, parseVersionSource };
