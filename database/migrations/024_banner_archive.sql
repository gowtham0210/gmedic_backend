-- Banners can be archived (kept for the record, out of the way) as well as scheduled with a start and an end.
-- SQLite can't change a CHECK, so the table is rebuilt. Nothing references banners.
CREATE TABLE banners_new (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  cta_label  TEXT,
  cta_url    TEXT,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT,
  status     TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  created_by TEXT REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);
INSERT INTO banners_new (id, title, message, cta_label, cta_url, starts_at, ends_at, status, created_by, created_at, updated_at)
SELECT id, title, message, cta_label, cta_url, starts_at, CASE WHEN ends_at IS NOT NULL AND ends_at > starts_at THEN ends_at END, status, created_by, created_at, updated_at FROM banners;
DROP TABLE banners;
ALTER TABLE banners_new RENAME TO banners;
CREATE INDEX ix_banners_live ON banners (status, starts_at, ends_at);
CREATE TRIGGER trg_banners_updated AFTER UPDATE ON banners BEGIN
  UPDATE banners SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
