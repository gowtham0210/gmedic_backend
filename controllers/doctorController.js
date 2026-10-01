const config = require('../config');
const doctorModel = require('../models/doctorModel');
const appointmentModel = require('../models/appointmentModel');
const { validate } = require('../utils/validate');
const { badRequest, notFound } = require('../utils/http');
const { todayISO } = require('../utils/dates');

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
  const today = todayISO();
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
  const everyone = await doctorModel.all(req.hospitalId);
  const today = todayISO();
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
  const today = todayISO();
  const rows = await appointmentModel.query(req.hospitalId, { doctorId: doctor.id, from: today });
  const schedule = appointmentModel.sortRows(rows, 'date_asc').slice(0, 8);
  res.json({ doctor: await withStats(req.hospitalId, doctor), schedule });
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
