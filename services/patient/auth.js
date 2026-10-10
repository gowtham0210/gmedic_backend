// Patient login: phone number + one-time passcode, then a bearer token the app sends as
// "Authorization: Bearer <token>". Tokens are rows in the existing `sessions` table.
//
// OTP delivery needs an SMS provider, which this project does not have. PATIENT_OTP_MODE:
//   dev  (default outside production) - the passcode is the fixed PATIENT_DEV_OTP (default 123456)
//   sms  - the real mode; answers 501 until a provider is connected, so nothing is ever faked in production

const crypto = require('crypto');
const db = require('../../db');
const { hashPassword } = require('../../utils/password');
const { fail } = require('./common');

const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_SENDS_PER_HOUR = 5;
const SESSION_DAYS = Number(process.env.PATIENT_SESSION_DAYS) || 30;

const mode = () => (process.env.PATIENT_OTP_MODE || (process.env.NODE_ENV === 'production' ? 'sms' : 'dev'));
const devCode = () => String(process.env.PATIENT_DEV_OTP || '123456');
const hashCode = (phone, code) => crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');

// 10-digit Indian mobile number (accepts +91 / 91 / 0 prefixes).
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) throw fail(400, 'INVALID_PHONE', 'Enter a valid 10-digit mobile number.');
  return digits;
}

async function requestOtp(rawPhone) {
  const phone = normalizePhone(rawPhone);
  if (mode() !== 'dev') throw fail(501, 'OTP_UNAVAILABLE', 'SMS sign-in is not available yet because no SMS provider is connected.');
  const recent = await db.one("SELECT COUNT(*) AS n FROM otp_codes WHERE phone = ? AND created_at >= datetime('now', '-1 hour')", [phone]);
  if (Number(recent.n) >= OTP_MAX_SENDS_PER_HOUR) throw fail(429, 'TOO_MANY_REQUESTS', 'Too many codes requested. Please try again in an hour.');
  await db.query("INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES (?, ?, datetime('now', ?))", [phone, hashCode(phone, devCode()), `+${OTP_TTL_SECONDS} seconds`]);
  return { ok: true, expiresInSeconds: OTP_TTL_SECONDS, mode: 'dev' };
}

async function accountFor(phone) {
  let user = await db.one("SELECT * FROM users WHERE role = 'PATIENT' AND phone = ?", [phone]);
  if (user) return user;
  return db.tx(async (conn) => {
    const id = await db.nextId('users', 'USR', 2001, conn);
    await conn.query(
      "INSERT INTO users (id, role, name, username, email, phone, password_hash, status) VALUES (?, 'PATIENT', '', ?, ?, ?, ?, 'ACTIVE')",
      [id, `p${phone}`, `${phone}@patients.gmedic.local`, phone, hashPassword(crypto.randomBytes(24).toString('hex'))]
    );
    // The account holder is also a bookable patient ("self"). A walk-in record with the same
    // mobile number is adopted, so earlier visits show up in their history.
    const existing = await conn.one('SELECT id FROM patients WHERE mobile = ?', [phone]);
    if (existing) {
      await conn.query("UPDATE patients SET account_user_id = ?, relation = 'SELF' WHERE id = ?", [id, existing.id]);
    } else {
      const pid = await db.nextId('patients', 'PAT', 1001, conn);
      await conn.query("INSERT INTO patients (id, name, mobile, account_user_id, relation) VALUES (?, '', ?, ?, 'SELF')", [pid, phone, id]);
    }
    return conn.one('SELECT * FROM users WHERE id = ?', [id]);
  });
}

async function verifyOtp(rawPhone, rawCode) {
  const phone = normalizePhone(rawPhone);
  const code = String(rawCode || '').trim();
  const row = await db.one("SELECT * FROM otp_codes WHERE phone = ? AND consumed_at IS NULL AND expires_at >= datetime('now') ORDER BY id DESC LIMIT 1", [phone]);
  if (!row) throw fail(401, 'INVALID_OTP', 'That code is incorrect or has expired. Please request a new one.');
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw fail(429, 'TOO_MANY_REQUESTS', 'Too many wrong attempts. Please request a new code.');
  const a = Buffer.from(hashCode(phone, code));
  const b = Buffer.from(row.code_hash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    throw fail(401, 'INVALID_OTP', 'That code is incorrect. Please try again.');
  }
  await db.query("UPDATE otp_codes SET consumed_at = datetime('now') WHERE id = ?", [row.id]);

  const user = await accountFor(phone);
  if (user.status !== 'ACTIVE') throw fail(403, 'ACCOUNT_DISABLED', 'This account is not active. Please contact Gmedic support.');
  const token = crypto.randomBytes(32).toString('hex');
  await db.query('INSERT INTO sessions (sid, user_id, data, expires_at) VALUES (?, ?, ?, datetime(\'now\', ?))', [
    token, user.id, JSON.stringify({ userId: user.id, role: 'PATIENT', kind: 'patient', sessionVersion: user.session_version, loginAt: Date.now() }), `+${SESSION_DAYS} days`,
  ]);
  await db.query("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", [user.id]);
  return { token, user };
}

// Resolves "Authorization: Bearer <token>" to the signed-in patient account.
async function authenticate(req) {
  const header = req.headers.get('authorization') || '';
  const token = /^Bearer\s+([a-f0-9]{64})$/i.exec(header);
  if (!token) throw fail(401, 'NOT_SIGNED_IN', 'Please sign in again.');
  const session = await db.one("SELECT * FROM sessions WHERE sid = ? AND expires_at >= datetime('now')", [token[1]]);
  if (!session) throw fail(401, 'NOT_SIGNED_IN', 'Please sign in again.');
  let data;
  try { data = JSON.parse(session.data); } catch { data = {}; }
  if (data.kind !== 'patient') throw fail(401, 'NOT_SIGNED_IN', 'Please sign in again.');
  const user = await db.one("SELECT * FROM users WHERE id = ? AND role = 'PATIENT' AND status = 'ACTIVE'", [session.user_id]);
  if (!user || user.session_version !== data.sessionVersion) throw fail(401, 'NOT_SIGNED_IN', 'Please sign in again.');
  return { user, token: token[1] };
}

async function logout(me) {
  await db.query("UPDATE slot_holds SET status = 'RELEASED' WHERE status = 'HELD' AND patient_id IN (SELECT id FROM patients WHERE account_user_id = ?)", [me.user.id]);
  await db.query('DELETE FROM sessions WHERE sid = ?', [me.token]);
}

module.exports = { normalizePhone, requestOtp, verifyOtp, authenticate, logout };
