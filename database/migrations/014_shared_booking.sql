-- One booking flow for every channel (patient app, receptionist, walk-in).
--
-- Token numbers: one counter per doctor per day. Every booking takes the next number in the
-- same transaction that takes the seat, and a number is never handed out twice, even after a
-- cancellation. Check-in reuses the appointment's number, so the app, the receptionist and the
-- doctor's queue all show the same token.
CREATE TABLE token_counters (
  doctor_id   TEXT NOT NULL REFERENCES doctors (id),
  token_date  TEXT NOT NULL,
  last_number INTEGER NOT NULL CHECK (last_number >= 0),
  PRIMARY KEY (doctor_id, token_date)
);

-- Start each existing day's counter above every number already used that day.
INSERT INTO token_counters (doctor_id, token_date, last_number)
SELECT doctor_id, day, MAX(n) FROM (
  SELECT doctor_id, appt_date AS day, token_no AS n FROM appointments WHERE token_no IS NOT NULL
  UNION ALL
  SELECT doctor_id, token_date AS day, number AS n FROM tokens
) GROUP BY doctor_id, day;

CREATE UNIQUE INDEX uq_appt_doctor_token ON appointments (doctor_id, appt_date, token_no)
  WHERE token_no IS NOT NULL AND status <> 'cancelled';

-- Queue tokens are numbered per doctor now, not per hospital.
DROP INDEX uq_tokens_day_number;
CREATE UNIQUE INDEX uq_tokens_doctor_day_number ON tokens (doctor_id, token_date, number) WHERE status <> 'cancelled';

-- Slot capacity is a head count, enforced here for every channel: a slot never holds more live
-- appointments than the schedule covering it allows. Bookings made before a capacity cut stay;
-- the slot just takes no new ones until it is back under the limit.
CREATE TRIGGER trg_guard_appt_capacity_ins BEFORE INSERT ON appointments
WHEN NEW.status <> 'cancelled'
 AND (SELECT COUNT(*) FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date AND appt_time = NEW.appt_time
        AND status <> 'cancelled')
     >= COALESCE((SELECT MAX(capacity_per_slot) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'slot capacity is full');
END;

-- The same limit for a reschedule into another slot.
CREATE TRIGGER trg_guard_appt_capacity_upd BEFORE UPDATE OF appt_date, appt_time ON appointments
WHEN NEW.status <> 'cancelled' AND (NEW.appt_date <> OLD.appt_date OR NEW.appt_time <> OLD.appt_time)
 AND (SELECT COUNT(*) FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date AND appt_time = NEW.appt_time
        AND status <> 'cancelled' AND id <> NEW.id)
     >= COALESCE((SELECT MAX(capacity_per_slot) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'slot capacity is full');
END;

-- A schedule change takes effect from the next working day: the block in force today is closed
-- (effective_to) and a new version starts tomorrow. Two versions of a block share doctor, day and
-- start time, so that pair is no longer unique; trg_guard_schedule_overlap_* still stops two
-- versions from covering the same dates.
DROP INDEX uq_schedule_slot;
CREATE INDEX ix_schedule_doctor_day ON doctor_schedules (doctor_id, day_of_week, start_time);
