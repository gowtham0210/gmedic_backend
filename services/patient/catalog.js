// Hospitals (linked by scanning a QR code), departments, doctors, slots and fee quotes.

const db = require('../../db');
const config = require('../../config');
const bookingCore = require('../bookingCore');
const {
  fail, notFound, policy, RULES, nowIn, isoAt, instant, addDays, weekdayOf, minutesOf, hhmm, isDate,
  hospitalJson, feeBreakdown, hoursOf, GENDER_OUT, paise,
} = require('./common');
const { selfPatient } = require('./account');

// ------------------------------------------------------------------ QR codes and linking
const DEEP_LINK_HOSTS = new Set(['gmedic.app', 'www.gmedic.app']);
try { DEEP_LINK_HOSTS.add(new URL(config.qrBaseUrl).host); } catch { /* keep the defaults */ }

const qrError = (kind) => ({
  invalid: fail(422, 'QR_INVALID', 'This isn\'t a Gmedic hospital code. Scan the QR poster at the hospital reception.'),
  revoked: fail(422, 'QR_REVOKED', 'This QR code is no longer active. Please scan the latest poster at the hospital.'),
  suspended: fail(422, 'QR_SUSPENDED', 'This hospital is not accepting Gmedic bookings right now. Please contact the front desk.'),
}[kind]);

// A QR payload is "https://gmedic.app/h/<hospital>?k=<key>", "gmedic://gmedic.app/h/<hospital>" or a bare hospital code.
function parseQr(raw) {
  const input = String(raw || '').trim();
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(input)) {
    let url;
    try { url = new URL(input); } catch { throw qrError('invalid'); }
    const custom = url.protocol === 'gmedic:';
    if (!custom && !(['https:', 'http:'].includes(url.protocol) && DEEP_LINK_HOSTS.has(url.host))) throw qrError('invalid');
    const segments = url.pathname.split('/').filter(Boolean);
    const at = segments.indexOf('h');
    if (at < 0 || !segments[at + 1]) throw qrError('invalid');
    return { code: segments[at + 1], key: url.searchParams.get('k') };
  }
  if (/^[A-Za-z0-9]{4,12}$/.test(input)) return { code: input, key: null };
  throw qrError('invalid');
}

async function logScan(me, { qr, hospital, result, reason }) {
  const self = await selfPatient(me.user.id);
  await db.query(
    'INSERT INTO qr_scans (qr_code_id, hospital_id, branch_id, patient_id, result, failure_reason, account_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [qr ? qr.id : null, hospital ? hospital.id : null, qr ? qr.branch_id : null, self ? self.id : null, result, reason || null, me.user.id]
  ).catch(() => {});
}

// Finds the hospital and the active QR key a payload points at, or throws the matching QR error.
async function checkQr(me, raw) {
  let parsed;
  try { parsed = parseQr(raw); } catch (err) { await logScan(me, { result: 'FAILED', reason: 'Not a Gmedic code' }); throw err; }
  const hospital = await db.one('SELECT * FROM hospitals WHERE UPPER(id) = UPPER(?)', [parsed.code]);
  if (!hospital) { await logScan(me, { result: 'FAILED', reason: 'Unknown hospital code' }); throw qrError('invalid'); }
  let qr;
  if (parsed.key) {
    qr = await db.one('SELECT * FROM qr_codes WHERE qr_key = ? AND hospital_id = ?', [parsed.key, hospital.id]);
    if (!qr) { await logScan(me, { hospital, result: 'FAILED', reason: 'Unknown QR key' }); throw qrError('invalid'); }
    if (qr.status !== 'ACTIVE') { await logScan(me, { qr, hospital, result: 'FAILED', reason: 'QR code revoked' }); throw qrError('revoked'); }
  } else {
    qr = await db.one("SELECT * FROM qr_codes WHERE hospital_id = ? AND status = 'ACTIVE' ORDER BY created_at LIMIT 1", [hospital.id]);
    if (!qr) { await logScan(me, { hospital, result: 'FAILED', reason: 'No active QR code' }); throw qrError('revoked'); }
  }
  if (hospital.status !== 'ACTIVE') { await logScan(me, { qr, hospital, result: 'FAILED', reason: 'Hospital not active' }); throw qrError('suspended'); }
  return { hospital, qr };
}

async function activeLink(userId, hospitalId) {
  return db.one('SELECT * FROM patient_hospital_links WHERE account_user_id = ? AND hospital_id = ? AND removed_at IS NULL', [userId, hospitalId]);
}

async function resolveQr(me, raw) {
  const { hospital, qr } = await checkQr(me, raw);
  return { hospital: hospitalJson(hospital), alreadyLinked: !!(await activeLink(me.user.id, hospital.id)), qrKeyId: qr.qr_key };
}

