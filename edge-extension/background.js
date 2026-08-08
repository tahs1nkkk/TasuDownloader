importScripts("common/settings.js", "common/cloud.js");

const RIPSNIP_URL = "https://ripsnip.com/";
const MEDIA_RE = /\.(mp4|webm|mov|m4v)(?:[?#].*)?$/i;
const DOWNLOAD_RE = /\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i;
const { SETTINGS_KEY, LEGACY_SETTINGS_KEY, DEFAULT_SETTINGS } = globalThis.RG_SETTINGS;

// Ayar anahtarı yeniden adlandırıldı (rgRipsnipSettings -> tasuDownloaderSettings).
// Mevcut kurulumlar ayarlarını eski anahtarda tutuyor; service worker her
// uyandığında bir kez kontrol edip taşırız. İdempotent: taşıdıktan sonra eski
// anahtarı siler, sonraki açılışlarda yapacak iş kalmaz.
(function migrateLegacySettingsKey() {
  try {
    chrome.storage.local.get([SETTINGS_KEY, LEGACY_SETTINGS_KEY], (items) => {
      if (chrome.runtime.lastError) return;
      const current = items && items[SETTINGS_KEY];
      const legacy = items && items[LEGACY_SETTINGS_KEY];
      if (!legacy) return;
      const hasCurrent = current && Object.keys(current).length > 0;
      if (hasCurrent) {
        // Yeni anahtar zaten kullanımda; bayat eski kopyayı at.
        chrome.storage.local.remove(LEGACY_SETTINGS_KEY);
        return;
      }
      chrome.storage.local.set({ [SETTINGS_KEY]: legacy }, () => {
        if (!chrome.runtime.lastError) chrome.storage.local.remove(LEGACY_SETTINGS_KEY);
      });
    });
  } catch {
    // storage erişilemez — sonraki uyanışta yeniden denenir.
  }
})();

const jobs = new Map();
let mediaWatch = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMediaUrl(url) {
  return typeof url === "string" && MEDIA_RE.test(url);
}

function isDownloadUrl(url) {
  return typeof url === "string" && DOWNLOAD_RE.test(url);
}

function mediaNameKey(value) {
  try {
    const parsed = new URL(value);
    value = parsed.pathname.split("/").filter(Boolean).pop() || value;
  } catch {
    value = String(value || "");
  }

  return String(value || "")
    .toLowerCase()
    .replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)$/i, "")
    .replace(/-(mobile|mini|large|hd|sd|silent|poster|thumbnail|preview|thumb|small)$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function filterUrlsByExpectedSlug(urls, expectedSlug) {
  const expected = mediaNameKey(expectedSlug);
  if (!expected) return urls || [];
  return (urls || []).filter((url) => mediaNameKey(url).includes(expected) || expected.includes(mediaNameKey(url)));
}

// Base media identity: HOST + filename without extension/variant-suffix. The
// host is part of the key so that the SAME image from DIFFERENT hosts (e.g.
// reddit's i.redd.it original AND its preview.redd.it fallback) are NOT merged —
// we must keep both so a failing one can fall through to the other. Only true
// same-host quality variants (redgifs -silent/-mobile) get merged.
function mediaBaseKey(url) {
  let host = "", name = String(url || "");
  try {
    const p = new URL(name);
    host = p.hostname.toLowerCase();
    name = p.pathname.split("/").filter(Boolean).pop() || name;
  } catch { /* keep raw */ }
  const base = name
    .toLowerCase()
    .replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i, "")
    .replace(/-(silent|mobile|mini|sd|hd|large|small|thumbnail|poster|preview|thumb)$/i, "");
  return host + "|" + base;
}

// Higher = better. Clean (no suffix) is the full/original; -silent is worst
// (redgifs-watermarked, muted, low quality); -mobile/-sd are low resolution.
function variantRank(url) {
  const u = String(url || "");
  if (/-silent\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(u)) return 0;
  if (/-(?:mobile|mini|small|sd)\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(u)) return 1;
  if (/-(?:hd|large)\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(u)) return 3;
  return 4; // clean {name}.mp4 — the one we want
}

// Keep only the best variant per media (drops -silent/-mobile when the clean
// version exists, and never returns two variants of the same gif).
function bestPerMedia(urls) {
  const groups = new Map();
  for (const u of (urls || [])) {
    if (typeof u !== "string" || !u) continue;
    const key = mediaBaseKey(u);
    const rank = variantRank(u);
    const cur = groups.get(key);
    if (!cur || rank > cur.rank) groups.set(key, { url: u, rank });
  }
  return [...groups.values()].map((g) => g.url);
}

function notify(tabId, message) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function cleanFileName(value) {
  return String(value || "video")
    .replace(/^https?:\/\//i, "")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function extensionFor(url) {
  let ext = ".mp4";
  try {
    const parsed = new URL(url);
    const extMatch = parsed.pathname.match(/\.(mp4|webm|mov|m4v|ts|m4s|jpg|jpeg|png|webp|gif)$/i);
    if (extMatch) ext = extMatch[0].toLowerCase();
  } catch {
    ext = ".mp4";
  }
  return ext;
}

function filenameFor(url, settings = DEFAULT_SETTINGS, folderName = "", downloadPath = "", subFolder = "", site = "Other") {
  const ext = extensionFor(url);
  let label = "redgifs-video";
  try {
    const parsed = new URL(url);
    const suppliedName = site === "Coomer" ? parsed.searchParams.get("f") : "";
    label = cleanFileName(suppliedName || parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname);
  } catch {
    label = "redgifs-video";
  }
  label = label.replace(/\.(mp4|webm|mov|m4v|ts|m4s|jpg|jpeg|png|webp|gif)$/i, "");
  // Drop a trailing variant/resolution tag so files are `<slug>` not
  // `<slug>-large` (RedGifs) or `<slug>_1920x1080` (Scrolller). Mirrors
  // MediaNaming.stripVariantSuffix on the iOS side.
  let previous;
  do {
    previous = label;
    label = label
      .replace(/[-_](?:small|mobile|mini|thumbnail|thumb|preview|poster|sd|hd|medium|large)$/i, "")
      .replace(/[-_]\d{2,5}x\d{2,5}$/i, "")
      .replace(/[-_]\d{3,4}p$/i, "");
  } while (label !== previous && label);
  if (!label) label = "media";
  if (settings.includeDateInFilename) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    label = `${label}-${stamp}`;
  }
  const dest = globalThis.RG_SETTINGS.downloadDirectory(settings, {
    folderName,
    downloadPath,
    subFolder,
    site,
    mediaCategory: globalThis.RG_SETTINGS.mediaCategoryFromUrl(url)
  });
  return [dest, `${label}${ext}`].join("/");
}

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (items) => {
      resolve({ ...DEFAULT_SETTINGS, ...(items && items[SETTINGS_KEY] || {}) });
    });
  });
}

