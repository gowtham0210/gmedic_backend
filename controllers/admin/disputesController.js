const db = require('../../db');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const disputes = require('../../services/disputes');

function fromRow(row) {
  return {
    id: row.id, paymentId: row.payment_id, transactionId: row.transaction_id, hospitalId: row.hospital_id,
    hospitalName: row.hospital_name, patientName: row.patient_name, appointmentId: row.appointment_id, amount: Number(row.amount), reason: row.reason,
    status: row.status, resolution: row.resolution, createdAt: db.iso(row.created_at),
    paymentAmount: Number(row.payment_amount), paymentPurpose: row.payment_purpose,
    refundable: row.payment_purpose === 'TOKEN' ? 0 : Math.max(0, Number(row.payment_amount) - Number(row.refunded || 0)),
    decidedBy: row.decided_by_name || null, decidedAt: db.iso(row.decided_at),
    refundId: row.refund_id || null, refundAmount: row.refund_amount == null ? null : Number(row.refund_amount),
  };
}

const SELECT = `
  SELECT d.*, a.id AS appointment_id, a.hospital_id, a.patient_id, h.name AS hospital_name, p.name AS patient_name,
         pay.amount AS payment_amount, pay.purpose AS payment_purpose, u.name AS decided_by_name,
         (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r WHERE r.payment_id = d.payment_id AND r.status <> 'REJECTED') AS refunded,
         (SELECT r.id FROM refunds r WHERE r.dispute_id = d.id AND r.status <> 'REJECTED') AS refund_id,
         (SELECT r.amount FROM refunds r WHERE r.dispute_id = d.id AND r.status <> 'REJECTED') AS refund_amount
  FROM disputes d
  LEFT JOIN users u ON u.id = d.decided_by
  JOIN payments pay ON pay.id = d.payment_id
  JOIN appointments a ON a.id = pay.appointment_id
  JOIN hospitals h ON h.id = a.hospital_id
  LEFT JOIN patients p ON p.id = a.patient_id`;

exports.list = async (req, res) => {
  const { status, hospitalId, q, page = 1, pageSize = 20 } = req.query;
  const clauses = [];
  const params = [];
  if (status) { clauses.push('d.status = ?'); params.push(status); }
  if (hospitalId) { clauses.push('a.hospital_id = ?'); params.push(hospitalId); }
  if (q) {
    clauses.push('(d.id LIKE ? OR d.payment_id LIKE ? OR d.transaction_id LIKE ? OR a.id LIKE ? OR p.name LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM disputes d JOIN payments pay ON pay.id = d.payment_id JOIN appointments a ON a.id = pay.appointment_id LEFT JOIN patients p ON p.id = a.patient_id ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(`${SELECT} ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`, [...params, size, (cur - 1) * size]);
  res.json({ items: rows.map(fromRow), total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)), refundThreshold: await refundThreshold() });
};

async function refundThreshold() {
  const row = await db.one("SELECT value FROM platform_settings WHERE setting_key = 'refund_maker_checker_threshold'");
  const n = Number(row && row.value);
  return Number.isFinite(n) ? n : 2000;
}

// POST /api/admin/disputes { reference, amount?, reason }
// `reference` is a payment id, transaction id or appointment id. Gateway chargebacks arrive through the
// webhook inbox instead; this is for an admin recording a dispute (a patient complaint, a bank notice).
exports.create = async (req, res) => {
  const reference = String((req.body && req.body.reference) || '').trim();
  if (!reference) throw badRequest('Enter a payment, transaction or appointment ID.', { reference: 'Enter an ID.' });
  const payment = await disputes.findPaidPayment(reference);
  if (!payment) throw badRequest('No paid payment matches that ID.', { reference: 'No paid payment found for this ID.' });
  const id = await disputes.open({ req, payment, amount: req.body.amount, reason: req.body.reason, source: 'ADMIN' });
  res.status(201).json({ ok: true, message: `Dispute ${id} raised.`, id });
};

