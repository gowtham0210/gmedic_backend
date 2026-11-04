// Hospital-level control of emergency walk-ins (Super Admin and Operations: hospitals.manage). Rules: services/emergencyWalkIn.js.
const emergency = require('../../services/emergencyWalkIn');

// GET /api/admin/hospitals/:id/emergency-intake
exports.get = async (req, res) => {
  res.json({ intake: await emergency.getIntake(req.params.id) });
};

// PUT /api/admin/hospitals/:id/emergency-intake { paused?, reason?, referralNote? }
exports.update = async (req, res) => {
  const intake = await emergency.updateIntake(req.params.id, req.body || {}, req.user);
  res.json({ ok: true, message: intake.status === 'PAUSED' ? 'Emergency walk-ins are paused.' : 'Emergency settings saved.', intake });
};
