const express = require('express');
const auth = require('../controllers/authController');
const { redirectIfAuthenticated } = require('../middleware/auth');

const router = express.Router();

router.get('/login', redirectIfAuthenticated, auth.showLogin);
router.post('/auth/login', auth.login);
router.post('/auth/forgot-password', auth.forgotPassword);
router.post('/logout', auth.logout);

module.exports = router;