// Diske indirme — eski davranış, tek başına bir Promise'e sarıldı.
function localDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      { url, filename, conflictAction: "uniquify", saveAs: false },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`${chrome.runtime.lastError.message} (${filename})`));
          return;
        }
        resolve(downloadId);
      }
    );
  });
}

// Bir medya sunucuya kaydolunca kullanıcının haberi olsun diye — Windows
// bildirimi yerine sayfanın altında bir bilgilendirme mesajı gösterir
// (weblink.js'teki toast'ı tetikler). tabId yoksa sessizce geçer.
function notifyCloudSaved(tabId, name, site) {
  const label = site && site !== "Other" ? `${site} · ${name}` : String(name || "medya");
  notify(tabId, { type: "RG_CLOUD_TOAST", text: `Sunucuya kaydedildi ✓ ${label}` });
}

// Medya baytlarını çekip R2'ye yükler. Eklentinin host_permissions'ı (https://*/*)
// sayesinde service worker fetch'i CORS'a takılmadan gövdeyi okuyabilir.
async function uploadUrlToCloud(settings, url, name, site, source = "", tabId = null) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`kaynak ${response.status}`);
  const blob = await response.blob();
  const key = await globalThis.RG_CLOUD.uploadMedia(settings, blob, { name, site, source });
  notifyCloudSaved(tabId, name || key, site);
  return key;
}

// --- Web listeleri (özellik D) --------------------------------------------
// İçerik betiği bir gönderiyi "bağlantı" olarak buluttaki bir listeye ekler.
// Şema iOS'un Codable modeliyle bire bir uyumlu OLMAK ZORUNDA: iOS snapshot'ı
// .iso8601 (kesirli saniyesiz) çözer ve `try?` ile — bir öğe bile uyumsuzsa
// tüm uzak snapshot atılır ve uygulama kendi halini geri yazıp eklemeyi siler.
//   LinkItem = { id:UUID, url, title, addedAt:ISO }
//   LinkList = { id:UUID, name, items:[…], updatedAt:ISO }

// "2026-07-27T12:34:56Z" — new Date().toISOString() milisaniye ekler; iOS'un
// düz ISO8601DateFormatter'ı onu çözemez, bu yüzden kırpıyoruz.
function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function uuid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Bir listenin sitesi: bağlantılarında en çok geçen site. Karışıksa/boşsa
// "Other". Seçici (weblink.js) yalnız bulunulan sitenin listelerini göstersin
// diye her özet buna göre etiketlenir. Ölçüt cloud/web/js/lists.js ile aynı.
const SITE_HINTS = [
  [/redgifs\./i, "RedGifs"],
  [/reddit\.|redd\.it/i, "Reddit"],
  [/instagram\./i, "Instagram"],
  [/scrolller\./i, "Scrolller"],
  [/coomer\.|kemono\./i, "Coomer"],
  [/onlyfans\./i, "OnlyFans"]
];

function siteOfURL(url) {
  let host = "";
  try { host = new URL(url).hostname; } catch { return ""; }
  for (const [pattern, name] of SITE_HINTS) if (pattern.test(host)) return name;
  return "";
}

function siteOfList(list) {
  const tally = new Map();
  for (const item of (list && list.items) || []) {
    const site = siteOfURL(item && item.url);
    if (site) tally.set(site, (tally.get(site) || 0) + 1);
  }
  let best = "";
  let top = 0;
  for (const [site, count] of tally) if (count > top) { best = site; top = count; }
  return best || "Other";
}

