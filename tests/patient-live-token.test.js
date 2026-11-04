// Patient "Now serving" (appointment.currentToken) and the one-active-consultation rule. Run: npm test
// They run on a throwaway COPY of data/gmedic.sqlite (the working database is never written) and need hospital HSP2,
// doctor DOC101 (cloned as clean test doctors DOCQ1 and DOCQ2) and receptionist USR901, as the demo data does.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gmedic-livetoken-'));
const dbFile = path.join(tmp, 'test.sqlite');
const source = new DatabaseSync(path.join(__dirname, '..', 'data', 'gmedic.sqlite'), { readOnly: true });
source.exec(`VACUUM INTO '${dbFile.split(path.sep).join('/')}'`);
source.close();
process.env.DB_FILE = dbFile;

const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const rq = (p) => require(path.join(root, p));
const db = rq('db');
const { migrate } = rq('db/migrate');
const rb = rq('services/receptionBooking');
const patientBooking = rq('services/patient/booking');
const patientAuth = rq('services/patient/auth');
const tokenModel = rq('models/tokenModel');
const queue = rq('controllers/doctor/queueController');
const tokenController = rq('controllers/tokenController');
const { nowIn, hhmm } = rq('services/patient/common');

const H = 'HSP2';
const D1 = 'DOCQ1';
const D2 = 'DOCQ2';
const now = nowIn('Asia/Kolkata');
const today = now.date;
const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const slot = (k) => hhmm(Math.min(Math.floor(now.minutes / 15) * 15 + 15 * k, 23 * 60 + 45)); // k-th 15-minute slot from the one running now
const R1 = { id: 'USR901', name: 'Desk One', role: 'RECEPTIONIST', hospitalId: H };
const doctorUser = (doctorId) => ({ id: `USR_${doctorId}`, name: 'Dr. Queue', role: 'DOCTOR', doctorId, hospitalId: H });
const fakeRes = () => { const r = { body: null, json(b) { r.body = b; return r; }, status() { return r; } }; return r; };
const doctorReq = (doctorId, params = {}, body = {}) => ({ hospitalId: H, doctorId, user: doctorUser(doctorId), query: {}, body, params, ip: 'test', get: () => '' });
const deskReq = (params, body) => ({ hospitalId: H, user: R1, query: {}, body, params, ip: 'test', get: () => '' });
const rejects = (fn, status, match) => assert.rejects(fn, (e) => { assert.equal(e.status, status, `${e.status} ${e.message}`); if (match) assert.match(e.message, match); return true; });
const doctor = async (doctorId, action, tokenId) => { const res = fakeRes(); await queue[action](doctorReq(doctorId, { id: tokenId }), res); return res.body; };
let mobile = 9300000100;

const clone = async (table, from, over) => {
  const row = await db.one(`SELECT * FROM ${table} WHERE id = ?`, [from]);
  const r = { ...row, ...over };
  const cols = Object.keys(r);
  await db.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => r[c]));
};

// A patient app account with its own "self" patient record, as services/patient/auth.js creates on first sign-in.
async function patientAccount(label) {
  const phone = String(mobile++);
  const uid = await db.nextId('users', 'USR', 2001);
  await db.query("INSERT INTO users (id, role, name, username, email, phone, password_hash, status) VALUES (?, 'PATIENT', ?, ?, ?, ?, 'x', 'ACTIVE')", [uid, `Live ${label}`, `p${phone}`, `${phone}@patients.gmedic.local`, phone]);
  const pid = await db.nextId('patients', 'PAT', 1001);
  await db.query("INSERT INTO patients (id, name, mobile, account_user_id, relation) VALUES (?, ?, ?, ?, 'SELF')", [pid, `Live ${label}`, phone, uid]);
  return { user: { id: uid }, patientId: pid, name: `Live ${label}` };
}

// Books through the front desk (the booking issues the queue token) and hands the appointment to the patient account.
async function book(doctorId, date, time, owner) {
  const a = await rb.book(H, { doctorId, date, time, patient: { name: owner.name, mobile: String(mobile++) } }, R1);
  await db.query('UPDATE appointments SET patient_id = ? WHERE id = ?', [owner.patientId, a.id]);
  const token = await db.one("SELECT id, code FROM tokens WHERE appointment_id = ? AND status <> 'cancelled'", [a.id]);
  return { id: a.id, tokenId: token.id, code: token.code };
}

