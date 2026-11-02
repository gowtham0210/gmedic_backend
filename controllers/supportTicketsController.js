// Portal tickets API shared by the Doctor and Receptionist portals. Every handler checks the role's
// support permission. A doctor sees the tickets they raised; a receptionist sees every ticket the
// front desk of their hospital raised, so colleagues can follow up and tickets outlive the person
// who raised them. Any other ticket returns 404, the same as a missing one.

const db = require('../db');
const { roleHas } = require('../config/permissions');
const { validate } = require('../utils/validate');
const { badRequest, notFound, forbidden } = require('../utils/http');
const { contains } = require('../utils/like');
const support = require('../services/supportService');
const notifications = require('../services/notificationService');

function need(req, permission) {
  if (!roleHas(req.user.role, permission)) throw forbidden();
}

// SQL (on support_tickets t) for the tickets this portal user can see.
function visibleTo(req) {
  if (req.user.role === 'RECEPTIONIST') return { sql: "t.hospital_id = ? AND t.created_by_role = 'RECEPTIONIST'", params: [req.user.hospitalId] };
  return { sql: 't.created_by = ?', params: [req.user.id] };
}

async function ownTicket(req) {
  need(req, 'support.view_own');
  const { sql, params } = visibleTo(req);
  const row = await db.one(`SELECT t.id FROM support_tickets t WHERE t.id = ? AND ${sql}`, [req.params.id, ...params]);
  if (!row) throw notFound('Ticket not found.');
  return support.findById(row.id);
}

exports.list = async (req, res) => {
  need(req, 'support.view_own');
  const { status, q } = req.query;
  const visible = visibleTo(req);
  const clauses = [visible.sql];
  const params = [...visible.params];
  if (status) { clauses.push('t.status = ?'); params.push(status); }
  if (req.query.mine === '1') { clauses.push('t.created_by = ?'); params.push(req.user.id); }
  if (q) { clauses.push("(t.subject LIKE ? ESCAPE '\\' OR t.ticket_number LIKE ? ESCAPE '\\' OR t.appointment_id = ?)"); params.push(contains(q), contains(q), String(q).trim().toUpperCase()); }
  const rows = await db.query(`${support.SELECT} WHERE ${clauses.join(' AND ')} ORDER BY t.updated_at DESC, t.id DESC`, params);
  res.json({ items: rows.map(support.ticketFromRow), categories: support.CATEGORIES, me: req.user.id, shared: req.user.role === 'RECEPTIONIST' });
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
  // Optional: the appointment the ticket is about (one of this hospital's, or this doctor's).
  let appointment = null;
  const appointmentId = String((req.body && req.body.appointmentId) || '').trim().toUpperCase();
  if (appointmentId) {
    appointment = req.user.role === 'DOCTOR'
      ? await db.one('SELECT id, patient_id FROM appointments WHERE id = ? AND doctor_id = ?', [appointmentId, req.user.doctorId])
      : await db.one('SELECT id, patient_id FROM appointments WHERE id = ? AND hospital_id = ?', [appointmentId, req.user.hospitalId]);
    if (!appointment) throw badRequest('Please correct the highlighted fields.', { appointmentId: 'No appointment with this ID here.' });
  }
  const ticket = await support.createTicket(req.user, { ...value, priority, appointmentId: appointment && appointment.id, patientId: appointment && appointment.patient_id });
  const admins = await notifications.adminUsers(['SUPER_ADMIN', 'SUPPORT']);
  await notifications.trigger('SUPPORT_TICKET_CREATED', admins, {
    support_ticket_id: ticket.ticketNumber, ticket_subject: ticket.subject, raised_by: req.user.name,
    raised_by_role: ticket.createdByRole === 'DOCTOR' ? 'Doctor' : 'Receptionist',
  }, { link: '/admin/support' });
  res.json({ ok: true, message: `Ticket ${ticket.ticketNumber} submitted.`, ticket });
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
  res.json({ ok: true, message: 'Reply sent.', messages: await support.messages(ticket.id) });
};

// POST /api/support/:id/close { reason? } (and /api/doctor/support/:id/close): the person who raised
// it, or a front-desk colleague, closes a ticket they no longer need. Final, like a closed ticket
// in the admin console; a new ticket can always be opened.
exports.close = async (req, res) => {
  need(req, 'support.reply_own');
  const ticket = await ownTicket(req);
  if (ticket.status === 'CLOSED') throw badRequest('This ticket is already closed.');
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
  const done = await db.query("UPDATE support_tickets SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP WHERE id = ? AND status <> 'CLOSED'", [ticket.id]);
  if (!done.affectedRows) throw badRequest('This ticket is already closed.');
  await support.addMessage(ticket.id, req.user, ticket.createdByRole, `Closed by ${req.user.name}${reason ? `: ${reason}` : '.'}`);
  const recipients = ticket.assignedTo ? [ticket.assignedTo] : await notifications.adminUsers(['SUPER_ADMIN', 'SUPPORT']);
  await notifications.trigger('SUPPORT_TICKET_UPDATED', recipients, {
    support_ticket_id: ticket.ticketNumber, ticket_subject: ticket.subject, ticket_status: 'Closed', update_summary: `${req.user.name} closed the ticket`,
  }, { link: '/admin/support' });
  res.json({ ok: true, message: `Ticket ${ticket.ticketNumber} closed.`, ticket: await support.findById(ticket.id), messages: await support.messages(ticket.id) });
};
