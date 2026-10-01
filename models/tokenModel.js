// Reception tokens: one queue number per appointment visit.
// Token numbers (T001, T002, ...) are unique per hospital per day and are never
// reused on that day, even when a token is cancelled.

const db = require('../db');

const STATUSES = ['waiting', 'called', 'completed', 'cancelled'];

const formatCode = (number) => `T${String(number).padStart(3, '0')}`;

const SELECT = `
  SELECT t.*, d.name AS doctor_name, d.specialization,
         a.appt_time AS time, a.status AS appointment_status, a.payment_status, a.fee, p.name AS patient_name
  FROM tokens t
  JOIN doctors d ON d.id = t.doctor_id
  LEFT JOIN appointments a ON a.id = t.appointment_id
  LEFT JOIN patients p ON p.id = a.patient_id`;

function fromRow(row) {
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    appointmentId: row.appointment_id,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    specialization: row.specialization,
    patientName: row.patient_name,
    date: row.token_date,
    number: row.number,
    code: row.code,
    status: row.status,
    time: row.time,
    appointmentStatus: row.appointment_status,
    paymentStatus: row.payment_status,
    fee: row.fee != null ? Number(row.fee) : null,
    createdAt: db.iso(row.created_at),
    updatedAt: db.iso(row.updated_at),
    calledAt: db.iso(row.called_at),
    completedAt: db.iso(row.completed_at),
    cancelledAt: db.iso(row.cancelled_at),
  };
}

async function query(hospitalId, { date, doctorId, status, q } = {}) {
  const clauses = ['t.hospital_id = ?'];
  const params = [hospitalId];
  if (date) { clauses.push('t.token_date = ?'); params.push(date); }
  if (doctorId) { clauses.push('t.doctor_id = ?'); params.push(doctorId); }
  if (status) { clauses.push('t.status = ?'); params.push(status); }
  if (q) { clauses.push('(t.code LIKE ? OR p.name LIKE ? OR d.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await db.query(`${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY t.token_date, t.number`, params);
  return rows.map(fromRow);
}

function summarize(tokens) {
  const s = { total: tokens.length, waiting: 0, called: 0, completed: 0, cancelled: 0 };
  for (const t of tokens) s[t.status] += 1;
  return s;
}

async function findById(hospitalId, id) {
  const row = await db.one(`${SELECT} WHERE t.hospital_id = ? AND t.id = ?`, [hospitalId, id]);
  return row ? fromRow(row) : null;
}

async function activeForAppointment(hospitalId, appointmentId) {
  const row = await db.one(
    `${SELECT} WHERE t.hospital_id = ? AND t.appointment_id = ? AND t.status <> 'cancelled'`,
    [hospitalId, appointmentId]
  );
  return row ? fromRow(row) : null;
}

async function nextNumber(hospitalId, date) {
  const row = await db.one('SELECT MAX(number) AS n FROM tokens WHERE hospital_id = ? AND token_date = ?', [hospitalId, date]);
  return Number(row && row.n ? row.n : 0) + 1;
}

// Issue the next token of the day for an appointment. The hospital row is
// locked for the transaction so two concurrent requests can't get the same number.
async function create(hospitalId, appointment) {
  // BEGIN IMMEDIATE (inside db.tx) already takes the database's write lock up
  // front, so concurrent requests are fully serialised — no per-row locking needed.
  const token = await db.tx(async (conn) => {
    const row = await conn.one('SELECT MAX(number) AS n FROM tokens WHERE hospital_id = ? AND token_date = ?', [hospitalId, appointment.date]);
    const number = Number(row && row.n ? row.n : 0) + 1;
    const id = await db.nextId('tokens', 'TK', 10001, conn);
    await conn.query(
      `INSERT INTO tokens (id, hospital_id, appointment_id, doctor_id, token_date, number, code, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')`,
      [id, hospitalId, appointment.id, appointment.doctorId, appointment.date, number, formatCode(number)]
    );
    return id;
  });
  return findById(hospitalId, token);
}

async function updateStatus(hospitalId, id, status) {
  const now = 'CURRENT_TIMESTAMP';
  let extra = '';
  if (status === 'waiting') extra = ', called_at = NULL, completed_at = NULL';
  if (status === 'called') extra = `, called_at = COALESCE(called_at, ${now}), completed_at = NULL`;
  if (status === 'completed') extra = `, called_at = COALESCE(called_at, ${now}), completed_at = ${now}`;
  if (status === 'cancelled') extra = `, cancelled_at = ${now}`;
  const res = await db.query(`UPDATE tokens SET status = ?${extra} WHERE hospital_id = ? AND id = ?`, [status, hospitalId, id]);
  if (!res.affectedRows) return null;
  return findById(hospitalId, id);
}

module.exports = { STATUSES, formatCode, query, summarize, findById, activeForAppointment, nextNumber, create, updateStatus, fromRow };
