"""End-to-end check of the patient API against a running server (default http://localhost:3000).
Creates a throw-away patient (phone 9000000001), exercises every endpoint and prints PASS / FAIL.
Run: python scripts/patient-api-smoke.py   then clean up with: node scripts/patient-api-cleanup.js"""
import copy, json, os, re, sys, urllib.request, urllib.error, uuid

import yaml
from jsonschema import Draft7Validator

SPEC = yaml.safe_load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "openapispec.yaml"), encoding="utf-8"))
COMPONENTS = SPEC["components"]["schemas"]
contract_problems = []


def _resolve(node):
    if isinstance(node, dict):
        if "$ref" in node:
            return _resolve(copy.deepcopy(COMPONENTS[node["$ref"].split("/")[-1]]))
        out = {k: _resolve(v) for k, v in node.items()}
        if out.get("nullable") and "type" in out:
            out["type"] = [out["type"], "null"]
        return out
    if isinstance(node, list):
        return [_resolve(x) for x in node]
    return node


def contract(method, path, status, body):
    """Checks a response against openapispec.yaml (documented status code and body shape)."""
    clean = path.split("?")[0]
    for template, item in SPEC["paths"].items():
        if not template.startswith("/api/patient/"):
            continue
        pattern = "[^/]+".join(re.escape(part) for part in re.split(r"\{[^}]+\}", template))
        if re.fullmatch(pattern, clean) and method.lower() in item:
            responses = item[method.lower()]["responses"]
            key = str(status) if str(status) in responses else ("4XX" if status >= 400 else None)
            if key is None:
                contract_problems.append(f"{method} {template}: status {status} is not documented")
                return
            content = responses[key].get("content", {}).get("application/json")
            if content:
                errs = list(Draft7Validator(_resolve(content["schema"])).iter_errors(body))
                if errs:
                    contract_problems.append(f"{method} {template} -> {status}: {errs[0].message[:120]} at {list(errs[0].path)[:4]}")
            return
    contract_problems.append(f"{method} {clean}: not in the spec")

BASE = "http://localhost:3000"
PHONE = "9000000001"
OTP = "123456"
results = []


