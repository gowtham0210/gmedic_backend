const db = require('../db');
const { contains } = require('../utils/like');

function fromRow(row) {
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    hospitalId: row.hospital_id,
    hospitalName: row.hospital_name,
    patientName: row.patient_name,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    specialization: row.specialization,
    date: row.appt_date,
    time: row.appt_time,
    fee: Number(row.amount),
    appointmentStatus: row.appt_status,
    paymentStatus: row.status, // PAID | FAILED | PENDING (uppercase, gateway-facing)
    // TOKEN: the booking token paid in the app (Gmedic's); CONSULTATION: the doctor's fee paid at the hospital.
    purpose: row.purpose || 'CONSULTATION',
    payment: row.status === 'PAID' ? { method: row.method, transactionId: row.transaction_id, paidAt: db.iso(row.paid_at), receiptNumber: row.receipt_number || null, gateway: row.gateway || null } : null,
    // Money already refunded or waiting to be (rejected requests don't count), and the state of the newest request.
    refunded: Number(row.refunded_amount || 0),
    refundStatus: row.latest_refund_status || null,
    createdAt: db.iso(row.created_at),
  };
}

const SELECT = `
  SELECT pay.*, a.hospital_id, a.patient_id, a.appt_date, a.appt_time, a.status AS appt_status, p.name AS patient_name, d.id AS doctor_id, d.name AS doctor_name, d.specialization, h.name AS hospital_name,
         (SELECT COALESCE(SUM(r.amount), 0) FROM refunds r WHERE r.payment_id = pay.id AND r.status <> 'REJECTED') AS refunded_amount,
         (SELECT r.status FROM refunds r WHERE r.payment_id = pay.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS latest_refund_status
  FROM payments pay
  JOIN appointments a ON a.id = pay.appointment_id
  JOIN doctors d ON d.id = a.doctor_id
  JOIN hospitals h ON h.id = a.hospital_id
  LEFT JOIN patients p ON p.id = a.patient_id`;

