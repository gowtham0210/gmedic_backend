// Builds settlement statements from real paid appointments.
//   gross      = PAID payments in the period (by paid date) for the hospital
//   refunds    = COMPLETED refunds in the period
//   commission = the hospital's rule (Hospitals → Fee & Commission):
//                PERCENT → % of gross, FLAT → fixed amount per paid appointment
//   net payout = gross − refunds − commission
const db = require('../db');
const auditLog = require('./auditLog');

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);

function weeksBetween(firstDate, today) {
  // Monday–Sunday weeks that have fully ended before `today`.
  const first = new Date(`${firstDate}T00:00:00Z`);
  const start = new Date(first.getTime() - ((first.getUTCDay() + 6) % 7) * DAY);
  const out = [];
  for (let s = start; new Date(s.getTime() + 6 * DAY) < new Date(`${today}T00:00:00Z`); s = new Date(s.getTime() + 7 * DAY)) {
    out.push([iso(s), iso(new Date(s.getTime() + 6 * DAY))]);
  }
  return out;
}

async function figures(hospital, periodStart, periodEnd) {
  const gross = await db.one(
    `SELECT COALESCE(SUM(pay.amount),0) AS amount, COUNT(*) AS n FROM payments pay JOIN appointments a ON a.id = pay.appointment_id
     WHERE a.hospital_id = ? AND pay.status = 'PAID' AND DATE(pay.paid_at) BETWEEN ? AND ?`,
    [hospital.id, periodStart, periodEnd]
  );
  const refunded = await db.one(
    `SELECT COALESCE(SUM(r.amount),0) AS amount FROM refunds r JOIN appointments a ON a.id = r.appointment_id
     WHERE a.hospital_id = ? AND r.status = 'COMPLETED' AND DATE(r.completed_at) BETWEEN ? AND ?`,
    [hospital.id, periodStart, periodEnd]
  );
  const grossCollection = Number(gross.amount);
  const count = Number(gross.n);
  const refundsAmount = Number(refunded.amount);
  const raw = hospital.commission_type === 'PERCENT' ? grossCollection * (Number(hospital.commission_value) / 100) : Number(hospital.commission_value) * count;
  const commission = Math.round(raw * 100) / 100;
  const netPayout = Math.max(0, grossCollection - refundsAmount - commission);
  return { grossCollection, count, refundsAmount, commission, netPayout };
}

async function create(hospital, periodStart, periodEnd, { req, auto }) {
  const f = await figures(hospital, periodStart, periodEnd);
  const id = await db.nextId('settlements', 'STL', 1);
  // The statement points at the rate row that was in force, so the payout can be reproduced later.
  const rate = await db.one('SELECT id FROM hospital_rate_history WHERE hospital_id = ? ORDER BY effective_from DESC, id DESC LIMIT 1', [hospital.id]);
  await db.query(
    `INSERT INTO settlements (id, hospital_id, period_start, period_end, currency, gross_collection, refunds_amount, commission_amount, convenience_fees, net_payout,
       status, appointments_count, commission_type, commission_value, rate_history_id, auto_generated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDING', ?, ?, ?, ?, ?)`,
    [id, hospital.id, periodStart, periodEnd, hospital.currency || 'INR', f.grossCollection, f.refundsAmount, f.commission, f.netPayout, f.count, hospital.commission_type, hospital.commission_value, rate ? rate.id : null, auto ? 1 : 0]
  );
  await auditLog.record({
    req, action: auto ? 'SETTLEMENT_AUTO_GENERATED' : 'SETTLEMENT_GENERATED', entityType: 'SETTLEMENT', entityId: id,
    summary: `${auto ? 'Auto-generated' : 'Generated'} settlement for ${hospital.name} (${periodStart} to ${periodEnd}): ${f.count} appointments, commission ₹${f.commission.toFixed(2)}, net payout ₹${f.netPayout.toFixed(2)}`,
  });
  // Line items: exactly which payments and refunds make up this statement.
  await db.query(
    `INSERT OR IGNORE INTO settlement_items (settlement_id, item_type, payment_id, amount, currency)
     SELECT ?, 'PAYMENT', pay.id, pay.amount, pay.currency FROM payments pay JOIN appointments a ON a.id = pay.appointment_id
     WHERE a.hospital_id = ? AND pay.status = 'PAID' AND DATE(pay.paid_at) BETWEEN ? AND ?`,
    [id, hospital.id, periodStart, periodEnd]
  );
  await db.query(
    `INSERT OR IGNORE INTO settlement_items (settlement_id, item_type, refund_id, amount, currency)
     SELECT ?, 'REFUND', r.id, r.amount, r.currency FROM refunds r JOIN appointments a ON a.id = r.appointment_id
     WHERE a.hospital_id = ? AND r.status = 'COMPLETED' AND DATE(r.completed_at) BETWEEN ? AND ?`,
    [id, hospital.id, periodStart, periodEnd]
  );
  return id;
}

// Creates any missing weekly settlement for every hospital. Idempotent (the
// unique period index and the existence check make a re-run a no-op), and
// weeks with no money movement are skipped.
let running = null;
async function generateDue({ req } = {}) {
  if (running) return running;
  running = (async () => {
    const today = iso(new Date());
    let created = 0;
    for (const hospital of await db.query('SELECT * FROM hospitals')) {
      const first = await db.one(
        `SELECT MIN(DATE(pay.paid_at)) AS d FROM payments pay JOIN appointments a ON a.id = pay.appointment_id WHERE a.hospital_id = ? AND pay.status = 'PAID'`,
        [hospital.id]
      );
      if (!first || !first.d) continue;
      for (const [s, e] of weeksBetween(first.d, today)) {
        // Skip a week that any existing statement (auto or custom) already overlaps, so money is never settled twice.
        if (await db.one('SELECT id FROM settlements WHERE hospital_id = ? AND period_start <= ? AND period_end >= ?', [hospital.id, e, s])) continue;
        const f = await figures(hospital, s, e);
        if (!f.count && !f.refundsAmount) continue;
        await create(hospital, s, e, { req, auto: true });
        created += 1;
      }
    }
    return created;
  })().finally(() => { running = null; });
  return running;
}

module.exports = { generateDue, create, figures };
