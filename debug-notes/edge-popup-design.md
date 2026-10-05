# Edge popup — Liquid Glass refresh (0.29.0)

## Scope
- Edge menu/gallery/debug presentation plus a shared overlay/feedback layer and Instagram fixes. Web archive presentation keeps existing behavior and the manual dark-theme switch.
- Fixed 416 × 600 window, header outside the sole scrolling container.
- Six wide, joined, white-outlined site tiles crossfade a static blurred full-size
  logo into a sharp square at the left. Names fade in from the right; both layers
  reverse on leave without moving adjacent tiles. Tool icons fill their buttons
  and shrink upward to reveal names. Touch input does not require hover.
- Site/tool clicks navigate inside the popup, not dropdowns. Explicit launch
  actions still open the site, full archive, quick gallery or debug guide in tabs.
- Extension settings contain only global appearance/download/folder settings.
  Reset preserves site preferences and private archive connection settings.
- Header reload restarts the extension (not the website); ongoing work can be
  interrupted. Its tooltip makes this distinction explicit.

## Glass and privacy
An action popup is not part of the tab's DOM. A CSS backdrop filter in that popup
does not sample the separate tab window. The visual fallback is a bundled gradient.

For ordinary HTTP(S) tabs, the action's temporary `activeTab` grant permits one
`chrome.tabs.captureVisibleTab` attempt on open. The upper-right area is immediately
downsampled and blurred into a 208 × 300 image in a detached canvas. Only that
blurred image remains in the popup document; the original image is discarded.
No screenshots are written to storage, disk, debug logs, URLs, or the network.
No polling, video capture, injected overlays or live blur loops are used.
Incognito and browser/extension pages deliberately use the gradient instead.

The Settings switch persists only a boolean under `tasuPopupPreferences` (Edge UI
only). Disabling it clears the in-memory image. After a completed capture, turning
it back on takes effect fully on the next popup opening; it does not recapture in
the same popup lifetime. An unavailable action grant also falls back gracefully.

API references:
- https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab

## Performance and verification
- One preblurred raster background; no per-control backdrop filters, animations
  of blur/shadow, continuous pointer listeners or external font/icon downloads.
- Hover uses transforms and opacity (never animated filters); pages fade/slide
  briefly. All animation is disabled by the system's reduced-motion preference.
- Duplicate tabs are scanned only when their screen is opened. Range labels
  update locally while dragging; storage is written on the committed change.
- Serialized popup setting writes prevent rapid controls overwriting each other.
- `npm run test:edge` checks the real unpacked Chromium extension's Archive flow
  plus routed popup controls, fixed header, logo decoding, unchanged hover color,
  stable neighbours, keyboard access, opt-out, capture failure, no network/storage
  of pixels, scoped reset, rapid setting changes, and reload wiring.
- Popup pixel/capture fixtures are synthetic. Screenshot previews in
  `dist/popup-preview` contain no user browser content or real archive credentials.
- Actual Edge toolbar anchoring and performance on the user's computer still
  need a manual look after reloading the unpacked extension.

## Shared UI and Instagram
- Canonical `shared/ui/feedback.js` is generated as `common/ui.js` and included in
  Edge, Orion and native browser bundles. No framework, external assets or polling.
- Isolated shadow UI: blue information, green completed action, red failure,
  yellow cancellation/warning. Toasts enter/leave at the bottom. Edge download
  completion uses browser events, with per-source-tab routing retained in session
  storage across background-worker suspension. Acceptance is never completion.
- Multi-download confirmation applies to Instagram carousels, Reddit galleries
  and Edge quick-gallery batches. All previews start selected; users can toggle
  individual square tiles, cancel, or confirm. Zero selections disable download.
  Video thumbnails do not autoplay; unavailable thumbnails show a type fallback.
- Instagram stories anchor to rendered media bounds (including contain/letterbox)
  instead of a header link. Hover disappearance starts immediately with opacity;
  hidden buttons cannot intercept clicks. Single profile posts do not imply a
  carousel. A bounded, short-lived API cache is shared with actual downloads.
- Pointer updates use one animation frame and reuse the current media context;
  mutations/scroll/resize invalidate it. Removed buttons recover after hydration.
- The debug guide keeps existing session indices and now describes confirmation,
  story anchoring and fade tests. Instagram diagnostics report opacity, click
  interception, media bounds and shared toast state.
- `npm run test:edge` additionally verifies Instagram using only synthetic DOM,
  API and media fixtures. Browser bridge tests cover shared JS on Orion/native;
  native Swift builds and real-device tests still require macOS/iPhone.
- `shared/ui/app-icon.svg` is the icon source; `node scripts/make-icons.js`
  rasterizes bundled Edge/Orion, web and iOS icon sizes with local Playwright.
- Web archive changes were checked with a local-only Worker dry run. Nothing
  was deployed; Edge/Orion ZIP/XPI files are local previews, not a coordinated
  production release while the iOS build/device checks remain outstanding.
