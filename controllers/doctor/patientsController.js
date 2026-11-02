// A doctor's own patients, derived strictly from their own appointments —
// never the global patient database (Super Admin's /api/admin/patients).

const db = require('../../db');
const { notFound } = require('../../utils/http');
const { contains } = require('../../utils/like');
const { todayIn } = require('../../models/appointmentModel');

async function doctorToday(doctorId) {
  const h = await db.one('SELECT h.timezone FROM doctors d JOIN hospitals h ON h.id = d.hospital_id WHERE d.id = ?', [doctorId]);
  return todayIn(h && h.timezone);
}

// Whole years between a date of birth and today (null when unknown).
function ageOn(dob, today) {
  if (!dob) return null;
  const [y, m, d] = String(dob).slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

// GET /api/doctor/patients?q=&page=&pageSize=: paged; `summary` counts every matching patient, not one page.
exports.list = async (req, res) => {
  const { q } = req.query;
  const today = await doctorToday(req.doctorId);
  const clauses = ['a.doctor_id = ?'];
  const params = [req.doctorId];
  if (q) {
    const digits = String(q).replace(/\D/g, '');
    clauses.push(`(p.name LIKE ? ESCAPE '\\' OR a.id = ? OR p.id = ?${digits.length >= 4 ? ' OR p.mobile LIKE ?' : ''})`);
    params.push(contains(q), String(q).trim().toUpperCase(), String(q).trim().toUpperCase(), ...(digits.length >= 4 ? [`%${digits.slice(-10)}%`] : []));
  }
  const grouped = `SELECT p.id, p.name, p.mobile,
       COUNT(*) AS total_visits,
       MAX(CASE WHEN a.appt_date <= ? THEN a.appt_date || ' ' || a.appt_time END) AS last_appt,
       MIN(CASE WHEN a.appt_date >= ? AND a.status IN ('confirmed', 'pending') AND a.no_show = 0 THEN a.appt_date || ' ' || a.appt_time END) AS next_appt,
       SUM(a.status = 'completed') AS completed_visits, MAX(a.appt_date) AS latest
     FROM appointments a JOIN patients p ON p.id = a.patient_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY p.id`;
  const all = [today, today, ...params];
  const sums = await db.one(
    `SELECT COUNT(*) AS total, SUM(last_appt LIKE ? || '%') AS today, SUM(next_appt IS NOT NULL) AS upcoming, SUM(completed_visits > 0) AS completed FROM (${grouped})`,
    [today, ...all]
  );
  const total = Number(sums.total || 0);
  const size = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), pages);
  const rows = await db.query(`${grouped} ORDER BY latest DESC, p.id LIMIT ? OFFSET ?`, [...all, size, (page - 1) * size]);
  res.json({
    items: rows.map((r) => ({
      id: r.id, name: r.name, mobile: r.mobile, totalVisits: Number(r.total_visits), completedVisits: Number(r.completed_visits),
      lastAppointment: r.last_appt, nextAppointment: r.next_appt,
    })),
    total, page, pageSize: size, pages,
    summary: { total, today: Number(sums.today || 0), upcoming: Number(sums.upcoming || 0), completed: Number(sums.completed || 0) },
  });
};

exports.get = async (req, res) => {
  const patient = await db.one('SELECT * FROM patients WHERE id = ?', [req.params.id]);
  if (!patient) throw notFound('Patient not found.');
  const appointments = await db.query(
    `SELECT a.id, a.appt_date, a.appt_time, a.status, a.payment_status, a.fee
     FROM appointments a WHERE a.doctor_id = ? AND a.patient_id = ? ORDER BY a.appt_date DESC, a.appt_time DESC`,
    [req.doctorId, req.params.id]
  );
  if (!appointments.length) throw notFound('This patient has no appointments with you.');
  res.json({
    patient: { id: patient.id, name: patient.name, mobile: patient.mobile, email: patient.email, gender: patient.gender || null, dateOfBirth: patient.date_of_birth || null, age: ageOn(patient.date_of_birth, await doctorToday(req.doctorId)) },
    appointments: appointments.map((a) => ({ id: a.id, date: a.appt_date, time: a.appt_time, status: a.status, paymentStatus: a.payment_status, fee: Number(a.fee) })),
  });
};
