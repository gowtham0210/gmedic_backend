const db = require('../../db');
const { validate } = require('../../utils/validate');
const { badRequest } = require('../../utils/http');

const CATEGORIES = ['BOOKING', 'PAYMENT', 'REFUND', 'QR', 'ACCOUNT', 'TECHNICAL', 'OTHER'];
const SLA_HOURS = { LOW: 72, MEDIUM: 24, HIGH: 8, URGENT: 2 };

exports.list = async (req, res) => {
  const rows = await db.query('SELECT * FROM support_tickets WHERE created_by = ? ORDER BY created_at DESC', [req.user.id]);
  res.json({
    items: rows.map((t) => ({
      id: t.id, subject: t.subject, category: t.category, priority: t.priority, status: t.status,
      createdAt: db.iso(t.created_at), resolvedAt: db.iso(t.resolved_at),
    })),
  });
};

exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    category: { label: 'Category', required: true, type: 'enum', values: CATEGORIES },
    subject: { label: 'Subject', required: true, minLength: 3, maxLength: 160 },
    description: { label: 'Description', required: true, minLength: 5, maxLength: 2000 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const priority = 'MEDIUM';
  const id = await db.nextId('support_tickets', 'TKT', 1);
  await db.query(
    `INSERT INTO support_tickets (id, source, category, subject, description, hospital_id, priority, status, sla_due_at, created_by)
     VALUES (?, 'INTERNAL', ?, ?, ?, ?, ?, 'OPEN', datetime('now', '+' || ? || ' hours'), ?)`,
    [id, value.category, value.subject, value.description, req.hospitalId, priority, SLA_HOURS[priority], req.user.id]
  );
  res.status(201).json({ ok: true, message: 'Support request submitted.', id });
};
