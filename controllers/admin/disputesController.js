const db = require('../../db');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');

function fromRow(row) {
  return {
    id: row.id, paymentId: row.payment_id, transactionId: row.transaction_id, hospitalId: row.hospital_id,
    hospitalName: row.hospital_name, patientName: row.patient_name, amount: Number(row.amount), reason: row.reason,
    status: row.status, resolution: row.resolution, createdAt: db.iso(row.created_at),
  };
}

const SELECT = `
  SELECT d.*, a.hospital_id, a.patient_id, h.name AS hospital_name, p.name AS patient_name
  FROM disputes d
  JOIN payments pay ON pay.id = d.payment_id
  JOIN appointments a ON a.id = pay.appointment_id
  JOIN hospitals h ON h.id = a.hospital_id
  LEFT JOIN patients p ON p.id = a.patient_id`;

exports.list = async (req, res) => {
  const { status, hospitalId, page = 1, pageSize = 20 } = req.query;
  const clauses = [];
  const params = [];
  if (status) { clauses.push('d.status = ?'); params.push(status); }
  if (hospitalId) { clauses.push('a.hospital_id = ?'); params.push(hospitalId); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM disputes d JOIN payments pay ON pay.id = d.payment_id JOIN appointments a ON a.id = pay.appointment_id ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(`${SELECT} ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`, [...params, size, (cur - 1) * size]);
  res.json({ items: rows.map(fromRow), total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) });
};

exports.resolve = async (req, res) => {
  const dispute = await db.one('SELECT * FROM disputes WHERE id = ?', [req.params.id]);
  if (!dispute) throw notFound('Dispute not found.');
  if (dispute.status === 'RESOLVED' || dispute.status === 'REJECTED') throw badRequest('This dispute has already been decided.');
  const { status, resolution } = req.body || {};
  if (!['UNDER_REVIEW', 'RESOLVED', 'REJECTED'].includes(status)) throw badRequest('Choose a valid outcome.');
  if (status !== 'UNDER_REVIEW' && !String(resolution || '').trim()) throw badRequest('A resolution note is required.', { resolution: 'Enter a resolution.' });
  await db.query('UPDATE disputes SET status = ?, resolution = ? WHERE id = ?', [status, resolution || null, req.params.id]);
  await auditLog.record({ req, action: `DISPUTE_${status}`, entityType: 'DISPUTE', entityId: req.params.id, summary: `Dispute ${req.params.id}: ${dispute.status} → ${status}${resolution ? ` (${resolution})` : ''}` });
  res.json({ ok: true, message: `Dispute marked ${status.toLowerCase().replace('_', ' ')}.` });
};
