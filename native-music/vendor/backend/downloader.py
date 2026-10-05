"""İndirme motoru: yt-dlp + ffmpeg ile ses indir, mutagen ile etiketle.

Spotify öğeleri için YouTube'da eşleşen kaynak aranır (ytsearch), indirilir ve
Spotify metadatasıyla (başlık, sanatçı, albüm, kapak) yeniden etiketlenir.
YouTube öğeleri doğrudan URL'den indirilir.

Güvenilirlik: YouTube bazı istekleri rastgele 403 (rate-limit) ile reddediyor.
Bu yüzden her şarkı, birbirinden bağımsız birden çok istemci (player_client) ile
sırayla denenir; biri 403 alırsa diğerine geçilir. Ayrıca throttling'i azaltmak
için şarkılar arasında kısa bekleme konur.
"""
from __future__ import annotations

import os
import random
import re
import threading
import time
import uuid
from pathlib import Path

import requests
from yt_dlp import YoutubeDL

from . import config

try:
    import imageio_ffmpeg
    _FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    _FFMPEG = None  # sistem PATH'indeki ffmpeg'e düşer

# YouTube imza (nsig) çözümü için JS runtime gerekir. Deno öncelikli; kurulu
# değilse sistemdeki node kullanılır. Runtime hiç yoksa yt-dlp yine de dener.
_JS_RUNTIMES = {"deno": {}, "node": {}}

# YouTube istemci stratejileri — her biri BAĞIMSIZ tek bir istemci olarak
# sırayla denenir. 403 aralıklı (rate-limit) olduğu için tek istemci yeterli
# değil; bir istemci 403 alırsa sıradaki taze bir şans verir.
# android_vr / tv_embedded PO-token gerektirmeyen opus (251) sesi verir;
# android muxed (18) verir; default en son çare olarak yt-dlp varsayılanları.
_CLIENT_STRATEGIES = [
    ["android_vr"],
    ["tv_embedded"],
    ["android"],
    ["ios"],
    ["default"],
]


# ----------------------------------------------------------- iş (job) kaydı
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


def _new_job(total: int) -> str:
    jid = uuid.uuid4().hex[:12]
    with _jobs_lock:
        _jobs[jid] = {
            "id": jid,
            "status": "running",          # running | done
            "total": total,
            "completed": 0,
            "errors": 0,
            "current_index": 0,
            "current_title": "",
            "current_progress": 0.0,
            "stage": "",                  # indiriliyor | dönüştürülüyor | tamamlandı
            "items": [],
            "started_at": time.time(),
        }
    return jid


def get_job(jid: str) -> dict | None:
    with _jobs_lock:
        j = _jobs.get(jid)
        return dict(j) if j else None


def has_active_jobs() -> bool:
    """Sürmekte olan (running) bir indirme var mı? (kapanma izleyicisi kullanır)"""
    with _jobs_lock:
        return any(j.get("status") == "running" for j in _jobs.values())


def _update(jid: str, **kw) -> None:
    with _jobs_lock:
        if jid in _jobs:
            _jobs[jid].update(kw)


def _set_item(jid: str, idx: int, **kw) -> None:
    with _jobs_lock:
        if jid in _jobs and 0 <= idx < len(_jobs[jid]["items"]):
            _jobs[jid]["items"][idx].update(kw)


# ----------------------------------------------------------- yardımcılar
_SANITIZE_RE = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_YT_ID_RE = re.compile(r"(?:v=|youtu\.be/|/shorts/|/embed/|/watch/)([A-Za-z0-9_-]{11})")


def _sanitize(name: str, fallback: str = "track") -> str:
    name = _SANITIZE_RE.sub("", name or "").strip().strip(".")
    name = re.sub(r"\s+", " ", name)
    return name[:180] or fallback


def _yt_id(url: str | None) -> str | None:
    if not url:
        return None
    m = _YT_ID_RE.search(url)
    return m.group(1) if m else None


