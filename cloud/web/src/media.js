// R2 medya uçları — telefonun ve sitenin ortak deposu (env.MEDIA binding).
//
//   GET    /api/media[?drive=]        → [{ key, name, drive, site, size, mtime, kind }]
//   GET    /api/media/<anahtar>       → dosyayı akıtır (Range destekli, video seek)
//   HEAD   /api/media/<anahtar>       → yalnız başlıklar
//   PUT    /api/media/<ad>?drive=&site=  → yükler, çakışmayı çözer, { ok, key, name }
//   DELETE /api/media/<anahtar>       → siler
//   POST   /api/media/bulk            → { action:"delete"|"move", keys, drive?, site? }
//   GET    /api/thumb/<anahtar>       → video kapağı (önbellekte yoksa 404)
//   PUT    /api/thumb/<anahtar>       → kapağı önbelleğe yazar (istemci üretir)
//
// Anahtar düzeni keys.js'te: <drive>/<site>/<dosya>. Eski düz adlar hâlâ okunur
// ve main/Other sayılır, yani hiçbir dosya kaybolmaz.
//
// Yetki: (a) Google oturum çerezi (web), (b) Bearer ARCHIVE_TOKEN (uygulama),
// ya da (c) ?token= sorgu parametresi. (c) şart, çünkü AVPlayer/AsyncImage ve
// <video>/<img> Authorization başlığı gönderemez ama sorgu taşıyabilir.
import { json } from "../functions/api/_utils.js";
import { readSession } from "./auth.js";
import {
  DEFAULT_DRIVE, DEFAULT_SITE, buildKey, extOf, extType, keyFromPath, kindOf, parseKey, safeSlug, thumbKey
} from "./keys.js";
import { bytesPerSec, pace, paceUpload } from "./pace.js";

// Ad çakışmasında sessizce ezmek veri kaybıdır; -1, -2 eklenir. Yalnız dosya
// adı değişir, yol (drive/site) korunur.
async function freeKey(env, key) {
  if (!(await env.MEDIA.head(key))) return key;
  const slash = key.lastIndexOf("/");
  const dir = slash >= 0 ? key.slice(0, slash + 1) : "";
  const name = slash >= 0 ? key.slice(slash + 1) : key;
  const ext = extOf(name);
  const stem = ext ? name.slice(0, name.length - ext.length) : name;
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${dir}${stem}-${i}${ext}`;
    if (!(await env.MEDIA.head(candidate))) return candidate;
  }
  return `${dir}${stem}-${Date.now()}${ext}`;
}

// Bearer başlığı ya da ?token= — sabit zamanlı karşılaştırma.
function tokenOk(request, url, env) {
  const expected = env.ARCHIVE_TOKEN || "";
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : (url.searchParams.get("token") || "");
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function authorized(request, url, env) {
  if (await readSession(request, env)) return true; // web: Google oturumu
  return tokenOk(request, url, env);                 // uygulama / akış: token
}

async function listAll(env) {
  const objects = [];
  let cursor;
  for (;;) {
    const page = await env.MEDIA.list({ cursor, limit: 1000, include: ["customMetadata"] });
    objects.push(...page.objects);
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return objects;
}

function listMedia(objects, drive) {
  const rows = [];
  for (const object of objects) {
    const parts = parseKey(object.key);
    if (!parts) continue;                       // .thumb/ ve tanınmayan şekiller
    if (drive && parts.drive !== drive) continue;
    rows.push({
      key: object.key,
      name: parts.file,
      drive: parts.drive,
      site: parts.site,
      size: object.size,
      mtime: object.uploaded.getTime(),
      kind: kindOf(parts.file),
      source: (object.customMetadata && object.customMetadata.source) || ""
    });
  }
  return rows.sort((a, b) => b.mtime - a.mtime);
}

// If-None-Match birden çok etiket taşıyabilir; "*" her şeyle eşleşir. Zayıf
// önek (W/) karşılaştırmadan önce düşer.
function etagMatches(header, etag) {
  const strip = (t) => t.trim().replace(/^W\//, "");
  if (header.trim() === "*") return true;
  const mine = strip(etag);
  return header.split(",").some((candidate) => strip(candidate) === mine);
}

// "bytes=..." başlığını R2 range seçeneğine çevirir.
function parseRange(header) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || "");
  if (!m || (!m[1] && !m[2])) return null;
  if (m[1] === "") return { suffix: Number(m[2]) };            // bytes=-N (son N)
  const offset = Number(m[1]);
  if (m[2] === "") return { offset };                          // bytes=N-
  return { offset, length: Number(m[2]) - offset + 1 };        // bytes=N-M
}

// Bir anahtarın içeriği asla değişmez: aynı ada ikinci dosya gelirse freeKey()
// yeni bir anahtar üretir, eskisinin baytlarına dokunulmaz. Bu yüzden "immutable"
// dürüst bir söz — tarayıcı bir kez indirdiğini bir daha sormaz. Kaydırırken
// yaşanan takılmanın ve her açılışta yeniden inen ızgaranın sebebi buydu.
const FOREVER = "private, max-age=31536000, immutable";

// share.js de kullanır: token'la gelen public ziyaretçiye aynı akış verilir.
export async function streamMedia(env, key, request, method) {
  const name = key.slice(key.lastIndexOf("/") + 1);
  const inm = request.headers.get("If-None-Match");
  // Sınır varsa akış yavaşlatılır. 304'te gövde zaten yok, oraya dokunulmaz.
  const bps = bytesPerSec(request, new URL(request.url));

  if (method === "HEAD") {
    const head = await env.MEDIA.head(key);
    if (!head) return json({ ok: false, error: "yok" }, 404);
    const headers = new Headers();
    head.writeHttpMetadata(headers);
    if (!headers.get("Content-Type")) headers.set("Content-Type", extType(name));
    headers.set("Content-Length", String(head.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("ETag", head.httpEtag);
    headers.set("Cache-Control", FOREVER);
    return new Response(null, { status: 200, headers });
  }

  // Elindeki sürüm hâlâ geçerliyse tek bayt bile gönderme.
  if (inm) {
    const head = await env.MEDIA.head(key);
    if (head && etagMatches(inm, head.httpEtag)) {
      return new Response(null, {
        status: 304,
        headers: { ETag: head.httpEtag, "Cache-Control": FOREVER }
      });
    }
  }

  const range = parseRange(request.headers.get("Range"));
  const object = await env.MEDIA.get(key, range ? { range } : undefined);
  if (!object) return json({ ok: false, error: "yok" }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.get("Content-Type")) headers.set("Content-Type", extType(name));
  headers.set("Accept-Ranges", "bytes");
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", FOREVER);

  const total = object.size;
  if (range && object.range) {
    let offset = object.range.offset;
    let length = object.range.length;
    if (offset === undefined && object.range.suffix !== undefined) {
      length = object.range.suffix;
      offset = total - length;
    }
    if (offset === undefined) offset = 0;
    if (length === undefined) length = total - offset;
    if (offset >= total) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${total}`);
    headers.set("Content-Length", String(length));
    return new Response(pace(object.body, bps), { status: 206, headers });
  }

  headers.set("Content-Length", String(total));
  return new Response(pace(object.body, bps), { status: 200, headers });
}

