const db = require('../../db');
const { contains } = require('../../utils/like');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const notifications = require('../../services/notificationService');

const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;

const SELECT = `
  SELECT r.*, a.hospital_id, a.patient_id, h.name AS hospital_name, p.name AS patient_name, pay.transaction_id,
         ru.name AS requested_by_name, fu.name AS first_approver_name, au.name AS approved_by_name
  FROM refunds r
  JOIN appointments a ON a.id = r.appointment_id
  JOIN hospitals h ON h.id = a.hospital_id
  LEFT JOIN patients p ON p.id = a.patient_id
  JOIN payments pay ON pay.id = r.payment_id
  LEFT JOIN users ru ON ru.id = r.requested_by
  LEFT JOIN users fu ON fu.id = r.first_approved_by
  LEFT JOIN users au ON au.id = r.approved_by`;

function fromRow(row) {
  return {
    id: row.id, paymentId: row.payment_id, appointmentId: row.appointment_id, transactionId: row.transaction_id,
    hospitalId: row.hospital_id, hospitalName: row.hospital_name, patientName: row.patient_name,
    amount: Number(row.amount), reason: row.reason, status: row.status, requiresChecker: !!row.requires_checker,
    decisionNote: row.decision_note, createdAt: db.iso(row.created_at), disputeId: row.dispute_id || null,
    requestedBy: row.requested_by_name || null, requestedById: row.requested_by || null,
    // A refund above the threshold needs two different admins; below it, one.
    approvalsNeeded: row.requires_checker ? 2 : 1,
    approvalsGiven: row.status === 'COMPLETED' || row.status === 'APPROVED' || row.status === 'PROCESSING' ? (row.requires_checker && row.first_approved_by ? 2 : 1) : (row.first_approved_by ? 1 : 0),
    firstApprovedBy: row.first_approver_name || null, firstApprovedById: row.first_approved_by || null,
    decidedBy: row.approved_by_name || null, decidedAt: db.iso(row.approved_at),
  };
}

