// A user's in-app notifications (created by services/notificationService.js).
const db = require('../db');

async function listForUser(userId, limit = 15) {
  const rows = await db.query('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?', [userId, limit]);
  return rows.map((n) => ({
    id: `n-${n.id}`, type: 'system', eventKey: n.event_key, title: n.title, body: n.body, link: n.link,
    at: db.iso(n.created_at), unread: !n.read_at,
  }));
}

async function unreadCount(userId) {
  const row = await db.one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [userId]);
  return Number(row.n);
}

async function markAllRead(userId) {
  await db.query('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL', [userId]);
}

module.exports = { listForUser, unreadCount, markAllRead };
