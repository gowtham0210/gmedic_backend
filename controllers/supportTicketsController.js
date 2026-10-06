// "My tickets" API shared by the Doctor and Receptionist portals. Every handler
// checks the role's support permission, and ticket access is limited to tickets
// the caller created — a missing or someone-else's ticket both return 404.

const db = require('../db');
const { roleHas } = require('../config/permissions');
const { validate } = require('../utils/validate');
const { badRequest, notFound, forbidden } = require('../utils/http');
const support = require('../services/supportService');
const notifications = require('../services/notificationService');

function need(req, permission) {
  if (!roleHas(req.user.role, permission)) throw forbidden();
}

async function ownTicket(req) {
  need(req, 'support.view_own');
  const ticket = await support.findById(req.params.id);
  if (!ticket || ticket.createdBy !== req.user.id) throw notFound('Ticket not found.');
  return ticket;
}

exports.list = async (req, res) => {
  need(req, 'support.view_own');
  const { status, q } = req.query;
  const clauses = ['t.created_by = ?'];
  const params = [req.user.id];
  if (status) { clauses.push('t.status = ?'); params.push(status); }
  if (q) { clauses.push('(t.subject LIKE ? OR t.ticket_number LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const rows = await db.query(`${support.SELECT} WHERE ${clauses.join(' AND ')} ORDER BY t.updated_at DESC, t.id DESC`, params);
  res.json({ items: rows.map(support.ticketFromRow), categories: support.CATEGORIES });
};

exports.create = async (req, res) => {
  need(req, 'support.create');
  const { value, errors, ok } = validate(req.body, {
    category: { label: 'Category', required: true, type: 'enum', values: support.CATEGORIES },
    subject: { label: 'Subject', required: true, minLength: 3, maxLength: 160 },
    description: { label: 'Description', required: true, minLength: 5, maxLength: 2000 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const priority = support.USER_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'MEDIUM';
  const ticket = await support.createTicket(req.user, { ...value, priority });
  const admins = await notifications.adminUsers(['SUPER_ADMIN', 'SUPPORT']);
  await notifications.trigger('SUPPORT_TICKET_CREATED', admins, {
    support_ticket_id: ticket.ticketNumber, ticket_subject: ticket.subject, raised_by: req.user.name,
    raised_by_role: ticket.createdByRole === 'DOCTOR' ? 'Doctor' : 'Receptionist',
  }, { link: '/admin/support' });
  res.status(201).json({ ok: true, message: `Ticket ${ticket.ticketNumber} submitted.`, ticket });
};

exports.get = async (req, res) => {
  const ticket = await ownTicket(req);
  res.json({ ticket, messages: await support.messages(ticket.id) });
};

exports.reply = async (req, res) => {
  need(req, 'support.reply_own');
  const ticket = await ownTicket(req);
  if (ticket.status === 'CLOSED') throw badRequest('This ticket is closed. Please open a new ticket.');
  const message = String((req.body && req.body.message) || '').trim();
  if (message.length < 1 || message.length > 2000) throw badRequest('Write a reply (up to 2000 characters).', { message: 'Enter a reply.' });
  await support.addMessage(ticket.id, req.user, ticket.createdByRole, message);
  if (ticket.status === 'RESOLVED') await db.query("UPDATE support_tickets SET status = 'OPEN', resolved_at = NULL WHERE id = ?", [ticket.id]);

  const recipients = ticket.assignedTo ? [ticket.assignedTo] : await notifications.adminUsers(['SUPER_ADMIN', 'SUPPORT']);
  await notifications.trigger('SUPPORT_TICKET_UPDATED', recipients, {
    support_ticket_id: ticket.ticketNumber, ticket_subject: ticket.subject, ticket_status: ticket.status === 'RESOLVED' ? 'Open' : ticket.status.replace('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), update_summary: `${req.user.name} replied`,
  }, { link: '/admin/support' });
  res.status(201).json({ ok: true, message: 'Reply sent.', messages: await support.messages(ticket.id) });
};
