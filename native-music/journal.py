"""Durable idempotency and progress without recording tokens or credentials."""
import json
import sqlite3
import threading
import time
import uuid

class Journal:
    def __init__(self, path):
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, state TEXT NOT NULL, updated REAL NOT NULL)")
        for jid, raw in self.db.execute("SELECT id,state FROM jobs").fetchall():
            state = json.loads(raw)
            if state["status"] in ("running", "queued"):
                state["status"] = "interrupted"
                self.db.execute("UPDATE jobs SET state=? WHERE id=?", (json.dumps(state), jid))
        self.db.commit()

    def create(self, request_id, count, title):
        with self.lock:
            row = self.db.execute("SELECT state FROM jobs WHERE request_id=?", (request_id,)).fetchone()
            if row:
                return json.loads(row[0]), False
            state = {"id": uuid.uuid4().hex, "status": "queued", "total": count, "completed": 0, "errors": 0, "title": str(title)[:200]}
            self.db.execute("INSERT INTO jobs VALUES (?,?,?,?)", (state["id"], request_id, json.dumps(state), time.time()))
            self.db.commit()
            return state, True

    def update(self, jid, **fields):
        with self.lock:
            state = self.get(jid)
            state.update(fields)
            self.db.execute("UPDATE jobs SET state=?,updated=? WHERE id=?", (json.dumps(state), time.time(), jid))
            self.db.commit()

    def get(self, jid):
        with self.lock:
            row = self.db.execute("SELECT state FROM jobs WHERE id=?", (jid,)).fetchone()
            return json.loads(row[0]) if row else None

    def recent(self):
        with self.lock:
            return [json.loads(row[0]) for row in self.db.execute("SELECT state FROM jobs ORDER BY updated DESC LIMIT 100").fetchall()]

    def close(self):
        self.db.close()
