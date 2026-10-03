-- Doctor-editable profile fields that didn't exist yet (the Doctor Portal's
-- "My Profile" page lets a doctor edit these themselves; specialization, fee,
-- registration number and qualifications stay admin/receptionist-managed).
ALTER TABLE doctors ADD COLUMN bio TEXT;
ALTER TABLE doctors ADD COLUMN years_experience INTEGER;
ALTER TABLE doctors ADD COLUMN languages TEXT;
