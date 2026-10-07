"""Generates openapi.yaml at the project root. Run: python docs/make_openapi.py"""
import os, re, json

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
 ("get", "/api/admin/dashboard", "Admin: Dashboard", "Operational dashboard: KPI cards, 14-day booking and revenue trends, QR funnel, hospital growth, recent activity and pending work", "dashboard.view", None, []),
 ("get", "/api/admin/analytics", "Admin: Dashboard", "Same payload as the dashboard, behind the separate analytics.view permission (so Finance can see trends without the full dashboard). Takes no filters: always platform-wide, last 14 days for trends and 30 days for rates and the QR funnel", "analytics.view", None, []),
 ("get", "/api/admin/hospitals", "Admin: Hospitals", "List hospitals with doctor counts and a status summary", "hospitals.view", None, ["status", "kycStatus", "q"] + Q_PAGE),
 ("post", "/api/admin/hospitals", "Admin: Hospitals", "Onboard a hospital (starts ONBOARDING / KYC PENDING and gets a Main Reception QR code)", "hospitals.manage", "HospitalCreate", []),
 ("get", "/api/admin/hospitals/{id}", "Admin: Hospitals", "Hospital detail with branch, doctor, receptionist and appointment counts", "hospitals.view", None, []),
 ("put", "/api/admin/hospitals/{id}", "Admin: Hospitals", "Update hospital details (send only the fields to change)", "hospitals.manage", "HospitalUpdate", []),
 ("patch", "/api/admin/hospitals/{id}/status", "Admin: Hospitals", "Change status; a reason is required for SUSPENDED and OFFBOARDED. Data is never deleted", "hospitals.manage", "HospitalStatus", []),
 ("put", "/api/admin/hospitals/{id}/fees", "Admin: Hospitals", "Set booking model, fees and COMMISSION (type + value). Every change is recorded in the rate history", "hospitals.manage", "FeeCommission", []),
 ("get", "/api/admin/hospitals/{id}/rates", "Admin: Hospitals", "Fee and commission history, newest first", "hospitals.view", None, []),
 ("patch", "/api/admin/hospitals/{id}/kyc", "Admin: Hospitals", "Set the hospital's KYC status", "kyc.manage", "KycStatus", []),
 ("get", "/api/admin/hospitals/{id}/documents", "Admin: Hospitals", "List KYC documents", "kyc.view", None, []),
 ("post", "/api/admin/hospitals/{id}/documents", "Admin: Hospitals", "Upload a KYC document (multipart; PDF, PNG or JPEG up to 8 MB). Moves KYC from PENDING to UNDER_REVIEW", "kyc.manage", "DocumentUpload", []),
 ("get", "/api/admin/hospitals/{id}/documents/{docId}", "Admin: Hospitals", "Download / view the stored document file", "kyc.view", None, []),
 ("patch", "/api/admin/hospitals/{id}/documents/{docId}", "Admin: Hospitals", "Verify or reject a document (rejection needs a reason)", "kyc.manage", "DocumentReview", []),
 ("get", "/api/admin/hospitals/{id}/branches", "Admin: Hospitals", "List branches", "branches.view", None, []),
 ("post", "/api/admin/hospitals/{id}/branches", "Admin: Hospitals", "Add a branch", "branches.manage", "BranchCreate", []),
 ("patch", "/api/admin/branches/{id}", "Admin: Hospitals", "Activate or deactivate a branch", "branches.manage", "BranchUpdate", []),
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
 ("get", "/api/admin/qr/{id}/qr.png", "Admin: QR", "QR code image (PNG) for an ACTIVE code; 400 if revoked", "qr.view", None, []),
 ("get", "/api/admin/qr/{id}/poster.svg", "Admin: QR", "Skip the Queue poster (SVG) encoding this code's link; 400 if revoked", "qr.view", None, []),
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
 ("get", "/api/doctor/appointments", "Doctor", "My appointments", DOC, None, []),
 ("get", "/api/doctor/appointments/{id}", "Doctor", "Appointment detail (404 if it is not mine)", DOC, None, []),
 ("patch", "/api/doctor/appointments/{id}/status", "Doctor", "Mark completed, or cancel with a reason (notifies receptionists)", DOC, "DoctorAppointmentStatus", []),
 ("patch", "/api/doctor/availability", "Doctor", "Set my availability (notifies receptionists)", DOC, "Availability", []),
 ("get", "/api/doctor/queue", "Doctor", "My queue for a date (default today)", DOC, None, []),
 ("post", "/api/doctor/queue/call-next", "Doctor", "Call the next waiting patient", DOC, "QueueCallNext", []),
 ("post", "/api/doctor/queue/{id}/start", "Doctor", "Start consultation", DOC, None, []),
 ("post", "/api/doctor/queue/{id}/complete", "Doctor", "Complete consultation", DOC, None, []),
 ("post", "/api/doctor/queue/{id}/skip", "Doctor", "Skip token", DOC, None, []),
 ("post", "/api/doctor/queue/{id}/recall", "Doctor", "Call a skipped patient back", DOC, None, []),
 ("get", "/api/doctor/schedule", "Doctor", "My weekly working hours", DOC, None, []),
 ("post", "/api/doctor/schedule", "Doctor", "Add a working-hours block (no overlaps)", DOC, "ScheduleSlot", []),
 ("delete", "/api/doctor/schedule/{id}", "Doctor", "Remove a working-hours block", DOC, None, []),
 ("get", "/api/doctor/patients", "Doctor", "Patients who have booked with me", DOC, None, []),
 ("get", "/api/doctor/patients/{id}", "Doctor", "Patient detail (404 if not my patient)", DOC, None, []),
 ("get", "/api/doctor/profile", "Doctor", "My profile", DOC, None, []),
 ("put", "/api/doctor/profile", "Doctor", "Update my bio, languages and experience", DOC, "DoctorProfileUpdate", []),
 ("put", "/api/doctor/profile/password", "Doctor", "Change password", DOC, "PasswordChange", []),
 ("get", "/api/doctor/notifications", "Doctor", "Notifications", DOC, None, []),
 ("post", "/api/doctor/notifications/read", "Doctor", "Mark notifications read", DOC, None, []),
 ("get", "/api/doctor/support", "Doctor", "My tickets", "support.view_own", None, []),
 ("post", "/api/doctor/support", "Doctor", "Raise a ticket", "support.create", "TicketCreate", []),
 ("get", "/api/doctor/support/{id}", "Doctor", "My ticket with conversation (404 if not mine)", "support.view_own", None, []),
 ("post", "/api/doctor/support/{id}/messages", "Doctor", "Reply on my ticket", "support.reply_own", "Message", []),
 # ---- doctor
]

