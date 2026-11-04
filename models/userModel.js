const db = require('../db');
const { ADMIN_ROLES } = require('../config/permissions');
const { hashPassword } = require('../utils/password');

function initials(name) {
  return String(name || '')
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    hospitalId: row.hospital_id,
    doctorId: row.doctor_id,
    name: row.name,
    username: row.username,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    status: row.status,
    mustChangePassword: !!row.must_change_password,
    // May book an emergency walk-in over a full slot (granted by an admin; migration 033).
    canBookEmergency: !!row.can_book_emergency,
    sessionVersion: row.session_version,
    passwordChangedAt: db.iso(row.password_changed_at),
    createdAt: db.iso(row.created_at),
    updatedAt: db.iso(row.updated_at),
  };
}

async function findById(id) {
  return fromRow(await db.one('SELECT * FROM users WHERE id = ?', [id]));
}

// Login accepts either the email address or the username.
async function findByLogin(identifier, role) {
  const key = String(identifier || '').trim().toLowerCase();
  if (!key) return null;
  // The "Super Admin" tab is the admin-console login, so it also accepts the
  // other console roles (Finance, Support, Operations); what each may do is
  // decided by config/permissions.js, not by which tab they signed in with.
  const roles = role === 'SUPER_ADMIN' ? ADMIN_ROLES : [role];
  const row = await db.one(
    `SELECT * FROM users WHERE (LOWER(email) = ? OR LOWER(username) = ?) AND role IN (${roles.map(() => '?').join(',')})`,
    [key, key, ...roles]
  );
  return fromRow(row);
}

async function listByRole(role, { hospitalId } = {}) {
  const params = [role];
  let sql = 'SELECT * FROM users WHERE role = ?';
  if (hospitalId) { sql += ' AND hospital_id = ?'; params.push(hospitalId); }
  sql += ' ORDER BY created_at DESC';
  const rows = await db.query(sql, params);
  return rows.map(fromRow);
}

async function updateProfile(id, patch) {
  await db.query('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?', [patch.name ?? null, patch.phone ?? null, id]);
  return findById(id);
}

async function setPassword(id, password, { mustChange = false } = {}) {
  await db.query(
    'UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP, must_change_password = ?, session_version = session_version + 1 WHERE id = ?',
    [hashPassword(password), mustChange ? 1 : 0, id]
  );
  return findById(id);
}

async function setStatus(id, status) {
  await db.query('UPDATE users SET status = ?, session_version = session_version + 1 WHERE id = ?', [status, id]);
  return findById(id);
}

async function create(fields) {
  const id = await db.nextId('users', 'USR', 1);
  await db.query(
    `INSERT INTO users (id, role, hospital_id, doctor_id, name, username, email, phone, password_hash, status, approved_by, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, fields.role, fields.hospitalId || null, fields.doctorId || null, fields.name, fields.username, fields.email, fields.phone || null, hashPassword(fields.password), fields.status || 'ACTIVE', fields.approvedBy || null, fields.approvedBy ? db.toSql(new Date()) : null]
  );
  return findById(id);
}

function toPublic(user) {
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    firstName: user.name.split(' ')[0],
    initials: initials(user.name),
    username: user.username,
    email: user.email,
    phone: user.phone,
    hospitalId: user.hospitalId,
    status: user.status,
    canBookEmergency: !!user.canBookEmergency,
    passwordChangedAt: user.passwordChangedAt || null,
    createdAt: user.createdAt,
  };
}

module.exports = { findById, findByLogin, listByRole, updateProfile, setPassword, setStatus, create, toPublic, initials, fromRow };
