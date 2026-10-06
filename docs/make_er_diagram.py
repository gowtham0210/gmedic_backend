"""Draws docs/gmedic-er-diagram-v2.png (Pillow only). Run: python docs/make_er_diagram.py"""
import os
from PIL import Image, ImageDraw, ImageFont

F = "C:/Windows/Fonts/"
fh = ImageFont.truetype(F + "arialbd.ttf", 23)
fc = ImageFont.truetype(F + "consola.ttf", 19)
fb = ImageFont.truetype(F + "consolab.ttf", 19)
ft = ImageFont.truetype(F + "arialbd.ttf", 50)
fs = ImageFont.truetype(F + "arial.ttf", 22)
fl = ImageFont.truetype(F + "arialbd.ttf", 20)
fsm = ImageFont.truetype(F + "arial.ttf", 17)
COL = {"core": "#2563eb", "appt": "#0d9488", "money": "#d97706", "support": "#7c3aed", "comms": "#db2777", "plat": "#64748b"}

# "PK"/"FK" prefixes mark keys; a leading "~" marks a column kept denormalised on purpose (guarded by a trigger).
T = {
    "hospitals": ("core", ["PK id", "name", "status", "kyc_status", "booking_model", "booking_fee", "commission_type", "commission_value", "currency", "timezone"]),
    "hospital_rate_history": ("core", ["PK id", "FK hospital_id", "commission_type", "commission_value", "booking_fee", "effective_from"]),
    "feature_flags": ("core", ["PK id", "flag_key", "FK hospital_id", "enabled"]),
    "hospital_policies": ("core", ["PK FK hospital_id", "cancellation_window_hours", "refund_percent", "booking_window_days"]),
    "hospital_branches": ("core", ["PK id", "FK hospital_id", "name", "status"]),
    "hospital_documents": ("core", ["PK id", "FK hospital_id", "doc_type", "status", "FK reviewed_by"]),
    "qr_codes": ("core", ["PK id", "~hospital_id", "FK branch_id", "qr_key", "status", "revoked_at", "FK revoked_by", "FK replaced_by"]),
    "qr_scans": ("core", ["PK id", "FK qr_code_id", "FK patient_id", "FK account_user_id", "result", "scanned_at"]),
    "users": ("core", ["PK id", "role", "~hospital_id", "FK doctor_id", "email", "phone (unique)", "username", "status"]),
    "departments": ("core", ["PK id", "FK hospital_id (null = shared)", "name"]),
    "doctors": ("core", ["PK id", "FK hospital_id", "FK branch_id", "FK department_id", "name", "qualifications", "years_experience", "fee", "currency", "availability", "verification_status", "FK verified_by"]),
    "doctor_languages": ("core", ["PK FK doctor_id", "PK language"]),
    "doctor_schedules": ("core", ["PK id", "FK doctor_id", "day_of_week", "start_time", "end_time", "slot_minutes", "capacity_per_slot", "online_quota", "effective_from / to"]),
    "doctor_leaves": ("core", ["PK id", "FK doctor_id", "start_date", "end_date", "reason"]),
    "patients": ("appt", ["PK id", "name", "mobile (nullable, unique)", "FK account_user_id", "relation", "date_of_birth", "gender"]),
    "patient_hospital_links": ("appt", ["PK FK patient_id", "PK FK hospital_id", "FK account_user_id", "FK qr_code_id", "linked_at", "removed_at"]),
    "appointments": ("appt", ["PK id", "~hospital_id", "~branch_id", "FK doctor_id", "FK patient_id", "appt_date", "appt_time", "seat_no", "source", "fee (price snapshot)", "currency", "status", "~payment_status", "cancelled_at", "FK rescheduled_from_id"]),
    "appointment_status_history": ("appt", ["PK id", "FK appointment_id", "from_status", "to_status", "FK changed_by"]),
    "slot_holds": ("appt", ["PK id", "FK doctor_id", "appt_date", "appt_time", "FK patient_id", "seat_no", "held_until", "status", "FK appointment_id"]),
    "tokens": ("appt", ["PK id", "FK appointment_id", "~doctor_id", "~hospital_id", "~token_date", "number", "code", "status"]),
    "payments": ("money", ["PK id", "FK appointment_id", "consultation_amount", "convenience_fee", "tax_amount", "amount", "currency", "method", "gateway", "receipt_number", "status"]),
    "payment_webhooks": ("money", ["PK id", "gateway", "event_type", "FK payment_id", "transaction_id", "status", "retry_count"]),
    "refunds": ("money", ["PK id", "FK payment_id", "~appointment_id", "amount", "currency", "status", "FK requested_by", "FK approved_by"]),
    "disputes": ("money", ["PK id", "FK payment_id", "~transaction_id", "amount", "currency", "reason", "status", "resolution"]),
    "settlements": ("money", ["PK id", "FK hospital_id", "period_start", "period_end", "currency", "FK rate_history_id", "gross_collection", "refunds_amount", "commission_amount", "net_payout (CHECK)", "status"]),
    "settlement_adjustments": ("money", ["PK id", "FK settlement_id", "FK dispute_id", "amount", "currency", "status"]),
    "settlement_items": ("money", ["PK id", "FK settlement_id", "item_type", "FK payment_id", "FK refund_id", "amount", "currency"]),
    "support_tickets": ("support", ["PK id", "ticket_number", "FK created_by", "FK hospital_id", "FK patient_id", "FK appointment_id", "FK assigned_to", "category", "priority", "status"]),
    "support_messages": ("support", ["PK id", "FK ticket_id", "FK sender_id", "~sender_name (snapshot)", "message"]),
    "notification_templates": ("comms", ["PK id", "event_key (unique)", "title", "body", "channels", "status"]),
    "notifications": ("comms", ["PK id", "FK user_id", "FK event_key", "title", "body", "read_at"]),
    "notification_logs": ("comms", ["PK id", "event_key", "FK recipient_user_id", "FK notification_id", "channel", "status"]),
    "device_tokens": ("comms", ["PK id", "FK user_id", "platform", "token (unique)", "revoked_at"]),
    "consent_records": ("comms", ["PK id", "FK user_id", "FK patient_id", "purpose", "policy_version", "granted_at", "withdrawn_at"]),
    "announcements": ("comms", ["PK id", "title", "message", "status", "FK created_by"]),
    "announcement_hospitals": ("comms", ["PK FK announcement_id", "PK FK hospital_id"]),
}
cols = [
    ["hospital_documents", "hospital_branches", "qr_codes", "qr_scans", "hospital_policies", "feature_flags"],
    ["hospitals", "hospital_rate_history", "settlements", "settlement_items", "settlement_adjustments", "announcements", "announcement_hospitals"],
    ["users", "departments", "doctors", "doctor_languages", "doctor_schedules", "doctor_leaves"],
    ["patients", "appointments", "appointment_status_history", "slot_holds", "tokens", "patient_hospital_links"],
    ["payments", "payment_webhooks", "refunds", "disputes"],
    ["support_tickets", "support_messages", "notifications", "notification_logs", "notification_templates", "device_tokens", "consent_records"],
]
W, GX, X0, Y0, HH, RH, GAP = 360, 140, 70, 190, 46, 27, 40
pos = {}
for ci, c in enumerate(cols):
    y = Y0
    for n in c:
        h = HH + RH * len(T[n][1]) + 14
        pos[n] = (X0 + ci * (W + GX), y, W, h)
        y += h + GAP

