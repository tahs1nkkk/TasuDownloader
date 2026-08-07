// /api/meta — arşivlerin (drive), kategorilerin ve atamaların tek belgesi.
//
// R2 yalnız baytları ve yolu bilir: main/Reddit/kedi.mp4. "Bu dosya hangi
// kategoride", "bu listenin banner'ı ne", "kaç arşivim var" gibi her şey burada,
// tek bir JSON belgesinde durur. Kişisel arşiv ölçeğinde (birkaç bin kayıt)
// tamamını okuyup yazmak, ilişkisel şema kurmaktan hem hızlı hem sade.
//
// Yazma stratejisi son-yazan-kazanır. Tek kullanıcı, iki ekran; kilit/CRDT
// tiyatro olurdu. Yine de istemcinin gönderdiği şekil doğrulanır — bozuk bir
// belge tüm arşivi görünmez yapabilirdi.
import { json } from "../functions/api/_utils.js";
import { readDoc, writeDoc } from "./docs.js";
import { DEFAULT_DRIVE } from "./keys.js";

const DOC_ID = "archive";
const MAX_DOC_BYTES = 900_000; // Supabase jsonb rahat taşır; kaza eseri şişmeyi keser.

export function defaultMeta() {
  return {
    v: 1,
    drives: [{ id: DEFAULT_DRIVE, name: "Tasu Arşiv", accent: "#f59e0b" }],
    cats: [],
    items: {},
    lists: {},
    listCats: []
  };
}

function str(value, max, fallback = "") {
  return typeof value === "string" && value.length <= max ? value : fallback;
}

function color(value, fallback) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function id(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/.test(value) ? value : null;
}

// İstemciden geleni budayarak alır: bilinmeyen alanlar düşer, kimlikler
// doğrulanır, boyut sınırlanır. Bozuk kayıt sessizce atılır, istek reddedilmez —
// tek bir hatalı satır yüzünden kullanıcının tüm düzeni kaybolmasın.
export function sanitizeMeta(input) {
  const base = defaultMeta();
  if (!input || typeof input !== "object") return base;

  const drives = Array.isArray(input.drives) ? input.drives : [];
  const seenDrives = new Set();
  const cleanDrives = [];
  for (const drive of drives.slice(0, 24)) {
    const driveId = id(drive && drive.id);
    if (!driveId || seenDrives.has(driveId)) continue;
    seenDrives.add(driveId);
    const clean = {
      id: driveId,
      name: str(drive.name, 60, driveId),
      accent: color(drive.accent, "#f59e0b")
    };
    // Kapak görseli arşivin kendi dosyalarından biri: R2 anahtarı olarak saklanır.
    const banner = str(drive.banner, 400);
    if (banner && !banner.startsWith("/")) clean.banner = banner;
    cleanDrives.push(clean);
  }
  if (!cleanDrives.some((d) => d.id === DEFAULT_DRIVE)) {
    cleanDrives.unshift(base.drives[0]);
  }
  base.drives = cleanDrives;

  const cats = Array.isArray(input.cats) ? input.cats : [];
  const seenCats = new Set();
  base.cats = [];
  for (const cat of cats.slice(0, 400)) {
    const catId = id(cat && cat.id);
    if (!catId || seenCats.has(catId)) continue;
    seenCats.add(catId);
    base.cats.push({
      id: catId,
      drive: id(cat.drive) || DEFAULT_DRIVE,
      name: str(cat.name, 60, catId),
      color: color(cat.color, "#8b5cf6"),
      parent: id(cat.parent) || null,
      order: Number.isFinite(cat.order) ? cat.order : 0
    });
  }
  // Kendini ya da olmayan bir kategoriyi ebeveyn gösteren kayıtlar ağacı
  // döngüye sokar; köke çekeriz.
  for (const cat of base.cats) {
    if (cat.parent && (cat.parent === cat.id || !seenCats.has(cat.parent))) cat.parent = null;
  }

  const items = input.items && typeof input.items === "object" ? input.items : {};
  base.items = {};
  for (const [key, value] of Object.entries(items).slice(0, 20000)) {
    if (typeof key !== "string" || key.length > 400 || !value || typeof value !== "object") continue;
    const entry = {};
    const cat = id(value.cat);
    if (cat && seenCats.has(cat)) entry.cat = cat;
    if (value.fav === true) entry.fav = true;
    if (Object.keys(entry).length) base.items[key] = entry;
  }

  const listCats = Array.isArray(input.listCats) ? input.listCats : [];
  const seenListCats = new Set();
  base.listCats = [];
  for (const cat of listCats.slice(0, 200)) {
    const catId = id(cat && cat.id);
    if (!catId || seenListCats.has(catId)) continue;
    seenListCats.add(catId);
    base.listCats.push({
      id: catId,
      name: str(cat.name, 60, catId),
      color: color(cat.color, "#38bdf8")
    });
  }

  const lists = input.lists && typeof input.lists === "object" ? input.lists : {};
  base.lists = {};
  for (const [key, value] of Object.entries(lists).slice(0, 2000)) {
    if (typeof key !== "string" || key.length > 80 || !value || typeof value !== "object") continue;
    const entry = {};
    // banner: "grad:#a,#b" | "media:<r2 anahtarı>" | "https://…"
    const banner = str(value.banner, 400);
    if (/^(grad:#[0-9a-fA-F]{6},#[0-9a-fA-F]{6}|media:[^\s]+|https:\/\/[^\s]+)$/.test(banner)) {
      entry.banner = banner;
    }
    const accent = color(value.accent, "");
    if (accent) entry.accent = accent;
    const cat = id(value.cat);
    if (cat && seenListCats.has(cat)) entry.cat = cat;
    // Listeler sunucuda tek havuzda duruyor (eklenti oraya yazıyor); hangi arşive
    // ait oldukları burada etiketle taşınıyor. Etiketsiz olan "main" sayılır.
    const listDrive = id(value.drive);
    if (listDrive && listDrive !== DEFAULT_DRIVE && seenDrives.has(listDrive)) entry.drive = listDrive;
    if (value.collapsed === true) entry.collapsed = true;
    if (Object.keys(entry).length) base.lists[key] = entry;
  }

  return base;
}

export async function handleMeta(request, env) {
  if (request.method === "GET") {
    try {
      const doc = await readDoc(env, DOC_ID, null);
      return json(doc ? sanitizeMeta(doc) : defaultMeta());
    } catch (error) {
      // Meta olmadan da site çalışmalı: her şey "kategorisiz" görünür.
      return json({ ...defaultMeta(), degraded: String(error.message || error) });
    }
  }

  if (request.method === "PUT") {
    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: "gövde JSON değil" }, 400);
    }
    const clean = sanitizeMeta(payload);
    const size = JSON.stringify(clean).length;
    if (size > MAX_DOC_BYTES) {
      return json({ ok: false, error: `meta çok büyük (${size} bayt)` }, 413);
    }
    try {
      await writeDoc(env, DOC_ID, clean);
    } catch (error) {
      return json({ ok: false, error: String(error.message || error) }, 502);
    }
    return json({ ok: true, meta: clean });
  }

  return json({ ok: false, error: "yöntem desteklenmiyor" }, 405, { Allow: "GET, PUT" });
}
