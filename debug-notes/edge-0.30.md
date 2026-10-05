# Edge 0.30.0 — Instagram / Reddit regressions

## Implemented
- Instagram visible-media selection intersects overflow-clipping ancestors, not
  only the browser viewport. Style/slide transitions invalidate the active media.
  Slides 2/3 retain controls and single-download resolves the visible item rather
  than silently falling back to the first carousel item.
- Avatar HD requests are bounded to 1.5 seconds, deduplicated/cached, and respect
  `Retry-After` on HTTP 429 (five-minute cooldown when absent). Already-rendered
  avatar/srcset is the fallback; the notification explicitly notes unavailable HD.
- DM controls work with already-visible images and direct HTTP(S) video sources.
  No conversation history/API collection, deleted-message recovery, or protected
  stream bypass is performed. Blob/MSE-only videos without a direct file remain
  unsupported by this path and produce an actionable error instead of a poster.
- Confirmation grid: three larger columns in a viewport-clamped 432px panel;
  type icons at bottom-right, selection checks top-left, no explanatory heading
  or text. Selection count stays in the Download button.
- Reddit targets the hovered post rather than only the biggest image in the tab.
  Shadow-root media finds its light-DOM ancestor; nested roots are observed.
  Single/multi/list controls share immediate fade and hidden click-through behavior.
- Reddit native video elements with direct file URLs and RedGifs iframe media
  participate in desktop targeting; embeds can be downloaded as RedGifs while
  their list action saves the Reddit post permalink/title.
- Reddit gallery variants group by logical asset identity across original/preview
  hosts, signatures, extensions and descriptive `-v0-` filenames. A selected item
  retains fallback URLs, but is dispatched as ONE image-mode request. A failed
  original can use its signed preview without becoming an extra download.
- Reddit search uses the glass theme. Edge's folder helper no longer incorrectly
  identifies Edge as the native app and collapses selected search providers.
- Background acceptance/cloud/completion notices target frame 0. Embedded
  RedGifs documents suppress their own local toast copies as well.
- Reddit's idle interval is replaced by coalesced pointer/mutation/scroll events;
  internal style writes are guarded to avoid a self-triggered animation-frame loop.

## Verification and boundaries
- `npm test`: contract, naming, packaging, compatibility and notification routing.
- `npm run test:edge`: real isolated extension documents plus synthetic Instagram
  and Reddit fixtures; no user account, private messages, real media or Downloads
  writes. Includes shadow DOM, fallback grouping, deselection, embed list metadata,
  duplicate-toast suppression, avatar cooldown, visible DM media and idle-frame checks.
- `npm run test:browser`: Orion harness and native JavaScript bridge. Swift and
  iPhone device verification require macOS/iPhone; no IPA or public release here.
- Core 0.28.0; Edge 0.30.0; Orion 0.28.0; iOS development payload 1.3.0. Download
  contract remains v1. Web archive and Android implementation are unchanged.
- Live examples of any remaining Reddit post with missing buttons are needed to
  verify markup not represented in these fixtures. No blanket claim that every
  Reddit layout or protected/segmented video stream is supported.
- Current local result: 95 unit/contract checks pass; Instagram and Reddit UI
  fixtures pass; Orion 23/23 and native JavaScript bridge checks pass. The real
  archive HTTPS login integration test is blocked externally by Kaspersky's
  invalid-certificate page before any request reaches the loopback server.
  Antivirus settings were not altered, and the archive production code was not
  changed to accommodate a test certificate. This is not an all-green release.

References used for protocol behavior:
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429
- https://developer.chrome.com/docs/extensions/reference/api/tabs#method-sendMessage
