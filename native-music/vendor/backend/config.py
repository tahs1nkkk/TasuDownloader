"""Uygulama ayarları — .env dosyasından okunur."""
from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# --- Spotify uygulama bilgileri (Spotify Developer Dashboard'dan) ---
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()

# --- Sunucu ---
APP_HOST = "127.0.0.1"
APP_PORT = int(os.getenv("APP_PORT", "8765"))
# Spotify yalnızca 127.0.0.1 (loopback) veya https redirect kabul eder.
REDIRECT_URI = f"http://{APP_HOST}:{APP_PORT}/callback"

# Gizli playlist'ler + beğenilen şarkılar için gereken izinler.
SPOTIFY_SCOPE = "playlist-read-private playlist-read-collaborative user-library-read"


def _user_data_dir() -> Path:
    """Kişisel oturum/ayar verisi için kullanıcı profili altındaki klasör.

    Spotify token'ı ve kişisel ayarları (ör. seçili indirme klasörü) PROJE
    KLASÖRÜNDE tutmuyoruz: böylece klasörü/zip'i başkasına verince ne Spotify
    oturumun ne de makinene özel yolların onunla gider. Yalnız bu makinedeki
    kullanıcı profilinde saklanır.
    """
    base = os.getenv("LOCALAPPDATA") or os.getenv("APPDATA")
    root = Path(base) if base else (Path.home() / ".config")
    d = root / "SpotifyYouTubeIndirici"
    d.mkdir(parents=True, exist_ok=True)
    return d


USER_DATA_DIR = _user_data_dir()
SPOTIFY_TOKEN_CACHE = str(USER_DATA_DIR / "spotify_token.json")
# Kişisel ayarlar (proje dışında, paylaşıma girmez): seçili indirme klasörü vb.
_SETTINGS_FILE = USER_DATA_DIR / "ayarlar.json"

# Eski sürümlerde token proje içi .cache/ altında tutuluyordu. Klasör başka
# bilgisayara kopyalandığında oturum sızmasın diye proje içindeki bu eski kopyayı
# sessizce SİL (taşıma yok — kopyalanmış makinede taşımak sızıntı olurdu).
_legacy_token = BASE_DIR / ".cache" / "spotify_token.json"
try:
    if _legacy_token.exists():
        _legacy_token.unlink()
except Exception:
    pass


# --- Kişisel ayar dosyası (kullanıcı profilinde) ---
def _read_settings() -> dict:
    try:
        return json.loads(_SETTINGS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_settings(data: dict) -> None:
    try:
        _SETTINGS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                                  encoding="utf-8")
    except Exception:
        pass


# --- İndirme klasörü ---
# Varsayılan: .env'deki DOWNLOAD_DIR ya da proje altındaki downloads/.
_DEFAULT_DOWNLOAD_DIR = (BASE_DIR / os.getenv("DOWNLOAD_DIR", "downloads")).resolve()


def _initial_download_dir() -> Path:
    """Kullanıcının ayarlardan seçtiği indirme klasörü; yoksa varsayılan."""
    saved = _read_settings().get("download_dir")
    if saved:
        try:
            p = Path(saved).expanduser()
            p.mkdir(parents=True, exist_ok=True)
            return p.resolve()
        except Exception:
            pass   # yol artık geçersiz (silinmiş/başka makine) → varsayılana düş
    return _DEFAULT_DOWNLOAD_DIR


DOWNLOAD_DIR = _initial_download_dir()
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


def set_download_dir(path: str | None) -> Path:
    """İndirme klasörünü değiştir ve kalıcı kaydet (kullanıcı profilinde).

    Boş/None verilirse varsayılana (proje downloads/) döner. Yeni klasör
    oluşturulamazsa hata yükseltir (çağıran yakalar). Güncel DOWNLOAD_DIR'i döner.
    """
    global DOWNLOAD_DIR
    if path and str(path).strip():
        p = Path(str(path).strip()).expanduser()
        p.mkdir(parents=True, exist_ok=True)     # erişilemezse OSError → çağıran yakalar
        DOWNLOAD_DIR = p.resolve()
        s = _read_settings()
        s["download_dir"] = str(DOWNLOAD_DIR)
        _write_settings(s)
    else:
        DOWNLOAD_DIR = _DEFAULT_DOWNLOAD_DIR
        DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
        s = _read_settings()
        s.pop("download_dir", None)
        _write_settings(s)
    return DOWNLOAD_DIR


# Kalite presetleri -> hedef MP3 bit hızı (kbps)
PRESETS = {
    "dusuk": "128",
    "orta": "192",
    "yuksek": "256",
    "en_yuksek": "320",
}
DEFAULT_PRESET = "en_yuksek"


def spotify_configured() -> bool:
    """Client ID/Secret girilmiş mi?"""
    return bool(SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET)
