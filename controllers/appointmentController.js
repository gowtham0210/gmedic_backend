const appointmentModel = require('../models/appointmentModel');
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
    if (!appointmentModel.STATUSES.includes(query.status)) throw badRequest('Invalid appointment status.');
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
  // Status counts ignore the status filter so the tabs always show totals.
  const { status, ...withoutStatus } = filters;
  const base = await appointmentModel.query(req.hospitalId, withoutStatus);
  const counts = { all: base.length };
  for (const s of appointmentModel.STATUSES) counts[s] = base.filter((a) => a.status === s).length;

  const rows = status ? base.filter((a) => a.status === status) : base;
  const sorted = appointmentModel.sortRows(rows, req.query.sort === 'date_asc' ? 'date_asc' : 'date_desc');
  res.json({ ...appointmentModel.paginate(sorted, req.query.page, req.query.pageSize), counts });
};

exports.get = async (req, res) => {
  const appointment = await appointmentModel.findById(req.hospitalId, req.params.id);
  if (!appointment) throw notFound('Appointment not found.');
  res.json({ appointment });
};

exports.updateStatus = async (req, res) => {
  const current = await appointmentModel.findById(req.hospitalId, req.params.id);
  if (!current) throw notFound('Appointment not found.');
  const status = req.body && req.body.status;
  if (!appointmentModel.STATUSES.includes(status)) throw badRequest('Choose a valid appointment status.');
  const appointment = await appointmentModel.updateStatus(req.hospitalId, req.params.id, status);
  res.json({ ok: true, message: `Appointment ${appointment.id} marked as ${status}.`, appointment });
};
