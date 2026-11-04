-- Emergency walk-ins, separate from the appointment slots (extends 032 and 033).
-- Additive: new columns, two replaced indexes and two replaced triggers. No row is changed or deleted, and
-- the slot-based emergencies of 032 (is_emergency = 1, emergency_walkin = 0) keep working as history.
--
-- A walk-in is an appointments row with emergency_walkin = 1 (and is_emergency = 1). It has no slot: appt_time
-- is the minute it was registered and seat_no is 1, so it takes no regular seat and is exempt from the seat,
-- capacity and emergency-seat checks. Its queue token is E001, E002, ... per doctor per day (tokens.token_kind).

-- 1. The walk-in marker and its clinical triage. Only a doctor sets the triage (checked by the API).
ALTER TABLE appointments ADD COLUMN emergency_walkin INTEGER NOT NULL DEFAULT 0 CHECK (emergency_walkin IN (0, 1));
ALTER TABLE appointments ADD COLUMN triage_priority TEXT CHECK (triage_priority IS NULL OR triage_priority IN ('CRITICAL', 'URGENT', 'SEMI_URGENT', 'NON_URGENT'));
ALTER TABLE appointments ADD COLUMN triaged_by_user_id TEXT REFERENCES users (id);
ALTER TABLE appointments ADD COLUMN triaged_at TEXT;

CREATE TRIGGER trg_guard_appt_walkin_ins BEFORE INSERT ON appointments
WHEN NEW.emergency_walkin = 1 AND (NEW.is_emergency = 0 OR NEW.emergency_no IS NULL OR NEW.source <> 'Walk-in') BEGIN
  SELECT RAISE(ABORT, 'an emergency walk-in must be an emergency with an emergency number, booked at the desk');
END;

CREATE TRIGGER trg_guard_appt_triage_ins BEFORE INSERT ON appointments
WHEN NEW.triage_priority IS NOT NULL AND NEW.emergency_walkin = 0 BEGIN
  SELECT RAISE(ABORT, 'only an emergency walk-in has a triage priority');
END;

CREATE TRIGGER trg_guard_appt_triage_upd BEFORE UPDATE OF triage_priority ON appointments
WHEN NEW.triage_priority IS NOT NULL AND NEW.emergency_walkin = 0 BEGIN
  SELECT RAISE(ABORT, 'only an emergency walk-in has a triage priority');
END;

-- 2. A walk-in has no slot seat, so it is left out of the one-booking-per-seat rule.
DROP INDEX IF EXISTS uq_appt_seat;
CREATE UNIQUE INDEX uq_appt_seat ON appointments (doctor_id, appt_date, appt_time, seat_no) WHERE status <> 'cancelled' AND emergency_walkin = 0;

-- 3. Emergency tokens have their own number sequence next to the normal one (T001 and E001 can both exist).
ALTER TABLE tokens ADD COLUMN token_kind TEXT NOT NULL DEFAULT 'NORMAL' CHECK (token_kind IN ('NORMAL', 'EMERGENCY'));
DROP INDEX IF EXISTS uq_tokens_doctor_day_number;
CREATE UNIQUE INDEX uq_tokens_doctor_day_number ON tokens (doctor_id, token_date, token_kind, number) WHERE status <> 'cancelled';
-- An emergency number is never handed out twice on a day, not even after a cancellation.
CREATE UNIQUE INDEX uq_tokens_emergency_number ON tokens (doctor_id, token_date, number) WHERE token_kind = 'EMERGENCY';

-- 4. The slot checks of 032 keep applying to slot-based emergencies and skip walk-ins.
DROP TRIGGER IF EXISTS trg_guard_appt_emergency_ins;
CREATE TRIGGER trg_guard_appt_emergency_ins BEFORE INSERT ON appointments
WHEN NEW.status <> 'cancelled' AND NEW.is_emergency = 1 AND NEW.emergency_walkin = 0
 AND (SELECT COUNT(*) FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date AND appt_time = NEW.appt_time
        AND status <> 'cancelled' AND is_emergency = 1 AND emergency_walkin = 0)
     >= COALESCE((SELECT MAX(emergency_seats) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 0) BEGIN
  SELECT RAISE(ABORT, 'emergency seats for this slot are full');
END;

DROP TRIGGER IF EXISTS trg_guard_appt_seat_ins;
CREATE TRIGGER trg_guard_appt_seat_ins BEFORE INSERT ON appointments
WHEN NEW.emergency_walkin = 0 AND NEW.seat_no > COALESCE((SELECT MAX(capacity_per_slot + CASE WHEN NEW.is_emergency = 1 THEN emergency_seats ELSE 0 END) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'seat_no exceeds the slot capacity');
END;

-- 5. Hospital controls over emergency intake (changed by Super Admin or Operations only).
ALTER TABLE hospitals ADD COLUMN emergency_intake TEXT NOT NULL DEFAULT 'OPEN' CHECK (emergency_intake IN ('OPEN', 'PAUSED'));
ALTER TABLE hospitals ADD COLUMN emergency_intake_reason TEXT;
ALTER TABLE hospitals ADD COLUMN emergency_intake_changed_by TEXT REFERENCES users (id);
ALTER TABLE hospitals ADD COLUMN emergency_intake_changed_at TEXT;
-- What the front desk tells a patient when intake is paused or the doctor is not available (where to go instead).
ALTER TABLE hospitals ADD COLUMN emergency_referral_note TEXT;
-- Most active walk-ins one doctor may have at a time. NULL until an administrator sets it: no walk-ins are accepted before that.
ALTER TABLE hospitals ADD COLUMN emergency_walkin_limit INTEGER CHECK (emergency_walkin_limit IS NULL OR emergency_walkin_limit BETWEEN 1 AND 500);

-- 6. A doctor who is on call for emergencies outside their scheduled hours (set by the doctor).
ALTER TABLE doctors ADD COLUMN emergency_on_call INTEGER NOT NULL DEFAULT 0 CHECK (emergency_on_call IN (0, 1));
