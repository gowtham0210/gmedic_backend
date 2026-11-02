const doctorModel = require('../../models/doctorModel');
const config = require('../../config');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const userModel = require('../../models/userModel');
const doctorLogin = require('../../services/doctorLogin');

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
    name: { label: 'Name', required: true, minLength: 3, maxLength: 80, pattern: /^(Dr\.?\s+)?[A-Za-z][A-Za-z .'-]*$/, message: 'Name can only contain letters, spaces, dots and hyphens.' },
    bio: { label: 'About', maxLength: 1000 },
  }, { partial: true });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const db = require('../../db');
  // The registration number is unique. SQLite lets any number of doctors have NULL but only one
  // have '', so a blank field is stored as NULL ("none") and, when sent, clears the number.
  const regSent = value.registrationNumber !== undefined;
  const reg = value.registrationNumber || null;
  if (reg) {
    const clash = await db.one('SELECT name FROM doctors WHERE registration_number = ? AND id <> ?', [reg, req.params.id]);
    if (clash) throw badRequest('Please correct the highlighted fields.', { registrationNumber: `${clash.name} already has this registration number.` });
  }
  const branchId = await require('../../services/branches').resolveBranch(doctor.hospitalId, req.body && req.body.branchId);
  let departmentId = null;
  const departmentName = String(value.department || '').trim();
  const clearDepartment = value.department === '';
  if (departmentName) {
    // Departments belong to the doctor's hospital (the patient app lists them per hospital).
    await db.query('INSERT OR IGNORE INTO departments (hospital_id, name) VALUES (?, ?)', [doctor.hospitalId, departmentName]);
    const dep = await db.one('SELECT id, archived_at FROM departments WHERE hospital_id = ? AND name = ?', [doctor.hospitalId, departmentName]);
    if (dep.archived_at) await db.query('UPDATE departments SET archived_at = NULL WHERE id = ?', [dep.id]);
    departmentId = dep.id;
  }
  await db.query(
    'UPDATE doctors SET specialization = COALESCE(?,specialization), fee = COALESCE(?,fee), department_id = CASE WHEN ? THEN NULL ELSE COALESCE(?,department_id) END, name = COALESCE(?, name), bio = CASE WHEN ? THEN ? ELSE bio END, qualifications = COALESCE(?,qualifications), registration_number = CASE WHEN ? THEN ? ELSE registration_number END, branch_id = CASE WHEN ? THEN ? ELSE branch_id END WHERE id = ?',
    [value.specialization ?? null, value.fee ?? null, clearDepartment ? 1 : 0, departmentId, value.name ? (/^Dr\.?\s/i.test(value.name) ? value.name : `Dr. ${value.name}`) : null, value.bio !== undefined ? 1 : 0, value.bio || null, value.qualifications ?? null, regSent ? 1 : 0, reg, branchId !== undefined ? 1 : 0, branchId || null, req.params.id]
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

// ---- Doctor portal login ------------------------------------------------------
// A doctor added by a hospital has no way to sign in until an admin invites them. One login per
// doctor (users.doctor_id is unique); it is deactivated, never deleted.

// POST /api/admin/doctors/:id/login { email, phone? }
exports.inviteLogin = async (req, res) => {
  const doctor = await doctorModel.adminFindById(req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  const credentials = await doctorLogin.invite(req, doctor, req.body);
  res.status(201).json({ ok: true, message: `${doctor.name} can now sign in to the doctor portal.`, doctor: await doctorModel.adminFindById(doctor.id), credentials });
};

async function loginOf(req) {
  const doctor = await doctorModel.adminFindById(req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  if (!doctor.portalLogin) throw badRequest(`${doctor.name} has no portal login yet. Invite them first.`);
  return doctor;
}

// PATCH /api/admin/doctors/:id/login/status { status }
exports.setLoginStatus = async (req, res) => {
  const doctor = await loginOf(req);
  const { status } = req.body || {};
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw badRequest('Choose Active or Inactive.');
  await userModel.setStatus(doctor.portalLogin.userId, status);
  await auditLog.record({ req, action: `DOCTOR_LOGIN_${status}`, entityType: 'USER', entityId: doctor.portalLogin.userId, summary: `${doctor.name}: portal login ${doctor.portalLogin.status} → ${status}` });
  res.json({ ok: true, message: status === 'ACTIVE' ? `${doctor.name} can sign in again.` : `${doctor.name}'s portal login is deactivated.`, doctor: await doctorModel.adminFindById(doctor.id) });
};

// POST /api/admin/doctors/:id/login/reset-password
exports.resetLoginPassword = async (req, res) => {
  const doctor = await loginOf(req);
  const credentials = await doctorLogin.resetPassword(req, doctor);
  res.json({ ok: true, message: `Temporary password issued for ${doctor.name}.`, credentials });
};

// ---- Deactivate / reactivate (shared with the front desk) -------------------------------------
const doctorStatus = require('../../services/doctorStatus');

// GET /api/admin/doctors/:id/status
exports.statusImpact = async (req, res) => {
  const doctor = await doctorModel.adminFindById(req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  res.json(await doctorStatus.impact(doctor.id));
};

// PATCH /api/admin/doctors/:id/status { status, reason }
exports.setStatus = async (req, res) => {
  const doctor = await doctorModel.adminFindById(req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  const { changed, impact } = await doctorStatus.setStatus(req, doctor, req.body && req.body.status, req.body && req.body.reason);
  const after = await doctorModel.adminFindById(doctor.id);
  const message = !changed ? 'No changes to save.' : after.status === 'INACTIVE'
    ? `${after.name} is deactivated and no longer bookable.${impact.upcomingAppointments ? ` ${impact.upcomingAppointments} upcoming appointment(s) at ${after.hospitalName} still need to be moved or cancelled.` : ''}`
    : `${after.name} is active again. Re-enable their portal login separately if needed.`;
  res.json({ ok: true, message, doctor: after });
};

// POST /api/admin/doctors/:id/photo (multipart "photo") and DELETE to remove it.
const doctorPhotos = require('../../services/doctorPhotos');
exports.uploadPhoto = async (req, res) => {
  const doctor = await doctorModel.adminFindById(req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  await doctorPhotos.setPhoto(req, doctor);
  res.json({ ok: true, message: 'Photo updated.', doctor: await doctorModel.adminFindById(doctor.id) });
};
exports.removePhoto = async (req, res) => {
  const doctor = await doctorModel.adminFindById(req.params.id);
  if (!doctor) throw notFound('Doctor not found.');
  await doctorPhotos.removePhoto(req, doctor);
  res.json({ ok: true, message: 'Photo removed.', doctor: await doctorModel.adminFindById(doctor.id) });
};
