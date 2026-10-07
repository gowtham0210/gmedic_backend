-- Who booked an appointment in the patient app: the account holder, even when the visit is for a
-- family member. Walk-in and imported appointments leave it empty.
ALTER TABLE appointments ADD COLUMN booked_by_user_id TEXT REFERENCES users (id);
CREATE INDEX ix_appts_booked_by ON appointments (booked_by_user_id, appt_date);
