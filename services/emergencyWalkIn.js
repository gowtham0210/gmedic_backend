// Emergency walk-ins: a patient who needs the doctor now, registered at the front desk without choosing a slot.
//
// This is a channel of its own next to normal appointments (services/receptionBooking.js, services/patient/booking.js):
// it takes no slot seat, never counts against a slot's capacity and gets its own queue token (E001, E002, ... per
// doctor per day, tokens.token_kind = 'EMERGENCY'). It is stored as an appointments row with emergency_walkin = 1 so the
// existing token, queue, payment, cancellation and audit code keeps working; migration 034 explains the columns.
//
// Rules, all enforced here on the server (and rechecked inside the registration transaction, so a stale screen cannot get through):
//   - only an active receptionist the database says may book emergencies, for their own hospital (users.can_book_emergency)
//   - a reason of 3-300 characters
//   - the hospital is active and its emergency intake is not paused (an administrator's OPEN / PAUSED switch)
//   - the doctor is in the department and can be booked like for a normal appointment (active, verified, not marked absent,
//     not on leave: rb.dayBlocker, the one availability rule) and is working today (present, and before the end of their last working block of the day)
// There is NO count that refuses a patient. When many walk-ins are active (the system default
// `emergency_walkin_warning_threshold`, config/platformSettings.js) the desk is shown a workload warning with the hospital's
// escalation instructions, and registration stays open: a counter never keeps a possibly serious patient from being assessed.
// Triage (CRITICAL / URGENT / SEMI_URGENT / NON_URGENT) is set only by a doctor afterwards; until then the walk-in is
// AWAITING_TRIAGE and shown as such. The doctor's queue order is bookingCore.sortQueue.

const db = require('../db');
const bookingCore = require('./bookingCore');
const rb = require('./receptionBooking');
const auditLog = require('./auditLog');
const appointmentModel = require('../models/appointmentModel');
const tokenModel = require('../models/tokenModel');
const { nowIn, hhmm, minutesOf, platformSetting } = require('./patient/common');
const { HttpError, badRequest, notFound, forbidden } = require('../utils/http');

const conflict = (message, details) => new HttpError(409, message, details);
const REASON = { min: 3, max: 300 };
const WARNING_KEY = 'emergency_walkin_warning_threshold';
// A doctor with no department is offered (and registered) under this id, so a hospital that has not set up departments can still use the form.
const NO_DEPARTMENT = 'none';
const NO_REFERRAL = 'No referral instructions are set for this hospital: follow its emergency escalation procedure.';
const DEFAULT_ESCALATION = 'Tell the emergency physician or the charge nurse now and follow the hospital\'s emergency escalation procedure. Never delay a patient who may be seriously ill.';

// Who may register: an active receptionist of this hospital with the permission, read from the database (never from the
// session copy or anything the client sent). A refused attempt is audited.
async function authorize(user, hospitalId) {
  const row = user && user.id ? await db.one("SELECT hospital_id, can_book_emergency FROM users WHERE id = ? AND role = 'RECEPTIONIST' AND status = 'ACTIVE'", [user.id]) : null;
  if (!row || !row.can_book_emergency || row.hospital_id !== hospitalId) {
    await auditLog.record({ req: { user: user || {} }, action: 'EMERGENCY_WALKIN_DENIED', entityType: 'USER', entityId: user && user.id, summary: `${(user && user.name) || 'A user'} tried to register an emergency walk-in without permission` });
    throw forbidden('You are not allowed to register emergency walk-ins. Ask an administrator to enable Emergency Booking for your account.');
  }
}

// Whether this doctor can see an emergency walk-in right now. Only these rules, all from what already exists:
//   present (not marked absent) and not on leave, on a day they work, until their last working block of the day ends -> eligible
//   absent                                                                                                           -> not eligible
//   on leave                                                                                                         -> not eligible
//   a day with no working block, or after the last block of the day has ended                                       -> not eligible
// "Present" is the doctor's availability status, so a doctor who is present and whose hours start at 15:00 can be registered at 14:00.
// The absent and leave checks (and active / verified / branch) are rb.dayBlocker, the same code normal booking uses; the working
// blocks are the doctor's normal schedule (doctor_schedules), only read. There is no emergency schedule and no on-call switch.
// The hospital's OPEN / PAUSED switch is checked separately (in register(), and again inside its transaction).
async function doctorState(d, h, today, minutes) {
  const blocker = await rb.dayBlocker(d, h, today);
  if (blocker) return { ok: false, reason: blocker };
  const blocks = await bookingCore.schedulesOn(db, d.id, today);
  if (!blocks.length) return { ok: false, reason: 'Not scheduled to work today.' };
  const lastEnd = Math.max(...blocks.map((blk) => minutesOf(blk.end_time)));
  if (minutes >= lastEnd) return { ok: false, reason: "Today's working hours have ended." };
  return { ok: true, mode: 'SCHEDULED' };
}

