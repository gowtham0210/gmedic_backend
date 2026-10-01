import { NextResponse } from 'next/server';
import userModel from '../../../../models/userModel';
import db from '../../../../db';
import { verifyPassword } from '../../../../utils/password';
import { validate } from '../../../../utils/validate';
import { safeNext } from '../../../../utils/http';
import { createSession } from '../../../../lib/session';
import { ADMIN_ROLES } from '../../../../config/permissions';
import auditLog from '../../../../services/auditLog';

const ROLES = ['RECEPTIONIST', 'SUPER_ADMIN', 'DOCTOR'];
const DASHBOARD_BY_ROLE = { RECEPTIONIST: '/dashboard', DOCTOR: '/doctor/dashboard', SUPER_ADMIN: '/admin/dashboard', FINANCE: '/admin/dashboard', SUPPORT: '/admin/dashboard', OPERATIONS: '/admin/dashboard' };

// Simple in-memory throttle: 5 failed attempts per 10 minutes per IP + login.
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function clientIp(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
}
function throttleKey(req, identifier) {
  return `${clientIp(req)}|${String(identifier || '').toLowerCase()}`;
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

export async function POST(req) {
  try {
    return await handleLogin(req);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

async function handleLogin(req) {
  const body = await req.json().catch(() => ({}));
  const { value, errors, ok } = validate(body, {
    identifier: { label: 'Email or username', required: true, maxLength: 120 },
    password: { label: 'Password', required: true, maxLength: 200 },
    role: { label: 'Role', type: 'enum', required: true, values: ROLES, message: 'Choose Super Admin, Receptionist or Doctor.' },
  });
  if (!ok) return NextResponse.json({ error: 'Please fill in all required fields.', fields: errors }, { status: 400 });

  const key = throttleKey(req, value.identifier);
  if (isLocked(key)) return NextResponse.json({ error: 'Too many failed attempts. Please wait a few minutes and try again.' }, { status: 429 });

  // The role selected on the form only chooses which account to check against
  // (see userModel.findByLogin — role is part of the WHERE clause). It never
  // grants access by itself: every route re-checks role/permission server-side
  // via lib/rbac.js on each request, and an account only has SUPER_ADMIN if it
  // was created that way in the database (db:setup or by another admin).
  const user = await userModel.findByLogin(value.identifier, value.role);
  if (!user || !verifyPassword(String(body.password || ''), user.passwordHash)) {
    recordFailure(key);
    return NextResponse.json({ error: 'Incorrect email/username or password.' }, { status: 401 });
  }
  if (user.status !== 'ACTIVE') {
    recordFailure(key);
    return NextResponse.json({ error: 'This account is not active. Contact your Gmedic administrator.' }, { status: 403 });
  }
  attempts.delete(key);

  const remember = body.remember === true || body.remember === 'on';
  await createSession(user, { remember });
  db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]).catch(() => {});
  if (ADMIN_ROLES.includes(user.role)) {
    auditLog.record({ req: { user, ip: clientIp(req), get: (h) => req.headers.get(h) }, action: 'LOGIN', entityType: 'USER', entityId: user.id, summary: `${user.name} logged in as ${user.role}` }).catch(() => {});
  }

  return NextResponse.json({ ok: true, redirect: safeNext(body.next, DASHBOARD_BY_ROLE[user.role]) });
}
