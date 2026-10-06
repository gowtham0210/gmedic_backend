-- Gmedic database schema (SQLite). Generated from the live database after migrations 001-010.
-- Load into an empty database:  sqlite3 gmedic.sqlite < database/schema.sql
-- The application itself builds the same schema from database/migrations (npm run db:setup).

PRAGMA foreign_keys = OFF;

-- ============================================================ Hospitals, staff and QR

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
, timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata', currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3));

CREATE UNIQUE INDEX uq_hospitals_gstin ON hospitals (gstin);
CREATE UNIQUE INDEX uq_hospitals_registration ON hospitals (registration_number);
CREATE INDEX ix_hospitals_status ON hospitals (status);
CREATE INDEX ix_hospitals_kyc ON hospitals (kyc_status);
CREATE INDEX ix_hospitals_created ON hospitals (created_at);
CREATE UNIQUE INDEX uq_hospitals_id_currency ON hospitals (id, currency);

CREATE TRIGGER trg_hospitals_updated AFTER UPDATE ON hospitals BEGIN
  UPDATE hospitals SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_hospital_rate_history AFTER UPDATE OF booking_model, booking_fee, convenience_fee, commission_type, commission_value ON hospitals
WHEN OLD.booking_model IS NOT NEW.booking_model OR OLD.booking_fee IS NOT NEW.booking_fee OR OLD.convenience_fee IS NOT NEW.convenience_fee
  OR OLD.commission_type IS NOT NEW.commission_type OR OLD.commission_value IS NOT NEW.commission_value BEGIN
  INSERT INTO hospital_rate_history (hospital_id, booking_model, booking_fee, convenience_fee, commission_type, commission_value)
  VALUES (NEW.id, NEW.booking_model, NEW.booking_fee, NEW.convenience_fee, NEW.commission_type, NEW.commission_value);
END;

