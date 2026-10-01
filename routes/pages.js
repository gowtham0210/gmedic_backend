const express = require('express');
const pages = require('../controllers/pageController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => res.redirect('/dashboard'));

router.use(requireAuth);
router.get('/dashboard', pages.dashboard);
router.get('/hospital', pages.hospital);
router.get('/doctors', pages.doctors);
router.get('/doctors/:id', pages.doctorDetail);
router.get('/appointments', pages.appointments);
router.get('/tokens', pages.tokens);
router.get('/payments', pages.payments);
router.get('/settings', pages.settings);

module.exports = router;
