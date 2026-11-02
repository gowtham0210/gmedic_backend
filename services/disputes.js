// Payment disputes (chargebacks). A dispute is raised against one PAID payment, either from a gateway
// chargeback event (services/webhookProcessor.js) or by an admin recording a complaint
// (POST /api/admin/disputes). Deciding it is in controllers/admin/disputesController.js.

const db = require('../db');
const { badRequest } = require('../utils/http');
const auditLog = require('./auditLog');

const ACTIVE = ['OPEN', 'UNDER_REVIEW'];

// Finds the PAID payment a reference points at: a payment id (PAY…), a transaction id (TXN…) or an appointment id (APT…).
async function findPaidPayment(reference) {
  const ref = String(reference || '').trim();
  if (!ref) return null;
  return db.one(
    `SELECT pay.*, a.hospital_id, p.name AS patient_name, h.name AS hospital_name
     FROM payments pay JOIN appointments a ON a.id = pay.appointment_id JOIN hospitals h ON h.id = a.hospital_id LEFT JOIN patients p ON p.id = a.patient_id
     WHERE pay.status = 'PAID' AND (UPPER(pay.id) = UPPER(?) OR UPPER(pay.transaction_id) = UPPER(?) OR UPPER(pay.appointment_id) = UPPER(?))
     ORDER BY pay.id DESC LIMIT 1`,
    [ref, ref, ref]
  );
}

// Raises a dispute. `amount` defaults to the whole payment; it can't be more. One live dispute per payment.
async function open({ req, payment, amount, reason, source = 'ADMIN' }) {
  const text = String(reason || '').trim();
  if (text.length < 5 || text.length > 255) throw badRequest('Describe the dispute in 5 to 255 characters.', { reason: 'Enter 5 to 255 characters.' });
  const value = amount === undefined || amount === null || amount === '' ? Number(payment.amount) : Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw badRequest('Enter a disputed amount above zero.', { amount: 'Enter an amount above zero.' });
  if (value > Number(payment.amount)) throw badRequest(`The disputed amount can't be more than the payment (₹${payment.amount}).`, { amount: `At most ₹${payment.amount}.` });
  const existing = await db.one(`SELECT id FROM disputes WHERE payment_id = ? AND status IN ('OPEN', 'UNDER_REVIEW')`, [payment.id]);
  if (existing) throw badRequest(`This payment already has an open dispute (${existing.id}).`, { reference: `Already disputed: ${existing.id}.` });
  const id = await db.nextId('disputes', 'DSP', 1001);
  await db.query(
    `INSERT INTO disputes (id, payment_id, transaction_id, amount, currency, reason, status) VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`,
    [id, payment.id, payment.transaction_id, value, payment.currency || 'INR', text]
  );
  await auditLog.record({
    req, action: 'DISPUTE_RAISED', entityType: 'DISPUTE', entityId: id,
    summary: `Dispute ${id} raised on ${payment.id} (${payment.hospital_name || ''}, ₹${value}) via ${source === 'GATEWAY' ? 'the payment gateway' : 'admin'}: ${text}`,
    newValue: { paymentId: payment.id, amount: value, source },
  });
  return id;
}

module.exports = { open, findPaidPayment, ACTIVE };
