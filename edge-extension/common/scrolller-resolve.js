/*
 * Scrolller içerik sayfası çözücüsü — paylaşılan tek yazım.
 *
 * Seçilen medyanın kendi sayfasını çekip içindeki gerçek medya adreslerini
 * çıkarır. DOM'un verdiği adres çoğu zaman bir poster ya da boyutlandırılmış
 * türev olduğu için, indirmede önce buna sorulur.
 *
 * Neden ortak dosya: aynı kural üç yerde lazım — masaüstü background service
 * worker'ı, Orion'un (iOS) içerik dünyasındaki köprüsü ve iOS uygulamasının
 * Swift tarafı. İlk ikisi artık bu dosyayı paylaşıyor. Üçüncüsü zorunlu olarak
 * ayrı yazım (`MediaResolver.scrolllerMediaURLs(fromHTML:)`); ikisi elle eşit
 * tutuluyor, bkz. debug-notes/parite.md.
 *
 * Yalnız `fetch`, `URL` ve düzenli ifade kullanır — hem service worker'da hem
 * içerik betiğinde çalışır. scrolller.com üzerindeki bir içerik betiğinde istek
 * zaten aynı kaynağa gittiği için çerezler kendiliğinden taşınır.
 */
(function initRgScrolller(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RG_SCROLLLER = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveMediaViaScrolller(pageUrl) {
    if (!pageUrl) return [];
    try {
      const parsed = new URL(pageUrl);
      if (!(parsed.hostname === "scrolller.com" || parsed.hostname.endsWith(".scrolller.com"))) return [];
      const response = await fetchWithTimeout(parsed.href, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        credentials: "include"
      }, 10000);
      if (!response.ok) return [];
      const html = (await response.text())
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
    } catch {
      return [];
    }
  }

  return { resolveMediaViaScrolller };
});
