# Hub visual assets — 2026-09-06

Four raster assets were produced with the built-in ImageGen tool (imagegen skill), not the API/CLI. Roblox used the user's supplied screenshot as the edit reference. Logo shapes are not trusted to raster generation: the Downloader and music cards additionally display the exact original local brand files in clipped HTML panels. CSS uses a static 0.35px blur and animates only transforms/opacity.

## Outputs

- roblox-banner-v2.png — silver Roblox reference on a pale glass background.
- downloader-banner-v2.png — six-panel backdrop.
- music-banner-v2.png — YouTube / Spotify backdrop.
- glass-surface-v2.png — fixed white/ice-blue glass surface; no webpage capture.

## Exact brand references

- Spotify: https://newsroom.spotify.com/media-kit/logo-and-brand-assets/
  - https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_Green.png
- YouTube: https://brand.youtube/
  - youtube-reference.webp is the unmodified official 1920px thumbnail-icon artwork. CSS clips the white surrounding canvas, not the logo.
  - https://www.gstatic.com/marketing-cms/assets/images/fc/f4/a754801e43b5a8eb0ee7d8b780f6/yt-external-thumbnail-icon-01.jpg=n-w1920-h1080-fcrop64=1,00000000ffffffff-rw
- Instagram: the current homepage's official 180px touch icon:
  - https://static.cdninstagram.com/rsrc.php/yw/r/icwX0xAk0pz.webp
- Roblox: https://www.roblox.com/favicon.ico (unmodified current brand mark).
- Other five site marks: ../sites/README.md. Existing exact local files are reused.
- coomer-reference.png is a transparent render of the existing vector, used only as an ImageGen reference; not shipped.

All original brand ownership remains with the respective owners. No site requests occur when opening these banners.

## Generation prompts

### hub-roblox-banner-v2

Use case: compositing. Asset type: high-resolution wide browser-extension navigation banner, 3:1 landscape. Input image 1 is the edit target: the supplied silver-blue ROBLOX wordmark on black. Preserve the exact ROBLOX lettering, letter shapes, proportions and its original metallic silver/blue colors. Replace ONLY the black background with very pale icy-blue and white frosted liquid glass, delicate blurred glass light and subtle cool reflection. Fit the entire original ROBLOX wordmark horizontally, large and perfectly centered, with modest equal padding; no cropped letters. Add one hairline white forward-slash divider through the exact center of the banner, full height, forming a subtle center seam for a later two-panel animation. Sharp original logo edges, barely any blur on the lettering. No extra icons, copy, labels, watermark or purple tint.

References: codex-clipboard-5b49fcbb-0d8c-400d-b7d3-13f1768740ed.png

### hub-glass-surface-v2

Use case: stylized-concept. Asset type: portrait background texture for a compact browser-extension settings screen. Create a quiet white frosted liquid-glass surface, white with extremely pale ice blue, very soft blurred broad glass highlights at the outer edges, almost uniformly white in the entire center so dark navy interface text is highly readable. Premium restrained translucent milky glass, subtle rounded refraction, no hard edges. High resolution portrait 3:4. No icons, logos, text, dark areas, strong colors, purple, objects, buttons or UI. This is a flat usable background image, not a mockup.

References: None (new image)

### hub-downloader-banner-v2

Use case: compositing. Asset type: wide 3:1 high-resolution navigation banner for a browser extension. The FIVE supplied images are exact brand-logo insert references in order: RedGifs red RG, Reddit Snoo orange circle, Scrolller red tiles, Coomer orange fox, OnlyFans cyan/white OF. Also add the instantly recognizable ORIGINAL full-color Instagram gradient camera icon, as the fourth logo, between Scrolller and Coomer. Arrange ALL SIX of these original logos side by side horizontally in SIX equal diagonal panel slices. Preserve every logo's original design and colors exactly, do not redraw into generic symbols, do not add words. Use generous sharp logo sizes. Separate neighboring panels by thin opaque WHITE forward-slash diagonal lines (/), edge to edge full height; clip the panel artwork to those diagonal boundaries. The middle separator between the third and fourth panel must pass through the exact center. Panels have white to extremely pale icy blue liquid-glass surfaces, subtle glass sheen. Logos themselves remain crisp and original, no applied blur, no heavy shadows, no dark background, no extraneous text or elements. Fill the complete image rectangle; no outer frame.

References: redgifs.png, reddit.png, scrolller.png, coomer-reference.png, onlyfans.png

### hub-music-banner-v2

Use case: compositing. Asset type: wide 3:1 high-resolution browser-extension navigation banner. Supporting exact brand images: image 1 is the official YouTube play icon on white (use ONLY the red play icon with white triangle); image 2 is Spotify's original green circle with black three arcs. Put a large YouTube icon centered in the LEFT half, a large Spotify icon centered in the RIGHT half, visually equal weight. Preserve exact original forms, colors and proportions; no recoloring, no text or wordmarks. Separate them with one thin opaque WHITE forward-slash diagonal divider / crossing the exact midpoint and extending full height. Diagonal panel sides are clipped cleanly at that seam. Background: restrained white and extremely pale ice-blue frosted liquid glass with soft highlights, compatible with the supplied Roblox glass banner's light theme. Logos sharp with almost no blur; no extra icons, labels, buttons, strong shadows or watermark. Fill the rectangle, no outer frame.

References: youtube-reference.webp, spotify-original.png

