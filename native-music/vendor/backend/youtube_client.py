"""YouTube metadata istemcisi (yt-dlp ile, giriş gerektirmez).

Link önizlemesi için kullanılır: tekil video veya playlist içeriğini
indirmeden listeler.
"""
from __future__ import annotations

import re

from yt_dlp import YoutubeDL


# Sadece tanıtım/format etiketleri. Müzikal anlam taşıyanlar (Live, Akustik,
# Remix, Cover, Unplugged, Session, Karaoke...) BİLEREK listede yok — silinmezler.
_NOISE = (
    r"official\s+music\s+video|official\s+video|official\s+audio|"
    r"official\s+lyrics?\s+video|lyrics?\s+video|official\s+visualizer|visualizer|"
    r"official\s+clip|clip\s+officiel|video\s+klip|videoclip|official\s+lyrics?|"
    r"with\s+lyrics?|lyrics?|şarkı\s+sözleri?|sözleri?|official|audio|klip|"
    r"full\s+hd|hd|hq|4k|m/?v"
)
_NOISE_PAREN_RE = re.compile(r"[\(\[]\s*(?:" + _NOISE + r")\s*[\)\]]", re.IGNORECASE)
_NOISE_PIPE_RE = re.compile(r"\s*\|\s*(?:" + _NOISE + r")\s*(?=\||$)", re.IGNORECASE)


def _clean_title(title: str) -> str:
    """Başlıktan '(Official Music Video)', '(Lyric Video)', '(HD)' gibi tanıtım
    eklerini ayıkla. İçerik/versiyon bilgisi (Live, Akustik...) korunur."""
    if not title:
        return title
    t = _NOISE_PAREN_RE.sub("", title)
    t = _NOISE_PIPE_RE.sub("", t)
    t = re.sub(r"[\(\[]\s*[\)\]]", "", t)          # kalan boş parantez
    t = re.sub(r"\s{2,}", " ", t).strip()          # fazla boşluk
    t = t.strip(" -–—|·").strip()                  # baş/sondaki ayraçlar
    return t or title


def _artist_title_from(title: str, uploader: str | None) -> tuple[str, str]:
    """'Sanatçı - Şarkı' kalıbını yakala; olmuyorsa uploader'a düş."""
    if title and " - " in title:
        left, right = title.split(" - ", 1)
        left, right = left.strip(), right.strip()
        if left and right:
            return left, right
    up = (uploader or "").removesuffix(" - Topic").strip()
    return up, (title or "")   # uploader yoksa sanatçı boş kalır (asla 'YouTube')


def _yt_cover(info: dict) -> str | None:
    """YouTube kapağı için temiz bir JPEG URL'si (video id'sinden türet)."""
    vid = info.get("id")
    if vid:
        # mqdefault: 320x180, 16:9, siyah bantsız, her videoda mevcut ve JPEG.
        return f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
    cover = info.get("thumbnail")
    thumbs = info.get("thumbnails") or []
    if not cover and thumbs:
        cover = thumbs[-1].get("url")
    return cover


def _yt_cover_hd(info: dict) -> str | None:
    """Izgara görünümü için yüksek çözünürlüklü kapak — kendi sunucumuz üzerinden.

    Doğrudan `maxresdefault.jpg` istemek çoğu videoda 404 verir ve bu hata
    tarayıcı konsoluna düşer (kullanıcının şikâyeti #2). Bunun yerine kapağı
    kendi `/api/ytimg/<id>` proxy'mizden alıyoruz: proxy sunucu tarafında
    maxres→sd→hq→mq sırasını dener, ilk bulunanı döndürür. Böylece kapak yine
    yüksek çözünürlüklü olur ama tarayıcıda 404 oluşmaz.
    """
    vid = info.get("id")
    return f"/api/ytimg/{vid}" if vid else None


def _is_video(info: dict) -> bool:
    """Arama sonucundaki öğe gerçek bir video mu? (kanal/playlist'leri ele)."""
    vid = info.get("id") or ""
    url = info.get("webpage_url") or info.get("url") or ""
    if any(s in url for s in ("/channel/", "/@", "/playlist", "/user/", "/hashtag/")):
        return False
    if info.get("ie_key") in ("YoutubeTab", "YoutubeChannel", "YoutubePlaylist"):
        return False
    # YouTube video id'si tam 11 karakter; kanal (UC…, 24) / playlist (PL…) değil.
    return len(vid) == 11


def _entry_to_item(info: dict) -> dict:
    title = info.get("title") or ""
    uploader = info.get("uploader") or info.get("channel") or info.get("uploader_id")
    artist, song = _artist_title_from(title, uploader)
    song = _clean_title(song)   # '(Official Music Video)' vb. tanıtım eklerini ayıkla

    vid = info.get("id")
    url = info.get("webpage_url") or info.get("url")
    if vid and (not url or not str(url).startswith("http")):
        url = f"https://www.youtube.com/watch?v={vid}"

    dur = info.get("duration")
    return {
        "id": vid,
        "title": song or title,
        "artist": artist,
        "artists": [artist] if artist else [],
        # Gerçek albüm indirme sırasında YouTube'dan gelirse yazılır; yoksa boş.
        "album": info.get("album") or "",
        "duration_ms": int(dur * 1000) if dur else None,
        "cover_url": _yt_cover(info),          # liste (küçük, hep var)
        "cover_hd": _yt_cover_hd(info),        # ızgara (yüksek çöz., yoksa düşer)
        "youtube_url": url,
        "spotify_url": None,
        "search_query": title,
        "source": "youtube",
    }


