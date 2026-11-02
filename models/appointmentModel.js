// Appointments are booked by patients in the Gmedic app; the receptionist
// portal reads them and can update status; Super Admin can additionally
// cancel/reschedule any appointment platform-wide (with a required reason).

const db = require('../db');
const { contains } = require('../utils/like');
const { dateInZone } = require('../utils/dates');

const STATUSES = ['confirmed', 'pending', 'completed', 'cancelled'];
// What a list may filter on: the four statuses, plus 'no_show' (a flag on a confirmed appointment, see no_show below).
const STATUS_FILTERS = [...STATUSES, 'no_show'];
const PAYMENT_STATUSES = ['paid', 'pending'];

// The day it is at the hospital now (YYYY-MM-DD), so "today" means the hospital's today.
function todayIn(timezone) { return dateInZone(undefined, timezone); }
async function hospitalToday(hospitalId) {
  const h = await db.one('SELECT timezone FROM hospitals WHERE id = ?', [hospitalId]);
  return todayIn(h && h.timezone);
}

// Which statuses the front desk may move an appointment to by hand (cancelling has its own endpoint, with the
// refund). Completed and cancelled are final, and so is a no-show; "completed" only once the day has come,
// so a future appointment can't be closed early.
function nextStatuses(row) {
  if (row.status === 'completed' || row.status === 'cancelled' || row.no_show) return [];
  const started = row.appt_date <= todayIn(row.hospital_timezone);
  const out = row.status === 'pending' ? ['confirmed'] : ['pending'];
  if (started) out.push('completed');
  return out;
}

const SELECT = `
  SELECT a.*, d.name AS doctor_name, d.specialization, (SELECT name FROM departments WHERE id = d.department_id) AS department, h.name AS hospital_name, h.timezone AS hospital_timezone, b.name AS branch_name,
         p.mobile AS patient_mobile, p.name AS patient_name, p.gender AS patient_gender, p.date_of_birth AS patient_dob, p.account_user_id AS patient_account, (SELECT COUNT(*) FROM appointments o WHERE o.patient_id = a.patient_id AND o.hospital_id <> a.hospital_id) AS patient_elsewhere, bu.name AS booked_by_name,
         COALESCE((SELECT t.code FROM tokens t WHERE t.appointment_id = a.id AND t.status <> 'cancelled' ORDER BY t.id DESC LIMIT 1),
                  CASE WHEN a.emergency_no IS NOT NULL THEN printf('E%02d', a.emergency_no) WHEN a.token_no IS NOT NULL THEN printf('T%03d', a.token_no) END) AS token_code,
         (SELECT pay2.transaction_id FROM payments pay2 WHERE pay2.appointment_id = a.id ORDER BY pay2.created_at DESC LIMIT 1) AS transaction_id
  FROM appointments a
  JOIN doctors d ON d.id = a.doctor_id
  JOIN hospitals h ON h.id = a.hospital_id
  LEFT JOIN hospital_branches b ON b.id = a.branch_id
  LEFT JOIN users bu ON bu.id = a.booked_by_user_id
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
    tokenNo: row.token_no == null ? null : Number(row.token_no),
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
    noShow: !!row.no_show,
    // An emergency walk-in added over a full slot; seen before everyone else waiting (token E01, E02, ...).
    emergency: !!row.is_emergency,
    reason: row.reason_for_visit || null,
    bookedBy: row.booked_by_name || null,
    rescheduleCount: Number(row.reschedule_count || 0),
    nextStatuses: nextStatuses(row),
    // A patient who has their own app account owns their details; only a front-desk patient can be corrected here.
    patientEditable: !row.patient_account && !Number(row.patient_elsewhere),
    patientSharedWithOtherHospitals: !row.patient_account && Number(row.patient_elsewhere) > 0,
    patientGender: row.patient_gender || null,
    patientDateOfBirth: row.patient_dob || null,
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
  // A no-show is a flag on a confirmed appointment, so "confirmed" leaves those out and "no_show" is its own filter.
  if (status === 'no_show') clauses.push(`${alias}.no_show = 1`);
  else if (status === 'confirmed') clauses.push(`${alias}.status = 'confirmed' AND ${alias}.no_show = 0`);
  else if (status) { clauses.push(`${alias}.status = ?`); params.push(status); }
  if (paymentStatus) { clauses.push(`${alias}.payment_status = ?`); params.push(paymentStatus); }
  if (mobile) { clauses.push(`p.mobile = ?`); params.push(mobile); }
  if (q) {
    // Patient name, appointment ID or doctor; the patient ID exactly (so PAT1039 never also finds
    // PAT10390); and, for 4+ digits, the patient's mobile in any typed format.
    const like = contains(q);
    const digits = String(q).replace(/\D/g, '');
    const mobileClause = digits.length >= 4 && digits.length === String(q).replace(/[\s+()-]/g, '').length ? ' OR p.mobile LIKE ?' : '';
    clauses.push(`(p.name LIKE ? ESCAPE '\\' OR ${alias}.id LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\' OR p.id = ?${mobileClause})`);
    params.push(like, like, like, String(q).trim().toUpperCase());
    if (mobileClause) params.push(`%${digits.slice(-10)}%`);
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

// One hospital's appointments, a page at a time in SQL, with the counts for the status tabs (which ignore the
// status filter so they always show totals).
async function search(hospitalId, filters = {}, { sort = 'date_desc', page = 1, pageSize = 10 } = {}) {
  const { status, ...withoutStatus } = filters;
  const base = buildFilters({ ...withoutStatus, hospitalId });
  const joins = 'FROM appointments a JOIN doctors d ON d.id = a.doctor_id LEFT JOIN patients p ON p.id = a.patient_id';
  const grouped = await db.query(`SELECT a.status AS status, a.no_show AS no_show, COUNT(*) AS n ${joins} ${base.where} GROUP BY a.status, a.no_show`, base.params);
  const counts = { all: 0, confirmed: 0, pending: 0, completed: 0, cancelled: 0, no_show: 0 };
  for (const g of grouped) {
    const n = Number(g.n);
    counts.all += n;
    if (g.no_show && g.status !== 'cancelled') counts.no_show += n; else counts[g.status] += n;
  }
  const { where, params } = buildFilters({ ...withoutStatus, status, hospitalId });
  const total = Number((await db.one(`SELECT COUNT(*) AS n ${joins} ${where}`, params)).n);
  const size = Math.min(Math.max(Number(pageSize) || 10, 1), 100);
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(Number(page) || 1, 1), pages);
  const dir = sort === 'date_asc' ? 'ASC' : 'DESC';
  const rows = await db.query(`${SELECT} ${where} ORDER BY a.appt_date ${dir}, a.appt_time ${dir}, a.id ${dir} LIMIT ? OFFSET ?`, [...params, size, (current - 1) * size]);
  return { items: rows.map(fromRow), total, page: current, pageSize: size, pages, counts };
}

