// JSON-only API for native runtimes. Evaluate this bundled code, never page code.
(function initRgNativeCore(root, factory) {
  const commonJS = typeof module === "object" && module.exports;
  const api = factory(
    commonJS ? require("./media-rules.js") : root.RG_MEDIA,
    commonJS ? require("./download-contract.js") : root.RG_DOWNLOAD,
    commonJS ? require("./sites.js") : root.RG_SITES
  );
  if (commonJS) module.exports = api;
  if (root) root.RG_NATIVE_CORE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (media, download, sites) => {
  "use strict";
  function call(operation, inputJSON) {
    try {
      const input = JSON.parse(inputJSON);
      let value;
      switch (operation) {
        case "scrolller": value = media.scrolllerMediaURLsFromHTML(input); break;
        case "stripVariant": value = media.stripVariantSuffix(input); break;
        case "siteForHost": value = sites.fromHost(input)?.name || "Other"; break;
        case "download": value = download.normalize(input); break;
        default: throw new Error("CORE02: unknown shared operation");
      }
      return JSON.stringify({ ok: true, value });
    } catch (error) {
      return JSON.stringify({ ok: false, error: error.code ? error.message : "CORE01: shared rules failed" });
    }
  }
  return Object.freeze({ call });
});
