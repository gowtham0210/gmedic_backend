const config = require('../config');
const doctorModel = require('../models/doctorModel');
const appointmentModel = require('../models/appointmentModel');
const { validate } = require('../utils/validate');
const { badRequest, notFound } = require('../utils/http');
const db = require('../db');
const auditLog = require('../services/auditLog');

const schema = () => ({
  name: {
    label: 'Doctor name',
    required: true,
    minLength: 3,
    maxLength: 60,
    pattern: /^(dr\.?\s*)?[A-Za-z][A-Za-z .'-]*$/i,
    message: 'Name can only contain letters, spaces, dots and hyphens.',
  },
  specialization: { label: 'Specialist', type: 'enum', required: true, values: config.specializations, message: 'Choose a specialisation from the list.' },
  fee: { label: 'Appointment fee', type: 'number', required: true, integer: true, min: 50, max: 20000 },
  availability: { label: 'Availability', type: 'enum', required: true, values: doctorModel.AVAILABILITY, message: 'Choose Present or Absent / On Leave.' },
});

async function withStats(hospitalId, doctor) {
  const today = await appointmentModel.hospitalToday(hospitalId);
  const mine = await appointmentModel.query(hospitalId, { doctorId: doctor.id });
  const todays = mine.filter((a) => a.date === today && a.status !== 'cancelled');
  return {
    ...doctor,
    stats: {
      today: todays.length,
      upcoming: mine.filter((a) => a.date > today && a.status !== 'cancelled').length,
      completed: mine.filter((a) => a.status === 'completed').length,
    },
  };
}

exports.list = async (req, res) => {
  const { q, specialization, availability } = req.query;
  const doctors = await doctorModel.list(req.hospitalId, { q, specialization, availability });
  const everyone = (await doctorModel.all(req.hospitalId)).filter((d) => d.status !== 'INACTIVE');
  const today = await appointmentModel.hospitalToday(req.hospitalId);
  const counts = new Map();
  const todaysAppts = await appointmentModel.query(req.hospitalId, { date: today });
  for (const a of todaysAppts) {
    if (a.status !== 'cancelled') counts.set(a.doctorId, (counts.get(a.doctorId) || 0) + 1);
  }
  res.json({
    doctors: doctors.map((d) => ({ ...d, todayAppointments: counts.get(d.id) || 0 })),
    summary: {
      total: everyone.length,
      present: everyone.filter((d) => d.availability === 'present').length,
      absent: everyone.filter((d) => d.availability === 'absent').length,
    },
    specializations: config.specializations,
  });
};

exports.get = async (req, res) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  const today = await appointmentModel.hospitalToday(req.hospitalId);
  const rows = await appointmentModel.query(req.hospitalId, { doctorId: doctor.id, from: today });
  const schedule = appointmentModel.sortRows(rows, 'date_asc').slice(0, 8);
  // Leaves still to come (or running), with how many appointments are booked inside each, so the desk can see them.
  const leaveRows = await db.query('SELECT id, start_date, end_date, reason FROM doctor_leaves WHERE doctor_id = ? AND cancelled_at IS NULL AND end_date >= ? ORDER BY start_date', [doctor.id, today]);
  const leaves = [];
  for (const l of leaveRows) {
    const booked = await db.one("SELECT COUNT(*) AS n FROM appointments WHERE doctor_id = ? AND appt_date BETWEEN ? AND ? AND status IN ('confirmed', 'pending')", [doctor.id, l.start_date, l.end_date]);
    leaves.push({ id: l.id, startDate: l.start_date, endDate: l.end_date, reason: l.reason, bookedAppointments: Number(booked.n) });
  }
  const login = await doctorLogin.of(doctor.id);
  const portalLogin = login && { status: login.status, email: login.email, lastLoginAt: login.lastLoginAt, mustChangePassword: login.mustChangePassword };
  res.json({ doctor: { ...(await withStats(req.hospitalId, doctor)), portalLogin }, schedule, leaves });
};

exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, schema());
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const doctor = await doctorModel.create(req.hospitalId, value);
  res.status(201).json({ ok: true, message: `${doctor.name} has been added.`, doctor });
};

exports.update = async (req, res) => {
  if (!(await doctorModel.findById(req.hospitalId, req.params.id))) throw notFound('Doctor not found.');
  const { value, errors, ok } = validate(req.body, schema(), { partial: true });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const doctor = await doctorModel.update(req.hospitalId, req.params.id, value);
  res.json({ ok: true, message: `${doctor.name}'s details were saved.`, doctor: await withStats(req.hospitalId, doctor) });
};

