// One feed for every portal: the stored notifications (NEW_APPOINTMENT, cancellations, refunds, support
// replies…). Bookings used to be generated from the appointments table as well, which showed each one
// twice and kept their read state in the login session, so they came back unread after every login.
const notificationModel = require('../models/notificationModel');
const { notFound } = require('../utils/http');

exports.list = async (req, res) => {
  const [items, unread] = await Promise.all([notificationModel.listForUser(req.user.id, 20), notificationModel.unreadCount(req.user.id)]);
  res.json({ items, unread });
};

exports.markRead = async (req, res) => {
  await notificationModel.markAllRead(req.user.id);
  res.json({ ok: true, unread: 0 });
};

// POST /api/notifications/:id/read
exports.markOneRead = async (req, res) => {
  if (!(await notificationModel.markRead(req.user.id, req.params.id))) throw notFound('Notification not found.');
  res.json({ ok: true, unread: await notificationModel.unreadCount(req.user.id) });
};