CREATE TABLE hospital_rate_history (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id      TEXT NOT NULL REFERENCES hospitals (id) ON DELETE CASCADE,
  booking_model    TEXT,
  booking_fee      REAL,
  convenience_fee  REAL,
  commission_type  TEXT NOT NULL,
  commission_value REAL NOT NULL,
  effective_from   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_rate_history ON hospital_rate_history (hospital_id, effective_from);

CREATE TABLE hospital_policies (
  hospital_id                 TEXT PRIMARY KEY REFERENCES hospitals (id) ON DELETE CASCADE,
  cancellation_window_hours   INTEGER NOT NULL DEFAULT 24 CHECK (cancellation_window_hours >= 0),
  refund_percent              INTEGER NOT NULL DEFAULT 100 CHECK (refund_percent BETWEEN 0 AND 100),
  booking_window_days         INTEGER NOT NULL DEFAULT 30 CHECK (booking_window_days >= 1),
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TRIGGER trg_policies_updated AFTER UPDATE ON hospital_policies BEGIN
  UPDATE hospital_policies SET updated_at = CURRENT_TIMESTAMP WHERE hospital_id = NEW.hospital_id;
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
CREATE UNIQUE INDEX uq_branches_id_hospital ON hospital_branches (id, hospital_id);

CREATE TRIGGER trg_branches_updated AFTER UPDATE ON hospital_branches BEGIN
  UPDATE hospital_branches SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

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

CREATE TABLE "departments" (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id TEXT REFERENCES hospitals (id),
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_departments_scope_name ON departments (COALESCE(hospital_id, ''), name);

CREATE TRIGGER trg_departments_updated AFTER UPDATE ON departments BEGIN
  UPDATE departments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE "users" (
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
  approved_by          TEXT REFERENCES "users" (id),
  approved_at          TEXT,
  last_login_at        TEXT,
  password_changed_at  TEXT,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (doctor_id IS NULL OR hospital_id IS NOT NULL),
  FOREIGN KEY (doctor_id, hospital_id) REFERENCES doctors (id, hospital_id)
);

CREATE UNIQUE INDEX uq_users_email ON users (email);
CREATE UNIQUE INDEX uq_users_username ON users (username);
CREATE UNIQUE INDEX uq_users_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX uq_users_doctor ON users (doctor_id) WHERE doctor_id IS NOT NULL;
CREATE INDEX ix_users_role_status ON users (role, status);
CREATE INDEX ix_users_hospital ON users (hospital_id);

CREATE TRIGGER trg_users_updated AFTER UPDATE ON users BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE "doctors" (
  id                      TEXT PRIMARY KEY,
  hospital_id             TEXT NOT NULL REFERENCES hospitals (id),
  branch_id               TEXT,
  department_id           INTEGER REFERENCES departments (id),
  name                    TEXT NOT NULL,
  photo_url               TEXT,
  specialization          TEXT NOT NULL,
  registration_number     TEXT,
  qualifications          TEXT,
  bio                     TEXT,
  years_experience        INTEGER,
  fee                     REAL NOT NULL,
  currency                TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  availability            TEXT NOT NULL DEFAULT 'present' CHECK (availability IN ('present','absent')),
  availability_updated_at TEXT,
  verification_status     TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','VERIFIED','REJECTED')),
  verification_note       TEXT,
  verified_by             TEXT REFERENCES users (id),
  verified_at             TEXT,
  created_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id, hospital_id) REFERENCES hospital_branches (id, hospital_id)
);

CREATE UNIQUE INDEX uq_doctors_registration ON doctors (registration_number);
CREATE UNIQUE INDEX uq_doctors_id_hospital ON doctors (id, hospital_id);
CREATE UNIQUE INDEX uq_doctors_id_currency ON doctors (id, currency);
CREATE INDEX ix_doctors_hospital ON doctors (hospital_id, availability);
CREATE INDEX ix_doctors_verification ON doctors (verification_status);
CREATE INDEX ix_doctors_specialization ON doctors (specialization);
CREATE INDEX ix_doctors_department ON doctors (department_id);

CREATE TRIGGER trg_doctors_updated AFTER UPDATE ON doctors BEGIN
  UPDATE doctors SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE doctor_languages (
  doctor_id  TEXT NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  language   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (doctor_id, language)
);


CREATE TABLE doctor_schedules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id    TEXT NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL, -- 0 = Sunday
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  slot_minutes INTEGER NOT NULL DEFAULT 15
, capacity_per_slot INTEGER NOT NULL DEFAULT 1 CHECK (capacity_per_slot >= 1), online_quota INTEGER CHECK (online_quota IS NULL OR online_quota >= 0), effective_from TEXT, effective_to TEXT, created_at TEXT, updated_at TEXT);

CREATE UNIQUE INDEX uq_schedule_slot ON doctor_schedules (doctor_id, day_of_week, start_time);

CREATE TRIGGER trg_schedules_created AFTER INSERT ON doctor_schedules WHEN NEW.created_at IS NULL BEGIN
  UPDATE doctor_schedules SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_guard_schedule_overlap_ins BEFORE INSERT ON doctor_schedules
WHEN EXISTS (SELECT 1 FROM doctor_schedules s
   WHERE s.doctor_id = NEW.doctor_id AND s.day_of_week = NEW.day_of_week
     AND s.start_time < NEW.end_time AND NEW.start_time < s.end_time
     AND COALESCE(s.effective_from, '0000-00-00') <= COALESCE(NEW.effective_to, '9999-12-31')
     AND COALESCE(NEW.effective_from, '0000-00-00') <= COALESCE(s.effective_to, '9999-12-31')) BEGIN
  SELECT RAISE(ABORT, 'schedule overlaps an existing window for this doctor and day');
END;

CREATE TRIGGER trg_guard_schedule_overlap_upd BEFORE UPDATE OF doctor_id, day_of_week, start_time, end_time, effective_from, effective_to ON doctor_schedules
WHEN EXISTS (SELECT 1 FROM doctor_schedules s
   WHERE s.id <> NEW.id AND s.doctor_id = NEW.doctor_id AND s.day_of_week = NEW.day_of_week
     AND s.start_time < NEW.end_time AND NEW.start_time < s.end_time
     AND COALESCE(s.effective_from, '0000-00-00') <= COALESCE(NEW.effective_to, '9999-12-31')
     AND COALESCE(NEW.effective_from, '0000-00-00') <= COALESCE(s.effective_to, '9999-12-31')) BEGIN
  SELECT RAISE(ABORT, 'schedule overlaps an existing window for this doctor and day');
END;

CREATE TABLE doctor_leaves (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id  TEXT NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  reason     TEXT,
  created_by TEXT REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_date >= start_date)
);

CREATE INDEX ix_leaves_doctor ON doctor_leaves (doctor_id, start_date, end_date);

CREATE TRIGGER trg_leaves_updated AFTER UPDATE ON doctor_leaves BEGIN
  UPDATE doctor_leaves SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_guard_leave_overlap_ins BEFORE INSERT ON doctor_leaves
WHEN EXISTS (SELECT 1 FROM doctor_leaves l WHERE l.doctor_id = NEW.doctor_id AND l.start_date <= NEW.end_date AND NEW.start_date <= l.end_date) BEGIN
  SELECT RAISE(ABORT, 'leave overlaps an existing leave for this doctor');
END;

