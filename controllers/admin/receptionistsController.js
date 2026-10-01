const db = require('../../db');
const userModel = require('../../models/userModel');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');

function slugUsername(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40);
}

exports.list = async (req, res) => {
  const { hospitalId, status, q, page = 1, pageSize = 20 } = req.query;
  const clauses = ["u.role = 'RECEPTIONIST'"];
  const params = [];
  if (hospitalId) { clauses.push('u.hospital_id = ?'); params.push(hospitalId); }
  if (status) { clauses.push('u.status = ?'); params.push(status); }
  if (q) { clauses.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const total = (await db.one(`SELECT COUNT(*) AS n FROM users u ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(
    `SELECT u.*, h.name AS hospital_name FROM users u JOIN hospitals h ON h.id = u.hospital_id ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    [...params, size, (cur - 1) * size]
  );
  res.json({
    items: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, hospitalId: r.hospital_id, hospitalName: r.hospital_name, status: r.status, createdAt: db.iso(r.created_at) })),
    total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
  });
};

exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    name: { label: 'Full name', required: true, minLength: 3, maxLength: 60 },
    email: { label: 'Email', type: 'email', required: true },
    phone: { label: 'Phone', type: 'phone', required: true },
    hospitalId: { label: 'Hospital', required: true },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const hospital = await db.one('SELECT id, name FROM hospitals WHERE id = ?', [value.hospitalId]);
  if (!hospital) throw badRequest('Choose a valid hospital.', { hospitalId: 'Choose a hospital.' });

  const tempPassword = `Gmedic@${Math.floor(1000 + Math.random() * 9000)}`;
  let username = slugUsername(value.name) || `user${Date.now()}`;
  if (await db.one('SELECT id FROM users WHERE username = ?', [username])) username = `${username}${Math.floor(Math.random() * 900 + 100)}`;

  const user = await userModel.create({ role: 'RECEPTIONIST', hospitalId: value.hospitalId, name: value.name, username, email: value.email, phone: value.phone, password: tempPassword, status: 'ACTIVE', approvedBy: req.user.id });
  await db.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [user.id]);
  await auditLog.record({ req, action: 'RECEPTIONIST_CREATED', entityType: 'USER', entityId: user.id, summary: `Created receptionist ${value.name} for ${hospital.name}` });
  res.status(201).json({ ok: true, message: `${value.name} has been added to ${hospital.name}.`, receptionist: { id: user.id, username, tempPassword } });
};

exports.setStatus = async (req, res) => {
  const target = await userModel.findById(req.params.id);
  if (!target || target.role !== 'RECEPTIONIST') throw notFound('Receptionist not found.');
  const { status } = req.body || {};
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw badRequest('Choose Active or Inactive.');
  await userModel.setStatus(req.params.id, status);
  await auditLog.record({ req, action: `RECEPTIONIST_${status}`, entityType: 'USER', entityId: req.params.id, summary: `${target.name}: ${target.status} → ${status}` });
  res.json({ ok: true, message: `${target.name} is now ${status.toLowerCase()}.` });
};

exports.resetPassword = async (req, res) => {
  const target = await userModel.findById(req.params.id);
  if (!target || target.role !== 'RECEPTIONIST') throw notFound('Receptionist not found.');
  const tempPassword = `Gmedic@${Math.floor(1000 + Math.random() * 9000)}`;
  await userModel.setPassword(req.params.id, tempPassword, { mustChange: true });
  await auditLog.record({ req, action: 'RECEPTIONIST_PASSWORD_RESET', entityType: 'USER', entityId: req.params.id, summary: `Reset credentials for ${target.name}` });
  res.json({ ok: true, message: `Temporary password issued for ${target.name}.`, tempPassword });
};