# Türkçe harfleri İngiliz alfabesine indirger (eski araç teybi/oynatıcı uyumu).
# Örn: özledim→ozledim, şaşkın→saskin. Yalnız kullanıcı isterse uygulanır.
_TR_ASCII = str.maketrans({
    "ç": "c", "Ç": "C", "ğ": "g", "Ğ": "G", "ı": "i", "İ": "I",
    "ö": "o", "Ö": "O", "ş": "s", "Ş": "S", "ü": "u", "Ü": "U",
    "â": "a", "Â": "A", "î": "i", "Î": "I", "û": "u", "Û": "U",
})


def _tr_ascii(text: str) -> str:
    """Türkçe karakterleri İngiliz alfabesine çevir (özledim→ozledim, şaşkın→saskin)."""
    return (text or "").translate(_TR_ASCII)


def _build_basename(item: dict, naming: dict | None, ascii_tr: bool = False) -> str:
    """Kullanıcının dosya-adı tercihlerine göre dosya adını kur.

    ascii_tr=True ise Türkçe karakterler İngiliz alfabesine çevrilir (eski cihaz
    uyumu): dosya adı örn. 'Şebnem Ferah - Sil Baştan' → 'Sebnem Ferah - Sil Bastan'.
    """
    naming = naming or {}
    artist = (item.get("artist") or "").strip()
    title = (item.get("title") or "track").strip()
    include_artist = naming.get("artist", True)
    order = naming.get("order", "artist_first")   # artist_first | title_first
    sep = naming.get("separator", " - ")

    if include_artist and artist:
        parts = [title, artist] if order == "title_first" else [artist, title]
    else:
        parts = [title]
    raw = sep.join(parts)
    if ascii_tr:
        raw = _tr_ascii(raw)
    return _sanitize(raw)


_cover_cache: dict[str, bytes] = {}


def _fetch_cover(url: str | None) -> bytes | None:
    if not url:
        return None
    if url in _cover_cache:
        return _cover_cache[url]
    try:
        r = requests.get(url, timeout=15)
        if r.ok and r.content:
            _cover_cache[url] = r.content
            return r.content
    except Exception:
        pass
    return None


# Kapak çözünürlüğü presetleri → denenecek YouTube küçük-resim merdiveni.
# maxres 1280x720, sd 640x480, hq 480x360, mq 320x180 (mq her videoda vardır).
_COVER_RES_LADDER = {
    "maks":   ("maxresdefault", "sddefault", "hqdefault"),
    "yuksek": ("sddefault", "hqdefault"),
    "orta":   ("hqdefault", "mqdefault"),
    "dusuk":  ("mqdefault",),
}


