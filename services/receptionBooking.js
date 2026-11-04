// Front-desk booking for the receptionist API: a doctor's slots with live seat counts, booking a
// walk-in or phone patient into a slot, and the walk-in seats each schedule block holds back.
// Seats and token numbers come from services/bookingCore.js, the same code the patient app books
// through, so a slot's limit and the doctor's token sequence are shared by every channel.

const db = require('../db');
const bookingCore = require('./bookingCore');
const events = require('./appointmentEvents');
const appointmentModel = require('../models/appointmentModel');
const crypto = require('crypto');
const { normalizePhone } = require('./patient/auth');
const { nowIn, addDays, isDate, isoAt, instant, minutesOf, hhmm, hoursOf, platformSetting } = require('./patient/common');
const auditLog = require('./auditLog');
const { HttpError, badRequest, notFound } = require('../utils/http');

const conflict = (message, details) => new HttpError(409, message, details);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const GENDERS = { male: 'MALE', female: 'FEMALE', other: 'OTHER' };

async function hospitalDoctor(hospitalId, doctorId) {
  const d = await db.one('SELECT * FROM doctors WHERE id = ? AND hospital_id = ?', [String(doctorId || ''), hospitalId]);
  if (!d) throw notFound('Doctor not found.');
  const h = await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId]);
  return { d, h };
}

const onLeave = async (doctorId, date) => !!(await db.one(
  'SELECT 1 FROM doctor_leaves WHERE doctor_id = ? AND cancelled_at IS NULL AND start_date <= ? AND end_date >= ? LIMIT 1',
  [doctorId, date, date]
));

// Why the front desk can't book this doctor on this date at all, or null.
async function dayBlocker(d, h, date) {
  const today = nowIn(h.timezone).date;
  const rules = await hoursOf(h.id);
  if (h.status !== 'ACTIVE') return 'This hospital is not accepting bookings right now.';
  if (d.status === 'INACTIVE') return 'This doctor is deactivated and not taking bookings.';
  if (d.verification_status !== 'VERIFIED') return 'This doctor is not verified for bookings yet.';
  if (d.branch_id && (await db.one("SELECT status FROM hospital_branches WHERE id = ?", [d.branch_id]) || {}).status === 'INACTIVE') return 'This doctor\'s branch is deactivated, so it is not taking bookings.';
  if (date < today) return 'That date has passed.';
  if (date >= addDays(today, rules.bookingWindowDays)) return `Bookings open ${rules.bookingWindowDays} days ahead.`;
  if (await onLeave(d.id, date)) return 'The doctor is on leave that day.';
  if (bookingCore.absentOn(d, date, h.timezone)) return date === today ? 'The doctor is marked absent today.' : 'The doctor is marked absent that day.';
  return null;
}

// Every slot of the doctor's day with what each channel can still book. A slot the front desk can
// no longer use (it has ended, or the whole day is closed) is `unavailable`; one with no seat left
// for walk-ins is `full`. `online` shows what the patient app sees for the same slot. `emergency` is history
// (emergencies over a full slot, migration 032); it is never available any more.
async function slots(hospitalId, doctorId, date) {
  if (!isDate(date)) throw badRequest('Choose a valid date (YYYY-MM-DD).', { date: 'Use YYYY-MM-DD.' });
  const { d, h } = await hospitalDoctor(hospitalId, doctorId);
  const blocker = await dayBlocker(d, h, date);
  const today = date === nowIn(h.timezone).date;
  const blocks = await bookingCore.schedulesOn(db, d.id, date);
  const load = await bookingCore.slotLoad(db, d.id, date);
  const items = [];
  for (const block of blocks) {
    for (const time of bookingCore.slotTimes(block)) {
      const end = hhmm(minutesOf(time) + block.slot_minutes);
      const seats = bookingCore.seatsFor(block, load.get(time));
      const ended = instant(date, end, h.timezone) <= Date.now();
      let status = 'available';
      if (blocker || ended) status = 'unavailable';
      else if (seats.seatsLeft.reception <= 0) status = 'full';
      items.push({
        time,
        start: isoAt(date, time, h.timezone),
        end: isoAt(date, end, h.timezone),
        capacity: seats.capacity,
        walkInSeats: seats.walkInSeats,
        booked: seats.booked,
        held: seats.held,
        seatsLeft: seats.seatsLeft.reception,
        status,
        online: { seatsLeft: seats.seatsLeft.online, status: status === 'unavailable' ? 'unavailable' : seats.seatsLeft.online > 0 ? 'available' : 'full' },
        emergency: {
          seats: seats.emergency.seats,
          booked: seats.emergency.booked,
          seatsLeft: seats.emergency.left,
          // Always false now: an emergency is no longer booked into a slot (see emergencyWalkIn.js). The counts are history.
          available: false,
        },
      });
    }
  }
  return { doctorId: d.id, date, closedReason: blocker, slots: items };
}

