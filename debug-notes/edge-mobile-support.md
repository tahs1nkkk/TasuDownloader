# Edge and mobile support (2026-09-05)

## Added to Edge 0.27.0

- The main popup action now opens the full Tasu Archive, using the same configured
  Worker and `/auth/app` entry point as native iOS. Separate media/list shortcuts
  select the existing web views. This is an authenticated browser tab, not a
  duplicate local copy of the archive UI.
- Existing archive features (categories, archives/drives, list creation/rename/
  move/appearance, avatars, metadata, sharing and file upload) run in that full
  web client exactly as they do inside the mobile archive tab. Their availability
  depends on the version deployed on the user's Worker; no server was deployed.
- Google/cookie-based entry remains available without a token. A token is still
  required by the extension's quick gallery and background upload/download API.
- The quick gallery is retained separately. It now has image/video filtering,
  select-all, selected downloads and a download button in the viewer. Downloads
  use the existing site/photo/video folder rules and the browser downloads UI.
- List removals fetch the latest snapshot, update `updatedAt`, and use dated
  `{id, deletedAt}` tombstones compatible with Swift. Failed saves do not remove
  items from the displayed snapshot. This is not an atomic cross-device merge;
  the server still has no compare-and-swap contract.
- Fixed the closed viewer intercepting clicks because its CSS overrode `hidden`.

## Already present

- Every currently enabled mobile site is enabled on Edge: RedGifs, Reddit,
  Scrolller, Coomer and Instagram. OnlyFans is an additional Edge-only site.
- Local/cloud/both download destinations, cloud upload, source labels, list-link
  capture from supported pages, and upload/download bandwidth settings.

## Platform-specific differences still open

- Native iOS has its own persistent offline media cache, local Photos gallery,
  download records and offline list store. Edge downloads are ordinary local
  files; there is no equivalent offline gallery/cache/list-sync UI yet.
- iOS's “delete from Photos after upload” cannot be enabled as a silent browser
  equivalent. Edge is not authorized to delete arbitrary local files.
- Native Reddit permalink resolution is not yet an Edge fallback. Edge's Reddit
  handler still normally takes media from the DOM.
- Android is planned, not implemented. No claim of full native-feature parity.

## Authentication safety and verification

- New Edge permissions: `declarativeNetRequestWithHostAccess` and `alarms`.
  Reload the unpacked extension after updating so the permissions take effect.
- Only the extension popup/quick-gallery top frame may request archive access.
  Host pages cannot choose a Worker, ask for an arbitrary authenticated fetch,
  or retrieve a stored token.
- A token is attached only to the exact `/auth/app?next=...` main-frame request
  in a newly created tab. Rules expire after one minute and are removed on
  navigation, tab close, settings changes, or expired-rule recovery after a
  worker restart. No token is put in a navigation URL or shared with page JS.
- Downloads attach Authorization as a header, not a token query parameter.
- `npm run test:edge` uses the real unpacked extension, a fresh Chromium profile
  and a loopback HTTPS fixture. It checks headers, first-party cookies, redirect
  cleanup and actual gallery controls. It never contacts production archives.
  Windows requires Git's bundled OpenSSL; Linux/macOS require `openssl` on PATH.
- Node fixtures cover sender checks, cleanup, URL validation, download options
  and Swift-compatible list edits. Production downloads/account access still
  need a user test with the configured Worker.