CREATE TRIGGER trg_guard_leave_overlap_upd BEFORE UPDATE OF doctor_id, start_date, end_date ON doctor_leaves
WHEN EXISTS (SELECT 1 FROM doctor_leaves l WHERE l.id <> NEW.id AND l.doctor_id = NEW.doctor_id AND l.start_date <= NEW.end_date AND NEW.start_date <= l.end_date) BEGIN
  SELECT RAISE(ABORT, 'leave overlaps an existing leave for this doctor');
END;

CREATE TABLE "qr_codes" (
  id             TEXT PRIMARY KEY,
  qr_key         TEXT NOT NULL,
  hospital_id    TEXT NOT NULL REFERENCES hospitals (id),
  branch_id      TEXT,
  desk_label     TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  revoked_reason TEXT,
  revoked_at     TEXT,
  revoked_by     TEXT REFERENCES users (id),
  replaced_by    TEXT REFERENCES "qr_codes" (id),
  created_by     TEXT REFERENCES users (id),
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id, hospital_id) REFERENCES hospital_branches (id, hospital_id)
);

CREATE UNIQUE INDEX uq_qr_key ON qr_codes (qr_key);
CREATE INDEX ix_qr_hospital ON qr_codes (hospital_id, status);

CREATE TRIGGER trg_qr_updated AFTER UPDATE ON qr_codes BEGIN
  UPDATE qr_codes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE "qr_scans" (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  qr_code_id      TEXT REFERENCES qr_codes (id),
  hospital_id     TEXT REFERENCES hospitals (id),
  branch_id       TEXT REFERENCES hospital_branches (id),
  patient_id      TEXT REFERENCES patients (id),
  result          TEXT NOT NULL CHECK (result IN ('LINKED','ALREADY_LINKED','FAILED')),
  failure_reason  TEXT,
  is_sample       INTEGER NOT NULL DEFAULT 0,
  scanned_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  account_user_id TEXT REFERENCES users (id)
);

CREATE INDEX ix_scans_qr_time ON qr_scans (qr_code_id, scanned_at);
CREATE INDEX ix_scans_hospital_time ON qr_scans (hospital_id, scanned_at);
CREATE INDEX ix_scans_time ON qr_scans (scanned_at);
CREATE INDEX ix_scans_account ON qr_scans (account_user_id);

CREATE TRIGGER trg_guard_scan_account_ins BEFORE INSERT ON qr_scans
WHEN NEW.account_user_id IS NOT NULL AND NEW.patient_id IS NOT NULL AND NEW.account_user_id IS NOT (SELECT account_user_id FROM patients WHERE id = NEW.patient_id) BEGIN
  SELECT RAISE(ABORT, 'scan.account_user_id must equal the patient''s account');
END;

-- ============================================================ Patients and appointments

CREATE TABLE "patients" (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  mobile          TEXT,
  email           TEXT,
  city            TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  account_user_id TEXT REFERENCES users (id),
  relation        TEXT NOT NULL DEFAULT 'SELF' CHECK (relation IN ('SELF','SPOUSE','CHILD','PARENT','SIBLING','OTHER')),
  date_of_birth   TEXT,
  gender          TEXT CHECK (gender IS NULL OR gender IN ('MALE','FEMALE','OTHER'))
);

CREATE UNIQUE INDEX uq_patients_mobile ON patients (mobile) WHERE mobile IS NOT NULL;
CREATE INDEX ix_patients_name ON patients (name);
CREATE INDEX ix_patients_account ON patients (account_user_id);

CREATE TRIGGER trg_patients_updated AFTER UPDATE ON patients BEGIN
  UPDATE patients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE "patient_hospital_links" (
  patient_id  TEXT NOT NULL REFERENCES patients (id),
  hospital_id TEXT NOT NULL REFERENCES hospitals (id),
  qr_code_id  TEXT REFERENCES qr_codes (id),
  linked_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at  TEXT, account_user_id TEXT REFERENCES users (id),
  PRIMARY KEY (patient_id, hospital_id)
);

CREATE INDEX ix_links_hospital ON patient_hospital_links (hospital_id);
CREATE UNIQUE INDEX uq_links_account_hospital ON patient_hospital_links (account_user_id, hospital_id) WHERE account_user_id IS NOT NULL;

CREATE TRIGGER trg_guard_link_account_ins BEFORE INSERT ON patient_hospital_links
WHEN NEW.account_user_id IS NOT NULL AND NEW.account_user_id IS NOT (SELECT account_user_id FROM patients WHERE id = NEW.patient_id) BEGIN
  SELECT RAISE(ABORT, 'link.account_user_id must equal the patient''s account');
END;

