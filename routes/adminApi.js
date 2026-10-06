const express = require('express');
const { requireAdminApi } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const dashboard = require('../controllers/admin/dashboardController');
const hospitals = require('../controllers/admin/hospitalsController');
const doctors = require('../controllers/admin/doctorsController');
const receptionists = require('../controllers/admin/receptionistsController');
const qr = require('../controllers/admin/qrController');
const appointments = require('../controllers/admin/appointmentsController');
const patients = require('../controllers/admin/patientsController');
const payments = require('../controllers/admin/paymentsController');
const refunds = require('../controllers/admin/refundsController');
const settlements = require('../controllers/admin/settlementsController');
const support = require('../controllers/admin/supportController');
const disputes = require('../controllers/admin/disputesController');
const communications = require('../controllers/admin/communicationsController');
const analytics = require('../controllers/admin/analyticsController');
const settings = require('../controllers/admin/settingsController');
const auditLogs = require('../controllers/admin/auditLogsController');
const profile = require('../controllers/admin/profileController');

const router = express.Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/dashboard', requireAdminApi('dashboard.view'), dashboard.summary);

router.get('/hospitals', requireAdminApi('hospitals.view'), hospitals.list);
router.post('/hospitals', requireAdminApi('hospitals.manage'), hospitals.create);
router.get('/hospitals/:id', requireAdminApi('hospitals.view'), hospitals.get);
router.put('/hospitals/:id', requireAdminApi('hospitals.manage'), hospitals.update);
router.patch('/hospitals/:id/status', requireAdminApi('hospitals.manage'), hospitals.setStatus);
router.put('/hospitals/:id/fees', requireAdminApi('hospitals.manage'), hospitals.setFees);
router.get('/hospitals/:id/documents', requireAdminApi('kyc.view'), hospitals.listDocuments);
router.post('/hospitals/:id/documents', requireAdminApi('kyc.manage'), upload.single('document'), hospitals.uploadDocument);
router.patch('/hospitals/:id/documents/:docId', requireAdminApi('kyc.manage'), hospitals.reviewDocument);
router.patch('/hospitals/:id/kyc', requireAdminApi('kyc.manage'), hospitals.setKycStatus);
router.get('/hospitals/:id/branches', requireAdminApi('branches.view'), hospitals.listBranches);
router.post('/hospitals/:id/branches', requireAdminApi('branches.manage'), hospitals.createBranch);
router.patch('/branches/:id', requireAdminApi('branches.manage'), hospitals.updateBranch);

router.get('/doctors', requireAdminApi('doctors.view'), doctors.list);
router.get('/doctors/:id', requireAdminApi('doctors.view'), doctors.get);
router.put('/doctors/:id', requireAdminApi('doctors.manage'), doctors.update);
router.patch('/doctors/:id/verification', requireAdminApi('doctors.verify'), doctors.setVerification);

router.get('/receptionists', requireAdminApi('receptionists.view'), receptionists.list);
router.post('/receptionists', requireAdminApi('receptionists.manage'), receptionists.create);
router.patch('/receptionists/:id/status', requireAdminApi('receptionists.manage'), receptionists.setStatus);
router.post('/receptionists/:id/reset-password', requireAdminApi('receptionists.manage'), receptionists.resetPassword);

router.get('/qr', requireAdminApi('qr.view'), qr.list);
router.post('/qr', requireAdminApi('qr.manage'), qr.create);
router.post('/qr/:id/revoke', requireAdminApi('qr.manage'), qr.revoke);
router.post('/qr/:id/reissue', requireAdminApi('qr.manage'), qr.reissue);
router.get('/qr/analytics', requireAdminApi('qr.view'), qr.analytics);

router.get('/appointments', requireAdminApi('appointments.view'), appointments.list);
router.get('/appointments/:id', requireAdminApi('appointments.view'), appointments.get);

router.get('/patients/search', requireAdminApi('patients.view'), patients.search);
router.get('/patients/:id', requireAdminApi('patients.view'), patients.get);

router.get('/payments', requireAdminApi('payments.view'), payments.list);
router.get('/webhooks', requireAdminApi('webhooks.view'), payments.webhooks);
router.post('/webhooks/:id/resync', requireAdminApi('webhooks.manage'), payments.resyncWebhook);

router.get('/refunds', requireAdminApi('refunds.view'), refunds.list);
router.post('/refunds', requireAdminApi('refunds.manage'), refunds.create);
router.post('/refunds/:id/decision', requireAdminApi('refunds.approve'), refunds.decide);

router.get('/settlements', requireAdminApi('settlements.view'), settlements.list);
router.post('/settlements/generate', requireAdminApi('settlements.manage'), settlements.generate);
router.patch('/settlements/:id', requireAdminApi('settlements.manage'), settlements.update);

router.get('/support', requireAdminApi('support.view'), support.list);
router.post('/support', requireAdminApi('support.manage'), support.create);
router.get('/support/:id', requireAdminApi('support.view'), support.get);
router.patch('/support/:id', requireAdminApi('support.manage'), support.update);
router.post('/support/:id/notes', requireAdminApi('support.manage'), support.addNote);

router.get('/disputes', requireAdminApi('disputes.view'), disputes.list);
router.get('/disputes/:id', requireAdminApi('disputes.view'), disputes.get);
router.patch('/disputes/:id', requireAdminApi('disputes.manage'), disputes.update);
router.post('/disputes/:id/notes', requireAdminApi('disputes.manage'), disputes.addNote);

router.get('/communications/templates', requireAdminApi('communications.view'), communications.listTemplates);
router.put('/communications/templates/:id', requireAdminApi('communications.manage'), communications.updateTemplate);
router.get('/communications/announcements', requireAdminApi('communications.view'), communications.listAnnouncements);
router.post('/communications/announcements', requireAdminApi('communications.manage'), communications.createAnnouncement);
router.post('/communications/announcements/:id/publish', requireAdminApi('communications.manage'), communications.publishAnnouncement);
router.get('/communications/banners', requireAdminApi('communications.view'), communications.listBanners);
router.post('/communications/banners', requireAdminApi('communications.manage'), communications.createBanner);
router.patch('/communications/banners/:id', requireAdminApi('communications.manage'), communications.updateBanner);

router.get('/analytics', requireAdminApi('analytics.view'), analytics.summary);

router.get('/settings', requireAdminApi('settings.view'), settings.get);
router.put('/settings', requireAdminApi('settings.manage'), settings.update);
router.get('/feature-flags', requireAdminApi('feature_flags.view'), settings.listFlags);
router.patch('/feature-flags/:key', requireAdminApi('feature_flags.manage'), settings.setFlag);
router.get('/app-versions', requireAdminApi('app_versions.view'), settings.listAppVersions);
router.put('/app-versions/:platform', requireAdminApi('app_versions.manage'), settings.updateAppVersion);

router.get('/audit-logs', requireAdminApi('audit_logs.view'), auditLogs.list);

router.get('/me', requireAdminApi(), profile.me);
router.put('/me', requireAdminApi(), profile.update);
router.put('/me/password', requireAdminApi(), profile.changePassword);

module.exports = router;
