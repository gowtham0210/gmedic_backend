"""Generates openapi.yaml at the project root. Run: python docs/make_openapi.py"""
import os, re

# (method, path, tag, summary, access, body schema, query params)
ADM, REC, DOC, PUB = "admin", "receptionist", "doctor", "public"
Q_PAGE = ["page", "pageSize"]
E = [
 # ---- auth
 ("post", "/api/auth/login", "Auth", "Log in (sets the gmedic.sid session cookie)", PUB, "LoginRequest", []),
 ("post", "/api/auth/logout", "Auth", "Log out", PUB, None, []),
 ("post", "/api/auth/forgot-password", "Auth", "Request a password reset", PUB, "ForgotPasswordRequest", []),
 # ---- internal
 ("post", "/api/internal/events", "Internal", "Fire an appointment/payment notification event (patient-app backend). Header x-internal-key required", "internal", "InternalEventRequest", []),
 # ---- admin
 ("get", "/api/admin/dashboard", "Admin: Dashboard", "Dashboard summary", "any admin", None, []),
 ("get", "/api/admin/analytics", "Admin: Dashboard", "Analytics summary", "analytics.view", None, ["from", "to", "hospitalId"]),
 ("get", "/api/admin/hospitals", "Admin: Hospitals", "List hospitals", "hospitals.view", None, ["status", "kycStatus", "q"] + Q_PAGE),
 ("post", "/api/admin/hospitals", "Admin: Hospitals", "Onboard a hospital", "hospitals.manage", "Object", []),
 ("get", "/api/admin/hospitals/{id}", "Admin: Hospitals", "Hospital detail", "hospitals.view", None, []),
 ("put", "/api/admin/hospitals/{id}", "Admin: Hospitals", "Update hospital", "hospitals.manage", "Object", []),
 ("patch", "/api/admin/hospitals/{id}/status", "Admin: Hospitals", "Activate / suspend a hospital", "hospitals.manage", "StatusChange", []),
 ("put", "/api/admin/hospitals/{id}/fees", "Admin: Hospitals", "Set booking model, fees and COMMISSION (type + value)", "hospitals.manage", "FeeCommission", []),
 ("patch", "/api/admin/hospitals/{id}/kyc", "Admin: Hospitals", "Set KYC status", "kyc.manage", "StatusChange", []),
 ("get", "/api/admin/hospitals/{id}/documents", "Admin: Hospitals", "List KYC documents", "kyc.view", None, []),
 ("patch", "/api/admin/hospitals/{id}/documents/{docId}", "Admin: Hospitals", "Approve / reject a KYC document", "kyc.manage", "StatusChange", []),
 ("get", "/api/admin/hospitals/{id}/branches", "Admin: Hospitals", "List branches", "branches.view", None, []),
 ("post", "/api/admin/hospitals/{id}/branches", "Admin: Hospitals", "Create branch", "branches.manage", "Object", []),
 ("patch", "/api/admin/branches/{id}", "Admin: Hospitals", "Update branch", "branches.manage", "Object", []),
 ("get", "/api/admin/doctors", "Admin: Doctors", "List doctors", "doctors.view", None, ["hospitalId", "verificationStatus", "q"] + Q_PAGE),
 ("get", "/api/admin/doctors/{id}", "Admin: Doctors", "Doctor detail", "doctors.view", None, []),
 ("put", "/api/admin/doctors/{id}", "Admin: Doctors", "Update doctor", "doctors.manage", "Object", []),
 ("patch", "/api/admin/doctors/{id}/verification", "Admin: Doctors", "Verify / reject a doctor", "doctors.verify", "StatusChange", []),
 ("get", "/api/admin/receptionists", "Admin: Receptionists", "List receptionists", "receptionists.view", None, ["hospitalId", "q"] + Q_PAGE),
 ("post", "/api/admin/receptionists", "Admin: Receptionists", "Create receptionist", "receptionists.manage", "Object", []),
 ("patch", "/api/admin/receptionists/{id}/status", "Admin: Receptionists", "Enable / disable receptionist", "receptionists.manage", "StatusChange", []),
 ("post", "/api/admin/receptionists/{id}/reset-password", "Admin: Receptionists", "Reset password", "receptionists.manage", None, []),
 ("get", "/api/admin/qr", "Admin: QR", "List QR codes", "qr.view", None, ["hospitalId", "status"] + Q_PAGE),
 ("post", "/api/admin/qr", "Admin: QR", "Create QR code", "qr.manage", "Object", []),
 ("get", "/api/admin/qr/analytics", "Admin: QR", "QR scan analytics", "qr.view", None, []),
 ("post", "/api/admin/qr/{id}/revoke", "Admin: QR", "Revoke QR code", "qr.manage", "Reason", []),
 ("post", "/api/admin/qr/{id}/reissue", "Admin: QR", "Reissue QR code", "qr.manage", None, []),
 ("get", "/api/admin/appointments", "Admin: Appointments", "List appointments (READ-ONLY)", "appointments.view", None, ["q", "hospitalId", "doctorId", "status", "paymentStatus", "from", "to"] + Q_PAGE),
 ("get", "/api/admin/appointments/{id}", "Admin: Appointments", "Appointment detail (READ-ONLY)", "appointments.view", None, []),
 ("get", "/api/admin/patients/search", "Admin: Patients", "Search patients", "patients.view", None, ["q"]),
 ("get", "/api/admin/patients/{id}", "Admin: Patients", "Patient detail", "patients.view", None, []),
 ("get", "/api/admin/payments", "Admin: Finance", "List payments", "payments.view", None, ["status", "hospitalId", "from", "to"] + Q_PAGE),
 ("get", "/api/admin/refunds", "Admin: Finance", "List refunds (raised by receptionists)", "refunds.view", None, ["status"] + Q_PAGE),
 ("post", "/api/admin/refunds/{id}/decision", "Admin: Finance", "Approve or reject a refund", "refunds.approve", "RefundDecision", []),
 ("get", "/api/admin/disputes", "Admin: Finance", "List disputes", "disputes.view", None, ["status", "hospitalId"] + Q_PAGE),
 ("post", "/api/admin/disputes/{id}/resolve", "Admin: Finance", "Mark under review / resolve / reject (resolution note required to close)", "disputes.manage", "DisputeResolve", []),
 ("get", "/api/admin/disputes/{id}/notes", "Admin: Finance", "List internal notes", "disputes.view", None, []),
 ("post", "/api/admin/disputes/{id}/notes", "Admin: Finance", "Add internal note", "disputes.manage", "Note", []),
 ("get", "/api/admin/settlements", "Admin: Finance", "List settlements; also auto-generates any finished weekly settlement", "settlements.view", None, ["hospitalId", "status"] + Q_PAGE),
 ("post", "/api/admin/settlements", "Admin: Finance", "Generate a settlement for a custom period", "settlements.manage", "SettlementGenerate", []),
 ("post", "/api/admin/settlements/{id}/mark-paid", "Admin: Finance", "Mark a settlement paid", "settlements.manage", "MarkPaid", []),
 ("get", "/api/admin/webhooks", "Admin: Finance", "Payment webhooks", "webhooks.view", None, ["status"] + Q_PAGE),
 ("post", "/api/admin/webhooks/{id}/resync", "Admin: Finance", "Re-sync a webhook", "webhooks.manage", None, []),
 ("get", "/api/admin/support", "Admin: Support", "List all tickets with counts", "support.view_all", None, ["source", "category", "priority", "status", "hospitalId", "from", "to", "q"] + Q_PAGE),
 ("get", "/api/admin/support/assignees", "Admin: Support", "Staff a ticket can be assigned to", "support.view_all", None, []),
 ("get", "/api/admin/support/{id}", "Admin: Support", "Ticket with its conversation", "support.view_all", None, []),
 ("post", "/api/admin/support/{id}/messages", "Admin: Support", "Reply (moves Open to In Progress)", "support.reply", "Message", []),
 ("patch", "/api/admin/support/{id}/assign", "Admin: Support", "Assign ticket", "support.assign", "Assign", []),
 ("patch", "/api/admin/support/{id}/priority", "Admin: Support", "Change priority", "support.update_status", "Priority", []),
 ("patch", "/api/admin/support/{id}/status", "Admin: Support", "Change status (Closed needs support.close)", "support.update_status", "TicketStatus", []),
 ("get", "/api/admin/communications/templates", "Admin: Communications", "List notification templates, channels and unused events", "communications.templates.view", None, []),
 ("post", "/api/admin/communications/templates", "Admin: Communications", "Create template for an event", "communications.templates.create", "TemplateWrite", []),
 ("patch", "/api/admin/communications/templates/{id}", "Admin: Communications", "Edit template (variables validated, before/after audited)", "communications.templates.update", "TemplateWrite", []),
 ("patch", "/api/admin/communications/templates/{id}/status", "Admin: Communications", "Enable / disable template", "communications.templates.enable|disable", "StatusChange", []),
 ("get", "/api/admin/communications/logs", "Admin: Communications", "Notification history", "communications.templates.view", None, ["status", "eventKey"] + Q_PAGE),
 ("get", "/api/admin/communications/announcements", "Admin: Communications", "List announcements", "communications.announcements.view", None, []),
 ("post", "/api/admin/communications/announcements", "Admin: Communications", "Create announcement (draft)", "communications.announcements.create", "Announcement", []),
 ("patch", "/api/admin/communications/announcements/{id}/publish", "Admin: Communications", "Publish / archive (shown in Doctor and Receptionist portals)", "communications.announcements.publish|archive", "StatusChange", []),
 ("get", "/api/admin/communications/banners", "Admin: Communications", "List banners", "communications.banners.view", None, []),
 ("post", "/api/admin/communications/banners", "Admin: Communications", "Create banner", "communications.banners.create", "Banner", []),
 ("patch", "/api/admin/communications/banners/{id}", "Admin: Communications", "Update banner", "communications.banners.update", "Banner", []),
 ("patch", "/api/admin/communications/banners/{id}/status", "Admin: Communications", "Activate / deactivate banner", "communications.banners.activate|deactivate", "StatusChange", []),
 ("get", "/api/admin/settings", "Admin: Settings", "Platform settings", "settings.view", None, []),
 ("put", "/api/admin/settings", "Admin: Settings", "Update a setting", "settings.manage", "Object", []),
 ("get", "/api/admin/feature-flags", "Admin: Settings", "List feature flags", "feature_flags.view", None, []),
 ("patch", "/api/admin/feature-flags/{id}", "Admin: Settings", "Toggle a feature flag", "feature_flags.manage", "Object", []),
 ("get", "/api/admin/app-versions", "Admin: Settings", "List app versions", "app_versions.view", None, []),
 ("put", "/api/admin/app-versions/{platform}", "Admin: Settings", "Update app version", "app_versions.manage", "Object", []),
 ("get", "/api/admin/audit-logs", "Admin: Audit", "Audit logs", "audit_logs.view", None, ["action", "entityType", "userId", "from", "to"] + Q_PAGE),
 # ---- receptionist
 ("get", "/api/me", "Receptionist", "Current user", REC, None, []),
 ("get", "/api/dashboard", "Receptionist", "Dashboard summary", REC, None, []),
 ("get", "/api/search", "Receptionist", "Global search", REC, None, ["q"]),
 ("get", "/api/appointments", "Receptionist", "List appointments", REC, None, ["q", "status", "doctorId", "date"] + Q_PAGE),
 ("get", "/api/appointments/{id}", "Receptionist", "Appointment detail", REC, None, []),
 ("patch", "/api/appointments/{id}/status", "Receptionist", "Update appointment status", REC, "StatusChange", []),
 ("get", "/api/doctors", "Receptionist", "List hospital doctors", REC, None, ["q"]),
 ("post", "/api/doctors", "Receptionist", "Add doctor", REC, "Object", []),
 ("get", "/api/doctors/{id}", "Receptionist", "Doctor detail", REC, None, []),
 ("put", "/api/doctors/{id}", "Receptionist", "Update doctor", REC, "Object", []),
 ("patch", "/api/doctors/{id}/availability", "Receptionist", "Set doctor availability (notifies via DOCTOR_AVAILABILITY_UPDATED)", REC, "Availability", []),
 ("patch", "/api/doctors/availability", "Receptionist", "Bulk availability", REC, "Object", []),
 ("get", "/api/tokens", "Receptionist", "List tokens", REC, None, ["date", "doctorId", "status"]),
 ("post", "/api/tokens", "Receptionist", "Generate token (notifies doctor: TOKEN_GENERATED)", REC, "Object", []),
 ("get", "/api/tokens/eligible", "Receptionist", "Appointments eligible for a token", REC, None, []),
 ("get", "/api/tokens/{id}", "Receptionist", "Token detail", REC, None, []),
 ("patch", "/api/tokens/{id}/status", "Receptionist", "Update token status", REC, "StatusChange", []),
 ("get", "/api/payments", "Receptionist", "Hospital payments", REC, None, ["status", "from", "to"] + Q_PAGE),
 ("post", "/api/refunds", "Receptionist", "Request a refund (Super Admin approves/rejects)", REC, "RefundRequest", []),
 ("get", "/api/hospital", "Receptionist", "Own hospital profile", REC, None, []),
 ("put", "/api/hospital", "Receptionist", "Update hospital profile", REC, "Object", []),
 ("get", "/api/hospital/qr.png", "Receptionist", "Hospital QR (PNG)", REC, None, []),
 ("get", "/api/hospital/qr.svg", "Receptionist", "Hospital QR (SVG)", REC, None, []),
 ("get", "/api/hospital/qr-poster.svg", "Receptionist", "QR poster (SVG)", REC, None, []),
 ("put", "/api/profile", "Receptionist", "Update profile", REC, "Object", []),
 ("put", "/api/profile/password", "Receptionist", "Change password", REC, "PasswordChange", []),
 ("get", "/api/notifications", "Receptionist", "Notifications (system + derived)", REC, None, []),
 ("post", "/api/notifications/read", "Receptionist", "Mark notifications read", REC, "Object", []),
 ("get", "/api/support", "Receptionist", "My tickets", "support.view_own", None, ["status"]),
 ("post", "/api/support", "Receptionist", "Raise a ticket", "support.create", "TicketCreate", []),
 ("get", "/api/support/{id}", "Receptionist", "My ticket with conversation (404 if not mine)", "support.view_own", None, []),
 ("post", "/api/support/{id}/messages", "Receptionist", "Reply on my ticket", "support.reply_own", "Message", []),
 # ---- doctor
 ("get", "/api/doctor/appointments", "Doctor", "My appointments", DOC, None, ["status", "date"] + Q_PAGE),
 ("get", "/api/doctor/appointments/{id}", "Doctor", "Appointment detail", DOC, None, []),
 ("patch", "/api/doctor/appointments/{id}/status", "Doctor", "Update status / cancel (notifies receptionists)", DOC, "StatusChange", []),
 ("patch", "/api/doctor/availability", "Doctor", "Set my availability", DOC, "Availability", []),
 ("get", "/api/doctor/queue", "Doctor", "Queue for a date", DOC, None, ["date"]),
 ("post", "/api/doctor/queue/call-next", "Doctor", "Call next patient", DOC, None, []),
 ("post", "/api/doctor/queue/{id}/start", "Doctor", "Start consultation", DOC, None, []),
 ("post", "/api/doctor/queue/{id}/complete", "Doctor", "Complete consultation", DOC, None, []),
 ("post", "/api/doctor/queue/{id}/skip", "Doctor", "Skip token", DOC, None, []),
 ("post", "/api/doctor/queue/{id}/recall", "Doctor", "Recall token", DOC, None, []),
 ("get", "/api/doctor/schedule", "Doctor", "My weekly schedule", DOC, None, []),
 ("post", "/api/doctor/schedule", "Doctor", "Add schedule slot", DOC, "ScheduleSlot", []),
 ("delete", "/api/doctor/schedule/{id}", "Doctor", "Remove schedule slot", DOC, None, []),
 ("get", "/api/doctor/patients", "Doctor", "My patients", DOC, None, ["q"] + Q_PAGE),
 ("get", "/api/doctor/patients/{id}", "Doctor", "Patient detail", DOC, None, []),
 ("get", "/api/doctor/profile", "Doctor", "My profile", DOC, None, []),
 ("put", "/api/doctor/profile", "Doctor", "Update profile", DOC, "Object", []),
 ("put", "/api/doctor/profile/password", "Doctor", "Change password", DOC, "PasswordChange", []),
 ("get", "/api/doctor/notifications", "Doctor", "Notifications", DOC, None, []),
 ("post", "/api/doctor/notifications/read", "Doctor", "Mark read", DOC, "Object", []),
 ("get", "/api/doctor/support", "Doctor", "My tickets", "support.view_own", None, ["status"]),
 ("post", "/api/doctor/support", "Doctor", "Raise a ticket", "support.create", "TicketCreate", []),
 ("get", "/api/doctor/support/{id}", "Doctor", "My ticket with conversation (404 if not mine)", "support.view_own", None, []),
 ("post", "/api/doctor/support/{id}/messages", "Doctor", "Reply on my ticket", "support.reply_own", "Message", []),
]