// Two spellings of one name: same letters once titles, spaces and punctuation are ignored, or the words of
// one are the leading words of the other ("Riya" and "Riya Sharma"; but "Raj" is not "Rajesh Kumar").
// The moment `minutes` after a slot's start, also when that is past midnight (hhmm() would give "24:05").
const instantPlus = (date, time, minutes, tz) => instant(date, '00:00', tz) + (minutesOf(time) + minutes) * 60000;

const nameWords = (s) => String(s || '').toLowerCase().replace(/\b(mr|mrs|ms|miss|dr|master|baby)\b\.?/g, ' ').split(/[^a-z]+/).filter(Boolean);
function sameName(a, b) {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return false;
  if (x.join('') === y.join('')) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w, i) => long[i] === w);
}

// The patient for a front-desk booking: an existing patient by id, or one found or registered by mobile
// number. A number on file is that person (their history stays in one place), but only when the name typed
// is theirs. A different name on a known number is a different person sharing the phone: the desk is told, and
// confirms with `differentPerson`, which registers them as their own patient pointing at the number's owner.
// Patients are shared across hospitals (one person, one record), so a desk only sees what it needs: a patient
// is "known here" once they have an appointment or a link with this hospital. Anyone else is shown masked.
async function knownHere(hospitalId, patientId) {
  const row = await db.one(
    `SELECT 1 AS ok FROM appointments WHERE patient_id = ? AND hospital_id = ?
     UNION SELECT 1 FROM patient_hospital_links WHERE patient_id = ? AND hospital_id = ? AND removed_at IS NULL LIMIT 1`,
    [patientId, hospitalId, patientId, hospitalId]
  );
  return !!row;
}
const maskName = (name) => String(name || '').split(/\s+/).filter(Boolean).map((w) => `${w[0]}${'*'.repeat(Math.max(1, Math.min(w.length - 1, 6)))}`).join(' ');

async function patientFor(input, hospitalId) {
  if (input && input.id) {
    const p = await db.one('SELECT * FROM patients WHERE id = ?', [String(input.id)]);
    if (!p || !(await knownHere(hospitalId, p.id))) throw badRequest('Patient not found.', { patientId: 'No patient with this ID.' });
    return p;
  }
  const name = String((input && input.name) || '').trim();
  if (name.length < 2 || name.length > 80) throw badRequest("Enter the patient's name.", { 'patient.name': '2 to 80 characters.' });
  let mobile;
  try { mobile = normalizePhone(input.mobile); } catch { throw badRequest('Enter a valid 10-digit mobile number.', { 'patient.mobile': 'A 10-digit mobile number.' }); }
  const gender = input.gender == null || input.gender === '' ? null : GENDERS[String(input.gender).toLowerCase()];
  if (gender === undefined) throw badRequest('Choose male, female or other.', { 'patient.gender': 'male, female or other.' });
  const dob = input.dateOfBirth ? String(input.dateOfBirth) : null;
  if (dob && !isDate(dob)) throw badRequest('Enter the date of birth as YYYY-MM-DD.', { 'patient.dateOfBirth': 'Use YYYY-MM-DD.' });

  // Look up and register in one transaction, so two desks registering at once get distinct ids
  // and the same number never becomes two patients.
  return db.tx(async (conn) => {
    const existing = await conn.one('SELECT * FROM patients WHERE mobile = ?', [mobile]);
    if (existing && (input.samePerson || sameName(existing.name, name))) return existing;
    if (existing && !input.differentPerson) {
      const known = await knownHere(hospitalId, existing.id);
      const shown = known ? existing.name : maskName(existing.name);
      throw conflict(`This number already belongs to ${shown}${known ? ` (${existing.id})` : ''}. Is ${name} the same person?`, {
        'patient.mobile': `Already registered to ${shown}.`, existingPatientName: shown, ...(known ? { existingPatientId: existing.id } : {}), existingPatientKnown: known,
      });
    }
    const id = await db.nextId('patients', 'PAT', 1001, conn);
    // A different person on a known number has no number of their own: they point at the patient it belongs to.
    await conn.query('INSERT INTO patients (id, name, mobile, gender, date_of_birth, contact_patient_id) VALUES (?, ?, ?, ?, ?, ?)', [id, name, existing ? null : mobile, gender, dob, existing ? existing.id : null]);
    return conn.one('SELECT * FROM patients WHERE id = ?', [id]);
  });
}

