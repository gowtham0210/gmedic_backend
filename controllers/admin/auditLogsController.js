// Read-only. The audit_logs table is append-only (services/auditLog.js is the
// only writer) so this controller never mutates it.

const db = require('../../db');

function fromRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    role: row.role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    previousValue: row.previous_value ? JSON.parse(row.previous_value) : null,
    newValue: row.new_value ? JSON.parse(row.new_value) : null,
    ipAddress: row.ip_address,
    createdAt: db.iso(row.created_at),
  };
}

exports.list = async (req, res) => {
  const { action, entityType, userId, q, from, to, page = 1, pageSize = 30 } = req.query;
  const clauses = [];
  const params = [];
  if (action) { clauses.push('action = ?'); params.push(action); }
  if (entityType) { clauses.push('entity_type = ?'); params.push(entityType); }
  if (userId) { clauses.push('user_id = ?'); params.push(userId); }
  if (from) { clauses.push('created_at >= ?'); params.push(from); }
  if (to) { clauses.push('created_at <= ?'); params.push(`${to} 23:59:59.999`); }
  if (q) { clauses.push('(summary LIKE ? OR user_name LIKE ? OR entity_id LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM audit_logs ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 30, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, size, (cur - 1) * size]);
  const actions = await db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action');
  res.json({
    items: rows.map(fromRow), total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
    actions: actions.map((a) => a.action),
  });
};
