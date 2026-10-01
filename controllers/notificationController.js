const appointmentModel = require('../models/appointmentModel');

// Recent bookings and payments coming in from the Gmedic patient app.
async function recentEvents(hospitalId) {
  const since = Date.now() - 3 * 24 * 3600 * 1000;
  const events = [];
  const rows = await appointmentModel.query(hospitalId, {});
  for (const a of rows) {
    const booked = Date.parse(a.createdAt);
    if (booked >= since && booked <= Date.now()) {
      events.push({ id: `${a.id}-b`, type: 'booking', at: a.createdAt, appointmentId: a.id, patientName: a.patientName, doctorName: a.doctorName, date: a.date, time: a.time });
    }
  }
  return events.sort((x, y) => y.at.localeCompare(x.at));
}

exports.list = async (req, res) => {
  const readAt = req.session.notificationsReadAt || 0;
  const events = await recentEvents(req.hospitalId);
  const items = events.slice(0, 8).map((e) => ({ ...e, unread: Date.parse(e.at) > readAt }));
  res.json({ items, unread: events.filter((e) => Date.parse(e.at) > readAt).length });
};

exports.markRead = (req, res) => {
  req.session.notificationsReadAt = Date.now();
  res.json({ ok: true, unread: 0 });
};
