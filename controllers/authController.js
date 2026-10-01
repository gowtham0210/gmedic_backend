const config = require('../config');
const userModel = require('../models/userModel');
const { verifyPassword } = require('../utils/password');
const { validate } = require('../utils/validate');
const { safeNext } = require('../utils/http');
const { DASHBOARD_BY_ROLE } = require('../middleware/auth');
const { ADMIN_ROLES } = require('../config/permissions');
const auditLog = require('../services/auditLog');

const ROLES = ['RECEPTIONIST', 'SUPER_ADMIN', 'DOCTOR'];

// Simple in-memory throttle: 5 failed attempts per 10 minutes per IP + login.
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function throttleKey(req, identifier) {
  return `${req.ip}|${String(identifier || '').toLowerCase()}`;
}

function isLocked(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) { attempts.delete(key); return false; }
  return a.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() });
  else a.count += 1;
}

exports.showLogin = (req, res) => {
  const role = ROLES.includes(req.query.role) ? req.query.role : 'RECEPTIONIST';
  res.render('login', {
    title: 'Log in',
    role,
    next: safeNext(req.query.next, ''),
    loggedOut: req.query.loggedOut === '1',
    expired: req.query.expired === '1',
  });
};

exports.login = async (req, res, next) => {
  const { value, errors, ok } = validate(req.body, {
    identifier: { label: 'Email or username', required: true, maxLength: 120 },
    password: { label: 'Password', required: true, maxLength: 200 },
    role: { label: 'Role', type: 'enum', required: true, values: ROLES, message: 'Choose Super Admin, Receptionist or Doctor.' },
  });
  if (!ok) return res.status(400).json({ error: 'Please fill in all required fields.', fields: errors });

  const key = throttleKey(req, value.identifier);
  if (isLocked(key)) {
    return res.status(429).json({ error: 'Too many failed attempts. Please wait a few minutes and try again.' });
  }

  // IMPORTANT: the role selected on the login form only chooses which account
  // table/scope to check against; it never grants access by itself. The user
  // still needs a matching, ACTIVE account of that exact role in the database
  // (see userModel.findByLogin — role is part of the WHERE clause), and every
  // route after login re-checks role/permission server-side on each request
  // (middleware/auth.js). Selecting "Super Admin" here does nothing unless the
  // account itself was created as SUPER_ADMIN by another admin / db:setup.
  const user = await userModel.findByLogin(value.identifier, value.role);
  if (!user || !verifyPassword(String(req.body.password), user.passwordHash)) {
    recordFailure(key);
    return res.status(401).json({ error: 'Incorrect email/username or password.' });
  }
  if (user.status !== 'ACTIVE') {
    recordFailure(key);
    return res.status(403).json({ error: 'This account is not active. Contact your Gmedic administrator.' });
  }
  attempts.delete(key);

  const remember = req.body.remember === true || req.body.remember === 'on' || req.body.remember === 'true';
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.sessionVersion = user.sessionVersion;
    req.session.remember = remember;
    req.session.loginAt = Date.now();
    req.session.lastSeen = Date.now();
    req.session.notificationsReadAt = Date.now() - 12 * 3600 * 1000;
    if (remember) req.session.cookie.maxAge = config.rememberMeDays * 24 * 3600 * 1000;
    else req.session.cookie.expires = false; // browser-session cookie

    req.session.save(async (saveErr) => {
      if (saveErr) return next(saveErr);
      require('../db').query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]).catch(() => {});
      if (ADMIN_ROLES.includes(user.role)) {
        auditLog.record({ req: { ...req, user }, action: 'LOGIN', entityType: 'USER', entityId: user.id, summary: `${user.name} logged in as ${user.role}` }).catch(() => {});
      }
      res.json({ ok: true, redirect: safeNext(req.body.next, DASHBOARD_BY_ROLE[user.role]) });
    });
  });
};

// Receptionist/doctor accounts are managed by the hospital's Gmedic admin;
// Super Admin/internal accounts are managed by another Super Admin. Either
// way, the response never reveals whether the account exists.
exports.forgotPassword = (req, res) => {
  const { errors, ok } = validate(req.body, {
    identifier: { label: 'Email or username', required: true, maxLength: 120 },
  });
  if (!ok) return res.status(400).json({ error: errors.identifier, fields: errors });
  res.json({
    ok: true,
    message: 'If an account matches, your administrator has been notified and will contact you to reset your password.',
  });
};

exports.logout = (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('gmedic.sid');
    if (req.accepts(['html', 'json']) === 'json') return res.json({ ok: true, redirect: '/login?loggedOut=1' });
    res.redirect('/login?loggedOut=1');
  });
};
