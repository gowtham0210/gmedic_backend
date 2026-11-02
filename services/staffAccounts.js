// Shared helpers for portal accounts created by an admin (admin team, receptionists, doctor logins).

const crypto = require('crypto');
const db = require('../db');
const { badRequest } = require('../utils/http');

// No 0/O, 1/l/I, so a password read out over the phone is typed right.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

// A one-time password the person must change at first sign-in: 12 characters from crypto.randomInt
// (~68 bits), always with a letter and a digit so it meets isStrongPassword().
function tempPassword() {
  let p = '';
  for (let i = 0; i < 10; i += 1) p += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${p}${crypto.randomInt(2, 10)}${'ABCDEFGHJKMNPQRSTUVWXYZ'[crypto.randomInt(23)]}`;
}

function slugUsername(name) {
  return String(name).toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 40);
}

async function uniqueUsername(name) {
  const base = slugUsername(name) || 'user';
  let username = base;
  for (let n = 2; await db.one('SELECT 1 FROM users WHERE username = ?', [username]); n += 1) username = `${base}${n}`;
  return username;
}

// Phone numbers are compared by their last 10 digits, so "+91 98450 11223", "+919845011223" and
// "98450-11223" are the same number (the stored text keeps whatever format was typed).
const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const PHONE_KEY_SQL = "substr(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), -10)";

// Email and phone are unique across every account. Reported on the field rather than failing on
// the unique index. `ignoreId` skips the account being edited.
async function assertContactFree({ email, phone }, ignoreId = '') {
  const errors = {};
  if (email && await db.one('SELECT 1 FROM users WHERE LOWER(email) = LOWER(?) AND id <> ?', [email, ignoreId])) errors.email = 'Another account already uses this email.';
  if (phone && await db.one(`SELECT 1 FROM users WHERE phone IS NOT NULL AND ${PHONE_KEY_SQL} = ? AND id <> ?`, [phoneKey(phone), ignoreId])) errors.phone = 'Another account already uses this phone number.';
  if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
}

module.exports = { tempPassword, slugUsername, uniqueUsername, assertContactFree };
