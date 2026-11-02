const appointmentModel = require('../models/appointmentModel');
const booking = require('../services/patient/booking');
const auditLog = require('../services/auditLog');
const { badRequest, notFound } = require('../utils/http');
const { isISODate } = require('../utils/dates');

// Parse and sanitise the shared filter query string.
function readFilters(query) {
  const f = {};
  for (const key of ['date', 'from', 'to']) {
    if (query[key]) {
      if (!isISODate(query[key])) throw badRequest(`"${key}" must be a valid date (YYYY-MM-DD).`);
      f[key] = query[key];
    }
  }
  if (query.doctorId) f.doctorId = String(query.doctorId);
  if (query.status) {
    if (!appointmentModel.STATUS_FILTERS.includes(query.status)) throw badRequest('Invalid appointment status.');
    f.status = query.status;
  }
  if (query.paymentStatus) {
    if (!appointmentModel.PAYMENT_STATUSES.includes(query.paymentStatus)) throw badRequest('Invalid payment status.');
    f.paymentStatus = query.paymentStatus;
  }
  if (query.q) f.q = String(query.q).slice(0, 80);
  return f;
}

exports.readFilters = readFilters;

exports.list = async (req, res) => {
  const filters = readFilters(req.query);
  res.json(await appointmentModel.search(req.hospitalId, filters, {
    sort: req.query.sort === 'date_asc' ? 'date_asc' : 'date_desc', page: req.query.page, pageSize: req.query.pageSize,
  }));
};

exports.get = async (req, res) => {
  const appointment = await appointmentModel.findById(req.hospitalId, req.params.id);
  if (!appointment) throw notFound('Appointment not found.');
  res.json({ appointment });
};

// PATCH /api/appointments/:id/status { status }: moves only along appointmentModel.nextStatuses (what the
// screen offers), never to a status the appointment can't take.
exports.updateStatus = async (req, res) => {
  const current = await appointmentModel.findById(req.hospitalId, req.params.id);
  if (!current) throw notFound('Appointment not found.');
  const status = req.body && req.body.status;
  if (!appointmentModel.STATUSES.includes(status)) throw badRequest('Choose a valid appointment status.');
  // Cancelling has side effects (refund, queue token, patient notice), so it has its own endpoint.
  if (status === 'cancelled') throw badRequest('Use "Cancel appointment" to cancel, so the refund and queue token are handled.');
  // Final, like its queue token (database/migrations/015_token_appointment_sync.sql).
  if (current.status === 'cancelled') throw badRequest('A cancelled appointment cannot be reopened. Book a new appointment instead.');
  if (current.status === 'completed') throw badRequest('A completed appointment cannot be reopened. Book a new appointment instead.');
  if (current.noShow) throw badRequest('This appointment is marked as a no-show. Undo the no-show first if the patient did come.');
  if (current.status === status) return res.json({ ok: true, message: 'No changes to save.', appointment: current });
  if (!current.nextStatuses.includes(status)) {
    throw badRequest(status === 'completed' ? 'This appointment is in the future, so it can\'t be marked completed yet. It can be completed on the day.' : `A ${current.status} appointment can't be marked ${status}.`);
  }
  const appointment = await appointmentModel.updateStatus(req.hospitalId, req.params.id, status, current.status);
  if (!appointment) throw badRequest('This appointment changed while you were looking at it. Refresh and try again.');
  await auditLog.record({ req, action: 'APPOINTMENT_STATUS_CHANGED', entityType: 'APPOINTMENT', entityId: current.id, summary: `${current.id} (${current.patientName}): ${current.status} → ${status}`, previousValue: { status: current.status }, newValue: { status } });
  res.json({ ok: true, message: `Appointment ${appointment.id} marked as ${status}.`, appointment });
};

// GET /api/appointments/:id/cancel — what cancelling would do, for the confirm dialog.
exports.cancelQuote = async (req, res) => {
  const quote = await booking.deskCancelQuote(req.hospitalId, req.params.id);
  if (!quote) throw notFound('Appointment not found.');
  res.json({ quote });
};

// POST /api/appointments/:id/cancel { reason }
exports.cancel = async (req, res) => {
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!reason) throw badRequest('Enter the reason for cancelling.', { reason: 'Enter the reason for cancelling.' });
  if (reason.length > 300) throw badRequest('Keep the reason under 300 characters.', { reason: 'Keep the reason under 300 characters.' });
  const before = await appointmentModel.findById(req.hospitalId, req.params.id);
  if (!before) throw notFound('Appointment not found.');
  const quote = await booking.deskCancel(req.hospitalId, before.id, reason, req.user.id);
  const refund = quote.refundPaise / 100;
  await auditLog.record({
    req, action: 'APPOINTMENT_CANCELLED', entityType: 'APPOINTMENT', entityId: before.id,
    summary: `Cancelled ${before.id} for ${before.patientName}${refund ? `, refunded ₹${refund}` : ''}: ${reason}`,
    previousValue: { status: before.status }, newValue: { status: 'cancelled', reason, refund },
  });
  const appointment = await appointmentModel.findById(req.hospitalId, before.id);
  const message = refund ? `Appointment cancelled. ₹${refund.toLocaleString('en-IN')} refunded to the patient.` : 'Appointment cancelled.';
  res.json({ ok: true, message, appointment, quote });
};