SCHEMAS = """
    Object: {type: object, additionalProperties: true, description: Free-form payload; see the portal form for fields}
    Error:
      type: object
      properties:
        error: {type: string}
        fields: {type: object, additionalProperties: {type: string}, description: Per-field validation messages}
    Ok:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        id: {type: string}
    LoginRequest:
      type: object
      required: [role, identifier, password]
      properties:
        role: {type: string, enum: [SUPER_ADMIN, RECEPTIONIST, DOCTOR], description: SUPER_ADMIN also accepts Finance / Support / Operations staff}
        identifier: {type: string, description: Email or username}
        password: {type: string, format: password}
        remember: {type: boolean}
        next: {type: string}
    ForgotPasswordRequest:
      type: object
      required: [identifier]
      properties: {identifier: {type: string}}
    InternalEventRequest:
      type: object
      required: [eventKey, appointmentId]
      properties:
        eventKey: {type: string, enum: [NEW_APPOINTMENT, APPOINTMENT_CONFIRMED, APPOINTMENT_CANCELLED, APPOINTMENT_RESCHEDULED, APPOINTMENT_REMINDER, PAYMENT_SUCCESS, PAYMENT_FAILED]}
        appointmentId: {type: string, example: APT10545}
    StatusChange:
      type: object
      properties:
        status: {type: string}
        reason: {type: string}
        note: {type: string}
    Reason: {type: object, properties: {reason: {type: string}}}
    FeeCommission:
      type: object
      required: [bookingModel, commissionType, commissionValue]
      properties:
        bookingModel: {type: string}
        bookingFee: {type: number}
        convenienceFee: {type: number}
        commissionType: {type: string, enum: [PERCENT, FLAT], description: "PERCENT of collection, or FLAT amount per paid appointment"}
        commissionValue: {type: number, minimum: 0, maximum: 100000}
    RefundRequest:
      type: object
      required: [appointmentId, amount, reason]
      properties: {appointmentId: {type: string}, amount: {type: number}, reason: {type: string}}
    RefundDecision:
      type: object
      required: [decision]
      properties: {decision: {type: string, enum: [APPROVED, REJECTED]}, note: {type: string}}
    DisputeResolve:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [UNDER_REVIEW, RESOLVED, REJECTED]}
        resolution: {type: string, description: Required when status is RESOLVED or REJECTED}
    Note: {type: object, required: [note], properties: {note: {type: string, maxLength: 1000}}}
    SettlementGenerate:
      type: object
      required: [hospitalId, periodStart, periodEnd]
      properties: {hospitalId: {type: string}, periodStart: {type: string, format: date}, periodEnd: {type: string, format: date}}
    MarkPaid: {type: object, required: [payoutReference], properties: {payoutReference: {type: string}}}
    Message: {type: object, required: [message], properties: {message: {type: string}}}
    Assign: {type: object, properties: {assignedTo: {type: string, nullable: true}}}
    Priority: {type: object, required: [priority], properties: {priority: {type: string, enum: [LOW, MEDIUM, HIGH, URGENT]}}}
    TicketStatus: {type: object, required: [status], properties: {status: {type: string, enum: [OPEN, IN_PROGRESS, RESOLVED, CLOSED]}}}
    TicketCreate:
      type: object
      required: [subject, description, category]
      properties:
        subject: {type: string}
        description: {type: string}
        category: {type: string, enum: [APPOINTMENT, PAYMENT, REFUND, HOSPITAL, DOCTOR, ACCOUNT, QR, SCHEDULE, TECHNICAL, OTHER]}
        priority: {type: string, enum: [LOW, MEDIUM, HIGH, URGENT]}
        appointmentId: {type: string}
    TemplateWrite:
      type: object
      properties:
        eventKey: {type: string, description: Required on create}
        title: {type: string}
        body: {type: string, description: "May only use {{variables}} defined for the event"}
        channels: {type: array, items: {type: string, enum: [IN_APP, PUSH, SMS, WHATSAPP, EMAIL]}, description: Only IN_APP delivers; others are logged UNAVAILABLE}
    Announcement:
      type: object
      properties: {title: {type: string}, message: {type: string}, audience: {type: string}, hospitalIds: {type: array, items: {type: string}}}
    Banner:
      type: object
      properties: {title: {type: string}, message: {type: string}, ctaLabel: {type: string}, ctaUrl: {type: string}, startsAt: {type: string}, endsAt: {type: string}}
    Availability: {type: object, required: [availability], properties: {availability: {type: string}}}
    ScheduleSlot:
      type: object
      properties: {dayOfWeek: {type: integer}, startTime: {type: string}, endTime: {type: string}, slotMinutes: {type: integer}}
    PasswordChange:
      type: object
      properties: {currentPassword: {type: string, format: password}, newPassword: {type: string, format: password}}
"""