QENUM = {
    ("/api/admin/hospitals", "status"): ["ONBOARDING", "ACTIVE", "SUSPENDED", "OFFBOARDED"],
    ("/api/admin/hospitals", "kycStatus"): ["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED"],
}

# POST operations that create a resource answer 201 (checked against the controllers' res.status(201))
CREATED = {
    "/api/admin/hospitals", "/api/admin/hospitals/{id}/branches", "/api/admin/hospitals/{id}/documents",
    "/api/admin/qr", "/api/admin/qr/{id}/reissue", "/api/admin/receptionists", "/api/admin/settlements",
    "/api/admin/communications/templates", "/api/admin/communications/announcements", "/api/admin/communications/banners",
    "/api/admin/disputes/{id}/notes", "/api/admin/support/{id}/messages",
    "/api/doctors", "/api/tokens", "/api/refunds", "/api/support", "/api/support/{id}/messages", "/api/doctor/support", "/api/doctor/support/{id}/messages", "/api/doctor/schedule",
}

RESPONSES = {
    "get /api/admin/dashboard": "DashboardSummary",
    "get /api/admin/analytics": "DashboardSummary",
    "get /api/admin/hospitals": "HospitalList",
    "post /api/admin/hospitals": "HospitalResult",
    "get /api/admin/hospitals/{id}": "HospitalDetail",
    "put /api/admin/hospitals/{id}": "HospitalResult",
    "patch /api/admin/hospitals/{id}/status": "HospitalResult",
    "put /api/admin/hospitals/{id}/fees": "HospitalResult",
    "patch /api/admin/hospitals/{id}/kyc": "HospitalResult",
    "get /api/admin/hospitals/{id}/rates": "RateHistory",
    "get /api/admin/hospitals/{id}/documents": "DocumentList",
    "get /api/admin/hospitals/{id}/branches": "BranchList",
}

HERE = os.path.dirname(os.path.abspath(__file__))
try:
    INFERRED = json.load(open(os.path.join(HERE, "response-schemas.json"), encoding="utf-8"))
except OSError:
    INFERRED = {}
for _key, _v in INFERRED.items():
    RESPONSES.setdefault(_key, _v["name"])

RESPONSES.update({
    "post /api/auth/login": "LoginResponse",
    "post /api/auth/logout": "LogoutResponse",
    "post /api/auth/forgot-password": "Ok",
    "post /api/internal/events": "InternalEventResult",
    "post /api/admin/receptionists": "ReceptionistCreated",
    "post /api/admin/receptionists/{id}/reset-password": "TempPassword",
    "put /api/admin/doctors/{id}": "DoctorResult",
    "patch /api/admin/doctors/{id}/verification": "DoctorResult",
    "get /api/admin/disputes/{id}/notes": "DisputeNotes",
    "get /api/admin/communications/logs": "NotificationLogs",
})

# request body schema per operation (replaces the generic ones)
BODY = {
    ("put", "/api/admin/doctors/{id}"): "DoctorUpdate",
    ("patch", "/api/admin/doctors/{id}/verification"): "DoctorVerification",
    ("post", "/api/admin/receptionists"): "ReceptionistCreate",
    ("patch", "/api/admin/receptionists/{id}/status"): "ActiveStatus",
    ("post", "/api/admin/qr"): "QrCreate",
    ("post", "/api/admin/qr/{id}/revoke"): "QrRevoke",
    ("put", "/api/admin/settings"): "SettingUpdate",
    ("patch", "/api/admin/feature-flags/{id}"): "FeatureFlagUpdate",
    ("put", "/api/admin/app-versions/{platform}"): "AppVersionUpdate",
    ("patch", "/api/admin/communications/templates/{id}/status"): "TemplateStatus",
    ("patch", "/api/admin/communications/announcements/{id}/publish"): "AnnouncementStatus",
    ("patch", "/api/admin/communications/banners/{id}/status"): "ActiveStatus",
    ("post", "/api/admin/communications/announcements"): "AnnouncementCreate",
    ("post", "/api/admin/communications/banners"): "Banner",
    ("patch", "/api/admin/support/{id}/assign"): "Assign",
}

