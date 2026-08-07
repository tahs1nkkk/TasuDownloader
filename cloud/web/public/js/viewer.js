// Gelişmiş görüntüleyici.
//
// Hazır bir kütüphane (Photoswipe, Plyr, video.js) yerine buradaki ~300 satır
// tercih edildi: hepsi CDN'den gelen ya da depoya kopyalanacak yüzlerce kilobayt
// getiriyor, teması ayrıca eziliyor ve ihtiyacımız olan üç şeyi — klavye, zoom,
// tek elle seek — zaten tarayıcı veriyor. Burada yalnız o üçünün üstü giydirildi.
//
// Kapatma yolları: Kapat butonu, Esc, ve medyanın dışına tıklama.

import {
  $, ICON, api, clear, confirmBox, el, encKey, fmtBytes, fmtTime, mediaURL, toast
} from "./core.js";
import { openShare } from "./share.js";

let items = [];
let index = 0;
let onRemove = null;
let keyHandler = null;

const RATES = [0.5, 1, 1.25, 1.5, 2];

/* ---------------------------------------------------------------- oynatıcı */

function player(item) {
  const video = el("video", {
    src: mediaURL(item.key), playsinline: true, autoplay: true, preload: "metadata"
  });
  const wrap = el("div", { class: "player" }, video);

  const fill = el("i", { class: "pl-fill" });
  const buffer = el("i", { class: "pl-buffer" });
  const knob = el("i", { class: "pl-knob" });
  const track = el("div", { class: "pl-track" }, buffer, fill);
  const seek = el("div", { class: "pl-seek", role: "slider", "aria-label": "Konum" }, track, knob);

  const playBtn = el("button", { class: "pl-btn big", type: "button", html: ICON.pause, "aria-label": "Oynat/Duraklat" });
  const backBtn = el("button", { class: "pl-btn", type: "button", html: ICON.back10, "aria-label": "10 sn geri" });
  const fwdBtn = el("button", { class: "pl-btn", type: "button", html: ICON.fwd10, "aria-label": "10 sn ileri" });
  const muteBtn = el("button", { class: "pl-btn", type: "button", html: ICON.volume, "aria-label": "Sesi kapat" });
  const volume = el("input", { class: "pl-vol", type: "range", min: "0", max: "1", step: "0.05", value: "1", "aria-label": "Ses" });
  const time = el("span", { class: "pl-time" }, "0:00 / 0:00");
  const rate = el("button", { class: "pl-rate", type: "button" }, "1×");
  const pipBtn = el("button", { class: "pl-btn", type: "button", html: ICON.pip, "aria-label": "Küçük pencere" });
  const fullBtn = el("button", { class: "pl-btn", type: "button", html: ICON.expand, "aria-label": "Tam ekran" });

  const row = el("div", { class: "pl-row" },
    playBtn, backBtn, fwdBtn, time, el("span", { class: "grow" }), muteBtn, volume, rate, pipBtn, fullBtn);
  wrap.append(el("div", { class: "pl-controls" }, seek, row));

  const paint = () => {
    const total = video.duration || 0;
    const ratio = total ? video.currentTime / total : 0;
    fill.style.width = `${ratio * 100}%`;
    knob.style.left = `${ratio * 100}%`;
    time.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(total)}`;
    if (video.buffered.length) {
      buffer.style.width = `${(video.buffered.end(video.buffered.length - 1) / (total || 1)) * 100}%`;
    }
  };

  video.addEventListener("timeupdate", paint);
  video.addEventListener("progress", paint);
  video.addEventListener("loadedmetadata", paint);
  video.addEventListener("play", () => { playBtn.innerHTML = ICON.pause; });
  video.addEventListener("pause", () => { playBtn.innerHTML = ICON.play; });
  video.addEventListener("error", () => toast("Video açılamadı", "err"));

  playBtn.onclick = () => { if (video.paused) video.play(); else video.pause(); };
  backBtn.onclick = () => { video.currentTime = Math.max(0, video.currentTime - 10); };
  fwdBtn.onclick = () => { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); };
  muteBtn.onclick = () => {
    video.muted = !video.muted;
    muteBtn.innerHTML = video.muted ? ICON.mute : ICON.volume;
  };
  volume.oninput = () => { video.volume = Number(volume.value); video.muted = false; muteBtn.innerHTML = ICON.volume; };
  rate.onclick = () => {
    const next = RATES[(RATES.indexOf(video.playbackRate) + 1) % RATES.length];
    video.playbackRate = next;
    rate.textContent = `${next}×`;
  };
  pipBtn.onclick = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { toast("Küçük pencere desteklenmiyor", "err"); }
  };
  fullBtn.onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (wrap.requestFullscreen) await wrap.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iOS Safari
    } catch { /* kullanıcı iptal etti */ }
  };

  // Seek: hem tıklama hem sürükleme. pointer olayları fare/dokunma/kalem ortak.
  let scrubbing = false;
  const scrub = (event) => {
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    if (video.duration) video.currentTime = ratio * video.duration;
  };
  seek.addEventListener("pointerdown", (event) => {
    scrubbing = true;
    seek.setPointerCapture(event.pointerId);
    scrub(event);
  });
  seek.addEventListener("pointermove", (event) => { if (scrubbing) scrub(event); });
  seek.addEventListener("pointerup", () => { scrubbing = false; });
  seek.addEventListener("pointercancel", () => { scrubbing = false; });

  // Kontroller hareketsizlikte solar; video izlenirken çerçeve temiz kalsın.
  let idle;
  const wake = () => {
    wrap.classList.remove("idle");
    clearTimeout(idle);
    idle = setTimeout(() => { if (!video.paused) wrap.classList.add("idle"); }, 2600);
  };
  wrap.addEventListener("pointermove", wake);
  wrap.addEventListener("pointerdown", wake);
  video.addEventListener("play", wake);
  wake();

  wrap.__video = video;
  return wrap;
}

/* ------------------------------------------------------------------ görsel */

function image(item) {
  const img = el("img", { src: mediaURL(item.key), alt: item.name, draggable: "false" });
  let zoom = 1;
  let x = 0;
  let y = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;

  const apply = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    img.classList.toggle("zoomed", zoom > 1);
  };
  const reset = () => { zoom = 1; x = 0; y = 0; apply(); };

  img.addEventListener("dblclick", () => { zoom = zoom > 1 ? 1 : 2.4; x = 0; y = 0; apply(); });
  img.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoom = Math.min(6, Math.max(1, zoom * (event.deltaY < 0 ? 1.15 : 0.87)));
    if (zoom === 1) { x = 0; y = 0; }
    apply();
  }, { passive: false });
  img.addEventListener("pointerdown", (event) => {
    if (zoom <= 1) return;
    dragging = true;
    startX = event.clientX - x;
    startY = event.clientY - y;
    img.setPointerCapture(event.pointerId);
  });
  img.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    x = event.clientX - startX;
    y = event.clientY - startY;
    apply();
  });
  img.addEventListener("pointerup", () => { dragging = false; });
  img.__reset = reset;
  return img;
}

/* -------------------------------------------------------------- çerçeve */

function current() { return items[index]; }

async function removeCurrent() {
  const item = current();
  if (!item) return;
  const ok = await confirmBox("Bu dosya silinsin mi?", item.name, "Sil", true);
  if (!ok) return;
  try {
    await api.del(`/api/media/${encKey(item.key)}`);
    if (onRemove) onRemove([item.key]);
    // Anahtara göre çıkarıyoruz, indise göre değil: onaylama penceresi açıkken
    // liste değişmiş olabilir ve o zaman yanlış dosya listeden düşüyor, silinen
    // dosya da ekranda kalıyordu.
    items = items.filter((row) => row.key !== item.key);
    toast("Silindi", "ok");
    if (!items.length) { closeViewer(); return; }
    if (index >= items.length) index = items.length - 1;
    paint();
  } catch (error) {
    toast(`Silinemedi: ${error.message}`, "err");
  }
}

function paint() {
  const host = $("#viewer");
  const item = current();
  if (!item) { closeViewer(); return; }
  clear(host);

  const bar = el("div", { class: "viewer-bar" });
  bar.append(el("div", { class: "viewer-title" },
    el("b", {}, item.name),
    el("span", {}, `${item.site === "Other" ? "Diğer" : item.site} · ${fmtBytes(item.size)} · ${index + 1}/${items.length}`)
  ));

  bar.append(
    el("a", {
      class: "vbtn primary", href: mediaURL(item.key), download: item.name,
      html: `${ICON.download}<span class="vlabel">İndir</span>`
    }),
    el("button", {
      class: "vbtn", type: "button", html: `${ICON.share}<span class="vlabel">Paylaş</span>`,
      onclick: () => openShare([item.key])
    }),
    el("button", {
      class: "vbtn danger", type: "button", html: `${ICON.trash}<span class="vlabel">Sil</span>`,
      onclick: removeCurrent
    }),
    el("button", {
      class: "vbtn", type: "button", html: `${ICON.x}<span class="vlabel">Kapat</span>`,
      onclick: closeViewer
    })
  );

  const stage = el("div", { class: "viewer-stage" });
  stage.append(item.kind === "video" ? player(item) : image(item));

  const prev = el("button", {
    class: "viewer-nav prev", type: "button", "aria-label": "Önceki", html: ICON.chevronLeft,
    disabled: index === 0, onclick: (event) => { event.stopPropagation(); go(-1); }
  });
  const next = el("button", {
    class: "viewer-nav next", type: "button", "aria-label": "Sonraki", html: ICON.chevronRight,
    disabled: index >= items.length - 1, onclick: (event) => { event.stopPropagation(); go(1); }
  });
  stage.append(prev, next);

  // Medyanın dışına tıklayınca kapanır — istenen davranış bu, ama oynatıcının
  // kendi kontrollerine dokunuşu kapatma saymamak gerekiyor.
  stage.addEventListener("click", (event) => { if (event.target === stage) closeViewer(); });

  host.append(bar, stage);

  // Dokunmatikte yatay kaydırma ile gezinme.
  let touchX = null;
  stage.addEventListener("touchstart", (event) => { touchX = event.touches[0].clientX; }, { passive: true });
  stage.addEventListener("touchend", (event) => {
    if (touchX === null) return;
    const delta = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(delta) > 70) go(delta < 0 ? 1 : -1);
  }, { passive: true });
}

function go(step) {
  const next = index + step;
  if (next < 0 || next >= items.length) return;
  index = next;
  paint();
}

export function closeViewer() {
  const host = $("#viewer");
  const video = host.querySelector("video");
  if (video) { video.pause(); video.src = ""; }
  host.hidden = true;
  clear(host);
  if (keyHandler) { document.removeEventListener("keydown", keyHandler, true); keyHandler = null; }
  items = [];
}

export function openViewer(list, start, remove) {
  items = list.slice();
  index = Math.max(0, Math.min(start, items.length - 1));
  onRemove = remove || null;
  const host = $("#viewer");
  host.hidden = false;
  paint();

  keyHandler = (event) => {
    if ($("#dialogs").classList.contains("on")) return; // diyalog öndeyken karışma
    const video = host.querySelector("video");
    switch (event.key) {
      case "Escape": event.preventDefault(); closeViewer(); break;
      case "ArrowLeft": event.preventDefault(); if (video) video.currentTime -= 5; else go(-1); break;
      case "ArrowRight": event.preventDefault(); if (video) video.currentTime += 5; else go(1); break;
      case "ArrowUp": case "PageUp": event.preventDefault(); go(-1); break;
      case "ArrowDown": case "PageDown": event.preventDefault(); go(1); break;
      case " ": if (video) { event.preventDefault(); if (video.paused) video.play(); else video.pause(); } break;
      case "m": if (video) video.muted = !video.muted; break;
      case "f": {
        const wrap = host.querySelector(".player") || host.querySelector("img");
        if (wrap && wrap.requestFullscreen) wrap.requestFullscreen().catch(() => {});
        break;
      }
      case "Delete": event.preventDefault(); removeCurrent(); break;
      default: break;
    }
  };
  document.addEventListener("keydown", keyHandler, true);
}

// Sürücü değişince açık görüntüleyici anlamını yitirir.
export function isOpen() { return !$("#viewer").hidden; }
