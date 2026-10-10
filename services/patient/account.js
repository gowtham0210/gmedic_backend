// The signed-in patient's profile and family members (dependents).

const db = require('../../db');
const { fail, notFound, RULES, isDate, GENDER_IN, RELATION_IN, patientJson, GENDER_OUT } = require('./common');

async function selfPatient(userId) {
  return db.one("SELECT * FROM patients WHERE account_user_id = ? AND relation = 'SELF'", [userId]);
}

async function userJson(user) {
  const self = await selfPatient(user.id);
  const name = self && self.name ? self.name : null;
  const dob = self ? self.date_of_birth : null;
  const gender = self && self.gender ? GENDER_OUT[self.gender] : null;
  return { id: user.id, phone: user.phone, name, dob, gender, profileComplete: !!(name && dob && gender) };
}

function readPerson(body, { partial = false } = {}) {
  const out = {};
  const errors = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (name.length < 2 || name.length > 60 || !/^[A-Za-z][A-Za-z .'-]*$/.test(name)) errors.name = 'Enter the full name using letters only.';
    else out.name = name;
  }
  if (!partial || body.dob !== undefined) {
    if (!isDate(body.dob) || String(body.dob) > new Date().toISOString().slice(0, 10) || String(body.dob) < '1900-01-01') errors.dob = 'Enter a valid date of birth (YYYY-MM-DD).';
    else out.dob = String(body.dob);
  }
  if (!partial || body.gender !== undefined) {
    if (!GENDER_IN[body.gender]) errors.gender = 'Choose male, female or other.';
    else out.gender = GENDER_IN[body.gender];
  }
  if (Object.keys(errors).length) {
    const err = fail(400, 'VALIDATION', Object.values(errors)[0]);
    err.details = errors;
    throw err;
  }
  return out;
}

async function updateProfile(user, body) {
  const v = readPerson(body);
  const self = await selfPatient(user.id);
  await db.tx(async (conn) => {
    await conn.query('UPDATE patients SET name = ?, date_of_birth = ?, gender = ? WHERE id = ?', [v.name, v.dob, v.gender, self.id]);
    await conn.query('UPDATE users SET name = ? WHERE id = ?', [v.name, user.id]);
  });
  return userJson(user);
}

async function dependents(user) {
  const rows = await db.query("SELECT * FROM patients WHERE account_user_id = ? AND relation <> 'SELF' ORDER BY id", [user.id]);
  return rows.map((r) => patientJson(r, user));
}

async function addDependent(user, body) {
  const v = readPerson(body);
  if (!RELATION_IN[body.relation]) throw fail(400, 'VALIDATION', 'Choose how this person is related to you.');
  const count = await db.one("SELECT COUNT(*) AS n FROM patients WHERE account_user_id = ? AND relation <> 'SELF'", [user.id]);
  if (Number(count.n) >= RULES.maxDependents) throw fail(409, 'LIMIT_REACHED', `You can add up to ${RULES.maxDependents} family members.`);
  const id = await db.nextId('patients', 'PAT', 1001);
  await db.query('INSERT INTO patients (id, name, account_user_id, relation, date_of_birth, gender) VALUES (?, ?, ?, ?, ?, ?)', [id, v.name, user.id, RELATION_IN[body.relation], v.dob, v.gender]);
  return patientJson(await db.one('SELECT * FROM patients WHERE id = ?', [id]), user);
}

async function ownDependent(user, id) {
  const row = await db.one("SELECT * FROM patients WHERE id = ? AND account_user_id = ? AND relation <> 'SELF'", [id, user.id]);
  if (!row) throw notFound();
  return row;
}

async function updateDependent(user, id, body) {
  const row = await ownDependent(user, id);
  const v = readPerson(body, { partial: true });
  if (body.relation !== undefined && !RELATION_IN[body.relation]) throw fail(400, 'VALIDATION', 'Choose how this person is related to you.');
  await db.query('UPDATE patients SET name = ?, date_of_birth = ?, gender = ?, relation = ? WHERE id = ?', [
    v.name ?? row.name, v.dob ?? row.date_of_birth, v.gender ?? row.gender, body.relation ? RELATION_IN[body.relation] : row.relation, row.id,
  ]);
  return patientJson(await db.one('SELECT * FROM patients WHERE id = ?', [row.id]), user);
}

// A family member with appointment history stays on record (the hospital needs it) but leaves the account.
async function removeDependent(user, id) {
  const row = await ownDependent(user, id);
  await db.query("UPDATE slot_holds SET status = 'RELEASED' WHERE patient_id = ? AND status = 'HELD'", [row.id]);
  const used = await db.one('SELECT 1 AS x FROM appointments WHERE patient_id = ? UNION SELECT 1 FROM slot_holds WHERE patient_id = ? LIMIT 1', [row.id, row.id]);
  if (used) await db.query('UPDATE patients SET account_user_id = NULL WHERE id = ?', [row.id]);
  else await db.query('DELETE FROM patients WHERE id = ?', [row.id]);
}

// Every patient the account can book for: the holder and the family.
async function bookablePatients(user) {
  return db.query('SELECT * FROM patients WHERE account_user_id = ?', [user.id]);
}

module.exports = { selfPatient, userJson, updateProfile, dependents, addDependent, updateDependent, removeDependent, bookablePatients };
