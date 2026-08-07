// Cloudflare Worker girişi.
//
// Dört iş yapar:
//  1) /auth/* — Google girişi (auth.js). Site yalnız izinli e-postaya açılır.
//     /auth/app ayrıca iOS uygulamasının WebView'ını token ile içeri alır.
//  2) /s/*    — public paylaşım linkleri. Kasıtlı olarak yetkisiz; token'ın
//     kendisi yetkidir, süre/adet dolunca kapanır (share.js).
//  3) /api/*  — veri uçları. İki kabul yolu: (a) geçerli oturum çerezi (web
//     kullanıcısı Google ile girmiştir) VEYA (b) Bearer ARCHIVE_TOKEN
//     (telefon uygulaması). Böylece uygulama hiç değişmeden çalışır.
//  4) diğer   — statik dosyalar (public/). Oturum yoksa Google giriş sayfası.
//
// İş mantığı functions/api/*.js ve src/*.js içinde; bu dosya onların üstünde
// ince bir yönlendirici.
import { json } from "../functions/api/_utils.js";
import * as health from "../functions/api/health.js";
import * as lists from "../functions/api/lists.js";
import * as config from "../functions/api/config.js";
import { handleMedia } from "./media.js";
import { handleMeta } from "./meta.js";
import { handleShareApi, handleSharePublic } from "./share.js";
import { rateLimit, tooManyRequests } from "./limits.js";
import { APP_VERSION, appLogin, finishLogin, loginPage, logout, readSession, startLogin } from "./auth.js";

const ROUTES = {
  "/api/health": health,
  "/api/lists": lists,
  "/api/config": config
};

// "GET" -> "onRequestGet"
function handlerName(method) {
  return "onRequest" + method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
}

function allowedMethods(route) {
  return Object.keys(route)
    .filter((key) => key.startsWith("onRequest") && key !== "onRequest")
    .map((key) => key.slice("onRequest".length).toUpperCase())
    .sort();
}

// Bearer ARCHIVE_TOKEN (uygulama). Sabit zamanlı.
function bearerOk(request, env) {
  const expected = env.ARCHIVE_TOKEN || "";
  if (!expected) return false;
  const header = request.headers.get("Authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function authorized(request, env) {
  if (await readSession(request, env)) return true; // web: Google oturumu
  return bearerOk(request, env);                     // uygulama: Bearer token
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;

    // 0) İstek sınırı — yetki denetiminden önce, çünkü asıl korumak istediğimiz
    //    şey token'ı ele geçirmiş birinin arşivi toptan çekmesi.
    const retryAfter = rateLimit(request, path);
    if (retryAfter) return tooManyRequests(retryAfter);

    // 1) Kimlik uçları — her zaman açık.
    if (path === "/auth/login") return startLogin(request, env);
    if (path === "/auth/callback") return finishLogin(request, env);
    if (path === "/auth/logout") return logout();
    if (path === "/auth/app") return appLogin(request, env);

    // 2) Public paylaşım — token'la gelen ziyaretçi. Oturum aranmaz.
    if (path.startsWith("/s/")) return handleSharePublic(request, env, url);

    // 3) Medya (R2) — kendi yetki + yöntem yönlendirmesini yapar; akış için
    //    ?token= de kabul eder (AVPlayer/<video> başlık gönderemez).
    if (path === "/api/media" || path.startsWith("/api/media/")
        || path.startsWith("/api/thumb/") || path.startsWith("/api/avatar/")) {
      return handleMedia(request, env, url);
    }

    // 4) Meta ve paylaşım yönetimi — oturum ya da Bearer.
    if (path === "/api/meta" || path === "/api/share" || path.startsWith("/api/share/")) {
      if (!(await authorized(request, env))) {
        return json({ ok: false, error: "yetkisiz" }, 401);
      }
      return path === "/api/meta"
        ? handleMeta(request, env)
        : handleShareApi(request, env, url);
    }

    // 5) API — oturum çerezi ya da Bearer token gerekir.
    const route = ROUTES[path];
    if (route) {
      if (!(await authorized(request, env))) {
        return json({ ok: false, error: "yetkisiz" }, 401);
      }
      const handler = route[handlerName(request.method)] || route.onRequest;
      if (!handler) {
        return json({ ok: false, error: "yöntem desteklenmiyor" }, 405,
          { Allow: allowedMethods(route).join(", ") });
      }
      return handler({
        request, env, params: {}, data: {}, version: APP_VERSION,
        waitUntil: (p) => ctx.waitUntil(p),
        next: () => env.ASSETS.fetch(request)
      });
    }

    if (path.startsWith("/api/")) return json({ ok: false, error: "bilinmeyen uç" }, 404);

    // 6) Statik — yalnız giriş yapmış kullanıcıya. Yoksa Google giriş sayfası.
    if (await readSession(request, env)) return env.ASSETS.fetch(request);
    return loginPage();
  }
};
