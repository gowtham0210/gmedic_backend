-- Booking token model: a patient booking in the Gmedic app pays only a small fixed booking token
-- online (platform setting booking_token_amount, ₹5). Gmedic keeps it and it is never refunded. The
-- consultation fee is paid at the hospital and recorded at the front desk.
--
-- A payment now says what it is for:
--   TOKEN         the booking token paid online (Gmedic's money)
--   CONSULTATION  the doctor's fee (collected at the hospital)
-- An appointment can have one paid payment of each kind. Only the consultation fee being paid makes
-- the appointment "paid"; a paid token just confirms the booking.
ALTER TABLE payments ADD COLUMN purpose TEXT NOT NULL DEFAULT 'CONSULTATION' CHECK (purpose IN ('TOKEN', 'CONSULTATION'));

DROP INDEX IF EXISTS uq_payments_one_paid;
CREATE UNIQUE INDEX uq_payments_one_paid ON payments (appointment_id, purpose) WHERE status = 'PAID';

DROP TRIGGER IF EXISTS trg_payment_sets_appt_ins;
CREATE TRIGGER trg_payment_sets_appt_ins AFTER INSERT ON payments WHEN NEW.status = 'PAID' AND NEW.purpose = 'CONSULTATION' BEGIN
  UPDATE appointments SET payment_status = 'paid' WHERE id = NEW.appointment_id AND payment_status <> 'paid';
END;

DROP TRIGGER IF EXISTS trg_payment_sets_appt_upd;
CREATE TRIGGER trg_payment_sets_appt_upd AFTER UPDATE OF status ON payments WHEN NEW.status = 'PAID' AND NEW.purpose = 'CONSULTATION' BEGIN
  UPDATE appointments SET payment_status = 'paid' WHERE id = NEW.appointment_id AND payment_status <> 'paid';
END;

-- The token amount (rupees), one value for every hospital.
INSERT INTO platform_settings (setting_key, value) VALUES ('booking_token_amount', '5')
  ON CONFLICT (setting_key) DO NOTHING;

-- Every hospital is on the token model; per-hospital booking fees and convenience fees no longer apply.
UPDATE hospitals SET booking_model = 'TOKEN', convenience_fee = 0,
       booking_fee = (SELECT CAST(value AS REAL) FROM platform_settings WHERE setting_key = 'booking_token_amount');

-- hospitals.booking_fee mirrors the platform token (Platform Settings updates every hospital when it
-- changes). A new hospital starts on the token model with the current token (the column default is still
-- FULL_PREPAY), and its first rate-history row records that, read back from the row itself.
DROP TRIGGER IF EXISTS trg_hospital_rate_history_ins;
CREATE TRIGGER trg_hospital_rate_history_ins AFTER INSERT ON hospitals BEGIN
  UPDATE hospitals SET booking_model = 'TOKEN', convenience_fee = 0,
         booking_fee = COALESCE((SELECT CAST(value AS REAL) FROM platform_settings WHERE setting_key = 'booking_token_amount'), 5)
   WHERE id = NEW.id;
  INSERT INTO hospital_rate_history (hospital_id, booking_model, booking_fee, convenience_fee, commission_type, commission_value)
  SELECT id, booking_model, booking_fee, convenience_fee, commission_type, commission_value FROM hospitals WHERE id = NEW.id;
END;

-- The guard from migration 015 only has to stop a *live* token (waiting / called / in consultation /
-- skipped) for an appointment that is over. A completed token is the record of a finished visit, so it
-- may exist for a completed appointment (the demo data import writes those).
DROP TRIGGER IF EXISTS trg_guard_token_closed_appt;
CREATE TRIGGER trg_guard_token_closed_appt BEFORE INSERT ON tokens
WHEN NEW.status NOT IN ('cancelled', 'completed')
 AND (SELECT status FROM appointments WHERE id = NEW.appointment_id) IN ('completed', 'cancelled') BEGIN
  SELECT RAISE(ABORT, 'a completed or cancelled appointment cannot get a token');
END;
