// Read-only. The audit_logs table is append-only (services/auditLog.js is the
// only writer) so this controller never mutates it.

const db = require('../../db');
const auditLog = require('../../services/auditLog');
const { contains } = require('../../utils/like');

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

// The filters shared by the list and the export.
function filtersFrom(query) {
  const { action, entityType, userId, q, from, to } = query;
  const clauses = [];
  const params = [];
  if (action) { clauses.push('action = ?'); params.push(action); }
  if (entityType) { clauses.push('entity_type = ?'); params.push(entityType); }
  if (userId) { clauses.push('user_id = ?'); params.push(userId); }
  if (from) { clauses.push('created_at >= ?'); params.push(from); }
  if (to) { clauses.push('created_at <= ?'); params.push(`${to} 23:59:59.999`); }
  if (q) { clauses.push("(summary LIKE ? ESCAPE '\\' OR user_name LIKE ? ESCAPE '\\' OR entity_id LIKE ? ESCAPE '\\')"); params.push(contains(q), contains(q), contains(q)); }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

exports.list = async (req, res) => {
  const { page = 1, pageSize = 30 } = req.query;
  const { where, params } = filtersFrom(req.query);
  const total = (await db.one(`SELECT COUNT(*) AS n FROM audit_logs ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 30, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, size, (cur - 1) * size]);
  const [actions, entityTypes, users] = await Promise.all([
    db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action'),
    db.query('SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type'),
    db.query("SELECT user_id, MAX(user_name) AS user_name, MAX(role) AS role FROM audit_logs WHERE user_id IS NOT NULL GROUP BY user_id ORDER BY user_name"),
  ]);
  res.json({
    items: rows.map(fromRow), total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
    actions: actions.map((a) => a.action), entityTypes: entityTypes.map((e) => e.entity_type),
    users: users.map((u) => ({ id: u.user_id, name: u.user_name, role: u.role })),
  });
};

const EXPORT_LIMIT = 10000;
// A spreadsheet runs a cell that starts with = + - or @ as a formula, so those get a leading apostrophe.
const cell = (v) => {
  let t = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

// GET /api/admin/audit-logs/export?...same filters... : up to 10,000 of the newest matching entries as CSV.
// The export is itself recorded in the audit log.
exports.export = async (req, res) => {
  const { where, params } = filtersFrom(req.query);
  const rows = await db.query(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ?`, [...params, EXPORT_LIMIT]);
  const head = ['When (UTC)', 'User', 'Role', 'Action', 'Entity type', 'Entity ID', 'Summary', 'IP address'];
  const lines = [head.join(',')].concat(rows.map((r) => [r.created_at, r.user_name, r.role, r.action, r.entity_type, r.entity_id, r.summary, r.ip_address].map(cell).join(',')));
  await auditLog.record({ req, action: 'AUDIT_LOG_EXPORTED', entityType: 'AUDIT_LOG', entityId: 'csv', summary: `Exported ${rows.length} audit entr${rows.length === 1 ? 'y' : 'ies'} as CSV${rows.length === EXPORT_LIMIT ? ' (limit reached)' : ''}` });
  res.type('text/csv; charset=utf-8').set('Cache-Control', 'no-store').attachment(`gmedic-audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
  res.send(`\uFEFF${lines.join('\r\n')}\r\n`);
};
