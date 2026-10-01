// One-time import: data/db.json (the original JSON-file receptionist portal)
// -> SQLite. Safe to re-run: skipped once the `meta` table records it as done.
//
// Patients did not exist as their own entity in the JSON store (only a name per
// appointment), so this synthesises a patient per distinct name with a stable,
// deterministic mobile number. Replace with real patient data once available.

const fs = require('fs');
const crypto = require('crypto');
const config = require('../config');
const { hashPassword } = require('../utils/password');
const db = require('./index');

function synthMobile(name) {
  const h = crypto.createHash('sha1').update(name).digest();
  let digits = '';
  for (let i = 0; i < h.length && digits.length < 9; i++) digits += String(h[i] % 10);
  return `9${digits.slice(0, 9)}`;
}

async function alreadyImported(conn) {
  const row = await conn.one("SELECT 1 FROM hospitals LIMIT 1");
  return !!row;
}

async function importLegacy() {
  if (!fs.existsSync(config.dataFile)) {
    console.log('No legacy data/db.json found; skipping import.');
    return;
  }
  const json = JSON.parse(fs.readFileSync(config.dataFile, 'utf8'));

  await db.tx(async (conn) => {
    if (await alreadyImported(conn)) {
      console.log('Hospitals already exist in the database; skipping legacy import.');
      return;
    }

    console.log(`Importing ${json.hospitals.length} hospital(s), ${json.doctors.length} doctor(s), ${json.appointments.length} appointment(s), ${(json.tokens || []).length} token(s)...`);

    // ---- hospitals -----------------------------------------------------
    for (const h of json.hospitals) {
      await conn.query(
        `INSERT INTO hospitals (id, name, address_line1, city, state, pincode, phone, email, status, kyc_status, onboarding_step, activated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 'VERIFIED', 6, ?, ?, ?)`,
        [h.id, h.name, h.address.line1, h.address.city, h.address.state, h.address.pincode, h.phone, h.email, db.toSql(h.createdAt), db.toSql(h.createdAt), db.toSql(h.updatedAt)]
      );
      // qrToken (legacy) becomes this hospital's original QR code key, unchanged
      // so already-printed posters keep working.
      await conn.query(
        `INSERT INTO qr_codes (id, qr_key, hospital_id, desk_label, status, created_at, updated_at)
         VALUES (?, ?, ?, 'Main Reception', 'ACTIVE', ?, ?)`,
        [`QR${h.id}`, h.qrToken, h.id, db.toSql(h.createdAt), db.toSql(h.updatedAt)]
      );
    }

    // ---- users (receptionists) -----------------------------------------
    for (const u of json.users) {
      await conn.query(
        `INSERT INTO users (id, role, hospital_id, name, username, email, phone, password_hash, status, approved_at, password_changed_at, created_at, updated_at)
         VALUES (?, 'RECEPTIONIST', ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
        [u.id, u.hospitalId, u.name, u.username, u.email, u.phone, u.passwordHash, db.toSql(u.createdAt), u.passwordChangedAt ? db.toSql(u.passwordChangedAt) : null, db.toSql(u.createdAt), db.toSql(u.updatedAt)]
      );
    }

    // ---- doctors ---------------------------------------------------------
    for (const d of json.doctors) {
      await conn.query(
        `INSERT INTO doctors (id, hospital_id, name, specialization, fee, availability, availability_updated_at, verification_status, verified_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?, ?, ?)`,
        [d.id, d.hospitalId, d.name, d.specialization, d.fee, d.availability, db.toSql(d.availabilityUpdatedAt), db.toSql(d.createdAt), db.toSql(d.createdAt), db.toSql(d.updatedAt)]
      );
    }

    // ---- patients (synthesised from appointment patient names) ----------
    const patientIdByName = new Map();
    let patientSeq = 1;
    const namesInOrder = [...new Set(json.appointments.map((a) => a.patientName))].sort();
    for (const name of namesInOrder) {
      const id = `PAT${String(1000 + patientSeq++).padStart(4, '0')}`;
      patientIdByName.set(name, id);
      await conn.query(
        `INSERT INTO patients (id, name, mobile, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, name, synthMobile(name)]
      );
    }
    for (const h of json.hospitals) {
      const linkedNames = new Set(json.appointments.filter((a) => a.hospitalId === h.id).map((a) => a.patientName));
      for (const name of linkedNames) {
        await conn.query(
          `INSERT OR IGNORE INTO patient_hospital_links (patient_id, hospital_id, qr_code_id, linked_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [patientIdByName.get(name), h.id, `QR${h.id}`]
        );
      }
    }

    // ---- appointments + payments ------------------------------------------
    let paymentSeq = 1;
    for (const a of json.appointments) {
      await conn.query(
        `INSERT INTO appointments (id, hospital_id, doctor_id, patient_id, appt_date, appt_time, fee, status, payment_status, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, a.hospitalId, a.doctorId, patientIdByName.get(a.patientName), a.date, a.time, a.fee, a.status, a.paymentStatus, a.source, db.toSql(a.createdAt), db.toSql(a.updatedAt)]
      );
      if (a.payment) {
        const payId = `PAY${String(20000 + paymentSeq++).padStart(5, '0')}`;
        await conn.query(
          `INSERT INTO payments (id, appointment_id, amount, method, gateway, transaction_id, status, paid_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'SIMULATED', ?, 'PAID', ?, ?, ?)`,
          [payId, a.id, a.fee, a.payment.method, a.payment.transactionId, db.toSql(a.payment.paidAt), db.toSql(a.payment.paidAt), db.toSql(a.payment.paidAt)]
        );
      }
    }

    // ---- tokens -----------------------------------------------------------
    for (const t of json.tokens || []) {
      await conn.query(
        `INSERT INTO tokens (id, hospital_id, appointment_id, doctor_id, token_date, number, code, status, called_at, completed_at, cancelled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.hospitalId, t.appointmentId, t.doctorId, t.date, t.number, t.code, t.status, db.toSql(t.calledAt), db.toSql(t.completedAt), t.cancelledAt ? db.toSql(t.cancelledAt) : null, db.toSql(t.createdAt), db.toSql(t.updatedAt)]
      );
    }

    console.log(`Imported ${namesInOrder.length} distinct patient(s).`);
  });
}

// Creates the first Super Admin account if none exists yet. Returns the
// generated credentials only when a new account was created (so the setup
// script can print them once).
async function ensureSuperAdmin() {
  const existing = await db.one("SELECT id FROM users WHERE role = 'SUPER_ADMIN' LIMIT 1");
  if (existing) return null;

  const email = 'admin@gmedic.app';
  const password = 'GmedicAdmin@123';
  const id = await db.nextId('users', 'USR', 900);
  await db.query(
    `INSERT INTO users (id, role, name, username, email, password_hash, status, approved_at, created_at, updated_at)
     VALUES (?, 'SUPER_ADMIN', 'Gmedic Admin', 'admin', ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, email, hashPassword(password)]
  );
  return { email, username: 'admin', password };
}

// Creates a demo DOCTOR-role account linked to an existing doctor row, so the
// login page's Doctor demo button has something real to sign into. Returns
// credentials only when newly created.
async function ensureDemoDoctor() {
  const existing = await db.one("SELECT id FROM users WHERE role = 'DOCTOR' LIMIT 1");
  if (existing) return null;

  const doctor = await db.one("SELECT * FROM doctors ORDER BY id LIMIT 1");
  if (!doctor) return null; // no doctors imported yet — nothing to link to

  const email = `${doctor.id.toLowerCase()}@sunrisegeneral.in`;
  const username = doctor.name.replace(/^Dr\.?\s*/i, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  const password = 'Gmedic@Doctor1';
  const id = await db.nextId('users', 'USR', 800);
  await db.query(
    `INSERT INTO users (id, role, hospital_id, doctor_id, name, username, email, password_hash, status, approved_at, created_at, updated_at)
     VALUES (?, 'DOCTOR', ?, ?, ?, ?, ?, ?, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [id, doctor.hospital_id, doctor.id, doctor.name, username, email, hashPassword(password)]
  );
  return { email, username, password, doctorName: doctor.name };
}

module.exports = { importLegacy, ensureSuperAdmin, ensureDemoDoctor, synthMobile };