CREATE TRIGGER trg_guard_link_account_upd BEFORE UPDATE OF account_user_id, patient_id ON patient_hospital_links
WHEN NEW.account_user_id IS NOT NULL AND NEW.account_user_id IS NOT (SELECT account_user_id FROM patients WHERE id = NEW.patient_id) BEGIN
  SELECT RAISE(ABORT, 'link.account_user_id must equal the patient''s account');
END;

CREATE TABLE "appointments" (
  id                    TEXT PRIMARY KEY,
  hospital_id           TEXT NOT NULL REFERENCES hospitals (id),
  branch_id             TEXT,
  doctor_id             TEXT NOT NULL,
  patient_id            TEXT NOT NULL REFERENCES patients (id),
  appt_date             TEXT NOT NULL,
  appt_time             TEXT NOT NULL,
  seat_no               INTEGER NOT NULL DEFAULT 1 CHECK (seat_no >= 1),
  fee                   REAL NOT NULL,
  currency              TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed','pending','completed','cancelled')),
  payment_status        TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('paid','pending')),
  source                TEXT NOT NULL DEFAULT 'Gmedic App',
  no_show               INTEGER NOT NULL DEFAULT 0,
  cancel_reason         TEXT,
  cancelled_by          TEXT,
  cancelled_at          TEXT,
  rescheduled_from_date TEXT,
  rescheduled_from_time TEXT,
  rescheduled_from_id   TEXT REFERENCES "appointments" (id),
  reason_for_visit      TEXT,
  created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id, hospital_id) REFERENCES doctors (id, hospital_id),
  FOREIGN KEY (doctor_id, currency) REFERENCES doctors (id, currency),
  FOREIGN KEY (branch_id, hospital_id) REFERENCES hospital_branches (id, hospital_id)
);

CREATE UNIQUE INDEX uq_appt_seat ON appointments (doctor_id, appt_date, appt_time, seat_no) WHERE status <> 'cancelled';
CREATE UNIQUE INDEX uq_appt_id_currency ON appointments (id, currency);
CREATE UNIQUE INDEX uq_appt_token_key ON appointments (id, doctor_id, hospital_id, appt_date);
CREATE INDEX ix_appts_hospital_date ON appointments (hospital_id, appt_date);
CREATE INDEX ix_appts_doctor_date ON appointments (doctor_id, appt_date);
CREATE INDEX ix_appts_patient ON appointments (patient_id);
CREATE INDEX ix_appts_date ON appointments (appt_date);
CREATE INDEX ix_appts_created ON appointments (created_at);

CREATE TRIGGER trg_appts_updated AFTER UPDATE ON appointments BEGIN
  UPDATE appointments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_appt_history_ins AFTER INSERT ON appointments BEGIN
  INSERT INTO appointment_status_history (appointment_id, from_status, to_status) VALUES (NEW.id, NULL, NEW.status);
END;

CREATE TRIGGER trg_appt_history_upd AFTER UPDATE OF status ON appointments WHEN OLD.status <> NEW.status BEGIN
  INSERT INTO appointment_status_history (appointment_id, from_status, to_status) VALUES (NEW.id, OLD.status, NEW.status);
END;

CREATE TRIGGER trg_appt_cancelled_at AFTER UPDATE OF status ON appointments WHEN NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL BEGIN
  UPDATE appointments SET cancelled_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_guard_appt_source_ins BEFORE INSERT ON appointments
WHEN NEW.source NOT IN ('Gmedic App', 'Walk-in') BEGIN
  SELECT RAISE(ABORT, 'appointment.source must be Gmedic App or Walk-in');
END;

