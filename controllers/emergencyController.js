// Emergency walk-ins (receptionist API). The rules live in services/emergencyWalkIn.js.
const emergency = require('../services/emergencyWalkIn');

// GET /api/emergency/options
exports.options = async (req, res) => {
  res.json(await emergency.options(req.hospitalId, req.user));
};

// GET /api/emergency/summary: today's emergency walk-in counts and the active list, from the real appointments and tokens
exports.summary = async (req, res) => {
  res.json(await emergency.summary(req.hospitalId));
};

// POST /api/emergency/walk-ins { departmentId, doctorId, emergencyReason, patientId | patient: { name, mobile, ... } }
exports.register = async (req, res) => {
  const appointment = await emergency.register(req.hospitalId, req.body || {}, req.user);
  // The workload after this registration, so the desk sees the warning (and the escalation instructions) at once.
  const { activeTotal, threshold, warning, escalation } = await emergency.summary(req.hospitalId);
  res.status(201).json({
    ok: true,
    message: `Emergency walk-in registered: ${appointment.patientName} with ${appointment.doctorName}, token ${appointment.tokenCode}. Awaiting triage by the doctor.`,
    token: { code: appointment.tokenCode, status: 'waiting', triage: appointment.triage, awaitingTriage: !appointment.triage },
    appointment,
    workload: { activeTotal, threshold, warning, escalation },
  });
};
