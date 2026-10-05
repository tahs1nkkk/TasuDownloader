// Edge adapter for the same /auth/app entry point used by the native iOS app.
// Tokens never enter navigation URLs, page scripts, query strings or logs.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RG_ARCHIVE = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";
  const FIRST_RULE = 740000;
  const LAST_RULE = 749999;
  const ALARM_PREFIX = "tasu-archive-login:";
  const VIEWS = ["home", "media", "lists"];

  function archiveURL(base, view = "home", login = false) {
    if (!VIEWS.includes(view)) throw new Error("Arşiv görünümü geçersiz.");
    let url;
    try { url = new URL(String(base || "").trim()); } catch { throw new Error("Ayarlar bölümüne geçerli Tasu Arşiv adresini gir."); }
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname)) {
      throw new Error("Arşiv adresi yalnız HTTPS site adresi olmalı; yol, anahtar veya sorgu içermemeli.");
    }
    const next = view === "home" ? "/" : `/?go=${view}`;
    return login ? `${url.origin}/auth/app?next=${encodeURIComponent(next)}` : `${url.origin}${next}`;
  }

  function trustedPage(chrome, sender) {
    try {
      const url = new URL(sender.url);
      const local = sender.id === chrome.runtime.id && url.protocol === "chrome-extension:" && url.hostname === chrome.runtime.id;
      const hub = sender.tab?.url && new URL(sender.tab.url);
      const embeddedHub = url.pathname === "/popup.html" && hub?.protocol === url.protocol && hub?.origin === url.origin && hub?.hostname === url.hostname && hub?.pathname === "/hub.html";
      return local && ["/popup.html", "/archive.html"].includes(url.pathname) && (sender.frameId == null || sender.frameId === 0 || embeddedHub);
    } catch { return false; }
  }
  const owned = (rule) => rule.id >= FIRST_RULE && rule.id <= LAST_RULE;

  function create(chrome, { readSettings, filenameFor, watchDownload = () => {} }) {
    const tracked = new Map();
    let queue = Promise.resolve();
    async function remove(id) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id] });
      tracked.delete(id);
      await chrome.alarms.clear(ALARM_PREFIX + id);
    }
    const ready = chrome.declarativeNetRequest && chrome.alarms ? (async () => {
      for (const rule of (await chrome.declarativeNetRequest.getSessionRules()).filter(owned)) {
        const alarm = await chrome.alarms.get(ALARM_PREFIX + rule.id);
        if (!alarm || alarm.scheduledTime <= Date.now()) await remove(rule.id);
        else tracked.set(rule.id, { tabId: rule.condition.tabIds?.[0], url: rule.condition.urlFilter?.slice(1, -1) });
      }
    })() : Promise.resolve();
    // No secret-bearing errors are logged if the browser denies a rule operation.
    ready.catch(() => {});

    chrome.tabs.onUpdated?.addListener((tabId, change, tab) => {
      for (const [id, entry] of tracked) {
        const url = change.url || tab.url;
        if (entry.tabId === tabId && url && url !== "about:blank" &&
            (url !== entry.url || change.status === "complete")) remove(id).catch(() => {});
      }
    });
    chrome.tabs.onRemoved?.addListener((tabId) => {
      for (const [id, entry] of tracked) if (entry.tabId === tabId) remove(id).catch(() => {});
    });
    chrome.storage?.onChanged?.addListener((changes, area) => {
      const changed = changes.tasuDownloaderSettings;
      if (area !== "local" || !changed) return;
      if (changed.oldValue?.cloudBase !== changed.newValue?.cloudBase || changed.oldValue?.cloudToken !== changed.newValue?.cloudToken) {
        for (const id of tracked.keys()) remove(id).catch(() => {});
      }
    });
    chrome.alarms?.onAlarm.addListener((alarm) => {
      if (!alarm.name.startsWith(ALARM_PREFIX)) return;
      const id = Number(alarm.name.slice(ALARM_PREFIX.length));
      if (Number.isInteger(id) && owned({ id })) remove(id).catch(() => {});
    });

    async function open(view, forceGoogle) {
      await ready;
      const settings = await readSettings();
      const target = archiveURL(settings.cloudBase, view);
      const token = String(settings.cloudToken || "").trim();
      if (forceGoogle || !token) {
        const tab = await chrome.tabs.create({ url: target });
        return { ok: true, tabId: tab.id, mode: "site" };
      }
      if (!chrome.declarativeNetRequest || !chrome.alarms) throw new Error("Yeni arşiv izinleri için eklentiyi yeniden yükle.");
      if (/[\r\n]/.test(token)) throw new Error("Arşiv anahtarı geçersiz.");
      const login = archiveURL(settings.cloudBase, view, true);
      const existing = await chrome.declarativeNetRequest.getSessionRules();
      const ids = new Set(existing.map((rule) => rule.id));
      let id = FIRST_RULE;
      while (ids.has(id) && id <= LAST_RULE) id++;
      if (id > LAST_RULE) throw new Error("Çok fazla arşiv bağlantısı açılıyor; biraz sonra tekrar dene.");
      const tab = await chrome.tabs.create({ url: "about:blank" });
      try {
        // Install the expiry before the rule so worker suspension cannot orphan a token.
        await chrome.alarms.create(ALARM_PREFIX + id, { when: Date.now() + 60_000 });
        await chrome.declarativeNetRequest.updateSessionRules({ addRules: [{
          id, priority: 1,
          action: { type: "modifyHeaders", requestHeaders: [{ header: "Authorization", operation: "set", value: `Bearer ${token}` }] },
          condition: { urlFilter: `|${login}|`, isUrlFilterCaseSensitive: true, resourceTypes: ["main_frame"], tabIds: [tab.id] }
        }] });
        tracked.set(id, { tabId: tab.id, url: login });
        await chrome.tabs.update(tab.id, { url: login });
        return { ok: true, tabId: tab.id, mode: "token" };
      } catch {
        await remove(id).catch(() => {});
        await chrome.tabs.remove(tab.id).catch(() => {});
        throw new Error("Arşiv açılmadı. Eklentiyi yeniden yükleyip adresi ve izinleri kontrol et.");
      }
    }

    async function download(message, sender) {
      const settings = await readSettings();
      const base = archiveURL(settings.cloudBase);
      if (message.expectedBase != null && archiveURL(message.expectedBase) !== base) throw new Error("Arşiv hesabı değişti; galeriyi yenile.");
      const token = String(settings.cloudToken || "").trim();
      if (!token || /[\r\n]/.test(token)) throw new Error("Arşivden indirmek için geçerli anahtar gerekli.");
      const key = message.key;
      if (typeof key !== "string" || !key || key.length > 2048 || key.split("/").some((part) => !part || part === "." || part === "..") || /[\\\x00-\x1f]/.test(key)) {
        throw new Error("Medya anahtarı geçersiz.");
      }
      const url = new URL(`api/media/${key.split("/").map(encodeURIComponent).join("/")}`, base);
      if (Number(settings.cloudBwDown) > 0) url.searchParams.set("bw", String(settings.cloudBwDown));
      const site = typeof message.site === "string" ? message.site : "Other";
      const filename = filenameFor(url.href, settings, "", "", "", site);
      const downloadId = await chrome.downloads.download({
        url: url.href, filename, headers: [{ name: "Authorization", value: `Bearer ${token}` }],
        conflictAction: "uniquify", saveAs: false
      });
      watchDownload(downloadId, sender.tab?.id, true);
      return { ok: true, downloadId };
    }

    function handle(message, sender, respond) {
      if (!["OPEN_TASU_ARCHIVE", "DOWNLOAD_ARCHIVE_MEDIA"].includes(message?.type)) return false;
      if (!trustedPage(chrome, sender)) { respond({ ok: false, error: "Bu işlem yalnız eklentinin arşiv ekranından yapılabilir." }); return true; }
      const task = () => message.type === "OPEN_TASU_ARCHIVE" ? open(message.view || "home", message.google === true) : download(message, sender);
      const pending = queue.then(task);
      queue = pending.catch(() => {});
      pending.then(respond, (error) => respond({ ok: false, error: message.type === "DOWNLOAD_ARCHIVE_MEDIA" ? "İndirme başlatılamadı; arşiv adresini ve anahtarı kontrol et." : error.message }));
      return true;
    }
    return { handle, ready };
  }
  return Object.freeze({ archiveURL, trustedPage, create });
});