function buildAdminFilters({ hospitalId, from, to, doctorId, status, purpose, q }) {
  const clauses = [];
  const params = [];
  if (purpose === 'TOKEN' || purpose === 'CONSULTATION') { clauses.push('pay.purpose = ?'); params.push(purpose); }
  if (hospitalId) { clauses.push('a.hospital_id = ?'); params.push(hospitalId); }
  // The admin list is about money movement, so its dates are the payment's date (paid, or created if it never was).
  if (from) { clauses.push('DATE(COALESCE(pay.paid_at, pay.created_at)) >= ?'); params.push(from); }
  if (to) { clauses.push('DATE(COALESCE(pay.paid_at, pay.created_at)) <= ?'); params.push(to); }
  if (doctorId) { clauses.push('d.id = ?'); params.push(doctorId); }
  if (status) { clauses.push('pay.status = ?'); params.push(status.toUpperCase()); }
  if (q) { const like = contains(q); clauses.push(`(p.name LIKE ? ESCAPE '\\' OR pay.transaction_id LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\' OR pay.id LIKE ? ESCAPE '\\' OR pay.appointment_id LIKE ? ESCAPE '\\')`); params.push(like, like, like, like, like); }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// Receptionist: consultation fees for one hospital. `paymentStatus` is lowercase paid/pending, matching
// appointments.payment_status. Paid ones are the fees collected at the hospital; pending ones (including app
// bookings, whose booking token is Gmedic's and not listed here) are derived from the appointment itself.
async function forHospital(hospitalId, { from, to, doctorId, paymentStatus, q } = {}) {
  let paid = [];
  if (paymentStatus !== 'pending') {
    // Only payments that went through: a failed or pending attempt is not "paid".
    const clauses = ['a.hospital_id = ?', "pay.status = 'PAID'", "pay.purpose = 'CONSULTATION'"];
    const params = [hospitalId];
    if (from) { clauses.push('a.appt_date >= ?'); params.push(from); }
    if (to) { clauses.push('a.appt_date <= ?'); params.push(to); }
    if (doctorId) { clauses.push('d.id = ?'); params.push(doctorId); }
    if (q) { const like = contains(q); clauses.push(`(p.name LIKE ? ESCAPE '\\' OR pay.transaction_id LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\' OR pay.appointment_id LIKE ? ESCAPE '\\')`); params.push(like, like, like, like); }
    paid = (await db.query(`${SELECT} WHERE ${clauses.join(' AND ')}`, params)).map(fromRow);
  }

  let pending = [];
  if (paymentStatus !== 'paid') {
    const clauses = ["a.hospital_id = ?", "a.status <> 'cancelled'", "a.payment_status = 'pending'"];
    const params = [hospitalId];
    if (from) { clauses.push('a.appt_date >= ?'); params.push(from); }
    if (to) { clauses.push('a.appt_date <= ?'); params.push(to); }
    if (doctorId) { clauses.push('a.doctor_id = ?'); params.push(doctorId); }
    if (q) { const like = contains(q); clauses.push(`(p.name LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\' OR a.id LIKE ? ESCAPE '\\')`); params.push(like, like, like); }
    const rows = await db.query(
      `SELECT a.id AS appointment_id, a.hospital_id, a.patient_id, a.appt_date, a.appt_time, a.fee AS amount, a.status AS appt_status, p.name AS patient_name,
              d.id AS doctor_id, d.name AS doctor_name, d.specialization, h.name AS hospital_name,
              'PENDING' AS status, NULL AS method, NULL AS transaction_id, NULL AS paid_at, a.created_at, a.id AS id
       FROM appointments a JOIN doctors d ON d.id = a.doctor_id JOIN hospitals h ON h.id = a.hospital_id LEFT JOIN patients p ON p.id = a.patient_id
       WHERE ${clauses.join(' AND ')}`,
      params
    );
    pending = rows.map(fromRow);
  }

  return [...paid, ...pending].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
}

// Super Admin: platform-wide, transaction-centric (only real payment attempts:
// paid or failed; pending appointments have no gateway attempt yet).
async function adminSearch(filters = {}) {
  const { where, params } = buildAdminFilters(filters);
  const page = Math.max(Number(filters.page) || 1, 1);
  const size = Math.min(Math.max(Number(filters.pageSize) || 15, 1), 100);
  const total = (await db.one(`SELECT COUNT(*) AS n FROM payments pay JOIN appointments a ON a.id = pay.appointment_id JOIN doctors d ON d.id = a.doctor_id LEFT JOIN patients p ON p.id = a.patient_id ${where}`, params)).n;
  const rows = await db.query(`${SELECT} ${where} ORDER BY pay.created_at DESC LIMIT ? OFFSET ?`, [...params, size, (page - 1) * size]);
  const items = rows.map(fromRow);
  const totals = await db.one(
    `SELECT
       SUM(CASE WHEN pay.status='PAID' THEN pay.amount ELSE 0 END) AS collected,
       SUM(CASE WHEN pay.status='FAILED' THEN pay.amount ELSE 0 END) AS failedAmount,
       SUM(CASE WHEN pay.status='PAID' THEN 1 ELSE 0 END) AS paidCount,
       SUM(CASE WHEN pay.status='FAILED' THEN 1 ELSE 0 END) AS failedCount
     FROM payments pay JOIN appointments a ON a.id = pay.appointment_id JOIN doctors d ON d.id = a.doctor_id LEFT JOIN patients p ON p.id = a.patient_id ${where}`,
    params
  );
  return {
    items, total: Number(total), page, pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
    summary: {
      collected: Number(totals.collected) || 0,
      failedAmount: Number(totals.failedAmount) || 0,
      paidCount: Number(totals.paidCount) || 0,
      failedCount: Number(totals.failedCount) || 0,
    },
  };
}

// One payment with the money breakdown, for the admin detail view.
async function adminFindById(id) {
  const row = await db.one(`${SELECT} WHERE pay.id = ?`, [id]);
  if (!row) return null;
  return {
    ...fromRow(row), amount: Number(row.amount), consultationAmount: row.consultation_amount == null ? null : Number(row.consultation_amount),
    convenienceFee: Number(row.convenience_fee), taxAmount: Number(row.tax_amount), currency: row.currency, method: row.method,
    gateway: row.gateway, gatewayOrderId: row.gateway_order_id, gatewayStatus: row.gateway_status, transactionId: row.transaction_id,
    receiptNumber: row.receipt_number, failureReason: row.failure_reason, paidAt: db.iso(row.paid_at),
  };
}

module.exports = { forHospital, adminSearch, adminFindById, fromRow };
// (searches escape LIKE wildcards)
