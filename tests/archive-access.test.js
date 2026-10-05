"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { archiveURL, trustedPage, create } = require("../edge-extension/common/archive-access.js");

function mock() {
  const events = () => { const callbacks = []; return { addListener(fn) { callbacks.push(fn); }, emit(...args) { callbacks.forEach((fn) => fn(...args)); } }; };
  const rules = new Map(), alarms = new Map(), opened = [], updated = [], downloads = [];
  const settings = { cloudBase: "https://archive.example", cloudToken: "fixture-secret+only", cloudBwDown: 5 };
  const chrome = {
    runtime: { id: "test-extension" },
    storage: { onChanged: events() },
    tabs: { onUpdated: events(), onRemoved: events(),
      async create(value) { const tab = { id: opened.length + 1, ...value }; opened.push(tab); return tab; },
      async update(id, change) { updated.push({ id, ...change }); return change; }, async remove() {} },
    declarativeNetRequest: {
      async getSessionRules() { return [...rules.values()]; },
      async updateSessionRules({ addRules = [], removeRuleIds = [] }) { removeRuleIds.forEach((id) => rules.delete(id)); addRules.forEach((rule) => rules.set(rule.id, rule)); }
    },
    alarms: { onAlarm: events(), async create(name, alarm) { alarms.set(name, { ...alarm, scheduledTime: alarm.when }); }, async clear(name) { alarms.delete(name); }, async get(name) { return alarms.get(name); } },
    downloads: { async download(value) { downloads.push(value); return downloads.length; } }
  };
  const adapter = create(chrome, { readSettings: async () => settings, filenameFor: () => "Tasu/Reddit/Fotoğraflar/sample.jpg" });
  const sender = { id: chrome.runtime.id, url: "chrome-extension://test-extension/popup.html", frameId: 0 };
  const send = (message, from = sender) => new Promise((resolve) => adapter.handle(message, from, resolve));
  return { chrome, settings, rules, alarms, opened, updated, downloads, adapter, sender, send };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("archive routes accept only a configured HTTPS origin and known views", () => {
  assert.equal(archiveURL("https://archive.example/", "lists", true), "https://archive.example/auth/app?next=%2F%3Fgo%3Dlists");
  assert.equal(archiveURL("https://archive.example", "media"), "https://archive.example/?go=media");
  for (const base of ["http://archive.example", "javascript:alert(1)", "https://user:secret@archive.example", "https://archive.example/?token=private", "https://archive.example/base", "https://archive.example/#key"]) assert.throws(() => archiveURL(base));
  assert.throws(() => archiveURL("https://archive.example", "//external.example"));
});
test("token login is scoped to one exact main-frame URL in one tab", async () => {
  const x = mock();
  const result = await x.send({ type: "OPEN_TASU_ARCHIVE", view: "lists" });
  assert.equal(result.mode, "token");
  const rule = [...x.rules.values()][0];
  assert.deepEqual(rule.condition.tabIds, [result.tabId]);
  assert.deepEqual(rule.condition.resourceTypes, ["main_frame"]);
  assert.equal(rule.condition.urlFilter, `|${x.updated[0].url}|`);
  assert.equal(rule.action.requestHeaders[0].value, `Bearer ${x.settings.cloudToken}`);
  assert.equal(JSON.stringify([x.opened, x.updated, result]).includes(x.settings.cloudToken), false);
  x.chrome.tabs.onUpdated.emit(result.tabId, { url: "https://archive.example/?go=lists" }, { url: "https://archive.example/?go=lists" });
  await tick();
  assert.equal(x.rules.size, 0);
  assert.equal(x.alarms.size, 0);
});
test("unrelated navigation cannot remove another login, but expiry and closure do", async () => {
  const x = mock();
  const first = await x.send({ type: "OPEN_TASU_ARCHIVE" });
  await x.send({ type: "OPEN_TASU_ARCHIVE", view: "media" });
  assert.equal(x.rules.size, 2);
  x.chrome.tabs.onUpdated.emit(999, { status: "complete" }, { url: "https://example.org" });
  await tick();
  assert.equal(x.rules.size, 2);
  x.chrome.tabs.onRemoved.emit(first.tabId);
  await tick();
  assert.equal(x.rules.size, 1);
  x.chrome.alarms.onAlarm.emit({ name: [...x.alarms.keys()][0] });
  await tick();
  assert.equal(x.rules.size, 0);
});
test("expired login rules are cleared when a worker restarts", async () => {
  const x = mock();
  await x.send({ type: "OPEN_TASU_ARCHIVE" });
  x.alarms.clear();
  const next = create(x.chrome, { readSettings: async () => x.settings });
  await next.ready;
  assert.equal(x.rules.size, 0);
});
test("changing archive credentials clears a pending login and blocks stale gallery downloads", async () => {
  const x = mock();
  await x.send({ type: "OPEN_TASU_ARCHIVE" });
  x.chrome.storage.onChanged.emit({ tasuDownloaderSettings: { oldValue: x.settings, newValue: { cloudBase: "https://other.example" } } }, "local");
  await tick();
  assert.equal(x.rules.size, 0);
  assert.equal((await x.send({ type: "DOWNLOAD_ARCHIVE_MEDIA", key: "main/x.jpg", expectedBase: "https://other.example" })).ok, false);
  assert.equal(x.downloads.length, 0);
});
test("Google or tokenless entry never installs an Authorization rule", async () => {
  const x = mock();
  assert.equal((await x.send({ type: "OPEN_TASU_ARCHIVE", google: true })).mode, "site");
  x.settings.cloudToken = "";
  assert.equal((await x.send({ type: "OPEN_TASU_ARCHIVE" })).mode, "site");
  assert.equal(x.rules.size, 0);
  assert.equal(x.opened[0].url, "https://archive.example/");
});
test("remote content scripts and subframes cannot open or download the private archive", async () => {
  const x = mock();
  for (const sender of [{ ...x.sender, url: "https://scrolller.com/" }, { ...x.sender, frameId: 2 }, { ...x.sender, id: "other" }]) {
    assert.equal(trustedPage(x.chrome, sender), false);
    assert.equal((await x.send({ type: "OPEN_TASU_ARCHIVE" }, sender)).ok, false);
    assert.equal((await x.send({ type: "DOWNLOAD_ARCHIVE_MEDIA", key: "main/x.jpg" }, sender)).ok, false);
  }
  assert.equal(x.opened.length, 0);
  assert.equal(x.downloads.length, 0);
});
test("archive downloads preserve folder routing and send tokens only as headers", async () => {
  const x = mock();
  const result = await x.send({ type: "DOWNLOAD_ARCHIVE_MEDIA", key: "main/a b+ü.jpg", site: "Reddit" });
  assert.equal(result.ok, true);
  const options = x.downloads[0];
  assert.equal(options.url, "https://archive.example/api/media/main/a%20b%2B%C3%BC.jpg?bw=5");
  assert.equal(options.filename, "Tasu/Reddit/Fotoğraflar/sample.jpg");
  assert.equal(options.headers[0].value, `Bearer ${x.settings.cloudToken}`);
  assert.equal(options.url.includes(x.settings.cloudToken), false);
  for (const key of ["../secret", "main/../secret", "main//x.jpg", "main\\x.jpg", ""]) assert.equal((await x.send({ type: "DOWNLOAD_ARCHIVE_MEDIA", key })).ok, false);
  assert.equal(x.downloads.length, 1);
});
test("only the own hub may embed the archive controls", async () => {
  const x=mock(),sender={...x.sender,frameId:2,tab:{url:"chrome-extension://test-extension/hub.html?route=downloader"}};
  assert.equal(trustedPage(x.chrome,sender),true);
  assert.equal((await x.send({type:"OPEN_TASU_ARCHIVE",google:true},sender)).ok,true);
  for(const url of ["https://example.com/hub.html","chrome-extension://other/hub.html","chrome-extension://test-extension/unknown.html"])assert.equal(trustedPage(x.chrome,{...sender,tab:{url}}),false);
});
test("navigation failures remove rules and never return the token in errors", async () => {
  const x = mock();
  x.chrome.tabs.update = async () => { throw new Error(x.settings.cloudToken); };
  const result = await x.send({ type: "OPEN_TASU_ARCHIVE" });
  assert.equal(result.ok, false);
  assert.equal(result.error.includes(x.settings.cloudToken), false);
  assert.equal(x.rules.size, 0);
});