def _fetch_youtube_cover(vid: str | None, res: str = "maks") -> bytes | None:
    """YouTube kapağını seçilen çözünürlük presetine göre çeker (hepsi JPEG).

    res: 'maks' | 'yuksek' | 'orta' | 'dusuk'. Preset merdiveninde geçerli bir
    görsel bulunamazsa her videoda mevcut olan mqdefault'a düşer (kapak boş kalmasın).
    """
    if not vid:
        return None
    ladder = _COVER_RES_LADDER.get(res, _COVER_RES_LADDER["maks"])
    for quality in ladder:
        data = _fetch_cover(f"https://i.ytimg.com/vi/{vid}/{quality}.jpg")
        if data and len(data) > 1500:   # 404 placeholder'ları ~1KB'dir, ele
            return data
    if "mqdefault" not in ladder:       # son çare: küçük ama her videoda var
        return _fetch_cover(f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg")
    return None


def _img_mime(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


def _enrich_from_info(item: dict, info: dict) -> None:
    """İndirme sırasında YouTube'un verdiği gerçek metadatayı öğeye işle.

    YouTube (özellikle 'Topic'/Music parçaları) albüm, sanatçı ve yıl bilgisi
    verebilir. Verirse kullan; vermezse albümü BOŞ bırak (asla 'YouTube' yazma).
    """
    if item.get("source") != "youtube":
        return
    album = info.get("album")
    if album:
        item["album"] = album
    else:
        item.setdefault("album", "")
        if item.get("album") in (None, "YouTube"):
            item["album"] = ""

    if not item.get("release_year"):
        year = info.get("release_year")
        if not year:
            ud = info.get("upload_date") or ""
            year = ud[:4] if len(ud) >= 4 and ud[:4].isdigit() else None
        if year:
            item["release_year"] = str(year)


def _cover_for(item: dict, cover_res: str) -> bytes | None:
    """Öğe için kapak baytlarını getir: YouTube ise video id'sinden seçili
    çözünürlükte, değilse (Spotify) öğedeki kapak URL'sinden."""
    cover = None
    if item.get("source") == "youtube":
        vid = item.get("id") or _yt_id(item.get("youtube_url"))
        cover = _fetch_youtube_cover(vid, cover_res)
    if not cover:
        cover = _fetch_cover(item.get("cover_url"))
    return cover


def _tag_file(path: str, item: dict, embed_cover: bool = True,
              cover_res: str = "maks", ascii_tr: bool = False) -> None:
    """MP3 dosyasına ID3 etiketleri ve (isteğe bağlı) kapak görselini gömer.

    embed_cover=False ise kapak gömülmez. ascii_tr=True ise başlık/sanatçı/albüm
    metni Türkçe→İngiliz alfabesine çevrilir (eski cihazlarda düzgün görünsün).
    """
    from mutagen.id3 import (APIC, ID3, TALB, TDRC, TIT2, TPE1, TPE2, TRCK,
                             ID3NoHeaderError)
    try:
        tags = ID3(path)
    except ID3NoHeaderError:
        tags = ID3()

    title = item.get("title") or ""
    artist = item.get("artist") or ""
    album = item.get("album") or ""
    if ascii_tr:
        title, artist, album = _tr_ascii(title), _tr_ascii(artist), _tr_ascii(album)
    if title:
        tags.setall("TIT2", [TIT2(encoding=3, text=title)])
    if artist:
        tags.setall("TPE1", [TPE1(encoding=3, text=artist)])
        tags.setall("TPE2", [TPE2(encoding=3, text=artist)])
    if album:
        tags.setall("TALB", [TALB(encoding=3, text=album)])
    if item.get("track_number"):
        tags.setall("TRCK", [TRCK(encoding=3, text=str(item["track_number"]))])
    if item.get("release_year"):
        tags.setall("TDRC", [TDRC(encoding=3, text=str(item["release_year"]))])

    if embed_cover:
        cover = _cover_for(item, cover_res)
        if cover:
            tags.setall("APIC", [APIC(encoding=3, mime=_img_mime(cover), type=3,
                                       desc="Cover", data=cover)])

    try:
        tags.save(path, v2_version=3)
    except Exception:
        pass


def _tag_mp4(path: str, item: dict, embed_cover: bool = True,
             cover_res: str = "maks", ascii_tr: bool = False) -> None:
    """MP4 dosyasına metadata etiketleri ve (isteğe bağlı) kapak görselini gömer."""
    from mutagen.mp4 import MP4, MP4Cover
    try:
        mp4 = MP4(path)
    except Exception:
        return

    title = item.get("title") or ""
    artist = item.get("artist") or ""
    album = item.get("album") or ""
    if ascii_tr:
        title, artist, album = _tr_ascii(title), _tr_ascii(artist), _tr_ascii(album)
    if title:
        mp4["\xa9nam"] = [title]
    if artist:
        mp4["\xa9ART"] = [artist]
        mp4["aART"] = [artist]
    if album:
        mp4["\xa9alb"] = [album]
    if item.get("release_year"):
        mp4["\xa9day"] = [str(item["release_year"])]
    if item.get("track_number"):
        try:
            mp4["trkn"] = [(int(item["track_number"]), 0)]
        except (ValueError, TypeError):
            pass

    if embed_cover:
        cover = _cover_for(item, cover_res)
        if cover:
            mime = _img_mime(cover)
            # MP4 kapağı yalnız JPEG/PNG kabul eder; webp vb. gelirse gömme.
            if mime in ("image/jpeg", "image/png"):
                cfmt = MP4Cover.FORMAT_PNG if mime == "image/png" else MP4Cover.FORMAT_JPEG
                mp4["covr"] = [MP4Cover(cover, imageformat=cfmt)]

    try:
        mp4.save()
    except Exception:
        pass


def _video_format(video_quality: str | None) -> str:
    """İstenen video kalitesine göre yt-dlp format seçici (yükseklik sınırlı).

    'best'/boş → sınır yok (en yüksek). '1080'/'720'... → o yüksekliğe kadar.
    Uyumluluk için H.264/AVC + AAC (araba/eski oynatıcılar) tercih edilir; yoksa
    herhangi bir mp4, o da yoksa en iyi akışa düşülür.
    """
    vq = (video_quality or "").strip().lower()
    h = re.sub(r"\D", "", vq)            # '1080p' -> '1080', 'best' -> ''
    hf = f"[height<={h}]" if h else ""   # yükseklik sınırı (boşsa sınırsız)
    return (
        f"bestvideo{hf}[vcodec^=avc1]+bestaudio[acodec^=mp4a]/"  # en uyumlu (H.264+AAC)
        f"bestvideo{hf}[ext=mp4]+bestaudio[ext=m4a]/"            # herhangi mp4
        f"bestvideo{hf}+bestaudio/"                              # herhangi video+ses
        f"best{hf}/best"                                         # birleşik tek dosya
    )


def _ydl_opts(preset: str, out_base: Path, hook, cookies_from_browser: str | None,
              player_clients: list[str] | None = None,
              fmt: str = "mp3", video_quality: str | None = None) -> dict:
    opts = {
        "outtmpl": str(out_base) + ".%(ext)s",
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "ignoreerrors": False,
        "retries": 10,
        "fragment_retries": 10,
        "extractor_retries": 3,
        "file_access_retries": 5,
        "socket_timeout": 20,
        "progress_hooks": [hook],
        "default_search": "ytsearch",
        "js_runtimes": _JS_RUNTIMES,
    }
    if fmt == "mp4":
        # Video: istenen kaliteyi indir, mp4 kabına birleştir/remux et.
        opts["format"] = _video_format(video_quality)
        opts["merge_output_format"] = "mp4"
        opts["postprocessors"] = [
            {"key": "FFmpegVideoRemuxer", "preferedformat": "mp4"},
        ]
    else:
        # Ses: en iyi sesi indir, seçilen bit hızında MP3'e dönüştür.
        bitrate = config.PRESETS.get(preset, config.PRESETS[config.DEFAULT_PRESET])
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3",
             "preferredquality": bitrate},
        ]
    if player_clients:
        opts["extractor_args"] = {"youtube": {"player_client": list(player_clients)}}
    if _FFMPEG:
        opts["ffmpeg_location"] = _FFMPEG
    if cookies_from_browser:
        opts["cookiesfrombrowser"] = (cookies_from_browser,)
    return opts


