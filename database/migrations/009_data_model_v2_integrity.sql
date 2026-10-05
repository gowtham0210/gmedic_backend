-- Third review pass: money integrity, history, immutability and more real FKs.
-- Pair with `npm run db:verify` (db/verifyIntegrity.js), which re-checks every
-- denormalised column so drift is caught even if triggers were bypassed
-- (bulk import, disabled triggers, replication).

PRAGMA foreign_keys = OFF;

-- --------------------------------------------------------------------- real FKs
CREATE TABLE qr_scans_new (
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
INSERT INTO qr_scans_new (id, qr_code_id, hospital_id, branch_id, patient_id, result, failure_reason, is_sample, scanned_at, account_user_id)
  SELECT id, qr_code_id, hospital_id, branch_id, patient_id, result, failure_reason, is_sample, scanned_at, account_user_id FROM qr_scans;
DROP TABLE qr_scans;
ALTER TABLE qr_scans_new RENAME TO qr_scans;
CREATE INDEX ix_scans_qr_time ON qr_scans (qr_code_id, scanned_at);
CREATE INDEX ix_scans_hospital_time ON qr_scans (hospital_id, scanned_at);
CREATE INDEX ix_scans_time ON qr_scans (scanned_at);
CREATE INDEX ix_scans_account ON qr_scans (account_user_id);

-- A notification can only exist for a real template (logs stay free-text so unknown events can still be logged).
CREATE TABLE notifications_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users (id),
  event_key  TEXT NOT NULL REFERENCES notification_templates (event_key) ON UPDATE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO notifications_new SELECT * FROM notifications;
DROP TABLE notifications;
ALTER TABLE notifications_new RENAME TO notifications;
CREATE INDEX ix_notifications_user ON notifications (user_id, read_at, id);

CREATE TABLE payment_webhooks_new (
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
INSERT INTO payment_webhooks_new SELECT * FROM payment_webhooks;
DROP TABLE payment_webhooks;
ALTER TABLE payment_webhooks_new RENAME TO payment_webhooks;
CREATE INDEX ix_webhooks_status ON payment_webhooks (status, received_at);
CREATE INDEX ix_webhooks_txn ON payment_webhooks (transaction_id);

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------------ currency
ALTER TABLE payments    ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3);
ALTER TABLE refunds     ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3);
ALTER TABLE settlements ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3);
ALTER TABLE doctors     ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3);
ALTER TABLE hospitals   ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';
CREATE TRIGGER trg_guard_refund_currency_ins BEFORE INSERT ON refunds
WHEN NEW.currency <> (SELECT currency FROM payments WHERE id = NEW.payment_id) BEGIN
  SELECT RAISE(ABORT, 'refund currency must equal its payment currency');
END;

-- --------------------------------------------------- refunds can never exceed the payment
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

-- ----------------------------------------- payment retries: many attempts, one success
CREATE UNIQUE INDEX uq_payments_one_paid ON payments (appointment_id) WHERE status = 'PAID';
-- appointments.payment_status follows the payments table instead of being a second writer
CREATE TRIGGER trg_payment_sets_appt_ins AFTER INSERT ON payments WHEN NEW.status = 'PAID' BEGIN
  UPDATE appointments SET payment_status = 'paid' WHERE id = NEW.appointment_id AND payment_status <> 'paid';
END;
CREATE TRIGGER trg_payment_sets_appt_upd AFTER UPDATE OF status ON payments WHEN NEW.status = 'PAID' BEGIN
  UPDATE appointments SET payment_status = 'paid' WHERE id = NEW.appointment_id AND payment_status <> 'paid';
END;

-- ----------------------------------------------- commission / fee history (versioned)
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
INSERT INTO hospital_rate_history (hospital_id, booking_model, booking_fee, convenience_fee, commission_type, commission_value, effective_from)
  SELECT id, booking_model, booking_fee, convenience_fee, commission_type, commission_value, created_at FROM hospitals;
CREATE TRIGGER trg_hospital_rate_history AFTER UPDATE OF booking_model, booking_fee, convenience_fee, commission_type, commission_value ON hospitals
WHEN OLD.booking_model IS NOT NEW.booking_model OR OLD.booking_fee IS NOT NEW.booking_fee OR OLD.convenience_fee IS NOT NEW.convenience_fee
  OR OLD.commission_type IS NOT NEW.commission_type OR OLD.commission_value IS NOT NEW.commission_value BEGIN
  INSERT INTO hospital_rate_history (hospital_id, booking_model, booking_fee, convenience_fee, commission_type, commission_value)
  VALUES (NEW.id, NEW.booking_model, NEW.booking_fee, NEW.convenience_fee, NEW.commission_type, NEW.commission_value);
END;

-- ------------------------------------------------- disputes can adjust a settlement
CREATE TABLE settlement_adjustments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id TEXT NOT NULL REFERENCES settlements (id) ON DELETE CASCADE,
  dispute_id    TEXT REFERENCES disputes (id),
  amount        REAL NOT NULL,
  reason        TEXT NOT NULL,
  created_by    TEXT REFERENCES users (id),
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_adjustments_settlement ON settlement_adjustments (settlement_id);