// GET /api/patients/lookup?mobile=: who is on file for a number, so the desk can pick them instead of retyping.
async function lookupByMobile(hospitalId, rawMobile) {
  let mobile;
  try { mobile = normalizePhone(rawMobile); } catch { throw badRequest('Enter a valid 10-digit mobile number.', { mobile: 'A 10-digit mobile number.' }); }
  const p = await db.one('SELECT * FROM patients WHERE mobile = ?', [mobile]);
  if (!p) return { patient: null, sharing: [] };
  if (!(await knownHere(hospitalId, p.id))) {
    // On the platform but never at this hospital: the desk gets a masked name only, no id, birth date or relatives.
    return { patient: { id: null, name: maskName(p.name), mobile: null, gender: null, dateOfBirth: null, appointmentsHere: 0, lastVisit: null, masked: true }, sharing: [] };
  }
  const [here, last] = await Promise.all([
    db.one("SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ? AND hospital_id = ?", [p.id, hospitalId]),
    db.one("SELECT appt_date FROM appointments WHERE patient_id = ? AND hospital_id = ? ORDER BY appt_date DESC LIMIT 1", [p.id, hospitalId]),
  ]);
  const sharing = await db.query('SELECT id, name FROM patients WHERE contact_patient_id = ? ORDER BY name', [p.id]);
  return {
    patient: { id: p.id, name: p.name, mobile: p.mobile, gender: p.gender, dateOfBirth: p.date_of_birth, appointmentsHere: Number(here.n), lastVisit: last ? last.appt_date : null },
    sharing: sharing.map((s) => ({ id: s.id, name: s.name })),
  };
}

// A full slot: the 409 carries `slotFull` so the desk can reload the grid.
const slotFull = () => conflict('This slot is full. Pick another time.', { time: 'This slot is full.', slotFull: true });

// Book a slot at the front desk. The seat and token are taken in one transaction, under the same
// head-count rules (and database triggers) as an app booking, so two desks, or a desk and the app,
// can never both get the last seat.
// An emergency walk-in is no longer booked into a slot: it is registered through services/emergencyWalkIn.js
// (POST /api/emergency/walk-ins). `emergency: true` here is refused with a pointer to it.
async function book(hospitalId, body = {}, user = null) {
  const date = String(body.date || '');
  const time = String(body.time || '');
  if (body.emergency === true) {
    throw new HttpError(410, 'Emergency booking into a slot has been replaced. Use Emergency Walk-in (POST /api/emergency/walk-ins): it needs no slot.', { emergency: 'Use POST /api/emergency/walk-ins.', useInstead: '/api/emergency/walk-ins' });
  }
  if (!isDate(date)) throw badRequest('Choose a valid date (YYYY-MM-DD).', { date: 'Use YYYY-MM-DD.' });
  if (!TIME_RE.test(time)) throw badRequest('Choose a slot time (HH:MM).', { time: 'Use HH:MM.' });
  const { d, h } = await hospitalDoctor(hospitalId, body.doctorId);
  const blocker = await dayBlocker(d, h, date);
  if (blocker) throw conflict(blocker);
  const block = bookingCore.blockFor(await bookingCore.schedulesOn(db, d.id, date), time);
  if (!block) throw badRequest(`${d.name} has no slot at ${time} on ${date}.`, { time: 'Not one of the doctor\'s slots that day.' });
  if (instantPlus(date, time, block.slot_minutes, h.timezone) <= Date.now()) throw conflict('That slot has already ended.');

  const patient = await patientFor(body.patientId ? { id: body.patientId } : body.patient, hospitalId);
  const sameDay = (conn) => conn.one(
    "SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ? AND appt_date = ? AND status IN ('confirmed','pending')",
    [patient.id, d.id, date]
  );
  const clashError = (clash) => conflict(`${patient.name} already has an appointment (${clash.id}) with ${d.name} that day.`, { appointmentId: clash.id });
  const early = await sameDay(db);
  if (early) throw clashError(early);
  const reason = String(body.reason || '').trim().slice(0, 300) || null;
  // How the booking came in, and who took it.
  const source = body.channel === 'phone' ? bookingCore.CHANNEL_SOURCE.phone : bookingCore.CHANNEL_SOURCE.reception;

  let apptId;
  try {
    apptId = await db.tx(async (conn) => {
      const again = await sameDay(conn); // re-checked under the write lock: two desks booking together
      if (again) throw clashError(again);
      const taken = await bookingCore.takeSeat(conn, { doctorId: d.id, date, time, channel: 'reception' });
      if (!taken) throw slotFull();
      const tokenNo = await bookingCore.slotTokenNumber(conn, { doctorId: d.id, date, time, seat: taken.seat });
      const id = await db.nextId('appointments', 'APT', 10001, conn);
      await conn.query(
        `INSERT INTO appointments (id, hospital_id, doctor_id, patient_id, appt_date, appt_time, seat_no, fee, currency, status, payment_status, source, token_no, reason_for_visit, booked_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'pending', ?, ?, ?, ?)`,
        [id, h.id, d.id, patient.id, date, time, taken.seat, d.fee, d.currency, source, tokenNo, reason, user ? user.id : null]
      );
      // The queue token comes with the booking: no separate "Generate Token" step.
      await bookingCore.issueQueueToken(conn, { hospitalId: h.id, appointmentId: id, doctorId: d.id, date, number: tokenNo });
      return id;
    });
  } catch (err) {
    if (bookingCore.isSlotFullError(err)) throw slotFull();
    throw err;
  }
  try { await events.fire('NEW_APPOINTMENT', apptId); } catch (err) { console.error('notification NEW_APPOINTMENT failed', err.message); }
  return appointmentModel.findById(hospitalId, apptId);
}