const escalationOf = (h) => h.emergency_referral_note || DEFAULT_ESCALATION;

// A refusal that tells the desk where to send the patient: the hospital's referral note and other doctors who can take them.
async function refusal(h, d, message, today, minutes) {
  const others = d ? await db.query(`SELECT d.* FROM doctors d WHERE d.hospital_id = ? AND d.department_id IS ? AND d.id <> ? AND ${bookingCore.BOOKABLE_DOCTOR}`, [h.id, d.department_id, d.id]) : [];
  const alternatives = [];
  for (const o of others) {
    if ((await doctorState(o, h, today, minutes)).ok) alternatives.push({ id: o.id, name: o.name });
  }
  return conflict(`${message} ${h.emergency_referral_note || NO_REFERRAL}`, { referral: h.emergency_referral_note || null, alternatives });
}

const intakeJson = (h) => ({
  status: h.emergency_intake,
  reason: h.emergency_intake_reason || null,
  referralNote: h.emergency_referral_note || null,
  changedAt: h.emergency_intake_changed_at ? db.iso(h.emergency_intake_changed_at) : null,
});

// Today's emergency walk-ins of a hospital, counted from the real appointments and queue tokens (nothing is typed in).
// Every patient lands in exactly ONE group, so no one is counted twice:
//   cancelled                                   -> not counted anywhere
//   completed                                   -> completedToday
//   in consultation                             -> underConsultation
//   anyone else still open (waiting, called, skipped) with no triage yet -> awaitingTriage
//   anyone else still open, assessed by a doctor                         -> waitingForConsultation
// activeTotal = awaitingTriage + waitingForConsultation + underConsultation. `warning` is a workload alert at or above the system
// default threshold; it never blocks a registration.
async function workload(h, today) {
  const rows = await db.query(
    `SELECT a.id AS appointment_id, a.status AS appt_status, a.triage_priority, a.created_at, a.emergency_reason, t.code, t.status AS token_status,
            p.name AS patient_name, d.name AS doctor_name
     FROM appointments a
     JOIN tokens t ON t.appointment_id = a.id AND t.token_kind = 'EMERGENCY'
     JOIN patients p ON p.id = a.patient_id
     JOIN doctors d ON d.id = a.doctor_id
     WHERE a.hospital_id = ? AND a.appt_date = ? AND a.emergency_walkin = 1
     ORDER BY a.created_at, t.code`,
    [h.id, today]
  );
  const counts = { awaitingTriage: 0, waitingForConsultation: 0, underConsultation: 0, completedToday: 0 };
  const active = [];
  for (const r of rows) {
    if (r.appt_status === 'cancelled' || r.token_status === 'cancelled') continue;
    if (r.token_status === 'completed' || r.appt_status === 'completed') { counts.completedToday += 1; continue; }
    let group;
    if (r.token_status === 'in_consultation') { counts.underConsultation += 1; group = 'UNDER_CONSULTATION'; }
    else if (!r.triage_priority) { counts.awaitingTriage += 1; group = 'AWAITING_TRIAGE'; }
    else { counts.waitingForConsultation += 1; group = 'WAITING'; }
    active.push({
      appointmentId: r.appointment_id, token: r.code, patientName: r.patient_name, doctorName: r.doctor_name, reason: r.emergency_reason,
      registeredAt: db.iso(r.created_at), triage: r.triage_priority || null, group, consultationStatus: r.token_status,
    });
  }
  const activeTotal = counts.awaitingTriage + counts.waitingForConsultation + counts.underConsultation;
  const threshold = await platformSetting(WARNING_KEY);
  const warning = activeTotal >= threshold;
  return {
    date: today, activeTotal, ...counts, threshold, warning,
    // Shown when the workload is high; it tells the desk what to do, it does not stop anything.
    escalation: warning ? `${activeTotal} emergency walk-ins are active (warning level ${threshold}). Registration stays open. ${escalationOf(h)}` : null,
    active,
  };
}

