/*
 * Assembles the JS payload the TasuDownloader iOS app injects into its in-app
 * browser (WKWebView).
 *
 * Same philosophy as build-orion-ios.js: the site handlers are copied out of
 * edge-extension/ at build time, never forked, so a parser fix on the desktop
 * side ships to the app with the next build. What the manifest did for the
 * extension (host matching, run_at, worlds) is reproduced here:
 *
 *   rg-core.js      documentStart, app world  — chrome.* bridge + settings + CSS
 *   rg-handlers.js  documentEnd,   app world  — host-guarded site handlers
 *   rg-page-hook.js documentStart, page world — RedGifs clipboard hook
 *
 * Run: node scripts/build-ios-app-js.js   (CI runs it before xcodegen)
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const shared = path.join(root, "edge-extension");
const iosApp = path.join(root, "ios-app");
const outDir = path.join(iosApp, "Resources", "generated");

// Mirrors the content_scripts entries of orion-ios/manifest.mv3.json.
const SITES = [
  { host: "(^|\\.)redgifs\\.com$", files: ["content-folders.js", "content-redgifs.js"] },
  { host: "(^|\\.)reddit\\.com$", files: ["content-folders.js", "content-reddit.js"] },
  { host: "(^|\\.)scrolller\\.com$", files: ["content-folders.js", "content-scrolller-v2.js"] },
  { host: "(^|\\.)coomer\\.st$", files: ["content-coomer.js"] },
  { host: "(^|\\.)instagram\\.com$", files: ["content-folders.js", "content-instagram.js"] }
];

const read = (...parts) => fs.readFileSync(path.join(...parts), "utf8");

const version = JSON.parse(read(shared, "manifest.json")).version;

// The app browser has no Orion toolbar at the bottom and brings its own native
// Reddit search overlay, so the extension's is hidden and the bottom offset is
// reduced to the safe area.
const appCss = `${read(root, "orion-ios", "ios-mobile.css")}
/* ---- app-only overrides (in-app browser, not Orion) ---- */
:root { --rg-ios-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px); }
#rg-reddit-search-trigger, #rg-reddit-search-panel { display: none !important; }
`;

const core = read(iosApp, "native-bridge.js")
  .replace("__RG_VERSION__", version)
  .replace("__RG_CSS__", JSON.stringify(appCss))
  + "\n" + read(shared, "common", "settings.js");

const handlers = SITES.map(({ host, files }) => {
  const body = files.map((file) => read(shared, file)).join("\n");
  return `;(() => {\n  if (!new RegExp(${JSON.stringify(host)}, "i").test(location.hostname)) return;\n${body}\n})();\n`;
}).join("\n");

const pageHook = `;(() => {\n  if (!new RegExp("(^|\\\\.)redgifs\\\\.com$", "i").test(location.hostname)) return;\n${read(shared, "page-hook-redgifs.js")}\n})();\n`;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const outputs = {
  "rg-core.js": core,
  "rg-handlers.js": handlers,
  "rg-page-hook.js": pageHook
};

for (const [name, content] of Object.entries(outputs)) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, content, "utf8");
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) throw new Error(`${name}: ${check.stderr.trim()}`);
  console.log(`  ${name}  ${(content.length / 1024).toFixed(1)} KB`);
}
console.log(`Assembled iOS app payload v${version} -> ${outDir}`);
