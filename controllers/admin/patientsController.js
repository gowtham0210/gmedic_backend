const db = require('../../db');
const { notFound, badRequest } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const booking = require('../../services/patient/booking');
const { contains } = require('../../utils/like');

async function resolvePatientId({ mobile, patientId, appointmentId }) {
  if (patientId) return patientId;
  if (mobile) {
    const row = await db.one('SELECT id FROM patients WHERE mobile = ?', [mobile]);
    return row ? row.id : null;
  }
  if (appointmentId) {
    const row = await db.one('SELECT patient_id FROM appointments WHERE id = ?', [appointmentId]);
    return row ? row.patient_id : null;
  }
  return null;
}

exports.search = async (req, res) => {
  const { mobile, patientId, appointmentId, q } = req.query;
  if (mobile || patientId || appointmentId) {
    const id = await resolvePatientId({ mobile, patientId, appointmentId });
    // loadSummary returns null for an unknown patient id — never send [null].
    const summary = id ? await loadSummary(id) : null;
    return res.json({ items: summary ? [summary] : [] });
  }
  if (!q || q.length < 2) return res.json({ items: [], total: 0, page: 1, pages: 1 });
  const size = Math.min(Math.max(Number(req.query.pageSize) || 10, 1), 50);
  const cur = Math.max(Number(req.query.page) || 1, 1);
  const like = contains(q);
  const total = Number((await db.one("SELECT COUNT(*) AS n FROM patients WHERE name LIKE ? ESCAPE '\\' OR mobile LIKE ? ESCAPE '\\'", [like, like])).n);
  const rows = await db.query("SELECT id FROM patients WHERE name LIKE ? ESCAPE '\\' OR mobile LIKE ? ESCAPE '\\' ORDER BY name, id LIMIT ? OFFSET ?", [like, like, size, (cur - 1) * size]);
  res.json({ items: (await Promise.all(rows.map((r) => loadSummary(r.id)))).filter(Boolean), total, page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)) });
};

async function loadSummary(id) {
  const patient = await db.one('SELECT * FROM patients WHERE id = ?', [id]);
  if (!patient) return null;
  const apptCount = await db.one('SELECT COUNT(*) AS n FROM appointments WHERE patient_id = ?', [id]);
  return { id: patient.id, name: patient.name, mobile: patient.mobile, email: patient.email, appointmentCount: Number(apptCount.n) };
}

