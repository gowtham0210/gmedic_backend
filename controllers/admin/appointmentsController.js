const appointmentModel = require('../../models/appointmentModel');
const { badRequest, notFound } = require('../../utils/http');
const { isISODate } = require('../../utils/dates');
const auditLog = require('../../services/auditLog');

exports.list = async (req, res) => {
  const { id, mobile, hospitalId, doctorId, date, status, paymentStatus, page, pageSize } = req.query;
  const filters = { hospitalId, doctorId, date, status, paymentStatus, page, pageSize };
  if (id) filters.q = id;
  if (mobile) filters.mobile = mobile;
  const data = await appointmentModel.adminSearch(filters);
  res.json(data);
};

exports.get = async (req, res) => {
  const appointment = await appointmentModel.adminFindById(req.params.id);
  if (!appointment) throw notFound('Appointment not found.');
  res.json({ appointment });
};

exports.cancel = async (req, res) => {
  const reason = req.body && req.body.reason;
  if (!String(reason || '').trim()) throw badRequest('A reason is required to cancel.', { reason: 'Enter a reason.' });
  const before = await appointmentModel.adminFindById(req.params.id);
  if (!before) throw notFound('Appointment not found.');
  const appointment = await appointmentModel.adminCancel(req.params.id, reason, req.user.id);
  if (!appointment) throw badRequest('This appointment is already cancelled.');
  await auditLog.record({ req, action: 'APPOINTMENT_CANCELLED', entityType: 'APPOINTMENT', entityId: req.params.id, summary: `Cancelled appointment for ${before.patientName} at ${before.hospitalName}: ${reason}`, previousValue: { status: before.status }, newValue: { status: 'cancelled', reason } });
  res.json({ ok: true, message: `Appointment ${appointment.id} cancelled.`, appointment });
};

exports.reschedule = async (req, res) => {
  const { date, time, reason } = req.body || {};
  if (!isISODate(date)) throw badRequest('Choose a valid date.', { date: 'Choose a valid date.' });
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) throw badRequest('Choose a valid time.', { time: 'Choose a valid time.' });
  if (!String(reason || '').trim()) throw badRequest('A reason is required to reschedule.', { reason: 'Enter a reason.' });
  const before = await appointmentModel.adminFindById(req.params.id);
  if (!before) throw notFound('Appointment not found.');
  const appointment = await appointmentModel.adminReschedule(req.params.id, { date, time }, reason, req.user.id);
  await auditLog.record({ req, action: 'APPOINTMENT_RESCHEDULED', entityType: 'APPOINTMENT', entityId: req.params.id, summary: `Rescheduled ${before.patientName}'s appointment from ${before.date} ${before.time} to ${date} ${time}: ${reason}`, previousValue: { date: before.date, time: before.time }, newValue: { date, time, reason } });
  res.json({ ok: true, message: `Appointment ${appointment.id} rescheduled to ${date} ${time}.`, appointment });
};
