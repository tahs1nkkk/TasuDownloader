# Global Rules

## Conversation Language
- **Speak**: Turkish (Turkçe)
- **Write rules/code**: English (İngilizce)

## Response Format
- Show only list titles and descriptions
- No unnecessary code examples
- Minimize context usage
- No scenario writing

## Context Management
- Keep responses concise
- Avoid repeating known information
- Use minimal tokens per response

## Rule System
- Each chat adds new rules to this file
- Rules are cumulative and persistent
- Read existing rules before adding new ones

## Cross-Platform Development and Updates
- Android is a planned first-class application targeting the same downloader functionality as iOS and the Edge extension.
- Share site handlers, platform-independent rules, and message/data contracts wherever practical; keep operating-system integrations in platform-specific adapters.
- Changes to shared code, shared dependencies, or shared contracts must be reviewed and tested across every affected client, including Android once implemented, iOS, and Edge. Include Orion and the web/cloud components when affected.
- Release shared changes as a coordinated update across affected platforms; preparing a build does not mean it is installed on users' devices.
- Platform-specific changes may be tested and released independently when shared behavior and contracts are unchanged.
- Edit canonical site code in shared/, regenerate compatibility outputs with npm run build:shared, and verify them with npm test; never hand-edit generated runtime assets in edge-extension/.
- Keep DIRECT_DOWNLOAD compatible with legacy version-1 messages; update shared contract fixtures and the generated Swift model together. Run native parity checks on macOS before publishing changes to the native shared-core adapter.
- Prepare affected clients as one verified artifact set from the same clean commit. Reject missing packages, mismatched versions and hashes; mark dirty local builds as previews. Build workflows must not delete unrelated release assets or publish before explicit release approval and device verification.
- Keep portable mobile features available from Edge. Reuse the full Tasu Archive web client for archive/list/category/share management, retain desktop gallery/download controls, and document native-only gaps. Archive login tokens must never enter navigation URLs or page scripts; login rules must be tab/URL-scoped and expire.

## Edge Menu Design
- Keep a fixed refresh/title/settings header and in-popup site screens instead of accordions. Global settings belong in Settings; site-specific settings belong in each home tile's screen.
- Use locally bundled site icons and lightweight glass styling. Hover must lift/expand controls without whitening their surfaces; respect reduced motion. Any tab-backed glass snapshot stays blurred in popup memory only, with an opt-out, no continuous capture, storage or transmission.
- Use joined, white-outlined site tiles with reversible blurred-logo-to-square-logo hover transitions. Keep text contrast independent of the underlying page. Use bottom color-coded feedback and confirm multi-downloads with individually selectable previews; browser completion must not be confused with a request being accepted.
- Count logical media, not original/preview fallback URLs. Keep confirmation previews large and icon-only for media type. Scope completion feedback to the top frame, honor API rate limits with cached/visible-media fallbacks, and keep DM support limited to media already rendered in the open conversation.
- After extension reload, classify stale content-script connections with a page-refresh instruction, not a generic download failure. Never invoke share-menu fallbacks after transport loss or an ambiguous request timeout. Anchor RedGifs viewer controls to the painted video box on unchanged feed routes as well as watch pages; restore preview controls on viewer exit.

## Tasu Apps Hub
- Keep the existing unpacked Edge extension path and Downloader behavior. New hub modules are Windows/Edge-specific unless explicitly ported; never claim automatic mobile support.
- Namespace module messages, storage, alarms and notifications. Register wake-up listeners synchronously and lazily initialize API workers. In this personal Edge build, activating Friend Tracker keeps its background tracking on; only its interval and desktop-notification delivery are configurable. Reconcile multiple visible views and persist scheduler deadlines across worker restarts.
- Stop invisible rendering, listeners, observers and polling; resume idempotently. Active native jobs outlive popup/broker closure and are never cancelled by the five-minute idle policy.
- Preserve external source projects. Integrate frozen, hashed allowlisted snapshots through adapters; never package .env, tokens, user backups or download folders. Validate nested imported data and back up targets before mutation.
- Keep Dada independent/offline, UTF-8 bounded, and free of child-associated sexual tone combinations. Native Messaging exposes only versioned allowlisted operations to the installed extension ID; no general shell, path or web endpoint.
- Runtime download retries must never remove existing user media. Use isolated staging and no-overwrite output naming. Keep cloud/website publishing and registry installation separate from preparing personal preview packages.
- The hub uses a fixed local white/ice-blue glass background, not a webpage capture. Preserve original brand assets over generated banner backdrops; split banner halves from a central seam using reversible transform/opacity animations and respect reduced motion.
- Allow only one detached hub window. Serialize creation in the worker, check existing windows after restart, hide expansion inside detached views, and show a close-first notice instead of opening duplicates.
- Activate tools from their own tiles, not generic enable toggles. Request optional permissions directly in the user gesture and share one initialization promise. Friend lists must render saved data before waiting for names, avatars or polling; surface connection failures.
- Restore Dada from its dedicated hashed source project, preserving the original bank and functions except disallowed child-associated sexual combinations. Keep safety normalization at the generator boundary as well as the UI.
- Keep existing personal banner blur/duration values as fixed defaults; do not expose sliders or reset those values when resetting other appearance settings.
- Use the full archive website instead of a separate Quick Gallery entry. Explain optional Google sign-in versus the server's ARCHIVE_TOKEN without exposing credentials.
- Show audio bitrate for MP3 and video resolution for MP4, preserving both choices independently. Group music options by purpose. Keep Dada's language toggle hidden without altering its saved language or source bank.
- Distinguish native host registration/permission/startup failures from a job-list error. Verify Windows helper registration and transport separately from direct broker tests; never claim a user's live browser connection based only on an isolated test.
