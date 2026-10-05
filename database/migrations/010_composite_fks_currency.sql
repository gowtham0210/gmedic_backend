-- Fourth review pass: rules move from triggers to declarative constraints.
--   * composite foreign keys replace the drift-guard triggers (appointment/doctor/hospital,
--     token/appointment, refund and dispute/payment, branch/hospital, doctor login/hospital)
--   * currency is carried by every money row and tied together by foreign keys,
--     so a settlement can never mix currencies
--   * stored totals get CHECKs (payment components, settlement net)
--   * a settlement points at the rate-history row it used
-- Stop the app before running this and restart it afterwards.

PRAGMA foreign_keys = OFF;

-- Triggers whose bodies mention a table that is rebuilt below would make the table renames fail,
-- so every cross-table trigger is dropped here and (where still needed) recreated at the end.
DROP TRIGGER IF EXISTS trg_guard_appt_hospital_ins;
DROP TRIGGER IF EXISTS trg_guard_appt_hospital_upd;
DROP TRIGGER IF EXISTS trg_guard_user_hospital_ins;
DROP TRIGGER IF EXISTS trg_guard_token_ins;
DROP TRIGGER IF EXISTS trg_guard_token_date_ins;
DROP TRIGGER IF EXISTS trg_guard_refund_appt_ins;
DROP TRIGGER IF EXISTS trg_guard_refund_currency_ins;
DROP TRIGGER IF EXISTS trg_guard_dispute_txn_ins;
DROP TRIGGER IF EXISTS trg_guard_qr_branch_ins;
DROP TRIGGER IF EXISTS trg_guard_qr_branch_upd;
DROP TRIGGER IF EXISTS trg_guard_doctor_branch_ins;
DROP TRIGGER IF EXISTS trg_guard_doctor_verifier_ins;
DROP TRIGGER IF EXISTS trg_guard_doctor_verifier_upd;
DROP TRIGGER IF EXISTS trg_frozen_fee;
DROP TRIGGER IF EXISTS trg_payment_sets_appt_ins;
DROP TRIGGER IF EXISTS trg_payment_sets_appt_upd;
DROP TRIGGER IF EXISTS trg_guard_refund_total_ins;
DROP TRIGGER IF EXISTS trg_guard_refund_total_upd;
DROP TRIGGER IF EXISTS trg_guard_hold_vs_booking;
DROP TRIGGER IF EXISTS trg_guard_appt_seat_ins;

-- ------------------------------------------------------------- parent keys
ALTER TABLE hospitals ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3);
CREATE UNIQUE INDEX uq_hospitals_id_currency ON hospitals (id, currency);
CREATE UNIQUE INDEX uq_branches_id_hospital ON hospital_branches (id, hospital_id);

-- ------------------------------------------------------------- departments
CREATE TABLE departments_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  hospital_id TEXT REFERENCES hospitals (id),
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO departments_new (id, name, created_at, updated_at) SELECT id, name, created_at, updated_at FROM departments;
DROP TABLE departments;
ALTER TABLE departments_new RENAME TO departments;
-- hospital_id NULL = shared master department; otherwise private to that hospital
CREATE UNIQUE INDEX uq_departments_scope_name ON departments (COALESCE(hospital_id, ''), name);
CREATE TRIGGER trg_departments_updated AFTER UPDATE ON departments BEGIN
  UPDATE departments SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ------------------------------------------------------------------ doctors
