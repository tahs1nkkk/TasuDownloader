/*
 * Bulut istemcisi — Cloudflare Worker + R2 + Supabase'e konuşur. iOS'taki
 * CloudClient.swift'in eklenti karşılığı: aynı uçlar, aynı iki kabul yolu.
 *
 *   Yetki:  (a) Bearer ARCHIVE_TOKEN  — ayarlara jeton yapıştırılmışsa
 *           (b) Google oturum çerezi  — kullanıcı Worker sitesine girmişse
 *   İkisi de gönderilir; worker.js hangisi geçerliyse onu kabul eder.
 *
 * settings.js'e bağımlı (RG_SETTINGS.withDefaults). background service
 * worker'da `importScripts("common/settings.js","common/cloud.js")`,
 * popup/archive sayfalarında <script> ile yüklenir.
 */
(function initRgCloud(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RG_CLOUD = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const SETTINGS_KEY =
    (globalThis.RG_SETTINGS && globalThis.RG_SETTINGS.SETTINGS_KEY) || "tasuDownloaderSettings";

  function withDefaults(value) {
    const s = globalThis.RG_SETTINGS;
    return s ? s.withDefaults(value) : { ...(value || {}) };
  }

  // chrome.storage.local'i Promise ile oku. (MV3 service worker + sayfa aynı.)
  function getSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(SETTINGS_KEY, (items) => {
          resolve(withDefaults(items && items[SETTINGS_KEY]));
        });
      } catch {
        resolve(withDefaults(null));
      }
    });
  }

  // Sondaki eğik çizgiler atılır: base + "/" + path birleştirmesi tek çizgi kalsın.
  function normalizeBase(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  // Bulut adresi girilmiş mi?
  function isConfigured(settings) {
    return !!normalizeBase(settings && settings.cloudBase);
  }

  function hasToken(settings) {
    return !!String((settings && settings.cloudToken) || "").trim();
  }

  // Eklenti içi işlemler (yükleme, ızgara, listeler) jeton ister: Worker çerezi
  // SameSite=Lax olduğundan chrome-extension:// kökeninden giden arka plan
  // isteklerine iliştirilmez. Google girişi yalnız tam siteyi sekmede açmak
  // (üst düzey gezinme) için işe yarar.
  function canUseApi(settings) {
    return isConfigured(settings) && hasToken(settings);
  }

  // Anahtar tam R2 yolu: "<sürücü değil, dosya yolu>"; içindeki / korunmalı ama
  // segmentlerin kendisi kodlanmalı (aksi halde boşluk/# yolu bozar).
  function encodeKey(key) {
    return String(key || "")
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  function buildUrl(base, path, query) {
    const url = new URL(`${normalizeBase(base)}/${String(path).replace(/^\/+/, "")}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  /**
   * Tek fetch çoke-noktası. Jeton varsa Authorization, her hâlükârda
   * credentials:"include" (Google çerezi) ve — indirme/yükleme yönüne göre —
   * X-Tasu-Bw bant sınırı başlığı eklenir.
   */
  async function cloudFetch(settings, path, options = {}) {
    const { method = "GET", query, body, headers = {}, isUpload = false, timeoutMs = 45000 } = options;
    const base = normalizeBase(settings.cloudBase);
    if (!base) throw new Error("Bulut adresi yok (Ayarlar → Sunucu)");

    const finalHeaders = { ...headers };
    const token = String(settings.cloudToken || "").trim();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;

    const mbps = isUpload ? Number(settings.cloudBwUp) : Number(settings.cloudBwDown);
    if (mbps > 0) finalHeaders["X-Tasu-Bw"] = String(mbps);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(buildUrl(base, path, query), {
        method,
        headers: finalHeaders,
        body,
        credentials: "include",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function assertOk(response) {
    if (response.ok) return response;
    if (response.status === 401) throw new Error("Yetkisiz — jeton yanlış ya da Google girişi yok (401)");
    if (response.status === 429) throw new Error("Sunucu meşgul, biraz sonra dene (429)");
    throw new Error(`Sunucu ${response.status} döndürdü`);
  }

  // --- Medya (R2) -----------------------------------------------------------

  /** Baytları olduğu gibi yükler; sunucu ad çakışmasını kendi çözer ve sakladığı
   *  anahtarı döndürür. `blobOrBuffer` Blob/ArrayBuffer/Uint8Array olabilir. */
  async function uploadMedia(settings, blobOrBuffer, { name, site = "Other", drive, source } = {}) {
    const key = encodeKey(name);
    const response = await cloudFetch(settings, `api/media/${key}`, {
      method: "PUT",
      // `source` (ör. "r/aww u/xyz") arşivde aramayla süzülür; boşsa buildUrl atlar.
      query: { drive: drive || settings.cloudDrive || "main", site, source: source || "" },
      body: blobOrBuffer,
      isUpload: true,
      timeoutMs: 3600000
    });
    assertOk(response);
    const reply = await response.json().catch(() => ({}));
    return reply.key || reply.name || name;
  }

  async function listMedia(settings, drive) {
    const response = await cloudFetch(settings, "api/media", {
      query: { drive: drive || settings.cloudDrive || "main" }
    });
    assertOk(response);
    return response.json();
  }

  async function deleteMedia(settings, key) {
    const response = await cloudFetch(settings, `api/media/${encodeKey(key)}`, { method: "DELETE" });
    assertOk(response);
    return true;
  }

  /** <img>/<video> başlık gönderemez; jeton (ve bant sınırı) sorgu dizesiyle
   *  gider. Jeton yoksa çıplak yol döner — aynı köken/çerez varsa çalışır. */
  function mediaURL(settings, key, { thumb = false } = {}) {
    const kind = thumb ? "thumb" : "media";
    const query = {};
    const token = String(settings.cloudToken || "").trim();
    if (token) query.token = token;
    if (Number(settings.cloudBwDown) > 0) query.bw = String(settings.cloudBwDown);
    return buildUrl(settings.cloudBase, `api/${kind}/${encodeKey(key)}`, query);
  }

  // --- Listeler (Supabase, /api/lists) --------------------------------------

  /** Depo tek satır: { lists:[…], tombstones:[…] }. Kayıt yoksa 404 → null. */
  async function getLists(settings) {
    const response = await cloudFetch(settings, "api/lists");
    if (response.status === 404) return null;
    assertOk(response);
    return response.json();
  }

  async function putLists(settings, payload) {
    const response = await cloudFetch(settings, "api/lists", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assertOk(response);
    return response.json().catch(() => ({ ok: true }));
  }

  // --- Bağlantı yoklaması ---------------------------------------------------

  /** /api/config: 200 ise jetonla bağlı. Jeton yoksa arka plan isteği zaten
   *  401 döner (Lax çerez gelmez) — bu durumu "jeton gerekli" diye açıklıyoruz. */
  async function checkConnection(settings) {
    if (!isConfigured(settings)) return { ok: false, error: "Adres girilmedi" };
    if (!hasToken(settings)) {
      return { ok: false, needsToken: true,
        error: "Eklenti içi erişim jeton ister; Google için 'Arşivi aç → Sitede aç'" };
    }
    try {
      const response = await cloudFetch(settings, "api/config", { timeoutMs: 12000 });
      if (response.status === 401) return { ok: false, error: "Jeton reddedildi (401)" };
      assertOk(response);
      const info = await response.json().catch(() => ({}));
      return { ok: true, version: info.version || "", mode: "token" };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  }

  return Object.freeze({
    getSettings,
    normalizeBase,
    isConfigured,
    hasToken,
    canUseApi,
    encodeKey,
    cloudFetch,
    uploadMedia,
    listMedia,
    deleteMedia,
    mediaURL,
    getLists,
    putLists,
    checkConnection
  });
});
