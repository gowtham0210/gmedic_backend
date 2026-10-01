// Minimal express-session Store backed by the `sessions` table (SQLite).
// Used only by the legacy Express app (app.js) — the Next.js app reads/writes
// the same table directly via lib/session.js instead.

const session = require('express-session');
const db = require('../db');

class SqliteSessionStore extends session.Store {
  constructor({ checkExpirationIntervalMs = 15 * 60 * 1000 } = {}) {
    super();
    this.timer = setInterval(() => this.clearExpired().catch(() => {}), checkExpirationIntervalMs);
    this.timer.unref();
  }

  async clearExpired() {
    await db.query("DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP");
  }

  expiresAt(sess) {
    const maxAge = sess.cookie && sess.cookie.maxAge;
    return new Date(Date.now() + (typeof maxAge === 'number' ? maxAge : 24 * 3600000));
  }

  async get(sid, cb) {
    try {
      const row = await db.one("SELECT data FROM sessions WHERE sid = ? AND expires_at >= CURRENT_TIMESTAMP", [sid]);
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (err) { cb(err); }
  }

  async set(sid, sess, cb) {
    try {
      const userId = sess.userId || null;
      await db.query(
        `INSERT INTO sessions (sid, user_id, data, expires_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (sid) DO UPDATE SET user_id = excluded.user_id, data = excluded.data, expires_at = excluded.expires_at`,
        [sid, userId, JSON.stringify(sess), db.toSql(this.expiresAt(sess))]
      );
      cb(null);
    } catch (err) { cb(err); }
  }

  async destroy(sid, cb) {
    try { await db.query('DELETE FROM sessions WHERE sid = ?', [sid]); cb(null); }
    catch (err) { cb(err); }
  }

  async touch(sid, sess, cb) {
    try {
      await db.query('UPDATE sessions SET expires_at = ? WHERE sid = ?', [db.toSql(this.expiresAt(sess)), sid]);
      cb(null);
    } catch (err) { cb(err); }
  }
}

module.exports = SqliteSessionStore;
