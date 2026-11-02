// Turns a database unique-rule failure into a 409 the person can act on, instead of a generic 500.
// SQLite reports "UNIQUE constraint failed: users.email" (or "... index 'uq_x'" for an expression index).

const { HttpError } = require('./http');

// table.column -> [request field, what to call it]. Anything else gets a generic conflict message.
const FIELDS = {
  'users.email': ['email', 'email'],
  'users.phone': ['phone', 'phone number'],
  'users.username': ['username', 'username'],
  'users.doctor_id': ['doctorId', 'portal login for this doctor'],
  'patients.mobile': ['mobile', 'mobile number'],
  'hospitals.gstin': ['gstin', 'GSTIN'],
  'hospitals.registration_number': ['registrationNumber', 'registration number'],
  'doctors.registration_number': ['registrationNumber', 'registration number'],
  'notification_templates.event_key': ['eventKey', 'event'],
  'feature_flags.flag_key': ['key', 'flag'],
  'qr_codes.qr_key': ['qrKey', 'QR key'],
  'payments.transaction_id': ['transactionId', 'transaction ID'],
  'payments.receipt_number': ['receiptNumber', 'receipt number'],
};

function uniqueConflict(err) {
  const m = /UNIQUE constraint failed: (.+)$/i.exec(String(err && err.message));
  if (!m) return null;
  const columns = m[1].split(',').map((c) => c.trim());
  const known = columns.length === 1 && FIELDS[columns[0]];
  if (known) {
    const [field, label] = known;
    return new HttpError(409, `This ${label} is already in use.`, { [field]: `Another record already uses this ${label}.` });
  }
  return new HttpError(409, 'This conflicts with an existing record. Refresh the page and try again.');
}

module.exports = { uniqueConflict };
