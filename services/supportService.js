// One support/ticketing implementation shared by the Doctor portal, the
// Receptionist portal and the Super Admin console.

const db = require('../db');

const CATEGORIES = ['APPOINTMENT', 'PAYMENT', 'REFUND', 'HOSPITAL', 'DOCTOR', 'ACCOUNT', 'QR', 'SCHEDULE', 'TECHNICAL', 'OTHER'];
const USER_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const SLA_HOURS = { LOW: 72, MEDIUM: 24, HIGH: 8, URGENT: 2 };
const STATUS_FLOW = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
};

const SELECT = `
  SELECT t.*, h.name AS hospital_name, au.name AS assignee_name, cu.name AS creator_name
  FROM support_tickets t
  LEFT JOIN hospitals h ON h.id = t.hospital_id
  LEFT JOIN users au ON au.id = t.assigned_to
  LEFT JOIN users cu ON cu.id = t.created_by`;

function ticketFromRow(r) {
  return {
    id: r.id, ticketNumber: r.ticket_number, createdBy: r.created_by, createdByName: r.creator_name, createdByRole: r.created_by_role,
    hospitalId: r.hospital_id, hospitalName: r.hospital_name, category: r.category, subject: r.subject, description: r.description,
    priority: r.priority, status: r.status, assignedTo: r.assigned_to, assigneeName: r.assignee_name,
    slaDueAt: db.iso(r.sla_due_at), createdAt: db.iso(r.created_at), updatedAt: db.iso(r.updated_at),
    resolvedAt: db.iso(r.resolved_at), closedAt: db.iso(r.closed_at),
  };
}

function messageFromRow(m) {
  return { id: m.id, senderId: m.sender_id, senderRole: m.sender_role, senderName: m.sender_name, message: m.message, createdAt: db.iso(m.created_at) };
}

async function messages(ticketId) {
  const rows = await db.query(
    // The sender's role is derived from users.role instead of being stored on every message.
    `SELECT m.*, CASE WHEN u.id IS NULL THEN 'PATIENT' WHEN u.role IN ('DOCTOR','RECEPTIONIST') THEN u.role ELSE 'SUPPORT' END AS sender_role
     FROM support_messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.ticket_id = ? ORDER BY m.id`, [ticketId]);
  return rows.map(messageFromRow);
}

async function findById(id) {
  const row = await db.one(`${SELECT} WHERE t.id = ?`, [id]);
  return row ? ticketFromRow(row) : null;
}

async function createTicket(user, { category, subject, description, priority }) {
  const id = await db.nextId('support_tickets', 'TKT', 1);
  const number = `SUP-${1000 + Number(id.slice(3))}`;
  const role = user.role === 'DOCTOR' || user.role === 'RECEPTIONIST' ? user.role : 'ADMIN';
  await db.tx(async (conn) => {
    await conn.query(
      `INSERT INTO support_tickets (id, ticket_number, created_by, created_by_role, hospital_id, category, subject, description, priority, status, sla_due_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', datetime('now', '+' || ? || ' hours'))`,
      [id, number, user.id, role, user.hospitalId || null, category, subject, description, priority, SLA_HOURS[priority]]
    );
    await conn.query('INSERT INTO support_messages (ticket_id, sender_id, sender_name, message) VALUES (?, ?, ?, ?)', [id, user.id, user.name, description]);
  });
  return findById(id);
}

async function addMessage(ticketId, user, senderRole, message) {
  await db.query('INSERT INTO support_messages (ticket_id, sender_id, sender_name, message) VALUES (?, ?, ?, ?)', [ticketId, user.id, user.name, message]);
  await db.query('UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [ticketId]);
}

module.exports = { CATEGORIES, USER_PRIORITIES, SLA_HOURS, STATUS_FLOW, SELECT, ticketFromRow, messages, findById, createTicket, addMessage };
