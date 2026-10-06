"""Calls the running app as Super Admin and infers a JSON schema for each GET response.
Writes docs/response-schemas.json, which docs/make_openapi.py embeds in the spec.
Run (app on :3000):  python docs/infer_response_schemas.py
"""
import json, os, re, urllib.request, http.cookiejar

BASE = "http://localhost:3000"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "response-schemas.json")

# (spec key, url, component name)
TARGETS = [
    ("get /api/admin/doctors", "/api/admin/doctors?pageSize=100", "DoctorList"),
    ("get /api/admin/doctors/{id}", "/api/admin/doctors/DOC101", "DoctorDetail"),
    ("get /api/admin/receptionists", "/api/admin/receptionists", "ReceptionistList"),
    ("get /api/admin/qr", "/api/admin/qr", "QrList"),
    ("get /api/admin/qr/analytics", "/api/admin/qr/analytics", "QrAnalytics"),
    ("get /api/admin/appointments", "/api/admin/appointments?pageSize=100", "AppointmentList"),
    ("get /api/admin/appointments/{id}", "/api/admin/appointments/APT10544", "AppointmentDetail"),
    ("get /api/admin/patients/search", "/api/admin/patients/search?q=ra", "PatientSearch"),
    ("get /api/admin/patients/{id}", "/api/admin/patients/PAT1001", "PatientDetail"),
    ("get /api/admin/payments", "/api/admin/payments?pageSize=100", "PaymentList"),
    ("get /api/admin/refunds", "/api/admin/refunds", "RefundList"),
    ("get /api/admin/disputes", "/api/admin/disputes", "DisputeList"),
    ("get /api/admin/settlements", "/api/admin/settlements", "SettlementList"),
    ("get /api/admin/webhooks", "/api/admin/webhooks?pageSize=100", "WebhookList"),
    ("get /api/admin/support", "/api/admin/support?pageSize=100", "TicketList"),
    ("get /api/admin/support/assignees", "/api/admin/support/assignees", "TicketAssignees"),
    ("get /api/admin/support/{id}", "/api/admin/support/TKT1", "TicketDetail"),
    ("get /api/admin/communications/templates", "/api/admin/communications/templates", "TemplateList"),
    ("get /api/admin/communications/announcements", "/api/admin/communications/announcements", "AnnouncementList"),
    ("get /api/admin/communications/banners", "/api/admin/communications/banners", "BannerList"),
    ("get /api/admin/settings", "/api/admin/settings", "SettingList"),
    ("get /api/admin/feature-flags", "/api/admin/feature-flags", "FeatureFlagList"),
    ("get /api/admin/app-versions", "/api/admin/app-versions", "AppVersionList"),
    ("get /api/admin/audit-logs", "/api/admin/audit-logs?pageSize=100", "AuditLogList"),
]

DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$")
D = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def infer(v):
    if v is None:
        return {"nullable": True}
    if isinstance(v, bool):
        return {"type": "boolean"}
    if isinstance(v, int):
        return {"type": "integer"}
    if isinstance(v, float):
        return {"type": "number"}
    if isinstance(v, str):
        if DT.match(v):
            return {"type": "string", "format": "date-time"}
        if D.match(v):
            return {"type": "string", "format": "date"}
        return {"type": "string"}
    if isinstance(v, list):
        items = {}
        for x in v:
            items = merge(items, infer(x)) if items else infer(x)
        return {"type": "array", "items": items or {}}
    if isinstance(v, dict):
        return {"type": "object", "properties": {k: infer(x) for k, x in v.items()}}
    return {}


def merge(a, b):
    if not a:
        return b
    if not b:
        return a
    out = {}
    nullable = a.get("nullable") or b.get("nullable")
    ta, tb = a.get("type"), b.get("type")
    if ta is None:
        out = dict(b)
    elif tb is None:
        out = dict(a)
    elif ta == tb == "object":
        props = {}
        keys = list(a.get("properties", {})) + [k for k in b.get("properties", {}) if k not in a.get("properties", {})]
        for k in keys:
            pa, pb = a.get("properties", {}).get(k), b.get("properties", {}).get(k)
            m = merge(pa, pb) if pa and pb else dict(pa or pb)
            if not (pa and pb):
                m["nullable"] = True
            props[k] = m
        out = {"type": "object", "properties": props}
    elif ta == tb == "array":
        out = {"type": "array", "items": merge(a.get("items", {}), b.get("items", {}))}
    elif {ta, tb} == {"integer", "number"}:
        out = {"type": "number"}
    elif ta == tb:
        out = {k: v for k, v in a.items() if k != "nullable"}
        if a.get("format") != b.get("format"):
            out.pop("format", None)
    else:
        out = {}  # mixed types: leave open
    if nullable and out:
        out["nullable"] = True
    return out


def fix(node):
    """OpenAPI 3.0 needs a type next to nullable: a value that was only ever null becomes a nullable string."""
    if isinstance(node, dict):
        if node.get("nullable") and "type" not in node:
            node["type"] = "string"
        for v in node.values():
            fix(v)
    return node


