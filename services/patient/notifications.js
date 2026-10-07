// The patient's in-app notification inbox (booking confirmations, payment receipts, cancellations).
const notificationModel = require('../../models/notificationModel');

async function list(user) {
  const items = await notificationModel.listForUser(user.id);
  return { items, unread: items.filter((n) => n.unread).length };
}

async function markRead(user) {
  await notificationModel.markAllRead(user.id);
  return { ok: true, unread: 0 };
}

module.exports = { list, markRead };
