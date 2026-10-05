// Network adapter; candidate parsing lives in the shared pure media rules.
(function initRgScrolller(root, factory) {
  const rules = typeof module === "object" && module.exports ? require("./media-rules.js") : root.RG_MEDIA;
  const api = factory(rules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RG_SCROLLLER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, (rules) => {
  "use strict";
  if (!rules) throw new Error("Load common/media-rules.js before the Scrolller resolver.");

  async function resolveMediaViaScrolller(pageUrl) {
    if (!pageUrl) return [];
    let timer;
    try {
      const parsed = new URL(pageUrl);
      if (!(parsed.hostname === "scrolller.com" || parsed.hostname.endsWith(".scrolller.com"))) return [];
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(parsed.href, {
        method: "GET", cache: "no-store", redirect: "follow",
        credentials: "include", signal: controller.signal
      });
      if (!response.ok) return [];
      return rules.scrolllerMediaURLsFromHTML(await response.text());
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
  return { resolveMediaViaScrolller };
});
