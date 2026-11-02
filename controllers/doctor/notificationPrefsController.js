// The signed-in doctor's notification preferences (config/notificationPreferences.js), saved on the
// server and applied by services/notificationService when a notice is sent.
const db = require('../../db');
const { forRole, ALWAYS_ON } = require('../../config/notificationPreferences');
const { badRequest } = require('../../utils/http');

async function current(user) {
  const rows = await db.query('SELECT pref_key, enabled FROM user_notification_prefs WHERE user_id = ?', [user.id]);
  const saved = new Map(rows.map((r) => [r.pref_key, !!r.enabled]));
  return {
    preferences: forRole(user.role).map((p) => ({ key: p.key, label: p.label, help: p.help, enabled: saved.has(p.key) ? saved.get(p.key) : true })),
    alwaysOn: ALWAYS_ON[user.role] || [],
  };
}

// GET /api/doctor/notification-preferences
exports.get = async (req, res) => {
  res.json(await current(req.user));
};

// PUT /api/doctor/notification-preferences { preferences: { new_appointments: false, ... } }
// Only the keys sent change; unknown keys are refused.
exports.update = async (req, res) => {
  const input = req.body && req.body.preferences;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('Send { preferences: { key: true|false } }.');
  const known = new Set(forRole(req.user.role).map((p) => p.key));
  const bad = Object.keys(input).filter((k) => !known.has(k) || typeof input[k] !== 'boolean');
  if (bad.length) throw badRequest(`These preferences can't be set: ${bad.join(', ')}.`);
  await db.tx(async (conn) => {
    for (const [key, enabled] of Object.entries(input)) {
      await conn.query(
        `INSERT INTO user_notification_prefs (user_id, pref_key, enabled) VALUES (?, ?, ?)
         ON CONFLICT (user_id, pref_key) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP`,
        [req.user.id, key, enabled ? 1 : 0]
      );
    }
  });
  res.json({ ok: true, message: 'Notification preferences saved.', ...(await current(req.user)) });
};