CREATE TABLE doctors_new (
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
INSERT INTO doctors_new (id, hospital_id, branch_id, department_id, name, photo_url, specialization, registration_number, qualifications, bio, years_experience,
    fee, currency, availability, availability_updated_at, verification_status, verification_note, verified_by, verified_at, created_at, updated_at)
  SELECT id, hospital_id, branch_id, department_id, name, photo_url, specialization, registration_number, qualifications, bio, years_experience,
    fee, currency, availability, availability_updated_at, verification_status, verification_note, verified_by, verified_at, created_at, updated_at FROM doctors;
DROP TABLE doctors;
ALTER TABLE doctors_new RENAME TO doctors;
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

-- -------------------------------------------------------------------- users
CREATE TABLE users_new (
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
  approved_by          TEXT REFERENCES users_new (id),
  approved_at          TEXT,
  last_login_at        TEXT,
  password_changed_at  TEXT,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (doctor_id IS NULL OR hospital_id IS NOT NULL),
  FOREIGN KEY (doctor_id, hospital_id) REFERENCES doctors (id, hospital_id)
);
INSERT INTO users_new (id, role, hospital_id, doctor_id, name, username, email, phone, password_hash, status, must_change_password, session_version,
    approved_by, approved_at, last_login_at, password_changed_at, created_at, updated_at)
  SELECT id, role, hospital_id, doctor_id, name, username, email, phone, password_hash, status, must_change_password, session_version,
    approved_by, approved_at, last_login_at, password_changed_at, created_at, updated_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX uq_users_email ON users (email);
CREATE UNIQUE INDEX uq_users_username ON users (username);
CREATE UNIQUE INDEX uq_users_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX uq_users_doctor ON users (doctor_id) WHERE doctor_id IS NOT NULL;
CREATE INDEX ix_users_role_status ON users (role, status);
CREATE INDEX ix_users_hospital ON users (hospital_id);
CREATE TRIGGER trg_users_updated AFTER UPDATE ON users BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ------------------------------------------------------------- appointments
CREATE TABLE appointments_new (
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
  rescheduled_from_id   TEXT REFERENCES appointments_new (id),
  reason_for_visit      TEXT,
  created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id, hospital_id) REFERENCES doctors (id, hospital_id),
  FOREIGN KEY (doctor_id, currency) REFERENCES doctors (id, currency),
  FOREIGN KEY (branch_id, hospital_id) REFERENCES hospital_branches (id, hospital_id)
);
INSERT INTO appointments_new (id, hospital_id, branch_id, doctor_id, patient_id, appt_date, appt_time, seat_no, fee, status, payment_status, source, no_show,
    cancel_reason, cancelled_by, cancelled_at, rescheduled_from_date, rescheduled_from_time, rescheduled_from_id, reason_for_visit, created_at, updated_at)
  SELECT id, hospital_id, branch_id, doctor_id, patient_id, appt_date, appt_time, seat_no, fee, status, payment_status, source, no_show,
    cancel_reason, cancelled_by, cancelled_at, rescheduled_from_date, rescheduled_from_time, rescheduled_from_id, reason_for_visit, created_at, updated_at FROM appointments;
DROP TABLE appointments;
ALTER TABLE appointments_new RENAME TO appointments;
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
-- Capacity and online quota come from the schedule window covering the slot. SQLite serialises writers,
-- so this check and the insert happen under one write lock; the unique seat index is the final guard.
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