# query parameters exactly as the controllers read them
PARAMS = {
    ("get", "/api/admin/doctors"): ["hospitalId", "specialization", "verificationStatus", "q", "page", "pageSize"],
    ("get", "/api/admin/receptionists"): ["hospitalId", "status", "q", "page", "pageSize"],
    ("get", "/api/admin/qr"): ["hospitalId", "status", "q"],
    ("get", "/api/admin/appointments"): ["id", "mobile", "hospitalId", "doctorId", "date", "from", "to", "status", "paymentStatus", "page", "pageSize"],
    ("get", "/api/admin/patients/search"): ["q", "mobile", "patientId", "appointmentId"],
    ("get", "/api/admin/payments"): ["hospitalId", "doctorId", "from", "to", "status", "q", "page", "pageSize"],
    ("get", "/api/admin/refunds"): ["hospitalId", "status", "page", "pageSize"],
    ("get", "/api/admin/disputes"): ["hospitalId", "status", "page", "pageSize"],
    ("get", "/api/admin/settlements"): ["hospitalId", "status", "page", "pageSize"],
    ("get", "/api/admin/webhooks"): ["status", "page", "pageSize"],
    ("get", "/api/admin/support"): ["source", "category", "priority", "status", "hospitalId", "from", "to", "q", "page", "pageSize"],
    ("get", "/api/admin/communications/logs"): ["status", "eventKey", "page", "pageSize"],
    ("get", "/api/admin/audit-logs"): ["action", "entityType", "userId", "q", "from", "to", "page", "pageSize"],
}
QENUM.update({
    ("/api/admin/doctors", "verificationStatus"): ["PENDING", "VERIFIED", "REJECTED"],
    ("/api/admin/receptionists", "status"): ["ACTIVE", "INACTIVE", "PENDING_APPROVAL", "REJECTED"],
    ("/api/admin/qr", "status"): ["ACTIVE", "REVOKED"],
    ("/api/admin/appointments", "status"): ["pending", "confirmed", "completed", "cancelled"],
    ("/api/admin/appointments", "paymentStatus"): ["paid", "pending"],
    ("/api/admin/payments", "status"): ["PAID", "PENDING", "FAILED"],
    ("/api/admin/refunds", "status"): ["PENDING", "APPROVED", "REJECTED", "PROCESSING", "COMPLETED"],
    ("/api/admin/disputes", "status"): ["OPEN", "UNDER_REVIEW", "RESOLVED", "REJECTED"],
    ("/api/admin/settlements", "status"): ["PENDING", "PROCESSING", "PAID", "ON_HOLD"],
    ("/api/admin/webhooks", "status"): ["RECEIVED", "PROCESSED", "FAILED"],
    ("/api/admin/support", "source"): ["PATIENT", "DOCTOR", "RECEPTIONIST", "ADMIN"],
    ("/api/admin/support", "priority"): ["LOW", "MEDIUM", "HIGH", "URGENT"],
    ("/api/admin/support", "status"): ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
    ("/api/admin/support", "category"): ["APPOINTMENT", "PAYMENT", "REFUND", "HOSPITAL", "DOCTOR", "ACCOUNT", "QR", "SCHEDULE", "TECHNICAL", "OTHER"],
    ("/api/admin/communications/logs", "status"): ["DELIVERED", "SKIPPED", "FAILED", "UNAVAILABLE"],
})
# extra documented outcomes
EXTRA = {
    ("post", "/api/auth/login"): ["'401': {description: Incorrect email/username or password}", "'403': {description: Account is not active}", "'429': {description: Too many failed attempts - wait a few minutes}"],
    ("post", "/api/internal/events"): ["'404': {description: Unknown appointment}", "'503': {description: INTERNAL_EVENT_KEY is not configured}"],
}