async function linkHospital(me, hospitalId, qrKeyId) {
  const hospital = await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId]);
  if (!hospital) throw notFound();
  const { qr } = await checkQr(me, `https://gmedic.app/h/${hospital.id}?k=${encodeURIComponent(String(qrKeyId || ''))}`);
  const self = await selfPatient(me.user.id);
  const existing = await db.one('SELECT * FROM patient_hospital_links WHERE account_user_id = ? AND hospital_id = ?', [me.user.id, hospital.id]);
  const already = !!existing && !existing.removed_at;
  if (existing) await db.query('UPDATE patient_hospital_links SET removed_at = NULL, qr_code_id = ? WHERE patient_id = ? AND hospital_id = ?', [qr.id, existing.patient_id, hospital.id]);
  else await db.query('INSERT INTO patient_hospital_links (patient_id, hospital_id, account_user_id, qr_code_id) VALUES (?, ?, ?, ?)', [self.id, hospital.id, me.user.id, qr.id]);
  await logScan(me, { qr, hospital, result: already ? 'ALREADY_LINKED' : 'LINKED' });
}

async function unlinkHospital(me, hospitalId) {
  await db.query("UPDATE patient_hospital_links SET removed_at = datetime('now') WHERE account_user_id = ? AND hospital_id = ? AND removed_at IS NULL", [me.user.id, hospitalId]);
}

// Undo: only for a hospital removed in the last few minutes.
async function relinkHospital(me, hospitalId) {
  const res = await db.query(
    "UPDATE patient_hospital_links SET removed_at = NULL WHERE account_user_id = ? AND hospital_id = ? AND removed_at IS NOT NULL AND removed_at >= datetime('now', '-10 minutes')",
    [me.user.id, hospitalId]
  );
  if (!res.affectedRows) throw notFound('That hospital can no longer be restored. Scan its QR code again.');
}

async function requireLinked(me, hospitalId) {
  const hospital = await db.one('SELECT * FROM hospitals WHERE id = ?', [hospitalId]);
  if (!hospital) throw notFound();
  if (!(await activeLink(me.user.id, hospital.id))) throw fail(403, 'NOT_LINKED', 'Scan this hospital\'s QR code to see its doctors.');
  return hospital;
}

async function linkedHospitals(me) {
  const rows = await db.query(
    'SELECT h.* FROM patient_hospital_links l JOIN hospitals h ON h.id = l.hospital_id WHERE l.account_user_id = ? AND l.removed_at IS NULL ORDER BY l.linked_at DESC, h.name',
    [me.user.id]
  );
  return rows.map(hospitalJson);
}

async function hospital(me, id) {
  return hospitalJson(await requireLinked(me, id));
}

// ------------------------------------------------------------------ departments and doctors
async function departments(me, hospitalId) {
  await requireLinked(me, hospitalId);
  const rows = await db.query('SELECT * FROM departments WHERE hospital_id = ? AND archived_at IS NULL ORDER BY name', [hospitalId]);
  return rows.map((d) => ({ id: String(d.id), hospitalId: d.hospital_id, name: d.name, icon: d.icon || 'stethoscope' }));
}

async function leaveOn(doctor, date) {
  return db.one('SELECT reason FROM doctor_leaves WHERE doctor_id = ? AND cancelled_at IS NULL AND start_date <= ? AND end_date >= ? ORDER BY id LIMIT 1', [doctor.id, date, date]);
}

async function doctorJson(d, hospital) {
  const today = nowIn(hospital.timezone).date;
  const [languages, sessions, leave] = await Promise.all([
    db.query('SELECT language FROM doctor_languages WHERE doctor_id = ? ORDER BY rowid', [d.id]),
    db.query(
      `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND (effective_from IS NULL OR effective_from <= ?) AND (effective_to IS NULL OR effective_to >= ?) ORDER BY day_of_week, start_time`,
      [d.id, today, today]
    ),
    leaveOn(d, today),
  ]);
  const away = bookingCore.absentOn(d, today, hospital.timezone) || !!leave;
  return {
    id: d.id,
    hospitalId: d.hospital_id,
    departmentId: d.department_id == null ? '' : String(d.department_id),
    name: d.name,
    qualifications: d.qualifications || '',
    specialty: d.specialization,
    experienceYears: d.years_experience == null ? 0 : Number(d.years_experience),
    languages: languages.map((l) => l.language),
    feePaise: paise(d.fee),
    gender: GENDER_OUT[d.gender] || 'other',
    about: d.bio || '',
    photoUrl: d.photo_url || null,
    schedule: sessions.map((s) => ({
      weekday: s.day_of_week === 0 ? 7 : s.day_of_week, startMinute: minutesOf(s.start_time), endMinute: minutesOf(s.end_time),
      slotMinutes: s.slot_minutes, perSlot: s.capacity_per_slot,
    })),
    onLeave: away,
    leaveNote: leave ? leave.reason || 'On leave' : away ? 'Not available today' : null,
  };
}

async function bookableDoctor(id) {
  const d = await db.one(`SELECT d.* FROM doctors d WHERE d.id = ? AND ${bookingCore.BOOKABLE_DOCTOR}`, [id]);
  if (!d) throw notFound();
  return { d, h: await db.one('SELECT * FROM hospitals WHERE id = ?', [d.hospital_id]) };
}

