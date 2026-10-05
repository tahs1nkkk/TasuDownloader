"use strict";

const fs = require("node:fs");
const path = require("node:path");
const catalog = require("../../shared/core/sites.js");
const { buildInfo, iosBuild } = require("./versioning.js");
const root = path.resolve(__dirname, "../..");
const sharedRoot = path.join(root, "shared");
const coreFiles = ["common/sites.js", "common/settings.js", "common/media-rules.js", "common/download-contract.js", "common/version.js", "common/lifecycle.js", "common/ui.js"];
const nativeRuleFiles = ["common/sites.js", "common/media-rules.js", "common/download-contract.js", "common/native-api.js"];

// Runtime paths stay stable for already-loaded unpacked Edge installations.
const assets = {
  "common/lifecycle.js": "core/lifecycle.js",
  "common/version.js": "core/version.js",
  "common/sites.js": "core/sites.js",
  "common/settings.js": "core/settings.js",
  "common/media-rules.js": "core/media-rules.js",
  "common/download-contract.js": "core/download-contract.js",
  "common/native-api.js": "core/native-api.js",
  "common/scrolller-resolve.js": "core/scrolller-resolve.js",
  "content-folders.js": "ui/folders.js",
  "common/ui.js": "ui/feedback.js"
};
for (const site of catalog.sites) {
  assets[site.handler] = `sites/${site.id}.js`;
  if (site.pageHook) assets[site.pageHook] = `hooks/${site.id}.js`;
}
Object.freeze(assets);

function sourcePath(runtimePath) {
  if (!Object.hasOwn(assets, runtimePath)) throw new Error(`Unknown shared asset: ${runtimePath}`);
  return path.join(sharedRoot, assets[runtimePath]);
}

function readAsset(runtimePath) {
  return fs.readFileSync(sourcePath(runtimePath), "utf8").replace(/\r\n/g, "\n");
}

function generatedAsset(runtimePath) {
  return `// Generated from shared/${assets[runtimePath]}; run npm run build:shared. Do not edit.\n${readAsset(runtimePath)}`;
}

function handlerFiles(site) {
  return [...(site.folders ? ["content-folders.js"] : []), site.handler];
}

function hostPattern(site) {
  return `(^|\\.)${site.domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}

function manifestFor(platform, template) {
  if (!["edge", "orion"].includes(platform)) throw new Error(`Not an extension platform: ${platform}`);
  const sites = catalog.forPlatform(platform);
  const manifest = structuredClone(template);
  manifest.version = buildInfo(platform).platformVersion;
  manifest.content_scripts = sites.flatMap((site) => {
    const frames = site.allFrames ? { all_frames: true } : {};
    const scripts = [];
    if (platform === "edge" && site.pageHook) {
      scripts.push({ matches: site.matches, js: [site.pageHook], run_at: "document_start", world: "MAIN", ...frames });
    }
    const bridgeFiles = site.bridgeModules?.[platform] || [];
    scripts.push({
      matches: site.matches,
      js: [...coreFiles, ...bridgeFiles, platform === "edge" ? "common/weblink.js" : "ios-bridge.js", ...handlerFiles(site)],
      ...(platform === "orion" ? { css: ["ios-mobile.css"] } : {}),
      run_at: "document_idle", ...frames
    });
    return scripts;
  });
  for (const helper of catalog.legacyHelpers.filter((entry) => entry.platforms.includes(platform))) {
    manifest.content_scripts.push({ matches: helper.matches, js: [...coreFiles, helper.handler], run_at: "document_idle" });
  }
  if (platform === "orion") {
    const hooks = sites.filter((site) => site.pageHook);
    manifest.web_accessible_resources = manifest.manifest_version === 2
      ? hooks.map((site) => site.pageHook)
      : hooks.map((site) => ({ resources: [site.pageHook], matches: site.matches }));
  }
  return manifest;
}

// The hub compares its menu and worker builds; both read this one stamped value.
function hubCatalog() {
  const file = path.join(root, "edge-extension/hub/catalog.js");
  const source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const pattern = /\bbuild: "[^"]*"/g;
  if ((source.match(pattern) || []).length !== 1) throw new Error("edge-extension/hub/catalog.js must declare exactly one build value");
  return source.replace(pattern, `build: ${JSON.stringify(buildInfo("edge").platformVersion)}`);
}

function edgeOutputs() {
  const outputs = new Map(Object.keys(assets).map((name) => [path.join(root, "edge-extension", name), generatedAsset(name)]));
  outputs.set(path.join(root, "ios-app/Sources/Downloads/DownloadRequest.swift"), swiftDownloadRequest());
  const developmentBuild = iosBuild("");
  outputs.set(path.join(root, "ios-app/Versions.xcconfig"),
    `// Generated from shared/core/version.js; run npm run build:shared. Do not edit.\nMARKETING_VERSION = ${developmentBuild.version}\nCURRENT_PROJECT_VERSION = ${developmentBuild.buildNumber}\n`);
  outputs.set(path.join(root, "edge-extension/build-info.json"), `${JSON.stringify(buildInfo("edge"), null, 2)}\n`);
  outputs.set(path.join(root, "edge-extension/hub/catalog.js"), hubCatalog());
  for (const [platform, relative] of [
    ["edge", "edge-extension/manifest.json"],
    ["orion", "orion-ios/manifest.mv3.json"],
    ["orion", "orion-ios/manifest.mv2.json"]
  ]) {
    const file = path.join(root, relative);
    const template = JSON.parse(fs.readFileSync(file, "utf8"));
    outputs.set(file, `${JSON.stringify(manifestFor(platform, template), null, 2)}\n`);
  }
  return outputs;
}

function swiftDownloadRequest() {
  const { fields } = require("../../shared/core/download-contract.js");
  const types = { strings: "[String]", string: "String", boolean: "Bool", number: "Double" };
  const properties = Object.entries(fields).map(([name, field]) =>
    `    let ${name}: ${types[field.type]}${field.optional ? "?" : ""}`
  ).join("\n");
  return `// Generated from shared/core/download-contract.js; run npm run build:shared. Do not edit.
import Foundation

struct DownloadRequest: Decodable {
    let type: String
    let contractVersion: Int
${properties}

    static func parse(_ message: [String: Any], core: SharedCore = .shared) throws -> DownloadRequest {
        try core.decode(DownloadRequest.self, operation: "download", input: message)
    }
}
`;
}

function resetGeneratedDirectory(relative) {
  if (!["ios-app/Resources/generated", "dist/orion-ios"].includes(relative)) {
    throw new Error(`Not a disposable build directory: ${relative}`);
  }
  const directory = path.resolve(root, relative);
  const realRoot = fs.realpathSync(root);
  // Check existing ancestors as well: a symlink/junction must not redirect cleanup.
  let existing = directory;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const realExisting = fs.realpathSync(existing);
  if (realExisting !== realRoot && !realExisting.startsWith(realRoot + path.sep)) {
    throw new Error(`Build directory escapes the workspace: ${directory}`);
  }
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error(`Refusing to clean a linked directory: ${directory}`);
  }
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
}

module.exports = { root, catalog, coreFiles, nativeRuleFiles, assets, sourcePath, readAsset, generatedAsset, handlerFiles, hostPattern, manifestFor, edgeOutputs, resetGeneratedDirectory };
