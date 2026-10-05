"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { root } = require("./shared-build.js");
const { buildInfo } = require("./versioning.js");
const { readMetadata, safeEntry } = require("./package-archive.js");

const artifacts = Object.freeze({
  edge: [{ file: "TasuDownloader-edge.zip", manifestVersion: 3 }],
  orion: [
    { file: "TasuDownloader-orion-mv3.xpi", manifestVersion: 3 },
    { file: "TasuDownloader-orion-mv2.xpi", manifestVersion: 2 }
  ],
  ios: [{ file: "TasuDownloader.ipa" }]
});
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function sourceState() {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const sourceRevision = git("rev-parse", "HEAD");
  if (!/^[a-f0-9]{40,64}$/.test(sourceRevision)) throw new Error("Invalid source revision");
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sourceRevision) throw new Error("Checkout does not match the CI revision");
  const sourceDirty = git("status", "--porcelain", "--untracked-files=all") !== "";
  if (process.env.CI && sourceDirty) throw new Error("CI packaging requires a clean checkout");
  return { sourceRevision, sourceDirty };
}
function packageInfo(platform, state = sourceState()) { return { ...buildInfo(platform), ...state }; }
function readRegular(directory, file) {
  safeEntry(file);
  const target = path.join(directory, file);
  if (!fs.lstatSync(target).isFile()) throw new Error(`Non-file release entry: ${file}`);
  return fs.readFileSync(target);
}

function recordArtifact(directory, platform, file, state = sourceState()) {
  const spec = artifacts[platform]?.find((item) => item.file === file);
  if (!spec) throw new Error(`Unexpected ${platform} artifact: ${file}`);
  const bytes = readRegular(directory, file);
  const expected = packageInfo(platform, state);
  const { info, manifest } = readMetadata(bytes, platform);
  if (JSON.stringify(info) !== JSON.stringify(expected)) throw new Error(`Embedded build identity differs: ${file}`);
  if (manifest && (manifest.version !== expected.platformVersion || manifest.manifest_version !== spec.manifestVersion)) {
    throw new Error(`Extension version differs: ${file}`);
  }
  const record = { file, ...expected, ...(spec.manifestVersion ? { manifestVersion: spec.manifestVersion } : {}), size: bytes.length, sha256: sha256(bytes) };
  fs.writeFileSync(path.join(directory, `${file}.receipt.json`), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  return record;
}

function verifyBundle(plan, directory, { allowDirty = false, expectedState = sourceState() } = {}) {
  if (plan.sourceRevision !== expectedState.sourceRevision || plan.sourceDirty !== expectedState.sourceDirty) throw new Error("Release plan has a different source identity");
  if (expectedState.sourceDirty && !allowDirty) throw new Error("Uncommitted sources are only a local preview");
  if (plan.requiresReview?.length) throw new Error("Unclassified changes need review before preparing a release");
  if (!Array.isArray(plan.targets) || !plan.targets.length || new Set(plan.targets).size !== plan.targets.length) throw new Error("Invalid release targets");
  const expectedFiles = [];
  const result = [];
  for (const platform of plan.targets) {
    if (!artifacts[platform]) throw new Error(`No packaging adapter for ${platform}`);
    for (const spec of artifacts[platform]) {
      const receiptName = `${spec.file}.receipt.json`;
      expectedFiles.push(spec.file, receiptName);
      const record = JSON.parse(readRegular(directory, receiptName).toString("utf8"));
      const bytes = readRegular(directory, spec.file);
      const expected = packageInfo(platform, expectedState);
      for (const [key, value] of Object.entries(expected)) {
        if (record[key] !== value) throw new Error(`Mixed ${key}: ${spec.file}`);
      }
      if (record.file !== spec.file || record.size !== bytes.length || record.sha256 !== sha256(bytes)) throw new Error(`Damaged or replaced artifact: ${spec.file}`);
      const { info, manifest } = readMetadata(bytes, platform);
      for (const [key, value] of Object.entries(expected)) {
        if (info[key] !== value) throw new Error(`Mixed embedded ${key}: ${spec.file}`);
      }
      if (manifest && (manifest.version !== expected.platformVersion || manifest.manifest_version !== spec.manifestVersion || record.manifestVersion !== spec.manifestVersion)) {
        throw new Error(`Wrong manifest variant: ${spec.file}`);
      }
      result.push(record);
    }
  }
  const allowed = new Set([...expectedFiles, "release-plan.json", "release-manifest.json"]);
  for (const name of fs.readdirSync(directory)) {
    safeEntry(name);
    if (!allowed.has(name)) throw new Error(`Unexpected release file: ${name}`);
    if (!fs.lstatSync(path.join(directory, name)).isFile()) throw new Error(`Non-file release entry: ${name}`);
  }
  return {
    schemaVersion: 1, status: expectedState.sourceDirty ? "local-preview" : "prepared",
    published: false, coreVersion: buildInfo("edge").coreVersion, ...expectedState,
    targets: plan.targets, pendingPlatforms: plan.pendingPlatforms || [], artifacts: result
  };
}

// New, empty output folders prevent files from a previous build being reused.
function newOutputDirectory(relative) {
  const dist = path.join(root, "dist");
  fs.mkdirSync(dist, { recursive: true });
  if (fs.realpathSync(dist) !== path.join(fs.realpathSync(root), "dist")) throw new Error("Linked dist directory is not allowed");
  if (!relative) return fs.mkdtempSync(path.join(dist, "release-"));
  const directory = path.resolve(root, relative);
  if (path.dirname(directory) !== dist) throw new Error("Package output must be a new direct subdirectory of dist");
  fs.mkdirSync(directory); // EEXIST is intentional, even if the old folder is empty.
  return directory;
}
module.exports = { artifacts, sha256, sourceState, packageInfo, recordArtifact, verifyBundle, newOutputDirectory };
