const doctorModel = require('../../models/doctorModel');
const hospitalModel = require('../../models/hospitalModel');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');

exports.get = async (req, res) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.doctorId);
  if (!doctor) throw notFound('Doctor profile not found.');
  const hospital = await hospitalModel.toPublic(await hospitalModel.findById(req.hospitalId));
  res.json({ doctor, user: { name: req.user.name, email: req.user.email, phone: req.user.phone }, hospital });
};

exports.update = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    bio: { label: 'Bio', maxLength: 500 },
    languages: { label: 'Languages', maxLength: 120 },
  }, { partial: true });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  // An emptied field clears the value (null), never turns into 0.
  const rawYears = req.body.yearsExperience;
  const yearsExperience = rawYears === undefined ? undefined : rawYears === null || String(rawYears).trim() === '' ? null : Number(rawYears);
  if (yearsExperience != null && (!Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 70)) {
    throw badRequest('Please correct the highlighted fields.', { yearsExperience: 'Enter whole years between 0 and 70, or leave it empty.' });
  }
  const current = await doctorModel.findById(req.hospitalId, req.doctorId);
  const doctor = await doctorModel.updateProfile(req.hospitalId, req.doctorId, {
    bio: value.bio !== undefined ? value.bio : current.bio,
    languages: value.languages !== undefined ? value.languages : current.languages,
    yearsExperience: yearsExperience !== undefined ? yearsExperience : current.yearsExperience,
  });
  res.json({ ok: true, message: 'Profile updated.', doctor });
};

// POST /api/doctor/profile/photo (multipart `photo`, PNG/JPEG/WebP up to 3 MB) and DELETE to remove it.
// Shown to patients right away, like a photo set by Super Admin (services/doctorPhotos).
const doctorPhotos = require('../../services/doctorPhotos');

exports.uploadPhoto = async (req, res) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.doctorId);
  if (!doctor) throw notFound('Doctor profile not found.');
  await doctorPhotos.setPhoto(req, doctor);
  res.json({ ok: true, message: 'Photo updated.', doctor: await doctorModel.findById(req.hospitalId, req.doctorId) });
};

exports.removePhoto = async (req, res) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.doctorId);
  if (!doctor) throw notFound('Doctor profile not found.');
  if (!doctor.photoUrl) throw badRequest('You have no photo to remove.');
  await doctorPhotos.removePhoto(req, doctor);
  res.json({ ok: true, message: 'Photo removed.', doctor: await doctorModel.findById(req.hospitalId, req.doctorId) });
};
