// Tek açmalık public paylaşım linkleri.
//
//   POST   /api/share            → { keys | cat, maxOpens, ttlHours, label } → { token, url }
//   GET    /api/share            → mevcut linkler (kalan açılış, bitiş)
//   DELETE /api/share/<token>    → iptal
//   GET    /s/<token>            → herkese açık sayfa (bir "açılış" sayar)
//   GET    /s/<token>/f/<sıra>   → o sayfanın dosyasını akıtır (açılış saymaz)
//
// Token 32 rastgele bayt (256 bit) — tahmin edilemez, o yüzden linkin kendisi
// yetkidir. Varsayılan: 1 açılış, 24 saat. Süre ya da adet dolduğunda dosya ucu
// da kapanır, yani link "sızmış" olsa bile ölü olur.
//
// Sayaç Supabase'te bir belgede tutulur (docs.js). Oku-değiştir-yaz yarışı
// teorik olarak iki eşzamanlı açılışı tek sayabilir; tek kişilik bir arşivde
// bunun bedeli sıfır, alternatifi (Durable Object) ise fazladan altyapı.
import { json } from "../functions/api/_utils.js";
import { readDoc, writeDoc } from "./docs.js";
import { parseKey, kindOf } from "./keys.js";
import { streamMedia } from "./media.js";

const DOC_ID = "shares";
const MAX_SHARES = 300;
const MAX_KEYS = 500;

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function newToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(24)));
}

async function loadShares(env) {
  const doc = await readDoc(env, DOC_ID, { shares: [] });
  return Array.isArray(doc.shares) ? doc.shares : [];
}

// Ölü kayıtları yazarken temizleriz; belge kendiliğinden küçük kalır.
function alive(share, now) {
  if (share.expiresAt && share.expiresAt < now) return false;
  if (share.maxOpens && share.opens > share.maxOpens) return false;
  return true;
}

async function saveShares(env, shares) {
  const now = Date.now();
  const kept = shares.filter((s) => alive(s, now)).slice(-MAX_SHARES);
  await writeDoc(env, DOC_ID, { shares: kept });
  return kept;
}

/* ------------------------------------------------------------------ yönetim */

export async function handleShareApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, "");

  if (path === "/api/share" && request.method === "GET") {
    const now = Date.now();
    const shares = (await loadShares(env)).filter((s) => alive(s, now));
    return json(shares.map((s) => ({
      token: s.token, label: s.label, count: s.keys.length,
      opens: s.opens, maxOpens: s.maxOpens, expiresAt: s.expiresAt, createdAt: s.createdAt
    })));
  }

  if (path === "/api/share" && request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "gövde JSON değil" }, 400);
    }
    const keys = Array.isArray(body.keys)
      ? [...new Set(body.keys.filter((k) => typeof k === "string" && parseKey(k)))].slice(0, MAX_KEYS)
      : [];
    if (!keys.length) return json({ ok: false, error: "paylaşılacak dosya yok" }, 400);

    const maxOpens = Number.isFinite(body.maxOpens) ? Math.max(0, Math.min(1000, Math.floor(body.maxOpens))) : 1;
    const ttlHours = Number.isFinite(body.ttlHours) ? Math.max(0, Math.min(24 * 365, body.ttlHours)) : 24;
    const share = {
      token: newToken(),
      label: typeof body.label === "string" ? body.label.slice(0, 80) : "",
      keys,
      maxOpens,                                     // 0 = sınırsız
      opens: 0,
      expiresAt: ttlHours ? Date.now() + ttlHours * 3600_000 : 0, // 0 = süresiz
      createdAt: Date.now()
    };
    const shares = await loadShares(env);
    shares.push(share);
    await saveShares(env, shares);
    return json({ ok: true, token: share.token, url: `${url.origin}/s/${share.token}` }, 201);
  }

  if (path.startsWith("/api/share/") && request.method === "DELETE") {
    const token = decodeURIComponent(path.slice("/api/share/".length));
    const shares = (await loadShares(env)).filter((s) => s.token !== token);
    await saveShares(env, shares);
    return json({ ok: true });
  }

  return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: "GET, POST, DELETE" });
}

