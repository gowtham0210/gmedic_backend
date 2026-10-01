-- Normalize to 3NF: drop columns whose value is fully determined by another
-- column via a NOT NULL foreign-key chain, so the data can never drift from
-- its source of truth (the classic denormalization anomaly 3NF prevents).
--
--   appointments.patient_name  -> derivable via patient_id -> patients.name
--   tokens.patient_name        -> derivable via appointment_id -> patient_id -> patients.name
--   payments.hospital_id       -> derivable via appointment_id -> appointments.hospital_id
--   payments.patient_id        -> derivable via appointment_id -> appointments.patient_id
--   refunds.hospital_id        -> derivable via appointment_id -> appointments.hospital_id
--   refunds.patient_id         -> derivable via appointment_id -> appointments.patient_id
--   disputes.hospital_id       -> derivable via payment_id -> appointment_id -> hospital_id
--   disputes.patient_id        -> derivable via payment_id -> appointment_id -> patient_id
--
-- tokens.hospital_id is deliberately KEPT even though it is equally
-- derivable via appointment_id -> appointments.hospital_id: it backs
-- uq_tokens_day_number (hospital_id, token_date, number), which enforces
-- "token numbers are unique per hospital per day" at the database level.
-- SQLite has no way to express a unique index across a join, so dropping
-- this column would remove that guarantee entirely rather than just
-- deduplicate storage — a real trade-off, not a plain 3NF win.

DROP INDEX IF EXISTS ix_payments_hospital_time;
DROP INDEX IF EXISTS ix_refunds_hospital;

ALTER TABLE appointments DROP COLUMN patient_name;
ALTER TABLE tokens DROP COLUMN patient_name;
ALTER TABLE payments DROP COLUMN hospital_id;
ALTER TABLE payments DROP COLUMN patient_id;
ALTER TABLE refunds DROP COLUMN hospital_id;
ALTER TABLE refunds DROP COLUMN patient_id;
ALTER TABLE disputes DROP COLUMN hospital_id;
ALTER TABLE disputes DROP COLUMN patient_id;

-- Replacement indexes for the join paths that now do the work the dropped
-- columns' indexes used to do.
CREATE INDEX IF NOT EXISTS ix_refunds_appointment ON refunds (appointment_id);
CREATE INDEX IF NOT EXISTS ix_disputes_payment ON disputes (payment_id);