// GET /api/admin/refunds?hospitalId=&status=&q=   (q: refund, appointment, patient or transaction)
exports.list = async (req, res) => {
  const { status, q, page = 1, pageSize = 15 } = req.query;
  // A receptionist only ever sees their own hospital's refunds.
  const hospitalId = req.hospitalId || req.query.hospitalId;
  const clauses = [];
  const params = [];
  if (hospitalId) { clauses.push('a.hospital_id = ?'); params.push(hospitalId); }
  if (status) { clauses.push('r.status = ?'); params.push(status); }
  if (q) {
    clauses.push(`(r.id LIKE ? ESCAPE '\\' OR r.appointment_id LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR pay.transaction_id LIKE ? ESCAPE '\\')`);
    const like = contains(q);
    params.push(like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM refunds r JOIN appointments a ON a.id = r.appointment_id LEFT JOIN patients p ON p.id = a.patient_id JOIN payments pay ON pay.id = r.payment_id ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 15, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(`${SELECT} ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [...params, size, (cur - 1) * size]);
  // A hospital sees its own requests and what became of them, not who in admin approved them.
  const forHospital = (r) => ({ id: r.id, appointmentId: r.appointmentId, patientName: r.patientName, amount: r.amount, reason: r.reason, status: r.status, decisionNote: r.decisionNote, createdAt: r.createdAt, disputeId: r.disputeId, awaitingSecondApproval: r.requiresChecker && r.approvalsGiven < 2 && r.status === 'PENDING' });
  const items = rows.map(fromRow);
  res.json(req.hospitalId
    ? { items: items.map(forHospital), total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) }
    : { items, total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)), me: req.user.id });
};

exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    appointmentId: { label: 'Appointment', required: true },
    amount: { label: 'Amount', type: 'number', required: true, min: 1, max: 100000 },
    reason: { label: 'Reason', required: true, minLength: 5, maxLength: 255 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);

  if (Math.abs(value.amount * 100 - Math.round(value.amount * 100)) > 1e-6) throw badRequest('Enter the amount in rupees and paise (at most 2 decimals).', { amount: 'At most 2 decimals.' });
  const appt = await db.one("SELECT a.*, pay.id AS payment_id, pay.amount AS paid_amount, pay.gateway AS pay_gateway, pay.purpose AS pay_purpose FROM appointments a JOIN payments pay ON pay.appointment_id = a.id AND pay.status='PAID' WHERE a.id = ? ORDER BY pay.purpose = 'TOKEN' DESC LIMIT 1", [value.appointmentId]);
  if (!appt) throw badRequest('No paid payment was found for this appointment.', { appointmentId: 'No paid payment found.' });
  if (appt.pay_purpose === 'TOKEN') throw badRequest('The booking token is never refunded.', { appointmentId: 'Booking tokens are non-refundable.' });
  if (appt.pay_gateway === 'FRONT_DESK') throw badRequest('This fee was collected at the front desk, so it never reached Gmedic. The hospital returns it to the patient itself.', { appointmentId: 'Collected at the desk: refund it at the desk.' });
  // Scopes a receptionist to their own hospital's appointments; req.hospitalId is only set for
  // receptionist-scoped requests. An admin (POST /api/admin/refunds, refunds.manage) can raise one on any
  // appointment, e.g. to clean up after an offboarded hospital; it then goes through the same approval.
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
  res.status(201).json({ ok: true, message: requiresChecker ? 'Refund requested. It is above the auto-approval threshold, so two other admins must approve it.' : 'Refund requested.', id });
};

// POST /api/admin/refunds/:id/decision { decision: APPROVED | REJECTED, note }
// Rejecting needs a note (the requester is told why). Above the maker-checker threshold a refund needs two
// approvals from two different admins, neither of them the requester; the first leaves it PENDING.
// Every update is conditional on the refund still being PENDING, so two admins acting at once can't both win.
exports.decide = async (req, res) => {
  const refund = await db.one('SELECT * FROM refunds WHERE id = ?', [req.params.id]);
  if (!refund) throw notFound('Refund not found.');
  if (refund.status !== 'PENDING') throw badRequest('This refund has already been decided.');
  const { decision } = req.body || {};
  const note = String((req.body && req.body.note) || '').trim().slice(0, 300);
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw badRequest('Choose Approve or Reject.');
  if (decision === 'REJECTED' && note.length < 3) throw badRequest('Say why this refund is rejected: the requester is shown the reason.', { note: 'Enter a reason for rejecting.' });

  let message;
  let finished = true;
  if (decision === 'REJECTED') {
    const done = await db.query("UPDATE refunds SET status = 'REJECTED', decision_note = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'", [note, req.user.id, refund.id]);
    if (!done.affectedRows) throw badRequest('This refund has already been decided.');
    message = 'Refund rejected.';
  } else {
    if (refund.requires_checker && refund.requested_by === req.user.id) {
      throw badRequest('This refund is above the auto-approval threshold and needs approval from other admins than the one who requested it.');
    }
    if (refund.requires_checker && !refund.first_approved_by) {
      // First of two approvals: recorded, but nothing is paid yet.
      const first = await db.query("UPDATE refunds SET first_approved_by = ?, first_approved_at = CURRENT_TIMESTAMP, decision_note = COALESCE(NULLIF(?, ''), decision_note) WHERE id = ? AND status = 'PENDING' AND first_approved_by IS NULL", [req.user.id, note, refund.id]);
      if (!first.affectedRows) throw badRequest('This refund has already been approved once. Refresh to see its state.');
      finished = false;
      message = 'First approval recorded. A different admin must give the second approval before the refund is paid.';
    } else {
      if (refund.requires_checker && refund.first_approved_by === req.user.id) throw badRequest('You gave the first approval. A different admin must give the second.');
      // No live payment gateway is connected, so the payout is simulated as completing at once.
      const done = await db.query(
        "UPDATE refunds SET status = 'COMPLETED', decision_note = COALESCE(NULLIF(?, ''), decision_note), approved_by = ?, approved_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'",
        [note, req.user.id, refund.id]
      );
      if (!done.affectedRows) throw badRequest('This refund has already been decided.');
      message = 'Refund approved and processed.';
    }
  }
  await auditLog.record({
    req, action: finished ? `REFUND_${decision}` : 'REFUND_FIRST_APPROVAL', entityType: 'REFUND', entityId: refund.id,
    summary: `Refund ${refund.id}: ${finished ? decision.toLowerCase() : 'first approval'}${note ? ` (${note})` : ''}`, previousValue: { status: 'PENDING' }, newValue: { status: finished ? decision : 'PENDING', note },
  });
  if (finished && refund.requested_by) {
    const info = await db.one('SELECT p.name AS patient_name FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id WHERE a.id = ?', [refund.appointment_id]);
    await notifications.trigger(decision === 'APPROVED' ? 'REFUND_APPROVED' : 'REFUND_REJECTED', refund.requested_by, {
      refund_id: refund.id, refund_amount: inr(refund.amount), patient_name: info && info.patient_name, appointment_id: refund.appointment_id, decision_note: note,
    }, { link: '/payments' });
  }
  res.json({ ok: true, message, finished });
};
