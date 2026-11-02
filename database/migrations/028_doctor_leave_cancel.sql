-- A leave is withdrawn, never deleted (attendance history): cancelled_at / cancelled_by mark it, and
-- every reader skips cancelled leaves. The overlap guards ignore cancelled leaves too, so a doctor can
-- add a new leave over dates they withdrew.
ALTER TABLE doctor_leaves ADD COLUMN cancelled_at TEXT;
ALTER TABLE doctor_leaves ADD COLUMN cancelled_by TEXT REFERENCES users (id);

DROP TRIGGER IF EXISTS trg_guard_leave_overlap_ins;
CREATE TRIGGER trg_guard_leave_overlap_ins BEFORE INSERT ON doctor_leaves
WHEN NEW.cancelled_at IS NULL AND EXISTS (SELECT 1 FROM doctor_leaves l WHERE l.doctor_id = NEW.doctor_id AND l.cancelled_at IS NULL AND l.start_date <= NEW.end_date AND NEW.start_date <= l.end_date) BEGIN
  SELECT RAISE(ABORT, 'leave overlaps an existing leave for this doctor');
END;

DROP TRIGGER IF EXISTS trg_guard_leave_overlap_upd;
CREATE TRIGGER trg_guard_leave_overlap_upd BEFORE UPDATE OF doctor_id, start_date, end_date ON doctor_leaves
WHEN NEW.cancelled_at IS NULL AND EXISTS (SELECT 1 FROM doctor_leaves l WHERE l.id <> NEW.id AND l.doctor_id = NEW.doctor_id AND l.cancelled_at IS NULL AND l.start_date <= NEW.end_date AND NEW.start_date <= l.end_date) BEGIN
  SELECT RAISE(ABORT, 'leave overlaps an existing leave for this doctor');
END;

-- The front desk is told when a doctor adds, changes or withdraws leave (config/notificationEvents.js).
INSERT INTO notification_templates (id, event_key, name, title, body)
SELECT 'TPL' || (COALESCE(MAX(CAST(substr(id, 4) AS INTEGER)), 0) + 1), 'DOCTOR_LEAVE_CHANGED', 'Doctor Leave Changed', 'Doctor Leave',
       'Dr. {{doctor_name}}: {{leave_change}} ({{leave_dates}}). {{booked_summary}}'
  FROM notification_templates
 WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE event_key = 'DOCTOR_LEAVE_CHANGED');
