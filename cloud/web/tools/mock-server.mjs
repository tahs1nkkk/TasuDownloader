// Arayüzü Cloudflare olmadan denemek için sahte sunucu.
//
// Gerçek Worker'ı yerelde ayağa kaldırmak Supabase anahtarı, R2 kovası ve Google
// OAuth istemcisi ister — arayüzde bir boşluk düzeltmek için fazla pahalı. Bu
// betik public/ klasörünü servis eder ve /api/* uçlarını gerçekçi sahte verilerle
// yanıtlar, böylece düzen, geçişler, diyaloglar ve seçim akışı tarayıcıda
// denenebilir.
//
//   node cloud/web/tools/mock-server.mjs [port]
//
// Üretimle ilgisi yoktur, deploy edilmez.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");
const PORT = Number(process.argv[2] || 8793);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

/* ------------------------------------------------------------- sahte veri */

const SITES = ["RedGifs", "Reddit", "Instagram", "Scrolller", "Coomer", "Other"];
const NOUNS = ["gunes", "deniz", "orman", "kedi", "sokak", "gece", "kahve", "tren", "yagmur", "kar"];

function makeMedia() {
  const rows = [];
  for (let i = 0; i < 137; i += 1) {
    const site = SITES[i % SITES.length];
    const video = i % 3 === 0;
    const name = `${NOUNS[i % NOUNS.length]}-${String(i).padStart(3, "0")}.${video ? "mp4" : "jpg"}`;
    rows.push({
      key: `main/${site}/${name}`,
      name,
      drive: "main",
      site,
      size: (video ? 4_000_000 : 250_000) + i * 9137,
      mtime: Date.now() - i * 3_600_000,
      kind: video ? "video" : "image"
    });
  }
  return rows;
}

function makeLists() {
  const hosts = [
    ["RedGifs", "https://www.redgifs.com/watch/"],
    ["Reddit", "https://www.reddit.com/r/pics/comments/"],
    ["Instagram", "https://www.instagram.com/p/"],
    ["Scrolller", "https://scrolller.com/"],
    ["Coomer", "https://coomer.su/post/"]
  ];
  const lists = [];
  for (let i = 0; i < 9; i += 1) {
    const [label, base] = hosts[i % hosts.length];
    const items = [];
    for (let k = 0; k < 3 + (i * 5) % 17; k += 1) {
      items.push({
        id: `i${i}-${k}`,
        url: `${base}${NOUNS[k % NOUNS.length]}${k}`,
        title: `${NOUNS[k % NOUNS.length]} başlığı ${k}`,
        addedAt: Date.now() - k * 86_400_000
      });
    }
    lists.push({ id: `list-${i}`, name: `${label} listesi ${i + 1}`, items, updatedAt: Date.now() });
  }
  return lists;
}

const MEDIA = makeMedia();
const LISTS = makeLists();
let META = {
  v: 1,
  drives: [
    { id: "main", name: "Tasu Arşiv", accent: "#f59e0b" },
    { id: "dwork", name: "Referanslar", accent: "#38bdf8" }
  ],
  cats: [
    { id: "cfav", drive: "main", name: "Favoriler", color: "#ec4899", parent: null, order: 0 },
    { id: "cman", drive: "main", name: "Manzara", color: "#34d399", parent: null, order: 1 },
    { id: "cman1", drive: "main", name: "Deniz", color: "#38bdf8", parent: "cman", order: 0 },
    { id: "cman2", drive: "main", name: "Orman", color: "#8b5cf6", parent: "cman", order: 1 }
  ],
  items: Object.fromEntries(MEDIA.slice(0, 40).map((m, i) => [m.key, { cat: i % 2 ? "cfav" : "cman1" }])),
  lists: { "list-0": { banner: "grad:#38bdf8,#8b5cf6", accent: "#38bdf8" } },
  listCats: []
};

// Görsel yerine üretilen SVG: gerçek bayt taşımadan ızgara ve görüntüleyici
// denenebilsin diye.
function placeholder(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hash},70%,55%)"/>
      <stop offset="1" stop-color="hsl(${(hash + 70) % 360},70%,35%)"/>
    </linearGradient></defs>
    <rect width="800" height="800" fill="url(#g)"/>
    <text x="400" y="420" font-family="sans-serif" font-size="46" fill="rgba(255,255,255,.85)"
      text-anchor="middle">${name}</text>
  </svg>`;
}

/* ------------------------------------------------------------------ sunucu */

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  if (path === "/api/config") return json(res, { ok: true, version: "1.1" });

  if (path === "/api/meta") {
    if (req.method === "PUT") {
      try { META = JSON.parse(await readBody(req)); } catch { /* yoksay */ }
      return json(res, { ok: true, meta: META });
    }
    return json(res, META);
  }

  if (path === "/api/lists") return json(res, { lists: LISTS, tombstones: [] });

  if (path === "/api/media") {
    const drive = url.searchParams.get("drive") || "main";
    return json(res, MEDIA.filter((m) => m.drive === drive));
  }

  if (path === "/api/media/bulk") return json(res, { ok: true, moved: {} });

  if (path === "/api/share") {
    if (req.method === "POST") return json(res, { ok: true, token: "demo", url: `http://localhost:${PORT}/s/demo` }, 201);
    return json(res, []);
  }

  // Eksik kapak/avatar: 404 değil 204. Hata statüsü olmadığından tarayıcı
  // konsola "Failed to load resource" basmaz; <img> yine error verip üretimi
  // tetikler, fetch de boş gövdeyi "yok" sayar. (Gerçek Worker da böyle döner.)
  if (path.startsWith("/api/thumb/") || path.startsWith("/api/avatar/")) {
    res.writeHead(204, { "Cache-Control": "private, max-age=300" });
    return res.end();
  }

  if (path.startsWith("/api/media/")) {
    if (req.method === "DELETE") return json(res, { ok: true });
    if (req.method === "PUT") return json(res, { ok: true, key: `main/Other/${Date.now()}.jpg` }, 201);
    const name = decodeURIComponent(path.split("/").pop());
    if (/\.(mp4|mov|webm|m4v)$/i.test(name)) return json(res, { ok: false, error: "sahte sunucuda video yok" }, 404);
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" });
    return res.end(placeholder(name));
  }

  if (path.startsWith("/api/")) return json(res, { ok: false, error: "bilinmeyen uç" }, 404);
  if (path.startsWith("/auth/")) { res.writeHead(302, { Location: "/" }); return res.end(); }

  // Statik
  const rel = normalize(path === "/" ? "index.html" : path.replace(/^\/+/, "")).replace(/^(\.\.[/\\])+/, "");
  try {
    const body = await readFile(join(ROOT, rel));
    res.writeHead(200, { "Content-Type": TYPES[extname(rel)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("yok");
  }
});

server.listen(PORT, () => {
  console.log(`Tasu Arşiv sahte sunucusu: http://localhost:${PORT}`);
});