CREATE TRIGGER trg_guard_appt_online_quota_ins BEFORE INSERT ON appointments
WHEN NEW.source = 'Gmedic App'
 AND (SELECT COUNT(*) FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date AND appt_time = NEW.appt_time
        AND source = 'Gmedic App' AND status <> 'cancelled')
     >= COALESCE((SELECT MIN(online_quota) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time AND online_quota IS NOT NULL
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 2147483647) BEGIN
  SELECT RAISE(ABORT, 'online booking quota for this slot is full');
END;

CREATE TRIGGER trg_frozen_fee BEFORE UPDATE OF fee ON appointments
WHEN OLD.fee <> NEW.fee AND EXISTS (SELECT 1 FROM payments WHERE appointment_id = OLD.id AND status = 'PAID') BEGIN
  SELECT RAISE(ABORT, 'the fee of a paid appointment cannot change');
END;

CREATE TRIGGER trg_guard_appt_seat_ins BEFORE INSERT ON appointments
WHEN NEW.seat_no > COALESCE((SELECT MAX(capacity_per_slot) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'seat_no exceeds the slot capacity');
END;

CREATE TABLE appointment_status_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id TEXT NOT NULL REFERENCES appointments (id) ON DELETE CASCADE,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  changed_by     TEXT REFERENCES users (id),
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_appt_history ON appointment_status_history (appointment_id, id);

CREATE TRIGGER trg_frozen_history BEFORE UPDATE ON appointment_status_history BEGIN
  SELECT RAISE(ABORT, 'status history is append-only');
END;

CREATE TABLE slot_holds (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  doctor_id      TEXT NOT NULL REFERENCES doctors (id),
  appt_date      TEXT NOT NULL,
  appt_time      TEXT NOT NULL,
  patient_id     TEXT REFERENCES patients (id),
  held_until     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD','CONVERTED','EXPIRED','RELEASED')),
  appointment_id TEXT REFERENCES appointments (id),
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, seat_no INTEGER NOT NULL DEFAULT 1 CHECK (seat_no >= 1));

CREATE INDEX ix_holds_slot ON slot_holds (doctor_id, appt_date, appt_time, status);
CREATE INDEX ix_holds_expiry ON slot_holds (status, held_until);
CREATE UNIQUE INDEX uq_holds_active_seat ON slot_holds (doctor_id, appt_date, appt_time, seat_no) WHERE status = 'HELD';

CREATE TRIGGER trg_holds_updated AFTER UPDATE ON slot_holds BEGIN
  UPDATE slot_holds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_guard_hold_vs_booking BEFORE INSERT ON slot_holds
WHEN NEW.status = 'HELD' AND EXISTS (SELECT 1 FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date
       AND appt_time = NEW.appt_time AND seat_no = NEW.seat_no AND status <> 'cancelled') BEGIN
  SELECT RAISE(ABORT, 'that seat is already booked');
END;

CREATE TABLE "tokens" (
  id             TEXT PRIMARY KEY,
  hospital_id    TEXT NOT NULL REFERENCES hospitals (id),
  appointment_id TEXT NOT NULL,
  doctor_id      TEXT NOT NULL,
  token_date     TEXT NOT NULL,
  number         INTEGER NOT NULL,
  code           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','called','in_consultation','completed','cancelled','skipped')),
  called_at      TEXT,
  completed_at   TEXT,
  cancelled_at   TEXT,
  skipped_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id, doctor_id, hospital_id, token_date) REFERENCES appointments (id, doctor_id, hospital_id, appt_date) ON UPDATE CASCADE
);

CREATE UNIQUE INDEX uq_tokens_day_number ON tokens (hospital_id, token_date, number);
CREATE INDEX ix_tokens_appointment ON tokens (appointment_id);
CREATE INDEX ix_tokens_doctor ON tokens (doctor_id, token_date);

CREATE TRIGGER trg_tokens_updated AFTER UPDATE ON tokens BEGIN
  UPDATE tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================ Payments and settlements

CREATE TABLE "payments" (
  id                  TEXT PRIMARY KEY,
  appointment_id      TEXT NOT NULL,
  consultation_amount REAL,
  convenience_fee     REAL NOT NULL DEFAULT 0,
  tax_amount          REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  amount              REAL NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  method              TEXT,
  gateway             TEXT NOT NULL DEFAULT 'SIMULATED',
  gateway_order_id    TEXT,
  transaction_id      TEXT NOT NULL,
  receipt_number      TEXT,
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PAID','FAILED','PENDING')),
  gateway_status      TEXT,
  failure_reason      TEXT,
  paid_at             TEXT,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (consultation_amount IS NULL OR ABS(consultation_amount + convenience_fee + tax_amount - amount) < 0.005),
  FOREIGN KEY (appointment_id, currency) REFERENCES appointments (id, currency)
);

CREATE UNIQUE INDEX uq_payments_txn ON payments (transaction_id);
CREATE UNIQUE INDEX uq_payments_receipt ON payments (receipt_number) WHERE receipt_number IS NOT NULL;
CREATE UNIQUE INDEX uq_payments_one_paid ON payments (appointment_id) WHERE status = 'PAID';
CREATE UNIQUE INDEX uq_payments_id_appt ON payments (id, appointment_id);
CREATE UNIQUE INDEX uq_payments_id_txn ON payments (id, transaction_id);
CREATE UNIQUE INDEX uq_payments_id_currency ON payments (id, currency);
CREATE INDEX ix_payments_appointment ON payments (appointment_id);
CREATE INDEX ix_payments_status ON payments (status);

CREATE TRIGGER trg_payments_updated AFTER UPDATE ON payments BEGIN
  UPDATE payments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_payments_receipt_ins AFTER INSERT ON payments WHEN NEW.status = 'PAID' AND NEW.receipt_number IS NULL BEGIN
  UPDATE payments SET receipt_number = 'RCP' || substr(NEW.id, 4) WHERE id = NEW.id;
END;

CREATE TRIGGER trg_payments_receipt_upd AFTER UPDATE OF status ON payments WHEN NEW.status = 'PAID' AND NEW.receipt_number IS NULL BEGIN
  UPDATE payments SET receipt_number = 'RCP' || substr(NEW.id, 4) WHERE id = NEW.id;
END;

CREATE TRIGGER trg_guard_payment_method_ins BEFORE INSERT ON payments
WHEN NEW.method IS NOT NULL AND NEW.method NOT IN ('UPI', 'Card', 'Net Banking', 'Wallet', 'Cash') BEGIN
  SELECT RAISE(ABORT, 'payment.method must be UPI, Card, Net Banking, Wallet or Cash');
END;

CREATE TRIGGER trg_payment_sets_appt_ins AFTER INSERT ON payments WHEN NEW.status = 'PAID' BEGIN
  UPDATE appointments SET payment_status = 'paid' WHERE id = NEW.appointment_id AND payment_status <> 'paid';
END;

CREATE TRIGGER trg_payment_sets_appt_upd AFTER UPDATE OF status ON payments WHEN NEW.status = 'PAID' BEGIN
  UPDATE appointments SET payment_status = 'paid' WHERE id = NEW.appointment_id AND payment_status <> 'paid';
END;

CREATE TABLE "payment_webhooks" (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway         TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  transaction_id  TEXT,
  payment_id      TEXT REFERENCES payments (id) ON DELETE SET NULL,
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

CREATE TABLE "refunds" (
  id               TEXT PRIMARY KEY,
  payment_id       TEXT NOT NULL,
  appointment_id   TEXT NOT NULL REFERENCES appointments (id),
  amount           REAL NOT NULL,
  currency         TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','PROCESSING','COMPLETED')),
  requires_checker INTEGER NOT NULL DEFAULT 0,
  requested_by     TEXT REFERENCES users (id),
  approved_by      TEXT REFERENCES users (id),
  approved_at      TEXT,
  decision_note    TEXT,
  completed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id, appointment_id) REFERENCES payments (id, appointment_id),
  FOREIGN KEY (payment_id, currency) REFERENCES payments (id, currency)
);

CREATE UNIQUE INDEX uq_refunds_id_currency ON refunds (id, currency);
CREATE INDEX ix_refunds_status ON refunds (status, created_at);
CREATE INDEX ix_refunds_payment ON refunds (payment_id);
CREATE INDEX ix_refunds_appointment ON refunds (appointment_id);

CREATE TRIGGER trg_refunds_updated AFTER UPDATE ON refunds BEGIN
  UPDATE refunds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_guard_refund_total_ins BEFORE INSERT ON refunds
WHEN NEW.status <> 'REJECTED'
 AND COALESCE((SELECT SUM(amount) FROM refunds WHERE payment_id = NEW.payment_id AND status <> 'REJECTED'), 0) + NEW.amount
     > (SELECT amount FROM payments WHERE id = NEW.payment_id) BEGIN
  SELECT RAISE(ABORT, 'total refunds would exceed the payment amount');
END;

CREATE TRIGGER trg_guard_refund_total_upd BEFORE UPDATE OF amount, status ON refunds
WHEN NEW.status <> 'REJECTED'
 AND COALESCE((SELECT SUM(amount) FROM refunds WHERE payment_id = NEW.payment_id AND status <> 'REJECTED' AND id <> NEW.id), 0) + NEW.amount
     > (SELECT amount FROM payments WHERE id = NEW.payment_id) BEGIN
  SELECT RAISE(ABORT, 'total refunds would exceed the payment amount');
END;

CREATE TABLE "disputes" (
  id             TEXT PRIMARY KEY,
  payment_id     TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  amount         REAL NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  reason         TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED')),
  resolution     TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id, transaction_id) REFERENCES payments (id, transaction_id),
  FOREIGN KEY (payment_id, currency) REFERENCES payments (id, currency)
);

