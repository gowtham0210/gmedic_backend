// A doctor's own patients, derived strictly from their own appointments —
// never the global patient database (Super Admin's /api/admin/patients).

const db = require('../../db');
const { notFound } = require('../../utils/http');
const { todayISO } = require('../../utils/dates');

exports.list = async (req, res) => {
  const { q } = req.query;
  const clauses = ['a.doctor_id = ?'];
  const params = [req.doctorId];
  if (q) { clauses.push('(p.name LIKE ? OR a.id LIKE ? OR p.id LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const rows = await db.query(
    `SELECT p.id, p.name, p.mobile,
       COUNT(*) AS total_visits,
       MAX(CASE WHEN a.appt_date <= date('now') THEN a.appt_date || ' ' || a.appt_time END) AS last_appt,
       MIN(CASE WHEN a.appt_date >= date('now') AND a.status <> 'cancelled' THEN a.appt_date || ' ' || a.appt_time END) AS next_appt,
       SUM(a.status = 'completed') AS completed_visits
     FROM appointments a JOIN patients p ON p.id = a.patient_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY p.id ORDER BY MAX(a.appt_date) DESC`,
    params
  );
  const today = todayISO();
  res.json({
    items: rows.map((r) => ({
      id: r.id, name: r.name, mobile: r.mobile, totalVisits: Number(r.total_visits), completedVisits: Number(r.completed_visits),
      lastAppointment: r.last_appt, nextAppointment: r.next_appt,
    })),
    summary: {
      total: rows.length,
      today: rows.filter((r) => r.last_appt && r.last_appt.startsWith(today)).length,
      upcoming: rows.filter((r) => r.next_appt).length,
      completed: rows.reduce((n, r) => n + (Number(r.completed_visits) > 0 ? 1 : 0), 0),
    },
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
    patient: { id: patient.id, name: patient.name, mobile: patient.mobile, email: patient.email },
    appointments: appointments.map((a) => ({ id: a.id, date: a.appt_date, time: a.appt_time, status: a.status, paymentStatus: a.payment_status, fee: Number(a.fee) })),
  });
};
