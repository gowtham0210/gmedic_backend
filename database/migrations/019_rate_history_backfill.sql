-- Hospitals created before the rate-history triggers have no history row, so a settlement can't look
-- up the rate that was in force. Seed one per such hospital with its current rates, from its creation.
INSERT INTO hospital_rate_history (hospital_id, booking_model, booking_fee, convenience_fee, commission_type, commission_value, effective_from)
SELECT h.id, h.booking_model, h.booking_fee, h.convenience_fee, h.commission_type, h.commission_value, h.created_at
  FROM hospitals h
 WHERE NOT EXISTS (SELECT 1 FROM hospital_rate_history r WHERE r.hospital_id = h.id);