def main():
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(BASE + "/api/auth/login", data=json.dumps({"role": "SUPER_ADMIN", "identifier": "admin@gmedic.app", "password": "GmedicAdmin@123"}).encode(), headers={"Content-Type": "application/json"})
    op.open(req).read()
    result = {}
    for key, url, name in TARGETS:
        data = json.loads(op.open(BASE + url).read())
        schema = fix(infer(data))
        if name == "AuditLogList":  # before / after values are arbitrary JSON
            for f in ("previousValue", "newValue"):
                schema["properties"]["items"]["items"]["properties"][f] = {"description": "Any JSON value (null when not applicable)"}
        result[key] = {"name": name, "schema": schema}
        print(f"{key:55} -> {name}")
    result.update(receptionist(op))
    result.update(doctor(op))
    json.dump(result, open(OUT, "w", encoding="utf-8"), indent=1)
    print("wrote", OUT)


def login(role, ident, pw):
    jar = http.cookiejar.CookieJar()
    o = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    o.open(urllib.request.Request(BASE + "/api/auth/login", data=json.dumps({"role": role, "identifier": ident, "password": pw}).encode(), headers={"Content-Type": "application/json"})).read()
    return o


def call(o, method, url, body=None):
    req = urllib.request.Request(BASE + url, data=json.dumps(body).encode() if body is not None else None, method=method, headers={"Content-Type": "application/json"})
    return json.loads(o.open(req).read())


REC_TARGETS = [
    ("get /api/me", "/api/me", "RecMe"),
    ("get /api/dashboard", "/api/dashboard", "RecDashboard"),
    ("get /api/search", "/api/search?q=ra", "RecSearch"),
    ("get /api/appointments", "/api/appointments?pageSize=100", "RecAppointmentList"),
    ("get /api/appointments/{id}", "/api/appointments/APT10544", "RecAppointmentDetail"),
    ("get /api/doctors", "/api/doctors", "RecDoctorList"),
    ("get /api/doctors/{id}", "/api/doctors/DOC101", "RecDoctorDetail"),
    ("get /api/tokens", "/api/tokens?date=2026-09-29", "RecTokenList"),
    ("get /api/tokens/eligible", "/api/tokens/eligible?date=2026-10-05", "RecTokenEligible"),
    ("get /api/payments", "/api/payments?pageSize=100", "RecPaymentList"),
    ("get /api/hospital", "/api/hospital", "RecHospital"),
    ("get /api/notifications", "/api/notifications", "RecNotificationList"),
    ("get /api/support", "/api/support", "RecTicketList"),
    ("get /api/support/{id}", "/api/support/{ticket}", "RecTicketDetail"),
]


def receptionist(admin_op):
    """Reads as the demo receptionist. Creates one throw-away ticket (and an admin reply, so a
    notification exists) to see real shapes; docs/cleanup note: delete TKT rows afterwards."""
    rec = login("RECEPTIONIST", "riya.sharma@sunrisegeneral.in", "Gmedic@123")
    ticket = call(rec, "POST", "/api/support", {"subject": "Schema probe", "description": "temporary ticket used to read response shapes", "category": "OTHER", "priority": "LOW"})["ticket"]["id"]
    call(admin_op, "POST", f"/api/admin/support/{ticket}/messages", {"message": "probe reply"})
    tokens = call(rec, "GET", "/api/tokens?date=2026-09-29")["items"]
    out = {}
    for key, url, name in REC_TARGETS:
        data = call(rec, "GET", url.replace("{ticket}", ticket))
        out[key] = {"name": name, "schema": fix(infer(data))}
        print(f"{key:55} -> {name}")
    if tokens:
        data = call(rec, "GET", f"/api/tokens/{tokens[0]['id']}")
        out["get /api/tokens/{id}"] = {"name": "RecTokenDetail", "schema": fix(infer(data))}
    print("probe ticket (delete it):", ticket)
    return out


DOC_TARGETS = [
    ("get /api/doctor/appointments", "/api/doctor/appointments?pageSize=100", "DocAppointmentList"),
    ("get /api/doctor/appointments/{id}", "/api/doctor/appointments/APT10549", "DocAppointmentDetail"),
    ("get /api/doctor/queue", "/api/doctor/queue?date=2026-10-03", "DocQueue"),
    ("get /api/doctor/schedule", "/api/doctor/schedule", "DocScheduleList"),
    ("get /api/doctor/patients", "/api/doctor/patients", "DocPatientList"),
    ("get /api/doctor/patients/{id}", "/api/doctor/patients/PAT1001", "DocPatientDetail"),
    ("get /api/doctor/profile", "/api/doctor/profile", "DocProfile"),
    ("get /api/doctor/support", "/api/doctor/support", "DocTicketList"),
    ("get /api/doctor/support/{id}", "/api/doctor/support/{ticket}", "DocTicketDetail"),
]


def doctor(admin_op):
    """Reads as the demo doctor; creates one throw-away ticket (delete it afterwards)."""
    doc = login("DOCTOR", "doc101@sunrisegeneral.in", "Gmedic@Doctor1")
    ticket = call(doc, "POST", "/api/doctor/support", {"subject": "Schema probe", "description": "temporary ticket used to read response shapes", "category": "OTHER", "priority": "LOW"})["ticket"]["id"]
    call(admin_op, "POST", f"/api/admin/support/{ticket}/messages", {"message": "probe reply"})
    out = {}
    for key, url, name in DOC_TARGETS:
        out[key] = {"name": name, "schema": fix(infer(call(doc, "GET", url.replace("{ticket}", ticket))))}
        print(f"{key:55} -> {name}")
    print("probe ticket (delete it):", ticket)
    return out


main()
