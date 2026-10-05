// The authoritative site catalog for build tools and browser/native clients.
(function initRgSites(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RG_SITES = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const platforms = {
    edge: { status: "implemented" },
    ios: { status: "implemented" },
    orion: { status: "implemented" },
    android: { status: "planned" }
  };
  const sites = [
    {
      id: "redgifs", name: "RedGifs", domain: "redgifs.com",
      url: "https://www.redgifs.com", tint: "#FF3B5C",
      matches: ["https://redgifs.com/*", "https://*.redgifs.com/*"],
      platforms: ["edge", "ios", "orion"],
      handler: "content-redgifs.js", folders: true, allFrames: true,
      pageHook: "page-hook-redgifs.js"
    },
    {
      id: "reddit", name: "Reddit", domain: "reddit.com",
      url: "https://www.reddit.com", tint: "#FF4500",
      matches: ["https://reddit.com/*", "https://www.reddit.com/*", "https://new.reddit.com/*", "https://old.reddit.com/*"],
      platforms: ["edge", "ios", "orion"],
      handler: "content-reddit.js", folders: true
    },
    {
      id: "scrolller", name: "Scrolller", domain: "scrolller.com",
      url: "https://scrolller.com", tint: "#3D8BFD",
      matches: ["https://scrolller.com/*", "https://www.scrolller.com/*", "https://*.scrolller.com/*"],
      platforms: ["edge", "ios", "orion"],
      handler: "content-scrolller-v2.js", folders: true,
      bridgeModules: { orion: ["common/scrolller-resolve.js"] }
    },
    {
      id: "coomer", name: "Coomer", domain: "coomer.st",
      url: "https://coomer.st", tint: "#22C55E",
      matches: ["https://coomer.st/*", "https://www.coomer.st/*"],
      platforms: ["edge", "ios", "orion"], handler: "content-coomer.js"
    },
    {
      id: "onlyfans", name: "OnlyFans", domain: "onlyfans.com",
      url: "https://onlyfans.com", tint: "#00AFF0",
      matches: ["https://onlyfans.com/*", "https://www.onlyfans.com/*"],
      platforms: ["edge"], handler: "content-onlyfans.js",
      pageHook: "page-hook-onlyfans.js",
      limitations: ["No DRM or encrypted HLS", "No direct messages", "Native and Orion download adapters are not implemented"]
    },
    {
      id: "instagram", name: "Instagram", domain: "instagram.com",
      url: "https://www.instagram.com", tint: "#E1306C",
      matches: ["https://www.instagram.com/*", "https://instagram.com/*"],
      platforms: ["edge", "ios", "orion"], handler: "content-instagram.js", folders: true
    }
  ];

  // This is an optional legacy helper, not a supported media-site tile.
  const legacyHelpers = [{
    id: "ripsnip", platforms: ["edge"], handler: "content-ripsnip.js",
    matches: ["https://ripsnip.com/*", "https://www.ripsnip.com/*"]
  }];

  function deepFreeze(value) {
    for (const child of Object.values(value)) {
      if (child && typeof child === "object") deepFreeze(child);
    }
    return Object.freeze(value);
  }
  deepFreeze(platforms);
  deepFreeze(sites);
  deepFreeze(legacyHelpers);

  function forPlatform(platform) {
    if (!Object.hasOwn(platforms, platform)) throw new Error(`Unknown platform: ${platform}`);
    return sites.filter((site) => site.platforms.includes(platform));
  }

  function fromHost(value) {
    const host = String(value || "").toLowerCase();
    return sites.find((site) => host === site.domain || host.endsWith(`.${site.domain}`)) || null;
  }

  function fromUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      return fromHost(host);
    } catch {
      return null;
    }
  }

  return Object.freeze({ platforms, sites, legacyHelpers, forPlatform, fromHost, fromUrl });
});