exports.setAvailability = async (req, res) => {
  if (!(await doctorModel.findById(req.hospitalId, req.params.id))) throw notFound('Doctor not found.');
  const { value, errors, ok } = validate(req.body, { availability: schema().availability });
  if (!ok) throw badRequest(errors.availability, errors);
  const doctor = await doctorModel.update(req.hospitalId, req.params.id, { availability: value.availability });
  const label = doctor.availability === 'present' ? 'Present' : 'Absent / On Leave';
  res.json({ ok: true, message: `${doctor.name} marked as ${label}.`, doctor });
};

exports.setAvailabilityBulk = async (req, res) => {
  const changes = Array.isArray(req.body && req.body.changes) ? req.body.changes : null;
  if (!changes) throw badRequest('No availability changes were sent.');
  for (const c of changes) {
    if (!c || typeof c.id !== 'string' || !doctorModel.AVAILABILITY.includes(c.availability)) {
      throw badRequest('One or more availability values are invalid.');
    }
  }
  const updated = await doctorModel.setAvailabilityBulk(req.hospitalId, changes);
  res.json({
    ok: true,
    message: updated.length ? `Availability updated for ${updated.length} doctor${updated.length === 1 ? '' : 's'}.` : 'No changes to save.',
    updated: updated.map((d) => d.id),
  });
};

// ---- Deactivate / reactivate (doctor left the hospital) ------------------------------------
const doctorStatus = require('../services/doctorStatus');

// GET /api/doctors/:id/status — upcoming appointments that deactivating would leave behind.
exports.statusImpact = async (req, res) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  res.json(await doctorStatus.impact(doctor.id));
};

// PATCH /api/doctors/:id/status { status, reason }
exports.setStatus = async (req, res) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  const { changed, impact } = await doctorStatus.setStatus(req, doctor, req.body && req.body.status, req.body && req.body.reason);
  const after = await doctorModel.findById(req.hospitalId, doctor.id);
  const message = !changed ? 'No changes to save.' : after.status === 'INACTIVE'
    ? `${after.name} is deactivated and no longer bookable.${impact.upcomingAppointments ? ` ${impact.upcomingAppointments} upcoming appointment(s) still need to be moved or cancelled.` : ''}`
    : `${after.name} is active again.`;
  res.json({ ok: true, message, doctor: await withStats(req.hospitalId, after) });
};

// ---- Doctor portal login (the front desk invites its own doctors; see services/doctorLogin) ----
const doctorLogin = require('../services/doctorLogin');

// POST /api/doctors/:id/login { email, phone? } -> credentials { login, tempPassword } shown once
exports.inviteLogin = async (req, res) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  const credentials = await doctorLogin.invite(req, { ...doctor, hospitalId: req.hospitalId }, req.body);
  res.status(201).json({ ok: true, message: `${doctor.name} can now sign in to the doctor portal.`, credentials });
};

// POST /api/doctors/:id/login/reset-password: re-issues an invitation the doctor has not used yet
// (403 once they have signed in; Super Admin resets those).
exports.resetLoginPassword = async (req, res) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  const credentials = await doctorLogin.resetPassword(req, doctor, { unusedOnly: true });
  res.json({ ok: true, message: `New invitation password issued for ${doctor.name}.`, credentials });
};

// ---- Working hours (the front desk sets up a doctor's weekly hours: a new doctor can't take bookings without them) --
const scheduleController = require('./doctor/scheduleController');

// Runs a doctor-portal schedule handler for one of this hospital's doctors, then records who changed the hours.
// (The doctor portal's own schedule screen uses the same handlers.)
function forDoctor(handler, { block = false, audit = null } = {}) {
  return async (req, res) => {
    const doctor = await doctorModel.findById(req.hospitalId, req.params.id);
    if (!doctor) throw notFound('Doctor not found.');
    const derived = Object.create(req);
    derived.doctorId = doctor.id;
    derived.params = block ? { id: req.params.blockId } : req.params;
    await handler(derived, res);
    if (audit) await auditLog.record({ req, action: 'DOCTOR_SCHEDULE_CHANGED', entityType: 'DOCTOR', entityId: doctor.id, summary: `${audit} for ${doctor.name}` });
  };
}

// GET /api/doctors/:id/schedule, POST (add hours), PATCH /api/doctors/:id/schedule/:blockId { capacityPerSlot }, DELETE
exports.scheduleList = forDoctor(scheduleController.list);
exports.scheduleCreate = forDoctor(scheduleController.create, { audit: 'Added working hours' });
exports.scheduleUpdate = forDoctor(scheduleController.update, { block: true, audit: 'Changed patients per slot' });
exports.scheduleRemove = forDoctor(scheduleController.remove, { block: true, audit: 'Removed working hours' });
exports.scheduleImpact = forDoctor(scheduleController.impact, { block: true });
