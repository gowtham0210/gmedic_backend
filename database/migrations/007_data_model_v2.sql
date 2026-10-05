-- Data model v2 (see docs/data-model-v2.md for the decision log).
-- Everything here is backward compatible with the running app: new tables,
-- new columns, real foreign keys on actor columns, consistency guards on the
-- columns that are deliberately kept denormalised, and two redundant columns
-- (doctors.department, doctors.languages, support_messages.sender_role) moved
-- to their proper homes.

PRAGMA foreign_keys = OFF;

-- ------------------------------------------------------------ departments
CREATE TABLE departments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_departments_updated AFTER UPDATE ON departments BEGIN
  UPDATE departments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
INSERT INTO departments (name) SELECT DISTINCT TRIM(department) FROM doctors WHERE department IS NOT NULL AND TRIM(department) <> '';
ALTER TABLE doctors ADD COLUMN department_id INTEGER REFERENCES departments (id);
UPDATE doctors SET department_id = (SELECT id FROM departments WHERE name = TRIM(doctors.department)) WHERE department IS NOT NULL AND TRIM(department) <> '';
CREATE INDEX ix_doctors_department ON doctors (department_id);

-- --------------------------------------------- doctor languages (1NF child)
CREATE TABLE doctor_languages (
  doctor_id  TEXT NOT NULL REFERENCES doctors (id) ON DELETE CASCADE,
  language   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (doctor_id, language)
);
WITH RECURSIVE split(doctor_id, lang, rest) AS (
  SELECT id, '', languages || ',' FROM doctors WHERE languages IS NOT NULL AND TRIM(languages) <> ''
  UNION ALL
  SELECT doctor_id, TRIM(substr(rest, 1, instr(rest, ',') - 1)), substr(rest, instr(rest, ',') + 1) FROM split WHERE rest <> ''
)
INSERT OR IGNORE INTO doctor_languages (doctor_id, language) SELECT doctor_id, lang FROM split WHERE lang <> '';

ALTER TABLE doctors DROP COLUMN department;
ALTER TABLE doctors DROP COLUMN languages;

-- ------------------------------------------- doctor leave + richer schedule
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

ALTER TABLE doctor_schedules ADD COLUMN capacity_per_slot INTEGER NOT NULL DEFAULT 1 CHECK (capacity_per_slot >= 1);
ALTER TABLE doctor_schedules ADD COLUMN online_quota INTEGER CHECK (online_quota IS NULL OR online_quota >= 0);
ALTER TABLE doctor_schedules ADD COLUMN effective_from TEXT;
ALTER TABLE doctor_schedules ADD COLUMN effective_to TEXT;
ALTER TABLE doctor_schedules ADD COLUMN created_at TEXT;
ALTER TABLE doctor_schedules ADD COLUMN updated_at TEXT;
UPDATE doctor_schedules SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP;
CREATE TRIGGER trg_schedules_created AFTER INSERT ON doctor_schedules WHEN NEW.created_at IS NULL BEGIN
  UPDATE doctor_schedules SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ------------------------------------------------ patients: owner + dependants
ALTER TABLE patients ADD COLUMN account_user_id TEXT REFERENCES users (id);
ALTER TABLE patients ADD COLUMN relation TEXT NOT NULL DEFAULT 'SELF' CHECK (relation IN ('SELF','SPOUSE','CHILD','PARENT','SIBLING','OTHER'));
ALTER TABLE patients ADD COLUMN date_of_birth TEXT;
ALTER TABLE patients ADD COLUMN gender TEXT CHECK (gender IS NULL OR gender IN ('MALE','FEMALE','OTHER'));
CREATE INDEX ix_patients_account ON patients (account_user_id);

-- ---------------------------------------- appointments: history + new fields
ALTER TABLE appointments ADD COLUMN reason_for_visit TEXT;
ALTER TABLE appointments ADD COLUMN rescheduled_from_id TEXT REFERENCES appointments (id);

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
INSERT INTO appointment_status_history (appointment_id, from_status, to_status, created_at)
  SELECT id, NULL, status, created_at FROM appointments;
CREATE TRIGGER trg_appt_history_ins AFTER INSERT ON appointments BEGIN
  INSERT INTO appointment_status_history (appointment_id, from_status, to_status) VALUES (NEW.id, NULL, NEW.status);
END;
CREATE TRIGGER trg_appt_history_upd AFTER UPDATE OF status ON appointments WHEN OLD.status <> NEW.status BEGIN
  INSERT INTO appointment_status_history (appointment_id, from_status, to_status) VALUES (NEW.id, OLD.status, NEW.status);