bottom = max(p[1] + p[3] for p in pos.values())
H = bottom + 420 + 520
Wd = X0 * 2 + 6 * W + 5 * GX
img = Image.new("RGB", (Wd, H), "#f8fafc")
d = ImageDraw.Draw(img)
ov_img = Image.new("RGBA", img.size, (0, 0, 0, 0))
ov = ImageDraw.Draw(ov_img)
d.text((X0, 50), "Gmedic Platform - ER Diagram v2", font=ft, fill="#0f172a")
d.text((X0, 115), "Migrations 007-010. PK / FK = primary / foreign key. Red ~ columns are kept denormalised on purpose and enforced by a composite foreign key. Line ends: 1 = one, N = many.", font=fs, fill="#475569")
d.text((X0, 150), "Every business table has created_at / updated_at; logs, history, junction and config tables are append-only or carry their own timestamps (see data-model-v2.md).", font=fsm, fill="#64748b")

R = [("hospitals", "hospital_branches"), ("hospitals", "hospital_documents"), ("hospitals", "qr_codes"), ("hospital_branches", "qr_codes"),
     ("qr_codes", "qr_scans"), ("hospitals", "hospital_policies"), ("hospitals", "users"), ("hospitals", "doctors"), ("hospital_branches", "doctors"),
     ("users", "doctors"), ("departments", "doctors"), ("doctors", "doctor_languages"), ("doctors", "doctor_schedules"), ("doctors", "doctor_leaves"),
     ("doctors", "appointments"), ("patients", "appointments"), ("appointments", "appointment_status_history"), ("doctors", "slot_holds"),
     ("appointments", "tokens"), ("patients", "patient_hospital_links"), ("hospitals", "patient_hospital_links"), ("users", "patients"),
     ("appointments", "payments"), ("payments", "refunds"), ("payments", "disputes"), ("hospitals", "settlements"), ("settlements", "settlement_items"),
     ("hospitals", "support_tickets"), ("patients", "support_tickets"), ("appointments", "support_tickets"), ("users", "support_tickets"),
     ("support_tickets", "support_messages"), ("users", "notifications"), ("notifications", "notification_logs"), ("notification_templates", "notification_logs"),
     ("hospitals", "hospital_rate_history"), ("hospitals", "feature_flags"), ("payments", "payment_webhooks"), ("settlements", "settlement_adjustments"), ("disputes", "settlement_adjustments"), ("patients", "qr_scans"), ("users", "device_tokens"), ("users", "consent_records"), ("announcements", "announcement_hospitals"), ("hospitals", "announcement_hospitals")]