// ---------------------------------------------------------------- after booking: reschedule, no-show, corrections

async function ownAppointment(hospitalId, id) {
  const a = await db.one('SELECT * FROM appointments WHERE id = ? AND hospital_id = ?', [String(id || ''), hospitalId]);
  if (!a) throw notFound('Appointment not found.');
  return a;
}

const liveToken = (conn, appointmentId) => conn.one("SELECT id, status FROM tokens WHERE appointment_id = ? AND status IN ('waiting', 'called', 'in_consultation', 'skipped')", [appointmentId]);

// POST /api/appointments/:id/reschedule { date, time }: moves the appointment to another slot of the same doctor,
// keeping its payment. The seat is taken under the front desk's seat rules (the patient app's own limit of one
// reschedule does not bind staff), the token follows the new day, and the patient and doctor are told.
async function reschedule(hospitalId, id, body = {}, user = null) {
  const a = await ownAppointment(hospitalId, id);
  if (a.status !== 'confirmed' && a.status !== 'pending') throw conflict(`A ${a.status} appointment can't be rescheduled.`);
  if (a.no_show) throw conflict('This appointment is marked as a no-show. Undo the no-show before rescheduling.');
  if (a.is_emergency) throw conflict('An emergency walk-in has no slot to move. Cancel it and register again if needed.');
  const date = String(body.date || '');
  const time = String(body.time || '');
  if (!isDate(date)) throw badRequest('Choose a valid date (YYYY-MM-DD).', { date: 'Use YYYY-MM-DD.' });
  if (!TIME_RE.test(time)) throw badRequest('Choose a slot time (HH:MM).', { time: 'Use HH:MM.' });
  if (date === a.appt_date && time === a.appt_time) throw badRequest('Pick a different time.', { time: 'That is the current slot.' });
  const { d, h } = await hospitalDoctor(hospitalId, a.doctor_id);
  const blocker = await dayBlocker(d, h, date);
  if (blocker) throw conflict(blocker);
  const block = bookingCore.blockFor(await bookingCore.schedulesOn(db, d.id, date), time);
  if (!block) throw badRequest(`${d.name} has no slot at ${time} on ${date}.`, { time: 'Not one of the doctor\'s slots that day.' });
  if (instantPlus(date, time, block.slot_minutes, h.timezone) <= Date.now()) throw conflict('That slot has already ended.');
  const sameDay = (conn) => conn.one("SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ? AND appt_date = ? AND status IN ('confirmed','pending') AND id <> ?", [a.patient_id, d.id, date, a.id]);
  const clashError = (clash) => conflict(`The patient already has an appointment (${clash.id}) with ${d.name} that day.`, { appointmentId: clash.id });
  const early = await sameDay(db);
  if (early) throw clashError(early);

  try {
    await db.tx(async (conn) => {
      // A patient already called or with the doctor can't be moved; a token still waiting moves with the booking.
      const live = await liveToken(conn, a.id);
      if (live && ['called', 'in_consultation'].includes(live.status)) throw conflict('The patient has been called or is with the doctor, so this appointment can no longer be moved.');
      const again = await sameDay(conn); // re-checked under the write lock
      if (again) throw clashError(again);
      // Its tokens are tied to the appointment's day by a foreign key, so they go before the day changes.
      await conn.query("DELETE FROM tokens WHERE appointment_id = ? AND status IN ('waiting', 'skipped', 'cancelled')", [a.id]);
      const taken = await bookingCore.takeSeat(conn, { doctorId: d.id, date, time, channel: 'reception', ignoreAppointmentId: a.id });
      if (!taken) throw conflict('This slot is full. Pick another time.');
      const tokenNo = await bookingCore.slotTokenNumber(conn, { doctorId: d.id, date, time, seat: taken.seat, ignoreAppointmentId: a.id });
      const moved = await conn.query(
        `UPDATE appointments SET appt_date = ?, appt_time = ?, seat_no = ?, token_no = ?, reschedule_count = reschedule_count + 1,
           rescheduled_from_date = ?, rescheduled_from_time = ? WHERE id = ? AND status IN ('confirmed', 'pending') AND appt_date = ? AND appt_time = ?`,
        [date, time, taken.seat, tokenNo, a.appt_date, a.appt_time, a.id, a.appt_date, a.appt_time]
      );
      if (!moved.affectedRows) throw conflict('This appointment changed while you were looking at it. Refresh and try again.');
      await bookingCore.issueQueueToken(conn, { hospitalId: a.hospital_id, appointmentId: a.id, doctorId: d.id, date, number: tokenNo });
    });
  } catch (err) {
    if (bookingCore.isSlotFullError(err)) throw conflict('This slot is full. Pick another time.');
    throw err;
  }
  try { await events.fire('APPOINTMENT_RESCHEDULED', a.id); } catch (err) { console.error('notification APPOINTMENT_RESCHEDULED failed', err.message); }
  await auditLog.record({ req: { user: user || {} }, action: 'APPOINTMENT_RESCHEDULED', entityType: 'APPOINTMENT', entityId: a.id, summary: `Rescheduled ${a.id} from ${a.appt_date} ${a.appt_time} to ${date} ${time}`, previousValue: { date: a.appt_date, time: a.appt_time }, newValue: { date, time } });
  return appointmentModel.findById(hospitalId, a.id);
}

