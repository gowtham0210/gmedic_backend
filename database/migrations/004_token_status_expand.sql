-- The Doctor Portal's queue needs to distinguish "called to come in" from
-- "consultation in progress", and "skipped" from "cancelled" — states the
-- original CHECK constraint didn't allow. SQLite can't ALTER a CHECK
-- constraint in place, so this rebuilds the table (the documented SQLite
-- pattern: create new, copy, drop old, rename), preserving all existing rows.

CREATE TABLE tokens_new (
  id             TEXT PRIMARY KEY,
  hospital_id    TEXT NOT NULL REFERENCES hospitals (id),
  appointment_id TEXT NOT NULL REFERENCES appointments (id),
  doctor_id      TEXT NOT NULL REFERENCES doctors (id),
  token_date     TEXT NOT NULL,
  number         INTEGER NOT NULL,
  code           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','called','in_consultation','completed','cancelled','skipped')),
  called_at      TEXT,
  completed_at   TEXT,
  cancelled_at   TEXT,
  skipped_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tokens_new (id, hospital_id, appointment_id, doctor_id, token_date, number, code, status, called_at, completed_at, cancelled_at, created_at, updated_at)
  SELECT id, hospital_id, appointment_id, doctor_id, token_date, number, code, status, called_at, completed_at, cancelled_at, created_at, updated_at FROM tokens;

DROP TABLE tokens;
ALTER TABLE tokens_new RENAME TO tokens;

CREATE UNIQUE INDEX uq_tokens_day_number ON tokens (hospital_id, token_date, number);
CREATE INDEX ix_tokens_appointment ON tokens (appointment_id);
CREATE INDEX ix_tokens_doctor ON tokens (doctor_id, token_date);
CREATE TRIGGER trg_tokens_updated AFTER UPDATE ON tokens BEGIN
  UPDATE tokens SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
