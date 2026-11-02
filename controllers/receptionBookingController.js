// Front-desk booking (receptionist API). The rules live in services/receptionBooking.js and the
// shared seat/token code in services/bookingCore.js.
const booking = require('../services/receptionBooking');

// GET /api/doctors/:id/slots?date=YYYY-MM-DD
exports.slots = async (req, res) => {
  res.json(await booking.slots(req.hospitalId, req.params.id, String(req.query.date || '')));
};

// POST /api/appointments
// { doctorId, date, time, patientId } or { doctorId, date, time, patient: { name, mobile, gender?, dateOfBirth?, differentPerson? } }, reason?, channel?: 'phone', emergency?: true
exports.book = async (req, res) => {
  const appointment = await booking.book(req.hospitalId, req.body || {}, req.user);
  const what = appointment.emergency ? 'Emergency walk-in booked' : 'Booked';
  const queue = appointment.emergency ? ' They go to the front of the queue.' : '';
  res.status(201).json({ ok: true, message: `${what}: ${appointment.patientName} with ${appointment.doctorName} at ${appointment.time}, token ${appointment.tokenCode}.${queue}`, appointment });
};

// GET /api/doctors/:id/walk-in-seats
exports.walkInSeats = async (req, res) => {
  res.json(await booking.walkInSeats(req.hospitalId, req.params.id));
};

// PUT /api/doctors/:id/walk-in-seats { walkInSeats?, emergencySeats?, scheduleId? }
exports.setWalkInSeats = async (req, res) => {
  const body = req.body || {};
  const result = await booking.setWalkInSeats(req.hospitalId, req.params.id, body);
  const parts = [];
  if (body.walkInSeats !== undefined) {
    const n = Number(body.walkInSeats);
    parts.push(n ? `${n} seat${n === 1 ? '' : 's'} per slot held back for walk-ins.` : 'No seats held back for walk-ins; the app can book every seat.');
  }
  if (body.emergencySeats !== undefined) {
    const e = Number(body.emergencySeats);
    parts.push(e ? `Up to ${e} emergency walk-in${e === 1 ? '' : 's'} per full slot.` : 'No emergency walk-ins over a full slot.');
  }
  res.json({ ok: true, message: parts.join(' '), ...result });
};

// GET /api/patients/lookup?mobile=
exports.lookup = async (req, res) => {
  res.json(await booking.lookupByMobile(req.hospitalId, req.query.mobile));
};

// POST /api/appointments/:id/reschedule { date, time }
exports.reschedule = async (req, res) => {
  const appointment = await booking.reschedule(req.hospitalId, req.params.id, req.body || {}, req.user);
  res.json({ ok: true, message: `Moved to ${appointment.date} at ${appointment.time}, token ${appointment.tokenCode}. The patient and doctor are told.`, appointment });
};

// POST /api/appointments/:id/no-show, DELETE to undo
exports.markNoShow = async (req, res) => {
  const appointment = await booking.markNoShow(req.hospitalId, req.params.id, req.user);
  res.json({ ok: true, message: `${appointment.patientName} is marked as a no-show.`, appointment });
};
exports.undoNoShow = async (req, res) => {
  const appointment = await booking.undoNoShow(req.hospitalId, req.params.id, req.user);
  res.json({ ok: true, message: 'The no-show was undone.', appointment });
};

// PATCH /api/appointments/:id { reason?, patient? }
exports.updateDetails = async (req, res) => {
  const { appointment, changed } = await booking.updateDetails(req.hospitalId, req.params.id, req.body || {}, req.user);
  res.json({ ok: true, message: changed ? 'Details saved.' : 'No changes to save.', appointment });
};

// POST /api/appointments/:id/payment { method: 'Cash' | 'UPI' | 'Card', reference? }: the fee taken at the front desk (receipt number comes back on appointment.payment)
exports.collectPayment = async (req, res) => {
  const appointment = await booking.collectPayment(req.hospitalId, req.params.id, req.body || {}, req.user);
  res.status(201).json({ ok: true, message: `Payment recorded. Receipt ${appointment.payment.receiptNumber || ''}`.trim(), appointment });
};