-- --------------------------------------------- snapshots cannot be rewritten
CREATE TRIGGER trg_frozen_settlement BEFORE UPDATE OF hospital_id, period_start, period_end, gross_collection, refunds_amount, commission_amount,
  convenience_fees, net_payout, commission_type, commission_value ON settlements
WHEN OLD.status = 'PAID' BEGIN
  SELECT RAISE(ABORT, 'a paid settlement is frozen');
END;
CREATE TRIGGER trg_frozen_message BEFORE UPDATE ON support_messages BEGIN
  SELECT RAISE(ABORT, 'support messages are append-only');
END;
CREATE TRIGGER trg_frozen_history BEFORE UPDATE ON appointment_status_history BEGIN
  SELECT RAISE(ABORT, 'status history is append-only');
END;
CREATE TRIGGER trg_frozen_audit_upd BEFORE UPDATE ON audit_logs BEGIN
  SELECT RAISE(ABORT, 'audit logs are append-only');
END;
CREATE TRIGGER trg_frozen_audit_del BEFORE DELETE ON audit_logs BEGIN
  SELECT RAISE(ABORT, 'audit logs are append-only');
END;
CREATE TRIGGER trg_frozen_fee BEFORE UPDATE OF fee ON appointments
WHEN OLD.fee <> NEW.fee AND EXISTS (SELECT 1 FROM payments WHERE appointment_id = OLD.id AND status = 'PAID') BEGIN
  SELECT RAISE(ABORT, 'the fee of a paid appointment cannot change');
END;

-- --------------------------------------------------------- identity integrity
CREATE UNIQUE INDEX uq_users_doctor ON users (doctor_id) WHERE doctor_id IS NOT NULL;
CREATE TRIGGER trg_guard_link_account_ins BEFORE INSERT ON patient_hospital_links
WHEN NEW.account_user_id IS NOT NULL AND NEW.account_user_id IS NOT (SELECT account_user_id FROM patients WHERE id = NEW.patient_id) BEGIN
  SELECT RAISE(ABORT, 'link.account_user_id must equal the patient''s account');
END;
CREATE TRIGGER trg_guard_link_account_upd BEFORE UPDATE OF account_user_id, patient_id ON patient_hospital_links
WHEN NEW.account_user_id IS NOT NULL AND NEW.account_user_id IS NOT (SELECT account_user_id FROM patients WHERE id = NEW.patient_id) BEGIN
  SELECT RAISE(ABORT, 'link.account_user_id must equal the patient''s account');
END;
CREATE TRIGGER trg_guard_scan_account_ins BEFORE INSERT ON qr_scans
WHEN NEW.account_user_id IS NOT NULL AND NEW.patient_id IS NOT NULL AND NEW.account_user_id IS NOT (SELECT account_user_id FROM patients WHERE id = NEW.patient_id) BEGIN
  SELECT RAISE(ABORT, 'scan.account_user_id must equal the patient''s account');
END;

-- ------------------------------------------------------- scheduling integrity
CREATE TRIGGER trg_guard_leave_overlap_ins BEFORE INSERT ON doctor_leaves
WHEN EXISTS (SELECT 1 FROM doctor_leaves l WHERE l.doctor_id = NEW.doctor_id AND l.start_date <= NEW.end_date AND NEW.start_date <= l.end_date) BEGIN
  SELECT RAISE(ABORT, 'leave overlaps an existing leave for this doctor');
END;
CREATE TRIGGER trg_guard_leave_overlap_upd BEFORE UPDATE OF doctor_id, start_date, end_date ON doctor_leaves
WHEN EXISTS (SELECT 1 FROM doctor_leaves l WHERE l.id <> NEW.id AND l.doctor_id = NEW.doctor_id AND l.start_date <= NEW.end_date AND NEW.start_date <= l.end_date) BEGIN
  SELECT RAISE(ABORT, 'leave overlaps an existing leave for this doctor');
END;

ALTER TABLE slot_holds ADD COLUMN seat_no INTEGER NOT NULL DEFAULT 1 CHECK (seat_no >= 1);
CREATE UNIQUE INDEX uq_holds_active_seat ON slot_holds (doctor_id, appt_date, appt_time, seat_no) WHERE status = 'HELD';
CREATE TRIGGER trg_guard_hold_vs_booking BEFORE INSERT ON slot_holds
WHEN NEW.status = 'HELD' AND EXISTS (SELECT 1 FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date
       AND appt_time = NEW.appt_time AND seat_no = NEW.seat_no AND status <> 'cancelled') BEGIN
  SELECT RAISE(ABORT, 'that seat is already booked');
END;

-- ------------------------------------------------------ cancellation timestamp
ALTER TABLE appointments ADD COLUMN cancelled_at TEXT;
UPDATE appointments SET cancelled_at = updated_at WHERE status = 'cancelled';
CREATE TRIGGER trg_appt_cancelled_at AFTER UPDATE OF status ON appointments WHEN NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL BEGIN
  UPDATE appointments SET cancelled_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
