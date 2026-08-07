// Bant genişliği sınırı.
//
// Ev bağlantısını tek başına doldurmasın diye arşivin akışları istenirse belirli
// bir hıza sabitlenir. Sınır sunucuda uygulanır, çünkü tarayıcı bir <img> ya da
// <video> indirmesini kısamıyor: baytlar buradan yavaş çıkınca TCP penceresi
// kendiliğinden daralıyor. Aynı numara yüklemede de çalışıyor — gövdeyi yavaş
// okuyunca gönderen taraf yavaşlıyor.
//
// Sınır üç yerden okunur: X-Tasu-Bw başlığı (iOS uygulaması), tasu_bw çerezi
// (web — adres değişmediği için tarayıcı önbelleği bozulmaz) ve son çare olarak
// ?bw= sorgusu. Değer Mbps; 0 ya da 1000+ "sınırsız" demek ve o durumda akışa
// hiç dokunulmaz, yani varsayılan yolda ek maliyet yoktur.

const MBIT = 125_000;              // 1 Mbps = 125.000 bayt/sn
const MIN_MBPS = 1;
const FREE_MBPS = 1000;            // ve üstü: sınır yok
const SLICE = 64 * 1024;           // tek seferde çıkan en büyük parça

function cookieValue(request, name) {
  const jar = request.headers.get("Cookie") || "";
  for (const piece of jar.split(";")) {
    const eq = piece.indexOf("=");
    if (eq < 0) continue;
    if (piece.slice(0, eq).trim() === name) return piece.slice(eq + 1).trim();
  }
  return "";
}

// Bayt/saniye döner; 0 = sınırsız.
export function bytesPerSec(request, url) {
  const raw = request.headers.get("X-Tasu-Bw")
    || cookieValue(request, "tasu_bw")
    || (url ? url.searchParams.get("bw") : "")
    || "";
  const mbps = Number(raw);
  if (!Number.isFinite(mbps) || mbps < MIN_MBPS || mbps >= FREE_MBPS) return 0;
  return Math.round(mbps * MBIT);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Akışı hedef hıza oturtur. Bekleme "şu ana kadar kaç bayt geçti" üzerinden
// hesaplanıyor; böylece tek tek parçalardaki sapmalar birikmiyor, uzun vadeli
// ortalama tam olarak istenen hız oluyor.
export function pace(body, bps) {
  if (!body || !bps) return body;

  const reader = body.getReader();
  let held = null;                 // okunan ama tamamı gönderilmemiş parça
  let offset = 0;
  let sent = 0;
  let startedAt = 0;

  return new ReadableStream({
    async pull(controller) {
      while (!held || offset >= held.length) {
        const { value, done } = await reader.read();
        if (done) { controller.close(); return; }
        if (!value || !value.length) continue;
        held = value;
        offset = 0;
      }

      const piece = held.subarray(offset, offset + SLICE);
      offset += piece.length;

      if (!startedAt) startedAt = Date.now();
      const due = startedAt + (sent / bps) * 1000;
      const wait = due - Date.now();
      if (wait > 0) await sleep(wait);

      sent += piece.length;
      controller.enqueue(piece);
    },
    cancel(reason) { return reader.cancel(reason); }
  });
}

// Yükleme tarafı. R2'nin put()'u "uzunluğu bilinen" bir akış istiyor; elle
// kurulan ReadableStream'i reddediyor. FixedLengthStream tam bunun için var:
// baytlar yavaşlatılmış akıştan içeri pompalanırken R2 uzunluğu baştan biliyor.
// Content-Length yoksa (parçalı gönderim) sınır atlanır — yavaşlatmak için
// dosyayı belleğe almak, sınırın çözdüğü sorundan büyük bir sorun olurdu.
export function paceUpload(request, bps) {
  const size = Number(request.headers.get("Content-Length") || 0);
  if (!bps || !request.body || !size) return request.body;

  const fixed = new FixedLengthStream(size);
  pace(request.body, bps).pipeTo(fixed.writable).catch(() => {});
  return fixed.readable;
}