/* ------------------------------------------------------------------ toplu */

// Taşıma R2'de yerinde yapılamaz: nesneyi okuyup yeni anahtara yazar, eskisini
// siler. Kişisel ölçekte (tek seferde birkaç düzine dosya) sorun değil ve
// "yanlış siteye düşmüş dosyayı yerine koy" ihtiyacını çözer.
async function moveOne(env, key, drive, site) {
  const parts = parseKey(key);
  if (!parts) return null;
  const target = await freeKey(env, buildKey(drive, site, parts.file));
  if (target === key) return key;
  const object = await env.MEDIA.get(key);
  if (!object) return null;
  await env.MEDIA.put(target, object.body, {
    httpMetadata: object.httpMetadata || { contentType: extType(parts.file) }
  });
  await env.MEDIA.delete(key);
  await env.MEDIA.delete(thumbKey(key));
  return target;
}

async function handleBulk(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "gövde JSON değil" }, 400);
  }
  const keys = Array.isArray(body.keys) ? body.keys.filter((k) => typeof k === "string" && parseKey(k)) : [];
  if (!keys.length) return json({ ok: false, error: "anahtar yok" }, 400);
  if (keys.length > 500) return json({ ok: false, error: "tek seferde en çok 500 dosya" }, 400);

  if (body.action === "delete") {
    for (const key of keys) {
      await env.MEDIA.delete(key);
      await env.MEDIA.delete(thumbKey(key));
    }
    return json({ ok: true, count: keys.length });
  }

  if (body.action === "move") {
    const drive = safeSlug(body.drive, DEFAULT_DRIVE);
    const site = safeSlug(body.site, DEFAULT_SITE);
    const moved = {};
    for (const key of keys) {
      const target = await moveOne(env, key, drive, site);
      if (target) moved[key] = target;
    }
    return json({ ok: true, moved });
  }

  return json({ ok: false, error: "bilinmeyen işlem" }, 400);
}

