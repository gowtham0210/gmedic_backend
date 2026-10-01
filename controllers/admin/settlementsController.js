const db = require('../../db');
const { badRequest, notFound } = require('../../utils/http');
const { isISODate } = require('../../utils/dates');
const auditLog = require('../../services/auditLog');

function fromRow(row) {
  return {
    id: row.id, hospitalId: row.hospital_id, hospitalName: row.hospital_name,
    periodStart: row.period_start, periodEnd: row.period_end,
    grossCollection: Number(row.gross_collection), refundsAmount: Number(row.refunds_amount),
    commissionAmount: Number(row.commission_amount), convenienceFees: Number(row.convenience_fees),
    netPayout: Number(row.net_payout), payoutDate: row.payout_date, payoutReference: row.payout_reference,
    status: row.status, createdAt: db.iso(row.created_at),
  };
}

exports.list = async (req, res) => {
  const { hospitalId, status, page = 1, pageSize = 20 } = req.query;
  const clauses = [];
  const params = [];
  if (hospitalId) { clauses.push('s.hospital_id = ?'); params.push(hospitalId); }
  if (status) { clauses.push('s.status = ?'); params.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM settlements s ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(
    `SELECT s.*, h.name AS hospital_name FROM settlements s JOIN hospitals h ON h.id = s.hospital_id ${where} ORDER BY s.period_end DESC LIMIT ? OFFSET ?`,
    [...params, size, (cur - 1) * size]
  );
  res.json({ items: rows.map(fromRow), total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) });
};

// Computes gross collection, refunds and commission for a hospital over a
// period from the real payments/refunds tables, then stores the result as a
// settlement report ready for payout.
exports.generate = async (req, res) => {
  const { hospitalId, periodStart, periodEnd } = req.body || {};
  if (!hospitalId) throw badRequest('Choose a hospital.', { hospitalId: 'Choose a hospital.' });
  if (!isISODate(periodStart) || !isISODate(periodEnd) || periodStart > periodEnd) throw badRequest('Choose a valid date range.');
  const hospital = await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId]);
  if (!hospital) throw badRequest('Choose a valid hospital.', { hospitalId: 'Choose a valid hospital.' });
  const existing = await db.one('SELECT id FROM settlements WHERE hospital_id = ? AND period_start = ? AND period_end = ?', [hospitalId, periodStart, periodEnd]);
  if (existing) throw badRequest('A settlement for this hospital and period already exists.');

  const gross = (await db.one(
    `SELECT COALESCE(SUM(pay.amount),0) AS n FROM payments pay JOIN appointments a ON a.id = pay.appointment_id
     WHERE a.hospital_id = ? AND pay.status = 'PAID' AND DATE(pay.paid_at) BETWEEN ? AND ?`,
    [hospitalId, periodStart, periodEnd]
  )).n;
  const refunded = (await db.one(
    `SELECT COALESCE(SUM(r.amount),0) AS n FROM refunds r JOIN appointments a ON a.id = r.appointment_id
     WHERE a.hospital_id = ? AND r.status = 'COMPLETED' AND DATE(r.completed_at) BETWEEN ? AND ?`,
    [hospitalId, periodStart, periodEnd]
  )).n;
  const grossCollection = Number(gross);
  const refundsAmount = Number(refunded);
  const commission = hospital.commission_type === 'PERCENT' ? grossCollection * (Number(hospital.commission_value) / 100) : Number(hospital.commission_value);
  const convenienceFees = 0;
  const netPayout = Math.max(0, grossCollection - refundsAmount - commission - convenienceFees);

  const id = await db.nextId('settlements', 'STL', 1);
  await db.query(
    `INSERT INTO settlements (id, hospital_id, period_start, period_end, gross_collection, refunds_amount, commission_amount, convenience_fees, net_payout, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
    [id, hospitalId, periodStart, periodEnd, grossCollection, refundsAmount, commission, convenienceFees, netPayout]
  );
  await auditLog.record({ req, action: 'SETTLEMENT_GENERATED', entityType: 'SETTLEMENT', entityId: id, summary: `Generated settlement for ${hospital.name} (${periodStart} to ${periodEnd}): net payout ₹${netPayout.toFixed(2)}` });
  res.status(201).json({ ok: true, message: 'Settlement report generated.', id });
};

exports.markPaid = async (req, res) => {
  const settlement = await db.one('SELECT * FROM settlements WHERE id = ?', [req.params.id]);
  if (!settlement) throw notFound('Settlement not found.');
  if (settlement.status === 'PAID') throw badRequest('This settlement is already paid.');
  const { payoutReference } = req.body || {};
  if (!String(payoutReference || '').trim()) throw badRequest('A payout reference is required.', { payoutReference: 'Enter a reference.' });
  await db.query("UPDATE settlements SET status = 'PAID', payout_date = date('now'), payout_reference = ? WHERE id = ?", [payoutReference, req.params.id]);
  await auditLog.record({ req, action: 'SETTLEMENT_PAID', entityType: 'SETTLEMENT', entityId: req.params.id, summary: `Settlement ${req.params.id} marked paid, ref ${payoutReference}` });
  res.json({ ok: true, message: 'Settlement marked as paid.' });
};
