const doctorModel = require('../../models/doctorModel');
const appointmentModel = require('../../models/appointmentModel');
const tokenModel = require('../../models/tokenModel');
const { notFound, badRequest } = require('../../utils/http');
const { todayISO, isISODate } = require('../../utils/dates');

// GET /api/doctor/dashboard — same numbers the /doctor/dashboard page shows.
exports.get = async (req, res) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.doctorId);
  if (!doctor) throw notFound('Doctor record not found.');
  const today = todayISO();
  const [all, tokens] = await Promise.all([
    appointmentModel.query(req.hospitalId, { doctorId: req.doctorId }),
    tokenModel.query(req.hospitalId, { date: today, doctorId: req.doctorId }),
  ]);
  const todays = appointmentModel.sortRows(all.filter((a) => a.date === today), 'date_asc');
  const waiting = tokens.filter((t) => t.status === 'waiting').sort((a, b) => a.number - b.number);
  const current = tokens.find((t) => t.status === 'in_consultation' || t.status === 'called') || null;

  res.json({
    date: today,
    doctor: { id: doctor.id, name: doctor.name, specialization: doctor.specialization, fee: doctor.fee, availability: doctor.availability },
    stats: {
      todaysAppointments: todays.length,
      waitingPatients: waiting.length,
      completedToday: todays.filter((a) => a.status === 'completed').length,
      cancelledToday: todays.filter((a) => a.status === 'cancelled').length,
      earningsToday: todays.filter((a) => a.paymentStatus === 'paid').reduce((sum, a) => sum + a.fee, 0),
      upcoming: all.filter((a) => a.date > today && a.status !== 'cancelled').length,
    },
    currentToken: current,
    nextWaiting: waiting.slice(0, 3),
    todaysAppointments: todays,
  });
};

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// GET /api/doctor/analytics?from=&to=  (defaults to the last 14 days)
exports.analytics = async (req, res) => {
  const to = req.query.to || todayISO();
  const from = req.query.from || addDays(to, -13);
  if (!isISODate(from) || !isISODate(to)) throw badRequest('"from" and "to" must be valid dates (YYYY-MM-DD).');
  if (from > to) throw badRequest('"from" must not be after "to".', { from: 'Must be on or before the end date.' });
  if (addDays(from, 366) < to) throw badRequest('Choose a range of one year or less.');

  const all = await appointmentModel.query(req.hospitalId, { doctorId: req.doctorId });
  const rows = all.filter((a) => a.date >= from && a.date <= to);
  const byStatus = {};
  const byDay = {};
  const patients = new Set();
  let earnings = 0;
  for (const a of rows) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    const day = (byDay[a.date] ||= { date: a.date, booked: 0, completed: 0, cancelled: 0, earnings: 0 });
    if (a.status !== 'cancelled') day.booked += 1;
    if (a.status === 'completed') day.completed += 1;
    if (a.status === 'cancelled') day.cancelled += 1;
    if (a.paymentStatus === 'paid') { day.earnings += a.fee; earnings += a.fee; }
    patients.add(a.patientId);
  }
  res.json({
    from, to,
    totals: { appointments: rows.length, uniquePatients: patients.size, earnings },
    byStatus,
    byDay: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
  });
};

// Per-widget endpoints: the same data as /dashboard, one slice at a time.
// ponytail: each call re-runs the summary; split the queries if this gets hot.
const slice = (pick) => async (req, res) => {
  let out;
  await exports.get(req, { json: (d) => { out = d; } });
  res.json(pick(out));
};
exports.stats = slice((d) => ({ date: d.date, ...d.stats }));
exports.queue = slice((d) => ({ date: d.date, currentToken: d.currentToken, nextWaiting: d.nextWaiting }));
exports.appointments = slice((d) => ({ date: d.date, items: d.todaysAppointments }));

// GET /api/doctor/earnings?from=&to=  — paid appointments in the range (defaults to the last 30 days)
exports.earnings = async (req, res) => {
  const to = req.query.to || todayISO();
  const from = req.query.from || addDays(to, -29);
  if (!isISODate(from) || !isISODate(to)) throw badRequest('"from" and "to" must be valid dates (YYYY-MM-DD).');
  if (from > to) throw badRequest('"from" must not be after "to".', { from: 'Must be on or before the end date.' });
  if (addDays(from, 366) < to) throw badRequest('Choose a range of one year or less.');

  const all = await appointmentModel.query(req.hospitalId, { doctorId: req.doctorId });
  const paid = all.filter((a) => a.paymentStatus === 'paid' && a.date >= from && a.date <= to);
  const pending = all.filter((a) => a.paymentStatus === 'pending' && a.status !== 'cancelled' && a.date >= from && a.date <= to);
  res.json({
    from, to,
    totals: { paidAppointments: paid.length, earnings: paid.reduce((n, a) => n + a.fee, 0), pendingAmount: pending.reduce((n, a) => n + a.fee, 0) },
    items: paid
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
      .map((a) => ({ appointmentId: a.id, date: a.date, time: a.time, patientName: a.patientName, fee: a.fee, transactionId: a.transactionId })),
  });
};