def _cleanup_partials(folder: Path, base_name: str) -> None:
    """Yarım kalan indirme dosyalarını (yeniden deneme öncesi) temizle."""
    prefix = base_name + "."
    try:
        for p in folder.iterdir():
            if p.name.startswith(prefix):
                try:
                    p.unlink()
                except OSError:
                    pass
    except OSError:
        pass


def _find_output(folder: Path, base_name: str, info: dict, ext: str = "mp3") -> str | None:
    """İndirilen nihai dosyanın (mp3/mp4) yolunu bul."""
    rd = info.get("requested_downloads")
    if rd:
        fp = rd[0].get("filepath")
        if fp and os.path.exists(fp):
            return fp
    cand = folder / f"{base_name}.{ext}"
    if cand.exists():
        return str(cand)
    prefix = base_name + "."
    for p in folder.iterdir():
        if p.name.startswith(prefix) and p.suffix.lower() == f".{ext}":
            return str(p)
    return None


def _download_one(item: dict, preset: str, folder: Path, cookies: str | None,
                  hook, naming: dict | None = None,
                  fmt: str = "mp3", video_quality: str | None = None,
                  options: dict | None = None) -> str:
    options = options or {}
    embed_cover = options.get("embed_cover", True)   # kapağı dosyaya göm mü
    cover_res = options.get("cover_res", "maks")      # kapak çözünürlük preseti
    ascii_tr = options.get("ascii_tr", False)          # Türkçe→İngiliz alfabesi

    artist = item.get("artist") or "Bilinmeyen"
    title = item.get("title") or "track"
    base_name = _build_basename(item, naming, ascii_tr)
    out_base = folder / base_name
    ext = "mp4" if fmt == "mp4" else "mp3"

    target = item.get("youtube_url")
    if not target:
        query = item.get("search_query") or f"{artist} {title}"
        target = f"ytsearch1:{query}"

    # İstemci stratejilerini sırayla dene: biri 403/format hatası verirse
    # sıradaki bağımsız istemci taze bir şans verir (403 aralıklı olduğundan).
    last_err: Exception | None = None
    for si, clients in enumerate(_CLIENT_STRATEGIES):
        if si > 0:
            time.sleep(random.uniform(0.3, 0.8))   # istemciler arası kısa nefes
        _cleanup_partials(folder, base_name)
        opts = _ydl_opts(preset, out_base, hook, cookies, clients, fmt, video_quality)
        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(target, download=True)
            if info and "entries" in info:
                entries = [e for e in info["entries"] if e]
                info = entries[0] if entries else None
            if not info:
                raise RuntimeError("Kaynak bulunamadı")
            final = _find_output(folder, base_name, info, ext)
            if not final:
                raise RuntimeError("İndirilen dosya bulunamadı")
            _enrich_from_info(item, info)
            if fmt == "mp4":
                _tag_mp4(final, item, embed_cover, cover_res, ascii_tr)
            else:
                _tag_file(final, item, embed_cover, cover_res, ascii_tr)
            return final
        except Exception as e:
            last_err = e
            continue

    raise last_err if last_err else RuntimeError("İndirilemedi")


