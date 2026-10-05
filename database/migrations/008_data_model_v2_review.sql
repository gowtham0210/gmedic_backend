-- Second review pass on the v2 data model (see docs/data-model-v2.md).

PRAGMA foreign_keys = OFF;

-- --------------------------------------------- patients: mobile becomes optional
-- (walk-ins may have no number; the account holder's number lives on users.phone)
CREATE TABLE patients_new (
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
INSERT INTO patients_new (id, name, mobile, email, city, created_at, updated_at, account_user_id, relation, date_of_birth, gender)
  SELECT id, name, mobile, email, city, created_at, updated_at, account_user_id, relation, date_of_birth, gender FROM patients;
DROP TABLE patients;
ALTER TABLE patients_new RENAME TO patients;
CREATE UNIQUE INDEX uq_patients_mobile ON patients (mobile) WHERE mobile IS NOT NULL;
CREATE INDEX ix_patients_name ON patients (name);
CREATE INDEX ix_patients_account ON patients (account_user_id);
CREATE TRIGGER trg_patients_updated AFTER UPDATE ON patients BEGIN
  UPDATE patients SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

PRAGMA foreign_keys = ON;

-- Patients log in by OTP, so the account holder's mobile is unique on users.
CREATE UNIQUE INDEX uq_users_phone ON users (phone) WHERE phone IS NOT NULL;

-- ------------------------- account-level links (dependants share the holder's link)
ALTER TABLE patient_hospital_links ADD COLUMN account_user_id TEXT REFERENCES users (id);
CREATE UNIQUE INDEX uq_links_account_hospital ON patient_hospital_links (account_user_id, hospital_id) WHERE account_user_id IS NOT NULL;
ALTER TABLE qr_scans ADD COLUMN account_user_id TEXT REFERENCES users (id);
CREATE INDEX ix_scans_account ON qr_scans (account_user_id);

-- ----------------------------------------------- multi-seat slots (double-booking)
ALTER TABLE appointments ADD COLUMN seat_no INTEGER NOT NULL DEFAULT 1 CHECK (seat_no >= 1);
CREATE UNIQUE INDEX uq_appt_seat ON appointments (doctor_id, appt_date, appt_time, seat_no) WHERE status <> 'cancelled';
-- A seat can never exceed the capacity of the schedule that covers the slot (1 when no schedule row covers it).
CREATE TRIGGER trg_guard_appt_seat_ins BEFORE INSERT ON appointments
WHEN NEW.seat_no > COALESCE((SELECT MAX(capacity_per_slot) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'seat_no exceeds the slot capacity');
END;
CREATE TRIGGER trg_guard_appt_source_ins BEFORE INSERT ON appointments
WHEN NEW.source NOT IN ('Gmedic App', 'Walk-in') BEGIN
  SELECT RAISE(ABORT, 'appointment.source must be Gmedic App or Walk-in');
END;

-- ----------------------------------------------------- payments: receipt breakdown
ALTER TABLE payments ADD COLUMN consultation_amount REAL;
ALTER TABLE payments ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0 CHECK (tax_amount >= 0);
UPDATE payments SET consultation_amount = amount - convenience_fee - tax_amount;
CREATE TRIGGER trg_guard_payment_method_ins BEFORE INSERT ON payments
WHEN NEW.method IS NOT NULL AND NEW.method NOT IN ('UPI', 'Card', 'Net Banking', 'Wallet', 'Cash') BEGIN
  SELECT RAISE(ABORT, 'payment.method must be UPI, Card, Net Banking, Wallet or Cash');
END;

-- ------------------------------------------------- more drift guards on kept columns
CREATE TRIGGER trg_guard_token_date_ins BEFORE INSERT ON tokens
WHEN NEW.token_date <> (SELECT appt_date FROM appointments WHERE id = NEW.appointment_id) BEGIN
  SELECT RAISE(ABORT, 'token.token_date must equal its appointment''s date');
END;
CREATE TRIGGER trg_guard_qr_branch_upd BEFORE UPDATE OF hospital_id, branch_id ON qr_codes
WHEN NEW.branch_id IS NOT NULL AND NEW.hospital_id <> (SELECT hospital_id FROM hospital_branches WHERE id = NEW.branch_id) BEGIN
  SELECT RAISE(ABORT, 'QR branch must belong to the QR''s hospital');
END;

-- ----------------------------------- schedules: no overlapping windows per doctor/day
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
