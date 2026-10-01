const db = require('../../db');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');

const SOURCES = ['PATIENT_APP', 'HOSPITAL', 'EMAIL', 'PHONE', 'INTERNAL'];
const CATEGORIES = ['BOOKING', 'PAYMENT', 'REFUND', 'QR', 'ACCOUNT', 'TECHNICAL', 'OTHER'];
const SLA_HOURS = { LOW: 72, MEDIUM: 24, HIGH: 8, URGENT: 2 };

function fromRow(row) {
  return {
    id: row.id, source: row.source, category: row.category, subject: row.subject, description: row.description,
    hospitalId: row.hospital_id, hospitalName: row.hospital_name, priority: row.priority, status: row.status,
    assignedTo: row.assigned_to, assigneeName: row.assignee_name, slaDueAt: db.iso(row.sla_due_at),
    resolvedAt: db.iso(row.resolved_at), createdAt: db.iso(row.created_at),
  };
}

exports.list = async (req, res) => {
  const { status, priority, hospitalId, q, page = 1, pageSize = 20 } = req.query;
  const clauses = [];
  const params = [];
  if (status) { clauses.push('t.status = ?'); params.push(status); }
  if (priority) { clauses.push('t.priority = ?'); params.push(priority); }
  if (hospitalId) { clauses.push('t.hospital_id = ?'); params.push(hospitalId); }
  if (q) { clauses.push('(t.subject LIKE ? OR t.id LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM support_tickets t ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(
    `SELECT t.*, h.name AS hospital_name, u.name AS assignee_name FROM support_tickets t
     LEFT JOIN hospitals h ON h.id = t.hospital_id LEFT JOIN users u ON u.id = t.assigned_to
     ${where} ORDER BY CASE t.status WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 ELSE 2 END, t.sla_due_at LIMIT ? OFFSET ?`,
    [...params, size, (cur - 1) * size]
  );
  res.json({ items: rows.map(fromRow), total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) });
};

exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    source: { label: 'Source', required: true, type: 'enum', values: SOURCES },
    category: { label: 'Category', required: true, type: 'enum', values: CATEGORIES },
    subject: { label: 'Subject', required: true, minLength: 3, maxLength: 160 },
    description: { label: 'Description', required: true, minLength: 5, maxLength: 2000 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const priority = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(req.body.priority) ? req.body.priority : 'MEDIUM';
  const id = await db.nextId('support_tickets', 'TKT', 1);
  await db.query(
    `INSERT INTO support_tickets (id, source, category, subject, description, hospital_id, priority, status, sla_due_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', datetime('now', '+' || ? || ' hours'), ?)`,
    [id, value.source, value.category, value.subject, value.description, req.body.hospitalId || null, priority, SLA_HOURS[priority], req.user.id]
  );
  await auditLog.record({ req, action: 'TICKET_CREATED', entityType: 'SUPPORT_TICKET', entityId: id, summary: `Opened ticket: ${value.subject}` });
  res.status(201).json({ ok: true, message: 'Ticket created.', id });
};

exports.setStatus = async (req, res) => {
  const ticket = await db.one('SELECT * FROM support_tickets WHERE id = ?', [req.params.id]);
  if (!ticket) throw notFound('Ticket not found.');
  const { status } = req.body || {};
  if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) throw badRequest('Choose a valid status.');
  const resolvedAt = status === 'RESOLVED' || status === 'CLOSED' ? "datetime('now')" : 'NULL';
  await db.query(`UPDATE support_tickets SET status = ?, assigned_to = COALESCE(?, assigned_to), resolved_at = ${resolvedAt} WHERE id = ?`, [status, req.user.id, req.params.id]);
  await auditLog.record({ req, action: 'TICKET_STATUS_CHANGED', entityType: 'SUPPORT_TICKET', entityId: req.params.id, summary: `Ticket ${req.params.id}: ${ticket.status} → ${status}` });
  res.json({ ok: true, message: `Ticket marked ${status.toLowerCase().replace('_', ' ')}.` });
};