/* ----------------------------------------------------------------- kapaklar */

// Video ızgarada kapaksız kalıyordu: R2 sadece baytları saklıyor, ilk kareyi
// kimse üretmiyor. Sunucuda ffmpeg yok (Worker), o yüzden kareyi tarayıcı
// yakalıyor ve buraya küçük bir JPEG olarak bırakıyor. Sonraki açılışta ızgara
// videoyu hiç indirmeden kapağı gösteriyor.
async function handleThumb(request, env, url) {
  const key = keyFromPath(url.pathname.slice("/api/thumb/".length));
  if (!key || !parseKey(key)) return json({ ok: false, error: "geçersiz anahtar" }, 400);
  const cacheKey = thumbKey(key);

  if (request.method === "GET") {
    const inm = request.headers.get("If-None-Match");
    if (inm) {
      const head = await env.MEDIA.head(cacheKey);
      if (head && etagMatches(inm, head.httpEtag)) {
        return new Response(null, {
          status: 304,
          headers: { ETag: head.httpEtag, "Cache-Control": FOREVER }
        });
      }
    }
    const object = await env.MEDIA.get(cacheKey);
    if (!object) return json({ ok: false, error: "yok" }, 404);
    return new Response(pace(object.body, bytesPerSec(request, url)), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(object.size),
        "ETag": object.httpEtag,
        "Cache-Control": FOREVER
      }
    });
  }

  if (request.method === "PUT") {
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 400_000) return json({ ok: false, error: "kapak çok büyük" }, 413);
    if (!(await env.MEDIA.head(key))) return json({ ok: false, error: "medya yok" }, 404);
    await env.MEDIA.put(cacheKey, request.body, { httpMetadata: { contentType: "image/jpeg" } });
    return json({ ok: true });
  }

  return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: "GET, PUT" });
}

/* ------------------------------------------------------------------ giriş */

// worker.js buraya /api/media*, /api/thumb/* yollarını yönlendirir.
export async function handleMedia(request, env, url) {
  if (!(await authorized(request, url, env))) {
    return json({ ok: false, error: "yetkisiz" }, 401);
  }
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const method = request.method;

  if (path.startsWith("/api/thumb/")) return handleThumb(request, env, url);

  // Koleksiyon: liste.
  if (path === "/api/media") {
    if (method !== "GET") return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: "GET" });
    const drive = url.searchParams.get("drive");
    return json(listMedia(await listAll(env), drive ? safeSlug(drive, DEFAULT_DRIVE) : ""));
  }

  if (path === "/api/media/bulk") {
    if (method !== "POST") return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: "POST" });
    return handleBulk(request, env);
  }

  // Tekil dosya.
  const rest = path.slice("/api/media/".length);
  const key = keyFromPath(rest);
  if (!key) return json({ ok: false, error: "geçersiz dosya adı" }, 400);

  if (method === "GET" || method === "HEAD") return streamMedia(env, key, request, method);

  if (method === "PUT") {
    // Uygulama tek segment (yalın ad) yollar; yolu sorgudan kurarız. Site
    // verilmezse "Other" — dosya yine görünür, yalnız site sekmesi genel olur.
    const parts = parseKey(key);
    const target = key.includes("/")
      ? key
      : buildKey(url.searchParams.get("drive") || DEFAULT_DRIVE,
                 url.searchParams.get("site") || DEFAULT_SITE,
                 parts.file);
    const finalKey = await freeKey(env, target);
    const leaf = finalKey.slice(finalKey.lastIndexOf("/") + 1);
    // Gövde yavaş okunursa gönderen taraf da yavaşlar: yükleme sınırı böyle işler.
    const body = paceUpload(request, bytesPerSec(request, url));
    // Kaynak etiketi (ör. "r/aww u/xyz" ya da "user niche") arşivde aramayla
    // süzülebilsin diye customMetadata'da saklanır; boşsa yazılmaz.
    const source = (url.searchParams.get("source") || "").trim().slice(0, 200);
    const putOpts = { httpMetadata: { contentType: extType(leaf) } };
    if (source) putOpts.customMetadata = { source };
    await env.MEDIA.put(finalKey, body, putOpts);
    // name alanı eski istemcilerle uyum için duruyor; yenileri key kullanır.
    return json({ ok: true, key: finalKey, name: finalKey }, 201);
  }

  if (method === "DELETE") {
    await env.MEDIA.delete(key);
    await env.MEDIA.delete(thumbKey(key));
    return json({ ok: true });
  }

  return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: "GET, PUT, DELETE" });
}
