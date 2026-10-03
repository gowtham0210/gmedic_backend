// A doctor's own notification feed: new bookings onto their schedule and
// today's upcoming appointments — never anything from another doctor.

const db = require('../../db');
const { todayISO } = require('../../utils/dates');

async function recentEvents(doctorId) {
  const since = Date.now() - 3 * 24 * 3600 * 1000;
  const today = todayISO();
  const events = [];

  const booked = await db.query(
    `SELECT a.id, a.created_at, a.appt_date, a.appt_time, p.name AS patient_name
     FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id
     WHERE a.doctor_id = ? AND a.created_at >= datetime(?, 'unixepoch') ORDER BY a.created_at DESC LIMIT 20`,
    [doctorId, Math.floor(since / 1000)]
  );
  for (const a of booked) {
    events.push({ id: `${a.id}-booked`, type: 'booking', at: db.iso(a.created_at), appointmentId: a.id, patientName: a.patient_name, date: a.appt_date, time: a.appt_time });
  }

  const todayAppts = await db.query(
    `SELECT a.id, a.created_at, a.appt_time, p.name AS patient_name FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id
     WHERE a.doctor_id = ? AND a.appt_date = ? AND a.status <> 'cancelled' ORDER BY a.appt_time`,
    [doctorId, today]
  );
  for (const a of todayAppts) {
    events.push({ id: `${a.id}-today`, type: 'reminder', at: db.iso(a.created_at) || new Date().toISOString(), appointmentId: a.id, patientName: a.patient_name, date: today, time: a.appt_time });
  }

  return events.sort((x, y) => (y.at || '').localeCompare(x.at || ''));
}

exports.list = async (req, res) => {
  const readAt = req.session.notificationsReadAt || 0;
  const events = await recentEvents(req.doctorId);
  const items = events.slice(0, 10).map((e) => ({ ...e, unread: Date.parse(e.at) > readAt }));
  res.json({ items, unread: events.filter((e) => Date.parse(e.at) > readAt).length });
};

exports.markRead = (req, res) => {
  req.session.notificationsReadAt = Date.now();
  res.json({ ok: true, unread: 0 });
};