// POST /api/appointments/:id/no-show: the patient did not come. Only on the day, and only once the slot started
// more than the platform's grace period ago. The queue token is cancelled so the doctor does not call them; it
// does not complete the appointment, and it is not a cancellation (nothing is refunded). Undo is possible the same day.
async function markNoShow(hospitalId, id, user = null) {
  const a = await ownAppointment(hospitalId, id);
  const { h } = await hospitalDoctor(hospitalId, a.doctor_id);
  if (a.emergency_walkin) throw conflict('An emergency walk-in cannot be a no-show. Cancel it if the patient has left.');
  if (a.no_show) throw conflict('This appointment is already marked as a no-show.');
  if (a.status !== 'confirmed') throw conflict(a.status === 'pending' ? 'Confirm the appointment first.' : `A ${a.status} appointment can't be a no-show.`);
  if (a.appt_date !== appointmentModel.todayIn(h.timezone)) throw conflict(a.appt_date > appointmentModel.todayIn(h.timezone) ? 'The appointment is not today yet, so the patient can\'t be a no-show.' : 'A no-show can only be marked on the day of the appointment.');
  const grace = await platformSetting('no_show_grace_minutes');
  const opens = instantPlus(a.appt_date, a.appt_time, grace, h.timezone);
  if (Date.now() < opens) {
    const wait = Math.ceil((opens - Date.now()) / 60000);
    throw conflict(`The slot started at ${a.appt_time}. A no-show can be marked ${grace} minutes after that: in ${wait} minute${wait === 1 ? '' : 's'}.`);
  }
  await db.tx(async (conn) => {
    const token = await liveToken(conn, a.id);
    if (token && token.status === 'in_consultation') throw conflict('The patient is with the doctor now, so they are not a no-show.');
    const done = await conn.query("UPDATE appointments SET no_show = 1 WHERE id = ? AND status = 'confirmed' AND no_show = 0", [a.id]);
    if (!done.affectedRows) throw conflict('This appointment changed while you were looking at it. Refresh and try again.');
    await conn.query("UPDATE tokens SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE appointment_id = ? AND status IN ('waiting', 'called', 'skipped')", [a.id]);
  });
  await auditLog.record({ req: { user: user || {} }, action: 'APPOINTMENT_NO_SHOW', entityType: 'APPOINTMENT', entityId: a.id, summary: `Marked ${a.id} as a no-show` });
  return appointmentModel.findById(hospitalId, a.id);
}

