const doctorModel = require('../models/doctorModel');
const appointmentModel = require('../models/appointmentModel');

// Header search: doctors and patients (from appointments) of this hospital.
exports.search = async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (q.length < 2) return res.json({ doctors: [], patients: [] });

  const doctorRows = await doctorModel.list(req.hospitalId, { q });
  const doctors = doctorRows.slice(0, 5)
    .map((d) => ({ id: d.id, name: d.name, specialization: d.specialization, availability: d.availability }));

  const needle = q.toLowerCase();
  const seen = new Map();
  const all = await appointmentModel.query(req.hospitalId, {});
  const matches = all
    .filter((a) => a.patientName.toLowerCase().includes(needle))
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  for (const a of matches) {
    const entry = seen.get(a.patientName);
    if (entry) { entry.visits += 1; continue; }
    seen.set(a.patientName, { name: a.patientName, visits: 1, lastDate: a.date, lastTime: a.time, doctorName: a.doctorName });
  }

  res.json({ doctors, patients: [...seen.values()].slice(0, 5) });
};
