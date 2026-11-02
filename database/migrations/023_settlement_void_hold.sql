-- A settlement can be put on hold and released, or voided (never deleted). It can also bring forward a
-- shortfall (refunds and commission above the week's collection) from the previous statement (carry_in), so
-- that money is never silently lost. SQLite can't change a CHECK, so the table is rebuilt with status VOID,
-- the reasons and carry_in. A voided settlement frees its period: the unique
-- index and the overlap triggers now ignore VOID rows, so a corrected statement can be generated again.
PRAGMA foreign_keys = OFF;

CREATE TABLE settlements_new (
  id                 TEXT PRIMARY KEY,
  hospital_id        TEXT NOT NULL,
  period_start       TEXT NOT NULL,
  period_end         TEXT NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3),
  appointments_count INTEGER NOT NULL DEFAULT 0,
  gross_collection   REAL NOT NULL DEFAULT 0,
  refunds_amount     REAL NOT NULL DEFAULT 0,
  commission_type    TEXT,
  commission_value   REAL,
  rate_history_id    INTEGER REFERENCES hospital_rate_history (id),
  commission_amount  REAL NOT NULL DEFAULT 0,
  convenience_fees   REAL NOT NULL DEFAULT 0,
  carry_in           REAL NOT NULL DEFAULT 0 CHECK (carry_in >= 0),
  net_payout         REAL NOT NULL DEFAULT 0,
  auto_generated     INTEGER NOT NULL DEFAULT 0,
  payout_date        TEXT,
  payout_reference   TEXT,
  status             TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSING','PAID','ON_HOLD','VOID')),
  hold_reason        TEXT,
  void_reason        TEXT,
  voided_by          TEXT REFERENCES users (id),
  voided_at          TEXT,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (period_start <= period_end),
  CHECK (ABS(net_payout - MAX(0, gross_collection - refunds_amount - commission_amount - convenience_fees - carry_in)) < 0.01),
  FOREIGN KEY (hospital_id, currency) REFERENCES hospitals (id, currency)
);

INSERT INTO settlements_new (id, hospital_id, period_start, period_end, currency, appointments_count, gross_collection, refunds_amount, commission_type, commission_value, rate_history_id,
  commission_amount, convenience_fees, net_payout, auto_generated, payout_date, payout_reference, status, created_at, updated_at)
SELECT id, hospital_id, period_start, period_end, currency, appointments_count, gross_collection, refunds_amount, commission_type, commission_value, rate_history_id,
  commission_amount, convenience_fees, net_payout, auto_generated, payout_date, payout_reference, status, created_at, updated_at FROM settlements;

DROP TABLE settlements;
ALTER TABLE settlements_new RENAME TO settlements;

CREATE UNIQUE INDEX uq_settlement_period ON settlements (hospital_id, period_start, period_end) WHERE status <> 'VOID';
CREATE UNIQUE INDEX uq_settlements_id_currency ON settlements (id, currency);
CREATE INDEX ix_settlements_status ON settlements (status);

CREATE TRIGGER trg_settlements_updated AFTER UPDATE ON settlements BEGIN
  UPDATE settlements SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
CREATE TRIGGER trg_frozen_settlement BEFORE UPDATE OF hospital_id, period_start, period_end, gross_collection, refunds_amount, commission_amount,
  convenience_fees, carry_in, net_payout, commission_type, commission_value, rate_history_id ON settlements
WHEN OLD.status = 'PAID' BEGIN
  SELECT RAISE(ABORT, 'a paid settlement is frozen');
END;
CREATE TRIGGER trg_guard_settlement_overlap_ins BEFORE INSERT ON settlements
WHEN NEW.status <> 'VOID' AND EXISTS (SELECT 1 FROM settlements s WHERE s.status <> 'VOID' AND s.hospital_id = NEW.hospital_id AND s.period_start <= NEW.period_end AND NEW.period_start <= s.period_end) BEGIN
  SELECT RAISE(ABORT, 'settlement period overlaps an existing settlement for this hospital');
END;
CREATE TRIGGER trg_guard_settlement_overlap_upd BEFORE UPDATE OF hospital_id, period_start, period_end, status ON settlements
WHEN NEW.status <> 'VOID' AND EXISTS (SELECT 1 FROM settlements s WHERE s.status <> 'VOID' AND s.id <> NEW.id AND s.hospital_id = NEW.hospital_id AND s.period_start <= NEW.period_end AND NEW.period_start <= s.period_end) BEGIN
  SELECT RAISE(ABORT, 'settlement period overlaps an existing settlement for this hospital');
END;

PRAGMA foreign_keys = ON;