CREATE UNIQUE INDEX uq_disputes_id_currency ON disputes (id, currency);
CREATE INDEX ix_disputes_status ON disputes (status);
CREATE INDEX ix_disputes_payment ON disputes (payment_id);

CREATE TRIGGER trg_disputes_updated AFTER UPDATE ON disputes BEGIN
  UPDATE disputes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE "settlements" (
  id                 TEXT PRIMARY KEY,
  hospital_id        TEXT NOT NULL,
  period_start       TEXT NOT NULL,
  period_end         TEXT NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  appointments_count INTEGER NOT NULL DEFAULT 0,
  gross_collection   REAL NOT NULL DEFAULT 0,
  refunds_amount     REAL NOT NULL DEFAULT 0,
  commission_type    TEXT,
  commission_value   REAL,
  rate_history_id    INTEGER REFERENCES hospital_rate_history (id),
  commission_amount  REAL NOT NULL DEFAULT 0,
  convenience_fees   REAL NOT NULL DEFAULT 0,
  net_payout         REAL NOT NULL DEFAULT 0,
  auto_generated     INTEGER NOT NULL DEFAULT 0,
  payout_date        TEXT,
  payout_reference   TEXT,
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PAID','ON_HOLD')),
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (period_start <= period_end),
  CHECK (ABS(net_payout - MAX(0, gross_collection - refunds_amount - commission_amount - convenience_fees)) < 0.01),
  FOREIGN KEY (hospital_id, currency) REFERENCES hospitals (id, currency)
);