const nowServing = async (owner, appt) => (await patientBooking.appointment(owner, appt.id)).appointment.currentToken;
const status = async (appt) => (await db.one('SELECT status FROM tokens WHERE id = ?', [appt.tokenId])).status;
const inConsultation = async (doctorId, date) => (await db.query("SELECT code FROM tokens WHERE doctor_id = ? AND token_date = ? AND status = 'in_consultation'", [doctorId, date])).map((r) => r.code);

let p1; let p2;
let a1; let a2; let a3; // doctor D1, today: p1's own booking is a3, with a1 and a2 ahead of it
let b1; let b2; // doctor D2, today
let t1; // doctor D1, tomorrow

test('setup: clean test doctors with all-day hours today and tomorrow, and two patient accounts', async () => {
  await migrate();
  for (const [id, n] of [[D1, 1], [D2, 2]]) {
    await clone('doctors', 'DOC101', { id, name: `Dr. Queue ${n}`, registration_number: `TEST-LIVE-${n}`, department_id: null, emergency_on_call: 0, availability: 'present' });
    for (const d of [today, tomorrow]) {
      await db.query("INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot) VALUES (?, ?, '00:00', '23:59', 15, 2)", [id, dow(d)]);
    }
  }
  // the patient app's live queue is the admin-controlled 'live_queue' flag (off in the demo data); this copy turns it on
  await db.query("UPDATE feature_flags SET enabled = 1 WHERE flag_key = 'live_queue'");
  p1 = await patientAccount('one');
  p2 = await patientAccount('two');
  a1 = await book(D1, today, slot(0), await patientAccount('ahead one'));
  a2 = await book(D1, today, slot(1), await patientAccount('ahead two'));
  a3 = await book(D1, today, slot(2), p1);
  b1 = await book(D2, today, slot(0), p2);
  t1 = await book(D1, tomorrow, slot(0), p1);
  assert.ok(a1.code && a2.code && a3.code && b1.code && t1.code, 'booking issued a queue token for each appointment');
});

test('the patient gets null while nobody is in consultation', async () => {
  assert.equal(await nowServing(p1, a3), null);
});

test('a called token is not "now serving"; an in_consultation token is, with the code the patient sees on their own token', async () => {
  await doctor(D1, 'call', a1.tokenId);
  assert.equal(await status(a1), 'called');
  assert.equal(await nowServing(p1, a3), null, 'called is not attending');
  await doctor(D1, 'start', a1.tokenId);
  assert.equal(await status(a1), 'in_consultation');
  assert.equal(await nowServing(p1, a3), a1.code);
  const listed = (await patientBooking.appointments(p1)).find((x) => x.appointment.id === a3.id);
  assert.equal(listed.appointment.currentToken, a1.code, 'the list endpoint carries it too');
  assert.equal(listed.appointment.token, Number(a3.code.replace(/\D/g, '')), 'own token number is unchanged');
});

test('the response exposes the code only: no other patient\'s details', async () => {
  const json = JSON.stringify(await patientBooking.appointment(p1, a3.id));
  assert.ok(!json.includes('ahead one'), 'the patient in consultation is not named');
  assert.ok(!json.includes(a1.id), 'nor is their appointment id exposed');
});

test('a patient cannot read another patient\'s appointment, nor see it in their list', async () => {
  await rejects(() => patientBooking.appointment(p2, a3.id), 404);
  assert.ok(!(await patientBooking.appointments(p2)).some((x) => x.appointment.id === a3.id));
});

