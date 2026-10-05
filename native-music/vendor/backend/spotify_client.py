"""Spotify metadata istemcisi.

Spotify'dan yalnızca metadata (playlist/şarkı bilgisi) alınır; ses dosyası
Spotify'dan gelmez. Giriş yapılmadan public veriye (Client Credentials akışı),
giriş yapılınca kullanıcının gizli playlist'lerine (OAuth) erişilir.
"""
from __future__ import annotations

import os
import threading

import spotipy
from spotipy.oauth2 import SpotifyClientCredentials, SpotifyOAuth

from . import config

_lock = threading.Lock()
_oauth: SpotifyOAuth | None = None
_app: spotipy.Spotify | None = None


def _get_oauth() -> SpotifyOAuth | None:
    """Kullanıcı girişi (OAuth) yöneticisi."""
    global _oauth
    if not config.spotify_configured():
        return None
    with _lock:
        if _oauth is None:
            _oauth = SpotifyOAuth(
                client_id=config.SPOTIFY_CLIENT_ID,
                client_secret=config.SPOTIFY_CLIENT_SECRET,
                redirect_uri=config.REDIRECT_URI,
                scope=config.SPOTIFY_SCOPE,
                cache_path=config.SPOTIFY_TOKEN_CACHE,
                open_browser=False,
            )
    return _oauth


def app_client() -> spotipy.Spotify | None:
    """Public veri için uygulama düzeyinde istemci (giriş gerekmez)."""
    global _app
    if not config.spotify_configured():
        return None
    with _lock:
        if _app is None:
            mgr = SpotifyClientCredentials(
                client_id=config.SPOTIFY_CLIENT_ID,
                client_secret=config.SPOTIFY_CLIENT_SECRET,
            )
            _app = spotipy.Spotify(client_credentials_manager=mgr, requests_timeout=20, retries=3)
    return _app


# ---------------------------------------------------------------- oturum
def get_authorize_url() -> str | None:
    oauth = _get_oauth()
    return oauth.get_authorize_url() if oauth else None


def handle_callback(code: str) -> None:
    oauth = _get_oauth()
    if oauth:
        oauth.get_access_token(code, check_cache=False)


def logout() -> None:
    """Oturumu TAM kapat: token dosyasını sil + bellekteki oturumu sıfırla.

    Yalnız dosyayı silmek yetmez; bellekteki OAuth yöneticisi token'ı hâlâ
    tutabildiğinden `is_logged_in()` çıkıştan sonra da 'giriş var' diyebilir.
    O yüzden global istemcileri de temizliyoruz.
    """
    global _oauth, _app
    for path in (config.SPOTIFY_TOKEN_CACHE,
                 str(config.BASE_DIR / ".cache" / "spotify_token.json")):
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        except OSError:
            pass
    with _lock:
        _oauth = None
        _app = None


def _valid_token():
    oauth = _get_oauth()
    if not oauth:
        return None
    token = oauth.cache_handler.get_cached_token()
    return oauth.validate_token(token)


def is_logged_in() -> bool:
    try:
        return _valid_token() is not None
    except Exception:
        return False


def user_client() -> spotipy.Spotify | None:
    """Giriş yapılmışsa kullanıcı düzeyinde istemci, yoksa None."""
    oauth = _get_oauth()
    if not oauth:
        return None
    try:
        if _valid_token() is None:
            return None
    except Exception:
        return None
    return spotipy.Spotify(auth_manager=oauth, requests_timeout=20, retries=3)


def _read_client() -> spotipy.Spotify | None:
    """Okuma için: giriş varsa kullanıcı istemcisi (gizli+public), yoksa app."""
    return user_client() or app_client()


def get_current_user() -> dict | None:
    c = user_client()
    if not c:
        return None
    try:
        me = c.current_user()
    except Exception:
        return None
    imgs = me.get("images") or []
    return {
        "id": me.get("id"),
        "name": me.get("display_name") or me.get("id"),
        "image": imgs[0]["url"] if imgs else None,
        "product": me.get("product"),
    }


