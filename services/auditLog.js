// Append-only audit trail. Every admin action that changes platform state must
// call record() — the audit_logs table has no UPDATE/DELETE path in the app.

const db = require('../db');

async function record({ req, action, entityType, entityId, summary, previousValue, newValue }) {
  const user = req.user || {};
  await db.query(
    `INSERT INTO audit_logs (user_id, user_name, role, action, entity_type, entity_id, summary, previous_value, new_value, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user.id || null,
      user.name || 'System',
      user.role || 'SYSTEM',
      action,
      entityType,
      entityId != null ? String(entityId) : null,
      summary || null,
      previousValue !== undefined ? JSON.stringify(previousValue) : null,
      newValue !== undefined ? JSON.stringify(newValue) : null,
      req.ip || null,
      (req.get && req.get('user-agent')) || null,
    ]
  );
}

module.exports = { record };
