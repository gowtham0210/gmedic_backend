// Session handling for the Next.js app, backed by the same `sessions` MySQL
// table the rest of the platform uses. Reading a session works from anywhere
// (Server Components, Route Handlers); creating/destroying one only works
// inside a Route Handler or Server Action, per Next.js's cookies() rules.

import { cookies } from 'next/headers';
import crypto from 'crypto';
import db from '../db';
import userModel from '../models/userModel';
import config from '../config';

const COOKIE = 'gmedic.sid';

function expiresAt(remember) {
  const ms = remember ? config.rememberMeDays * 24 * 3600000 : config.idleTimeoutMinutes * 60000;
  return new Date(Date.now() + ms);
}

// Reads + validates the current session. Returns the live user row (or null).
// Also re-checks role/status/session_version against the DB, so a password
// change, deactivation, or "log out everywhere" takes effect immediately.
export async function getSessionUser() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (!sid) return null;

  const row = await db.one("SELECT * FROM sessions WHERE sid = ? AND expires_at >= CURRENT_TIMESTAMP", [sid]);
  if (!row) return null;
  let data;
  try { data = JSON.parse(row.data); } catch { return null; }

  const now = Date.now();
  if (data.loginAt && now - data.loginAt > config.sessionMaxHours * 3600000) return null;
  if (!data.remember && data.lastSeen && now - data.lastSeen > config.idleTimeoutMinutes * 60000) return null;

  const user = await userModel.findById(data.userId);
  if (!user || user.status !== 'ACTIVE' || user.role !== data.role) return null;
  if (user.sessionVersion !== data.sessionVersion) return null;

  // Touch lastSeen (best-effort; a failure here shouldn't fail the request).
  data.lastSeen = now;
  db.query('UPDATE sessions SET data = ?, expires_at = ? WHERE sid = ?', [JSON.stringify(data), db.toSql(expiresAt(data.remember)), sid]).catch(() => {});

  return { ...user, sessionId: sid };
}

// Call only from a Route Handler / Server Action.
export async function createSession(user, { remember = false } = {}) {
  const sid = crypto.randomBytes(32).toString('hex');
  const data = { userId: user.id, role: user.role, sessionVersion: user.sessionVersion, remember, loginAt: Date.now(), lastSeen: Date.now(), notificationsReadAt: Date.now() - 12 * 3600 * 1000 };
  await db.query('INSERT INTO sessions (sid, user_id, data, expires_at) VALUES (?, ?, ?, ?)', [sid, user.id, JSON.stringify(data), db.toSql(expiresAt(remember))]);

  const jar = await cookies();
  jar.set(COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    ...(remember ? { maxAge: config.rememberMeDays * 24 * 3600 } : {}),
  });
  return sid;
}

// Call only from a Route Handler / Server Action.
export async function destroySession() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) await db.query('DELETE FROM sessions WHERE sid = ?', [sid]).catch(() => {});
  jar.delete(COOKIE);
}

// Raw session data object for a known-valid session id (e.g. req.session
// compatibility in adaptExpress.js). Callers should already have validated
// the session via getSessionUser() — this trusts the sid it's given.
export async function getSessionData(sid) {
  if (!sid) return null;
  const row = await db.one('SELECT data FROM sessions WHERE sid = ?', [sid]);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

// Persists a mutated session data object (e.g. notificationsReadAt) back to
// its row. Used by adaptExpress.js so reused controllers that read/write
// req.session (like notificationController.markRead) keep working.
export async function saveSessionData(sessionId, data) {
  await db.query('UPDATE sessions SET data = ? WHERE sid = ?', [JSON.stringify(data), sessionId]);
}

export async function bumpSessionVersion(sessionId, newVersion) {
  const row = await db.one('SELECT data FROM sessions WHERE sid = ?', [sessionId]);
  if (!row) return;
  const data = JSON.parse(row.data);
  data.sessionVersion = newVersion;
  await db.query('UPDATE sessions SET data = ? WHERE sid = ?', [JSON.stringify(data), sessionId]);
}
