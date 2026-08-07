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

// Mirrors the content_scripts entries of orion-ios/manifest.mv3.json, and is
// also the single source of truth for the app's home screen tiles: `id`, `name`,
// `url` and `tint` are emitted as sites.json, which SiteCatalog.swift reads. Add
// a site here and its tile appears — there is no second list to keep in sync.
const SITES = [
  {
    id: "redgifs",
    name: "RedGifs",
    url: "https://www.redgifs.com",
    tint: "#FF3B5C",
    host: "(^|\\.)redgifs\\.com$",
    files: ["content-folders.js", "content-redgifs.js"]
  },
  {
    id: "reddit",
    name: "Reddit",
    url: "https://www.reddit.com",
    tint: "#FF4500",
    host: "(^|\\.)reddit\\.com$",
    files: ["content-folders.js", "content-reddit.js"]
  },
  {
    id: "scrolller",
    name: "Scrolller",
    url: "https://scrolller.com",
    tint: "#3D8BFD",
    host: "(^|\\.)scrolller\\.com$",
    files: ["content-folders.js", "content-scrolller-v2.js"]
  },
  {
    id: "coomer",
    name: "Coomer",
    url: "https://coomer.st",
    tint: "#22C55E",
    host: "(^|\\.)coomer\\.st$",
    files: ["content-coomer.js"]
  },
  {
    id: "instagram",
    name: "Instagram",
    url: "https://www.instagram.com",
    tint: "#E1306C",
    host: "(^|\\.)instagram\\.com$",
    files: ["content-folders.js", "content-instagram.js"]
  }
];

// Every button the handlers inject, taken from orion-ios/ios-mobile.css. The app
// keeps them in the DOM — their click handlers are the media resolvers the
// floating button drives — but never shows them.
const HANDLER_BUTTONS = [
  "#rg-ripsnip-helper-button",
  "#rg-ripsnip-viewer-button",
  "#rg-ripsnip-avatar-button",
  ".rg-ripsnip-tile-button",
  ".rg-downloader-reddit-button",
  ".rg-downloader-reddit-multi-button",
  ".rg-coomer-download",
  "#rg-ig-one",
  "#rg-ig-all",
  // Scrolller's single shadow host. This is an element id, not a custom tag name
  // (content-scrolller-v2.js sets HOST_ID), so the # matters — without it the
  // selector matches nothing and its button stays on screen.
  "#rg-scrolller-v2-host"
];

const read = (...parts) => fs.readFileSync(path.join(...parts), "utf8");

const version = JSON.parse(read(shared, "manifest.json")).version;

// The app browser has no Orion toolbar at the bottom and brings its own native
// Reddit search overlay, so the extension's is hidden and the bottom offset is
// reduced to the safe area.
//
// The handler buttons are hidden with opacity rather than `display: none`: the
// app's floating button locates media by geometry and then clicks the handler
// button covering it, and a display:none element reports a zero rect. Kept
// laid out but transparent, it still measures correctly, and pointer-events
// keeps a stray tap from firing a download the user did not ask for.
//
// Each selector is prefixed with `html ` on purpose. Coomer's button styles
// itself with `all: initial !important` from a stylesheet the handler injects
// at runtime — later in the document than this one — so at equal specificity it
// won its `opacity` back and the buttons reappeared. `html <selector>` outranks
// the bare class, so the hide wins regardless of injection order.
const hideSelector = HANDLER_BUTTONS.map((sel) => `html ${sel}`).join(",\n");
const appCss = `${read(root, "orion-ios", "ios-mobile.css")}
/* ---- app-only overrides (in-app browser, not Orion) ---- */
:root { --rg-ios-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px); }
#rg-reddit-search-trigger, #rg-reddit-search-panel { display: none !important; }
${hideSelector} {
  opacity: 0 !important;
  pointer-events: none !important;
}
`;

const core = read(iosApp, "native-bridge.js")
  .replace("__RG_VERSION__", version)
  .replace("__RG_CSS__", JSON.stringify(appCss))
  .replace("__RG_BUTTONS__", JSON.stringify(HANDLER_BUTTONS.join(", ")))
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

const catalog = SITES.map(({ id, name, url, tint }) => ({ id, name, url, tint }));
fs.writeFileSync(path.join(outDir, "sites.json"), JSON.stringify(catalog, null, 2), "utf8");
console.log(`  sites.json  ${catalog.length} site`);

console.log(`Assembled iOS app payload v${version} -> ${outDir}`);
