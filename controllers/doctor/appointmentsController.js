const db = require('../../db');
const appointmentModel = require('../../models/appointmentModel');
const booking = require('../../services/patient/booking');
const receptionBooking = require('../../services/receptionBooking');
const consultation = require('../../services/consultation');
const auditLog = require('../../services/auditLog');
const { badRequest, notFound } = require('../../utils/http');

async function own(req) {
  const appointment = await appointmentModel.adminFindById(req.params.id);
  if (!appointment || appointment.doctorId !== req.doctorId) throw notFound('Appointment not found.');
  return appointment;
}

// What the doctor's screen needs beyond the row: the undo window, notes and the status history.
async function detail(appointment) {
  const row = await consultation.load(appointment.doctorId, appointment.id);
  const history = await db.query('SELECT from_status, to_status, created_at FROM appointment_status_history WHERE appointment_id = ? ORDER BY id', [appointment.id]);
  return {
    ...appointment,
    ...(await consultation.reopenWindow(row)),
    notes: await consultation.notesOf(appointment.id),
    history: history.map((h) => ({ from: h.from_status, to: h.to_status, at: db.iso(h.created_at) })),
  };
}

// GET /api/doctor/appointments?date=&status=&paymentStatus=&q=&page=&pageSize=
// Paged on the server; `counts` are totals over every page and `upcoming` counts what is still to come.
exports.list = async (req, res) => {
  const { date, status, paymentStatus, q, page, pageSize } = req.query;
  const data = await appointmentModel.adminSearch({ doctorId: req.doctorId, date, status, paymentStatus, q, page, pageSize: pageSize || 20 });
  const tz = (await db.one('SELECT h.timezone FROM doctors d JOIN hospitals h ON h.id = d.hospital_id WHERE d.id = ?', [req.doctorId])).timezone;
  const upcoming = await db.one("SELECT COUNT(*) AS n FROM appointments WHERE doctor_id = ? AND appt_date >= ? AND status IN ('confirmed', 'pending') AND no_show = 0", [req.doctorId, appointmentModel.todayIn(tz)]);
  res.json({ ...data, upcoming: Number(upcoming.n) });
};

exports.get = async (req, res) => {
  res.json({ appointment: await detail(await own(req)) });
};

// PATCH /api/doctor/appointments/:id/status { status: 'completed' } (cancelling has its own endpoint;
// { status: 'cancelled', reason } is still accepted and goes the same way).
exports.updateStatus = async (req, res) => {
  const { status, reason } = req.body || {};
  if (status === 'cancelled') return exports.cancel(Object.assign(Object.create(req), { body: { reason } }), res);
  const appointment = await own(req);
  if (status !== 'completed') throw badRequest('Choose Completed. Cancelling has its own action.');
  if (appointment.noShow) throw badRequest('This appointment is marked as a no-show. Undo the no-show first if the patient did come.');
  if (!(appointment.nextStatuses || []).includes('completed')) {
    throw badRequest(['completed', 'cancelled'].includes(appointment.status)
      ? `This appointment is already ${appointment.status}.`
      : 'An appointment can only be completed on or after its date.');
  }
  await appointmentModel.updateStatus(appointment.hospitalId, appointment.id, 'completed');
  await auditLog.record({ req, action: 'APPOINTMENT_COMPLETED', entityType: 'APPOINTMENT', entityId: appointment.id, summary: `${appointment.id} completed by the doctor` });
  res.json({ ok: true, message: `Appointment ${appointment.id} marked completed. You can undo this for ${consultation.REOPEN_MINUTES} minutes.`, appointment: await detail(await own(req)) });
};

// GET /api/doctor/appointments/:id/cancel: what cancelling would refund (and why it can't be cancelled, if so).
exports.cancelQuote = async (req, res) => {
  await own(req);
  const q = await booking.doctorCancelQuote(req.doctorId, req.params.id);
  res.json({ blocker: q.blocker, refund: q.refundPaise / 100, paid: q.paidPaise / 100, note: q.note });
};

// POST /api/doctor/appointments/:id/cancel { reason }: the shared cancel (refund, token withdrawn,
// patient, front desk and doctor notified).
exports.cancel = async (req, res) => {
  await own(req);
  const reason = String((req.body && req.body.reason) || '').trim();
  if (!reason) throw badRequest('A reason is required to cancel.', { reason: 'Enter a reason.' });
  const quote = await booking.doctorCancel(req.doctorId, req.params.id, reason, req.user.id);
  const refund = quote.refundPaise / 100;
  res.json({ ok: true, message: `Appointment ${req.params.id} cancelled.${refund ? ` ₹${refund.toLocaleString('en-IN')} is refunded to the patient.` : ''} The patient and front desk are notified.`, appointment: await detail(await own(req)) });
};

// POST /api/doctor/appointments/:id/reopen: undo a completion pressed by mistake (same day, 10 minutes).
exports.reopen = async (req, res) => {
  await own(req);
  await consultation.reopen(req, req.doctorId, req.params.id);
  res.json({ ok: true, message: 'Consultation reopened.', appointment: await detail(await own(req)) });
};

// POST / DELETE /api/doctor/appointments/:id/no-show: the same rules as the front desk (on the day,
// after the grace period; undo the same day).
exports.markNoShow = async (req, res) => {
  const a = await own(req);
  await receptionBooking.markNoShow(a.hospitalId, a.id, req.user);
  res.json({ ok: true, message: `${a.patientName} marked as a no-show.`, appointment: await detail(await own(req)) });
};

exports.undoNoShow = async (req, res) => {
  const a = await own(req);
  await receptionBooking.undoNoShow(a.hospitalId, a.id, req.user);
  res.json({ ok: true, message: 'No-show undone.', appointment: await detail(await own(req)) });
};

// GET / POST /api/doctor/appointments/:id/notes { diagnosis?, notes?, prescription? }: each save is a new version.
exports.notes = async (req, res) => {
  await own(req);
  res.json({ notes: await consultation.notesOf(req.params.id) });
};

exports.saveNotes = async (req, res) => {
  await own(req);
  const { changed, notes } = await consultation.saveNotes(req, req.doctorId, req.params.id, req.body || {});
  res.json({ ok: true, message: changed ? 'Consultation notes saved.' : 'No changes to save.', notes });
};
