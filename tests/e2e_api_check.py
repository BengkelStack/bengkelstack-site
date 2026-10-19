#!/usr/bin/env python3
"""E2E API contract check for the static pages against the mock core engine.

    node tests/mock_core_api.js 8091 &
    python tests/e2e_api_check.py 8091

Stdlib only. Exercises the exact endpoints the pages call, plus the static
routes and the negative paths the front end depends on (401, 404, traversal).
"""
import http.client
import json
import sys

HOST = "127.0.0.1"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8091

ADMIN = ("admin@bengkelstack.com", "SuperSecretAdminPass123!")
OWNER = ("dimas@bengkeljaya.com", "BengkelJaya2026!")

passed = 0


def req(method, path, body=None, token=None):
    conn = http.client.HTTPConnection(HOST, PORT, timeout=10)
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    conn.request(method, path, body=json.dumps(body) if body is not None else None, headers=headers)
    res = conn.getresponse()
    raw = res.read().decode("utf-8", "replace")
    conn.close()
    try:
        return res.status, json.loads(raw) if raw else {}
    except ValueError:
        return res.status, {"_raw": raw}


def check(name, cond, detail=""):
    global passed
    if not cond:
        print(f"[FAIL] {name} {detail}")
        raise SystemExit(1)
    print(f"[PASS] {name}")
    passed += 1


# ---- auth -------------------------------------------------------------
code, data = req("POST", "/api/v1/auth/login", {"email": "wrong@x.y", "password": "nope"})
check("login rejects bad credentials (401)", code == 401 and "error" in data, f"got {code} {data}")

code, owner = req("POST", "/api/v1/auth/login", {"email": OWNER[0], "password": OWNER[1]})
check("owner login returns token + tenant", code == 200 and owner["data"]["user"]["role"] == "OWNER" and owner["data"]["tenant"]["slug"] == "jaya-abadi")

code, adm = req("POST", "/api/v1/auth/login", {"email": ADMIN[0], "password": ADMIN[1]})
check("superadmin login", code == 200 and adm["data"]["user"]["role"] == "SUPERADMIN")
TOKEN = adm["data"]["tokens"]["access_token"]

# ---- admin tenants (what admin.html calls) ----------------------------
code, data = req("GET", "/api/v1/admin/tenants")
check("tenants require auth (401)", code == 401, f"got {code}")

code, data = req("GET", "/api/v1/admin/tenants", token=TOKEN)
check("tenants list for admin.html", code == 200 and len(data["data"]) == 4, f"got {code} {data}")

code, data = req("PATCH", "/api/v1/admin/tenants/4", {"status": "ACTIVE", "sync": "Just now"}, token=TOKEN)
check("PATCH tenant mutation (admin.html modal)", code == 200 and data["data"]["status"] == "ACTIVE", f"got {code} {data}")

code, data = req("PATCH", "/api/v1/admin/tenants/999", {"status": "ACTIVE"}, token=TOKEN)
check("PATCH unknown tenant -> 404", code == 404, f"got {code}")

code, data = req("GET", "/api/v1/admin/tenants", token=owner["data"]["tokens"]["access_token"])
check("owner token accepted on admin route (mock has no RBAC)", code == 200, f"got {code}")

# ---- owner settings (what owner.html calls) ---------------------------
TOKEN_O = owner["data"]["tokens"]["access_token"]
code, data = req("PUT", "/api/v1/workshop/settings", {"setWaContact": "0811111", "setReceiptHeader": "E2E HEADER"}, token=TOKEN_O)
check("PUT workshop settings", code == 200, f"got {code} {data}")

code, data = req("GET", "/api/v1/workshop/settings", token=TOKEN_O)
check("settings persist server-side", code == 200 and data["data"]["setReceiptHeader"] == "E2E HEADER", f"got {code} {data}")

code, data = req("PUT", "/api/v1/workshop/settings", {"x": 1})
check("settings require auth (401)", code == 401, f"got {code}")

# ---- static routes ----------------------------------------------------
for path, expect in [("/", 200), ("/login.html", 200), ("/admin.html", 200),
                     ("/owner.html", 200), ("/maintenance.html", 200),
                     ("/nope.html", 404)]:
    code, _ = req("GET", path)
    check(f"GET {path} -> {expect}", code == expect, f"got {code}")

# path traversal must never resolve outside the site root
code, _ = req("GET", "/../windows/win.ini")
check("path traversal blocked (403/404)", code in (403, 404), f"got {code}")

code, data = req("GET", "/api/v1/nope")
check("unknown API route -> 404 json", code == 404 and "error" in data, f"got {code}")

print(f"\nALL {passed} E2E API CONTRACT CHECKS PASSED (mock core engine on :{PORT})\n")