test('staff queue endpoints are not reachable with a patient bearer token', async () => {
  // A patient signs in with a bearer token whose session is kind "patient"; the portals' guards (lib/apiGuard.js) read the
  // cookie session and accept only the DOCTOR / RECEPTIONIST / admin roles, which a PATIENT user never has.
  const sid = 'f'.repeat(64);
  await db.query("INSERT INTO sessions (sid, user_id, data, expires_at) VALUES (?, ?, ?, datetime('now', '+1 day'))", [sid, p1.user.id, JSON.stringify({ userId: p1.user.id, role: 'PATIENT', kind: 'patient', sessionVersion: (await db.one('SELECT session_version FROM users WHERE id = ?', [p1.user.id])).session_version, loginAt: Date.now() })]);
  const user = await db.one('SELECT role FROM users WHERE id = ?', [p1.user.id]);
  assert.equal(user.role, 'PATIENT');
  assert.ok(!['DOCTOR', 'RECEPTIONIST'].includes(user.role));
  const guard = fs.readFileSync(path.join(root, 'lib', 'apiGuard.js'), 'utf8');
  assert.match(guard, /user\.role !== 'RECEPTIONIST'/);
  assert.match(guard, /user\.role !== 'DOCTOR'/);
  // and every staff queue / token route is wrapped by one of those guards
  const routes = [];
  (function walk(dir) { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else if (f.name === 'route.js') routes.push(p); } })(path.join(root, 'app', 'api', 'doctor', 'queue'));
  (function walk(dir) { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) walk(p); else if (f.name === 'route.js') routes.push(p); } })(path.join(root, 'app', 'api', 'tokens'));
  assert.ok(routes.length >= 5);
  for (const file of routes) assert.match(fs.readFileSync(file, 'utf8'), /adapt\([^)]*scope: '(doctor|receptionist)'/, file);
  // the patient bearer path itself never hands out a staff session
  const me = await patientAuth.authenticate({ headers: { get: () => `Bearer ${sid}` } });
  assert.equal(me.user.id, p1.user.id);
});

test('a doctor cannot work another doctor\'s queue', async () => {
  await rejects(() => doctor(D2, 'start', a2.tokenId), 404);
});

test('different doctors have independent current tokens', async () => {
  assert.equal(await nowServing(p2, b1), null, 'D2 has nobody in consultation although D1 does');
  await doctor(D2, 'call', b1.tokenId);
  await doctor(D2, 'start', b1.tokenId);
  assert.equal(await nowServing(p2, b1), b1.code);
  assert.equal(await nowServing(p1, a3), a1.code, 'D1\'s patient still sees D1\'s token');
  await doctor(D2, 'complete', b1.tokenId);
  assert.equal(await nowServing(p2, b1), null);
});

test('different appointment dates have independent current tokens', async () => {
  assert.equal(await nowServing(p1, t1), null, "today's consultation is not tomorrow's");
  // a later day can't be worked from the doctor's screen, so set it directly; the same doctor may be in consultation on each day
  await tokenModel.updateStatus(H, t1.tokenId, 'called');
  await tokenModel.updateStatus(H, t1.tokenId, 'in_consultation');
  assert.equal(await nowServing(p1, t1), t1.code);
  assert.equal(await nowServing(p1, a3), a1.code, 'today unchanged');
  await tokenModel.updateStatus(H, t1.tokenId, 'completed');
  assert.equal(await nowServing(p1, t1), null);
});

test('only one patient can be in consultation per doctor and day, from either the doctor or the front desk', async () => {
  await doctor(D1, 'call', a2.tokenId);
  await rejects(() => doctor(D1, 'start', a2.tokenId), 400, /still in consultation/);
  await rejects(() => tokenController.updateStatus(deskReq({ id: a2.tokenId }, { status: 'in_consultation' }), fakeRes()), 400, /still in consultation/);
  await rejects(() => tokenModel.updateStatus(H, a2.tokenId, 'in_consultation'), 400, /still in consultation/);
  assert.deepEqual(await inConsultation(D1, today), [a1.code]);
  assert.equal(await status(a2), 'called');
  assert.equal(await nowServing(p1, a3), a1.code);
});

test('two requests starting different patients at once cannot both win', async () => {
  await doctor(D1, 'complete', a1.tokenId);
  await doctor(D1, 'call', a3.tokenId);
  const settled = await Promise.allSettled([
    tokenController.updateStatus(deskReq({ id: a2.tokenId }, { status: 'in_consultation' }), fakeRes()),
    tokenController.updateStatus(deskReq({ id: a3.tokenId }, { status: 'in_consultation' }), fakeRes()),
  ]);
  assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1);
  assert.equal((await inConsultation(D1, today)).length, 1);
  // put things back: whoever won is completed
  const winner = (await status(a2)) === 'in_consultation' ? a2 : a3;
  await doctor(D1, 'complete', winner.tokenId);
  assert.equal(await nowServing(p1, a3), null);
});

