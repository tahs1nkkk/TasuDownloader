"""Native Messaging broker. Engine owns jobs independently of this process."""
import json
import os
import subprocess
import sys
import time
from multiprocessing.connection import Client
from pathlib import Path
from protocol import VERSION, MAX_MESSAGE, read_message, write_message
from runtime import address, auth_key, installed_origins

def connect(start=True, progress=None):
    endpoint, family = address()
    key = auth_key()
    try:
        return Client(endpoint, family=family, authkey=key)
    except (OSError, EOFError):
        if not start:
            return None
    if progress:
        progress(24, "Yerel motor başlatılıyor")
    flags = (subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS) if os.name == "nt" else 0
    subprocess.Popen([sys.executable, str(Path(__file__).parent / "engine.py")], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags, start_new_session=os.name != "nt")
    for attempt in range(120):
        time.sleep(.1)
        try:
            if progress and attempt in (9, 29, 59, 89):
                progress(34 + attempt // 2, "Müzik bileşenleri hazırlanıyor")
            return Client(endpoint, family=family, authkey=key)
        except (OSError, EOFError):
            pass
    raise OSError("Motor başlatılamadı")

def main():
    # No invocation from websites, another extension, or an arbitrary CLI origin.
    if len(sys.argv) < 2 or sys.argv[1] not in installed_origins():
        write_message(sys.stdout.buffer, {"version": VERSION, "ok": False, "error": "Bu eklentiye yerel motor izni verilmemiş"})
        return
    try:
        request = read_message(sys.stdin.buffer)
        if request is None:
            return
        wants_progress = request.get("params", {}).pop("_progress", False) is True
        def report(percent, stage):
            if wants_progress:
                write_message(sys.stdout.buffer, {"version": VERSION, "ok": True, "progress": {"percent": percent, "stage": stage}})
        report(10, "Windows yardımcısı bulundu")
        pipe = connect(start=request["method"] != "release", progress=report)
        if pipe is None:
            response = {"version": VERSION, "ok": True, "data": {"idle": True}}
        else:
            with pipe:
                report(92, "Motor yanıtı bekleniyor")
                pipe.send_bytes(json.dumps(request).encode())
                if not pipe.poll(115):
                    raise TimeoutError()
                response = json.loads(pipe.recv_bytes(MAX_MESSAGE))
        report(100, "Motor hazır")
        write_message(sys.stdout.buffer, response)
    except Exception:
        write_message(sys.stdout.buffer, {"version": VERSION, "ok": False, "error": "Yerel motor bağlantısı kurulamadı veya yanıt süresi doldu. Kurulumu kontrol et."})

if __name__ == "__main__":
    main()
