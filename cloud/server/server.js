/*
 * TasuDownloader medya sunucusu — telefonun "bulutu", senin PC'n.
 *
 * Sıfır bağımlılık: sadece node:http/fs/path/crypto. `npm install` yok,
 * `node server.js` ile ayağa kalkar. İnternete Tailscale Funnel üzerinden
 * çıkar (bkz. README.md) — port yönlendirme, güvenlik duvarı deliği, alan adı
 * gerekmez.
 *
 * Güvenlik duruşu (discord-bot'taki MEDIA_PULLER planıyla aynı ilkeler):
 *  - Her uç token ister; karşılaştırma sabit zamanlı.
 *  - Dosya adları tek segmenttir: ayraç, "..", kontrol karakteri reddedilir.
 *  - Yerel yollar ve kullanıcı adı hiçbir yanıtta yer almaz.
 *  - Dosyalar RAM'e alınmaz; yükleme ve indirme stream'dir.
 */
const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

// Ayarlar config.json'dan gelir (yanında config.example.json var); ortam
// değişkeni her alanı ezebilir.
let fileConfig = {};
try {
  fileConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
} catch {
  // config.json yoksa yalnız ortam değişkenleriyle de çalışır.
}
const TOKEN = process.env.TASU_TOKEN || fileConfig.token || "";
const PORT = Number(process.env.TASU_PORT || fileConfig.port || 8790);
const MEDIA_DIR = path.resolve(process.env.TASU_DIR || fileConfig.dir || path.join(__dirname, "media"));
const CORS_ORIGIN = process.env.TASU_CORS_ORIGIN || fileConfig.corsOrigin || "*";

if (!TOKEN || TOKEN.length < 24) {
  console.error("HATA: en az 24 karakterlik bir token gerekli.");
  console.error("Üretmek için (PowerShell):");
  console.error("  [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))");
  console.error("Sonra config.example.json'u config.json olarak kopyalayıp içine yapıştır.");
  process.exit(1);
}
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const MIME = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".heic": "image/heic", ".avif": "image/avif"
};
const kindOf = (name) => {
  const type = MIME[path.extname(name).toLowerCase()] || "";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  return "other";
};

function tokenOk(req, url) {
  const header = req.headers.authorization || "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : (url.searchParams.get("token") || "");
  const a = Buffer.from(presented);
  const b = Buffer.from(TOKEN);
  // timingSafeEqual eşit uzunluk ister; uzunluk farkını da sabit zamanlı
  // kalacak biçimde ele al.
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Tek dosya adı segmenti: yol ayracı, "..", gizli/dev karakterleri yok.
function safeName(raw) {
  let name;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!name || name.length > 180) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (name.startsWith(".") || /[\x00-\x1f<>:"|?*]/.test(name)) return null;
  return name;
}

// Ad çakışmasında sessizce ezmek veri kaybıdır; -1, -2 eklenir.
function freeName(name) {
  if (!fs.existsSync(path.join(MEDIA_DIR, name))) return name;
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 1; i < 1000; i += 1) {
    const candidate = `${stem}-${i}${ext}`;
    if (!fs.existsSync(path.join(MEDIA_DIR, candidate))) return candidate;
  }
  return `${stem}-${Date.now()}${ext}`;
}

function sendJson(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!tokenOk(req, url)) {
    sendJson(res, 401, { ok: false, error: "geçersiz token" });
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      const entries = await fsp.readdir(MEDIA_DIR);
      let freeBytes = null;
      try {
        const stats = await fsp.statfs(MEDIA_DIR);
        freeBytes = stats.bavail * stats.bsize;
      } catch {
        // statfs her platformda olmayabilir; boş alan raporu opsiyonel.
      }
      sendJson(res, 200, { ok: true, files: entries.length, freeBytes });
      return;
    }

    if (req.method === "GET" && url.pathname === "/files") {
      const entries = await fsp.readdir(MEDIA_DIR);
      const files = [];
      for (const name of entries) {
        const stat = await fsp.stat(path.join(MEDIA_DIR, name)).catch(() => null);
        if (!stat || !stat.isFile()) continue;
        files.push({ name, size: stat.size, mtime: stat.mtimeMs, kind: kindOf(name) });
      }
      files.sort((a, b) => b.mtime - a.mtime);
      sendJson(res, 200, files);
      return;
    }

    const fileMatch = url.pathname.match(/^\/files\/(.+)$/);
    if (fileMatch) {
      const name = safeName(fileMatch[1]);
      if (!name) {
        sendJson(res, 400, { ok: false, error: "geçersiz dosya adı" });
        return;
      }

      if (req.method === "PUT") {
        const finalName = freeName(name);
        const finalPath = path.join(MEDIA_DIR, finalName);
        const tempPath = `${finalPath}.part`;
        const out = fs.createWriteStream(tempPath);
        req.pipe(out);
        await new Promise((resolve, reject) => {
          out.on("finish", resolve);
          out.on("error", reject);
          req.on("error", reject);
        });
        await fsp.rename(tempPath, finalPath);
        sendJson(res, 201, { ok: true, name: finalName });
        return;
      }

      const filePath = path.join(MEDIA_DIR, name);
      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat || !stat.isFile()) {
        sendJson(res, 404, { ok: false, error: "yok" });
        return;
      }

      if (req.method === "DELETE") {
        await fsp.unlink(filePath);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "GET" || req.method === "HEAD") {
        const type = MIME[path.extname(name).toLowerCase()] || "application/octet-stream";
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
        // Range desteği videonun içinde gezinmeyi (seek) mümkün kılar;
        // AVPlayer onsuz baştan sona akıtmak zorunda kalır.
        if (range && (range[1] || range[2])) {
          const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
          if (start > end || start >= stat.size) {
            res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
            res.end();
            return;
          }
          res.writeHead(206, {
            "Content-Type": type,
            "Content-Length": end - start + 1,
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes"
          });
          if (req.method === "HEAD") { res.end(); return; }
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }
        res.writeHead(200, {
          "Content-Type": type,
          "Content-Length": stat.size,
          "Accept-Ranges": "bytes"
        });
        if (req.method === "HEAD") { res.end(); return; }
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    sendJson(res, 404, { ok: false, error: "bilinmeyen uç" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error && error.message) });
  }
});

server.listen(PORT, () => {
  console.log(`TasuDownloader medya sunucusu: http://localhost:${PORT}`);
  console.log(`Depo klasörü: ${MEDIA_DIR}`);
  console.log("İnternete açmak için: tailscale funnel --bg " + PORT);
});
