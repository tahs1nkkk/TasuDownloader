# Shared downloader sources

## Ownership

- `core/sites.js`: the authoritative supported-site catalog, host identities,
  extension URL matches, handler names, page hooks and platform availability.
  Android is planned, not enabled. OnlyFans remains Edge-only until its mobile
  download adapters are implemented and tested.
- `core/settings.js`: shared defaults, legacy settings identity and download
  folder rules. It loads `core/sites.js` before identifying a site.
- `core/media-rules.js`: pure Scrolller candidate parsing and filename variant
  trimming, executed by Edge, Orion and native iOS through JavaScriptCore.
- `core/scrolller-resolve.js`: the Edge/Orion network adapter for those rules.
- `core/download-contract.js`: versioned `DIRECT_DOWNLOAD` fields, defaults and
  validation. Legacy messages without a version remain accepted as version 1.
- `core/native-api.js`: a JSON-only interface to bundled pure rules, without DOM,
  network or page-code access. `SharedCore.swift` serializes native calls.
- `core/version.js`: core and platform release versions; Android has no version
  until an implementation exists.
- `sites/`: the six canonical DOM handlers.
- `hooks/`: page-world hooks. Do not inject them into an isolated world.
- `ui/folders.js`: the shared folder chooser.

The native download engines, OS permissions, Photos integration and browser
bridges still belong to their platform directories. `common/cloud.js` and
`common/weblink.js` are currently Edge adapters, not platform-neutral libraries.
`common/archive-access.js` is Edge's scoped login/download adapter for the full
Tasu Archive. Its feature mapping and remaining native gaps are documented in
`debug-notes/edge-mobile-support.md`; it is not injected into media sites.
The unused legacy Scrolller handler and the optional Ripsnip helper remain in
`edge-extension/`; neither is a new supported-site entry.

## Generated compatibility files

The runtime assets in `edge-extension/` are **generated and checked in** so the
existing unpacked-extension folder keeps working without a new installation
path or a build step on the user's device. They are not a second source tree.
Change `shared/`, run `npm run build:shared`, and include the generated changes.
`npm test` and `npm run check` reject stale or manually edited runtime copies.
The Swift `DownloadRequest` model, iOS `Versions.xcconfig`, and Edge build-info
file are generated as well. Regenerate them rather than editing them by hand.

The same build generates `content_scripts` in the Edge and Orion manifests and
Orion's page-hook resources. Other manifest fields remain platform-owned.
Site scopes and dependencies must be changed in the catalog/build mapping,
not manually inside generated manifest sections.

`scripts/build-ios-app-js.js` and `scripts/build-orion-ios.js` read canonical
sources directly. A stale Edge output can never silently become a mobile
handler. The iOS home-screen catalog and native host guards are generated from
the same enabled-site entries. Registry/settings load order is tested in
content scripts, UI pages and the native payload.

## Local verification

- `npm run build:shared`: regenerate Edge runtime assets and manifest sections.
- `npm test`: check settings/folders, host guards, local Scrolller fixtures,
  contracts, native/JS fixtures, source/output parity, versioning, dependency
  planning, native JS payload and Orion MV2/MV3 build contents.
- `npm run test:native`: on macOS, compile the native shared-core adapter and
  typed request with Swift, then run the same fixtures on Apple JavaScriptCore.
- `npm run test:browser`: run the Orion UI harness and native JavaScript bridge
  in headless Chromium, with every network request intercepted using local
  fixtures. Requires `npm ci` and `npx playwright install chromium`. This checks
  browser behavior, not real iOS WebKit or the native download engine.
