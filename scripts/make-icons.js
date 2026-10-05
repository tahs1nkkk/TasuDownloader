#!/usr/bin/env node
"use strict";
// Render the existing geometric downloader identity from one canonical SVG.
// No network, image model or native dependency; all client icons stay identical.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const svg = fs.readFileSync(path.join(root, "shared/ui/app-icon.svg"), "utf8");
const targets = [
  ["ios-app/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png", 1024],
  ["cloud/web/public/icon-180.png", 180], ["cloud/web/public/icon-192.png", 192],
  ["cloud/web/public/icon-512.png", 512], ["cloud/web/public/favicon.png", 64],
  ...[16, 32, 48, 128].map(size => [`edge-extension/icon-${size}.png`, size])
];
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    for (const [file, size] of targets) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#e4eafa}svg{display:block;width:100%;height:100%}</style>${svg}`);
      const output = path.join(root, file);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      await page.screenshot({ path: output, omitBackground: false });
      console.log(`${file} ${size} x ${size}`);
    }
    fs.writeFileSync(path.join(root, "edge-extension/icon.svg"), svg);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
