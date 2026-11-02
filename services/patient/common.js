// Shared pieces of the patient-app API: errors, time / money helpers and the JSON shapes
// (they mirror the models in the Flutter patient app, so the app can swap its fake API for this one).

const db = require('../../db');
const { SETTINGS } = require('../../config/platformSettings');

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, code, message) => new ApiError(status, code, message);
const notFound = (message = 'We couldn\'t find that.') => fail(404, 'NOT_FOUND', message);
const policy = (message) => fail(422, 'POLICY', message);

// ---- rules the patient app is built around
const RULES = {
  maxDependents: 6,
  bookingCutoffMinutes: 30,
  rescheduleWindowHours: 2,
  gstRate: 0.18,
};

// ---- time: appointments are stored as the hospital's local date + time
function nowIn(tz = 'Asia/Kolkata') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
function offsetFor(tz = 'Asia/Kolkata') {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName');
  const m = /GMT([+-]\d{2}):?(\d{2})?/.exec(part ? part.value : '');
  return m ? `${m[1]}:${m[2] || '00'}` : '+00:00';
}
const isoAt = (date, hhmm, tz) => `${date}T${hhmm}:00${offsetFor(tz)}`;
const instant = (date, hhmm, tz) => new Date(isoAt(date, hhmm, tz)).getTime();
const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday, like doctor_schedules
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
// A real calendar day (2026-11-31 is refused, not rolled over to 1 December).
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === String(v);

// ---- money (the database stores rupees, the app works in paise)
const paise = (rupees) => Math.round(Number(rupees || 0) * 100);
const rupees = (p) => Math.round(p) / 100;

// ---- enum translation
const GENDER_OUT = { MALE: 'male', FEMALE: 'female', OTHER: 'other' };
const GENDER_IN = { male: 'MALE', female: 'FEMALE', other: 'OTHER' };
const RELATION_OUT = { SELF: 'self', SPOUSE: 'spouse', CHILD: 'child', PARENT: 'parent', SIBLING: 'sibling', OTHER: 'other' };
const RELATION_IN = { spouse: 'SPOUSE', child: 'CHILD', parent: 'PARENT', sibling: 'SIBLING', other: 'OTHER' };
const FEE_MODEL_OUT = { FULL_PREPAY: 'fullPrepay', BOOKING_FEE: 'bookingFee', TOKEN: 'tokenFee' };
const METHOD_IN = { upi: 'UPI', card: 'Card', netbanking: 'Net Banking', wallet: 'Wallet' };
const METHOD_OUT = { UPI: 'upi', Card: 'card', 'Net Banking': 'netbanking', Wallet: 'wallet', Cash: 'upi' };

// ---- JSON shapes
function patientJson(row, user) {
  const self = row.relation === 'SELF';
  return {
    id: self && user ? user.id : row.id,
    name: row.name || (self ? 'Me' : ''),
    relation: RELATION_OUT[row.relation] || 'other',
    dob: row.date_of_birth || null,
    gender: GENDER_OUT[row.gender] || 'other',
  };
}

// Every hospital is on the booking-token model (migration 031): the app charges the token online
// (hospitals.booking_fee mirrors the platform setting) and the consultation fee is paid at the hospital.
function hospitalJson(h) {
  const model = 'tokenFee';
  const fee = paise(h.booking_fee);
  const address = [h.address_line1, h.city].filter(Boolean).join(', ') + (h.pincode ? ` ${h.pincode}` : '');
  return {
    id: h.id,
    code: h.id,
    name: h.name,
    kind: h.kind || 'Hospital',
    address,
    area: h.area || [h.city, h.state].filter(Boolean).join(', '),
    phone: h.phone || '',
    lat: h.lat == null ? 0 : Number(h.lat),
    lng: h.lng == null ? 0 : Number(h.lng),
    feeModel: model,
    bookingFeePaise: 0,
    tokenFeePaise: fee,
    convenienceFeePaise: 0,
    status: h.status === 'ACTIVE' ? 'active' : 'suspended',
    brandColor: h.brand_color == null ? 0xff0b8a7e : Number(h.brand_color),
    initials: h.initials || String(h.name || '').slice(0, 2).toUpperCase(),
    gstin: h.gstin || '',
    about: h.about || '',
    // Relative to the API host (/api/hospital-logos/<file>), like a doctor's photoUrl.
    logoUrl: h.logo_url || null,
  };
}

// What a booking costs: only the platform booking token now (no convenience fee or GST on top); the
// whole consultation fee is paid at the hospital.
async function feeBreakdown(doctor) {
  const consultation = paise(doctor.fee);
  const token = paise(await platformSetting('booking_token_amount'));
  return {
    model: 'tokenFee',
    consultationPaise: consultation,
    payNowBasePaise: token,
    convenienceFeePaise: 0,
    gstPaise: 0,
    totalNowPaise: token,
    payAtHospitalPaise: consultation,
    payNowLabel: 'Booking token',
  };
}

// The booking policy the patient app applies for a hospital: its own row, else the platform defaults
// (Super Admin > Platform Settings: booking window and cancellation cutoff).
async function hoursOf(hospitalId) {
  const row = await db.one('SELECT * FROM hospital_policies WHERE hospital_id = ?', [hospitalId]);
  if (!row) return { ...(await policyDefaults()), custom: false };
  return { cancellationWindowHours: row.cancellation_window_hours, refundPercent: row.refund_percent, bookingWindowDays: row.booking_window_days, custom: true, updatedAt: db.iso(row.updated_at) };
}

async function platformSetting(key) {
  const def = SETTINGS[key];
  const row = await db.one('SELECT value FROM platform_settings WHERE setting_key = ?', [key]);
  const n = row ? Number(JSON.parse(row.value)) : def.default;
  return Number.isInteger(n) && n >= def.min && n <= def.max ? n : def.default;
}

async function policyDefaults() {
  return { cancellationWindowHours: await platformSetting('cancellation_cutoff_hours'), refundPercent: 100, bookingWindowDays: await platformSetting('booking_window_days') };
}

async function holdMinutes() {
  return platformSetting('appointment_hold_minutes');
}

module.exports = {
  platformSetting,
  ApiError, fail, notFound, policy, RULES,
  nowIn, offsetFor, isoAt, instant, addDays, weekdayOf, minutesOf, hhmm, isDate,
  paise, rupees, GENDER_OUT, GENDER_IN, RELATION_OUT, RELATION_IN, FEE_MODEL_OUT, METHOD_IN, METHOD_OUT,
  patientJson, hospitalJson, feeBreakdown, hoursOf, policyDefaults, holdMinutes,
};
