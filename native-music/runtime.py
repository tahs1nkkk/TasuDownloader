"""Per-user, authenticated pipe shared by the short-lived host and engine."""
import base64
import ctypes
import hashlib
import json
import os
import secrets
import tempfile
import sys
from pathlib import Path

def data_dir():
    base = Path(os.environ.get("TASU_MUSIC_DATA") or Path(os.environ.get("LOCALAPPDATA", Path.home())) / "TasuApps" / "Music")
    base.mkdir(parents=True, exist_ok=True)
    return base

def protect(data, decrypt=False):
    if os.name != "nt":
        return data  # Unix test runtime; chmod protects the temporary profile.
    class Blob(ctypes.Structure):
        _fields_ = [("size", ctypes.c_ulong), ("data", ctypes.POINTER(ctypes.c_ubyte))]
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    result = Blob()
    fn = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    if not fn(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
        raise OSError("Windows kullanıcı korumasına erişilemedi")
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        ctypes.windll.kernel32.LocalFree(result.data)

def auth_key():
    target = data_dir() / "pipe.key"
    if not target.exists():
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix="pipe-key-", delete=False) as file:
                temporary = Path(file.name)
                file.write(protect(secrets.token_bytes(32)))
            if os.name != "nt":
                temporary.chmod(0o600)
            os.link(temporary, target)  # Publish complete bytes atomically, no overwrite.
        except FileExistsError:
            pass
        finally:
            if temporary:
                temporary.unlink(missing_ok=True)
    return protect(target.read_bytes(), decrypt=True)

def address():
    name = hashlib.sha256(str(data_dir()).encode()).hexdigest()[:20]
    return (r"\\.\pipe\tasu-music-" + name, "AF_PIPE") if os.name == "nt" else (str(data_dir() / "engine.sock"), "AF_UNIX")

def installed_origins():
    try:
        return json.loads((Path(__file__).parent / "com.tasuapps.music.json").read_text(encoding="utf-8-sig"))["allowed_origins"]
    except (OSError, ValueError, KeyError):
        return []