// GET /api/emergency/summary: the receptionist's Emergency Walk-in panel.
async function summary(hospitalId) {
  const h = await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId]);
  if (!h) throw notFound('Hospital not found.');
  return { ...(await workload(h, nowIn(h.timezone).date)), intake: intakeJson(h) };
}

// GET /api/emergency/options: what the Emergency Walk-in form offers. Departments with their doctors, and for each
// doctor whether a walk-in can be registered right now and why not.
async function options(hospitalId, user) {
  const h = await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId]);
  if (!h) throw notFound('Hospital not found.');
  const perm = user && user.id ? await db.one("SELECT can_book_emergency FROM users WHERE id = ? AND role = 'RECEPTIONIST' AND status = 'ACTIVE'", [user.id]) : null;
  const now = nowIn(h.timezone);
  const doctors = await db.query(`SELECT d.* FROM doctors d WHERE d.hospital_id = ? AND ${bookingCore.BOOKABLE_DOCTOR} ORDER BY d.name`, [hospitalId]);
  const departments = (await db.query('SELECT id, name FROM departments WHERE hospital_id = ? AND archived_at IS NULL ORDER BY name', [hospitalId])).map((x) => ({ id: x.id, name: x.name, doctors: [] }));
  departments.push({ id: NO_DEPARTMENT, name: 'No department', doctors: [] });
  const byId = new Map(departments.map((x) => [x.id, x]));
  for (const d of doctors) {
    const dept = byId.get(d.department_id) || byId.get(NO_DEPARTMENT);
    const state = await doctorState(d, h, now.date, now.minutes);
    dept.doctors.push({ id: d.id, name: d.name, specialization: d.specialization, available: state.ok, reason: state.reason || null });
  }
  const load = await workload(h, now.date);
  return {
    allowed: !!(perm && perm.can_book_emergency), hospital: { id: h.id, name: h.name }, intake: intakeJson(h),
    workload: { activeTotal: load.activeTotal, threshold: load.threshold, warning: load.warning, escalation: load.escalation },
    departments: departments.filter((x) => x.doctors.length),
  };
}

