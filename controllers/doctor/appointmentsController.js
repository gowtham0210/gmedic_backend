const appointmentModel = require('../../models/appointmentModel');
const { badRequest, notFound } = require('../../utils/http');
const notifications = require('../../services/notificationService');

// GET /api/doctor/appointments?date=&status=&paymentStatus=&q=&page=&pageSize=
exports.list = async (req, res) => {
  const { date, status, paymentStatus, q, page, pageSize } = req.query;
  const data = await appointmentModel.adminSearch({ doctorId: req.doctorId, date, status, paymentStatus, q, page, pageSize: pageSize || 20 });
  res.json(data);
};

exports.get = async (req, res) => {
  const appointment = await appointmentModel.adminFindById(req.params.id);
  if (!appointment || appointment.doctorId !== req.doctorId) throw notFound('Appointment not found.');
  res.json({ appointment });
};

const DOCTOR_TRANSITIONS = {
  confirmed: ['completed', 'cancelled'],
  pending: ['completed', 'cancelled'],
};

exports.updateStatus = async (req, res) => {
  const appointment = await appointmentModel.adminFindById(req.params.id);
  if (!appointment || appointment.doctorId !== req.doctorId) throw notFound('Appointment not found.');
  const { status, reason } = req.body || {};
  if (!['completed', 'cancelled'].includes(status)) throw badRequest('Choose Completed or Cancelled.');
  const allowed = DOCTOR_TRANSITIONS[appointment.status] || [];
  if (!allowed.includes(status)) throw badRequest(`An appointment that is "${appointment.status}" can't be marked "${status}".`);
  if (status === 'cancelled' && !String(reason || '').trim()) throw badRequest('A reason is required to cancel.', { reason: 'Enter a reason.' });

  if (status === 'cancelled') {
    const updated = await appointmentModel.cancelWithReason(req.params.id, reason, req.user.id);
    await notifications.trigger('APPOINTMENT_CANCELLED', await notifications.hospitalUsers(appointment.hospitalId, 'RECEPTIONIST'), {
      patient_name: appointment.patientName, doctor_name: appointment.doctorName.replace(/^Dr\.?\s*/i, ''), hospital_name: appointment.hospitalName, branch_name: appointment.branchName,
      appointment_id: appointment.id, appointment_date: appointment.date, appointment_time: appointment.time,
    }, { link: '/appointments' });
    return res.json({ ok: true, message: `Appointment ${updated.id} cancelled.`, appointment: updated });
  }
  const updated = await appointmentModel.updateStatus(appointment.hospitalId, req.params.id, 'completed');
  res.json({ ok: true, message: `Appointment ${updated.id} marked completed.`, appointment: updated });
};