CREATE UNIQUE INDEX uq_settlement_period ON settlements (hospital_id, period_start, period_end);
CREATE UNIQUE INDEX uq_settlements_id_currency ON settlements (id, currency);
CREATE INDEX ix_settlements_status ON settlements (status);

CREATE TRIGGER trg_settlements_updated AFTER UPDATE ON settlements BEGIN
  UPDATE settlements SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER trg_frozen_settlement BEFORE UPDATE OF hospital_id, period_start, period_end, gross_collection, refunds_amount, commission_amount,
  convenience_fees, net_payout, commission_type, commission_value, rate_history_id ON settlements
WHEN OLD.status = 'PAID' BEGIN
  SELECT RAISE(ABORT, 'a paid settlement is frozen');
END;

CREATE TRIGGER trg_guard_settlement_overlap_ins BEFORE INSERT ON settlements
WHEN EXISTS (SELECT 1 FROM settlements s WHERE s.hospital_id = NEW.hospital_id AND s.period_start <= NEW.period_end AND NEW.period_start <= s.period_end) BEGIN
  SELECT RAISE(ABORT, 'settlement period overlaps an existing settlement for this hospital');
END;

CREATE TRIGGER trg_guard_settlement_overlap_upd BEFORE UPDATE OF hospital_id, period_start, period_end ON settlements
WHEN EXISTS (SELECT 1 FROM settlements s WHERE s.id <> NEW.id AND s.hospital_id = NEW.hospital_id AND s.period_start <= NEW.period_end AND NEW.period_start <= s.period_end) BEGIN
  SELECT RAISE(ABORT, 'settlement period overlaps an existing settlement for this hospital');
END;

CREATE TABLE "settlement_items" (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id TEXT NOT NULL,
  item_type     TEXT NOT NULL CHECK (item_type IN ('PAYMENT','REFUND')),
  payment_id    TEXT,
  refund_id     TEXT,
  amount        REAL NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((item_type = 'PAYMENT' AND payment_id IS NOT NULL AND refund_id IS NULL) OR (item_type = 'REFUND' AND refund_id IS NOT NULL AND payment_id IS NULL)),
  FOREIGN KEY (settlement_id, currency) REFERENCES settlements (id, currency) ON DELETE CASCADE,
  FOREIGN KEY (payment_id, currency) REFERENCES payments (id, currency),
  FOREIGN KEY (refund_id, currency) REFERENCES refunds (id, currency)
);

CREATE INDEX ix_settlement_items ON settlement_items (settlement_id);
CREATE UNIQUE INDEX uq_settlement_item_payment ON settlement_items (payment_id) WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX uq_settlement_item_refund ON settlement_items (refund_id) WHERE refund_id IS NOT NULL;

CREATE TABLE "settlement_adjustments" (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id TEXT NOT NULL,
  dispute_id    TEXT,
  amount        REAL NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'APPLIED' CHECK (status IN ('APPLIED','VOID')),
  created_by    TEXT REFERENCES users (id),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (settlement_id, currency) REFERENCES settlements (id, currency) ON DELETE CASCADE,
  FOREIGN KEY (dispute_id, currency) REFERENCES disputes (id, currency)
);

CREATE INDEX ix_adjustments_settlement ON settlement_adjustments (settlement_id);
CREATE UNIQUE INDEX uq_adjustment_dispute ON settlement_adjustments (dispute_id) WHERE dispute_id IS NOT NULL AND status = 'APPLIED';

-- ============================================================ Support