// POST /api/emergency/walk-ins { departmentId, doctorId, emergencyReason, patientId | patient: {name, mobile, gender?, dateOfBirth?, differentPerson?, samePerson?} }
async function register(hospitalId, body = {}, user = null) {
  await authorize(user, hospitalId);
  const reason = String(body.emergencyReason == null ? '' : body.emergencyReason).trim();
  if (reason.length < REASON.min || reason.length > REASON.max) {
    throw badRequest(`Enter the emergency reason (${REASON.min} to ${REASON.max} characters).`, { emergencyReason: `${REASON.min} to ${REASON.max} characters.` });
  }
  if (!body.departmentId) throw badRequest('Choose the department.', { departmentId: 'Choose a department.' });
  if (!body.doctorId) throw badRequest('Choose the doctor.', { doctorId: 'Choose a doctor.' });
  const { d, h } = await rb.hospitalDoctor(hospitalId, body.doctorId);
  if (String(d.department_id || NO_DEPARTMENT) !== String(body.departmentId)) throw badRequest('This doctor is not in the selected department.', { doctorId: 'Not in this department.' });

  const now = nowIn(h.timezone);
  if (h.status !== 'ACTIVE') throw conflict('This hospital is not accepting patients right now.');
  if (h.emergency_intake === 'PAUSED') {
    throw await refusal(h, d, `Emergency walk-ins are paused at this hospital${h.emergency_intake_reason ? `: ${h.emergency_intake_reason}.` : '.'}`, now.date, now.minutes);
  }
  const unavailable = async (doctor) => {
    const state = await doctorState(doctor, h, now.date, now.minutes);
    return state.ok ? null : refusal(h, doctor, `${doctor.name} cannot see an emergency walk-in now: ${state.reason}`, now.date, now.minutes);
  };
  const blocked = await unavailable(d);
  if (blocked) throw blocked;

  const patient = await rb.patientFor(body.patientId ? { id: body.patientId } : body.patient, hospitalId);

  let apptId;
  try {
    apptId = await db.tx(async (conn) => {
      // Re-checked under the write lock with a fresh read of the hospital switch and the doctor: availability may have changed since the first check
      // (the desk's screen can be minutes old), and two desks registering together cannot take the same number.
      const hospitalNow = await conn.one('SELECT * FROM hospitals WHERE id = ?', [h.id]);
      if (hospitalNow.status !== 'ACTIVE') throw conflict('This hospital is not accepting patients right now.');
      if (hospitalNow.emergency_intake === 'PAUSED') {
        throw await refusal(hospitalNow, d, `Emergency walk-ins are paused at this hospital${hospitalNow.emergency_intake_reason ? `: ${hospitalNow.emergency_intake_reason}.` : '.'}`, now.date, now.minutes);
      }
      const fresh = await conn.one('SELECT * FROM doctors WHERE id = ? AND hospital_id = ?', [d.id, h.id]);
      const stale = await unavailable(fresh);
      if (stale) throw stale;
      const dup = await conn.one(
        `SELECT a.id FROM appointments a JOIN tokens t ON t.appointment_id = a.id
         WHERE a.patient_id = ? AND a.doctor_id = ? AND a.appt_date = ? AND a.emergency_walkin = 1 AND t.status IN ('waiting', 'called', 'in_consultation', 'skipped')`,
        [patient.id, d.id, now.date]
      );
      if (dup) throw conflict(`${patient.name} is already registered as an emergency walk-in with ${d.name} (${dup.id}).`, { appointmentId: dup.id });
      const emergencyNo = await bookingCore.nextEmergencyNo(conn, { doctorId: d.id, date: now.date });
      const id = await db.nextId('appointments', 'APT', 10001, conn);
      await conn.query(
        `INSERT INTO appointments (id, hospital_id, doctor_id, patient_id, appt_date, appt_time, seat_no, fee, currency, status, payment_status, source, booked_by_user_id, is_emergency, emergency_walkin, emergency_no, emergency_reason)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'confirmed', 'pending', ?, ?, 1, 1, ?, ?)`,
        [id, h.id, d.id, patient.id, now.date, hhmm(now.minutes), d.fee, d.currency, bookingCore.CHANNEL_SOURCE.reception, user.id, emergencyNo, reason]
      );
      await bookingCore.issueQueueToken(conn, { hospitalId: h.id, appointmentId: id, doctorId: d.id, date: now.date, number: emergencyNo });
      return id;
    });
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(String(err && err.message))) throw conflict('Another emergency registration was saved at the same moment. Please try again.');
    throw err;
  }
  const appointment = await appointmentModel.findById(hospitalId, apptId);
  await auditLog.record({
    req: { user }, action: 'EMERGENCY_WALKIN_REGISTERED', entityType: 'APPOINTMENT', entityId: apptId,
    summary: `Emergency walk-in ${appointment.tokenCode} (${patient.name}) registered with ${d.name}: ${reason}`,
    newValue: { appointmentId: apptId, token: appointment.tokenCode, doctorId: d.id, patientId: patient.id, emergencyReason: reason, receptionistId: user.id, registeredAt: appointment.createdAt },
  });
  return appointment;
}

// PATCH /api/doctor/queue/:id/triage { priority, note? }: a doctor assesses (or re-assesses) a walk-in. Receptionists cannot.
async function setTriage(hospitalId, user, tokenId, body = {}) {
  if (!user || user.role !== 'DOCTOR' || !user.doctorId) throw forbidden('Only a doctor can assess triage priority.');
  const priority = String(body.priority || '').toUpperCase();
  if (!bookingCore.TRIAGE.includes(priority)) throw badRequest(`Choose ${bookingCore.TRIAGE.join(', ')}.`, { priority: 'Choose a triage priority.' });
  const note = String(body.note || '').trim().slice(0, 200) || null;
  const token = await tokenModel.findById(hospitalId, tokenId);
  if (!token || token.doctorId !== user.doctorId) throw notFound('Token not found.');
  if (!token.walkIn) throw conflict('Only an emergency walk-in has a triage priority.');
  if (token.date !== appointmentModel.todayIn((await db.one('SELECT timezone FROM hospitals WHERE id = ?', [hospitalId])).timezone)) throw badRequest("Only today's queue can be changed.");
  if (['completed', 'cancelled'].includes(token.status)) throw conflict(`A ${token.status} patient cannot be re-assessed.`);
  const previous = token.triage;
  if (previous === priority) return { token, changed: false };
  await db.query('UPDATE appointments SET triage_priority = ?, triaged_by_user_id = ?, triaged_at = CURRENT_TIMESTAMP WHERE id = ? AND emergency_walkin = 1', [priority, user.id, token.appointmentId]);
  await auditLog.record({
    req: { user }, action: previous ? 'TRIAGE_CHANGED' : 'TRIAGE_ASSIGNED', entityType: 'APPOINTMENT', entityId: token.appointmentId,
    summary: `${token.code} (${token.patientName}): ${previous || 'AWAITING_TRIAGE'} → ${priority}${note ? `: ${note}` : ''}`,
    previousValue: { triage: previous || 'AWAITING_TRIAGE' }, newValue: { triage: priority, note, token: token.code },
  });
  return { token: await tokenModel.findById(hospitalId, tokenId), changed: true };
}

