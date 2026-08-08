// Ortak çekirdek: DOM yardımcıları, API istemcisi, uygulama durumu, site
// kimlikleri, bildirim (toast) ve diyalog altyapısı.
//
// Diyaloglar bilinçli olarak native confirm()/alert() değil: tarayıcının kutusu
// temanın dışında duruyor, mobilde sayfayı donduruyor ve iOS WebView'ında
// bambaşka görünüyordu. Buradaki kutu aynı camdan, aynı butonlarla.

/* --------------------------------------------------------------- DOM ufaklık */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;          // yalnız ICON sabitleri
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const kid of kids.flat(3)) {
    if (kid == null || kid === false || kid === "") continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/* ------------------------------------------------------------------ simgeler */

const S_ = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';

export const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  check: `<svg ${S_} stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>`,
  chevronDown: `<svg ${S_}><path d="M6 9l6 6 6-6"/></svg>`,
  chevronLeft: `<svg ${S_}><path d="M15 5l-7 7 7 7"/></svg>`,
  chevronRight: `<svg ${S_}><path d="M9 5l7 7-7 7"/></svg>`,
  pencil: `<svg ${S_}><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>`,
  x: `<svg ${S_}><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  download: `<svg ${S_}><path d="M12 4v11M7.5 11L12 15.5 16.5 11M5 19h14"/></svg>`,
  share: `<svg ${S_}><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4"/></svg>`,
  trash: `<svg ${S_}><path d="M4 7h16M9.5 7V5h5v2M6.5 7l1 12h9l1-12"/></svg>`,
  plus: `<svg ${S_}><path d="M12 5v14M5 12h14"/></svg>`,
  folder: `<svg ${S_}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  drive: `<svg ${S_}><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>`,
  volume: `<svg ${S_}><path d="M4 9v6h4l5 4V5L8 9zM16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/></svg>`,
  mute: `<svg ${S_}><path d="M4 9v6h4l5 4V5L8 9zM17 10l4 4M21 10l-4 4"/></svg>`,
  expand: `<svg ${S_}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>`,
  pip: `<svg ${S_}><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1"/></svg>`,
  back10: `<svg ${S_}><path d="M11 7H6.5V2.5"/><path d="M6.6 7.1A7.5 7.5 0 1 1 4.6 13"/></svg>`,
  fwd10: `<svg ${S_}><path d="M13 7h4.5V2.5"/><path d="M17.4 7.1A7.5 7.5 0 1 0 19.4 13"/></svg>`,
  search: `<svg ${S_}><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
  sortNew: `<svg ${S_}><path d="M7 4v16M3.5 16.5L7 20l3.5-3.5"/><path d="M13 6h8M13 11h6M13 16h4"/></svg>`,
  sortOld: `<svg ${S_}><path d="M7 20V4M3.5 7.5L7 4l3.5 3.5"/><path d="M13 6h4M13 11h6M13 16h8"/></svg>`,
  sortBig: `<svg ${S_}><path d="M4 6h16M6 12h12M9 18h6"/></svg>`,
  sortName: `<svg ${S_}><path d="M4 18l4-11 4 11M5.4 14.5h5.2"/><path d="M15 8h5l-5 8h5"/></svg>`,
  image: `<svg ${S_}><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l4.8-4.6a2 2 0 0 1 2.7 0L20 19"/></svg>`,
  video: `<svg ${S_}><rect x="3" y="6" width="12.5" height="12" rx="2.5"/><path d="M15.5 11l5.5-3.2v8.4L15.5 13z"/></svg>`,
  sun: `<svg ${S_}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg>`,
  moon: `<svg ${S_}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>`,
  contrast: `<svg ${S_}><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>`,
  gear: `<svg ${S_}><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8l1.4 2.6 2.9-.5 1 2.8 2.6 1.4-1.3 2.6 1.3 2.6-2.6 1.4-1 2.8-2.9-.5L12 21.2l-1.4-2.6-2.9.5-1-2.8-2.6-1.4L5.4 12 4.1 9.4l2.6-1.4 1-2.8 2.9.5z"/></svg>`,
  gauge: `<svg ${S_}><path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4.2-5"/></svg>`,
  pin: `<svg ${S_}><path d="M12 21s6.5-6.1 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 14.9 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.4"/></svg>`
};

