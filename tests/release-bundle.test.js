"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { unzipSync, zipSync } = require("fflate");
const { safeEntry, createArchive, readMetadata } = require("../scripts/lib/package-archive.js");
const { artifacts, packageInfo, recordArtifact, verifyBundle, newOutputDirectory } = require("../scripts/lib/release-bundle.js");

const clean = { sourceRevision: "a".repeat(40), sourceDirty: false };
function fixture(t, targets = ["edge", "ios", "orion"], state = clean) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tasu-release-test-"));
  // Only this exact mkdtemp-created directory is disposable.
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const plan = { ...state, targets, pendingPlatforms: ["android"], requiresReview: [] };
  for (const platform of targets) for (const spec of artifacts[platform]) {
    const prefix = platform === "ios" ? "Payload/TasuDownloader.app/" : "";
    const entries = { [`${prefix}build-info.json`]: Buffer.from(JSON.stringify(packageInfo(platform, state))) };
    if (platform !== "ios") {
      entries["manifest.json"] = Buffer.from(JSON.stringify({ version: packageInfo(platform, state).platformVersion, manifest_version: spec.manifestVersion }));
    } else {
      for (const file of ["Info.plist", "TasuDownloader", "rg-core.js", "rg-handlers.js", "rg-shared-rules.js", "sites.json"]) entries[prefix + file] = Buffer.from("fixture only");
    }
    fs.writeFileSync(path.join(directory, spec.file), createArchive(entries));
    recordArtifact(directory, platform, spec.file, state);
  }
  return { directory, plan, options: { expectedState: state } };
}
test("portable ZIP output is deterministic and uses forward slashes", () => {
  const a = { "common/settings.js": Buffer.from("fixture"), "manifest.json": Buffer.from("{}") };
  const b = Object.fromEntries(Object.entries(a).reverse());
  assert.deepEqual(createArchive(a), createArchive(b));
  assert.deepEqual(Object.keys(unzipSync(createArchive(a))), ["common/settings.js", "manifest.json"]);
  for (const name of ["../secret", "/secret", "common\\settings.js", "C:/secret", "a//b", "a/./b", "a\u0000b"]) assert.throws(() => safeEntry(name), /Unsafe/);
});
test("all four client artifacts must agree before a set is prepared", (t) => {
  const { directory, plan, options } = fixture(t);
  const result = verifyBundle(plan, directory, options);
  assert.equal(result.artifacts.length, 4);
  assert.equal(result.status, "prepared");
  assert.equal(result.published, false);
  assert.deepEqual(result.pendingPlatforms, ["android"]);
});
test("an Edge-only change needs only its own package", (t) => {
  const { directory, plan, options } = fixture(t, ["edge"]);
  assert.equal(verifyBundle(plan, directory, options).artifacts.length, 1);
});
test("missing iOS package prevents completing a coordinated set", (t) => {
  const { directory, plan, options } = fixture(t, ["edge", "orion"]);
  plan.targets.push("ios");
  assert.throws(() => verifyBundle(plan, directory, options), /ENOENT/);
});
test("dirty sources can only be reported as local previews", (t) => {
  const { directory, plan, options } = fixture(t, ["edge"], { ...clean, sourceDirty: true });
  assert.throws(() => verifyBundle(plan, directory, options), /local preview/);
  assert.equal(verifyBundle(plan, directory, { ...options, allowDirty: true }).status, "local-preview");
});
test("a replaced archive is rejected even when its old receipt remains", (t) => {
  const { directory, plan, options } = fixture(t, ["edge"]);
  fs.appendFileSync(path.join(directory, artifacts.edge[0].file), "changed");
  assert.throws(() => verifyBundle(plan, directory, options), /Damaged/);
});
for (const [field, wrong] of [["coreVersion", "9.0.0"], ["platformVersion", "9.0.0"], ["sourceRevision", "b".repeat(40)], ["downloadContractVersion", 9]]) {
  test(`mixed ${field} is rejected`, (t) => {
    const { directory, plan, options } = fixture(t, ["edge"]);
    const file = path.join(directory, artifacts.edge[0].file + ".receipt.json");
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    record[field] = wrong;
    fs.writeFileSync(file, JSON.stringify(record));
    assert.throws(() => verifyBundle(plan, directory, options), new RegExp(`Mixed ${field}`));
  });
}
test("unrelated files, unknown targets and unreviewed changes fail closed", (t) => {
  const { directory, plan, options } = fixture(t, ["edge"]);
  assert.throws(() => verifyBundle({ ...plan, targets: ["android"] }, directory, options), /No packaging adapter/);
  assert.throws(() => verifyBundle({ ...plan, targets: [] }, directory, options), /Invalid release targets/);
  assert.throws(() => verifyBundle({ ...plan, requiresReview: ["unknown"] }, directory, options), /Unclassified/);
  assert.throws(() => verifyBundle({ ...plan, sourceRevision: "b".repeat(40) }, directory, options), /different source/);
  fs.writeFileSync(path.join(directory, "private.json"), "{}");
  assert.throws(() => verifyBundle(plan, directory, options), /Unexpected release file/);
  assert.throws(() => newOutputDirectory("shared"), /direct subdirectory/);
});
test("wrong MV2/MV3 labels cannot be recorded", (t) => {
  const { directory } = fixture(t, ["orion"]);
  const wrong = createArchive({
    "build-info.json": Buffer.from(JSON.stringify(packageInfo("orion", clean))),
    "manifest.json": Buffer.from(JSON.stringify({ version: packageInfo("orion", clean).platformVersion, manifest_version: 2 }))
  });
  fs.writeFileSync(path.join(directory, artifacts.orion[0].file), wrong);
  assert.throws(() => recordArtifact(directory, "orion", artifacts.orion[0].file, clean), /Extension version differs/);
});
test("missing runtime files and unsafe archive paths cannot be recorded", () => {
  const info = Buffer.from(JSON.stringify(packageInfo("edge", clean)));
  const bytes = createArchive({ "build-info.json": info, "manifest.json": Buffer.from(JSON.stringify({ content_scripts: [{ js: ["missing.js"] }] })) });
  assert.throws(() => readMetadata(bytes, "edge"), /Missing extension package file/);
  assert.throws(() => readMetadata(createArchive({ "Payload/TasuDownloader.app/build-info.json": info }), "ios"), /Missing native package file/);
  // A malformed ZIP path is rejected without ever extracting it to the filesystem.
  assert.throws(() => readMetadata(zipSync({ "../escape": Buffer.from("x") }), "edge"), /Unsafe archive/);
});