- `npm run test:edge`: load the actual unpacked extension against a loopback
  HTTPS archive, checking native browser header rules, cookies and gallery UI.
  Requires Chromium plus OpenSSL (Git's bundled OpenSSL on Windows).
- `npm run build:app:js`: generate the native iOS JavaScript payload.
- `npm run build:ios`: produce the Orion MV3 XPI on Windows, macOS or Linux.
- `npm run build:ios:mv2`: produce the Orion MV2 fallback XPI on any build host.
- `node scripts/build-orion-ios.js --no-archive`: validate the Orion folder on
  any build host without writing a ZIP/XPI.
- `npm run release:plan`: read-only preview of affected build/test targets for
  current local changes. It never publishes, installs or starts another job.
- `npm run release:prepare`: create an Edge ZIP and both Orion XPI variants in a
  new `dist/release-*` directory, with build identities and SHA-256 receipts.
  `-- --targets edge` or `-- --targets orion` prepares just that platform.
  Dirty working trees are explicitly labeled `local-preview`, not releases.
  iOS is never substituted with a JS-only payload or an old IPA.

Tests use synthetic content and do not contact media sites. They regenerate
`ios-app/Resources/generated/`, `dist/orion-ios/`, and disposable synthetic
archive fixtures. An actual iOS IPA
still requires the macOS/Xcode workflow; JS tests do not prove native compilation
or successful downloads on a phone.

## Version and release behavior

Core and platform versions are deliberately separate. A shared runtime change
must bump the core version and the affected platform versions; a platform-only
change can leave the core version unchanged. Every package records its
`coreVersion`, `platformVersion` and `downloadContractVersion` in `build-info.json`.

The iOS development version comes from `core/version.js`. CI adds its positive
`TASU_BUILD_NUMBER` to the patch component and uses that **same calculation** for
the JS payload, Xcode marketing version and SideStore/AltStore feed. The actual
IPA plist is checked before packaging. Never override just the feed version.
The current `1.1.x` version line supersedes the previous `1.0.x` feed versions.

`release:plan` distinguishes shared runtime changes, native-only changes, reused
mobile styles and cloud API changes. Android appears as pending, never as a
build that succeeded. Unknown paths require review.

## Coordinated package preparation

The existing `build-ios-app.yml` workflow retains its path/name and iOS run-number
sequence, but now coordinates client builds with **read-only repository access**.
Push events select affected clients from the push diff. Manual runs default to
all existing clients; an explicit platform scope is a build request, not release
approval. Missing diff history fails instead of silently reducing the scope.

1. Resolve affected targets. Unknown files and web/cloud changes requiring an
   unimplemented deployment adapter stop for review; Android stays pending.
2. Run shared tests and browser bridge checks on Linux.
3. Prepare Edge and Orion archives on Linux. When iOS is selected, the reusable
   `native-ios.yml` runs Swift/JavaScriptCore parity checks and a full unsigned
   Xcode build on macOS. Build metadata is embedded before Xcode copies resources.
4. Verify actual IPA bundle identity, then collect every requested package.
   Reject absent variants, changed hashes, different commits/core/contract/app
   versions, uncommitted sources, and stale/unexpected files.
5. Upload `TasuDownloader-prepared-release` only after the complete set passes.
   Its `release-manifest.json` records the exact files, identities and hashes.

No job publishes a GitHub release, changes the installed app, updates `apps.json`,
or deletes existing release assets. The former iOS-only rolling publisher and
its unrelated-asset deletion were removed. Existing public URLs/feed contents
remain untouched. Release publication is intentionally a separate, pending
approval step after native/device verification. Push-diff/manual build selection
must **not** be reused as a release scope: a future publisher must account for
all unpublished changes since each client's last released commit.

The ZIP library and YAML parser are pinned build/test-only dependencies. They
are not copied into browser or mobile runtime bundles. Archive tests include
local corruption/mixed-version cases and synthetic IPA layouts; they are not
evidence that an iOS app has compiled or run on a device.

## Remaining milestones

1. Reduce the remaining Swift/JS parallel rules (RedGifs resolution, list identity
   and synchronization) without changing download order or cloud data. Scrolller
   parsing, variant trimming, site identity and the download-message contract are
   now shared. The remaining pairs are recorded in `debug-notes/parite.md`.
2. Run the new coordinated workflow on committed sources to verify the real
   native build, then complete the device smoke checks. Package preparation is
   implemented; approved publication and stable-feed updates remain pending.
3. Build the Android app with a platform-specific bridge/download adapter using
   this catalog and these handlers. Enable sites only after those adapters work.
4. Complete the platform-by-site device test matrix, including the existing
   OnlyFans mobile gap, Reddit audio, Scrolller selection and list-sync conflicts.

No app IDs, stored settings keys, destination folder names or public download
message fields were renamed as part of the source-layout migration.
