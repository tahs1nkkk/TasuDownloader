#!/usr/bin/env node
// Uygulama ve site ikonlarını üretir.
//
// Neden çizim kodu, neden hazır PNG değil: bu depoda ikili dosya tutmak
// istemiyoruz ve elimizde tasarım aracı yok. İkon burada matematikle
// tanımlanıyor — mesafe fonksiyonları (SDF) ile şekiller, 3×3 üst örnekleme ile
// kenar yumuşatma, sonra zlib ile PNG. Hiçbir bağımlılık yok, Node yeter.
//
// Çıktılar:
//   ios-app/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png  1024²
//   cloud/web/public/icon-180.png   apple-touch-icon (iOS ana ekran)
//   cloud/web/public/icon-192.png   manifest
//   cloud/web/public/icon-512.png   manifest
//   cloud/web/public/favicon.png    32² sekme simgesi
//
// Çalıştır: node scripts/make-icons.js

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ------------------------------------------------------------ PNG yazıcı */

function crc32(buffer) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

// rgba: Uint8Array, size*size*4
function encodePNG(rgba, size) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;                                   // filter: none
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit derinliği
  ihdr[9] = 6;    // renk tipi: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* -------------------------------------------------------- mesafe alanları */
// Tüm koordinatlar 0..1 birim karede. Negatif mesafe = şeklin içi.

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(dx, dy), 0) - r;
}

function sdCapsule(px, py, ax, ay, bx, by, r) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denom = bax * bax + bay * bay || 1e-9;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / denom));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

function sdCircle(px, py, cx, cy, r) {
  return Math.hypot(px - cx, py - cy) - r;
}

// Üçgen: üç yarı-düzlemin kesişimi (köşeler saat yönünde verilmeli).
function sdTriangle(px, py, tri) {
  let d = -Infinity;
  for (let i = 0; i < 3; i += 1) {
    const [ax, ay] = tri[i];
    const [bx, by] = tri[(i + 1) % 3];
    const ex = bx - ax;
    const ey = by - ay;
    const len = Math.hypot(ex, ey) || 1e-9;
    // sol normal
    const nx = ey / len;
    const ny = -ex / len;
    d = Math.max(d, (px - ax) * nx + (py - ay) * ny);
  }
  return d;
}

const smooth = (edge, d) => Math.min(1, Math.max(0, 0.5 - d / edge));

/* ---------------------------------------------------------------- çizim */

// Kehribar → fuşya → mor. Sitedeki --grad ile aynı üçlü.
const STOPS = [
  [0.00, [255, 208, 92]],
  [0.22, [251, 172, 60]],
  [0.55, [238, 74, 140]],
  [0.86, [139, 92, 246]],
  [1.00, [86, 66, 205]]
];

