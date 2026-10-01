const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const locals = require('./middleware/locals');
const { notFound, errorHandler } = require('./middleware/errors');
const MySQLSessionStore = require('./services/mysqlSessionStore');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
if (config.isProd || config.trustProxy) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false, // the pages use inline <script> for page state; revisit with nonces if tightened later
  crossOriginEmbedderPolicy: false,
}));

if (config.corsOrigins.length) {
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
}

app.use(express.static(path.join(__dirname, 'public'), { maxAge: config.isProd ? '7d' : 0 }));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));

app.use(session({
  name: 'gmedic.sid',
  store: new MySQLSessionStore(),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies },
}));

// Throttle login/forgot-password attempts at the network level, on top of the
// per-identifier lockout in authController.
app.use(
  ['/auth/login', '/auth/forgot-password'],
  rateLimit({ windowMs: 10 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false })
);
app.use(
  '/api/',
  rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
);

app.use(locals);
app.use('/', require('./routes/auth'));
app.use('/api', require('./routes/api'));
app.use('/api/admin', require('./routes/adminApi'));
app.use('/admin', require('./routes/adminPages'));
app.use('/', require('./routes/pages'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