function summarizeLists(snapshot) {
  const lists = snapshot && Array.isArray(snapshot.lists) ? snapshot.lists : [];
  return lists
    .filter((l) => l && typeof l.id === "string")
    .map((l) => ({ id: l.id, name: l.name || "(adsız)", count: (l.items || []).length, site: siteOfList(l) }));
}

// getLists → değiştir → putLists. Aynı URL zaten varsa başlığı tazeleyip başa
// alır (iOS'un add(url:…) davranışı). updatedAt bump'ı merge'de kazanmayı sağlar.
async function addWebLink(settings, { url, title, listId, newListName }) {
  const snap = (await globalThis.RG_CLOUD.getLists(settings)) || { lists: [], tombstones: [] };
  if (!Array.isArray(snap.lists)) snap.lists = [];
  if (!Array.isArray(snap.tombstones)) snap.tombstones = [];
  const now = isoNow();

  let list;
  if (newListName) {
    list = { id: uuid(), name: newListName, items: [], updatedAt: now };
    snap.lists.unshift(list);
  } else {
    list = snap.lists.find((l) => l && l.id === listId);
    if (!list) return { ok: false, error: "Liste bulunamadı" };
    if (!Array.isArray(list.items)) list.items = [];
  }

  const label = title || url;
  const existing = list.items.find((it) => it && it.url === url);
  if (existing) {
    existing.title = label;
    existing.addedAt = now;
    list.items = list.items.filter((it) => it !== existing);
    list.items.unshift(existing);
  } else {
    list.items.unshift({ id: uuid(), url, title: label, addedAt: now });
  }
  list.updatedAt = now;

  await globalThis.RG_CLOUD.putLists(settings, snap);
  return { ok: true, listName: list.name, duplicate: !!existing };
}

/**
 * Tek indirme choke-noktası. Hedef ayarına göre diske indirir, buluta yükler
 * ya da ikisini birden yapar:
 *   "local" → chrome.downloads (eski yol)
 *   "cloud" → yalnız R2'ye PUT (await; hata fırlar ki aday döngüleri ilerlesin)
 *   "both"  → diske indirir + buluta aynanı (yükleme başarısızlığı indirmeyi
 *             düşürmez; hata bildirimle geçilir)
 * Bulut seçili ama adres/jeton yoksa güvenli tarafa düşer: yerel indirir.
 *
 * Dönüş {downloadId, filename, cloudKey, uploadToCloud?}. `deferCloud` yalnız
 * "both" modunu erteler: Coomer'ın çok-adaylı doğrulama döngüsü, aktarımı
 * doğrulanan adayı buluta yüklesin diye uploadToCloud()'u kendi çağırır.
 */
async function downloadToFile(url, sourceTabId, folderName = "", downloadPath = "", subFolder = "", site = "Other", namingUrl = url, options = {}) {
  const settings = await readSettings();
  const filename = filenameFor(namingUrl, settings, folderName, downloadPath, subFolder, site);

  // Yükleme jeton ister: SameSite=Lax çerezi arka plan isteğine gelmez. Jeton
  // yoksa bulut seçili olsa bile yerele düşer ki indirme sessizce kaybolmasın.
  const cloudReady = !!(globalThis.RG_CLOUD && globalThis.RG_CLOUD.canUseApi(settings));
  const destination = settings.cloudDestination || "local";
  const wantCloud = (destination === "cloud" || destination === "both") && cloudReady;
  const wantLocal = destination === "local" || destination === "both" || !cloudReady;

  const result = { downloadId: null, filename, cloudKey: null };
  const leaf = filename.split("/").filter(Boolean).pop() || cleanFileName(url);
  // Kaynak etiketi (ör. "r/aww u/xyz") çağırandan gelir; boşsa buluta yazılmaz.
  const source = (options.source || "").toString();

  if (wantLocal) {
    result.downloadId = await localDownload(url, filename);
  }

  if (wantCloud) {
    if (destination === "cloud") {
      // Yalnız bulut: yerel indirme yok, yüklemenin kendisi doğrulamadır.
      result.cloudKey = await uploadUrlToCloud(settings, url, leaf, site, source, sourceTabId);
    } else if (options.deferCloud) {
      result.uploadToCloud = () => uploadUrlToCloud(settings, url, leaf, site, source, sourceTabId)
        .then((key) => { result.cloudKey = key; notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "done", text: `Buluta yüklendi: ${key}` }); })
        .catch((e) => notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "error", text: `Bulut yükleme hatası: ${e.message || e}` }));
    } else {
      // "both": indirme başarısını beklemeden aynala; hata indirmeyi düşürmesin.
      uploadUrlToCloud(settings, url, leaf, site, source, sourceTabId)
        .then((key) => notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "done", text: `Buluta yüklendi: ${key}` }))
        .catch((e) => notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "error", text: `Bulut yükleme hatası: ${e.message || e}` }));
    }
  }

  return result;
}

function downloadItem(downloadId) {
  return new Promise((resolve) => {
    chrome.downloads.search({ id: downloadId }, (items) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(items?.[0] || null);
    });
  });
}