END;

-- Temporary slot reservations while a patient pays (instead of overloading appointment.status).
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
);
CREATE INDEX ix_holds_slot ON slot_holds (doctor_id, appt_date, appt_time, status);
CREATE INDEX ix_holds_expiry ON slot_holds (status, held_until);
CREATE TRIGGER trg_holds_updated AFTER UPDATE ON slot_holds BEGIN
  UPDATE slot_holds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- -------------------------------------------------- payments: counter + invoice
ALTER TABLE payments ADD COLUMN gateway_order_id TEXT;
ALTER TABLE payments ADD COLUMN receipt_number TEXT;
UPDATE payments SET receipt_number = 'RCP' || substr(id, 4) WHERE status = 'PAID';
CREATE UNIQUE INDEX uq_payments_receipt ON payments (receipt_number) WHERE receipt_number IS NOT NULL;
CREATE TRIGGER trg_payments_receipt_ins AFTER INSERT ON payments WHEN NEW.status = 'PAID' AND NEW.receipt_number IS NULL BEGIN
  UPDATE payments SET receipt_number = 'RCP' || substr(NEW.id, 4) WHERE id = NEW.id;
END;
CREATE TRIGGER trg_payments_receipt_upd AFTER UPDATE OF status ON payments WHEN NEW.status = 'PAID' AND NEW.receipt_number IS NULL BEGIN
  UPDATE payments SET receipt_number = 'RCP' || substr(NEW.id, 4) WHERE id = NEW.id;
END;

-- ------------------------------------------------------ settlement line items
CREATE TABLE settlement_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id TEXT NOT NULL REFERENCES settlements (id) ON DELETE CASCADE,
  item_type     TEXT NOT NULL CHECK (item_type IN ('PAYMENT','REFUND')),
  payment_id    TEXT REFERENCES payments (id),
  refund_id     TEXT REFERENCES refunds (id),
  amount        REAL NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((item_type = 'PAYMENT' AND payment_id IS NOT NULL AND refund_id IS NULL) OR (item_type = 'REFUND' AND refund_id IS NOT NULL AND payment_id IS NULL))
);
CREATE INDEX ix_settlement_items ON settlement_items (settlement_id);
CREATE UNIQUE INDEX uq_settlement_item_payment ON settlement_items (payment_id) WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX uq_settlement_item_refund ON settlement_items (refund_id) WHERE refund_id IS NOT NULL;
INSERT OR IGNORE INTO settlement_items (settlement_id, item_type, payment_id, amount)
  SELECT s.id, 'PAYMENT', pay.id, pay.amount
  FROM settlements s
  JOIN appointments a ON a.hospital_id = s.hospital_id
  JOIN payments pay ON pay.appointment_id = a.id
  WHERE pay.status = 'PAID' AND DATE(pay.paid_at) BETWEEN s.period_start AND s.period_end;
INSERT OR IGNORE INTO settlement_items (settlement_id, item_type, refund_id, amount)
  SELECT s.id, 'REFUND', r.id, r.amount
  FROM settlements s
  JOIN appointments a ON a.hospital_id = s.hospital_id
  JOIN refunds r ON r.appointment_id = a.id
  WHERE r.status = 'COMPLETED' AND DATE(r.completed_at) BETWEEN s.period_start AND s.period_end;

