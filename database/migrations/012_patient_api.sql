-- Patient-facing API (the Gmedic patient app): patient accounts, OTP login, richer hospital /
-- doctor catalogue fields, idempotent payments, token numbers and reschedule counting.

-- --------------------------------------------------------------- patient accounts
-- users.role gains PATIENT (a SQLite CHECK cannot be altered, so the table is rebuilt).
PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id                   TEXT PRIMARY KEY,
  role                 TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','FINANCE','SUPPORT','OPERATIONS','RECEPTIONIST','DOCTOR','PATIENT')),
  hospital_id          TEXT REFERENCES hospitals (id),
  doctor_id            TEXT,
  name                 TEXT NOT NULL,
  username             TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  password_hash        TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING_APPROVAL','ACTIVE','INACTIVE','REJECTED')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  session_version      INTEGER NOT NULL DEFAULT 1,
  approved_by          TEXT REFERENCES users_new (id),
  approved_at          TEXT,
  last_login_at        TEXT,
  password_changed_at  TEXT,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (doctor_id IS NULL OR hospital_id IS NOT NULL),
  FOREIGN KEY (doctor_id, hospital_id) REFERENCES doctors (id, hospital_id)
);
INSERT INTO users_new (id, role, hospital_id, doctor_id, name, username, email, phone, password_hash, status, must_change_password, session_version,
    approved_by, approved_at, last_login_at, password_changed_at, created_at, updated_at)
  SELECT id, role, hospital_id, doctor_id, name, username, email, phone, password_hash, status, must_change_password, session_version,
    approved_by, approved_at, last_login_at, password_changed_at, created_at, updated_at FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;
CREATE UNIQUE INDEX uq_users_email ON users (email);
CREATE UNIQUE INDEX uq_users_username ON users (username);
CREATE UNIQUE INDEX uq_users_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX uq_users_doctor ON users (doctor_id) WHERE doctor_id IS NOT NULL;
CREATE INDEX ix_users_role_status ON users (role, status);
CREATE INDEX ix_users_hospital ON users (hospital_id);
CREATE TRIGGER trg_users_updated AFTER UPDATE ON users BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

PRAGMA foreign_keys = ON;

-- One-time passcodes for the patient app (only a hash of the code is kept).
CREATE TABLE otp_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  phone      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_otp_phone ON otp_codes (phone, id);

-- ------------------------------------------------ hospital / department / doctor catalogue
ALTER TABLE hospitals ADD COLUMN kind TEXT;
ALTER TABLE hospitals ADD COLUMN area TEXT;
ALTER TABLE hospitals ADD COLUMN lat REAL;
ALTER TABLE hospitals ADD COLUMN lng REAL;
ALTER TABLE hospitals ADD COLUMN brand_color INTEGER;
ALTER TABLE hospitals ADD COLUMN initials TEXT;
ALTER TABLE hospitals ADD COLUMN about TEXT;

ALTER TABLE departments ADD COLUMN icon TEXT;
ALTER TABLE doctors ADD COLUMN gender TEXT CHECK (gender IS NULL OR gender IN ('MALE','FEMALE','OTHER'));

-- -------------------------------------------------------------- booking / payment details
ALTER TABLE appointments ADD COLUMN token_no INTEGER;
ALTER TABLE appointments ADD COLUMN reschedule_count INTEGER NOT NULL DEFAULT 0 CHECK (reschedule_count >= 0);
-- The same key never charges twice (the patient app retries safely).
ALTER TABLE payments ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX uq_payments_idem ON payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