# ----------------------------------------------------------- iş yürütücü
def start_download(items: list[dict], preset: str, subfolder: str | None,
                   cookies: str | None, naming: dict | None = None,
                   fmt: str = "mp3", video_quality: str | None = None,
                   options: dict | None = None) -> str:
    items = [it for it in (items or []) if it]
    jid = _new_job(len(items))
    with _jobs_lock:
        _jobs[jid]["items"] = [
            {"title": it.get("title"), "artist": it.get("artist"),
             "status": "queued", "error": None}
            for it in items
        ]

    folder = config.DOWNLOAD_DIR
    if subfolder:
        folder = folder / _sanitize(subfolder, "playlist")
    folder.mkdir(parents=True, exist_ok=True)

    t = threading.Thread(target=_run_job,
                         args=(jid, items, preset, folder, cookies, naming,
                               fmt, video_quality, options),
                         daemon=True)
    t.start()
    return jid


def _run_job(jid: str, items: list[dict], preset: str, folder: Path,
             cookies: str | None, naming: dict | None = None,
             fmt: str = "mp3", video_quality: str | None = None,
             options: dict | None = None) -> None:
    total = len(items)
    for idx, item in enumerate(items):
        title = item.get("title") or "?"
        artist = item.get("artist") or ""
        _update(jid, current_index=idx,
                current_title=f"{artist} - {title}".strip(" -"),
                current_progress=0.0, stage="indiriliyor")
        _set_item(jid, idx, status="downloading")

        def hook(d, _jid=jid):
            st = d.get("status")
            if st == "downloading":
                total_b = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                done = d.get("downloaded_bytes") or 0
                pct = (done / total_b * 100.0) if total_b else 0.0
                _update(_jid, current_progress=round(pct, 1), stage="indiriliyor")
            elif st == "finished":
                _update(_jid, current_progress=100.0, stage="dönüştürülüyor")

        try:
            _download_one(item, preset, folder, cookies, hook, naming,
                          fmt, video_quality, options)
            _set_item(jid, idx, status="done")
            with _jobs_lock:
                if jid in _jobs:
                    _jobs[jid]["completed"] += 1
        except Exception as e:
            _set_item(jid, idx, status="error", error=str(e)[:300])
            with _jobs_lock:
                if jid in _jobs:
                    _jobs[jid]["errors"] += 1

        # Throttling'i (rate-limit 403) azaltmak için şarkılar arasında kısa
        # rastgele bekleme — son şarkıdan sonra bekleme.
        if idx < total - 1:
            time.sleep(random.uniform(0.5, 1.2))

    _update(jid, status="done", stage="tamamlandı", current_progress=100.0,
            current_title="")
