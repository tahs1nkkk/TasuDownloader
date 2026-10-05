"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { root, assets } = require("./lib/shared-build.js");
const { syncShared } = require("./build-shared.js");
const { directoryEntries, createArchive } = require("./lib/package-archive.js");
const { packageInfo, sourceState, recordArtifact, newOutputDirectory, verifyBundle } = require("./lib/release-bundle.js");

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Missing ${name} value`);
  return args[index + 1];
}
for (let i = 0; i < args.length; i += 2) if (!["--targets", "--out"].includes(args[i])) throw new Error(`Unknown option: ${args[i]}`);
const targets = option("--targets", "edge,orion").split(",");
if (!targets.length || new Set(targets).size !== targets.length || targets.some((target) => !["edge", "orion"].includes(target))) {
  throw new Error("This packager supports edge,orion only; iOS needs the macOS build job");
}
syncShared({ check: true });
const state = sourceState();
const directory = newOutputDirectory(option("--out"));
const build = (...args) => {
  const output = execFileSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 60_000 });
  process.stdout.write(output);
};
function save(platform, source, file, include) {
  const entries = directoryEntries(source, include);
  entries["build-info.json"] = Buffer.from(JSON.stringify(packageInfo(platform, state), null, 2) + "\n");
  fs.writeFileSync(path.join(directory, file), createArchive(entries), { flag: "wx" });
  recordArtifact(directory, platform, file, state);
}
if (targets.includes("edge")) {
  // Package runtime assets only; never sweep unrelated workspace/user data into a ZIP.
  const include = (name) => Object.hasOwn(assets, name) || ["common/cloud.js", "common/weblink.js", "common/archive-access.js", "common/download-feedback.js", "manifest.json", "build-info.json", "background.js", "content-ripsnip.js", "icon.svg"].includes(name)
    || /^(?:popup|popup-ui|archive|debug-guide|glass-pages)\.(?:html|css|js)$/.test(name) || /^icon-(?:16|32|48|128)\.png$/.test(name)
    || name === "hub.html" || /^hub\/[a-zA-Z0-9/_-]+\.(?:js|css|html|svg|png)$/.test(name)
    || name === "assets/menu-icons.svg" || /^assets\/sites\/(?:(?:redgifs|reddit|scrolller|onlyfans)\.png|coomer\.svg|instagram\.webp)$/.test(name)
    || /^assets\/hub\/(?:(?:downloader-banner-v2|roblox-banner-v2|music-banner-v2|glass-surface-v2|spotify-original)\.png|(?:instagram-original|youtube-reference)\.webp|roblox-original\.ico)$/.test(name);
  save("edge", path.join(root, "edge-extension"), "TasuDownloader-edge.zip", include);
}
if (targets.includes("orion")) {
  // Build MV2 first so the familiar dist/orion-ios folder ends on preferred MV3.
  for (const variant of [2, 3]) {
    build("scripts/build-orion-ios.js", "--no-archive", ...(variant === 2 ? ["--mv2"] : []));
    save("orion", path.join(root, "dist/orion-ios"), `TasuDownloader-orion-mv${variant}.xpi`);
  }
}
const plan = { ...state, targets, pendingPlatforms: [], requiresReview: [] };
fs.writeFileSync(path.join(directory, "release-manifest.json"), JSON.stringify(verifyBundle(plan, directory, { expectedState: state, allowDirty: !process.env.CI }), null, 2) + "\n");
console.log(`Prepared ${targets.join(", ")} packages: ${directory}`);
console.log(state.sourceDirty ? "Local preview only: source changes are uncommitted. Nothing was published." : "Prepared artifacts only. Nothing was published.");
