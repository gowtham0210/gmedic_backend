// Reception tokens: one queue entry per appointment visit.
// The number is the appointment's own token (T001, T002, ... per doctor per day), given when it
// was booked in any channel (services/bookingCore.js), so the patient app, the receptionist and the
// doctor's queue all show the same token. It is never reused on that day.

const db = require('../db');
const { contains } = require('../utils/like');
const { badRequest } = require('../utils/http');
const bookingCore = require('../services/bookingCore');
const { instant } = require('../services/patient/common');

const STATUSES = ['waiting', 'called', 'in_consultation', 'completed', 'cancelled', 'skipped'];

// Which statuses a token may move to from its current one. Terminal states
// (completed, cancelled) have no way out — e.g. "Completed -> Waiting" is
// rejected here rather than left to each caller to remember.
const TRANSITIONS = {
  waiting: ['called', 'skipped', 'cancelled'],
  called: ['in_consultation', 'waiting', 'skipped', 'cancelled'],
  in_consultation: ['completed', 'cancelled'],
  skipped: ['waiting', 'called', 'cancelled'],
  completed: [],
  cancelled: [],
};

const formatCode = bookingCore.tokenCode;

const SELECT = `
  SELECT t.*, d.name AS doctor_name, d.specialization,
         a.appt_time AS time, a.status AS appointment_status, a.payment_status, a.fee, a.is_emergency, p.name AS patient_name,
         a.emergency_walkin, a.triage_priority, a.triaged_at, a.emergency_reason, a.created_at AS registered_at, hs.timezone AS hospital_timezone
  FROM tokens t
  JOIN doctors d ON d.id = t.doctor_id
  JOIN hospitals hs ON hs.id = t.hospital_id
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
    // Emergencies over a full slot (migration 032, history) are called before everyone else (bookingCore.queueOrder).
    emergency: !!row.is_emergency,
    // An emergency walk-in (migration 034): separate E001... token, no slot, called by clinical triage (bookingCore.sortQueue).
    walkIn: !!row.emergency_walkin,
    kind: row.token_kind || 'NORMAL',
    triage: row.emergency_walkin ? row.triage_priority || null : null,
    awaitingTriage: !!row.emergency_walkin && !row.triage_priority,
    triagedAt: db.iso(row.triaged_at),
    emergencyReason: row.emergency_walkin || row.is_emergency ? row.emergency_reason || null : null,
    registeredAt: row.emergency_walkin ? db.iso(row.registered_at) : null,
    // When the patient started waiting: a walk-in from registration, a normal appointment from its slot (used to rank and to show the wait).
    arrivedAt: row.emergency_walkin ? new Date(db.iso(row.registered_at)).getTime() : instant(row.token_date, row.time || '00:00', row.hospital_timezone),
    status: row.status,
    // Lets screens offer only the moves updateStatus() will accept.
    nextStatuses: TRANSITIONS[row.status] || [],
    time: row.time,
    appointmentStatus: row.appointment_status,
    paymentStatus: row.payment_status,
    fee: row.fee != null ? Number(row.fee) : null,
    createdAt: db.iso(row.created_at),
    updatedAt: db.iso(row.updated_at),
    calledAt: db.iso(row.called_at),
    completedAt: db.iso(row.completed_at),
    cancelledAt: db.iso(row.cancelled_at),
    skippedAt: db.iso(row.skipped_at),
  };
}

async function query(hospitalId, { date, doctorId, status, q } = {}) {
  const clauses = ['t.hospital_id = ?'];
  const params = [hospitalId];
  if (date) { clauses.push('t.token_date = ?'); params.push(date); }
  if (doctorId) { clauses.push('t.doctor_id = ?'); params.push(doctorId); }
  if (status) { clauses.push('t.status = ?'); params.push(status); }
  if (q) { const like = contains(q); clauses.push(`(t.code LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR d.name LIKE ? ESCAPE '\\')`); params.push(like, like, like); }
  const rows = await db.query(`${SELECT} WHERE ${clauses.join(' AND ')} ORDER BY t.token_date, COALESCE(a.is_emergency, 0) DESC, t.number`, params);
  return rows.map(fromRow);
}

function summarize(tokens) {
  const s = { total: tokens.length, waiting: 0, called: 0, in_consultation: 0, completed: 0, cancelled: 0, skipped: 0 };
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

// Check in an appointment: its queue token carries the number the appointment was booked with.
// An appointment without one (booked before shared tokens existed) takes the doctor's next number now.
async function create(hospitalId, appointment) {
  // BEGIN IMMEDIATE (inside db.tx) already takes the database's write lock up
  // front, so concurrent requests are fully serialised — no per-row locking needed.
  const token = await db.tx(async (conn) => {
    // Checked here too (not only by the caller) so two desks pressing Generate together get one token.
    const live = await conn.one("SELECT code FROM tokens WHERE appointment_id = ? AND status <> 'cancelled'", [appointment.id]);
    if (live) throw badRequest(`${appointment.patientName} already has token ${live.code} for this appointment.`);
    // Re-issue: the appointment keeps its slot-based number (bookingCore.slotTokenNumber); only an
    // appointment without one, or whose number another live token now holds, gets a fresh one.
    const appt = await conn.one('SELECT token_no, appt_time, seat_no FROM appointments WHERE id = ?', [appointment.id]);
    let number = appt && appt.token_no ? Number(appt.token_no) : null;
    const clash = number && await conn.one(
      "SELECT 1 FROM tokens WHERE doctor_id = ? AND token_date = ? AND number = ? AND status <> 'cancelled' AND appointment_id <> ?",
      [appointment.doctorId, appointment.date, number, appointment.id]
    );
    if (!number || clash) {
      number = await bookingCore.slotTokenNumber(conn, { doctorId: appointment.doctorId, date: appointment.date, time: appt.appt_time, seat: appt.seat_no, ignoreAppointmentId: appointment.id });
      await conn.query('UPDATE appointments SET token_no = ? WHERE id = ?', [number, appointment.id]);
    }
    return bookingCore.issueQueueToken(conn, { hospitalId, appointmentId: appointment.id, doctorId: appointment.doctorId, date: appointment.date, number });
  });
  return findById(hospitalId, token);
}

async function updateStatus(hospitalId, id, status, { skipTransitionCheck = false } = {}) {
  const current = await findById(hospitalId, id);
  if (!current) return null;
  if (!skipTransitionCheck && current.status !== status && !TRANSITIONS[current.status].includes(status)) {
    throw badRequest(`A token can't move from "${current.status.replace('_', ' ')}" to "${status.replace('_', ' ')}".`);
  }

  const now = 'CURRENT_TIMESTAMP';
  let extra = '';
  // One patient at a time per doctor per day: checked in the same transaction as the write, so the doctor's
  // queue and the receptionist's token screen follow the same rule and two requests can't both win.
  if (status === 'waiting') extra = ', called_at = NULL, completed_at = NULL, skipped_at = NULL';
  if (status === 'called') extra = `, called_at = ${now}, completed_at = NULL`;
  if (status === 'in_consultation') extra = `, called_at = COALESCE(called_at, ${now})`;
  if (status === 'completed') extra = `, called_at = COALESCE(called_at, ${now}), completed_at = ${now}`;
  if (status === 'cancelled') extra = `, cancelled_at = ${now}`;
  if (status === 'skipped') extra = `, skipped_at = ${now}`;
  const res = await db.tx(async (conn) => {
    if (status === 'in_consultation') {
      const busy = await conn.one(
        "SELECT t.code, p.name AS patient_name FROM tokens t LEFT JOIN appointments a ON a.id = t.appointment_id LEFT JOIN patients p ON p.id = a.patient_id WHERE t.doctor_id = ? AND t.token_date = ? AND t.status = 'in_consultation' AND t.id <> ?",
        [current.doctorId, current.date, id]
      );
      if (busy) throw badRequest(`${busy.code}${busy.patient_name ? ` (${busy.patient_name})` : ''} is still in consultation. Complete it before starting another patient.`);
    }
    return conn.query(`UPDATE tokens SET status = ?${extra} WHERE hospital_id = ? AND id = ?`, [status, hospitalId, id]);
  });
  if (!res.affectedRows) return null;
  return findById(hospitalId, id);
}

// The token a doctor is attending on a date, for the patient app's "Now serving". Only `in_consultation` counts:
// `called` means the patient was summoned, not that the doctor has started. Returns { code, number } or null.
// If data ever holds more than one in_consultation token for the doctor and day (rows from before the guard in
// updateStatus), no single token is the right answer, so it returns null rather than picking one.
async function currentServing(doctorId, date) {
  const rows = await db.query(
    "SELECT code, number FROM tokens WHERE doctor_id = ? AND token_date = ? AND status = 'in_consultation' ORDER BY id LIMIT 2",
    [doctorId, date]
  );
  if (rows.length > 1) {
    console.warn(`tokenModel.currentServing: more than one token in consultation for doctor ${doctorId} on ${date}; showing none.`);
    return null;
  }
  return rows[0] ? { code: rows[0].code, number: rows[0].number } : null;
}

module.exports = { STATUSES, TRANSITIONS, formatCode, query, summarize, findById, activeForAppointment, create, updateStatus, currentServing, fromRow };
// (searches escape LIKE wildcards)
