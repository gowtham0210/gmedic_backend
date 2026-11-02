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

// Marks one of the user's own notifications read ("n-12" or 12). False when it isn't theirs.
async function markRead(userId, id) {
  const n = Number(String(id).replace(/^n-/, ''));
  if (!Number.isInteger(n) || n <= 0) return false;
  const res = await db.query('UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_id = ?', [n, userId]);
  return res.affectedRows > 0;
}

async function markAllRead(userId) {
  await db.query('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL', [userId]);
}

module.exports = { listForUser, unreadCount, markRead, markAllRead };
