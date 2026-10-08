const db = require('../../db');
const { notFound } = require('../../utils/http');

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
  if (!q || q.length < 2) return res.json({ items: [] });
  const rows = await db.query('SELECT id FROM patients WHERE name LIKE ? OR mobile LIKE ? LIMIT 10', [`%${q}%`, `%${q}%`]);
  res.json({ items: (await Promise.all(rows.map((r) => loadSummary(r.id)))).filter(Boolean) });
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
    db.query(`SELECT h.id, h.name, l.linked_at FROM patient_hospital_links l JOIN hospitals h ON h.id = l.hospital_id WHERE l.patient_id = ? ORDER BY l.linked_at DESC`, [patient.id]),
    db.query(`SELECT a.id, a.appt_date, a.appt_time, a.status, a.payment_status, a.fee, h.name AS hospital_name, d.name AS doctor_name
               FROM appointments a JOIN hospitals h ON h.id=a.hospital_id JOIN doctors d ON d.id=a.doctor_id
               WHERE a.patient_id = ? ORDER BY a.appt_date DESC, a.appt_time DESC LIMIT 25`, [patient.id]),
    db.query(`SELECT pay.id, pay.amount, pay.status, pay.method, pay.transaction_id, pay.paid_at, pay.created_at, h.name AS hospital_name
               FROM payments pay JOIN appointments a ON a.id=pay.appointment_id JOIN hospitals h ON h.id=a.hospital_id WHERE a.patient_id = ? ORDER BY pay.created_at DESC LIMIT 25`, [patient.id]),
    db.query(`SELECT r.id, r.amount, r.status, r.reason, r.created_at, h.name AS hospital_name
               FROM refunds r JOIN appointments a ON a.id=r.appointment_id JOIN hospitals h ON h.id=a.hospital_id WHERE a.patient_id = ? ORDER BY r.created_at DESC LIMIT 25`, [patient.id]),
  ]);

  res.json({
    patient: { id: patient.id, name: patient.name, mobile: patient.mobile, email: patient.email, createdAt: db.iso(patient.created_at) },
    hospitals: hospitals.map((h) => ({ id: h.id, name: h.name, linkedAt: db.iso(h.linked_at) })),
    appointments: appointments.map((a) => ({ id: a.id, date: a.appt_date, time: a.appt_time, status: a.status, paymentStatus: a.payment_status, fee: Number(a.fee), hospitalName: a.hospital_name, doctorName: a.doctor_name })),
    payments: payments.map((p) => ({ id: p.id, amount: Number(p.amount), status: p.status, method: p.method, transactionId: p.transaction_id, paidAt: db.iso(p.paid_at), createdAt: db.iso(p.created_at), hospitalName: p.hospital_name })),
    refunds: refunds.map((r) => ({ id: r.id, amount: Number(r.amount), status: r.status, reason: r.reason, createdAt: db.iso(r.created_at), hospitalName: r.hospital_name })),
  });
};
