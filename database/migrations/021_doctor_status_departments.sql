-- Doctors can be deactivated (left the hospital) instead of only "rejected", and departments belong
-- to one hospital and can be archived.
ALTER TABLE doctors ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE'));
ALTER TABLE doctors ADD COLUMN status_reason TEXT;
ALTER TABLE doctors ADD COLUMN status_changed_at TEXT;
ALTER TABLE departments ADD COLUMN archived_at TEXT;

-- The admin doctor edit used to file doctors under platform-wide departments (hospital_id NULL), which
-- the patient app never lists. Give each such doctor their own hospital's department of that name.
INSERT OR IGNORE INTO departments (hospital_id, name)
SELECT DISTINCT d.hospital_id, dep.name FROM doctors d JOIN departments dep ON dep.id = d.department_id WHERE dep.hospital_id IS NULL;
UPDATE doctors SET department_id = (
  SELECT h.id FROM departments p JOIN departments h ON h.name = p.name AND h.hospital_id = doctors.hospital_id
  WHERE p.id = doctors.department_id)
WHERE department_id IN (SELECT id FROM departments WHERE hospital_id IS NULL);
DELETE FROM departments WHERE hospital_id IS NULL AND id NOT IN (SELECT department_id FROM doctors WHERE department_id IS NOT NULL);
