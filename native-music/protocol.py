"""Small versioned JSON protocol; no arbitrary URLs, commands, or binary media."""
import json
import re
import struct
from urllib.parse import urlparse

VERSION = 1
MAX_MESSAGE = 1024 * 1024
METHODS = {"status", "preview", "search", "library", "liked", "download", "jobs", "job", "login", "logout", "folder", "resetFolder", "openFolder", "exportZip", "heartbeat", "release"}

def validate(message):
    if not isinstance(message, dict) or message.get("version") != VERSION:
        raise ValueError("Uyumsuz protokol sürümü")
    if message.get("method") not in METHODS:
        raise ValueError("Bilinmeyen işlem")
    if not isinstance(message.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", message["id"]):
        raise ValueError("Geçersiz işlem kimliği")
    if not isinstance(message.get("params", {}), dict):
        raise ValueError("Geçersiz parametre")
    return message

def media_url(value):
    if not isinstance(value, str) or len(value) > 4096:
        raise ValueError("Geçersiz medya bağlantısı")
    if re.fullmatch(r"spotify:(track|album|playlist):[A-Za-z0-9]+", value):
        return value
    url = urlparse(value)
    if url.scheme != "https" or url.username or url.password or url.port not in (None, 443):
        raise ValueError("Yalnızca HTTPS medya bağlantıları desteklenir")
    if url.hostname not in {"youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be", "open.spotify.com"}:
        raise ValueError("Yalnızca Spotify ve YouTube bağlantıları desteklenir")
    return value

def read_message(stream):
    head = stream.read(4)
    if not head:
        return None
    if len(head) != 4:
        raise ValueError("Eksik ileti başlığı")
    length = struct.unpack("<I", head)[0]
    if length > MAX_MESSAGE:
        raise ValueError("İleti çok büyük")
    data = stream.read(length)
    if len(data) != length:
        raise ValueError("Eksik ileti")
    return validate(json.loads(data.decode("utf-8")))

def write_message(stream, message):
    data = json.dumps(message, ensure_ascii=False).encode("utf-8")
    if len(data) > MAX_MESSAGE:
        data = json.dumps({"version": VERSION, "ok": False, "error": "Yanıt çok büyük; daha küçük bir liste kullan."}).encode()
    stream.write(struct.pack("<I", len(data)) + data)
    stream.flush()
