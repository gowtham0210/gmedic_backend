const config = require('../config');
const doctorModel = require('../models/doctorModel');
const { notFound } = require('../utils/http');

const render = (view, title, active, scripts = []) => (req, res) => {
  res.render(view, { title, active, scripts, specializations: config.specializations });
};

exports.dashboard = render('dashboard', 'Dashboard', 'dashboard', ['doctor-modals', 'qr-modal', 'pages/dashboard']);
exports.hospital = render('hospital', 'Hospital Information', 'hospital', ['qr-modal', 'pages/hospital']);
exports.doctors = render('doctors', 'Doctors', 'doctors', ['doctor-modals', 'pages/doctors']);
exports.appointments = render('appointments', 'Appointments', 'appointments', ['appointment-modal', 'pages/appointments']);
exports.tokens = render('tokens', 'Token Management', 'tokens', ['pages/tokens']);
exports.payments = render('payments', 'Payments', 'payments', ['pages/payments']);
exports.settings = render('settings', 'Settings', 'settings', ['pages/settings']);

exports.doctorDetail = async (req, res, next) => {
  const doctor = await doctorModel.findById(req.hospitalId, req.params.id);
  if (!doctor) return next(notFound('This doctor could not be found.'));
  res.render('doctor-detail', {
    title: doctor.name,
    active: 'doctors',
    scripts: ['appointment-modal', 'pages/doctor-detail'],
    specializations: config.specializations,
    doctorId: doctor.id,
  });
};
