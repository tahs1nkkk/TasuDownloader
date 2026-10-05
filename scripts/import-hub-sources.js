"use strict";
// Explicit, reproducible local snapshots. Never copy accounts, caches or .env.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const projects = path.dirname(root);
const records = [];
function snapshot(project, names, dest) {
  for (const name of names) {
    const bytes = fs.readFileSync(path.join(projects, project, name));
    const file = path.join(root, dest, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    records.push({ project, file: name, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  }
}
snapshot("roblox-friend-tracker", ["background.js", "popup.html", "popup.js", "popup.css", "i18n.js", ...fs.readdirSync(path.join(projects, "roblox-friend-tracker/icons")).filter(n => /\.(png|svg)$/.test(n)).map(n => "icons/" + n)], "integrations/roblox-source");
snapshot("spotify-downloader", ["requirements.txt", "backend/__init__.py", "backend/config.py", "backend/downloader.py", "backend/spotify_client.py", "backend/youtube_client.py"], "native-music/vendor");
fs.writeFileSync(path.join(root, "integrations/source-lock.json"), JSON.stringify({ schemaVersion: 1, snapshots: records }, null, 2) + "\n");
console.log(`Snapshotted ${records.length} allowlisted source files; no personal data copied.`);
