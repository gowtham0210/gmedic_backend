// Emergency walk-in tests. Run: npm test   (node --test tests/)
// They run on a throwaway COPY of data/gmedic.sqlite (the working database is never written) and need the working
// database to have hospital HSP2, doctor DOC101 (cloned as a clean test doctor DOCT1), receptionist USR901 and
// doctor login USR902, as the demo data does. DOC101's own appointments are left alone and checked at the end.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gmedic-test-'));
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
const core = rq('services/bookingCore');
const emergency = rq('services/emergencyWalkIn');
const patientBooking = rq('services/patient/booking');
const tokenModel = rq('models/tokenModel');
const appointmentModel = rq('models/appointmentModel');
const queue = rq('controllers/doctor/queueController');
const adminReceptionists = rq('controllers/admin/receptionistsController');
const { nowIn, hhmm } = rq('services/patient/common');

const H = 'HSP2';
const DOC = 'DOCT1';
process.env.TEST_DOCTOR = DOC;
const now = nowIn('Asia/Kolkata');
const today = now.date;
const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const SLOT = hhmm(Math.min(Math.floor(now.minutes / 15) * 15, 23 * 60 + 30)); // today's slot running now
let mobile = 9400000100;
const pat = (label) => ({ name: `Test ${label}`, mobile: String(mobile++) });
const admin = { id: 'USR900', name: 'Super Admin', role: 'SUPER_ADMIN' };
const R1 = { id: 'USR901', name: 'Desk One', role: 'RECEPTIONIST', hospitalId: H };
const R2 = { id: 'USR_NOPERM', name: 'Desk Two', role: 'RECEPTIONIST', hospitalId: H };
const R3 = { id: 'USR_INACTIVE', name: 'Desk Three', role: 'RECEPTIONIST', hospitalId: H };
const R4 = { id: 'USR_OTHERHOSP', name: 'Desk Four', role: 'RECEPTIONIST', hospitalId: 'HSP1' };
const DOCTOR = { id: 'USR_DOCT1', name: 'Dr. Test', role: 'DOCTOR', doctorId: DOC, hospitalId: H };
const walk = (user, extra = {}) => emergency.register(H, { departmentId: 'none', doctorId: DOC, emergencyReason: 'Severe chest pain', patient: pat('walk-in'), ...extra }, user);
const normal = (date, time, extra = {}) => rb.book(H, { doctorId: DOC, date, time, patient: pat('normal'), ...extra }, R1);
const fakeRes = () => { const r = { body: null, code: 200, json(b) { r.body = b; return r; }, status(c) { r.code = c; return r; } }; return r; };
const doctorReq = (extra = {}) => ({ hospitalId: H, doctorId: DOC, user: DOCTOR, query: {}, body: {}, params: {}, ip: 'test', get: () => '', ...extra });
const rejects = (fn, status, match) => assert.rejects(fn, (e) => { assert.equal(e.status, status, `${e.status} ${e.message}`); if (match) assert.match(e.message + JSON.stringify(e.details || {}), match); return true; });
const snapNormal = async () => JSON.stringify([
  await db.query('SELECT id, patient_id, doctor_id, appt_date, appt_time, seat_no, token_no, status, source, fee FROM appointments WHERE emergency_walkin = 0 ORDER BY id'),
  await db.query("SELECT id, appointment_id, number, code, status, token_kind FROM tokens WHERE token_kind = 'NORMAL' ORDER BY id"),
]);
const slotSeats = async (date, time) => core.seatsFor(core.blockFor(await core.schedulesOn(db, DOC, date), time), (await core.slotLoad(db, DOC, date)).get(time));
// Active emergency walk-ins of the whole hospital today, counted by the server from the real appointments and tokens.
const active = async () => (await emergency.summary(H)).activeTotal;
let baseActive = 0; // walk-ins already active in the copied database before the tests start
const setIntake = (body) => emergency.updateIntake(H, body, admin);
let original;
let originalTokens;
const clone = async (table, from, over) => {
  const row = await db.one(`SELECT * FROM ${table} WHERE id = ?`, [from]);
  const r = { ...row, ...over };
  const cols = Object.keys(r);
  await db.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => r[c]));
};

test('setup: migrations are current and a clean test doctor and day are built', async () => {
  await migrate();
  original = JSON.stringify(await db.query('SELECT * FROM appointments ORDER BY id'));
  originalTokens = JSON.stringify(await db.query('SELECT * FROM tokens ORDER BY id'));
  // The working database may already have a limit or notes set from the earlier design; a fresh hospital has none. Start clean.
  await db.query('UPDATE hospitals SET emergency_walkin_limit = NULL, emergency_referral_note = NULL, emergency_intake = ?, emergency_intake_reason = NULL WHERE id = ?', ['OPEN', H]);
  baseActive = await active();
  await clone('doctors', 'DOC101', { id: DOC, name: 'Dr. Test', registration_number: 'TEST-REG-1', department_id: null, emergency_on_call: 0, availability: 'present' });
  await clone('users', 'USR902', { id: DOCTOR.id, doctor_id: DOC, name: 'Dr. Test', username: 'drtest', email: 'drtest@test.local', phone: '9111110001' });
  for (const d of [today, tomorrow]) {
    await db.query("INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot) VALUES (?, ?, '00:00', '23:59', 15, 2)", [DOC, dow(d)]);
  }
  const mk = (id, hospital, name, phone) => db.query(
    "INSERT OR IGNORE INTO users (id, role, hospital_id, name, username, email, phone, password_hash, status) SELECT ?, role, ?, ?, ?, ?, ?, password_hash, 'ACTIVE' FROM users WHERE id = 'USR901'",
    [id, hospital, name, id.toLowerCase(), `${id.toLowerCase()}@test.local`, phone]
  );
  await mk(R2.id, H, 'Desk Two', '9111110002');
  await mk(R3.id, H, 'Desk Three', '9111110003');
  await mk(R4.id, 'HSP1', 'Desk Four', '9111110004');
  for (const u of [R1, R3, R4]) await adminReceptionists.setEmergencyBooking({ params: { id: u.id }, body: { allowed: true }, user: admin, ip: 'test', get: () => '' }, fakeRes());
  await db.query("UPDATE users SET status = 'INACTIVE' WHERE id = ?", [R3.id]);
  const cols = await db.query("SELECT name FROM pragma_table_info('appointments') WHERE name IN ('emergency_walkin', 'triage_priority')");
  assert.equal(cols.length, 2);
});

