// A doctor's own sign-in to the doctor portal. One login per doctor (users.doctor_id is unique); it is
// deactivated, never deleted. Super Admin (all hospitals) and the hospital's front desk (its own
// doctors) can invite a doctor; Super Admin resets a used login, the front desk only re-issues an unused invitation.

const db = require('../db');
const userModel = require('../models/userModel');
const staff = require('./staffAccounts');
const auditLog = require('./auditLog');
const { validate } = require('../utils/validate');
const { badRequest, forbidden } = require('../utils/http');

async function of(doctorId) {
  const r = await db.one("SELECT id, status, email, last_login_at, must_change_password FROM users WHERE doctor_id = ? AND role = 'DOCTOR'", [doctorId]);
  return r ? { userId: r.id, status: r.status, email: r.email, lastLoginAt: db.iso(r.last_login_at), mustChangePassword: !!r.must_change_password } : null;
}

// `doctor` needs id, name, hospitalId and status. Returns { login, tempPassword } to show once.
async function invite(req, doctor, body) {
  if (doctor.status === 'INACTIVE') throw badRequest(`${doctor.name} is deactivated. Reactivate the doctor before inviting them.`);
  const existing = await of(doctor.id);
  if (existing) throw badRequest(`${doctor.name} already has a portal login (${existing.email}). Reset its password instead.`);
  const { value, errors, ok } = validate(body, {
    email: { label: 'Email', type: 'email', required: true },
    phone: { label: 'Phone', type: 'phone' },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  await staff.assertContactFree(value);
  const tempPassword = staff.tempPassword();
  const user = await userModel.create({ role: 'DOCTOR', hospitalId: doctor.hospitalId, doctorId: doctor.id, name: doctor.name, username: await staff.uniqueUsername(doctor.name), email: value.email, phone: value.phone || null, password: tempPassword, status: 'ACTIVE', approvedBy: req.user.id });
  await db.query('UPDATE users SET must_change_password = 1 WHERE id = ?', [user.id]);
  await auditLog.record({ req, action: 'DOCTOR_LOGIN_CREATED', entityType: 'USER', entityId: user.id, summary: `Invited ${doctor.name} (${doctor.id}) to the doctor portal as ${value.email}` });
  return { login: value.email, tempPassword };
}

// `unusedOnly` (the front desk): only an invitation the doctor never used can be re-issued. Once they
// have signed in, a new password would let whoever asked for it sign in as the doctor and read
// their clinical notes, so that reset is left to Super Admin.
async function resetPassword(req, doctor, { unusedOnly = false } = {}) {
  const login = await of(doctor.id);
  if (!login) throw badRequest(`${doctor.name} has no portal login yet. Invite them first.`);
  if (login.status !== 'ACTIVE') throw badRequest('Activate this login before resetting its password.');
  if (unusedOnly && login.lastLoginAt) throw forbidden(`${doctor.name} has already signed in to the doctor portal. Ask Gmedic support to reset their password.`);
  const tempPassword = staff.tempPassword();
  await userModel.setPassword(login.userId, tempPassword, { mustChange: true });
  await auditLog.record({ req, action: 'DOCTOR_LOGIN_PASSWORD_RESET', entityType: 'USER', entityId: login.userId, summary: `Reset the portal password for ${doctor.name}` });
  return { login: login.email, tempPassword };
}

module.exports = { of, invite, resetPassword };
