// Central notification service. Application code calls trigger(eventKey, ...);
// the *current* template for that event (editable by Super Admin) is loaded,
// variables are validated and filled in, an in-app notification is created and
// every attempt — including skipped, failed and unavailable channels — is logged.
// It never throws: callers' main action must not fail because a notification did.

const db = require('../db');
const { EVENTS, CHANNELS, invalidVariables, render } = require('../config/notificationEvents');
const { prefKeyFor } = require('../config/notificationPreferences');

// True when the user switched this kind of notification off (Settings > Preferences).
async function muted(user, eventKey) {
  const key = prefKeyFor(user.role, eventKey);
  if (!key) return false;
  const row = await db.one('SELECT enabled FROM user_notification_prefs WHERE user_id = ? AND pref_key = ?', [user.id, key]);
  return !!row && !row.enabled;
}

async function log({ eventKey, userId, role, channel, status, reason, notificationId }) {
  await db.query(
    `INSERT INTO notification_logs (event_key, recipient_user_id, recipient_role, channel, status, failure_reason, notification_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eventKey, userId || null, role || null, channel, status, reason || null, notificationId || null]
  );
}

// recipients: a user id, an array of user ids, or { role: 'PATIENT' } entries
// for people who have no portal account (logged as unavailable, not faked).
// link: one path, or { ROLE: path, default: path } when each portal opens a different page.
function linkFor(link, role) {
  if (!link) return null;
  if (typeof link === 'string') return link;
  return link[role] || link.default || null;
}

async function trigger(eventKey, recipients, data = {}, { link } = {}) {
  const results = [];
  try {
    const list = (Array.isArray(recipients) ? recipients : [recipients]).filter(Boolean);
    const event = EVENTS[eventKey];
    if (!event) {
      await log({ eventKey, channel: 'IN_APP', status: 'FAILED', reason: `Unknown event "${eventKey}".` });
      return [{ ok: false, reason: 'unknown event' }];
    }
    const template = await db.one('SELECT * FROM notification_templates WHERE event_key = ?', [eventKey]);
    if (!template) {
      await log({ eventKey, channel: 'IN_APP', status: 'FAILED', reason: 'No template exists for this event.' });
      return [{ ok: false, reason: 'no template' }];
    }
    if (template.status !== 'ACTIVE') {
      await log({ eventKey, channel: 'IN_APP', status: 'SKIPPED', reason: 'Template is disabled.' });
      return [{ ok: false, reason: 'disabled' }];
    }
    const bad = invalidVariables(eventKey, template.title, template.body);
    if (bad.length) {
      await log({ eventKey, channel: 'IN_APP', status: 'FAILED', reason: `Template uses unknown variable(s): ${bad.join(', ')}.` });
      return [{ ok: false, reason: 'invalid variables' }];
    }
    const title = render(template.title, data);
    const body = render(template.body, data);
    const channels = JSON.parse(template.channels || '["IN_APP"]');

    for (const recipient of list) {
      const userId = typeof recipient === 'string' ? recipient : recipient.userId;
      const user = userId ? await db.one("SELECT id, role FROM users WHERE id = ? AND status = 'ACTIVE'", [userId]) : null;
      if (!user) {
        const role = typeof recipient === 'object' ? recipient.role : null;
        await log({ eventKey, userId, role, channel: 'IN_APP', status: userId ? 'FAILED' : 'UNAVAILABLE', reason: userId ? 'Recipient is unavailable.' : 'Recipient has no portal account (patient app is not connected).' });
        results.push({ ok: false, reason: 'recipient unavailable' });
        continue;
      }
      if (await muted(user, eventKey)) {
        await log({ eventKey, userId: user.id, role: user.role, channel: 'IN_APP', status: 'SKIPPED', reason: 'Turned off by the recipient in their notification preferences.' });
        results.push({ ok: false, userId: user.id, reason: 'muted' });
        continue;
      }
      for (const channel of channels) {
        if (channel === 'IN_APP') {
          const res = await db.query('INSERT INTO notifications (user_id, event_key, title, body, link) VALUES (?, ?, ?, ?, ?)', [user.id, eventKey, title, body, linkFor(link, user.role)]);
          await log({ eventKey, userId: user.id, role: user.role, channel, status: 'DELIVERED', notificationId: res.insertId });
          results.push({ ok: true, userId: user.id, notificationId: res.insertId });
        } else {
          const note = (CHANNELS[channel] && CHANNELS[channel].note) || 'Channel not supported';
          await log({ eventKey, userId: user.id, role: user.role, channel, status: 'UNAVAILABLE', reason: note });
        }
      }
    }
  } catch (err) {
    console.error('notification trigger failed', eventKey, err);
    try { await log({ eventKey, channel: 'IN_APP', status: 'FAILED', reason: err.message }); } catch { /* logging itself failed */ }
    results.push({ ok: false, reason: err.message });
  }
  return results;
}

// ---- recipient helpers -------------------------------------------------------

async function hospitalUsers(hospitalId, role) {
  const rows = await db.query("SELECT id FROM users WHERE hospital_id = ? AND role = ? AND status = 'ACTIVE'", [hospitalId, role]);
  return rows.map((r) => r.id);
}

async function doctorUsers(doctorId) {
  const rows = await db.query("SELECT id FROM users WHERE doctor_id = ? AND role = 'DOCTOR' AND status = 'ACTIVE'", [doctorId]);
  return rows.map((r) => r.id);
}

async function adminUsers(roles = ['SUPER_ADMIN']) {
  const rows = await db.query(`SELECT id FROM users WHERE status = 'ACTIVE' AND role IN (${roles.map(() => '?').join(',')})`, roles);
  return rows.map((r) => r.id);
}

module.exports = { trigger, hospitalUsers, doctorUsers, adminUsers };