// POST /api/admin/disputes/:id/resolve { status: UNDER_REVIEW | RESOLVED | REJECTED, resolution }
// RESOLVED means in the patient's favour. A booking token is never refunded, so for one nothing moves; for any
// other payment a refund of the disputed amount (as much of it as is still refundable on the payment) is created.
// Up to the maker-checker threshold the decision itself is the approval and the
// refund is completed at once; above it the refund is created PENDING for two other admins to approve on the
// Refunds page, so a dispute can't be used to get around that rule. REJECTED changes no money.
exports.resolve = async (req, res) => {
  const dispute = await db.one(`${SELECT} WHERE d.id = ?`, [req.params.id]);
  if (!dispute) throw notFound('Dispute not found.');
  if (dispute.status === 'RESOLVED' || dispute.status === 'REJECTED') throw badRequest('This dispute has already been decided.');
  const { status } = req.body || {};
  const resolution = String((req.body && req.body.resolution) || '').trim().slice(0, 500);
  if (!['UNDER_REVIEW', 'RESOLVED', 'REJECTED'].includes(status)) throw badRequest('Choose a valid outcome.');
  if (status !== 'UNDER_REVIEW' && !resolution) throw badRequest('A resolution note is required.', { resolution: 'Enter a resolution.' });
  if (status === 'UNDER_REVIEW' && dispute.status === 'UNDER_REVIEW') return res.json({ ok: true, message: 'Already under review.' });

  const final = status !== 'UNDER_REVIEW';
  if (status === 'RESOLVED') {
    // A refund already waiting for approval on this payment would be counted against the dispute's refund.
    const waiting = await db.one("SELECT id FROM refunds WHERE payment_id = ? AND status = 'PENDING' AND dispute_id IS NULL", [dispute.payment_id]);
    if (waiting) throw badRequest(`Refund ${waiting.id} on this payment is still waiting for approval. Approve or reject it on the Refunds page first, so the patient isn't refunded twice.`);
  }
  const threshold = await refundThreshold();
  let refund = null;
  await db.tx(async (conn) => {
    // Guarded so two admins deciding at once can't both create a refund.
    const done = await conn.query(
      `UPDATE disputes SET status = ?, resolution = ?, decided_by = ?, decided_at = ${final ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ? AND status IN ('OPEN', 'UNDER_REVIEW')`,
      [status, resolution || null, final ? req.user.id : null, dispute.id]
    );
    if (!done.affectedRows) throw badRequest('This dispute has already been decided.');
    if (status !== 'RESOLVED') return;
    // A booking token is never refunded, even when a dispute about it is decided in the patient's favour.
    const paid = await conn.one('SELECT purpose FROM payments WHERE id = ?', [dispute.payment_id]);
    if (paid && paid.purpose === 'TOKEN') return;
    const row = await conn.one("SELECT COALESCE(SUM(amount), 0) AS n FROM refunds WHERE payment_id = ? AND status <> 'REJECTED'", [dispute.payment_id]);
    const amount = Math.min(Number(dispute.amount), Number(dispute.payment_amount) - Number(row.n));
    if (amount <= 0) return;
    const id = await db.nextId('refunds', 'REF', 1, conn);
    const needsChecker = amount > threshold;
    const reason = `Dispute ${dispute.id} decided in the patient's favour`.slice(0, 255);
    if (needsChecker) {
      await conn.query(
        `INSERT INTO refunds (id, payment_id, appointment_id, amount, currency, reason, status, requires_checker, requested_by, dispute_id, decision_note)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 1, ?, ?, ?)`,
        [id, dispute.payment_id, dispute.appointment_id, amount, dispute.currency || 'INR', reason, req.user.id, dispute.id, resolution]
      );
    } else {
      await conn.query(
        `INSERT INTO refunds (id, payment_id, appointment_id, amount, currency, reason, status, requires_checker, requested_by, approved_by, approved_at, completed_at, dispute_id, decision_note)
         VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)`,
        [id, dispute.payment_id, dispute.appointment_id, amount, dispute.currency || 'INR', reason, req.user.id, req.user.id, dispute.id, resolution]
      );
    }
    refund = { id, amount, pending: needsChecker };
  });

  await auditLog.record({
    req, action: `DISPUTE_${status}`, entityType: 'DISPUTE', entityId: dispute.id,
    summary: `Dispute ${dispute.id}: ${dispute.status} → ${status}${resolution ? ` (${resolution})` : ''}${refund ? `; refund ${refund.id} of ₹${refund.amount} created` : ''}`,
    previousValue: { status: dispute.status }, newValue: { status, refundId: refund && refund.id, refundAmount: refund && refund.amount },
  });
  let message = `Dispute marked ${status.toLowerCase().replace('_', ' ')}.`;
  if (status === 'RESOLVED') {
    message = refund
      ? (refund.pending
        ? `Dispute resolved in the patient's favour. Refund ${refund.id} of ₹${refund.amount.toLocaleString('en-IN')} is above the ₹${threshold.toLocaleString('en-IN')} approval threshold, so two other admins must approve it on the Refunds page before it is paid.`
        : `Dispute resolved in the patient's favour. Refund ${refund.id} of ₹${refund.amount.toLocaleString('en-IN')} was recorded.`)
      : (dispute.payment_purpose === 'TOKEN'
        ? 'Dispute resolved in the patient\'s favour. The booking token is non-refundable, so no refund was made.'
        : 'Dispute resolved in the patient\'s favour. Nothing more was refunded, because this payment has already been refunded in full.');
  }
  res.json({ ok: true, message, refund });
};

exports.listNotes = async (req, res) => {
  const dispute = await db.one('SELECT id FROM disputes WHERE id = ?', [req.params.id]);
  if (!dispute) throw notFound('Dispute not found.');
  const rows = await db.query("SELECT * FROM internal_notes WHERE entity_type = 'DISPUTE' AND entity_id = ? ORDER BY id", [req.params.id]);
  res.json({ notes: rows.map((n) => ({ id: n.id, userName: n.user_name, note: n.note, createdAt: db.iso(n.created_at) })) });
};

exports.addNote = async (req, res) => {
  const dispute = await db.one('SELECT id FROM disputes WHERE id = ?', [req.params.id]);
  if (!dispute) throw notFound('Dispute not found.');
  const note = String((req.body && req.body.note) || '').trim();
  if (note.length < 2 || note.length > 1000) throw badRequest('Write an internal note (up to 1000 characters).', { note: 'Enter a note.' });
  await db.query("INSERT INTO internal_notes (entity_type, entity_id, user_id, user_name, note) VALUES ('DISPUTE', ?, ?, ?, ?)", [req.params.id, req.user.id, req.user.name, note]);
  await auditLog.record({ req, action: 'DISPUTE_NOTE_ADDED', entityType: 'DISPUTE', entityId: req.params.id, summary: `Internal note added to ${req.params.id}` });
  res.status(201).json({ ok: true, message: 'Note added.' });
};
