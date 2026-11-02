// Super Admin appointments are READ-ONLY, with one narrow escalation: "Cancel appointment"
// (permission appointments.cancel) for an appointment nobody else can handle, for example after
// a hospital is offboarded or a doctor is rejected. It uses the same cancel path as the patient
// app and the front desk (refund, queue token, notices) and always needs a reason. There is no
// reschedule or edit: patients change their own appointments, hospitals run them, doctors handle theirs.

const db = require('../../db');
const appointmentModel = require('../../models/appointmentModel');
const booking = require('../../services/patient/booking');
const auditLog = require('../../services/auditLog');
const { notFound, badRequest } = require('../../utils/http');

exports.list = async (req, res) => {
  const { id, mobile, hospitalId, doctorId, date, from, to, status, paymentStatus, page, pageSize } = req.query;
  const filters = { hospitalId, doctorId, date, from, to, status, paymentStatus, page, pageSize };
  if (id) filters.q = id;
  if (mobile) filters.mobile = mobile;
  res.json(await appointmentModel.adminSearch(filters));
};

// GET /api/admin/appointments/:id — the appointment, its status history and its refunds.
exports.get = async (req, res) => {
  const appointment = await appointmentModel.adminFindById(req.params.id);
  if (!appointment) throw notFound('Appointment not found.');
  const [history, refunds] = await Promise.all([
    db.query(
      `SELECT h.from_status, h.to_status, h.note, h.created_at, u.name AS changed_by_name
       FROM appointment_status_history h LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.appointment_id = ? ORDER BY h.id`, [appointment.id]
    ),
    db.query('SELECT id, amount, status, reason, created_at FROM refunds WHERE appointment_id = ? ORDER BY created_at', [appointment.id]),
  ]);
  res.json({
    appointment: {
      ...appointment,
      history: history.map((h) => ({ from: h.from_status, to: h.to_status, note: h.note, at: db.iso(h.created_at), by: h.changed_by_name || null })),
      refunds: refunds.map((r) => ({ id: r.id, amount: Number(r.amount), status: r.status, reason: r.reason, createdAt: db.iso(r.created_at) })),
    },
  });
};

const rupees = (paise) => paise / 100;

// GET /api/admin/appointments/:id/cancel — what cancelling would do, for the confirm dialog.
exports.cancelQuote = async (req, res) => {
  const quote = await booking.adminCancelQuote(req.params.id);
  if (!quote) throw notFound('Appointment not found.');
  res.json({ quote });
};

// POST /api/admin/appointments/:id/cancel { reason }
// Same cancel path as everyone else; the booking token is never refunded.
exports.cancel = async (req, res) => {
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!reason) throw badRequest('Enter the reason for cancelling.', { reason: 'Enter the reason for cancelling.' });
  if (reason.length > 300) throw badRequest('Keep the reason under 300 characters.', { reason: 'Keep the reason under 300 characters.' });
  const before = await appointmentModel.adminFindById(req.params.id);
  if (!before) throw notFound('Appointment not found.');
  const quote = await booking.adminCancel(before.id, reason, req.user.id);
  const refund = rupees(quote.refundPaise);
  await auditLog.record({
    req, action: 'APPOINTMENT_CANCELLED_BY_ADMIN', entityType: 'APPOINTMENT', entityId: before.id,
    summary: `Admin cancelled ${before.id} (${before.patientName}, ${before.hospitalName})${refund ? `, refunded ₹${refund}` : ''}: ${reason}`,
    previousValue: { status: before.status }, newValue: { status: 'cancelled', reason, refund },
  });
  const appointment = await appointmentModel.adminFindById(before.id);
  res.json({ ok: true, message: refund ? `Appointment cancelled. ₹${refund.toLocaleString('en-IN')} refunded to the patient.` : 'Appointment cancelled.', appointment, quote });
};
