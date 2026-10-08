-- Standardise QR code IDs to QR-<hospital>-<NN>, numbered per hospital in
-- creation order (e.g. QR-HSP001-01). Replaces the mixed QRHSP001 / QR1 / QR2 forms.
--
-- Safe for printed codes: posters and links encode <hospitalId>?k=<qr_key>, never
-- the row id. References updated here (every FK to qr_codes, per
-- pragma_foreign_key_list): qr_scans.qr_code_id, patient_hospital_links.qr_code_id,
-- qr_codes.replaced_by.
-- audit_logs is append-only (trigger-enforced), so old entries keep the old ids and
-- one new entry records the full old -> new mapping.

PRAGMA foreign_keys = OFF;

CREATE TEMP TABLE qr_id_map AS
  SELECT id AS old_id,
         'QR-' || hospital_id || '-' || printf('%02d', ROW_NUMBER() OVER (PARTITION BY hospital_id ORDER BY created_at, id)) AS new_id
    FROM qr_codes
   WHERE id NOT GLOB 'QR-*-[0-9]*';

-- Keep each code's real updated_at: pause the touch trigger during the rename.
DROP TRIGGER IF EXISTS trg_qr_updated;

UPDATE qr_scans SET qr_code_id = (SELECT new_id FROM qr_id_map WHERE old_id = qr_scans.qr_code_id)
 WHERE qr_code_id IN (SELECT old_id FROM qr_id_map);

UPDATE patient_hospital_links SET qr_code_id = (SELECT new_id FROM qr_id_map WHERE old_id = patient_hospital_links.qr_code_id)
 WHERE qr_code_id IN (SELECT old_id FROM qr_id_map);

UPDATE qr_codes SET replaced_by = (SELECT new_id FROM qr_id_map WHERE old_id = qr_codes.replaced_by)
 WHERE replaced_by IN (SELECT old_id FROM qr_id_map);

UPDATE qr_codes SET id = (SELECT new_id FROM qr_id_map WHERE old_id = qr_codes.id)
 WHERE id IN (SELECT old_id FROM qr_id_map);

CREATE TRIGGER trg_qr_updated AFTER UPDATE ON qr_codes BEGIN
  UPDATE qr_codes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

INSERT INTO audit_logs (user_id, user_name, role, action, entity_type, entity_id, summary, previous_value, new_value, created_at)
SELECT NULL, 'System', 'SYSTEM', 'QR_IDS_STANDARDISED', 'QR_CODE', NULL,
       'QR code ids standardised: ' || group_concat(old_id || ' → ' || new_id, ', '),
       json_group_array(old_id), json_group_array(new_id),
       strftime('%Y-%m-%d %H:%M:%f', 'now')
  FROM (SELECT old_id, new_id FROM qr_id_map ORDER BY new_id)
HAVING COUNT(*) > 0;

DROP TABLE qr_id_map;

PRAGMA foreign_keys = ON;
