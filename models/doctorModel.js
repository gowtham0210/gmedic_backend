const db = require('../db');

const AVAILABILITY = ['present', 'absent'];

// department and languages live in their own tables (departments, doctor_languages).
const DOCTOR_SELECT = `SELECT doctors.*, (SELECT name FROM departments WHERE id = doctors.department_id) AS department, (SELECT group_concat(language, ', ') FROM (SELECT language FROM doctor_languages WHERE doctor_id = doctors.id ORDER BY rowid)) AS languages FROM doctors`;


function fromRow(row) {
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
    availability: row.availability,
    availabilityUpdatedAt: db.iso(row.availability_updated_at),
    verificationStatus: row.verification_status,
    verificationNote: row.verification_note,
    bio: row.bio,
    yearsExperience: row.years_experience != null ? Number(row.years_experience) : null,
    languages: row.languages,
    createdAt: db.iso(row.created_at),
    updatedAt: db.iso(row.updated_at),
  };
}

async function all(hospitalId) {
  const rows = await db.query(`${DOCTOR_SELECT} WHERE hospital_id = ?`, [hospitalId]);
  return rows.map(fromRow);
}

async function list(hospitalId, { q, specialization, availability } = {}) {
  const clauses = ['hospital_id = ?'];
  const params = [hospitalId];
  if (specialization) { clauses.push('specialization = ?'); params.push(specialization); }
  if (availability) { clauses.push('availability = ?'); params.push(availability); }
  if (q) { clauses.push('(name LIKE ? OR specialization LIKE ? OR id LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await db.query(`${DOCTOR_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY name`, params);
  return rows.map(fromRow);
}

async function findById(hospitalId, id) {
  const row = await db.one(`${DOCTOR_SELECT} WHERE hospital_id = ? AND id = ?`, [hospitalId, id]);
  return row ? fromRow(row) : null;
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

async function adminList({ hospitalId, specialization, verificationStatus, q, page = 1, pageSize = 20 } = {}) {
  const clauses = ['1=1'];
  const params = [];
  if (hospitalId) { clauses.push('d.hospital_id = ?'); params.push(hospitalId); }
  if (specialization) { clauses.push('d.specialization = ?'); params.push(specialization); }
  if (verificationStatus) { clauses.push('d.verification_status = ?'); params.push(verificationStatus); }
  if (q) { clauses.push('(d.name LIKE ? OR d.id LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const where = clauses.join(' AND ');
  const total = (await db.one(`SELECT COUNT(*) AS n FROM doctors d WHERE ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
  const rows = await db.query(
    `SELECT d.*, (SELECT name FROM departments WHERE id = d.department_id) AS department, (SELECT group_concat(language, ', ') FROM (SELECT language FROM doctor_languages WHERE doctor_id = d.id ORDER BY rowid)) AS languages, h.name AS hospital_name FROM doctors d JOIN hospitals h ON h.id = d.hospital_id
     WHERE ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  return {
    items: rows.map((r) => ({ ...fromRow(r), hospitalName: r.hospital_name })),
    total: Number(total), page: Math.max(Number(page) || 1, 1), pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
  };
}

async function adminFindById(id) {
  const row = await db.one(
    `SELECT d.*, (SELECT name FROM departments WHERE id = d.department_id) AS department, (SELECT group_concat(language, ', ') FROM (SELECT language FROM doctor_languages WHERE doctor_id = d.id ORDER BY rowid)) AS languages, h.name AS hospital_name FROM doctors d JOIN hospitals h ON h.id = d.hospital_id WHERE d.id = ?`,
    [id]
  );
  return row ? { ...fromRow(row), hospitalName: row.hospital_name } : null;
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
