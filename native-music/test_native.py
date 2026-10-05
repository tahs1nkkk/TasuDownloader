import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from journal import Journal
from protocol import read_message, write_message, validate, media_url
import engine
from runtime import protect
from backend_adapter import install as adapt_backend, error_summary
from options import preferences

class NativeTests(unittest.TestCase):
    def test_advanced_preferences_allow_no_arbitrary_extractor_options(self):
        result=preferences({"cookies_from_browser":"edge","video_quality":"720","embed_cover":False,"naming":{"artist":False,"order":"title_first","separator":" _ "}})
        self.assertEqual(result["cookies"],"edge");self.assertEqual(result["video_quality"],"720");self.assertFalse(result["options"]["embed_cover"])
        for args in ({"cookies_from_browser":"C:/secret"},{"video_quality":"../../x"},{"naming":{"separator":"/"}},{"ascii_tr":"true"}):
            with self.assertRaises(ValueError):preferences(args)
    def test_download_retry_cannot_remove_existing_media(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);(folder/"song.mp3").write_bytes(b"existing")
            def vendor(item,preset,stage,*args):
                for file in stage.iterdir():file.unlink()
                result=stage/"song.mp3";result.write_bytes(b"new");return str(result)
            backend=SimpleNamespace(_download_one=vendor);adapt_backend(backend)
            saved=backend._download_one({},"yuksek",folder,None)
            self.assertEqual((folder/"song.mp3").read_bytes(),b"existing")
            self.assertEqual(Path(saved).read_bytes(),b"new");self.assertEqual(Path(saved).name,"song (1).mp3")
            self.assertFalse(list(folder.glob(".tasu-job-*")))
    def test_error_messages_do_not_expose_source_or_credentials(self):
        result=error_summary([{"status":"error","error":"HTTP 429 https://secret.test/token=secret"}])
        self.assertEqual(result["error_code"],"rate_limit");self.assertNotIn("secret",json.dumps(result))
        self.assertEqual(error_summary([{"status":"error","error":"[Errno 28] No space left"}])["error_code"],"disk_full")
    def test_protocol_and_url_boundary(self):
        msg={"version":1,"id":"test-1","method":"status","params":{}}
        stream=io.BytesIO();write_message(stream,msg);stream.seek(0)
        self.assertEqual(read_message(stream),msg)
        for value in ["http://127.0.0.1/x","file:///C:/secret","https://youtube.com.evil.test/x","https://youtube.com@evil.test/x","https://youtube.com:8080/x"]:
            with self.assertRaises(ValueError):media_url(value)
        self.assertEqual(media_url("https://www.youtube.com/watch?v=abcdefghijk"),"https://www.youtube.com/watch?v=abcdefghijk")
        self.assertEqual(validate({**msg,"method":"resetFolder"})["method"],"resetFolder")
        self.assertEqual(validate({**msg,"method":"exportZip"})["method"],"exportZip")
        with self.assertRaises(ValueError):validate({**msg,"method":"exec"})
        with self.assertRaises(ValueError):read_message(io.BytesIO(struct.pack("<I",2**24)))

    def test_windows_user_key_roundtrip(self):
        data=b"synthetic-test-token";self.assertEqual(protect(protect(data),decrypt=True),data)
        if os.name=="nt":self.assertNotEqual(protect(data),data)

    def test_journal_idempotency_and_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"jobs.sqlite3";journal=Journal(path)
            first,fresh=journal.create("request-1",3,"test");self.assertTrue(fresh)
            again,fresh=journal.create("request-1",3,"test");self.assertFalse(fresh);self.assertEqual(first["id"],again["id"])
            journal.update(first["id"],status="running",completed=1);journal.close()
            journal=Journal(path);self.assertEqual(journal.get(first["id"])["status"],"interrupted");self.assertEqual(len(journal.recent()),1);journal.close()

    def test_engine_jobs_survive_caller_and_idle_guard(self):
        with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{"TASU_MUSIC_DATA":tmp}):
            app=engine.Engine();calls=[];start=time.monotonic()
            def download(items,preset,folder,cookies,**opts):calls.append(items);return "fake"
            def progress(_):return {"status":"done" if time.monotonic()-start>.1 else "running","total":1,"completed":1,"errors":0}
            backend=SimpleNamespace(_sanitize=lambda s:s,start_download=download,get_job=progress)
            app.source=(SimpleNamespace(),backend,SimpleNamespace(),SimpleNamespace())
            msg={"version":1,"id":"request-2","method":"download","params":{"items":[{"title":"test","source":"youtube","youtube_url":"https://www.youtube.com/watch?v=abcdefghijk"}]}}
            first=app.dispatch(msg);again=app.dispatch(msg);self.assertEqual(first["id"],again["id"])
            # Simulate the popup/broker vanishing: no further request is necessary.
            for _ in range(40):
                if app.jobs.get(first["id"])["status"]=="done":break
                time.sleep(.05)
            self.assertEqual(app.jobs.get(first["id"])["status"],"done");self.assertEqual(len(calls),1)
            app.last_seen=time.monotonic()-301;self.assertTrue(app.can_exit());app.active_job=True;self.assertFalse(app.can_exit());app.active_job=False;app.jobs.close()

    def test_real_authenticated_pipe_and_automatic_exit(self):
        from multiprocessing.connection import Client
        from runtime import address,auth_key
        with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{"TASU_MUSIC_DATA":tmp}):
            process=subprocess.Popen([sys.executable,"-c","import engine; engine.IDLE_SECONDS=1; engine.main()"],cwd=Path(__file__).parent,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            try:
                endpoint,family=address();pipe=None
                for _ in range(80):
                    if process.poll() is not None:break
                    try:pipe=Client(endpoint,family=family,authkey=auth_key());break
                    except (OSError,EOFError):time.sleep(.05)
                self.assertIsNotNone(pipe,"engine did not start")
                with pipe:
                    pipe.send_bytes(json.dumps({"version":1,"id":"pipe-test","method":"jobs","params":{}}).encode())
                    self.assertTrue(pipe.poll(5));result=json.loads(pipe.recv_bytes());self.assertTrue(result["ok"]);self.assertEqual(result["data"],[])
                process.wait(timeout=6);self.assertEqual(process.returncode,0)
            finally:
                if process.poll() is None:process.terminate();process.wait(timeout=5)
                process.stderr.close()

if __name__=="__main__":unittest.main()
