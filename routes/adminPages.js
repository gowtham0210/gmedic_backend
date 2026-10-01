const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const pages = require('../controllers/admin/pageController');

const router = express.Router();

router.use(requireAdmin());

router.get('/', (req, res) => res.redirect('/admin/dashboard'));
router.get('/dashboard', requireAdmin('dashboard.view'), pages.dashboard);

router.get('/hospitals', requireAdmin('hospitals.view'), pages.hospitals);
router.get('/hospitals/:id', requireAdmin('hospitals.view'), pages.hospitalDetail);

router.get('/doctors', requireAdmin('doctors.view'), pages.doctors);
router.get('/receptionists', requireAdmin('receptionists.view'), pages.receptionists);
router.get('/qr', requireAdmin('qr.view'), pages.qr);
router.get('/appointments', requireAdmin('appointments.view'), pages.appointments);
router.get('/patients', requireAdmin('patients.view'), pages.patients);
router.get('/payments', requireAdmin('payments.view'), pages.payments);
router.get('/refunds', requireAdmin('refunds.view'), pages.refunds);
router.get('/settlements', requireAdmin('settlements.view'), pages.settlements);
router.get('/support', requireAdmin('support.view'), pages.support);
router.get('/disputes', requireAdmin('disputes.view'), pages.disputes);
router.get('/communications', requireAdmin('communications.view'), pages.communications);
router.get('/analytics', requireAdmin('analytics.view'), pages.analytics);
router.get('/settings', requireAdmin('settings.view'), pages.settings);
router.get('/audit-logs', requireAdmin('audit_logs.view'), pages.auditLogs);

module.exports = router;