-- ------------------------------------------------------- hospital policy config
CREATE TABLE hospital_policies (
  hospital_id                 TEXT PRIMARY KEY REFERENCES hospitals (id) ON DELETE CASCADE,
  cancellation_window_hours   INTEGER NOT NULL DEFAULT 24 CHECK (cancellation_window_hours >= 0),
  refund_percent              INTEGER NOT NULL DEFAULT 100 CHECK (refund_percent BETWEEN 0 AND 100),
  booking_window_days         INTEGER NOT NULL DEFAULT 30 CHECK (booking_window_days >= 1),
  created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO hospital_policies (hospital_id) SELECT id FROM hospitals;
CREATE TRIGGER trg_policies_updated AFTER UPDATE ON hospital_policies BEGIN
  UPDATE hospital_policies SET updated_at = CURRENT_TIMESTAMP WHERE hospital_id = NEW.hospital_id;
END;

-- ------------------------------------------------- consent + push device tokens
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

-- ------------------------------------------- real FKs on actor columns (rebuilds)
CREATE TABLE refunds_new (
  id               TEXT PRIMARY KEY,
  payment_id       TEXT NOT NULL REFERENCES payments (id),
  appointment_id   TEXT NOT NULL REFERENCES appointments (id),
  amount           REAL NOT NULL,
  reason           TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','PROCESSING','COMPLETED')),
  requires_checker INTEGER NOT NULL DEFAULT 0,
  requested_by     TEXT REFERENCES users (id),
  approved_by      TEXT REFERENCES users (id),
  approved_at      TEXT,
  decision_note    TEXT,
  completed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO refunds_new SELECT * FROM refunds;
DROP TABLE refunds;
ALTER TABLE refunds_new RENAME TO refunds;
CREATE INDEX ix_refunds_status ON refunds (status, created_at);
CREATE INDEX ix_refunds_payment ON refunds (payment_id);
CREATE INDEX ix_refunds_appointment ON refunds (appointment_id);
CREATE TRIGGER trg_refunds_updated AFTER UPDATE ON refunds BEGIN
  UPDATE refunds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE support_tickets_new (
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
INSERT INTO support_tickets_new SELECT * FROM support_tickets;
CREATE TABLE support_messages_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   TEXT NOT NULL REFERENCES support_tickets_new (id) ON DELETE CASCADE,
  sender_id   TEXT REFERENCES users (id),
  sender_name TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO support_messages_new (id, ticket_id, sender_id, sender_name, message, created_at)
  SELECT id, ticket_id, sender_id, sender_name, message, created_at FROM support_messages;
DROP TABLE support_messages;
DROP TABLE support_tickets;
ALTER TABLE support_tickets_new RENAME TO support_tickets;
ALTER TABLE support_messages_new RENAME TO support_messages;
CREATE UNIQUE INDEX uq_tickets_number ON support_tickets (ticket_number);
CREATE INDEX ix_tickets_status ON support_tickets (status, priority);
CREATE INDEX ix_tickets_hospital ON support_tickets (hospital_id);
CREATE INDEX ix_tickets_assignee ON support_tickets (assigned_to);
CREATE INDEX ix_tickets_creator ON support_tickets (created_by);
CREATE INDEX ix_support_messages_ticket ON support_messages (ticket_id, id);
CREATE TRIGGER trg_tickets_updated AFTER UPDATE ON support_tickets BEGIN
  UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE notification_logs_new (
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
INSERT INTO notification_logs_new SELECT * FROM notification_logs;
DROP TABLE notification_logs;
ALTER TABLE notification_logs_new RENAME TO notification_logs;
CREATE INDEX ix_notification_logs_time ON notification_logs (id);
CREATE INDEX ix_notification_logs_event ON notification_logs (event_key);

CREATE TABLE qr_codes_new (
  id             TEXT PRIMARY KEY,
  qr_key         TEXT NOT NULL,
  hospital_id    TEXT NOT NULL REFERENCES hospitals (id),
  branch_id      TEXT REFERENCES hospital_branches (id),
  desk_label     TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  revoked_reason TEXT,
  revoked_at     TEXT,
  revoked_by     TEXT REFERENCES users (id),
  replaced_by    TEXT REFERENCES qr_codes_new (id),
  created_by     TEXT REFERENCES users (id),
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO qr_codes_new SELECT * FROM qr_codes;
DROP TABLE qr_codes;
ALTER TABLE qr_codes_new RENAME TO qr_codes;
CREATE UNIQUE INDEX uq_qr_key ON qr_codes (qr_key);
CREATE INDEX ix_qr_hospital ON qr_codes (hospital_id, status);
CREATE TRIGGER trg_qr_updated AFTER UPDATE ON qr_codes BEGIN
  UPDATE qr_codes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE announcements_new (
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
INSERT INTO announcements_new SELECT * FROM announcements;
DROP TABLE announcements;
ALTER TABLE announcements_new RENAME TO announcements;
CREATE INDEX ix_announcements_status ON announcements (status, published_at);
CREATE TRIGGER trg_announcements_updated AFTER UPDATE ON announcements BEGIN
  UPDATE announcements SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE banners_new (
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
INSERT INTO banners_new SELECT * FROM banners;
DROP TABLE banners;
ALTER TABLE banners_new RENAME TO banners;
CREATE INDEX ix_banners_live ON banners (status, starts_at, ends_at);
CREATE TRIGGER trg_banners_updated AFTER UPDATE ON banners BEGIN
  UPDATE banners SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- patient_hospital_links: FK on qr_code_id + soft unlink
CREATE TABLE patient_hospital_links_new (
  patient_id  TEXT NOT NULL REFERENCES patients (id),
  hospital_id TEXT NOT NULL REFERENCES hospitals (id),
  qr_code_id  TEXT REFERENCES qr_codes (id),
  linked_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at  TEXT,
  PRIMARY KEY (patient_id, hospital_id)
);
INSERT INTO patient_hospital_links_new (patient_id, hospital_id, qr_code_id, linked_at) SELECT patient_id, hospital_id, qr_code_id, linked_at FROM patient_hospital_links;
DROP TABLE patient_hospital_links;
ALTER TABLE patient_hospital_links_new RENAME TO patient_hospital_links;
CREATE INDEX ix_links_hospital ON patient_hospital_links (hospital_id);

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------------ guards
-- Columns kept on purpose for fast joins / uniqueness are now impossible to
-- drift out of step with the row they are derived from.
CREATE TRIGGER trg_guard_appt_hospital_ins BEFORE INSERT ON appointments
WHEN NEW.hospital_id <> (SELECT hospital_id FROM doctors WHERE id = NEW.doctor_id) BEGIN
  SELECT RAISE(ABORT, 'appointment.hospital_id must equal the doctor''s hospital');
END;
CREATE TRIGGER trg_guard_appt_hospital_upd BEFORE UPDATE OF hospital_id, doctor_id ON appointments
WHEN NEW.hospital_id <> (SELECT hospital_id FROM doctors WHERE id = NEW.doctor_id) BEGIN
  SELECT RAISE(ABORT, 'appointment.hospital_id must equal the doctor''s hospital');
END;
CREATE TRIGGER trg_guard_token_ins BEFORE INSERT ON tokens
WHEN NEW.doctor_id <> (SELECT doctor_id FROM appointments WHERE id = NEW.appointment_id)
  OR NEW.hospital_id <> (SELECT hospital_id FROM appointments WHERE id = NEW.appointment_id) BEGIN
  SELECT RAISE(ABORT, 'token doctor/hospital must match its appointment');
END;
CREATE TRIGGER trg_guard_refund_appt_ins BEFORE INSERT ON refunds
WHEN NEW.appointment_id <> (SELECT appointment_id FROM payments WHERE id = NEW.payment_id) BEGIN
  SELECT RAISE(ABORT, 'refund.appointment_id must equal its payment''s appointment');
END;
CREATE TRIGGER trg_guard_dispute_txn_ins BEFORE INSERT ON disputes
WHEN NEW.transaction_id <> (SELECT transaction_id FROM payments WHERE id = NEW.payment_id) BEGIN
  SELECT RAISE(ABORT, 'dispute.transaction_id must equal its payment''s transaction');
END;
CREATE TRIGGER trg_guard_user_hospital_ins BEFORE INSERT ON users
WHEN NEW.doctor_id IS NOT NULL AND NEW.hospital_id IS NOT (SELECT hospital_id FROM doctors WHERE id = NEW.doctor_id) BEGIN
  SELECT RAISE(ABORT, 'a doctor login must belong to the doctor''s hospital');
END;
CREATE TRIGGER trg_guard_qr_branch_ins BEFORE INSERT ON qr_codes
WHEN NEW.branch_id IS NOT NULL AND NEW.hospital_id <> (SELECT hospital_id FROM hospital_branches WHERE id = NEW.branch_id) BEGIN
  SELECT RAISE(ABORT, 'QR branch must belong to the QR''s hospital');
END;
CREATE TRIGGER trg_guard_doctor_branch_ins BEFORE INSERT ON doctors
WHEN NEW.branch_id IS NOT NULL AND NEW.hospital_id <> (SELECT hospital_id FROM hospital_branches WHERE id = NEW.branch_id) BEGIN
  SELECT RAISE(ABORT, 'doctor branch must belong to the doctor''s hospital');
END;
CREATE TRIGGER trg_guard_doctor_verifier_ins BEFORE INSERT ON doctors
WHEN NEW.verified_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.verified_by) BEGIN
  SELECT RAISE(ABORT, 'doctor.verified_by must be an existing user');
END;
CREATE TRIGGER trg_guard_doctor_verifier_upd BEFORE UPDATE OF verified_by ON doctors
WHEN NEW.verified_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.verified_by) BEGIN
  SELECT RAISE(ABORT, 'doctor.verified_by must be an existing user');
END;
