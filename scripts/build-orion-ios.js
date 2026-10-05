/*
 * Packages the Orion / iOS build.
 *
 * The site handlers are deliberately not forked: they are copied out of
 * shared/ at build time, so a parser fix on the desktop side ships to
 * the phone with the next build. Only the manifest and ios-bridge.js live in
 * orion-ios/.
 *
 *   node scripts/build-orion-ios.js          # manifest v3 (try this first)
 *   node scripts/build-orion-ios.js --mv2    # manifest v2 fallback
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { assets, generatedAsset, manifestFor, resetGeneratedDirectory } = require("./lib/shared-build.js");
const { buildInfo } = require("./lib/versioning.js");

const root = path.resolve(__dirname, "..");
const edgeAssets = path.join(root, "edge-extension");
const iosSrc = path.join(root, "orion-ios");
const dist = path.join(root, "dist");
const outDir = path.join(dist, "orion-ios");

const useMv2 = process.argv.includes("--mv2");
const manifestName = useMv2 ? "manifest.mv2.json" : "manifest.mv3.json";
const manifest = manifestFor("orion", JSON.parse(fs.readFileSync(path.join(iosSrc, manifestName), "utf8")));

// Platform UI comes from Orion; runtime sources come directly from shared/.
// Icons and other desktop-owned UI assets can still be reused from Edge.
// popup.html/js are rewritten rather than copied: the desktop popup is full of
// controls that cannot work on a phone.
const IOS_OWNED = new Set(["ios-bridge.js", "ios-mobile.css", "popup.html", "popup.js"]);

function copyInto(relative) {
  const to = path.join(outDir, relative);
  if (!to.startsWith(outDir + path.sep)) throw new Error(`Unsafe asset path: ${relative}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (Object.hasOwn(assets, relative)) {
    fs.writeFileSync(to, generatedAsset(relative), "utf8");
  } else {
    const from = IOS_OWNED.has(relative) ? path.join(iosSrc, relative) : path.join(edgeAssets, relative);
    if (!fs.existsSync(from)) throw new Error(`Missing source file: ${relative}`);
    fs.copyFileSync(from, to);
  }
  return to;
}

function collectReferences() {
  const files = new Set();
  for (const entry of manifest.content_scripts || []) {
    for (const file of entry.js || []) files.add(file);
    for (const file of entry.css || []) files.add(file);
  }
  for (const icon of Object.values(manifest.icons || {})) files.add(icon);

  const action = manifest.action || manifest.browser_action || {};
  if (action.default_popup) files.add(action.default_popup);
  for (const icon of Object.values(action.default_icon || {})) files.add(icon);

  for (const war of manifest.web_accessible_resources || []) {
    if (typeof war === "string") files.add(war);
    else for (const resource of war.resources || []) files.add(resource);
  }
  return files;
}

function collectHtmlAssets(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const found = [];
  for (const match of html.matchAll(/<(?:script|link|img)\b[^>]+(?:src|href)="([^"]+)"/g)) {
    const asset = match[1];
    if (/^(?:https?:|data:|#)/i.test(asset)) continue;
    found.push(asset);
  }
  return found;
}

resetGeneratedDirectory("dist/orion-ios");

const pending = [...collectReferences()];
const copied = new Set();
while (pending.length) {
  const relative = pending.shift();
  if (copied.has(relative)) continue;
  const written = copyInto(relative);
  copied.add(relative);
  // Popup and debug-guide pages pull in their own CSS/JS; follow those too.
  if (written.endsWith(".html")) pending.push(...collectHtmlAssets(written));
}

fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "build-info.json"), `${JSON.stringify(buildInfo("orion"), null, 2)}\n`, "utf8");

// The harness lives beside the built files so it can load them by relative path,
// but outside outDir so it never ends up inside the shipped .xpi.
fs.copyFileSync(path.join(iosSrc, "harness.html"), path.join(dist, "__harness.html"));

for (const relative of copied) {
  if (!relative.endsWith(".js")) continue;
  const result = spawnSync(process.execPath, ["--check", path.join(outDir, relative)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${relative}: ${result.stderr.trim()}`);
}

// Orion installs a zipped extension; the .xpi extension is what its "install
// from file" picker expects, and it is a plain zip underneath.
if (process.argv.includes("--no-archive")) {
  console.log(`Validated Orion manifest v${manifest.manifest_version}: ${copied.size + 2} files at ${outDir}`);
  process.exit(0);
}

const zipPath = path.join(dist, "RedGifsDownloader-orion-ios.zip");
const xpiPath = path.join(dist, "RedGifsDownloader-orion-ios.xpi");
// One portable ZIP writer keeps forward-slash names on every build host.
// Compatibility filenames remain unchanged for existing manual installers.
const { directoryEntries, createArchive } = require("./lib/package-archive.js");
const archive = createArchive(directoryEntries(outDir));
fs.writeFileSync(zipPath, archive);
fs.writeFileSync(xpiPath, archive);

console.log(`Built ${useMv2 ? "manifest v2" : "manifest v3"} package: ${copied.size + 2} files`);
console.log(`  folder: ${outDir}`);
console.log(`  upload: ${xpiPath}`);
