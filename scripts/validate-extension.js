const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { syncShared } = require("./build-shared.js");
syncShared({ check: true });
const hubCheck=spawnSync(process.execPath,[path.join(__dirname,"build-hub.js"),"--check"],{encoding:"utf8"});
if(hubCheck.status!==0)throw new Error(hubCheck.stderr||"Hub build is stale");

const root = path.resolve(__dirname, "..", "edge-extension");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const referenced = new Set();

referenced.add(manifest.background.service_worker);
referenced.add(manifest.action.default_popup);
for (const icon of Object.values(manifest.icons || {})) referenced.add(icon);
for (const icon of Object.values(manifest.action.default_icon || {})) referenced.add(icon);
for (const entry of manifest.content_scripts || []) {
  for (const file of entry.js || []) referenced.add(file);
  if (entry.js.some((file) => /^content-(?!ripsnip)/.test(path.basename(file)))) {
    const sharedIndex = entry.js.indexOf("common/settings.js");
    const catalogIndex = entry.js.indexOf("common/sites.js");
    if (catalogIndex < 0 || sharedIndex < 0 || catalogIndex > sharedIndex) {
      throw new Error(`Missing or unordered shared dependencies in: ${entry.matches.join(", ")}`);
    }
  }
}

for (const file of referenced) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Manifest references missing file: ${file}`);
}

function htmlFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?htmlFiles(path.join(dir,entry.name)):entry.name.endsWith(".html")?[path.relative(root,path.join(dir,entry.name))]:[]);}
for (const htmlName of htmlFiles(root)) {
  const html = fs.readFileSync(path.join(root, htmlName), "utf8");
  if (html.includes('src="common/settings.js"') &&
      (html.indexOf('src="common/sites.js"') < 0 || html.indexOf('src="common/sites.js"') > html.indexOf('src="common/settings.js"'))) {
    throw new Error(`${htmlName} must load the site catalog before settings.`);
  }
  const assetPattern = /<(?:script|link|img|use)\b[^>]+(?:src|href)="([^"]+)"/g;
  for (const match of html.matchAll(assetPattern)) {
    const asset = match[1].split(/[?#]/)[0];
    if (!asset) continue;
    if (/^(?:https?:|data:|#)/i.test(asset)) continue;
    if (!fs.existsSync(path.resolve(root, path.dirname(htmlName), asset))) throw new Error(`${htmlName} references missing asset: ${asset}`);
    referenced.add(asset);
  }
}

function collectJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJs(full);
    return entry.isFile() && entry.name.endsWith(".js") ? [full] : [];
  });
}

for (const file of [...collectJs(root), ...collectJs(path.join(root, "..", "shared")), ...collectJs(path.join(root, "..", "scripts"))]) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${path.relative(root, file)}: ${result.stderr.trim()}`);
}

console.log(`Extension validation passed (${referenced.size} manifest assets).`);