def call(method, path, body=None, token=None, headers=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            body_out = json.loads(r.read() or b"{}")
            contract(method, path, r.status, body_out)
            return r.status, body_out
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            body_out = json.loads(raw or b"{}")
        except ValueError:
            body_out = {"raw": raw[:200].decode(errors="ignore")}
        contract(method, path, e.code, body_out)
        return e.code, body_out


def check(label, cond, extra=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + label + (f"   {extra}" if extra and not cond else ""))


def main():
    s, r = call("POST", "/api/patient/auth/otp", {"phone": "123"})
    check("otp: bad phone rejected (400 INVALID_PHONE)", s == 400 and r.get("code") == "INVALID_PHONE", f"{s} {r}")
    s, r = call("POST", "/api/patient/auth/otp", {"phone": "+91 " + PHONE})
    check("otp: request code", s == 200 and r.get("ok"), f"{s} {r}")
    s, r = call("POST", "/api/patient/auth/verify", {"phone": PHONE, "code": "000000"})
    check("verify: wrong code -> 401 INVALID_OTP", s == 401 and r.get("code") == "INVALID_OTP", f"{s} {r}")
    s, r = call("POST", "/api/patient/auth/verify", {"phone": PHONE, "code": OTP})
    check("verify: right code returns a token", s == 200 and len(r.get("token", "")) == 64, f"{s} {r}")
    token = r.get("token")
    user = r.get("user", {})
    check("verify: new account has an incomplete profile", user.get("profileComplete") is False and user.get("name") is None)

    s, r = call("GET", "/api/patient/me")
    check("me: no token -> 401 NOT_SIGNED_IN", s == 401 and r.get("code") == "NOT_SIGNED_IN", f"{s}")
    s, r = call("PUT", "/api/patient/me", {"name": "Test Patient", "dob": "1990-05-12", "gender": "female"}, token)
    check("profile: complete it", s == 200 and r.get("profileComplete") is True, f"{s} {r}")
    s, r = call("PUT", "/api/patient/me", {"name": "X", "dob": "2999-01-01", "gender": "none"}, token)
    check("profile: invalid values -> 400", s == 400, f"{s} {r}")
    uid = user.get("id")

    # family
    s, r = call("POST", "/api/patient/dependents", {"name": "Little One", "relation": "child", "dob": "2018-03-02", "gender": "male"}, token)
    check("dependents: add", s == 201 and r.get("relation") == "child", f"{s} {r}")
    dep = r.get("id")
    s, r = call("PUT", f"/api/patient/dependents/{dep}", {"name": "Little Two"}, token)
    check("dependents: update", s == 200 and r.get("name") == "Little Two", f"{s} {r}")
    s, r = call("GET", "/api/patient/dependents", token=token)
    check("dependents: list", s == 200 and len(r.get("items", [])) == 1, f"{s} {r}")

    # QR / hospitals
    s, r = call("GET", "/api/patient/hospitals", token=token)
    check("hospitals: none linked yet", s == 200 and r.get("items") == [], f"{s} {r}")
    s, r = call("GET", "/api/patient/hospitals/HSP001/doctors", token=token)
    check("doctors: not linked -> 403 NOT_LINKED", s == 403 and r.get("code") == "NOT_LINKED", f"{s} {r}")
    s, r = call("POST", "/api/patient/qr/resolve", {"raw": "https://example.com/menu"}, token)
    check("qr: foreign link -> QR_INVALID", s == 422 and r.get("code") == "QR_INVALID", f"{s} {r}")
    s, r = call("POST", "/api/patient/qr/resolve", {"raw": "HSP001"}, token)
    check("qr: bare hospital code resolves", s == 200 and r.get("hospital", {}).get("id") == "HSP001" and r.get("alreadyLinked") is False, f"{s} {r}")
    key = r.get("qrKeyId")
    s, r = call("POST", "/api/patient/qr/resolve", {"raw": f"https://gmedic.app/h/HSP001?k={key}"}, token)
    check("qr: full link with key resolves", s == 200 and r.get("qrKeyId") == key, f"{s} {r}")
    s, r = call("POST", "/api/patient/qr/resolve", {"raw": "https://gmedic.app/h/HSP001?k=nope"}, token)
    check("qr: wrong key -> QR_INVALID", s == 422 and r.get("code") == "QR_INVALID", f"{s} {r}")
    s, r = call("POST", "/api/patient/hospitals/HSP001/link", {"qrKeyId": key}, token)
    check("link hospital", s == 200, f"{s} {r}")
    s, r = call("GET", "/api/patient/hospitals", token=token)
    check("hospitals: linked list", s == 200 and [h["id"] for h in r.get("items", [])] == ["HSP001"], f"{s} {r}")
    s, r = call("DELETE", "/api/patient/hospitals/HSP001/link", token=token)
    check("unlink hospital", s == 200, f"{s} {r}")
    s, r = call("POST", "/api/patient/hospitals/HSP001/relink", token=token)
    check("relink (undo)", s == 200, f"{s} {r}")

    # catalogue
    s, r = call("GET", "/api/patient/hospitals/HSP001", token=token)
    check("hospital detail", s == 200 and r.get("feeModel") in ("fullPrepay", "bookingFee", "tokenFee"), f"{s} {r}")
    s, r = call("GET", "/api/patient/hospitals/HSP001/departments", token=token)
    check("departments", s == 200 and len(r.get("items", [])) >= 1, f"{s} {r}")
    s, r = call("GET", "/api/patient/hospitals/HSP001/doctors", token=token)
    items = r.get("items", [])
    check("doctors: list with next available", s == 200 and len(items) >= 1 and "nextAvailable" in items[0], f"{s} {str(r)[:200]}")
    bookable = [i for i in items if not i["doctor"]["onLeave"] and i["nextAvailable"]]
    check("doctors: some are bookable", len(bookable) > 0)
    doc = bookable[0]["doctor"]["id"]
    s, r = call("GET", f"/api/patient/doctors/{doc}", token=token)
    check("doctor detail has a weekly schedule", s == 200 and len(r.get("schedule", [])) > 0, f"{s} {r}")
    s, r = call("GET", f"/api/patient/doctors/{doc}/next-available", token=token)
    day = r.get("date")
    check("next available day", s == 200 and day, f"{s} {r}")
    s, r = call("GET", f"/api/patient/doctors/{doc}/slots?date={day}", token=token)
    slots = [x for x in r.get("items", []) if x["status"] == "available"]
    check("slots for that day", s == 200 and len(slots) > 0, f"{s} {str(r)[:200]}")
    s, r = call("GET", f"/api/patient/doctors/{doc}/slots?date=bad", token=token)
    check("slots: bad date -> 400", s == 400, f"{s}")
    s, r = call("GET", f"/api/patient/doctors/{doc}/quote", token=token)
    check("quote adds up", s == 200 and r.get("totalNowPaise") == r["payNowBasePaise"] + r["convenienceFeePaise"] + r["gstPaise"], f"{s} {r}")
    total = r.get("totalNowPaise")

    # booking: hold -> pay
    slot = slots[0]
    s, r = call("POST", "/api/patient/holds", {"slotId": slot["id"], "patientId": uid}, token)
    check("hold a slot (for self)", s == 201 and r.get("ttlSeconds") == 600, f"{s} {r}")
    hold = r.get("id")
    s, r = call("POST", "/api/patient/holds", {"slotId": slots[1]["id"], "patientId": uid}, token)
    check("a second hold replaces the first", s == 201, f"{s} {r}")
    hold2 = r.get("id")
    s, r = call("POST", f"/api/patient/holds/{hold}/pay", {"method": "upi", "idempotencyKey": str(uuid.uuid4())}, token)
    check("pay on the released hold -> 410 HOLD_EXPIRED", s == 410 and r.get("code") == "HOLD_EXPIRED", f"{s} {r}")
    s, r = call("POST", f"/api/patient/holds/{hold2}/pay", {"method": "upi", "idempotencyKey": "k-decline-1"}, token, {"x-simulate-payment": "decline"})
    check("simulated bank decline -> 402 PAYMENT_DECLINED", s == 402 and r.get("code") == "PAYMENT_DECLINED", f"{s} {r}")
    key = str(uuid.uuid4())
    s, r = call("POST", f"/api/patient/holds/{hold2}/pay", {"method": "upi", "idempotencyKey": key, "reason": "Fever and cough"}, token)
    appt = r.get("appointment", {})
    check("pay -> confirmed appointment", s == 201 and appt.get("status") == "confirmed" and appt.get("payment", {}).get("amountPaise") == total, f"{s} {str(r)[:300]}")
    appt_id = appt.get("id")
    s, r2 = call("POST", f"/api/patient/holds/{hold2}/pay", {"method": "upi", "idempotencyKey": key}, token)
    check("same idempotency key does not charge twice", s == 201 and r2.get("appointment", {}).get("id") == appt_id, f"{s} {r2}")
    s, r = call("POST", "/api/patient/holds", {"slotId": slots[2]["id"] if len(slots) > 2 else slots[0]["id"], "patientId": uid}, token)
    check("second booking with the same doctor that day -> DUPLICATE_BOOKING", s == 409 and r.get("code") == "DUPLICATE_BOOKING", f"{s} {r}")
    s, r = call("POST", "/api/patient/holds", {"slotId": slots[2]["id"] if len(slots) > 2 else slots[0]["id"], "patientId": dep}, token)
    check("a family member can book the same doctor that day", s == 201, f"{s} {r}")
    s, r = call("DELETE", f"/api/patient/holds/{r.get('id')}", token=token)
    check("release a hold", s == 200, f"{s}")

    # appointments
    s, r = call("GET", "/api/patient/appointments", token=token)
    check("appointments: list", s == 200 and any(a["appointment"]["id"] == appt_id for a in r.get("items", [])), f"{s} {str(r)[:200]}")
    s, r = call("GET", f"/api/patient/appointments/{appt_id}", token=token)
    check("appointment detail has hospital + doctor", s == 200 and r.get("hospital", {}).get("id") == "HSP001" and r.get("doctor", {}).get("id") == doc, f"{s}")
    s, r = call("GET", "/api/patient/appointments/APT10001", token=token)
    check("someone else's appointment -> 404", s == 404, f"{s}")
    s, r = call("GET", f"/api/patient/appointments/{appt_id}/reschedule-check", token=token)
    check("reschedule-check", s == 200 and "blocker" in r, f"{s} {r}")
    others = [x for x in slots if x["id"] != slot["id"] and x["id"] != slots[1]["id"]]
    if others and r.get("blocker") is None:
        s, r = call("POST", f"/api/patient/appointments/{appt_id}/reschedule", {"slotId": others[-1]["id"]}, token)
        check("reschedule to another slot", s == 200 and r["appointment"]["rescheduleCount"] == 1, f"{s} {str(r)[:200]}")
        s, r = call("POST", f"/api/patient/appointments/{appt_id}/reschedule", {"slotId": others[0]["id"]}, token)
        check("second reschedule -> 422 POLICY", s == 422 and r.get("code") == "POLICY", f"{s} {r}")
    s, r = call("GET", f"/api/patient/appointments/{appt_id}/cancel-quote", token=token)
    check("cancel-quote", s == 200 and "refundPaise" in r, f"{s} {r}")
    refund = r.get("refundPaise")
    s, r = call("POST", f"/api/patient/appointments/{appt_id}/cancel", {"reason": "Change of plans"}, token)
    check("cancel", s == 200 and r["appointment"]["status"] == "cancelled", f"{s} {str(r)[:200]}")
    check("cancel: refund matches the quote", (r["appointment"].get("refund") or {}).get("amountPaise", 0) == refund, f"{r['appointment'].get('refund')} vs {refund}")
    s, r = call("POST", f"/api/patient/appointments/{appt_id}/cancel", {}, token)
    check("cancel again -> 422 POLICY", s == 422, f"{s}")

    # notifications
    s, r = call("GET", "/api/patient/notifications", token=token)
    check("notifications: confirmation + payment + cancellation delivered", s == 200 and len(r.get("items", [])) >= 3, f"{s} {str(r)[:200]}")
    s, r = call("POST", "/api/patient/notifications/read", token=token)
    check("notifications: mark read", s == 200 and r.get("unread") == 0, f"{s} {r}")

    s, r = call("DELETE", f"/api/patient/dependents/{dep}", token=token)
    check("dependents: remove", s == 200, f"{s}")
    s, r = call("POST", "/api/patient/auth/logout", token=token)
    check("logout", s == 200, f"{s}")
    s, r = call("GET", "/api/patient/me", token=token)
    check("token no longer works after logout", s == 401, f"{s}")

    check("every response matches openapispec.yaml", not contract_problems, "; ".join(contract_problems[:5]))
    print(f"\n{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)


main()
