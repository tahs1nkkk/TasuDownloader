"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readAsset } = require("../scripts/lib/shared-build.js");

async function resolve(html, url = "https://scrolller.com/sample-post", ok = true) {
  let requests = 0;
  const context = vm.createContext({
    URL, AbortController, setTimeout, clearTimeout,
    fetch: async () => { requests++; return { ok, text: async () => html }; }
  });
  vm.runInContext(readAsset("common/media-rules.js"), context);
  vm.runInContext(readAsset("common/scrolller-resolve.js"), context);
  const urls = await context.RG_SCROLLLER.resolveMediaViaScrolller(url);
  return { urls: Array.from(urls), requests };
}

test("Scrolller: original image wins over the resized image", async () => {
  const { urls } = await resolve('<img src="https://media.example/preview.webp"><meta property="og:image" content="https://media.example/original.jpg">');
  assert.equal(urls[0], "https://media.example/original.jpg");
});
test("Scrolller: video wins over its image poster", async () => {
  const { urls } = await resolve('<meta property="og:image" content="https://media.example/poster.jpg"><meta property="og:video" content="https://photon.scrolller.com/video.mp4">');
  assert.equal(urls[0], "https://photon.scrolller.com/video.mp4");
});
test("Scrolller: GIF keeps its original format ahead of the MP4 rendition", async () => {
  const { urls } = await resolve('<meta property="og:image" content="https://media.example/animation.gif"><video src="https://photon.scrolller.com/animation.mp4"></video>');
  assert.equal(urls[0], "https://media.example/animation.gif");
});
test("Scrolller: escaped URLs normalize and duplicate candidates collapse", async () => {
  const { urls } = await resolve('<meta property="og:video" content="https:\\u002f\\u002fphoton.scrolller.com\\u002fvideo.mp4?a=1&amp;b=2"><video src="https://photon.scrolller.com/video.mp4?a=1&amp;b=2"></video>');
  assert.deepEqual(urls, ["https://photon.scrolller.com/video.mp4?a=1&b=2"]);
});
test("Scrolller: unrelated hosts do not trigger a request", async () => {
  assert.deepEqual(await resolve("", "https://scrolller.com.example.org/post"), { urls: [], requests: 0 });
});
test("Scrolller: unavailable source returns no candidates", async () => {
  assert.deepEqual(await resolve("", undefined, false), { urls: [], requests: 1 });
});
