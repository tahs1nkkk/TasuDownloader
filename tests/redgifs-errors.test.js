"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), vm = require("node:vm");
const { readAsset } = require("../scripts/lib/shared-build.js");
const source = readAsset("content-redgifs.js");
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf("  function connectionErrorCode("), source.indexOf("  function installUi(")), context);

test("RedGifs expired/closed extension connections give actionable errors, not E_FAILED", () => {
  for (const message of ["Extension context invalidated.", "Could not establish connection. Receiving end does not exist.", "The message port closed before a response was received."]) {
    const error = new Error(message);
    assert.match(context.toErrorCode(error), /E_(RELOAD|CONNECTION).*Ctrl\+R/);
    assert.equal(context.stopDownloadFallback(error), true);
  }
});
test("RedGifs backend codes survive mapping without exposing private diagnostic payloads", () => {
  for (const code of ["BG20", "BG21", "DLC01", "DLC02"]) {
    assert.equal(context.toErrorCode(new Error(`Download failed: ${code} https://private.example/secret?token=secret`)), code);
  }
  assert.equal(context.toErrorCode(new Error("Download failed")), "E_DOWNLOAD");
  assert.equal(context.toErrorCode(new Error("This is an ad.")), "E_AD");
  assert.equal(context.toErrorCode(new Error("Direct media disabled.")), "E_DISABLED");
});
test("RedGifs ambiguous timeouts cannot start a second download through Copy Link", () => {
  assert.match(context.toErrorCode(new Error("Direct media timed out.")), /^E_TIMEOUT/);
  assert.equal(context.stopDownloadFallback(new Error("Direct media timed out.")), true);
  assert.equal(context.stopDownloadFallback(new Error("DLC01: invalid request")), true);
  assert.equal(context.stopDownloadFallback(new Error("BG20 erişilebilir medya yok")), false);
});