/* ---------------------------------------------------------------- biçimleme */

export function fmtBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/* ------------------------------------------------------------ bağlantı adı */

// Kaydedilen bağlantıların ham URL'si listede okunmuyordu: yan yana on tane
// "instagram.com/p/DAbC..." satırı hangisinin ne olduğunu söylemiyor. Burada
// bağlantı adrese bakılarak adlandırılıyor — profilse kullanıcı adı, gönderiyse
// "kullanıcı | gönderi türü".
//
// Adres her şeyi söylemiyorsa (Instagram'ın /p/<kod> biçiminde kullanıcı adı
// yok) eklentinin kaydettiği başlığa düşülüyor, o da yoksa yola.
const KIND_TR = { post: "post", reels: "reels", story: "story", video: "video", gallery: "galeri" };

function label(user, kind) {
  if (user && kind) return `${user} | ${KIND_TR[kind] || kind}`;
  return user || (kind ? KIND_TR[kind] || kind : "");
}

function parseLink(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return ""; }
  const host = parsed.hostname.replace(/^www\./, "");
  const parts = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;

  if (/instagram\.com$/i.test(host)) {
    if (a === "stories") return label(b ? `@${b}` : "", "story");
    if (a === "p" || a === "tv") return label("", "post");
    if (a === "reel" || a === "reels") return label("", "reels");
    if (!a || ["explore", "direct", "accounts"].includes(a)) return "";
    // instagram.com/<kullanıcı>/p/<kod> biçiminde ikisi birden var.
    if (b === "p" || b === "tv") return label(`@${a}`, "post");
    if (b === "reel" || b === "reels") return label(`@${a}`, "reels");
    return `@${a}`;
  }

  if (/reddit\.com$|redd\.it$/i.test(host)) {
    if (a === "user" || a === "u") return b ? label(`u/${b}`, c === "comments" ? "post" : "") : "";
    if (a === "r" && b) return c === "comments" ? label(`r/${b}`, "post") : `r/${b}`;
    return "";
  }

  if (/redgifs\.com$/i.test(host)) {
    if (a === "users" && b) return c === "watch" ? label(`@${b}`, "video") : `@${b}`;
    if (a === "watch" && b) return label("", "video");
    return "";
  }

  if (/scrolller\.com$/i.test(host)) {
    if (a === "r" && b) return `r/${b}`;
    if (a === "u" && b) return `@${b}`;
    return "";
  }

  if (/coomer\.|kemono\./i.test(host)) {
    // /<servis>/user/<kullanıcı>[/post/<id>]
    if (b === "user" && c) return parts[3] === "post" ? label(`@${c}`, "post") : `@${c}`;
    return "";
  }

  return "";
}