// DELETE /api/appointments/:id/no-show: the patient did come after all (same day). Their queue token is restored
// under its own number.
async function undoNoShow(hospitalId, id, user = null) {
  const a = await ownAppointment(hospitalId, id);
  const { h } = await hospitalDoctor(hospitalId, a.doctor_id);
  if (!a.no_show) throw conflict('This appointment is not marked as a no-show.');
  if (a.appt_date !== appointmentModel.todayIn(h.timezone)) throw conflict('A no-show can only be undone on the day of the appointment.');
  // The patient came after all: back in the queue under their own token number.
  await db.tx(async (conn) => {
    const done = await conn.query('UPDATE appointments SET no_show = 0 WHERE id = ? AND no_show = 1', [a.id]);
    if (!done.affectedRows) return;
    let number = a.token_no;
    const held = number && await conn.one("SELECT 1 FROM tokens WHERE doctor_id = ? AND token_date = ? AND number = ? AND status <> 'cancelled' AND appointment_id <> ?", [a.doctor_id, a.appt_date, number, a.id]);
    if (!number || held) {
      number = await bookingCore.slotTokenNumber(conn, { doctorId: a.doctor_id, date: a.appt_date, time: a.appt_time, seat: a.seat_no, ignoreAppointmentId: a.id });
      await conn.query('UPDATE appointments SET token_no = ? WHERE id = ?', [number, a.id]);
    }
    await bookingCore.issueQueueToken(conn, { hospitalId: a.hospital_id, appointmentId: a.id, doctorId: a.doctor_id, date: a.appt_date, number });
  });
  await auditLog.record({ req: { user: user || {} }, action: 'APPOINTMENT_NO_SHOW_UNDONE', entityType: 'APPOINTMENT', entityId: a.id, summary: `Undid the no-show on ${a.id}` });
  return appointmentModel.findById(hospitalId, a.id);
}

