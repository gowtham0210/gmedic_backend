-- Gmedic platform schema (SQLite). Super Admin + Receptionist + Doctor portals
-- share it. Timestamps are stored as "YYYY-MM-DD HH:MM:SS" UTC text (SQLite's
-- own CURRENT_TIMESTAMP produces exactly this format). IDs are short prefixed
-- strings (HSP001, DOC101, APT10001, ...) so they stay readable in the UI.
--
-- SQLite has no native ENUM or "ON UPDATE CURRENT_TIMESTAMP" column clause:
-- enums are TEXT + CHECK constraints, and every table with updated_at gets a
-- trigger that keeps it current on UPDATE, so application code never needs to
-- set it explicitly (matching how the original MySQL schema behaved).

-- ---------------------------------------------------------------- hospitals
CREATE TABLE hospitals (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  logo_url             TEXT,
  address_line1        TEXT NOT NULL,
  city                 TEXT NOT NULL,
  state                TEXT NOT NULL,
  pincode              TEXT NOT NULL,
  contact_person       TEXT,
  phone                TEXT NOT NULL,
  email                TEXT NOT NULL,
  gstin                TEXT,
  registration_number  TEXT,
  registration_details TEXT,
  status               TEXT NOT NULL DEFAULT 'ONBOARDING' CHECK (status IN ('ONBOARDING','ACTIVE','SUSPENDED','OFFBOARDED')),
  status_reason        TEXT,
  kyc_status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (kyc_status IN ('PENDING','UNDER_REVIEW','VERIFIED','REJECTED')),
  onboarding_step      INTEGER NOT NULL DEFAULT 1,
  booking_model        TEXT NOT NULL DEFAULT 'FULL_PREPAY' CHECK (booking_model IN ('FULL_PREPAY','BOOKING_FEE','TOKEN')),
  booking_fee          REAL NOT NULL DEFAULT 0,
  convenience_fee      REAL NOT NULL DEFAULT 0,
  commission_type      TEXT NOT NULL DEFAULT 'PERCENT' CHECK (commission_type IN ('PERCENT','FLAT')),
  commission_value     REAL NOT NULL DEFAULT 0,
  activated_at         TEXT,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_hospitals_gstin ON hospitals (gstin);
CREATE UNIQUE INDEX uq_hospitals_registration ON hospitals (registration_number);
CREATE INDEX ix_hospitals_status ON hospitals (status);
CREATE INDEX ix_hospitals_kyc ON hospitals (kyc_status);
CREATE INDEX ix_hospitals_created ON hospitals (created_at);
CREATE TRIGGER trg_hospitals_updated AFTER UPDATE ON hospitals BEGIN
  UPDATE hospitals SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE hospital_branches (
  id              TEXT PRIMARY KEY,
  hospital_id     TEXT NOT NULL REFERENCES hospitals (id),
  name            TEXT NOT NULL,
  address         TEXT NOT NULL,
  contact_person  TEXT,
  phone           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_branches_hospital ON hospital_branches (hospital_id, status);
CREATE TRIGGER trg_branches_updated AFTER UPDATE ON hospital_branches BEGIN
  UPDATE hospital_branches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------- users & access
-- role: platform roles (SUPER_ADMIN, FINANCE, SUPPORT, OPERATIONS) and portal
-- roles (RECEPTIONIST, DOCTOR). Permissions per role live in config/permissions.js
-- and are enforced by middleware on every protected route.
CREATE TABLE users (
  id                   TEXT PRIMARY KEY,
  role                 TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','FINANCE','SUPPORT','OPERATIONS','RECEPTIONIST','DOCTOR')),
  hospital_id          TEXT REFERENCES hospitals (id),
  doctor_id            TEXT,
  name                 TEXT NOT NULL,
  username             TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  password_hash        TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_APPROVAL','ACTIVE','INACTIVE','REJECTED')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  session_version      INTEGER NOT NULL DEFAULT 1,
  approved_by          TEXT,
  approved_at          TEXT,
  last_login_at        TEXT,
  password_changed_at  TEXT,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_users_email ON users (email);
CREATE UNIQUE INDEX uq_users_username ON users (username);
CREATE INDEX ix_users_role_status ON users (role, status);
CREATE INDEX ix_users_hospital ON users (hospital_id);
CREATE TRIGGER trg_users_updated AFTER UPDATE ON users BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Server-side sessions (logout/deactivation invalidates them).
CREATE TABLE sessions (
  sid        TEXT PRIMARY KEY,
  user_id    TEXT,
  data       TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX ix_sessions_expires ON sessions (expires_at);
CREATE INDEX ix_sessions_user ON sessions (user_id);

-- ---------------------------------------------------------------- KYC
CREATE TABLE hospital_documents (
  id               TEXT PRIMARY KEY,
  hospital_id      TEXT NOT NULL REFERENCES hospitals (id),
  doc_type         TEXT NOT NULL CHECK (doc_type IN ('LICENCE','BANK_PROOF','GST_CERTIFICATE','REGISTRATION')),
  file_name        TEXT NOT NULL,
  storage_path     TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  size_bytes       INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
  rejection_reason TEXT,
  reviewed_by      TEXT REFERENCES users (id),
  reviewed_at      TEXT,
  uploaded_by      TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_docs_hospital ON hospital_documents (hospital_id, doc_type);
CREATE INDEX ix_docs_status ON hospital_documents (status);
CREATE TRIGGER trg_docs_updated AFTER UPDATE ON hospital_documents BEGIN
  UPDATE hospital_documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------- doctors
CREATE TABLE doctors (
  id                      TEXT PRIMARY KEY,
  hospital_id             TEXT NOT NULL REFERENCES hospitals (id),
  branch_id               TEXT REFERENCES hospital_branches (id),
  name                    TEXT NOT NULL,
  photo_url               TEXT,
  department              TEXT,
  specialization          TEXT NOT NULL,
  registration_number     TEXT,
  qualifications          TEXT,
  fee                     REAL NOT NULL,
  availability            TEXT NOT NULL DEFAULT 'present' CHECK (availability IN ('present','absent')),
  availability_updated_at TEXT,
  verification_status     TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED')),
  verification_note       TEXT,
  verified_by             TEXT,
  verified_at             TEXT,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_doctors_registration ON doctors (registration_number);
CREATE INDEX ix_doctors_hospital ON doctors (hospital_id, availability);
CREATE INDEX ix_doctors_verification ON doctors (verification_status);
CREATE INDEX ix_doctors_specialization ON doctors (specialization);
CREATE TRIGGER trg_doctors_updated AFTER UPDATE ON doctors BEGIN
  UPDATE doctors SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE doctor_schedules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id    TEXT NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL, -- 0 = Sunday
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 15
);
CREATE UNIQUE INDEX uq_schedule_slot ON doctor_schedules (doctor_id, day_of_week, start_time);

-- ---------------------------------------------------------------- patients
CREATE TABLE patients (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  mobile     TEXT NOT NULL,
  email      TEXT,
  city       TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_patients_mobile ON patients (mobile);
CREATE INDEX ix_patients_name ON patients (name);
CREATE TRIGGER trg_patients_updated AFTER UPDATE ON patients BEGIN
  UPDATE patients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------- QR codes
CREATE TABLE qr_codes (
  id             TEXT PRIMARY KEY,
  qr_key         TEXT NOT NULL,
  hospital_id    TEXT NOT NULL REFERENCES hospitals (id),
  branch_id      TEXT REFERENCES hospital_branches (id),
  desk_label     TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  revoked_reason TEXT,
  revoked_at     TEXT,
  revoked_by     TEXT,
  replaced_by    TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_qr_key ON qr_codes (qr_key);
CREATE INDEX ix_qr_hospital ON qr_codes (hospital_id, status);
CREATE TRIGGER trg_qr_updated AFTER UPDATE ON qr_codes BEGIN
  UPDATE qr_codes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE qr_scans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_code_id     TEXT,
  hospital_id    TEXT,
  branch_id      TEXT,
  patient_id     TEXT,
  result         TEXT NOT NULL CHECK (result IN ('LINKED','ALREADY_LINKED','FAILED')),
  failure_reason TEXT,
  is_sample      INTEGER NOT NULL DEFAULT 0,
  scanned_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_scans_qr_time ON qr_scans (qr_code_id, scanned_at);
CREATE INDEX ix_scans_hospital_time ON qr_scans (hospital_id, scanned_at);
CREATE INDEX ix_scans_time ON qr_scans (scanned_at);

CREATE TABLE patient_hospital_links (
  patient_id  TEXT NOT NULL REFERENCES patients (id),
  hospital_id TEXT NOT NULL REFERENCES hospitals (id),
  qr_code_id  TEXT,
  linked_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (patient_id, hospital_id)
);
CREATE INDEX ix_links_hospital ON patient_hospital_links (hospital_id);

-- ---------------------------------------------------------------- appointments
CREATE TABLE appointments (
  id                     TEXT PRIMARY KEY,
  hospital_id            TEXT NOT NULL REFERENCES hospitals (id),
  branch_id              TEXT REFERENCES hospital_branches (id),
  doctor_id              TEXT NOT NULL REFERENCES doctors (id),
  patient_id             TEXT NOT NULL REFERENCES patients (id),
  patient_name           TEXT NOT NULL,
  appt_date              TEXT NOT NULL,
  appt_time              TEXT NOT NULL,
  fee                    REAL NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed','pending','completed','cancelled')),
  payment_status         TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('paid','pending')),
  source                 TEXT NOT NULL DEFAULT 'Gmedic App',
  no_show                INTEGER NOT NULL DEFAULT 0,
  cancel_reason          TEXT,
  cancelled_by           TEXT,
  rescheduled_from_date  TEXT,
  rescheduled_from_time  TEXT,
  created_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_appts_hospital_date ON appointments (hospital_id, appt_date);
CREATE INDEX ix_appts_doctor_date ON appointments (doctor_id, appt_date);
CREATE INDEX ix_appts_patient ON appointments (patient_id);
CREATE INDEX ix_appts_date ON appointments (appt_date);
CREATE INDEX ix_appts_created ON appointments (created_at);
CREATE TRIGGER trg_appts_updated AFTER UPDATE ON appointments BEGIN
  UPDATE appointments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE tokens (
  id             TEXT PRIMARY KEY,
  hospital_id    TEXT NOT NULL REFERENCES hospitals (id),
  appointment_id TEXT NOT NULL REFERENCES appointments (id),
  doctor_id      TEXT NOT NULL REFERENCES doctors (id),
  patient_name   TEXT NOT NULL,
  token_date     TEXT NOT NULL,
  number         INTEGER NOT NULL,
  code           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','called','completed','cancelled')),
  called_at      TEXT,
  completed_at   TEXT,
  cancelled_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_tokens_day_number ON tokens (hospital_id, token_date, number);
CREATE INDEX ix_tokens_appointment ON tokens (appointment_id);
CREATE INDEX ix_tokens_doctor ON tokens (doctor_id, token_date);
CREATE TRIGGER trg_tokens_updated AFTER UPDATE ON tokens BEGIN
  UPDATE tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------- payments
CREATE TABLE payments (
  id              TEXT PRIMARY KEY,
  appointment_id  TEXT NOT NULL REFERENCES appointments (id),
  hospital_id     TEXT NOT NULL REFERENCES hospitals (id),
  patient_id      TEXT NOT NULL REFERENCES patients (id),
  amount          REAL NOT NULL,
  convenience_fee REAL NOT NULL DEFAULT 0,
  method          TEXT,
  gateway         TEXT NOT NULL DEFAULT 'SIMULATED',
  transaction_id  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PAID','FAILED','PENDING')),
  gateway_status  TEXT,
  failure_reason  TEXT,
  paid_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_payments_txn ON payments (transaction_id);
CREATE INDEX ix_payments_appointment ON payments (appointment_id);
CREATE INDEX ix_payments_hospital_time ON payments (hospital_id, created_at);
CREATE INDEX ix_payments_status ON payments (status);
CREATE TRIGGER trg_payments_updated AFTER UPDATE ON payments BEGIN
  UPDATE payments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE payment_webhooks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway         TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  transaction_id  TEXT,
  payment_id      TEXT,
  status          TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSED','FAILED')),
  failure_reason  TEXT,
  sync_status     TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (sync_status IN ('NOT_REQUIRED','PENDING','SYNCED','FAILED')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  last_retry_at   TEXT,
  payload         TEXT,
  is_sample       INTEGER NOT NULL DEFAULT 0,
  received_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_webhooks_status ON payment_webhooks (status, received_at);
CREATE INDEX ix_webhooks_txn ON payment_webhooks (transaction_id);

CREATE TABLE refunds (
  id               TEXT PRIMARY KEY,
  payment_id       TEXT NOT NULL REFERENCES payments (id),
  appointment_id   TEXT NOT NULL REFERENCES appointments (id),
  hospital_id      TEXT NOT NULL REFERENCES hospitals (id),
  patient_id       TEXT NOT NULL REFERENCES patients (id),
  amount           REAL NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','PROCESSING','COMPLETED')),
  requires_checker INTEGER NOT NULL DEFAULT 0,
  requested_by     TEXT,
  approved_by      TEXT,
  approved_at      TEXT,
  decision_note    TEXT,
  completed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_refunds_status ON refunds (status, created_at);
CREATE INDEX ix_refunds_hospital ON refunds (hospital_id);
CREATE INDEX ix_refunds_payment ON refunds (payment_id);
CREATE TRIGGER trg_refunds_updated AFTER UPDATE ON refunds BEGIN
  UPDATE refunds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE settlements (
  id                 TEXT PRIMARY KEY,
  hospital_id        TEXT NOT NULL REFERENCES hospitals (id),
  period_start       TEXT NOT NULL,
  period_end         TEXT NOT NULL,
  gross_collection   REAL NOT NULL DEFAULT 0,
  refunds_amount     REAL NOT NULL DEFAULT 0,
  commission_amount  REAL NOT NULL DEFAULT 0,
  convenience_fees   REAL NOT NULL DEFAULT 0,
  net_payout         REAL NOT NULL DEFAULT 0,
  payout_date        TEXT,
  payout_reference   TEXT,
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PAID','ON_HOLD')),
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_settlement_period ON settlements (hospital_id, period_start, period_end);
CREATE INDEX ix_settlements_status ON settlements (status);
CREATE TRIGGER trg_settlements_updated AFTER UPDATE ON settlements BEGIN
  UPDATE settlements SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------- support
CREATE TABLE support_tickets (
  id             TEXT PRIMARY KEY,
  source         TEXT NOT NULL CHECK (source IN ('PATIENT_APP','HOSPITAL','EMAIL','PHONE','INTERNAL')),
  category       TEXT NOT NULL CHECK (category IN ('BOOKING','PAYMENT','REFUND','QR','ACCOUNT','TECHNICAL','OTHER')),
  subject        TEXT NOT NULL,
  description    TEXT NOT NULL,
  hospital_id    TEXT REFERENCES hospitals (id),
  patient_id     TEXT REFERENCES patients (id),
  appointment_id TEXT,
  priority       TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  assigned_to    TEXT REFERENCES users (id),
  sla_due_at     TEXT NOT NULL,
  resolved_at    TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_tickets_status ON support_tickets (status, priority);
CREATE INDEX ix_tickets_hospital ON support_tickets (hospital_id);
CREATE INDEX ix_tickets_assignee ON support_tickets (assigned_to);
CREATE TRIGGER trg_tickets_updated AFTER UPDATE ON support_tickets BEGIN
  UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE disputes (
  id             TEXT PRIMARY KEY,
  payment_id     TEXT NOT NULL REFERENCES payments (id),
  transaction_id TEXT NOT NULL,
  patient_id     TEXT NOT NULL REFERENCES patients (id),
  hospital_id    TEXT NOT NULL REFERENCES hospitals (id),
  amount         REAL NOT NULL,
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED')),
  resolution     TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_disputes_status ON disputes (status);
CREATE TRIGGER trg_disputes_updated AFTER UPDATE ON disputes BEGIN
  UPDATE disputes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Internal notes on tickets and disputes (append-only).
CREATE TABLE internal_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('TICKET','DISPUTE')),
  entity_id   TEXT NOT NULL,
  user_id     TEXT,
  user_name   TEXT NOT NULL,
  note        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_notes_entity ON internal_notes (entity_type, entity_id);

-- ---------------------------------------------------------------- communications
CREATE TABLE notification_templates (
  id         TEXT PRIMARY KEY,
  channel    TEXT NOT NULL CHECK (channel IN ('PUSH','SMS','WHATSAPP')),
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  title      TEXT,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_template_channel_code ON notification_templates (channel, code);
CREATE TRIGGER trg_templates_updated AFTER UPDATE ON notification_templates BEGIN
  UPDATE notification_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE announcements (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  target       TEXT NOT NULL DEFAULT 'ALL' CHECK (target IN ('ALL','SELECTED')),
  status       TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  published_at TEXT,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_announcements_status ON announcements (status, published_at);
CREATE TRIGGER trg_announcements_updated AFTER UPDATE ON announcements BEGIN
  UPDATE announcements SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE announcement_hospitals (
  announcement_id TEXT NOT NULL REFERENCES announcements (id) ON DELETE CASCADE,
  hospital_id     TEXT NOT NULL REFERENCES hospitals (id),
  PRIMARY KEY (announcement_id, hospital_id)
);

CREATE TABLE banners (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  cta_label  TEXT,
  cta_url    TEXT,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT,
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_banners_live ON banners (status, starts_at, ends_at);
CREATE TRIGGER trg_banners_updated AFTER UPDATE ON banners BEGIN
  UPDATE banners SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------- configuration
CREATE TABLE platform_settings (
  setting_key TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_settings_updated AFTER UPDATE ON platform_settings BEGIN
  UPDATE platform_settings SET updated_at = CURRENT_TIMESTAMP WHERE setting_key = NEW.setting_key;
END;

-- hospital_id NULL = platform default for the flag (scope_key '*').
CREATE TABLE feature_flags (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  flag_key    TEXT NOT NULL,
  hospital_id TEXT REFERENCES hospitals (id),
  scope_key   TEXT AS (IFNULL(hospital_id, '*')) STORED,
  enabled     INTEGER NOT NULL DEFAULT 0,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_flag_scope ON feature_flags (flag_key, scope_key);
CREATE TRIGGER trg_flags_updated AFTER UPDATE ON feature_flags BEGIN
  UPDATE feature_flags SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE app_versions (
  platform              TEXT PRIMARY KEY CHECK (platform IN ('ANDROID','IOS')),
  current_version       TEXT NOT NULL,
  min_supported_version TEXT NOT NULL,
  latest_version        TEXT NOT NULL,
  force_update          INTEGER NOT NULL DEFAULT 0,
  update_message        TEXT,
  updated_by            TEXT,
  updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_app_versions_updated AFTER UPDATE ON app_versions BEGIN
  UPDATE app_versions SET updated_at = CURRENT_TIMESTAMP WHERE platform = NEW.platform;
END;

-- ---------------------------------------------------------------- audit
-- Append-only. The application never updates or deletes rows here.
CREATE TABLE audit_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT,
  user_name      TEXT NOT NULL,
  role           TEXT NOT NULL,
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT,
  summary        TEXT,
  previous_value TEXT,
  new_value      TEXT,
  ip_address     TEXT,
  user_agent     TEXT,
  created_at     TEXT NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'now'))
);
CREATE INDEX ix_audit_time ON audit_logs (created_at);
CREATE INDEX ix_audit_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX ix_audit_user ON audit_logs (user_id, created_at);
CREATE INDEX ix_audit_action ON audit_logs (action);

-- Already created by db/migrate.js before this file runs (so migration
-- tracking works even on a brand-new database) — IF NOT EXISTS makes this a
-- no-op here.
CREATE TABLE IF NOT EXISTS meta (
  meta_key   TEXT PRIMARY KEY,
  meta_value TEXT NOT NULL
);
