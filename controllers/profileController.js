const userModel = require('../models/userModel');
const { validate } = require('../utils/validate');
const { verifyPassword, isStrongPassword } = require('../utils/password');
const { badRequest } = require('../utils/http');

exports.me = (req, res) => {
  res.json({ user: userModel.toPublic(req.user), hospital: res.locals.hospital });
};

exports.update = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    name: { label: 'Full name', required: true, minLength: 3, maxLength: 60, pattern: /^[A-Za-z][A-Za-z .'-]*$/, message: 'Name can only contain letters and spaces.' },
    phone: { label: 'Phone', type: 'phone', required: true },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const user = await userModel.updateProfile(req.user.id, value);
  res.json({ ok: true, message: 'Profile updated.', user: userModel.toPublic(user) });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  const errors = {};
  if (!currentPassword) errors.currentPassword = 'Enter your current password.';
  else if (!verifyPassword(String(currentPassword), req.user.passwordHash)) errors.currentPassword = 'Current password is incorrect.';
  if (!isStrongPassword(newPassword)) errors.newPassword = 'Use at least 8 characters with a letter and a number.';
  else if (newPassword === currentPassword) errors.newPassword = 'New password must be different from the current one.';
  if (!errors.newPassword && newPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);

  // Bumps session_version, so any other active session for this user is signed out.
  await userModel.setPassword(req.user.id, String(newPassword));
  req.session.sessionVersion = (req.session.sessionVersion || 0) + 1;
  res.json({ ok: true, message: 'Your password has been changed.' });
};

// Admin console accounts (Super Admin, Finance, Support, Operations): phone is optional for them.
exports.updateAdmin = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    name: { label: 'Full name', required: true, minLength: 3, maxLength: 60, pattern: /^[A-Za-z][A-Za-z .'-]*$/, message: 'Name can only contain letters and spaces.' },
    phone: { label: 'Phone', type: 'phone' },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  if (value.phone) await require('../services/staffAccounts').assertContactFree({ phone: value.phone }, req.user.id);
  const user = await userModel.updateProfile(req.user.id, { name: value.name, phone: value.phone || null });
  res.json({ ok: true, message: 'Profile updated.', user: userModel.toPublic(user) });
};