/* -------------------------------------------------------------- public sayfa */

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Script içine gömülen JSON: "</script>" ve JS'te satır sonu sayılan U+2028/U+2029
// kaçırılmazsa dosya adındaki tek bir "<" sayfayı kırabilir. Desen kod noktalarından
// kurulur, böylece kaynakta görünmez karakter taşımayız.
const JSON_BAD = new RegExp("[<" + String.fromCharCode(0x2028, 0x2029) + "]", "g");

function jsonForScript(value) {
  return JSON.stringify(value).replace(JSON_BAD, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

function page(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // Paylaşım sayfası indekslenmemeli; link zaten tek kişilik.
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

const SHARE_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:#08070a; color:#f5f1ea; padding:22px 16px 60px;
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
  body::before { content:""; position:fixed; inset:0; pointer-events:none; z-index:-1;
    background:radial-gradient(70% 55% at 15% 0%, #7c3aed33, transparent 60%),
               radial-gradient(60% 50% at 90% 10%, #f59e0b26, transparent 60%); }
  header { max-width:1100px; margin:0 auto 22px; display:flex; align-items:center; gap:12px; }
  .mark { width:34px; height:34px; border-radius:11px; display:grid; place-items:center; font-weight:800;
    background:linear-gradient(135deg,#f59e0b,#ec4899); color:#1a1206; }
  h1 { font-size:17px; margin:0; font-weight:700; letter-spacing:-.01em; }
  .sub { font-size:12px; color:#9a93a8; margin-top:2px; }
  .grid { max-width:1100px; margin:0 auto; display:grid; gap:14px;
    grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); }
  figure { margin:0; border-radius:16px; overflow:hidden; background:#131118;
    border:1px solid #241f2e; }
  figcaption { padding:9px 12px; font-size:12px; color:#a49dae; overflow:hidden;
    text-overflow:ellipsis; white-space:nowrap; }

  /* Tek dosya: ızgara yok, doğrudan ekranın ortasında ve olabildiğince büyük. */
  .solo { max-width:1100px; margin:0 auto; display:flex; flex-direction:column;
    align-items:center; gap:12px; }
  .solo img, .solo video { max-width:100%; max-height:78vh; width:auto; height:auto;
    display:block; border-radius:16px; background:#000; }
  .solo .name { font-size:13px; color:#a49dae; }

  /* Çoklu: kapaklar kare, tıklanınca büyüğü açılır. */
  .tile { position:relative; display:block; width:100%; aspect-ratio:1; padding:0; cursor:pointer;
    border:0; background:#000; overflow:hidden; }
  .tile img, .tile video { width:100%; height:100%; object-fit:cover; display:block;
    pointer-events:none; }
  .tile .play { position:absolute; inset:0; display:grid; place-items:center; }
  .tile .play i { width:44px; height:44px; border-radius:99px; display:block;
    background:rgba(10,8,14,.55); border:1px solid rgba(255,255,255,.3);
    box-shadow:inset 0 0 0 14px transparent; }
  .tile .play i::after { content:""; display:block; width:0; height:0; margin:15px 0 0 17px;
    border-left:13px solid #fff; border-top:8px solid transparent; border-bottom:8px solid transparent; }

  /* Büyütme katmanı. Kapatma: çarpı, Esc ya da boşluğa tıklama. */
  .lb { position:fixed; inset:0; z-index:9; display:none; flex-direction:column;
    background:rgba(4,3,6,.94); }
  .lb.on { display:flex; }
  .lb-bar { display:flex; align-items:center; gap:10px; padding:12px 14px; }
  .lb-bar .t { flex:1 1 auto; min-width:0; font-size:13px; color:#cfc8da;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lb-bar a, .lb-bar button { height:34px; padding:0 14px; border-radius:11px; cursor:pointer;
    border:1px solid #2c2637; background:#1a1722; color:#f5f1ea; font:600 13px/32px inherit;
    text-decoration:none; }
  .lb-stage { flex:1 1 auto; min-height:0; display:grid;
    grid-template:minmax(0,1fr)/minmax(0,1fr); place-items:center; padding:0 14px 18px; }
  .lb-stage img, .lb-stage video { max-width:100%; max-height:100%; width:auto; height:auto;
    object-fit:contain; border-radius:14px; background:#000; }
  .lb-nav { position:absolute; top:50%; transform:translateY(-50%); width:42px; height:70px;
    border-radius:14px; border:1px solid #2c2637; background:rgba(20,18,26,.7); color:#cfc8da;
    cursor:pointer; font:700 20px/1 inherit; }
  .lb-nav.p { left:12px; } .lb-nav.n { right:12px; }

  .center { max-width:420px; margin:14vh auto 0; text-align:center;
    background:#131118; border:1px solid #241f2e; border-radius:20px; padding:36px 28px; }
  .center h2 { margin:0 0 8px; font-size:20px; }
  .center p { margin:0; color:#9a93a8; font-size:14px; }
`;

// Katmanın davranışı. Sunucu tarafında dosya listesi zaten basılı olduğu için
// buradaki iş yalnız "hangi sırayı göster" — ekstra istek yok.
const SHARE_JS = `
(function () {
  var files = window.__FILES__ || [];
  var box = document.getElementById("lb");
  if (!box || !files.length) return;
  var stage = document.getElementById("lb-stage");
  var name = document.getElementById("lb-name");
  var down = document.getElementById("lb-down");
  var at = 0;

  function draw() {
    var f = files[at];
    stage.innerHTML = "";
    var node;
    if (f.video) {
      node = document.createElement("video");
      node.controls = true; node.autoplay = true; node.playsInline = true;
    } else {
      node = document.createElement("img");
    }
    node.src = f.src;
    stage.appendChild(node);
    name.textContent = f.name;
    down.href = f.src;
    down.setAttribute("download", f.name);
    var prev = document.getElementById("lb-prev");
    var next = document.getElementById("lb-next");
    prev.style.visibility = at > 0 ? "visible" : "hidden";
    next.style.visibility = at < files.length - 1 ? "visible" : "hidden";
  }

  function open(i) { at = i; box.classList.add("on"); draw(); }
  function close() {
    box.classList.remove("on");
    stage.innerHTML = "";
  }
  function step(d) {
    var i = at + d;
    if (i < 0 || i >= files.length) return;
    at = i; draw();
  }

  var tiles = document.querySelectorAll(".tile");
  for (var i = 0; i < tiles.length; i += 1) {
    (function (n) { tiles[n].addEventListener("click", function () { open(n); }); }(i));
  }
  document.getElementById("lb-close").addEventListener("click", close);
  document.getElementById("lb-prev").addEventListener("click", function () { step(-1); });
  document.getElementById("lb-next").addEventListener("click", function () { step(1); });
  box.addEventListener("click", function (e) { if (e.target === box || e.target === stage) close(); });
  document.addEventListener("keydown", function (e) {
    if (!box.classList.contains("on")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
}());
`;

function deadPage(title, detail) {
  return page(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title>
    <style>${SHARE_CSS}</style></head><body>
    <div class="center"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p></div>
    </body></html>`, 410);
}

export async function handleSharePublic(request, env, url) {
  const rest = url.pathname.slice("/s/".length).replace(/\/+$/, "");
  const [rawToken, section, rawIndex] = rest.split("/");
  const token = decodeURIComponent(rawToken || "");
  if (!token) return deadPage("Link geçersiz", "Bağlantı eksik görünüyor.");

  const shares = await loadShares(env);
  const share = shares.find((s) => s.token === token);
  if (!share) return deadPage("Link bulunamadı", "Bu paylaşım iptal edilmiş ya da hiç var olmamış.");

  const now = Date.now();
  if (share.expiresAt && share.expiresAt < now) {
    return deadPage("Süresi doldu", "Bu paylaşım linkinin geçerlilik süresi bitmiş.");
  }

  // Dosya ucu: sayfayı açan ziyaretçi görselleri çekebilsin diye açılış saymaz,
  // ama adet dolduysa o da kapanır.
  if (section === "f") {
    if (share.maxOpens && share.opens > share.maxOpens) {
      return json({ ok: false, error: "link tükendi" }, 410);
    }
    const index = Number(rawIndex);
    const key = Number.isInteger(index) ? share.keys[index] : null;
    if (!key) return json({ ok: false, error: "yok" }, 404);
    return streamMedia(env, key, request, request.method === "HEAD" ? "HEAD" : "GET");
  }

  if (section) return deadPage("Link geçersiz", "Beklenmeyen adres.");

  // Sayfa açılışı: sayacı burada artırırız.
  share.opens += 1;
  await saveShares(env, shares);
  if (share.maxOpens && share.opens > share.maxOpens) {
    return deadPage("Link tükendi", "Bu paylaşım için izin verilen açılış sayısı dolmuş.");
  }

  const files = share.keys.map((key, index) => {
    const parts = parseKey(key);
    const name = parts ? parts.file : key;
    return { name, video: kindOf(name) === "video", src: `/s/${encodeURIComponent(token)}/f/${index}` };
  });

  // Tek dosyada ızgaraya gerek yok: doğrudan büyük hâliyle açılır, video ise
  // oynatma düğmeleriyle gelir. Çoklu paylaşımda kapaklar basılır, büyütme işi
  // katmana kalır.
  let body;
  if (files.length === 1) {
    const one = files[0];
    const media = one.video
      ? `<video src="${one.src}" controls autoplay playsinline preload="metadata"></video>`
      : `<img src="${one.src}" alt="">`;
    body = `<div class="solo">${media}<div class="name">${escapeHtml(one.name)}</div></div>`;
  } else {
    const tiles = files.map((file) => {
      const cover = file.video
        ? `<video src="${file.src}#t=0.1" muted playsinline preload="metadata"></video><span class="play"><i></i></span>`
        : `<img src="${file.src}" alt="" loading="lazy">`;
      return `<figure><button class="tile" type="button" aria-label="${escapeHtml(file.name)}">${cover}</button>`
        + `<figcaption>${escapeHtml(file.name)}</figcaption></figure>`;
    }).join("");
    body = `<div class="grid">${tiles}</div>
    <div class="lb" id="lb">
      <div class="lb-bar">
        <span class="t" id="lb-name"></span>
        <a id="lb-down" href="#" download>İndir</a>
        <button type="button" id="lb-close">Kapat</button>
      </div>
      <div class="lb-stage" id="lb-stage"></div>
      <button type="button" class="lb-nav p" id="lb-prev">‹</button>
      <button type="button" class="lb-nav n" id="lb-next">›</button>
    </div>
    <script>window.__FILES__ = ${jsonForScript(files)};${SHARE_JS}<\/script>`;
  }

  const remaining = share.maxOpens ? `${share.maxOpens - share.opens} açılış kaldı` : "sınırsız açılış";
  const until = share.expiresAt
    ? new Date(share.expiresAt).toLocaleString("tr-TR")
    : "süresiz";

  return page(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${escapeHtml(share.label || "Paylaşım")} — Tasu Archive</title>
    <style>${SHARE_CSS}</style></head><body>
    <header>
      <div class="mark">T</div>
      <div>
        <h1>${escapeHtml(share.label || "Paylaşılan medya")}</h1>
        <div class="sub">${share.keys.length} dosya · ${escapeHtml(remaining)} · ${escapeHtml(until)}</div>
      </div>
    </header>
    ${body}
    </body></html>`);
}
