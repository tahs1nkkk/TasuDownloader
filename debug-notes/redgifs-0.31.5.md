# RedGifs — 0.31.5 / 2026-09-10

## Confirmed report

- User saw a download button but received `E_FAILED`. Reloading the RedGifs tab
  with Ctrl+R restored successful downloads. This was a stale extension-page
  connection after the extension update, not evidence of a RedGifs API outage.
- A synthetic page reproduced the exact error mapping: `Extension context
  invalidated.` became `E_FAILED`. Closed worker connections were also hidden.

## Changes

- Stale/closed extension connections now show `E_RELOAD` / `E_CONNECTION` with
  a page-refresh instruction. Safe BG/DLC codes survive mapping; the old `ad`
  substring match no longer mislabels `Download failed` as an advertisement.
- Clear the request deadline after synchronous errors. Do not invoke Copy Link
  after a connection failure or timeout: the former cannot restore the bridge,
  and the latter can still finish in the background (duplicate-download risk).
- Expanded viewers on `/explore` and `/niches` are recognized even when the URL
  does not change to `/watch`. Their preview-corner controls are hidden.
- Viewer download/archive buttons follow the painted video rectangle, accounting
  for contain/scale-down, object-position and metadata/dimension changes.
- Container fullscreen moves both controls into that container and restores them
  on exit or when the site removes the viewer. Direct browser-owned fullscreen
  of a bare VIDEO element is not covered by the container fullscreen test.

## Verification

- 119 JavaScript tests and extension validation passed.
- `npm run test:redgifs`: real DOM with synthetic image/video fixtures; stale
  connection, closed worker, preserved error codes, timers, native container
  fullscreen, in-site viewer, portrait/landscape and exit/removal checks passed.
- `npm run test:browser`: Orion 23/23 and native JS bridge checks passed. Generated
  mobile payloads use the same shared source. No live media/accounts were queried.
- Versions: Edge 0.31.5, shared core / Orion 0.29.1, iOS source 1.4.1. No native
  Xcode/physical-device build/test on this Windows host; nothing published.
- User confirmed restored downloads before the positioning patch. The new button
  placement still needs the user's live-site check after reloading the extension
  and then the RedGifs page.
