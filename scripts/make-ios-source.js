#!/usr/bin/env node
// SideStore / AltStore "kaynak" (source) dosyası üretir. Telefonda SideStore'a
// tek bir URL eklersin; her yeni CI derlemesi burada otomatik bir "güncelleme"
// olarak görünür, böylece .ipa'yı elle bulup indirmen gerekmez.
//
// CI bu betiği release adımında, gerçek .ipa paketlendikten sonra çağırır ve
// çıktıyı `latest` release'ine `apps.json` olarak yükler. Kaynak URL'si:
//   https://github.com/<repo>/releases/download/latest/apps.json
//
// Sürüm (APP_VERSION) run numarasından türetildiği için her derlemede artar —
// SideStore güncellemeyi ancak sürüm yükselirse gösterir. Boyut ve sha256
// gerçek dosyadan hesaplanır (SideStore kurulumda boyutu ve — varsa — sha'yı
// kullanır).
"use strict";

const fs = require("fs");
const path = require("path");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Ortam değişkeni eksik: ${name}`);
  return value;
}

const repo = required("REPO"); // "owner/repo"
const version = required("APP_VERSION"); // ör. "1.0.42"
const date = required("APP_DATE"); // ör. "2026-08-07"
const size = Number(required("IPA_SIZE")); // bayt
const sha256 = process.env.IPA_SHA256 || ""; // opsiyonel ama önerilir

const downloadURL = `https://github.com/${repo}/releases/download/latest/TasuDownloader.ipa`;
const sourceURL = `https://github.com/${repo}/releases/download/latest/apps.json`;
const iconURL = `https://raw.githubusercontent.com/${repo}/main/ios-app/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png`;

const description =
  "TasuDownloader — RedGifs, Reddit, Instagram, Scrolller, Coomer ve OnlyFans " +
  "için medya indirici; bulut arşivi ve listeler.";
const notes = `Otomatik derleme ${version} (${date}).`;

// Sürüm nesnesi (modern SideStore/AltStore biçimi). sha256 yalnız doluysa eklenir.
const versionEntry = {
  version,
  date,
  localizedDescription: notes,
  downloadURL,
  size,
  minOSVersion: "17.0"
};
if (sha256) versionEntry.sha256 = sha256;

const app = {
  name: "TasuDownloader",
  bundleIdentifier: "com.tasuapps.tasudownloader",
  developerName: "Tasu Apps",
  subtitle: "Medya indirici + bulut arşivi",
  localizedDescription: description,
  iconURL,
  tintColor: "2563EB",
  category: "utilities",
  screenshotURLs: [],
  // Modern istemciler `versions`'ı okur; eski ayrıştırıcılar için üstteki düz
  // alanları da (version/versionDate/downloadURL/size) yansıtıyoruz.
  versions: [versionEntry],
  version,
  versionDate: date,
  versionDescription: notes,
  downloadURL,
  size
};

const source = {
  name: "Tasu Downloader",
  identifier: "com.tasuapps.tasudownloader.source",
  sourceURL,
  apps: [app],
  news: []
};

const outDir = path.join(process.cwd(), "dist");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "apps.json");
fs.writeFileSync(outPath, JSON.stringify(source, null, 2) + "\n");
console.log(`apps.json yazıldı: ${outPath} (v${version}, ${size} bayt${sha256 ? ", sha256 dahil" : ""})`);
