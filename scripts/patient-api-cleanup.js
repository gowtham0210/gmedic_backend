// Removes everything the patient API smoke test created (the test patient 9000000001 and what it booked).
// Usage: node scripts/patient-api-cleanup.js [phone|all]   (all = every patient-app account; use on a test database only)
const db = require('../db');

(async () => {
  const phone = process.argv[2] || '9000000001';
  const users = process.argv[2] === 'all'
    ? await db.query("SELECT id FROM users WHERE role = 'PATIENT'")
    : await db.query("SELECT id FROM users WHERE role = 'PATIENT' AND (phone = ? OR email LIKE ?)", [phone, `%${phone}%`]);
  for (const { id } of users) {
    const appts = (await db.query('SELECT id FROM appointments WHERE booked_by_user_id = ?', [id])).map((r) => r.id);
    const ph = appts.map(() => '?').join(',') || "''";
    await db.query(`DELETE FROM settlement_items WHERE payment_id IN (SELECT id FROM payments WHERE appointment_id IN (${ph})) OR refund_id IN (SELECT id FROM refunds WHERE appointment_id IN (${ph}))`, [...appts, ...appts]);
    await db.query(`DELETE FROM refunds WHERE appointment_id IN (${ph})`, appts);
    await db.query(`DELETE FROM slot_holds WHERE appointment_id IN (${ph}) OR patient_id IN (SELECT id FROM patients WHERE account_user_id = ?)`, [...appts, id]);
    await db.query(`DELETE FROM payments WHERE appointment_id IN (${ph})`, appts);
    await db.query(`DELETE FROM appointments WHERE id IN (${ph})`, appts);
    await db.query('DELETE FROM qr_scans WHERE account_user_id = ?', [id]);
    await db.query('DELETE FROM patient_hospital_links WHERE account_user_id = ?', [id]);
    await db.query('DELETE FROM patients WHERE account_user_id = ? AND id NOT IN (SELECT patient_id FROM appointments)', [id]);
    await db.query("DELETE FROM patient_hospital_links WHERE patient_id IN (SELECT id FROM patients WHERE name = 'Deleted patient')");
    await db.query("DELETE FROM slot_holds WHERE patient_id IN (SELECT id FROM patients WHERE name = 'Deleted patient')");
    await db.query("DELETE FROM patients WHERE name = 'Deleted patient' AND id NOT IN (SELECT patient_id FROM appointments)");
    // family members the app removed are kept detached; the smoke test names them "Little ..."
    await db.query("DELETE FROM slot_holds WHERE patient_id IN (SELECT id FROM patients WHERE account_user_id IS NULL AND name LIKE 'Little%')");
    await db.query("DELETE FROM patients WHERE account_user_id IS NULL AND name LIKE 'Little%' AND id NOT IN (SELECT patient_id FROM appointments)");
    await db.query('DELETE FROM notification_logs WHERE recipient_user_id = ?', [id]);
    await db.query('DELETE FROM notifications WHERE user_id = ?', [id]);
    await db.query('DELETE FROM sessions WHERE user_id = ?', [id]);
    await db.query('DELETE FROM users WHERE id = ?', [id]);
  }
  await db.query('DELETE FROM otp_codes WHERE phone = ?', [phone]);
  // notifications the test sent to hospital staff
  await db.query("DELETE FROM notifications WHERE event_key IN ('NEW_APPOINTMENT','APPOINTMENT_CANCELLED','APPOINTMENT_RESCHEDULED','PAYMENT_SUCCESS','APPOINTMENT_CONFIRMED') AND created_at >= datetime('now', '-1 day')");
  await db.query('DELETE FROM slot_holds WHERE status IN (\'RELEASED\',\'EXPIRED\')');
  console.log(`removed ${users.length} test patient(s)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
