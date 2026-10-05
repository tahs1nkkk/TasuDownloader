"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../edge-extension/common/download-feedback.js"), "utf8");
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(saved = [], searchState = "in_progress") {
  const messages = [], listeners = [];
  const store = { tasuDownloadFeedback: saved };
  const chrome = {
    storage: { session: { async get() { return store; }, async set(value) { Object.assign(store, JSON.parse(JSON.stringify(value))); } } },
    runtime: { async sendMessage(message) { messages.push({ extension: true, ...message }); } },
    tabs: { async sendMessage(tabId, message, options) { messages.push({ tabId, ...message, options }); } },
    downloads: { search({ id }, callback) { callback([{ id, state: searchState }]); }, onChanged: { addListener(fn) { listeners.push(fn); } } }
  };
  const context = vm.createContext({ chrome }); vm.runInContext(source, context);
  return { api: context.RG_DOWNLOAD_FEEDBACK, messages, store, emit(delta) { listeners.forEach(fn => fn(delta)); } };
}
test("accepted downloads do not report success until the browser completes them", async () => {
  const x = fixture(); x.api.watch(1, 20); await tick();
  assert.equal(x.messages.length, 0);
  x.emit({ id: 1, state: { current: "complete" } }); await tick();
  assert.equal(x.messages.length, 1); assert.equal(x.messages[0].level, "success"); assert.equal(x.messages[0].tabId, 20);
  assert.equal(x.messages[0].options.frameId, 0, "Completion must not broadcast to embedded players");
  x.emit({ id: 1, state: { current: "complete" } }); await tick();
  assert.equal(x.messages.length, 1); assert.deepEqual(x.store.tasuDownloadFeedback, []);
});
test("interrupted downloads report an error only to their source tab", async () => {
  const x = fixture(); x.api.watch(2, 21);
  x.emit({ id: 999, state: { current: "complete" } });
  x.emit({ id: 2, state: { current: "interrupted" }, error: { current: "NETWORK_FAILED" } }); await tick();
  assert.equal(x.messages.length, 1); assert.equal(x.messages[0].level, "error"); assert.match(x.messages[0].text, /NETWORK_FAILED/);
});
test("tiny downloads completed before watch are still reported", async () => {
  const x = fixture([], "complete"); x.api.watch(3, 22); await tick();
  assert.equal(x.messages.length, 1); assert.equal(x.messages[0].level, "success");
});
test("download routes survive worker restart but old routes expire", async () => {
  const x = fixture([[4, { tabId: 23, time: Date.now() }], [5, { tabId: 24, time: Date.now() - 86400001 }]]);
  x.emit({ id: 4, state: { current: "complete" } }); x.emit({ id: 5, state: { current: "complete" } }); await tick();
  assert.equal(x.messages.length, 1); assert.equal(x.messages[0].tabId, 23);
});
test("extension gallery completion is routed through runtime with a target tab", async () => {
  const x = fixture(); x.api.watch(6, 25, true); await tick();
  x.emit({ id: 6, state: { current: "complete" } }); await tick();
  assert.equal(x.messages.length, 1); assert.equal(x.messages[0].extension, true); assert.equal(x.messages[0].targetTabId, 25);
});
test("invalid download routes never send notifications", async () => {
  const x = fixture([], "complete");
  for (const [id, tab] of [[-1, undefined], [1, -1], ["1", 2], [2, null]]) x.api.watch(id, tab);
  await tick(); assert.equal(x.messages.length, 0);
});
