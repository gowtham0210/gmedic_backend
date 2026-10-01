const tokenModel = require('../models/tokenModel');
const appointmentModel = require('../models/appointmentModel');
const { badRequest, notFound } = require('../utils/http');
const { isISODate, todayISO } = require('../utils/dates');

function readDate(value) {
  if (!value) return todayISO();
  if (!isISODate(value)) throw badRequest('"date" must be a valid date (YYYY-MM-DD).');
  return value;
}

// GET /api/tokens?date=&doctorId=&status=&q=
exports.list = async (req, res) => {
  const date = readDate(req.query.date);
  const doctorId = req.query.doctorId ? String(req.query.doctorId) : '';
  const status = req.query.status ? String(req.query.status) : '';
  if (status && !tokenModel.STATUSES.includes(status)) throw badRequest('Invalid token status.');
  const q = req.query.q ? String(req.query.q).slice(0, 80) : '';

  // Summary and tab counts ignore the status filter.
  const base = await tokenModel.query(req.hospitalId, { date, doctorId, q });
  const items = status ? base.filter((t) => t.status === status) : base;
  res.json({ date, items, summary: tokenModel.summarize(base) });
};

// Appointments on a date that can still be given a token.
// GET /api/tokens/eligible?date=&doctorId=&q=
exports.eligible = async (req, res) => {
  const date = readDate(req.query.date);
  const doctorId = req.query.doctorId ? String(req.query.doctorId) : undefined;
  const q = req.query.q ? String(req.query.q).slice(0, 80) : undefined;
  const rows = await appointmentModel.query(req.hospitalId, { date, doctorId, q });
  const candidates = appointmentModel.sortRows(rows, 'date_asc').filter((a) => a.status !== 'cancelled');
  const items = [];
  for (const a of candidates) {
    if (await tokenModel.activeForAppointment(req.hospitalId, a.id)) continue;
    items.push({
      appointmentId: a.id,
      patientName: a.patientName,
      doctorId: a.doctorId,
      doctorName: a.doctorName,
      specialization: a.specialization,
      time: a.time,
      status: a.status,
      paymentStatus: a.paymentStatus,
    });
  }
  res.json({
    date,
    items,
    canIssue: date >= todayISO(),
    nextCode: tokenModel.formatCode(await tokenModel.nextNumber(req.hospitalId, date)),
  });
};

// POST /api/tokens { appointmentId }
exports.create = async (req, res) => {
  const appointmentId = req.body && typeof req.body.appointmentId === 'string' ? req.body.appointmentId : '';
  if (!appointmentId) throw badRequest('Choose an appointment to assign a token to.', { appointmentId: 'Choose an appointment.' });

  const appointment = await appointmentModel.findById(req.hospitalId, appointmentId);
  if (!appointment) throw notFound('Appointment not found.');
  if (appointment.status === 'cancelled') throw badRequest('This appointment is cancelled, so a token cannot be assigned.');
  if (appointment.date < todayISO()) throw badRequest('Tokens can only be assigned for today or upcoming appointments.');

  const existing = await tokenModel.activeForAppointment(req.hospitalId, appointmentId);
  if (existing) throw badRequest(`${appointment.patientName} already has token ${existing.code} for this appointment.`);

  const token = await tokenModel.create(req.hospitalId, appointment);
  res.status(201).json({ ok: true, message: `Token ${token.code} assigned to ${token.patientName}.`, token });
};

// GET /api/tokens/:id
exports.get = async (req, res) => {
  const token = await tokenModel.findById(req.hospitalId, req.params.id);
  if (!token) throw notFound('Token not found.');
  res.json({ token });
};

// PATCH /api/tokens/:id/status { status }
exports.updateStatus = async (req, res) => {
  const token = await tokenModel.findById(req.hospitalId, req.params.id);
  if (!token) throw notFound('Token not found.');
  const status = req.body && req.body.status;
  if (!tokenModel.STATUSES.includes(status)) throw badRequest('Choose a valid token status.');
  if (token.status === 'cancelled') throw badRequest('Cancelled tokens cannot be changed. Generate a new token instead.');
  if (token.status === status) return res.json({ ok: true, message: 'No changes to save.', token });

  const updated = await tokenModel.updateStatus(req.hospitalId, token.id, status);
  const labels = { waiting: 'Waiting', called: 'Called', completed: 'Completed', cancelled: 'Cancelled' };
  res.json({ ok: true, message: `Token ${updated.code} marked as ${labels[status]}.`, token: updated });
};
