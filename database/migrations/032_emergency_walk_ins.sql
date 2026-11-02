-- Emergency walk-ins: once every seat of a slot is booked, the front desk can still add a few
-- patients to that exact slot as emergencies. How many is set per schedule block (0 to 3, 0 = none),
-- next to the walk-in seats. An emergency takes a seat above the slot's capacity
-- (capacity + 1 .. capacity + emergency_seats), so it never uses up a regular seat, and it goes to the
-- front of the doctor's queue under its own token code (E01, E02, ... per doctor per day).
ALTER TABLE doctor_schedules ADD COLUMN emergency_seats INTEGER NOT NULL DEFAULT 0 CHECK (emergency_seats BETWEEN 0 AND 3);

ALTER TABLE appointments ADD COLUMN is_emergency INTEGER NOT NULL DEFAULT 0 CHECK (is_emergency IN (0, 1));
-- Its place among the doctor's emergencies that day: E01 is 1. Set only on an emergency.
ALTER TABLE appointments ADD COLUMN emergency_no INTEGER CHECK (emergency_no IS NULL OR emergency_no >= 1);
CREATE UNIQUE INDEX uq_appt_emergency_no ON appointments (doctor_id, appt_date, emergency_no) WHERE emergency_no IS NOT NULL;

-- Regular seats: capacity counts regular bookings only, and an emergency skips this check.
DROP TRIGGER IF EXISTS trg_guard_appt_capacity_ins;
CREATE TRIGGER trg_guard_appt_capacity_ins BEFORE INSERT ON appointments
WHEN NEW.status <> 'cancelled' AND NEW.is_emergency = 0
 AND (SELECT COUNT(*) FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date AND appt_time = NEW.appt_time
        AND status <> 'cancelled' AND is_emergency = 0)
     >= COALESCE((SELECT MAX(capacity_per_slot) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'slot capacity is full');
END;

DROP TRIGGER IF EXISTS trg_guard_appt_capacity_upd;
CREATE TRIGGER trg_guard_appt_capacity_upd BEFORE UPDATE OF appt_date, appt_time ON appointments
WHEN NEW.status <> 'cancelled' AND NEW.is_emergency = 0 AND (NEW.appt_date <> OLD.appt_date OR NEW.appt_time <> OLD.appt_time)
 AND (SELECT COUNT(*) FROM appointments WHERE doctor_id = NEW.doctor_id AND appt_date = NEW.appt_date AND appt_time = NEW.appt_time
        AND status <> 'cancelled' AND is_emergency = 0 AND id <> NEW.id)
     >= COALESCE((SELECT MAX(capacity_per_slot) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'slot capacity is full');
END;

-- Emergency seats: at most the block's emergency_seats per slot.
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

-- An emergency is booked for its exact slot and does not move.
CREATE TRIGGER trg_guard_appt_emergency_upd BEFORE UPDATE OF appt_date, appt_time ON appointments
WHEN NEW.is_emergency = 1 AND (NEW.appt_date <> OLD.appt_date OR NEW.appt_time <> OLD.appt_time) BEGIN
  SELECT RAISE(ABORT, 'an emergency appointment cannot be moved');
END;

-- Seat numbers: a regular seat is 1 .. capacity, an emergency seat capacity + 1 .. capacity + emergency_seats.
DROP TRIGGER IF EXISTS trg_guard_appt_seat_ins;
CREATE TRIGGER trg_guard_appt_seat_ins BEFORE INSERT ON appointments
WHEN NEW.seat_no > COALESCE((SELECT MAX(capacity_per_slot + CASE WHEN NEW.is_emergency = 1 THEN emergency_seats ELSE 0 END) FROM doctor_schedules
       WHERE doctor_id = NEW.doctor_id AND day_of_week = CAST(strftime('%w', NEW.appt_date) AS INTEGER)
         AND start_time <= NEW.appt_time AND end_time > NEW.appt_time
         AND (effective_from IS NULL OR effective_from <= NEW.appt_date) AND (effective_to IS NULL OR effective_to >= NEW.appt_date)), 1) BEGIN
  SELECT RAISE(ABORT, 'seat_no exceeds the slot capacity');
END;
