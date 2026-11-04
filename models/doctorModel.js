const db = require('../db');
const { contains } = require('../utils/like');
const bookingCore = require('../services/bookingCore');
const { dateInZone } = require('../utils/dates');

const AVAILABILITY = ['present', 'absent'];

// department and languages live in their own tables (departments, doctor_languages).
const DOCTOR_SELECT = `SELECT doctors.*, (SELECT name FROM departments WHERE id = doctors.department_id) AS department, (SELECT group_concat(language, ', ') FROM (SELECT language FROM doctor_languages WHERE doctor_id = doctors.id ORDER BY rowid)) AS languages FROM doctors`;


// `extra` (from decorate) says what is true today at the hospital: a leave, working hours, the local date.
// Without it (admin lists) availability is the stored value.
function fromRow(row, extra = {}) {
  const markedAbsent = extra.today ? bookingCore.absentOn(row, extra.today, extra.timezone) : row.availability === 'absent';
  const leave = extra.leave || null;
  return {
    id: row.id,
    hospitalId: row.hospital_id,
    branchId: row.branch_id,
    name: row.name,
    photoUrl: row.photo_url,
    department: row.department,
    specialization: row.specialization,
    registrationNumber: row.registration_number,
    qualifications: row.qualifications,
    fee: Number(row.fee),
    // Present or absent today: absent while on leave, or when marked absent today (the mark lapses by itself the next day).
    availability: leave || markedAbsent ? 'absent' : 'present',
    onLeave: !!leave,
    leaveNote: leave ? (leave.reason || 'On leave') : markedAbsent ? 'Marked absent today' : null,
    availabilityUpdatedAt: db.iso(row.availability_updated_at),
    workingBlocks: extra.workingBlocks == null ? null : extra.workingBlocks,
    scheduledToday: extra.scheduledToday == null ? null : extra.scheduledToday,
    verificationStatus: row.verification_status,
    status: row.status || 'ACTIVE',
    statusReason: row.status_reason || null,
    verificationNote: row.verification_note,
    bio: row.bio,
    yearsExperience: row.years_experience != null ? Number(row.years_experience) : null,
    languages: row.languages,
    createdAt: db.iso(row.created_at),
    updatedAt: db.iso(row.updated_at),
  };
}

// Adds what is true today at the hospital to each doctor row: leave, working-hour blocks, the local date.
// (Used by every list and lookup below, so screens agree on who is present today.)
async function decorate(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const zones = new Map((await db.query(`SELECT id, timezone FROM hospitals WHERE id IN (${[...new Set(rows.map((r) => r.hospital_id))].map(() => '?').join(',')})`, [...new Set(rows.map((r) => r.hospital_id))])).map((h) => [h.id, h.timezone]));
  const [leaves, blocks] = await Promise.all([
    db.query(`SELECT doctor_id, start_date, end_date, reason FROM doctor_leaves WHERE doctor_id IN (${marks}) AND cancelled_at IS NULL ORDER BY start_date`, ids),
    db.query(`SELECT doctor_id, day_of_week, effective_from, effective_to FROM doctor_schedules WHERE doctor_id IN (${marks})`, ids),
  ]);
  return rows.map((row) => {
    const timezone = zones.get(row.hospital_id);
    const today = dateInZone(undefined, timezone);
    const leave = leaves.find((l) => l.doctor_id === row.id && l.start_date <= today && l.end_date >= today);
    const workingBlocks = blocks.filter((b) => b.doctor_id === row.id && (!b.effective_to || b.effective_to >= today)).length;
    // Scheduled today: a block for today's weekday that is in force today (a block added for today counts at once, even before its start time).
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    const scheduledToday = blocks.some((b) => b.doctor_id === row.id && b.day_of_week === weekday && (!b.effective_from || b.effective_from <= today) && (!b.effective_to || b.effective_to >= today));
    return fromRow(row, { today, timezone, leave, workingBlocks, scheduledToday });
  });
}

async function all(hospitalId) {
  const rows = await db.query(`${DOCTOR_SELECT} WHERE hospital_id = ?`, [hospitalId]);
  return decorate(rows);
}

async function list(hospitalId, { q, specialization, availability } = {}) {
  const clauses = ['hospital_id = ?'];
  const params = [hospitalId];
  if (specialization) { clauses.push('specialization = ?'); params.push(specialization); }
  if (q) { const like = contains(q); clauses.push(`(name LIKE ? ESCAPE '\\' OR specialization LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\')`); params.push(like, like, like); }
  const rows = await db.query(`${DOCTOR_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY name`, params);
  const doctors = await decorate(rows);
  // The availability filter means "present / absent today", so it is applied to the effective value.
  return availability ? doctors.filter((d) => d.availability === availability) : doctors;
}

async function findById(hospitalId, id) {
  const row = await db.one(`${DOCTOR_SELECT} WHERE hospital_id = ? AND id = ?`, [hospitalId, id]);
  return row ? (await decorate([row]))[0] : null;
}

// Stored names always carry the "Dr." prefix exactly once.
function normaliseName(name) {
  return `Dr. ${String(name).replace(/^dr\.?\s*/i, '').trim()}`;
}

