const path = require('path');

// process.cwd(), not __dirname: Next.js's server bundler (Turbopack/webpack)
// rewrites __dirname to a placeholder that doesn't map to a real path once
// this module is bundled into a Route Handler/Server Component. Both the
// Next.js app and the legacy Express app are always started from the project
// root, so process.cwd() is reliable for both.
const ROOT = process.cwd();
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const bool = (v, d = false) => (v === undefined || v === '' ? d : v === 'true' || v === '1');

if (isProd && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET must be set to a long random string (32+ characters) in production.');
}

module.exports = {
  root: ROOT,
  isProd,
  port: Number(env.PORT) || 3000,

  // SQLite database file (via Node's built-in node:sqlite) — no server, no
  // separate install, no root password.
  dbFile: env.DB_FILE || path.join(ROOT, 'data', 'gmedic.sqlite'),

  sessionSecret: env.SESSION_SECRET || 'gmedic-local-dev-secret-change-me',
  secureCookies: bool(env.SECURE_COOKIES),
  trustProxy: bool(env.TRUST_PROXY),
  rememberMeDays: 30,
  // Sessions without "Remember me" end after this much inactivity...
  idleTimeoutMinutes: Number(env.SESSION_IDLE_MINUTES) || 12 * 60,
  // ...and every session (even "Remember me") must re-authenticate after this long.
  sessionMaxHours: Number(env.SESSION_MAX_HOURS) || 72,

  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  uploadDir: path.resolve(ROOT, env.UPLOAD_DIR || 'storage/uploads'),

  // Legacy JSON data file from the first version of the receptionist portal.
  // It is imported into MySQL by `npm run db:setup` and not used at runtime.
  dataFile: env.DATA_FILE || path.join(ROOT, 'data', 'db.json'),

  // Link encoded in each QR code: <qrBaseUrl>/<hospitalId>?k=<qr key>.
  // The Gmedic patient app scans it to add the hospital.
  qrBaseUrl: env.QR_BASE_URL || 'https://gmedic.app/h',

  specializations: [
    'Cardiologist',
    'Dermatologist',
    'ENT Specialist',
    'Gastroenterologist',
    'General Physician',
    'Gynecologist',
    'Neurologist',
    'Ophthalmologist',
    'Orthopedist',
    'Pediatrician',
    'Psychiatrist',
    'Pulmonologist',
    'Urologist',
    'Dentist',
  ],
};
