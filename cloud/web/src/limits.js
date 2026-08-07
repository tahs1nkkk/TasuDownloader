// İstek sınırı (rate limit).
//
// Amaç: token sızarsa ya da biri adresi bulup üstüne giderse arşivin tamamı
// birkaç dakikada çekilmesin, R2 çıkış faturası patlamasın. Kişisel kullanımda
// hiçbir sınıra değilmez — eşikler bir insanın hızının kat kat üstünde.
//
// Sayaç isolate belleğinde tutuluyor. Bunun anlamı: Cloudflare aynı anda birden
// çok isolate çalıştırırsa gerçek sınır katlanır ve isolate soğuyunca sayaç
// sıfırlanır. Kesin sınır Durable Object ister; o da ayrı bir ücretli parça.
// Buradaki kaba sınır "sızıntıyı yavaşlatma" işini bedavaya görüyor.

const WINDOW_MS = 60_000;
const MAX_TRACKED = 5000;   // bellek tavanı; aşılırsa pencere komple sıfırlanır

// bucket → dakikadaki üst sınır
const LIMITS = {
  read: 900,     // medya akışı, kapak, liste — ızgarada gezinmek çok istek üretir
  write: 150,    // PUT / DELETE / POST
  share: 300,    // /s/<token> public sayfa ve dosyaları
  auth: 30       // /auth/* — parola denemesi yok ama yine de dizginlensin
};

const hits = new Map();

function clientKey(request) {
  return request.headers.get("CF-Connecting-IP")
    || request.headers.get("X-Forwarded-For")
    || "bilinmeyen";
}

export function bucketOf(path, method) {
  if (path.startsWith("/auth/")) return "auth";
  if (path.startsWith("/s/")) return "share";
  if (method === "GET" || method === "HEAD") return "read";
  return "write";
}

/**
 * Sayacı artırır. Sınır aşıldıysa kaç saniye sonra açılacağını döner, aşılmadıysa 0.
 */
export function rateLimit(request, path) {
  const bucket = bucketOf(path, request.method);
  const limit = LIMITS[bucket];
  if (!limit) return 0;

  const now = Date.now();
  if (hits.size > MAX_TRACKED) hits.clear();

  const id = `${bucket}|${clientKey(request)}`;
  const entry = hits.get(id);
  if (!entry || now >= entry.until) {
    hits.set(id, { count: 1, until: now + WINDOW_MS });
    return 0;
  }
  entry.count += 1;
  if (entry.count <= limit) return 0;
  return Math.max(1, Math.ceil((entry.until - now) / 1000));
}

export function tooManyRequests(retryAfter) {
  return new Response(
    JSON.stringify({ ok: false, error: "çok fazla istek", retryAfter }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store"
      }
    }
  );
}
