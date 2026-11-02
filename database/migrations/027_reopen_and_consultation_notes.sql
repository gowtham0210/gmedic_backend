-- A doctor who marks a consultation completed by mistake can take it back for a short while
-- (services/consultation.js: the same day, within 10 minutes). Completed stays final for everything
-- else: the guard now lets completed -> confirmed through only when the same statement bumps
-- reopen_count, which only that service does. The status history trigger records the move.
ALTER TABLE appointments ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS trg_guard_appt_reopen;
CREATE TRIGGER trg_guard_appt_reopen BEFORE UPDATE OF status ON appointments
WHEN OLD.status IN ('completed', 'cancelled') AND NEW.status <> OLD.status
 AND NOT (OLD.status = 'completed' AND NEW.status = 'confirmed' AND NEW.reopen_count = OLD.reopen_count + 1) BEGIN
  SELECT RAISE(ABORT, 'a completed or cancelled appointment cannot be reopened');
END;

-- Clinical notes for an appointment, written by its doctor. Append-only: an edit is a new version,
-- so what was recorded at any time can always be read back.
CREATE TABLE consultation_notes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id TEXT NOT NULL REFERENCES appointments (id),
  doctor_id      TEXT NOT NULL REFERENCES doctors (id),
  version        INTEGER NOT NULL CHECK (version >= 1),
  diagnosis      TEXT CHECK (diagnosis IS NULL OR length(diagnosis) <= 500),
  notes          TEXT CHECK (notes IS NULL OR length(notes) <= 4000),
  prescription   TEXT CHECK (prescription IS NULL OR length(prescription) <= 2000),
  created_by     TEXT REFERENCES users (id),
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (appointment_id, version)
);
CREATE INDEX ix_consultation_notes_appt ON consultation_notes (appointment_id, version);

CREATE TRIGGER trg_frozen_consultation_notes BEFORE UPDATE ON consultation_notes BEGIN
  SELECT RAISE(ABORT, 'consultation notes are append-only; save a new version');
END;
CREATE TRIGGER trg_keep_consultation_notes BEFORE DELETE ON consultation_notes BEGIN
  SELECT RAISE(ABORT, 'consultation notes cannot be deleted');
END;