exports.get = async (req, res) => {
  const patient = await db.one('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!patient) throw notFound('Patient not found.');

  const [hospitals, appointments, payments, refunds] = await Promise.all([
    db.query(`SELECT h.id, h.name, l.linked_at FROM patient_hospital_links l JOIN hospitals h ON h.id = l.hospital_id WHERE l.patient_id = ? AND l.removed_at IS NULL ORDER BY l.linked_at DESC`, [patient.id]),
    db.query(`SELECT a.id, a.appt_date, a.appt_time, a.status, a.payment_status, a.fee, h.name AS hospital_name, d.name AS doctor_name
               FROM appointments a JOIN hospitals h ON h.id=a.hospital_id JOIN doctors d ON d.id=a.doctor_id
               WHERE a.patient_id = ? ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT 25`, [patient.id]),
    db.query(`SELECT pay.id, pay.amount, pay.status, pay.method, pay.transaction_id, pay.paid_at, pay.created_at, h.name AS hospital_name
               FROM payments pay JOIN appointments a ON a.id=pay.appointment_id JOIN hospitals h ON h.id=a.hospital_id WHERE a.patient_id = ? ORDER BY pay.created_at DESC LIMIT 25`, [patient.id]),
    db.query(`SELECT r.id, r.amount, r.status, r.reason, r.created_at, h.name AS hospital_name
               FROM refunds r JOIN appointments a ON a.id=r.appointment_id JOIN hospitals h ON h.id=a.hospital_id WHERE a.patient_id = ? ORDER BY r.created_at DESC LIMIT 25`, [patient.id]),
  ]);

  res.json({
    patient: { id: patient.id, name: patient.name, mobile: patient.mobile, email: patient.email, relation: patient.relation, createdAt: db.iso(patient.created_at), erased: patient.name === ERASED_NAME },
    account: await accountSummary(patient),
    family: await familyOf(patient),
    consents: await consentsOf(patient),
    hospitals: hospitals.map((h) => ({ id: h.id, name: h.name, linkedAt: db.iso(h.linked_at) })),
    appointments: appointments.map((a) => ({ id: a.id, date: a.appt_date, time: a.appt_time, status: a.status, paymentStatus: a.payment_status, fee: Number(a.fee), hospitalName: a.hospital_name, doctorName: a.doctor_name })),
    payments: payments.map((p) => ({ id: p.id, amount: Number(p.amount), status: p.status, method: p.method, transactionId: p.transaction_id, paidAt: db.iso(p.paid_at), createdAt: db.iso(p.created_at), hospitalName: p.hospital_name })),
    refunds: refunds.map((r) => ({ id: r.id, amount: Number(r.amount), status: r.status, reason: r.reason, createdAt: db.iso(r.created_at), hospitalName: r.hospital_name })),
  });
};

// ---------------------------------------------------------------- app account: block, unblock, erase
// A patient signs in to the Gmedic app with an account (users row, role PATIENT) that can hold several
// patient profiles: themselves and their family. Blocking acts on the account. The patient app already
// refuses sign-in for a non-active account and drops sessions whose version changed.
const ERASED_NAME = 'Deleted patient';

async function accountOf(patient) {
  if (!patient.account_user_id) return null;
  return db.one("SELECT * FROM users WHERE id = ? AND role = 'PATIENT'", [patient.account_user_id]);
}

async function accountSummary(patient) {
  const user = await accountOf(patient);
  if (!user) return null;
  const last = await db.one("SELECT action, summary, new_value, user_name, created_at FROM audit_logs WHERE entity_type = 'PATIENT_ACCOUNT' AND entity_id = ? AND action IN ('PATIENT_BLOCKED', 'PATIENT_UNBLOCKED') ORDER BY id DESC LIMIT 1", [user.id]);
  const blocked = user.status !== 'ACTIVE';
  let reason = null;
  if (blocked && last && last.action === 'PATIENT_BLOCKED') { try { reason = JSON.parse(last.new_value).reason; } catch { reason = null; } }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = Number((await db.one(
    "SELECT COUNT(*) AS n FROM appointments WHERE status = 'confirmed' AND appt_date >= ? AND (booked_by_user_id = ? OR patient_id IN (SELECT id FROM patients WHERE account_user_id = ?))",
    [today, user.id, user.id]
  )).n);
  return {
    id: user.id, status: user.status, blocked, lastLoginAt: db.iso(user.last_login_at), upcomingAppointments: upcoming,
    blockedReason: reason, blockedAt: blocked && last && last.action === 'PATIENT_BLOCKED' ? db.iso(last.created_at) : null, blockedBy: blocked && last && last.action === 'PATIENT_BLOCKED' ? last.user_name : null,
  };
}

// Everyone on the same account (the owner and their dependants), other than the patient being viewed.
async function familyOf(patient) {
  if (!patient.account_user_id) return [];
  const rows = await db.query('SELECT id, name, relation, date_of_birth FROM patients WHERE account_user_id = ? AND id <> ? ORDER BY relation = \'SELF\' DESC, name', [patient.account_user_id, patient.id]);
  return rows.map((r) => ({ id: r.id, name: r.name, relation: r.relation, dateOfBirth: r.date_of_birth }));
}

async function consentsOf(patient) {
  const rows = await db.query(
    `SELECT c.purpose, c.policy_version, c.granted_at, c.withdrawn_at, c.patient_id FROM consent_records c
     WHERE (c.user_id IS NOT NULL AND c.user_id = ?) OR c.patient_id IN (SELECT id FROM patients WHERE id = ? OR (account_user_id IS NOT NULL AND account_user_id = ?))
     ORDER BY c.granted_at DESC, c.id DESC`,
    [patient.account_user_id || '', patient.id, patient.account_user_id || '']
  );
  return rows.map((c) => ({ purpose: c.purpose, policyVersion: c.policy_version, grantedAt: db.iso(c.granted_at), withdrawnAt: db.iso(c.withdrawn_at), patientId: c.patient_id }));
}

async function loadAccountFor(req) {
  const patient = await db.one('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!patient) throw notFound('Patient not found.');
  if (patient.name === ERASED_NAME) throw badRequest('This patient\'s personal data has been erased.');
  const user = await accountOf(patient);
  if (!user) throw badRequest('This patient has no Gmedic app account (they were added at a hospital front desk), so there is nothing to block.');
  return { patient, user };
}

// POST /api/admin/patients/:id/block { reason }
exports.block = async (req, res) => {
  const { patient, user } = await loadAccountFor(req);
  if (user.status !== 'ACTIVE') throw badRequest('This account is already blocked.');
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
  if (!reason) throw badRequest('A reason is required.', { reason: 'Enter a reason.' });
  const done = await db.tx(async (conn) => {
    const r = await conn.query("UPDATE users SET status = 'INACTIVE', session_version = session_version + 1 WHERE id = ? AND status = 'ACTIVE'", [user.id]);
    if (!r.affectedRows) return false;
    await conn.query("UPDATE slot_holds SET status = 'RELEASED' WHERE status = 'HELD' AND patient_id IN (SELECT id FROM patients WHERE account_user_id = ?)", [user.id]);
    await conn.query('DELETE FROM sessions WHERE user_id = ?', [user.id]);
    return true;
  });
  if (!done) throw badRequest('This account is already blocked.');
  await auditLog.record({ req, action: 'PATIENT_BLOCKED', entityType: 'PATIENT_ACCOUNT', entityId: user.id, summary: `Blocked the app account of ${user.name || patient.name} (${patient.id}): ${reason}`, previousValue: { status: 'ACTIVE' }, newValue: { status: 'INACTIVE', reason, patientId: patient.id } });
  res.json({ ok: true, message: `${patient.name}'s app account is blocked. They are signed out and can't sign in again.`, account: await accountSummary(patient) });
};

// POST /api/admin/patients/:id/unblock
exports.unblock = async (req, res) => {
  const { patient, user } = await loadAccountFor(req);
  if (user.status === 'ACTIVE') throw badRequest('This account is not blocked.');
  await db.query("UPDATE users SET status = 'ACTIVE', session_version = session_version + 1 WHERE id = ? AND status <> 'ACTIVE'", [user.id]);
  await auditLog.record({ req, action: 'PATIENT_UNBLOCKED', entityType: 'PATIENT_ACCOUNT', entityId: user.id, summary: `Unblocked the app account of ${user.name || patient.name} (${patient.id})`, previousValue: { status: user.status }, newValue: { status: 'ACTIVE' } });
  res.json({ ok: true, message: `${patient.name} can sign in to the Gmedic app again.`, account: await accountSummary(patient) });
};

// POST /api/admin/patients/:id/erase { confirm: "<patient id>" }
// Erases a patient's personal data on request. Nothing is hard-deleted: the app's own "Delete my account"
// anonymisation runs (names, mobile, email and date of birth are removed from the account and every profile
// on it; sign-ins and push tokens end), while hospitals keep the visit and payment records they need.
// Upcoming appointments of every profile on the account are cancelled first and refunded by the usual rules,
// whoever booked them (the app, or a front desk). One that can't be cancelled (the visit is under way) stays.
exports.erase = async (req, res) => {
  const { patient, user } = await loadAccountFor(req);
  if (String((req.body && req.body.confirm) || '').trim().toUpperCase() !== patient.id) throw badRequest(`Type the patient ID (${patient.id}) to confirm.`, { confirm: `Type ${patient.id} to confirm.` });
  const profiles = await db.query('SELECT id, mobile FROM patients WHERE account_user_id = ?', [user.id]);
  const phoneKeys = [...new Set([user.phone, ...profiles.map((p) => p.mobile)].map((p) => String(p || '').replace(/\D/g, '').slice(-10)).filter(Boolean))];

  // Consents are withdrawn first: once the profiles are detached from the account they can't be found from it.
  await db.query("UPDATE consent_records SET withdrawn_at = COALESCE(withdrawn_at, datetime('now')) WHERE user_id = ? OR patient_id IN (SELECT id FROM patients WHERE account_user_id = ?)", [user.id, user.id]);

  const today = new Date().toISOString().slice(0, 10);
  const open = await db.query(
    "SELECT id FROM appointments WHERE status = 'confirmed' AND appt_date >= ? AND (booked_by_user_id = ? OR patient_id IN (SELECT id FROM patients WHERE account_user_id = ?))",
    [today, user.id, user.id]
  );
  let cancelled = 0;
  const stuck = [];
  for (const a of open) {
    try { if (await booking.adminCancel(a.id, 'Personal data erased at the patient\'s request', req.user.id)) cancelled += 1; } catch { stuck.push(a.id); }
  }

  await booking.deleteAccount({ user });
  // The mobile number also sits in one-time codes, and the account's devices in push tokens.
  if (phoneKeys.length) await db.query(`DELETE FROM otp_codes WHERE substr(phone, -10) IN (${phoneKeys.map(() => '?').join(',')})`, phoneKeys);
  await db.query('DELETE FROM device_tokens WHERE user_id = ?', [user.id]);

  const tail = stuck.length ? `; ${stuck.length} could not be cancelled and stay on record (${stuck.join(', ')})` : '';
  await auditLog.record({ req, action: 'PATIENT_ERASED', entityType: 'PATIENT_ACCOUNT', entityId: user.id, summary: `Erased the personal data of ${patient.id} (${profiles.length} profile${profiles.length === 1 ? '' : 's'}); ${cancelled} upcoming appointment(s) cancelled${tail}`, previousValue: { patientId: patient.id }, newValue: { erased: true, cancelled, notCancelled: stuck } });
  res.json({ ok: true, message: `Personal data erased.${cancelled ? ` ${cancelled} upcoming appointment${cancelled === 1 ? ' was' : 's were'} cancelled.` : ''}${stuck.length ? ` ${stuck.length} could not be cancelled (${stuck.join(', ')}) and stay on record.` : ''} Appointment and payment records are kept without the patient's details.`, cancelled, notCancelled: stuck });
};