used = {}


def anchor(a, b):
    ax, ay, aw, ah = pos[a]
    bx, by, bw, bh = pos[b]
    if ax + aw < bx:
        return (ax + aw, ay + ah / 2), (bx, by + bh / 2), True
    if bx + bw < ax:
        return (ax, ay + ah / 2), (bx + bw, by + bh / 2), True
    if ay < by:
        return (ax + aw / 2, ay + ah), (bx + bw / 2, by), False
    return (ax + aw / 2, ay), (bx + bw / 2, by + bh), False


for a, b in R:
    ka, kb = used.get(a, 0), used.get(b, 0)
    used[a], used[b] = ka + 1, kb + 1
    sa, sb, side = anchor(a, b)
    if side:
        sa = (sa[0], sa[1] + (ka % 9 - 4) * 10)
        sb = (sb[0], sb[1] + (kb % 9 - 4) * 10)
    c = COL[T[a][0]]
    ov.line([sa, sb], fill=c + "a0", width=3)
    for p, q, t in ((sa, sb, "1"), (sb, sa, "N")):
        vx, vy = q[0] - p[0], q[1] - p[1]
        L = max((vx * vx + vy * vy) ** 0.5, 1)
        tx, ty = p[0] + vx / L * 26, p[1] + vy / L * 26
        ov.ellipse([tx - 13, ty - 13, tx + 13, ty + 13], fill="white", outline=c, width=2)
        ov.text((tx - d.textlength(t, font=fl) / 2, ty - 12), t, font=fl, fill=c)

img.paste(ov_img, (0, 0), ov_img)
d = ImageDraw.Draw(img)
for a, b in R:
    pass
for n, (x, y, w, h) in pos.items():
    c = COL[T[n][0]]
    d.rounded_rectangle([x, y, x + w, y + h], radius=12, fill="white", outline=c, width=3)
    d.rounded_rectangle([x, y, x + w, y + HH], radius=12, fill=c)
    d.rectangle([x, y + HH - 12, x + w, y + HH], fill=c)
    d.text((x + 16, y + 10), n, font=fh, fill="white")
    for i, col in enumerate(T[n][1]):
        yy = y + HH + 8 + i * RH
        parts = col.split(" ")
        tags = []
        while parts and parts[0] in ("PK", "FK"):
            tags.append(parts.pop(0))
        name = " ".join(parts)
        denorm = name.startswith("~")
        if denorm:
            name = name[1:]
        tx = x + 14
        for tg in tags:
            d.text((tx, yy), tg, font=fb, fill="#b45309" if tg == "PK" else "#2563eb")
            tx += 32
        if denorm:
            d.text((x + 14, yy), "~", font=fb, fill="#dc2626")
        d.text((max(tx + 4, x + 58) if tags else x + 58, yy), name, font=fb if "PK" in tags else fc, fill="#dc2626" if denorm else "#0f172a")