RESPONSES.update({
    "patch /api/appointments/{id}/status": "AppointmentResult",
    "post /api/doctors": "RecDoctorResult",
    "put /api/doctors/{id}": "RecDoctorResult",
    "patch /api/doctors/{id}/availability": "RecDoctorResult",
    "patch /api/doctors/availability": "AvailabilityBulkResult",
    "post /api/tokens": "TokenResult",
    "patch /api/tokens/{id}/status": "TokenResult",
    "put /api/hospital": "RecHospitalResult",
    "put /api/profile": "ProfileResult",
    "put /api/profile/password": "Ok",
    "post /api/notifications/read": "NotificationsReadResult",
    "post /api/support": "TicketCreated",
    "post /api/support/{id}/messages": "TicketReply",
})
BODY.update({
    ("patch", "/api/appointments/{id}/status"): "AppointmentStatus",
    ("post", "/api/doctors"): "DoctorCreate",
    ("put", "/api/doctors/{id}"): "DoctorEdit",
    ("patch", "/api/doctors/availability"): "AvailabilityBulk",
    ("post", "/api/tokens"): "TokenCreate",
    ("patch", "/api/tokens/{id}/status"): "TokenStatus",
    ("put", "/api/hospital"): "HospitalProfile",
    ("put", "/api/profile"): "ProfileUpdate",
    ("post", "/api/notifications/read"): None,
})
PARAMS.update({
    ("get", "/api/search"): ["q"],
    ("get", "/api/appointments"): ["q", "date", "from", "to", "doctorId", "status", "paymentStatus", "sort", "page", "pageSize"],
    ("get", "/api/doctors"): ["q", "specialization", "availability"],
    ("get", "/api/tokens"): ["date", "doctorId", "status", "q"],
    ("get", "/api/tokens/eligible"): ["date", "doctorId", "q"],
    ("get", "/api/payments"): ["q", "date", "from", "to", "doctorId", "paymentStatus", "page", "pageSize"],
    ("get", "/api/hospital/qr.png"): ["size", "download"],
    ("get", "/api/hospital/qr-poster.svg"): ["download"],
    ("get", "/api/admin/qr/{id}/qr.png"): ["size", "download"],
    ("get", "/api/admin/qr/{id}/poster.svg"): ["download"],
    ("get", "/api/support"): ["status", "q"],
})
QENUM.update({
    ("/api/appointments", "status"): ["confirmed", "pending", "completed", "cancelled"],
    ("/api/appointments", "paymentStatus"): ["paid", "pending"],
    ("/api/appointments", "sort"): ["date_asc", "date_desc"],
    ("/api/payments", "paymentStatus"): ["paid", "pending"],
    ("/api/doctors", "availability"): ["present", "absent"],
    ("/api/tokens", "status"): ["waiting", "called", "in_consultation", "completed", "cancelled", "skipped"],
    ("/api/hospital/qr.png", "download"): ["1"],
    ("/api/hospital/qr-poster.svg", "download"): ["1"],
    ("/api/admin/qr/{id}/qr.png", "download"): ["1"],
    ("/api/admin/qr/{id}/poster.svg", "download"): ["1"],
    ("/api/support", "status"): ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
})

RESPONSES.update({
    "get /api/notifications": "NotificationList",
})
BODY.update({
})
PARAMS.update({
})
QENUM.update({
})

RESPONSES.update({
    "get /api/notifications": "NotificationList",
    "get /api/doctor/notifications": "NotificationList",
    "patch /api/doctor/appointments/{id}/status": "AppointmentResult",
    "patch /api/doctor/availability": "RecDoctorResult",
    "post /api/doctor/queue/call-next": "TokenResult",
    "post /api/doctor/queue/{id}/start": "TokenResult",
    "post /api/doctor/queue/{id}/complete": "TokenResult",
    "post /api/doctor/queue/{id}/skip": "TokenResult",
    "post /api/doctor/queue/{id}/recall": "TokenResult",
    "put /api/doctor/profile": "DoctorProfileResult",
    "put /api/doctor/profile/password": "Ok",
    "post /api/doctor/notifications/read": "NotificationsReadResult",
    "post /api/doctor/support": "TicketCreated",
    "post /api/doctor/support/{id}/messages": "TicketReply",
})
PARAMS.update({
    ("get", "/api/doctor/appointments"): ["date", "status", "paymentStatus", "q", "page", "pageSize"],
    ("get", "/api/doctor/queue"): ["date"],
    ("get", "/api/doctor/patients"): ["q"],
    ("get", "/api/doctor/support"): ["status", "q"],
})
QENUM.update({
    ("/api/doctor/appointments", "status"): ["confirmed", "pending", "completed", "cancelled"],
    ("/api/doctor/appointments", "paymentStatus"): ["paid", "pending"],
    ("/api/doctor/support", "status"): ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
})

