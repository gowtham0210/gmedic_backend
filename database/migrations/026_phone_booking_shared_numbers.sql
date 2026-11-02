-- Front-desk bookings record how they came in: at the desk ("Walk-in") or on the phone ("Phone").
-- And a patient who shares a family member's mobile number can be registered as their own person (without a
-- number of their own) pointing at the patient whose number it is: patients.contact_patient_id.
DROP TRIGGER trg_guard_appt_source_ins;
CREATE TRIGGER trg_guard_appt_source_ins BEFORE INSERT ON appointments
WHEN NEW.source NOT IN ('Gmedic App', 'Walk-in', 'Phone') BEGIN
  SELECT RAISE(ABORT, 'appointment.source must be Gmedic App, Walk-in or Phone');
END;

ALTER TABLE patients ADD COLUMN contact_patient_id TEXT REFERENCES patients (id);
CREATE INDEX ix_patients_contact ON patients (contact_patient_id);