// Listede gösterilecek ad. Sırayla: adresten çıkarılan ad → kaydedilen başlık →
// yolun son parçası → ham adres.
export function linkLabel(url, title = "") {
  const named = parseLink(url);
  if (named) return named;
  const clean = String(title || "").trim();
  if (clean && clean !== url) return clean;
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function encKey(key) {
  return String(key).split("/").map(encodeURIComponent).join("/");
}

export const mediaURL = (key) => `/api/media/${encKey(key)}`;
export const thumbURL = (key) => `/api/thumb/${encKey(key)}`;

/* ------------------------------------------------------- profil resmi (avatar) */

// Telefon, listeye eklenen profillerin resmini `.avatar/<kimlik>.jpg` altına
// bırakıyor; web bunları hiç aramıyordu, o yüzden arşivde satırlar hep sitenin
// jenerik işaretinde kalıyordu ("kullanıcı simgeleri gözükmüyor").
//
// Kimlik kuralı uygulamanın `AvatarIdentity.key`'iyle BİREBİR aynı olmak
// zorunda: bir harf bile kayarsa web, telefonun yüklediği blob'u hiç bulamaz.
// Biçim `<site>~<kullanıcı>`, küçük harf, yalnız Worker'ın `safeAvatarId`
// kabul ettiği karakterler.
function avatarSanitize(raw) {
  return String(raw || "").replace(/[^A-Za-z0-9._~-]/g, "").replace(/^\.+/, "");
}

export function avatarId(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { return ""; }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const [a = "", b = "", c = ""] = parsed.pathname.split("/").filter(Boolean)
    .map((part) => { try { return decodeURIComponent(part); } catch { return part; } });

  let site = "";
  let user = "";
  if (host.endsWith("instagram.com")) {
    site = "instagram";
    const reserved = ["p", "tv", "reel", "reels", "stories", "explore", "direct", "accounts", "s"];
    if (a === "stories") user = b;
    else if (a && !reserved.includes(a)) user = a;               // instagram.com/<kullanıcı>[/…]
  } else if (host.endsWith("reddit.com") || host.endsWith("redd.it")) {
    site = "reddit";
    if (a === "user" || a === "u") user = b;
    else if (a === "r" && b) user = `r-${b}`;                     // topluluk ikonu
  } else if (host.endsWith("redgifs.com")) {
    site = "redgifs";
    user = a === "users" ? b : "";
  } else if (host.endsWith("scrolller.com")) {
    site = "scrolller";
    if (a === "u") user = b;
    else if (a === "r" && b) user = `r-${b}`;
  } else if (host.includes("coomer.") || host.includes("kemono.")) {
    site = host.includes("kemono.") ? "kemono" : "coomer";
    user = b === "user" ? c : "";                                 // /<servis>/user/<kullanıcı>
  } else {
    return "";
  }

  const clean = avatarSanitize(user);
  return clean ? avatarSanitize(`${site}~${clean}`).toLowerCase() : "";
}

export const avatarURL = (id) => `/api/avatar/${encodeURIComponent(id)}`;

/* ----------------------------------------------------------- bant genişliği */

// Sınır sunucuda uygulanıyor (src/pace.js), ama seçim burada yapılıyor ve
// cihazda kalıyor — masaüstünde 100 Mbps, telefonda hücresel veride 5 Mbps
// istemek makul.
//
// İndirme sınırı çerezle gidiyor: <img> ve <video> istekleri başlık taşıyamıyor,
// adrese parametre eklemek ise her sınır değişikliğinde tarayıcı önbelleğini
// çöpe atardı. Yükleme sınırı XHR'ın kendi başlığıyla gidiyor ve indirme
// çerezini bilerek eziyor, yoksa yükleme de indirme hızına takılırdı.
export const BW_FREE = 1000;       // bu değer ve üstü "sınırsız"

const bwClean = (value) => {
  const n = Math.round(Number(value) || 0);
  return n >= 1 && n < BW_FREE ? n : 0;
};

export function bwGet() {
  return {
    down: bwClean(localStorage.getItem("tasu.bw.down")),
    up: bwClean(localStorage.getItem("tasu.bw.up"))
  };
}

export function bwSet(down, up) {
  const clean = { down: bwClean(down), up: bwClean(up) };
  localStorage.setItem("tasu.bw.down", String(clean.down));
  localStorage.setItem("tasu.bw.up", String(clean.up));
  bwCookie();
  return clean;
}

export function bwCookie() {
  const { down } = bwGet();
  const life = down ? "max-age=31536000" : "max-age=0";
  document.cookie = `tasu_bw=${down}; path=/; ${life}; SameSite=Lax`;
}

// Yükleme isteklerine eklenecek başlık. Sınırsızken de gönderilir: "0" indirme
// çerezini iptal eder.
export function bwUploadHeaders() {
  return { "X-Tasu-Bw": String(bwGet().up) };
}

/* ---------------------------------------------------------------------- API */

async function request(path, options) {
  const res = await fetch(path, { credentials: "same-origin", ...options });
  if (res.status === 401) {
    // Oturum düşmüş: sayfada kalıp 401 yığmak yerine girişe dön.
    location.replace("/auth/login");
    throw new Error("oturum sona erdi");
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) {
    const err = new Error((data && data.error) || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const jsonInit = (method, body) => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});

export const api = {
  get: (path) => request(path),
  put: (path, body) => request(path, jsonInit("PUT", body)),
  post: (path, body) => request(path, jsonInit("POST", body)),
  del: (path) => request(path, { method: "DELETE" })
};

/* ------------------------------------------------------------ site kimlikleri */

// Her sitenin kendi çizilmiş işareti var. İki harflik kısaltmalar ("RG", "IG")
// küçük boyutta okunmuyordu; sekmede aranan şey okumak değil tanımak.
// İşaretler tek renk (marka rengi) ve 24×24 kutuda — sekmede küçük, arka planda
// bulanıklaştırılmış büyük hâliyle kullanılıyor.
function logo(body, size = 24) {
  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

const MARKS = {
  // RedGifs: yuvarlak köşeli kare içinde oynat üçgeni — "kısa video" fikri.
  RedGifs: logo('<rect x="1.5" y="3.5" width="21" height="17" rx="5" fill="#ff2d55"/>'
    + '<path d="M10 8.6l6 3.4-6 3.4z" fill="#fff"/>'),
  // Reddit: yuvarlak yüz, anten ve iki göz.
  Reddit: logo('<circle cx="12" cy="13.5" r="7.6" fill="#ff4500"/>'
    + '<circle cx="17.4" cy="4.6" r="2" fill="#ff4500"/>'
    + '<path d="M12 6.4l1.2-4 3.4.9" stroke="#ff4500" stroke-width="1.6" fill="none" stroke-linecap="round"/>'
    + '<circle cx="9.2" cy="13" r="1.5" fill="#fff"/><circle cx="14.8" cy="13" r="1.5" fill="#fff"/>'
    + '<path d="M8.8 16.6c1.9 1.5 4.5 1.5 6.4 0" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>'),
  // Instagram: köşeli kare çerçeve + objektif + vizör noktası.
  Instagram: logo('<rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.6" fill="none" stroke="#e1306c" stroke-width="2.1"/>'
    + '<circle cx="12" cy="12" r="4.3" fill="none" stroke="#e1306c" stroke-width="2.1"/>'
    + '<circle cx="17.4" cy="6.6" r="1.5" fill="#e1306c"/>'),
  // Scrolller: aşağı akan çift ok — sonsuz kaydırma.
  Scrolller: logo('<rect x="1.5" y="3.5" width="21" height="17" rx="5" fill="#2b5cff"/>'
    + '<path d="M8.4 8.8L12 12.2l3.6-3.4M8.4 13.4L12 16.8l3.6-3.4" stroke="#fff" stroke-width="2"'
    + ' fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
  // Coomer: açık halka "C".
  Coomer: logo('<path d="M17.6 6.8a7.6 7.6 0 1 0 0 10.4" stroke="#16c79a" stroke-width="3.2"'
    + ' fill="none" stroke-linecap="round"/>'),
  // Diğer: klasör.
  Other: logo('<path d="M2.8 6.4a2 2 0 0 1 2-2h4.1l2 2.2h8.3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4.8a2 2 0 0 1-2-2z"'
    + ' fill="#8b93a3"/>'),
  // Tümü: dört uçlu parıltı.
  All: logo('<path d="M12 2.4l2.3 6.2 6.3 2.3-6.3 2.3-2.3 6.4-2.3-6.4-6.3-2.3 6.3-2.3z" fill="#f59e0b"/>'
    + '<circle cx="19.4" cy="18.4" r="1.9" fill="#ec4899"/>')
};

// Sekmenin arka planı, işaretin bulanıklaştırılmış büyük hâli. CSS'e data URI
// olarak veriliyor; harici istek yok, katı same-origin kuralı bozulmuyor.
function dataURI(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const SITES = {
  RedGifs:   { grad: "linear-gradient(135deg,#ff2d55,#ff7a45)", glow: "#ff2d55", mark: MARKS.RedGifs },
  Reddit:    { grad: "linear-gradient(135deg,#ff4500,#ff8717)", glow: "#ff4500", mark: MARKS.Reddit },
  Instagram: { grad: "linear-gradient(135deg,#f9ce34,#ee2a7b 52%,#6228d7)", glow: "#ee2a7b", mark: MARKS.Instagram },
  Scrolller: { grad: "linear-gradient(135deg,#00c6ff,#2b5cff)", glow: "#2b5cff", mark: MARKS.Scrolller },
  Coomer:    { grad: "linear-gradient(135deg,#16c79a,#0e9f6e)", glow: "#16c79a", mark: MARKS.Coomer },
  Other:     { grad: "linear-gradient(135deg,#6b7280,#3f4653)", glow: "#6b7280", mark: MARKS.Other }
};

export const ALL_SITE = {
  grad: "linear-gradient(115deg,#fbbf24,#ec4899 55%,#8b5cf6)", glow: "#ec4899", mark: MARKS.All
};

for (const brand of [...Object.values(SITES), ALL_SITE]) brand.bg = dataURI(brand.mark);

export function siteBrand(site) { return SITES[site] || SITES.Other; }

export const PALETTE = [
  "#f59e0b", "#ec4899", "#8b5cf6", "#38bdf8", "#34d399",
  "#f4525f", "#facc15", "#22d3ee", "#a78bfa", "#fb7185"
];

/* -------------------------------------------------------------------- durum */

export const S = {
  version: "1.1",
  drive: "main",
  meta: { v: 1, drives: [{ id: "main", name: "Tasu Arşiv", accent: "#f59e0b" }], cats: [], items: {}, lists: {}, listCats: [] },
  media: [],        // geçerli arşivin tüm dosyaları
  lists: [],        // /api/lists anlık görüntüsü
  listTombstones: [], // silinen listelerin mezar taşları (iOS ile aynı snapshot)
  view: "media",
  site: "",         // "" = Tümü
  cat: "",          // "" = hepsi
  openCats: new Set(),
  sort: "new",      // new | old | big | name
  kind: "",         // "" = hepsi | image | video
  query: "",
  listQuery: "",
  listSite: "",     // liste görünümünde site süzgeci
  selecting: false, // türetilmiş: picked boş değilse true
  picked: new Set()
};

export function newId(prefix) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

// "2026-07-27T12:34:56Z" — iOS'un düz ISO8601DateFormatter'ı kesirli saniyeyi
// (toISOString'in eklediği .123) çözemez; bir öğe bile uyumsuzsa uygulama tüm
// uzak snapshot'ı atıp kendi halini geri yazar. Bu yüzden milisaniyeyi kırpıyoruz.
export function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Meta yazımı gecikmeli: renk seçicide her tıklamada Supabase'e gitmek yerine
// kullanıcı durunca tek istek. Aynı anda birden çok değişiklik birleşir.
let metaTimer = null;
let metaPending = null;

export function saveMeta(immediate = false) {
  clearTimeout(metaTimer);
  const flush = async () => {
    metaPending = null;
    try {
      await api.put("/api/meta", S.meta);
    } catch (error) {
      toast(`Ayar kaydedilemedi: ${error.message}`, "err");
    }
  };
  if (immediate) return flush();
  metaPending = flush;
  metaTimer = setTimeout(flush, 500);
  return Promise.resolve();
}

// Sekme kapanırken bekleyen yazıyı kaçırmayalım.
window.addEventListener("pagehide", () => { if (metaPending) metaPending(); });

/* ---------------------------------------------------------------- bildirim */

export function toast(message, kind = "") {
  const host = $("#toasts");
  if (!host) return;
  const node = el("div", { class: `toast ${kind}` }, el("i", { class: "tdot" }), el("span", {}, message));
  host.append(node);
  setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 240);
  }, kind === "err" ? 4200 : 2600);
}

/* ----------------------------------------------------------------- diyalog */

/**
 * Site içi diyalog. buttons: [{ label, kind, value, run }]
 *  - value : tıklanınca sözü bu değerle kapatır
 *  - run   : async fonksiyon; undefined dönerse kutu açık kalır
 * build(box, close) ile gövdeye alan eklenebilir.
 */
export function dialog({ title, text, build, buttons = [], dismissable = true }) {
  return new Promise((resolve) => {
    const host = $("#dialogs");
    const box = el("div", { class: "dialog", role: "dialog", "aria-modal": "true" });
    if (title) box.append(el("h3", {}, title));
    if (text) box.append(el("p", {}, text));

    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      host.classList.remove("on");
      clear(host);
      resolve(value);
    };

    const onKey = (event) => {
      if (event.key === "Escape" && dismissable) { event.stopPropagation(); close(null); }
    };

    if (build) build(box, close);

    if (buttons.length) {
      const row = el("div", { class: "row" });
      for (const button of buttons) {
        row.append(el("button", {
          class: `vbtn ${button.kind || ""}`,
          type: "button",
          onclick: async (event) => {
            const target = event.currentTarget;
            if (button.run) {
              target.disabled = true;
              try {
                const value = await button.run(box, close);
                if (value !== undefined) close(value);
              } finally { target.disabled = false; }
            } else {
              close(button.value);
            }
          }
        }, button.label));
      }
      box.append(row);
    }

    clear(host);
    host.append(box);
    host.classList.add("on");
    host.onclick = (event) => { if (event.target === host && dismissable) close(null); };
    document.addEventListener("keydown", onKey, true);

    const focusable = box.querySelector("input, select, button");
    if (focusable) setTimeout(() => focusable.focus(), 60);
  });
}

export function confirmBox(title, text, okLabel = "Evet", danger = false) {
  return dialog({
    title, text,
    buttons: [
      { label: "Vazgeç", value: false },
      { label: okLabel, kind: danger ? "danger" : "primary", value: true }
    ]
  }).then((value) => value === true);
}

export function promptBox(title, label, initial = "", placeholder = "") {
  let input;
  return dialog({
    title,
    build: (box, close) => {
      input = el("input", { type: "text", value: initial, placeholder, maxlength: 60 });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); close(input.value.trim() || null); }
      });
      box.append(el("label", { class: "f" }, el("span", {}, label), input));
    },
    buttons: [
      { label: "Vazgeç", value: null },
      { label: "Tamam", kind: "primary", run: () => input.value.trim() || null }
    ]
  });
}

/* ------------------------------------------------------------------ perde */

// Çekmece/örtü tek yerden yönetilsin: iki farklı modül aynı perdeyi açıp
// kapatınca hangisinin kapatacağı belirsizleşiyordu.
let scrimHandler = null;

export function showScrim(onClose) {
  const scrim = $("#scrim");
  scrimHandler = onClose;
  scrim.hidden = false;
  scrim.onclick = () => { if (scrimHandler) scrimHandler(); };
}

export function hideScrim() {
  const scrim = $("#scrim");
  scrimHandler = null;
  scrim.hidden = true;
  scrim.onclick = null;
}
