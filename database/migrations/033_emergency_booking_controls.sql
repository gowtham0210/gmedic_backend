-- Emergency booking controls (extends 032): who may book an emergency, and why one was booked.
-- Additive only: two nullable/defaulted columns and one trigger. No existing row is changed or deleted.

-- Per-user permission. Only a receptionist with this set to 1 can book an emergency walk-in; an admin with
-- receptionists.manage grants or revokes it (PATCH /api/admin/receptionists/:id/emergency-booking).
-- Default 0: nobody holds it until an admin grants it.
ALTER TABLE users ADD COLUMN can_book_emergency INTEGER NOT NULL DEFAULT 0 CHECK (can_book_emergency IN (0, 1));

-- Why this emergency was booked. Set only on an emergency; NULL on every regular appointment and on the
-- emergencies booked before this migration.
ALTER TABLE appointments ADD COLUMN emergency_reason TEXT;

-- A new emergency must carry a reason of 3 to 300 characters (checked again by the API). Insert only, so older
-- emergencies without a reason are untouched.
CREATE TRIGGER trg_guard_appt_emergency_reason_ins BEFORE INSERT ON appointments
WHEN NEW.is_emergency = 1 AND (NEW.emergency_reason IS NULL OR length(trim(NEW.emergency_reason)) < 3 OR length(NEW.emergency_reason) > 300) BEGIN
  SELECT RAISE(ABORT, 'an emergency appointment needs a reason of 3 to 300 characters');
END;