-- ----------------------------------------------------------------- payments
CREATE TABLE payments_new (
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
INSERT INTO payments_new (id, appointment_id, consultation_amount, convenience_fee, tax_amount, amount, currency, method, gateway, gateway_order_id, transaction_id,
    receipt_number, status, gateway_status, failure_reason, paid_at, created_at, updated_at)
  SELECT id, appointment_id, consultation_amount, convenience_fee, tax_amount, amount, currency, method, gateway, gateway_order_id, transaction_id,
    receipt_number, status, gateway_status, failure_reason, paid_at, created_at, updated_at FROM payments;
DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;
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

-- ------------------------------------------------------------------- tokens
CREATE TABLE tokens_new (
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
INSERT INTO tokens_new (id, hospital_id, appointment_id, doctor_id, token_date, number, code, status, called_at, completed_at, cancelled_at, skipped_at, created_at, updated_at)
  SELECT id, hospital_id, appointment_id, doctor_id, token_date, number, code, status, called_at, completed_at, cancelled_at, skipped_at, created_at, updated_at FROM tokens;
DROP TABLE tokens;
ALTER TABLE tokens_new RENAME TO tokens;
CREATE UNIQUE INDEX uq_tokens_day_number ON tokens (hospital_id, token_date, number);
CREATE INDEX ix_tokens_appointment ON tokens (appointment_id);
CREATE INDEX ix_tokens_doctor ON tokens (doctor_id, token_date);
CREATE TRIGGER trg_tokens_updated AFTER UPDATE ON tokens BEGIN
  UPDATE tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ------------------------------------------------------------------ refunds
CREATE TABLE refunds_new (
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
INSERT INTO refunds_new (id, payment_id, appointment_id, amount, currency, reason, status, requires_checker, requested_by, approved_by, approved_at, decision_note, completed_at, created_at, updated_at)
  SELECT id, payment_id, appointment_id, amount, currency, reason, status, requires_checker, requested_by, approved_by, approved_at, decision_note, completed_at, created_at, updated_at FROM refunds;
DROP TABLE refunds;
ALTER TABLE refunds_new RENAME TO refunds;
CREATE UNIQUE INDEX uq_refunds_id_currency ON refunds (id, currency);
CREATE INDEX ix_refunds_status ON refunds (status, created_at);
CREATE INDEX ix_refunds_payment ON refunds (payment_id);
CREATE INDEX ix_refunds_appointment ON refunds (appointment_id);
CREATE TRIGGER trg_refunds_updated AFTER UPDATE ON refunds BEGIN
  UPDATE refunds SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ----------------------------------------------------------------- disputes
CREATE TABLE disputes_new (
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
INSERT INTO disputes_new (id, payment_id, transaction_id, amount, reason, status, resolution, created_at, updated_at)
  SELECT id, payment_id, transaction_id, amount, reason, status, resolution, created_at, updated_at FROM disputes;
DROP TABLE disputes;
ALTER TABLE disputes_new RENAME TO disputes;
CREATE UNIQUE INDEX uq_disputes_id_currency ON disputes (id, currency);
CREATE INDEX ix_disputes_status ON disputes (status);
CREATE INDEX ix_disputes_payment ON disputes (payment_id);
CREATE TRIGGER trg_disputes_updated AFTER UPDATE ON disputes BEGIN
  UPDATE disputes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ----------------------------------------------------------------- qr_codes
CREATE TABLE qr_codes_new (
  id             TEXT PRIMARY KEY,
  qr_key         TEXT NOT NULL,
  hospital_id    TEXT NOT NULL REFERENCES hospitals (id),
  branch_id      TEXT,
  desk_label     TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  revoked_reason TEXT,
  revoked_at     TEXT,
  revoked_by     TEXT REFERENCES users (id),
  replaced_by    TEXT REFERENCES qr_codes_new (id),
  created_by     TEXT REFERENCES users (id),
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (branch_id, hospital_id) REFERENCES hospital_branches (id, hospital_id)
);
INSERT INTO qr_codes_new (id, qr_key, hospital_id, branch_id, desk_label, status, revoked_reason, revoked_at, revoked_by, replaced_by, created_by, created_at, updated_at)
  SELECT id, qr_key, hospital_id, branch_id, desk_label, status, revoked_reason, revoked_at, revoked_by, replaced_by, created_by, created_at, updated_at FROM qr_codes;
DROP TABLE qr_codes;
ALTER TABLE qr_codes_new RENAME TO qr_codes;
CREATE UNIQUE INDEX uq_qr_key ON qr_codes (qr_key);
CREATE INDEX ix_qr_hospital ON qr_codes (hospital_id, status);
CREATE TRIGGER trg_qr_updated AFTER UPDATE ON qr_codes BEGIN
  UPDATE qr_codes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- -------------------------------------------------------------- settlements
CREATE TABLE settlements_new (
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
INSERT INTO settlements_new (id, hospital_id, period_start, period_end, currency, appointments_count, gross_collection, refunds_amount, commission_type, commission_value,
    rate_history_id, commission_amount, convenience_fees, net_payout, auto_generated, payout_date, payout_reference, status, created_at, updated_at)
  SELECT s.id, s.hospital_id, s.period_start, s.period_end, s.currency, s.appointments_count, s.gross_collection, s.refunds_amount, s.commission_type, s.commission_value,
    (SELECT h.id FROM hospital_rate_history h WHERE h.hospital_id = s.hospital_id AND h.effective_from <= s.created_at ORDER BY h.effective_from DESC, h.id DESC LIMIT 1),
    s.commission_amount, s.convenience_fees, s.net_payout, s.auto_generated, s.payout_date, s.payout_reference, s.status, s.created_at, s.updated_at FROM settlements s;
DROP TABLE settlements;
ALTER TABLE settlements_new RENAME TO settlements;
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

-- -------------------------------------------------- settlement_items (currency-tied)
CREATE TABLE settlement_items_new (
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
INSERT INTO settlement_items_new (id, settlement_id, item_type, payment_id, refund_id, amount, created_at)
  SELECT id, settlement_id, item_type, payment_id, refund_id, amount, created_at FROM settlement_items;
DROP TABLE settlement_items;
ALTER TABLE settlement_items_new RENAME TO settlement_items;
CREATE INDEX ix_settlement_items ON settlement_items (settlement_id);
CREATE UNIQUE INDEX uq_settlement_item_payment ON settlement_items (payment_id) WHERE payment_id IS NOT NULL;
CREATE UNIQUE INDEX uq_settlement_item_refund ON settlement_items (refund_id) WHERE refund_id IS NOT NULL;

-- ------------------------------------------- settlement_adjustments (currency, status)
CREATE TABLE settlement_adjustments_new (
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
INSERT INTO settlement_adjustments_new (id, settlement_id, dispute_id, amount, reason, created_by, created_at)
  SELECT id, settlement_id, dispute_id, amount, reason, created_by, created_at FROM settlement_adjustments;
DROP TABLE settlement_adjustments;
ALTER TABLE settlement_adjustments_new RENAME TO settlement_adjustments;
CREATE INDEX ix_adjustments_settlement ON settlement_adjustments (settlement_id);
-- a dispute can adjust a payout once
CREATE UNIQUE INDEX uq_adjustment_dispute ON settlement_adjustments (dispute_id) WHERE dispute_id IS NOT NULL AND status = 'APPLIED';

-- cross-table triggers recreated after all rebuilds
CREATE TRIGGER trg_frozen_fee BEFORE UPDATE OF fee ON appointments
WHEN OLD.fee <> NEW.fee AND EXISTS (SELECT 1 FROM payments WHERE appointment_id = OLD.id AND status = 'PAID') BEGIN
  SELECT RAISE(ABORT, 'the fee of a paid appointment cannot change');
END;
CREATE TRIGGER trg_payment_sets_appt_ins AFTER INSERT ON payments WHEN NEW.status = 'PAID' BEGIN
  UPDATE appointments SET payment_status = 'paid' WHERE id = NEW.appointment_id AND payment_status <> 'paid';
END;
CREATE TRIGGER trg_payment_sets_appt_upd AFTER UPDATE OF status ON payments WHEN NEW.status = 'PAID' BEGIN
  UPDATE appointments SET payment_status = 'paid' WHERE id = NEW.appointment_id AND payment_status <> 'paid';
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
CREATE TRIGGER trg_guard_appt_seat_ins BEFORE INSERT ON appointments
WHEN NEW.seat_no > COALESCE((SELECT MAX(capacity_per_slot) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'seat_no exceeds the slot capacity');
END;
CREATE TRIGGER trg_guard_hold_vs_booking BEFORE INSERT ON slot_holds
WHEN NEW.status = 'HELD' AND EXISTS (SELECT 1 FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date
       AND appt_time = NEW.appt_time AND seat_no = NEW.seat_no AND status <> 'cancelled') BEGIN
  SELECT RAISE(ABORT, 'that seat is already booked');
END;

PRAGMA foreign_keys = ON;
