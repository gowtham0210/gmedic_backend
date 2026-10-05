// Super Admin / support-staff console over the centralised ticket system.
// Tickets are raised by doctors, receptionists (and, once connected, patients) —
// admins never create them. Each mutation is permission-checked per action,
// validated against the ticket's lifecycle and audit-logged.

const db = require('../../db');
const { roleHas } = require('../../config/permissions');
const { badRequest, notFound, forbidden } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const support = require('../../services/supportService');
const notifications = require('../../services/notificationService');

const ownerLink = (ticket) => (ticket.createdByRole === 'DOCTOR' ? '/doctor/support' : '/support');
const STATUS_LABEL = { OPEN: 'Open', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved', CLOSED: 'Closed' };

async function load(id) {
  const ticket = await support.findById(id);
  if (!ticket) throw notFound('Ticket not found.');
  return ticket;
}

exports.list = async (req, res) => {
  const { source, category, priority, status, hospitalId, from, to, q, page = 1, pageSize = 20 } = req.query;
  const clauses = [];
  const params = [];
  if (source) { clauses.push('t.created_by_role = ?'); params.push(source); }
  if (category) { clauses.push('t.category = ?'); params.push(category); }
  if (priority) { clauses.push('t.priority = ?'); params.push(priority); }
  if (status) { clauses.push('t.status = ?'); params.push(status); }
  if (hospitalId) { clauses.push('t.hospital_id = ?'); params.push(hospitalId); }
  if (from) { clauses.push('DATE(t.created_at) >= ?'); params.push(from); }
  if (to) { clauses.push('DATE(t.created_at) <= ?'); params.push(to); }
  if (q) { clauses.push('(t.subject LIKE ? OR t.ticket_number LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM support_tickets t ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(
    `${support.SELECT} ${where}
     ORDER BY CASE t.status WHEN 'OPEN' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'RESOLVED' THEN 2 ELSE 3 END, t.updated_at DESC LIMIT ? OFFSET ?`,
    [...params, size, (cur - 1) * size]
  );
  const counts = await db.query('SELECT status, COUNT(*) AS n FROM support_tickets GROUP BY status');
  res.json({
    items: rows.map(support.ticketFromRow), total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])), categories: support.CATEGORIES,
  });
};

exports.get = async (req, res) => {
  const ticket = await load(req.params.id);
  res.json({ ticket, messages: await support.messages(ticket.id) });
};

exports.assignees = async (req, res) => {
  const rows = await db.query("SELECT id, name, role FROM users WHERE status = 'ACTIVE' AND role IN ('SUPER_ADMIN','SUPPORT') ORDER BY name");
  res.json({ items: rows });
};

exports.reply = async (req, res) => {
  const ticket = await load(req.params.id);
  if (ticket.status === 'CLOSED') throw badRequest('This ticket is closed.');
  const message = String((req.body && req.body.message) || '').trim();
  if (message.length < 1 || message.length > 2000) throw badRequest('Write a reply (up to 2000 characters).', { message: 'Enter a reply.' });

  await support.addMessage(ticket.id, req.user, 'SUPPORT', message);
  let status = ticket.status;
  if (status === 'OPEN') {
    status = 'IN_PROGRESS';
    await db.query("UPDATE support_tickets SET status = 'IN_PROGRESS', assigned_to = COALESCE(assigned_to, ?) WHERE id = ?", [req.user.id, ticket.id]);
  }
  await auditLog.record({ req, action: 'SUPPORT_REPLIED', entityType: 'SUPPORT_TICKET', entityId: ticket.id, summary: `Replied to ${ticket.ticketNumber}` });
  await notifications.trigger('SUPPORT_TICKET_UPDATED', ticket.createdBy, {
    support_ticket_id: ticket.ticketNumber, ticket_subject: ticket.subject, ticket_status: STATUS_LABEL[status], update_summary: 'Support replied',
  }, { link: ownerLink(ticket) });
  res.status(201).json({ ok: true, message: 'Reply sent.', messages: await support.messages(ticket.id) });
};