// PATCH /api/appointments/:id { reason?, patient?: { name?, mobile?, gender?, dateOfBirth? } }
// Fixes what the desk typed wrong. The patient's own details can only be corrected for someone registered at a
// front desk; a patient with a Gmedic app account owns their details, so only the reason for visit changes there.
async function updateDetails(hospitalId, id, body = {}, user = null) {
  const a = await ownAppointment(hospitalId, id);
  const changes = [];
  if (body.reason !== undefined) {
    const reason = String(body.reason || '').trim().slice(0, 300) || null;
    if (reason !== (a.reason_for_visit || null)) { await db.query('UPDATE appointments SET reason_for_visit = ? WHERE id = ?', [reason, a.id]); changes.push('reason for visit'); }
  }
  if (body.patient && typeof body.patient === 'object') {
    const p = await db.one('SELECT * FROM patients WHERE id = ?', [a.patient_id]);
    if (p.account_user_id) throw conflict('This patient has their own Gmedic app account, so their details are theirs to change in the app.');
    const elsewhere = await db.one('SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ? AND hospital_id <> ?', [p.id, hospitalId]);
    if (Number(elsewhere.n)) throw conflict('This patient also visits other hospitals, so their details cannot be changed from here.');
    const sets = [];
    const params = [];
    const errors = {};
    const input = body.patient;
    if (input.name !== undefined) {
      const name = String(input.name || '').trim();
      if (name.length < 2 || name.length > 80) errors['patient.name'] = '2 to 80 characters.'; else if (name !== p.name) { sets.push('name = ?'); params.push(name); }
    }
    if (input.mobile !== undefined) {
      let mobile = null;
      if (String(input.mobile || '').trim()) { try { mobile = normalizePhone(input.mobile); } catch { errors['patient.mobile'] = 'A 10-digit mobile number.'; } }
      if (!errors['patient.mobile'] && mobile !== p.mobile) {
        const owner = mobile && await db.one('SELECT id, name FROM patients WHERE mobile = ? AND id <> ?', [mobile, p.id]);
        if (owner) errors['patient.mobile'] = `Already registered to ${owner.name} (${owner.id}).`; else { sets.push('mobile = ?'); params.push(mobile); }
      }
    }
    if (input.gender !== undefined) {
      const gender = input.gender === '' || input.gender === null ? null : GENDERS[String(input.gender).toLowerCase()];
      if (gender === undefined) errors['patient.gender'] = 'male, female or other.'; else if (gender !== p.gender) { sets.push('gender = ?'); params.push(gender); }
    }
    if (input.dateOfBirth !== undefined) {
      const dob = input.dateOfBirth ? String(input.dateOfBirth) : null;
      if (dob && (!isDate(dob) || dob > nowIn(undefined).date)) errors['patient.dateOfBirth'] = 'A date in the past, YYYY-MM-DD.'; else if (dob !== p.date_of_birth) { sets.push('date_of_birth = ?'); params.push(dob); }
    }
    if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
    if (sets.length) { await db.query(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`, [...params, p.id]); changes.push('patient details'); }
  }
  if (!changes.length) return { appointment: await appointmentModel.findById(hospitalId, a.id), changed: false };
  await auditLog.record({ req: { user: user || {} }, action: 'APPOINTMENT_DETAILS_UPDATED', entityType: 'APPOINTMENT', entityId: a.id, summary: `Corrected ${changes.join(' and ')} on ${a.id}` });
  return { appointment: await appointmentModel.findById(hospitalId, a.id), changed: true };
}

// ---------------------------------------------------------------- collecting the fee at the front desk

// The ways a patient can pay at the desk (payments.method accepts these).
const DESK_METHODS = ['Cash', 'UPI', 'Card'];

// POST /api/appointments/:id/payment { method: 'Cash' | 'UPI' | 'Card', reference? }
// Records the consultation fee taken at the hospital: a PAID CONSULTATION payment on gateway FRONT_DESK (the
// appointment turns paid by itself, and a receipt number is issued). This is the whole fee, also for app bookings
// (their booking token is Gmedic's and separate). The money never passes through Gmedic, so a refund of it is the
// hospital's own to give back.
async function collectPayment(hospitalId, id, body = {}, user = null) {
  const a = await ownAppointment(hospitalId, id);
  if (a.status === 'cancelled') throw conflict('This appointment is cancelled, so there is nothing to collect.');
  if (a.payment_status === 'paid') throw conflict('This appointment is already paid.');
  const method = DESK_METHODS.find((m) => m.toLowerCase() === String(body.method || '').toLowerCase());
  if (!method) throw badRequest('Choose how the patient paid: cash, UPI or card.', { method: 'Choose cash, UPI or card.' });
  const reference = String(body.reference || '').trim().slice(0, 60) || null;
  if (method !== 'Cash' && (!reference || reference.length < 4)) throw badRequest(`Enter the ${method === 'UPI' ? 'UPI reference' : 'card slip or approval number'}.`, { reference: 'Enter the reference from the payment.' });
  try {
    await db.tx(async (conn) => {
      if (await conn.one("SELECT 1 FROM payments WHERE appointment_id = ? AND status = 'PAID' AND purpose = 'CONSULTATION'", [a.id])) throw conflict('This appointment is already paid.');
      const payId = await db.nextId('payments', 'PAY', 20001, conn);
      await conn.query(
        `INSERT INTO payments (id, appointment_id, purpose, consultation_amount, convenience_fee, tax_amount, amount, currency, method, gateway, gateway_order_id, transaction_id, status, paid_at)
         VALUES (?, ?, 'CONSULTATION', ?, 0, 0, ?, ?, ?, 'FRONT_DESK', ?, ?, 'PAID', datetime('now'))`,
        [payId, a.id, a.fee, a.fee, a.currency, method, reference, `FD${crypto.randomInt(1e9, 1e10)}`]
      );
    });
  } catch (err) {
    if (/UNIQUE constraint failed: payments/i.test(String(err.message))) throw conflict('This appointment is already paid.');
    throw err;
  }
  try { await events.fire('PAYMENT_SUCCESS', a.id); } catch (err) { console.error('notification PAYMENT_SUCCESS failed', err.message); }
  await auditLog.record({ req: { user: user || {} }, action: 'PAYMENT_COLLECTED_AT_DESK', entityType: 'APPOINTMENT', entityId: a.id, summary: `Collected ₹${a.fee} by ${method}${reference ? ` (${reference})` : ''} for ${a.id}` });
  return appointmentModel.findById(hospitalId, a.id);
}

// ------------------------------------------------------------------ walk-in seats

const blockJson = (b) => ({
  scheduleId: b.id,
  dayOfWeek: b.day_of_week,
  startTime: b.start_time,
  endTime: b.end_time,
  slotMinutes: b.slot_minutes,
  capacityPerSlot: b.capacity_per_slot,
  walkInSeats: bookingCore.walkInSeatsOf(b),
  onlineSeats: bookingCore.onlineQuotaOf(b),
  emergencySeats: bookingCore.emergencySeatsOf(b),
  effectiveFrom: b.effective_from || null,
  effectiveTo: b.effective_to || null,
});

// Blocks in force today or later (a block ended in the past is history).
async function currentBlocks(d, h) {
  const today = nowIn(h.timezone).date;
  return db.query(
    'SELECT * FROM doctor_schedules WHERE doctor_id = ? AND (effective_to IS NULL OR effective_to >= ?) ORDER BY day_of_week, start_time, effective_from',
    [d.id, today]
  );
}

async function walkInSeats(hospitalId, doctorId) {
  const { d, h } = await hospitalDoctor(hospitalId, doctorId);
  return { doctorId: d.id, blocks: (await currentBlocks(d, h)).map(blockJson) };
}

// Hold back `walkInSeats` of every slot in a block (or in all of the doctor's blocks) for the front
// desk. It applies at once and only limits new app bookings: appointments already made stay, and a
// slot whose app bookings are over the new online share simply shows as full in the app.
// `emergencySeats` (0-3, optional) is how many emergency walk-ins a full slot can still take; it
// applies at once too, and emergencies already booked stay.
async function setWalkInSeats(hospitalId, doctorId, body = {}) {
  const { d, h } = await hospitalDoctor(hospitalId, doctorId);
  const hasWalkIn = body.walkInSeats !== undefined;
  const hasEmergency = body.emergencySeats !== undefined;
  if (!hasWalkIn && !hasEmergency) throw badRequest('Send walkInSeats, emergencySeats or both.');
  const seats = Number(body.walkInSeats);
  if (hasWalkIn && (!Number.isInteger(seats) || seats < 0 || seats > 50)) throw badRequest('Walk-in seats must be a whole number from 0 to 50.', { walkInSeats: 'Enter 0 to 50.' });
  const emergency = Number(body.emergencySeats);
  if (hasEmergency && (!Number.isInteger(emergency) || emergency < 0 || emergency > 3)) throw badRequest('Emergency seats must be 0, 1, 2 or 3.', { emergencySeats: 'Enter 0 to 3.' });
  let blocks = await currentBlocks(d, h);
  if (body.scheduleId != null && body.scheduleId !== '') {
    blocks = blocks.filter((b) => String(b.id) === String(body.scheduleId));
    if (!blocks.length) throw notFound('Schedule block not found.');
  }
  if (!blocks.length) throw badRequest(`${d.name} has no working hours set yet.`);
  const tooSmall = hasWalkIn && blocks.find((b) => seats > b.capacity_per_slot);
  if (tooSmall) {
    throw badRequest(
      `${seats} walk-in seats is more than the ${tooSmall.capacity_per_slot} patients per slot from ${tooSmall.start_time} to ${tooSmall.end_time}.`,
      { walkInSeats: `At most ${tooSmall.capacity_per_slot} for that block.` }
    );
  }
  await db.tx(async (conn) => {
    for (const b of blocks) {
      if (hasWalkIn) await conn.query('UPDATE doctor_schedules SET online_quota = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [seats === 0 ? null : b.capacity_per_slot - seats, b.id]);
      if (hasEmergency) await conn.query('UPDATE doctor_schedules SET emergency_seats = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [emergency, b.id]);
    }
  });
  return walkInSeats(hospitalId, doctorId);
}

module.exports = { hospitalDoctor, dayBlocker, patientFor, slots, book, collectPayment, lookupByMobile, reschedule, markNoShow, undoNoShow, updateDetails, walkInSeats, setWalkInSeats, blockJson, sameName };
