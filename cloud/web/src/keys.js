// R2 anahtar düzeni — tek yerde tanımlı, hem Worker hem testler kullanır.
//
//   <drive>/<site>/<dosya>   yeni yüklemeler (ör. main/Reddit/kedi.mp4)
//   <dosya>                  eski düz nesneler → main/Other sayılır
//   .thumb/<...>.jpg         video kapak önbelleği (listelerde gizli)
//   .avatar/<kimlik>.jpg     liste öğelerinin profil resmi (listelerde gizli)
//
// Üç parçalı olmasının sebebi: "arşivler" (drive) ve "hangi siteden geldi"
// bilgisi dosya adında yok — MediaNaming yalnız sade bir ad üretiyor. Yolu
// anahtarın kendisine yazınca listeleme tek R2 çağrısıyla ikisini de biliyor,
// ayrı bir veritabanı turu gerekmiyor.

export const DEFAULT_DRIVE = "main";
export const DEFAULT_SITE = "Other";
export const THUMB_PREFIX = ".thumb/";
export const AVATAR_PREFIX = ".avatar/";

// Uygulamanın MediaNaming.site() ürettiği adlar. Bilinmeyen bir etiket de
// kabul edilir (özel arşivler kendi kategorilerini kurabilsin diye).
export const KNOWN_SITES = ["RedGifs", "Reddit", "Instagram", "Scrolller", "Coomer", "Other"];

// Tek yol segmenti: ayraç, "..", gizli/kontrol karakteri reddedilir.
export function safeSegment(raw) {
  let name;
  try {
    name = typeof raw === "string" ? decodeURIComponent(raw) : "";
  } catch {
    return null;
  }
  if (!name || name.length > 180) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  // eslint-disable-next-line no-control-regex
  if (name.startsWith(".") || /[\x00-\x1f<>:"|?*]/.test(name)) return null;
  return name;
}

// Sürücü ve site kimlikleri kısa ve sade tutulur; UI bunları yola yazar.
export function safeSlug(raw, fallback) {
  const name = safeSegment(raw);
  if (!name) return fallback;
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(name)) return fallback;
  return name;
}

export function buildKey(drive, site, file) {
  return `${safeSlug(drive, DEFAULT_DRIVE)}/${safeSlug(site, DEFAULT_SITE)}/${file}`;
}

// R2 anahtarını parçalarına ayırır. Tanımadığı şekle null döner; listeleme
// böylece .thumb/ gibi iç nesneleri kendiliğinden eler.
export function parseKey(key) {
  if (typeof key !== "string" || !key) return null;
  if (key.startsWith(THUMB_PREFIX)) return null;
  const parts = key.split("/");
  if (parts.length === 1) {
    if (!parts[0] || parts[0].startsWith(".")) return null;
    return { drive: DEFAULT_DRIVE, site: DEFAULT_SITE, file: parts[0], legacy: true };
  }
  if (parts.length === 3 && parts.every(Boolean) && !parts.some((p) => p.startsWith("."))) {
    return { drive: parts[0], site: parts[1], file: parts[2], legacy: false };
  }
  return null;
}

// /api/media/<...> kuyruğunu anahtara çevirir. Bir segment = eski düz ad,
// üç segment = drive/site/dosya. Her segment ayrı ayrı doğrulanır.
export function keyFromPath(rest) {
  const parts = String(rest || "").split("/").filter((p) => p.length > 0);
  if (parts.length !== 1 && parts.length !== 3) return null;
  const decoded = parts.map(safeSegment);
  if (decoded.some((p) => p === null)) return null;
  return decoded.join("/");
}

// Kapak önbelleği anahtarı — çakışmasız ve geri izlenebilir.
export function thumbKey(mediaKey) {
  return `${THUMB_PREFIX}${mediaKey.replace(/\//g, "~")}.jpg`;
}

// Liste öğesinin profil resmi anahtarı. Kimlik <site>~<kullanıcı> gibi tek
// segmenttir (uygulama üretir); nokta önekli olduğu için parseKey onu eler ve
// arşiv ızgarasında hiç görünmez — kullanıcı "bulutta dursun ama arşivde
// gözükmesin" dediği için.
export function avatarKey(id) {
  return `${AVATAR_PREFIX}${id}.jpg`;
}

// Avatar kimliği tek güvenli segment olmalı: yol ayracı, "..", nokta öneki ya da
// olağandışı karakter kabul edilmez. Aynı profil (ör. instagram~kedi) birden çok
// listede tek blob paylaşsın diye kimlik sabit tutulur.
export function safeAvatarId(raw) {
  let id;
  try {
    id = typeof raw === "string" ? decodeURIComponent(raw) : "";
  } catch {
    return null;
  }
  if (!id || id.length > 120) return null;
  if (id.startsWith(".") || id.includes("..")) return null;
  if (!/^[A-Za-z0-9._~-]+$/.test(id)) return null;
  return id;
}

const MIME = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".heic": "image/heic", ".avif": "image/avif"
};

export function extOf(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export function extType(name) {
  return MIME[extOf(name)] || "application/octet-stream";
}

export function kindOf(name) {
  const type = MIME[extOf(name)] || "";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  return "other";
}
