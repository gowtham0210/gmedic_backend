-- Reopening a completed appointment puts it back to the status it had before (confirmed, or pending for an
-- unpaid one), not always 'confirmed'. Still only with reopen_count + 1.
DROP TRIGGER IF EXISTS trg_guard_appt_reopen;
CREATE TRIGGER trg_guard_appt_reopen BEFORE UPDATE OF status ON appointments
WHEN OLD.status IN ('completed', 'cancelled') AND NEW.status <> OLD.status
 AND NOT (OLD.status = 'completed' AND NEW.status IN ('confirmed', 'pending') AND NEW.reopen_count = OLD.reopen_count + 1) BEGIN
  SELECT RAISE(ABORT, 'a completed or cancelled appointment cannot be reopened');
END;