function gradient(t) {
  const u = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i += 1) {
    if (u <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const k = (u - t0) / (t1 - t0 || 1);
      return [0, 1, 2].map((n) => c0[n] + (c1[n] - c0[n]) * k);
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/**
 * Tek bir noktanın rengini döner: [r,g,b,a] 0..255.
 * @param {number} x 0..1
 * @param {number} y 0..1
 * @param {number} edge kenar yumuşatma genişliği (piksel boyutu cinsinden)
 * @param {boolean} rounded köşeler yuvarlansın mı (iOS kendi maskesini uygular)
 */
function shade(x, y, edge, rounded) {
  // 1) zemin
  const plate = rounded ? sdRoundRect(x, y, 0.5, 0.5, 0.5, 0.5, 0.2237) : -1;
  const alpha = rounded ? smooth(edge, plate) : 1;
  if (alpha <= 0) return [0, 0, 0, 0];

  const [gr, gg, gb] = gradient((x * 0.62 + y * 0.38));

  // Sol üstten gelen yumuşak ışık, sağ altta koyulaşma: düz gradyan yassı
  // duruyordu, ikonun hacmi olsun.
  const lift = Math.max(0, 1 - Math.hypot(x - 0.26, y - 0.2) * 1.35) ** 2;
  const sink = Math.max(0, 1 - Math.hypot(x - 0.86, y - 0.9) * 1.5) ** 2;
  let r = gr + 46 * lift - 34 * sink;
  let g = gg + 40 * lift - 30 * sink;
  let b = gb + 30 * lift - 26 * sink;

  // 2) çapraz cam parlaması — sol üstten sağ alta geçen geniş bir bant.
  //    Düz gradyan cansız duruyordu; bu bant ikona yüzey hissi veriyor.
  const sweep = Math.exp(-((x * 0.7 + y * 0.7 - 0.52) ** 2) / 0.018) * 0.10;
  r += (255 - r) * sweep;
  g += (255 - g) * sweep;
  b += (255 - b) * sweep;

  // 3) tepsi — arşiv. Dolu kutu değil, üstü açık bir "U": dış yuvarlak
  //    dikdörtgenden iç boşluğu çıkarıyoruz, iç boşluk yukarı doğru taşıyor ki
  //    üst kenar hiç çizilmesin.
  const trayOuter = sdRoundRect(x, y, 0.5, 0.695, 0.285, 0.145, 0.068);
  const trayInner = sdRoundRect(x, y, 0.5, 0.605, 0.215, 0.145, 0.036);
  const tray = Math.max(trayOuter, -trayInner);
  const inTray = smooth(edge, tray);
  const inWell = smooth(edge, Math.max(trayInner, trayOuter));   // tepsinin içi

  // Tepsinin içi hafif koyu (derinlik), duvarları beyaz.
  r *= 1 - inWell * 0.13;
  g *= 1 - inWell * 0.13;
  b *= 1 - inWell * 0.13;
  r += (255 - r) * inTray;
  g += (255 - g) * inTray;
  b += (255 - b) * inTray;

  // 4) indirme oku — gövde + uç, ucu tepsinin ağzına değiyor.
  const shaft = sdCapsule(x, y, 0.5, 0.205, 0.5, 0.40, 0.055);
  const head = sdTriangle(x, y, [[0.325, 0.375], [0.675, 0.375], [0.5, 0.585]]);
  const arrow = Math.min(shaft, head);
  const inArrow = smooth(edge, arrow);
  r += (255 - r) * inArrow;
  g += (255 - g) * inArrow;
  b += (255 - b) * inArrow;

  // 5) okun altında yumuşak bir ışık — tepsinin ağzına düşen aydınlık.
  //    Silüete hiç dokunmayan tek "detay" türü bu: iki nokta ve iki hız çizgisi
  //    denendi, 60 pikselde ikisi de kulak/göz gibi okunuyordu.
  const halo = Math.max(0, 1 - Math.hypot((x - 0.5) * 1.5, (y - 0.60) * 2.2) * 2.4) ** 2;
  const bleed = halo * (1 - inArrow) * 0.30;
  r += (255 - r) * bleed;
  g += (255 - g) * bleed;
  b += (255 - b) * bleed;

  const clamp = (v) => Math.round(Math.min(255, Math.max(0, v)));
  return [clamp(r), clamp(g), clamp(b), Math.round(alpha * 255)];
}

function render(size, rounded) {
  const rgba = new Uint8Array(size * size * 4);
  const SS = 3;                       // 3×3 üst örnekleme
  const edge = 1.4 / size;            // kenar yumuşatma bir pikselin biraz üstü
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          const c = shade(x, y, edge, rounded);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round(a / (SS * SS));
    }
  }
  return rgba;
}

/* ----------------------------------------------------------------- çıktı */

const ROOT = path.resolve(__dirname, "..");

const TARGETS = [
  // iOS ikonunda köşe yuvarlaması YOK: sistem kendi maskesini uygular, biz de
  // yuvarlarsak köşelerde beyaz tırtık kalır.
  { file: "ios-app/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png", size: 1024, rounded: false },
  { file: "cloud/web/public/icon-180.png", size: 180, rounded: false },
  { file: "cloud/web/public/icon-192.png", size: 192, rounded: true },
  { file: "cloud/web/public/icon-512.png", size: 512, rounded: true },
  { file: "cloud/web/public/favicon.png", size: 64, rounded: true }
];

for (const target of TARGETS) {
  const out = path.join(ROOT, target.file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePNG(render(target.size, target.rounded), target.size));
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`${target.file}  ${target.size}²  ${kb} KB`);
}
