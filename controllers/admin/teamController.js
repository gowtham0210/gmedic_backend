// Admin team: the people who use the Super Admin console (Super Admin, Finance, Support, Operations).
// Accounts are invited with a one-time password, can change role, and are deactivated — never deleted,
// so the audit trail keeps pointing at a real person.

const db = require('../../db');
const userModel = require('../../models/userModel');
const auditLog = require('../../services/auditLog');
const staff = require('../../services/staffAccounts');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const { ADMIN_ROLES } = require('../../config/permissions');

const ROLE_LABEL = { SUPER_ADMIN: 'Super Admin', FINANCE: 'Finance', SUPPORT: 'Support', OPERATIONS: 'Operations' };

function toItem(r) {
  return {
    id: r.id, name: r.name, email: r.email, username: r.username, phone: r.phone, role: r.role, status: r.status,
    mustChangePassword: !!r.must_change_password, lastLoginAt: db.iso(r.last_login_at), createdAt: db.iso(r.created_at),
  };
}

async function loadMember(id) {
  const row = await db.one(`SELECT * FROM users WHERE id = ? AND role IN (${ADMIN_ROLES.map(() => '?').join(',')})`, [id, ...ADMIN_ROLES]);
  if (!row) throw notFound('Team member not found.');
  return row;
}

// The console must always keep one active Super Admin, or nobody could manage the team again.
async function assertNotLastSuperAdmin(member, message) {
  if (member.role !== 'SUPER_ADMIN' || member.status !== 'ACTIVE') return;
  const others = (await db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' AND id <> ?", [member.id])).n;
  if (!Number(others)) throw badRequest(message);
}

// GET /api/admin/team?q=&role=&status=
exports.list = async (req, res) => {
  const clauses = [`role IN (${ADMIN_ROLES.map(() => '?').join(',')})`];
  const params = [...ADMIN_ROLES];
  if (req.query.role && ADMIN_ROLES.includes(req.query.role)) { clauses.push('role = ?'); params.push(req.query.role); }
  if (['ACTIVE', 'INACTIVE'].includes(req.query.status)) { clauses.push('status = ?'); params.push(req.query.status); }
  if (req.query.q) { clauses.push('(name LIKE ? OR email LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  const rows = await db.query(`SELECT * FROM users WHERE ${clauses.join(' AND ')} ORDER BY status, name`, params);
  res.json({ items: rows.map(toItem), roles: ADMIN_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })), me: req.user.id });
};

// POST /api/admin/team { name, email, phone?, role }
exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    name: { label: 'Full name', required: true, minLength: 3, maxLength: 60 },
    email: { label: 'Email', type: 'email', required: true },
    phone: { label: 'Phone', type: 'phone' },
    role: { label: 'Role', type: 'enum', required: true, values: ADMIN_ROLES, message: 'Choose a role.' },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  await staff.assertContactFree(value);
  const tempPassword = staff.tempPassword();
  const username = await staff.uniqueUsername(value.name);
  const user = await userModel.create({ role: value.role, name: value.name, username, email: value.email, phone: value.phone || null, password: tempPassword, status: 'ACTIVE', approvedBy: req.user.id });
  await db.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [user.id]);
  await auditLog.record({ req, action: 'TEAM_MEMBER_CREATED', entityType: 'USER', entityId: user.id, summary: `Invited ${value.name} as ${ROLE_LABEL[value.role]}`, newValue: { role: value.role, email: value.email } });
  res.status(201).json({ ok: true, message: `${value.name} has been added as ${ROLE_LABEL[value.role]}.`, member: toItem(await loadMember(user.id)), credentials: { login: value.email, tempPassword } });
};

// PATCH /api/admin/team/:id { role?, name?, phone? }
exports.update = async (req, res) => {
  const member = await loadMember(req.params.id);
  const { value, errors, ok } = validate(req.body, {
    name: { label: 'Full name', minLength: 3, maxLength: 60 },
    phone: { label: 'Phone', type: 'phone' },
    role: { label: 'Role', type: 'enum', values: ADMIN_ROLES, message: 'Choose a role.' },
  }, { partial: true });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const roleChanges = value.role && value.role !== member.role;
  if (roleChanges && member.id === req.user.id) throw badRequest('You cannot change your own role. Ask another Super Admin.');
  if (roleChanges) await assertNotLastSuperAdmin(member, 'This is the only active Super Admin. Make someone else a Super Admin first.');
  if (value.phone) await staff.assertContactFree({ phone: value.phone }, member.id);

  await db.query(
    `UPDATE users SET name = COALESCE(?, name), phone = CASE WHEN ? THEN ? ELSE phone END, role = COALESCE(?, role)${roleChanges ? ', session_version = session_version + 1' : ''} WHERE id = ?`,
    [value.name || null, value.phone !== undefined ? 1 : 0, value.phone || null, roleChanges ? value.role : null, member.id]
  );
  const after = await loadMember(member.id);
  await auditLog.record({ req, action: roleChanges ? 'TEAM_ROLE_CHANGED' : 'TEAM_MEMBER_UPDATED', entityType: 'USER', entityId: member.id,
    summary: roleChanges ? `${after.name}: ${ROLE_LABEL[member.role]} → ${ROLE_LABEL[after.role]}` : `Updated ${after.name}`,
    previousValue: { role: member.role, name: member.name, phone: member.phone }, newValue: { role: after.role, name: after.name, phone: after.phone } });
  const message = roleChanges ? `${after.name} is now ${ROLE_LABEL[after.role]}. They will need to sign in again.` : `${after.name}'s details were saved.`;
  res.json({ ok: true, message, member: toItem(after) });
};

// PATCH /api/admin/team/:id/status { status }
exports.setStatus = async (req, res) => {
  const member = await loadMember(req.params.id);
  const { status } = req.body || {};
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw badRequest('Choose Active or Inactive.');
  if (status === member.status) return res.json({ ok: true, message: 'No changes to save.', member: toItem(member) });
  if (status === 'INACTIVE') {
    if (member.id === req.user.id) throw badRequest('You cannot deactivate your own account.');
    await assertNotLastSuperAdmin(member, 'This is the only active Super Admin, so it cannot be deactivated.');
  }
  await userModel.setStatus(member.id, status);
  await auditLog.record({ req, action: `TEAM_MEMBER_${status}`, entityType: 'USER', entityId: member.id, summary: `${member.name}: ${member.status} → ${status}` });
  res.json({ ok: true, message: `${member.name} is now ${status === 'ACTIVE' ? 'active' : 'deactivated'}.`, member: toItem(await loadMember(member.id)) });
};

// POST /api/admin/team/:id/reset-password
exports.resetPassword = async (req, res) => {
  const member = await loadMember(req.params.id);
  if (member.id === req.user.id) throw badRequest('Change your own password from My profile.');
  if (member.status !== 'ACTIVE') throw badRequest('Activate this account before resetting its password.');
  const tempPassword = staff.tempPassword();
  await userModel.setPassword(member.id, tempPassword, { mustChange: true });
  await auditLog.record({ req, action: 'TEAM_PASSWORD_RESET', entityType: 'USER', entityId: member.id, summary: `Reset the password for ${member.name}` });
  res.json({ ok: true, message: `Temporary password issued for ${member.name}. Their other sessions have ended.`, credentials: { login: member.email, tempPassword } });
};
