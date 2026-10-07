-- A new hospital starts with its first rate-history row and a default policy row,
-- exactly like the hospitals that existed when those tables were introduced.
CREATE TRIGGER trg_hospital_rate_history_ins AFTER INSERT ON hospitals BEGIN
  INSERT INTO hospital_rate_history (hospital_id, booking_model, booking_fee, convenience_fee, commission_type, commission_value)
  VALUES (NEW.id, NEW.booking_model, NEW.booking_fee, NEW.convenience_fee, NEW.commission_type, NEW.commission_value);
END;
CREATE TRIGGER trg_hospital_policy_ins AFTER INSERT ON hospitals BEGIN
  INSERT INTO hospital_policies (hospital_id) VALUES (NEW.id);
END;
