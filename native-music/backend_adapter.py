"""Safety changes around the frozen vendor without changing the source project."""
import os
from pathlib import Path
import shutil
import tempfile

def install(downloader):
    original = downloader._download_one
    def isolated(item, preset, folder, *args, **kwargs):
        destination = Path(folder).resolve()
        # Vendor retry cleanup may remove matching completed files. Give each
        # operation its own empty staging directory, never the user's library.
        stage = Path(tempfile.mkdtemp(prefix=".tasu-job-", dir=destination)).resolve()
        try:
            result = Path(original(item, preset, stage, *args, **kwargs)).resolve()
            if result.parent != stage or not result.is_file():
                raise ValueError("Geçersiz çıktı dosyası")
            for number in range(10000):
                target = destination / (result.name if number == 0 else f"{result.stem} ({number}){result.suffix}")
                try:
                    try:
                        os.link(result, target)  # Atomic no-overwrite, same volume.
                    except FileExistsError:
                        continue
                    except OSError:
                        with target.open("xb") as output, result.open("rb") as source:
                            shutil.copyfileobj(source, output)
                    return str(target)
                except FileExistsError:
                    continue
            raise ValueError("Aynı isimde çok fazla dosya var")
        finally:
            if stage.parent == destination and stage.name.startswith(".tasu-job-"):
                shutil.rmtree(stage, ignore_errors=True)
    downloader._download_one = isolated

def error_summary(items):
    text = " ".join(str(x.get("error", "")) for x in items if x.get("status") == "error").lower()
    if not text:
        return {}
    if any(x in text for x in ("no space", "disk full", "errno 28", "winerror 112")):
        code, message = "disk_full", "Diskte boş alan yok. Yer açıp yeniden dene."
    elif any(x in text for x in ("429", "rate limit", "too many requests")):
        code, message = "rate_limit", "Kaynak istek sınırına ulaşıldı. Bir süre bekleyip yeniden dene."
    elif any(x in text for x in ("sign in", "login", "private", "401", "403", "cookies")):
        code, message = "source_access", "Kaynağa erişilemiyor veya oturum gerekiyor. Bağlantıyı ve hesabını kontrol et."
    elif "ffmpeg" in text:
        code, message = "conversion", "Dönüştürme başarısız. FFmpeg kurulumunu ve disk alanını kontrol et."
    else:
        code, message = "source_failed", "Bazı kaynaklar indirilemedi. Bağlantıyı kontrol edip yeniden dene."
    return {"error_code": code, "error_message": message}
