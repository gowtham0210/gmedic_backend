-- A new hospital's booking policy starts from the platform defaults (Platform Settings: booking window and
-- cancellation cutoff) instead of fixed numbers, so the setting screen and the policy a hospital gets agree.
DROP TRIGGER trg_hospital_policy_ins;
CREATE TRIGGER trg_hospital_policy_ins AFTER INSERT ON hospitals BEGIN
  INSERT INTO hospital_policies (hospital_id, cancellation_window_hours, refund_percent, booking_window_days)
  VALUES (
    NEW.id,
    MAX(0, COALESCE((SELECT CAST(value AS INTEGER) FROM platform_settings WHERE setting_key = 'cancellation_cutoff_hours'), 4)),
    100,
    MAX(1, COALESCE((SELECT CAST(value AS INTEGER) FROM platform_settings WHERE setting_key = 'booking_window_days'), 7))
  );
END;
