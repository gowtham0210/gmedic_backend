const express = require('express');
const { requireApiAuth } = require('../middleware/auth');

const dashboard = require('../controllers/dashboardController');
const hospital = require('../controllers/hospitalController');
const doctors = require('../controllers/doctorController');
const appointments = require('../controllers/appointmentController');
const payments = require('../controllers/paymentController');
const tokens = require('../controllers/tokenController');
const profile = require('../controllers/profileController');
const search = require('../controllers/searchController');
const notifications = require('../controllers/notificationController');

const router = express.Router();
router.use(requireApiAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/me', profile.me);
router.get('/dashboard', dashboard.summary);

router.get('/hospital', hospital.get);
router.put('/hospital', hospital.update);
router.get('/hospital/qr.svg', hospital.qrSvg);
router.get('/hospital/qr.png', hospital.qrPng);
router.get('/hospital/qr-poster.svg', hospital.qrPoster);

router.get('/doctors', doctors.list);
router.post('/doctors', doctors.create);
router.patch('/doctors/availability', doctors.setAvailabilityBulk);
router.get('/doctors/:id', doctors.get);
router.put('/doctors/:id', doctors.update);
router.patch('/doctors/:id/availability', doctors.setAvailability);

router.get('/appointments', appointments.list);
router.get('/appointments/:id', appointments.get);
router.patch('/appointments/:id/status', appointments.updateStatus);

router.get('/payments', payments.list);

router.get('/tokens', tokens.list);
router.post('/tokens', tokens.create);
router.get('/tokens/eligible', tokens.eligible);
router.get('/tokens/:id', tokens.get);
router.patch('/tokens/:id/status', tokens.updateStatus);

router.get('/search', search.search);
router.get('/notifications', notifications.list);
router.post('/notifications/read', notifications.markRead);

router.put('/profile', profile.update);
router.put('/profile/password', profile.changePassword);

module.exports = router;
