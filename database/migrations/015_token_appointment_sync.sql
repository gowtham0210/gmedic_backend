-- A queue token and its appointment move together, whichever portal changes them (reception,
-- doctor queue, doctor appointments, patient app). The triggers run inside the statement that
-- changes either row, so the pair can never be left half-updated.
--
--   token completed        -> appointment completed   (doctor's "Completed today" counts it)
--   appointment completed  -> open token completed
--   appointment cancelled  -> open token cancelled    (a cancelled patient can't be called)
--
-- Cancelling only the token (reception "Cancel token") leaves the appointment as it is, so a new
-- token can be issued for it.

-- Repair pairs that drifted apart before these rules existed.
UPDATE appointments SET status = 'completed'
 WHERE status IN ('confirmed', 'pending')
   AND id IN (SELECT appointment_id FROM tokens WHERE status = 'completed');

UPDATE tokens SET status = 'completed', called_at = COALESCE(called_at, CURRENT_TIMESTAMP), completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
 WHERE status IN ('waiting', 'called', 'in_consultation', 'skipped')
   AND appointment_id IN (SELECT id FROM appointments WHERE status = 'completed');

UPDATE tokens SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP)
 WHERE status IN ('waiting', 'called', 'in_consultation', 'skipped')
   AND appointment_id IN (SELECT id FROM appointments WHERE status = 'cancelled');

CREATE TRIGGER trg_sync_token_completed AFTER UPDATE OF status ON tokens
WHEN NEW.status = 'completed' AND OLD.status <> 'completed' AND NEW.appointment_id IS NOT NULL BEGIN
  UPDATE appointments SET status = 'completed' WHERE id = NEW.appointment_id AND status IN ('confirmed', 'pending');
END;

CREATE TRIGGER trg_sync_appt_completed AFTER UPDATE OF status ON appointments
WHEN NEW.status = 'completed' AND OLD.status <> 'completed' BEGIN
  UPDATE tokens SET status = 'completed', called_at = COALESCE(called_at, CURRENT_TIMESTAMP), completed_at = CURRENT_TIMESTAMP
   WHERE appointment_id = NEW.id AND status IN ('waiting', 'called', 'in_consultation', 'skipped');
END;

CREATE TRIGGER trg_sync_appt_cancelled AFTER UPDATE OF status ON appointments
WHEN NEW.status = 'cancelled' AND OLD.status <> 'cancelled' BEGIN
  UPDATE tokens SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
   WHERE appointment_id = NEW.id AND status IN ('waiting', 'called', 'in_consultation', 'skipped');
END;

-- Completed and cancelled are final for an appointment, as they are for its token. Reopening one
-- would leave its token (and any refund) out of step; book a new appointment instead.
CREATE TRIGGER trg_guard_appt_reopen BEFORE UPDATE OF status ON appointments
WHEN OLD.status IN ('completed', 'cancelled') AND NEW.status <> OLD.status BEGIN
  SELECT RAISE(ABORT, 'a completed or cancelled appointment cannot be reopened');
END;

-- No new token for an appointment that is already over.
CREATE TRIGGER trg_guard_token_closed_appt BEFORE INSERT ON tokens
WHEN NEW.status <> 'cancelled'
 AND (SELECT status FROM appointments WHERE id = NEW.appointment_id) IN ('completed', 'cancelled') BEGIN
  SELECT RAISE(ABORT, 'a completed or cancelled appointment cannot get a token');
END;
