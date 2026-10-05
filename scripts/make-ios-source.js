#!/usr/bin/env node
// Generate a SideStore/AltStore feed from the same version calculation as the IPA.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const catalog = require("../shared/core/sites.js");
const { iosBuild, versions } = require("./lib/versioning.js");

function makeSource({ repo, date, size, sha256 = "", version = iosBuild().version }) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo || "")) throw new Error("Invalid repository identifier.");
  if (version !== iosBuild().version) throw new Error("Feed version does not match the iOS build version.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("Invalid release date.");
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error("Invalid IPA size.");
  if (sha256 && !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error("Invalid IPA hash.");
  const downloadURL = `https://github.com/${repo}/releases/download/latest/TasuDownloader.ipa`;
  const sourceURL = `https://github.com/${repo}/releases/download/latest/apps.json`;
  const iconURL = `https://raw.githubusercontent.com/${repo}/main/ios-app/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png`;
  const description = `TasuDownloader — ${catalog.forPlatform("ios").map((site) => site.name).join(", ")} için medya indirici; bulut arşivi ve listeler.`;
  const notes = `Otomatik derleme ${version} (${date}); ortak çekirdek ${versions.coreVersion}.`;
  const versionEntry = {
    version, date, localizedDescription: notes, downloadURL, size, minOSVersion: "17.0",
    ...(sha256 ? { sha256 } : {})
  };
  return {
    name: "Tasu Downloader",
    identifier: "com.tasuapps.tasudownloader.source",
    sourceURL,
    apps: [{
      name: "TasuDownloader",
      bundleIdentifier: "com.tasuapps.tasudownloader",
      developerName: "Tasu Apps",
      subtitle: "Medya indirici + bulut arşivi",
      localizedDescription: description,
      iconURL, tintColor: "2563EB", category: "utilities", screenshotURLs: [],
      versions: [versionEntry],
      version, versionDate: date, versionDescription: notes, downloadURL, size
    }],
    news: []
  };
}

if (require.main === module) {
  const source = makeSource({
    repo: process.env.REPO,
    date: process.env.APP_DATE,
    size: Number(process.env.IPA_SIZE),
    sha256: process.env.IPA_SHA256 || "",
    version: process.env.APP_VERSION || iosBuild().version
  });
  const outDir = path.resolve(__dirname, "../dist");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "apps.json");
  fs.writeFileSync(outPath, JSON.stringify(source, null, 2) + "\n");
  console.log(`apps.json written: ${outPath} (v${source.apps[0].version})`);
}
module.exports = { makeSource };
