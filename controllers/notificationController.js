const appointmentModel = require('../models/appointmentModel');
const notificationModel = require('../models/notificationModel');

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
  const booking = events.map((e) => ({ ...e, unread: Date.parse(e.at) > readAt }));
  // Template-driven notifications (refund decisions, token/availability updates, support replies…).
  const system = await notificationModel.listForUser(req.user.id);
  const merged = [...booking.slice(0, 8), ...system].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  res.json({ items: merged, unread: booking.filter((e) => e.unread).length + system.filter((n) => n.unread).length });
};

exports.markRead = async (req, res) => {
  req.session.notificationsReadAt = Date.now();
  await notificationModel.markAllRead(req.user.id);
  res.json({ ok: true, unread: 0 });
};
