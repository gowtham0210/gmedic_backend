-- Centralised support (Doctor / Receptionist / Patient raise tickets, Super Admin
-- manages them as a conversation) and the notification system (templates ->
-- service -> notifications + delivery log). support_tickets and
-- notification_templates are rebuilt because their CHECK constraints and shape
-- change; existing rows are carried across.

CREATE TABLE support_tickets_new (
  id              TEXT PRIMARY KEY,
  ticket_number   TEXT NOT NULL,
  created_by      TEXT,
  created_by_role TEXT NOT NULL CHECK (created_by_role IN ('PATIENT','DOCTOR','RECEPTIONIST','ADMIN')),
  hospital_id     TEXT REFERENCES hospitals (id),
  patient_id      TEXT REFERENCES patients (id),
  appointment_id  TEXT,
  category        TEXT NOT NULL CHECK (category IN ('APPOINTMENT','PAYMENT','REFUND','HOSPITAL','DOCTOR','ACCOUNT','QR','SCHEDULE','TECHNICAL','OTHER')),
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','URGENT')),
  status          TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  assigned_to     TEXT REFERENCES users (id),
  sla_due_at      TEXT NOT NULL,
  resolved_at     TEXT,
  closed_at       TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO support_tickets_new (id, ticket_number, created_by, created_by_role, hospital_id, patient_id, appointment_id, category, subject, description, priority, status, assigned_to, sla_due_at, resolved_at, created_at, updated_at)
  SELECT t.id, 'SUP-' || (1000 + CAST(substr(t.id, 4) AS INTEGER)), t.created_by,
         CASE (SELECT u.role FROM users u WHERE u.id = t.created_by) WHEN 'DOCTOR' THEN 'DOCTOR' WHEN 'RECEPTIONIST' THEN 'RECEPTIONIST' ELSE 'ADMIN' END,
         t.hospital_id, t.patient_id, t.appointment_id,
         CASE t.category WHEN 'BOOKING' THEN 'APPOINTMENT' ELSE t.category END,
         t.subject, t.description, t.priority, t.status, t.assigned_to, t.sla_due_at, t.resolved_at, t.created_at, t.updated_at
  FROM support_tickets t;

DROP TABLE support_tickets;
ALTER TABLE support_tickets_new RENAME TO support_tickets;
CREATE UNIQUE INDEX uq_tickets_number ON support_tickets (ticket_number);
CREATE INDEX ix_tickets_status ON support_tickets (status, priority);
CREATE INDEX ix_tickets_hospital ON support_tickets (hospital_id);
CREATE INDEX ix_tickets_assignee ON support_tickets (assigned_to);
CREATE INDEX ix_tickets_creator ON support_tickets (created_by);
CREATE TRIGGER trg_tickets_updated AFTER UPDATE ON support_tickets BEGIN
  UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE support_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id   TEXT NOT NULL REFERENCES support_tickets (id) ON DELETE CASCADE,
  sender_id   TEXT,
  sender_role TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_support_messages_ticket ON support_messages (ticket_id, id);

INSERT INTO support_messages (ticket_id, sender_id, sender_role, sender_name, message, created_at)
  SELECT t.id, t.created_by, t.created_by_role, COALESCE((SELECT u.name FROM users u WHERE u.id = t.created_by), 'User'), t.description, t.created_at
  FROM support_tickets t;

DROP TABLE notification_templates;
CREATE TABLE notification_templates (
  id         TEXT PRIMARY KEY,
  event_key  TEXT NOT NULL,
  name       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  channels   TEXT NOT NULL DEFAULT '["IN_APP"]',
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_template_event ON notification_templates (event_key);
CREATE TRIGGER trg_templates_updated AFTER UPDATE ON notification_templates BEGIN
  UPDATE notification_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users (id),
  event_key  TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_notifications_user ON notifications (user_id, read_at, id);

CREATE TABLE notification_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key         TEXT NOT NULL,
  recipient_user_id TEXT,
  recipient_role    TEXT,
  channel           TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('DELIVERED','SKIPPED','FAILED','UNAVAILABLE')),
  failure_reason    TEXT,
  notification_id   INTEGER,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_notification_logs_time ON notification_logs (id);
CREATE INDEX ix_notification_logs_event ON notification_logs (event_key);