# ---------------------------------------------------------------- yardımcı
def _simplify_track(t: dict | None, cover_fallback: str | None = None) -> dict | None:
    if not t or (not t.get("id") and not t.get("name")):
        return None
    album = t.get("album") or {}
    images = album.get("images") or []
    cover = images[0]["url"] if images else cover_fallback
    artists = [a.get("name") for a in (t.get("artists") or []) if a.get("name")]
    artist = ", ".join(artists)
    name = t.get("name") or ""
    return {
        "id": t.get("id"),
        "title": name,
        "artist": artist,
        "artists": artists,
        "album": album.get("name"),
        "duration_ms": t.get("duration_ms"),
        "cover_url": cover,
        "track_number": t.get("track_number"),
        "release_year": (album.get("release_date") or "")[:4],
        "isrc": (t.get("external_ids") or {}).get("isrc"),
        "spotify_url": (t.get("external_urls") or {}).get("spotify"),
        "search_query": f"{artist} - {name}".strip(" -"),
        "source": "spotify",
    }


# ---------------------------------------------------------------- veri
def get_user_playlists() -> list[dict]:
    c = user_client()
    if not c:
        return []
    out: list[dict] = []
    results = c.current_user_playlists(limit=50)
    while results:
        for p in results.get("items", []):
            if not p:
                continue
            imgs = p.get("images") or []
            out.append({
                "id": p.get("id"),
                "name": p.get("name"),
                "cover_url": imgs[0]["url"] if imgs else None,
                "total": (p.get("tracks") or {}).get("total", 0),
                "owner": (p.get("owner") or {}).get("display_name"),
                "public": p.get("public"),
                "spotify_url": (p.get("external_urls") or {}).get("spotify"),
            })
        results = c.next(results) if results.get("next") else None
    return out


def get_liked_tracks() -> dict:
    c = user_client()
    if not c:
        return {"meta": None, "tracks": []}
    tracks: list[dict] = []
    results = c.current_user_saved_tracks(limit=50)
    while results:
        for it in results.get("items", []):
            tr = _simplify_track((it or {}).get("track") or (it or {}).get("item"))
            if tr:
                tracks.append(tr)
        results = c.next(results) if results.get("next") else None
    meta = {"id": "liked", "name": "Beğenilen Şarkılar", "cover_url": None,
            "owner": None, "total": len(tracks), "type": "liked"}
    return {"meta": meta, "tracks": tracks}


def get_playlist(playlist_id: str) -> dict | None:
    c = _read_client()
    if not c:
        return None
    try:
        pl = c.playlist(playlist_id,
                        fields="id,name,images,owner.display_name,tracks.total,external_urls")
    except Exception:
        return None
    imgs = pl.get("images") or []
    meta = {
        "id": pl.get("id"),
        "name": pl.get("name"),
        "cover_url": imgs[0]["url"] if imgs else None,
        "owner": (pl.get("owner") or {}).get("display_name"),
        "total": (pl.get("tracks") or {}).get("total", 0),
        "type": "playlist",
    }
    tracks: list[dict] = []
    results = c.playlist_items(playlist_id, limit=100, additional_types=["track"])
    while results:
        for it in results.get("items", []):
            tr = _simplify_track((it or {}).get("track") or (it or {}).get("item"))
            if tr:
                tracks.append(tr)
        results = c.next(results) if results.get("next") else None
    return {"meta": meta, "tracks": tracks}


def get_album(album_id: str) -> dict | None:
    c = _read_client()
    if not c:
        return None
    try:
        alb = c.album(album_id)
    except Exception:
        return None
    imgs = alb.get("images") or []
    cover = imgs[0]["url"] if imgs else None
    meta = {
        "id": alb.get("id"),
        "name": alb.get("name"),
        "cover_url": cover,
        "owner": ", ".join(a.get("name") for a in (alb.get("artists") or []) if a.get("name")),
        "total": (alb.get("tracks") or {}).get("total", 0),
        "type": "album",
    }
    tracks: list[dict] = []
    results = alb.get("tracks")
    while results:
        for t in results.get("items", []):
            if not t:
                continue
            # albüm şarkılarında albüm görseli gelmez; enjekte et
            t["album"] = {"name": alb.get("name"), "images": imgs,
                          "release_date": alb.get("release_date")}
            tr = _simplify_track(t, cover_fallback=cover)
            if tr:
                tracks.append(tr)
        results = c.next(results) if results.get("next") else None
    return {"meta": meta, "tracks": tracks}


def get_track(track_id: str) -> dict | None:
    c = _read_client()
    if not c:
        return None
    try:
        t = c.track(track_id)
    except Exception:
        return None
    tr = _simplify_track(t)
    if not tr:
        return None
    meta = {"id": t.get("id"), "name": tr["title"], "cover_url": tr["cover_url"],
            "owner": tr["artist"], "total": 1, "type": "track"}
    return {"meta": meta, "tracks": [tr]}