async function doctors(me, hospitalId) {
  const h = await requireLinked(me, hospitalId);
  const rows = await db.query(`SELECT d.* FROM doctors d WHERE d.hospital_id = ? AND ${bookingCore.BOOKABLE_DOCTOR} ORDER BY d.name`, [hospitalId]);
  const out = [];
  for (const d of rows) {
    const next = await nextAvailableSlot(me, d, h);
    out.push({ doctor: await doctorJson(d, h), nextAvailable: next ? next.start : null });
  }
  return out;
}

async function doctor(me, id) {
  const { d, h } = await bookableDoctor(id);
  await requireLinked(me, h.id);
  return doctorJson(d, h);
}

// ------------------------------------------------------------------ slots
const slotId = (doctorId, date, time) => `${doctorId}_${date.replace(/-/g, '')}${time.replace(':', '')}`;

// All slots of a doctor on one day, as the signed-in patient sees them (their own holds don't count against them).
async function buildSlots(me, d, h, date) {
  const tz = h.timezone;
  const now = nowIn(tz);
  const rules = await hoursOf(h.id);
  const windowEnd = addDays(now.date, rules.bookingWindowDays);
  const away = bookingCore.absentOn(d, date, tz) || !!(await leaveOn(d, date));
  const sessions = await db.query(
    `SELECT * FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? AND (effective_from IS NULL OR effective_from <= ?) AND (effective_to IS NULL OR effective_to >= ?) ORDER BY start_time`,
    [d.id, weekdayOf(date), date, date]
  );
  if (!sessions.length) return [];
  // Head counts come from the shared booking core, so the app sees exactly the seats left for
  // online bookings: the slot's capacity less the seats the receptionist holds back for walk-ins.
  const load = await bookingCore.slotLoad(db, d.id, date, { ignoreHoldsOfUser: me ? me.user.id : '' });

  const out = [];
  for (const s of sessions) {
    for (let m = minutesOf(s.start_time); m + s.slot_minutes <= minutesOf(s.end_time); m += s.slot_minutes) {
      const time = hhmm(m);
      const left = bookingCore.seatsFor(s, load.get(time)).seatsLeft.online;
      let status = 'available';
      if (away || date < now.date || date >= windowEnd || instant(date, time, tz) < Date.now() + RULES.bookingCutoffMinutes * 60000) status = 'unavailable';
      else if (left <= 0) status = 'full';
      out.push({
        id: slotId(d.id, date, time), doctorId: d.id, date, time, capacity: s.capacity_per_slot, slotMinutes: s.slot_minutes,
        start: isoAt(date, time, tz), end: isoAt(date, hhmm(m + s.slot_minutes), tz), status, seatsLeft: Math.max(0, left),
      });
    }
  }
  return out;
}

const publicSlot = (s) => ({ id: s.id, doctorId: s.doctorId, start: s.start, end: s.end, status: s.status, seatsLeft: s.seatsLeft, capacity: s.capacity });

async function slots(me, doctorId, date) {
  if (!isDate(date)) throw fail(400, 'VALIDATION', 'Choose a valid date (YYYY-MM-DD).');
  const { d, h } = await bookableDoctor(doctorId);
  await requireLinked(me, h.id);
  return (await buildSlots(me, d, h, date)).map(publicSlot);
}

async function nextAvailableSlot(me, d, h, after) {
  const rules = await hoursOf(h.id);
  const today = nowIn(h.timezone).date;
  for (let i = 0; i < rules.bookingWindowDays; i += 1) {
    const day = addDays(today, i);
    if (after && day <= after) continue;
    const hit = (await buildSlots(me, d, h, day)).find((s) => s.status === 'available');
    if (hit) return hit;
  }
  return null;
}

async function nextAvailableDay(me, doctorId, after) {
  if (after && !isDate(after)) throw fail(400, 'VALIDATION', 'Choose a valid date (YYYY-MM-DD).');
  const { d, h } = await bookableDoctor(doctorId);
  await requireLinked(me, h.id);
  const hit = await nextAvailableSlot(me, d, h, after || null);
  return { date: hit ? hit.date : null };
}

async function quote(me, doctorId) {
  const { d, h } = await bookableDoctor(doctorId);
  await requireLinked(me, h.id);
  return feeBreakdown(d, h);
}

// slot id -> the doctor, hospital, schedule definition and live slot it points at
async function resolveSlot(me, id) {
  const m = /^(.+)_(\d{8})(\d{4})$/.exec(String(id || ''));
  if (!m) throw notFound();
  const { d, h } = await bookableDoctor(m[1]);
  const date = `${m[2].slice(0, 4)}-${m[2].slice(4, 6)}-${m[2].slice(6, 8)}`;
  const time = `${m[3].slice(0, 2)}:${m[3].slice(2, 4)}`;
  const slot = (await buildSlots(me, d, h, date)).find((s) => s.time === time);
  if (!slot) throw notFound();
  return { d, h, date, time, slot };
}

module.exports = {
  parseQr, resolveQr, linkHospital, unlinkHospital, relinkHospital, linkedHospitals, hospital, requireLinked, activeLink,
  departments, doctors, doctor, doctorJson, bookableDoctor, slots, buildSlots, nextAvailableSlot, nextAvailableDay, quote, resolveSlot, publicSlot, policy,
};
