"""Harder patient-API scenarios against a running server: two patients racing for one seat, shared slots,
hold expiry, late payment, refund timing, OTP limits, account deletion and what the hospital portals see.
Creates test patients 9000000002-9000000004 (and some bookings); clean up afterwards with
  node scripts/patient-api-cleanup.js 9000000002 && node scripts/patient-api-cleanup.js 9000000003 && node scripts/patient-api-cleanup.js 9000000004
Run: python scripts/patient-api-scenarios.py"""
import json, sqlite3, sys, urllib.request, urllib.error, uuid, os

BASE = "http://localhost:3000"
DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "gmedic.sqlite")
results = []


def call(method, path, body=None, token=None, headers=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        data = e.read()
        try:
            return e.code, json.loads(data or b"{}")
        except ValueError:
            return e.code, {}


def check(label, cond, extra=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + label + (f"   {extra}" if extra and not cond else ""))


def sql(query, params=()):
    con = sqlite3.connect(DB)
    try:
        cur = con.execute(query, params)
        con.commit()
        return cur.fetchall()
    finally:
        con.close()


def sign_in(phone, name):
    call("POST", "/api/patient/auth/otp", {"phone": phone})
    s, r = call("POST", "/api/patient/auth/verify", {"phone": phone, "code": "123456"})
    token = r["token"]
    call("PUT", "/api/patient/me", {"name": name, "dob": "1991-01-01", "gender": "male"}, token)
    s, hosp = call("POST", "/api/patient/qr/resolve", {"raw": "HSP001"}, token)
    call("POST", "/api/patient/hospitals/HSP001/link", {"qrKeyId": hosp["qrKeyId"]}, token)
    return token, r["user"]["id"]


def pay(token, hold, **extra):
    return call("POST", f"/api/patient/holds/{hold}/pay", {"method": "upi", "idempotencyKey": str(uuid.uuid4()), **extra}, token)


def find_slots(token, doctor_id, count=3, skip_days=0):
    """The first `count` available slots of a doctor, scanning day by day."""
    out = []
    after = None
    while len(out) < count:
        s, r = call("GET", f"/api/patient/doctors/{doctor_id}/next-available" + (f"?after={after}" if after else ""), token=token)
        if not r.get("date"):
            break
        after = r["date"]
        s, r = call("GET", f"/api/patient/doctors/{doctor_id}/slots?date={after}", token=token)
        out += [x for x in r["items"] if x["status"] == "available"]
    return out


def main():
    a, a_id = sign_in("9000000002", "Racer Alpha")
    b, b_id = sign_in("9000000003", "Racer Beta")
    c, c_id = sign_in("9000000004", "Racer Gamma")

    s, r = call("GET", "/api/patient/hospitals/HSP001/doctors", token=a)
    docs = r["items"]
    single = next(i["doctor"] for i in docs if i["doctor"]["schedule"] and i["doctor"]["schedule"][0]["perSlot"] == 1 and not i["doctor"]["onLeave"] and i["nextAvailable"])
    double = next(i["doctor"] for i in docs if i["doctor"]["schedule"] and i["doctor"]["schedule"][0]["perSlot"] == 2 and not i["doctor"]["onLeave"] and i["nextAvailable"])

    # ---- one seat, two patients
    slots = find_slots(a, single["id"], 4)
    s1 = slots[0]
    s, r = call("POST", "/api/patient/holds", {"slotId": s1["id"], "patientId": a_id}, a)
    check("A holds the only seat", s == 201, f"{s} {r}")
    hold_a = r["id"]
    s, r = call("GET", f"/api/patient/doctors/{single['id']}/slots?date={s1['start'][:10]}", token=b)
    seen = next(x for x in r["items"] if x["id"] == s1["id"])
    check("B sees the slot as full while A holds it", seen["status"] == "full" and seen["seatsLeft"] == 0, str(seen))
    s, r = call("POST", "/api/patient/holds", {"slotId": s1["id"], "patientId": b_id}, b)
    check("B cannot hold it -> 409 SLOT_UNAVAILABLE", s == 409 and r.get("code") == "SLOT_UNAVAILABLE", f"{s} {r}")
    s, r = call("GET", f"/api/patient/doctors/{single['id']}/slots?date={s1['start'][:10]}", token=a)
    mine = next(x for x in r["items"] if x["id"] == s1["id"])
    check("A still sees their own held slot as available", mine["status"] == "available", str(mine))
    s, r = pay(a, hold_a)
    check("A pays and is confirmed", s == 201 and r["appointment"]["status"] == "confirmed", f"{s} {r}")
    appt_a = r["appointment"]
    s, r = call("POST", "/api/patient/holds", {"slotId": s1["id"], "patientId": b_id}, b)
    check("after A booked, B still cannot take the slot", s == 409, f"{s} {r}")

    # ---- hold lapses, someone else takes the seat, then the late payment arrives (BK-06)
    s2 = slots[1]
    s, r = call("POST", "/api/patient/holds", {"slotId": s2["id"], "patientId": b_id}, b)
    hold_b = r["id"]
    sql("UPDATE slot_holds SET held_until = datetime('now', '-1 minute') WHERE id = ?", (int(hold_b),))
    s, r = call("POST", "/api/patient/holds", {"slotId": s2["id"], "patientId": c_id}, c)
    check("C can hold a slot whose hold has lapsed", s == 201, f"{s} {r}")
    hold_c = r["id"]
    s, r = pay(b, hold_b)
    check("B pays late, C holds the seat -> 402 PAYMENT_LATE_REFUNDED", s == 402 and r.get("code") == "PAYMENT_LATE_REFUNDED", f"{s} {r}")
    s, r = pay(c, hold_c)
    check("C pays and gets the seat", s == 201, f"{s} {r}")
    s3 = slots[2]
    s, r = call("POST", "/api/patient/holds", {"slotId": s3["id"], "patientId": b_id}, b)
    hold_b2 = r["id"]
    sql("UPDATE slot_holds SET held_until = datetime('now', '-1 minute') WHERE id = ?", (int(hold_b2),))
    s, r = pay(b, hold_b2)
    check("a late payment is still confirmed when the seat is free", s == 201 and r["appointment"]["status"] == "confirmed", f"{s} {r}")

    # ---- a slot with two seats
    two = find_slots(a, double["id"], 1)[0]
    holds = []
    for tok, pid in ((a, a_id), (b, b_id)):
        s, r = call("POST", "/api/patient/holds", {"slotId": two["id"], "patientId": pid}, tok)
        check(f"two-seat slot: seat taken ({'A' if tok is a else 'B'})", s == 201, f"{s} {r}")
        holds.append(r.get("id"))
    s, r = call("POST", "/api/patient/holds", {"slotId": two["id"], "patientId": c_id}, c)
    check("two-seat slot: the third patient is turned away", s == 409, f"{s} {r}")
    s, r = pay(a, holds[0])
    check("two-seat slot: first payment confirmed", s == 201, f"{s}")
    s, r = pay(b, holds[1])
    check("two-seat slot: second payment confirmed", s == 201, f"{s}")
    seats = sql("SELECT seat_no FROM appointments WHERE doctor_id = ? AND appt_date = ? AND appt_time = ? AND status <> 'cancelled' ORDER BY seat_no", (double["id"], two["start"][:10], two["start"][11:16]))
    check("two-seat slot: patients got seats 1 and 2", [x[0] for x in seats] == [1, 2], str(seats))

    # ---- what the hospital sees
    cookie_req = urllib.request.Request(BASE + "/api/auth/login", method="POST", data=json.dumps({"role": "RECEPTIONIST", "identifier": "riya.sharma@sunrisegeneral.in", "password": "Gmedic@123"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(cookie_req) as resp:
        cookie = "; ".join(c_.split(";")[0] for c_ in resp.headers.get_all("Set-Cookie"))
    req = urllib.request.Request(BASE + f"/api/appointments/{appt_a['id']}", headers={"Cookie": cookie})
    with urllib.request.urlopen(req) as resp:
        seen = json.loads(resp.read())["appointment"]
    check("receptionist sees the app booking (confirmed, paid, from the app)", seen["status"] == "confirmed" and seen["paymentStatus"] == "paid" and seen["source"] == "Gmedic App", str(seen)[:200])
    n = sql("SELECT COUNT(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.role = 'RECEPTIONIST' AND n.event_key = 'NEW_APPOINTMENT' AND n.created_at >= datetime('now', '-10 minutes')")[0][0]
    check("receptionist was notified of the new appointments", n >= 3, str(n))

    # ---- refund timing: cancelling inside the free window refunds, inside the last hours it does not
    s, r = call("GET", f"/api/patient/appointments/{appt_a['id']}/cancel-quote", token=a)
    check("cancel-quote: early cancellation refunds the full fee", r.get("withinFreeWindow") is True and r.get("refundPaise") == appt_a["fees"]["payNowBasePaise"], str(r))
    # move the visit to about one hour from now (hospital time is UTC+5:30)
    sql("UPDATE appointments SET appt_date = date('now', '+6 hours', '+30 minutes'), appt_time = strftime('%H:%M', datetime('now', '+6 hours', '+30 minutes')) WHERE id = ?", (appt_a["id"],))
    s, r = call("GET", f"/api/patient/appointments/{appt_a['id']}/cancel-quote", token=a)
    check("cancel-quote: within the last hours nothing is refunded", r.get("withinFreeWindow") is False and r.get("refundPaise") == 0, str(r))
    s, r = call("POST", f"/api/patient/appointments/{appt_a['id']}/cancel", {"reason": "late"}, a)
    check("late cancel works but creates no refund", s == 200 and r["appointment"]["refund"] is None, f"{s} {str(r)[:200]}")

    # ---- one active booking per patient per doctor per day
    s, r = call("GET", "/api/patient/appointments", token=c)
    check("C sees only their own appointments", s == 200 and len(r["items"]) == 1, f"{s} {len(r.get('items', []))}")
    s, r = call("GET", f"/api/patient/appointments/{appt_a['id']}", token=c)
    check("C cannot open A's appointment -> 404", s == 404, f"{s}")

    # ---- OTP limits
    for i in range(5):
        call("POST", "/api/patient/auth/otp", {"phone": "9000000005"})
    s, r = call("POST", "/api/patient/auth/otp", {"phone": "9000000005"})
    check("OTP: sixth request in an hour -> 429", s == 429, f"{s} {r}")
    call("POST", "/api/patient/auth/otp", {"phone": "9000000004"})
    for i in range(5):
        call("POST", "/api/patient/auth/verify", {"phone": "9000000004", "code": "000000"})
    s, r = call("POST", "/api/patient/auth/verify", {"phone": "9000000004", "code": "123456"})
    check("OTP: locked after 5 wrong tries, even the right code -> 429", s == 429, f"{s} {r}")
    sql("DELETE FROM otp_codes WHERE phone IN ('9000000005')")

    # ---- delete account
    s, r = call("DELETE", "/api/patient/me", token=c)
    check("delete account", s == 200, f"{s} {r}")
    s, r = call("GET", "/api/patient/me", token=c)
    check("deleted account's token stops working", s == 401, f"{s}")
    row = sql("SELECT name, phone FROM users WHERE id = ?", (c_id,))[0]
    check("deleted account has no personal details left", row[0] == "Deleted patient" and row[1] is None, str(row))
    kept = sql("SELECT status FROM appointments WHERE booked_by_user_id = ?", (c_id,))
    check("deleted account's appointments stay on record, cancelled", kept and all(k[0] == "cancelled" for k in kept), str(kept))

    print(f"\n{sum(results)}/{len(results)} checks passed")
    sys.exit(0 if all(results) else 1)


main()