async function create(hospitalId, { name, specialization, fee, availability }) {
  const id = await db.nextId('doctors', 'DOC', 101);
  await db.query(
    `INSERT INTO doctors (id, hospital_id, name, specialization, fee, availability, availability_updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [id, hospitalId, normaliseName(name), specialization, fee, availability]
  );
  return findById(hospitalId, id);
}

async function update(hospitalId, id, patch) {
  const doctor = await findById(hospitalId, id);
  if (!doctor) return null;
  const name = patch.name !== undefined ? normaliseName(patch.name) : doctor.name;
  const specialization = patch.specialization !== undefined ? patch.specialization : doctor.specialization;
  const fee = patch.fee !== undefined ? patch.fee : doctor.fee;
  const availability = patch.availability !== undefined ? patch.availability : doctor.availability;
  const touchAvailability = patch.availability !== undefined && patch.availability !== doctor.availability;
  await db.query(
    `UPDATE doctors SET name = ?, specialization = ?, fee = ?, availability = ?${touchAvailability ? ', availability_updated_at = CURRENT_TIMESTAMP' : ''} WHERE id = ?`,
    [name, specialization, fee, availability, id]
  );
  return findById(hospitalId, id);
}

// Doctor self-service: only the fields a doctor is allowed to change
// themselves (not specialization, fee, registration number, qualifications —
// those stay receptionist/admin-managed).
async function updateProfile(hospitalId, id, { bio, yearsExperience, languages }) {
  const doctor = await findById(hospitalId, id);
  if (!doctor) return null;
  await db.tx(async (conn) => {
    await conn.query('UPDATE doctors SET bio = ?, years_experience = ? WHERE id = ?', [bio ?? null, yearsExperience ?? null, id]);
    await conn.query('DELETE FROM doctor_languages WHERE doctor_id = ?', [id]);
    const list = [...new Set(String(languages || '').split(',').map((l) => l.trim()).filter(Boolean))];
    for (const language of list) await conn.query('INSERT INTO doctor_languages (doctor_id, language) VALUES (?, ?)', [id, language]);
  });
  return findById(hospitalId, id);
}

async function setAvailabilityBulk(hospitalId, changes) {
  const updated = [];
  for (const { id, availability } of changes) {
    const doctor = await findById(hospitalId, id);
    if (!doctor || doctor.availability === availability) continue;
    await db.query('UPDATE doctors SET availability = ?, availability_updated_at = CURRENT_TIMESTAMP WHERE id = ?', [availability, id]);
    updated.push(await findById(hospitalId, id));
  }
  return updated;
}

// ---- Super Admin oversight (all hospitals) ---------------------------------

// The doctor's own sign-in to the doctor portal (null when they haven't been invited).
function portalLogin(r) {
  if (!r.login_id) return null;
  return { userId: r.login_id, status: r.login_status, email: r.login_email, lastLoginAt: db.iso(r.login_last_at), mustChangePassword: !!r.login_must_change };
}

async function adminList({ hospitalId, specialization, verificationStatus, q, page = 1, pageSize = 20 } = {}) {
  const clauses = ['1=1'];
  const params = [];
  if (hospitalId) { clauses.push('d.hospital_id = ?'); params.push(hospitalId); }
  if (specialization) { clauses.push('d.specialization = ?'); params.push(specialization); }
  if (verificationStatus) { clauses.push('d.verification_status = ?'); params.push(verificationStatus); }
  if (q) { const like = contains(q); clauses.push(`(d.name LIKE ? ESCAPE '\\' OR d.id LIKE ? ESCAPE '\\')`); params.push(like, like); }
  const where = clauses.join(' AND ');
  const total = (await db.one(`SELECT COUNT(*) AS n FROM doctors d WHERE ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
  const rows = await db.query(
    `SELECT d.*, (SELECT name FROM departments WHERE id = d.department_id) AS department, (SELECT group_concat(language, ', ') FROM (SELECT language FROM doctor_languages WHERE doctor_id = d.id ORDER BY rowid)) AS languages, h.name AS hospital_name, lu.id AS login_id, lu.status AS login_status, lu.email AS login_email, lu.last_login_at AS login_last_at, lu.must_change_password AS login_must_change FROM doctors d JOIN hospitals h ON h.id = d.hospital_id LEFT JOIN users lu ON lu.doctor_id = d.id AND lu.role = 'DOCTOR'
     WHERE ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  const decorated = await decorate(rows);
  return {
    items: rows.map((r, i) => ({ ...decorated[i], hospitalName: r.hospital_name, portalLogin: portalLogin(r) })),
    total: Number(total), page: Math.max(Number(page) || 1, 1), pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
  };
}

async function adminFindById(id) {
  const row = await db.one(
    `SELECT d.*, (SELECT name FROM departments WHERE id = d.department_id) AS department, (SELECT group_concat(language, ', ') FROM (SELECT language FROM doctor_languages WHERE doctor_id = d.id ORDER BY rowid)) AS languages, h.name AS hospital_name, lu.id AS login_id, lu.status AS login_status, lu.email AS login_email, lu.last_login_at AS login_last_at, lu.must_change_password AS login_must_change FROM doctors d JOIN hospitals h ON h.id = d.hospital_id LEFT JOIN users lu ON lu.doctor_id = d.id AND lu.role = 'DOCTOR' WHERE d.id = ?`,
    [id]
  );
  return row ? { ...(await decorate([row]))[0], hospitalName: row.hospital_name, portalLogin: portalLogin(row) } : null;
}

async function setVerification(id, status, note, verifiedBy) {
  await db.query(
    'UPDATE doctors SET verification_status = ?, verification_note = ?, verified_by = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, note || null, verifiedBy || null, id]
  );
  return adminFindById(id);
}

module.exports = {
  AVAILABILITY, all, list, findById, create, update, updateProfile, setAvailabilityBulk,
  adminList, adminFindById, setVerification, fromRow,
};
// (searches escape LIKE wildcards)
