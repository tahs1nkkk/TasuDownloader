(function(root) {
  "use strict";
  const ROBLOX_ORIGINS = ["users", "friends", "presence", "thumbnails", "games", "apis", "www"].map(s => `https://${s}.roblox.com/*`);
  const modules = Object.freeze({
    downloader: { name: "Downloader", page: "popup.html", permission: null },
    roblox: { name: "Friend Tracker", page: "hub/roblox/index.html", permission: { origins: ROBLOX_ORIGINS } },
    dada: { name: "Dada Review", page: "hub/dada/index.html", permission: null },
    music: { name: "Spotify / YouTube", page: "hub/music.html", permission: { permissions: ["nativeMessaging"] } }
  });
  const api = { modules, idleMs: 300000, key: "tasuAppsHub", hostName: "com.tasuapps.music", version: 2, build: "0.31.7" };
  root.TASU_HUB = api;
  if (typeof module === "object") module.exports = api;
})(globalThis);
