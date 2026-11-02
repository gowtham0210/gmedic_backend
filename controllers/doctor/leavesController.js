// A doctor's leave (days away). Adding or extending leave over days that already have bookings shows
// them first and needs the doctor to confirm: they can cancel those bookings (patients refunded and
// told, services/patient/booking.doctorCancel) or keep them for the front desk to move. The front desk
// is told about every change. A leave is withdrawn (cancelled_at), never deleted, and one that has
// started can only be shortened, so attendance history stays true.

const db = require('../../db');
const booking = require('../../services/patient/booking');
const notifications = require('../../services/notificationService');
const auditLog = require('../../services/auditLog');
const { todayIn } = require('../../models/appointmentModel');
const { HttpError, badRequest, notFound } = require('../../utils/http');
const { isISODate } = require('../../utils/dates');

const toLeave = (r, today) => ({
  id: r.id, doctorId: r.doctor_id, startDate: r.start_date, endDate: r.end_date, reason: r.reason,
  started: r.start_date <= today, ended: r.end_date < today,
});

async function doctorInfo(req) {
  return db.one('SELECT d.id, d.name, d.hospital_id, h.timezone FROM doctors d JOIN hospitals h ON h.id = d.hospital_id WHERE d.id = ?', [req.doctorId]);
}

// Bookings still to happen between two dates (inclusive).
async function bookedBetween(doctorId, from, to) {
  const rows = await db.query(
    `SELECT a.id, a.appt_date, a.appt_time, p.name AS patient_name, a.payment_status FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.doctor_id = ? AND a.appt_date BETWEEN ? AND ? AND a.status IN ('confirmed', 'pending') AND a.no_show = 0
      ORDER BY a.appt_date, a.appt_time`,
    [doctorId, from, to]
  );
  return rows.map((r) => ({ id: r.id, date: r.appt_date, time: r.appt_time, patientName: r.patient_name, paid: r.payment_status === 'paid' }));
}

