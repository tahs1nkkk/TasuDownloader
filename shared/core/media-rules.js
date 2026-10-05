// Pure rules: no DOM, network, URL API or platform globals. Also runs in JavaScriptCore.
(function initRgMedia(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RG_MEDIA = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  function stripVariantSuffix(stem) {
    let text = String(stem || "");
    const patterns = [
      /[-_](?:small|mobile|mini|thumbnail|thumb|preview|poster|sd|hd|medium|large)$/i,
      /[-_][0-9]{2,5}x[0-9]{2,5}$/,
      /[-_][0-9]{3,4}p$/i
    ];
    let previous;
    do {
      previous = text;
      for (const pattern of patterns) {
        const stripped = text.replace(pattern, "");
        if (stripped) text = stripped; // Never erase the whole stem.
      }
    } while (text !== previous);
    return text;
  }

  function scrolllerMediaURLsFromHTML(raw) {
    const html = String(raw || "")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&");
    const primaryVideos = [];
    const primaryImages = [];
    for (const tag of (html.match(/<meta\b[^>]*>/gi) || [])) {
      const key = tag.match(/(?:property|name)=["']([^"']+)["']/i)?.[1]?.toLowerCase() || "";
      const content = tag.match(/content=["']([^"']+)["']/i)?.[1] || "";
      if (!/^https?:\/\//i.test(content)) continue;
      if (/og:video|twitter:player:stream/.test(key)) primaryVideos.push(content);
      else if (/og:image|twitter:image/.test(key)) primaryImages.push(content);
    }
    const allUrls = html.match(/https?:\/\/[^\s"'<>]+?\.(?:mp4|webm|m4v|mov|gif|webp|png|jpe?g)(?:\?[^\s"'<>]*)?/gi) || [];
    const gifPost = primaryImages.some((url) => /\.gif(?:[?#]|$)/i.test(url))
      || /["'](?:isGif|is_gif)["']\s*:\s*true/i.test(html)
      || /["'](?:mediaType|media_type)["']\s*:\s*["']gif["']/i.test(html);
    const videoPost = primaryVideos.length > 0
      || /["'](?:isVideo|is_video)["']\s*:\s*true/i.test(html)
      || /["'](?:mediaType|media_type)["']\s*:\s*["']video["']/i.test(html)
      || /<video\b/i.test(html);
    const primary = primaryVideos.length
      ? primaryVideos
      : gifPost
        ? primaryImages.filter((url) => /\.gif(?:[?#]|$)/i.test(url))
        : videoPost
          ? []
          : primaryImages;
    const urls = [...new Set([...primary, ...allUrls])];
    return urls
      .map((url, index) => ({ url, index }))
      .sort((a, b) => {
        const primaryA = primary.includes(a.url) ? 1 : 0;
        const primaryB = primary.includes(b.url) ? 1 : 0;
        const gifA = /\.gif(?:[?#]|$)/i.test(a.url) ? 1 : 0;
        const gifB = /\.gif(?:[?#]|$)/i.test(b.url) ? 1 : 0;
        const mp4A = /\.mp4(?:[?#]|$)/i.test(a.url) ? 1 : 0;
        const mp4B = /\.mp4(?:[?#]|$)/i.test(b.url) ? 1 : 0;
        // Scrolller'ın video CDN'i `photon.scrolller.com` — "proton" yazımı
        // hiçbir adrese uymuyordu, bu basamak ölü bir karşılaştırmaydı.
        const cdnA = /:\/\/photon\.scrolller\.com\//i.test(a.url) ? 1 : 0;
        const cdnB = /:\/\/photon\.scrolller\.com\//i.test(b.url) ? 1 : 0;
        return (primaryB - primaryA)
          || (gifPost ? gifB - gifA : mp4B - mp4A)
          || (cdnB - cdnA)
          || (a.index - b.index);
      })
      .map((item) => item.url);
  }

  return Object.freeze({ stripVariantSuffix, scrolllerMediaURLsFromHTML });
});

