"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function client(failSave = false) {
  let snapshot = { lists: [
    { id: "list-a", name: "Phone list", items: [{ id: "one", url: "https://example.org/one" }, { id: "new-phone-item", url: "https://example.org/new" }], updatedAt: "2025-01-01T00:00:00Z" },
    { id: "list-b", name: "Unrelated", items: [] }
  ], tombstones: [{ id: "old-id", deletedAt: "2025-01-01T00:00:00Z" }], extra: "preserve" };
  const initial = JSON.stringify(snapshot);
  const context = vm.createContext({ URL, AbortController, setTimeout, clearTimeout, structuredClone, fetch: async (_url, options) => {
    if (options.method === "PUT") {
      if (failSave) return { ok: false, status: 500 };
      snapshot = JSON.parse(options.body);
    }
    return { ok: true, json: async () => structuredClone(snapshot) };
  } });
  vm.runInContext(fs.readFileSync(require.resolve("../edge-extension/common/cloud.js"), "utf8"), context);
  return { api: context.RG_CLOUD, settings: { cloudBase: "https://archive.example", cloudToken: "fixture" }, snapshot: () => snapshot, initial };
}
test("removing one list item preserves new mobile items and updates a Swift-compatible timestamp", async () => {
  const x = client();
  const result = await x.api.removeListItem(x.settings, "list-a", "one", "https://example.org/one");
  assert.deepEqual(result.lists[0].items.map((item) => item.id), ["new-phone-item"]);
  assert.match(result.lists[0].updatedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(result.extra, "preserve");
});
test("deleting a list writes a dated tombstone, never a bare string", async () => {
  const x = client();
  const result = await x.api.removeList(x.settings, "list-a");
  assert.deepEqual(result.lists.map((item) => item.id), ["list-b"]);
  assert.equal(result.tombstones[1].id, "list-a");
  assert.match(result.tombstones[1].deletedAt, /Z$/);
});
test("failed list writes do not mutate the previously fetched snapshot", async () => {
  const x = client(true);
  await assert.rejects(x.api.removeList(x.settings, "list-a"), /500/);
  assert.equal(JSON.stringify(x.snapshot()), x.initial);
});
