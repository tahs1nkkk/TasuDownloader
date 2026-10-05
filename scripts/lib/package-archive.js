"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { zipSync, unzipSync } = require("fflate");

function safeEntry(name) {
  if (typeof name !== "string" || !name || /[\\:\x00-\x1f]/.test(name) ||
      name.startsWith("/") || name.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe archive entry: ${name}`);
  }
  return name;
}

function directoryEntries(directory, include = () => true) {
  const entries = Object.create(null);
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error("Linked archive directory is not allowed");
  function visit(relative) {
    for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      safeEntry(name);
      if (entry.isSymbolicLink()) throw new Error(`Linked archive entry is not allowed: ${name}`);
      if (entry.isDirectory()) visit(name);
      else if (entry.isFile() && include(name)) entries[name] = fs.readFileSync(path.join(directory, name));
    }
  }
  visit("");
  return entries;
}

function createArchive(entries) {
  const sorted = Object.create(null);
  for (const name of Object.keys(entries).sort()) sorted[safeEntry(name)] = entries[name];
  // Same bytes on Windows/macOS/Linux: forward slashes and fixed ZIP timestamps.
  return Buffer.from(zipSync(sorted, { level: 6, mtime: new Date(2000, 0, 1) }));
}

function readMetadata(bytes, platform) {
  const prefix = platform === "ios" ? "Payload/TasuDownloader.app/" : "";
  const names = new Set([`${prefix}build-info.json`, ...(platform === "ios" ? [] : ["manifest.json"])]);
  const seen = new Set();
  const selected = unzipSync(bytes, { filter: (file) => {
    // Validate names without extracting untrusted archive paths to disk.
    safeEntry(file.name.replace(/\/$/, ""));
    if (seen.has(file.name)) throw new Error(`Duplicate archive entry: ${file.name}`);
    seen.add(file.name);
    if (!names.has(file.name)) return false;
    if (file.originalSize > 1024 * 1024) throw new Error("Oversized package metadata");
    return true;
  } });
  function json(name) {
    if (!selected[name]) throw new Error(`Missing package metadata: ${name}`);
    return JSON.parse(Buffer.from(selected[name]).toString("utf8"));
  }
  if (platform === "ios") {
    for (const file of ["Info.plist", "TasuDownloader", "rg-core.js", "rg-handlers.js", "rg-shared-rules.js", "sites.json"]) {
      if (!seen.has(prefix + file)) throw new Error(`Missing native package file: ${file}`);
    }
    return { info: json(`${prefix}build-info.json`) };
  }
  const manifest = json("manifest.json");
  const referenced = new Set();
  for (const script of manifest.content_scripts || []) for (const file of [...(script.js || []), ...(script.css || [])]) referenced.add(file);
  for (const file of Object.values(manifest.icons || {})) referenced.add(file);
  const action = manifest.action || manifest.browser_action || {};
  for (const file of Object.values(action.default_icon || {})) referenced.add(file);
  if (action.default_popup) referenced.add(action.default_popup);
  if (manifest.background?.service_worker) referenced.add(manifest.background.service_worker);
  for (const file of manifest.background?.scripts || []) referenced.add(file);
  for (const entry of manifest.web_accessible_resources || []) {
    for (const file of typeof entry === "string" ? [entry] : entry.resources || []) referenced.add(file);
  }
  for (const file of referenced) if (!seen.has(file)) throw new Error(`Missing extension package file: ${file}`);
  return { info: json(`${prefix}build-info.json`), manifest };
}
module.exports = { safeEntry, directoryEntries, createArchive, readMetadata };
