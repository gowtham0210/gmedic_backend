const db = require('../../db');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const notifications = require('../../services/notificationService');

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

const SELECT = `
  SELECT r.*, a.hospital_id, a.patient_id, h.name AS hospital_name, p.name AS patient_name, pay.transaction_id
  FROM refunds r
  JOIN appointments a ON a.id = r.appointment_id
  JOIN hospitals h ON h.id = a.hospital_id
  LEFT JOIN patients p ON p.id = a.patient_id
  JOIN payments pay ON pay.id = r.payment_id`;

function fromRow(row) {
  return {
    id: row.id, paymentId: row.payment_id, appointmentId: row.appointment_id, transactionId: row.transaction_id,
    hospitalId: row.hospital_id, hospitalName: row.hospital_name, patientName: row.patient_name,
    amount: Number(row.amount), reason: row.reason, status: row.status, requiresChecker: !!row.requires_checker,
    decisionNote: row.decision_note, createdAt: db.iso(row.created_at),
  };
}

exports.list = async (req, res) => {
  const { hospitalId, status, page = 1, pageSize = 15 } = req.query;
  const clauses = [];
  const params = [];
  if (hospitalId) { clauses.push('a.hospital_id = ?'); params.push(hospitalId); }
  if (status) { clauses.push('r.status = ?'); params.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM refunds r JOIN appointments a ON a.id = r.appointment_id ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 15, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(`${SELECT} ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [...params, size, (cur - 1) * size]);
  res.json({ items: rows.map(fromRow), total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) });
};

exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    appointmentId: { label: 'Appointment', required: true },
    amount: { label: 'Amount', type: 'number', required: true, min: 1, max: 100000 },
    reason: { label: 'Reason', required: true, minLength: 5, maxLength: 255 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);

  const appt = await db.one("SELECT a.*, pay.id AS payment_id, pay.amount AS paid_amount FROM appointments a JOIN payments pay ON pay.appointment_id = a.id AND pay.status='PAID' WHERE a.id = ?", [value.appointmentId]);
  if (!appt) throw badRequest('No paid payment was found for this appointment.', { appointmentId: 'No paid payment found.' });
  // Scopes a receptionist to their own hospital's appointments; req.hospitalId
  // is only set for receptionist-scoped requests (Super Admin can no longer
  // request refunds — only approve/reject them, see decide() below).
  if (req.hospitalId && appt.hospital_id !== req.hospitalId) throw notFound('Appointment not found.');
  if (value.amount > Number(appt.paid_amount)) throw badRequest(`Amount cannot exceed the paid amount (₹${appt.paid_amount}).`, { amount: 'Exceeds the paid amount.' });

  const alreadyRefunded = Number((await db.one("SELECT COALESCE(SUM(amount), 0) AS n FROM refunds WHERE payment_id = ? AND status <> 'REJECTED'", [appt.payment_id])).n);
  const refundable = Number(appt.paid_amount) - alreadyRefunded;
  if (value.amount > refundable) throw badRequest(`Only ₹${refundable} is still refundable on this payment.`, { amount: `Only ₹${refundable} left to refund.` });

  const threshold = Number((await db.one("SELECT value FROM platform_settings WHERE setting_key = 'refund_maker_checker_threshold'"))?.value ?? 2000);
  const requiresChecker = value.amount > threshold;
  const id = await db.nextId('refunds', 'REF', 1);
  await db.query(
    `INSERT INTO refunds (id, payment_id, appointment_id, amount, reason, status, requires_checker, requested_by)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [id, appt.payment_id, appt.id, value.amount, value.reason, requiresChecker ? 1 : 0, req.user.id]
  );
  await auditLog.record({ req, action: 'REFUND_REQUESTED', entityType: 'REFUND', entityId: id, summary: `Requested refund of ₹${value.amount} for ${value.appointmentId}: ${value.reason}` });
  const info = await db.one('SELECT p.name AS patient_name, h.name AS hospital_name FROM appointments a JOIN hospitals h ON h.id = a.hospital_id LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [appt.id]);
  await notifications.trigger('REFUND_REQUESTED', await notifications.adminUsers(['SUPER_ADMIN', 'FINANCE']), {
    refund_id: id, refund_amount: inr(value.amount), patient_name: info.patient_name, hospital_name: info.hospital_name, appointment_id: appt.id, requested_by: req.user.name,
  }, { link: '/admin/refunds' });
  res.status(201).json({ ok: true, message: requiresChecker ? 'Refund requested — needs a second approver (above the auto-approval threshold).' : 'Refund requested.', id });
};

exports.decide = async (req, res) => {
  const refund = await db.one('SELECT * FROM refunds WHERE id = ?', [req.params.id]);
  if (!refund) throw notFound('Refund not found.');
  if (refund.status !== 'PENDING') throw badRequest('This refund has already been decided.');
  const { decision, note } = req.body || {};
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw badRequest('Choose Approve or Reject.');
  // Maker-checker: above the threshold, the requester cannot also be the approver.
  if (refund.requires_checker && refund.requested_by === req.user.id) {
    throw badRequest('This refund is above the auto-approval threshold and needs approval from a different admin than the one who requested it.');
  }

  const nextStatus = decision === 'APPROVED' ? 'PROCESSING' : 'REJECTED';
  await db.query('UPDATE refunds SET status = ?, decision_note = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?', [nextStatus, note || null, req.user.id, req.params.id]);
  if (decision === 'APPROVED') {
    // No live payment gateway is connected — this simulates the payout completing immediately.
    await db.query("UPDATE refunds SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP WHERE id = ?", [req.params.id]);
  }
  await auditLog.record({ req, action: `REFUND_${decision}`, entityType: 'REFUND', entityId: req.params.id, summary: `Refund ${req.params.id}: ${decision.toLowerCase()}${note ? ` (${note})` : ''}`, previousValue: { status: 'PENDING' }, newValue: { status: decision } });
  const info = await db.one('SELECT p.name AS patient_name FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [refund.appointment_id]);
  await notifications.trigger(decision === 'APPROVED' ? 'REFUND_APPROVED' : 'REFUND_REJECTED', refund.requested_by, {
    refund_id: refund.id, refund_amount: inr(refund.amount), patient_name: info && info.patient_name, appointment_id: refund.appointment_id, decision_note: note || '',
  }, { link: '/payments' });
  res.json({ ok: true, message: `Refund ${decision === 'APPROVED' ? 'approved and processed' : 'rejected'}.` });
};