test('migration 034: the database itself refuses a walk-in without a reason, and a triage on a normal appointment', async () => {
  const a = (await normal(tomorrow, '09:00'));
  const row = await db.one('SELECT * FROM appointments WHERE id = ?', [a.id]);
  const insert = (over) => {
    const r = { ...row, id: `APT_T${Math.random().toString(36).slice(2, 7)}`, seat_no: 1, token_no: null, ...over };
    const cols = Object.keys(r).filter((c) => !['created_at', 'updated_at', 'cancelled_at'].includes(c));
    return db.query(`INSERT INTO appointments (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => r[c]));
  };
  await assert.rejects(insert({ is_emergency: 1, emergency_walkin: 1, emergency_no: 91, source: 'Walk-in', emergency_reason: null, appt_date: today, appt_time: '01:01' }), /needs a reason/);
  await assert.rejects(insert({ triage_priority: 'URGENT', emergency_walkin: 0 }), /triage priority/);
  await assert.rejects(insert({ is_emergency: 0, emergency_walkin: 1, emergency_no: 92, source: 'Walk-in', emergency_reason: 'x'.repeat(5), appt_date: today, appt_time: '01:02' }), /must be an emergency/);
});

test('normal appointment booking works when slots are available (receptionist, and slot counts are correct)', async () => {
  const a = await normal(tomorrow, '10:00');
  assert.equal(a.status, 'confirmed');
  assert.equal(a.emergencyWalkIn, false);
  assert.match(a.tokenCode, /^T\d{3}$/);
});

test('rejected: no permission, inactive receptionist, another hospital, no user, flags in the body', async () => {
  await rejects(() => walk(R2), 403);
  await rejects(() => walk(R3), 403);
  await rejects(() => walk(R4), 403); // has permission, but works at HSP1 and HSP2 was asked for
  await rejects(() => walk(null), 403);
  await rejects(() => walk({ ...R2, canBookEmergency: true }), 403); // a permission flag the client sends is ignored
  assert.equal(await active(), baseActive, 'a refused attempt creates nothing');
  assert.ok((await db.one("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'EMERGENCY_WALKIN_DENIED'")).n >= 4, 'refusals are audited');
  await assert.rejects(() => emergency.register('HSP1', { departmentId: 'none', doctorId: DOC, emergencyReason: 'Chest pain', patient: pat('x') }, R4), (e) => e.status === 404); // the doctor is not at their hospital
});

test('rejected: a missing or invalid emergency reason', async () => {
  for (const reason of [undefined, null, '', '    ', 'ab', 'x'.repeat(301)]) await rejects(() => walk(R1, { emergencyReason: reason }), 400, /emergencyReason/);
  await rejects(() => walk(R1, { emergencyReason: undefined, reason: 'Long enough visit reason' }), 400, /emergencyReason/);
  assert.equal(await active(), baseActive);
});

test('nothing has to be configured by an administrator: no limit exists, only a system default warning level', async () => {
  const opts = await emergency.options(H, R1);
  assert.equal('walkInLimit' in opts.intake, false, 'there is no limit field any more');
  assert.equal(opts.workload.threshold, 10, 'the warning level is the central system default');
  assert.equal(opts.workload.warning, false);
  // an administrator cannot (and need not) set a limit: the API says so and stores nothing
  await rejects(() => setIntake({ walkInLimit: 5 }), 400, /no walk-in limit/);
  await rejects(() => setIntake({}), 400);
  assert.equal((await db.one('SELECT emergency_walkin_limit AS l FROM hospitals WHERE id = ?', [H])).l, null);
  // what an administrator may set: the escalation and referral instructions (optional)
  const intake = await setIntake({ referralNote: 'Divert to City Emergency, call 108.' });
  assert.equal(intake.referralNote, 'Divert to City Emergency, call 108.');
  assert.equal(intake.warningThreshold, 10);
  assert.ok((await db.one("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'EMERGENCY_REFERRAL_UPDATED' AND entity_id = ?", [H])).n >= 1);
});

test('emergency walk-in registers with every normal slot AVAILABLE, without choosing a slot, and takes no normal capacity', async () => {
  const before = await snapNormal();
  const seatsBefore = await slotSeats(today, SLOT);
  const slotsBefore = JSON.stringify((await rb.slots(H, DOC, today)).slots.map(({ emergency, ...s }) => s));
  const w = await walk(R1, { emergencyReason: '  Severe chest pain  ' });
  assert.equal(w.emergencyWalkIn, true);
  assert.equal(w.emergency, true);
  assert.equal(w.tokenCode, 'E001');
  assert.equal(w.emergencyReason, 'Severe chest pain');
  assert.equal(w.bookedById, R1.id);
  assert.ok(w.createdAt);
  assert.equal(w.triage, null, 'nobody has assessed it: awaiting triage, not urgent');
  const row = await db.one('SELECT seat_no, token_no, emergency_no FROM appointments WHERE id = ?', [w.id]);
  assert.equal(row.token_no, null, 'it has no normal token number');
  const tk = await db.one('SELECT * FROM tokens WHERE appointment_id = ?', [w.id]);
  assert.deepEqual([tk.token_kind, tk.number, tk.code, tk.status], ['EMERGENCY', 1, 'E001', 'waiting']);
  const log = await db.one("SELECT * FROM audit_logs WHERE action = 'EMERGENCY_WALKIN_REGISTERED' AND entity_id = ?", [w.id]);
  const nv = JSON.parse(log.new_value);
  assert.equal(log.user_id, R1.id);
  assert.deepEqual([nv.emergencyReason, nv.receptionistId, nv.token], ['Severe chest pain', R1.id, 'E001']);
  assert.ok(nv.registeredAt);
  assert.equal(await snapNormal(), before, 'no normal appointment or token changed');
  assert.deepEqual(await slotSeats(today, SLOT), seatsBefore, 'seat counts of every slot unchanged');
  assert.equal(JSON.stringify((await rb.slots(H, DOC, today)).slots.map(({ emergency, ...s }) => s)), slotsBefore, 'the slot grid the desk and the app read is unchanged');
});

test('emergency walk-in registers when the normal slot is FULL, and normal booking stays refused there', async () => {
  await normal(today, SLOT);
  await normal(today, SLOT);
  assert.equal((await slotSeats(today, SLOT)).seatsLeft.reception, 0);
  await rejects(() => normal(today, SLOT), 409, /slotFull/);
  const before = await snapNormal();
  const w = await walk(R1);
  assert.equal(w.tokenCode, 'E002');
  assert.equal(await snapNormal(), before);
  const seats = await slotSeats(today, SLOT);
  assert.deepEqual([seats.booked, seats.seatsLeft.reception, seats.seatsLeft.online], [2, 0, 0]);
  await rejects(() => normal(today, SLOT), 409, /slotFull/); // still full after the walk-in
});

test('normal booking keeps working after walk-ins, and a slot-based emergency request is refused with a pointer to the new workflow', async () => {
  const a = await normal(tomorrow, '10:15');
  assert.equal(a.status, 'confirmed');
  await rejects(() => normal(today, SLOT, { emergency: true, emergencyReason: 'Chest pain' }), 410, /Emergency Walk-in/);
  await rejects(() => rb.book(H, { doctorId: DOC, date: today, time: SLOT, emergency: true, patient: pat('old') }, R1), 410);
  const o = await rb.setWalkInSeats(H, DOC, { emergencySeats: 2 }); // the old per-slot setting is kept as data only
  assert.ok(o.blocks.length);
  assert.ok(!(await rb.slots(H, DOC, today)).slots.some((s) => s.emergency.available), 'no slot offers an emergency any more');
});

test('the same patient cannot be registered twice while still active', async () => {
  const p = await db.one("SELECT patient_id FROM appointments WHERE emergency_walkin = 1 AND doctor_id = ? ORDER BY id LIMIT 1", [DOC]);
  await rejects(() => emergency.register(H, { departmentId: 'none', doctorId: DOC, emergencyReason: 'Chest pain again', patientId: p.patient_id }, R1), 409, /already registered/);
});

test('triage: only a doctor sets it; receptionists cannot; every change is audited', async () => {
  const tokens = await tokenModel.query(H, { date: today, doctorId: DOC, status: 'waiting' });
  const e1 = tokens.find((t) => t.code === 'E001');
  assert.equal(e1.awaitingTriage, true);
  await rejects(() => emergency.setTriage(H, R1, e1.id, { priority: 'CRITICAL' }), 403);
  await rejects(() => emergency.setTriage(H, DOCTOR, e1.id, { priority: 'MAYBE' }), 400);
  const normalToken = tokens.find((t) => t.code.startsWith('T'));
  await rejects(() => emergency.setTriage(H, DOCTOR, normalToken.id, { priority: 'URGENT' }), 409);
  const r1 = await emergency.setTriage(H, DOCTOR, e1.id, { priority: 'urgent', note: 'Stable, monitor' });
  assert.equal(r1.token.triage, 'URGENT');
  const r2 = await emergency.setTriage(H, DOCTOR, e1.id, { priority: 'CRITICAL' });
  assert.equal(r2.token.triage, 'CRITICAL');
  const logs = await db.query("SELECT action, previous_value, new_value FROM audit_logs WHERE entity_id = ? AND action LIKE 'TRIAGE_%' ORDER BY id", [e1.appointmentId]);
  assert.deepEqual(logs.map((l) => l.action), ['TRIAGE_ASSIGNED', 'TRIAGE_CHANGED']);
  assert.equal(JSON.parse(logs[1].previous_value).triage, 'URGENT');
  assert.equal((await db.one('SELECT triaged_by_user_id AS u FROM appointments WHERE id = ?', [e1.appointmentId])).u, DOCTOR.id);
  assert.equal((await emergency.setTriage(H, DOCTOR, e1.id, { priority: 'CRITICAL' })).changed, false);
});

test('queue: critical first, unassessed visible and never silently skipped, then urgent, semi-urgent, then normal and non-urgent by time', async () => {
  const w3 = await walk(R1); // awaiting triage
  const w4 = await walk(R1);
  const w5 = await walk(R1);
  const w6 = await walk(R1);
  const t = async (a) => (await tokenModel.query(H, { date: today, doctorId: DOC })).find((x) => x.appointmentId === a.id);
  await emergency.setTriage(H, DOCTOR, (await t(w4)).id, { priority: 'URGENT' });
  await emergency.setTriage(H, DOCTOR, (await t(w5)).id, { priority: 'SEMI_URGENT' });
  await emergency.setTriage(H, DOCTOR, (await t(w6)).id, { priority: 'NON_URGENT' });
  const waiting = await tokenModel.query(H, { date: today, doctorId: DOC, status: 'waiting' });
  const order = core.sortQueue(waiting).map((x) => x.code);
  assert.equal(order[0], 'E001', 'CRITICAL first');
  assert.deepEqual(order.slice(1, 3), ['E002', 'E003'], 'the two unassessed walk-ins come next, in arrival order, flagged, not buried');
  assert.equal(order[3], 'E004', 'URGENT');
  assert.equal(order[4], 'E005', 'SEMI_URGENT');
  assert.ok(order.slice(5).every((c) => c.startsWith('T') || c === 'E006'), 'normal appointments and the NON_URGENT walk-in follow');
  assert.ok(order.indexOf('E006') > order.indexOf(order.find((c) => c.startsWith('T'))), 'a non-urgent walk-in waits behind the normal patients scheduled earlier');
  assert.ok(waiting.every((x) => ['waiting'].includes(x.status)));
});

test('doctor call-next: an unassessed walk-in must be assessed first; the critical case is called; explicit calls are audited', async () => {
  let res = fakeRes();
  await queue.callNext(doctorReq(), res); // E001 is CRITICAL: called
  assert.equal(res.body.token.code, 'E001');
  // E002 and E003 were never assessed: the top of the queue is flagged and the automatic call refuses it
  await assert.rejects(() => queue.callNext(doctorReq(), fakeRes()), (e) => e.status === 409 && /awaiting triage/.test(e.message));
  const waiting = await tokenModel.query(H, { date: today, doctorId: DOC, status: 'waiting' });
  const normalFirst = waiting.find((x) => !x.walkIn);
  res = fakeRes();
  await queue.call(doctorReq({ params: { id: normalFirst.id }, body: { note: 'Clinical decision' } }), res);
  assert.equal(res.body.token.status, 'called');
  const log = await db.one("SELECT * FROM audit_logs WHERE action = 'QUEUE_OVERRIDE' ORDER BY id DESC LIMIT 1");
  assert.match(log.summary, new RegExp(`${normalFirst.code} called ahead of E002`));
  for (const code of ['E002', 'E003']) await emergency.setTriage(H, DOCTOR, waiting.find((x) => x.code === code).id, { priority: 'URGENT' });
});

test('a patient already called or in consultation is never displaced by a new critical walk-in', async () => {
  const tokens = await tokenModel.query(H, { date: today, doctorId: DOC });
  const e1 = tokens.find((x) => x.code === 'E001');
  await tokenModel.updateStatus(H, e1.id, 'in_consultation');
  const t1 = tokens.find((x) => x.status === 'called' && !x.walkIn); // called above
  const w = await walk(R1);
  await emergency.setTriage(H, DOCTOR, (await tokenModel.query(H, { date: today, doctorId: DOC })).find((x) => x.appointmentId === w.id).id, { priority: 'CRITICAL' });
  const res = fakeRes();
  await queue.callNext(doctorReq(), res);
  assert.equal(res.body.token.appointmentId, w.id, 'the new critical case is the next call');
  const after = await tokenModel.query(H, { date: today, doctorId: DOC });
  assert.equal(after.find((x) => x.code === 'E001').status, 'in_consultation', 'the patient in consultation is untouched');
  assert.equal(after.find((x) => x.id === t1.id).status, 'called', 'the called patient is untouched');
  await rejects(() => queue.start(doctorReq({ params: { id: t1.id } }), fakeRes()), 400, /still in consultation/);
  const list = fakeRes();
  await queue.list(doctorReq(), list);
  assert.ok(list.body.summary.critical >= 1 && 'awaitingTriage' in list.body.summary);
  await tokenModel.updateStatus(H, e1.id, 'completed');
});

test('availability: doctor availability and working hours decide who can be registered (no on-call switch)', async () => {
  const optionOf = async () => (await emergency.options(H, R1)).departments.flatMap((d) => d.doctors).find((d) => d.id === DOC);
  assert.deepEqual([(await optionOf()).available, (await optionOf()).reason], [true, null], 'available and inside working hours: eligible with nothing else to switch on');
  // marked absent: reflected in the receptionist's list at once, and refused by the server
  await db.query("UPDATE doctors SET availability = 'absent', availability_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [DOC]);
  const absent = await optionOf();
  assert.deepEqual([absent.available, /absent/.test(absent.reason)], [false, true]);
  await rejects(() => walk(R1), 409, /absent/);
  await db.query("UPDATE doctors SET availability = 'present' WHERE id = ?", [DOC]);
  assert.equal((await optionOf()).available, true, 'back to present: eligible again');
  // on leave
  await db.query("INSERT INTO doctor_leaves (doctor_id, start_date, end_date, reason) VALUES (?, ?, ?, 'test')", [DOC, today, today]);
  assert.equal((await optionOf()).available, false);
  await rejects(() => walk(R1), 409, /leave/);
  await db.query('DELETE FROM doctor_leaves WHERE doctor_id = ?', [DOC]);
  // deactivated
  await db.query("UPDATE doctors SET status = 'INACTIVE' WHERE id = ?", [DOC]);
  await rejects(() => walk(R1), 409);
  await db.query("UPDATE doctors SET status = 'ACTIVE' WHERE id = ?", [DOC]);
  // outside the scheduled working hours: not selectable, refused with the referral note; the retired on-call flag changes nothing
  await db.query("UPDATE doctor_schedules SET start_time = '00:00', end_time = '00:01' WHERE doctor_id = ? AND day_of_week = ?", [DOC, dow(today)]);
  if (now.minutes > 5) {
    const out = await optionOf();
    assert.deepEqual([out.available, /working hours/.test(out.reason)], [false, true]);
    await assert.rejects(() => walk(R1), (e) => e.status === 409 && /Divert to City Emergency/.test(e.message) && 'alternatives' in e.details && /working hours/.test(e.message));
    await db.query('UPDATE doctors SET emergency_on_call = 1 WHERE id = ?', [DOC]);
    await rejects(() => walk(R1), 409, /working hours/); // the old flag is no longer read
    await db.query('UPDATE doctors SET emergency_on_call = 0 WHERE id = ?', [DOC]);
  }
  await db.query("UPDATE doctor_schedules SET start_time = '00:00', end_time = '23:59' WHERE doctor_id = ? AND day_of_week = ?", [DOC, dow(today)]);
  assert.equal((await optionOf()).available, true);
  // a stale list cannot get a registration through: availability is read again inside the registration itself
  await db.query("UPDATE doctors SET availability = 'absent', availability_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [DOC]);
  await rejects(() => walk(R1), 409, /absent/);
  await db.query("UPDATE doctors SET availability = 'present' WHERE id = ?", [DOC]);
  // department must match
  await rejects(() => walk(R1, { departmentId: 'DEPT_X' }), 400);
  // paused by an administrator, with a reason, and resumed
  await rejects(() => setIntake({ paused: true }), 400);
  await setIntake({ paused: true, reason: 'Resuscitation bay full' });
  await assert.rejects(() => walk(R1), (e) => e.status === 409 && /paused/.test(e.message) && /Resuscitation bay full/.test(e.message) && /City Emergency/.test(e.message));
  const h = await db.one('SELECT emergency_intake_changed_by AS u, emergency_intake_changed_at AS at, emergency_intake_reason AS r FROM hospitals WHERE id = ?', [H]);
  assert.deepEqual([h.u, !!h.at, h.r], [admin.id, true, 'Resuscitation bay full']);
  await setIntake({ paused: false, reason: 'Capacity restored' });
  assert.ok((await walk(R1)).tokenCode);
  const audit = (await db.query("SELECT action FROM audit_logs WHERE action LIKE 'EMERGENCY_INTAKE%'")).map((r) => r.action);
  assert.ok(['EMERGENCY_INTAKE_PAUSED', 'EMERGENCY_INTAKE_RESUMED'].every((a) => audit.includes(a)));
});

test('the counts come from the real data: every patient is in exactly one group, completed and cancelled are not active', async () => {
  const sum = await emergency.summary(H);
  assert.equal(sum.activeTotal, sum.awaitingTriage + sum.waitingForConsultation + sum.underConsultation, 'the three groups add up to active: nobody is counted twice');
  assert.equal(sum.active.length, sum.activeTotal);
  assert.equal(new Set(sum.active.map((a) => a.appointmentId)).size, sum.active.length);
  assert.ok(sum.active.every((a) => /^E\d+$/.test(a.token) && a.patientName && a.doctorName && a.registeredAt && a.consultationStatus));
  const groupOf = (a) => a.group;
  assert.equal(sum.active.filter((a) => groupOf(a) === 'AWAITING_TRIAGE').length, sum.awaitingTriage);
  assert.equal(sum.active.filter((a) => groupOf(a) === 'UNDER_CONSULTATION').length, sum.underConsultation);
  // move one patient through the states and watch the counts follow
  const mine = await walk(R1);
  const t = () => tokenModel.query(H, { date: today, doctorId: DOC }).then((all) => all.find((x) => x.appointmentId === mine.id));
  let s1 = await emergency.summary(H);
  const find = (x) => x.active.find((a) => a.appointmentId === mine.id);
  assert.equal(find(s1).group, 'AWAITING_TRIAGE');
  await emergency.setTriage(H, DOCTOR, (await t()).id, { priority: 'URGENT' });
  s1 = await emergency.summary(H);
  assert.equal(find(s1).group, 'WAITING');
  assert.equal(s1.awaitingTriage, sum.awaitingTriage, 'it left "awaiting triage" and joined "waiting": counted once');
  assert.equal(s1.waitingForConsultation, sum.waitingForConsultation + 1);
  assert.equal(s1.activeTotal, sum.activeTotal + 1);
  await tokenModel.updateStatus(H, (await t()).id, 'called');
  await tokenModel.updateStatus(H, (await t()).id, 'in_consultation');
  s1 = await emergency.summary(H);
  assert.equal(find(s1).group, 'UNDER_CONSULTATION');
  assert.equal(s1.underConsultation, sum.underConsultation + 1);
  assert.equal(s1.waitingForConsultation, sum.waitingForConsultation, 'no longer counted as waiting');
  assert.equal(s1.activeTotal, sum.activeTotal + 1);
  await tokenModel.updateStatus(H, (await t()).id, 'completed');
  s1 = await emergency.summary(H);
  assert.equal(find(s1), undefined, 'completed: not in the active list');
  assert.equal(s1.activeTotal, sum.activeTotal, 'completed: not active');
  assert.equal(s1.completedToday, sum.completedToday + 1);
  // cancelled: counted nowhere
  const gone = await walk(R1);
  assert.equal((await emergency.summary(H)).activeTotal, sum.activeTotal + 1);
  await patientBooking.deskCancel(H, gone.id, 'Patient left', R1.id);
  const s2 = await emergency.summary(H);
  assert.equal(s2.activeTotal, sum.activeTotal, 'cancelled: not active');
  assert.equal(s2.completedToday, sum.completedToday + 1, 'cancelled: not completed either');
  assert.ok(!s2.active.some((a) => a.appointmentId === gone.id));
});

test('the workload warning appears at 10 active walk-ins, is only a warning, and never refuses a registration', async () => {
  let sum = await emergency.summary(H);
  const threshold = sum.threshold;
  assert.equal(threshold, 10);
  while (sum.activeTotal < threshold - 1) { await walk(R1); sum = await emergency.summary(H); }
  assert.equal(sum.activeTotal, threshold - 1);
  assert.equal(sum.warning, false, 'one below the level: no warning');
  assert.equal(sum.escalation, null);
  const tenth = await walk(R1);
  assert.equal(tenth.emergencyWalkIn, true, 'the registration that reaches the level succeeds');
  sum = await emergency.summary(H);
  assert.equal(sum.activeTotal, threshold);
  assert.equal(sum.warning, true, 'at 10 the warning shows');
  assert.match(sum.escalation, /10 emergency walk-ins are active.*Registration stays open.*City Emergency/);
  assert.equal((await emergency.options(H, R1)).workload.warning, true, 'the registration form is warned too');
  for (let i = 0; i < 3; i += 1) assert.equal((await walk(R1)).emergencyWalkIn, true, 'over 10: still accepted');
  sum = await emergency.summary(H);
  assert.ok(sum.activeTotal >= threshold + 3);
  assert.equal(sum.warning, true);
  // the doctor can still be chosen: nothing in the list is disabled because of the count
  assert.equal((await emergency.options(H, R1)).departments.flatMap((d) => d.doctors).find((d) => d.id === DOC).available, true);
  // without a referral note the warning still tells the desk what to do
  await db.query('UPDATE hospitals SET emergency_referral_note = NULL WHERE id = ?', [H]);
  assert.match((await emergency.summary(H)).escalation, /emergency physician or the charge nurse/);
  await setIntake({ referralNote: 'Divert to City Emergency, call 108.' });
  // finish the extra patients so later tests start from a normal workload
  for (const t of await tokenModel.query(H, { date: today, doctorId: DOC })) {
    if (t.walkIn && ['waiting', 'called', 'skipped'].includes(t.status)) await tokenModel.updateStatus(H, t.id, 'cancelled', { skipTransitionCheck: true });
  }
  assert.equal((await emergency.summary(H)).warning, (await emergency.summary(H)).activeTotal >= threshold);
});

test('historical emergency records are still there and are not counted as walk-ins', async () => {
  const legacy = await db.query("SELECT id FROM appointments WHERE is_emergency = 1 AND emergency_walkin = 0 ORDER BY id");
  for (const row of legacy) {
    const a = await appointmentModel.findById(H, row.id);
    assert.ok(a && a.emergency === true && a.emergencyWalkIn === false, `${row.id} is readable and still a slot emergency`);
  }
  const sum = await emergency.summary(H);
  assert.ok(!sum.active.some((a) => legacy.some((l) => l.id === a.appointmentId)), 'old slot emergencies are not walk-ins');
  assert.ok((await db.one("SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('EMERGENCY_WALK_IN_BOOKED','EMERGENCY_WALKIN_REGISTERED')")).n >= 1);
});

test('the five eligibility rules: the receptionist list and the registration API agree, and normal hours stay untouched', async () => {
  const optionOf = async () => (await emergency.options(H, R1)).departments.flatMap((d) => d.doctors).find((d) => d.id === DOC);
  const hoursSnapshot = async () => JSON.stringify(await db.query('SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY id', [DOC]));
  const gridSnapshot = async () => JSON.stringify((await rb.slots(H, DOC, today)).slots.map(({ emergency: _e, ...slot }) => slot));
  const hours = await hoursSnapshot();
  const grid = await gridSnapshot();
  const expectRefused = async (why, pattern) => {
    const o = await optionOf();
    assert.deepEqual([o.available, pattern.test(o.reason)], [false, true], `${why}: the list says why`);
    const before = await active();
    await rejects(() => walk(R1), 409, pattern);
    assert.equal(await active(), before, `${why}: nothing was registered`);
  };

  // 1. present + inside normal working hours: eligible
  assert.equal((await optionOf()).available, true);
  assert.equal((await walk(R1)).emergencyWalkIn, true);

  // 2. present + outside normal working hours: not eligible (no override of any kind)
  await db.query("UPDATE doctor_schedules SET start_time = '00:00', end_time = '00:01' WHERE doctor_id = ? AND day_of_week = ?", [DOC, dow(today)]);
  if (now.minutes > 5) await expectRefused('outside hours', /working hours/);
  await db.query("UPDATE doctor_schedules SET start_time = '00:00', end_time = '23:59' WHERE doctor_id = ? AND day_of_week = ?", [DOC, dow(today)]);

  // 3. absent: not eligible
  await db.query("UPDATE doctors SET availability = 'absent', availability_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [DOC]);
  await expectRefused('absent', /absent/);
  await db.query("UPDATE doctors SET availability = 'present' WHERE id = ?", [DOC]);

  // 4. on leave: not eligible
  await db.query("INSERT INTO doctor_leaves (doctor_id, start_date, end_date, reason) VALUES (?, ?, ?, 'rules test')", [DOC, today, today]);
  await expectRefused('on leave', /leave/);
  await db.query('DELETE FROM doctor_leaves WHERE doctor_id = ?', [DOC]);

  // 5. hospital intake paused: no new registrations (the list still shows the doctor, the form and the API refuse)
  await setIntake({ paused: true, reason: 'Rules test pause' });
  assert.equal((await emergency.options(H, R1)).intake.status, 'PAUSED');
  await rejects(() => walk(R1), 409, /paused/);
  await setIntake({ paused: false, reason: 'Rules test resume' });
  assert.equal((await optionOf()).available, true, 'back to eligible once every rule is met again');

  // nothing in the normal schedule or the slot grid moved while we flipped all of this
  assert.equal(await hoursSnapshot(), hours, 'normal working hours are untouched');
  assert.equal(await gridSnapshot(), grid, 'the normal slot grid is untouched');

  // a change made while a registration is already under way is still caught (the checks run again inside the registration)
  const realPatientFor = rb.patientFor;
  const changeThenLookUp = (change) => { rb.patientFor = async (...args) => { await change(); return realPatientFor(...args); }; };
  try {
    for (const [name, change, undo, pattern] of [
      ['the doctor is marked absent', () => db.query("UPDATE doctors SET availability = 'absent', availability_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [DOC]), () => db.query("UPDATE doctors SET availability = 'present' WHERE id = ?", [DOC]), /absent/],
      ['the doctor goes on leave', () => db.query("INSERT INTO doctor_leaves (doctor_id, start_date, end_date, reason) VALUES (?, ?, ?, 'race')", [DOC, today, today]), () => db.query('DELETE FROM doctor_leaves WHERE doctor_id = ?', [DOC]), /leave/],
      ['intake is paused', () => db.query("UPDATE hospitals SET emergency_intake = 'PAUSED' WHERE id = ?", [H]), () => db.query("UPDATE hospitals SET emergency_intake = 'OPEN' WHERE id = ?", [H]), /paused/],
    ]) {
      const before = await active();
      changeThenLookUp(change);
      try { await rejects(() => walk(R1), 409, pattern); } finally { rb.patientFor = realPatientFor; await undo(); }
      assert.equal(await active(), before, `${name} during registration: nothing was registered`);
    }
  } finally {
    rb.patientFor = realPatientFor;
  }
  assert.equal((await walk(R1)).emergencyWalkIn, true, 'and registration works again afterwards');
});

test('a present doctor who works later today is eligible now; not on a day off, not after the last block', async () => {
  const optionOf = async () => (await emergency.options(H, R1)).departments.flatMap((d) => d.doctors).find((d) => d.id === DOC);
  const setToday = async (rows) => {
    await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ?', [DOC, dow(today)]);
    for (const [from, to] of rows) await db.query('INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot) VALUES (?, ?, ?, ?, 15, 2)', [DOC, dow(today), from, to]);
  };
  const hh = (m) => hhmm(Math.max(0, Math.min(m, 24 * 60 - 1)));
  try {
    if (now.minutes < 22 * 60) {
      // the working block starts later today: present now, so eligible now (the case that was asked about)
      await setToday([[hh(now.minutes + 60), '23:59']]);
      const o = await optionOf();
      assert.deepEqual([o.available, o.reason], [true, null], 'hours start in an hour: eligible now');
      assert.equal((await walk(R1)).emergencyWalkIn, true, 'and registration works');
      // between two blocks (a break): still eligible, the day is not over
      if (now.minutes > 40) {
        await setToday([['00:00', hh(now.minutes - 30)], [hh(now.minutes + 30), '23:59']]);
        assert.equal((await optionOf()).available, true, 'in a break between blocks: eligible');
      }
    }
    // the last block has already ended: not eligible
    if (now.minutes > 10) {
      await setToday([['00:00', hh(now.minutes - 5)]]);
      const o = await optionOf();
      assert.deepEqual([o.available, o.reason], [false, "Today's working hours have ended."]);
      await rejects(() => walk(R1), 409, /working hours have ended/);
    }
    // no working block today at all: not eligible
    await setToday([]);
    const off = await optionOf();
    assert.deepEqual([off.available, off.reason], [false, 'Not scheduled to work today.']);
    await rejects(() => walk(R1), 409, /Not scheduled to work today/);
    // absent or on leave still win over "works later today"
    if (now.minutes < 22 * 60) {
      await setToday([[hh(now.minutes + 60), '23:59']]);
      await db.query("UPDATE doctors SET availability = 'absent', availability_updated_at = CURRENT_TIMESTAMP WHERE id = ?", [DOC]);
      await rejects(() => walk(R1), 409, /absent/);
      await db.query("UPDATE doctors SET availability = 'present' WHERE id = ?", [DOC]);
      await db.query("INSERT INTO doctor_leaves (doctor_id, start_date, end_date, reason) VALUES (?, ?, ?, 'later today')", [DOC, today, today]);
      await rejects(() => walk(R1), 409, /leave/);
      await db.query('DELETE FROM doctor_leaves WHERE doctor_id = ?', [DOC]);
    }
  } finally {
    await setToday([['00:00', '23:59']]); // the clean full-day schedule the other tests expect
    await db.query("UPDATE doctors SET availability = 'present' WHERE id = ?", [DOC]);
    await db.query('DELETE FROM doctor_leaves WHERE doctor_id = ?', [DOC]);
  }
  // reading eligibility never touched the doctor's normal slots
  assert.ok((await rb.slots(H, DOC, today)).slots.length > 0);
});

test('cancelling a walk-in frees its workload, keeps its number retired, and leaves normal bookings alone', async () => {
  const before = await snapNormal();
  const mine = await walk(R1);
  const countBefore = await active();
  await patientBooking.deskCancel(H, mine.id, 'Patient left', R1.id);
  assert.equal((await db.one('SELECT status AS s FROM appointments WHERE id = ?', [mine.id])).s, 'cancelled');
  assert.equal((await db.one('SELECT status AS s FROM tokens WHERE appointment_id = ?', [mine.id])).s, 'cancelled');
  assert.equal(await active(), countBefore - 1);
  const next = await walk(R1);
  assert.ok(Number(next.tokenCode.slice(1)) > Number(mine.tokenCode.slice(1)), 'a cancelled number is never handed out again');
  await rejects(() => rb.markNoShow(H, next.id, R1), 409, /cannot be a no-show/);
  await rejects(() => rb.reschedule(H, next.id, { date: tomorrow, time: '11:00' }, R1), 409);
  assert.equal(await snapNormal(), before, 'normal appointments and tokens are exactly as before');
});

test('concurrent registrations in one process: every one is accepted with its own unique token', async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => walk(R1, { patient: pat(`race${i}`) })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 8, JSON.stringify(results.map((r) => (r.status === 'rejected' ? r.reason.message.slice(0, 40) : 'ok'))));
  const codes = results.map((r) => r.value.tokenCode);
  assert.equal(new Set(codes).size, 8);
  const dup = await db.one("SELECT COUNT(*) AS n FROM (SELECT number FROM tokens WHERE token_kind = 'EMERGENCY' AND doctor_id = ? AND token_date = ? GROUP BY number HAVING COUNT(*) > 1)", [DOC, today]);
  assert.equal(Number(dup.n), 0);
  await assert.rejects(() => db.query("INSERT INTO tokens (id, hospital_id, appointment_id, doctor_id, token_date, number, code, status, token_kind) SELECT 'TKDUP', hospital_id, appointment_id, doctor_id, token_date, number, code, 'cancelled', token_kind FROM tokens WHERE token_kind = 'EMERGENCY' LIMIT 1"), /UNIQUE/, 'the database refuses a repeated emergency number, even a cancelled one');
});

test('concurrent registrations from separate processes sharing the database file', async () => {
  const run = (n) => new Promise((resolve) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, 'helpers', 'register-walkin.js'), String(n)], { env: { ...process.env, DB_FILE: dbFile } });
    let out = '';
    child.stdout.on('data', (c) => { out += c; });
    child.on('close', () => { try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ ok: false, status: 500, message: `no output: ${out}` }); } });
  });
  const results = await Promise.all([1, 2, 3, 4].map(run));
  assert.equal(results.filter((r) => r.ok).length, 4, JSON.stringify(results));
  assert.equal(new Set(results.map((r) => r.code)).size, 4, 'four different tokens');
});

test('the patient app channel: walk-ins are invisible and cannot be cancelled or rescheduled there, and slot availability is untouched', async () => {
  const patientUser = await db.one("SELECT id FROM users WHERE role = 'PATIENT' ORDER BY id LIMIT 1");
  const w = await walk(R1, { patient: pat('app user') });
  await db.query('UPDATE patients SET account_user_id = ? WHERE id = ?', [patientUser.id, w.patientId]);
  const me = { user: { id: patientUser.id } };
  const listed = await patientBooking.appointments(me);
  assert.ok(!JSON.stringify(listed).includes(w.id), 'the app never lists a walk-in');
  await assert.rejects(() => patientBooking.appointment(me, w.id), (e) => e.status === 404);
  await assert.rejects(() => patientBooking.cancel(me, w.id, 'x'), (e) => e.status === 404);
  await assert.rejects(() => patientBooking.reschedule(me, w.id, 'slot'), (e) => e.status === 404);
  assert.equal(typeof patientBooking.emergency, 'undefined', 'the patient booking module has no emergency entry point');
  // what the app reads for a slot (online seats) matches the full slot, whatever number of walk-ins exist
  const seats = await slotSeats(today, SLOT);
  assert.deepEqual([seats.seatsLeft.online, seats.seatsLeft.reception, seats.booked], [0, 0, 2]);
  const tomorrowSeats = await slotSeats(tomorrow, '10:00');
  assert.deepEqual([tomorrowSeats.booked, tomorrowSeats.seatsLeft.online], [1, 1]);
});

test('existing records from before the walk-in work are unchanged', async () => {
  const strip = (rows) => rows.map(({ emergency_walkin, triage_priority, triaged_by_user_id, triaged_at, token_kind, updated_at, ...rest }) => rest);
  const ids = JSON.parse(original).map((a) => a.id);
  const now2 = await db.query(`SELECT * FROM appointments WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids);
  assert.equal(JSON.stringify(strip(now2)), JSON.stringify(strip(JSON.parse(original))), 'every earlier appointment is exactly as before');
  const tids = JSON.parse(originalTokens).map((t) => t.id);
  const nowTokens = await db.query(`SELECT * FROM tokens WHERE id IN (${tids.map(() => '?').join(',')}) ORDER BY id`, tids);
  assert.equal(JSON.stringify(strip(nowTokens)), JSON.stringify(strip(JSON.parse(originalTokens))), 'every earlier token is exactly as before');
  const kinds = (rows) => JSON.stringify(rows.map((t) => [t.id, t.token_kind]));
  assert.equal(kinds(nowTokens), kinds(JSON.parse(originalTokens)), 'earlier tokens keep their kind (normal stay normal, an earlier walk-in stays an emergency token)');
});

test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp files only */ } });
