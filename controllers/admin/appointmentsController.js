// Super Admin appointments are READ-ONLY: this controller deliberately has no
// cancel / reschedule / edit / status-change handlers. Patients change their own
// appointments, hospitals run them operationally, doctors handle their own.

const appointmentModel = require('../../models/appointmentModel');
const { notFound } = require('../../utils/http');

exports.list = async (req, res) => {
  const { id, mobile, hospitalId, doctorId, date, from, to, status, paymentStatus, page, pageSize } = req.query;
  const filters = { hospitalId, doctorId, date, from, to, status, paymentStatus, page, pageSize };
  if (id) filters.q = id;
  if (mobile) filters.mobile = mobile;
  res.json(await appointmentModel.adminSearch(filters));
};

exports.get = async (req, res) => {
  const appointment = await appointmentModel.adminFindById(req.params.id);
  if (!appointment) throw notFound('Appointment not found.');
  res.json({ appointment });
};
