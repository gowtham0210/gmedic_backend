const db = require('../db');
const doctorModel = require('../models/doctorModel');
const { contains } = require('../utils/like');

// Header search: doctors and patients of this hospital. Patients are matched by name, patient ID
// or mobile number and kept apart by patient ID, so two people with the same name are two results.
exports.search = async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.json({ doctors: [], patients: [] });

  const doctorRows = await doctorModel.list(req.hospitalId, { q });
  const doctors = doctorRows.slice(0, 5)
    .map((d) => ({ id: d.id, name: d.name, specialization: d.specialization, availability: d.availability }));

  const digits = q.replace(/\D/g, '');
  const isNumber = digits.length >= 4 && digits.length === q.replace(/[\s+()-]/g, '').length;
  const rows = await db.query(
    `SELECT p.id, p.name, p.mobile, COUNT(*) AS visits, MAX(a.appt_date || ' ' || a.appt_time) AS last_at,
            (SELECT d.name FROM appointments a2 JOIN doctors d ON d.id = a2.doctor_id WHERE a2.patient_id = p.id AND a2.hospital_id = ?
              ORDER BY a2.appt_date DESC, a2.appt_time DESC LIMIT 1) AS doctor_name
       FROM appointments a JOIN patients p ON p.id = a.patient_id
      WHERE a.hospital_id = ? AND (p.name LIKE ? ESCAPE '\\' OR p.id = ?${isNumber ? ' OR p.mobile LIKE ?' : ''})
      GROUP BY p.id ORDER BY last_at DESC LIMIT 6`,
    [req.hospitalId, req.hospitalId, contains(q), q.toUpperCase(), ...(isNumber ? [`%${digits.slice(-10)}%`] : [])]
  );
  const patients = rows.map((r) => {
    const [lastDate, lastTime] = String(r.last_at || '').split(' ');
    return { id: r.id, name: r.name, mobile: r.mobile || null, visits: Number(r.visits), lastDate, lastTime, doctorName: r.doctor_name };
  });

  res.json({ doctors, patients });
};
