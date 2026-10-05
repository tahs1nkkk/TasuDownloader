const assert = require("node:assert/strict");
const {
  DEFAULT_SETTINGS,
  cleanPathPart,
  siteFromUrl,
  mediaCategoryFromUrl,
  downloadDirectory
} = require("../shared/core/settings.js");

assert.equal(DEFAULT_SETTINGS.folderLayout, "organized");
assert.equal(cleanPathPart('  Work: Clips?  '), "Work- Clips");
assert.equal(siteFromUrl("https://www.redgifs.com/watch/example"), "RedGifs");
assert.equal(siteFromUrl("https://coomer.st/fansly/user/123/post/456"), "Coomer");
assert.equal(siteFromUrl("https://preview.redd.it/file.jpg"), "Other");
assert.equal(mediaCategoryFromUrl("https://cdn.example/file.jpg?x=1"), "Fotoğraflar");
assert.equal(mediaCategoryFromUrl("https://cdn.example/file.mp4"), "Videolar");

assert.equal(
  downloadDirectory(DEFAULT_SETTINGS, { site: "Instagram" }),
  "RedGifsDownloader/Instagram/Videolar"
);
assert.equal(
  downloadDirectory(DEFAULT_SETTINGS, { site: "RedGifs", mediaCategory: "Fotoğraflar", folderName: "Favorites" }),
  "RedGifsDownloader/RedGifs/Fotoğraflar/Favorites"
);
assert.equal(
  downloadDirectory(DEFAULT_SETTINGS, { site: "RedGifs", subFolder: "niche-name" }),
  "RedGifsDownloader/RedGifs/Niches/niche-name"
);
assert.equal(
  downloadDirectory(DEFAULT_SETTINGS, { site: "Scrolller", mediaCategory: "Fotoğraflar" }),
  "RedGifsDownloader/Scrolller/Fotoğraflar"
);
assert.equal(
  downloadDirectory(DEFAULT_SETTINGS, { site: "Coomer", mediaCategory: "Fotoğraflar", folderName: "pockycats" }),
  "RedGifsDownloader/Coomer/pockycats/Fotoğraflar"
);
assert.equal(
  downloadDirectory(DEFAULT_SETTINGS, { site: "Coomer", mediaCategory: "Videolar", folderName: "another-user" }),
  "RedGifsDownloader/Coomer/another-user/Videolar"
);
assert.equal(
  downloadDirectory({ ...DEFAULT_SETTINGS, folderLayout: "legacy" }, { site: "Reddit", folderName: "Saved" }),
  "Saved"
);

assert.throws(
  () => downloadDirectory(DEFAULT_SETTINGS, { site: "Reddit", folderName: "<>" }),
  /Invalid folder name/
);

console.log("Settings and folder layout tests passed.");
