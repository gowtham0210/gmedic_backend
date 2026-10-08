const doctorModel = require('../../models/doctorModel');
const config = require('../../config');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');

exports.list = async (req, res) => {
  const { hospitalId, specialization, verificationStatus, q, page, pageSize } = req.query;
  const data = await doctorModel.adminList({ hospitalId, specialization, verificationStatus, q, page, pageSize });
  res.json({ ...data, specializations: config.specializations });
};

exports.get = async (req, res) => {
  const doctor = await doctorModel.adminFindById(req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  res.json({ doctor });
};

exports.update = async (req, res) => {
  const doctor = await doctorModel.adminFindById(req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  const { value, errors, ok } = validate(req.body, {
    specialization: { label: 'Specialist', type: 'enum', required: true, values: config.specializations },
    fee: { label: 'Appointment fee', type: 'number', required: true, integer: true, min: 50, max: 20000 },
    department: { label: 'Department', maxLength: 80 },
    qualifications: { label: 'Qualifications', maxLength: 160 },
    registrationNumber: { label: 'Registration number', maxLength: 40 },
  }, { partial: true });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const db = require('../../db');
  let departmentId = null;
  const departmentName = String(value.department || '').trim();
  if (departmentName) {
    await db.query('INSERT OR IGNORE INTO departments (name) VALUES (?)', [departmentName]);
    departmentId = (await db.one('SELECT id FROM departments WHERE name = ?', [departmentName])).id;
  }
  await db.query(
    'UPDATE doctors SET specialization = COALESCE(?,specialization), fee = COALESCE(?,fee), department_id = COALESCE(?,department_id), qualifications = COALESCE(?,qualifications), registration_number = COALESCE(?,registration_number) WHERE id = ?',
    [value.specialization ?? null, value.fee ?? null, departmentId, value.qualifications ?? null, value.registrationNumber ?? null, req.params.id]
  );
  let updated = await doctorModel.adminFindById(req.params.id);
  await auditLog.record({ req, action: 'DOCTOR_UPDATED', entityType: 'DOCTOR', entityId: req.params.id, summary: `Updated ${updated.name}`,
    previousValue: { registrationNumber: doctor.registrationNumber || null }, newValue: { registrationNumber: updated.registrationNumber || null } });

  // The registration number is a verified, compliance-sensitive credential:
  // changing it on a VERIFIED doctor sends them back to PENDING for re-verification
  // (never silently keeps the old approval on new details).
  const regBefore = String(doctor.registrationNumber || '').trim();
  const regAfter = String(updated.registrationNumber || '').trim();
  if (doctor.verificationStatus === 'VERIFIED' && regAfter !== regBefore) {
    const note = `Registration number changed from ${regBefore || '(none)'} to ${regAfter || '(none)'} — re-verification required.`;
    updated = await doctorModel.setVerification(req.params.id, 'PENDING', note, req.user.id);
    await auditLog.record({ req, action: 'DOCTOR_REVERIFICATION_REQUIRED', entityType: 'DOCTOR', entityId: req.params.id, summary: `${updated.name}: ${note}`,
      previousValue: { verificationStatus: 'VERIFIED', registrationNumber: regBefore || null }, newValue: { verificationStatus: 'PENDING', registrationNumber: regAfter || null } });
    return res.json({ ok: true, message: `${updated.name}'s details were saved. The registration number changed, so verification is back to Pending.`, doctor: updated, reverificationRequired: true });
  }
  res.json({ ok: true, message: `${updated.name}'s details were saved.`, doctor: updated });
};

exports.setVerification = async (req, res) => {
  const doctor = await doctorModel.adminFindById(req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  const { status, note } = req.body || {};
  if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(status)) throw badRequest('Choose a valid verification status.');
  if (status === 'REJECTED' && !String(note || '').trim()) throw badRequest('A reason is required to reject.', { note: 'Enter a reason.' });
  const updated = await doctorModel.setVerification(req.params.id, status, note, req.user.id);
  await auditLog.record({ req, action: `DOCTOR_${status}`, entityType: 'DOCTOR', entityId: req.params.id, summary: `${updated.name}: verification → ${status}${note ? ` (${note})` : ''}` });
  res.json({ ok: true, message: `${updated.name} marked as ${status.toLowerCase()}.`, doctor: updated });
};
