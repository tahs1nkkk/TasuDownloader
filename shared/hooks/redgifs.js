// Shared source; platform packages are generated from this file.
(() => {
  if (window.__rgRipsnipPageHookLoaded) return;
  window.__rgRipsnipPageHookLoaded = true;

  function publish(text, source) {
    if (document.hidden || document.documentElement.dataset.tasuSuspended === "true") return;
    if (!text || typeof text !== "string") return;
    window.postMessage(
      {
        source: "RG_RIPSNIP_PAGE_HOOK",
        type: "CLIPBOARD_WRITE",
        text,
        method: source
      },
      "*"
    );
  }

  try {
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      const originalWriteText = clipboard.writeText.bind(clipboard);
      clipboard.writeText = (text) => {
        publish(String(text || ""), "navigator.clipboard.writeText");
        return originalWriteText(text);
      };
    }
  } catch {
    // Some browsers lock down navigator.clipboard descriptors. The visible
    // clipboard fallback in content-redgifs.js still runs.
  }

  document.addEventListener(
    "copy",
    (event) => {
      const selected = String(window.getSelection && window.getSelection() || "");
      const data = event.clipboardData && event.clipboardData.getData("text/plain");
      publish(data || selected, "copy-event");
    },
    true
  );
})();