SCHEMAS = """
    DoctorAppointmentStatus:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [completed, cancelled]}
        reason: {type: string, description: Required when cancelling}
    QueueCallNext:
      type: object
      description: Calls the lowest-numbered waiting token
      properties:
        date: {type: string, format: date, description: Defaults to today}
    DoctorProfileUpdate:
      type: object
      description: A doctor can edit only these fields (specialization, fee and registration stay admin-managed)
      properties:
        bio: {type: string, maxLength: 500}
        languages: {type: string, maxLength: 120, example: "English, Hindi, Tamil", description: Comma-separated}
        yearsExperience: {type: integer, minimum: 0}
    DoctorProfileResult:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        doctor: {type: object, additionalProperties: true, description: Same shape as the doctor in DocProfile}
    NotificationList:
      type: object
      properties:
        items:
          type: array
          description: Newest first. Bookings and reminders are derived from appointments; the rest come from notification templates
          items:
            type: object
            additionalProperties: true
            required: [id, type, unread]
            properties:
              id: {type: string}
              type: {type: string, enum: [booking, reminder, system]}
              at: {type: string, format: date-time}
              title: {type: string, description: System notifications}
              body: {type: string, description: System notifications}
              link: {type: string, description: Portal page to open}
              appointmentId: {type: string, description: Booking and reminder notifications}
              patientName: {type: string, nullable: true}
              doctorName: {type: string}
              date: {type: string, format: date}
              time: {type: string}
              unread: {type: boolean}
        unread: {type: integer}
    AppointmentStatus:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [confirmed, pending, completed, cancelled]}
    AppointmentResult:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        appointment: {type: object, additionalProperties: true, description: Same shape as the appointment in RecAppointmentDetail}
    DoctorCreate:
      type: object
      required: [name, specialization, fee, availability]
      properties:
        name: {type: string, minLength: 3, maxLength: 60, description: "Stored with a single Dr. prefix"}
        specialization: {type: string, description: One of the configured specializations}
        fee: {type: integer, minimum: 50, maximum: 20000}
        availability: {type: string, enum: [present, absent]}
    DoctorEdit:
      type: object
      description: Same fields as DoctorCreate, all optional
      properties:
        name: {type: string}
        specialization: {type: string}
        fee: {type: integer, minimum: 50, maximum: 20000}
        availability: {type: string, enum: [present, absent]}
    RecDoctorResult:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        doctor: {type: object, additionalProperties: true, description: Same shape as the doctor in RecDoctorDetail}
    AvailabilityBulk:
      type: object
      required: [changes]
      properties:
        changes:
          type: array
          items:
            type: object
            required: [id, availability]
            properties: {id: {type: string, example: DOC101}, availability: {type: string, enum: [present, absent]}}
    AvailabilityBulkResult:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        updated: {type: array, items: {type: string}, description: Ids of doctors that actually changed}
    TokenCreate:
      type: object
      required: [appointmentId]
      description: The appointment must be paid and not cancelled, dated today or later, and not already have a token
      properties:
        appointmentId: {type: string, example: APT10555}
    TokenStatus:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [waiting, called, in_consultation, completed, cancelled, skipped], description: A cancelled token cannot be changed}
    TokenResult:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        token: {type: object, additionalProperties: true, description: Same shape as the token in RecTokenDetail}
    HospitalProfile:
      type: object
      required: [phone, email, address]
      description: The receptionist can edit contact details and address only, not the hospital's name, fees or status
      properties:
        phone: {type: string}
        email: {type: string, format: email}
        address:
          type: object
          required: [line1, city, state, pincode]
          properties:
            line1: {type: string, minLength: 5, maxLength: 160}
            city: {type: string, maxLength: 60}
            state: {type: string, maxLength: 60}
            pincode: {type: string, pattern: '^[0-9]{6}$'}
    RecHospitalResult:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        hospital: {$ref: '#/components/schemas/RecHospital/properties/hospital'}
    ProfileUpdate:
      type: object
      required: [name, phone]
      properties:
        name: {type: string, minLength: 3, maxLength: 60}
        phone: {type: string}
    ProfileResult:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        user: {$ref: '#/components/schemas/RecMe/properties/user'}
    NotificationsReadResult:
      type: object
      properties:
        ok: {type: boolean}
        unread: {type: integer}
    TicketCreated:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        ticket: {type: object, additionalProperties: true, description: Same shape as the ticket in RecTicketDetail}
    TicketReply:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        messages: {type: array, items: {type: object, additionalProperties: true}, description: The full conversation after the reply}
    AnnouncementCreate:
      type: object
      required: [title, message]
      description: Created as a DRAFT for every hospital; publish it with the publish endpoint
      properties:
        title: {type: string, minLength: 3, maxLength: 160}
        message: {type: string, minLength: 5, maxLength: 1000}
    AnnouncementStatus:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [PUBLISHED, ARCHIVED], description: "PUBLISHED needs communications.announcements.publish, ARCHIVED needs ...archive; an archived announcement cannot be republished"}
    TemplateStatus:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [ACTIVE, INACTIVE], description: Enable or disable the template (separate permissions)}
    ActiveStatus:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [ACTIVE, INACTIVE]}
    DoctorUpdate:
      type: object
      description: Send only the fields to change
      properties:
        specialization: {type: string, description: One of the configured specializations}
        fee: {type: integer, minimum: 50, maximum: 20000}
        department: {type: string, maxLength: 80, description: Created in the departments table if new}
        qualifications: {type: string, maxLength: 160}
        registrationNumber: {type: string, maxLength: 40}
    DoctorVerification:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [PENDING, VERIFIED, REJECTED]}
        note: {type: string, description: Required when REJECTED}
    DoctorResult:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        doctor: {type: object, additionalProperties: true, description: Same shape as the doctor in DoctorDetail}
    ReceptionistCreate:
      type: object
      required: [name, email, phone, hospitalId]
      properties:
        name: {type: string, minLength: 3, maxLength: 60}
        email: {type: string, format: email}
        phone: {type: string}
        hospitalId: {type: string, example: HSP001}
    ReceptionistCreated:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        receptionist:
          type: object
          properties: {id: {type: string}, username: {type: string}, tempPassword: {type: string, description: Shown once; the user must change it at first login}}
    TempPassword:
      type: object
      properties: {ok: {type: boolean}, message: {type: string}, tempPassword: {type: string}}
    QrCreate:
      type: object
      required: [hospitalId, deskLabel]
      properties:
        hospitalId: {type: string}
        deskLabel: {type: string, maxLength: 60}
    QrRevoke:
      type: object
      required: [reason]
      properties:
        reason: {type: string}
    SettingUpdate:
      type: object
      required: [key, value]
      properties:
        key: {type: string, example: appointment_hold_minutes}
        value: {description: Any JSON value (stored as JSON)}
    FeatureFlagUpdate:
      type: object
      required: [enabled]
      properties:
        enabled: {type: boolean}
    AppVersionUpdate:
      type: object
      properties:
        minSupportedVersion: {type: string, example: 1.2.0}
        latestVersion: {type: string, example: 1.4.0}
        forceUpdate: {type: boolean}
        updateMessage: {type: string}
    LoginResponse:
      type: object
      properties:
        ok: {type: boolean}
        redirect: {type: string, example: /admin/dashboard, description: Where the portal sends the user next (honours a safe `next`)}
    LogoutResponse:
      type: object
      properties: {ok: {type: boolean}, redirect: {type: string, example: "/login?loggedOut=1"}}
    InternalEventResult:
      type: object
      properties:
        ok: {type: boolean}
        event: {type: string, example: New Appointment}
        delivered: {type: integer, description: Recipients that got an in-app notification}
        results: {type: array, items: {type: object, additionalProperties: true}, description: "One entry per recipient: DELIVERED, SKIPPED, FAILED or UNAVAILABLE"}
    DisputeNotes:
      type: object
      properties:
        notes:
          type: array
          items:
            type: object
            properties: {id: {type: integer}, userName: {type: string}, note: {type: string}, createdAt: {type: string, format: date-time}}
    NotificationLogs:
      type: object
      properties:
        items:
          type: array
          items:
            type: object
            additionalProperties: true
            description: Delivery attempt (eventKey, recipient, channel, status DELIVERED / SKIPPED / FAILED / UNAVAILABLE, failureReason, createdAt)
        total: {type: integer}
        page: {type: integer}
        pageSize: {type: integer}
        pages: {type: integer}
    Hospital:
      type: object
      properties:
        id: {type: string, example: HSP001}
        name: {type: string}
        address: {type: object, properties: {line1: {type: string}, city: {type: string}, state: {type: string}, pincode: {type: string}}}
        contactPerson: {type: string, nullable: true}
        phone: {type: string}
        email: {type: string}
        gstin: {type: string, nullable: true}
        registrationNumber: {type: string, nullable: true}
        status: {type: string, enum: [ONBOARDING, ACTIVE, SUSPENDED, OFFBOARDED]}
        statusReason: {type: string, nullable: true}
        kycStatus: {type: string, enum: [PENDING, UNDER_REVIEW, VERIFIED, REJECTED]}
        bookingModel: {type: string, enum: [FULL_PREPAY, BOOKING_FEE, TOKEN]}
        bookingFee: {type: number}
        convenienceFee: {type: number}
        commissionType: {type: string, enum: [PERCENT, FLAT]}
        commissionValue: {type: number}
        currency: {type: string, example: INR}
        timezone: {type: string, example: Asia/Kolkata}
        createdAt: {type: string, format: date-time}
        updatedAt: {type: string, format: date-time}
    HospitalList:
      type: object
      properties:
        items:
          type: array
          items:
            allOf:
              - $ref: '#/components/schemas/Hospital'
              - {type: object, properties: {doctorCount: {type: integer}}}
        total: {type: integer}
        page: {type: integer}
        pageSize: {type: integer}
        pages: {type: integer}
        summary: {type: object, description: Hospital count per status across the platform, properties: {ONBOARDING: {type: integer}, ACTIVE: {type: integer}, SUSPENDED: {type: integer}, OFFBOARDED: {type: integer}}}
    HospitalDetail:
      type: object
      properties:
        hospital: {$ref: '#/components/schemas/Hospital'}
        stats: {type: object, properties: {branches: {type: integer}, doctors: {type: integer}, receptionists: {type: integer}, appointments: {type: integer}}}
    HospitalResult:
      type: object
      properties:
        ok: {type: boolean}
        message: {type: string}
        hospital: {$ref: '#/components/schemas/Hospital'}
    HospitalCreate:
      type: object
      required: [name, phone, email, line1, city, state, pincode]
      properties:
        name: {type: string, minLength: 3, maxLength: 120}
        phone: {type: string, example: "+91 98765 43210"}
        email: {type: string, format: email}
        contactPerson: {type: string, maxLength: 80}
        line1: {type: string, minLength: 5, maxLength: 160, description: Street address}
        city: {type: string, maxLength: 60}
        state: {type: string, maxLength: 60}
        pincode: {type: string, pattern: '^[0-9]{6}$'}
        gstin: {type: string, maxLength: 15}
        registrationNumber: {type: string, maxLength: 40}
    HospitalUpdate:
      type: object
      description: Same fields as HospitalCreate, all optional
      properties:
        name: {type: string}
        phone: {type: string}
        email: {type: string, format: email}
        contactPerson: {type: string}
        line1: {type: string}
        city: {type: string}
        state: {type: string}
        pincode: {type: string, pattern: '^[0-9]{6}$'}
        gstin: {type: string}
        registrationNumber: {type: string}
    HospitalStatus:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [ONBOARDING, ACTIVE, SUSPENDED, OFFBOARDED]}
        reason: {type: string, description: Required for SUSPENDED and OFFBOARDED}
    KycStatus:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [PENDING, UNDER_REVIEW, VERIFIED, REJECTED]}
        reason: {type: string}
    RateHistory:
      type: object
      properties:
        rates:
          type: array
          items:
            type: object
            properties:
              id: {type: integer}
              bookingModel: {type: string, nullable: true}
              bookingFee: {type: number, nullable: true}
              convenienceFee: {type: number, nullable: true}
              commissionType: {type: string, enum: [PERCENT, FLAT]}
              commissionValue: {type: number}
              effectiveFrom: {type: string, format: date-time}
    DocumentUpload:
      type: object
      required: [docType, file]
      properties:
        docType: {type: string, enum: [LICENCE, BANK_PROOF, GST_CERTIFICATE, REGISTRATION]}
        file: {type: string, format: binary, description: "PDF, PNG or JPEG up to 8 MB"}
    DocumentReview:
      type: object
      required: [status]
      properties:
        status: {type: string, enum: [VERIFIED, REJECTED]}
        reason: {type: string, description: Required when REJECTED}
    DocumentList:
      type: object
      properties:
        documents:
          type: array
          items:
            type: object
            properties:
              id: {type: string, example: DOC1}
              docType: {type: string}
              fileName: {type: string}
              status: {type: string, enum: [PENDING, VERIFIED, REJECTED]}
              rejectionReason: {type: string, nullable: true}
              reviewerName: {type: string, nullable: true}
              reviewedAt: {type: string, format: date-time, nullable: true}
              createdAt: {type: string, format: date-time}
    BranchList:
      type: object
      properties:
        branches:
          type: array
          items:
            type: object
            properties: {id: {type: string, example: BR1}, name: {type: string}, address: {type: string}, contactPerson: {type: string, nullable: true}, phone: {type: string}, status: {type: string, enum: [ACTIVE, INACTIVE]}}
    BranchCreate:
      type: object
      required: [name, address, phone]
      properties:
        name: {type: string, minLength: 2, maxLength: 120}
        address: {type: string, minLength: 5, maxLength: 255}
        phone: {type: string}
        contactPerson: {type: string, maxLength: 80}
    BranchUpdate:
      type: object
      properties:
        status: {type: string, enum: [ACTIVE, INACTIVE]}
    DashboardSummary:
      type: object
      required: [cards, bookingTrend, revenueTrend, qrFunnel, hospitalGrowth, recentHospitals, recentAppointments, pending]
      properties:
        cards:
          type: object
          properties:
            totalHospitals: {type: integer}
            activeHospitals: {type: integer}
            suspendedHospitals: {type: integer}
            totalDoctors: {type: integer}
            totalReceptionists: {type: integer}
            totalPatients: {type: integer}
            todayAppointments: {type: integer, description: Non-cancelled appointments dated today}
            todayRevenue: {type: number, description: PAID payments captured today (INR)}
            paymentSuccessRate: {type: integer, minimum: 0, maximum: 100, description: "Paid / (paid + failed) over the last 30 days; 100 when there were no attempts"}
            pendingKyc: {type: integer}
            pendingRefunds: {type: integer}
            todayQrScans: {type: integer}
        bookingTrend:
          type: array
          description: Last 14 days, one row per appointment date that has data
          items:
            type: object
            properties: {date: {type: string, format: date}, booked: {type: integer}, completed: {type: integer}, cancelled: {type: integer}}
        revenueTrend:
          type: array
          items:
            type: object
            properties: {date: {type: string, format: date}, gross: {type: number}, refunded: {type: number}}
        qrFunnel:
          type: object
          description: Last 30 days
          properties: {scans: {type: integer}, linked: {type: integer}, bookings: {type: integer}, payments: {type: integer}}
        hospitalGrowth:
          type: array
          description: Hospitals onboarded per month, last 6 months
          items:
            type: object
            properties: {month: {type: string, example: 2026-09}, count: {type: integer}}
        recentHospitals:
          type: array
          items:
            type: object
            properties: {id: {type: string}, name: {type: string}, location: {type: string}, status: {type: string}, kycStatus: {type: string}, createdAt: {type: string, format: date-time}}
        recentAppointments:
          type: array
          items:
            type: object
            properties: {id: {type: string}, patientName: {type: string, nullable: true}, hospitalName: {type: string}, doctorName: {type: string}, date: {type: string, format: date}, paymentStatus: {type: string, enum: [paid, pending]}}
        pending:
          type: object
          description: Work waiting for a Super Admin (up to 5 of each)
          properties:
            kyc: {type: array, items: {type: object, properties: {id: {type: string}, name: {type: string}, kycStatus: {type: string}}}}
            doctorVerification: {type: array, items: {type: object, properties: {id: {type: string}, name: {type: string}, hospitalId: {type: string}}}}
            refunds: {type: array, items: {type: object, properties: {id: {type: string}, amount: {type: number}, hospitalName: {type: string}}}}
            supportTickets: {type: array, items: {type: object, properties: {id: {type: string}, subject: {type: string}, priority: {type: string}}}}
            paymentIssues: {type: array, items: {type: object, properties: {id: {type: string}, transactionId: {type: string}, reason: {type: string, nullable: true}}}}
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
        bookingModel: {type: string, enum: [FULL_PREPAY, BOOKING_FEE, TOKEN]}
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
    Banner:
      type: object
      required: [title, message]
      properties:
        title: {type: string, minLength: 3, maxLength: 160}
        message: {type: string, minLength: 5, maxLength: 300}
        ctaLabel: {type: string, maxLength: 40, description: Required when ctaUrl is set}
        ctaUrl: {type: string, maxLength: 300}
    Availability: {type: object, required: [availability], properties: {availability: {type: string, enum: [present, absent]}}}
    ScheduleSlot:
      type: object
      required: [dayOfWeek, startTime, endTime]
      description: A weekly working-hours block. It may not overlap another block on the same day
      properties:
        dayOfWeek: {type: integer, minimum: 0, maximum: 6, description: 0 = Sunday}
        startTime: {type: string, example: "09:00", pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$'}
        endTime: {type: string, example: "13:00", description: Must be after startTime}
        slotMinutes: {type: integer, minimum: 5, maximum: 120, default: 15, description: Appointment length in minutes}
    PasswordChange:
      type: object
      required: [currentPassword, newPassword, confirmPassword]
      properties:
        currentPassword: {type: string, format: password}
        newPassword: {type: string, format: password, description: At least 8 characters with a letter and a number; must differ from the current one}
        confirmPassword: {type: string, format: password}
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
        body = BODY.get((m, p), body)
        query = PARAMS.get((m, p), query)
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
                enum = QENUM.get((p, n))
                typ = "integer" if n in ("page", "pageSize", "size") else "string"
                extra = f", enum: [{', '.join(enum)}]" if enum else ""
                w(f"        - {{name: {n}, in: query, schema: {{type: {typ}{extra}}}}}")
        if body:
            w("      requestBody:")
            w("        required: true")
            w("        content:")
            w("          multipart/form-data:" if body == "DocumentUpload" else "          application/json:")
            w(f"            schema: {{$ref: '#/components/schemas/{body}'}}")
        w("      responses:")
        ctype = "image/png" if p.endswith(".png") else "image/svg+xml" if p.endswith(".svg") else None
        if ctype:
            w(f"        '200': {{description: OK, content: {{{ctype}: {{schema: {{type: string, format: binary}}}}}}}}")
        elif m == "get" and p.endswith("/documents/{docId}"):
            w("        '200': {description: The stored file, content: {application/pdf: {schema: {type: string, format: binary}}, image/png: {schema: {type: string, format: binary}}, image/jpeg: {schema: {type: string, format: binary}}}}")
        elif f"{m} {p}" in RESPONSES:
            w(f"        '{'201' if m == 'post' and p in CREATED else '200'}': {{description: {'Created' if m == 'post' and p in CREATED else 'OK'}, content: {{application/json: {{schema: {{$ref: '#/components/schemas/{RESPONSES[f'{m} {p}']}'}}}}}}}}")
        elif m == "get":
            w("        '200': {description: OK, content: {application/json: {schema: {type: object, additionalProperties: true}}}}")
        elif m == "post" and p in CREATED:
            w("        '201': {description: Created, content: {application/json: {schema: {$ref: '#/components/schemas/Ok'}}}}")
        else:
            w("        '200': {description: OK, content: {application/json: {schema: {$ref: '#/components/schemas/Ok'}}}}")
        w("        '400': {description: Validation error, content: {application/json: {schema: {$ref: '#/components/schemas/Error'}}}}")
        if access not in (PUB,) and (m, p) not in EXTRA:
            w("        '401': {description: Not signed in / session ended}")
            if access not in ("internal",):
                w("        '403': {description: Role lacks the required permission}")
        elif access == "internal":
            w("        '401': {description: Missing or wrong x-internal-key}")
        if params_path:
            w("        '404': {description: Not found}")
        for extra in EXTRA.get((m, p), []):
            w("        " + extra)
w("components:")
w("  securitySchemes:")
w("    sessionCookie: {type: apiKey, in: cookie, name: gmedic.sid}")
w("    internalKey: {type: apiKey, in: header, name: x-internal-key, description: Value of the INTERNAL_EVENT_KEY env var}")
w("  schemas:" + SCHEMAS.rstrip("\n"))
for _key, _v in INFERRED.items():
    w(f"    {_v['name']}: {json.dumps(_v['schema'])}")

dest = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "openapi.yaml")
open(dest, "w", encoding="utf-8").write("\n".join(out) + "\n")
print(dest, len(E), "operations")
