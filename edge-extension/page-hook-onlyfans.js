(() => {
  // OnlyFans, videolarını HLS (.m3u8) ile MSE üzerinden oynatır: <video> etiketinin
  // src'si "blob:" olur, gerçek dosya asla DOM'da görünmez. İçerik betiği (izole
  // dünya) sayfanın fetch/XHR çağrılarını göremediği için, bu MAIN-dünya kancası
  // oynatıcının çektiği .m3u8 adreslerini yakalayıp izole betiğe postMessage'lar.
  // Yalnız gözlem yapar; hiçbir isteği değiştirmez, engellemez.
  if (window.__rgOnlyfansHookLoaded) return;
  window.__rgOnlyfansHookLoaded = true;

  const HLS_RE = /\.m3u8(?:[?#]|$)/i;

  function absolute(url) {
    try { return new URL(String(url || ""), location.href).href; } catch { return ""; }
  }

  function publish(url) {
    const abs = absolute(url);
    if (!abs || !HLS_RE.test(abs)) return;
    try {
      window.postMessage({ source: "RG_OF_HOOK", kind: "hls", url: abs, ts: Date.now() }, "*");
    } catch { /* postMessage bir sebeple reddedilirse sessiz geç */ }
  }

  // fetch() sarmalaması — Request nesnesi ya da düz string olabilir.
  try {
    const originalFetch = window.fetch;
    if (typeof originalFetch === "function") {
      window.fetch = function (input, init) {
        try {
          const url = typeof input === "string" ? input : (input && input.url) || "";
          publish(url);
        } catch { /* gözlem hatası oynatmayı bozmasın */ }
        return originalFetch.apply(this, arguments);
      };
    }
  } catch { /* fetch descriptor kilitliyse XHR yolu yine çalışır */ }

  // XMLHttpRequest.open sarmalaması — hls.js bazı sürümlerde XHR kullanır.
  try {
    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype && typeof XHR.prototype.open === "function") {
      const originalOpen = XHR.prototype.open;
      XHR.prototype.open = function (method, url) {
        try { publish(url); } catch { /* yut */ }
        return originalOpen.apply(this, arguments);
      };
    }
  } catch { /* yut */ }
})();
