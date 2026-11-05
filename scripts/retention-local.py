"""Local D1/R2 integration check for seven-day expiry and running-task protection."""
import glob
import http.cookiejar
import json
import sqlite3
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8788"
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(path, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Origin": BASE, **({"Content-Type": "application/json"} if data else {}), **(headers or {})})
    try:
        with client.open(req, timeout=10) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


session = call("/api/sessions", "POST")[1]
sid = session["session_id"]
example = call("/api/research/examples/ols")[1]
example["plan"]["engine_id"] = "browser_webr"
call("/api/research/candidate", "POST", {"session_id": sid, "question": "没有资料怎样开始？"})
planned = call(f"/api/sessions/{sid}/research/plan", "POST", {
    "filename": example["filename"], "text": example["text"], "candidate": example["plan"]})[1]
plan = planned["plan"]
job = call(f"/api/sessions/{sid}/research/jobs", "POST", {
    "filename": example["filename"], "text": example["text"], "plan": plan,
    "confirmation_token": planned["confirmation"]["token"], "confirmed": True, "simulated": True, "source": example["source"]})[1]
jid = job["id"]

d1_path = glob.glob(".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite")[0]
r2_path = glob.glob(".wrangler/state/v3/r2/miniflare-R2BucketObject/*.sqlite")[0]
d1 = sqlite3.connect(d1_path, timeout=10)
r2 = sqlite3.connect(r2_path, timeout=10)
key = d1.execute("SELECT input_key FROM jobs WHERE id=?", (jid,)).fetchone()[0]
assert d1.execute("SELECT 1 FROM model_interactions WHERE session_id=?", (sid,)).fetchone()
assert r2.execute("SELECT 1 FROM _mf_objects WHERE key=?", (key,)).fetchone()

old = int(time.time() * 1000) - 8 * 86400000
future_lease = int(time.time() * 1000) + 60000
d1.execute("UPDATE sessions SET last_activity=? WHERE id=?", (old, sid))
d1.execute("UPDATE jobs SET last_activity=?,lease_until=? WHERE id=?", (old, future_lease, jid))
d1.commit()
assert call(f"/api/sessions/{sid}/model-evidence/json")[0] == 410

def cleanup():
    status, result = call("/api/retention/cleanup", "POST", headers={"Authorization": "Bearer local-test-only"})
    assert status == 200, result
    return result


first = cleanup()
assert d1.execute("SELECT 1 FROM jobs WHERE id=?", (jid,)).fetchone(), first
assert d1.execute("SELECT 1 FROM sessions WHERE id=?", (sid,)).fetchone(), first
assert r2.execute("SELECT 1 FROM _mf_objects WHERE key=?", (key,)).fetchone(), first

d1.execute("UPDATE jobs SET status='interrupted',lease_until=0 WHERE id=?", (jid,))
d1.commit()
second = cleanup()
assert not d1.execute("SELECT 1 FROM jobs WHERE id=?", (jid,)).fetchone(), second
assert not d1.execute("SELECT 1 FROM sessions WHERE id=?", (sid,)).fetchone(), second
assert not d1.execute("SELECT 1 FROM model_interactions WHERE session_id=?", (sid,)).fetchone(), second
assert not r2.execute("SELECT 1 FROM _mf_objects WHERE key=?", (key,)).fetchone(), second
assert call(f"/api/research/jobs/{jid}")[0] == 404
assert call(f"/api/sessions/{sid}")[0] == 404
print("PASS: running job and session preserved; expired D1 rows and R2 input removed after interrupt; reads denied.")
