(() => {
  if (window.__rgInstagramLoaded) return;
  window.__rgInstagramLoaded = true;
  console.info("%c[rg-ig] content script yüklendi", "color:#db2777;font-weight:bold", location.href);

  const ALL_ID = "rg-ig-all";
  const ONE_ID = "rg-ig-one";
  const WEB_ID = "rg-ig-web";
  const STATUS_ID = "rg-ig-status";
  const MENU_ID = "rg-ig-menu";
  const { SETTINGS_KEY, DEFAULT_SETTINGS } = globalThis.RG_SETTINGS;
  const IG_APP_ID = "936619743392459";
  const IG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

  let settings = { ...DEFAULT_SETTINGS };
  let statusTimer = null;
  let hideTimer = null;
  let ctx = null; // { kind:"post"|"avatar"|"highlight", anchor, article?, shortcode?, username? }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function clampBox(v, lo, hi) {
    const min = Math.min(lo, hi);
    const max = Math.max(lo, hi);
    return clamp(v, min, max);
  }

  function setStatus(text, level = "idle") {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    if (statusTimer) clearTimeout(statusTimer);
    el.textContent = text || "";
    el.dataset.level = level;
    // Errors stay long enough to read/copy; other messages clear sooner.
    if (text) statusTimer = setTimeout(() => { el.textContent = ""; el.dataset.level = "idle"; statusTimer = null; }, level === "error" ? 12000 : 4500);
  }

  function dlIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`;
  }
  function stackIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="7" width="10" height="10" rx="2" stroke="currentColor" stroke-width="2.2"/>
      <path d="M9 3h8a2 2 0 0 1 2 2v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  }

  function ensureUi() {
    if (!document.getElementById("rg-ig-style")) {
      const style = document.createElement("style");
      style.id = "rg-ig-style";
      style.textContent = `
        #${STATUS_ID} {
          position: fixed; z-index: 2147483647; left: 50%; bottom: 26px;
          transform: translateX(-50%); max-width: min(320px, calc(100vw - 32px));
          padding: 9px 14px; border-radius: 999px; color: #fff;
          background: rgba(18,18,18,.62); backdrop-filter: blur(6px);
          font: 500 12px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;
          text-align: center; pointer-events: none; display: none;
        }
        #${STATUS_ID}:not(:empty) { display: block; }
        #${STATUS_ID}[data-level="error"] { background: rgba(153,27,27,.72); }
        #${STATUS_ID}[data-level="done"]  { background: rgba(22,101,52,.66); }
        .rg-ig-btn {
          position: fixed; z-index: 2147483647;
          width: 44px; height: 44px; border: 0; border-radius: 999px; padding: 0;
          display: none; place-items: center; color: #fff;
          box-shadow: 0 8px 22px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.16);
          cursor: pointer; transition: background .12s, transform .12s;
        }
        #${ALL_ID} { background: rgba(219,39,119,.92); }
        #${ALL_ID}:hover { background: rgba(219,39,119,1); transform: scale(1.05); }
        #${ONE_ID} { background: rgba(37,99,235,.92); }
        #${ONE_ID}:hover { background: rgba(37,99,235,1); transform: scale(1.05); }
        .rg-ig-btn:disabled { opacity: .55; cursor: wait; }
        .rg-ig-btn svg { width: 55%; height: 55%; pointer-events: none; }
        #${MENU_ID} {
          position: fixed; z-index: 2147483647; min-width: 150px;
          background: #1e293b; border: 1px solid rgba(148,163,184,.2);
          border-radius: 10px; padding: 5px; box-shadow: 0 10px 30px rgba(0,0,0,.5);
          font: 500 12px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;
        }
        #${MENU_ID} .rg-ig-menu-item {
          position: relative; display: block; width: 100%; text-align: left; border: 0; border-radius: 6px;
          padding: 8px 10px 8px 18px; background: transparent; color: #e2e8f0; cursor: pointer;
        }
        #${MENU_ID} .rg-ig-menu-item::before {
          content: ""; position: absolute; left: 7px; top: 7px; bottom: 7px;
          width: 3px; border-radius: 999px; background: var(--rg-ig-folder-color, #64748b);
        }
        #${MENU_ID} .rg-ig-menu-item:hover { background: rgba(37,99,235,.35); }
        #${MENU_ID} .rg-ig-menu-sep { height: 1px; margin: 4px 6px; background: rgba(148,163,184,.18); }
      `;
      document.documentElement.appendChild(style);
    }
    if (!document.getElementById(STATUS_ID)) {
      const s = document.createElement("div");
      s.id = STATUS_ID; s.dataset.level = "idle";
      document.documentElement.appendChild(s);
    }
    if (!document.getElementById(ONE_ID)) {
      const one = document.createElement("button");
      one.id = ONE_ID; one.type = "button"; one.className = "rg-ig-btn";
      one.title = "Bu medyayı indir"; one.setAttribute("aria-label", "Bu medyayı indir");
      one.innerHTML = dlIcon();
      one.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); });
      one.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); console.info("[rg-ig] TEKLİ buton tıklandı", ctx); withFolder(e.currentTarget, folder => doSingle(e.currentTarget, folder)); });
      document.documentElement.appendChild(one);
      console.info("%c[rg-ig] indirme butonları oluşturuldu", "color:#22c55e");
    }
    if (!document.getElementById(ALL_ID)) {
      const all = document.createElement("button");
      all.id = ALL_ID; all.type = "button"; all.className = "rg-ig-btn";
      all.title = "Posttaki tüm medyayı indir"; all.setAttribute("aria-label", "Posttaki tüm medyayı indir");
      all.innerHTML = stackIcon();
      all.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); });
      all.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); const c = ctx; console.info("[rg-ig] TÜMÜ/GÖRSEL buton tıklandı", c); withFolder(e.currentTarget, folder => (c && c.kind === "highlight" ? doStoryImage(e.currentTarget, folder) : doAll(e.currentTarget, folder))); });
      document.documentElement.appendChild(all);
    }
    // Özellik D — indirme butonunun altına "web listesine ekle". Yalnızca gerçek
    // gönderilerde (post/reel); ızgara küçük görsellerinde/story/avatarda değil.
    if (!document.getElementById(WEB_ID) && window.rgMakeWebIconButton) {
      const web = window.rgMakeWebIconButton(() => {
        const media = web.__igMedia;
        const url = media ? postPermalinkIG(media) : location.href;
        return { url, title: document.title };
      }, { size: clamp(Number(settings.buttonSize) || 44, 28, 72) });
      web.id = WEB_ID;
      web.style.position = "fixed";
      web.style.display = "none";
      document.documentElement.appendChild(web);
    }
  }

  // ── Folder chooser menu ───────────────────────────────────────────────────

  function closeFolderMenu() {
    const m = document.getElementById(MENU_ID);
    if (m) m.remove();
  }

  function withFolder(buttonEl, cb) {
    const folders = Array.isArray(settings.mediaFolders) ? settings.mediaFolders.filter(Boolean) : [];
    console.info("[rg-ig] withFolder", { folderSayisi: folders.length });
    if (!folders.length) { cb(""); return; }

    closeFolderMenu();
    const menu = document.createElement("div");
    menu.id = MENU_ID;
    const rect = buttonEl.getBoundingClientRect();
    menu.style.left = `${clamp(rect.left, 8, window.innerWidth - 170)}px`;
    menu.style.top = `${clamp(rect.bottom + 6, 8, window.innerHeight - 60)}px`;

    const colorForFolder = (label) => {
      const colors = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#fb7185", "#22d3ee", "#f97316"];
      let hash = 0;
      for (const ch of String(label || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      return colors[hash % colors.length];
    };

    const mk = (label, val) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "rg-ig-menu-item"; b.textContent = label;
      b.style.setProperty("--rg-ig-folder-color", val ? colorForFolder(val) : "#64748b");
      b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closeFolderMenu(); cb(val); });
      return b;
    };
    menu.appendChild(mk("Ana klasör", ""));
    const sep = document.createElement("div"); sep.className = "rg-ig-menu-sep"; menu.appendChild(sep);
    for (const f of folders) menu.appendChild(mk(f, f));
    document.documentElement.appendChild(menu);

    // Close on outside click / scroll
    setTimeout(() => {
      const close = (e) => {
        if (menu.contains(e.target)) return;
        closeFolderMenu();
        document.removeEventListener("click", close, true);
        window.removeEventListener("scroll", close, true);
      };
      document.addEventListener("click", close, true);
      window.addEventListener("scroll", close, true);
    }, 0);
  }

  // ── Instagram data access ─────────────────────────────────────────────────

  function shortcodeToMediaId(sc) {
    // IG post/reel shortcodes are 11 chars. Some links append a share token
    // (e.g. DKkZMS_oEJP + "UYYvKY-...") → use only the real 11-char shortcode.
    const code = String(sc).slice(0, 11);
    let id = 0n;
    for (const ch of code) {
      const idx = IG_ALPHABET.indexOf(ch);
      if (idx < 0) return "";
      id = id * 64n + BigInt(idx);
    }
    return id.toString();
  }

  // Every "a post link" query in this file goes through the same selector.
  const POST_LINK_SEL = "a[href*='/p/'], a[href*='/reel/'], a[href*='/reels/'], a[href*='/tv/']";

  // A naive "/p/ or /reel/" search also matches the page's own sub-sections:
  // /p/<code>/liked_by/ (the likes list) and /reels/audio/<id>/ (the audio page)
  // are what an article's FIRST such link often points at. A real shortcode is
  // 11 chars of the base64 alphabet, so length plus this list separates the post
  // from the section around it (KÖK-LİSTE-ETİKET).
  const NOT_A_SHORTCODE = /^(audio|liked_by|comments|tagged|videos|saved|new|explore)$/i;

  function shortcodeFromHref(href) {
    try {
      const p = new URL(href, location.href);
      const m = p.pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/i);
      const code = m ? m[1] : "";
      if (!code || code.length < 10 || NOT_A_SHORTCODE.test(code)) return "";
      return code;
    } catch { return ""; }
  }

  // "p", "reel" or "tv" — the shape the canonical address should take. /reels/
  // (plural) is the feed route; a single reel lives at /reel/.
  function postKindFromHref(href) {
    try {
      const m = new URL(href, location.href).pathname.match(/\/(p|reel|reels|tv)\/[^/?#]+/i);
      const kind = m ? m[1].toLowerCase() : "p";
      return kind === "reels" ? "reel" : kind;
    } catch { return "p"; }
  }

  function currentUsername() {
    const m = location.pathname.match(/^\/([^/?#]+)\/?$/);
    if (!m) return "";
    const name = m[1];
    if (/^(explore|reels|direct|stories|accounts|p|reel|tv)$/i.test(name)) return "";
    return name;
  }

  // Username even on profile sub-tabs (/user/reels, /user/tagged, ...).
  function profileUsername() {
    const seg = location.pathname.split("/").filter(Boolean)[0] || "";
    if (/^(explore|reels|direct|stories|accounts|p|reel|reels|tv|notifications)$/i.test(seg)) return "";
    return seg;
  }

  // An element is "round" if its (or a %) border-radius makes it a circle.
  function isRound(el) {
    if (!el) return false;
    const br = getComputedStyle(el).borderRadius || "0";
    if (br.includes("%")) return parseFloat(br) >= 40;      // 50% → circle
    const r = el.getBoundingClientRect();
    return parseFloat(br) >= Math.min(r.width, r.height) * 0.35;
  }

  // True for the profile-header avatar: alt contains "profil"/"profile", or the
  // img OR its wrapper is round (Instagram rounds the parent <a>, not the img).
  function isAvatarImg(im) {
    const r = im.getBoundingClientRect();
    if (r.top > 460 || r.width < 40 || r.width > 240) return false;
    if (Math.abs(r.width - r.height) > 24) return false;
    if (!(im.currentSrc || im.src)) return false;
    const alt = (im.getAttribute("alt") || "").toLowerCase();
    // The avatar's alt reliably says "profil"/"profile"; highlight covers don't.
    if (alt.includes("profil")) return true;
    // Roundness fallback only for a large img → excludes small highlight circles.
    return r.width >= 110 && (isRound(im) || isRound(im.parentElement));
  }

  // The profile-header avatar <img>, found by DOM query.
  function findProfileAvatarImg() {
    const imgs = [...document.querySelectorAll("header img, main img, a img, img")].filter(isAvatarImg);
    return imgs.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (ra.top - rb.top) || (ra.left - rb.left);
    })[0] || null;
  }

  function highlightIdFromUrl() {
    const m = location.pathname.match(/\/stories\/highlights\/([^/?#]+)/i);
    return m ? m[1] : "";
  }

  async function fetchMediaInfo(mediaId) {
    if (!mediaId) throw new Error("IG02 mediaId boş (shortcode çözülemedi)");
    const url = `https://www.instagram.com/api/v1/media/${mediaId}/info/`;
    console.info("[rg-ig] fetchMediaInfo", { mediaId, url });
    let res;
    try {
      res = await fetch(url, { headers: { "X-IG-App-ID": IG_APP_ID }, credentials: "include", cache: "no-store" });
    } catch (e) {
      throw new Error(`IG03 ağ hatası: ${e.message || e}`);
    }
    if (!res.ok) throw new Error(`IG04 API ${res.status} (giriş yapılı mı / hesabı takip ediyor musun?)`);
    return res.json();
  }

  async function fetchProfileHd(username) {
    const res = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      { headers: { "X-IG-App-ID": IG_APP_ID }, credentials: "include", cache: "no-store" }
    );
    if (!res.ok) throw new Error(`IG04 profil API ${res.status}`);
    const j = await res.json();
    const u = j?.data?.user;
    return u?.profile_pic_url_hd || u?.profile_pic_url || "";
  }

  async function fetchHighlightItems(id) {
    const res = await fetch(
      `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=highlight%3A${encodeURIComponent(id)}`,
      { headers: { "X-IG-App-ID": IG_APP_ID }, credentials: "include", cache: "no-store" }
    );
    if (!res.ok) throw new Error(`reels ${res.status}`);
    const j = await res.json();
    return j?.reels_media?.[0]?.items || j?.reels?.[`highlight:${id}`]?.items || [];
  }

  function bestUrlFromNode(node) {
    if (node?.video_versions?.length) {
      return [...node.video_versions].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0].url;
    }
    if (node?.image_versions2?.candidates?.length) {
      return [...node.image_versions2.candidates].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0].url;
    }
    return "";
  }

  function allUrlsFromInfo(info) {
    const item = info?.items?.[0];
    if (!item) return [];
    const nodes = item.carousel_media?.length ? item.carousel_media : [item];
    return [...new Set(nodes.map(bestUrlFromNode).filter(Boolean))];
  }

  // Identify a media by the numeric hash embedded in its CDN URL
  function igHash(u) {
    const s = String(u || "");
    const named = s.match(/\/(\d{6,})_\d+_n\./);
    if (named) return named[1];
    const nums = s.match(/\d{8,}/g);
    return nums ? nums.sort((a, b) => b.length - a.length)[0] : "";
  }

  // For a carousel, find the item matching the currently visible slide element
  function matchCarouselItem(info, visibleEl) {
    const item = info?.items?.[0];
    if (!item) return null;
    if (!item.carousel_media?.length) return item;

    let hash = "";
    if (visibleEl instanceof HTMLImageElement) hash = igHash(visibleEl.currentSrc || visibleEl.src);
    else if (visibleEl instanceof HTMLVideoElement) hash = igHash(visibleEl.poster || "");

    if (hash) {
      const found = item.carousel_media.find(ci =>
        (ci.image_versions2?.candidates || []).some(c => igHash(c.url) === hash)
      );
      if (found) return found;
    }
    return item.carousel_media[0];
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function largestMediaIn(el) {
    if (!el) return null;
    return [...el.querySelectorAll("img, video")]
      .map(m => { const r = m.getBoundingClientRect(); return { m, area: r.width * r.height }; })
      .filter(i => i.area > 8000)
      .sort((a, b) => b.area - a.area)[0]?.m || null;
  }

  // The media currently on screen inside a container (the visible carousel slide)
  function visibleMediaIn(el) {
    if (!el) return null;
    return [...el.querySelectorAll("img, video")]
      .map(m => {
        const r = m.getBoundingClientRect();
        const visW = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
        const visH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        return { m, area: visW * visH };
      })
      .filter(i => i.area > 8000)
      .sort((a, b) => b.area - a.area)[0]?.m || null;
  }

  function directUrlFromVideo(v) {
    const cands = [v.currentSrc, v.src, ...[...v.querySelectorAll("source")].map(s => s.src)];
    for (const u of cands) {
      if (u && /^https?:\/\//i.test(u) && !u.startsWith("blob:")) return u;
    }
    return "";
  }

  function bestImgSrc(img) {
    if (!(img instanceof HTMLImageElement)) return "";
    let best = img.currentSrc || img.src, bestW = 0;
    for (const part of (img.srcset || "").split(",")) {
      const [u, d] = part.trim().split(/\s+/);
      const w = parseInt(d) || 0;
      if (u && w >= bestW) { bestW = w; best = u; }
    }
    return best;
  }

  function activeDialog() {
    return [...document.querySelectorAll("[role='dialog'], div[aria-modal='true']")]
      .map(el => {
        const r = el.getBoundingClientRect();
        return { el, area: r.width * r.height, visible: r.width > 200 && r.height > 200 && r.bottom > 0 && r.right > 0 };
      })
      .filter(item => item.visible)
      .sort((a, b) => b.area - a.area)[0]?.el || null;
  }

  function mediaHostForPoint(stack) {
    const dialog = activeDialog();
    if (!dialog) return null;
    return stack.some(el => el === dialog || dialog.contains(el)) ? dialog : false;
  }

  function visibleMediaBoxIn(el) {
    if (!el) return null;
    return [...el.querySelectorAll("img, video")]
      .map(m => {
        const r = m.getBoundingClientRect();
        const visW = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
        const visH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        const centerBias = Math.abs((r.left + r.right) / 2 - window.innerWidth / 2);
        return { m, r, area: visW * visH, centerBias };
      })
      .filter(i => i.area > 16000 && i.r.left < window.innerWidth * 0.72)
      .sort((a, b) => b.area - a.area || a.centerBias - b.centerBias)[0] || null;
  }

  // ── Context detection ─────────────────────────────────────────────────────

  function detectContext(x, y) {
    // Never on the notifications / activity page — those are tiny preview
    // thumbnails, not downloadable post views.
    if (/^\/notifications(?:\/|$)/i.test(location.pathname)) return null;

    // Story / highlight viewer — any cursor position counts
    if (/^\/stories\//i.test(location.pathname)) {
      return { kind: "highlight" };
    }

    // Profile avatar — checked by rect (the <img> is pointer-events:none, so it
    // never shows up in elementsFromPoint).
    const pUser = profileUsername();
    if (pUser) {
      const avatar = findProfileAvatarImg();
      if (avatar) {
        const r = avatar.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return { kind: "avatar", anchor: avatar, username: pUser };
        }
      }
    }

    const stack = document.elementsFromPoint(x, y);
    const host = mediaHostForPoint(stack);
    if (host === false) return null;
    const scope = host || document;

    // Profile avatar
    for (const el of stack) {
      if (host && !host.contains(el)) continue;
      if (el instanceof HTMLImageElement && profileUsername() && isAvatarImg(el)) {
        return { kind: "avatar", anchor: el, username: profileUsername() };
      }
    }

    // On a single post/reel PAGE the URL is authoritative — use it before any
    // stack link (which, in a viewer/modal, may point at a suggested item and
    // yield a wrong/short media id → API 400).
    const pageShortcode = /\/(?:p|reel|reels|tv)\/[^/?#]/i.test(location.pathname)
      ? shortcodeFromHref(location.href) : "";
    if (pageShortcode) {
      const art = host || document.querySelector("article") || document.body;
      const media = visibleMediaIn(art) || largestMediaIn(art);
      return { kind: "post", anchor: media || host || art, article: art, shortcode: pageShortcode };
    }

    // Post / reel context
    for (const el of stack) {
      if (host && !host.contains(el)) continue;
      const link = el.closest?.("a[href*='/p/'], a[href*='/reel/'], a[href*='/reels/'], a[href*='/tv/']");
      if (link) {
        const sc = shortcodeFromHref(link.href);
        if (sc) {
          const art = (host && (link.closest("article") || host)) || link.closest("article") || link;
          // A bare grid thumbnail (not inside an <article>) may be a carousel we
          // can't detect from the tile → always offer "download all" there.
          const grid = !link.closest("article");
          return { kind: "post", anchor: visibleMediaIn(art) || largestMediaIn(art) || link, article: art, shortcode: sc, grid };
        }
      }
      const art = el.closest?.("article");
      if (art) {
        const link2 = art.querySelector("a[href*='/p/'], a[href*='/reel/'], a[href*='/reels/'], a[href*='/tv/']");
        const sc = (link2 && shortcodeFromHref(link2.href)) || shortcodeFromHref(location.href);
        if (sc) return { kind: "post", anchor: visibleMediaIn(art) || largestMediaIn(art) || art, article: art, shortcode: sc };
      }
    }

    // Single post/reel page
    const scUrl = shortcodeFromHref(location.href);
    if (scUrl) {
      const art = host || scope.querySelector?.("article") || document.querySelector("article") || document.body;
      const media = visibleMediaIn(art) || largestMediaIn(art);
      if (media) return { kind: "post", anchor: media, article: art, shortcode: scUrl };
    }
    return null;
  }

  // Locate the story viewer's header (username text) to place the button under it
  function storyHeaderRect() {
    const links = [...document.querySelectorAll("a[href^='/']")]
      .filter(a => {
        const r = a.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top < 170 && r.left < window.innerWidth * 0.6 && (a.textContent || "").trim();
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return links[0]?.getBoundingClientRect() || null;
  }

  // A carousel (multi-media) post — used to decide whether to show "download all".
  function isCarouselPost(scope) {
    if (!scope) return false;
    // Explicit carousel container or a next/prev navigation button.
    if (scope.querySelector('[aria-roledescription="carousel"]')) return true;
    if (scope.querySelector('button[aria-label="Next"], button[aria-label="Go back"]')) return true;
    // Language-independent: a row of 2+ tiny, roughly-square pagination dots.
    for (const row of scope.querySelectorAll("div")) {
      const kids = row.children;
      if (kids.length < 2 || kids.length > 12) continue;
      let dots = 0;
      for (const k of kids) {
        const r = k.getBoundingClientRect();
        if (r.width > 0 && r.width <= 14 && Math.abs(r.width - r.height) <= 4) dots++;
      }
      if (dots >= 2 && dots === kids.length) return true;
    }
    return false;
  }

  // ── Positioning ───────────────────────────────────────────────────────────

  function positionButtons() {
    const one = document.getElementById(ONE_ID);
    const all = document.getElementById(ALL_ID);
    const web = document.getElementById(WEB_ID);
    if (!one || !all) return;

    const hideWeb = () => { if (web) web.style.display = "none"; };
    const hide = () => { one.style.display = "none"; all.style.display = "none"; hideWeb(); };
    if (!settings.instagramButtons || !ctx) { hide(); return; }

    const size = clamp(Number(settings.buttonSize) || 44, 28, 72);
    for (const b of [one, all]) { b.style.width = `${size}px`; b.style.height = `${size}px`; }

    let left, top, showAll = false, webMedia = null;

    if (ctx.kind === "highlight") {
      const hr = storyHeaderRect();
      left = hr ? hr.left : 16;
      top = hr ? hr.bottom + 8 : 72;
      // Blue auto-detects photo+music → image; no pink needed in stories.
    } else if (ctx.kind === "avatar") {
      if (!ctx.anchor?.isConnected) { hide(); return; }
      const r = ctx.anchor.getBoundingClientRect();
      if (r.width < 40) { hide(); return; }
      left = r.left + 8; top = r.top + 8;
    } else { // post
      const art = ctx.article;
      if (!art?.isConnected) { hide(); return; }
      const ar = art.getBoundingClientRect();
      const mediaBox = visibleMediaBoxIn(art);
      const media = mediaBox?.m || visibleMediaIn(art) || ctx.anchor;
      webMedia = media;
      const mr = (media || art).getBoundingClientRect();
      // Skip tiny thumbnails (notification/comment previews aren't real posts).
      if (mr.width < 70 || mr.height < 70) { hide(); return; }
      const mediaBottom = Math.min(mr.bottom, ar.bottom, window.innerHeight);
      const carousel = isCarouselPost(art);
      showAll = Boolean(ctx.grid) || carousel;
      // Carousels use the stable article column so the button does not drift
      // while sliding. Reels/single posts use the rendered media box; this keeps
      // the button attached when the browser window is narrow.
      const anchorLeft = carousel ? ar.left : mr.left;
      const reservedWidth = showAll ? size * 2 + 18 : size + 8;
      left = clampBox(anchorLeft + 10, Math.max(mr.left + 8, 8), Math.min(mr.right, window.innerWidth) - reservedWidth);
      top = clampBox(mr.top + 10, Math.max(ar.top + 8, 8), mediaBottom - size - 8);
      // "Download all" (pink): carousels (dots), or any grid thumbnail (may be
      // a carousel we can't detect from the tile). Single post pages → hidden.
    }

    left = clamp(left, 8, window.innerWidth - (showAll ? size * 2 + 18 : size + 8));
    top = clamp(top, 8, window.innerHeight - size - 8);

    one.style.left = `${left}px`;
    one.style.top = `${top}px`;
    one.style.display = "grid";

    if (showAll) {
      all.style.left = `${left + size + 8}px`;
      all.style.top = `${top}px`;
      all.style.display = "grid";
    } else {
      all.style.display = "none";
    }

    // Web listesi butonu — yalnız gerçek gönderi (post/reel), ızgara değil.
    // İndirme butonunun hemen altında. Özellik D, kapsam: "sadece ana medya".
    if (web && ctx.kind === "post" && !ctx.grid && webMedia) {
      web.style.width = `${size}px`;
      web.style.height = `${size}px`;
      web.style.left = `${left}px`;
      web.style.top = `${clamp(top + size + 8, 8, window.innerHeight - size - 8)}px`;
      web.style.display = "grid";
      web.__igMedia = webMedia;
    } else {
      hideWeb();
    }
  }

  function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const one = document.getElementById(ONE_ID);
      const all = document.getElementById(ALL_ID);
      const web = document.getElementById(WEB_ID);
      const menu = document.getElementById(MENU_ID);
      const webMenu = document.getElementById("rg-web-menu");
      // :hover never matches on touch, so this would hide the buttons the user
      // is about to tap. There is no pointer to leave, so nothing to hide.
      if (globalThis.RG_SETTINGS.isTouchDevice()) return;
      if (one?.matches(":hover") || all?.matches(":hover") || web?.matches(":hover") || menu || webMenu) return;
      ctx = null;
      if (one) one.style.display = "none";
      if (all) all.style.display = "none";
      if (web) web.style.display = "none";
    }, 110);
  }

  // ── Downloads ─────────────────────────────────────────────────────────────

  // Kaynak etiketi — özellik A: Instagram'da yalnız kullanıcı adı. İndirme
  // bağlamındaki (ctx) kullanıcıyı; yoksa profil URL'sinden (/{ad}/) türet.
  function currentIgUser() {
    if (ctx && ctx.username) return String(ctx.username).replace(/^@/, "");
    const m = location.pathname.match(/^\/([A-Za-z0-9._]+)\/?$/);
    if (m && !/^(p|reel|reels|explore|stories|tv|accounts|direct|about)$/i.test(m[1])) return m[1];
    return "";
  }

  function sendDownload(urls, downloadAll, folder) {
    const list = (urls || []).filter(Boolean);
    console.info("[rg-ig] sendDownload", { count: list.length, downloadAll: !!downloadAll, folder: folder || "(ana)", urls: list });
    return new Promise((resolve, reject) => {
      if (!list.length) { reject(new Error("IG08 gönderilecek URL yok")); return; }
      // Extension reloaded (new zip) while this tab stayed open → chrome.runtime
      // is gone. Give a clear instruction instead of a cryptic null error.
      if (!chrome || !chrome.runtime || !chrome.runtime.id) {
        reject(new Error("Eklenti güncellendi — Instagram sekmesini yenile (F5)"));
        return;
      }
      const t = setTimeout(() => reject(new Error("IG09 zaman aşımı (60s)")), 60000);
      try {
        chrome.runtime.sendMessage(
          {
            type: "DIRECT_DOWNLOAD",
            urls: list,
            downloadAll: Boolean(downloadAll),
            allowRipsnipFallback: false,
            skipReachability: true,
            folderName: folder || "",
            source: currentIgUser(),
            downloadPath: settings.downloadPath || DEFAULT_SETTINGS.downloadPath
          },
          (res) => {
            clearTimeout(t);
            if (chrome.runtime.lastError) { reject(new Error(`IG07 runtime: ${chrome.runtime.lastError.message}`)); return; }
            if (!res || res.ok === false) { reject(new Error(res?.error || "IG06 arka plan medya bulamadı")); return; }
            console.info("[rg-ig] indirme başladı", res);
            resolve(res);
          }
        );
      } catch (e) {
        clearTimeout(t);
        reject(new Error("Eklenti bağlantısı koptu — sekmeyi yenile (F5)"));
      }
    });
  }

  async function doSingle(btn, folder) {
    if (!btn || btn.disabled) return;
    // Capture ctx now — hover/scheduleHide can clear the global mid-await.
    const c = ctx;
    if (!c) { setStatus("Hata: IG01 hedef yok (medyanın üstüne gel)", "error"); return; }
    btn.disabled = true;
    setStatus("İndiriliyor…", "idle");
    console.info("[rg-ig] doSingle", { kind: c.kind, shortcode: c.shortcode, mediaId: c.shortcode ? shortcodeToMediaId(c.shortcode) : "", username: c.username, folder });
    try {
      if (c.kind === "avatar") {
        const url = await fetchProfileHd(c.username);
        if (!url) throw new Error("IG05 profil fotoğrafı URL'i yok");
        await sendDownload([url], false, folder);
        setStatus("Profil fotoğrafı indirildi ✓", "done");
        return;
      }

      if (c.kind === "highlight") {
        await downloadCurrentStory(folder);
        setStatus("İndirildi ✓", "done");
        return;
      }

      // Post/reel: resolve via API so videos (reels) work, not just posters
      const info = await fetchMediaInfo(shortcodeToMediaId(c.shortcode));
      const visible = visibleMediaIn(c.article || document);
      const node = matchCarouselItem(info, visible);
      const url = bestUrlFromNode(node);
      if (!url) throw new Error("IG05 medya URL'i çıkarılamadı");
      await sendDownload([url], false, folder);
      setStatus("İndirildi ✓", "done");
    } catch (err) {
      console.error("[rg-ig] doSingle HATA:", err);
      setStatus(`Hata: ${err.message || err}`, "error");
    } finally {
      btn.disabled = false;
    }
  }

  async function doAll(btn, folder) {
    if (!btn || btn.disabled) return;
    const c = ctx;
    if (!c || c.kind !== "post") { setStatus("Hata: IG01 post hedefi yok", "error"); return; }
    btn.disabled = true;
    setStatus("Post indiriliyor…", "idle");
    console.info("[rg-ig] doAll", { shortcode: c.shortcode, folder });
    try {
      const info = await fetchMediaInfo(shortcodeToMediaId(c.shortcode));
      const urls = allUrlsFromInfo(info);
      if (!urls.length) throw new Error("IG05 medya URL'i çıkarılamadı");
      await sendDownload(urls, true, folder);
      setStatus(`${urls.length} medya indiriliyor ✓`, "done");
    } catch (err) {
      console.error("[rg-ig] doAll HATA:", err);
      setStatus(`Hata: ${err.message || err}`, "error");
    } finally {
      btn.disabled = false;
    }
  }

  // Numeric media id embedded in a story URL:
  //   /stories/{username}/{mediaId}/  or  /stories/highlights/{id}/{mediaId}/
  function storyMediaIdFromUrl() {
    let m = location.pathname.match(/\/stories\/(?!highlights(?:\/|$))[^/]+\/(\d+)/i);
    if (m) return m[1];
    m = location.pathname.match(/\/stories\/highlights\/\d+\/(\d+)/i);
    return m ? m[1] : "";
  }

  // Index of the currently-playing story item, from the top progress bar:
  // completed segments are full, the current one is partially filled.
  function currentStoryIndex() {
    let segs = [...document.querySelectorAll("div")].filter((d) => {
      const r = d.getBoundingClientRect();
      return r.top < 44 && r.height >= 1.5 && r.height <= 7 && r.width >= 6 && r.width < window.innerWidth;
    });
    if (!segs.length) return -1;
    segs.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const inner = seg.firstElementChild;
      const segW = seg.getBoundingClientRect().width || 1;
      const fillW = inner ? inner.getBoundingClientRect().width : 0;
      if (fillW / segW < 0.98) return i; // first not-full segment = current item
    }
    return segs.length - 1;
  }

  // A "photo + music" story: a still image with a music sticker, rendered as a
  // black video with audio. media_type 1 = pure photo. → download the image.
  function isPhotoWithMusic(item) {
    if (!item) return false;
    if (item.media_type === 1) return true;
    const st = item.story_music_stickers;
    return Array.isArray(st) ? st.length > 0 : Boolean(st);
  }

  function bestImageUrl(item) {
    const cand = item && item.image_versions2 && item.image_versions2.candidates;
    if (!cand || !cand.length) return "";
    return [...cand].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0].url;
  }

  // CDN filename (no extension) — stable id shared between the API URL and the
  // actually-fetched playback URL, across quality/host differences.
  function igMediaPathKey(u) {
    try { return new URL(u).pathname.split("/").pop().replace(/\.[a-z0-9]+$/i, ""); } catch { return ""; }
  }

  // The highlight item whose video is currently PLAYING. Identified by matching
  // fetched .mp4 filenames against every item's video_versions. The active video
  // is streamed in many byte-range requests; a just-preloaded neighbour is
  // fetched only once — so pick the most-fetched RECENT file (not just the
  // newest, which is often the preloaded next item → off-by-one).
  function currentHighlightVideoItem(items) {
    const entries = performance.getEntriesByType("resource")
      .filter((e) => /cdninstagram|fbcdn/i.test(e.name) && /\.mp4/i.test(e.name));
    if (!entries.length) return null;
    const latest = Math.max(...entries.map((e) => e.startTime));
    const count = new Map();
    const lastAt = new Map();
    for (const e of entries) {
      if (e.startTime < latest - 5000) continue; // recent window only
      const k = igMediaPathKey(e.name);
      if (!k) continue;
      count.set(k, (count.get(k) || 0) + 1);
      lastAt.set(k, Math.max(lastAt.get(k) || 0, e.startTime));
    }
    const keys = [...count.keys()].sort((a, b) => (count.get(b) - count.get(a)) || (lastAt.get(b) - lastAt.get(a)));
    for (const k of keys) {
      const item = (items || []).find((it) => (it.video_versions || []).some((v) => igMediaPathKey(v.url) === k));
      if (item) return item;
    }
    return null;
  }

  // Download the STILL IMAGE of the current highlight item — for "photo + music"
  // items that play as a black video with audio (the photo is in image_versions2).
  async function doStoryImage(btn, folder) {
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    setStatus("Görsel indiriliyor…", "idle");
    try {
      let url = "";
      const id = highlightIdFromUrl();
      if (id) {
        const items = await fetchHighlightItems(id);
        const item = currentHighlightVideoItem(items);
        const cand = item && item.image_versions2 && item.image_versions2.candidates;
        if (cand && cand.length) {
          url = [...cand].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0].url;
        }
      }
      if (!url) { url = bestImgSrc(visibleMediaIn(document.body)); }
      if (!url) throw new Error("IG11 görsel bulunamadı");
      await sendDownload([url], false, folder);
      setStatus("Görsel indirildi ✓", "done");
    } catch (err) {
      console.error("[rg-ig] doStoryImage HATA:", err);
      setStatus(`Hata: ${err.message || err}`, "error");
    } finally {
      btn.disabled = false;
    }
  }

  async function downloadCurrentStory(folder) {
    // 1. Regular story URLs carry the media id → resolve via the media API
    //    (gives video_versions for videos AND full image for photos).
    const storyId = storyMediaIdFromUrl();
    if (storyId) {
      try {
        const info = await fetchMediaInfo(storyId);
        const item = info?.items?.[0];
        const url = isPhotoWithMusic(item) ? bestImageUrl(item) : bestUrlFromNode(item);
        if (url) { await sendDownload([url], false, folder); return; }
      } catch (e) {
        console.warn("[rg-ig] story media API başarısız:", e && e.message || e);
      }
    }

    const video = [...document.querySelectorAll("video")]
      .map(v => { const r = v.getBoundingClientRect(); return { v, area: r.width * r.height }; })
      .filter(i => i.area > 40000)
      .sort((a, b) => b.area - a.area)[0]?.v || null;

    if (video) {
      // 2. Visible video with a direct (non-blob) URL.
      const direct = directUrlFromVideo(video);
      if (direct) { await sendDownload([direct], false, folder); return; }
      // 3. Highlight reels API → match the currently-playing video by its CDN
      //    filename (blob has no poster; the file name is stable across qualities
      //    per encoding, so match against ALL video_versions of every item).
      const id = highlightIdFromUrl();
      if (id) {
        const items = await fetchHighlightItems(id);
        let item = currentHighlightVideoItem(items);
        let via = "perf";
        if (!item) {
          const idx = currentStoryIndex();
          item = (idx >= 0 && idx < items.length) ? items[idx] : null;
          // A visible video must map to an API item with video_versions. If the
          // progress-bar heuristic lands on a neighbouring photo, prefer the
          // nearest video item instead of downloading its poster image.
          if (!item?.video_versions?.length) {
            const nearby = [idx - 1, idx + 1, idx - 2, idx + 2]
              .filter((i) => i >= 0 && i < items.length)
              .map((i) => ({ item: items[i], distance: Math.abs(i - idx), index: i }))
              .find((candidate) => candidate.item?.video_versions?.length);
            if (nearby) { item = nearby.item; via = `near-video:${nearby.index}`; }
          } else {
            via = "index:" + idx;
          }
        }
        if (!item) { item = items[0]; via = "first"; }

        // Photo + music → the video track is black; grab the image layer instead.
        if (isPhotoWithMusic(item)) {
          const iurl = bestImageUrl(item);
          if (iurl) {
            console.info("[rg-ig] highlight FOTO+müzik → görsel indiriliyor", { via });
            await sendDownload([iurl], false, folder);
            return;
          }
        }

        console.info("[rg-ig] highlight video", { via, total: items.length });
        const url = bestUrlFromNode(item);
        if (url) { await sendDownload([url], false, folder); return; }
      }
      throw new Error("IG10 story video URL bulunamadı");
    }

    // 4. Image story → the displayed image.
    const img = visibleMediaIn(document.body);
    const url = bestImgSrc(img);
    if (!url) throw new Error("medya yok");
    await sendDownload([url], false, folder);
  }

  // ── App floating-button bridge ────────────────────────────────────────────
  // The in-app browser has no hover, so instead of detectContext(pointer) it
  // collects one media per visible post here. Each item resolves through the
  // media API (matchCarouselItem → bestUrlFromNode), so a reel's video is
  // fetched as video, not its poster (IG video↔poster), and the list gets the
  // post permalink, not the bare domain (KÖK-LİSTE).

  function postScopeFor(media) {
    return media.closest("article") || media.closest(POST_LINK_SEL) || media;
  }

  // Every post link inside the media's post, own link last — the first one that
  // yields a real shortcode wins.
  function postLinksFor(media) {
    const scope = media.closest("article") || media;
    const links = [...(scope.querySelectorAll?.(POST_LINK_SEL) || [])];
    const own = media.closest(POST_LINK_SEL);
    if (own && !links.includes(own)) links.push(own);
    return links;
  }

  function shortcodeForMedia(media) {
    const pageSc = /\/(?:p|reel|reels|tv)\/[^/?#]/i.test(location.pathname)
      ? shortcodeFromHref(location.href) : "";
    if (pageSc) return pageSc;
    for (const link of postLinksFor(media)) {
      const sc = shortcodeFromHref(link.href);
      if (sc) return sc;
    }
    return shortcodeFromHref(location.href) || "";
  }

  // The post's author, read from the post header. It turns the saved address
  // into instagram.com/<user>/p/<code>/, which the list reads as "@user | post"
  // rather than a bare "post" — the same label the web archive shows.
  function authorForMedia(media) {
    const scope = media.closest("article") || document;
    for (const a of scope.querySelectorAll?.("a[href^='/']") || []) {
      const seg = (a.getAttribute("href") || "").split("/").filter(Boolean);
      if (seg.length !== 1) continue;
      if (/^(explore|reels|reel|direct|stories|accounts|p|tv|notifications)$/i.test(seg[0])) continue;
      return seg[0];
    }
    return profileUsername();
  }

  // The canonical post address, never the sub-page a tile happens to link to.
  function postPermalinkIG(media) {
    let kind = "p";
    let sc = "";
    for (const link of postLinksFor(media)) {
      const found = shortcodeFromHref(link.href);
      if (found) { sc = found; kind = postKindFromHref(link.href); break; }
    }
    if (!sc) {
      sc = shortcodeForMedia(media);
      if (sc) kind = postKindFromHref(location.href);
    }
    if (!sc) return location.href;
    const user = authorForMedia(media);
    return user
      ? `https://www.instagram.com/${user}/${kind}/${sc}/`
      : `https://www.instagram.com/${kind}/${sc}/`;
  }

  async function resolveMediaIG(media) {
    const sc = shortcodeForMedia(media);
    if (sc) {
      try {
        const info = await fetchMediaInfo(shortcodeToMediaId(sc));
        const node = matchCarouselItem(info, media);
        const url = bestUrlFromNode(node);
        if (url) { await sendDownload([url], false, ""); return; }
      } catch (error) {
        console.warn("[rg-ig] köprü API başarısız, doğrudan src'ye düşülüyor", error?.message || error);
      }
    }
    const direct = media instanceof HTMLVideoElement ? directUrlFromVideo(media) : bestImgSrc(media);
    if (direct) await sendDownload([direct], false, "");
  }

  window.__rgSiteName = "instagram.com";
  window.__rgCollectMedia = () => {
    if (!settings.instagramButtons) return [];

    // Story / highlight viewer: a single media, resolved by the story pipeline.
    if (/^\/stories\//i.test(location.pathname)) {
      const media = visibleMediaIn(document.body);
      if (!media) return [];
      return [{
        el: media,
        kind: media instanceof HTMLVideoElement ? "video" : "image",
        src: media instanceof HTMLVideoElement ? "" : bestImgSrc(media),
        permalink: location.href,
        title: "",
        resolve: () => { downloadCurrentStory("").catch(() => {}); }
      }];
    }

    // Feed / profile / post: the largest visible media of each post, avatars
    // and icons filtered out.
    const byPost = new Map();
    for (const media of document.querySelectorAll("img, video")) {
      const r = media.getBoundingClientRect();
      const visW = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
      const visH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      const area = visW * visH;
      if (area < 10000) continue;
      if (media instanceof HTMLImageElement && isAvatarImg(media)) continue;
      const scope = postScopeFor(media);
      const prev = byPost.get(scope);
      if (!prev || area > prev.area) byPost.set(scope, { media, area });
    }

    const out = [];
    for (const { media } of byPost.values()) {
      out.push({
        el: media,
        kind: media instanceof HTMLVideoElement ? "video" : "image",
        src: media instanceof HTMLVideoElement ? (directUrlFromVideo(media) || "") : bestImgSrc(media),
        permalink: postPermalinkIG(media),
        title: "",
        resolve: () => { resolveMediaIG(media).catch(() => {}); }
      });
    }
    return out;
  };

  // ── Events ────────────────────────────────────────────────────────────────

  let mmPending = false, lastX = 0, lastY = 0;
  function onMove(e) {
    lastX = e.clientX; lastY = e.clientY;
    if (mmPending) return;
    mmPending = true;
    requestAnimationFrame(() => {
      mmPending = false;
      if (!settings.instagramButtons) return;
      ensureUi();
      const one = document.getElementById(ONE_ID);
      const all = document.getElementById(ALL_ID);
      const menu = document.getElementById(MENU_ID);
      const stack = document.elementsFromPoint(lastX, lastY);
      if ((one && stack.includes(one)) || (all && stack.includes(all)) || menu) {
        if (hideTimer) clearTimeout(hideTimer);
        return;
      }
      const found = detectContext(lastX, lastY);
      if (found) {
        if (hideTimer) clearTimeout(hideTimer);
        ctx = found;
        positionButtons();
      } else {
        scheduleHide();
      }
    });
  }
  document.addEventListener("mousemove", onMove, { passive: true, capture: true });
  document.addEventListener("pointermove", onMove, { passive: true, capture: true });
  window.addEventListener("scroll", () => requestAnimationFrame(positionButtons), { passive: true, capture: true });
  window.addEventListener("resize", () => requestAnimationFrame(positionButtons));

  setInterval(() => {
    if (document.hidden || !settings.instagramButtons) return;
    ensureUi();
    if (ctx) positionButtons();
  }, 800);

  // ── Settings ──────────────────────────────────────────────────────────────

  function loadSettings() {
    chrome.storage.local.get(SETTINGS_KEY, items => {
      settings = { ...DEFAULT_SETTINGS, ...(items?.[SETTINGS_KEY] || {}) };
      ensureUi();
    });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    settings = { ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) };
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "RG_HELPER_STATUS") return;
    if (message.level === "error") setStatus(message.text || "Download failed", "error");
    if (message.level === "done") setStatus(message.text || "Download started", "done");
  });

  loadSettings();
})();
