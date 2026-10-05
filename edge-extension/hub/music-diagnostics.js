/* Explicit, status-only connection checks. Never inspect accounts, jobs or media. */
(() => {
  "use strict";
  const host = "com.tasuapps.music";
  const knownErrors = new Set([
    "Specified native messaging host not found.",
    "Native messaging host com.tasuapps.music is not registered.",
    "Access to the specified native messaging host is forbidden.",
    "Failed to start native messaging host.",
    "Native host has exited.",
    "Error when communicating with the native messaging host.",
    "Native Messaging is not supported on this platform.",
    "Invalid native messaging host name specified."
  ]);
  function safeError(message) {
    const text = String(message || "");
    return knownErrors.has(text) ? text : "Unrecognized browser error (details omitted)";
  }
  function result(response) {
    return {
      ok: response?.ok === true && response.version === 1,
      protocol: typeof response?.version === "number" ? response.version : null,
      ffmpeg: typeof response?.data?.ffmpeg_ok === "boolean" ? response.data.ffmpeg_ok : null,
      error: response?.ok === false ? "Helper returned an error (details omitted)" : null
    };
  }
  function probe(mode) {
    return new Promise(resolve => {
      const start = Date.now();
      let port = null, settled = false;
      const finish = data => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (port) { try { port.disconnect(); } catch {} }
        resolve({ ...data, durationMs: Date.now() - start });
      };
      const timer = setTimeout(() => finish({ ok: false, error: "Connection check timed out" }), 15000);
      const request = { version: 1, id: crypto.randomUUID(), method: "status", params: {} };
      try {
        if (typeof chrome.runtime[mode] !== "function") { finish({ ok: false, error: "Native Messaging API unavailable" }); return; }
        if (mode === "sendNativeMessage") {
          chrome.runtime.sendNativeMessage(host, request, response => {
            const error = chrome.runtime.lastError?.message;
            finish(error ? { ok: false, error: safeError(error) } : result(response));
          });
        } else {
          port = chrome.runtime.connectNative(host);
          port.onMessage.addListener(response => finish(result(response)));
          port.onDisconnect.addListener(() => {
            const error = chrome.runtime.lastError?.message;
            finish({ ok: false, error: error ? safeError(error) : "Native port closed" });
          });
          port.postMessage(request);
        }
      } catch (error) { finish({ ok: false, error: safeError(error.message) }); }
    });
  }
  async function run() {
    const permission = await chrome.permissions.contains({ permissions: ["nativeMessaging"] }).catch(() => false);
    const report = { permission, sendApi: typeof chrome.runtime.sendNativeMessage === "function", connectApi: typeof chrome.runtime.connectNative === "function" };
    if (!permission) return report;
    // Sequential probes keep a cold engine from being started concurrently.
    report.send = await probe("sendNativeMessage");
    report.connect = await probe("connectNative");
    return report;
  }
  globalThis.TasuMusicDiagnostics = { run };
})();
