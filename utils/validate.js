// Minimal schema validation used by the API controllers.
//
// schema: { field: { label, required, type: 'string'|'number'|'enum'|'email'|'phone',
//                    min, max, minLength, maxLength, values, pattern, message } }
// Returns { value, errors } where errors maps field -> message.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Indian and international numbers: digits, spaces, +, -, parentheses; 10-15 digits.
const PHONE_RE = /^\+?[\d\s()-]{10,20}$/;

function validate(input, schema, { partial = false } = {}) {
  const value = {};
  const errors = {};
  const src = input || {};

  for (const [field, rule] of Object.entries(schema)) {
    const label = rule.label || field;
    const present = Object.prototype.hasOwnProperty.call(src, field);
    if (partial && !present) continue;

    let v = src[field];
    if (typeof v === 'string') v = v.trim();
    const empty = v === undefined || v === null || v === '';

    if (empty) {
      if (rule.required) errors[field] = `${label} is required.`;
      else if (present) value[field] = rule.type === 'number' ? null : '';
      continue;
    }

    switch (rule.type) {
      case 'number': {
        const n = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(n)) { errors[field] = `${label} must be a number.`; continue; }
        if (rule.integer && !Number.isInteger(n)) { errors[field] = `${label} must be a whole number.`; continue; }
        if (rule.min !== undefined && n < rule.min) { errors[field] = `${label} must be at least ${rule.min}.`; continue; }
        if (rule.max !== undefined && n > rule.max) { errors[field] = `${label} must be at most ${rule.max}.`; continue; }
        value[field] = n;
        continue;
      }
      case 'enum': {
        if (!rule.values.includes(v)) { errors[field] = rule.message || `Choose a valid ${label.toLowerCase()}.`; continue; }
        value[field] = v;
        continue;
      }
      case 'email': {
        v = String(v).toLowerCase();
        if (!EMAIL_RE.test(v) || v.length > 120) { errors[field] = `Enter a valid email address.`; continue; }
        value[field] = v;
        continue;
      }
      case 'phone': {
        v = String(v);
        const digits = v.replace(/\D/g, '');
        if (!PHONE_RE.test(v) || digits.length < 10 || digits.length > 15) {
          errors[field] = 'Enter a valid phone number (10–15 digits).';
          continue;
        }
        value[field] = v.replace(/\s+/g, ' ');
        continue;
      }
      default: {
        v = String(v).replace(/\s+/g, ' ');
        if (rule.minLength && v.length < rule.minLength) { errors[field] = `${label} must be at least ${rule.minLength} characters.`; continue; }
        if (rule.maxLength && v.length > rule.maxLength) { errors[field] = `${label} must be at most ${rule.maxLength} characters.`; continue; }
        if (rule.pattern && !rule.pattern.test(v)) { errors[field] = rule.message || `${label} is not valid.`; continue; }
        value[field] = v;
      }
    }
  }

  return { value, errors, ok: Object.keys(errors).length === 0 };
}

module.exports = { validate, EMAIL_RE };
