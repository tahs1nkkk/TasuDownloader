// Track real browser completion separately from "download request accepted".
(() => {
  const KEY = "tasuDownloadFeedback";
  const routes = new Map();
  let writes = Promise.resolve();
  const ready = (async () => {
    try {
      const stored = await chrome.storage.session?.get(KEY);
      for (const [id, route] of stored?.[KEY] || []) if (Date.now() - route.time < 86400000 && !routes.has(id)) routes.set(id, route);
    } catch { /* Feedback must never block a download. */ }
  })();
  function save() {
    if (!chrome.storage.session) return;
    writes = writes.catch(() => {}).then(() => chrome.storage.session.set({ [KEY]: [...routes] })).catch(() => {});
  }
  async function report(id, state, error) {
    await ready;
    const route = routes.get(id);
    if (!route || !["complete", "interrupted"].includes(state)) return;
    routes.delete(id); save();
    const message = { type: "RG_UI_DOWNLOAD_STATUS", level: state === "complete" ? "success" : "error",
      text: state === "complete" ? "İndirme tamamlandı. Dosya kaydedildi." : `İndirme tamamlanamadı${error ? ` (${error})` : ""}.` };
    try {
      if (route.extensionPage) await chrome.runtime.sendMessage({ ...message, targetTabId: route.tabId });
      else await chrome.tabs.sendMessage(route.tabId, message, { frameId: 0 });
    } catch { /* Origin tab may already be closed. */ }
  }
  globalThis.RG_DOWNLOAD_FEEDBACK = {
    watch(id, tabId, extensionPage = false) {
      if (!Number.isInteger(id) || !Number.isInteger(tabId) || tabId < 0) return;
      routes.set(id, { tabId, extensionPage, time: Date.now() });
      if (routes.size > 500) routes.delete(routes.keys().next().value);
      void ready.then(() => {
        save();
        // A tiny image may complete before its download callback ran.
        chrome.downloads.search?.({ id }, (items) => {
          if (chrome.runtime.lastError) return;
          const item = items?.[0];
          if (item) void report(id, item.state, item.error);
        });
      });
    }
  };
  chrome.downloads.onChanged?.addListener((delta) => { if (delta.state) void report(delta.id, delta.state.current, delta.error?.current); });
})();
