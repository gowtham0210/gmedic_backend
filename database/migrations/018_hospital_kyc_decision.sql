-- The KYC decision's reason (required for a rejection), who made it and when, kept on the hospital
-- so the detail page can show it. Before this the reason only existed in the audit log.
ALTER TABLE hospitals ADD COLUMN kyc_reason TEXT;
ALTER TABLE hospitals ADD COLUMN kyc_decided_by TEXT REFERENCES users (id);
ALTER TABLE hospitals ADD COLUMN kyc_decided_at TEXT;
