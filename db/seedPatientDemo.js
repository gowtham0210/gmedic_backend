// Fills in the catalogue details the patient app needs (hospital card, departments, doctor
// profiles and weekly schedules) for the demo data. It only fills values that are still empty,
// so it never overwrites anything an admin, receptionist or doctor has entered. Safe to re-run.

const db = require('./index');

const DEPARTMENTS = {
  Cardiologist: ['Cardiology', 'heart'],
  Dermatologist: ['Dermatology', 'skin'],
  Orthopedist: ['Orthopaedics', 'bone'],
  Gynecologist: ['Gynaecology', 'woman'],
  'General Physician': ['General Medicine', 'stethoscope'],
  Pediatrician: ['Paediatrics', 'child'],
  'ENT Specialist': ['ENT', 'ear'],
};
const QUALIFICATIONS = {
  Cardiologist: 'MBBS, MD (Cardiology)', Dermatologist: 'MBBS, MD (Dermatology)', Orthopedist: 'MBBS, MS (Orthopaedics)',
  Gynecologist: 'MBBS, MS (Obstetrics & Gynaecology)', 'General Physician': 'MBBS, MD (General Medicine)',
  Pediatrician: 'MBBS, MD (Paediatrics)', 'ENT Specialist': 'MBBS, MS (ENT)',
};
const FEMALE_FIRST_NAMES = new Set(['Priya', 'Anjali', 'Meera', 'Sneha', 'Lakshmi']);

async function seedPatientDemo() {
  // Hospital card details (Sunrise General is the demo hospital).
  await db.query(
    `UPDATE hospitals SET kind = COALESCE(kind, 'Multispecialty hospital'), area = COALESCE(area, city || ', ' || state),
       lat = COALESCE(lat, 12.9716), lng = COALESCE(lng, 77.5946), brand_color = COALESCE(brand_color, ${0xff0b8a7e}),
       initials = COALESCE(initials, UPPER(SUBSTR(name, 1, 1) || SUBSTR(name, INSTR(name, ' ') + 1, 1))),
       about = COALESCE(about, 'Round-the-clock care with specialists across departments. Book a visit in the Gmedic app and skip the queue.')`
  );
  // The patient app's rules: free cancellation up to 4 hours before, bookings up to 7 days ahead.
  await db.query('UPDATE hospital_policies SET cancellation_window_hours = 4, booking_window_days = 7 WHERE cancellation_window_hours = 24 AND booking_window_days = 30');

  // Departments per hospital, derived from the doctors' specializations.
  const pairs = await db.query('SELECT DISTINCT hospital_id, specialization FROM doctors');
  for (const { hospital_id: hospitalId, specialization } of pairs) {
    const [name, icon] = DEPARTMENTS[specialization] || [specialization, 'stethoscope'];
    await db.query('INSERT OR IGNORE INTO departments (hospital_id, name, icon) VALUES (?, ?, ?)', [hospitalId, name, icon]);
    await db.query('UPDATE departments SET icon = COALESCE(icon, ?) WHERE hospital_id = ? AND name = ?', [icon, hospitalId, name]);
    await db.query(
      'UPDATE doctors SET department_id = (SELECT id FROM departments WHERE hospital_id = ? AND name = ?) WHERE hospital_id = ? AND specialization = ? AND department_id IS NULL',
      [hospitalId, name, hospitalId, specialization]
    );
  }

  const doctors = await db.query('SELECT * FROM doctors ORDER BY id');
  for (const [i, d] of doctors.entries()) {
    const first = d.name.replace(/^Dr\.?\s*/i, '').split(' ')[0];
    await db.query('UPDATE doctors SET gender = COALESCE(gender, ?), qualifications = COALESCE(qualifications, ?), years_experience = COALESCE(years_experience, ?), bio = COALESCE(bio, ?) WHERE id = ?', [
      FEMALE_FIRST_NAMES.has(first) ? 'FEMALE' : 'MALE', QUALIFICATIONS[d.specialization] || 'MBBS', 6 + ((i * 3) % 17),
      `${d.specialization} at the hospital, seeing patients by appointment.`, d.id,
    ]);
    if (!(await db.one('SELECT 1 AS x FROM doctor_languages WHERE doctor_id = ?', [d.id]))) {
      for (const language of i % 3 === 0 ? ['English', 'Hindi', 'Kannada'] : i % 3 === 1 ? ['English', 'Hindi'] : ['English', 'Tamil']) {
        await db.query('INSERT OR IGNORE INTO doctor_languages (doctor_id, language) VALUES (?, ?)', [d.id, language]);
      }
    }
    // Weekly working hours for doctors that have none yet: Monday-Saturday mornings,
    // plus evenings for every other doctor. The general physician sees two patients per slot.
    if (!(await db.one('SELECT 1 AS x FROM doctor_schedules WHERE doctor_id = ?', [d.id]))) {
      const perSlot = d.specialization === 'General Physician' ? 2 : 1;
      for (let day = 1; day <= 6; day += 1) {
        await db.query('INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot) VALUES (?, ?, ?, ?, 15, ?)', [d.id, day, '09:00', '13:00', perSlot]);
        if (i % 2 === 0 && day <= 5) {
          await db.query('INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot) VALUES (?, ?, ?, ?, 15, ?)', [d.id, day, '16:00', '19:00', perSlot]);
        }
      }
    }
  }
}

module.exports = { seedPatientDemo };
