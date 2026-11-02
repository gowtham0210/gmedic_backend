// Re-checks every deliberately denormalised column against its source of truth,
// so drift is caught even if a trigger was bypassed (bulk import, a migration
// that disabled triggers, replication). Run: npm run db:verify  (exit 1 on drift)
const db = require('./index');

const CHECKS = [
  ['appointments.hospital_id = doctor.hospital_id',
    'SELECT a.id FROM appointments a JOIN doctors d ON d.id = a.doctor_id WHERE a.hospital_id <> d.hospital_id'],
  ['appointments.payment_status = payments (paid iff a PAID consultation fee exists; the booking token does not count)',
    `SELECT a.id FROM appointments a WHERE (a.payment_status = 'paid') <> EXISTS (SELECT 1 FROM payments p WHERE p.appointment_id = a.id AND p.status = 'PAID' AND p.purpose = 'CONSULTATION')`],
  ['tokens.doctor_id / hospital_id / token_date = appointment',
    'SELECT t.id FROM tokens t JOIN appointments a ON a.id = t.appointment_id WHERE t.doctor_id <> a.doctor_id OR t.hospital_id <> a.hospital_id OR t.token_date <> a.appt_date'],
  ['refunds.appointment_id = payment.appointment_id',
    'SELECT r.id FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE r.appointment_id <> p.appointment_id'],
  ['refunds total <= payment amount',
    `SELECT r.payment_id FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE r.status <> 'REJECTED' GROUP BY r.payment_id HAVING SUM(r.amount) > MAX(p.amount)`],
  ['disputes.transaction_id = payment.transaction_id',
    'SELECT d.id FROM disputes d JOIN payments p ON p.id = d.payment_id WHERE d.transaction_id <> p.transaction_id'],
  ['doctor login hospital = doctor hospital',
    'SELECT u.id FROM users u JOIN doctors d ON d.id = u.doctor_id WHERE u.hospital_id IS NOT d.hospital_id'],
  ['qr_codes branch belongs to hospital',
    'SELECT q.id FROM qr_codes q JOIN hospital_branches b ON b.id = q.branch_id WHERE q.hospital_id <> b.hospital_id'],
  ['doctors branch belongs to hospital',
    'SELECT d.id FROM doctors d JOIN hospital_branches b ON b.id = d.branch_id WHERE d.hospital_id <> b.hospital_id'],
  ['patient_hospital_links.account_user_id = patient account',
    'SELECT l.patient_id FROM patient_hospital_links l JOIN patients p ON p.id = l.patient_id WHERE l.account_user_id IS NOT NULL AND l.account_user_id IS NOT p.account_user_id'],
  ['payments consultation + convenience + tax = amount',
    'SELECT id FROM payments WHERE consultation_amount IS NOT NULL AND ABS(consultation_amount + convenience_fee + tax_amount - amount) > 0.005'],
  ['settlements net = gross - refunds - commission - fees',
    'SELECT id FROM settlements WHERE net_payout > 0 AND ABS(net_payout - (gross_collection - refunds_amount - commission_amount - convenience_fees)) > 0.01'],
  ['auto settlements: line items add up to gross',
    `SELECT s.id FROM settlements s WHERE s.auto_generated = 1
       AND ABS(s.gross_collection - COALESCE((SELECT SUM(amount) FROM settlement_items WHERE settlement_id = s.id AND item_type = 'PAYMENT'), 0)) > 0.01`],
  ['hospitals current rates = latest rate-history row',
    `SELECT h.id FROM hospitals h WHERE NOT EXISTS (SELECT 1 FROM hospital_rate_history r WHERE r.hospital_id = h.id
       AND r.id = (SELECT id FROM hospital_rate_history WHERE hospital_id = h.id ORDER BY effective_from DESC, id DESC LIMIT 1)
       AND r.commission_type = h.commission_type AND r.commission_value = h.commission_value AND r.booking_fee IS h.booking_fee AND r.convenience_fee IS h.convenience_fee)`],
  ['settlement periods do not overlap per hospital',
    'SELECT a.id FROM settlements a JOIN settlements b ON a.hospital_id = b.hospital_id AND a.id < b.id AND a.period_start <= b.period_end AND b.period_start <= a.period_end'],
  ['settlement refunds / gross match their line items (all settlements with items)',
    `SELECT s.id FROM settlements s WHERE EXISTS (SELECT 1 FROM settlement_items i WHERE i.settlement_id = s.id)
       AND ABS(s.refunds_amount - COALESCE((SELECT SUM(amount) FROM settlement_items WHERE settlement_id = s.id AND item_type = 'REFUND'), 0)) > 0.01`],
  ['appointment seats unique per slot',
    `SELECT doctor_id FROM appointments WHERE status <> 'cancelled' GROUP BY doctor_id, appt_date, appt_time, seat_no HAVING COUNT(*) > 1`],
];

async function main() {
  let bad = 0;
  for (const [label, sql] of CHECKS) {
    const rows = await db.query(sql);
    console.log(`${rows.length ? 'FAIL' : ' ok '}  ${label}${rows.length ? `  (${rows.length}: ${rows.slice(0, 5).map((r) => Object.values(r)[0]).join(', ')})` : ''}`);
    if (rows.length) bad += 1;
  }
  const fk = await db.query('PRAGMA foreign_key_check');
  console.log(`${fk.length ? 'FAIL' : ' ok '}  foreign keys`);
  if (fk.length) bad += 1;
  console.log(bad ? `\n${bad} check(s) failed.` : '\nAll integrity checks passed.');
  process.exit(bad ? 1 : 0);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
