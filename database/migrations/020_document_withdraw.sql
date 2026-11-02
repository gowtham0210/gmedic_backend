-- A KYC document uploaded by mistake can be withdrawn. It is never deleted (the file stays for audit);
-- it just stops counting towards KYC. SQLite can't change a CHECK, so the table is rebuilt.
CREATE TABLE hospital_documents_new (
  id               TEXT PRIMARY KEY,
  hospital_id      TEXT NOT NULL REFERENCES hospitals (id),
  doc_type         TEXT NOT NULL CHECK (doc_type IN ('LICENCE','BANK_PROOF','GST_CERTIFICATE','REGISTRATION')),
  file_name        TEXT NOT NULL,
  storage_path     TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  size_bytes       INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED','WITHDRAWN')),
  rejection_reason TEXT,
  reviewed_by      TEXT REFERENCES users (id),
  reviewed_at      TEXT,
  uploaded_by      TEXT,
  withdrawn_reason TEXT,
  withdrawn_by     TEXT REFERENCES users (id),
  withdrawn_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO hospital_documents_new (id, hospital_id, doc_type, file_name, storage_path, mime_type, size_bytes, status, rejection_reason, reviewed_by, reviewed_at, uploaded_by, created_at, updated_at)
SELECT id, hospital_id, doc_type, file_name, storage_path, mime_type, size_bytes, status, rejection_reason, reviewed_by, reviewed_at, uploaded_by, created_at, updated_at FROM hospital_documents;
DROP TABLE hospital_documents;
ALTER TABLE hospital_documents_new RENAME TO hospital_documents;
CREATE INDEX ix_docs_hospital ON hospital_documents (hospital_id, doc_type);
CREATE INDEX ix_docs_status ON hospital_documents (status);
CREATE TRIGGER trg_docs_updated AFTER UPDATE ON hospital_documents BEGIN
  UPDATE hospital_documents SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