async function waitForDownloadTransfer(downloadId, timeoutMs = 2500) {
  const deadline = Date.now() + Math.max(500, Number(timeoutMs) || 2500);
  while (Date.now() < deadline) {
    const item = await downloadItem(downloadId);
    if (!item) return { ok: false, reason: "DOWNLOAD_MISSING" };
    if (item.state === "complete" || Number(item.bytesReceived) > 0) return { ok: true, item };
    if (item.state === "interrupted") return { ok: false, reason: item.error || "INTERRUPTED", item };
    await sleep(180);
  }
  return { ok: false, reason: "NETWORK_TIMEOUT" };
}

function cancelDownload(downloadId) {
  return new Promise((resolve) => {
    chrome.downloads.cancel(downloadId, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function startDownload(url, sourceTabId, closeTabId, folderName = "", downloadPath = "", subFolder = "", site = "Other", source = "") {
  downloadToFile(url, sourceTabId, folderName, downloadPath, subFolder, site, url, { source })
    .then(({ downloadId }) => {
      notify(sourceTabId, {
        type: "RG_HELPER_STATUS",
        level: "done",
        text: `Download started (#${downloadId}).`
      });

      if (sourceTabId) chrome.tabs.update(sourceTabId, { active: true }).catch(() => {});
      if (closeTabId) chrome.tabs.remove(closeTabId).catch(() => {});
    })
    .catch((error) => {
      notify(sourceTabId, {
        type: "RG_HELPER_STATUS",
        level: "error",
        text: `Download failed: ${error.message || error}`
      });
    });
}

function detectMediaInPage() {
  const urls = [];
  for (const video of document.querySelectorAll("video")) {
    if (video.currentSrc) urls.push(video.currentSrc);
    if (video.src) urls.push(video.src);
    for (const source of video.querySelectorAll("source")) {
      if (source.src) urls.push(source.src);
    }
  }
  for (const link of document.querySelectorAll("a[href]")) {
    if (/\.(mp4|webm|mov|m4v)([?#].*)?$/i.test(link.href)) urls.push(link.href);
  }
  return [...new Set(urls)].find((url) => /\.(mp4|webm|mov|m4v)([?#].*)?$/i.test(url)) || null;
}

function watchMediaTab(tabId, url) {
  if (!mediaWatch || Date.now() > mediaWatch.until) return;

  if (isMediaUrl(url)) {
    startDownload(
      url,
      mediaWatch.sourceTabId,
      tabId,
      mediaWatch.folderName,
      mediaWatch.downloadPath,
      mediaWatch.subFolder,
      mediaWatch.site,
      mediaWatch.source
    );
    mediaWatch = null;
    return;
  }

  chrome.scripting.executeScript(
    {
      target: { tabId },
      func: detectMediaInPage
    },
    (results) => {
      const mediaUrl = results && results[0] && results[0].result;
      if (mediaUrl && mediaWatch) {
        startDownload(
          mediaUrl,
          mediaWatch.sourceTabId,
          tabId,
          mediaWatch.folderName,
          mediaWatch.downloadPath,
          mediaWatch.subFolder,
          mediaWatch.site,
          mediaWatch.source
        );
        mediaWatch = null;
      }
    }
  );
}

function findRipsnipTab(callback) {
  chrome.tabs.query({ url: ["https://ripsnip.com/*", "https://www.ripsnip.com/*"] }, (tabs) => {
    callback((tabs || []).find((tab) => tab.id));
  });
}

function startRipsnipJob(sourceUrl, sourceTabId, done, options = {}) {
  findRipsnipTab((existingTab) => {
    if (existingTab) {
      jobs.set(existingTab.id, {
        sourceTabId,
        sourceUrl,
        createdAt: Date.now(),
        started: true,
        keepOpen: true,
        ...options
      });

      if (existingTab.status === "complete") {
        sendRunRipsnip(existingTab.id, jobs.get(existingTab.id));
      } else {
        chrome.tabs.update(existingTab.id, { url: RIPSNIP_URL, active: false });
      }

      done?.({ ok: true, mode: "ripsnip" });
      return;
    }

    chrome.tabs.create({ url: RIPSNIP_URL, active: true }, (tab) => {
      if (tab.windowId) chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      jobs.set(tab.id, {
        sourceTabId,
        sourceUrl,
        createdAt: Date.now(),
        started: false,
        keepOpen: true,
        ...options
      });
      done?.({ ok: true, mode: "ripsnip" });
    });
  });
}

function sendRunRipsnip(tabId, job, attempt = 0) {
  chrome.tabs.sendMessage(tabId, {
    type: "RUN_RIPSNIP",
    url: job.sourceUrl
  }).catch(() => {
    if (attempt < 15 && jobs.has(tabId)) {
      setTimeout(() => sendRunRipsnip(tabId, job, attempt + 1), 100);
      return;
    }

    const current = jobs.get(tabId);
    if (current) {
      current.started = false;
      jobs.set(tabId, current);
    }
  });
}

// Redgifs' CDN answers our worker probe with 403 (anti-bot / no referrer) even
// though the real browser download succeeds — so for THOSE hosts we treat a 403
// as reachable. Other hosts (e.g. reddit's preview.redd.it) return a REAL 403
// HTML error page that must NOT be downloaded, so they stay strict (ok/206).
function existsStatus(s) {
  return s === 200 || s === 206 || s === 401 || s === 403 || s === 405 || s === 416 || s === 429;
}

// Hosts whose CDN answers our worker probe with 403 (anti-bot / no referrer) but
// still serve the real file to the browser download: redgifs + reddit's direct
// image hosts. For these a 403 counts as reachable.
function isTrustedMediaHost(url) {
  // Only redgifs' CDN gets the "403 = reachable" benefit. Reddit's i.redd.it is
  // NOT trusted: for NSFW images it returns an HTML consent page to the worker
  // (and to chrome.downloads) → must be rejected so we fall back to the signed
  // preview.redd.it URL, which actually downloads.
  try {
    return /(?:^|\.)redgifs\.com$|gifdeliverynetwork/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isHtmlLikeCT(res) {
  const ct = ((res && res.headers && res.headers.get("content-type")) || "").toLowerCase();
  return ct.includes("html") || ct.includes("/xml");
}

async function mediaUrlReachable(url) {
  if (!isDownloadUrl(url)) return false;
  const trusted = isTrustedMediaHost(url);

  try {
    const partial = await fetchWithTimeout(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers: { Range: "bytes=0-0" }
    }, 5000);
    if (partial.status === 404 || partial.status === 410) return false;
    // An HTML/XML body is an error page (e.g. reddit preview 403) — never
    // download it as media (this was the ".htm" bug).
    if (isHtmlLikeCT(partial) && !trusted) return false;
    if (partial.ok || partial.status === 206) return true;
    if (trusted && existsStatus(partial.status)) return true;
    return false;
  } catch {
    // GET blocked → fall back to HEAD.
    try {
      const head = await fetchWithTimeout(url, { method: "HEAD", cache: "no-store", redirect: "follow" }, 3500);
      if (isHtmlLikeCT(head) && !trusted) return false;
      if (head.ok || head.status === 206) return true;
      if (trusted && existsStatus(head.status)) return true;
      return false;
    } catch {
      return false;
    }
  }
}

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

// True only if the URL actually serves image bytes (not an S3 AccessDenied XML).
async function urlReturnsImage(url) {
  try {
    const res = await fetchWithTimeout(url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers: { Range: "bytes=0-1" }
    }, 6000);
    if (!(res.ok || res.status === 206)) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    return ct.startsWith("image/");
  } catch {
    return false;
  }
}

async function firstReachableMediaUrl(urls) {
  const unique = [...new Set((urls || []).filter(isDownloadUrl))];
  for (const url of unique) {
    if (await mediaUrlReachable(url)) return url;
  }
  return null;
}

async function reachableMediaUrls(urls) {
  const found = [];
  const unique = [...new Set((urls || []).filter(isDownloadUrl))];
  for (const url of unique) {
    if (await mediaUrlReachable(url)) found.push(url);
  }
  return found;
}

// Image identity WITHOUT host — groups an image's alternatives (i.redd.it
// original + preview.redd.it fallback) so a gallery downloads ONE file per
// image (the first reachable), never duplicates and never nothing.
function imageIdentityNoHost(url) {
  let name = String(url || "");
  try { name = new URL(name).pathname.split("/").filter(Boolean).pop() || name; } catch { /* keep raw */ }
  return name
    .toLowerCase()
    .replace(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i, "")
    .replace(/-(silent|mobile|mini|sd|hd|large|small|thumbnail|poster|preview|thumb)$/i, "");
}

async function reachableOnePerImage(urls) {
  const groups = new Map();
  for (const u of (urls || []).filter(isDownloadUrl)) {
    const key = imageIdentityNoHost(u);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }
  const chosen = [];
  for (const list of groups.values()) {
    const url = await firstReachableMediaUrl(list); // first working alternative
    if (url) chosen.push(url);
  }
  return chosen;
}

function extractMediaUrlsFromText(text) {
  const urls = [];
  const decodedTexts = [String(text || "")];
  try {
    const decoded = decodedTexts[0].replace(/\\u002F/g, "/").replace(/&amp;/g, "&").replace(/&#x27;/g, "'");
    if (decoded !== decodedTexts[0]) decodedTexts.push(decoded);
  } catch {
    // Keep original text only.
  }

  for (const value of decodedTexts) {
    const matches = value.match(/https?:\/\/(?:media\.redgifs\.com|[^"'<>\\\s]+?gifdeliverynetwork[^"'<>\\\s]*?)\/[^"'<>\\\s]+?\.(?:mp4|webm|mov|m4v)(?:[?#][^"'<>\\\s]*)?/gi) || [];
    urls.push(...matches.map((url) => url.replace(/[.,;]+$/, "")));
  }
  return [...new Set(urls)];
}

async function resolveMediaViaRipsnip(sourceUrl) {
  if (!sourceUrl) return [];

  try {
    const response = await fetchWithTimeout(`${RIPSNIP_URL}?url=${encodeURIComponent(sourceUrl)}`, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      credentials: "include"
    }, 12000);
    if (!response.ok) return [];
    const html = await response.text();
    return extractMediaUrlsFromText(html);
  } catch {
    return [];
  }
}

function redgifsSlugFromUrl(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const match = parsed.pathname.match(/\/(?:watch|ifr)\/([^/?#]+)/i);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function mediaUrlsFromJson(value) {
  const urls = [];

  function walk(item) {
    if (!item) return;
    if (typeof item === "string") {
      urls.push(...extractMediaUrlsFromText(item));
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) walk(child);
      return;
    }
    if (typeof item === "object") {
      for (const child of Object.values(item)) walk(child);
    }
  }

  walk(value);
  return [...new Set(urls)];
}

async function redgifsTemporaryToken() {
  try {
    const response = await fetchWithTimeout("https://api.redgifs.com/v2/auth/temporary", {
      method: "GET",
      cache: "no-store",
      redirect: "follow"
    }, 8000);
    if (!response.ok) return "";
    const data = await response.json();
    return data?.token || data?.access_token || "";
  } catch {
    return "";
  }
}

async function resolveMediaViaRedgifs(sourceUrl) {
  const slug = redgifsSlugFromUrl(sourceUrl);
  if (!slug) return [];

  const token = await redgifsTemporaryToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    const response = await fetchWithTimeout(`https://api.redgifs.com/v2/gifs/${encodeURIComponent(slug)}`, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers
    }, 10000);
    if (!response.ok) return [];
    const data = await response.json();
    return mediaUrlsFromJson(data);
  } catch {
    return [];
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "OPEN_TAB") {
    chrome.tabs.create({ url: message.url });
    return;
  }

  if (message.type === "START_RIPSNIP") {
    const sourceTabId = sender.tab && sender.tab.id;
    const site = globalThis.RG_SETTINGS.siteFromUrl(sender.tab && sender.tab.url || message.url);
    startRipsnipJob(message.url, sourceTabId, sendResponse, { site });
    return true;
  }

  if (message.type === "DIRECT_DOWNLOAD") {
    const sourceTabId = sender.tab && sender.tab.id;
    const folderName = message.folderName || "";
    const downloadPath = message.downloadPath || "";
    const subFolder = message.subFolder || "";
    // İçerik betiği açık bir `site` gönderirse (ör. Reddit içindeki redgifs embed'i
    // "RedGifs" olarak) URL'den türetileni ezer — özellik C.
    const site = message.site || globalThis.RG_SETTINGS.siteFromUrl(sender.tab && sender.tab.url || message.fallbackSourceUrl);
    // Kaynak etiketi (kullanıcı/subreddit/niche) — özellik A; buluta customMetadata olarak gider.
    const source = (message.source || "").toString().slice(0, 200);
    const ripsnipOptions = { folderName, downloadPath, subFolder, site, source };
    (async () => {
      // Image mode: download the FIRST candidate that actually returns an image
      // (content-type image/*). Skips non-existent -large/clean variants that
      // return an S3 AccessDenied XML (which otherwise saved as a .xml file).
      if (message.imageMode) {
        const urls = [...new Set((message.urls || []).filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)))];
        for (const url of urls) {
          if (await urlReturnsImage(url)) {
            try {
              const download = await downloadToFile(url, sourceTabId, folderName, downloadPath, subFolder, site, url, { source });
              notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "done", text: `Download started (#${download.downloadId}).` });
              sendResponse({ ok: true, mode: "image", url, download });
              return;
            } catch (e) {
              notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "error", text: `Download failed: BG12 ${e.message || e}` });
              sendResponse({ ok: false, error: `BG12: ${e.message || e}` });
              return;
            }
          }
        }
        const detail = `BG21 geçerli görsel yok (aday:${urls.length})`;
        notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "error", text: `Download failed: ${detail}` });
        sendResponse({ ok: false, error: detail });
        return;
      }

      // Callers with authoritative URLs (e.g. Instagram's official API) skip the
      // HEAD/range reachability probe, which can false-negative on CDNs that
      // reject those requests from the service worker.
      if (message.skipReachability) {
        const urls = [...new Set((message.urls || []).filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)))];
        if (!urls.length) {
          notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "error", text: "Download failed: BG10 boş URL" });
          sendResponse({ ok: false, error: "BG10: indirilecek URL yok" });
          return;
        }
        const list = message.downloadAll || message.fallbackOnNoTransfer ? urls : [urls[0]];
        const downloads = [];
        for (const url of list) {
          try {
            const download = await downloadToFile(
              url,
              sourceTabId,
              folderName,
              downloadPath,
              subFolder,
              site,
              message.namingUrl || url,
              { deferCloud: true, source }
            );
            if (message.fallbackOnNoTransfer) {
              // Bulut-tek modda yerel indirme yok; başarılı yükleme (download.cloudKey)
              // aktarımın kanıtıdır, downloadId null gelir.
              if (download.downloadId == null) {
                downloads.push(download);
                break;
              }
              const transfer = await waitForDownloadTransfer(download.downloadId, message.transferTimeoutMs);
              if (!transfer.ok) {
                await cancelDownload(download.downloadId);
                console.warn("[rg-download] candidate did not transfer", { url, reason: transfer.reason });
                continue;
              }
              await download.uploadToCloud?.(); // "both": yalnız doğrulanan adayı aynala
              downloads.push(download);
              break;
            }
            await download.uploadToCloud?.();
            downloads.push(download);
          } catch (e) {
            const msg = e && e.message || e;
            if (!message.fallbackOnNoTransfer) {
              notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "error", text: `Download failed: BG11 ${msg}` });
              sendResponse({ ok: false, error: `BG11: ${msg}` });
              return;
            }
          }
          await sleep(120);
        }
        if (!downloads.length) {
          const detail = `BG13 hiçbir Coomer adayı veri aktarmadı (aday:${list.length})`;
          notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "error", text: `Download failed: ${detail}` });
          sendResponse({ ok: false, error: detail });
          return;
        }
        notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "done", text: `${downloads.length} download started.` });
        sendResponse({ ok: true, mode: "skip-reach", count: downloads.length, downloads });
        return;
      }

      if (message.preferRipsnipWhenOpen && message.fallbackSourceUrl) {
        const ripsnipTab = await new Promise((resolve) => findRipsnipTab(resolve));
        if (ripsnipTab) {
          startRipsnipJob(message.fallbackSourceUrl, sourceTabId, sendResponse, ripsnipOptions);
          return;
        }
      }

      const allowRipsnipFallback = message.allowRipsnipFallback !== false;
      // Filter by expected slug, then keep only the best variant per media so we
      // never grab -silent/-mobile (or download both the clean one AND a variant).
      const scrolllerUrls = message.scrolllerSourceUrl
        ? await resolveMediaViaScrolller(message.scrolllerSourceUrl)
        : [];
      const filteredBySlug = filterUrlsByExpectedSlug([...scrolllerUrls, ...(message.urls || [])], message.expectedSlug);
      const filteredMessageUrls = message.preserveAlternatives
        ? [...new Set(filteredBySlug)]
        : bestPerMedia(filteredBySlug);

      // Step 1: try the page-provided direct CDN URLs FIRST (fast, no API call).
      // With the lenient reachability check, redgifs' 403-on-HEAD no longer
      // rejects these, so one-click direct downloads work again.
      if (message.downloadAll) {
        const reach = await reachableOnePerImage(filteredMessageUrls);
        if (reach.length) {
          const downloads = [];
          for (const url of reach) {
            downloads.push(await downloadToFile(url, sourceTabId, folderName, downloadPath, subFolder, site, url, { source }));
            await sleep(120);
          }
          notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "done", text: `${downloads.length} download started.` });
          sendResponse({ ok: true, mode: "direct-all", count: downloads.length, downloads });
          return;
        }
      } else {
        const first = await firstReachableMediaUrl(filteredMessageUrls);
        if (first) {
          const download = await downloadToFile(first, sourceTabId, folderName, downloadPath, subFolder, site, first, { source });
          notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "done", text: `Download started (#${download.downloadId}).` });
          sendResponse({ ok: true, mode: "direct", url: first, download });
          return;
        }
      }

      // Step 2: no usable page URL — resolve via the Redgifs API, then Ripsnip.
      const directUrls = bestPerMedia([
        ...(await resolveMediaViaRedgifs(message.fallbackSourceUrl)),
        ...(allowRipsnipFallback ? await resolveMediaViaRipsnip(message.fallbackSourceUrl) : [])
      ]);
      if (message.downloadAll) {
        const mediaUrls = await reachableMediaUrls(directUrls);
        if (mediaUrls.length) {
          const downloads = [];
          for (const url of mediaUrls) {
            downloads.push(await downloadToFile(url, sourceTabId, folderName, downloadPath, subFolder, site, url, { source }));
            await sleep(120);
          }
          notify(sourceTabId, {
            type: "RG_HELPER_STATUS",
            level: "done",
            text: `${downloads.length} download started.`
          });
          sendResponse({ ok: true, mode: "direct-all", count: downloads.length, downloads });
          return;
        }
      }

      const mediaUrl = await firstReachableMediaUrl(directUrls);

      if (mediaUrl) {
        const download = await downloadToFile(mediaUrl, sourceTabId, folderName, downloadPath, subFolder, site, mediaUrl, { source });
        notify(sourceTabId, {
          type: "RG_HELPER_STATUS",
          level: "done",
          text: `Download started (#${download.downloadId}).`
        });
        sendResponse({ ok: true, mode: "direct", url: mediaUrl, download });
        return;
      }

      if (allowRipsnipFallback && message.fallbackSourceUrl) {
        startRipsnipJob(message.fallbackSourceUrl, sourceTabId, sendResponse, ripsnipOptions);
        return;
      }

      const pageOk = [...new Set(filteredMessageUrls.filter(isDownloadUrl))].length;
      const apiOk = [...new Set(directUrls.filter(isDownloadUrl))].length;
      const detail = `BG20 erişilebilir medya yok (sayfa-url:${filteredMessageUrls.length}/${pageOk} api-url:${directUrls.length}/${apiOk})`;
      notify(sourceTabId, {
        type: "RG_HELPER_STATUS",
        level: "error",
        text: `Download failed: ${detail}`
      });
      sendResponse({ ok: false, error: detail });
    })().catch((error) => {
      if (message.allowRipsnipFallback !== false && message.fallbackSourceUrl) {
        startRipsnipJob(message.fallbackSourceUrl, sourceTabId, sendResponse, ripsnipOptions);
        return;
      }

      notify(sourceTabId, {
        type: "RG_HELPER_STATUS",
        level: "error",
        text: `Download failed: ${error.message || error}`
      });
      sendResponse({ ok: false, error: String(error && error.message || error) });
    });
    return true;
  }

  if (message.type === "RIPSNIP_STATUS") {
    const job = sender.tab && jobs.get(sender.tab.id);
    notify(job && job.sourceTabId, {
      type: "RG_HELPER_STATUS",
      level: message.level || "busy",
      text: message.text || ""
    });
    return;
  }

  if (message.type === "RIPSNIP_WATCH_MEDIA") {
    const job = sender.tab && jobs.get(sender.tab.id);
    if (!job) return;
    mediaWatch = {
      sourceTabId: job.sourceTabId,
      ripsnipTabId: sender.tab.id,
      until: Date.now() + 120000,
      folderName: job.folderName || "",
      downloadPath: job.downloadPath || "",
      subFolder: job.subFolder || "",
      site: job.site || "Other",
      source: job.source || ""
    };
    return;
  }

  if (message.type === "RIPSNIP_DOWNLOAD_URL") {
    const job = sender.tab && jobs.get(sender.tab.id);
    startDownload(
      message.url,
      job && job.sourceTabId,
      job && job.keepOpen ? null : sender.tab && sender.tab.id,
      job && job.folderName || "",
      job && job.downloadPath || "",
      job && job.subFolder || "",
      job && job.site || "Other",
      job && job.source || ""
    );
  }

  // Özellik D: içerik betiği web listelerini ister / bir gönderiyi listeye ekler.
  // Jeton arka planda; SameSite=Lax çerezi content-script fetch'ine gelmez.
  if (message.type === "GET_LISTS") {
    (async () => {
      try {
        const settings = await globalThis.RG_CLOUD.getSettings();
        if (!globalThis.RG_CLOUD.canUseApi(settings)) { sendResponse({ ok: false, error: "Bulut ayarsız ya da jeton yok" }); return; }
        const snap = (await globalThis.RG_CLOUD.getLists(settings)) || { lists: [], tombstones: [] };
        sendResponse({ ok: true, lists: summarizeLists(snap) });
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  if (message.type === "ADD_WEB_LINK") {
    const url = (message.url || "").toString().trim();
    const title = (message.title || "").toString().trim().slice(0, 300);
    const listId = (message.listId || "").toString();
    const newListName = (message.newListName || "").toString().trim().slice(0, 60);
    (async () => {
      try {
        if (!url) { sendResponse({ ok: false, error: "URL yok" }); return; }
        const settings = await globalThis.RG_CLOUD.getSettings();
        if (!globalThis.RG_CLOUD.canUseApi(settings)) { sendResponse({ ok: false, error: "Bulut ayarsız ya da jeton yok" }); return; }
        sendResponse(await addWebLink(settings, { url, title, listId, newListName }));
      } catch (e) {
        sendResponse({ ok: false, error: (e && e.message) || String(e) });
      }
    })();
    return true;
  }

  // OnlyFans videosu: içerik betiği HLS parçalarını (aynı çerez/Referer/CORS ile,
  // yani oynatıcının kendisi gibi) çekip tek bir Blob'a dizdi ve nesne URL'sini
  // (blob:https://onlyfans.com/…) bize verdi. Service worker bu sayfa-kökenli
  // blob'u fetch EDEMEZ (blob URL'leri köken-hapsindedir), ama
  // chrome.downloads.download blob'u tarayıcı sürecinde çözer — bu yüzden klasör
  // düzeni korunarak indirme yine de çalışır. Dizilmiş HLS'in bulut aynası yok
  // (SW fetch'i blob'da patlar), o yüzden bu videolar yalnız diske iner.
  if (message.type === "OF_HLS_DOWNLOAD") {
    const sourceTabId = sender.tab && sender.tab.id;
    const blobUrl = (message.blobUrl || "").toString();
    const folderName = (message.folderName || "").toString();
    const source = (message.source || "").toString().slice(0, 200);
    // namingUrl sahte bir mp4/ts adresidir (ör. .../creator/12345.mp4); filenameFor
    // uzantıyı + Videolar kategorisini + dosya adını ondan türetir.
    const namingUrl = (message.namingUrl || "onlyfans-video.mp4").toString();
    (async () => {
      try {
        if (!/^blob:/i.test(blobUrl)) { sendResponse({ ok: false, error: "OF10: geçersiz blob URL" }); return; }
        const settings = await readSettings();
        const filename = filenameFor(namingUrl, settings, folderName, "", "", "OnlyFans");
        const downloadId = await localDownload(blobUrl, filename);
        notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "done", text: `Download started (#${downloadId}).` });
        sendResponse({ ok: true, downloadId, filename });
      } catch (e) {
        const msg = (e && e.message) || e;
        notify(sourceTabId, { type: "RG_HELPER_STATUS", level: "error", text: `Download failed: OF11 ${msg}` });
        sendResponse({ ok: false, error: `OF11: ${msg}` });
      }
    })();
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const job = jobs.get(tabId);
  if (job && changeInfo.status === "complete" && !job.started) {
    job.started = true;
    jobs.set(tabId, job);
    sendRunRipsnip(tabId, job);
  }

  if (mediaWatch && changeInfo.status === "complete") {
    watchMediaTab(tabId, tab.url || changeInfo.url || "");
  } else if (mediaWatch && changeInfo.url && isMediaUrl(changeInfo.url)) {
    watchMediaTab(tabId, changeInfo.url);
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!mediaWatch) return;
  if (tab.url && isMediaUrl(tab.url)) {
    watchMediaTab(tab.id, tab.url);
  }
});