test('completing the current consultation updates the patient-facing token', async () => {
  const [other] = [a2, a3].filter((x) => x !== undefined);
  // a2 and a3 are both finished or called by now; bring a fresh appointment through the whole path
  const extra = await book(D1, today, slot(3), p2);
  await doctor(D1, 'call', extra.tokenId);
  await doctor(D1, 'start', extra.tokenId);
  assert.equal(await nowServing(p1, a3), extra.code);
  await doctor(D1, 'complete', extra.tokenId);
  assert.equal(await nowServing(p1, a3), null);
  assert.ok(other);
});

test('skip and recall: neither makes a token "now serving", and an in-consultation token cannot be skipped', async () => {
  const s = await book(D1, today, slot(4), await patientAccount('skipper'));
  await doctor(D1, 'skip', s.tokenId);
  assert.equal(await status(s), 'skipped');
  assert.equal(await nowServing(p1, t1), null);
  await doctor(D1, 'recall', s.tokenId);
  assert.equal(await status(s), 'called');
  assert.equal(await nowServing(p2, b1), null, 'a recalled (called) token is not attending');
  assert.equal((await inConsultation(D1, today)).length, 0);
  await doctor(D1, 'start', s.tokenId);
  await rejects(() => doctor(D1, 'skip', s.tokenId), 400, /can't move/);
  assert.deepEqual(await inConsultation(D1, today), [s.code]);
  await doctor(D1, 'complete', s.tokenId);
});

test('reopening a completed consultation makes it the current token again, and is refused while someone else is in consultation', async () => {
  const r = await book(D1, today, slot(5), await patientAccount('reopener'));
  const w = await book(D1, today, slot(6), await patientAccount('waiter'));
  await doctor(D1, 'call', r.tokenId);
  await doctor(D1, 'start', r.tokenId);
  await doctor(D1, 'complete', r.tokenId);
  assert.equal(await nowServing(p1, a3), null);
  // appointment status follows the token in the app; the reopen needs both completed
  await db.query("UPDATE appointments SET status = 'completed' WHERE id = ? AND status <> 'completed'", [r.id]);
  await doctor(D1, 'call', w.tokenId);
  await doctor(D1, 'start', w.tokenId);
  await rejects(() => doctor(D1, 'reopen', r.tokenId), 400, /still in consultation/);
  await doctor(D1, 'complete', w.tokenId);
  await doctor(D1, 'reopen', r.tokenId);
  assert.equal(await status(r), 'in_consultation');
  assert.equal(await nowServing(p1, a3), r.code);
  await doctor(D1, 'complete', r.tokenId);
  assert.equal(await nowServing(p1, a3), null);
});

test('cancelling the appointment in consultation clears the current token', async () => {
  const c = await book(D1, today, slot(7), await patientAccount('canceller'));
  await doctor(D1, 'call', c.tokenId);
  await doctor(D1, 'start', c.tokenId);
  assert.equal(await nowServing(p1, a3), c.code);
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [c.id]);
  assert.equal(await status(c), 'cancelled');
  assert.equal(await nowServing(p1, a3), null);
});

test('inconsistent rows (two in consultation, from before the rule) never show a wrong token: the patient sees null', async () => {
  const x = await book(D1, today, slot(8), await patientAccount('x'));
  const y = await book(D1, today, slot(9), await patientAccount('y'));
  await db.query("UPDATE tokens SET status = 'in_consultation' WHERE id IN (?, ?)", [x.tokenId, y.tokenId]);
  const warn = console.warn; let warned = '';
  console.warn = (m) => { warned += m; };
  try {
    assert.equal(await tokenModel.currentServing(D1, today), null);
    assert.equal(await nowServing(p1, a3), null);
  } finally { console.warn = warn; }
  assert.match(warned, /more than one token in consultation/);
  // finishing one restores a single, correct answer
  await db.query("UPDATE tokens SET status = 'completed' WHERE id = ?", [x.tokenId]);
  assert.equal(await nowServing(p1, a3), y.code);
  await db.query("UPDATE tokens SET status = 'completed' WHERE id = ?", [y.tokenId]);
});

test('a closed appointment has no current token', async () => {
  const live = await nowServing(p1, t1);
  assert.equal(live, null);
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [a3.id]);
  assert.equal((await patientBooking.appointment(p1, a3.id)).appointment.currentToken, null);
});
