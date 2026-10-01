// Authentication + role-based access control for all three portals.
//
// Session shape: { userId, role, sessionVersion, remember, lastSeen, loginAt }.
// `sessionVersion` is compared against users.session_version on every request,
// so changing a password, deactivating an account, or "log out everywhere"
// (all of which bump that column) invalidates existing sessions immediately —
// this does not rely on the cookie alone.

const config = require('../config');
const userModel = require('../models/userModel');
const hospitalModel = require('../models/hospitalModel');
const { ADMIN_ROLES, roleHas } = require('../config/permissions');

const DASHBOARD_BY_ROLE = {
  RECEPTIONIST: '/dashboard',
  DOCTOR: '/doctor/dashboard',
  SUPER_ADMIN: '/admin/dashboard',
  FINANCE: '/admin/dashboard',
  SUPPORT: '/admin/dashboard',
  OPERATIONS: '/admin/dashboard',
};

async function currentUser(req) {
  const s = req.session;
  if (!s || !s.userId) return null;

  const now = Date.now();
  if (s.loginAt && now - s.loginAt > config.sessionMaxHours * 3600000) return null;
  // Sessions without "Remember me" end after a period of inactivity.
  if (!s.remember && s.lastSeen && now - s.lastSeen > config.idleTimeoutMinutes * 60000) return null;

  const user = await userModel.findById(s.userId);
  if (!user || user.status !== 'ACTIVE' || user.role !== s.role) return null;
  if (user.sessionVersion !== s.sessionVersion) return null; // password changed / deactivated / logged out elsewhere

  s.lastSeen = now;
  return user;
}

async function attachReceptionist(req, res, user) {
  req.user = user;
  req.hospitalId = user.hospitalId;
  res.locals.user = userModel.toPublic(user);
  res.locals.hospital = await hospitalModel.toPublic(await hospitalModel.findById(user.hospitalId));
}

function attachAdmin(req, res, user) {
  req.user = user;
  res.locals.user = userModel.toPublic(user);
  res.locals.permissions = [...require('../config/permissions').permissionsFor(user.role)];
}

// ---- Receptionist portal ---------------------------------------------------

async function requireAuth(req, res, next) {
  const user = await currentUser(req);
  if (!user || user.role !== 'RECEPTIONIST') {
    const nextUrl = req.originalUrl && req.originalUrl !== '/' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
    return res.redirect(`/login${nextUrl}`);
  }
  await attachReceptionist(req, res, user);
  next();
}

async function requireApiAuth(req, res, next) {
  const user = await currentUser(req);
  if (!user || user.role !== 'RECEPTIONIST') return res.status(401).json({ error: 'Your session has ended. Please log in again.' });
  await attachReceptionist(req, res, user);
  next();
}

// ---- Admin portal (Super Admin + internal roles) --------------------------

function requireAdmin(permission) {
  return async (req, res, next) => {
    const user = await currentUser(req);
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      const nextUrl = req.originalUrl && req.originalUrl !== '/' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
      return res.redirect(`/login${nextUrl}`);
    }
    if (permission && !roleHas(user.role, permission)) {
      return res.status(403).render('error', { title: 'Access denied', status: 403, message: "Your role doesn't have permission to view this page." });
    }
    attachAdmin(req, res, user);
    next();
  };
}

function requireAdminApi(permission) {
  return async (req, res, next) => {
    const user = await currentUser(req);
    if (!user || !ADMIN_ROLES.includes(user.role)) return res.status(401).json({ error: 'Your session has ended. Please log in again.' });
    if (permission && !roleHas(user.role, permission)) return res.status(403).json({ error: "Your role doesn't have permission to do this." });
    attachAdmin(req, res, user);
    next();
  };
}

async function redirectIfAuthenticated(req, res, next) {
  const user = await currentUser(req);
  if (user) return res.redirect(DASHBOARD_BY_ROLE[user.role] || '/login');
  next();
}

module.exports = { requireAuth, requireApiAuth, requireAdmin, requireAdminApi, redirectIfAuthenticated, currentUser, DASHBOARD_BY_ROLE };
