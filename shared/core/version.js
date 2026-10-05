// Release versions: shared changes bump core plus every affected platform.
(function initRgVersion(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RG_VERSION = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => Object.freeze({
  coreVersion: "0.29.2",
  platforms: Object.freeze({ edge: "0.31.7", orion: "0.29.2", ios: "1.4.2", android: null })
}));