ly = bottom + 50
d.text((X0, ly), "Domains", font=fh, fill="#0f172a")
x = X0 + 130
for k, lab in (("core", "Hospitals, staff and QR"), ("appt", "Patients and appointments"), ("money", "Payments and settlements"), ("support", "Support"), ("comms", "Communications and compliance")):
    d.rounded_rectangle([x, ly + 2, x + 26, ly + 28], radius=5, fill=COL[k])
    d.text((x + 36, ly + 3), lab, font=fs, fill="#334155")
    x += int(d.textlength(lab, font=fs)) + 90

d.text((X0, ly + 80), "Platform tables (configuration and logging, drawn without lines)", font=fh, fill="#0f172a")
sa = [("audit_logs", "who, action, entity, before/after values"), ("internal_notes", "notes on disputes (entity_type + entity_id)"),
      ("platform_settings", "key / value configuration"), ("app_versions", "min / latest version per platform"), ("banners", "title, message, schedule, status, FK created_by"),
      ("sessions", "login sessions"), ("meta", "internal bookkeeping")]
for i, (n, desc) in enumerate(sa):
    cx = X0 + (i % 3) * 820
    cy = ly + 130 + (i // 3) * 76
    d.rounded_rectangle([cx, cy, cx + 760, cy + 62], radius=10, fill="white", outline=COL["plat"], width=2)
    d.text((cx + 14, cy + 7), n, font=fb, fill="#0f172a")
    d.text((cx + 14, cy + 34), desc, font=fsm, fill="#475569")


py = ly + 130 + 3 * 76 + 40
d.text((X0, py), "Constraints enforced by the database (not drawn as lines)", font=fh, fill="#0f172a")
GROUPS = [
    ("Unique / partial unique", ["payments: one PAID row per appointment; transaction_id; receipt_number", "appointments: (doctor, date, time, seat_no) while not cancelled", "tokens: (hospital, token_date, number)", "users: email, username, phone, doctor_id (1:1)", "patients.mobile (when set); qr_codes.qr_key; departments.name", "settlement_items: a payment / refund appears in one settlement", "slot_holds: one HELD row per seat"]),
    ("CHECK constraints", ["every status column (appointment, payment, refund, dispute, ticket, ...)", "payment: components add up to amount", "settlement: net = gross - refunds - commission - fees", "settlement_items: exactly one of payment_id / refund_id", "doctor_leaves: end_date >= start_date", "currency: 3 letters; seat_no >= 1; capacity >= 1", "hospital_policies: refund_percent 0-100", "patients: relation, gender; consent: user or patient set"]),
    ("Composite foreign keys (red ~)", ["appointment (doctor, hospital) -> doctor", "token (appointment, doctor, hospital, date) -> appointment", "refund (payment, appointment, currency) -> payment", "dispute (payment, transaction, currency) -> payment", "doctor login (doctor, hospital) -> doctor", "QR / doctor / appointment (branch, hospital) -> branch", "payment, settlement, item, adjustment: currency chain"]),
    ("Triggers: rules and history", ["refunds total <= payment amount", "schedule windows, leaves, settlement periods cannot overlap", "seat <= capacity, online quota, hold vs booking", "paid settlement, messages, history, audit logs immutable", "paid appointment fee cannot change", "status / rate history, receipt no., cancelled_at, payment_status", "link / scan account = patient account; source and method vocabularies"]),
]
gw = (Wd - 2 * X0) // 4
for gi, (title, items) in enumerate(GROUPS):
    gx = X0 + gi * gw
    d.rounded_rectangle([gx, py + 50, gx + gw - 20, py + 50 + 40 + 30 * len(items)], radius=10, fill="white", outline="#94a3b8", width=2)
    d.text((gx + 16, py + 60), title, font=fb, fill="#0f172a")
    for ii, it in enumerate(items):
        d.text((gx + 16, py + 98 + ii * 30), "- " + it, font=fsm, fill="#334155")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gmedic-er-diagram-v2.png")
img.save(out)
print(out, img.size)