exports.assign = async (req, res) => {
  const ticket = await load(req.params.id);
  const { assignedTo } = req.body || {};
  let assignee = null;
  if (assignedTo) {
    assignee = await db.one("SELECT id, name FROM users WHERE id = ? AND status = 'ACTIVE' AND role IN ('SUPER_ADMIN','SUPPORT')", [assignedTo]);
    if (!assignee) throw badRequest('Choose an active support staff member.');
  }
  await db.query('UPDATE support_tickets SET assigned_to = ? WHERE id = ?', [assignee ? assignee.id : null, ticket.id]);
  await auditLog.record({ req, action: 'SUPPORT_ASSIGNED', entityType: 'SUPPORT_TICKET', entityId: ticket.id, summary: `${ticket.ticketNumber} assigned to ${assignee ? assignee.name : 'nobody'}`, previousValue: { assignedTo: ticket.assignedTo }, newValue: { assignedTo: assignee ? assignee.id : null } });
  res.json({ ok: true, message: assignee ? `Assigned to ${assignee.name}.` : 'Ticket unassigned.' });
};

exports.setPriority = async (req, res) => {
  const ticket = await load(req.params.id);
  const { priority } = req.body || {};
  if (!['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)) throw badRequest('Choose a valid priority.');
  if (ticket.status === 'CLOSED') throw badRequest('This ticket is closed.');
  await db.query("UPDATE support_tickets SET priority = ?, sla_due_at = datetime(created_at, '+' || ? || ' hours') WHERE id = ?", [priority, support.SLA_HOURS[priority], ticket.id]);
  await auditLog.record({ req, action: 'SUPPORT_PRIORITY_CHANGED', entityType: 'SUPPORT_TICKET', entityId: ticket.id, summary: `${ticket.ticketNumber}: ${ticket.priority} → ${priority}`, previousValue: { priority: ticket.priority }, newValue: { priority } });
  res.json({ ok: true, message: `Priority set to ${priority.toLowerCase()}.` });
};

exports.setStatus = async (req, res) => {
  const ticket = await load(req.params.id);
  const { status } = req.body || {};
  if (!Object.keys(STATUS_LABEL).includes(status)) throw badRequest('Choose a valid status.');
  if (status === 'CLOSED' && !roleHas(req.user.role, 'support.close')) throw forbidden("Your role can't close tickets.");
  if (ticket.status === status) throw badRequest(`This ticket is already ${STATUS_LABEL[status].toLowerCase()}.`);
  if (!support.STATUS_FLOW[ticket.status].includes(status)) {
    throw badRequest(`A ${STATUS_LABEL[ticket.status].toLowerCase()} ticket can't move to ${STATUS_LABEL[status].toLowerCase()}.`);
  }

  const extra = status === 'RESOLVED' ? ', resolved_at = CURRENT_TIMESTAMP' : status === 'CLOSED' ? ', closed_at = CURRENT_TIMESTAMP' : status === 'IN_PROGRESS' ? ', resolved_at = NULL' : '';
  await db.query(`UPDATE support_tickets SET status = ?${extra}, assigned_to = COALESCE(assigned_to, ?) WHERE id = ?`, [status, req.user.id, ticket.id]);
  await auditLog.record({ req, action: `SUPPORT_${status}`, entityType: 'SUPPORT_TICKET', entityId: ticket.id, summary: `${ticket.ticketNumber}: ${STATUS_LABEL[ticket.status]} → ${STATUS_LABEL[status]}`, previousValue: { status: ticket.status }, newValue: { status } });

  const data = { support_ticket_id: ticket.ticketNumber, ticket_subject: ticket.subject, ticket_status: STATUS_LABEL[status], update_summary: `Status changed to ${STATUS_LABEL[status]}` };
  await notifications.trigger(status === 'RESOLVED' ? 'SUPPORT_TICKET_RESOLVED' : 'SUPPORT_TICKET_UPDATED', ticket.createdBy, data, { link: ownerLink(ticket) });
  res.json({ ok: true, message: `Ticket ${STATUS_LABEL[status].toLowerCase()}.` });
};