const fmt = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const datesText = (from, to) => (from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`);

async function tellFrontDesk(doctor, change, from, to, keptCount) {
  await notifications.trigger('DOCTOR_LEAVE_CHANGED', await notifications.hospitalUsers(doctor.hospital_id, 'RECEPTIONIST'), {
    doctor_name: doctor.name.replace(/^Dr\.?\s*/i, ''), leave_change: change, leave_dates: datesText(from, to),
    booked_summary: keptCount ? `${keptCount} booked appointment${keptCount === 1 ? ' needs' : 's need'} to be moved or cancelled.` : 'No booked appointments are affected.',
  }, { link: `/doctors/${doctor.id}` });
}

function readDates(body, { today, started = false, current = null }) {
  const startDate = started ? current.start_date : body.startDate;
  const { endDate } = body;
  const fields = {};
  if (!isISODate(startDate)) fields.startDate = 'Enter a valid start date.';
  if (!isISODate(endDate)) fields.endDate = 'Enter a valid end date.';
  if (Object.keys(fields).length) throw badRequest('Please correct the highlighted fields.', fields);
  if (endDate < startDate) throw badRequest('End date must not be before the start date.', { endDate: 'Must be on or after the start date.' });
  if (endDate < today) throw badRequest('Leave must not end in the past.', { endDate: 'Choose today or a later date.' });
  if (!started && startDate < today) throw badRequest('A new leave can\'t start in the past.', { startDate: 'Choose today or a later date.' });
  const reason = body.reason == null ? null : String(body.reason).trim();
  if (reason && reason.length > 200) throw badRequest('Reason is too long.', { reason: 'Keep it under 200 characters.' });
  return { startDate, endDate, reason: reason || null };
}

const shift = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// Days the new dates add over the old ones (a whole new leave adds all of them).
function addedRanges(next, prev) {
  if (!prev) return [[next.startDate, next.endDate]];
  const out = [];
  if (next.startDate < prev.start_date) out.push([next.startDate, shift(prev.start_date, -1)]);
  if (next.endDate > prev.end_date) out.push([shift(prev.end_date, 1), next.endDate]);
  return out;
}

// Booked appointments on the days being added. Without confirmBooked this is the 409 that asks for confirmation.
async function bookedOn(doctor, ranges, body) {
  const seen = new Set();
  const booked = [];
  for (const [from, to] of ranges) for (const b of await bookedBetween(doctor.id, from, to)) if (!seen.has(b.id)) { seen.add(b.id); booked.push(b); }
  if (booked.length && !body.confirmBooked) {
    throw new HttpError(409, `${booked.length} appointment${booked.length === 1 ? ' is' : 's are'} already booked on these days. Confirm what should happen to ${booked.length === 1 ? 'it' : 'them'}.`, { booked });
  }
  return booked;
}

// Once the leave itself is saved: cancel the booked appointments if the doctor chose to. A booking that can't be
// cancelled for a rule (already cancelled, in consultation) is left for the desk; anything else is a real error.
async function cancelBooked(req, doctor, booked, body) {
  let cancelled = 0;
  let refunded = false;
  if (booked.length && body.cancelBooked) {
    for (const b of booked) {
      try {
        const quote = await booking.doctorCancelQuote(doctor.id, b.id);
        await booking.doctorCancel(doctor.id, b.id, 'The doctor is on leave that day.', req.user.id);
        cancelled += 1;
        if (quote && quote.refundPaise > 0) refunded = true;
      } catch (err) {
        if (!err || !err.status || err.status >= 500) throw err;
      }
    }
  }
  return { booked: booked.length, cancelled, kept: booked.length - cancelled, refunded };
}

const summary = (r) => (r.cancelled ? ` ${r.cancelled} booked appointment${r.cancelled === 1 ? ' was' : 's were'} cancelled${r.refunded ? ' and refunded' : ''}; the patients are told.` : '')
  + (r.kept ? ` ${r.kept} booked appointment${r.kept === 1 ? ' is' : 's are'} kept; the front desk is asked to move ${r.kept === 1 ? 'it' : 'them'}.` : '');

// GET /api/doctor/leaves: current and upcoming first, then past; withdrawn leaves are not listed.
exports.list = async (req, res) => {
  const doctor = await doctorInfo(req);
  const today = todayIn(doctor.timezone);
  const rows = await db.query('SELECT * FROM doctor_leaves WHERE doctor_id = ? AND cancelled_at IS NULL ORDER BY (end_date < ?) , start_date', [req.doctorId, today]);
  const items = [];
  for (const r of rows) items.push({ ...toLeave(r, today), bookedAppointments: r.end_date >= today ? (await bookedBetween(req.doctorId, r.start_date < today ? today : r.start_date, r.end_date)).length : 0 });
  res.json({ items, today });
};

// GET /api/doctor/leaves/impact?startDate=&endDate=&id=: bookings on the days a new leave (or an edit of
// leave `id`) would add, before the doctor confirms.
exports.impact = async (req, res) => {
  const doctor = await doctorInfo(req);
  const today = todayIn(doctor.timezone);
  const current = req.query.id ? await db.one('SELECT * FROM doctor_leaves WHERE id = ? AND doctor_id = ? AND cancelled_at IS NULL', [req.query.id, req.doctorId]) : null;
  const next = readDates(req.query, { today, started: !!(current && current.start_date <= today), current });
  const booked = [];
  for (const [from, to] of addedRanges(next, current)) booked.push(...await bookedBetween(req.doctorId, from, to));
  res.json({ booked });
};

// POST /api/doctor/leaves { startDate, endDate, reason?, confirmBooked?, cancelBooked? }
exports.create = async (req, res) => {
  const doctor = await doctorInfo(req);
  const today = todayIn(doctor.timezone);
  const value = readDates(req.body || {}, { today });
  const clash = await db.one('SELECT 1 FROM doctor_leaves WHERE doctor_id = ? AND cancelled_at IS NULL AND start_date <= ? AND ? <= end_date', [req.doctorId, value.endDate, value.startDate]);
  if (clash) throw badRequest('This leave overlaps with an existing one.', { startDate: 'Overlaps another leave.' });
  const booked = await bookedOn(doctor, [[value.startDate, value.endDate]], req.body || {});
  const r = await db.query('INSERT INTO doctor_leaves (doctor_id, start_date, end_date, reason, created_by) VALUES (?, ?, ?, ?, ?)', [req.doctorId, value.startDate, value.endDate, value.reason, req.user.id]);
  const outcome = await cancelBooked(req, doctor, booked, req.body || {});
  await tellFrontDesk(doctor, 'leave added', value.startDate, value.endDate, outcome.kept);
  await auditLog.record({ req, action: 'DOCTOR_LEAVE_ADDED', entityType: 'DOCTOR', entityId: doctor.id, summary: `${doctor.name}: leave ${datesText(value.startDate, value.endDate)}${outcome.booked ? `; ${outcome.cancelled} booking(s) cancelled, ${outcome.kept} kept` : ''}` });
  res.json({ ok: true, message: `Leave added.${summary(outcome)}`, id: Number(r.insertId), ...outcome });
};

// PATCH /api/doctor/leaves/:id { startDate?, endDate, reason?, confirmBooked?, cancelBooked? }
// A leave that has started keeps its start date; it can be shortened (end today) or extended.
exports.update = async (req, res) => {
  const doctor = await doctorInfo(req);
  const today = todayIn(doctor.timezone);
  const current = await db.one('SELECT * FROM doctor_leaves WHERE id = ? AND doctor_id = ? AND cancelled_at IS NULL', [req.params.id, req.doctorId]);
  if (!current) throw notFound('Leave not found.');
  if (current.end_date < today) throw badRequest('This leave is over and stays as it was.');
  const started = current.start_date <= today;
  const body = req.body || {};
  if (started && body.startDate && body.startDate !== current.start_date) throw badRequest('This leave has already started, so its start date stays. You can change when it ends.', { startDate: 'Already started.' });
  const value = readDates({ ...body, startDate: body.startDate || current.start_date, endDate: body.endDate || current.end_date, reason: body.reason === undefined ? current.reason : body.reason }, { today, started, current });
  if (value.startDate === current.start_date && value.endDate === current.end_date && value.reason === (current.reason || null)) return res.json({ ok: true, message: 'No changes to save.' });
  const clash = await db.one('SELECT 1 FROM doctor_leaves WHERE doctor_id = ? AND id <> ? AND cancelled_at IS NULL AND start_date <= ? AND ? <= end_date', [req.doctorId, current.id, value.endDate, value.startDate]);
  if (clash) throw badRequest('These dates overlap another leave.', { endDate: 'Overlaps another leave.' });
  const booked = await bookedOn(doctor, addedRanges(value, current), body);
  await db.query('UPDATE doctor_leaves SET start_date = ?, end_date = ?, reason = ? WHERE id = ?', [value.startDate, value.endDate, value.reason, current.id]);
  const outcome = await cancelBooked(req, doctor, booked, body);
  await tellFrontDesk(doctor, `leave changed from ${datesText(current.start_date, current.end_date)} to`, value.startDate, value.endDate, outcome.kept);
  await auditLog.record({ req, action: 'DOCTOR_LEAVE_CHANGED', entityType: 'DOCTOR', entityId: doctor.id, summary: `${doctor.name}: leave ${datesText(current.start_date, current.end_date)} -> ${datesText(value.startDate, value.endDate)}`,
    previousValue: { startDate: current.start_date, endDate: current.end_date, reason: current.reason }, newValue: value });
  res.json({ ok: true, message: `Leave updated.${summary(outcome)}`, ...outcome });
};

// DELETE /api/doctor/leaves/:id: withdraw a leave that hasn't started (kept as history, not deleted).
exports.remove = async (req, res) => {
  const doctor = await doctorInfo(req);
  const today = todayIn(doctor.timezone);
  const current = await db.one('SELECT * FROM doctor_leaves WHERE id = ? AND doctor_id = ? AND cancelled_at IS NULL', [req.params.id, req.doctorId]);
  if (!current) throw notFound('Leave not found.');
  if (current.start_date <= today) throw badRequest(current.end_date < today ? 'This leave is over and stays in your history.' : 'This leave has started. Change its end date to today instead.');
  await db.query('UPDATE doctor_leaves SET cancelled_at = CURRENT_TIMESTAMP, cancelled_by = ? WHERE id = ? AND cancelled_at IS NULL', [req.user.id, current.id]);
  await tellFrontDesk(doctor, 'leave withdrawn, available again', current.start_date, current.end_date, 0);
  await auditLog.record({ req, action: 'DOCTOR_LEAVE_WITHDRAWN', entityType: 'DOCTOR', entityId: doctor.id, summary: `${doctor.name}: withdrew leave ${datesText(current.start_date, current.end_date)}` });
  res.json({ ok: true, message: 'Leave withdrawn. You can be booked on those days again.' });
};
