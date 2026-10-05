-- Settlements are generated automatically per week from paid appointments.
-- Keep the commission rule that was applied so a later rate change never
-- rewrites an old statement.
ALTER TABLE settlements ADD COLUMN appointments_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settlements ADD COLUMN commission_type TEXT;
ALTER TABLE settlements ADD COLUMN commission_value REAL;
ALTER TABLE settlements ADD COLUMN auto_generated INTEGER NOT NULL DEFAULT 0;
