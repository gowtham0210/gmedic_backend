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
  const yearsExperience = req.body.yearsExperience !== undefined ? Number(req.body.yearsExperience) : undefined;
  if (yearsExperience !== undefined && (!Number.isFinite(yearsExperience) || yearsExperience < 0 || yearsExperience > 70)) {
    throw badRequest('Years of experience must be a realistic number.', { yearsExperience: 'Enter a realistic number.' });
  }
  const current = await doctorModel.findById(req.hospitalId, req.doctorId);
  const doctor = await doctorModel.updateProfile(req.hospitalId, req.doctorId, {
    bio: value.bio !== undefined ? value.bio : current.bio,
    languages: value.languages !== undefined ? value.languages : current.languages,
    yearsExperience: yearsExperience !== undefined ? yearsExperience : current.yearsExperience,
  });
  res.json({ ok: true, message: 'Profile updated.', doctor });
};
