"""Single-user on-demand engine; sequential jobs survive popup/broker closure."""
import hmac
import json
import os
import queue
import re
import secrets
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from multiprocessing.connection import Listener
from multiprocessing import AuthenticationError
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from journal import Journal
from protocol import VERSION, MAX_MESSAGE, validate, media_url
from runtime import data_dir, address, auth_key, protect
from backend_adapter import install as adapt_backend, error_summary
from options import preferences

BASE = Path(__file__).parent
IDLE_SECONDS = 300

class Engine:
    def __init__(self):
        self.last_seen = time.monotonic()
        self.jobs = Journal(data_dir() / "jobs.sqlite3")
        self.queue = queue.Queue()
        self.active_job = False
        self.oauth = None
        self.source = None
        self.lock = threading.RLock()
        self.requests = 0
        self.oauth_deadline = 0
        threading.Thread(target=self._run_jobs, daemon=True).start()

    def backend(self):
        with self.lock:
            if self.source:
                return self.source
            from dotenv import load_dotenv
            setting = data_dir() / "installation.json"
            legacy = json.loads(setting.read_text(encoding="utf-8-sig")).get("source_project") if setting.exists() else None
            if legacy:
                legacy_path = Path(legacy).resolve()
                load_dotenv(legacy_path / ".env", override=False)
                raw = os.getenv("DOWNLOAD_DIR", "downloads")
                os.environ["DOWNLOAD_DIR"] = str((legacy_path / raw).resolve())
            sys.path.insert(0, str(BASE / "vendor"))
            from backend import config, downloader, spotify_client, youtube_client
            if not getattr(downloader, "_tasu_adapted", False):
                adapt_backend(downloader)
                downloader._tasu_adapted = True
            # Protect future OAuth cache writes with the Windows user key.
            from spotipy.cache_handler import CacheHandler
            cache_file = data_dir() / "spotify.dpapi"
            class UserCache(CacheHandler):
                def get_cached_token(self):
                    try:
                        return json.loads(protect(cache_file.read_bytes(), decrypt=True))
                    except (OSError, ValueError):
                        return None
                def save_token_to_cache(self, token_info):
                    cache_file.write_bytes(protect(json.dumps(token_info).encode()))
            manager = spotify_client._get_oauth()
            if manager:
                manager.cache_handler = UserCache()
            self.source = (config, downloader, spotify_client, youtube_client)
            return self.source

    def dispatch(self, message):
        validate(message)
        self.last_seen = time.monotonic()
        method, args = message["method"], message.get("params", {})
        if method in ("heartbeat", "release"):
            return {"idle_seconds": IDLE_SECONDS, "active_job": self.active_job}
        if method == "jobs":
            return self.jobs.recent()
        if method == "job":
            return self.jobs.get(str(args.get("id", "")))
        config, downloader, sp, yt = self.backend()
        if method == "status":
            return {"spotify_configured": config.spotify_configured(), "download_dir": str(config.DOWNLOAD_DIR), "ffmpeg_ok": bool(downloader._FFMPEG)}
        if method in ("library", "liked"):
            if not sp.user_client():
                raise ValueError("Spotify oturumu gerekli; yeniden giriş yap")
            return sp.get_user_playlists() if method == "library" else sp.get_liked_tracks()
        if method in ("preview", "search"):
            choice = preferences(args)
            value = str(args.get("input", "")).strip()
            if not value or len(value) > 4096:
                raise ValueError("Bağlantı veya arama gir")
            if method == "search":
                limit=max(1,min(300,int(args.get("result_limit",50))))
                duration=max(0,min(86400,int(args.get("max_duration",0))))
                return yt.search(value, limit=limit, cookies=choice["cookies"], max_duration=duration)
            media_url(value)
            match = re.search(r"(?:open\.spotify\.com/(?:intl-\w+/)?|spotify:)(track|album|playlist)[/:]([A-Za-z0-9]+)", value)
            if match:
                if not config.spotify_configured():
                    raise ValueError("Spotify Client ID/Secret yerel yardımcıda yapılandırılmalı")
                result = {"track": sp.get_track, "album": sp.get_album, "playlist": sp.get_playlist}[match[1]](match[2])
                if not result:
                    raise ValueError("Spotify öğesine erişilemiyor; oturumu ve API iznini kontrol et")
                result["source"] = "spotify"
                for item in result.get("items", result.get("tracks", [])):
                    item["source"] = "spotify"
                return result
            return yt.fetch(value, cookies=choice["cookies"])
        if method == "download":
            choice = preferences(args)
            items = args.get("items")
            if not isinstance(items, list) or not 1 <= len(items) <= 500:
                raise ValueError("1–500 öğe seç")
            safe = []
            for item in items:
                if not isinstance(item, dict):
                    raise ValueError("Geçersiz medya")
                # Drop extractor options/cookies/paths supplied by the page.
                clean = {k: item[k] for k in ("title", "artist", "album", "cover_url", "youtube_url", "spotify_url", "source", "duration", "duration_ms", "id", "track_number", "release_year", "search_query") if k in item and isinstance(item[k], (str, int, float))}
                if any(isinstance(v, str) and len(v) > 4096 for v in clean.values()):
                    raise ValueError("Medya bilgisi çok uzun")
                if clean.get("youtube_url"):
                    media_url(clean["youtube_url"])
                    if urlparse(clean["youtube_url"]).hostname == "open.spotify.com":
                        raise ValueError("YouTube kaynağı geçersiz")
                if not clean.get("youtube_url") and clean.get("source") != "spotify":
                    raise ValueError("Medya kaynağı eksik")
                cover = urlparse(str(clean.get("cover_url", "")))
                if cover.scheme != "https" or cover.hostname not in {"i.scdn.co", "mosaic.scdn.co", "i.ytimg.com", "img.youtube.com"}:
                    clean.pop("cover_url", None)
                safe.append(clean)
            if args.get("preset", "yuksek") not in {"dusuk", "orta", "yuksek", "en_yuksek"} or args.get("fmt", "mp3") not in {"mp3", "mp4"}:
                raise ValueError("Geçersiz çıktı biçimi")
            state, fresh = self.jobs.create(message["id"], len(safe), str(args.get("subfolder", "")))
            if fresh:
                self.queue.put((state["id"], safe, {**choice,"preset": args.get("preset", "yuksek"), "fmt": args.get("fmt", "mp3"), "subfolder": downloader._sanitize(str(args.get("subfolder") or "Music"))}))
            return state
        if method == "login":
            self.login(sp, config)
            return {"opened": True}
        if method == "logout":
            sp.logout()
            (data_dir() / "spotify.dpapi").unlink(missing_ok=True)
            self.source = None
            return {"logged_in": False}
        if method == "folder":
            import tkinter
            from tkinter import filedialog
            root = tkinter.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            try:
                value = filedialog.askdirectory(initialdir=str(config.DOWNLOAD_DIR), title="Tasu Apps indirme klasörü")
                if value:
                    config.set_download_dir(value)
            finally:
                root.destroy()
            return {"download_dir": str(config.DOWNLOAD_DIR)}
        if method == "resetFolder":
            config.set_download_dir(None)
            return {"download_dir": str(config.DOWNLOAD_DIR)}
        if method == "openFolder":
            os.startfile(str(config.DOWNLOAD_DIR))
            return {"opened": True}
        if method == "exportZip":
            import fnmatch
            import zipfile
            from datetime import datetime
            installation = json.loads((data_dir() / "installation.json").read_text(encoding="utf-8-sig"))
            root = Path(installation.get("source_project", "")).resolve()
            if not (root / "backend" / "config.py").is_file():
                raise ValueError("Paylaşılacak Spotify projesi bulunamadı")
            desktop = Path.home() / "Desktop"
            output_dir = desktop if desktop.is_dir() else root.parent
            stem = f"spotify-youtube-indirici-{datetime.now():%Y%m%d-%H%M}"
            output = output_dir / f"{stem}.zip"
            suffix = 1
            while output.exists():
                output = output_dir / f"{stem} ({suffix}).zip"
                suffix += 1
            excluded_dirs = {".venv", "__pycache__", ".cache", "downloads", ".git", ".idea", ".vscode", "node_modules", ".claude"}
            count = 0
            try:
                with zipfile.ZipFile(output, "x", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
                    for folder, directories, files in os.walk(root):
                        directories[:] = [name for name in directories if name not in excluded_dirs]
                        for name in files:
                            if name == ".env" or any(fnmatch.fnmatch(name, pattern) for pattern in ("*.pyc", "*.zip", "*.log")):
                                continue
                            source = Path(folder) / name
                            archive.write(source, (Path(root.name) / source.relative_to(root)).as_posix())
                            count += 1
            except Exception:
                output.unlink(missing_ok=True)
                raise
            subprocess.Popen(["explorer.exe", f"/select,{output}"], creationflags=subprocess.CREATE_NO_WINDOW)
            return {"created": True, "files": count}
        raise ValueError("Bilinmeyen işlem")

    def login(self, sp, config):
        if not sp._get_oauth():
            raise ValueError("Spotify yapılandırılmamış")
        if self.oauth:
            raise ValueError("Spotify giriş penceresi zaten açık")
        state = secrets.token_urlsafe(32)
        self.oauth_deadline = time.monotonic() + 600
        engine = self
        class Callback(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                parsed = urlparse(self.path)
                args = parse_qs(parsed.query)
                valid = parsed.path == "/callback" and time.monotonic() < engine.oauth_deadline and hmac.compare_digest(args.get("state", [""])[0], state)
                if not valid:
                    self.send_error(403)
                    return
                try:
                    code = args.get("code", [""])[0]
                    if not code:
                        raise ValueError()
                    sp.handle_callback(code)
                    text = "Spotify connected. You can close this tab."
                    self.send_response(200)
                except Exception:
                    text = "Spotify sign-in failed. Please retry from Tasu Apps."
                    self.send_response(400)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(text.encode())
                engine.oauth_deadline = 0
        try:
            server = HTTPServer(("127.0.0.1", config.APP_PORT), Callback)
        except OSError:
            self.oauth_deadline = 0
            raise ValueError("Spotify giriş portu kullanımda; eski yerel sunucuyu kapatıp tekrar dene")
        self.oauth = server
        server.timeout = .5
        def run():
            try:
                while time.monotonic() < self.oauth_deadline:
                    server.handle_request()
            finally:
                server.server_close()
                self.oauth = None
                self.last_seen = time.monotonic()
        threading.Thread(target=run, daemon=True).start()
        webbrowser.open(sp._get_oauth().get_authorize_url(state=state))

    def _run_jobs(self):
        while True:
            jid, items, opts = self.queue.get()
            self.active_job = True
            try:
                _, downloader, _, _ = self.backend()
                self.jobs.update(jid, status="running")
                vendor_id = downloader.start_download(items, opts["preset"], opts["subfolder"], opts["cookies"], naming=opts["naming"], fmt=opts["fmt"], video_quality=opts["video_quality"], options=opts["options"])
                while True:
                    record = downloader.get_job(vendor_id)
                    fields = {k: record[k] for k in ("status", "completed", "total", "errors", "current_title", "stage", "current_progress") if k in record}
                    fields.update(error_summary(record.get("items", [])))
                    if record["status"] == "done" and record.get("errors"):
                        fields["status"] = "partial" if record.get("completed") else "error"
                    self.jobs.update(jid, **fields)
                    if record["status"] == "done":
                        break
                    time.sleep(.7)
            except Exception as error:
                self.jobs.update(jid, status="error", errors=len(items), **error_summary([{"status":"error","error":str(error)}]))
            finally:
                self.active_job = False
                self.last_seen = time.monotonic()
                self.queue.task_done()

    def can_exit(self):
        return not self.active_job and self.queue.empty() and not self.requests and not self.oauth and time.monotonic() - self.last_seen >= IDLE_SECONDS

def main():
    endpoint, family = address()
    # Acquiring the pipe before opening the journal prevents a second launch from
    # marking live jobs interrupted. The existing owner always wins.
    try:
        server = Listener(endpoint, family=family, authkey=auth_key())
    except OSError:
        return
    engine = Engine()
    def watchdog():
        while True:
            time.sleep(1)
            if engine.can_exit():
                server.close()
                engine.jobs.close()
                os._exit(0)
    threading.Thread(target=watchdog, daemon=True).start()
    def handle(connection):
        engine.requests += 1
        try:
            message = json.loads(connection.recv_bytes(MAX_MESSAGE))
            result = {"version": VERSION, "ok": True, "data": engine.dispatch(message)}
        except ValueError as error:
            result = {"version": VERSION, "ok": False, "error": str(error)[:180]}
        except Exception:
            result = {"version": VERSION, "ok": False, "error": "İşlem başarısız. Oturum, API sınırı, kaynak erişimi veya disk alanını kontrol et."}
        try:
            raw = json.dumps(result).encode()
            if len(raw) > MAX_MESSAGE:
                raw = json.dumps({"version": VERSION, "ok": False, "error": "Liste çok büyük"}).encode()
            connection.send_bytes(raw)
        except (BrokenPipeError, EOFError, OSError):
            pass
        finally:
            connection.close()
            engine.requests -= 1
            engine.last_seen = time.monotonic()
    while True:
        try:
            conn = server.accept()
            threading.Thread(target=handle, args=(conn,), daemon=True).start()
        except AuthenticationError:
            continue
        except (OSError, EOFError):
            break

if __name__ == "__main__":
    main()