// One appointment with what the details view needs beyond the list row: the consultation fee payment taken at
// the hospital (with the receipt and reference), the booking token paid in the app, and any refunds.
async function findById(hospitalId, id) {
  const row = await db.one(`${SELECT} WHERE a.hospital_id = ? AND a.id = ?`, [hospitalId, id]);
  if (!row) return null;
  const appointment = fromRow(row);
  const pay = await db.one("SELECT id, method, transaction_id, paid_at, amount, status, gateway, receipt_number, gateway_order_id FROM payments WHERE appointment_id = ? AND purpose = 'CONSULTATION' ORDER BY (status = 'PAID') DESC, created_at DESC LIMIT 1", [id]);
  const token = await db.one("SELECT id, method, transaction_id, paid_at, amount FROM payments WHERE appointment_id = ? AND purpose = 'TOKEN' AND status = 'PAID' LIMIT 1", [id]);
  const refunds = await db.query("SELECT id, amount, status, reason, created_at FROM refunds WHERE appointment_id = ? ORDER BY created_at", [id]);
  appointment.payment = pay ? { id: pay.id, method: pay.method, transactionId: pay.transaction_id, paidAt: db.iso(pay.paid_at), amount: Number(pay.amount), status: pay.status, gateway: pay.gateway, receiptNumber: pay.receipt_number || null, reference: pay.gateway === 'FRONT_DESK' ? pay.gateway_order_id || null : null, atDesk: pay.gateway === 'FRONT_DESK' } : null;
  appointment.bookingToken = token ? { id: token.id, amount: Number(token.amount), method: token.method, transactionId: token.transaction_id, paidAt: db.iso(token.paid_at) } : null;
  appointment.refunds = refunds.map((r) => ({ id: r.id, amount: Number(r.amount), status: r.status, reason: r.reason, createdAt: db.iso(r.created_at) }));
  return appointment;
}

// `from` makes the change conditional on the status the caller saw, so two people acting at once can't both win.
async function updateStatus(hospitalId, id, status, from) {
  const res = from
    ? await db.query('UPDATE appointments SET status = ? WHERE hospital_id = ? AND id = ? AND status = ?', [status, hospitalId, id, from])
    : await db.query('UPDATE appointments SET status = ? WHERE hospital_id = ? AND id = ?', [status, hospitalId, id]);
  if (!res.affectedRows) return null;
  return findById(hospitalId, id);
}

// ---- Super Admin (platform-wide) -------------------------------------------

async function adminSearch(filters = {}) {
  const { where, params } = buildFilters(filters);
  const size = Math.min(Math.max(Number(filters.pageSize) || 15, 1), 100);
  const total = (await db.one(`SELECT COUNT(*) AS n FROM appointments a JOIN doctors d ON d.id = a.doctor_id LEFT JOIN patients p ON p.id = a.patient_id ${where}`, params)).n;
  // A page past the end (the last row of the last page just changed status) falls back to the last page.
  const page = Math.min(Math.max(Number(filters.page) || 1, 1), Math.max(1, Math.ceil(total / size)));
  const rows = await db.query(
    `${SELECT} ${where} ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size]
  );
  // Per-status totals over every page (the status filter left out), for summary cards.
  const { status, ...withoutStatus } = filters;
  const base = buildFilters(withoutStatus);
  const grouped = await db.query(`SELECT a.status AS status, a.no_show AS no_show, COUNT(*) AS n FROM appointments a JOIN doctors d ON d.id = a.doctor_id LEFT JOIN patients p ON p.id = a.patient_id ${base.where} GROUP BY a.status, a.no_show`, base.params);
  const counts = { all: 0, confirmed: 0, pending: 0, completed: 0, cancelled: 0, no_show: 0 };
  for (const g of grouped) {
    const n = Number(g.n);
    counts.all += n;
    if (g.no_show && g.status !== 'cancelled') counts.no_show += n; else counts[g.status] += n;
  }
  return { items: rows.map(fromRow), total: Number(total), page, pageSize: size, pages: Math.max(1, Math.ceil(total / size)), counts };
}

async function adminFindById(id) {
  const row = await db.one(`${SELECT} WHERE a.id = ?`, [id]);
  return row ? fromRow(row) : null;
}

module.exports = {
  STATUSES, STATUS_FILTERS, PAYMENT_STATUSES, todayIn, hospitalToday, query, search, sortRows, paginate, findById, updateStatus,
  adminSearch, adminFindById, fromRow,
};
