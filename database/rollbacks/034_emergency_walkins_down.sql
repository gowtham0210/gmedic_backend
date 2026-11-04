-- Recovery for migration 034. Use ONLY on a database that has no emergency walk-in yet
-- (SELECT COUNT(*) FROM appointments WHERE emergency_walkin = 1 must be 0); otherwise restore the backup taken
-- before 034 instead, because dropping the columns would lose the walk-ins' triage and token kind.
-- Run with the app stopped. Afterwards remove '034_emergency_walkins.sql' from meta.migrations_applied.
DROP TRIGGER IF EXISTS trg_guard_appt_walkin_ins;
DROP TRIGGER IF EXISTS trg_guard_appt_triage_ins;
DROP TRIGGER IF EXISTS trg_guard_appt_triage_upd;
DROP TRIGGER IF EXISTS trg_guard_appt_emergency_ins;
DROP TRIGGER IF EXISTS trg_guard_appt_seat_ins;
DROP INDEX IF EXISTS uq_appt_seat;
DROP INDEX IF EXISTS uq_tokens_doctor_day_number;
DROP INDEX IF EXISTS uq_tokens_emergency_number;

CREATE UNIQUE INDEX uq_appt_seat ON appointments (doctor_id, appt_date, appt_time, seat_no) WHERE status <> 'cancelled';
CREATE UNIQUE INDEX uq_tokens_doctor_day_number ON tokens (doctor_id, token_date, number) WHERE status <> 'cancelled';

CREATE TRIGGER trg_guard_appt_emergency_ins BEFORE INSERT ON appointments
WHEN NEW.status <> 'cancelled' AND NEW.is_emergency = 1
 AND (SELECT COUNT(*) FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date AND appt_time = NEW.appt_time
        AND status <> 'cancelled' AND is_emergency = 1)
     >= COALESCE((SELECT MAX(emergency_seats) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 0) BEGIN
  SELECT RAISE(ABORT, 'emergency seats for this slot are full');
END;

CREATE TRIGGER trg_guard_appt_seat_ins BEFORE INSERT ON appointments
WHEN NEW.seat_no > COALESCE((SELECT MAX(capacity_per_slot + CASE WHEN NEW.is_emergency = 1 THEN emergency_seats ELSE 0 END) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'seat_no exceeds the slot capacity');
END;

ALTER TABLE appointments DROP COLUMN emergency_walkin;
ALTER TABLE appointments DROP COLUMN triage_priority;
ALTER TABLE appointments DROP COLUMN triaged_by_user_id;
ALTER TABLE appointments DROP COLUMN triaged_at;
ALTER TABLE tokens DROP COLUMN token_kind;
ALTER TABLE hospitals DROP COLUMN emergency_intake;
ALTER TABLE hospitals DROP COLUMN emergency_intake_reason;
ALTER TABLE hospitals DROP COLUMN emergency_intake_changed_by;
ALTER TABLE hospitals DROP COLUMN emergency_intake_changed_at;
ALTER TABLE hospitals DROP COLUMN emergency_referral_note;
ALTER TABLE hospitals DROP COLUMN emergency_walkin_limit;
ALTER TABLE doctors DROP COLUMN emergency_on_call;
