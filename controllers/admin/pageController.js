const db = require('../../db');
const { notFound } = require('../../utils/http');
const { permissionsFor } = require('../../config/permissions');

const render = (view, title, active, scripts = []) => (req, res) => {
  res.render(`admin/${view}`, { title, active, scripts });
};

exports.dashboard = render('dashboard', 'Super Admin Dashboard', 'dashboard', ['admin/dashboard']);
exports.hospitals = render('hospitals', 'Hospitals', 'hospitals', ['admin/hospitals']);
exports.doctors = render('doctors', 'Doctors', 'doctors', ['admin/doctors']);
exports.receptionists = render('receptionists', 'Receptionists', 'receptionists', ['admin/receptionists']);
exports.qr = render('qr', 'QR Management', 'qr', ['admin/qr']);
exports.appointments = render('appointments', 'Appointments', 'appointments', ['admin/appointments']);
exports.patients = render('patients', 'Patient Lookup', 'patients', ['admin/patients']);
exports.payments = render('payments', 'Payments', 'payments', ['admin/payments']);
exports.refunds = render('refunds', 'Refunds', 'refunds', ['admin/refunds']);
exports.settlements = render('settlements', 'Settlements', 'settlements', ['admin/settlements']);
exports.support = render('support', 'Support', 'support', ['admin/support']);
exports.disputes = render('disputes', 'Disputes', 'disputes', ['admin/disputes']);
exports.communications = render('communications', 'Communications', 'communications', ['admin/communications']);
exports.analytics = render('analytics', 'Analytics', 'analytics', ['admin/analytics']);
exports.settings = render('settings', 'Platform Settings', 'settings', ['admin/settings']);
exports.auditLogs = render('audit-logs', 'Audit Logs', 'audit-logs', ['admin/audit-logs']);

exports.hospitalDetail = async (req, res, next) => {
  const hospital = await db.one('SELECT id, name FROM hospitals WHERE id = ?', [req.params.id]);
  if (!hospital) return next(notFound('This hospital could not be found.'));
  res.render('admin/hospital-detail', {
    title: hospital.name,
    active: 'hospitals',
    scripts: ['admin/hospital-detail'],
    hospitalId: hospital.id,
    permissions: [...permissionsFor(req.user.role)],
  });
};