// PUT /api/admin/hospitals/:id/emergency-intake { paused?, reason?, referralNote? }: Super Admin and Operations.
// Pausing or resuming needs a reason; who changed it and when is kept on the hospital and in the audit log. The referral note is
// the escalation / referral instruction the desk reads when intake is paused, a doctor is unavailable or the workload is high.
// No count is configured here: the workload warning is a system default (config/platformSettings.js).
async function updateIntake(hospitalId, body = {}, user) {
  const h = await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId]);
  if (!h) throw notFound('Hospital not found.');
  if (body.walkInLimit !== undefined) {
    throw badRequest('There is no walk-in limit to set: registration is never refused because of a count. The workload warning is a system setting.', { walkInLimit: 'Not used.' });
  }
  const sets = [];
  const params = [];
  const before = intakeJson(h);
  const changes = [];
  if (body.paused !== undefined) {
    if (typeof body.paused !== 'boolean') throw badRequest('paused must be true or false.', { paused: 'true or false.' });
    const reason = String(body.reason || '').trim();
    if (reason.length < 3 || reason.length > 300) throw badRequest('Give the reason (3 to 300 characters).', { reason: '3 to 300 characters.' });
    const next = body.paused ? 'PAUSED' : 'OPEN';
    if (next !== h.emergency_intake) {
      sets.push('emergency_intake = ?', 'emergency_intake_reason = ?', 'emergency_intake_changed_by = ?', 'emergency_intake_changed_at = CURRENT_TIMESTAMP');
      params.push(next, reason, user.id);
      changes.push(body.paused ? 'EMERGENCY_INTAKE_PAUSED' : 'EMERGENCY_INTAKE_RESUMED');
    }
  }
  if (body.referralNote !== undefined) {
    const note = String(body.referralNote || '').trim();
    if (note.length > 500) throw badRequest('Keep the instructions under 500 characters.', { referralNote: 'At most 500 characters.' });
    if ((note || null) !== before.referralNote) { sets.push('emergency_referral_note = ?'); params.push(note || null); changes.push('EMERGENCY_REFERRAL_UPDATED'); }
  }
  if (body.paused === undefined && body.referralNote === undefined) throw badRequest('Send paused or referralNote.');
  if (sets.length) {
    await db.query(`UPDATE hospitals SET ${sets.join(', ')} WHERE id = ?`, [...params, hospitalId]);
    const after = intakeJson(await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId]));
    for (const action of changes) {
      await auditLog.record({ req: { user }, action, entityType: 'HOSPITAL', entityId: hospitalId, summary: `${h.name}: ${action.replace('EMERGENCY_', '').replace(/_/g, ' ').toLowerCase()}${body.reason && action.includes('INTAKE') ? `: ${String(body.reason).trim()}` : ''}`, previousValue: before, newValue: after });
    }
  }
  return { ...intakeJson(await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId])), warningThreshold: await platformSetting(WARNING_KEY) };
}

const getIntake = async (hospitalId) => {
  const h = await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId]);
  if (!h) throw notFound('Hospital not found.');
  return { ...intakeJson(h), warningThreshold: await platformSetting(WARNING_KEY) };
};

module.exports = { options, summary, workload, register, setTriage, updateIntake, getIntake, doctorState, REASON, WARNING_KEY };