def op_id(m, p):
    return m + "".join(w.capitalize() for w in re.sub(r"[{}]", "", p).replace(".", "-").strip("/").replace("-", "/").split("/"))


out = []
w = out.append
w("openapi: 3.0.3")
w("info:")
w("  title: Gmedic Web Portal API")
w("  version: 1.0.0")
w("  description: |")
w("    REST API behind the Gmedic Super Admin, Receptionist and Doctor portals (Next.js route handlers).")
w("    Authentication is a session cookie (`gmedic.sid`) set by `POST /api/auth/login`. Authorisation is enforced on the server:")
w("    admin routes need the named permission (403 otherwise), portal routes are scoped to the signed-in hospital / doctor,")
w("    and users only ever see their own support tickets (404 for anyone else's).")
w("    The access requirement of each operation is given in `x-access`.")
w("    Super Admin appointments are read-only: there is no cancel / reschedule / edit endpoint.")
w("servers:")
w("  - url: http://localhost:3000")
w("    description: Local development")
w("security:")
w("  - sessionCookie: []")
w("tags:")
seen = []
for e in E:
    if e[2] not in seen:
        seen.append(e[2])
for t in seen:
    w(f"  - name: \"{t}\"")
w("paths:")
paths = {}
for e in E:
    paths.setdefault(e[1], []).append(e)