# yt-dlp çerez okuma hataları (tarayıcı açıksa DB kilitli olur → #7271).
_COOKIE_ERR_HINTS = ("cookie", "could not copy", "dpapi", "decrypt",
                     "keyring", "database is locked", "permission")


def _extract(opts: dict, target: str, cookies: str | None):
    """Çerezle dener; çerez okunamıyorsa (tarayıcı açık vb.) çerezsiz tekrar
    dener. (info, cookie_failed) döner — böylece arama asla çerez yüzünden
    komple başarısız olmaz."""
    if cookies:
        o = dict(opts)
        o["cookiesfrombrowser"] = (cookies,)
        try:
            with YoutubeDL(o) as ydl:
                return ydl.extract_info(target, download=False), False
        except Exception as e:
            if not any(h in str(e).lower() for h in _COOKIE_ERR_HINTS):
                raise                    # çerezle ilgisi yok → gerçek hata
            # çerez okunamadı → çerezsiz devam et, uyarı ver
            with YoutubeDL(opts) as ydl:
                return ydl.extract_info(target, download=False), True
    with YoutubeDL(opts) as ydl:
        return ydl.extract_info(target, download=False), False


def fetch(url: str, cookies: str | None = None) -> dict | None:
    """URL playlist ise entries, video ise tek öğe döner."""
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",  # playlist içindekileri hızlıca (indirmeden) listele
        "noplaylist": False,
    }
    info, cookie_failed = _extract(opts, url, cookies)
    if not info:
        return None

    if info.get("_type") == "playlist" or info.get("entries") is not None:
        entries = [e for e in (info.get("entries") or []) if e]
        tracks = [_entry_to_item(e) for e in entries]
        meta = {
            "id": info.get("id"),
            "name": info.get("title") or "YouTube Playlist",
            "cover_url": next((t["cover_url"] for t in tracks if t.get("cover_url")), None),
            "owner": info.get("uploader") or info.get("channel"),
            "total": len(tracks),
            "type": "playlist",
        }
        return {"meta": meta, "tracks": tracks, "source": "youtube",
                "cookie_failed": cookie_failed}

    item = _entry_to_item(info)
    meta = {"id": item["id"], "name": item["title"], "cover_url": item["cover_url"],
            "owner": item["artist"], "total": 1, "type": "track"}
    return {"meta": meta, "tracks": [item], "source": "youtube",
            "cookie_failed": cookie_failed}


def search(query: str, limit: int = 50, cookies: str | None = None,
           max_duration: int | None = None) -> dict:
    """YouTube'da arama yapıp sonuçları öğe listesi olarak döner.

    limit: en fazla kaç sonuç. Artık 50 ile sınırlı değil; kullanıcı 200'e kadar
           isteyebilir (arayüz sayfalar). Üst tavan 300 (çok yüksek istekler
           YouTube aramasını dakikalarca yavaşlatır).
    max_duration: saniye; bundan uzun videolar (film vb.) elenir. 0/None = filtre yok.
    Kanal/playlist sonuçları her zaman elenir; yalnızca gerçek videolar kalır.
    """
    limit = max(1, min(int(limit or 50), 300))
    max_dur = int(max_duration) if max_duration else 0
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": True,
        "noplaylist": True,
    }
    # Filtreler sonuç sayısını düşüreceği için biraz fazla iste.
    fetch_n = min(limit + 15, 300) if max_dur else limit
    info, cookie_failed = _extract(opts, f"ytsearch{fetch_n}:{query}", cookies)
    entries = [e for e in ((info or {}).get("entries") or []) if e and _is_video(e)]

    tracks = []
    for e in entries:
        it = _entry_to_item(e)
        if max_dur:
            dms = it.get("duration_ms")
            if dms and dms > max_dur * 1000:   # süre limitini aşan → ele
                continue
        tracks.append(it)
        if len(tracks) >= limit:
            break

    meta = {
        "id": None,
        "name": f"“{query}” sonuçları",
        "cover_url": next((t["cover_url"] for t in tracks if t.get("cover_url")), None),
        "owner": None,
        "total": len(tracks),
        "type": "search",
    }
    return {"meta": meta, "tracks": tracks, "source": "youtube",
            "cookie_failed": cookie_failed}


def is_url(text: str) -> bool:
    """Metin bir link mi yoksa arama sorgusu mu?"""
    t = (text or "").strip().lower()
    return t.startswith("http://") or t.startswith("https://") or \
        "youtube.com" in t or "youtu.be" in t
