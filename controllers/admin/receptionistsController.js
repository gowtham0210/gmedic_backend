const db = require('../../db');
const userModel = require('../../models/userModel');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const staff = require('../../services/staffAccounts');

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
    items: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, hospitalId: r.hospital_id, hospitalName: r.hospital_name, status: r.status, canBookEmergency: !!r.can_book_emergency, createdAt: db.iso(r.created_at) })),
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
  const hospital = await db.one('SELECT id, name, status FROM hospitals WHERE id = ?', [value.hospitalId]);
  if (!hospital) throw badRequest('Choose a valid hospital.', { hospitalId: 'Choose a hospital.' });
  if (hospital.status === 'OFFBOARDED') throw badRequest(`${hospital.name} has been offboarded and can't take staff.`, { hospitalId: 'Choose a hospital that is not offboarded.' });
  await staff.assertContactFree(value);

  const tempPassword = staff.tempPassword();
  const username = await staff.uniqueUsername(value.name);
  const user = await userModel.create({ role: 'RECEPTIONIST', hospitalId: value.hospitalId, name: value.name, username, email: value.email, phone: value.phone, password: tempPassword, status: 'ACTIVE', approvedBy: req.user.id });
  await db.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [user.id]);
  await auditLog.record({ req, action: 'RECEPTIONIST_CREATED', entityType: 'USER', entityId: user.id, summary: `Created receptionist ${value.name} for ${hospital.name}` });
  // `credentials.login` is what the person types to sign in; `receptionist.username` is kept for older clients.
  res.status(201).json({ ok: true, message: `${value.name} has been added to ${hospital.name}.`, receptionist: { id: user.id, username, tempPassword }, credentials: { login: value.email, tempPassword } });
};

// PUT /api/admin/receptionists/:id { name, email, phone, hospitalId }
// Fixes a typo or moves the person to another hospital. A move signs them out, since everything they
// can see (appointments, doctors, tokens) belongs to the hospital they were in.
exports.update = async (req, res) => {
  const target = await userModel.findById(req.params.id);
  if (!target || target.role !== 'RECEPTIONIST') throw notFound('Receptionist not found.');
  const { value, errors, ok } = validate(req.body, {
    name: { label: 'Full name', required: true, minLength: 3, maxLength: 60 },
    email: { label: 'Email', type: 'email', required: true },
    phone: { label: 'Phone', type: 'phone', required: true },
    hospitalId: { label: 'Hospital', required: true },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const hospital = await db.one('SELECT id, name, status FROM hospitals WHERE id = ?', [value.hospitalId]);
  if (!hospital) throw badRequest('Choose a valid hospital.', { hospitalId: 'Choose a hospital.' });
  const moving = value.hospitalId !== target.hospitalId;
  if (moving && hospital.status === 'OFFBOARDED') throw badRequest(`${hospital.name} has been offboarded and can't take staff.`, { hospitalId: 'Choose a hospital that is not offboarded.' });
  await staff.assertContactFree(value, target.id);

  const unchanged = value.name === target.name && value.email === String(target.email).toLowerCase() && value.phone === target.phone && !moving;
  if (unchanged) return res.json({ ok: true, message: 'No changes to save.' });

  const before = await db.one('SELECT h.name AS hospital_name FROM hospitals h WHERE h.id = ?', [target.hospitalId]);
  await db.query(
    `UPDATE users SET name = ?, email = ?, phone = ?, hospital_id = ?${moving ? ', session_version = session_version + 1' : ''} WHERE id = ?`,
    [value.name, value.email, value.phone, value.hospitalId, target.id]
  );
  await auditLog.record({
    req, action: moving ? 'RECEPTIONIST_TRANSFERRED' : 'RECEPTIONIST_UPDATED', entityType: 'USER', entityId: target.id,
    summary: moving ? `${value.name}: ${before ? before.hospital_name : target.hospitalId} → ${hospital.name}` : `Updated details for ${value.name}`,
    previousValue: { name: target.name, email: target.email, phone: target.phone, hospitalId: target.hospitalId },
    newValue: { name: value.name, email: value.email, phone: value.phone, hospitalId: value.hospitalId },
  });
  const message = moving ? `${value.name} now works at ${hospital.name} and has been signed out.` : `${value.name}'s details were saved.`;
  res.json({ ok: true, message, receptionist: { id: target.id, name: value.name, email: value.email, phone: value.phone, hospitalId: value.hospitalId, hospitalName: hospital.name } });
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

// PATCH /api/admin/receptionists/:id/emergency-booking { allowed: boolean }
// Grants or revokes the right to book emergency walk-ins over a full slot (enforced in services/receptionBooking.js).
exports.setEmergencyBooking = async (req, res) => {
  const target = await userModel.findById(req.params.id);
  if (!target || target.role !== 'RECEPTIONIST') throw notFound('Receptionist not found.');
  const allowed = (req.body || {}).allowed;
  if (typeof allowed !== 'boolean') throw badRequest('Send allowed: true or false.', { allowed: 'true or false.' });
  if (allowed === target.canBookEmergency) return res.json({ ok: true, message: `${target.name} already ${allowed ? 'can' : 'cannot'} book emergency walk-ins.`, canBookEmergency: allowed });
  await db.query('UPDATE users SET can_book_emergency = ? WHERE id = ?', [allowed ? 1 : 0, target.id]);
  await auditLog.record({
    req, action: allowed ? 'EMERGENCY_BOOKING_GRANTED' : 'EMERGENCY_BOOKING_REVOKED', entityType: 'USER', entityId: target.id,
    summary: `${allowed ? 'Allowed' : 'Stopped'} ${target.name} ${allowed ? 'to book' : 'from booking'} emergency walk-ins`,
    previousValue: { canBookEmergency: target.canBookEmergency }, newValue: { canBookEmergency: allowed },
  });
  res.json({ ok: true, message: `${target.name} ${allowed ? 'can now' : 'can no longer'} book emergency walk-ins.`, canBookEmergency: allowed });
};

exports.resetPassword = async (req, res) => {
  const target = await userModel.findById(req.params.id);
  if (!target || target.role !== 'RECEPTIONIST') throw notFound('Receptionist not found.');
  const tempPassword = staff.tempPassword();
  await userModel.setPassword(req.params.id, tempPassword, { mustChange: true });
  await auditLog.record({ req, action: 'RECEPTIONIST_PASSWORD_RESET', entityType: 'USER', entityId: req.params.id, summary: `Reset credentials for ${target.name}` });
  res.json({ ok: true, message: `Temporary password issued for ${target.name}. Their sessions have ended.`, tempPassword, credentials: { login: target.email, tempPassword } });
};