CREATE TABLE "support_tickets" (
  id              TEXT PRIMARY KEY,
  ticket_number   TEXT NOT NULL,
  created_by      TEXT REFERENCES users (id),
  created_by_role TEXT NOT NULL CHECK (created_by_role IN ('PATIENT','DOCTOR','RECEPTIONIST','ADMIN')),
  hospital_id     TEXT REFERENCES hospitals (id),
  patient_id      TEXT REFERENCES patients (id),
  appointment_id  TEXT REFERENCES appointments (id),
  category        TEXT NOT NULL CHECK (category IN ('APPOINTMENT','PAYMENT','REFUND','HOSPITAL','DOCTOR','ACCOUNT','QR','SCHEDULE','TECHNICAL','OTHER')),
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  assigned_to     TEXT REFERENCES users (id),
  sla_due_at      TEXT NOT NULL,
  resolved_at     TEXT,
  closed_at       TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_tickets_number ON support_tickets (ticket_number);
CREATE INDEX ix_tickets_status ON support_tickets (status, priority);
CREATE INDEX ix_tickets_hospital ON support_tickets (hospital_id);
CREATE INDEX ix_tickets_assignee ON support_tickets (assigned_to);
CREATE INDEX ix_tickets_creator ON support_tickets (created_by);

CREATE TRIGGER trg_tickets_updated AFTER UPDATE ON support_tickets BEGIN
  UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE "support_messages" (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   TEXT NOT NULL REFERENCES "support_tickets" (id) ON DELETE CASCADE,
  sender_id   TEXT REFERENCES users (id),
  sender_name TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_support_messages_ticket ON support_messages (ticket_id, id);

CREATE TRIGGER trg_frozen_message BEFORE UPDATE ON support_messages BEGIN
  SELECT RAISE(ABORT, 'support messages are append-only');
END;

-- ============================================================ Communications and compliance

CREATE TABLE notification_templates (
  id         TEXT PRIMARY KEY,
  event_key  TEXT NOT NULL,
  name       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  channels   TEXT NOT NULL DEFAULT '["IN_APP"]',
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_template_event ON notification_templates (event_key);

CREATE TRIGGER trg_templates_updated AFTER UPDATE ON notification_templates BEGIN
  UPDATE notification_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE "notifications" (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users (id),
  event_key  TEXT NOT NULL REFERENCES notification_templates (event_key) ON UPDATE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_notifications_user ON notifications (user_id, read_at, id);

CREATE TABLE "notification_logs" (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key         TEXT NOT NULL,
  recipient_user_id TEXT REFERENCES users (id),
  recipient_role    TEXT,
  channel           TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('DELIVERED','SKIPPED','FAILED','UNAVAILABLE')),
  failure_reason    TEXT,
  notification_id   INTEGER REFERENCES notifications (id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_notification_logs_time ON notification_logs (id);
CREATE INDEX ix_notification_logs_event ON notification_logs (event_key);

CREATE TABLE device_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform   TEXT NOT NULL CHECK (platform IN ('ANDROID','IOS','WEB')),
  token      TEXT NOT NULL UNIQUE,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_device_user ON device_tokens (user_id);

CREATE TRIGGER trg_device_updated AFTER UPDATE ON device_tokens BEGIN
  UPDATE device_tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE consent_records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT REFERENCES users (id),
  patient_id   TEXT REFERENCES patients (id),
  purpose      TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_at TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (user_id IS NOT NULL OR patient_id IS NOT NULL)
);

CREATE INDEX ix_consent_user ON consent_records (user_id, purpose);
CREATE INDEX ix_consent_patient ON consent_records (patient_id, purpose);

CREATE TABLE "announcements" (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  target       TEXT NOT NULL DEFAULT 'ALL' CHECK (target IN ('ALL','SELECTED')),
  status       TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  published_at TEXT,
  created_by   TEXT REFERENCES users (id),
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


CREATE TABLE "banners" (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  cta_label  TEXT,
  cta_url    TEXT,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT,
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_by TEXT REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_banners_live ON banners (status, starts_at, ends_at);

CREATE TRIGGER trg_banners_updated AFTER UPDATE ON banners BEGIN
  UPDATE banners SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============================================================ Platform

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

CREATE TRIGGER trg_frozen_audit_upd BEFORE UPDATE ON audit_logs BEGIN
  SELECT RAISE(ABORT, 'audit logs are append-only');
END;

CREATE TRIGGER trg_frozen_audit_del BEFORE DELETE ON audit_logs BEGIN
  SELECT RAISE(ABORT, 'audit logs are append-only');
END;

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

CREATE TABLE platform_settings (
  setting_key TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TRIGGER trg_settings_updated AFTER UPDATE ON platform_settings BEGIN
  UPDATE platform_settings SET updated_at = CURRENT_TIMESTAMP WHERE setting_key = NEW.setting_key;
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

CREATE TABLE sessions (
  sid        TEXT PRIMARY KEY,
  user_id    TEXT,
  data       TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX ix_sessions_expires ON sessions (expires_at);
CREATE INDEX ix_sessions_user ON sessions (user_id);

CREATE TABLE meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT NOT NULL
    );


PRAGMA foreign_keys = ON;
