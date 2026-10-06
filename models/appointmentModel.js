// Appointments are booked by patients in the Gmedic app; the receptionist
// portal reads them and can update status; Super Admin can additionally
// cancel/reschedule any appointment platform-wide (with a required reason).

const db = require('../db');

const STATUSES = ['confirmed', 'pending', 'completed', 'cancelled'];
const PAYMENT_STATUSES = ['paid', 'pending'];

const SELECT = `
  SELECT a.*, d.name AS doctor_name, d.specialization, (SELECT name FROM departments WHERE id = d.department_id) AS department, h.name AS hospital_name, b.name AS branch_name,
         p.mobile AS patient_mobile, p.name AS patient_name,
         (SELECT t.code FROM tokens t WHERE t.appointment_id = a.id AND t.status <> 'cancelled' ORDER BY t.id DESC LIMIT 1) AS token_code,
         (SELECT pay2.transaction_id FROM payments pay2 WHERE pay2.appointment_id = a.id ORDER BY pay2.created_at DESC LIMIT 1) AS transaction_id
  FROM appointments a
  JOIN doctors d ON d.id = a.doctor_id
  JOIN hospitals h ON h.id = a.hospital_id
  LEFT JOIN hospital_branches b ON b.id = a.branch_id
  LEFT JOIN patients p ON p.id = a.patient_id`;

function fromRow(row) {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    hospitalName: row.hospital_name,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    specialization: row.specialization,
    department: row.department,
    branchName: row.branch_name,
    tokenCode: row.token_code,
    transactionId: row.transaction_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientMobile: row.patient_mobile,
    date: row.appt_date,
    time: row.appt_time,
    fee: Number(row.fee),
    status: row.status,
    paymentStatus: row.payment_status,
    source: row.source,
    cancelReason: row.cancel_reason,
    createdAt: db.iso(row.created_at),
    updatedAt: db.iso(row.updated_at),
  };
}

function buildFilters({ date, from, to, doctorId, hospitalId, status, paymentStatus, q, mobile }, alias = 'a') {
  const clauses = [];
  const params = [];
  if (date) { clauses.push(`${alias}.appt_date = ?`); params.push(date); }
  if (from) { clauses.push(`${alias}.appt_date >= ?`); params.push(from); }
  if (to) { clauses.push(`${alias}.appt_date <= ?`); params.push(to); }
  if (doctorId) { clauses.push(`${alias}.doctor_id = ?`); params.push(doctorId); }
  if (hospitalId) { clauses.push(`${alias}.hospital_id = ?`); params.push(hospitalId); }
  if (status) { clauses.push(`${alias}.status = ?`); params.push(status); }
  if (paymentStatus) { clauses.push(`${alias}.payment_status = ?`); params.push(paymentStatus); }
  if (mobile) { clauses.push(`p.mobile = ?`); params.push(mobile); }
  if (q) {
    clauses.push(`(p.name LIKE ? OR ${alias}.id LIKE ? OR d.name LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function query(hospitalId, filters = {}) {
  const { where, params } = buildFilters({ ...filters, hospitalId });
  const rows = await db.query(`${SELECT} ${where} ORDER BY a.appt_date, a.appt_time`, params);
  return rows.map(fromRow);
}

function sortRows(rows, sort = 'date_desc') {
  const key = (a) => `${a.date} ${a.time}`;
  const dir = sort === 'date_asc' ? 1 : -1;
  return [...rows].sort((a, b) => dir * key(a).localeCompare(key(b)));
}

function paginate(rows, page = 1, pageSize = 10) {
  const size = Math.min(Math.max(Number(pageSize) || 10, 1), 100);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(Number(page) || 1, 1), pages);
  return { items: rows.slice((current - 1) * size, current * size), total, page: current, pageSize: size, pages };
}

async function findById(hospitalId, id) {
  const row = await db.one(`${SELECT} WHERE a.hospital_id = ? AND a.id = ?`, [hospitalId, id]);
  return row ? fromRow(row) : null;
}

async function updateStatus(hospitalId, id, status) {
  const res = await db.query('UPDATE appointments SET status = ? WHERE hospital_id = ? AND id = ?', [status, hospitalId, id]);
  if (!res.affectedRows) return null;
  return findById(hospitalId, id);
}

// ---- Super Admin (platform-wide) -------------------------------------------

async function adminSearch(filters = {}) {
  const { where, params } = buildFilters(filters);
  const page = Math.max(Number(filters.page) || 1, 1);
  const size = Math.min(Math.max(Number(filters.pageSize) || 15, 1), 100);
  const total = (await db.one(`SELECT COUNT(*) AS n FROM appointments a JOIN doctors d ON d.id = a.doctor_id LEFT JOIN patients p ON p.id = a.patient_id ${where}`, params)).n;
  const rows = await db.query(
    `${SELECT} ${where} ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size]
  );
  return { items: rows.map(fromRow), total: Number(total), page, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) };
}

async function adminFindById(id) {
  const row = await db.one(`${SELECT} WHERE a.id = ?`, [id]);
  return row ? fromRow(row) : null;
}

// Used by the doctor workflow (Super Admin cannot cancel appointments).
async function cancelWithReason(id, reason, byUserId) {
  const res = await db.query(
    "UPDATE appointments SET status = 'cancelled', cancel_reason = ?, cancelled_by = ? WHERE id = ? AND status <> 'cancelled'",
    [reason, byUserId, id]
  );
  if (!res.affectedRows) return null;
  return adminFindById(id);
}

module.exports = {
  STATUSES, PAYMENT_STATUSES, query, sortRows, paginate, findById, updateStatus,
  adminSearch, adminFindById, cancelWithReason, fromRow,
};
