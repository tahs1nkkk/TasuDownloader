// Generated from shared/core/download-contract.js; run npm run build:shared. Do not edit.
// Versioned DIRECT_DOWNLOAD contract shared by every receiving adapter.
(function initRgDownload(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RG_DOWNLOAD = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";
  const VERSION = 1;
  const fields = {
    urls: { type: "strings", default: [] },
    imageMode: { type: "boolean", default: false },
    downloadAll: { type: "boolean", default: false },
    fallbackSourceUrl: { type: "string", default: "" },
    scrolllerSourceUrl: { type: "string", default: "" },
    namingUrl: { type: "string", default: null, optional: true },
    folderName: { type: "string", default: "" },
    downloadPath: { type: "string", default: "" },
    subFolder: { type: "string", default: "" },
    site: { type: "string", default: "" },
    source: { type: "string", default: "" },
    expectedSlug: { type: "string", default: "" },
    skipReachability: { type: "boolean", default: false },
    preserveAlternatives: { type: "boolean", default: false },
    allowRipsnipFallback: { type: "boolean", default: true },
    preferRipsnipWhenOpen: { type: "boolean", default: false },
    fallbackOnNoTransfer: { type: "boolean", default: false },
    transferTimeoutMs: { type: "number", default: 2500 }
  };
  for (const field of Object.values(fields)) {
    if (Array.isArray(field.default)) Object.freeze(field.default);
    Object.freeze(field);
  }
  Object.freeze(fields);

  function fail(code, field) {
    // Include field names, never private URLs, tokens or user content.
    const error = new Error(`${code}: indirme mesajı geçersiz (${field})`);
    error.code = code;
    throw error;
  }

  function normalize(message) {
    if (!message || typeof message !== "object" || Array.isArray(message) || message.type !== "DIRECT_DOWNLOAD") {
      fail("DLC01", "type");
    }
    const version = message.contractVersion ?? VERSION; // Legacy handlers omit it.
    if (version !== VERSION) fail("DLC02", "contractVersion");
    const result = { ...message, contractVersion: VERSION };
    for (const [name, field] of Object.entries(fields)) {
      const value = message[name];
      if (value == null) {
        result[name] = Array.isArray(field.default) ? [] : field.default;
        continue;
      }
      const valid = field.type === "strings"
        ? Array.isArray(value) && value.every((item) => typeof item === "string")
        : typeof value === field.type;
      if (!valid || (field.type === "number" && (!Number.isFinite(value) || value < 0))) fail("DLC01", name);
      result[name] = Array.isArray(value) ? [...value] : value;
    }
    // No URL sorting, deduplication or source-field substitution here. Adapters
    // retain their download order and handling of blobs/unreachable candidates.
    return result;
  }

  function validate(message) {
    try { return { ok: true, message: normalize(message) }; }
    catch (error) { return { ok: false, code: error.code || "DLC01", error: error.message }; }
  }
  return Object.freeze({ VERSION, fields, normalize, validate });
});