for p, ops in paths.items():
    w(f"  {p}:")
    params_path = re.findall(r"{(\w+)}", p)
    for m, _, tag, summary, access, body, query in ops:
        w(f"    {m}:")
        w(f"      tags: [\"{tag}\"]")
        w(f"      summary: \"{summary}\"")
        w(f"      operationId: {op_id(m, p)}")
        w(f"      x-access: \"{access}\"")
        if access in (PUB, "internal"):
            w("      security: []" if access == PUB else "      security:\n        - internalKey: []")
        if params_path or query:
            w("      parameters:")
            for n in params_path:
                w(f"        - {{name: {n}, in: path, required: true, schema: {{type: string}}}}")
            for n in query:
                w(f"        - {{name: {n}, in: query, schema: {{type: string}}}}")
        if body:
            w("      requestBody:")
            w("        required: true")
            w("        content:")
            w("          application/json:")
            w(f"            schema: {{$ref: '#/components/schemas/{body}'}}")
        w("      responses:")
        ctype = "image/png" if p.endswith(".png") else "image/svg+xml" if p.endswith(".svg") else None
        if ctype:
            w(f"        '200': {{description: OK, content: {{{ctype}: {{schema: {{type: string, format: binary}}}}}}}}")
        elif m == "get":
            w("        '200': {description: OK, content: {application/json: {schema: {type: object, additionalProperties: true}}}}")
        else:
            w("        '200': {description: OK, content: {application/json: {schema: {$ref: '#/components/schemas/Ok'}}}}")
        if m == "post" and not ctype:
            pass
        w("        '400': {description: Validation error, content: {application/json: {schema: {$ref: '#/components/schemas/Error'}}}}")
        if access not in (PUB,):
            w("        '401': {description: Not signed in / session ended}")
            if access not in ("internal",):
                w("        '403': {description: Role lacks the required permission}")
        if params_path:
            w("        '404': {description: Not found}")
w("components:")
w("  securitySchemes:")
w("    sessionCookie: {type: apiKey, in: cookie, name: gmedic.sid}")
w("    internalKey: {type: apiKey, in: header, name: x-internal-key, description: Value of the INTERNAL_EVENT_KEY env var}")
w("  schemas:" + SCHEMAS.rstrip("\n"))

dest = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "openapi.yaml")
open(dest, "w", encoding="utf-8").write("\n".join(out) + "\n")
print(dest, len(E), "operations")
